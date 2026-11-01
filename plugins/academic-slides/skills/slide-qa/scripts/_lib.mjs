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
    if (!token.startsWith('--')) throw new OptionError(`unexpected argument ${printable(token)} (see --help)`);
    const name = token.slice(2);
    const kind = Object.hasOwn(spec, name) ? spec[name] : undefined;
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
// File names come from the folder and are printed: control characters (terminal escapes) become '?'.
const printable = (s) => String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, '?');

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
        const pieces = /[[\],]/.test(rest) ? rest.replace(/^[\s[]+|[\s\]]+$/g, '').split(',') : [rest];
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
// Every line that writes these settings another way is returned as { line, text }, so the caller refuses instead
// of guessing: a flow mapping or sequence at the root; one of those keys quoted, with a space before the colon,
// inside a flow mapping, or after a list dash; such a key's value given as a flow mapping, an anchor, an alias, a
// tag, or a block scalar; a merge key (<<) or metadata-files anywhere; in project.render or the output-file the
// scanner uses, an anchor, alias or tag, or an escape; and in project.render a quoted value holding a comma (the
// scanner splits render values at commas; it reads an output-file value whole). The contents of block scalars
// (| and >) are text, not settings, and are skipped here and by the scanner. The same code is in
// slide-deck-scaffold's scaffold.mjs; tests/quarto-settings.test.mjs checks that the two agree.
const SCANNED_KEYS = ['project', 'format', 'revealjs', 'render', 'output-file'];
const KEY_MENTION = /(^|[\s{,[])(project|format|revealjs|render|output-file|metadata-files)([ \t]*):(?=[\s{["']|$)/g;
const MERGE_KEY = /(^|[\s{,[-])<<[ \t]*:/;
const SCANNED_OUTPUT_FILE = /^[ \t]*output-file:[ \t]*(?:"([^"]*)"|'([^']*)'|(\S+))[ \t]*$/;
const BLOCK_SCALAR = /(?:^[ \t]*-|:)[ \t]+[|>][-+1-9]*[ \t]*$/;   // a value that starts a | or > block scalar

// The line with every quoted string replaced by "", the quoted keys (a quoted string followed by a colon, with or
// without a space, as JSON-style YAML writes them), and the other quoted strings with their quote character.
function maskQuoted(code) {
  let masked = '';
  const keys = [];
  const values = [];
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
      body += code[j++];
    }
    if (/^[ \t]*:/.test(code.slice(j + 1))) keys.push(body); else values.push({ q, body });
    masked += '""';
    i = j;
  }
  return { masked, keys, values };
}

// The lines of a YAML text that can hold settings, as { line, raw, code, indent, masked, keys, values }: blank
// lines, comments, and the contents of block scalars are left out, so text that only quotes a setting is not read
// as one.
function settingLines(yml) {
  const lines = [];
  let scalarIndent = -1;
  yml.split(/\r?\n/).forEach((raw, n) => {
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

export function unreadQuartoLines(yml) {
  const unread = [];
  let top = null; let childIndent = -1; let renderIndent = -1; let fmtIndent = -1; let seen = false;
  for (const { line, raw, code, indent, masked, keys, values } of settingLines(yml)) {
    const own = masked.match(/^[ \t]*([A-Za-z_][\w.-]*):(?=[ \t]|$)[ \t]*(.*)$/);
    const key = own?.[1];
    const value = (own?.[2] ?? '').trim();
    if (indent === 0) { top = key ?? null; childIndent = -1; renderIndent = -1; fmtIndent = -1; }
    else {
      if (childIndent < 0) childIndent = indent;
      if (indent <= childIndent && !(renderIndent === indent && /^\s*-/.test(code))) { renderIndent = -1; if (indent < childIndent || key !== 'revealjs') fmtIndent = -1; }
      if (top === 'project' && indent === childIndent && key === 'render') renderIndent = indent;
      if (top === 'format' && indent === childIndent && key === 'revealjs') fmtIndent = indent;
    }
    let bad = (indent === 0 && /^[{[]/.test(masked))
      || keys.some((k) => SCANNED_KEYS.includes(k) || k === 'metadata-files') || MERGE_KEY.test(masked)
      || [...masked.matchAll(KEY_MENTION)].some((m) => m[3] !== '' || m.index + m[1].length !== indent)
      || /^[ \t]*\?(?=[ \t]|$)/.test(masked)                                       // an explicit key (? key)
      || (seen && /^(---|\.\.\.)(?=[ \t]|$)/.test(code));                            // a second YAML document
    seen = true;
    // project and format at the root, and revealjs under format, hold the scanned keys: their value must be a block
    // mapping (or an empty {}), not a flow mapping, anchor, alias, tag, or block scalar
    const scannedParent = ((key === 'project' || key === 'format') && indent === 0) || (key === 'revealjs' && top === 'format' && indent === childIndent);
    if (scannedParent && value !== '{}' && /^[{[&*!|>]/.test(value)) bad = true;
    if (renderIndent >= 0) {
      const keyLine = key === 'render' && indent === renderIndent;
      const text = keyLine ? value : masked.trim().replace(/^-[ \t]*/, '');
      // a flow mapping or block scalar, an anchor (&a), alias (*a) or tag (!t) at the start of a value (not `Q & A.qmd`)
      if (/^[{|>]/.test(text) || /(^|[\s,[])[&*!][^\s,[\]{}]/.test(text) || /[[,][ \t]*\{/.test(text)) bad = true;
      // Outside a flow list an unquoted comma is part of one value (`- my, talk.qmd`), which the scanner splits.
      if ((keyLine || /^[ \t]*-/.test(code)) && !/^\[/.test(text) && text.includes(',')) bad = true;
      if (values.some((v) => v.body.includes(',') || (v.q === '"' && v.body.includes('\\')) || (v.q === "'" && v.body.includes("''")))) bad = true;
    }
    if (key === 'output-file' && (indent === 0 || (fmtIndent >= 0 && indent > fmtIndent))) {
      const o = code.match(SCANNED_OUTPUT_FILE);
      // not matched, an anchor, alias, tag or flow value, a quoted value with '' or \" the quoted forms could not take, or an escape
      if (!o || /^[&*!|>{["']/.test(o[3] ?? '') || (o[1] ?? '').includes('\\')) bad = true;
    }
    if (bad) unread.push({ line, text: raw.trim() });
  }
  // metadata-files is read (the caller checks the files it lists); a list in another form is not
  for (const l of metadataFileLists(yml)) if (l.names === null && !unread.some((u) => u.line === l.line)) unread.push({ line: l.line, text: l.text });
  return unread.sort((a, b) => a.line - b.line);
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

// The lines of a profile file (_quarto-<name>.yml) that set render or output-file, or may set them indirectly
// (metadata-files, a merge key), in any form; quoted text and block scalars are not settings.
const DECK_FILE_KEYS = ['render', 'output-file', 'metadata-files'];
export function profileSettingLines(yml) {
  return settingLines(yml)
    .filter(({ masked, keys }) => keys.some((k) => DECK_FILE_KEYS.includes(k)) || MERGE_KEY.test(masked)
      || [...masked.matchAll(KEY_MENTION)].some((m) => DECK_FILE_KEYS.includes(m[2])))
    .map(({ line, raw }) => ({ line, text: raw.trim() }));
}

// The deck's Quarto settings (issue #46): _quarto.yml, else _quarto.yaml (the file Quarto uses), and the settings the
// scanner cannot read: the lines unreadQuartoLines reports in that file, and every line of a profile file
// (_quarto-<name>.yml) that profileSettingLines reports, since Quarto merges a profile file only while that profile
// is active, which these scripts cannot know. A file that cannot be read counts as unread. A settings file that is a
// symbolic link is followed, as before, but its lines are reported by number only: printing them could show the
// contents of a file outside the deck folder (verify round 1). Profile names match in any letter case, as Quarto
// finds them on a case-insensitive disk.
const PROFILE_FILE = /^_quarto-.+\.ya?ml$/i;
export function quartoSettings(dir = process.cwd()) {
  const read = (name) => { try { return readFileSync(path.join(dir, name), 'utf8'); } catch { return null; } };
  const isLink = (name) => { try { return lstatSync(path.join(dir, name)).isSymbolicLink(); } catch { return false; } };
  const shown = (name, list) => (isLink(name) ? list.map((u) => ({ ...u, text: 'not shown: the file is a symbolic link' })) : list);
  const file = ['_quarto.yml', '_quarto.yaml'].find((name) => isFileIn(dir, name)) ?? null;
  const yml = file ? read(file) : '';
  const unread = yml === null ? [{ file, line: 0, text: 'could not be read' }] : shown(file, unreadQuartoLines(yml)).map((u) => ({ file, ...u }));
  // metadata-files: each listed file must be a plain file name in this folder, and is refused when it sets render or
  // output-file (verify round 1; the #46 Diagnosis). Profile files count only when there is a settings file: Quarto
  // uses them only in a project.
  for (const { line, names } of yml ? metadataFileLists(yml) : []) {
    for (const name of names ?? []) {
      const text = plainName(name) && isFileIn(dir, name) ? read(name) : null;
      if (text === null) unread.push({ file, line, text: `metadata-files lists ${name}, which is not a readable file in this folder` });
      else unread.push(...shown(name, profileSettingLines(text)).map((u) => ({ file: name, ...u })));
    }
  }
  for (const name of file ? readdirSync(dir).filter((f) => PROFILE_FILE.test(f) && isFileIn(dir, f)).sort() : []) {
    const text = read(name);
    if (text === null) { unread.push({ file: name, line: 0, text: 'could not be read' }); continue; }
    unread.push(...shown(name, profileSettingLines(text)).map((u) => ({ file: name, ...u })));
  }
  return { file, yml: yml ?? '', unread };
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
  // Settings the scanner cannot read leave the main file unknown; refuse rather than guess (#46).
  const { unread } = quartoSettings(dir);
  if (unread.length) return { reason: 'unread', unread, candidates };
  const main = deckMain(dir);
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
    console.error(`The deck's file could not be told from its Quarto settings in ${where}: ${lines.join('; ')}. These scripts read `
      + 'project.render and output-file only in block style, as the templates write them, and not from profile files '
      + `(_quarto-<name>.yml), metadata-files or merge keys; pass ${flag} <file>, or write project.render and output-file in block style in the settings file itself.`);
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
  if (!existsSync(file)) { console.error(`HTML not found: ${file} (render the deck first)`); process.exit(2); }
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
