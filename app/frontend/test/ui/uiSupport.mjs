import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { HARNESS_USE_CASE } from './implementFixtures.js';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { makeApp, listen } = createRequire(import.meta.url)('../../../backend/test/support/implementApp.js');

let browser;

export async function closeBrowser() {
  if (browser) await browser.close();
  browser = null;
}

export async function openUi(open, overrides = {}, query = '') {
  if (!browser) browser = await chromium.launch();
  const made = makeApp({ useCase: HARNESS_USE_CASE, ...overrides });
  const backend = await listen(made.app);
  const vite = await createServer({
    root: frontend,
    configFile: path.join(frontend, 'vite.config.js'),
    logLevel: 'error',
    clearScreen: false,
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': backend.url }, hmr: false },
  });
  await vite.listen();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/test/ui/implement.html?open=${open}${query}`);
  return {
    made, page, pageErrors,
    close: async () => { await page.close(); await vite.close(); await backend.close(); },
  };
}

export async function until(check, what, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

export async function lowContrast(page, selectors = ['[aria-label="Control tower"]', '[role="dialog"]']) {
  return page.evaluate((rootSelectors) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const parse = (c) => {
      const m = String(c).match(/^rgba?\(([^)]+)\)$/);
      if (m) {
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      }
      ctx.fillStyle = '#010203';
      ctx.fillStyle = String(c);
      if (ctx.fillStyle === '#010203') return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const behind = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      }
      let base = layers.length && layers[layers.length - 1].a >= 1 ? { r: 0, g: 0, b: 0 } : parse(getComputedStyle(document.body).backgroundColor);
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        const c = layers[i];
        base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) };
      }
      return base;
    };
    const roots = rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean);
    const low = [];
    let checked = 0;
    const opacityOf = (el) => {
      let op = 1;
      for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      return op;
    };
    for (const root of roots) {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
        if ((!own && el.tagName !== 'INPUT') || el.closest('button:disabled, input:disabled, [aria-disabled="true"]')) continue;
        const style = getComputedStyle(el);
        const op = opacityOf(el);
        if (op === 0 || style.visibility === 'hidden' || style.backgroundClip === 'text' || style.webkitBackgroundClip === 'text') continue;
        const fg = parse(style.color);
        fg.a *= op;
        const bg = behind(el);
        const mixed = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
        const [x, y] = [lum(mixed), lum(bg)].sort((m, n) => n - m);
        const ratio = (x + 0.05) / (y + 0.05);
        checked += 1;
        if (ratio < 4.5) low.push(`${(own || el.value || el.getAttribute('aria-label')).slice(0, 40)}: ${ratio.toFixed(2)}`);
      }
    }
    return { checked, low };
  }, selectors);
}
