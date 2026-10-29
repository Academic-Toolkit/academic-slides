// Shared helpers for the slide-qa scripts: argument parsing, Playwright loading, and a static
// file server rooted at the folder that holds the rendered deck (revealjs needs http, not file://).
import { createServer } from 'http';
import { readFile, realpath, stat, lstat, mkdir, mkdtemp, writeFile, rename, rm } from 'fs/promises';
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

function inside(file, root) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

// Pin the chosen directory to its physical location. The default qa/ must stay in the
// deck; an explicit --out is an operator-selected destination and may live elsewhere.
export async function outputDirectory(directory, root) {
  const base = root === undefined ? null : await realpath(root);
  await mkdir(directory, { recursive: true });
  const resolved = await realpath(directory);
  if (base !== null && !inside(resolved, base)) throw new Error('output directory resolves outside the deck; choose a trusted --out directory');
  return resolved;
}

// Replace the directory entry, never truncate through an existing symlink or hardlink.
// Directory ancestors must not be concurrently replaced by another local process.
export async function writeOutput(file, data) {
  const directory = await outputDirectory(path.dirname(file));
  const target = path.join(directory, path.basename(file));
  let mode = 0o666;
  try {
    const existing = await lstat(target);
    if (existing.isFile()) mode = existing.mode & 0o777;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const temporary = await mkdtemp(path.join(directory, '.slide-qa-'));
  try {
    const pending = path.join(temporary, 'output');
    await writeFile(pending, data, { flag: 'wx', mode });
    await rename(pending, target);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

// Serve only files inside `root`, and only to this machine: bind to 127.0.0.1 so the deck folder is
// never exposed on the local network, reject any path that resolves outside root (a bare prefix
// test would let /deck-other through when root is /deck), and answer only requests addressed to
// this server by Host header, so a web page using DNS rebinding cannot read the deck folder.
export async function serve(root) {
  const base = await realpath(root);
  const server = createServer(async (req, res) => {
    try {
      const { port } = server.address();
      if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return res.writeHead(403).end();
      const file = path.resolve(base, '.' + decodeURIComponent(req.url.split('?')[0]));
      if (!inside(file, base)) return res.writeHead(404).end();
      const resolved = await realpath(file);
      if (!inside(resolved, base) || !(await stat(resolved)).isFile()) return res.writeHead(404).end();
      const data = await readFile(resolved);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (err) {
      res.writeHead(['ENOENT', 'ENOTDIR', 'ELOOP'].includes(err.code) ? 404 : 500).end();
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
