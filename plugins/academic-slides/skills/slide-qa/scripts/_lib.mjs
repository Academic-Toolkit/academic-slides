// Shared helpers for the slide-qa scripts: argument parsing, Playwright loading, and a static
// file server rooted at the folder that holds the rendered deck (revealjs needs http, not file://).
import { createServer } from 'http';
import { readFile, realpath, stat, lstat, mkdir, mkdtemp, writeFile, rename, rm } from 'fs/promises';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

// The unchecked reader: the value is whatever argument follows the option. handout (which checks its own
// options, #34) and the test probes still use it; the check scripts use options() below.
export function args(help) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { console.log(help); process.exit(0); }
  const get = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
  const has = (name) => argv.includes(`--${name}`);
  return { get, has };
}

export class OptionError extends Error {}

// A script's options, read in order against what the script declares (issue #45). `spec` maps each option name
// to its kind: 'file' (a file name), 'text', 'list' (comma-separated; may be empty), 'flag' (no value), or a
// number rule { min, max, integer }. An option given without a value (last, or followed by another option), an
// empty value (except for a list), a number that is not a number in range, an unknown option, an argument that
// belongs to no option, and an option given twice are refused: otherwise a missing threshold reads as NaN, every
// comparison with it is false, and the check passes.
export function parseOptions(argv, spec) {
  const given = new Map();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new OptionError(`unexpected argument ${token === '' ? '""' : printable(token)} (see --help)`);
    const name = token.slice(2);
    const kind = Object.hasOwn(spec, name) ? spec[name] : undefined;
    const eq = name.indexOf('=');
    if (kind === undefined && eq > 0 && spec[name.slice(0, eq)] === 'flag') {   // --shots=1: a flag takes no value (round 3)
      throw new OptionError(`--${name.slice(0, eq)} takes no value (got ${printable(token)})`);
    }
    if (kind === undefined && eq > 0 && Object.hasOwn(spec, name.slice(0, eq))) {   // --threshold=0.5: a known option, another form
      throw new OptionError(`${printable(token)}: write the value after a space (--${printable(name.slice(0, eq))} ${printable(name.slice(eq + 1))})`);
    }
    if (kind === undefined) throw new OptionError(`unknown option ${printable(token)} (see --help)`);
    if (given.has(name)) throw new OptionError(`--${name} is given more than once`);
    if (kind === 'flag') { given.set(name, true); continue; }
    const raw = argv[i + 1];
    const missing = raw === undefined || raw.startsWith('--');
    if (kind === 'file' && (missing || raw.trim() === '')) throw new OptionError(`--${name} needs a file name.`);
    if (missing || (raw.trim() === '' && kind === 'text')) throw new OptionError(`--${name} needs a value.`);   // only spaces is no value
    i++;
    given.set(name, typeof kind === 'object' ? number(name, raw, kind) : raw);
  }
  return {
    get: (name, fallback) => (given.has(name) ? given.get(name) : fallback),
    has: (name) => given.has(name),
  };
}

function number(name, raw, { min, max, integer = false }) {
  const value = Number(raw);
  // Number('') is 0 and Number(' ') is 0, so a blank value (often an unset shell variable) is refused first.
  const ok = raw.trim() !== '' && Number.isFinite(value) && value >= min && (max === undefined || value <= max)
    && (!integer || Number.isInteger(value));
  if (ok) return value;
  const rule = max !== undefined ? `a number from ${min} to ${max}` : `${integer ? 'a whole number' : 'a number'} of at least ${min}`;
  throw new OptionError(`--${name} must be ${rule} (got "${printable(raw)}")`);
}

// The check scripts' entry point: --help (or -h) anywhere prints the usage; an option error exits 2.
export function options(help, spec) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { console.log(help); process.exit(0); }
  try {
    return parseOptions(argv, spec);
  } catch (e) {
    if (!(e instanceof OptionError)) throw e;
    console.error(e.message);
    process.exit(2);
  }
}

export async function playwright() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    console.error('Playwright not found. Install with: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }
}

const isFileIn = (dir, name) => { try { return statSync(path.join(dir, name)).isFile(); } catch { return false; } };
// File names and settings lines come from the folder and are printed: control characters (C0, DEL, C1: terminal escapes)
// and bidirectional controls (which reorder how a name is shown) become '?' (#51).
export const printable = (s) => String(s).replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '?');

// The deck files in `dir` with extension `ext` (issue #44): files only, this folder only (not its
// subfolders), sorted; the extension must match exactly (the deck server serves only lower-case .html as
// HTML). `exclude` drops names a script writes itself, such as handout's -handout.pdf.
export function deckCandidates(ext, { dir = process.cwd(), exclude = null } = {}) {
  return readdirSync(dir)
    .filter((name) => path.extname(name) === ext && !(exclude && exclude.test(name)) && isFileIn(dir, name))
    .sort();
}

// YAML: '#' after whitespace, outside quotes, starts a comment.
function splitComment(body) {
  let quote = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) { if (c === quote) quote = null; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(body[i - 1]))) return [body.slice(0, i), body.slice(i)];
  }
  return [body, ''];
}

const unquote = (v) => (/^(["']).*\1$/.test(v) ? v.slice(1, -1) : v);

// A value read from _quarto.yml names a file in the deck folder only when it is a plain file name: no folder,
// no .., not absolute, no glob. Anything else is ignored, so the lookup never leaves the current folder.
const plainName = (v) => typeof v === 'string' && v !== '' && path.basename(v) === v && v !== '.' && v !== '..' && !/[*?[\]{}]/.test(v);

// The values of project.render (its direct child key; block or flow list, or one value; whole values only,
// quoted or not, with ./ dropped) and the output-file that applies to revealjs (the one under format: revealjs:,
// else the top-level one, whatever their order in the file), from a _quarto.yml. Block-style YAML as the templates
// write it; other forms (flow mappings, quoted keys) are not read, and the scripts then need their file option.
// Brackets and spaces off both ends, in one pass each: the regex this replaces backtracked on a long run of spaces (#51).
function trimList(s) {
  let i = 0;
  let j = s.length;
  while (i < j && (s[i] === '[' || /\s/.test(s[i]))) i++;
  while (j > i && (s[j - 1] === ']' || /\s/.test(s[j - 1]))) j--;
  return s.slice(i, j);
}

export function readQuartoYml(yml) {
  const render = [];
  let topOutput = null;
  let revealOutput = null;
  let top = null; let childIndent = -1; let renderIndent = -1; let fmtIndent = -1;
  for (const { code, indent } of settingLines(yml)) {   // block scalar contents are text, not settings (#46)
    if (indent === 0) { top = code.match(/^([^:\s]+):/)?.[1] ?? null; childIndent = -1; renderIndent = -1; fmtIndent = -1; }
    else {
      if (childIndent < 0) childIndent = indent;
      if (indent <= childIndent && !(renderIndent === indent && /^\s*-/.test(code))) { renderIndent = -1; if (indent < childIndent || !/^\s*revealjs:/.test(code)) fmtIndent = -1; }
      if (top === 'project' && indent === childIndent && /^\s*render:/.test(code)) renderIndent = indent;
      if (top === 'format' && indent === childIndent && /^\s*revealjs:/.test(code)) fmtIndent = indent;
      if (renderIndent >= 0) {
        let rest = code.replace(/^\s*render:/, '');
        rest = rest.replace(/^\s*-\s+/, '');                          // a block-list item
        const pieces = /[[\],]/.test(rest) ? trimList(rest).split(',') : [rest];
        for (const piece of pieces) {
          const v = unquote(piece.trim()).replace(/^\.\//, '');
          if (v) render.push(v);
        }
        continue;
      }
    }
    if (indent === 0 || (fmtIndent >= 0 && indent > fmtIndent)) {
      const o = code.match(/^[ \t]*output-file:[ \t]*(?:"([^"]*)"|'([^']*)'|(\S+))[ \t]*$/);
      if (o) { const v = (o[1] ?? o[2] ?? o[3]).replace(/^\.\//, ''); if (indent === 0) topOutput = v; else revealOutput = v; }
    }
  }
  return { render, outputFile: revealOutput ?? topOutput };
}

// Forms of _quarto.yml that the line scanner does not read (issue #46). The scanner reads project, format, revealjs,
// render and output-file only as plain block keys (unquoted, no space before the colon, first on the line), render
// as a block or flow list of plain or simply quoted values, and output-file as one plain or simply quoted value.
// scanSettings tags every line that bears on the deck's files; `unread` lines write these settings another way, so
// the caller refuses instead of guessing: a flow mapping or sequence at the root, an explicit key (? key), a second
// YAML document, a merge key (<<); one of those keys (or metadata-files, output-ext) quoted, with a space before
// the colon, inside a flow mapping, or after a list dash; root project or format, or format's revealjs, given a flow
// mapping (other than {}), anchor, alias, tag, or block scalar; in project.render or the output-file the scanner
// uses, an anchor, alias or tag, an escape, a quoted value left open, or a value continued on the next line (YAML
// joins it, the scanner does not); and in project.render a value holding a comma, quoted or outside a flow list
// (the scanner splits render values at commas; it reads an output-file value whole). The contents of block scalars
// (| and >) are text, not settings, and are skipped here and by the scanner; a byte order mark is dropped. The same
// code is in slide-deck-scaffold's scaffold.mjs; tests/quarto-settings.test.mjs checks that the two agree, and that
// whatever is accepted is read as a YAML reader reads it.
// Keys that decide which files the deck is made of (an unread one stops every lookup), and keys that decide only the
// output name (an unread one stops the .html and .pdf lookups; #50, verify round 2).
const FILE_KEYS = ['project', 'render', 'metadata-files'];
const OUTPUT_KEYS = ['format', 'revealjs', 'output-file', 'output-ext', 'output-dir'];
const RENAME_KEYS = ['format', 'revealjs', 'output-file'];   // the scaffold rewrites the name these set
const REVEALJS_FORMAT = /^(revealjs|.+-revealjs)$/;
const DEFAULT_TYPE = /^(?:"default"|'default'|default|~|null|Null|NULL)?$/;   // project.type default, quoted or not, or null
const KEY_MENTION = /(^|[\s{,[])(project|format|revealjs|render|output-file|output-ext|output-dir|metadata-files)([ \t]*):(?=[\s{["']|$)/g;
const MERGE_KEY = /(^|[\s{,[-])<<[ \t]*:/;
const SCANNED_OUTPUT_FILE = /^[ \t]*output-file:[ \t]*(?:"([^"]*)"|'([^']*)'|(\S+))[ \t]*$/;
const BLOCK_SCALAR = /(?:^[ \t]*-|:)[ \t]+(?:[&!]\S*[ \t]+)*[|>][-+1-9]*[ \t]*$/;   // a value that starts a | or > block scalar, anchor or tag first

// The line with every quoted string replaced by "", the quoted keys (a quoted string followed by a colon, with or
// without a space, as JSON-style YAML writes them), the other quoted strings with their quote character, and whether
// a quoted string is left open at the end of the line.
function maskQuoted(code) {
  let masked = '';
  const keys = [];
  const values = [];
  let open = false;
  for (let i = 0; i < code.length; i++) {
    const q = code[i];
    if (q !== '"' && q !== "'") { masked += q; continue; }
    let j = i + 1;
    let body = '';
    while (j < code.length) {
      if (code[j] === q) {
        if (q === "'" && code[j + 1] === "'") { body += "''"; j += 2; continue; }   // '' is a quote inside '…'
        break;
      }
      if (q === '"' && code[j] === '\\') body += code[j++];                         // \x is an escape inside "…"
      body += code[j++] ?? '';
    }
    if (j >= code.length) open = true;
    if (/^[ \t]*:/.test(code.slice(j + 1))) keys.push(body); else values.push({ q, body });
    masked += '""';
    i = j;
  }
  return { masked, keys, values, open };
}

// The lines of a YAML text that can hold settings, as { line, raw, code, indent, masked, keys, values, open }: blank
// lines, comments, and the contents of block scalars are left out, so text that only quotes a setting is not read
// as one. A byte order mark at the start is dropped.
function settingLines(yml) {
  const lines = [];
  let scalarIndent = -1;
  yml.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, n) => {
    const [code] = splitComment(raw);
    if (/^\s*$/.test(code)) return;
    const indent = code.match(/^[ \t]*/)[0].length;
    if (scalarIndent >= 0 && indent > scalarIndent) return;
    scalarIndent = -1;
    const masked = maskQuoted(code);
    lines.push({ line: n + 1, raw, code, indent, ...masked });
    if (BLOCK_SCALAR.test(masked.masked)) scalarIndent = indent;
  });
  return lines;
}

// Every line that bears on the deck's files, as { line, text, kind }:
//   unread         written in a form the scanner does not read, about the deck's files: refused by every lookup
//   unread-output  the same, about the output name only: refused when the lookup needs that name (.html, .pdf)
//   render         project.render, read by the scanner
//   output-file    the output-file the scanner reads (the top level, or under format: revealjs:)
//   metadata       metadata-files whose list the callers read
//   output         another source of the output name the scanner does not read (#50), in any form, that changes only
//                  where the deck is written or its extension: output-file under an extension format such as
//                  clean-revealjs, output-ext, project.output-dir, a project type other than default; refused when the
//                  name is needed, and no obstacle to the scaffold's rename (verify round 3)
function scanSettings(yml) {
  const found = [];
  let top = null; let childIndent = -1; let renderIndent = -1; let fmtIndent = -1; let fmtChild = null; let revChild = -1;
  let seen = false; let ended = false;
  let renderFlow = false;    // inside a render flow list spread over several lines
  let flowItemOpen = false;  // the last line of that list ended in a value with no comma after it
  let continued = -1;        // indent of a plain output-file value that a deeper line without a key would continue
  for (const { line, raw, code, indent, masked, keys, values, open } of settingLines(yml)) {
    const own = masked.match(/^[ \t]*([A-Za-z_][\w.-]*):(?=[ \t]|$)[ \t]*(.*)$/);
    const key = own?.[1];
    const value = (own?.[2] ?? '').trim();
    const kinds = [];
    let files = false;
    let output = continued >= 0 && indent > continued && !own && !/^[ \t]*-/.test(code);   // continues an output-file value
    let renames = output;      // the unread output setting is one the scaffold would have to rewrite (verify round 3)
    continued = -1;
    // a render flow list left open must go on deeper than its key: YAML would read a line at or left of it otherwise
    if (renderFlow && indent <= renderIndent && !/^[ \t]*\]/.test(masked)) files = true;   // the closing ] may sit there
    if (indent === 0) { top = key ?? null; childIndent = -1; renderIndent = -1; fmtIndent = -1; fmtChild = null; revChild = -1; renderFlow = false; }
    else {
      if (childIndent < 0) childIndent = indent;
      if (indent <= childIndent && !(renderIndent === indent && /^\s*-/.test(code))) { renderIndent = -1; renderFlow = false; if (indent < childIndent || key !== 'revealjs') { fmtIndent = -1; revChild = -1; } }
      if (top === 'format' && indent === childIndent) fmtChild = key ?? null;
      if (top === 'project' && indent === childIndent && key === 'render') renderIndent = indent;
      if (top === 'format' && indent === childIndent && key === 'revealjs') { fmtIndent = indent; revChild = -1; }
      else if (fmtIndent >= 0 && indent > fmtIndent && revChild < 0) revChild = indent;   // revealjs's direct children
    }
    // the shape of the document: a flow collection at the root, an explicit key (? key), a merge key, a second document
    // (--- after content, or anything after the end marker ...; the marker itself ends one document and is fine)
    if ((indent === 0 && /^[{[]/.test(masked)) || /^[ \t]*\?(?=[ \t]|$)/.test(masked) || MERGE_KEY.test(masked) || ended
      || (seen && /^---(?=[ \t]|$)/.test(code))) files = true;
    if (/^\.\.\.(?=[ \t]|$)/.test(code)) ended = true;
    seen = true;
    // output-file and output-ext under another format (pdf, docx) do not name the deck's .html, in any form (round 3)
    const otherFormat = top === 'format' && indent > childIndent && fmtChild !== null && !REVEALJS_FORMAT.test(fmtChild);
    const outputKey = (k) => {
      if (otherFormat && (k === 'output-file' || k === 'output-ext')) return;
      output = true; if (RENAME_KEYS.includes(k)) renames = true;
    };
    for (const k of keys) { if (FILE_KEYS.includes(k)) files = true; else if (OUTPUT_KEYS.includes(k)) outputKey(k); }
    if (keys.some((k) => k.includes('\\'))) files = true;   // "ren\u0064er": an escape in a key could spell any key (round 3)
    for (const m of masked.matchAll(KEY_MENTION)) {
      if (m[3] === '' && m.index + m[1].length === indent) continue;   // a plain block key, first on its line
      // format and revealjs named inside a one-line flow mapping set nothing on their own; an output key named there is
      // caught by itself. A space before the colon is never read.
      if (m[3] === '' && (m[2] === 'format' || m[2] === 'revealjs')) continue;
      if (FILE_KEYS.includes(m[2])) files = true; else outputKey(m[2]);
    }
    // project.type other than default, in any form: block, quoted key, space before the colon, one-line flow mapping
    const type = top === 'project' && indent === childIndent ? code.match(/^[ \t]*(["']?)type\1[ \t]*:[ \t]*(.*?)[ \t]*$/)
      : key === 'project' && indent === 0 ? code.match(/[{,][ \t]*(["']?)type\1[ \t]*:[ \t]*([^,}]*?)[ \t]*(?=[,}])/) : null;
    if (type && !DEFAULT_TYPE.test(type[2])) output = true;
    // project and format at the root, and revealjs under format, hold the scanned keys: a flow mapping there is read only
    // when it closes on its line (what it names is checked above); an anchor, alias, tag, block scalar or sequence never
    const scannedParent = ((key === 'project' || key === 'format') && indent === 0) || (key === 'revealjs' && top === 'format' && indent === childIndent);
    if (scannedParent && value !== '{}'
      && (/^[&*!|>[]/.test(value) || (value.startsWith('{') && !/\}[ \t]*$/.test(value)) || /(^|[\s,[{])[&*][^\s,[\]{}]/.test(value))) {
      if (key === 'project') files = true; else { output = true; renames = true; }
    }
    if (renderIndent >= 0) {
      const keyLine = key === 'render' && indent === renderIndent;
      const text = keyLine ? value : masked.trim().replace(/^-[ \t]*/, '');
      // a flow mapping or block scalar, an anchor (&a), alias (*a) or tag (!t) at the start of a value (not `Q & A.qmd`)
      if (/^[{|>]/.test(text) || /(^|[\s,[])[&*!][^\s,[\]{}]/.test(text) || /[[,][ \t]*\{/.test(text)) files = true;
      // Outside a flow list an unquoted comma is part of one value (`- my, talk.qmd`), which the scanner splits.
      if ((keyLine || /^[ \t]*-/.test(code)) && !/^\[/.test(text) && text.includes(',')) files = true;
      if (open || values.some((v) => v.body.includes(',') || (v.q === '"' && v.body.includes('\\')) || (v.q === "'" && v.body.includes("''")))) files = true;
      if (keyLine) {
        renderFlow = /^\[/.test(text) && !/\][ \t]*$/.test(text);
        flowItemOpen = renderFlow && !/[[,][ \t]*$/.test(text);
        kinds.push('render');
      } else if (renderFlow) {
        // in a flow list a value runs on until a comma: a line after one that ended without a comma continues it,
        // unless it starts with the comma or the closing ] (verify round 3)
        if (flowItemOpen && !/^[ \t]*[\],]/.test(masked)) files = true;
        if (/\]/.test(masked)) renderFlow = false;
        flowItemOpen = !/[[,][ \t]*$/.test(masked.trim());
      } else if (!/^[ \t]*-/.test(code)) files = true;   // a line continuing a value: YAML joins it, the scanner splits it
    }
    if (key === 'output-file' && (indent === 0 || (fmtIndent >= 0 && indent > fmtIndent))) {
      const o = code.match(SCANNED_OUTPUT_FILE);
      // not matched, an anchor, alias, tag or flow value, a quoted value with '' or \" the quoted forms could not take, an
      // escape, a null or empty value, or a key deeper than revealjs's own (Quarto does not take it; verify round 2)
      if (!o || /^[&*!|>{["']/.test(o[3] ?? '') || (o[1] ?? '').includes('\\') || /^(~|null|Null|NULL)$/.test(o[3] ?? '')
        || o[1] === '' || o[2] === '' || (indent > 0 && indent > revChild)) { output = true; renames = true; }
      else { kinds.push('output-file'); if (o[3] !== undefined) continued = indent; }
    } else if (key === 'output-file' && top === 'format' && indent > childIndent && /.-revealjs$/.test(fmtChild ?? '')) kinds.push('output');
    // output-ext at the top level or under a revealjs format; an output folder, set or implied by a project type other
    // than default (website, book, manuscript write to _site, _book, _manuscript)
    if ((key === 'output-ext' && (indent === 0 || (top === 'format' && indent > childIndent && REVEALJS_FORMAT.test(fmtChild ?? ''))))
      || (top === 'project' && indent === childIndent && key === 'output-dir')) kinds.push('output');
    if (files) found.push({ line, text: raw.trim(), kind: 'unread' });
    else if (output) found.push({ line, text: raw.trim(), kind: renames ? 'unread-output' : 'output' });
    else for (const kind of kinds) found.push({ line, text: raw.trim(), kind });
  }
  for (const l of metadataFileLists(yml)) {
    if (!found.some((f) => f.line === l.line && f.kind.startsWith('unread'))) found.push({ line: l.line, text: l.text, kind: l.names === null ? 'unread' : 'metadata' });
  }
  return found.sort((a, b) => a.line - b.line);
}

const pick = (found) => found.map(({ line, text }) => ({ line, text }));
const OUTPUT_KINDS = ['output-file', 'output', 'unread-output'];

// The lines of a settings file the scanner cannot read; outputOnly marks those about the output name only.
export function unreadQuartoLines(yml) {
  return scanSettings(yml).filter((f) => f.kind.startsWith('unread')).map(({ line, text, kind }) => ({ line, text, outputOnly: kind === 'unread-output' }));
}

// The lines of a settings file that set the output name where the scanner does not read it (#50).
export function outputSourceLines(yml) {
  return pick(scanSettings(yml).filter((f) => f.kind === 'output'));
}

// The lines of a document's front matter or a _metadata.yml that set, or may set, the output name (#50): every line
// scanSettings tags there except render, which means nothing in those files. That covers an output name set directly,
// in any form, and one that may come through metadata-files or a merge key (verify round 2).
export function outputNameLines(yml) {
  return pick(scanSettings(yml).filter((f) => f.kind !== 'render'));
}

// The lines of a profile file (_quarto-<name>.yml) or of a file metadata-files lists that bear on the deck's files,
// judged by the same rules as the settings file; outputOnly marks those that change only the output name.
export function profileSettingLines(yml) {
  return scanSettings(yml).map(({ line, text, kind }) => ({ line, text, kind, outputOnly: OUTPUT_KINDS.includes(kind) }));
}

// A plain or simply quoted YAML scalar ('…' without '', "…" without escapes), else null.
function simpleScalar(s) {
  s = s.trim();
  const q = s.match(/^"([^"\\]*)"$|^'([^']*)'$/);
  if (q) return q[1] ?? q[2];
  return s === '' || /^[&*!|>{[\]}"'@`%#,?:-]/.test(s) || /: |[ \t]#/.test(s) ? null : s;
}

// The files each metadata-files key lists (verify round 1): Quarto merges them into the settings, so the callers
// read them and refuse only one that sets render or output-file (#46 Diagnosis). Returned as { line, text, names };
// names is null when the list is written in a form not covered here (a flow list on the key's line, a block list of
// simple scalars, or one simple scalar).
export function metadataFileLists(yml) {
  const lists = [];
  let open = null;   // the block list being read: the key's indent and its entry
  for (const { line, raw, code, indent, masked } of settingLines(yml)) {
    if (open && /^[ \t]*-(?=[ \t]|$)/.test(masked) && indent >= open.indent) {
      const name = simpleScalar(code.replace(/^[ \t]*-/, ''));
      if (name === null) open.entry.names = null; else open.entry.names?.push(name);
      continue;
    }
    open = null;
    const m = masked.match(/^[ \t]*metadata-files:(?=[ \t]|$)[ \t]*(.*)$/);
    if (!m) continue;
    const entry = { line, text: raw.trim(), names: [] };
    lists.push(entry);
    const value = code.replace(/^[ \t]*metadata-files:[ \t]*/, '').trim();
    if (m[1].trim() === '') { open = { indent, entry }; continue; }
    if (!value.startsWith('[')) { const name = simpleScalar(value); entry.names = name === null ? null : [name]; continue; }
    if (!value.endsWith(']')) { entry.names = null; continue; }
    const items = [];
    let cur = ''; let q = null;
    for (const c of value.slice(1, -1)) {
      if (q) { cur += c; if (c === q) q = null; } else if (c === '"' || c === "'") { q = c; cur += c; } else if (c === ',') { items.push(cur); cur = ''; } else cur += c;
    }
    items.push(cur);
    const names = items.length === 1 && items[0].trim() === '' ? [] : items.map(simpleScalar);
    entry.names = q || names.includes(null) ? null : names;
  }
  return lists;
}

// The deck's Quarto settings (issue #46): _quarto.yml, else _quarto.yaml (the file Quarto uses), and the settings the
// scanner does not read, as { file, line, text, outputOnly }: the unread lines of that file; the lines of a file that
// metadata-files lists, and of a profile file (_quarto-<name>.yml, in any letter case, as Quarto finds it on a
// case-insensitive disk; only when there is a settings file, since Quarto uses profiles only in a project), judged by
// the same rules, as Quarto merges them; and the sources of the output name the scanner does not read (#50): an
// extension format's output-file, output-ext, project.output-dir, and _metadata.yml. outputOnly marks those that
// change only the output name, which the .qmd lookup does not need. A file that cannot be read counts as unread. A
// file that is a symbolic link is followed, as before, but its lines are reported by number only: printing them could
// show the contents of a file outside the deck folder (verify round 1).
const PROFILE_FILE = /^_quarto-.+\.ya?ml$/i;
const FOLDER_METADATA = ['_metadata.yml', '_metadata.yaml'];
export function quartoSettings(dir = process.cwd()) {
  const read = (name) => { try { return readFileSync(path.join(dir, name), 'utf8'); } catch { return null; } };
  const isLink = (name) => { try { return lstatSync(path.join(dir, name)).isSymbolicLink(); } catch { return false; } };
  const add = (name, list, outputOnly) => unread.push(...list.map((u) => ({
    file: name, line: u.line, text: isLink(name) ? 'not shown: the file is a symbolic link' : u.text, outputOnly: outputOnly ?? u.outputOnly,
  })));
  const unread = [];
  const file = ['_quarto.yml', '_quarto.yaml'].find((name) => isFileIn(dir, name)) ?? null;
  const yml = file ? read(file) : '';
  if (yml === null) unread.push({ file, line: 0, text: 'could not be read', outputOnly: false });
  else {
    add(file, unreadQuartoLines(yml));   // each line says whether it is about the output name only
    add(file, outputSourceLines(yml), true);
    // metadata-files: each listed file must be a plain file name in this folder (verify round 1; the #46 Diagnosis)
    for (const { line, names } of metadataFileLists(yml)) {
      for (const name of names ?? []) {
        const text = plainName(name) && isFileIn(dir, name) ? read(name) : null;
        if (text === null) {
          unread.push({ file, line, outputOnly: false, text: isLink(file) ? 'not shown: the file is a symbolic link'
            : `metadata-files lists ${name}, which is not a readable file in this folder` });
        }
        else add(name, profileSettingLines(text));
      }
    }
  }
  for (const name of file ? readdirSync(dir).filter((f) => PROFILE_FILE.test(f) && isFileIn(dir, f)).sort() : []) {
    const text = read(name);
    if (text === null) unread.push({ file: name, line: 0, text: 'could not be read', outputOnly: false });
    else add(name, profileSettingLines(text));
  }
  for (const name of FOLDER_METADATA.filter((f) => isFileIn(dir, f))) {   // directory metadata, merged into every document (#50)
    const text = read(name);
    if (text === null) unread.push({ file: name, line: 0, text: 'could not be read', outputOnly: true });
    else add(name, outputNameLines(text), true);
  }
  return { file, yml: yml ?? '', unread };
}

// The lines of a .qmd file's front matter that set the output name (#50), as { file, line, text, outputOnly }.
// The YAML blocks Quarto reads a document's metadata from, as { text, line(n) } (line(n): the file's line number of
// the block's line n, 1 being the opening ---). Quarto's own rules (readYamlFromMarkdown; verify round 3): it drops
// HTML comments and backtick-fenced code, then takes every line-start --- followed by a line that is not blank, up to
// the next --- or ... line, whatever comes before it, and leaves out a block that starts with a blank line. Quarto
// parses each block and stops the render on one that is not YAML, so reading them here cannot refuse a deck that
// renders. Comments and fences are found line by line, not with Quarto's regular expressions, which take quadratic
// time on many unclosed ones in a folder from elsewhere (#51).
const QUARTO_YAML = /(^)(---[ \t]*[\r\n]+(?![ \t]*[\r\n]+)[\W\w]*?[\r\n]+(?:---|\.\.\.))([ \t]*)$/gm;   // kRegExYAML
function metadataBlocks(text) {
  // drop HTML comments (<!-- up to the first --> after it), keeping the file's line number of every line that is left
  let kept = ''; const origin = [0]; let line = 0; let at = 0;
  for (;;) {
    const open = text.indexOf('<!--', at);
    const close = open < 0 ? -1 : text.indexOf('-->', open + 4);
    const part = text.slice(at, close < 0 ? text.length : open);
    kept += part;
    for (let n = part.indexOf('\n'); n >= 0; n = part.indexOf('\n', n + 1)) origin.push(++line);
    if (close < 0) break;
    for (let n = text.indexOf('\n', open); n >= 0 && n < close; n = text.indexOf('\n', n + 1)) line++;
    at = close + 3;
  }
  // blank fenced code: an opening line of backticks (after tabs, spaces or >) with no backtick after them, closed by the
  // first line two or more lines down that has the same opening and only white space after it
  const lines = kept.split('\n');
  const closers = new Map();
  lines.forEach((l, n) => { const m = l.match(/^([\t >]*`{3,})\s*$/); if (m) { if (!closers.has(m[1])) closers.set(m[1], []); closers.get(m[1]).push(n); } });
  const next = new Map();   // per opening, how far its closer list has been read
  for (let n = 0; n < lines.length; n++) {
    const m = lines[n].match(/^([\t >]*`{3,})[^`]*$/);
    if (!m) continue;
    const list = closers.get(m[1]) ?? [];
    let k = next.get(m[1]) ?? 0;
    while (k < list.length && list[k] < n + 2) k++;
    next.set(m[1], k);
    if (k === list.length) continue;
    for (let b = n; b <= list[k]; b++) lines[b] = '';
    n = list[k];
  }
  const body = lines.join('\n');
  const starts = [0];
  for (let n = body.indexOf('\n'); n >= 0; n = body.indexOf('\n', n + 1)) starts.push(n + 1);
  const blocks = [];
  let row = 0;
  for (const m of body.matchAll(QUARTO_YAML)) {
    const block = m[2].replace(/^---/, '').replace(/---\s*$/, '').split('\n').map((x) => x.trimEnd()).join('\n');
    if (/^\n\s*\n/.test(block) || /^\n\s*\n---/m.test(block) || block.trim() === '') continue;
    while (row + 1 < starts.length && starts[row + 1] <= m.index) row++;
    const first = row;
    blocks.push({ text: block, line: (n) => origin[first + n - 1] + 1 });
  }
  return blocks;
}

function frontMatterOutputLines(dir, name) {
  let text;
  try { text = readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, ''); } catch { return []; }
  let link = false;
  try { link = lstatSync(path.join(dir, name)).isSymbolicLink(); } catch { /* read above */ }
  return metadataBlocks(text).flatMap((b) => outputNameLines(b.text).map((u) => ({
    file: name, line: b.line(u.line), text: link ? 'not shown: the file is a symbolic link' : u.text, outputOnly: true,
  })));
}

// The .qmd files project.render names in this folder (plain names only).
export function renderedQmds(yml) {
  return readQuartoYml(yml).render.filter((v) => v.endsWith('.qmd') && plainName(v));
}

// The deck's main file (issue #44): the single .qmd that project.render names in this folder, else the folder's
// only .qmd; null when neither settles it. Its .html is <stem>.html, or the revealjs output-file (with .html added
// unless it ends in .html, as Quarto does) when that is a plain name; export-pdf writes the .pdf under the
// .html's stem. Every name returned is a plain file name in `dir`.
export function deckMain(dir = process.cwd()) {
  const { yml } = quartoSettings(dir);
  const listed = renderedQmds(yml);
  const qmds = deckCandidates('.qmd', { dir });
  const qmd = listed.length === 1 ? listed[0] : qmds.length === 1 ? qmds[0] : null;
  if (!qmd) return null;
  const out = readQuartoYml(yml).outputFile;
  const html = plainName(out) ? (out.endsWith('.html') ? out : `${out}.html`) : qmd.replace(/\.qmd$/, '.html');
  return { '.qmd': qmd, '.html': html, '.pdf': html.replace(/\.html$/, '.pdf') };
}

// Which file a script reads when no file option is given (issue #44). When the deck's main file can be
// told, its own file of that type: talk.pdf, not talk-notes.pdf beside it (user decision 2026-10-31, after
// verify round 1); if that file is missing, the result says so instead of picking another. When the main
// file cannot be told, the folder's only candidate. Never a fixed name such as talk.html.
export function chooseDeckFile(ext, { dir = process.cwd(), exclude = null } = {}) {
  const candidates = deckCandidates(ext, { dir, exclude });
  // Settings the scanner cannot read leave the main file unknown; refuse rather than guess (#46). Those that change
  // only the output name matter only when the lookup needs that name (#50).
  const needsOutput = ext !== '.qmd';
  const unread = quartoSettings(dir).unread.filter((u) => needsOutput || !u.outputOnly);
  if (unread.length) return { reason: 'unread', unread, candidates };
  const main = deckMain(dir);
  const frontMatter = main && needsOutput && isFileIn(dir, main['.qmd']) ? frontMatterOutputLines(dir, main['.qmd']) : [];
  if (frontMatter.length) return { reason: 'unread', unread: frontMatter, candidates };
  if (main) return isFileIn(dir, main[ext]) ? { file: main[ext] } : { reason: 'missing', expected: main[ext], main: main['.qmd'], candidates };
  if (candidates.length === 1) return { file: candidates[0] };
  return { reason: candidates.length ? 'several' : 'none', candidates };
}

const NEXT = { '.html': 'render the deck first', '.pdf': 'export it first (export-pdf.mjs)', '.qmd': 'check _quarto.yml' };

// A script's input file: the file given with --<option>, else chooseDeckFile's choice in the current folder.
// The option given without a file name is refused, and so is no choice: the script says where it looked and
// what it found, and exits 2 rather than guess.
export function findDeckFile(given, ext, option, { exclude = null } = {}) {
  const flag = `--${option}`;
  if (process.argv.includes(flag) && (typeof given !== 'string' || given === '' || given.startsWith('--'))) {
    console.error(`${flag} needs a file name.`);
    process.exit(2);
  }
  if (given !== undefined && given !== null) return given;
  const dir = process.cwd();
  const r = chooseDeckFile(ext, { dir, exclude });
  if (r.file) return r.file;
  const list = r.candidates.map(printable).join(', ');
  const where = printable(dir);
  if (r.reason === 'unread') {
    const lines = r.unread.slice(0, 3).map((u) => `${printable(u.file)}${u.line ? ` line ${u.line}` : ''} (${printable(u.text)})`);
    if (r.unread.length > 3) lines.push(`and ${r.unread.length - 3} more`);
    console.error(`The deck's file could not be told from its Quarto settings in ${where}: ${lines.join('; ')}. Pass ${flag} <file>. `
      + 'These scripts read project.render and output-file only in block style, as the templates write them, in the settings '
      + 'file itself; they do not read other forms, profile files (_quarto-<name>.yml), merge keys, a project type other '
      + `than default, or an output name set by an extension format, the front matter, _metadata.yml, output-ext or output-dir.`);
  } else if (r.reason === 'missing') {
    console.error(`The deck's main file is ${printable(r.main)}, but there is no ${printable(r.expected)} in ${where}`
      + `${list ? ` (found: ${list})` : ''}; ${NEXT[ext]}, or pass ${flag} <file>.`);
  } else if (r.reason === 'several') {
    console.error(`More than one ${ext} file in ${where}: ${list}; the deck's main file could not be told from `
      + `_quarto.yml or a single .qmd, so pass ${flag} <file> to choose one.`);
  } else {
    console.error(`No ${ext} file in ${where}; run this in the deck folder or pass ${flag} <file>.`);
  }
  process.exit(2);
}

// Resolve the deck path; exit 2 when it does not exist.
export function deckPath(html) {
  const file = path.resolve(html);
  if (!existsSync(file)) { console.error(`HTML not found: ${printable(file)} (render the deck first)`); process.exit(2); }
  return { root: path.dirname(file), name: path.basename(file) };
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

function inside(file, root) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

// Pin the chosen directory to its physical location. The default qa/ must stay in the
// deck; an explicit --out is an operator-selected destination and may live elsewhere.
export async function outputDirectory(directory, root) {
  const base = root === undefined ? null : await realpath(root);
  await mkdir(directory, { recursive: true });
  const resolved = await realpath(directory);
  if (base !== null && !inside(resolved, base)) throw new Error('output directory resolves outside the deck; choose a trusted --out directory');
  return resolved;
}

// Replace the directory entry, never truncate through an existing symlink or hardlink.
// Directory ancestors must not be concurrently replaced by another local process.
export async function writeOutput(file, data) {
  const directory = await outputDirectory(path.dirname(file));
  const target = path.join(directory, path.basename(file));
  let mode = 0o666;
  try {
    const existing = await lstat(target);
    if (existing.isFile()) mode = existing.mode & 0o777;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const temporary = await mkdtemp(path.join(directory, '.slide-qa-'));
  try {
    const pending = path.join(temporary, 'output');
    await writeFile(pending, data, { flag: 'wx', mode });
    await rename(pending, target);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

// Serve only files inside `root`, and only to this machine: bind to 127.0.0.1 so the deck folder is
// never exposed on the local network, reject any path that resolves outside root (a bare prefix
// test would let /deck-other through when root is /deck), and answer only requests addressed to
// this server by Host header, so a web page using DNS rebinding cannot read the deck folder.
export async function serve(root) {
  const base = await realpath(root);
  const server = createServer(async (req, res) => {
    try {
      const { port } = server.address();
      if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return res.writeHead(403).end();
      const file = path.resolve(base, '.' + decodeURIComponent(req.url.split('?')[0]));
      if (!inside(file, base)) return res.writeHead(404).end();
      const resolved = await realpath(file);
      if (!inside(resolved, base) || !(await stat(resolved)).isFile()) return res.writeHead(404).end();
      const data = await readFile(resolved);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (err) {
      res.writeHead(['ENOENT', 'ENOTDIR', 'ELOOP'].includes(err.code) ? 404 : 500).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

// Open the print view: export-pdf.mjs prints it and check-layout.mjs measures it, both through this
// function, so the layout that is checked is the layout that is printed. Each PDF page is the slide
// plus the deck's revealjs margin, the same proportions as the screen view.
export async function openPrintView(page, url) {
  await page.goto(`${url}?print-pdf`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { if (window.MathJax && window.MathJax.startup) await window.MathJax.startup.promise; });
  await page.waitForFunction(() => window.Reveal && window.Reveal.isReady());
  await page.waitForTimeout(1500);
}

// Load the deck, wait for MathJax and Reveal, and freeze transitions so geometry is final.
export async function openDeck(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.Reveal && window.Reveal.isReady());
  await page.evaluate(async () => { if (window.MathJax && window.MathJax.startup) await window.MathJax.startup.promise; });
  await page.addStyleTag({ content: '.reveal .progress, .reveal .slide-menu-button { display: none !important; }'
    + ' .reveal .slides section, .reveal .slides section > * { transition: none !important; animation: none !important; }'
    + ' .reveal .slides section:not(.present) { display: none !important; }' });
  await page.evaluate(() => { window.Reveal.configure({ transition: 'none', backgroundTransition: 'none' }); window.Reveal.slide(0, 0); });
}
