#!/usr/bin/env node
// Layout check for a rendered revealjs deck. A slide is flagged when
//   1. non-background pixels reach the 8 px band just above the footer (content cut by the footer),
//   2. a visible element ends more than 2 px below the footer's top edge (content hidden behind it),
//   3. a math block, image, or table ends more than 2 px past its column or the slide (right-edge spill),
//   4. the slide title wraps to more than one line.
// Pixel and DOM checks are both needed: an opaque footer hides content from the pixel band.
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { args, playwright, deckPath, serve, openDeck } from './_lib.mjs';

const { get, has } = args(`Usage: node check-layout.mjs [--html talk.html] [--width 1280] [--height 720]
                             [--footer '.reveal .footer'] [--out <deck folder>/qa] [--shots]
  --out    screenshot folder (default: qa/ next to the deck HTML)
  --shots  save one screenshot per slide as <deck>-NN.png; flagged slides are always saved as <deck>-NN-flagged.png
Exit status: 0 no problems, 1 at least one flagged slide, 2 HTML not found.`);
const WIDTH = Number(get('width', 1280));
const HEIGHT = Number(get('height', 720));
const FOOTER = get('footer', '.reveal .footer');
const SHOTS = has('shots');
const { root, name } = deckPath(get('html', 'talk.html'));
const deck = name.replace(/\.html?$/, '');
// default output sits next to the deck (owned by the user, specific to the project), never a shared temp path
const OUT = path.resolve(get('out', path.join(root, 'qa')));
// band margins avoid the menu button (bottom left) and the slide number (bottom right)
const X0 = 110;
const BAND_W = WIDTH - X0 - 150;

const chromium = await playwright();
const { server, port } = await serve(root);
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await openDeck(page, `http://127.0.0.1:${port}/${encodeURIComponent(name)}`);
const offenders = [];

for (let i = 0; i < 500; i++) {
  await page.waitForTimeout(150);
  const info = await page.evaluate((footerSel) => {
    const slide = window.Reveal.getCurrentSlide();
    const footer = document.querySelector(footerSel);
    const footerTop = footer ? footer.getBoundingClientRect().top : window.innerHeight - 56;
    let maxBottom = 0;
    for (const el of slide.querySelectorAll('*')) {
      if (el.closest('aside.notes') || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.width > 0) maxBottom = Math.max(maxBottom, r.bottom);
    }
    let maxRightOver = 0;
    for (const el of slide.querySelectorAll('mjx-container, img, table')) {
      if (el.closest('aside.notes') || el.offsetParent === null) continue;
      const inner = el.tagName === 'MJX-CONTAINER' ? (el.querySelector('mjx-math') || el) : el;
      const box = (el.closest('.column') || slide).getBoundingClientRect();
      maxRightOver = Math.max(maxRightOver, inner.getBoundingClientRect().right - box.right);
    }
    const h = slide.querySelector('h2');
    return {
      title: ((slide.querySelector('h1,h2') || {}).textContent || '(untitled)').trim(),
      footerTop: Math.round(footerTop),
      domOver: Math.round(maxBottom - footerTop),
      rightOver: Math.round(maxRightOver),
      titleLines: h ? Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)) : 1,
      last: window.Reveal.isLastSlide(),
    };
  }, FOOTER);

  // band = 8 px above the footer; reference = same rows at the far left, so a footer backing cancels out
  const band = await page.screenshot({ clip: { x: X0, y: Math.max(0, info.footerTop - 8), width: BAND_W, height: 8 } });
  const ref = await page.screenshot({ clip: { x: 8, y: Math.max(0, info.footerTop - 8), width: 10, height: 8 } });
  const nonBg = await page.evaluate(async ([bandB64, refB64]) => {
    const pixels = async (b64) => {
      const im = await new Promise((res) => { const x = new Image(); x.onload = () => res(x); x.src = `data:image/png;base64,${b64}`; });
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(im, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const r = await pixels(refB64);
    const d = await pixels(bandB64);
    let n = 0;
    for (let p = 0; p < d.length; p += 4) if (Math.abs(d[p] - r[0]) + Math.abs(d[p + 1] - r[1]) + Math.abs(d[p + 2] - r[2]) > 60) n += 1;
    return n;
  }, [band.toString('base64'), ref.toString('base64')]);

  const nn = String(i).padStart(2, '0');
  if (SHOTS) await writeFile(path.join(OUT, `${deck}-${nn}.png`), await page.screenshot());
  if (nonBg > 200 || info.domOver > 2 || info.rightOver > 2 || info.titleLines > 1) {
    const file = path.join(OUT, `${deck}-${nn}-flagged.png`);
    await writeFile(file, await page.screenshot());
    offenders.push({ index: i, ...info, pixels: nonBg, file });
  }
  if (info.last) break;
  await page.evaluate(() => window.Reveal.next());
}

await browser.close();
server.close();

if (offenders.length) {
  console.log(`✗ ${offenders.length} slide(s) with layout problems at ${WIDTH}x${HEIGHT}:\n`);
  for (const o of offenders) {
    const why = [];
    if (o.pixels > 200) why.push(`${o.pixels} px in the footer band`);
    if (o.domOver > 2) why.push(`content ${o.domOver} px below the footer top`);
    if (o.rightOver > 2) why.push(`${o.rightOver} px past the right edge`);
    if (o.titleLines > 1) why.push(`title on ${o.titleLines} lines`);
    console.log(`  #${o.index}  ${o.title}\n      ${why.join('; ')}  →  ${o.file}`);
  }
  process.exit(1);
}
console.log(`✓ no layout problems at ${WIDTH}x${HEIGHT}`);
