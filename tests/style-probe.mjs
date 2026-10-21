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
//   --class-colors <k=rgb;…>  each formula colour class (deck-b, deck-o, deck-g, deck-p) must compute to the given colour
//   --footer-bg <rgba(...)>   the footer backing must compute to this colour (it follows $body-bg, issue #14)
//   --page <margin>           the slide is shown as a page (issue #23): revealjs margin equals <margin>, the page drawn
//                             behind the slide extends width × margin / 2 and height × margin / 2, so it stays 16:9,
//                             the window around it has another colour, and the footer, slide number and menu button
//                             sit in the page's bottom margin, within the content area's left and right edges
//   --print-footer            in the print view the footer sits within the first printed page, not below it, where Chrome
//                             would print it at the top of the next page (issue #23)
//   --cover-centred           on every {.cover} slide the gap above the first line and below the last differ by at
//                             most a fifth of the slide height, and an .eyebrow line sits above the title (issue #23)
// Exits 0 when every requested check holds, 1 otherwise, 2 on bad arguments.
import { args, deckPath, playwright, serve } from '../plugins/academic-slides/skills/slide-qa/scripts/_lib.mjs';

const { get, has } = args('Usage: node style-probe.mjs --html talk.html [--title-color "rgb(r, g, b)"] [--table-rule] [--vc-centred] [--font-family NAME] [--root-size PX] [--math-color "rgb(r, g, b)"] [--source-gap MIN[-MAX]] [--class-colors "deck-b=rgb(r, g, b);…"] [--footer-bg "rgba(r, g, b, a)"] [--page MARGIN] [--cover-centred] [--print-footer]');
const html = get('html');
if (!html) { console.error('--html is required'); process.exit(2); }
// A malformed value must not turn into NaN bounds that every comparison passes (verify round 1)
if (get('source-gap') !== undefined && !/^\d+(\.\d+)?(-\d+(\.\d+)?)?$/.test(get('source-gap'))) {
  console.error(`--source-gap expects MIN or MIN-MAX in px, got ${JSON.stringify(get('source-gap'))}`); process.exit(2);
}
if (get('page') !== undefined && !/^(0|0?\.\d+)$/.test(get('page'))) {
  console.error(`--page expects the revealjs margin as a number below 1, got ${JSON.stringify(get('page'))}`); process.exit(2);
}
const classColors = get('class-colors');
if (classColors !== undefined && !/^(deck-[bogp]=rgba?\([^)]*\);?)+$/.test(classColors.replace(/\s*;\s*/g, ';').trim())) {
  console.error(`--class-colors expects 'deck-b=rgb(r, g, b);deck-o=…', got ${JSON.stringify(classColors)}`); process.exit(2);
}
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
        // with a page (issue #23) the footer sits below the slide; the slide's bottom edge is then the limit
        const limit = Math.min(footer ? footer.getBoundingClientRect().top : window.innerHeight, document.querySelector('.reveal .slides').getBoundingClientRect().bottom);
        const top = Math.min(...kids.map((k) => k.getBoundingClientRect().top));
        const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
        const above = top - (h2 ? h2.getBoundingClientRect().bottom : sl.getBoundingClientRect().top);
        const below = limit - bottom;
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
  if (classColors) {
    const want = Object.fromEntries(classColors.split(';').filter(Boolean).map((kv) => kv.split('=').map((x) => x.trim())));
    const got = await page.evaluate((keys) => Object.fromEntries(keys.map((k) => {
      const el = document.createElement('span'); el.className = k; el.textContent = 'x';
      document.querySelector('.reveal').appendChild(el); const c = getComputedStyle(el).color; el.remove(); return [k, c];
    })), Object.keys(want));
    const wrong = Object.keys(want).filter((k) => got[k] !== want[k]);
    if (wrong.length) { failures++; console.log(`✗ formula colour classes: ${wrong.map((k) => `${k} is ${got[k]} (want ${want[k]})`).join('; ')}`); }
    else console.log(`✓ formula colour classes ${Object.keys(want).join(', ')} take the palette`);
  }
  const footerBg = get('footer-bg');
  if (footerBg) {
    const got = await page.evaluate(() => getComputedStyle(document.querySelector('.reveal .footer')).backgroundColor);
    if (got !== footerBg) { failures++; console.log(`✗ footer backing: ${got} (want ${footerBg})`); }
    else console.log(`✓ footer backing is ${footerBg}`);
  }
  const pageMargin = get('page');
  if (pageMargin) {
    const want = Number(pageMargin);
    const g = await page.evaluate(() => {
      const c = window.Reveal.getConfig(), k = window.Reveal.getScale();
      const s = document.querySelector('.reveal .slides');
      const r = s.getBoundingClientRect();
      const b = getComputedStyle(s, '::before');
      const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const q = e.getBoundingClientRect(); return { top: q.top, bottom: q.bottom, left: q.left, right: q.right }; };
      return { margin: c.margin, w: c.width, h: c.height, k, r: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
        before: { content: b.content, left: parseFloat(b.left), top: parseFloat(b.top), bg: b.backgroundColor },
        window: getComputedStyle(document.body).backgroundColor,
        parts: { footer: box('.reveal .footer'), 'slide number': box('.reveal .slide-number'), 'menu button': box('.slide-menu-button') } };
    });
    const padX = g.w * want / 2, padY = g.h * want / 2;
    const bad = [];
    if (Math.abs(g.margin - want) > 1e-9) bad.push(`revealjs margin is ${g.margin}`);
    if (g.before.content === 'none' || Math.abs(g.before.left + padX) > .5 || Math.abs(g.before.top + padY) > .5) bad.push(`page drawn at left ${g.before.left}, top ${g.before.top} (want ${-padX}, ${-padY}; content ${g.before.content})`);
    if (Math.abs((g.w + 2 * padX) / (g.h + 2 * padY) - 16 / 9) > .01) bad.push('page is not 16:9');
    if (g.window === g.before.bg) bad.push(`window and page are both ${g.window}`);
    const band = { top: g.r.bottom - 1, bottom: g.r.bottom + padY * g.k + 1 };
    for (const [label, q] of Object.entries(g.parts)) {
      if (!q) { bad.push(`no ${label}`); continue; }
      if (q.top < band.top || q.bottom > band.bottom || q.left < g.r.left - 1 || q.right > g.r.right + 1) bad.push(`${label} at [${Math.round(q.left)}, ${Math.round(q.top)}, ${Math.round(q.right)}, ${Math.round(q.bottom)}], outside the page's bottom margin [${Math.round(g.r.left)}, ${Math.round(band.top)}, ${Math.round(g.r.right)}, ${Math.round(band.bottom)}]`);
    }
    if (bad.length) { failures++; console.log(`✗ page: ${bad.join('; ')}`); }
    else console.log(`✓ the slide is a 16:9 page with margin ${want}; footer, slide number and menu button sit in its bottom margin`);
  }
  if (has('cover-centred')) {
    const indices = await page.evaluate(() => window.Reveal.getSlides().filter((sl) => sl.classList.contains('cover')).map((sl) => window.Reveal.getIndices(sl)));
    const off = [];
    for (const idx of indices) {
      await page.evaluate(({ h, v }) => window.Reveal.slide(h, v ?? 0), idx);
      await page.waitForTimeout(400);
      const g = await page.evaluate(() => {
        const sl = window.Reveal.getCurrentSlide(), k = window.Reveal.getScale();
        const frame = document.querySelector('.reveal .slides').getBoundingClientRect();
        const kids = [...sl.children].filter((el) => getComputedStyle(el).display !== 'none' && getComputedStyle(el).position !== 'absolute' && el.getBoundingClientRect().height > 0 && !el.matches('aside, .notes'));
        const top = Math.min(...kids.map((e) => e.getBoundingClientRect().top)), bottom = Math.max(...kids.map((e) => e.getBoundingClientRect().bottom));
        const eyebrow = sl.querySelector('.eyebrow'), h2 = sl.querySelector('h2');
        return { title: h2?.textContent.trim() ?? '(no title)', above: (top - frame.top) / k, below: (frame.bottom - bottom) / k, h: frame.height / k,
          eyebrowAbove: !eyebrow || (h2 && eyebrow.getBoundingClientRect().bottom <= h2.getBoundingClientRect().top + 1) };
      });
      if (Math.abs(g.above - g.below) > g.h / 5 || !g.eyebrowAbove) off.push(`${g.title} (above ${Math.round(g.above)}, below ${Math.round(g.below)}${g.eyebrowAbove ? '' : ', eyebrow not above the title'})`);
    }
    if (!indices.length) { failures++; console.log('✗ cover: no {.cover} slide'); }
    else if (off.length) { failures++; console.log(`✗ cover slides not centred: ${off.join('; ')}`); }
    else console.log(`✓ ${indices.length} {.cover} slide(s) centred, eyebrow above the title`);
  }
  if (has('print-footer')) {
    // Chrome prints position: fixed elements relative to each page, so open the print view at the printed page's size
    const cfg = await page.evaluate(() => { const c = window.Reveal.getConfig(); return { w: c.width, h: c.height, m: c.margin }; });
    const pp = await browser.newPage({ viewport: { width: Math.floor(cfg.w * (1 + cfg.m)), height: Math.floor(cfg.h * (1 + cfg.m)) } });
    await pp.goto(`http://127.0.0.1:${port}/${encodeURIComponent(name)}?print-pdf`, { waitUntil: 'networkidle' });
    await pp.waitForSelector('.pdf-page', { timeout: 15000 }).catch(() => {});
    await pp.waitForTimeout(1500);
    const f = await pp.evaluate(() => {
      const foot = document.querySelector('.reveal .footer'), pg = document.querySelector('.pdf-page');
      if (!foot || !pg) return null;
      const a = foot.getBoundingClientRect(), b = pg.getBoundingClientRect();
      return { top: a.top, bottom: a.bottom, pageTop: b.top, pageBottom: b.bottom, style: foot.getAttribute('style') };
    });
    await pp.close();
    if (!f) { failures++; console.log('✗ print footer: no footer or no printed page'); }
    else if (f.top < f.pageTop - 1 || f.bottom > f.pageBottom + 1) { failures++; console.log(`✗ print footer at ${Math.round(f.top)}–${Math.round(f.bottom)}, outside the first page ${Math.round(f.pageTop)}–${Math.round(f.pageBottom)} (inline style: ${f.style})`); }
    else console.log('✓ in the print view the footer sits on its own page');
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
