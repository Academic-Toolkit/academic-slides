#!/usr/bin/env node
// Print a rendered revealjs deck to PDF through print mode (?print-pdf), one page per slide.
// The PDF is the offline fallback: MathJax in the HTML needs a network connection.
// check-layout.mjs measures this same print view, so a deck it passes prints with nothing running into
// the footer, past the right edge, or onto a second title line.
import path from 'path';
import { options, playwright, deckPath, findDeckFile, serve, openPrintView, writeOutput } from './_lib.mjs';

const { get } = options(`Usage: node export-pdf.mjs [--html <deck>.html] [--out <deck>.pdf] [--width 1280] [--height 720]
Exit status: 0 PDF written, 1 export failed, 2 HTML not found, the deck's .html not found in the current folder when --html
             is not given, its Quarto settings cannot be read, or an option error (an option without a value, a value out of range, an unknown option, an argument that belongs to no
             option, an option given twice).`,
  { html: 'file', out: 'text', width: { min: 1, integer: true }, height: { min: 1, integer: true } });
const WIDTH = get('width', 1280);
const HEIGHT = get('height', 720);
const { root, name } = deckPath(findDeckFile(get('html'), '.html', 'html'));
const OUT = path.resolve(get('out', path.join(root, name.replace(/\.html?$/, '.pdf'))));

const chromium = await playwright();
const { server, port } = await serve(root);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await openPrintView(page, `http://127.0.0.1:${port}/${encodeURIComponent(name)}`);
  const slides = await page.evaluate(() => window.Reveal.getTotalSlides());
  await writeOutput(OUT, await page.pdf({ width: `${WIDTH}px`, height: `${HEIGHT}px`, printBackground: true, preferCSSPageSize: true }));
  console.log(`✓ wrote ${OUT} (${slides} slides)`);
} catch (err) {
  console.error(`PDF export failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
