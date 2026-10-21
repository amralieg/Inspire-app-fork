export const STRATEGY_SCHEMA_VERSION = 1;
export const STRATEGY_MAX_DEPTH = 4;
export const STRATEGY_MAX_ENTRIES = 200;
export const STRATEGY_MAX_NAME_CHARS = 300;
export const STRATEGY_MAX_BYTES = 900000;
export const STRATEGY_LABEL_KEYS = ['priority', 'kpi', 'key_result', 'sponsor'];
export const KPI_DIRECTIONS = ['increase', 'decrease', 'maintain'];

const text = (value) => String(value ?? '').trim();

export function emptyStrategy() {
  return { levels: [], strategy: [], priorities: [], sponsors: [], labels: {} };
}

export function emptyEntry(name = '') {
  return { name, description: '', children: [], kpis: [], key_results: [] };
}

function toKpi(raw) {
  if (typeof raw === 'string') return { name: raw.trim(), definition: '', unit: '', direction: '' };
  const o = raw && typeof raw === 'object' ? raw : {};
  return { name: text(o.name), definition: text(o.definition), unit: text(o.unit), direction: text(o.direction).toLowerCase() };
}

function toKeyResult(raw) {
  if (typeof raw === 'string') return { statement: raw.trim(), kpi: '' };
  const o = raw && typeof raw === 'object' ? raw : {};
  return { statement: text(o.statement || o.name), kpi: text(o.kpi) };
}

function toEntry(raw) {
  if (typeof raw === 'string') return emptyEntry(raw.trim());
  const o = raw && typeof raw === 'object' ? raw : {};
  const rawKpis = Array.isArray(o.kpis) ? o.kpis : [];
  const kpis = rawKpis.map(toKpi);
  const kpiNameById = {};
  rawKpis.forEach((kpi, index) => {
    if (kpi && typeof kpi === 'object' && kpi.id) kpiNameById[kpi.id] = kpis[index].name;
  });
  const keyResults = (Array.isArray(o.key_results) ? o.key_results : []).map((rawResult) => {
    const result = toKeyResult(rawResult);
    if (!result.kpi && rawResult && typeof rawResult === 'object' && kpiNameById[rawResult.kpi_id]) {
      result.kpi = kpiNameById[rawResult.kpi_id];
    }
    return result;
  });
  return {
    name: text(o.name),
    description: text(o.description),
    children: Array.isArray(o.children) ? o.children.map(toEntry) : [],
    kpis,
    key_results: keyResults,
  };
}

export function parseStrategicContext(widgetText) {
  const raw = text(widgetText);
  if (!raw) return { mode: 'empty', model: emptyStrategy(), path: '', error: null };
  if (raw.startsWith('/')) return { mode: 'path', model: emptyStrategy(), path: raw, error: null };
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { mode: 'tree', model: emptyStrategy(), path: '', error: `Invalid JSON: ${err.message}` };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { mode: 'tree', model: emptyStrategy(), path: '', error: 'Strategic Context must be a JSON object.' };
  }
  const priorities = (Array.isArray(data.priorities) ? data.priorities : [])
    .map((p) => text(p && typeof p === 'object' ? p.name : p))
    .filter(Boolean);
  const sponsors = (Array.isArray(data.sponsors) ? data.sponsors : []).map((s) => {
    const o = s && typeof s === 'object' ? s : { role: s };
    const owns = Array.isArray(o.owns) ? o.owns : o.owns ? [o.owns] : [];
    return { role: text(o.role), name: text(o.name), reports_to: text(o.reports_to), owns: owns.map(text).filter(Boolean) };
  });
  const labels = {};
  for (const key of STRATEGY_LABEL_KEYS) {
    if (data.labels && text(data.labels[key])) labels[key] = text(data.labels[key]);
  }
  return {
    mode: 'tree',
    model: {
      levels: (Array.isArray(data.levels) ? data.levels : []).map(text),
      strategy: (Array.isArray(data.strategy) ? data.strategy : []).map(toEntry),
      priorities,
      sponsors,
      labels,
    },
    path: '',
    error: null,
  };
}

export function isEmptyStrategy(model) {
  const m = model || emptyStrategy();
  return !m.strategy.length && !m.priorities.length && !m.sponsors.length && !Object.values(m.labels || {}).some(Boolean);
}

export function serializeStrategy(model) {
  if (isEmptyStrategy(model)) return '';
  const entry = (n) => {
    const out = { name: text(n.name) };
    if (text(n.description)) out.description = text(n.description);
    const kpis = (n.kpis || []).map((k) => {
      const kpi = { name: text(k.name) };
      for (const field of ['definition', 'unit', 'direction']) if (text(k[field])) kpi[field] = text(k[field]);
      return kpi;
    });
    if (kpis.length) out.kpis = kpis;
    const keyResults = (n.key_results || []).map((r) => (text(r.kpi) ? { statement: text(r.statement), kpi: text(r.kpi) }
      : { statement: text(r.statement) }));
    if (keyResults.length) out.key_results = keyResults;
    const children = (n.children || []).map(entry);
    if (children.length) out.children = children;
    return out;
  };
  const out = { schema_version: STRATEGY_SCHEMA_VERSION };
  const levels = model.levels.map(text).filter(Boolean);
  if (model.strategy.length && levels.length) out.levels = levels;
  if (model.strategy.length) out.strategy = model.strategy.map(entry);
  const priorities = [...new Set(model.priorities.map(text).filter(Boolean))];
  if (priorities.length) out.priorities = priorities;
  const sponsors = model.sponsors.filter((s) => text(s.role)).map((s) => {
    const sponsor = { role: text(s.role) };
    if (text(s.name)) sponsor.name = text(s.name);
    if (text(s.reports_to)) sponsor.reports_to = text(s.reports_to);
    const owns = (s.owns || []).map(text).filter(Boolean);
    if (owns.length) sponsor.owns = owns;
    return sponsor;
  });
  if (sponsors.length) out.sponsors = sponsors;
  const labels = {};
  for (const key of STRATEGY_LABEL_KEYS) if (text(model.labels?.[key])) labels[key] = text(model.labels[key]);
  if (Object.keys(labels).length) out.labels = labels;
  return JSON.stringify(out);
}

export function treeDepth(entries, depth = 1) {
  let deepest = 0;
  for (const entry of entries || []) deepest = Math.max(deepest, depth, treeDepth(entry.children, depth + 1));
  return deepest;
}

export function countEntries(entries) {
  return (entries || []).reduce((sum, entry) => sum + 1 + countEntries(entry.children), 0);
}

const nameProblem = (value, what) => {
  const name = text(value);
  if (!name) return `${what} has an empty name.`;
  if (name.length > STRATEGY_MAX_NAME_CHARS) return `${what} is longer than ${STRATEGY_MAX_NAME_CHARS} characters.`;
  return null;
};

export function validateStrategy(model) {
  const problems = [];
  const levels = model.levels.map(text);
  levels.forEach((level, index) => {
    const problem = nameProblem(level, `Level ${index + 1}`);
    if (problem) problems.push(problem);
  });
  if (new Set(levels.filter(Boolean).map((l) => l.toLowerCase())).size !== levels.filter(Boolean).length) {
    problems.push('Level names must be unique.');
  }
  const walk = (entries, where) => {
    const seen = new Set();
    entries.forEach((entry, index) => {
      const label = text(entry.name) ? `"${text(entry.name).slice(0, 60)}"` : `Entry ${index + 1} ${where}`;
      const problem = nameProblem(entry.name, label);
      if (problem) problems.push(problem);
      const folded = text(entry.name).toLowerCase();
      if (folded && seen.has(folded)) problems.push(`${label} appears twice ${where}.`);
      seen.add(folded);
      (entry.kpis || []).forEach((kpi, k) => {
        const kpiProblem = nameProblem(kpi.name, `KPI ${k + 1} on ${label}`);
        if (kpiProblem) problems.push(kpiProblem);
        if (text(kpi.direction) && !KPI_DIRECTIONS.includes(text(kpi.direction).toLowerCase())) {
          problems.push(`KPI ${k + 1} on ${label}: direction must be one of ${KPI_DIRECTIONS.join(', ')}.`);
        }
      });
      (entry.key_results || []).forEach((result, r) => {
        const resultProblem = nameProblem(result.statement, `Key result ${r + 1} on ${label}`);
        if (resultProblem) problems.push(resultProblem);
      });
      walk(entry.children || [], `under ${label}`);
    });
  };
  walk(model.strategy, 'at the top level');
  const depth = treeDepth(model.strategy);
  const named = levels.filter(Boolean).length;
  if (depth > STRATEGY_MAX_DEPTH) problems.push(`The tree is ${depth} levels deep; the most is ${STRATEGY_MAX_DEPTH}.`);
  if (countEntries(model.strategy) > STRATEGY_MAX_ENTRIES) problems.push(`The tree has more than ${STRATEGY_MAX_ENTRIES} entries.`);
  if (depth > 1 && !named) problems.push('Name the levels: the tree is deeper than one level.');
  if (depth && named && named < depth) problems.push(`The tree is ${depth} levels deep but only ${named} level names are given.`);
  model.priorities.forEach((priority, index) => {
    const problem = nameProblem(priority, `Priority ${index + 1}`);
    if (problem) problems.push(problem);
  });
  model.sponsors.forEach((sponsor, index) => {
    if (!text(sponsor.role)) problems.push(`Sponsor ${index + 1} has no role.`);
  });
  const size = new TextEncoder().encode(serializeStrategy(model)).length;
  if (size > STRATEGY_MAX_BYTES) problems.push(`The strategy is ${size} bytes; the limit is ${STRATEGY_MAX_BYTES}. Use a file path instead.`);
  return problems;
}

export function validateStrategicContextText(widgetText) {
  const parsed = parseStrategicContext(widgetText);
  if (parsed.error) return [parsed.error];
  if (parsed.mode !== 'tree') return [];
  return validateStrategy(parsed.model);
}
