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
Exit status: 0 done, 1 refused (settings, template, or folder problem), 2 usage error.`;

export class ScaffoldError extends Error {}

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const show = (v) => JSON.stringify(v);
const isLink = (p) => lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
// How a file system that ignores case and Unicode form sees a path (the macOS default): two names with
// the same key are the same file there, so collision checks compare keys, not raw names (#8 verify).
const pathKey = (p) => p.normalize('NFC').toLowerCase();
const LANG = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/;

// A file read from a settings layer is never followed through a symbolic link: a cloned project could
// otherwise point talk.qmd or theme.scss at a private file and have it copied into the new deck.
function refuseLink(p, what) {
  if (isLink(p)) throw new ScaffoldError(`${p} is a symbolic link; ${what} is never read through a link`);
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
    throw new ScaffoldError(`${file}: not valid JSON (${e.message})`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new ScaffoldError(`${file}: must be a JSON object`);
  const settings = {};
  const warnings = [];
  for (const [key, value] of Object.entries(data)) {
    if (!FIELDS.includes(key)) {
      warnings.push(`${file}: unknown field ${show(key)} ignored (known fields: ${FIELDS.join(', ')})`);
      continue;
    }
    if (value !== null && typeof value !== 'string') throw new ScaffoldError(`${file}: field ${show(key)} must be a string or null`);
    // Quarto reads these values as markdown: brackets would allow links and images (which fetch a
    // remote address when the deck is opened), <, {, and backticks HTML, shortcodes, spans, and code.
    // & and the backslash are refused too: Pandoc decodes character references (&#123; is "{") and
    // backslash escapes after this check has run, so they would rebuild any refused character (#8).
    if (typeof value === 'string' && /[<{`[\]&\\\u0000-\u001f\u007f]/.test(value)) {
      throw new ScaffoldError(`${file}: field ${show(key)} contains <, {, [, ], &, a backslash, a backtick, or a control character; settings values are plain text (no HTML, character references, links, images, Quarto shortcodes, or code)`);
    }
    // Quarto looks lang up as a file name (_language-<lang>.yml), so it must be a language tag, not a path
    if (key === 'lang' && typeof value === 'string' && !LANG.test(value)) {
      throw new ScaffoldError(`${file}: field "lang" must be a language tag such as en or zh-TW, not ${show(value)}`);
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
    throw new ScaffoldError(`template folder ${chosen.dir} resolves outside ${layerRoot} through a symbolic link`);
  }
  for (const required of ['talk.qmd', '_quarto.yml']) {
    refuseLink(path.join(chosen.dir, required), `a template's ${required}`);
    if (!isFile(path.join(chosen.dir, required))) throw new ScaffoldError(`template folder ${chosen.dir} has no ${required}`);
  }
  return { ...chosen, shadowed: rest.map((c) => c.layer) };
}

function continues(next) {
  return next !== undefined && /^(\s|-)/.test(next);
}

// Replace, remove (null), or add single-line `key: value` fields in the front matter.
export function rewriteFrontMatter(text, edits, where = 'talk.qmd') {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) throw new ScaffoldError(`${where} has no front matter block at the top`);
  const lines = m[1].split(/\r?\n/);
  for (const [key, value] of Object.entries(edits)) {
    if (value === undefined) continue;
    const i = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (i >= 0 && continues(lines[i + 1])) throw new ScaffoldError(`${where}: front-matter field ${show(key)} must be on one line`);
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
  if (!t) throw new ScaffoldError(`${where} has no theme: line`);
  if (!t[2]) throw new ScaffoldError(`${where}: theme must be a one-line list such as [default, _theme/deck.scss]`);
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
// at the top level or under format: revealjs:, becomes <name> or <name>.html.
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
const WHOLE_TALK = /(^|[[,:]|-[ \t])([ \t]*)(["']?)(\.\/)?talk\.qmd\3(?=[ \t]*(?:,|\]|$))/gi;
export function renameRenderTarget(text, mainFile) {
  const stem = mainFile.replace(/\.qmd$/, '');
  let top = null;            // the current top-level key
  let childIndent = -1;      // indent of that key's direct children
  let renderIndent = -1;     // indent of project.render while inside its value
  let fmtIndent = -1;        // indent of format.revealjs while inside it
  return text.split(/(?<=\n)/).map((line) => {
    const nl = line.match(/\r?\n$/)?.[0] ?? '';
    const [code, comment] = splitComment(line.slice(0, line.length - nl.length));
    if (/^\s*$/.test(code)) return line;
    const indent = code.match(/^[ \t]*/)[0].length;
    if (indent === 0) { top = code.match(/^([^:\s]+):/)?.[1] ?? null; childIndent = -1; renderIndent = -1; fmtIndent = -1; }
    else {
      if (childIndent < 0) childIndent = indent;
      if (indent <= childIndent && !(renderIndent === indent && /^\s*-/.test(code))) { renderIndent = -1; if (indent < childIndent || !/^\s*revealjs:/.test(code)) fmtIndent = -1; }
      if (top === 'project' && indent === childIndent && /^\s*render:/.test(code)) renderIndent = indent;
      if (top === 'format' && indent === childIndent && /^\s*revealjs:/.test(code)) fmtIndent = indent;
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
// Every line that writes these settings another way is returned as { line, text }, so the caller refuses instead
// of guessing: one of those keys quoted, with a space before the colon, inside a flow mapping, or after a list
// dash; such a key's value given as a flow mapping, an anchor, an alias, a tag, or a block scalar; a merge key
// (<<) or metadata-files anywhere; and in project.render or the output-file the scanner uses, an anchor, alias
// or tag, a quoted value holding a comma, or an escape. The same code is in slide-qa's _lib.mjs;
// tests/quarto-settings.test.mjs checks that the two agree.
const SCANNED_KEYS = ['project', 'format', 'revealjs', 'render', 'output-file'];
const KEY_MENTION = /(^|[\s{,[])(project|format|revealjs|render|output-file|metadata-files)([ \t]*):(?=[ \t]|$)/g;
const MERGE_KEY = /(^|[\s{,[-])<<[ \t]*:/;
const SCANNED_OUTPUT_FILE = /^[ \t]*output-file:[ \t]*(?:"([^"]*)"|'([^']*)'|(\S+))[ \t]*$/;

// The line with every quoted string replaced by "", the quoted keys (a quoted string followed by a colon), and the
// other quoted strings with their quote character.
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
    if (/^[ \t]*:(?=[ \t]|$)/.test(code.slice(j + 1))) keys.push(body); else values.push({ q, body });
    masked += '""';
    i = j;
  }
  return { masked, keys, values };
}

export function unreadQuartoLines(yml) {
  const unread = [];
  let top = null; let childIndent = -1; let renderIndent = -1; let fmtIndent = -1;
  yml.split(/\r?\n/).forEach((raw, n) => {
    const [code] = splitComment(raw);
    if (/^\s*$/.test(code)) return;
    const { masked, keys, values } = maskQuoted(code);
    const indent = code.match(/^[ \t]*/)[0].length;
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
    let bad = keys.some((k) => SCANNED_KEYS.includes(k) || k === 'metadata-files') || MERGE_KEY.test(masked)
      || [...masked.matchAll(KEY_MENTION)].some((m) => m[2] === 'metadata-files' || m[3] !== '' || m.index + m[1].length !== indent);
    if (['project', 'format', 'revealjs'].includes(key) && /^[{[&*!|>]/.test(value)) bad = true;
    if (renderIndent >= 0) {
      const text = key === 'render' && indent === renderIndent ? value : masked.trim().replace(/^-[ \t]*/, '');
      if (/(^|[\s,[])[&*!|>{]/.test(text)) bad = true;
      if (values.some((v) => v.body.includes(',') || (v.q === '"' && v.body.includes('\\')) || (v.q === "'" && v.body.includes("''")))) bad = true;
    }
    if (key === 'output-file' && (indent === 0 || (fmtIndent >= 0 && indent > fmtIndent))) {
      const o = code.match(SCANNED_OUTPUT_FILE);
      if (!o || /^[&*!|>{[]/.test(o[3] ?? '') || (o[1] ?? '').includes('\\')) bad = true;
    }
    if (bad) unread.push({ line: n + 1, text: raw.trim() });
  });
  return unread;
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
  if (!statSync(out).isDirectory()) throw new ScaffoldError(`${out} is a file, not a folder`);
  if (readdirSync(out).length) throw new ScaffoldError(`${out} is not empty; choose a new folder (existing decks are never overwritten)`);
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
    if (owned === false) throw new ScaffoldError(`${project} belongs to another user; a project settings folder must be yours`);
    if (owned === null && !trustProject) {
      throw new ScaffoldError(`cannot check who owns ${project} on this system; ask the user before passing --trust-project to use the project layer`);
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
const PROFILE_FILE = /^_quarto-[^/\\]+\.ya?ml$/;
const SETS_DECK_FILES = /(^|[\s{,[])["']?(render|output-file)["']?[ \t]*:/;
function refuseUnreadSettings(file, unread, why) {
  if (!unread.length) return;
  const lines = unread.slice(0, 3).map((u) => `line ${u.line} (${show(u.text)})`);
  if (unread.length > 3) lines.push(`and ${unread.length - 3} more`);
  throw new ScaffoldError(`${file} ${lines.join('; ')} ${why}`);
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
    throw new ScaffoldError(`these come from the project layer, found by walking up from the deck folder:\n  ${untrusted.join('\n  ')}\nRendering a template runs whatever it contains. Show these files to the user and ask the user whether to use them; pass --trust-project only with the user's approval.`);
  }
  warnings.push(...untrusted.map((f) => `using from the project layer (--trust-project): ${f}`));
  const theme = ['default', '_theme/deck.scss', ...themeFiles.map((f) => f.rel.split(path.sep).join('/'))];
  const qmdFile = path.join(tpl.dir, 'talk.qmd');
  const ymlFile = path.join(tpl.dir, '_quarto.yml');
  const qmd = rewriteFrontMatter(readFileSync(qmdFile, 'utf8'), {
    title: fields.title?.value, author: fields.author?.value, institute: fields.affiliation?.value, lang: fields.lang?.value,
  }, qmdFile);
  const templateYml = readFileSync(ymlFile, 'utf8');
  refuseUnreadSettings(ymlFile, unreadQuartoLines(templateYml), 'sets project, format, render or output-file in a form the scaffold '
    + 'cannot rewrite; write these settings in block style, as the official templates do');
  // A profile file is copied unchanged, so one that sets render or output-file would still point at talk.qmd (#46).
  for (const { src, rel } of copies.filter((c) => PROFILE_FILE.test(c.rel))) {
    const lines = readFileSync(src, 'utf8').split(/\r?\n/)
      .flatMap((raw, n) => (SETS_DECK_FILES.test(splitComment(raw)[0]) ? [{ line: n + 1, text: raw.trim() }] : []));
    refuseUnreadSettings(src, lines, `sets render or output-file, but the scaffold rewrites only _quarto.yml; move those settings there`);
  }
  const yml = rewriteQuartoYml(templateYml, { theme, footer: fields.footer?.value, mainFile }, ymlFile);
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
  const lines = [`Main file ${plan.mainFile}`, `Template  ${plan.name}  (${plan.tpl.layer}: ${plan.tpl.dir})`];
  if (plan.tpl.shadowed.length) lines.push(`          shadows the ${plan.tpl.shadowed.join(' and ')} template of the same name`);
  lines.push('Settings');
  for (const l of plan.layers) lines.push(`  ${l.layer.padEnd(9)} ${path.join(l.dir, 'local.json')}${existsSync(path.join(l.dir, 'local.json')) ? '' : ' (not found)'}`);
  if (!plan.project) lines.push('  project   (no .claude/.academic-slides/ above the deck folder)');
  lines.push('Fields');
  for (const key of [...FIELDS, 'title']) lines.push(fieldLine(key, plan.fields[key]));
  lines.push(`Theme     ${plan.theme.join(', ')}`);
  for (const w of plan.warnings) lines.push(`warning: ${w}`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = {};
  const valued = { '--out': 'out', '--name': 'name', '--template': 'template', '--title': 'title' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--trust-project') opts.trustProject = true;
    else if (valued[a]) {
      // Followed by another option counts as no value (#49): `--out --dry-run` must not name a folder --dry-run.
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new UsageError(`${a} needs a value`);
      opts[valued[a]] = argv[++i];
    } else throw new UsageError(`unknown argument ${show(a)}`);
  }
  return opts;
}

class UsageError extends Error {}

function printList(opts, home) {
  const out = path.resolve(opts.out ?? process.cwd());
  const dirs = { projectDir: findProjectDir(out, home), personalDir: personalDir(home), officialDir: OFFICIAL_DIR };
  for (const t of listTemplates(dirs)) {
    const note = t.shadowedBy ? `shadowed by ${t.shadowedBy}` : '';
    console.log(`${t.name.padEnd(18)} ${t.layer.padEnd(9)} ${note.padEnd(20)} ${t.dir}`);
  }
}

export function main(argv, home = os.homedir()) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error(`${e.message}\n\n${HELP}`);
    return 2;
  }
  if (opts.help) { console.log(HELP); return 0; }
  try {
    if (opts.list) { printList(opts, home); return 0; }
    if (!opts.out) { console.error(`--out is required\n\n${HELP}`); return 2; }
    if (opts.name === undefined) { console.error(`--name is required: ${NAME_HINT}\n\n${HELP}`); return 2; }
    const problem = nameProblem(deckStem(opts.name));
    if (problem) {
      console.error(`--name ${show(opts.name)} is invalid: ${problem}; use ${NAME_RULE}`);
      return 2;
    }
    const plan = planDeck({ out: opts.out, home, template: opts.template, title: opts.title, deckName: opts.name, trustProject: opts.trustProject });
    console.log(report(plan));
    if (opts.dryRun) {
      console.log(`Dry run: nothing written (${plan.files.length} files would go to ${plan.out})`);
      return 0;
    }
    writeDeck(plan);
    console.log(`Wrote ${plan.files.length} files to ${plan.out}\nMain file ${plan.mainFile} (quarto render writes ${plan.mainFile.replace(/\.qmd$/, '.html')})\nNext: cd ${show(plan.out)} && quarto render`);
    return 0;
  } catch (e) {
    console.error(`scaffold: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
