import {
  PRIORITY_ORDER,
  beneficiaryFromUc,
  displayCleanText,
  inspireScoreFromUc,
  isNumericPriorityString,
  scoreOf,
  sponsorFromUc,
  favoriteKeyOf,
  fieldOf,
  hasGenieInstruction,
  hasShippedGenieCode,
  trackingIdOf,
} from './useCaseFields.js';
import {
  STRATEGY_NOT_ALIGNED,
  STRATEGY_PATH_SEPARATOR,
  compareBestOfBestFirst,
  feedbackLabel,
  kpiDirectionArrow,
  parseJson,
  priorityMatches,
  strategyPathPrefixes,
} from './v130UseCase.js';

export const GENIE_LABELS = Object.freeze({
  shipped: 'Has Genie code',
  draft: 'Draft Genie instruction',
  none: 'No Genie code',
});
export const NOT_STARTED = 'Not started';
export const BEST_OF_BEST = 'Best of best';
export const NOT_BEST_OF_BEST = 'Not in best of best';
export const FAVORITES = 'Favorites';
export const NOT_FAVORITES = 'Not in favorites';

const EXTRA_MAX_VALUES = 50;
const EXTRA_MAX_LABEL = 80;
const LABEL_KEYS = ['name', 'label', 'title', 'path', 'statement', 'id'];
const COVERED_FIELDS = new Set([
  'strategy alignment', 'strategy path', 'kpis', 'expected key results', 'data evidence', 'foundations',
  'foundation ids', 'selection flags', 'measures of success', 'financial benefits', 'non-financial benefits',
  'non financial benefits', 'tables involved',
]);
const VIEWS_PREFIX = 'inspire_results_views:';
const MAX_VIEWS = 30;
const MAX_VIEW_NAME = 60;

const uniq = (list) => [...new Set((list || []).map((v) => String(v ?? '').trim()).filter(Boolean))];
const fieldKey = (name) => String(name).replace(/_/g, ' ').trim().toLowerCase();

export function humanKey(key) {
  const text = String(key ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

export function jsonValue(value) {
  const parsed = parseJson(value);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

function itemLabel(item) {
  if (item == null) return '';
  if (typeof item !== 'object') return String(item).trim();
  if (Array.isArray(item)) return item.map(itemLabel).filter(Boolean).join(', ');
  for (const key of LABEL_KEYS) {
    const v = item[key];
    if (v != null && typeof v !== 'object' && String(v).trim()) return String(v).trim();
  }
  return '';
}

export function explodeJson(value) {
  const parsed = jsonValue(value);
  if (!parsed) return [];
  if (Array.isArray(parsed)) return uniq(parsed.map(itemLabel));
  return uniq(Object.entries(parsed).flatMap(([key, v]) => {
    if (v == null || v === false || v === '') return [];
    if (v === true) return [humanKey(key)];
    if (typeof v === 'object') return explodeJson(v).map((x) => `${humanKey(key)}: ${x}`);
    return [`${humanKey(key)}: ${String(v).trim()}`];
  }));
}

export function flagNames(value) {
  const parsed = jsonValue(value);
  if (!parsed) return [];
  if (Array.isArray(parsed)) return explodeJson(parsed);
  return uniq(Object.entries(parsed)
    .filter(([, v]) => v != null && v !== false && v !== '' && v !== 0 && v !== 'false')
    .map(([key]) => humanKey(key)));
}

export function splitList(value, separator = ',') {
  const parsed = jsonValue(value);
  if (Array.isArray(parsed)) return uniq(parsed.map(itemLabel));
  if (value == null || typeof value === 'object') return [];
  return uniq(String(value).split(separator));
}

function directionLabel(direction) {
  const arrow = kpiDirectionArrow(direction);
  if (arrow === '↑') return 'Up';
  if (arrow === '↓') return 'Down';
  return humanKey(arrow);
}

export function catalogRow(uc, index, ctx = {}) {
  const v = uc?._v130 || {};
  const id = trackingIdOf(uc);
  const favKey = favoriteKeyOf(uc);
  const status = ctx.statusOf ? ctx.statusOf(uc, id) || null : null;
  const feedbackStatus = String((v.useCaseKey && ctx.feedbackLatest?.[v.useCaseKey]?.status) || v.feedbackStatus || '').trim().toLowerCase();
  const feedback = feedbackLabel(feedbackStatus);
  const resolve = typeof ctx.resolveTable === 'function' ? ctx.resolveTable : (t) => t;
  const text = (displayKey, trackingKey) => String(fieldOf(uc, displayKey, trackingKey) ?? '').trim();
  const priority = text('Priority', 'priority');
  const foundationName = (fid) => {
    const name = ctx.foundationsById?.get?.(fid)?.name;
    return name ? `${fid} · ${name}` : fid;
  };
  return {
    key: `${id || 'uc'}#${index}`,
    index,
    uc,
    id,
    favKey,
    title: displayCleanText(uc?.Name || uc?.use_case_name || uc?.name || uc?.title || '') || id || `Use case ${index + 1}`,
    domain: String(uc?._domain || '').trim() || text('Business Domain', 'business_domain'),
    subdomain: text('Subdomain', 'subdomain'),
    technique: text('Analytics Technique', 'analytics_technique'),
    type: text('type', 'Type'),
    quality: text('Quality', 'quality'),
    priority: isNumericPriorityString(priority) ? '' : priority,
    inspire: inspireScoreFromUc(uc || {}),
    value: scoreOf(uc || {}, 'value_score', 'Value_Score', 'Value Score'),
    feasibility: scoreOf(uc || {}, 'feasibility_score', 'Feasibility_Score', 'Feasibility Score'),
    beneficiary: beneficiaryFromUc(uc || {}),
    sponsor: sponsorFromUc(uc || {}),
    bob: v.bestOfBest || null,
    genie: hasShippedGenieCode(uc || {})
      ? GENIE_LABELS.shipped
      : hasGenieInstruction(uc || {}) ? GENIE_LABELS.draft : GENIE_LABELS.none,
    status,
    poc: status?.label || NOT_STARTED,
    feedbackStatus,
    feedback: feedback || 'No feedback',
    favorite: Boolean(favKey && ctx.favorites?.[favKey]),
    strategy: v.notAligned ? [STRATEGY_NOT_ALIGNED] : uniq((v.paths || []).flatMap(strategyPathPrefixes)),
    strategyPaths: v.paths || [],
    bizPriorities: priorityMatches(v.priorityText, ctx.bizPriorities || []),
    foundations: uniq((v.foundations || []).map(foundationName)),
    kpis: uniq((v.kpis || []).map((k) => k?.name)),
    kpiDirections: uniq((v.kpis || []).map((k) => directionLabel(k?.direction))),
    keyResults: uniq((v.keyResults || []).map((kr) => (kr?.source === 'strategy' ? 'From the strategy' : 'Proposed by Inspire'))),
    tables: uniq(splitList(uc?.['Tables Involved'] ?? uc?.tables_involved).map((t) => resolve(t))),
    joinedTables: uniq((v.dataEvidence?.joins || []).flatMap((j) => [j?.child_table, j?.parent_table])),
    flags: flagNames(uc?.selection_flags ?? uc?.selectionFlags),
  };
}

export function catalogRows(useCases, ctx = {}) {
  return (useCases || []).map((uc, i) => catalogRow(uc, i, ctx)).sort(defaultRowOrder);
}

export function defaultRowOrder(a, b) {
  const starred = compareBestOfBestFirst(a.uc?._v130, b.uc?._v130);
  if (starred) return starred;
  const sa = a.inspire ?? -Infinity;
  const sb = b.inspire ?? -Infinity;
  if (sb !== sa) return sb - sa;
  return a.title.localeCompare(b.title);
}

export function rowSearchText(row) {
  const uc = row.uc || {};
  return [
    row.id, row.title, row.domain, row.subdomain, row.technique, row.beneficiary, row.sponsor,
    uc.Statement, uc.statement, uc.Solution, uc.solution, uc['Business Value'], uc.business_value,
    ...row.tables, ...row.kpis, ...row.strategyPaths,
  ].map((x) => String(x ?? '')).join(' ').toLowerCase();
}

const byOrder = (order) => (a, b) => {
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || a.localeCompare(b);
};

const lastSegment = (value) => {
  const parts = String(value).split(STRATEGY_PATH_SEPARATOR);
  return parts[parts.length - 1];
};
const depthOf = (value) => (value === STRATEGY_NOT_ALIGNED ? 0 : String(value).split(STRATEGY_PATH_SEPARATOR).length - 1);

export function extraJsonFacets(useCases) {
  const seen = new Map();
  for (const uc of useCases || []) {
    for (const [field, raw] of Object.entries(uc || {})) {
      if (field.startsWith('_') || COVERED_FIELDS.has(fieldKey(field))) continue;
      const values = explodeJson(raw);
      if (!values.length) continue;
      const counts = seen.get(field) || new Map();
      seen.set(field, counts);
      for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  const defs = [];
  for (const [field, counts] of seen) {
    const values = [...counts.keys()];
    if (values.length < 2 || values.length > EXTRA_MAX_VALUES) continue;
    if (values.some((value) => value.length > EXTRA_MAX_LABEL)) continue;
    if (![...counts.values()].some((n) => n >= 2)) continue;
    defs.push({ key: `json:${field}`, label: humanKey(field), group: 'More fields', get: (row) => explodeJson(row.uc?.[field]) });
  }
  return defs.sort((a, b) => a.label.localeCompare(b.label));
}

export function catalogFacetDefs({ strategyOrder = [], bizPriorityOrder = [], extra = [] } = {}) {
  const strategySort = byOrder([...strategyOrder, STRATEGY_NOT_ALIGNED]);
  return [
    { key: 'domain', label: 'Domain', group: 'Use case', get: (r) => [r.domain] },
    { key: 'subdomain', label: 'Subdomain', group: 'Use case', get: (r) => [r.subdomain] },
    { key: 'priority', label: 'Priority', group: 'Use case', get: (r) => [r.priority], sort: byOrder(PRIORITY_ORDER) },
    { key: 'quality', label: 'Quality', group: 'Use case', get: (r) => [r.quality], sort: byOrder(PRIORITY_ORDER) },
    { key: 'technique', label: 'Analytics technique', group: 'Use case', get: (r) => [r.technique] },
    { key: 'type', label: 'Type', group: 'Use case', get: (r) => [r.type] },
    { key: 'bob', label: 'Best of best', group: 'Selection', get: (r) => [r.bob ? BEST_OF_BEST : NOT_BEST_OF_BEST], sort: byOrder([BEST_OF_BEST, NOT_BEST_OF_BEST]) },
    { key: 'genie', label: 'Genie code', group: 'Selection', get: (r) => [r.genie], sort: byOrder(Object.values(GENIE_LABELS)) },
    { key: 'poc', label: 'PoC', group: 'Selection', get: (r) => [r.poc] },
    { key: 'feedback', label: 'Feedback', group: 'Selection', get: (r) => [r.feedback] },
    { key: 'favorite', label: 'Favorites', group: 'Selection', get: (r) => [r.favorite ? FAVORITES : NOT_FAVORITES], sort: byOrder([FAVORITES, NOT_FAVORITES]) },
    { key: 'flags', label: 'Selection flags', group: 'Selection', get: (r) => r.flags },
    { key: 'beneficiary', label: 'Beneficiary', group: 'People', get: (r) => [r.beneficiary] },
    { key: 'sponsor', label: 'Sponsor', group: 'People', get: (r) => [r.sponsor] },
    { key: 'strategy', label: 'Strategy path', group: 'Strategy', get: (r) => r.strategy, sort: strategySort, format: lastSegment, depth: depthOf },
    { key: 'bizPriority', label: 'Business priority', group: 'Strategy', get: (r) => r.bizPriorities, sort: byOrder(bizPriorityOrder) },
    { key: 'foundations', label: 'Foundation', group: 'Strategy', get: (r) => r.foundations },
    { key: 'kpis', label: 'KPI', group: 'Value', get: (r) => r.kpis },
    { key: 'kpiDirection', label: 'KPI direction', group: 'Value', get: (r) => r.kpiDirections },
    { key: 'keyResults', label: 'Key result source', group: 'Value', get: (r) => r.keyResults },
    { key: 'tables', label: 'Table involved', group: 'Data', get: (r) => r.tables, mono: true },
    { key: 'joinedTables', label: 'Joined table', group: 'Data', get: (r) => r.joinedTables, mono: true },
    ...extra,
  ];
}

export function facetIndex(rows, defs, text = rowSearchText) {
  const values = new Map();
  const totals = Object.fromEntries(defs.map((d) => [d.key, new Map()]));
  for (const row of rows) {
    const got = { __text: text(row) };
    for (const d of defs) {
      got[d.key] = uniq([].concat(d.get(row) || []));
      for (const value of got[d.key]) totals[d.key].set(value, (totals[d.key].get(value) || 0) + 1);
    }
    values.set(row, got);
  }
  const options = Object.fromEntries(defs.map((d) => {
    const counts = totals[d.key];
    const byCount = (a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b);
    return [d.key, [...counts.keys()].sort(d.sort || byCount)];
  }));
  return { defs, values, totals, options };
}

export function emptyFacetState() {
  return { sel: {}, q: '' };
}

function rowMatches(index, row, state, except) {
  const got = index.values.get(row);
  if (!got) return false;
  const terms = String(state?.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length && !terms.every((term) => got.__text.includes(term))) return false;
  for (const d of index.defs) {
    if (d.key === except) continue;
    const sel = state?.sel?.[d.key];
    if (Array.isArray(sel) && sel.length && !got[d.key].some((value) => sel.includes(value))) return false;
  }
  return true;
}

export function filterRows(index, rows, state) {
  return rows.filter((row) => rowMatches(index, row, state));
}

export function facetCounts(index, rows, state, key) {
  const counts = new Map();
  for (const row of rows) {
    if (!rowMatches(index, row, state, key)) continue;
    for (const value of index.values.get(row)[key] || []) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

export function selectedValues(state, key) {
  const sel = state?.sel?.[key];
  return Array.isArray(sel) ? sel : [];
}

export function visibleFacetDefs(index, state) {
  return index.defs.filter((d) => (index.options[d.key] || []).length >= 2 || selectedValues(state, d.key).length > 0);
}

export function facetOptions(index, state, key) {
  const known = index.options[key] || [];
  const stale = selectedValues(state, key).filter((value) => !known.includes(value));
  return [...known, ...stale];
}

export function toggleFacetValue(state, key, value) {
  const current = selectedValues(state, key);
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  const sel = { ...(state?.sel || {}) };
  if (next.length) sel[key] = next;
  else delete sel[key];
  return { ...state, sel };
}

export function setFacetValues(state, key, values) {
  const sel = { ...(state?.sel || {}) };
  const next = uniq(values);
  if (next.length) sel[key] = next;
  else delete sel[key];
  return { ...state, sel };
}

export function clearFacet(state, key) {
  return setFacetValues(state, key, []);
}

export function activeFilters(index, state) {
  const chips = [];
  for (const d of index.defs) {
    for (const value of selectedValues(state, d.key)) {
      chips.push({ key: d.key, value, label: d.label, text: d.format ? d.format(value) : value });
    }
  }
  return chips;
}

function normalizedState(state) {
  const sel = Object.entries(state?.sel || {})
    .filter(([, v]) => Array.isArray(v) && v.length)
    .map(([k, v]) => [k, [...v].sort()])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({ sel, q: String(state?.q || '').trim().toLowerCase() });
}

export function sameFacetState(a, b) {
  return normalizedState(a) === normalizedState(b);
}

export function builtInViews(index) {
  const has = (key, value) => (index.totals[key]?.get(value) || 0) > 0;
  const view = (id, name, sel) => ({ id, name, builtIn: true, state: { sel, q: '' } });
  const views = [view('all', 'All use cases', {})];
  if (has('bob', BEST_OF_BEST)) views.push(view('best', 'Best of best', { bob: [BEST_OF_BEST] }));
  const top = ['Ultra High', 'Very High', 'High'].filter((p) => has('priority', p));
  if (top.length) views.push(view('top', 'Top priority', { priority: top }));
  if (has('genie', GENIE_LABELS.shipped)) views.push(view('genie', 'Has Genie code', { genie: [GENIE_LABELS.shipped] }));
  const started = (index.options.poc || []).filter((v) => v !== NOT_STARTED);
  if (started.length) views.push(view('poc', 'In Implement', { poc: started }));
  if (has('favorite', FAVORITES)) views.push(view('favorites', 'Favorites', { favorite: [FAVORITES] }));
  return views;
}

export function savedViewsKey(business) {
  const name = String(business ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${VIEWS_PREFIX}${name || 'default'}`;
}

function cleanSel(sel) {
  if (!sel || typeof sel !== 'object' || Array.isArray(sel)) return {};
  return Object.fromEntries(Object.entries(sel)
    .map(([key, values]) => [key, uniq(Array.isArray(values) ? values : [])])
    .filter(([, values]) => values.length));
}

export function cleanSavedView(view) {
  if (!view || typeof view !== 'object') return null;
  const name = String(view.name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_VIEW_NAME);
  if (!name) return null;
  const columns = view.columns && typeof view.columns === 'object' && !Array.isArray(view.columns)
    ? Object.fromEntries(Object.entries(view.columns).filter(([, on]) => typeof on === 'boolean'))
    : {};
  const sorting = Array.isArray(view.sorting)
    ? view.sorting.filter((s) => s && typeof s.id === 'string' && s.id).map((s) => ({ id: s.id, desc: Boolean(s.desc) })).slice(0, 3)
    : [];
  return {
    id: `saved:${name.toLowerCase()}`,
    name,
    state: { sel: cleanSel(view.state?.sel), q: String(view.state?.q ?? '').slice(0, 200) },
    sorting,
    columns,
    density: view.density === 'comfortable' ? 'comfortable' : 'compact',
    mode: view.mode === 'cards' ? 'cards' : 'grid',
  };
}

export function loadSavedViews(storage, business) {
  try {
    const list = JSON.parse(storage?.getItem(savedViewsKey(business)) || '[]');
    return Array.isArray(list) ? list.map(cleanSavedView).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeViews(storage, business, views, next) {
  try {
    storage.setItem(savedViewsKey(business), JSON.stringify(next));
    return { views: next, error: '' };
  } catch {
    return { views, error: 'This browser did not save the view. Its storage may be full, or private browsing may be on.' };
  }
}

export function storeSavedView(storage, business, views, view) {
  const clean = cleanSavedView(view);
  if (!clean) return { views, error: 'Give the view a name.' };
  const rest = (views || []).filter((v) => v.id !== clean.id);
  if (rest.length >= MAX_VIEWS) return { views, error: `You can keep up to ${MAX_VIEWS} saved views. Delete one first.` };
  return writeViews(storage, business, views, [...rest, clean]);
}

export function removeSavedView(storage, business, views, id) {
  return writeViews(storage, business, views, (views || []).filter((v) => v.id !== id));
}
