#!/usr/bin/env node
// Lay a deck's PDF out as an A4 handout (issue #34): landscape 2 × 2 or portrait 3 rows × 2 columns,
// or any rows × columns, with computed margins and gaps, a thin black frame around each slide, the deck
// title at the top and page numbers at the bottom. Takes any deck PDF: export-pdf.mjs output or a beamer PDF.
// The page is laid out by _handout.mjs and typeset by XeLaTeX, so the margins are exact rather than
// left to the printer dialog, and a Chinese title can go in the header.
import { spawnSync } from 'child_process';
import { mkdtempSync, copyFileSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { args } from './_lib.mjs';
import { PRESETS, A4, geometry, texFor } from './_handout.mjs';

const { get, has } = args(`Usage: node handout.mjs --pdf talk.pdf [--out talk-handout.pdf] [--landscape | --portrait]
         [--rows R --cols C] [--margin 12] [--gap 8] [--no-frame] [--frame-width 0.4]
         [--title "text"] [--no-header] [--no-page-numbers] [--cjk-font "PingFang TC"]
Presets: --landscape (the default) is 2 rows × 2 columns; --portrait is 3 rows × 2 columns.
--rows and --cols replace the preset grid. Margin and gap are in mm, the frame width in pt.
The header is the PDF's title (else the file name) unless --title or --no-header is given.
Needs XeLaTeX (TeX Live) and pdfinfo (poppler).
Exit status: 0 handout written, 1 failed (bad option, missing tool, LaTeX error), 2 PDF not found.`);

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function number(name, fallback, { min, integer = false }) {
  const raw = get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    fail(`--${name} must be ${integer ? 'a whole number' : 'a number'} of at least ${min} (got "${raw}")`);
  }
  return value;
}

// Options first, so a bad option is reported even when the PDF is also missing.
if (has('landscape') && has('portrait')) fail('Give --landscape or --portrait, not both.');
const orientation = has('portrait') ? 'portrait' : 'landscape';
if ((get('rows') === undefined) !== (get('cols') === undefined)) {
  fail('--rows and --cols go together: give both, or neither to use the preset grid.');
}
const rows = number('rows', PRESETS[orientation].rows, { min: 1, integer: true });
const cols = number('cols', PRESETS[orientation].cols, { min: 1, integer: true });
const margin = number('margin', 12, { min: 0 });
const gap = number('gap', 8, { min: 0 });
const frameWidth = number('frame-width', 0.4, { min: 0.05 });
const cjkFont = get('cjk-font', '');
if (cjkFont && !/^[\p{L}\p{N} ._-]+$/u.test(cjkFont)) fail(`--cjk-font takes a font name (letters, digits, spaces, . _ -); got "${cjkFont}"`);

const PDF = path.resolve(get('pdf', 'talk.pdf'));
if (!existsSync(PDF)) fail(`PDF not found: ${PDF} (export or compile the deck first)`, 2);
const stem = path.basename(PDF, path.extname(PDF));
const OUT = path.resolve(get('out', path.join(path.dirname(PDF), `${stem}-handout.pdf`)));
if (OUT === PDF) fail('--out must differ from --pdf; the handout would overwrite the deck.');

const info = spawnSync('pdfinfo', ['-enc', 'UTF-8', PDF], { encoding: 'utf8' });
if (info.error) fail('pdfinfo not found. Install poppler: brew install poppler (macOS) or apt install poppler-utils.');
if (info.status !== 0) fail(`pdfinfo could not read ${PDF}:\n${info.stderr.trim()}`);
const pages = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
const size = info.stdout.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m);
if (!pages || !size) fail(`pdfinfo did not report a page count and page size for ${PDF}.`);
const aspect = Number(size[1]) / Number(size[2]);

const title = has('no-header') ? '' : (get('title') ?? info.stdout.match(/^Title:\s+(.+)$/m)?.[1].trim() ?? stem);
const pageNumbers = !has('no-page-numbers');
const { paperW, paperH } = A4[orientation];

let g;
try {
  g = geometry({ paperW, paperH, rows, cols, margin, gap, aspect, headerBand: title ? 8 : 0, footerBand: pageNumbers ? 8 : 0 });
} catch (err) {
  fail(err.message);
}

const tex = texFor({ geometry: g, paperW, paperH, pages, frame: !has('no-frame'), frameWidth, title, pageNumbers, cjkFont });
const work = mkdtempSync(path.join(tmpdir(), 'handout-'));
copyFileSync(PDF, path.join(work, 'deck.pdf'));
writeFileSync(path.join(work, 'handout.tex'), tex);

// Two passes: TikZ's `remember picture` learns the page origin on the first and uses it on the second.
for (let pass = 1; pass <= 2; pass++) {
  const r = spawnSync('xelatex', ['-interaction=nonstopmode', '-halt-on-error', 'handout.tex'], { cwd: work, encoding: 'utf8' });
  if (r.error) {
    rmSync(work, { recursive: true, force: true });
    fail('xelatex not found. Install TeX Live (MacTeX on macOS), which provides XeLaTeX.');
  }
  if (r.status !== 0) {
    const logFile = path.join(work, 'handout.log');
    const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : r.stdout;
    if (/HANDOUT: no CJK font found/.test(log)) {
      rmSync(work, { recursive: true, force: true });
      fail(`No CJK font found for the title "${title}". Name an installed one with --cjk-font "<font name>", or leave the title out with --no-header.`);
    }
    if (cjkFont && /cannot be found/.test(log)) {
      rmSync(work, { recursive: true, force: true });
      fail(`XeLaTeX cannot find the font "${cjkFont}" given by --cjk-font. Check the name, or use --no-header.`);
    }
    const errors = log.split('\n').filter((line) => line.startsWith('!')).slice(0, 5).join('\n');
    fail(`XeLaTeX failed on pass ${pass}:\n${errors || r.stdout.slice(-600)}\nThe source and log are kept in ${work}`);
  }
}

copyFileSync(path.join(work, 'handout.pdf'), OUT);
rmSync(work, { recursive: true, force: true });
const sheets = Math.ceil(pages / (rows * cols));
console.log(`✓ wrote ${OUT} (${pages} slides on ${sheets} ${orientation} A4 page${sheets > 1 ? 's' : ''}, `
  + `${rows} rows × ${cols} columns, each slide ${g.slideW.toFixed(1)} × ${g.slideH.toFixed(1)} mm)`);
