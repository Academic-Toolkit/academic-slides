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
const SETTINGS_DIR = path.join('.claude', '.academic-slides');
const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OFFICIAL_DIR = path.join(SKILL_DIR, 'templates', 'quarto');
const OFFICIAL_THEME = path.join(OFFICIAL_DIR, '_theme', 'deck.scss');

const HELP = `Usage: node scaffold.mjs --out <folder> [--template <name>] [--title <title>] [--dry-run]
       node scaffold.mjs --list [--out <folder>]

Creates a deck folder from a template and the shared theme, merging three settings layers
field by field (project > personal > official):
  personal  ~/.claude/.academic-slides/        local.json, theme.scss, templates/<name>/
  project   nearest .claude/.academic-slides/ above the deck folder (the home folder excluded)
  official  this skill's templates/quarto/<name>/
local.json fields (string, or null to remove): ${FIELDS.join(', ')}

  --out       deck folder to create; must not exist or be empty
  --template  template name (overrides every layer; default ${DEFAULT_TEMPLATE})
  --title     title written into talk.qmd
  --dry-run   print the resolution, write nothing
  --list      list templates with their layer; shadowed ones are marked
  --trust-project  use a template or theme.scss from the project layer. That layer is found by walking
              up from the deck folder, so it may come from a repository you did not write, and
              rendering its template runs whatever the template contains. Read it first.
Nothing read from a settings layer may be a symbolic link that leaves it; settings values are plain
text (no <, {, [, ], or backtick); a project settings folder must belong to you (where ownership
cannot be checked, the whole project layer needs --trust-project).
Exit status: 0 done, 1 refused (settings, template, or folder problem), 2 usage error.`;

export class ScaffoldError extends Error {}

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const show = (v) => JSON.stringify(v);
const isLink = (p) => lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);

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
    if (typeof value === 'string' && /[<{`[\]]/.test(value)) {
      throw new ScaffoldError(`${file}: field ${show(key)} contains <, {, [, ], or a backtick; settings values are plain text (no HTML, links, images, Quarto shortcodes, or code)`);
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
export function rewriteFrontMatter(text, edits) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) throw new ScaffoldError('talk.qmd has no front matter block at the top');
  const lines = m[1].split(/\r?\n/);
  for (const [key, value] of Object.entries(edits)) {
    if (value === undefined) continue;
    const i = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (i >= 0 && continues(lines[i + 1])) throw new ScaffoldError(`talk.qmd: front-matter field ${show(key)} must be on one line`);
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

export function rewriteQuartoYml(text, { theme, footer }) {
  const themeLine = /^([ \t]*)theme:[ \t]*(\S.*)?$/m;
  const t = text.match(themeLine);
  if (!t) throw new ScaffoldError('_quarto.yml has no theme: line');
  if (!t[2]) throw new ScaffoldError('_quarto.yml: theme must be a one-line list such as [default, _theme/deck.scss]');
  let out = text.replace(themeLine, (_, indent) => `${indent}theme: [${theme.join(', ')}]`);
  if (footer === undefined) return out;
  const footerLine = /^([ \t]*)footer:.*$/m;
  if (footer === null) return out.replace(/^[ \t]*footer:.*(\r?\n)?/m, '');
  if (footerLine.test(out)) return out.replace(footerLine, (_, indent) => `${indent}footer: ${show(footer)}`);
  return out.replace(themeLine, (line, indent) => `${line}\n${indent}footer: ${show(footer)}`);
}

// Template files to copy: everything except symbolic links, a top-level _theme/, and any deck.scss.
function templateFiles(dir, warnings, rel = '') {
  const files = [];
  for (const entry of readdirSync(path.join(dir, rel)).sort()) {
    const relPath = path.join(rel, entry);
    const full = path.join(dir, relPath);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) {
      warnings.push(`skipped symbolic link ${relPath} in the template`);
    } else if (st.isDirectory()) {
      if (rel === '' && entry === '_theme') warnings.push(`ignored the template's own _theme/; the shared theme is used`);
      else files.push(...templateFiles(dir, warnings, relPath));
    } else if (entry === 'deck.scss') {
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
      throw new ScaffoldError(`cannot check who owns ${project} on this system; read it, then pass --trust-project to use the project layer`);
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
export function planDeck({ out, home, template, title, trustProject = false }) {
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
  const copies = templateFiles(tpl.dir, warnings).map((rel) => ({ src: path.join(tpl.dir, rel), rel }));
  const themeFiles = overlays(layers);
  const untrusted = untrustedProjectFiles(tpl, themeFiles, project);
  if (untrusted.length && !trustProject) {
    throw new ScaffoldError(`these come from the project layer, found by walking up from the deck folder:\n  ${untrusted.join('\n  ')}\nRendering a template runs whatever it contains. Read them, then pass --trust-project to use them.`);
  }
  warnings.push(...untrusted.map((f) => `using from the project layer (--trust-project): ${f}`));
  const theme = ['default', '_theme/deck.scss', ...themeFiles.map((f) => f.rel.split(path.sep).join('/'))];
  const qmd = rewriteFrontMatter(readFileSync(path.join(tpl.dir, 'talk.qmd'), 'utf8'), {
    title: fields.title?.value, author: fields.author?.value, institute: fields.affiliation?.value, lang: fields.lang?.value,
  });
  const yml = rewriteQuartoYml(readFileSync(path.join(tpl.dir, '_quarto.yml'), 'utf8'), { theme, footer: fields.footer?.value });
  const files = [
    ...copies.filter((c) => c.rel !== 'talk.qmd' && c.rel !== '_quarto.yml'),
    { src: OFFICIAL_THEME, rel: path.join('_theme', 'deck.scss') },
    ...themeFiles,
    { content: qmd, rel: 'talk.qmd' },
    { content: yml, rel: '_quarto.yml' },
  ];
  return { out: resolvedOut, name, tpl, layers, project, fields, theme, warnings, files };
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
  const lines = [`Template  ${plan.name}  (${plan.tpl.layer}: ${plan.tpl.dir})`];
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
  const valued = { '--out': 'out', '--template': 'template', '--title': 'title' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--trust-project') opts.trustProject = true;
    else if (valued[a]) {
      if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`);
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
    const plan = planDeck({ out: opts.out, home, template: opts.template, title: opts.title, trustProject: opts.trustProject });
    console.log(report(plan));
    if (opts.dryRun) {
      console.log(`Dry run: nothing written (${plan.files.length} files would go to ${plan.out})`);
      return 0;
    }
    writeDeck(plan);
    console.log(`Wrote ${plan.files.length} files to ${plan.out}\nNext: cd ${show(plan.out)} && quarto render`);
    return 0;
  } catch (e) {
    console.error(`scaffold: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
