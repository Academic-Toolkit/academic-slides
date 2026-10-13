#!/usr/bin/env node
// Text-density check for a Quarto revealjs deck and, optionally, its beamer mirror.
// Counts body words and bullets on every main-body slide, excluding speaker notes, hidden blocks,
// source lines, side notes, mathematics, tables, images, and markup. Exits 1 if a main-body slide
// exceeds the limits or if the main-body titles of the two decks differ in order.
// Main body = slides before a level-1 section whose title starts with "Backup" (qmd) or before
// \appendix (tex).
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const HELP = `Usage: node check-density.mjs --qmd talk.qmd [--tex talk.tex] [--words 35] [--bullets 3]
                              [--skip-classes notes,hidden,source,sidenote,sim-tag]
                              [--skip-macros simtag,sourceline,sidenote]
  --qmd           Quarto deck (default ./talk.qmd)
  --tex           beamer mirror; enables the per-frame report and the title comparison
  --words         maximum body words per main-body slide (default 35)
  --bullets       maximum bullets per main-body slide (default 3)
  --skip-classes  fenced-div / span classes whose text is not counted
  --skip-macros   beamer macros whose argument text is not counted
Exit status: 0 all within limits and titles match, 1 otherwise, 2 file not found.`;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) { console.log(HELP); process.exit(0); }
const arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const QMD = arg('qmd', 'talk.qmd');
const TEX = arg('tex', null);
const MAX_WORDS = Number(arg('words', 35));
const MAX_BULLETS = Number(arg('bullets', 3));
const SKIP = arg('skip-classes', 'notes,hidden,source,sidenote,sim-tag').split(',').filter(Boolean);
const MACROS = arg('skip-macros', 'simtag,sourceline,sidenote').split(',').filter(Boolean);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const WORD = /[A-Za-z][A-Za-z'\-]*/g;

function stripMath(s) {
  s = s.replace(/\$\$[\s\S]*?\$\$/g, ' ');
  s = s.replace(/\\\[[\s\S]*?\\\]/g, ' ');
  s = s.replace(/\\begin\{(align\*?|equation\*?|gather\*?)\}[\s\S]*?\\end\{\1\}/g, ' ');
  return s.replace(/\$[^$]*\$/g, ' ');
}

// Remove fenced divs (::: {.cls} ... :::) whose class is in `classes`, honouring nesting.
function dropFenced(body, classes) {
  const out = [];
  let skip = 0, depth = 0;
  for (const line of body.split('\n')) {
    const m = line.match(/^(:{3,})\s*(\{[^}]*\}|\S+)?\s*$/);
    if (m && m[2]) {
      if (skip) { depth += 1; continue; }
      if (classes.some((c) => new RegExp(`\\.${esc(c)}\\b`).test(m[2]))) { skip = 1; depth = 1; continue; }
    } else if (m && !m[2]) {
      if (skip) { depth -= 1; if (depth === 0) skip = 0; continue; }
    }
    if (!skip) out.push(line);
  }
  return out.join('\n');
}

function count(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  const bullets = lines.filter((l) => /^\s*(-|\*|\d+\.)\s+/.test(l)).length;
  const words = (text.match(WORD) || []).length;
  return [words, bullets];
}

function parseQmd(file) {
  let s = readFileSync(file, 'utf-8');
  s = s.replace(/^---\n[\s\S]*?\n---\n/, '');
  const slides = [];
  let backup = false;
  const blocks = s.split(/^(#{1,2}) (.*)$/m);
  const spanSkip = new RegExp(`\\[[^\\]]*\\]\\{\\.(?:${SKIP.map(esc).join('|')})[^}]*\\}`, 'g');
  for (let k = 1; k < blocks.length; k += 3) {
    const level = blocks[k];
    const title = blocks[k + 1].replace(/\s*\{[^}]*\}\s*$/, '').trim();
    let body = blocks[k + 2];
    if (level === '#') { backup = backup || title.toLowerCase().startsWith('backup'); continue; }
    body = dropFenced(body, SKIP);
    body = body.replace(spanSkip, ' ');
    body = stripMath(body);
    body = body.split('\n').filter((l) => !l.trimStart().startsWith('|')).join('\n');
    body = body.replace(/<img[^>]*>/g, ' ').replace(/<[^>]+>/g, ' ');
    body = body.split('\n').filter((l) => !/^\s*:{3,}/.test(l)).join('\n');
    body = body.replace(/\{[^}]*\}/g, ' ');
    slides.push([title, backup, ...count(body)]);
  }
  return slides;
}

function parseTex(file) {
  let s = readFileSync(file, 'utf-8');
  s = s.replace(/(?<!\\)%.*/g, '');
  const doc = s.slice(s.indexOf('\\begin{document}'));
  const app = doc.indexOf('\\appendix');
  const slides = [];
  const pat = /\\begin\{frame\}(?:\[[^\]]*\])?\{((?:[^{}]|\{[^{}]*\})*)\}([\s\S]*?)\\end\{frame\}/g;
  const macro = new RegExp(`\\\\(${MACROS.map(esc).join('|')})\\{(?:[^{}]|\\{[^{}]*\\})*\\}(\\{(?:[^{}]|\\{[^{}]*\\})*\\})?`, 'g');
  for (const m of doc.matchAll(pat)) {
    const title = m[1];
    let body = m[2];
    const backup = app >= 0 && m.index > app;
    if (MACROS.length) body = body.replace(macro, ' ');
    body = stripMath(body);
    body = body.replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/g, ' ');
    body = body.replace(/\\includegraphics(\[[^\]]*\])?\{[^}]*\}/g, ' ');
    // environment names and column widths are markup, not words; block titles stay counted
    body = body.replace(/\\(begin|end)\{[^}]*\}(\[[^\]]*\])?(\{[0-9.]*\\(?:line|text)width\})?/g, ' ');
    body = body.replace(/\\href\{[^}]*\}/g, ' '); // link target; the shown text stays
    body = body.replace(/\\item\s/g, '\n- ');
    body = body.replace(/\\[A-Za-z@]+\*?(\[[^\]]*\])?/g, ' ');
    body = body.replace(/[{}]/g, ' ');
    slides.push([title, backup, ...count(body)]);
  }
  return slides;
}

function normTitle(t) {
  t = t.normalize('NFKC');
  t = t.replace(/\\emph\{([^}]*)\}|\\textit\{([^}]*)\}|\*([^*]+)\*/g, (_, a, b, c) => a ?? b ?? c);
  t = t.replaceAll('\\%', '%').replaceAll('---', '—').replaceAll('--', '–').replaceAll('\\&', '&');
  t = t.replace(/\$([^$]*)\$/g, (_, x) => x.replace(/[\\{}^_ ]/g, ''));
  t = t.replace(/\\[A-Za-z]+/g, '');
  return t.toLowerCase().replace(/[^0-9a-z%]+/g, '');
}

const pad = (v, n) => String(v).padStart(n);
function report(name, slides) {
  console.log(`\n== ${name} ==`);
  console.log(`${pad('#', 3)} | ${pad('words', 5)} | ${pad('bul', 3)} | title`);
  let worstW = 0, worstB = 0, ok = true;
  slides.forEach(([title, backup, w, b], i) => {
    let flag = '';
    if (!backup) {
      worstW = Math.max(worstW, w); worstB = Math.max(worstB, b);
      if (w > MAX_WORDS || b > MAX_BULLETS) { flag = '  <-- over limit'; ok = false; }
    }
    const shown = Array.from(title).slice(0, 70).join('');
    console.log(`${pad(i + 1, 3)} | ${pad(w, 5)} | ${pad(b, 3)} | ${backup ? '[backup] ' : ''}${shown}${flag}`);
  });
  console.log(`max words = ${worstW}, max bullets = ${worstB} (main body)`);
  return ok;
}

if (!existsSync(QMD)) { console.error(`qmd not found: ${QMD}`); process.exit(2); }
if (TEX && !existsSync(TEX)) { console.error(`tex not found: ${TEX}`); process.exit(2); }

const q = parseQmd(QMD);
let ok = report(path.basename(QMD), q);
if (TEX) {
  const t = parseTex(TEX);
  ok = report(path.basename(TEX), t) && ok;
  const qm = q.filter((x) => !x[1]).map((x) => normTitle(x[0]));
  const tm = t.filter((x) => !x[1]).map((x) => normTitle(x[0]));
  let mism = null;
  for (let i = 0; i < Math.min(qm.length, tm.length); i++) if (qm[i] !== tm[i]) { mism = i; break; }
  if (qm.length !== tm.length || mism !== null) {
    ok = false;
    const i = mism !== null ? mism : Math.min(qm.length, tm.length);
    console.log(`\ntitle mismatch at main slide ${i + 1}: qmd=${i < qm.length ? qm[i] : '-'} | tex=${i < tm.length ? tm[i] : '-'} (counts ${qm.length} vs ${tm.length})`);
  } else {
    console.log(`\n${qm.length}/${tm.length} titles match`);
  }
} else {
  console.log('\n(no beamer file given; title comparison skipped)');
}
process.exit(ok ? 0 : 1);
