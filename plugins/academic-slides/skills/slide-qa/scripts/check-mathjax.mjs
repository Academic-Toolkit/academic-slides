#!/usr/bin/env node
// MathJax check: after MathJax finishes, count errors and rendered math nodes. Two kinds of error:
//   - mjx-merror nodes (parse errors such as unbalanced braces);
//   - undefined macros: MathJax 3's noundefined extension renders them as red text, not mjx-merror,
//     so they are found as red <mtext> beginning with a backslash in the assistive MathML.
// Exits 1 when any error exists.
import { args, playwright, deckPath, serve } from './_lib.mjs';

const { get } = args(`Usage: node check-mathjax.mjs [--html talk.html]
Exit status: 0 no MathJax errors, 1 at least one error, 2 HTML not found.`);
const { root, name } = deckPath(get('html', 'talk.html'));

const chromium = await playwright();
const { server, port } = await serve(root);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${port}/${encodeURIComponent(name)}`, { waitUntil: 'networkidle' });
await page.evaluate(async () => { if (window.MathJax && window.MathJax.startup) await window.MathJax.startup.promise; });
await page.waitForTimeout(1000);
const r = await page.evaluate(() => {
  const where = (e) => {
    const sec = e.closest('section');
    const h = sec && sec.querySelector('h1,h2');
    return h ? h.textContent.trim() : '(untitled)';
  };
  const parse = [...document.querySelectorAll('mjx-merror')].map((e) => ({ slide: where(e), text: (e.getAttribute('data-mjx-error') || e.textContent || 'parse error').trim() }));
  const undef = [...document.querySelectorAll('mjx-assistive-mml mtext[mathcolor="red"]')]
    .filter((m) => m.textContent.trim().startsWith('\\'))
    .map((m) => ({ slide: where(m), text: `undefined macro ${m.textContent.trim()}` }));
  return { errs: [...parse, ...undef], math: document.querySelectorAll('mjx-container').length };
});
await browser.close();
server.close();

if (r.errs.length) {
  console.log(`✗ ${r.errs.length} MathJax error(s) among ${r.math} math nodes:`);
  for (const e of r.errs) console.log(`  ${e.slide}: ${e.text}`);
  process.exit(1);
}
console.log(`✓ 0 MathJax errors among ${r.math} math nodes`);
