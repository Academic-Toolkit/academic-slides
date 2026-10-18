// Read computed styles from a rendered deck for tests/render-templates.sh (issue #8).
//   --html <talk.html>        the rendered deck
//   --title-color <rgb(...)>  every slide title must have this color
//   --table-rule              the first table with two or more body rows must end with a 2px rule in the
//                             body text color, while an earlier body row keeps a 1px separator
// Exits 0 when every requested check holds, 1 otherwise, 2 on bad arguments.
import { args, deckPath, playwright, serve } from '../plugins/academic-slides/skills/slide-qa/scripts/_lib.mjs';

const { get, has } = args('Usage: node style-probe.mjs --html talk.html [--title-color "rgb(r, g, b)"] [--table-rule]');
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
} finally {
  await browser.close();
  server.close();
}
process.exit(failures ? 1 : 0);
