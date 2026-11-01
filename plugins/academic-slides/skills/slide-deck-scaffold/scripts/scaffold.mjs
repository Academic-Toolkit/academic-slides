#!/usr/bin/env node
// Start a new deck from a template, merging official, personal, and project settings (issue #8).
// Only Node built-ins: copy this skill anywhere and it still runs.
import { existsSync, statSync, lstatSync, readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync, realpathSync, constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIELDS = ['template', 'lang', 'author', 'affiliation', 'footer'];
export const DEFAULT_TEMPLATE = 'research-talk';
const NAME = /^[a-z0-9][a-z0-9-]*$/;
// The deck's main file is <name>.qmd, named after the deck's content (issue #44). The name the user gives is
// used exactly as given, not normalised: letters of any script (W07_記憶), digits, _ - + ( ) @ （ ）, and dots inside
// the name (user decision 2026-10-31, after verify round 1). Refused, because they are unsafe or not portable as a file
// name: whitespace, path separators, a leading - or ., a trailing dot, control characters, : * ? " < > |, and the
// Windows device names (CON, NUL, COM1, COM¹, …), which stay reserved with any extension. Characters that YAML or
// a shell treats specially (# , [ ] { } & * ! | > ' % `) are not in the set, so the name is safe to write into _quarto.yml.
export const DECK_NAME = /^[\p{L}\p{N}_][\p{L}\p{M}\p{N}_.+()@（）・·-]*$/u;
const NAME_CHAR = /[\p{L}\p{M}\p{N}_.+()@（）・·-]/u;
const DEVICE = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i;
const NAME_BYTES = 200;   // with .qmd, _files, -handout.pdf added, a file name stays under the usual 255-byte limit
export const NAME_RULE = 'letters of any script, digits, _ - + ( ) @ （ ） ・ ·, and dots inside the name; no spaces, path separators, '
  + 'leading - or ., trailing dot, : * ? " < > |, or a Windows device name such as CON or NUL';
// What is wrong with a deck name, in words, or null when it is usable; the message names the characters refused.
export function nameProblem(name) {
  if (typeof name !== 'string' || name === '') return 'it is empty';
  const refused = [...new Set([...name].filter((c) => !NAME_CHAR.test(c)))];
  if (refused.length) return `it contains ${refused.map((c) => show(c)).join(', ')}`;
  if (!DECK_NAME.test(name)) return `it starts with ${show(name[0])}; start with a letter, a digit, or _`;
  if (name.endsWith('.')) return 'it ends with a dot';
  if (DEVICE.test(name.split('.')[0])) return `${name.split('.')[0]} is a Windows device name`;
  if (Buffer.byteLength(name) > NAME_BYTES) return `it is longer than ${NAME_BYTES} bytes`;
  return null;
}
export const deckNameOk = (name) => nameProblem(name) === null;
// A name given with its .qmd ending names the same file: w07.qmd means the main file w07.qmd.
export const deckStem = (name) => (typeof name === 'string' ? name.replace(/\.qmd$/i, '') : name);
export const NAME_HINT = 'name the main file after the deck\'s content (for example <venue>-<topic>, or W07_<topic> for a lecture); '
  + 'when no single name follows from what the user said or from the title, venue, or course, ask the user';
const SETTINGS_DIR = path.join('.claude', '.academic-slides');
const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OFFICIAL_DIR = path.join(SKILL_DIR, 'templates', 'quarto');
const OFFICIAL_THEME = path.join(OFFICIAL_DIR, '_theme', 'deck.scss');
const OFFICIAL_FRAME = path.join(OFFICIAL_DIR, '_theme', 'frame.html');   // places footer, slide number, menu on the page (#23)

const HELP = `Usage: node scaffold.mjs --out <folder> --name <name> [--template <name>] [--title <title>] [--dry-run]
       node scaffold.mjs --list [--out <folder>]

Creates a deck folder from a template and the shared theme, merging three settings layers
field by field (project > personal > official):
  personal  ~/.claude/.academic-slides/        local.json, theme.scss, templates/<name>/
  project   nearest .claude/.academic-slides/ above the deck folder (the home folder excluded)
  official  this skill's templates/quarto/<name>/
local.json fields (string, or null to remove): ${FIELDS.join(', ')}

  --out       deck folder to create; must not exist or be empty
  --name      the main file is <name>.qmd (rendered as <name>.html): ${NAME_RULE}.
              Required: ${NAME_HINT}
  --template  template name (overrides every layer; default ${DEFAULT_TEMPLATE})
  --title     title written into the main file
  --dry-run   print the resolution, write nothing
  --list      list templates with their layer; shadowed ones are marked
  --trust-project  use a template or theme.scss from the project layer. That layer is found by walking
              up from the deck folder, so it may come from a repository you did not write, and
              rendering its template runs whatever the template contains. Show those files to the
              user and pass this flag only with the user's approval; an agent never decides alone.
A settings file (local.json, theme.scss) or a template's talk.qmd or _quarto.yml that is itself a
symbolic link is refused, and a template folder must resolve inside its layer's templates/ folder;
links in the folders above those files are followed, including a layer folder or a templates/ folder
that is itself a link. Settings values are plain text: no <, {, [, ], &, backslash, backtick, or
control character (U+0000-U+001F, U+007F); lang must be a language tag such as en or zh-TW. A
template file on a path the scaffold writes itself, or on a case variant of one, is skipped with a
warning. A project settings folder must belong to you (where ownership cannot be checked, the whole
project layer needs --trust-project).
Exit status: 0 done, 1 refused (settings, template, or folder problem), 2 usage error (an unknown option, one given
             twice, a valued option given last, followed by another option, or given a blank value). --help or -h
             anywhere prints this text.`;

export class ScaffoldError extends Error {}

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const show = (v) => JSON.stringify(v);   // also writes YAML values: never change it to clean text for the terminal
// Everything the scaffold prints goes through screen(): control characters (C0, DEL, C1) and bidirectional controls in
// names, paths and template lines become '?', line by line, so a multi-line message keeps its lines (#51).
const printable = (s) => String(s).replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '?');
const screen = (s) => String(s).split('\n').map(printable).join('\n');
const isLink = (p) => lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
// How a file system that ignores case and Unicode form sees a path (the macOS default): two names with
// the same key are the same file there, so collision checks compare keys, not raw names (#8 verify).
const pathKey = (p) => p.normalize('NFC').toLowerCase();
const LANG = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/;

// A file read from a settings layer is never followed through a symbolic link: a cloned project could
// otherwise point talk.qmd or theme.scss at a private file and have it copied into the new deck.
function refuseLink(p, what) {
  if (isLink(p)) throw new ScaffoldError(`${printable(p)} is a symbolic link; ${what} is never read through a link`);
}

export function personalDir(home) {
  return path.join(home, SETTINGS_DIR);
}

// Nearest .claude/.academic-slides/ at or above `start`, stopping before the home folder
// (whose .claude/.academic-slides/ is the personal layer) and at the filesystem root.
export function findProjectDir(start, home) {
  let dir = path.resolve(start);
  while (!existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  dir = realpathSync(dir);
  const stop = existsSync(home) ? realpathSync(home) : path.resolve(home);
  for (;;) {
    if (dir === stop) return null;
    const candidate = path.join(dir, SETTINGS_DIR);
    if (isDir(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function readSettings(dir) {
  const file = dir ? path.join(dir, 'local.json') : null;
  if (!file || !lstatSync(file, { throwIfNoEntry: false })) return { settings: {}, warnings: [] };
  refuseLink(file, 'local.json');
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new ScaffoldError(`${printable(file)}: not valid JSON (${e.message})`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new ScaffoldError(`${printable(file)}: must be a JSON object`);
  const settings = {};
  const warnings = [];
  for (const [key, value] of Object.entries(data)) {
    if (!FIELDS.includes(key)) {
      warnings.push(`${file}: unknown field ${show(key)} ignored (known fields: ${FIELDS.join(', ')})`);
      continue;
    }
    if (value !== null && typeof value !== 'string') throw new ScaffoldError(`${printable(file)}: field ${show(key)} must be a string or null`);
    // Quarto reads these values as markdown: brackets would allow links and images (which fetch a
    // remote address when the deck is opened), <, {, and backticks HTML, shortcodes, spans, and code.
    // & and the backslash are refused too: Pandoc decodes character references (&#123; is "{") and
    // backslash escapes after this check has run, so they would rebuild any refused character (#8).
    if (typeof value === 'string' && /[<{`[\]&\\\u0000-\u001f\u007f]/.test(value)) {
      throw new ScaffoldError(`${printable(file)}: field ${show(key)} contains <, {, [, ], &, a backslash, a backtick, or a control character; settings values are plain text (no HTML, character references, links, images, Quarto shortcodes, or code)`);
    }
    // Quarto looks lang up as a file name (_language-<lang>.yml), so it must be a language tag, not a path
    if (key === 'lang' && typeof value === 'string' && !LANG.test(value)) {
      throw new ScaffoldError(`${printable(file)}: field "lang" must be a language tag such as en or zh-TW, not ${show(value)}`);
    }
    settings[key] = value;
  }
  return { settings, warnings };
}

// Layers in ascending precedence; a later layer replaces a field, null included.
export function mergeSettings(layers) {
  const merged = {};
  for (const { layer, settings } of layers) {
    for (const [key, value] of Object.entries(settings)) merged[key] = { value, from: layer };
  }
  return merged;
}

function layerDirs({ projectDir, personalDir: personal, officialDir }) {
  return [
    projectDir && { layer: 'project', root: path.join(projectDir, 'templates') },
    personal && { layer: 'personal', root: path.join(personal, 'templates') },
    { layer: 'official', root: officialDir },
  ].filter(Boolean);
}

export function listTemplates(dirs) {
  const seen = new Map();
  const rows = [];
  for (const { layer, root } of layerDirs(dirs)) {
    if (!isDir(root)) continue;
    for (const name of readdirSync(root).sort()) {
      if (!NAME.test(name) || !isDir(path.join(root, name))) continue;
      rows.push({ name, layer, dir: path.join(root, name), shadowedBy: seen.get(name) ?? null });
      if (!seen.has(name)) seen.set(name, layer);
    }
  }
  return rows;
}

export function resolveTemplate(name, dirs) {
  if (typeof name !== 'string' || !NAME.test(name)) {
    throw new ScaffoldError(`template name ${show(name)} is invalid: use lower-case letters, digits, and hyphens`);
  }
  const found = layerDirs(dirs).map(({ layer, root }) => ({ layer, dir: path.join(root, name) })).filter((c) => isDir(c.dir));
  if (!found.length) {
    const names = [...new Set(listTemplates(dirs).map((t) => t.name))];
    throw new ScaffoldError(`no template named ${show(name)}; available: ${names.join(', ') || '(none)'}`);
  }
  const [chosen, ...rest] = found;
  const layerRoot = layerDirs(dirs).find((d) => d.layer === chosen.layer).root;
  if (!inside(realpathSync(chosen.dir), realpathSync(layerRoot))) {
    throw new ScaffoldError(`template folder ${printable(chosen.dir)} resolves outside ${printable(layerRoot)} through a symbolic link`);
  }
  for (const required of ['talk.qmd', '_quarto.yml']) {
    refuseLink(path.join(chosen.dir, required), `a template's ${required}`);
    if (!isFile(path.join(chosen.dir, required))) throw new ScaffoldError(`template folder ${printable(chosen.dir)} has no ${required}`);
  }
  return { ...chosen, shadowed: rest.map((c) => c.layer) };
}

function continues(next) {
  return next !== undefined && /^(\s|-)/.test(next);
}

// Replace, remove (null), or add single-line `key: value` fields in the front matter.
export function rewriteFrontMatter(text, edits, where = 'talk.qmd') {
  text = text.replace(/^\uFEFF/, '');   // a byte order mark is not part of the front matter (verify round 1 of #53)
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) throw new ScaffoldError(`${printable(where)} has no front matter block at the top`);
  const lines = m[1].split(/\r?\n/);
  for (const [key, value] of Object.entries(edits)) {
    if (value === undefined) continue;
    const i = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (i >= 0 && continues(lines[i + 1])) throw new ScaffoldError(`${printable(where)}: front-matter field ${show(key)} must be on one line`);
    if (value === null) {
      if (i >= 0) lines.splice(i, 1);
    } else if (i >= 0) {
      lines[i] = `${key}: ${show(value)}`;
    } else {
      lines.push(`${key}: ${show(value)}`);
    }
  }
  return `---\n${lines.join('\n')}\n---\n${text.slice(m[0].length)}`;
}

export function rewriteQuartoYml(text, { theme, footer, mainFile }, where = '_quarto.yml') {
  const themeLine = /^([ \t]*)theme:[ \t]*(\S.*)?$/m;
  const t = text.match(themeLine);
  if (!t) throw new ScaffoldError(`${printable(where)} has no theme: line`);
  if (!t[2]) throw new ScaffoldError(`${printable(where)}: theme must be a one-line list such as [default, _theme/deck.scss]`);
  let out = text.replace(themeLine, (_, indent) => `${indent}theme: [${theme.join(', ')}]`);
  if (mainFile !== undefined) out = renameRenderTarget(out, mainFile);
  if (footer === undefined) return out;
  const footerLine = /^([ \t]*)footer:.*$/m;
  if (footer === null) return out.replace(/^[ \t]*footer:.*(\r?\n)?/m, '');
  if (footerLine.test(out)) return out.replace(footerLine, (_, indent) => `${indent}footer: ${show(footer)}`);
  return out.replace(themeLine, (line, indent) => `${line}\n${indent}footer: ${show(footer)}`);
}

// Point the deck's _quarto.yml at its own main file (issue #44). In the render list that is a direct child of
// project:, a value that is exactly talk.qmd (quoted or not, with or without ./) becomes <name>.qmd, in a block
// list, a flow list, or a single value; a value that only contains talk.qmd ("my talk.qmd"), a comment, and a
// talk.qmd listed anywhere else (under resources, say) are left alone. An output-file of talk or talk.html,
// at the top level, under format: revealjs:, or under an extension format such as clean-revealjs (#53), becomes
// <name> or <name>.html.
export function splitComment(body) {   // YAML: '#' after whitespace, outside quotes, starts a comment
  let quote = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) { if (c === quote) quote = null; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(body[i - 1]))) return [body.slice(0, i), body.slice(i)];
  }
  return [body, ''];
}
const REVEALJS_KEY = /^\s*(?:[\w.-]+-)?revealjs:/;   // format.revealjs, or an extension format such as clean-revealjs (#53)
const WHOLE_TALK = /(^|[[,:]|-[ \t])([ \t]*)(["']?)(\.\/)?talk\.qmd\3(?=[ \t]*(?:,|\]|$))/gi;
export function renameRenderTarget(text, mainFile) {
  const stem = mainFile.replace(/\.qmd$/, '');
  let top = null;            // the current top-level key
  let childIndent = -1;      // indent of that key's direct children
  let renderIndent = -1;     // indent of project.render while inside its value
  let fmtIndent = -1;        // indent of format.revealjs while inside it
  let scalarIndent = -1;     // indent of the key whose | or > block scalar is being passed over (#46)
  return text.split(/(?<=\n)/).map((line) => {
    const nl = line.match(/\r?\n$/)?.[0] ?? '';
    const [code, comment] = splitComment(line.slice(0, line.length - nl.length));
    if (/^\s*$/.test(code)) return line;
    const indent = code.match(/^[ \t]*/)[0].length;
    if (scalarIndent >= 0 && indent > scalarIndent) return line;   // block scalar contents are text, not settings
    scalarIndent = BLOCK_SCALAR.test(maskQuoted(code).masked) ? indent : -1;
    if (indent === 0) { top = code.match(/^([^:\s]+):/)?.[1] ?? null; childIndent = -1; renderIndent = -1; fmtIndent = -1; }
    else {
      if (childIndent < 0) childIndent = indent;
      if (indent <= childIndent && !(renderIndent === indent && /^\s*-/.test(code))) { renderIndent = -1; if (indent < childIndent || !REVEALJS_KEY.test(code)) fmtIndent = -1; }
      if (top === 'project' && indent === childIndent && /^\s*render:/.test(code)) renderIndent = indent;
      if (top === 'format' && indent === childIndent && REVEALJS_KEY.test(code)) fmtIndent = indent;
      if (renderIndent >= 0) return code.replace(WHOLE_TALK, (_, d, sp, q, dot) => `${d}${sp}${q}${dot ?? ''}${mainFile}${q}`) + comment + nl;
    }
    const outputFile = indent === 0 || (fmtIndent >= 0 && indent > fmtIndent);
    if (!outputFile) return line;
    return code.replace(/^([ \t]*output-file:[ \t]*)(["']?)(\.\/)?talk(\.html)?\2([ \t]*)$/i,
      (_, lead, q, dot, ext, tail) => `${lead}${q}${dot ?? ''}${stem}${ext ?? ''}${q}${tail}`) + comment + nl;
  }).join('');
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
// code is in slide-qa's _lib.mjs; tests/quarto-settings.test.mjs checks that the two agree, and that
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
//   output         another source of the output name the scanner does not read (#50), in any form: output-file under
//                  an extension format such as clean-revealjs, output-ext, project.output-dir, a project type other than
//                  default; refused when the name is needed. All but the extension format's output-file change only where
//                  the deck is written or its extension, which the scaffold accepts (verify round 3; #53 for the rest)
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

// The reader of project.render and output-file, and the YAML blocks of a document, are shared with the scaffold
// (#53): it checks a template's render entries and talk.qmd's blocks with the same code slide-qa reads them with.
const unquote = (v) => (/^(["']).*\1$/.test(v) ? v.slice(1, -1) : v);

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

// Each render value with the line it is on, and the output-file: the scaffold names the line of a render entry that
// the template does not have (#53), and readQuartoYml keeps its shape.
function readSettingsValues(yml) {
  const entries = [];
  let topOutput = null;
  let revealOutput = null;
  let top = null; let childIndent = -1; let renderIndent = -1; let fmtIndent = -1;
  for (const { line, code, indent } of settingLines(yml)) {   // block scalar contents are text, not settings (#46)
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
          if (v) entries.push({ value: v, line });
        }
        continue;
      }
    }
    if (indent === 0 || (fmtIndent >= 0 && indent > fmtIndent)) {
      const o = code.match(/^[ \t]*output-file:[ \t]*(?:"([^"]*)"|'([^']*)'|(\S+))[ \t]*$/);
      if (o) { const v = (o[1] ?? o[2] ?? o[3]).replace(/^\.\//, ''); if (indent === 0) topOutput = v; else revealOutput = v; }
    }
  }
  return { entries, outputFile: revealOutput ?? topOutput };
}

export function readQuartoYml(yml) {
  const { entries, outputFile } = readSettingsValues(yml);
  return { render: entries.map((e) => e.value), outputFile };
}

export function renderEntries(yml) {
  return readSettingsValues(yml).entries;
}

// The YAML blocks Quarto reads a document's metadata from, as { text, line(n) } (line(n): the file's line number of
// the block's line n, 1 being the opening ---). Quarto's own rules (readYamlFromMarkdown; verify round 3): it drops
// HTML comments and backtick-fenced code, then takes every line-start --- followed by a line that is not blank, up to
// the next --- or ... line, whatever comes before it, and leaves out a block that starts with a blank line. Quarto
// parses each block and stops the render on one that is not YAML, so reading them here cannot refuse a deck that
// renders. Comments and fences are found line by line, not with Quarto's regular expressions, which take quadratic
// time on many unclosed ones in a folder from elsewhere (#51).
const QUARTO_YAML = /(^)(---[ \t]*[\r\n]+(?![ \t]*[\r\n]+)[\W\w]*?[\r\n]+(?:---|\.\.\.))([ \t]*)$/gm;   // kRegExYAML
export function metadataBlocks(text) {
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

// A template made by copying a finished deck carries the outputs of rendering talk.qmd; copied into a deck named
// otherwise they would sit beside <name>.html and make slide-qa's lookup ambiguous, so they are left out (#44).
// Also the files derived from them by the plugin's own tools (talk-notes, talk-dual, talk-presenter-notes,
// talk-handout…, talk-script…), and the folders talk_files/, slide-qa's qa/ and Quarto's .quarto/. Other files
// named talk-… (talk-background.pdf, say) are template content and are kept.
const RENDER_OUTPUT_FILE = /^talk(-(notes|dual|presenter-notes|handout[^/]*|script[^/]*))?\.(html|pdf)$/;
const RENDER_OUTPUT_DIR = /^(talk_files|qa|\.quarto)$/;

// Template files to copy: everything except symbolic links, a top-level _theme/, any deck.scss, and the
// render outputs of talk.qmd at the top level.
function templateFiles(dir, warnings, rel = '') {
  const files = [];
  for (const entry of readdirSync(path.join(dir, rel)).sort()) {
    const relPath = path.join(rel, entry);
    const full = path.join(dir, relPath);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) {
      warnings.push(`skipped symbolic link ${relPath} in the template`);
    } else if (rel === '' && (st.isDirectory() ? RENDER_OUTPUT_DIR : RENDER_OUTPUT_FILE).test(pathKey(entry))) {
      warnings.push(`ignored the template's own ${entry}${st.isDirectory() ? '/' : ''}; it is an output of rendering or checking a deck, not template content`);
    } else if (st.isDirectory()) {
      if (rel === '' && pathKey(entry) === '_theme') warnings.push(`ignored the template's own ${entry}/; the shared theme is used`);
      else files.push(...templateFiles(dir, warnings, relPath));
    } else if (pathKey(entry) === 'deck.scss') {
      warnings.push(`ignored the template's own ${relPath}; the shared _theme/deck.scss is used`);
    } else if (st.isFile()) {
      files.push(relPath);
    }
  }
  return files;
}

function checkOut(out) {
  if (!existsSync(out)) return;
  if (!statSync(out).isDirectory()) throw new ScaffoldError(`${printable(out)} is a file, not a folder`);
  if (readdirSync(out).length) throw new ScaffoldError(`${printable(out)} is not empty; choose a new folder (existing decks are never overwritten)`);
}

// true when the folder belongs to the current user, false when it does not, null when this system
// cannot tell (no POSIX user ids); unknown is treated as untrusted, never as yours.
function ownedByUser(dir) {
  return typeof process.getuid === 'function' ? statSync(dir).uid === process.getuid() : null;
}

function settingsLayers(home, out, trustProject) {
  const personal = personalDir(home);
  const project = findProjectDir(out, home);
  if (project) {
    const owned = ownedByUser(project);
    if (owned === false) throw new ScaffoldError(`${printable(project)} belongs to another user; a project settings folder must be yours`);
    if (owned === null && !trustProject) {
      throw new ScaffoldError(`cannot check who owns ${printable(project)} on this system; ask the user before passing --trust-project to use the project layer`);
    }
  }
  const layers = [{ layer: 'personal', dir: personal, ...readSettings(personal) }];
  if (project) layers.push({ layer: 'project', dir: project, ...readSettings(project) });
  return { personal, project, layers };
}

function overlays(layers) {
  const found = [];
  for (const l of layers) {
    const src = path.join(l.dir, 'theme.scss');
    if (!lstatSync(src, { throwIfNoEntry: false })) continue;
    refuseLink(src, 'theme.scss');
    if (isFile(src)) found.push({ src, rel: path.join('theme', `${l.layer}.scss`) });
  }
  return found;
}

// The project layer may come from a repository the user did not write: its template and theme.scss
// are used only with --trust-project. Judged by where a file comes from, not by scanning its content;
// a content scan cannot list every way a Quarto document can run code.
function untrustedProjectFiles(tpl, themeFiles, project) {
  const files = themeFiles.filter((f) => project && f.src === path.join(project, 'theme.scss')).map((f) => f.src);
  return tpl.layer === 'project' ? [tpl.dir, ...files] : files;
}

// Everything the deck will contain, computed without writing anything.
// Template settings the scaffold cannot rewrite (issue #46) stop it before anything is written.
const PROFILE_FILE = /^_quarto-[^/\\]+\.ya?ml$/i;   // any letter case, as Quarto finds it on a case-insensitive disk
// A template made by copying a finished deck keeps that deck's name (#53). Quarto 1.10.19 renders nothing for a render
// entry whose file is missing, and exits 0; it renders the deck under any other output-file name. So, after the
// rewrite, the scaffold refuses before writing: a render entry that names neither the deck's main file nor a file or
// folder of the template (a glob is left to Quarto; .. or an absolute path points outside the new deck), an
// output-file for the deck's HTML that is not the deck's own name (talk and talk.html have just been renamed), and,
// in talk.qmd, which is copied as it is, an output-file in any form, or metadata-files or a merge key that could bring
// one in. output-ext changes only the extension and is left alone, as in _quarto.yml. Lines are the template's.
function staleRenderLines(yml, templateLines, copies, mainFile) {
  const keys = copies.map((c) => pathKey(c.rel.split(path.sep).join('/')));
  const has = (v) => {
    const k = pathKey(v).replace(/\/+$/, '');
    return k === pathKey(mainFile) || keys.some((c) => c === k || c.startsWith(`${k}/`));
  };
  // A value as Quarto reads it: ./ and // inside a path do not change it (verify round 1). Outside the deck is checked
  // first, globs included ("../*.qmd" left the deck); a glob inside it is Quarto's; "." is the whole deck.
  const norm = (v) => path.posix.normalize(v.replace(/\\/g, '/'));
  const glob = (v) => /[*?[\]{}!]/.test(v);
  const outside = (v) => path.isAbsolute(v) || path.win32.isAbsolute(v) || norm(v) === '..' || norm(v).startsWith('../');
  const entries = renderEntries(yml);
  const pick = (test) => [...new Set(entries.filter(({ value }) => test(value)).map(({ line }) => line))]
    .map((line) => ({ line, text: templateLines[line - 1] ?? '' }));
  // A render list that names neither the main file, nor ".", nor a glob never renders the deck itself (verify round 1).
  const renderKey = scanSettings(yml).find((f) => f.kind === 'render');
  const covers = (v) => glob(v) || norm(v) === '.' || pathKey(norm(v)) === pathKey(mainFile);
  return {
    outside: pick(outside),
    missing: pick((v) => !outside(v) && !glob(v) && norm(v) !== '.' && !has(norm(v))),
    noMain: entries.length && renderKey && !entries.some(({ value }) => covers(value))
      ? [{ line: renderKey.line, text: templateLines[renderKey.line - 1] ?? '' }] : [],
  };
}

function staleOutputLines(yml, templateLines, stem) {
  const own = new Set([stem, `${stem}.html`].map(pathKey));
  return scanSettings(yml)
    .filter(({ kind, text }) => kind === 'output-file' || (kind === 'output' && /^output-file:/.test(text)))
    .filter(({ text }) => {
      const o = splitComment(text)[0].trimEnd().match(SCANNED_OUTPUT_FILE);   // a comment after the value is not part of it
      return !own.has(pathKey((o?.[1] ?? o?.[2] ?? o?.[3] ?? '').replace(/^\.\//, '')));
    })
    .map(({ line }) => ({ line, text: templateLines[line - 1] ?? '' }));
}

function frontMatterNameLines(text) {
  const setsOutputFile = (t) => /(^|[\s{,])["']?output-file["']?[ \t]*:/.test(t);
  return metadataBlocks(text).flatMap((b) => scanSettings(b.text)
    .filter(({ kind, text: t }) => kind !== 'render' && !(kind === 'output' && !setsOutputFile(t)))
    .map(({ line, text: t }) => ({ line: b.line(line), text: t })));
}

// A profile file and a file metadata-files lists are copied unchanged, so their settings are refused unless they change
// only where the deck is written or its extension (output-dir, output-ext, a project type; verify round 2): an
// output-file under an extension format names the deck's HTML like one under revealjs (verify round 1 of #53).
const placeOnlyAccepted = (l) => l.kind !== 'output' || /^output-file:/.test(l.text);

function refuseUnreadSettings(file, unread, why) {
  if (!unread.length) return;
  const lines = unread.slice(0, 3).map((u) => `line ${u.line} (${show(printable(u.text))})`);
  if (unread.length > 3) lines.push(`and ${unread.length - 3} more`);
  throw new ScaffoldError(`${printable(file)} ${lines.join('; ')} ${why}`);
}

export function planDeck({ out, home, template, title, deckName, trustProject = false }) {
  const stem = deckStem(deckName);
  const problem = nameProblem(stem);
  if (problem) throw new ScaffoldError(`deck name ${show(deckName)} is invalid: ${problem}; use ${NAME_RULE}`);
  const mainFile = `${stem}.qmd`;
  const resolvedOut = path.resolve(out);
  checkOut(resolvedOut);
  const { personal, project, layers } = settingsLayers(home, resolvedOut, trustProject);
  const cli = {};
  if (template !== undefined) cli.template = template;
  const fields = mergeSettings([...layers, { layer: 'command line', settings: cli }]);
  if (title !== undefined) fields.title = { value: title, from: 'command line' };
  const name = fields.template?.value ?? DEFAULT_TEMPLATE;
  const tpl = resolveTemplate(name, { projectDir: project, personalDir: personal, officialDir: OFFICIAL_DIR });
  const warnings = layers.flatMap((l) => l.warnings);
  const themeFiles = overlays(layers);
  // Paths the scaffold writes itself. A template file on one of them, on a folder above one, or on a case
  // or Unicode variant of one would stop the write half-way, so it is skipped before anything is written,
  // and so is a second file whose name differs from an earlier one only in case (#8 verify).
  const generated = [path.join('_theme', 'deck.scss'), path.join('_theme', 'frame.html'), mainFile, ...themeFiles.map((f) => f.rel)].map(pathKey);
  const clashes = (k) => generated.some((g) => g === k || g.startsWith(k + path.sep) || k.startsWith(g + path.sep));
  const copies = [];
  const taken = new Set();
  for (const rel of templateFiles(tpl.dir, warnings)) {
    const k = pathKey(rel);
    if (k === 'talk.qmd' || k === '_quarto.yml') {   // rewritten from the template's own copy below
      if (rel !== k) warnings.push(`ignored the template's own ${rel}; the scaffold reads the template's ${k} itself`);
      continue;
    }
    if (clashes(k)) warnings.push(`ignored the template's own ${rel}; the scaffold writes that path itself`);
    else if (taken.has(k)) warnings.push(`ignored the template's own ${rel}; another file differs from it only in case`);
    else { taken.add(k); copies.push({ src: path.join(tpl.dir, rel), rel }); }
  }
  const untrusted = untrustedProjectFiles(tpl, themeFiles, project);
  if (untrusted.length && !trustProject) {
    throw new ScaffoldError(`these come from the project layer, found by walking up from the deck folder:\n  ${untrusted.map(printable).join('\n  ')}\nRendering a template runs whatever it contains. Show these files to the user and ask the user whether to use them; pass --trust-project only with the user's approval.`);
  }
  warnings.push(...untrusted.map((f) => `using from the project layer (--trust-project): ${f}`));
  const theme = ['default', '_theme/deck.scss', ...themeFiles.map((f) => f.rel.split(path.sep).join('/'))];
  const qmdFile = path.join(tpl.dir, 'talk.qmd');
  const ymlFile = path.join(tpl.dir, '_quarto.yml');
  const templateQmd = readFileSync(qmdFile, 'utf8');
  const qmd = rewriteFrontMatter(templateQmd, {
    title: fields.title?.value, author: fields.author?.value, institute: fields.affiliation?.value, lang: fields.lang?.value,
  }, qmdFile);
  const templateYml = readFileSync(ymlFile, 'utf8').replace(/^\uFEFF/, '');   // a byte order mark is not part of the first key
  refuseUnreadSettings(ymlFile, unreadQuartoLines(templateYml), 'sets project, format, render or output-file in a form the scaffold '
    + 'cannot rewrite; write them in block style in the template\'s _quarto.yml itself, without metadata-files or merge keys, as the official templates do');
  // A file metadata-files lists, and a profile file, are copied unchanged, so one that sets render or output-file would
  // still point at talk.qmd (#46). metadata-files must list files kept beside _quarto.yml, or they cannot be checked.
  for (const { line, names } of metadataFileLists(templateYml)) {
    for (const name of names ?? []) {
      const copy = copies.find((c) => c.rel === name);
      if (!copy) {
        refuseUnreadSettings(ymlFile, [{ line, text: `metadata-files lists ${name}` }], 'but that file is not in the template folder, so '
          + 'the scaffold cannot check it; list only files kept beside _quarto.yml');
      }
      refuseUnreadSettings(copy.src, profileSettingLines(readFileSync(copy.src, 'utf8')).filter(placeOnlyAccepted),
        'sets render or the output name, or may (through metadata-files, a merge key, or a form the scaffold cannot read), but the scaffold rewrites only _quarto.yml; move those settings there');
    }
  }
  // A profile file is copied unchanged, so one that sets render or output-file would still point at talk.qmd (#46).
  for (const { src, rel } of copies.filter((c) => PROFILE_FILE.test(c.rel))) {
    // output-dir, output-ext and an extension format's output-file do not stop the scaffold's rename (verify round 2)
    refuseUnreadSettings(src, profileSettingLines(readFileSync(src, 'utf8')).filter(placeOnlyAccepted),
      'sets render or the output name, or may (through metadata-files, a merge key, or a form the scaffold cannot read), but the scaffold rewrites only _quarto.yml; move those settings there');
  }
  const yml = rewriteQuartoYml(templateYml, { theme, footer: fields.footer?.value, mainFile }, ymlFile);
  // Checked on the template's text with only the renames applied, so line numbers are the template's: a settings layer
  // can add or remove the footer line in the written file (verify round 1 of #53).
  const renamed = renameRenderTarget(templateYml, mainFile);
  const templateLines = templateYml.split(/\r?\n/);
  const staleRender = staleRenderLines(renamed, templateLines, copies, mainFile);
  refuseUnreadSettings(ymlFile, staleRender.outside, 'names a path outside the new deck folder (.. or an absolute path); a deck '
    + 'renders only its own files, so list talk.qmd, which the scaffold renames to the deck\'s main file, files kept in the template, or a glob inside it');
  refuseUnreadSettings(ymlFile, staleRender.missing, 'names a file that is neither talk.qmd nor '
    + 'kept in the template (left from the deck it was copied from?); Quarto renders nothing for it and exits 0. List talk.qmd, '
    + 'which the scaffold renames to the deck\'s main file, files kept in the template, or a glob');
  refuseUnreadSettings(ymlFile, staleRender.noMain, 'lists files to render but not talk.qmd, the deck\'s main file, which would '
    + 'then never be rendered (left from the deck the template was copied from?). Add talk.qmd, which the scaffold renames, or use a glob');
  refuseUnreadSettings(ymlFile, staleOutputLines(renamed, templateLines, stem), 'names the deck\'s HTML after something other than talk '
    + '(left from the deck it was copied from?); the deck would render under that name. Write output-file: talk, which the '
    + 'scaffold renames to the deck\'s name, or remove it');
  // _metadata.yml beside talk.qmd is merged into it and copied unchanged, so it is judged like a profile file (verify
  // round 1 of #53): it may change where the deck is written or its extension, not its name.
  for (const { src } of copies.filter((c) => /^_metadata\.ya?ml$/i.test(c.rel))) {
    refuseUnreadSettings(src, profileSettingLines(readFileSync(src, 'utf8')).filter((l) => l.kind !== 'render').filter(placeOnlyAccepted),
      'sets the output name, or may (through metadata-files, a merge key, or a form the scaffold cannot read); _metadata.yml is copied '
      + 'unchanged, so the deck would render under that name. Remove it, or write output-file: talk in the template\'s _quarto.yml');
  }
  refuseUnreadSettings(qmdFile, frontMatterNameLines(templateQmd.replace(/^\uFEFF/, '')), 'sets the output name in talk.qmd, or may (through metadata-files '
    + 'or a merge key); talk.qmd is copied as it is, so the deck would render under that name. Remove it, or write output-file: '
    + 'talk in the template\'s _quarto.yml, which the scaffold renames');
  // A value that is still talk.qmd (not a name such as w07-talk.qmd that merely ends in it), or output-file talk.
  const leftover = [...yml.matchAll(/(?:^|[\s[,:"']|\.\/)(talk\.qmd)(?=["'\s,\]#]|$)/gim)].some((m) => m[1] !== mainFile)
    || (stem.toLowerCase() !== 'talk' && /output-file:[ \t]*["']?(\.\/)?talk(\.html)?["']?[ \t]*(#|$)/im.test(yml));
  if (leftover) {
    warnings.push(`${path.join(resolvedOut, '_quarto.yml')} still mentions talk.qmd or output-file talk after the rewrite; check that the deck renders ${mainFile}`);
  }
  const files = [
    ...copies,
    { src: OFFICIAL_THEME, rel: path.join('_theme', 'deck.scss') },
    { src: OFFICIAL_FRAME, rel: path.join('_theme', 'frame.html') },
    ...themeFiles,
    { content: qmd, rel: mainFile },
    { content: yml, rel: '_quarto.yml' },
  ];
  return { out: resolvedOut, name, mainFile, tpl, layers, project, fields, theme, warnings, files };
}

export function writeDeck(plan) {
  checkOut(plan.out);
  for (const f of plan.files) {
    const dest = path.join(plan.out, f.rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    if (f.content !== undefined) writeFileSync(dest, f.content, { flag: 'wx' });
    else copyFileSync(f.src, dest, constants.COPYFILE_EXCL);
  }
}

function fieldLine(key, entry) {
  const value = !entry ? "(the template's own)" : entry.value === null ? '(removed)' : show(entry.value);
  return `  ${key.padEnd(12)} ${value.padEnd(32)} ${entry ? `from ${entry.from}` : 'from official'}`;
}

export function report(plan) {
  const lines = [`Main file ${plan.mainFile}`, `Template  ${plan.name}  (${plan.tpl.layer}: ${printable(plan.tpl.dir)})`];
  if (plan.tpl.shadowed.length) lines.push(`          shadows the ${plan.tpl.shadowed.join(' and ')} template of the same name`);
  lines.push('Settings');
  for (const l of plan.layers) lines.push(`  ${l.layer.padEnd(9)} ${printable(path.join(l.dir, 'local.json'))}${existsSync(path.join(l.dir, 'local.json')) ? '' : ' (not found)'}`);
  if (!plan.project) lines.push('  project   (no .claude/.academic-slides/ above the deck folder)');
  lines.push('Fields');
  for (const key of [...FIELDS, 'title']) lines.push(fieldLine(key, plan.fields[key]));
  lines.push(`Theme     ${plan.theme.join(', ')}`);
  // A warning names template files: printable, so a line break in a name cannot forge a line (verify round 2)
  for (const w of plan.warnings) lines.push(`warning: ${printable(w)}`);
  return lines.join('\n');
}

// The same rules as the slide-qa check scripts (#52): --help or -h anywhere asks for the usage; an option given twice,
// a valued option given last, followed by another option (#49), or given a blank value, exits 2 naming the option.
function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const opts = {};
  const valued = { '--out': 'out', '--name': 'name', '--template': 'template', '--title': 'title' };
  const flags = { '--dry-run': 'dryRun', '--list': 'list', '--trust-project': 'trustProject' };
  const given = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf('=');
    if (!valued[a] && !flags[a] && eq > 0 && flags[a.slice(0, eq)]) throw new UsageError(`${a.slice(0, eq)} takes no value (got ${printable(a)})`);
    if (!valued[a] && !flags[a] && eq > 0 && valued[a.slice(0, eq)]) {   // --name=w07: a known option, another form
      throw new UsageError(`${printable(a)}: write the value after a space (${a.slice(0, eq)} ${printable(a.slice(eq + 1))})`);
    }
    if (!valued[a] && !flags[a]) throw new UsageError(`unknown argument ${show(a)}`);
    if (given.has(a)) throw new UsageError(`${a} is given more than once`);
    given.add(a);
    if (flags[a]) { opts[flags[a]] = true; continue; }
    // Followed by another option counts as no value (#49): `--out --dry-run` must not name a folder --dry-run.
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--') || argv[i + 1].trim() === '') throw new UsageError(`${a} needs a value`);
    opts[valued[a]] = argv[++i];
  }
  return opts;
}

class UsageError extends Error {}

function printList(opts, home) {
  const out = path.resolve(opts.out ?? process.cwd());
  const dirs = { projectDir: findProjectDir(out, home), personalDir: personalDir(home), officialDir: OFFICIAL_DIR };
  for (const t of listTemplates(dirs)) {
    const note = t.shadowedBy ? `shadowed by ${t.shadowedBy}` : '';
    console.log(screen(`${t.name.padEnd(18)} ${t.layer.padEnd(9)} ${note.padEnd(20)} ${printable(t.dir)}`));
  }
}

export function main(argv, home = os.homedir()) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error(screen(`${e.message}\n\n${HELP}`));
    return 2;
  }
  if (opts.help) { console.log(screen(HELP)); return 0; }
  try {
    if (opts.list) { printList(opts, home); return 0; }
    if (!opts.out) { console.error(screen(`--out is required\n\n${HELP}`)); return 2; }
    if (opts.name === undefined) { console.error(screen(`--name is required: ${NAME_HINT}\n\n${HELP}`)); return 2; }
    const problem = nameProblem(deckStem(opts.name));
    if (problem) {
      console.error(screen(`--name ${show(opts.name)} is invalid: ${problem}; use ${NAME_RULE}`));
      return 2;
    }
    const plan = planDeck({ out: opts.out, home, template: opts.template, title: opts.title, deckName: opts.name, trustProject: opts.trustProject });
    console.log(screen(report(plan)));
    if (opts.dryRun) {
      console.log(screen(`Dry run: nothing written (${plan.files.length} files would go to ${printable(plan.out)})`));
      return 0;
    }
    writeDeck(plan);
    console.log(screen(`Wrote ${plan.files.length} files to ${printable(plan.out)}\nMain file ${plan.mainFile} (quarto render writes ${plan.mainFile.replace(/\.qmd$/, '.html')})\nNext: cd ${show(plan.out)} && quarto render`));
    return 0;
  } catch (e) {
    console.error(screen(`scaffold: ${e.message}`));
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
