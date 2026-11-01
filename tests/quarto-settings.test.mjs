// Tests for _quarto.yml forms the line scanners do not read (issue #46). The slide-qa scripts and the scaffold read
// project.render and output-file only in block style, as the templates write them; any other form is refused
// instead of guessed: the slide-qa scripts exit 2 when no file option is given, and the scaffold refuses a
// template with status 1 before writing anything. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QA = path.join(ROOT, 'plugins/academic-slides/skills/slide-qa/scripts');
const SKILL = path.join(ROOT, 'plugins/academic-slides/skills/slide-deck-scaffold');
const SCAFFOLD = path.join(SKILL, 'scripts/scaffold.mjs');
const lib = await import(path.join(QA, '_lib.mjs'));
const scaffold = await import(SCAFFOLD);

const QMD = '---\ntitle: "T"\n---\n\n## A slide\n\nShort body text.\n';

// Forms the scanners do not read, with the line that must be reported.
const UNREAD = {
  'flow mapping for project': ['project: {render: [deck.qmd]}', 1],
  'flow mapping for format': ['format: {revealjs: {output-file: slides}}', 1],
  'flow mapping over several lines': ['project: {\n  render: [deck.qmd]\n}', 1],
  'quoted top-level key': ['"project":\n  render: [deck.qmd]', 1],
  'quoted render key': ['project:\n  "render": [deck.qmd]', 2],
  'quoted revealjs key': ["format:\n  'revealjs':\n    output-file: slides", 2],
  'space before the colon': ['project :\n  render: [deck.qmd]', 1],
  'anchor on render': ['project:\n  render: &targets [deck.qmd]', 2],
  'alias for render': ['targets: &t [deck.qmd]\nproject:\n  render: *t', 3],
  'alias in a block list': ['project:\n  render:\n    - *t', 3],
  'anchor on project': ['project: &p\n  render: [deck.qmd]', 1],
  'comma in a quoted flow value': ['project:\n  render: ["deck.qmd, notes.txt"]', 2],
  'comma in a quoted block item': ['project:\n  render:\n    - "deck, notes.qmd"', 3],
  'escape in a quoted render value': ['project:\n  render:\n    - "dec\\u006b.qmd"', 3],
  'merge key': ['format:\n  revealjs:\n    <<: *base', 3],
  'metadata-files': ['metadata-files: [extra.yml]', 1],
  'output-file with a space, unquoted': ['format:\n  revealjs:\n    output-file: my slides', 3],
  'output-file as an alias': ['output-file: *name', 1],
  'escape in output-file': ['format:\n  revealjs:\n    output-file: "slid\\u0065s"', 3],
  'render after a list dash': ['project:\n  - render: [deck.qmd]', 2],
  'tag on format': ['format: !custom\n  revealjs:\n    output-file: slides', 1],
};

// Forms that are read, or deliberately not used, and must not be refused.
const READ = {
  'block render list': 'project:\n  type: default\n  render:\n    - deck.qmd',
  'flow render list, quoted values and ./': "project:\n  render: ['./deck.qmd', \"b.qmd\"]",
  'flow render list over several lines': 'project:\n  render: [\n    deck.qmd,\n    b.qmd\n  ]',
  'another format\'s output-file': 'format:\n  pdf:\n    output-file: handout\n  revealjs:\n    theme: default',
  'a deeper render key': 'project:\n  preview:\n    render: deck.qmd',
  'pre-render and post-render': 'project:\n  pre-render: prepare.sh\n  post-render: [finish.sh]',
  'key-like text in a quoted value': 'title: "the project: render: a demo"\nsubtitle: \'format: x\'',
  'format as one word': 'format: revealjs',
  'top-level output-file, quoted': 'output-file: "slides.html"',
  'a comment that mentions the keys': '# project: {render: [x.qmd]}\nformat:  # format: {revealjs: x}\n  revealjs:\n    output-file: slides  # <<: *base',
  'an unquoted comma in a flow list': 'project:\n  render: [a.qmd, b.qmd]',
};

// ---------- the detector ----------

for (const [name, [yml, line]] of Object.entries(UNREAD)) {
  test(`unreadQuartoLines reports ${name}`, () => {
    const lines = lib.unreadQuartoLines(yml).map((u) => u.line);
    assert.ok(lines.includes(line), `${name}: expected line ${line}, got ${JSON.stringify(lines)}`);
  });
}

for (const [name, yml] of Object.entries(READ)) {
  test(`unreadQuartoLines accepts ${name}`, () => {
    assert.deepEqual(lib.unreadQuartoLines(yml), [], name);
  });
}

test('unreadQuartoLines accepts the four official templates and the beamer-free layout of every template', () => {
  const dir = path.join(SKILL, 'templates/quarto');
  const names = readdirSync(dir).filter((n) => existsSync(path.join(dir, n, '_quarto.yml')));
  assert.ok(names.length >= 4, `templates found: ${names}`);
  for (const n of names) assert.deepEqual(lib.unreadQuartoLines(readFileSync(path.join(dir, n, '_quarto.yml'), 'utf8')), [], n);
});

test('unreadQuartoLines gives the line and its text', () => {
  assert.deepEqual(lib.unreadQuartoLines('# settings\nproject: {render: [deck.qmd]}  # flow'), [
    { line: 2, text: 'project: {render: [deck.qmd]}  # flow' },
  ]);
});

test('the scaffold and slide-qa detectors agree on every form', () => {
  const all = [...Object.values(UNREAD).map(([yml]) => yml), ...Object.values(READ)];
  for (const yml of all) assert.deepEqual(scaffold.unreadQuartoLines(yml), lib.unreadQuartoLines(yml), yml);
});

// ---------- slide-qa ----------

function folder(files) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'quarto-settings-test-')));
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  return dir;
}

function runQa(dir, script, args = []) {
  const r = spawnSync(process.execPath, [path.join(QA, script), ...args], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('chooseDeckFile refuses settings it cannot read, naming the file and the line', () => {
  const dir = folder({ 'deck.qmd': QMD, 'deck.html': '<html></html>', 'slides.html': '<html></html>', '_quarto.yml': 'format: {revealjs: {output-file: slides}}\n' });
  const r = lib.chooseDeckFile('.html', { dir });
  assert.equal(r.reason, 'unread');
  assert.deepEqual(r.unread.map((u) => [u.file, u.line]), [['_quarto.yml', 1]]);
});

test('a slide-qa script without its file option exits 2 on settings it cannot read, and names the line', () => {
  const dir = folder({ 'deck.qmd': QMD, '_quarto.yml': 'project: {render: [deck.qmd]}\n' });
  const r = runQa(dir, 'check-density.mjs');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /_quarto\.yml line 1/);
  assert.match(r.out, /--qmd/);
});

test('the file option is used as given even when the settings cannot be read', () => {
  const dir = folder({ 'deck.qmd': QMD, '_quarto.yml': 'project: {render: [deck.qmd]}\n' });
  const r = runQa(dir, 'check-density.mjs', ['--qmd', 'deck.qmd']);
  assert.equal(r.code, 0, r.out);
});

test('_quarto.yaml is read when there is no _quarto.yml, as Quarto does', () => {
  const dir = folder({ 'a.qmd': QMD, 'b.qmd': QMD, '_quarto.yaml': 'project:\n  render: [b.qmd]\n' });
  assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'b.qmd' });
  assert.equal(runQa(dir, 'check-density.mjs').code, 0);
});

test('_quarto.yml wins over _quarto.yaml, as in Quarto', () => {
  const dir = folder({ 'a.qmd': QMD, 'b.qmd': QMD, '_quarto.yml': 'project:\n  render: [a.qmd]\n', '_quarto.yaml': 'project:\n  render: [b.qmd]\n' });
  assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'a.qmd' });
});

test('a profile file that sets render or output-file is refused: which profile was active is unknown', () => {
  const dir = folder({ 'deck.qmd': QMD, 'deck.html': '<html></html>', '_quarto.yml': 'project:\n  render: [deck.qmd]\n', '_quarto-print.yml': 'format:\n  revealjs:\n    output-file: print\n' });
  const r = lib.chooseDeckFile('.html', { dir });
  assert.equal(r.reason, 'unread');
  assert.deepEqual(r.unread.map((u) => [u.file, u.line]), [['_quarto-print.yml', 3]]);
  const cli = runQa(dir, 'check-mathjax.mjs');
  assert.equal(cli.code, 2, cli.out);
  assert.match(cli.out, /_quarto-print\.yml line 3/);
});

test('a profile file that sets neither is not a reason to refuse', () => {
  const dir = folder({ 'deck.qmd': QMD, '_quarto.yml': 'project:\n  render: [deck.qmd]\n', '_quarto-dark.yml': 'format:\n  revealjs:\n    theme: dark\n' });
  assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'deck.qmd' });
});

// ---------- scaffold ----------

function sandbox() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'quarto-settings-scaffold-')));
  const home = path.join(base, 'home');
  const project = path.join(home, 'work', 'project');
  mkdirSync(project, { recursive: true });
  return { home, project, templates: path.join(home, '.claude', '.academic-slides', 'templates') };
}

function personalTemplate(s, name, yml, extra = {}) {
  const dir = path.join(s.templates, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'talk.qmd'), '---\ntitle: "T"\nlang: en\n---\n\n## Slide\n\nBody\n');
  writeFileSync(path.join(dir, '_quarto.yml'), yml);
  for (const [file, content] of Object.entries(extra)) writeFileSync(path.join(dir, file), content);
}

function runScaffold(s, args) {
  const r = spawnSync(process.execPath, [SCAFFOLD, ...args], { cwd: s.project, env: { ...process.env, HOME: s.home }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const THEME = 'format:\n  revealjs:\n    theme: [default, _theme/deck.scss]\n    footer: "Venue"\n';

test('the scaffold refuses a template whose _quarto.yml it cannot rewrite, before writing anything', () => {
  const s = sandbox();
  personalTemplate(s, 'flowy', `project: {type: default, render: [talk.qmd]}\n${THEME}`);
  const r = runScaffold(s, ['--template', 'flowy', '--name', 'w07', '--out', 'deck']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /line 1/);
  assert.match(r.out, /block style/);
  assert.equal(existsSync(path.join(s.project, 'deck')), false);
});

test('the scaffold refuses a template profile file that sets render or output-file', () => {
  const s = sandbox();
  personalTemplate(s, 'profiled', `project:\n  render: [talk.qmd]\n${THEME}`, { '_quarto-print.yml': 'project:\n  render: [talk.qmd]\n' });
  const r = runScaffold(s, ['--template', 'profiled', '--name', 'w07', '--out', 'deck']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /_quarto-print\.yml line 2/);
  assert.equal(existsSync(path.join(s.project, 'deck')), false);
});

test('the scaffold still writes a block-style personal template', () => {
  const s = sandbox();
  personalTemplate(s, 'blocky', `project:\n  render:\n    - talk.qmd\n${THEME}`, { '_quarto-dark.yml': 'format:\n  revealjs:\n    theme: dark\n' });
  const r = runScaffold(s, ['--template', 'blocky', '--name', 'w07', '--out', 'deck']);
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(path.join(s.project, 'deck', '_quarto.yml'), 'utf8'), /- w07\.qmd/);
});
