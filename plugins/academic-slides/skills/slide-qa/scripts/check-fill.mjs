#!/usr/bin/env node
// Fill check: how far down each content slide its body reaches, as a fraction of the space between
// the bottom of the title and the top of the footer. Lists slides below --threshold with a suggested
// class: roomy-1 (0.58–0.70), roomy-2 (0.45–0.58), roomy-3 (< 0.45), or vc when the slide is already
// scaled. Informational: always exits 0 unless the HTML is missing.
import { args, playwright, deckPath, serve, openDeck } from './_lib.mjs';

const { get } = args(`Usage: node check-fill.mjs [--html talk.html] [--threshold 0.70] [--width 1280] [--height 720]
                           [--footer '.reveal .footer']
Exit status: 0 report printed, 2 HTML not found.`);
const THRESHOLD = Number(get('threshold', 0.7));
const WIDTH = Number(get('width', 1280));
const HEIGHT = Number(get('height', 720));
const FOOTER = get('footer', '.reveal .footer');
const { root, name } = deckPath(get('html', 'talk.html'));

const suggest = (fill, classes) => {
  if (classes.includes('vc')) return 'already centred (vc); add a figure or more content';
  if (classes.some((c) => /^roomy-\d$/.test(c))) return 'vc';
  if (fill < 0.45) return 'roomy-3';
  if (fill < 0.58) return 'roomy-2';
  return 'roomy-1';
};

const chromium = await playwright();
const { server, port } = await serve(root);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await openDeck(page, `http://127.0.0.1:${port}/${name}`);
const rows = [];

for (let i = 0; i < 500; i++) {
  await page.waitForTimeout(120);
  const r = await page.evaluate((footerSel) => {
    const s = window.Reveal.getCurrentSlide();
    const h = s.querySelector('h2');
    const foot = document.querySelector(footerSel);
    if (!h) return { skip: true, last: window.Reveal.isLastSlide() };
    const top = h.getBoundingClientRect().bottom;
    const bottom = foot ? foot.getBoundingClientRect().top : window.innerHeight - 56;
    let maxB = top;
    for (const el of s.querySelectorAll('*')) {
      if (el.closest('aside.notes') || el.closest('h2') || el.offsetParent === null) continue;
      const q = el.getBoundingClientRect();
      if (q.width > 0 && q.height > 0) maxB = Math.max(maxB, q.bottom);
    }
    return { title: h.textContent.trim(), fill: (maxB - top) / (bottom - top), classes: [...s.classList], last: window.Reveal.isLastSlide() };
  }, FOOTER);
  if (!r.skip && r.fill < THRESHOLD) rows.push({ index: i, ...r });
  if (r.last) break;
  await page.evaluate(() => window.Reveal.next());
}

await browser.close();
server.close();

if (!rows.length) {
  console.log(`✓ every content slide fills at least ${THRESHOLD} of its body`);
} else {
  console.log(`${rows.length} slide(s) fill less than ${THRESHOLD} of the body:\n`);
  for (const r of rows) console.log(`  #${String(r.index).padStart(2)}  ${r.fill.toFixed(2)}  → ${suggest(r.fill, r.classes)}   ${r.title}`);
}
