// Tests for slide-qa/scripts/handout.mjs and _handout.mjs (issue #34). Run with: node --test tests/
// The geometry targets are the numbers in the issue: landscape A4 2×2 → 132.5 × 74.5 mm with
// 26.5 mm above and below; portrait A4 3 rows × 2 columns → 89.0 × 50.1 mm with 65.4 mm above and below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'plugins/academic-slides/skills/slide-qa/scripts');
const HANDOUT = path.join(SCRIPTS, 'handout.mjs');
const lib = await import(path.join(SCRIPTS, '_handout.mjs'));

const near = (actual, expected, tol = 0.05) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected} ± ${tol}, got ${actual}`);
const A4L = { paperW: 297, paperH: 210 };
const A4P = { paperW: 210, paperH: 297 };

test('landscape 2×2 preset: 132.5 × 74.5 mm slides, centred with 26.5 mm above and below', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2 });
  near(g.slideW, 132.5);
  near(g.slideH, 74.5, 0.06);
  near(g.left, 12);
  near(g.top, 26.5, 0.06);
  near(210 - (g.top + g.gridH), 26.5, 0.06);
  assert.equal(g.bound, 'width');
});

test('portrait 3 rows × 2 columns preset: 89.0 × 50.1 mm slides, centred with 65.4 mm above and below', () => {
  const g = lib.geometry({ ...A4P, rows: 3, cols: 2 });
  near(g.slideW, 89.0);
  near(g.slideH, 50.1, 0.06);
  near(g.left, 12);
  near(g.top, 65.4, 0.1);
  near(297 - (g.top + g.gridH), 65.4, 0.1);
});

test('header and footer bands leave both presets unchanged', () => {
  for (const [paper, rows, cols] of [[A4L, 2, 2], [A4P, 3, 2]]) {
    const plain = lib.geometry({ ...paper, rows, cols });
    const banded = lib.geometry({ ...paper, rows, cols, headerBand: 8, footerBand: 8 });
    near(banded.slideW, plain.slideW, 1e-9);
    near(banded.top, plain.top, 1e-9);
  }
});

test('cells run left to right, then top to bottom, one gap apart', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2 });
  assert.equal(g.cells.length, 4);
  near(g.cells[1].x - g.cells[0].x, 132.5 + 8);
  near(g.cells[1].y, g.cells[0].y, 1e-9);
  near(g.cells[2].y - g.cells[0].y, 74.53 + 8, 0.06);
  near(g.cells[2].x, g.cells[0].x, 1e-9);
});

test('a tall grid is bound by the height and centred horizontally', () => {
  const g = lib.geometry({ ...A4L, rows: 3, cols: 1 });
  assert.equal(g.bound, 'height');
  near(g.top, 12);
  near(g.gridH, 186);
  near(g.left, (297 - g.slideW) / 2, 1e-9);
});

test('the aspect ratio of the deck sets the slide height', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2, aspect: 4 / 3 });
  near(g.slideH, g.slideW * 3 / 4, 1e-9);
});

test('a grid that does not fit on the page is refused', () => {
  assert.throws(() => lib.geometry({ ...A4L, rows: 2, cols: 40 }), /does not fit/);
});

test('texEscape escapes the LaTeX special characters and keeps CJK text', () => {
  assert.equal(lib.texEscape('A & B: 50% #1_x $y$ {z} ~ ^ \\'),
    'A \\& B: 50\\% \\#1\\_x \\$y\\$ \\{z\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}');
  assert.equal(lib.texEscape('普通心理學\n第七週'), '普通心理學 第七週');
});

test('texFor: one sheet per four slides, every page referenced once, frames by default', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2, headerBand: 8, footerBand: 8 });
  const tex = lib.texFor({ geometry: g, paperW: 297, paperH: 210, pages: 5, title: 'Talk', pageNumbers: true });
  assert.equal((tex.match(/\\clearpage/g) || []).length, 2);
  for (let k = 1; k <= 5; k++) assert.equal((tex.match(new RegExp(`page=${k},`, 'g')) || []).length, 1);
  assert.match(tex, /draw=black, line width=0\.4pt/);
  assert.match(tex, /\{1 \/ 2\}/);
  assert.match(tex, /\{Talk\}/);
  assert.doesNotMatch(tex, /xeCJK/);
});

test('texFor: frame, header and page number can each be turned off', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2 });
  const tex = lib.texFor({ geometry: g, paperW: 297, paperH: 210, pages: 4, frame: false, title: '', pageNumbers: false });
  assert.doesNotMatch(tex, /draw=black/);
  assert.doesNotMatch(tex, /\/ 1\}/);
  assert.doesNotMatch(tex, /anchor=south west/);
});

test('texFor: a CJK title loads xeCJK with a fallback list, or the font the user named', () => {
  const g = lib.geometry({ ...A4L, rows: 2, cols: 2 });
  const auto = lib.texFor({ geometry: g, paperW: 297, paperH: 210, pages: 1, title: '普通心理學' });
  assert.match(auto, /\\usepackage\{xeCJK\}/);
  assert.match(auto, /\\IfFontExistsTF\{PingFang TC\}/);
  assert.match(auto, /HANDOUT: no CJK font/);
  const named = lib.texFor({ geometry: g, paperW: 297, paperH: 210, pages: 1, title: '普通心理學', cjkFont: 'Noto Sans CJK TC' });
  assert.match(named, /\\setCJKmainfont\{Noto Sans CJK TC\}/);
  assert.doesNotMatch(named, /IfFontExistsTF/);
});
