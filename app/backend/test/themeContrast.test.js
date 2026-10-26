const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '../../frontend/src');
const CSS = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');

function blocks(selector) {
  const out = {};
  const re = new RegExp(`(^|\\n)${selector.replace('.', '\\.')} \\{([^}]*)\\}`, 'g');
  for (const m of CSS.matchAll(re)) {
    for (const d of m[2].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

function themeVars() {
  const root = blocks(':root');
  return { light: root, dark: { ...root, ...blocks('.dark') }, theme: blocks('@theme') };
}

function rgba(value) {
  const v = String(value).trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const fn = v.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const p = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  throw new Error(`not a color: ${v}`);
}

const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);

function luminance([r, g, b]) {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

function surfaces(t) {
  const base = rgba(t['t-bg']);
  return {
    surface: rgba(t['t-surface']), bg: base, 'bg-subtle': rgba(t['t-bg-subtle']), panel: rgba(t['t-panel']),
    glass: over(rgba(t['t-glass-bg']), base),
  };
}

const TEXT = ['t-text-primary', 't-text-secondary', 't-text-tertiary'];
const STATUS = { 't-success-fg': 't-success-bg', 't-warning-fg': 't-warning-bg', 't-error-fg': 't-error-bg' };

test('every text color reads at 4.5:1 or better on every surface and on its own status tint, in light and dark', () => {
  const { light, dark, theme } = themeVars();
  const failures = [];
  for (const [mode, t] of Object.entries({ light, dark })) {
    const surf = surfaces(t);
    const tints = { ...Object.fromEntries(Object.entries(STATUS).map(([fg, bg]) => [fg, rgba(t[bg])])), 't-db-red-fg': rgba(theme['color-db-red-50']) };
    for (const name of [...TEXT, ...Object.keys(tints)]) {
      assert.ok(t[name], `${mode} theme defines --${name}`);
      const fg = rgba(t[name]);
      for (const [sname, s] of Object.entries(surf)) {
        const plain = contrast(fg, s);
        if (plain < 4.5) failures.push(`${mode} --${name} on ${sname}: ${plain.toFixed(2)}`);
        if (tints[name]) {
          const tinted = contrast(fg, over(tints[name], s));
          if (tinted < 4.5) failures.push(`${mode} --${name} on its tint over ${sname}: ${tinted.toFixed(2)}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('primary, secondary and tertiary text stay in that order of strength in both themes', () => {
  const { light, dark } = themeVars();
  for (const [mode, t] of Object.entries({ light, dark })) {
    const s = rgba(t['t-surface']);
    const [p, sec, ter] = TEXT.map((n) => contrast(rgba(t[n]), s));
    assert.ok(p > sec && sec > ter, `${mode}: ${p.toFixed(2)} > ${sec.toFixed(2)} > ${ter.toFixed(2)}`);
  }
});

test('the status text colors switch with the theme through their own tokens', () => {
  const { theme } = themeVars();
  for (const name of ['success-fg', 'warning-fg', 'error-fg', 'db-red-fg']) assert.equal(theme[`color-${name}`], `var(--t-${name})`);
});

test('status text uses the theme-aware shades everywhere, never the bright fill colors', () => {
  const bare = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name)) {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          if (/\btext-(success|warning|error)\b(?!-)/.test(line)) bare.push(`${path.relative(SRC, p)}:${i + 1}`);
        });
      }
    }
  };
  walk(SRC);
  assert.deepEqual(bare, []);
  assert.doesNotMatch(fs.readFileSync(path.join(SRC, 'components/ImplementStatusBadge.jsx'), 'utf8'), /\btext-db-red\b(?!-)/);
});
