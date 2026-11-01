// Tests for _quarto.yml forms the line scanners do not read (issue #46). The slide-qa scripts and the scaffold read
// project.render and output-file only in block style, as the templates write them; any other form is refused
// instead of guessed: the slide-qa scripts exit 2 when no file option is given, and the scaffold refuses a
// template with status 1 before writing anything. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, realpathSync, symlinkSync } from 'node:fs';
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
  'output-file with a space, unquoted': ['format:\n  revealjs:\n    output-file: my slides', 3],
  'output-file as an alias': ['output-file: *name', 1],
  'escape in output-file': ['format:\n  revealjs:\n    output-file: "slid\\u0065s"', 3],
  'render after a list dash': ['project:\n  - render: [deck.qmd]', 2],
  'tag on format': ['format: !custom\n  revealjs:\n    output-file: slides', 1],
  // verify round 1 (Codex): compact JSON-style YAML and a flow mapping at the root
  'compact JSON-style mapping': ['{"project":{"render":["deck.qmd"]}}', 1],
  'flow mapping at the root': ['{project: {render: [deck.qmd]}}', 1],
  'quoted key followed directly by its value': ['project:\n  "render":["deck.qmd"]', 2],
  'unquoted key followed directly by a flow value': ['format:\n  revealjs:{output-file: slides}', 2],
  // verify round 1 (requirements): an unquoted comma outside a flow list is part of one value, which the scanner splits
  'unquoted comma in a block list item': ['project:\n  render:\n    - my, talk.qmd', 3],
  'unquoted comma in a single render value': ['project:\n  render: my, talk.qmd', 2],
  // verify round 1 (logic)
  'escaped quote in a single-quoted output-file': ["output-file: 'it''s'", 1],
  'escaped quote in a double-quoted output-file': ['output-file: "a\\"b"', 1],
  'an explicit key': ['project:\n  ? render\n  : [deck.qmd]', 2],
  'a second YAML document': ['project:\n  render: [a.qmd]\n---\nproject:\n  render: [b.qmd]', 3],
  'a flow mapping inside a render list': ['project:\n  render: [{x: deck.qmd}]', 2],
  'metadata-files as a flow list over several lines': ['metadata-files: [\n  a.yml\n]', 1],
  'metadata-files with an alias': ['metadata-files: *shared', 1],
  'metadata-files as a quoted key': ['"metadata-files": [a.yml]', 1],
  // verify round 1 (Devil's Advocate): a value continued on the next line is one value to YAML, two to the scanner
  'multi-line plain render item': ['project:\n  render:\n    - my\n      talk.qmd', 4],
  'multi-line plain render value': ['project:\n  render: my\n    talk.qmd', 3],
  'multi-line quoted render item': ['project:\n  render:\n    - "my\n      talk.qmd"', 3],
  'multi-line plain output-file': ['format:\n  revealjs:\n    output-file: my\n      slides', 4],
  // verify round 2 (Codex)
  'content after the document end marker': ['project:\n  render: [a.qmd]\n...\nproject:\n  render: [b.qmd]', 4],
  'a multi-line flow mapping for format': ['format: {\n  revealjs: {theme: x}\n}', 1],
  // verify round 2 (adversarial)
  'a plain scalar continued inside a flow list': ['project:\n  render: [\n    my\n    talk.qmd\n  ]', 4],
  "a flow list continued at the key's indent": ['project:\n  render: [a.qmd,\n  b.qmd]', 3],
  'output-file deeper under revealjs': ['format:\n  revealjs:\n    foo:\n      output-file: x', 4],
  'a null output-file': ['output-file: ~', 1],
  // verify round 3 (adversarial, row 5): a double-quoted key with an escape could be any key
  'a quoted key with an escape': ['"output\\u002dfile": slides', 1],
  'a quoted render key with an escape in a flow mapping': ['project: {"ren\\u0064er": [b.qmd]}', 1],
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
  // verify round 1 (Codex): text inside block scalars is not settings; a quoted output-file is read whole
  'a literal block scalar that quotes settings': 'description: |\n  project: {render: [example.qmd]}\n  <<: *base\n  metadata-files: [x.yml]\nproject:\n  render: [deck.qmd]',
  'a folded block scalar with indicators': 'abstract: >-\n  format: {revealjs: {output-file: x}}\n\n  "render": [y.qmd]\nformat:\n  revealjs:\n    output-file: slides',
  'a block scalar in a list item': 'notes:\n  - |\n    project: {render: [z.qmd]}\nproject:\n  render: [deck.qmd]',
  'a quoted output-file holding a comma': 'output-file: "slides, final"',
  // verify round 1 (logic, regression): forms that were refused wrongly
  'an ampersand in a render value': 'project:\n  render:\n    - Q & A.qmd',
  'an empty revealjs mapping': 'format:\n  revealjs: {}',
  'a flow mapping under another key named format': 'website:\n  format: {a: b}',
  'metadata-files as a flow list': 'metadata-files: [shared.yml, "authors.yml"]',
  'metadata-files as a block list': 'metadata-files:\n  - shared.yml\n  - authors.yml',
  'a document marker at the top': '---\nproject:\n  render: [deck.qmd]',
  // verify round 1 (Devil's Advocate): a byte order mark before the first key
  'a UTF-8 byte order mark': '\ufeffproject:\n  render: [deck.qmd]',
  // verify round 2 (Codex): a document end marker, and one-line flow mappings that name nothing the scanner reads
  'a document end marker': 'project:\n  render: [deck.qmd]\n...',
  'a one-line flow mapping for format without an output name': 'format: {pdf: default, revealjs: {incremental: true}}',
  'a one-line flow mapping for project without render': 'project: {type: default}',
  // verify round 3 (Codex N3): the comma that ends an item may start the next line
  'a null project type': 'project:\n  type: ~',
  'a flow list with the comma at the start of the next line': 'project:\n  render: [\n    a.qmd\n    , b.qmd\n  ]',
  // verify round 2 (adversarial)
  'an anchored block scalar under revealjs': 'format:\n  revealjs:\n    output-file: slides\n    notes: &n |\n      output-file: wrong',
  'output-ext under another format': 'format:\n  pdf:\n    output-ext: tex',
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
    { line: 2, text: 'project: {render: [deck.qmd]}  # flow', outputOnly: false },
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

test('a profile file that mentions render only inside a quoted value or a block scalar is not refused', () => {
  const dir = folder({ 'deck.qmd': QMD, '_quarto.yml': 'project:\n  render: [deck.qmd]\n',
    '_quarto-dark.yml': 'title: "render: demo"\nabstract: |\n  output-file: nothing\nformat:\n  revealjs:\n    theme: dark\n' });
  assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'deck.qmd' });
});

test('a profile file that uses metadata-files, a merge key, or a quoted render key is refused', () => {
  for (const [text, line] of [['metadata-files: [print-settings.yml]', 1], ['format:\n  revealjs:\n    <<: *print', 3], ['project:\n  "render": [deck.qmd]', 2]]) {
    const dir = folder({ 'deck.qmd': QMD, '_quarto.yml': 'project:\n  render: [deck.qmd]\n', '_quarto-print.yml': text });
    const r = lib.chooseDeckFile('.qmd', { dir });
    assert.equal(r.reason, 'unread', text);
    assert.deepEqual(r.unread.map((u) => [u.file, u.line]), [['_quarto-print.yml', line]], text);
  }
});

test('the scaffold and slide-qa agree on which profile lines set the deck files', () => {
  const texts = ['title: "render: demo"', 'metadata-files: [a.yml]', 'abstract: |\n  render: x', 'project:\n  render: [a.qmd]', '"output-file": x'];
  for (const t of texts) assert.deepEqual(scaffold.profileSettingLines(t), lib.profileSettingLines(t), t);
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

// verify round 1: the scanners skip block scalar contents too, or a setting the detector passes over as text would be read
test('readQuartoYml and renameRenderTarget leave block scalar contents alone', () => {
  const yml = 'project:\n  render: [deck.qmd]\nformat:\n  revealjs:\n    output-file: slides\n    notes: |\n      output-file: wrong\n';
  assert.equal(lib.readQuartoYml(yml).outputFile, 'slides');
  const tpl = 'format:\n  revealjs:\n    notes: >\n      output-file: talk\n    output-file: talk\n';
  assert.equal(scaffold.renameRenderTarget(tpl, 'w07.qmd'), 'format:\n  revealjs:\n    notes: >\n      output-file: talk\n    output-file: w07\n');
});

// verify round 1 (requirements): every form, end to end. slide-qa without its file option exits 2 naming the line and
// uses the file option when it is given; the scaffold refuses a template with that _quarto.yml and writes nothing.
test('every unread form is refused on the command line by slide-qa and by the scaffold', () => {
  for (const [name, [yml, line]] of Object.entries(UNREAD)) {
    const dir = folder({ 'deck.qmd': QMD, 'deck.html': '<html></html>', '_quarto.yml': `${yml}\n` });
    // an output-only form leaves check-density's .qmd lookup alone and stops the .html lookup (#50, verify round 2)
    const outputOnly = lib.unreadQuartoLines(yml).every((u) => u.outputOnly);
    let r = runQa(dir, outputOnly ? 'check-mathjax.mjs' : 'check-density.mjs');
    assert.equal(r.code, 2, `${name}: ${r.out}`);
    assert.match(r.out, new RegExp(`_quarto\\.yml line ${line}\\b`), name);
    r = runQa(dir, 'check-density.mjs', outputOnly ? [] : ['--qmd', 'deck.qmd']);
    assert.equal(r.code, 0, `${name}, .qmd: ${r.out}`);
    const s = sandbox();
    personalTemplate(s, 'odd', `${yml}\n${THEME}`);
    r = runScaffold(s, ['--template', 'odd', '--name', 'w07', '--out', 'deck']);
    assert.equal(r.code, 1, `${name} (scaffold): ${r.out}`);
    assert.match(r.out, new RegExp(`line ${line}\\b`), `${name} (scaffold)`);
    assert.equal(existsSync(path.join(s.project, 'deck')), false, `${name}: no deck folder`);
  }
});

// verify round 1 (security): a settings file that is a symbolic link is still followed to choose the deck's file, as
// before, but its contents are never printed; profile file names match in any letter case, as Quarto finds them on a
// case-insensitive disk
test('a symbolic-link settings file is reported by name and line only, without its contents', () => {
  const outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'quarto-settings-outside-')));
  writeFileSync(path.join(outside, 'secret.yml'), 'api render: SECRET-TOKEN\n');
  const dir = folder({ 'deck.qmd': QMD, '_quarto.yml': 'project:\n  render: [deck.qmd]\n' });
  symlinkSync(path.join(outside, 'secret.yml'), path.join(dir, '_quarto-leak.yml'));
  const r = runQa(dir, 'check-density.mjs');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /_quarto-leak\.yml line 1/);
  assert.doesNotMatch(r.out, /SECRET-TOKEN/);
});

test('a profile file whose name differs only in letter case is checked too', () => {
  const dir = folder({ 'deck.qmd': QMD, '_quarto.yml': 'project:\n  render: [deck.qmd]\n', '_QUARTO-print.yml': 'project:\n  render: [other.qmd]\n' });
  assert.equal(lib.chooseDeckFile('.qmd', { dir }).reason, 'unread');
  const s = sandbox();
  personalTemplate(s, 'cased', `project:\n  render: [talk.qmd]\n${THEME}`, { '_Quarto-Print.yml': 'project:\n  render: [talk.qmd]\n' });
  const out = runScaffold(s, ['--template', 'cased', '--name', 'w07', '--out', 'deck']);
  assert.equal(out.code, 1, out.out);
});

test('the scaffold strips control characters, DEL and C1 included, from a refused line and file name', () => {
  const s = sandbox();
  personalTemplate(s, 'noisy', `project: {render: [talk.qmd]} \u007f\u009b31m\n${THEME}`);
  const r = runScaffold(s, ['--template', 'noisy', '--name', 'w07', '--out', 'deck']);
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.out, /[\u007f-\u009f]/);
});

// verify round 1 (logic, regression): metadata-files is read, not refused outright; the listed files are refused only
// when they set render or output-file, or cannot be read from this folder (#46 Diagnosis)
test('metadataFileLists reads the listed names in the forms it covers', () => {
  assert.deepEqual(lib.metadataFileLists('metadata-files: [a.yml, "b.yml"]'), [{ line: 1, text: 'metadata-files: [a.yml, "b.yml"]', names: ['a.yml', 'b.yml'] }]);
  assert.deepEqual(lib.metadataFileLists('format:\n  revealjs:\n    metadata-files:\n      - a.yml\n      - \'c d.yml\'\n    theme: x').map((l) => [l.line, l.names]), [[3, ['a.yml', 'c d.yml']]]);
  assert.deepEqual(lib.metadataFileLists('metadata-files: one.yml').map((l) => l.names), [['one.yml']]);
  assert.deepEqual(lib.metadataFileLists('metadata-files: [\n  a.yml\n]').map((l) => l.names), [null]);
  for (const yml of ['metadata-files: [a.yml]', 'metadata-files:\n  - a.yml', 'metadata-files: [\n a\n]']) {
    assert.deepEqual(scaffold.metadataFileLists(yml), lib.metadataFileLists(yml), yml);
  }
});

test('metadata-files that only lists other settings is read; one that sets the output file is refused', () => {
  let dir = folder({ 'deck.qmd': QMD, '_quarto.yml': 'project:\n  render: [deck.qmd]\nmetadata-files: [shared.yml]\n', 'shared.yml': 'bibliography: refs.bib\n' });
  assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'deck.qmd' });
  assert.equal(runQa(dir, 'check-density.mjs').code, 0);
  dir = folder({ 'deck.qmd': QMD, '_quarto.yml': 'metadata-files:\n  - shared.yml\n', 'shared.yml': 'format:\n  revealjs:\n    output-file: slides\n' });
  const r = lib.chooseDeckFile('.html', { dir });
  assert.equal(r.reason, 'unread');
  assert.deepEqual(r.unread.map((u) => [u.file, u.line]), [['shared.yml', 3]]);
});

test('metadata-files that lists a file outside the folder, or a missing one, is refused', () => {
  for (const list of ['[../shared.yml]', '[sub/shared.yml]', '[missing.yml]']) {
    const dir = folder({ 'deck.qmd': QMD, '_quarto.yml': `metadata-files: ${list}\n` });
    const r = lib.chooseDeckFile('.qmd', { dir });
    assert.equal(r.reason, 'unread', list);
    assert.deepEqual(r.unread.map((u) => [u.file, u.line]), [['_quarto.yml', 1]], list);
  }
});

test('profile files are not consulted when there is no _quarto.yml: Quarto uses them only in a project', () => {
  const dir = folder({ 'deck.qmd': QMD, '_quarto-print.yml': 'project:\n  render: [other.qmd]\n' });
  assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'deck.qmd' });
});

test('the scaffold reads a template\'s metadata-files and refuses only one that sets render or output-file', () => {
  let s = sandbox();
  personalTemplate(s, 'meta', `metadata-files: [shared.yml]\n${THEME}`, { 'shared.yml': 'bibliography: refs.bib\n' });
  let r = runScaffold(s, ['--template', 'meta', '--name', 'w07', '--out', 'deck']);
  assert.equal(r.code, 0, r.out);
  s = sandbox();
  personalTemplate(s, 'meta2', `metadata-files: [shared.yml]\n${THEME}`, { 'shared.yml': 'project:\n  render: [talk.qmd]\n' });
  r = runScaffold(s, ['--template', 'meta2', '--name', 'w07', '--out', 'deck']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /shared\.yml line 2/);
  s = sandbox();
  personalTemplate(s, 'meta3', `metadata-files: [../outside.yml]\n${THEME}`);
  r = runScaffold(s, ['--template', 'meta3', '--name', 'w07', '--out', 'deck']);
  assert.equal(r.code, 1, r.out);
  assert.equal(existsSync(path.join(s.project, 'deck')), false);
});

// verify round 1 (Devil's Advocate): every setting the detector accepts must be read as a YAML reader reads it. The
// oracle is PyYAML's reading, computed by tests/fixtures/make-quarto-oracle.py (run by hand; Node built-ins only at run
// time, D10).
const ORACLE = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/quarto-settings-oracle.json'), 'utf8'));
const dotless = (v) => v.replace(/^\.\//, '');

test('every setting the detector accepts is read as PyYAML reads it', () => {
  let checked = 0;
  for (const { name, yml, oracle } of ORACLE) {
    if (oracle === null || lib.unreadQuartoLines(yml).length) continue;   // not YAML, or refused
    const r = lib.readQuartoYml(yml);
    assert.deepEqual(r.render, oracle.render.map(dotless), `${name}: render`);
    if (!lib.outputSourceLines(yml).length) {   // otherwise refused when the output name is needed (#50)
      assert.equal(r.outputFile ?? null, oracle.outputFile === null ? null : dotless(oracle.outputFile), `${name}: output-file`);
    }
    checked++;
  }
  assert.ok(checked >= 20, `checked ${checked} accepted cases`);
});

test('the oracle cases that the scanner would misread are refused', () => {
  for (const { name, yml, oracle } of ORACLE) {
    if (oracle === null) continue;
    const r = lib.readQuartoYml(yml);
    const misread = JSON.stringify(r.render) !== JSON.stringify(oracle.render.map(dotless))
      || (r.outputFile ?? null) !== (oracle.outputFile === null ? null : dotless(oracle.outputFile));
    if (misread) assert.ok(lib.unreadQuartoLines(yml).length || lib.outputSourceLines(yml).length, `${name} is misread but not refused`);
  }
});

test('a profile file is judged by the same rules as the settings file', () => {
  const dir = folder({ 'deck.qmd': QMD, '_quarto.yml': 'project:\n  render: [deck.qmd]\n', '_quarto-print.yml': 'format:\n  pdf:\n    output-file: handout\n' });
  assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'deck.qmd' });
});

// issue #50: other places Quarto takes the output name from are refused when the lookup needs that name (.html, .pdf)
const FM = (extra) => `---\ntitle: "T"\n${extra}---\n\n## A slide\n\nShort body text.\n`;
const OUTPUT_SOURCES = {
  'an extension format with its own output-file': [{ '_quarto.yml': 'format:\n  clean-revealjs:\n    output-file: slides\n' }, '_quarto.yml', 3],
  'output-file in the front matter': [{ 'deck.qmd': FM('output-file: slides\n') }, 'deck.qmd', 3],
  'output-file under revealjs in the front matter': [{ 'deck.qmd': FM('format:\n  revealjs:\n    output-file: slides\n') }, 'deck.qmd', 5],
  'output-ext in the front matter': [{ 'deck.qmd': FM('output-ext: htm\n') }, 'deck.qmd', 3],
  '_metadata.yml that sets output-file': [{ '_metadata.yml': 'format:\n  revealjs:\n    output-file: slides\n' }, '_metadata.yml', 3],
  'project output-dir': [{ '_quarto.yml': 'project:\n  output-dir: _site\n' }, '_quarto.yml', 2],
  'output-ext in _quarto.yml': [{ '_quarto.yml': 'output-ext: htm\n' }, '_quarto.yml', 1],
};
for (const [name, [files, file, line]] of Object.entries(OUTPUT_SOURCES)) {
  test(`#50: ${name} is refused for the .html and .pdf lookups only`, () => {
    const dir = folder({ 'deck.qmd': QMD, 'deck.html': '<html></html>', 'deck.pdf': '%PDF', ...files });
    for (const ext of ['.html', '.pdf']) {
      const r = lib.chooseDeckFile(ext, { dir });
      assert.equal(r.reason, 'unread', `${name} ${ext}`);
      assert.deepEqual(r.unread.map((u) => [u.file, u.line]), [[file, line]], `${name} ${ext}`);
    }
    assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'deck.qmd' }, `${name} .qmd`);
  });
}

test('#50: front matter and _metadata.yml without an output name are not refused', () => {
  const dir = folder({ 'deck.qmd': FM('format:\n  revealjs:\n    theme: dark\n  pdf:\n    output-file: handout\n'), 'deck.html': '<html></html>', '_metadata.yml': 'author: X\n' });
  assert.deepEqual(lib.chooseDeckFile('.html', { dir }), { file: 'deck.html' });
  const cli = runQa(dir, 'check-mathjax.mjs', ['--no-such']);   // the option error proves the script got past nothing else
  assert.equal(cli.code, 2);
});

test('#50: every official template passes the .html lookup', () => {
  const tdir = path.join(SKILL, 'templates/quarto');
  for (const n of readdirSync(tdir).filter((x) => existsSync(path.join(tdir, x, '_quarto.yml')))) {
    const dir = folder({ '_quarto.yml': readFileSync(path.join(tdir, n, '_quarto.yml'), 'utf8').replace(/talk\.qmd/g, 'deck.qmd'),
      'deck.qmd': readFileSync(path.join(tdir, n, 'talk.qmd'), 'utf8'), 'deck.html': '<html></html>' });
    assert.deepEqual(lib.chooseDeckFile('.html', { dir }), { file: 'deck.html' }, n);
  }
});

test('the scaffold reads a template _quarto.yml that starts with a byte order mark', () => {
  const s = sandbox();
  personalTemplate(s, 'bom', `﻿project:\n  render: [talk.qmd]\n${THEME}`);
  const r = runScaffold(s, ['--template', 'bom', '--name', 'w07', '--out', 'deck']);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /still mentions talk\.qmd/);
  assert.match(readFileSync(path.join(s.project, 'deck', '_quarto.yml'), 'utf8'), /render: \[w07\.qmd\]/);
});

test('the refusal message names the sources of the output name it does not read (#50)', () => {
  const dir = folder({ 'deck.qmd': QMD, 'deck.html': '<html></html>', '_quarto.yml': 'project:\n  output-dir: _site\n' });
  const r = runQa(dir, 'check-mathjax.mjs');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /_quarto\.yml line 2/);
  assert.match(r.out, /output-dir/);
  assert.match(r.out, /--html/);
});

// verify round 2 (Codex): output names set in front matter or _metadata.yml in any form, directly or indirectly
const OUTPUT_SOURCES_R2 = {
  'a quoted output-file in the front matter': [{ 'deck.qmd': FM('"output-file": slides\n') }, 'deck.qmd', 3],
  'a quoted output-ext in the front matter': [{ 'deck.qmd': FM("'output-ext': htm\n") }, 'deck.qmd', 3],
  'metadata-files in the front matter': [{ 'deck.qmd': FM('metadata-files: [names.yml]\n') }, 'deck.qmd', 3],
  'a quoted output-file in _metadata.yml': [{ '_metadata.yml': '"output-file": slides\n' }, '_metadata.yml', 1],
  'metadata-files in _metadata.yml': [{ '_metadata.yml': 'metadata-files: [names.yml]\n', 'names.yml': 'output-file: slides\n' }, '_metadata.yml', 1],
  'a merge key in _metadata.yml': [{ '_metadata.yml': 'base: &b {output-file: slides}\n<<: *b\n' }, '_metadata.yml', 1],
  'a quoted output-dir': [{ '_quarto.yml': 'project:\n  "output-dir": _site\n' }, '_quarto.yml', 2],
  'a quoted output-ext': [{ '_quarto.yml': '"output-ext": htm\n' }, '_quarto.yml', 1],
  'a quoted output-file under an extension format': [{ '_quarto.yml': 'format:\n  clean-revealjs:\n    "output-file": slides\n' }, '_quarto.yml', 3],
  // verify round 2 (adversarial): a project type other than default writes to its own output folder (_site, _book, ...)
  'a website project': [{ '_quarto.yml': 'project:\n  type: website\n' }, '_quarto.yml', 2],
  'a book project': [{ '_quarto.yml': 'project:\n  type: book\n  render: [deck.qmd]\n' }, '_quarto.yml', 2],
};
for (const [name, [files, file, line]] of Object.entries(OUTPUT_SOURCES_R2)) {
  test(`#50 round 2: ${name} is refused for the .html lookup, not for the .qmd lookup`, () => {
    const dir = folder({ 'deck.qmd': QMD, 'deck.html': '<html></html>', ...files });
    const r = lib.chooseDeckFile('.html', { dir });
    assert.equal(r.reason, 'unread', name);
    assert.equal(r.unread[0].file, file, name);
    assert.equal(r.unread[0].line, line, name);
    assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'deck.qmd' }, `${name} .qmd`);
  });
}

test('a profile file with a one-line flow mapping that sets nothing the scanner reads is not refused', () => {
  const dir = folder({ 'deck.qmd': QMD, '_quarto.yml': 'project:\n  render: [deck.qmd]\n', '_quarto-print.yml': 'format: {pdf: default}\n...\n' });
  assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'deck.qmd' });
});

// verify round 2 (adversarial)
test('output-ext under another format in the front matter does not stop the .html lookup', () => {
  const dir = folder({ 'deck.qmd': FM('format:\n  pdf:\n    output-ext: tex\n'), 'deck.html': '<html></html>' });
  assert.deepEqual(lib.chooseDeckFile('.html', { dir }), { file: 'deck.html' });
});

test('a symbolic-link settings file does not show the names its metadata-files lists', () => {
  const outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'quarto-settings-outside-')));
  writeFileSync(path.join(outside, 'settings.yml'), 'metadata-files: [TOP-SECRET-9f3a.yml]\n');
  const dir = folder({ 'deck.qmd': QMD });
  symlinkSync(path.join(outside, 'settings.yml'), path.join(dir, '_quarto.yml'));
  const r = runQa(dir, 'check-density.mjs');
  assert.equal(r.code, 2, r.out);
  assert.doesNotMatch(r.out, /TOP-SECRET/);
});

test('the scaffold accepts a template whose profile only changes the output folder or another format\'s extension', () => {
  for (const [name, profile] of [['publish', 'project:\n  output-dir: _print\n'], ['texout', 'format:\n  pdf:\n    output-ext: tex\n']]) {
    const s = sandbox();
    personalTemplate(s, name, `project:\n  render: [talk.qmd]\n${THEME}`, { [`_quarto-${name}.yml`]: profile });
    const r = runScaffold(s, ['--template', name, '--name', 'w07', '--out', 'deck']);
    assert.equal(r.code, 0, `${name}: ${r.out}`);
  }
});

// verify round 2 (adversarial, F7): Pandoc reads a metadata block after blank lines and later in the document too
test('front matter after blank lines, or a later YAML block, that sets the output name stops the .html lookup', () => {
  for (const [name, qmd] of [
    ['after blank lines', '\n\n---\ntitle: "T"\noutput-file: slides\n---\n\n## A\n'],
    ['a later block', '---\ntitle: "T"\n---\n\n## A\n\nText.\n\n---\noutput-file: slides\n---\n'],
  ]) {
    const dir = folder({ 'deck.qmd': qmd, 'deck.html': '<html></html>' });
    const r = lib.chooseDeckFile('.html', { dir });
    assert.equal(r.reason, 'unread', name);
    assert.match(r.unread.map((u) => `${u.file}:${u.line}`).join(' '), /deck\.qmd:\d+/, name);
  }
});

test('a slide break and a fenced code example are not read as metadata blocks', () => {
  const qmd = '---\ntitle: "T"\n---\n\n## A\n\nText.\n\n---\n\n## B\n\n```yaml\n---\noutput-file: shown\n---\n```\n\n---\n## C\n\n[link](x)\n\n---\n';
  const dir = folder({ 'deck.qmd': qmd, 'deck.html': '<html></html>' });
  assert.deepEqual(lib.chooseDeckFile('.html', { dir }), { file: 'deck.html' });
});

// verify round 3 (Codex N1, N5)
const OUTPUT_SOURCES_R3 = {
  'a project type in a one-line flow mapping': [{ '_quarto.yml': 'project: {type: website}\n' }, '_quarto.yml', 1],
  'a quoted project type key': [{ '_quarto.yml': 'project:\n  "type": book\n' }, '_quarto.yml', 2],
  'a later block that starts with a comment': [{ 'deck.qmd': `${QMD}\n---\n# output settings\noutput-file: slides\n---\n` }, 'deck.qmd', 11],
  // only where the deck is written: the scaffold accepts it as it accepts a bare output-dir (verify round 3, N2)
  'output-dir with a space before the colon': [{ '_quarto.yml': 'project:\n  output-dir : _site\n' }, '_quarto.yml', 2],
  'a later block that starts with a merge key': [{ 'deck.qmd': `${QMD}\n---\n<<: {output-file: slides}\n---\n` }, 'deck.qmd', 10],
};
for (const [name, [files, file, line]] of Object.entries(OUTPUT_SOURCES_R3)) {
  test(`#50 round 3: ${name} is refused for the .html lookup, not for the .qmd lookup`, () => {
    const dir = folder({ 'deck.qmd': QMD, 'deck.html': '<html></html>', ...files });
    const r = lib.chooseDeckFile('.html', { dir });
    assert.equal(r.reason, 'unread', name);
    assert.equal(r.unread[0].file, file, name);
    assert.equal(r.unread[0].line, line, name);
    assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'deck.qmd' }, `${name} .qmd`);
  });
}

// verify round 3 (Codex N1, N4, N7): settings that do not change the deck's .html are not refused
const HTML_UNCHANGED_R3 = {
  'a quoted default project type': { '_quarto.yml': 'project:\n  type: "default"\n' },
  'a default project type in a flow mapping': { '_quarto.yml': 'project: {type: default}\n' },
  'a quoted output-ext under another format in the front matter': { 'deck.qmd': FM('format:\n  pdf:\n    "output-ext": tex\n') },
  'a quoted output-file under another format': { '_quarto.yml': 'format:\n  pdf:\n    "output-file": print\n' },
  'a null project type': { '_quarto.yml': 'project:\n  type: ~\n' },
  'a code example whose inner fence has an info string': { 'deck.qmd': `${QMD}\n\`\`\`markdown\n\`\`\`yaml\n\n---\noutput-file: shown\n---\n\`\`\`\n` },
};
for (const [name, files] of Object.entries(HTML_UNCHANGED_R3)) {
  test(`round 3: ${name} does not stop the .html lookup`, () => {
    const dir = folder({ 'deck.qmd': QMD, 'deck.html': '<html></html>', ...files });
    assert.deepEqual(lib.chooseDeckFile('.html', { dir }), { file: 'deck.html' }, name);
  });
}

// verify round 3 (Codex N2): quoted forms of the output folder and extension are accepted too; an output-file the
// scaffold cannot rewrite is still refused
test('the scaffold accepts quoted output-dir and output-ext in a template profile, and refuses a quoted output-file', () => {
  for (const [name, profile, code] of [
    ['quotedir', 'project:\n  "output-dir": _print\n', 0],
    ['quotedext', '"output-ext": htm\n', 0],
    ['quotedfile', 'format:\n  revealjs:\n    "output-file": talk\n', 1],
  ]) {
    const s = sandbox();
    personalTemplate(s, name, `project:\n  render: [talk.qmd]\n${THEME}`, { [`_quarto-${name}.yml`]: profile });
    const r = runScaffold(s, ['--template', name, '--name', 'w07', '--out', 'deck']);
    assert.equal(r.code, code, `${name}: ${r.out}`);
  }
});

// verify round 3 (adversarial, row 2): the YAML blocks Quarto reads for the output name, by its own rules
const QUARTO_BLOCKS_R3 = {
  'a --- right after text': [`${QMD}Some text.\n---\noutput-file: other\n---\n`, 10],
  'a block whose first key is not ASCII': [`${QMD}\n---\n備註: 講義版\noutput-file: handout\n---\n`, 11],
  'a block inside a tilde fence, which Quarto does not skip': [`${QMD}\n~~~yaml\n---\noutput-file: other\n---\n~~~\n`, 11],
  'a block after a comment that spans lines': [`${QMD}\n<!-- a\nb -->\n---\noutput-file: slides\n---\n`, 12],
};
for (const [name, [qmd, line]] of Object.entries(QUARTO_BLOCKS_R3)) {
  test(`round 3: ${name} stops the .html lookup at the right line`, () => {
    const dir = folder({ 'deck.qmd': qmd, 'deck.html': '<html></html>' });
    const r = lib.chooseDeckFile('.html', { dir });
    assert.equal(r.reason, 'unread', name);
    assert.deepEqual(r.unread.map((u) => [u.file, u.line]), [['deck.qmd', line]], name);
  });
}

test('round 3: a block inside an HTML comment is not read, as in Quarto', () => {
  const dir = folder({ 'deck.qmd': `${QMD}\n<!--\n---\noutput-file: other\n---\n-->\n`, 'deck.html': '<html></html>' });
  assert.deepEqual(lib.chooseDeckFile('.html', { dir }), { file: 'deck.html' });
});

test('round 3: many unclosed fences and comments are read in linear time', () => {
  const dir = folder({ 'deck.qmd': `${QMD}${'```a\n<!-- x\n'.repeat(40000)}`, 'deck.html': '<html></html>' });
  const t0 = Date.now();
  assert.deepEqual(lib.chooseDeckFile('.html', { dir }), { file: 'deck.html' });
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
});

// ---------- #53: a template copied from a finished deck keeps that deck's name ----------
// Quarto 1.10.19: a render entry for a missing file renders nothing and exits 0; an output-file under revealjs
// renders the new deck under the old name. The scaffold refuses before writing, naming the file and the line.
const OLD_DECK = '---\ntitle: "T"\nlang: en\n---\n\n## Slide\n\nBody\n';
const STALE_TEMPLATES = {
  'a render entry for the old deck': [`project:\n  render:\n    - "w07.qmd"\n${THEME}`, {}, '_quarto.yml', 3],
  'a render entry the template does not have': [`project:\n  render: [talk.qmd, notes.qmd]\n${THEME}`, {}, '_quarto.yml', 2],
  'a render entry outside the deck': [`project:\n  render: [talk.qmd, ../shared.qmd]\n${THEME}`, {}, '_quarto.yml', 2],
  "the old deck's output-file under revealjs": [`project:\n  render: [talk.qmd]\nformat:\n  revealjs:\n    theme: [default, _theme/deck.scss]\n    footer: "Venue"\n    output-file: w07\n`, {}, '_quarto.yml', 7],
  "the old deck's output-file at the top level": [`output-file: w07.html\nproject:\n  render: [talk.qmd]\n${THEME}`, {}, '_quarto.yml', 1],
  "the old deck's output-file under an extension format": [`project:\n  render: [talk.qmd]\n${THEME}  clean-revealjs:\n    output-file: w07\n`, {}, '_quarto.yml', 8],
  'output-file in the front matter': [`project:\n  render: [talk.qmd]\n${THEME}`, { 'talk.qmd': '---\ntitle: "T"\noutput-file: w07\n---\n\n## Slide\n' }, 'talk.qmd', 3],
  'output-file under format: revealjs: in the front matter': [`project:\n  render: [talk.qmd]\n${THEME}`, { 'talk.qmd': '---\ntitle: "T"\nformat:\n  revealjs:\n    output-file: w07\n---\n\n## Slide\n' }, 'talk.qmd', 5],
  'output-file in a later YAML block of talk.qmd': [`project:\n  render: [talk.qmd]\n${THEME}`, { 'talk.qmd': '---\ntitle: "T"\n---\n\n## Slide\n\n---\noutput-file: w07\n---\n' }, 'talk.qmd', 8],
  'metadata-files in the front matter': [`project:\n  render: [talk.qmd]\n${THEME}`, { 'talk.qmd': '---\ntitle: "T"\nmetadata-files: [names.yml]\n---\n\n## Slide\n' }, 'talk.qmd', 3],
};
for (const [name, [yml, extra, file, line]] of Object.entries(STALE_TEMPLATES)) {
  test(`#53: the scaffold refuses ${name}, naming the line, before writing anything`, () => {
    const s = sandbox();
    personalTemplate(s, 'copied', yml, extra);
    const r = runScaffold(s, ['--template', 'copied', '--name', 'w08', '--out', 'deck']);
    assert.equal(r.code, 1, `${name}: ${r.out}`);
    assert.match(r.out, new RegExp(`${file.replace('.', '\\.')} line ${line}\\b`), name);
    assert.equal(existsSync(path.join(s.project, 'deck')), false, `${name}: nothing written`);
  });
}

test('#53: render entries the template has, a glob, output-file talk and output-ext in the front matter are accepted', () => {
  for (const [name, yml, extra] of [
    ['appendix', `project:\n  render: [talk.qmd, appendix.qmd]\n${THEME}`, { 'appendix.qmd': OLD_DECK }],
    ['cased', `project:\n  render: [talk.qmd, Appendix.qmd]\n${THEME}`, { 'appendix.qmd': OLD_DECK }],
    ['glob', `project:\n  render: ["*.qmd"]\n${THEME}`, {}],
    ['talkoutput', `project:\n  render: [talk.qmd]\nformat:\n  revealjs:\n    theme: [default, _theme/deck.scss]\n    output-file: talk\n`, {}],
    ['outputext', `project:\n  render: [talk.qmd]\n${THEME}`, { 'talk.qmd': '---\ntitle: "T"\noutput-ext: htm\nlang: en\n---\n\n## Slide\n' }],
  ]) {
    const s = sandbox();
    personalTemplate(s, name, yml, extra);
    const r = runScaffold(s, ['--template', name, '--name', 'w08', '--out', 'deck']);
    assert.equal(r.code, 0, `${name}: ${r.out}`);
  }
});

test('#53: an extension format output-file talk is renamed with the deck', () => {
  assert.equal(scaffold.renameRenderTarget('format:\n  clean-revealjs:\n    output-file: talk.html\n', 'w07.qmd'), 'format:\n  clean-revealjs:\n    output-file: w07.html\n');
  const s = sandbox();
  personalTemplate(s, 'ext', `project:\n  render: [talk.qmd]\n${THEME}  clean-revealjs:\n    output-file: talk\n`);
  const r = runScaffold(s, ['--template', 'ext', '--name', 'w08', '--out', 'deck']);
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(path.join(s.project, 'deck', '_quarto.yml'), 'utf8'), /clean-revealjs:\n    output-file: w08\n/);
});

test('#53: the scaffold and slide-qa read project.render and output-file the same way', () => {
  const all = [...Object.values(UNREAD).map(([yml]) => yml), ...Object.values(READ)];
  for (const yml of all) assert.deepEqual(scaffold.readQuartoYml(yml), lib.readQuartoYml(yml), yml);
});

// verify round 1 of #53 (Codex): a glob that leaves the deck, a byte order mark before talk.qmd's front matter, and an
// extension format's output-file in a profile file, which is copied unchanged
test('#53 verify: a render glob outside the deck, a front matter after a byte order mark, and a profile output-file under an extension format are refused', () => {
  for (const [name, yml, extra, file, line, why] of [
    ['a glob above the deck', `project:\n  render: [talk.qmd, "../*.qmd"]\n${THEME}`, {}, '_quarto.yml', 2, /outside the new deck/],
    ['an absolute glob', `project:\n  render: [talk.qmd, "/tmp/*.qmd"]\n${THEME}`, {}, '_quarto.yml', 2, /outside the new deck/],
    ['a byte order mark before the front matter', `project:\n  render: [talk.qmd]\n${THEME}`, { 'talk.qmd': '﻿---\ntitle: "T"\noutput-file: w07\n---\n\n## Slide\n' }, 'talk.qmd', 3, /talk\.qmd/],
    ['a profile output-file under an extension format', `project:\n  render: [talk.qmd]\n${THEME}`, { '_quarto-ext.yml': 'format:\n  clean-revealjs:\n    output-file: w07\n' }, '_quarto-ext.yml', 3, /rewrites only _quarto\.yml/],
  ]) {
    const s = sandbox();
    personalTemplate(s, 'copied', yml, extra);
    const r = runScaffold(s, ['--template', 'copied', '--name', 'w08', '--out', 'deck']);
    assert.equal(r.code, 1, `${name}: ${r.out}`);
    assert.match(r.out, new RegExp(`${file.replace(/\./g, '\\.')} line ${line}\\b`), name);
    assert.match(r.out, why, name);
    assert.equal(existsSync(path.join(s.project, 'deck')), false, `${name}: nothing written`);
  }
});

test('#53 verify: a profile that changes only the output folder or extension is still accepted', () => {
  const s = sandbox();
  personalTemplate(s, 'place', `project:\n  render: [talk.qmd]\n${THEME}`, { '_quarto-pub.yml': 'project:\n  output-dir: _pub\nformat:\n  revealjs:\n    output-ext: htm\n' });
  const r = runScaffold(s, ['--template', 'place', '--name', 'w08', '--out', 'deck']);
  assert.equal(r.code, 0, r.out);
});

// verify round 1 of #53 (adversarial)
test('#53 verify: output-file talk with a comment after it is renamed, not refused', () => {
  for (const [name, yml] of [
    ['revealjs', `project:\n  render: [talk.qmd]\nformat:\n  revealjs:\n    theme: [default, _theme/deck.scss]\n    footer: "Venue"\n    output-file: talk   # renamed by the scaffold\n`],
    ['top level', `output-file: talk.html # deck name\nproject:\n  render: [talk.qmd]\n${THEME}`],
    ['extension', `project:\n  render: [talk.qmd]\n${THEME}  clean-revealjs:\n    output-file: "talk" # x\n`],
  ]) {
    const s = sandbox();
    personalTemplate(s, 'commented', yml);
    const r = runScaffold(s, ['--template', 'commented', '--name', 'w08', '--out', 'deck']);
    assert.equal(r.code, 0, `${name}: ${r.out}`);
    assert.match(readFileSync(path.join(s.project, 'deck', '_quarto.yml'), 'utf8'), /output-file: "?w08(\.html)?"?/, name);
  }
});

test('#53 verify: the line named is the template\'s, also when a settings layer removes or adds the footer', () => {
  for (const [settings, yml, line] of [
    [{ footer: null }, `project:\n  render: [talk.qmd]\nformat:\n  revealjs:\n    theme: [default, _theme/deck.scss]\n    footer: "Venue"\n    output-file: w07\n`, 7],
    [{ footer: 'My venue' }, `project:\n  render: [talk.qmd]\nformat:\n  revealjs:\n    theme: [default, _theme/deck.scss]\n    output-file: w07\n`, 6],
  ]) {
    const s = sandbox();
    mkdirSync(path.join(s.home, '.claude', '.academic-slides'), { recursive: true });
    writeFileSync(path.join(s.home, '.claude', '.academic-slides', 'local.json'), JSON.stringify(settings));
    personalTemplate(s, 'footed', yml);
    const r = runScaffold(s, ['--template', 'footed', '--name', 'w08', '--out', 'deck']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`_quarto\\.yml line ${line} \\("    output-file: w07"\\)`), JSON.stringify(settings));
  }
});

test('#53 verify: _metadata.yml in the template is judged like a profile file, and the main file must be rendered', () => {
  for (const [name, yml, extra, file, line] of [
    ['_metadata.yml output-file', `project:\n  render: [talk.qmd]\n${THEME}`, { '_metadata.yml': 'output-file: w07\n' }, '_metadata.yml', 1],
    ['_metadata.yaml under revealjs', `project:\n  render: [talk.qmd]\n${THEME}`, { '_metadata.yaml': 'format:\n  revealjs:\n    output-file: w07\n' }, '_metadata.yaml', 3],
    ['render without the main file', `project:\n  render:\n    - "w07.qmd"\n${THEME}`, { 'w07.qmd': OLD_DECK }, '_quarto.yml', 2],
  ]) {
    const s = sandbox();
    personalTemplate(s, 'meta', yml, extra);
    const r = runScaffold(s, ['--template', 'meta', '--name', 'w08', '--out', 'deck']);
    assert.equal(r.code, 1, `${name}: ${r.out}`);
    assert.match(r.out, new RegExp(`${file.replace(/\./g, '\\.')} line ${line}\\b`), name);
  }
  const s = sandbox();
  personalTemplate(s, 'metaplace', `project:\n  render: [talk.qmd]\n${THEME}`, { '_metadata.yml': 'format:\n  revealjs:\n    output-ext: htm\n' });
  assert.equal(runScaffold(s, ['--template', 'metaplace', '--name', 'w08', '--out', 'deck']).code, 0);
});

test('#53 verify: render values Quarto reads as written (".", ./ and // inside a path) are accepted', () => {
  const s = sandbox();
  personalTemplate(s, 'dotted', `project:\n  render:\n    - talk.qmd\n    - "."\n    - chapters/./intro.qmd\n    - chapters//intro.qmd\n${THEME}`);
  mkdirSync(path.join(s.templates, 'dotted', 'chapters'));
  writeFileSync(path.join(s.templates, 'dotted', 'chapters', 'intro.qmd'), OLD_DECK);
  const r = runScaffold(s, ['--template', 'dotted', '--name', 'w08', '--out', 'deck']);
  assert.equal(r.code, 0, r.out);
});

test('#53 verify: the two copies of the detector block are the same text, but for the line that points at the other', () => {
  const block = (file) => {
    const text = readFileSync(file, 'utf8');
    const from = text.indexOf('// Forms of _quarto.yml');
    const to = text.indexOf('export function metadataFileLists');
    assert.ok(from >= 0 && to > from, file);
    return text.slice(from, to).split('\n').filter((l) => !l.startsWith('// code is in '));
  };
  assert.deepEqual(block(SCAFFOLD), block(path.join(QA, '_lib.mjs')));
});

// verify round 2 of #53 (Codex)
test('#53 verify r2: a render path that comes back to the deck folder is the deck, and an empty render list is refused', () => {
  let s = sandbox();
  personalTemplate(s, 'back', `project:\n  render: [talk.qmd, "chapters/../"]\n${THEME}`);
  mkdirSync(path.join(s.templates, 'back', 'chapters'));
  writeFileSync(path.join(s.templates, 'back', 'chapters', 'intro.qmd'), OLD_DECK);
  let r = runScaffold(s, ['--template', 'back', '--name', 'w08', '--out', 'deck']);
  assert.equal(r.code, 0, r.out);
  s = sandbox();
  personalTemplate(s, 'empty', `project:\n  render: []\n${THEME}`);
  r = runScaffold(s, ['--template', 'empty', '--name', 'w08', '--out', 'deck']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /_quarto\.yml line 2\b/);
});

test('#53 verify r2: renameRenderTarget keeps the line count, so the lines named are the template\'s', () => {
  const all = [...Object.values(UNREAD).map(([yml]) => yml), ...Object.values(READ), ...Object.values(STALE_TEMPLATES).map(([yml]) => yml)];
  for (const yml of all) assert.equal(scaffold.renameRenderTarget(yml, 'w08.qmd').split('\n').length, yml.split('\n').length, yml);
});

// verify round 2 of #53 (adversarial)
test('#53 verify r2: "./" and ".//" in a render list are the deck folder, and .//chapters/a.qmd is that file', () => {
  for (const render of [`  render: ["./", appendix.qmd]`, `  render:\n    - ./\n    - appendix.qmd`, `  render: [talk.qmd, ".//chapters/a.qmd"]`, `  render: [".//"]`]) {
    const s = sandbox();
    personalTemplate(s, 'dots', `project:\n${render}\n${THEME}`, { 'appendix.qmd': OLD_DECK });
    mkdirSync(path.join(s.templates, 'dots', 'chapters'));
    writeFileSync(path.join(s.templates, 'dots', 'chapters', 'a.qmd'), OLD_DECK);
    const r = runScaffold(s, ['--template', 'dots', '--name', 'w08', '--out', 'deck']);
    assert.equal(r.code, 0, `${render}: ${r.out}`);
  }
});

test('#53 verify r2: a glob with .. is outside the deck even when ** could absorb it', () => {
  const s = sandbox();
  personalTemplate(s, 'starstar', `project:\n  render: [talk.qmd, "**/../*.qmd"]\n${THEME}`);
  const r = runScaffold(s, ['--template', 'starstar', '--name', 'w08', '--out', 'deck']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /_quarto\.yml line 2\b/);
});

test('#53 verify r2: a block-scalar footer is removed or replaced with its text, which never becomes settings', () => {
  const yml = `project:\n  render: [talk.qmd]\nformat:\n  revealjs:\n    theme: [default, _theme/deck.scss]\n    footer: |\n      output-file: w07\n\n      second line\n    slide-number: true\n`;
  assert.equal(scaffold.rewriteQuartoYml(yml, { theme: ['default'], footer: null }),
    `project:\n  render: [talk.qmd]\nformat:\n  revealjs:\n    theme: [default]\n    slide-number: true\n`);
  assert.equal(scaffold.rewriteQuartoYml(yml, { theme: ['default'], footer: 'Venue' }),
    `project:\n  render: [talk.qmd]\nformat:\n  revealjs:\n    theme: [default]\n    footer: "Venue"\n    slide-number: true\n`);
  for (const settings of [{ footer: null }, { footer: 'My venue' }]) {
    const s = sandbox();
    mkdirSync(path.join(s.home, '.claude', '.academic-slides'), { recursive: true });
    writeFileSync(path.join(s.home, '.claude', '.academic-slides', 'local.json'), JSON.stringify(settings));
    personalTemplate(s, 'blockfoot', yml);
    const r = runScaffold(s, ['--template', 'blockfoot', '--name', 'w08', '--out', 'deck']);
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(readFileSync(path.join(s.project, 'deck', '_quarto.yml'), 'utf8'), /output-file|second line/, JSON.stringify(settings));
  }
});

// ---------- #54: a deck folder inside a larger Quarto project ----------
// Quarto 1.10.19: a deck folder without a settings file of its own takes the nearest folder above with _quarto.yml or
// _quarto.yaml as its project (output-dir _out → _out/sub/deck.html); a deck folder with its own settings file is its
// own project, and the folders above it do not apply.
function nested(files) {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'quarto-settings-parent-')));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(base, name)), { recursive: true });
    writeFileSync(path.join(base, name), content);
  }
  return base;
}

test('#54: a deck folder without settings inside a Quarto project is refused for the .html lookup, not the .qmd lookup', () => {
  for (const [name, files, deck, settings] of [
    ['one level up', { '_quarto.yml': 'project:\n  output-dir: _out\n', 'sub/deck.qmd': QMD, 'sub/deck.html': '<html></html>' }, 'sub', path.join('..', '_quarto.yml')],
    ['two levels up, _quarto.yaml', { '_quarto.yaml': 'project:\n  type: website\n', 'a/b/deck.qmd': QMD, 'a/b/deck.html': '<html></html>' }, path.join('a', 'b'), path.join('..', '..', '_quarto.yaml')],
    ['a settings file with no project key', { '_quarto.yml': 'format: html\n', 'sub/deck.qmd': QMD, 'sub/deck.html': '<html></html>' }, 'sub', path.join('..', '_quarto.yml')],
  ]) {
    const dir = path.join(nested(files), deck);
    const r = lib.chooseDeckFile('.html', { dir });
    assert.equal(r.reason, 'unread', name);
    assert.deepEqual(r.unread.map((u) => u.file), [settings], name);
    assert.deepEqual(lib.chooseDeckFile('.qmd', { dir }), { file: 'deck.qmd' }, `${name} .qmd`);
  }
});

test('#54: a deck folder with its own settings file is its own project, whatever is above it', () => {
  const dir = path.join(nested({ '_quarto.yml': 'project:\n  output-dir: _out\n', 'sub/_quarto.yml': 'project:\n  render: [deck.qmd]\n', 'sub/deck.qmd': QMD, 'sub/deck.html': '<html></html>' }), 'sub');
  assert.deepEqual(lib.chooseDeckFile('.html', { dir }), { file: 'deck.html' });
});

test('#54: check-mathjax exits 2 naming the project settings file above and the --html option', () => {
  const dir = path.join(nested({ '_quarto.yml': 'project:\n  output-dir: _out\n', 'sub/deck.qmd': QMD, 'sub/deck.html': '<html></html>' }), 'sub');
  const r = runQa(dir, 'check-mathjax.mjs');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /\.\.[\\/]_quarto\.yml/);
  assert.match(r.out, /Quarto project/);
  assert.match(r.out, /--html/);
});

// verify round 1 of #54 (Codex)
test('#54 verify: the nearest project above is named, and the .pdf lookup is refused too', () => {
  const base = nested({ '_quarto.yml': 'project:\n  type: book\n', 'a/_quarto.yml': 'project:\n  output-dir: _out\n', 'a/sub/deck.qmd': QMD, 'a/sub/deck.html': '<html></html>', 'a/sub/deck.pdf': '%PDF' });
  const dir = path.join(base, 'a', 'sub');
  assert.deepEqual(lib.chooseDeckFile('.html', { dir }).unread.map((u) => u.file), [path.join('..', '_quarto.yml')]);
  assert.equal(lib.chooseDeckFile('.pdf', { dir }).reason, 'unread');
});

test('#54 verify: a folder reached through a symbolic link and .. is searched where it really is', () => {
  const base = nested({ 'project/_quarto.yml': 'project:\n  output-dir: _out\n', 'project/sub/x.txt': '', 'project/deck/deck.qmd': QMD, 'project/deck/deck.html': '<html></html>', 'work/x.txt': '' });
  symlinkSync(path.join(base, 'project', 'sub'), path.join(base, 'work', 'link'));
  // a string the operating system resolves (link, then ..), not one path.join would shorten first
  const r = lib.chooseDeckFile('.html', { dir: `${base}${path.sep}work${path.sep}link${path.sep}..${path.sep}deck` });
  assert.equal(r.reason, 'unread', JSON.stringify(r));
});

test('#54 verify: the file option is used as given, and a parent folder name is printed without control characters', () => {
  const base = nested({ '_quarto.yml': 'project:\n  output-dir: _out\n' });
  // Windows does not allow control characters in a folder name (verify round 2); a bidirectional mark it does
  const deckDir = path.join(base, process.platform === 'win32' ? 'x‮sub' : 'x\u001b[2J‮sub');
  mkdirSync(deckDir);
  writeFileSync(path.join(deckDir, 'deck.qmd'), QMD);
  writeFileSync(path.join(deckDir, 'deck.html'), '<html></html>');
  let r = runQa(deckDir, 'check-mathjax.mjs');
  assert.equal(r.code, 2, r.out);
  assert.doesNotMatch(r.out, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/);
  r = runQa(deckDir, 'check-density.mjs', ['--qmd', 'deck.qmd']);
  assert.equal(r.code, 0, r.out);
  r = runQa(deckDir, 'check-mathjax.mjs', ['--html', 'deck.html']);   // the option the refusal names gets past it
  assert.equal(r.code, 0, r.out);
});

// verify round 1 of #54 (adversarial): tests that fail when the feature is broken
test('#54 verify: the message says why, a deck folder with only _quarto.yaml is its own project, and three levels up is searched', () => {
  let dir = path.join(nested({ '_quarto.yml': 'project:\n  output-dir: _out\n', 'sub/deck.qmd': QMD, 'sub/deck.html': '<html></html>' }), 'sub');
  const r = runQa(dir, 'check-fill.mjs');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /no Quarto settings file of its own, so when the deck is one of the inputs of the Quarto project there/);
  dir = path.join(nested({ '_quarto.yml': 'project:\n  output-dir: _out\n', 'sub/_quarto.yaml': 'project:\n  render: [deck.qmd]\n', 'sub/deck.qmd': QMD, 'sub/deck.html': '<html></html>' }), 'sub');
  assert.deepEqual(lib.chooseDeckFile('.html', { dir }), { file: 'deck.html' });
  dir = path.join(nested({ '_quarto.yml': 'project:\n  output-dir: _out\n', 'a/b/c/deck.qmd': QMD, 'a/b/c/deck.html': '<html></html>' }), 'a', 'b', 'c');
  assert.deepEqual(lib.chooseDeckFile('.html', { dir }).unread.map((u) => u.file), [path.join('..', '..', '..', '_quarto.yml')]);
});

test('#54 verify: a folder named _quarto.yml above counts, as in Quarto, and handout stops too', () => {
  const base = nested({ 'sub/deck.qmd': QMD, 'sub/deck.html': '<html></html>', 'sub/deck.pdf': '%PDF' });
  mkdirSync(path.join(base, '_quarto.yml'));
  const dir = path.join(base, 'sub');
  assert.equal(lib.chooseDeckFile('.html', { dir }).reason, 'unread');
  const r = runQa(dir, 'handout.mjs');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /_quarto\.yml/);
});

test('#54 verify: the message gives the settings file name as it is on disk', () => {
  const base = nested({ '_Quarto.yml': 'project:\n  output-dir: _out\n', 'sub/deck.qmd': QMD, 'sub/deck.html': '<html></html>' });
  if (!existsSync(path.join(base, '_quarto.yml'))) return;   // a case-sensitive disk: Quarto does not see _Quarto.yml either
  const r = lib.chooseDeckFile('.html', { dir: path.join(base, 'sub') });
  assert.deepEqual(r.unread.map((u) => u.file), [path.join('..', '_Quarto.yml')]);
});

// verify round 2 of #54 (Codex)
test('#54 verify r2: when both spellings are on a case-sensitive disk, the one Quarto reads is named', (t) => {
  const base = nested({ '_Quarto.yml': 'x: 1\n', 'sub/deck.qmd': QMD, 'sub/deck.html': '<html></html>' });
  if (existsSync(path.join(base, '_quarto.yml'))) return t.skip('a case-insensitive disk holds only one of the two names');
  writeFileSync(path.join(base, '_quarto.yml'), 'project:\n  output-dir: _out\n');
  const r = lib.chooseDeckFile('.html', { dir: path.join(base, 'sub') });
  assert.deepEqual(r.unread.map((u) => u.file), [path.join('..', '_quarto.yml')]);
});
