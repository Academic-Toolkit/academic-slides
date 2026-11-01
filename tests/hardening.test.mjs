// Tests for issue #51: what the slide-qa scripts and the scaffold print and how long they take, when a deck folder or a
// template comes from elsewhere. Control characters (C0, DEL, C1) and bidirectional controls never reach the terminal,
// in the older messages too; a long render value is read in linear time. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QA = path.join(ROOT, 'plugins/academic-slides/skills/slide-qa/scripts');
const SCAFFOLD = path.join(ROOT, 'plugins/academic-slides/skills/slide-deck-scaffold/scripts/scaffold.mjs');
const lib = await import(path.join(QA, '_lib.mjs'));

// Every character that must not be printed as it is.
const UNSAFE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/;
const NASTY = '\u001b[2J\u007f\u009b31m‮evil⁦‏؜';
const emptyFolder = () => realpathSync(mkdtempSync(path.join(tmpdir(), 'hardening-test-')));

function run(file, args, cwd, env = {}) {
  const r = spawnSync(process.execPath, [file, ...args], { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 60000 });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('printable replaces control, DEL, C1 and bidirectional characters', () => {
  assert.equal(lib.printable(`a${NASTY}b`), 'a?[2J??31m?evil???b');
  assert.equal(lib.printable('W07_記憶 (上)・v2.qmd'), 'W07_記憶 (上)・v2.qmd');
});

test('the older slide-qa messages print given names through printable', () => {
  const dir = emptyFolder();
  let r = run(path.join(QA, 'check-mathjax.mjs'), ['--html', `x${NASTY}.html`], dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /HTML not found/);
  assert.doesNotMatch(r.out, UNSAFE);
  r = run(path.join(QA, 'check-density.mjs'), ['--qmd', `x${NASTY}.qmd`], dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /qmd not found/);
  assert.doesNotMatch(r.out, UNSAFE);
  writeFileSync(path.join(dir, 'deck.qmd'), '---\ntitle: "T"\n---\n\n## A\n\nShort.\n');
  r = run(path.join(QA, 'check-density.mjs'), ['--qmd', 'deck.qmd', '--tex', `x${NASTY}.tex`], dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /tex not found/);
  assert.doesNotMatch(r.out, UNSAFE);
});

test('a refused settings line with bidirectional controls is printed without them', () => {
  const dir = emptyFolder();
  writeFileSync(path.join(dir, 'deck.qmd'), '---\ntitle: "T"\n---\n\n## A\n');
  writeFileSync(path.join(dir, '_quarto.yml'), `project: {render: [deck.qmd]} # ${NASTY}\n`.replace(' # ', ' x'));
  const r = run(path.join(QA, 'check-density.mjs'), [], dir);
  assert.equal(r.code, 2, r.out);
  assert.doesNotMatch(r.out, UNSAFE);
});

test('a long render value is read in linear time', () => {
  const yml = `project:\n  render: [a.qmd${' '.repeat(150000)}x]\n`;
  const t0 = Date.now();
  lib.readQuartoYml(yml);
  lib.unreadQuartoLines(yml);
  assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0} ms`);
});

test('the scaffold prints names and template paths without control or bidirectional characters', () => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'hardening-scaffold-')));
  const home = path.join(base, 'home');
  const project = path.join(home, 'work');
  mkdirSync(project, { recursive: true });
  let r = run(SCAFFOLD, ['--name', `w${NASTY}`, '--out', 'deck'], project, { HOME: home });
  assert.equal(r.code, 2, r.out);
  assert.doesNotMatch(r.out, UNSAFE);
  r = run(SCAFFOLD, [`--x${NASTY}`], project, { HOME: home });
  assert.equal(r.code, 2, r.out);
  assert.doesNotMatch(r.out, UNSAFE);
  const tpl = path.join(home, '.claude', '.academic-slides', 'templates', 'odd');
  mkdirSync(tpl, { recursive: true });
  writeFileSync(path.join(tpl, 'talk.qmd'), '---\ntitle: "T"\nlang: en\n---\n\n## Slide\n');
  writeFileSync(path.join(tpl, '_quarto.yml'), 'format:\n  revealjs:\n    theme: [default, _theme/deck.scss]\n    footer: "V"\n');
  writeFileSync(path.join(tpl, `talk${NASTY}.html`), 'x');
  writeFileSync(path.join(tpl, `notes${NASTY}.md`), 'x');
  r = run(SCAFFOLD, ['--template', 'odd', '--name', 'w07', '--out', 'deck', '--dry-run'], project, { HOME: home });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, UNSAFE);
});

test('the YAML values the scaffold writes are unchanged by the printing fix', () => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'hardening-yaml-')));
  const home = path.join(base, 'home');
  mkdirSync(path.join(home, 'work'), { recursive: true });
  const r = run(SCAFFOLD, ['--name', 'w07', '--out', 'deck', '--title', 'A "quoted" title'], path.join(home, 'work'), { HOME: home });
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(path.join(home, 'work', 'deck', 'w07.qmd'), 'utf8'), /^title: "A \\"quoted\\" title"$/m);
});

// verify round 2 (Codex): handout's own messages too
test('handout prints an unknown option and a bad value without control or bidirectional characters', () => {
  const dir = emptyFolder();
  let r = run(path.join(QA, 'handout.mjs'), [`--bogus${NASTY}`], dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /unknown option/);
  assert.doesNotMatch(r.out, UNSAFE);
  r = run(path.join(QA, 'handout.mjs'), ['--margin', `x${NASTY}`], dir);
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.out, UNSAFE);
});

// verify round 2 (adversarial): names found in the folder and slide titles, and values that hold a line break
test('check-density prints a found file name and slide titles without control or bidirectional characters', () => {
  const dir = emptyFolder();
  writeFileSync(path.join(dir, `d${NASTY}.qmd`), `---\ntitle: "T"\n---\n\n## A \u001b]0;pwned\u0007 title\u202e\n\nShort.\n`);
  const r = run(path.join(QA, 'check-density.mjs'), [], dir);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, UNSAFE);
});

test('a line break inside a name the scaffold prints cannot start a line of its own', () => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'hardening-forge-')));
  const home = path.join(base, 'home');
  const project = path.join(home, 'work');
  mkdirSync(project, { recursive: true });
  const tpl = path.join(home, '.claude', '.academic-slides', 'templates', 'forge');
  mkdirSync(tpl, { recursive: true });
  writeFileSync(path.join(tpl, 'talk.qmd'), '---\ntitle: "T"\nlang: en\n---\n\n## Slide\n');
  writeFileSync(path.join(tpl, '_quarto.yml'), 'format:\n  revealjs:\n    theme: [default, _theme/deck.scss]\n    footer: "V"\n');
  symlinkSync('/nonexistent', path.join(tpl, 'x\nwarning: forged line'));
  const r = run(SCAFFOLD, ['--template', 'forge', '--name', 'w07', '--out', 'deck', '--dry-run'], project, { HOME: home });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /^warning: forged line/m);
});
