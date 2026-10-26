/** Collapse `/./` and `/../` (e.g. `/Shared/../demos/x` → `/demos/x`). Leaves `/Volumes/` unchanged. */
export function normalizeDatabricksFsPath(p) {
  if (p == null || typeof p !== 'string') return '';
  const t = p.trim().replace(/\/+/g, '/');
  if (!t) return '';
  if (t.startsWith('/Volumes/')) return t.replace(/\/+$/, '') || t;
  if (!t.startsWith('/')) return t;
  const segments = t.split('/').filter(Boolean);
  const stack = [];
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      if (stack.length) stack.pop();
    } else stack.push(seg);
  }
  return stack.length ? `/${stack.join('/')}` : '/';
}

/** `#workspace` deep-link segment — UI expects `/Workspace/...` on current control planes. */
export function workspaceWebUiHashPath(fsPath) {
  const n = normalizeDatabricksFsPath(fsPath);
  if (!n || n.startsWith('/Volumes/')) return n;
  if (n.startsWith('/Workspace')) return n;
  return `/Workspace${n}`;
}

export function workspaceNotebookUrl(databricksHost, notebookPath) {
  if (!notebookPath || !databricksHost) return '';
  const base = databricksHost.replace(/\/+$/, '').replace(/^http:\/\//i, 'https://');
  const origin = base.startsWith('http') ? base : `https://${base}`;
  const path = workspaceWebUiHashPath(notebookPath);
  const pathSeg = path.startsWith('/') ? path : `/${path}`;
  return `${origin}/#workspace${pathSeg}`;
}
