#!/usr/bin/env node
// Print a rendered revealjs deck to PDF through print mode (?print-pdf), one page per slide.
// The PDF is the offline fallback: MathJax in the HTML needs a network connection.
import path from 'path';
import { args, playwright, deckPath, serve } from './_lib.mjs';

const { get } = args(`Usage: node export-pdf.mjs [--html talk.html] [--out talk.pdf] [--width 1280] [--height 720]
Exit status: 0 PDF written, 1 export failed, 2 HTML not found.`);
const WIDTH = Number(get('width', 1280));
const HEIGHT = Number(get('height', 720));
const { root, name } = deckPath(get('html', 'talk.html'));
const OUT = path.resolve(get('out', path.join(root, name.replace(/\.html?$/, '.pdf'))));

const chromium = await playwright();
const { server, port } = await serve(root);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.goto(`http://localhost:${port}/${name}?print-pdf`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { if (window.MathJax && window.MathJax.startup) await window.MathJax.startup.promise; });
  await page.waitForFunction(() => window.Reveal && window.Reveal.isReady());
  await page.waitForTimeout(1500);
  const slides = await page.evaluate(() => window.Reveal.getTotalSlides());
  await page.pdf({ path: OUT, width: `${WIDTH}px`, height: `${HEIGHT}px`, printBackground: true, preferCSSPageSize: true });
  console.log(`✓ wrote ${OUT} (${slides} slides)`);
} catch (err) {
  console.error(`PDF export failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
