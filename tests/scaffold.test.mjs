// Tests for slide-deck-scaffold/scripts/scaffold.mjs (issue #8). Run with: node --test tests/
// Every command-line test runs with HOME pointed at a temporary folder, so the real
// ~/.claude/.academic-slides is never read or written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'plugins/academic-slides/skills/slide-deck-scaffold');
const SCAFFOLD = path.join(SKILL, 'scripts/scaffold.mjs');
const OFFICIAL_THEME = path.join(SKILL, 'templates/quarto/_theme/deck.scss');
const lib = await import(SCAFFOLD);

function sandbox() {
  // realpath: on macOS the temporary folder is reached through a /var -> /private/var link
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'scaffold-test-')));
  const home = path.join(base, 'home');
  const project = path.join(home, 'work', 'project');
  mkdirSync(project, { recursive: true });
  return { base, home, project, personal: path.join(home, '.claude', '.academic-slides') };
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}

function run(args, home) {
  const r = spawnSync(process.execPath, [SCAFFOLD, ...args], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

function frontMatter(qmd) {
  const m = qmd.match(/^---\n([\s\S]*?)\n---\n/);
  return m ? m[1] : '';
}

function makeTemplate(dir, { theme = true, extra = {} } = {}) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'talk.qmd'), '---\ntitle: "T"\nauthor: "Speaker Name"\ninstitute: "Institution"\nlang: en\n---\n\n## Slide\n\nBody\n');
  writeFileSync(path.join(dir, '_quarto.yml'), `format:\n  revealjs:\n${theme ? '    theme: [default, _theme/deck.scss]\n' : ''}    footer: "Venue · Date"\n`);
  for (const [name, content] of Object.entries(extra)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }
}

// ---------- layer discovery ----------

test('findProjectDir returns the nearest .claude/.academic-slides above the deck folder', () => {
  const s = sandbox();
  mkdirSync(path.join(s.home, 'work', '.claude', '.academic-slides'), { recursive: true });
  mkdirSync(path.join(s.project, '.claude', '.academic-slides'), { recursive: true });
  const found = lib.findProjectDir(path.join(s.project, 'talks', 'new-deck'), s.home);
  assert.equal(found, path.join(s.project, '.claude', '.academic-slides'));
});

test('findProjectDir never treats the personal folder in the home directory as a project layer', () => {
  const s = sandbox();
  mkdirSync(s.personal, { recursive: true });
  assert.equal(lib.findProjectDir(path.join(s.project, 'deck'), s.home), null);
});

test('findProjectDir returns null when no project folder exists', () => {
  const s = sandbox();
  assert.equal(lib.findProjectDir(path.join(s.project, 'deck'), s.home), null);
});

test('personalDir is .claude/.academic-slides under the home directory', () => {
  assert.equal(lib.personalDir('/h'), path.join('/h', '.claude', '.academic-slides'));
});

// ---------- reading settings ----------

test('readSettings returns empty settings when local.json is absent', () => {
  const s = sandbox();
  assert.deepEqual(lib.readSettings(s.personal), { settings: {}, warnings: [] });
});

test('readSettings keeps the known fields, including null, and warns about unknown ones', () => {
  const s = sandbox();
  writeJson(path.join(s.personal, 'local.json'), { author: 'A. Person', affiliation: null, colour: 'red' });
  const r = lib.readSettings(s.personal);
  assert.deepEqual(r.settings, { author: 'A. Person', affiliation: null });
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /colour/);
});

test('readSettings rejects a value of the wrong type, naming the file and the field', () => {
  const s = sandbox();
  writeJson(path.join(s.personal, 'local.json'), { author: 42 });
  assert.throws(() => lib.readSettings(s.personal), (e) => /local\.json/.test(e.message) && /author/.test(e.message));
});

test('readSettings rejects JSON that is not an object', () => {
  const s = sandbox();
  writeJson(path.join(s.personal, 'local.json'), '["author"]');
  assert.throws(() => lib.readSettings(s.personal), /object/);
});

test('readSettings rejects malformed JSON, naming the file', () => {
  const s = sandbox();
  writeJson(path.join(s.personal, 'local.json'), '{ "author": ');
  assert.throws(() => lib.readSettings(s.personal), /local\.json/);
});

// ---------- merging ----------

test('mergeSettings applies project over personal over official, and records the source of each field', () => {
  const merged = lib.mergeSettings([
    { layer: 'personal', settings: { author: 'A. Person', affiliation: 'Some Institute', lang: 'zh-TW' } },
    { layer: 'project', settings: { affiliation: null, template: 'research-talk' } },
  ]);
  assert.deepEqual(merged.author, { value: 'A. Person', from: 'personal' });
  assert.deepEqual(merged.affiliation, { value: null, from: 'project' });
  assert.deepEqual(merged.template, { value: 'research-talk', from: 'project' });
  assert.deepEqual(merged.lang, { value: 'zh-TW', from: 'personal' });
  assert.equal(merged.footer, undefined);
});

test('mergeSettings lets the command line override every layer', () => {
  const merged = lib.mergeSettings([
    { layer: 'project', settings: { template: 'research-talk' } },
    { layer: 'command line', settings: { template: 'lecture' } },
  ]);
  assert.deepEqual(merged.template, { value: 'lecture', from: 'command line' });
});

// ---------- template resolution ----------

test('resolveTemplate prefers project, then personal, then official, and lists what it shadowed', () => {
  const s = sandbox();
  const official = path.join(s.base, 'official');
  makeTemplate(path.join(official, 'short-talk'));
  makeTemplate(path.join(s.personal, 'templates', 'short-talk'));
  const projectDir = path.join(s.project, '.claude', '.academic-slides');
  makeTemplate(path.join(projectDir, 'templates', 'short-talk'));
  const r = lib.resolveTemplate('short-talk', { projectDir, personalDir: s.personal, officialDir: official });
  assert.equal(r.layer, 'project');
  assert.equal(r.dir, path.join(projectDir, 'templates', 'short-talk'));
  assert.deepEqual(r.shadowed, ['personal', 'official']);
});

test('resolveTemplate rejects names that are not lower-case words joined by hyphens', () => {
  for (const bad of ['../x', 'A', '', '_theme', 'a/b', '-x']) {
    assert.throws(() => lib.resolveTemplate(bad, { projectDir: null, personalDir: '/nope', officialDir: '/nope' }), /name/, bad);
  }
});

test('resolveTemplate stops when the chosen folder is incomplete instead of falling through', () => {
  const s = sandbox();
  const official = path.join(s.base, 'official');
  makeTemplate(path.join(official, 'short-talk'));
  mkdirSync(path.join(s.personal, 'templates', 'short-talk'), { recursive: true });
  writeFileSync(path.join(s.personal, 'templates', 'short-talk', 'talk.qmd'), '---\ntitle: x\n---\n');
  assert.throws(() => lib.resolveTemplate('short-talk', { projectDir: null, personalDir: s.personal, officialDir: official }), /_quarto\.yml/);
});

test('resolveTemplate reports an unknown template with the names that exist', () => {
  const s = sandbox();
  const official = path.join(s.base, 'official');
  makeTemplate(path.join(official, 'research-talk'));
  assert.throws(() => lib.resolveTemplate('nope', { projectDir: null, personalDir: s.personal, officialDir: official }), /research-talk/);
});

// ---------- rewriting ----------

test('rewriteFrontMatter replaces, removes, and inserts single-line fields and keeps the rest', () => {
  const qmd = '---\ntitle: "T"\nauthor: "Speaker Name"\ninstitute: "Institution"\ndate: 2026-01-01\n---\n\n## A\n';
  const out = lib.rewriteFrontMatter(qmd, { author: 'A. Person', institute: null, lang: 'zh-TW' });
  const fm = frontMatter(out);
  assert.match(fm, /^author: "A\. Person"$/m);
  assert.doesNotMatch(fm, /^institute:/m);
  assert.match(fm, /^lang: "zh-TW"$/m);
  assert.match(fm, /^date: 2026-01-01$/m);
  assert.ok(out.endsWith('\n## A\n'));
});

test('rewriteFrontMatter leaves fields alone when the value is undefined', () => {
  const qmd = '---\ntitle: "T"\nauthor: "Speaker Name"\n---\n';
  assert.equal(lib.rewriteFrontMatter(qmd, { author: undefined }), qmd);
});

test('rewriteFrontMatter refuses a file without front matter', () => {
  assert.throws(() => lib.rewriteFrontMatter('## no front matter\n', { author: 'x' }), /front matter/);
});

test('rewriteQuartoYml sets the theme list and replaces or removes the footer', () => {
  const yml = 'format:\n  revealjs:\n    theme: [default, _theme/deck.scss]\n    footer: "Venue · Date"\n';
  const out = lib.rewriteQuartoYml(yml, { theme: ['default', '_theme/deck.scss', 'theme/personal.scss'], footer: 'Seminar · 2026' });
  assert.match(out, /^    theme: \[default, _theme\/deck\.scss, theme\/personal\.scss\]$/m);
  assert.match(out, /^    footer: "Seminar · 2026"$/m);
  assert.doesNotMatch(lib.rewriteQuartoYml(yml, { theme: ['default'], footer: null }), /footer:/);
});

test('rewriteQuartoYml refuses a _quarto.yml without a theme line', () => {
  assert.throws(() => lib.rewriteQuartoYml('format:\n  revealjs:\n    footer: "x"\n', { theme: ['default'] }), /theme/);
});

// ---------- command line ----------

test('CLI: project settings override personal ones, null removes the field, and sources are printed', () => {
  const s = sandbox();
  writeJson(path.join(s.personal, 'local.json'), { author: 'A. Person', affiliation: 'Some Institute', template: 'no-such-template' });
  writeJson(path.join(s.project, '.claude', '.academic-slides', 'local.json'), { affiliation: null, template: 'research-talk' });
  const out = path.join(s.project, 'decks', 'first');
  const r = run(['--out', out], s.home);
  assert.equal(r.code, 0, r.out);
  const fm = frontMatter(readFileSync(path.join(out, 'talk.qmd'), 'utf8'));
  assert.match(fm, /^author: "A\. Person"$/m);
  assert.doesNotMatch(fm, /^institute:/m);
  assert.match(r.out, /author\s.*personal/);
  assert.match(r.out, /affiliation\s.*project/);
  assert.match(r.out, /template\s.*project/);
});

test('CLI: invalid settings stop before anything is written', () => {
  const s = sandbox();
  writeJson(path.join(s.project, '.claude', '.academic-slides', 'local.json'), { author: 42 });
  const out = path.join(s.project, 'deck');
  const r = run(['--out', out], s.home);
  assert.equal(r.code, 1);
  assert.match(r.out, /local\.json/);
  assert.match(r.out, /author/);
  assert.equal(existsSync(out), false);
});

test('CLI: a personal template shadows the official one, its deck.scss is ignored, and the official theme is copied', () => {
  const s = sandbox();
  makeTemplate(path.join(s.personal, 'templates', 'research-talk'), { extra: { 'theme/deck.scss': '/* mine */\n', 'img/logo.txt': 'logo' } });
  const out = path.join(s.project, 'deck');
  const r = run(['--out', out, '--template', 'research-talk'], s.home);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /personal/);
  assert.match(r.out, /shadow/i);
  assert.match(r.out, /deck\.scss/);
  assert.equal(readFileSync(path.join(out, '_theme', 'deck.scss'), 'utf8'), readFileSync(OFFICIAL_THEME, 'utf8'));
  assert.equal(existsSync(path.join(out, 'theme', 'deck.scss')), false);
  assert.equal(readFileSync(path.join(out, 'img', 'logo.txt'), 'utf8'), 'logo');
});

test('CLI: personal and project theme.scss become theme overlays listed after the official theme', () => {
  const s = sandbox();
  writeJson(path.join(s.personal, 'theme.scss'), '/*-- scss:defaults --*/\n$deck-primary: #8b0000;\n');
  writeJson(path.join(s.project, '.claude', '.academic-slides', 'theme.scss'), '/*-- scss:rules --*/\n');
  const out = path.join(s.project, 'deck');
  const r = run(['--out', out, '--trust-project'], s.home);
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(path.join(out, '_quarto.yml'), 'utf8'), /theme: \[default, _theme\/deck\.scss, theme\/personal\.scss, theme\/project\.scss\]/);
  assert.match(readFileSync(path.join(out, 'theme', 'personal.scss'), 'utf8'), /8b0000/);
  assert.ok(existsSync(path.join(out, 'theme', 'project.scss')));
});

test('CLI: an existing deck is not overwritten', () => {
  const s = sandbox();
  const out = path.join(s.project, 'deck');
  mkdirSync(out);
  writeFileSync(path.join(out, 'talk.qmd'), 'keep me');
  const r = run(['--out', out], s.home);
  assert.equal(r.code, 1);
  assert.match(r.out, /not empty|already/);
  assert.equal(readFileSync(path.join(out, 'talk.qmd'), 'utf8'), 'keep me');
  assert.deepEqual(readdirSync(out), ['talk.qmd']);
});

test('CLI: an empty existing folder is accepted', () => {
  const s = sandbox();
  const out = path.join(s.project, 'deck');
  mkdirSync(out);
  assert.equal(run(['--out', out], s.home).code, 0);
  assert.ok(existsSync(path.join(out, 'talk.qmd')));
});

test('CLI: --out naming a file is refused', () => {
  const s = sandbox();
  const out = path.join(s.project, 'file.txt');
  writeFileSync(out, 'x');
  assert.equal(run(['--out', out], s.home).code, 1);
});

test('CLI: a dry run prints the resolution and writes nothing', () => {
  const s = sandbox();
  const out = path.join(s.project, 'deck');
  const r = run(['--out', out, '--dry-run'], s.home);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /research-talk/);
  assert.match(r.out, /theme/);
  assert.equal(existsSync(out), false);
});

test('CLI: --title replaces the front-matter title', () => {
  const s = sandbox();
  const out = path.join(s.project, 'deck');
  assert.equal(run(['--out', out, '--title', 'A "quoted" title'], s.home).code, 0);
  assert.match(frontMatter(readFileSync(path.join(out, 'talk.qmd'), 'utf8')), /^title: "A \\"quoted\\" title"$/m);
});

test('CLI: symbolic links inside a template are skipped with a warning', () => {
  const s = sandbox();
  const tpl = path.join(s.personal, 'templates', 'linked');
  makeTemplate(tpl);
  symlinkSync('/etc/hosts', path.join(tpl, 'hosts'));
  const out = path.join(s.project, 'deck');
  const r = run(['--out', out, '--template', 'linked'], s.home);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /link/);
  assert.equal(existsSync(path.join(out, 'hosts')), false);
});

test('CLI: --list prints each template with its layer and marks shadowed ones', () => {
  const s = sandbox();
  makeTemplate(path.join(s.personal, 'templates', 'research-talk'));
  makeTemplate(path.join(s.personal, 'templates', 'my-own'));
  const r = run(['--list', '--out', path.join(s.project, 'deck')], s.home);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /my-own\s+personal/);
  assert.match(r.out, /research-talk\s+personal/);
  assert.match(r.out, /research-talk\s+official.*shadowed/);
});

test('CLI: an invalid template name is refused', () => {
  const s = sandbox();
  assert.equal(run(['--out', path.join(s.project, 'deck'), '--template', '../x'], s.home).code, 1);
});

test('CLI: --help exits 0 and a missing --out exits 2', () => {
  const s = sandbox();
  const help = run(['--help'], s.home);
  assert.equal(help.code, 0);
  assert.match(help.out, /--out/);
  assert.equal(run([], s.home).code, 2);
});

// ---------- security: nothing read from a settings layer follows a link, runs code, or pulls in local data ----------

test('CLI: a template whose talk.qmd is a symbolic link is refused and nothing is written', () => {
  const s = sandbox();
  const tpl = path.join(s.personal, 'templates', 'linked-file');
  makeTemplate(tpl);
  writeFileSync(path.join(s.base, 'secret.txt'), 'secret');
  const real = path.join(tpl, 'talk.qmd');
  writeFileSync(real + '.bak', readFileSync(real));
  spawnSync('rm', [real]);
  symlinkSync(path.join(s.base, 'secret.txt'), real);
  const out = path.join(s.project, 'deck');
  const r = run(['--out', out, '--template', 'linked-file'], s.home);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /symbolic link/);
  assert.equal(existsSync(out), false);
});

test('CLI: a template folder that is a symbolic link is refused', () => {
  const s = sandbox();
  makeTemplate(path.join(s.base, 'elsewhere'));
  mkdirSync(path.join(s.personal, 'templates'), { recursive: true });
  symlinkSync(path.join(s.base, 'elsewhere'), path.join(s.personal, 'templates', 'linked-dir'));
  const r = run(['--out', path.join(s.project, 'deck'), '--template', 'linked-dir'], s.home);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /symbolic link/);
});

test('CLI: a theme.scss or local.json that is a symbolic link is refused', () => {
  for (const file of ['theme.scss', 'local.json']) {
    const s = sandbox();
    mkdirSync(s.personal, { recursive: true });
    writeFileSync(path.join(s.base, 'target'), file === 'local.json' ? '{}' : '/* x */');
    symlinkSync(path.join(s.base, 'target'), path.join(s.personal, file));
    const out = path.join(s.project, 'deck');
    const r = run(['--out', out], s.home);
    assert.equal(r.code, 1, `${file}: ${r.out}`);
    assert.match(r.out, /symbolic link/, file);
    assert.equal(existsSync(out), false, file);
  }
});

test('CLI: a project-layer template is used only with --trust-project, whatever it contains', () => {
  for (const extra of [{}, { '_quarto.yml': 'project:\n  pre-render: ./steal.sh\nformat:\n  revealjs:\n    theme: [default, _theme/deck.scss]\n    footer: "x"\n' }]) {
    const s = sandbox();
    const tpl = path.join(s.project, '.claude', '.academic-slides', 'templates', 'research-talk');
    makeTemplate(tpl);
    for (const [name, content] of Object.entries(extra)) writeFileSync(path.join(tpl, name), content);
    const out = path.join(s.project, 'deck');
    const r = run(['--out', out], s.home);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /--trust-project/);
    assert.match(r.out, /templates\/research-talk/);
    assert.equal(existsSync(out), false);
    assert.equal(run(['--out', out, '--trust-project'], s.home).code, 0);
  }
});

test('CLI: a project-layer theme.scss is used only with --trust-project', () => {
  const s = sandbox();
  writeJson(path.join(s.project, '.claude', '.academic-slides', 'theme.scss'), '@import "/etc/hosts";\n');
  const out = path.join(s.project, 'deck');
  const r = run(['--out', out], s.home);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /theme\.scss/);
  assert.match(r.out, /--trust-project/);
  assert.equal(existsSync(out), false);
});

test('CLI: personal templates are the user\'s own and need no flag', () => {
  const s = sandbox();
  makeTemplate(path.join(s.personal, 'templates', 'mine'), { extra: { 'run.lua': '-- a filter\n' } });
  assert.equal(run(['--out', path.join(s.project, 'deck'), '--template', 'mine'], s.home).code, 0);
});

test('CLI: project local.json settings need no flag', () => {
  const s = sandbox();
  writeJson(path.join(s.project, '.claude', '.academic-slides', 'local.json'), { author: null, footer: 'Seminar · 2026' });
  assert.equal(run(['--out', path.join(s.project, 'deck')], s.home).code, 0);
});

test('CLI: settings values with HTML, braces, or backticks are refused', () => {
  for (const bad of ['<script>alert(1)</script>', 'name {.hl-key}', '`{r} Sys.getenv()`']) {
    const s = sandbox();
    writeJson(path.join(s.personal, 'local.json'), { author: bad });
    const out = path.join(s.project, 'deck');
    const r = run(['--out', out], s.home);
    assert.equal(r.code, 1, `${bad}: ${r.out}`);
    assert.match(r.out, /author/, bad);
    assert.equal(existsSync(out), false, bad);
  }
});

test('CLI: a settings value containing a Quarto shortcode is refused', () => {
  const s = sandbox();
  writeJson(path.join(s.project, '.claude', '.academic-slides', 'local.json'), { footer: '{{< env GITHUB_TOKEN >}}' });
  const out = path.join(s.project, 'deck');
  const r = run(['--out', out], s.home);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /footer/);
  assert.match(r.out, /plain text/);
  assert.equal(existsSync(out), false);
});

test('CLI: official templates need no flag', () => {
  const s = sandbox();
  for (const t of readdirSync(path.join(SKILL, 'templates/quarto')).filter((n) => !n.startsWith('_'))) {
    assert.equal(run(['--out', path.join(s.project, t), '--template', t], s.home).code, 0, t);
  }
});

test('CLI: settings values with markdown links or images are refused', () => {
  for (const bad of ['![x](http://example.com/p.png)', '[click](javascript:alert(1))', 'Name [note]']) {
    const s = sandbox();
    writeJson(path.join(s.project, '.claude', '.academic-slides', 'local.json'), { footer: bad });
    const out = path.join(s.project, 'deck');
    const r = run(['--out', out], s.home);
    assert.equal(r.code, 1, `${bad}: ${r.out}`);
    assert.match(r.out, /footer/, bad);
    assert.equal(existsSync(out), false, bad);
  }
});

test('planDeck: when folder ownership cannot be checked, the project layer needs --trust-project', () => {
  const s = sandbox();
  writeJson(path.join(s.project, '.claude', '.academic-slides', 'local.json'), { footer: 'Seminar' });
  const out = path.join(s.project, 'deck');
  const original = process.getuid;
  process.getuid = undefined;
  try {
    assert.throws(() => lib.planDeck({ out, home: s.home }), /--trust-project/);
    assert.doesNotThrow(() => lib.planDeck({ out, home: s.home, trustProject: true }));
  } finally {
    process.getuid = original;
  }
});
