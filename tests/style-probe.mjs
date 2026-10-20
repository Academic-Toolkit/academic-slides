// Read computed styles from a rendered deck for tests/render-templates.sh (issue #8).
//   --html <talk.html>        the rendered deck
//   --title-color <rgb(...)>  every slide title must have this color
//   --table-rule              the first table with two or more body rows must end with a 2px rule in the
//                             body text color, while an earlier body row keeps a 1px separator
//   --vc-centred              on every {.vc} slide the body sits between title and footer: the gap above
//                             it is at least half the gap below it (a body stuck under the title fails)
//   --font-family <name>      the slides' computed font family must begin with this name (issue #14)
//   --root-size <px>          the computed font size of .reveal must equal this value, e.g. 30px (issue #14)
//   --math-color <rgb(...)>   the first \cB term (MathJax class deck-b) must render in this color, and no
//                             formula may show a MathJax error (issue #14)
//   --source-gap <min[-max]>  on every {.vc} slide, a .source line right after a table must sit at least
//                             min px (not touching) and at most max px (not drifting off) below the table (issue #14)
// Exits 0 when every requested check holds, 1 otherwise, 2 on bad arguments.
import { args, deckPath, playwright, serve } from '../plugins/academic-slides/skills/slide-qa/scripts/_lib.mjs';

const { get, has } = args('Usage: node style-probe.mjs --html talk.html [--title-color "rgb(r, g, b)"] [--table-rule] [--vc-centred] [--font-family NAME] [--root-size PX] [--math-color "rgb(r, g, b)"] [--source-gap MIN[-MAX]]');
const html = get('html');
if (!html) { console.error('--html is required'); process.exit(2); }
const { root, name } = deckPath(html);
const chromium = await playwright();
const { server, port } = await serve(root);
const browser = await chromium.launch();
let failures = 0;
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/${encodeURIComponent(name)}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.Reveal && window.Reveal.isReady());
  const s = await page.evaluate(() => {
    const cs = (el) => getComputedStyle(el);
    const ink = cs(document.querySelector('.reveal .slides')).color;
    const titles = [...document.querySelectorAll('.reveal .slides section h2')].map((h) => cs(h).color);
    const table = [...document.querySelectorAll('.reveal .slides table')].find((t) => t.querySelectorAll('tbody tr').length >= 2);
    if (!table) return { ink, titles, table: null };
    const rows = table.querySelectorAll('tbody tr');
    const last = cs(rows[rows.length - 1].querySelector('td'));
    const first = cs(rows[0].querySelector('td'));
    return { ink, titles, table: { lastWidth: last.borderBottomWidth, lastColor: last.borderBottomColor, firstWidth: first.borderBottomWidth } };
  });
  const want = get('title-color');
  if (want) {
    const wrong = s.titles.filter((c) => c !== want);
    if (!s.titles.length || wrong.length) { failures++; console.log(`✗ slide titles: expected ${want}, got ${[...new Set(s.titles)].join(', ') || 'no titles'}`); }
    else console.log(`✓ ${s.titles.length} slide titles are ${want}`);
  }
  if (has('table-rule')) {
    const t = s.table;
    if (!t) { failures++; console.log('✗ no table with two or more body rows'); }
    else if (t.lastWidth !== '2px' || t.lastColor !== s.ink || t.firstWidth !== '1px') {
      failures++;
      console.log(`✗ table rules: last row ${t.lastWidth} ${t.lastColor} (want 2px ${s.ink}), first row ${t.firstWidth} (want 1px)`);
    } else console.log(`✓ table ends with a 2px rule in ${s.ink}; earlier rows keep 1px`);
  }
  if (has('vc-centred')) {
    const indices = await page.evaluate(() => window.Reveal.getSlides()
      .filter((sl) => sl.classList.contains('vc')).map((sl) => window.Reveal.getIndices(sl)));
    const stuck = [];
    for (const idx of indices) {
      await page.evaluate(({ h, v }) => window.Reveal.slide(h, v ?? 0), idx);
      await page.waitForTimeout(400);
      const g = await page.evaluate(() => {
        const sl = window.Reveal.getCurrentSlide();
        const kids = [...sl.children].filter((el) => {
          const cs = getComputedStyle(el);
          return el.tagName !== 'H2' && cs.display !== 'none' && el.getBoundingClientRect().height > 0 && !el.matches('aside, .notes');
        });
        if (!kids.length) return null;
        const h2 = sl.querySelector('h2');
        const footer = document.querySelector('.reveal .footer');
        const top = Math.min(...kids.map((k) => k.getBoundingClientRect().top));
        const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
        const above = top - (h2 ? h2.getBoundingClientRect().bottom : sl.getBoundingClientRect().top);
        const below = (footer ? footer.getBoundingClientRect().top : window.innerHeight) - bottom;
        return { title: h2 ? h2.textContent.trim() : '(no title)', above, below };
      });
      if (g && g.below > 60 && g.above < g.below / 2) stuck.push(`${g.title} (above ${Math.round(g.above)} px, below ${Math.round(g.below)} px)`);
    }
    if (stuck.length) { failures++; console.log(`✗ {.vc} slides not centred: ${stuck.join('; ')}`); }
    else console.log(`✓ ${indices.length} {.vc} slides are centred`);
  }
  const font = get('font-family');
  if (font) {
    const got = await page.evaluate(() => getComputedStyle(document.querySelector('.reveal .slides')).fontFamily);
    const first = got.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (first !== font) { failures++; console.log(`✗ font family: expected ${font} first, got ${got}`); }
    else console.log(`✓ slides use ${font}`);
  }
  const size = get('root-size');
  if (size) {
    const got = await page.evaluate(() => getComputedStyle(document.querySelector('.reveal')).fontSize);
    if (got !== size) { failures++; console.log(`✗ root font size: expected ${size}, got ${got}`); }
    else console.log(`✓ root font size is ${size}`);
  }
  const math = get('math-color');
  if (math) {
    // MathJax typesets after Reveal is ready; wait for it before reading the formula
    await page.waitForFunction(() => window.MathJax && window.MathJax.startup && window.MathJax.startup.promise, null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => window.MathJax?.startup?.promise);
    const m = await page.evaluate(() => {
      const el = document.querySelector('mjx-container .deck-b');
      return { color: el && getComputedStyle(el).color, errors: document.querySelectorAll('mjx-merror').length };
    });
    if (!m.color) { failures++; console.log('✗ math color: no \\cB term (class deck-b) in any formula'); }
    else if (m.color !== math || m.errors) { failures++; console.log(`✗ math color: \\cB renders ${m.color} (want ${math}); ${m.errors} MathJax errors`); }
    else console.log(`✓ \\cB terms render in ${math}; no MathJax errors`);
  }
  const gap = get('source-gap');
  if (gap) {
    const [want, most] = gap.split('-').map(Number);
    const indices = await page.evaluate(() => window.Reveal.getSlides()
      .filter((sl) => sl.classList.contains('vc') && sl.querySelector(':scope > table + .source')).map((sl) => window.Reveal.getIndices(sl)));
    const tight = [];
    for (const idx of indices) {
      await page.evaluate(({ h, v }) => window.Reveal.slide(h, v ?? 0), idx);
      await page.waitForTimeout(400);
      const g = await page.evaluate(() => {
        const sl = window.Reveal.getCurrentSlide();
        const src = sl.querySelector(':scope > table + .source');
        const table = src.previousElementSibling;
        return { title: sl.querySelector('h2')?.textContent.trim() ?? '(no title)', gap: src.getBoundingClientRect().top - table.getBoundingClientRect().bottom };
      });
      if (g.gap < want || (most && g.gap > most)) tight.push(`${g.title} (${g.gap.toFixed(1)} px)`);
    }
    if (!indices.length) { failures++; console.log('✗ source gap: no {.vc} slide with a table followed by a .source line'); }
    else if (tight.length) { failures++; console.log(`✗ source line not right below the table (want ${want}${most ? `–${most}` : '+'} px): ${tight.join('; ')}`); }
    else console.log(`✓ ${indices.length} {.vc} slides keep the source line ${want}${most ? `–${most}` : '+'} px below the table`);
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failures ? 1 : 0);
