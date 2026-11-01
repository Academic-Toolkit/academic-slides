// Tests for how the slide-qa scripts read their options (issue #45): each script declares the options it
// takes, and an option given without a value, a value that is not a number in range, an unknown option, a
// stray argument, or an option given twice ends the script with status 2 and names the option, before the
// deck file is looked up. handout keeps its own reader (status 1, #34) and is covered by handout.test.mjs.
// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'plugins/academic-slides/skills/slide-qa');
const SCRIPTS = path.join(SKILL, 'scripts');
const lib = await import(path.join(SCRIPTS, '_lib.mjs'));

// What an option error looks like; a deck-lookup error (no deck in an empty folder) does not match.
const OPTION_ERROR = /needs a value|needs a file name|must be a|unknown option|unexpected argument|more than once/;

const emptyFolder = () => realpathSync(mkdtempSync(path.join(tmpdir(), 'options-test-')));

function runIn(dir, script, args = []) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  return { code: r.status, out: r.stdout + r.stderr };
}

// ---------- parseOptions ----------

const SPEC = {
  html: 'file',
  out: 'text',
  'skip-classes': 'list',
  threshold: { min: 0, max: 1 },
  width: { min: 1, integer: true },
  words: { min: 0, integer: true },
  shots: 'flag',
};

const parse = (argv) => lib.parseOptions(argv, SPEC);
const refused = (argv, pattern) => assert.throws(() => parse(argv), (e) => e instanceof lib.OptionError && pattern.test(e.message));

test('parseOptions returns the values given, numbers as numbers, and the flags', () => {
  const o = parse(['--html', 'w07.html', '--width', '1920', '--threshold', '0.5', '--shots', '--out', 'qa2']);
  assert.equal(o.get('html'), 'w07.html');
  assert.equal(o.get('width', 1280), 1920);
  assert.equal(o.get('threshold', 0.7), 0.5);
  assert.equal(o.get('out'), 'qa2');
  assert.equal(o.has('shots'), true);
  assert.equal(o.has('out'), true);
});

test('parseOptions gives the fallback for an option that is not given', () => {
  const o = parse([]);
  assert.equal(o.get('width', 1280), 1280);
  assert.equal(o.get('html'), undefined);
  assert.equal(o.has('shots'), false);
  assert.equal(o.has('out'), false);
});

test('a valued option given last is refused and named', () => {
  refused(['--threshold'], /^--threshold needs a value/);
  refused(['--html', 'a.html', '--out'], /^--out needs a value/);
});

test('a valued option followed by another option is refused and named', () => {
  refused(['--out', '--shots'], /^--out needs a value/);
  refused(['--width', '--height', '720'], /^--width needs a value/);
});

test('a file option without a value keeps the file-name message', () => {
  refused(['--html'], /^--html needs a file name/);
  refused(['--html', '--shots'], /^--html needs a file name/);
});

test('an empty value is refused, except for a list', () => {
  refused(['--out', ''], /^--out needs a value/);
  refused(['--html', ''], /^--html needs a file name/);
  refused(['--width', ''], /^--width must be a whole number of at least 1 \(got ""\)/);
  assert.deepEqual(parse(['--skip-classes', '']).get('skip-classes'), '');
});

test('a value that is not a number, or out of range, is refused with the value shown', () => {
  refused(['--threshold', 'abc'], /^--threshold must be a number from 0 to 1 \(got "abc"\)/);
  refused(['--threshold', '1.5'], /^--threshold must be a number from 0 to 1 \(got "1.5"\)/);
  refused(['--threshold', '-0.1'], /^--threshold must be a number from 0 to 1/);
  refused(['--width', '12.5'], /^--width must be a whole number of at least 1 \(got "12.5"\)/);
  refused(['--width', '0'], /^--width must be a whole number of at least 1/);
  refused(['--words', '-1'], /^--words must be a whole number of at least 0/);
  refused(['--width', 'Infinity'], /^--width must be a whole number/);
  assert.equal(parse(['--threshold', '0']).get('threshold'), 0);
  assert.equal(parse(['--threshold', '1']).get('threshold'), 1);
  assert.equal(parse(['--words', '0']).get('words'), 0);
});

test('an unknown option is refused, so a typo does not run with the default', () => {
  refused(['--treshold', '0.5'], /^unknown option --treshold/);
  // --threshold=0.5 has its own message: see the test for --option=value below
});

test('an argument that belongs to no option is refused', () => {
  refused(['w07.html'], /^unexpected argument w07\.html/);
  refused(['--shots', 'extra'], /^unexpected argument extra/);
  refused(['-x'], /^unexpected argument -x/);
});

test('an option given twice is refused', () => {
  refused(['--width', '800', '--width', '900'], /^--width is given more than once/);
  refused(['--shots', '--shots'], /^--shots is given more than once/);
});

test('control characters in a refused argument are printed as ?', () => {
  refused(['--bad\u001b[31m'], /^unknown option --bad\?\[31m/);
});

test('a number value that starts with a single minus sign is read as a value, not as an option', () => {
  refused(['--width', '-5'], /^--width must be a whole number of at least 1 \(got "-5"\)/);
});

// ---------- the scripts ----------

const SCRIPT_OPTIONS = {
  'check-density.mjs': { file: 'qmd', valued: ['tex', 'words', 'bullets', 'skip-classes', 'skip-macros'], number: 'words' },
  'check-fill.mjs': { file: 'html', valued: ['threshold', 'width', 'height', 'footer'], number: 'threshold' },
  'check-layout.mjs': { file: 'html', valued: ['width', 'height', 'footer', 'out'], number: 'width', flag: 'shots' },
  'check-mathjax.mjs': { file: 'html', valued: [] },
  'export-pdf.mjs': { file: 'html', valued: ['width', 'height', 'out'], number: 'height' },
};

for (const [script, o] of Object.entries(SCRIPT_OPTIONS)) {
  test(`${script}: option errors exit 2 and name the option before the deck is looked up`, () => {
    const dir = emptyFolder();
    for (const name of o.valued) {
      let r = runIn(dir, script, [`--${name}`]);
      assert.equal(r.code, 2, `${script} --${name} last`);
      assert.match(r.out, new RegExp(`--${name} needs a value`), `${script} --${name} last`);
      r = runIn(dir, script, [`--${name}`, `--${o.file}`, 'x']);
      assert.equal(r.code, 2, `${script} --${name} followed by an option`);
      assert.match(r.out, new RegExp(`--${name} needs a value`), `${script} --${name} followed by an option`);
    }
    if (o.number) {
      const r = runIn(dir, script, [`--${o.number}`, 'abc']);
      assert.equal(r.code, 2, `${script} --${o.number} abc`);
      assert.match(r.out, new RegExp(`--${o.number} must be a`), `${script} --${o.number} abc`);
    }
    let r = runIn(dir, script, ['--no-such-option']);
    assert.equal(r.code, 2, `${script} unknown option`);
    assert.match(r.out, /unknown option --no-such-option/);
    r = runIn(dir, script, ['deck.html']);
    assert.equal(r.code, 2, `${script} stray argument`);
    assert.match(r.out, /unexpected argument deck\.html/);
    if (o.flag) {
      r = runIn(dir, script, [`--${o.flag}`, `--${o.flag}`]);
      assert.equal(r.code, 2);
      assert.match(r.out, new RegExp(`--${o.flag} is given more than once`));
    }
  });
}

// Before #45 this ran with a NaN threshold: every comparison was false, so every slide "passed".
test('check-fill refuses a threshold that is not a number instead of running with NaN', () => {
  const r = runIn(emptyFolder(), 'check-fill.mjs', ['--threshold', 'abc']);
  assert.equal(r.code, 2);
  assert.match(r.out, /--threshold must be a number from 0 to 1 \(got "abc"\)/);
  assert.doesNotMatch(r.out, /NaN/);
});

// Every option in the SKILL.md table, with a value of the right kind, gets past the option check: in an
// empty folder the script then stops at the deck lookup or the missing file, not at the options.
const SAMPLE = {
  html: 'x.html', qmd: 'x.qmd', tex: 'x.tex', out: 'out', footer: '.reveal .footer', threshold: '0.70', width: '1280',
  height: '720', words: '35', bullets: '3', 'skip-classes': 'notes,hidden', 'skip-macros': 'simtag',
};

test('every option listed in slide-qa SKILL.md is accepted by its script', () => {
  const skill = readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');
  const rows = [...skill.matchAll(/^\| `([a-z-]+\.mjs)` \|.*\| ((?:`--[^`]+`(?:, )?)+) \|$/gm)];
  const scripts = rows.map((m) => m[1]).filter((s) => s !== 'handout.mjs');
  assert.deepEqual(scripts.sort(), Object.keys(SCRIPT_OPTIONS).sort(), 'the SKILL.md table lists the five scripts');
  for (const [, script, cell] of rows) {
    if (script === 'handout.mjs') continue;
    const args = [];
    for (const [, name] of cell.matchAll(/`--([a-z-]+)/g)) args.push(`--${name}`, ...(name in SAMPLE ? [SAMPLE[name]] : []));
    const r = runIn(emptyFolder(), script, args);
    assert.doesNotMatch(r.out, OPTION_ERROR, `${script} ${args.join(' ')}`);
    assert.equal(r.code, 2, `${script} stops at the missing deck: ${r.out}`);
  }
});

// verify round 1 (requirements): each script's --help lists every option error that exits 2
for (const script of Object.keys(SCRIPT_OPTIONS)) {
  test(`${script} --help names every kind of option error`, () => {
    const r = runIn(emptyFolder(), script, ['--help']);
    assert.equal(r.code, 0);
    for (const kind of [/without a (value|file name)/, /unknown option/, /argument that belongs to\s+no\s+option/, /given twice/]) assert.match(r.out, kind, `${script}: ${kind}`);
  });
}

// verify round 1 (requirements): the commands written in slide-qa SKILL.md and README.md pass the option reader
test('the slide-qa commands in SKILL.md and README.md pass the option reader', () => {
  const docs = [readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8'), readFileSync(path.join(ROOT, 'README.md'), 'utf8')].join('\n');
  const commands = [...docs.matchAll(/^node \S*?scripts\/((?:check-[a-z]+|export-pdf)\.mjs)([^#\n]*)/gm)];
  assert.ok(commands.length >= 9, `found ${commands.length} commands`);
  for (const [, script, rest] of commands) {
    const args = rest.trim().split(/\s+/).filter(Boolean).map((a) => a.replace(/<deck>/g, 'deck'));
    const r = runIn(emptyFolder(), script, args);
    assert.doesNotMatch(r.out, OPTION_ERROR, `${script} ${args.join(' ')}`);
  }
});

// verify round 1 (logic): a value of only spaces is as empty as no value
test('a value of only spaces is refused for text and file options', () => {
  refused(['--out', '  '], /^--out needs a value/);
  refused(['--html', ' '], /^--html needs a file name/);
});

// verify round 1 (Devil's Advocate): messages that say what is wrong
test('--option=value is refused with a message that shows the accepted form', () => {
  refused(['--threshold=0.5'], /^--threshold=0\.5: write the value after a space \(--threshold 0\.5\)/);
  refused(['--treshold=0.5'], /^unknown option --treshold=0\.5/);
});

test('an empty argument is shown as "" in the message', () => {
  refused([''], /^unexpected argument "" \(see --help\)/);
});

for (const script of Object.keys(SCRIPT_OPTIONS)) {
  test(`${script} --help says that Quarto settings it cannot read exit 2`, () => {
    assert.match(runIn(emptyFolder(), script, ['--help']).out, /Quarto settings/);
  });
}

// user decision 2026-11-01: an option given twice is refused by every entry point, handout too (status 1, #34)
test('handout refuses an option given twice, and its --help mentions Quarto settings', () => {
  const r = runIn(emptyFolder(), 'handout.mjs', ['--margin', '5', '--margin', '6']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /--margin is given more than once/);
  assert.match(runIn(emptyFolder(), 'handout.mjs', ['--help']).out, /Quarto settings/);
});
