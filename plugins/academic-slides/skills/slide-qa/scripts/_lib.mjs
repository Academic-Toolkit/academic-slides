// Shared helpers for the slide-qa scripts: argument parsing, Playwright loading, and a static
// file server rooted at the folder that holds the rendered deck (revealjs needs http, not file://).
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export function args(help) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { console.log(help); process.exit(0); }
  const get = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
  const has = (name) => argv.includes(`--${name}`);
  return { get, has };
}

export async function playwright() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    console.error('Playwright not found. Install with: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }
}

// Resolve the deck path; exit 2 when it does not exist.
export function deckPath(html) {
  const file = path.resolve(html);
  if (!existsSync(file)) { console.error(`HTML not found: ${file} (render the deck first)`); process.exit(2); }
  return { root: path.dirname(file), name: path.basename(file) };
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

// Serve only files inside `root`, and only to this machine: bind to 127.0.0.1 so the deck folder is
// never exposed on the local network, reject any path that resolves outside root (a bare prefix
// test would let /deck-other through when root is /deck), and answer only requests addressed to
// this server by Host header, so a web page using DNS rebinding cannot read the deck folder.
export async function serve(root) {
  const base = path.resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const { port } = server.address();
      if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return res.writeHead(403).end();
      const file = path.resolve(base, '.' + decodeURIComponent(req.url.split('?')[0]));
      const inside = file === base || file.startsWith(base + path.sep);
      if (!inside || !existsSync(file)) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

// Open the print view: export-pdf.mjs prints it and check-layout.mjs measures it, both through this
// function, so the layout that is checked is the layout that is printed. Each PDF page is the slide
// plus the deck's revealjs margin, the same proportions as the screen view.
export async function openPrintView(page, url) {
  await page.goto(`${url}?print-pdf`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { if (window.MathJax && window.MathJax.startup) await window.MathJax.startup.promise; });
  await page.waitForFunction(() => window.Reveal && window.Reveal.isReady());
  await page.waitForTimeout(1500);
}

// Load the deck, wait for MathJax and Reveal, and freeze transitions so geometry is final.
export async function openDeck(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.Reveal && window.Reveal.isReady());
  await page.evaluate(async () => { if (window.MathJax && window.MathJax.startup) await window.MathJax.startup.promise; });
  await page.addStyleTag({ content: '.reveal .progress, .reveal .slide-menu-button { display: none !important; }'
    + ' .reveal .slides section, .reveal .slides section > * { transition: none !important; animation: none !important; }'
    + ' .reveal .slides section:not(.present) { display: none !important; }' });
  await page.evaluate(() => { window.Reveal.configure({ transition: 'none', backgroundTransition: 'none' }); window.Reveal.slide(0, 0); });
}
