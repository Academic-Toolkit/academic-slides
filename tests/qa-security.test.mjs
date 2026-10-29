// Real filesystem, loopback HTTP, and Chromium regressions for the QA trust boundaries.
// All documents are local fixtures; no CDN or real user data is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { get } from 'node:http';
import { mkdtemp, mkdir, writeFile, appendFile, readFile, symlink, link, lstat, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../plugins/academic-slides/skills/slide-qa/scripts/_lib.mjs';

const QA = fileURLToPath(new URL('../plugins/academic-slides/skills/slide-qa/scripts/', import.meta.url));
const run = promisify(execFile);
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function fixture(t) {
  const base = await mkdtemp(path.join(tmpdir(), 'qa-security-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const deck = path.join(base, 'deck');
  const outside = path.join(base, 'deck-other');
  await mkdir(deck);
  await mkdir(outside);
  await writeFile(path.join(outside, 'private.txt'), 'KEEP OUTSIDE DATA');
  return { base, deck, outside };
}

function request(port, url, host = `127.0.0.1:${port}`) {
  return new Promise((resolve, reject) => {
    const req = get({ hostname: '127.0.0.1', port, path: url, headers: { Host: host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (part) => { body += part; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('HTTP timeout')));
  });
}

async function start(t, root) {
  const { server, port } = await serve(root);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  assert.equal(server.address().address, '127.0.0.1');
  return port;
}

test('HTTP refuses file, directory, and chained symlinks that leave the deck', async (t) => {
  const { deck, outside } = await fixture(t);
  await symlink(path.join(outside, 'private.txt'), path.join(deck, 'file.txt'));
  await symlink(outside, path.join(deck, 'assets'), 'dir');
  await symlink('file.txt', path.join(deck, 'chain.txt'));
  const port = await start(t, deck);
  for (const url of ['/file.txt', '/assets/private.txt', '/chain.txt']) {
    const result = await request(port, url);
    assert.equal(result.status, 404, url);
    assert.equal(result.body.includes('KEEP OUTSIDE DATA'), false, url);
  }
});

test('HTTP preserves encoded names, queries, internal links, and a symlinked deck root', async (t) => {
  const { base, deck } = await fixture(t);
  await writeFile(path.join(deck, 'a#b%c?.html'), '<h1>LOCAL DECK</h1>');
  await mkdir(path.join(deck, 'assets'));
  await writeFile(path.join(deck, 'assets', 'app.js'), 'LOCAL ASSET');
  await symlink('assets', path.join(deck, 'alias'), 'dir');
  await symlink(deck, path.join(base, 'chosen-root'), 'dir');
  const port = await start(t, path.join(base, 'chosen-root'));
  assert.deepEqual(await request(port, '/a%23b%25c%3F.html?print-pdf'), { status: 200, body: '<h1>LOCAL DECK</h1>' });
  assert.deepEqual(await request(port, '/alias/app.js'), { status: 200, body: 'LOCAL ASSET' });
  assert.equal((await request(port, '/alias/app.js', `localhost:${port}`)).status, 200);
  assert.equal((await request(port, '/alias/app.js', `foreign.invalid:${port}`)).status, 403);
  assert.equal((await request(port, '/%2e%2e/deck-other/private.txt')).status, 404);
  assert.equal((await request(port, '/../deck-other/private.txt')).status, 404);
});

test('HTTP rejects dangling links, loops, directories, and missing files', async (t) => {
  const { deck } = await fixture(t);
  await symlink('missing.txt', path.join(deck, 'dangling.txt'));
  await symlink('loop.txt', path.join(deck, 'loop.txt'));
  await mkdir(path.join(deck, 'directory'));
  const port = await start(t, deck);
  for (const url of ['/dangling.txt', '/loop.txt', '/directory', '/missing.txt']) {
    assert.equal((await request(port, url)).status, 404, url);
  }
});

// A tiny, offline deck implementing only the Reveal surface used by the QA tools.
// Chromium performs actual DOM measurement, screenshots, and PDF generation.
async function html(dir, name = 'talk.html', overflow = false) {
  const file = path.join(dir, name);
  await writeFile(file, `<!doctype html><meta charset="utf-8">
<style>
body { margin: 0; background: white; }
.reveal .slides { width: 1280px; height: 600px; }
.pdf-page { width: 1280px; height: 720px; }
section { width: 1280px; }
h2 { margin: 0; font: 24px/30px sans-serif; }
.footer { position: fixed; top: 680px; }
</style>
<div class="reveal"><div class="slides"><div class="pdf-page"><section class="present">
<h2>Security fixture</h2><p>Local content.</p>${overflow ? '<table style="width:1600px"><tr><td>Overflow</td></tr></table>' : ''}
</section></div></div><div class="footer">Footer</div></div>
<script>window.Reveal = { isReady: () => true, configure() {}, slide() {}, next() {},
getCurrentSlide: () => document.querySelector('section'), isLastSlide: () => true, getTotalSlides: () => 1 };</script>`);
  return file;
}

async function cli(script, args) {
  try {
    const result = await run(process.execPath, [path.join(QA, script), ...args], { timeout: 60000 });
    return { code: 0, output: result.stdout + result.stderr };
  } catch (error) {
    if (typeof error.code !== 'number') throw error;
    return { code: error.code, output: error.stdout + error.stderr };
  }
}

test('all screenshot sinks replace links without changing their outside targets', async (t) => {
  const { deck, outside } = await fixture(t);
  const file = await html(deck, 'talk.html', true);
  const out = path.join(deck, 'qa');
  await mkdir(out);
  const names = ['talk-00.png', 'talk-00-flagged.png', 'talk-print-01-flagged.png'];
  for (const name of names) {
    await writeFile(path.join(outside, name), 'KEEP OUTSIDE DATA');
    await symlink(path.join(outside, name), path.join(out, name));
  }
  const result = await cli('check-layout.mjs', ['--html', file, '--shots']);
  assert.equal(result.code, 1, result.output);
  for (const name of names) {
    assert.ok((await readFile(path.join(outside, name))).equals(Buffer.from('KEEP OUTSIDE DATA')), `${name}: outside target changed`);
    assert.equal((await lstat(path.join(out, name))).isSymbolicLink(), false, name);
    assert.deepEqual((await readFile(path.join(out, name))).subarray(0, 8), PNG, name);
  }
  assert.deepEqual((await readdir(out)).sort(), [...names].sort());
});

test('default qa directory cannot redirect screenshots outside the deck', async (t) => {
  const { deck, outside } = await fixture(t);
  await symlink(outside, path.join(deck, 'qa'), 'dir');
  const result = await cli('check-layout.mjs', ['--html', await html(deck), '--shots']);
  assert.equal(result.code, 3, result.output);
  assert.deepEqual(await readdir(outside), ['private.txt']);
});

test('print metadata must be numeric before forming output filenames', async (t) => {
  const { deck } = await fixture(t);
  const file = await html(deck, 'talk.html', true);
  await appendFile(file, `<script>
let measure;
Object.defineProperty(window, '__slideQaMeasure', {
  set(fn) { measure = fn; },
  get() { return (...args) => ({ ...measure(...args), page: 'invalid-page' }); }
});
</script>`);
  const result = await cli('check-layout.mjs', ['--html', file]);
  assert.equal(result.code, 3, result.output);
  assert.equal((await readdir(path.join(deck, 'qa'))).some((name) => name.includes('invalid-page')), false);
});

test('internal qa alias and reruns preserve normal screenshot output', async (t) => {
  const { base, deck } = await fixture(t);
  const out = path.join(deck, 'screenshots');
  await mkdir(out);
  await symlink('screenshots', path.join(deck, 'qa'), 'dir');
  await symlink(deck, path.join(base, 'deck-alias'), 'dir');
  await html(deck);
  const args = ['--html', path.join(base, 'deck-alias', 'talk.html'), '--shots'];
  for (let i = 0; i < 2; i++) {
    const result = await cli('check-layout.mjs', args);
    assert.equal(result.code, 0, result.output);
    assert.deepEqual((await readFile(path.join(out, 'talk-00.png'))).subarray(0, 8), PNG);
  }
});

test('explicit nested output works and does not follow dangling files or hardlinks', async (t) => {
  const { deck, outside } = await fixture(t);
  const out = path.join(outside, 'chosen', 'nested');
  const file = await html(deck, 'a#b%c?.html');
  const args = ['--html', file, '--out', out, '--shots'];
  const first = await cli('check-layout.mjs', args);
  assert.equal(first.code, 0, first.output);
  const image = path.join(out, 'a#b%c?-00.png');
  await rm(image);
  const danglingTarget = path.join(outside, 'must-not-create');
  await symlink(danglingTarget, image);
  const second = await cli('check-layout.mjs', args);
  assert.equal(second.code, 0, second.output);
  await assert.rejects(lstat(danglingTarget), { code: 'ENOENT' });
  await rm(image);
  await link(path.join(outside, 'private.txt'), image);
  const third = await cli('check-layout.mjs', args);
  assert.equal(third.code, 0, third.output);
  assert.ok((await readFile(path.join(outside, 'private.txt'))).equals(Buffer.from('KEEP OUTSIDE DATA')), 'hardlink target changed');
});

test('PDF export replaces an existing output symlink and still supports custom paths', async (t) => {
  const { deck, outside } = await fixture(t);
  const file = await html(deck);
  const pdf = path.join(deck, 'talk.pdf');
  await symlink(path.join(outside, 'private.txt'), pdf);
  const result = await cli('export-pdf.mjs', ['--html', file]);
  assert.equal(result.code, 0, result.output);
  assert.ok((await readFile(path.join(outside, 'private.txt'))).equals(Buffer.from('KEEP OUTSIDE DATA')), 'PDF symlink target changed');
  assert.equal((await lstat(pdf)).isSymbolicLink(), false);
  assert.equal((await readFile(pdf)).subarray(0, 5).toString(), '%PDF-');
  const custom = path.join(outside, 'new', 'output.pdf');
  const second = await cli('export-pdf.mjs', ['--html', file, '--out', custom]);
  assert.equal(second.code, 0, second.output);
  assert.equal((await readFile(custom)).subarray(0, 5).toString(), '%PDF-');
});
