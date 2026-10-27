export const START_POC_LABEL = 'Start Use Case PoC/MVP with Genie';

export const IMPLEMENT_MODES = [
  { id: 'poc', label: 'Full PoC/MVP', blurb: 'Genie builds the result table, then the outputs you pick: dashboard, Genie Agent, App or alert.' },
  { id: 'notebook', label: 'Notebook only', blurb: 'Inspire writes the Genie Code notebook for this use case. Nothing else is built; you run the notebook yourself.' },
];

const CHOOSE_STEP = { id: 'choose', label: 'Choose', sections: [], advanced: [] };

export const IMPLEMENT_STEPS = [
  CHOOSE_STEP,
  { id: 'data', label: 'Data', sections: ['use_case', 'data', 'configure'], advanced: ['use_case', 'data', 'configure'] },
  { id: 'results', label: 'Results', sections: ['results'], advanced: [] },
  { id: 'delivery', label: 'Delivery', sections: ['use_it', 'alert', 'schedule'], advanced: ['alert', 'schedule'] },
];

export const APP_STEPS = [
  { id: 'app_access', label: 'App access', sections: ['app_access'], advanced: [] },
  { id: 'app_look', label: 'App look', sections: ['app_look'], advanced: [] },
];

export const NOTEBOOK_STEPS = [
  CHOOSE_STEP,
  { id: 'data', label: 'Data', sections: [], advanced: [] },
  { id: 'notebook', label: 'Notebook', sections: [], advanced: [] },
];

export function wizardSteps(mode, spec = null) {
  if (mode === 'poc') return spec?.outputs?.app ? [...IMPLEMENT_STEPS, ...APP_STEPS] : IMPLEMENT_STEPS;
  if (mode === 'notebook') return NOTEBOOK_STEPS;
  throw new Error(`unknown implement mode '${mode}'`);
}

export const BUILD_STEP_IDS = ['delivery', ...APP_STEPS.map((s) => s.id)];

export const APP_ACCESS_CHOICES = [
  { id: 'user', label: 'Sensitive data: each person signs in as themselves (per-user)',
    blurb: 'Each person sees only the rows their own access allows.' },
  { id: 'sp', label: 'Internal data: the App uses its own service principal',
    blurb: 'Everyone sees the same rows, read with the App\'s own access. Inspire grants it read access to the result table.' },
];

export const APP_OPTION_KEYS = ['download', 'modify', 'replace_edits', 'decisions'];
export const PER_USER_OFF = ['download', 'decisions'];
export const APP_OPTIONS = [
  { id: 'download', label: 'Let people download data', blurb: 'A Download button on the decision list, each chart and each Genie answer, as CSV.' },
  { id: 'modify', label: 'Let people edit data', blurb: 'People can change records in the App, and Inspire keeps who changed what.' },
  { id: 'decisions', label: 'Record decisions', blurb: 'People can record what they decided on each record, with who decided and when.' },
];
export const REPLACE_EDITS_QUESTION = 'Should a new run replace edited records?';
export const REPLACE_EDITS_CHOICES = [
  { id: false, label: 'No', blurb: 'Edited records stay as people left them; a new run updates only the records nobody edited.' },
  { id: true, label: 'Yes', blurb: 'A new run writes its own results over edited records.' },
];
export const PER_USER_REASON = 'Each person signs in as themselves, so the App keeps every row inside their own access: '
  + 'it offers no downloads, no recorded decisions and no chart image export.';

export const APP_LOOK_DEFAULT = { style: 'a', layout: 'sidebar', palette: 'default', theme: 'light' };
export const APP_STYLES = [
  { id: 'a', label: 'Style A', blurb: 'Flat cards with a colour line under each KPI.' },
  { id: 'b', label: 'Style B', blurb: 'Tinted headers, rounded controls, KPIs with a colour edge.' },
  { id: 'c', label: 'Style C', blurb: 'Serif headlines, large KPIs on a ruled strip.' },
];
export const LAKEVIEW_STYLE_NOTE = 'Only style A matches the Lakeview dashboard look.';
export const APP_LAYOUTS = [
  { id: 'sidebar', label: 'Sidebar', blurb: 'Pages in a left menu' },
  { id: 'tabs', label: 'Top tabs', blurb: 'Pages as tabs on top' },
  { id: 'home', label: 'Home cards', blurb: 'A home page of cards' },
];
export const APP_THEMES = [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }];
export const GENIE_FOR_APP_NOTE = 'Ask Genie in the App needs a Genie Agent.';
export const RESULT_TABLE_MOVE_NOTE = 'Moving the table later copies its history to the new table and keeps the old one.';
export const MERGE_OUTPUTS = ['app', 'dashboard', 'genie_space'];

export const FRESHNESS_OPTIONS = [
  { id: 'off', label: 'Off' },
  { id: 'daily', label: 'Daily', cron: '0 0 6 * * ?' },
  { id: 'weekly', label: 'Weekly', cron: '0 0 6 ? * MON' },
];

export const IMPLEMENT_OUTPUTS = [
  { id: 'dashboard', label: 'Dashboard', blurb: 'Decision list, trend and run health. Selected by default.' },
  { id: 'genie_space', label: 'Genie Agent', blurb: 'An agent over the result and source tables, with 5 sample questions.' },
  { id: 'app', label: 'App', blurb: 'A Databricks App with the decision list, row detail and Ask Genie. You pick its access and look next.' },
  { id: 'alert', label: 'Alert', blurb: 'Emails you when the latest run has rows to act on. Genie writes the check.' },
];

export const ALERT_TIER_OPTIONS = [
  { id: 'act_now', label: 'Act now' },
  { id: 'act_now_review', label: 'Act now or Review' },
];

export const ALERT_OPERATORS = ['>=', '>', '=', '!=', '<', '<='];

export const APP_NAME_RE = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;
const APP_NAME_MAX = 30;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function dashed(text) {
  return String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function fitAppName(text, max = APP_NAME_MAX) {
  let name = text;
  if (name.length > max) {
    const boundary = name.slice(0, max + 1).lastIndexOf('-');
    name = boundary >= 3 ? name.slice(0, boundary) : name.slice(0, max);
  }
  return name.replace(/-+$/, '');
}

export function appNameOf(name, id) {
  for (const raw of [name, id]) {
    let text = dashed(raw);
    if (text && !/^[a-z]/.test(text)) text = `uc-${text}`;
    const fitted = fitAppName(text);
    if (APP_NAME_RE.test(fitted)) return fitted;
  }
  return '';
}

export function nextAppName(name) {
  const counted = /^(.+)-(\d{1,2})$/.exec(String(name || ''));
  const [base, n] = counted && Number(counted[2]) >= 2 ? [counted[1], Number(counted[2]) + 1] : [String(name || ''), 2];
  const suffix = `-${n}`;
  return `${fitAppName(base, APP_NAME_MAX - suffix.length)}${suffix}`;
}

export function caseIdOf(uc) {
  return String(uc?.id ?? uc?.No ?? uc?.use_case_id ?? '').trim();
}

export function caseNameOf(uc) {
  return String(uc?.Name || uc?.use_case || uc?.name || '').trim();
}

function tableNames(text) {
  const names = [];
  for (const part of String(text || '').split(/[,\s]+/)) {
    const name = part.replace(/`/g, '').trim().replace(/[.;:)]+$/, '').replace(/^\(+/, '');
    const parts = name.split('.');
    if (parts.length === 3 && parts.every(Boolean) && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

function sameTable(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

export function primaryTableOf(uc) {
  return tableNames(uc?.primary_table || uc?.['Primary Table'])[0] || '';
}

export function tablesOf(uc) {
  const names = tableNames(uc?.tables_involved || uc?.Tables);
  for (const name of tableNames(uc?.primary_table || uc?.['Primary Table'])) {
    if (!names.some((n) => sameTable(n, name))) names.push(name);
  }
  return names;
}

export const VALUE_LIMIT = 200;

export function tableOfRef(ref) {
  return String(ref || '').split('.').slice(0, 3).join('.');
}

export function columnOfRef(ref) {
  return String(ref || '').split('.').slice(3).join('.');
}

export function removeTable(spec, table) {
  const affected = [table, spec.data.tables?.[table]].filter(Boolean);
  const hit = (name) => affected.some((t) => sameTable(t, name));
  const tables = { ...spec.data.tables };
  delete tables[table];
  const roles = {};
  const clearedRoles = [];
  for (const [role, ref] of Object.entries(spec.data.column_roles || {})) {
    if (ref && hit(tableOfRef(ref))) clearedRoles.push(role);
    else roles[role] = ref;
  }
  const filters = (spec.data.filters || []).filter((f) => !hit(f.table));
  const removed = [...(spec.data.removed_tables || [])];
  if (!removed.some((r) => sameTable(r, table))) removed.push(table);
  return {
    spec: { ...spec, data: { ...spec.data, tables, column_roles: roles, filters, removed_tables: removed } },
    cleared: { roles: clearedRoles, filters: (spec.data.filters || []).length - filters.length },
  };
}

export function restoreTable(spec, table) {
  return { ...spec, data: { ...spec.data, removed_tables: (spec.data.removed_tables || []).filter((r) => !sameTable(r, table)) } };
}

export function removalBlocker(uc, spec, table) {
  if (sameTable(table, primaryTableOf(uc))) return 'the primary table can be swapped, not removed';
  const removed = spec.data.removed_tables || [];
  const left = tablesOf(uc).filter((t) => !removed.some((r) => sameTable(r, t)) && !sameTable(t, table));
  return left.length ? '' : 'keep at least one table';
}

export function filterValues(spec, table, column, op) {
  const found = (spec.data.filters || []).find((f) => f.table === table && f.column === column && f.op === op);
  return found ? found.values : [];
}

export function setFilterValues(spec, table, column, op, values) {
  const rest = (spec.data.filters || []).filter((f) => !(f.table === table && f.column === column && f.op === op));
  return { ...spec, data: { ...spec.data, filters: values.length ? [...rest, { table, column, op, values }] : rest } };
}

export function readinessScope(spec, uc) {
  const original = primaryTableOf(uc) || tablesOf(uc)[0] || '';
  const table = spec.data.tables?.[original] || original;
  const own = (ref) => sameTable(tableOfRef(ref), table);
  const roles = spec.data.column_roles || {};
  const dateRef = roles.event_date && own(roles.event_date) ? roles.event_date : '';
  const { start, end } = spec.data.window || {};
  const uncounted = [];
  if ((start || end) && !dateRef) {
    uncounted.push(roles.event_date ? `the date window on ${tableOfRef(roles.event_date)}` : 'the date window, which has no event date column');
  }
  const elsewhere = (spec.data.filters || []).filter((f) => !sameTable(f.table, table)).map((f) => f.table);
  for (const other of [...new Set(elsewhere)]) uncounted.push(`the filters on ${other}`);
  return {
    table,
    columns: Object.values(roles).filter((ref) => ref && own(ref)).map((ref) => String(ref).split('.').pop()),
    filters: (spec.data.filters || []).filter((f) => sameTable(f.table, table)),
    window: dateRef ? { column: dateRef.split('.').pop(), ...spec.data.window } : {},
    uncounted,
  };
}

export function readinessText(readiness, scope) {
  if (!readiness || readiness.skipped) return '';
  const found = `Inspire found ${(Number(readiness.row_count) || 0).toLocaleString('en-US')} rows to work with in ${scope.table}.`;
  const left = scope.uncounted || [];
  if (!left.length) return found;
  return `${found} This count leaves out ${left.join(' and ')}; the preview run applies ${left.length === 1 ? 'it' : 'them'}.`;
}

export function scopeNarrowing(scope) {
  const parts = [];
  if (scope.window?.column && (scope.window.start || scope.window.end)) parts.push('window');
  if ((scope.filters || []).length) parts.push('filters');
  return parts;
}

export function emptyScopeError(scope) {
  const parts = scopeNarrowing(scope);
  if (!parts.length) return `No rows to work with: ${scope.table} is empty. Change it to a table with rows.`;
  const where = {
    window: 'inside the date window you picked',
    filters: 'that pass the filters you picked',
    'window,filters': 'inside the date window that pass the filters you picked',
  }[parts.join(',')];
  return `No rows to work with: ${scope.table} has no rows ${where}. Widen or clear ${parts.join() === 'window' ? 'it' : 'them'} under Advanced settings.`;
}

export function planLines(summary) {
  if (!summary) return [];
  const label = (names) => names.map((n) => IMPLEMENT_OUTPUTS.find((o) => o.id === n)?.label || n).join(', ');
  const lines = [];
  if (summary.classes?.length) lines.push(`Changes: ${summary.classes.join(', ')}`);
  lines.push(summary.refill ? 'Genie rewrites the notebook and Inspire re-runs the preview' : 'The built notebook is kept as it is');
  if (summary.build?.length) lines.push(`Builds: ${label(summary.build)}`);
  if (summary.refresh?.length) lines.push(`Refreshes: ${label(summary.refresh)}`);
  if (summary.delete?.length) lines.push(`Deletes: ${label(summary.delete)}`);
  if (summary.keep_unmanaged?.length) lines.push(`Leaves in place, no longer managed: ${label(summary.keep_unmanaged)}`);
  if (summary.schedule) lines.push('Updates the job schedule');
  return lines;
}

function listOf(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  return String(value || '').split(/\n|;/).map((v) => v.trim()).filter(Boolean);
}

export function slugOf(id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

export function defaultSpecFromUseCase(uc, { warehouseId, inspireDatabase, owner } = {}) {
  const id = caseIdOf(uc);
  const slug = slugOf(id);
  const resultTable = inspireDatabase && slug ? `${inspireDatabase}.${slug}_out` : '';
  const measures = listOf(uc?.measures_of_success || uc?._v130?.measuresOfSuccess).slice(0, 3);
  const goal = String(uc?.statement || uc?.Statement || uc?.business_value || '').trim().slice(0, 500);
  const decisionOwner = String(owner || uc?.sponsor || uc?.Sponsor || '').trim();
  const useCaseName = caseNameOf(uc);
  return {
    use_case_id: id,
    use_case_name: useCaseName,
    based_on_version: null,
    confirm_notebook_overwrite: false,
    use_case: {
      goal,
      decision_owner: decisionOwner,
      success_measures: measures,
    },
    data: {
      tables: {},
      removed_tables: [],
      filters: [],
      run_profile: 'preview',
      column_roles: {},
      window: { start: '', end: '' },
      notes: '',
    },
    config: {
      widgets: {},
      result_table: resultTable,
      ai_endpoint: '',
      warehouse_id: warehouseId || '',
      profiles: {
        training: { window_days: '', sample_entities: '', stratify_by: '' },
        full_load: { window_days: '' },
        preview: { entity_cap: 1000 },
        retrain: { every_runs: '', drift_threshold: '' },
      },
    },
    schedule: {
      enabled: false,
      cron: '0 0 6 ? * MON',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      failure_emails: ownerEmails(decisionOwner),
    },
    outputs: {
      dashboard: true,
      genie_space: false,
      app: false,
      dashboard_name: '',
      dashboard_filters: [],
      genie_space_name: '',
      genie_questions: [],
      app_name: appNameOf(uc?.short_name || useCaseName, id),
      app_purpose: '',
      app_access: '',
      app_look: { ...APP_LOOK_DEFAULT },
      app_options: Object.fromEntries(APP_OPTION_KEYS.map((key) => [key, false])),
      merge: Object.fromEntries(MERGE_OUTPUTS.map((name) => [name, ''])),
      alert: false,
      alert_name: '',
      alert_tiers: 'act_now',
      alert_operator: '>=',
      alert_threshold: 1,
      alert_condition_text: '',
      alert_recipients: [],
      alert_destinations: [],
    },
    removed_outputs: {},
    sharing: { principals: ownerPrincipals(decisionOwner) },
  };
}

const ONE_VERSION_KEYS = ['retry_outputs', 'confirm_notebook_overwrite'];

function withoutOneVersionKeys(spec) {
  return Object.fromEntries(Object.entries(spec || {}).filter(([key]) => !ONE_VERSION_KEYS.includes(key)));
}

function idAppNameOf(id) {
  return slugOf(id).replace(/_/g, '-').slice(0, 30);
}

export function specFromLatest(latest, fallback, assets = {}) {
  const parsed = latest && latest.spec_json && typeof latest.spec_json === 'object' ? latest.spec_json : null;
  if (!parsed) return fallback;
  const saved = parsed.outputs || {};
  const outputs = { ...fallback.outputs, ...saved };
  for (const key of ['app_look', 'app_options', 'merge']) {
    outputs[key] = { ...fallback.outputs[key], ...(saved[key] && typeof saved[key] === 'object' && !Array.isArray(saved[key]) ? saved[key] : {}) };
  }
  if (saved.app && assets?.app && !Object.prototype.hasOwnProperty.call(saved, 'app_access')) outputs.app_access = 'sp';
  const idDefault = !assets?.app && outputs.app_name === idAppNameOf(fallback.use_case_id);
  if (!outputs.app || !outputs.app_name || idDefault) outputs.app_name = fallback.outputs.app_name;
  return {
    ...fallback,
    ...withoutOneVersionKeys(parsed),
    based_on_version: latest.spec_version,
    use_case: { ...fallback.use_case, ...(parsed.use_case || {}) },
    data: { ...fallback.data, ...(parsed.data || {}) },
    config: { ...fallback.config, ...(parsed.config || {}), profiles: { ...fallback.config.profiles, ...((parsed.config || {}).profiles || {}) } },
    schedule: { ...fallback.schedule, ...(parsed.schedule || {}) },
    outputs,
    sharing: { ...fallback.sharing, ...(parsed.sharing || {}) },
    removed_outputs: parsed.removed_outputs || {},
  };
}

export const ROLE_RULES = {
  keyNameSuffixes: ['_id', '_key', '_sk', '_pk', '_fk', '_nk', '_code', '_no', '_num', '_number', '_ref', '_uuid', '_guid'],
  keyNamePrefixes: ['id_', 'fk_', 'sk_', 'pk_'],
  genericKeyNames: ['code', 'fk', 'guid', 'id', 'key', 'nk', 'no', 'num', 'number', 'pk', 'record_id', 'ref', 'row_id', 'rowid', 'sk', 'uuid'],
  concatKeySuffixes: ['id', 'key', 'sk', 'code', 'num', 'number'],
  textNameTokens: ['text', 'comment', 'review', 'description', 'desc', 'note', 'feedback', 'transcript', 'body', 'message', 'title',
    'subject', 'content', 'reason', 'summary', 'narrative', 'remark'],
  personNameTokens: ['name', 'email', 'phone', 'address'],
};

const CAMEL_KEY_NAME_RE = /[a-z0-9](Id|ID|Key|KEY|Sk|SK|Code|CODE|No|NO|Num|NUM|Number|NUMBER|Ref|REF|Uuid|UUID|Guid|GUID)$/;

export function columnTypeFamily(type) {
  const t = String(type || '');
  if (/^\s*(tinyint|smallint|integer|int|bigint|long|short|byte|float|double|real|decimal|dec|numeric)\b/i.test(t)) return 'numeric';
  if (/^\s*(timestamp_ntz|timestamp_ltz|timestamp|datetime|date|time)\b/i.test(t)) return 'temporal';
  if (/^\s*(string|varchar|char|text)\b/i.test(t)) return 'string';
  if (/^\s*bool/i.test(t)) return 'boolean';
  return 'other';
}

export function nameTokens(name) {
  return String(name || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function isKeyLikeColumn(name) {
  const raw = String(name || '').trim();
  const low = raw.toLowerCase();
  if (!low) return false;
  if (ROLE_RULES.genericKeyNames.includes(low) || ROLE_RULES.keyNameSuffixes.some((s) => low.endsWith(s))
    || ROLE_RULES.keyNamePrefixes.some((p) => low.startsWith(p))) return true;
  if (CAMEL_KEY_NAME_RE.test(raw)) return true;
  return ROLE_RULES.concatKeySuffixes.some((s) => low.endsWith(s) && low.length - s.length >= 4 && /^[a-z]+$/.test(low.slice(0, -s.length)));
}

export function isDateKeyColumn(name, type) {
  return columnTypeFamily(type) === 'numeric' && isKeyLikeColumn(name) && nameTokens(name).includes('date');
}

export function columnRoleProblem(role, column, type, { trainsModel = true } = {}) {
  if (role === 'label' && !trainsModel) return '';
  const family = columnTypeFamily(type);
  const dateKey = isDateKeyColumn(column, type);
  const keyLike = isKeyLikeColumn(column);
  const tokens = nameTokens(column);
  const freeText = family === 'string' && [...ROLE_RULES.textNameTokens, ...ROLE_RULES.personNameTokens].some((t) => tokens.includes(t));
  if (role === 'entity_id' && (dateKey || family === 'temporal' || family === 'boolean' || (family === 'numeric' && !keyLike))) {
    return 'a date, a date key or a measure is not the entity the decision acts on';
  }
  if (role === 'event_date' && !(family === 'temporal' || dateKey)) {
    return 'pick a DATE or TIMESTAMP column, or a date key that joins a date table';
  }
  if (role === 'measure' && (family !== 'numeric' || keyLike)) return 'a measure is a numeric column that is not a key';
  if (role === 'label' && (family === 'temporal' || keyLike || freeText)) {
    return 'an outcome is a flag, a number or a category, never a date, a key, a name or free text';
  }
  if (role === 'segment' && (family === 'temporal' || family === 'other' || freeText)) {
    return 'a segment is a category column, never a date or free text';
  }
  return '';
}

export const RESET_ROLES_LABEL = "Reset roles to Inspire's choice";

export function columnRoleProblems(roles, columnsByTable, options = {}) {
  const problems = [];
  for (const [role, ref] of Object.entries(roles || {})) {
    if (!ref) continue;
    const table = tableOfRef(ref);
    const column = columnOfRef(ref);
    const columns = Object.entries(columnsByTable || {}).find(([t]) => sameTable(t, table))?.[1];
    if (!columns) continue;
    const found = columns.find((c) => String(c.column_name).toLowerCase() === column.toLowerCase());
    const why = found ? columnRoleProblem(role, found.column_name, found.data_type, options) : `${table} has no column ${column}`;
    if (why) problems.push(`${role.replace('_', ' ')} ${ref}: ${why}`);
  }
  return problems;
}

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_WORDS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_CODES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_WORDS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function joinWords(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function cronList(field, codes, words, base) {
  const index = (token) => (/^\d{1,2}$/.test(token) ? Number(token) - base : codes.indexOf(token));
  const parts = [];
  for (const part of field.toUpperCase().split(',')) {
    const ends = part.split('-').map(index);
    if (ends.length > 2 || ends.some((i) => i < 0 || i >= codes.length) || (ends.length === 2 && ends[0] > ends[1])) return null;
    parts.push(ends.length === 2 ? `${words[ends[0]]} to ${words[ends[1]]}` : words[ends[0]]);
  }
  return joinWords(parts);
}

function cronNumbers(field, max) {
  if (!/^\d{1,2}(,\d{1,2})*$/.test(field)) return null;
  const values = field.split(',').map(Number);
  return values.every((v) => v <= max) ? values : null;
}

function cronStep(field) {
  const step = /^(\*|0)\/(\d{1,2})$/.exec(field);
  return step && Number(step[2]) >= 1 ? Number(step[2]) : null;
}

function cronDayOfMonth(field) {
  if (field === 'L') return 'the last day';
  const days = cronNumbers(field, 31);
  return days && days.every((d) => d >= 1) ? `day ${joinWords(days.map(String))}` : null;
}

function cronPhrase(fields) {
  const [second, minute, hour, dom, month, dow, year] = fields;
  const any = (f) => f === '*' || f === '?';
  if (second !== '0' || (year && year !== '*')) return null;
  const everyDay = any(dom) && month === '*' && any(dow);
  const minuteStep = cronStep(minute);
  if (minuteStep && hour === '*' && everyDay) {
    return { text: minuteStep === 1 ? 'every minute' : `every ${minuteStep} minutes`, clock: false };
  }
  const minutes = cronNumbers(minute, 59);
  if (!minutes || minutes.length !== 1) return null;
  const hourStep = cronStep(hour);
  if ((hour === '*' || hourStep) && everyDay) {
    const every = hour === '*' || hourStep === 1 ? 'every hour' : `every ${hourStep} hours`;
    return { text: minutes[0] === 0 ? `${every}, on the hour` : `${every} at minute ${minutes[0]}`, clock: false };
  }
  const hours = cronNumbers(hour, 23);
  if (!hours) return null;
  const at = `at ${joinWords(hours.map((h) => `${String(h).padStart(2, '0')}:${String(minutes[0]).padStart(2, '0')}`))}`;
  if (everyDay) return { text: `every day ${at}`, clock: true };
  if (any(dom) && month === '*') {
    const days = cronList(dow, DAY_CODES, DAY_WORDS, 1);
    return days ? { text: `every ${days} ${at}`, clock: true } : null;
  }
  const day = any(dow) ? cronDayOfMonth(dom) : null;
  if (!day) return null;
  if (month === '*') return { text: `on ${day} of every month ${at}`, clock: true };
  const months = cronList(month, MONTH_CODES, MONTH_WORDS, 1);
  return months ? { text: `on ${day} of ${months} ${at}`, clock: true } : null;
}

export function cronInWords(cron, timezone) {
  const text = String(cron || '').trim();
  const fields = text.split(/\s+/).filter(Boolean);
  const phrase = fields.length === 6 || fields.length === 7 ? cronPhrase(fields) : null;
  if (!phrase) return text ? `a custom schedule (${text})` : 'no schedule';
  return phrase.clock ? `${phrase.text} ${String(timezone || '').trim() || 'UTC'}` : phrase.text;
}

const CRON_FIELDS = [
  ['second', 0, 59, []], ['minute', 0, 59, []], ['hour', 0, 23, []], ['day of month', 1, 31, []],
  ['month', 1, 12, MONTH_CODES], ['day of week', 1, 7, DAY_CODES], ['year', 1970, 2099, []],
];

function cronValueProblem(part, label, low, high, names) {
  if (names.includes(part) || (/^[0-9]+$/.test(part) && Number(part) >= low && Number(part) <= high)) return '';
  return `the ${label} value '${part}' is not ${low} to ${high}` + (names.length ? ` or ${names[0]} to ${names[names.length - 1]}` : '');
}

export function cronProblem(cron) {
  const fields = String(cron ?? '').toUpperCase().trim().split(/\s+/).filter(Boolean);
  if (fields.length !== 6 && fields.length !== 7) {
    return `it has ${fields.length} fields; a Quartz cron has 6 or 7: second, minute, hour, day of month, month, day of week and an optional year`;
  }
  for (let i = 0; i < fields.length; i += 1) {
    const text = fields[i];
    const [label, low, high, names] = CRON_FIELDS[i];
    if (text === '?' && (label === 'day of month' || label === 'day of week')) continue;
    const last = label === 'day of month' ? /^(?:L(?:-([0-9]+))?|LW|([0-9]+)W)$/.exec(text) : null;
    if (last) {
      if (last[1] !== undefined && !(Number(last[1]) >= 1 && Number(last[1]) <= 30)) return `the day of month offset '${last[1]}' is not 1 to 30`;
      const problem = last[2] !== undefined ? cronValueProblem(last[2], label, low, high, names) : '';
      if (problem) return problem;
      continue;
    }
    const nth = label === 'day of week' ? /^(?:L|([0-9]+|[A-Z]+)(?:L|#([0-9]+)))$/.exec(text) : null;
    if (nth) {
      const problem = nth[1] ? cronValueProblem(nth[1], label, low, high, names) : '';
      if (problem) return problem;
      if (nth[2] !== undefined && !(Number(nth[2]) >= 1 && Number(nth[2]) <= 5)) return `the day of week occurrence '${nth[2]}' is not 1 to 5`;
      continue;
    }
    for (const item of text.split(',')) {
      const slashAt = item.indexOf('/');
      const base = slashAt < 0 ? item : item.slice(0, slashAt);
      const step = slashAt < 0 ? '' : item.slice(slashAt + 1);
      const top = label === 'year' ? 129 : high;
      if (slashAt >= 0 && !(/^[0-9]+$/.test(step) && Number(step) >= 1 && Number(step) <= top)) return `the ${label} step '${step}' is not 1 to ${top}`;
      if (base === '*') continue;
      const dashAt = base.indexOf('-');
      for (const part of dashAt < 0 ? [base] : [base.slice(0, dashAt), base.slice(dashAt + 1)]) {
        const problem = cronValueProblem(part, label, low, high, names);
        if (problem) return problem;
      }
    }
  }
  if ((fields[3] === '?') === (fields[5] === '?')) return "exactly one of day of month and day of week must be '?'";
  return '';
}

function cronFieldSize(text, low, high, names) {
  if (text === '*' || text === '?') return high - low + 1;
  const value = (token) => (names.includes(token) ? names.indexOf(token) + low : Number(token));
  const seen = new Set();
  for (const item of text.split(',')) {
    const slashAt = item.indexOf('/');
    const base = slashAt < 0 ? item : item.slice(0, slashAt);
    const step = slashAt < 0 ? 1 : Number(item.slice(slashAt + 1));
    const dashAt = base.indexOf('-');
    const start = base === '*' ? low : value(dashAt < 0 ? base : base.slice(0, dashAt));
    let end = start;
    if (base === '*' || (dashAt < 0 && slashAt >= 0)) end = high;
    else if (dashAt >= 0) end = value(base.slice(dashAt + 1));
    const span = end >= start ? end - start : end + (high - low + 1) - start;
    for (let offset = 0; offset <= span; offset += step) seen.add(((start - low + offset) % (high - low + 1)) + low);
  }
  return seen.size;
}

export function cronRunsPerMonth(cron) {
  if (!String(cron || '').trim() || cronProblem(cron)) return null;
  const fields = String(cron).toUpperCase().trim().split(/\s+/);
  const size = (i) => cronFieldSize(fields[i], CRON_FIELDS[i][1], CRON_FIELDS[i][2], CRON_FIELDS[i][3]);
  const [, , , dom, , dow] = fields;
  let days;
  if (dom !== '?') days = /^(L(-[0-9]+)?|LW|[0-9]+W)$/.test(dom) ? 1 : (dom === '*' ? 30.44 : size(3));
  else if (dow.includes('#') || /^[0-9A-Z]+L$/.test(dow)) days = 1;
  else if (dow === 'L') days = 30.44 / 7;
  else days = size(5) * (30.44 / 7);
  return size(0) * size(1) * size(2) * days * (size(4) / 12);
}

const WIDGET_NUMBER_RE = /^-?[0-9]+(?:\.[0-9]+)?$/;
const ALLOWED_RE = /^(?:(whole number)(?:, |$))?(?:(-?[0-9]+(?:\.[0-9]+)?) to (-?[0-9]+(?:\.[0-9]+)?)|at least (-?[0-9]+(?:\.[0-9]+)?)|at most (-?[0-9]+(?:\.[0-9]+)?))?$/;

export function allowedRule(text) {
  const value = String(text ?? '').trim();
  const match = ALLOWED_RE.exec(value.toLowerCase() === 'any' ? '' : value);
  if (!match) return null;
  const low = match[2] !== undefined ? match[2] : match[4];
  const high = match[3] !== undefined ? match[3] : match[5];
  return { low: low !== undefined ? Number(low) : null, high: high !== undefined ? Number(high) : null, whole: Boolean(match[1]) };
}

function numberText(value) {
  return Number(value).toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
}

export function allowedText(rule) {
  const { low = null, high = null, whole = false } = rule || {};
  let bounds = '';
  if (low !== null && high !== null) bounds = `${numberText(low)} to ${numberText(high)}`;
  else if (low !== null) bounds = `at least ${numberText(low)}`;
  else if (high !== null) bounds = `at most ${numberText(high)}`;
  if (!whole) return bounds;
  return bounds ? `whole number, ${bounds}` : 'whole number';
}

export function widgetValueProblem(name, value, allowed) {
  const rule = allowedRule(allowed);
  if (!rule || (rule.low === null && rule.high === null && !rule.whole)) return '';
  const text = String(value ?? '').trim();
  const number = WIDGET_NUMBER_RE.test(text) && !(rule.whole && text.includes('.')) ? Number(text) : null;
  if (number === null || (rule.low !== null && number < rule.low) || (rule.high !== null && number > rule.high)) {
    return `${name} is '${text}'; allowed: ${allowedText(rule)}`;
  }
  return '';
}

export function widgetSetProblems(values) {
  const number = (name) => {
    const text = String(values[name] ?? '').trim();
    return WIDGET_NUMBER_RE.test(text) ? Number(text) : null;
  };
  const problems = [];
  const act = number('act_now_share');
  const review = number('review_share');
  if (act !== null && review !== null && act + review > 1 + 1e-9) {
    problems.push(`act_now_share + review_share is ${numberText(act + review)}; allowed: at most 1`);
  }
  for (const lowName of Object.keys(values).sort()) {
    const highName = `max_${lowName.slice(4)}`;
    if (!lowName.startsWith('min_') || !Object.prototype.hasOwnProperty.call(values, highName)) continue;
    const low = number(lowName);
    const high = number(highName);
    if (low !== null && high !== null && low > high) problems.push(`${lowName} is ${numberText(low)}, above ${highName} ${numberText(high)}`);
  }
  return problems;
}

export function widgetProblems(widgets, values) {
  const known = (widgets || []).filter((w) => w && typeof w === 'object');
  const allowed = Object.fromEntries(known.map((w) => [String(w.name ?? ''), w.allowed]));
  const problems = Object.keys(values || {}).sort()
    .map((name) => widgetValueProblem(name, values[name], allowed[name] ?? ''))
    .filter(Boolean);
  const merged = Object.fromEntries(known.map((w) => [String(w.name ?? ''), w.default]));
  Object.assign(merged, values || {});
  return problems.concat(widgetSetProblems(merged));
}

export const PROFILE_FIELDS = {
  'preview.entity_cap': { label: 'preview entity cap', allowed: 'whole number, at least 1' },
  'training.window_days': { label: 'training window days', allowed: 'whole number, at least 1' },
  'training.sample_entities': { label: 'training sample entities', allowed: 'whole number, at least 1' },
  'full_load.window_days': { label: 'full-load window days', allowed: 'whole number, at least 1' },
  'retrain.every_runs': { label: 'retrain every N full runs', allowed: 'whole number, at least 1' },
  'retrain.drift_threshold': { label: 'retrain drift threshold', allowed: 'above 0, at most 1', range: '0 to 1', above: 0 },
};

export function profileFieldProblem(path, value) {
  const field = PROFILE_FIELDS[path];
  const text = String(value ?? '').trim();
  if (!text) return '';
  const fails = widgetValueProblem(field.label, text, field.range || field.allowed) !== ''
    || (field.above != null && Number(text) <= field.above);
  return fails ? `${field.label} is '${text}'; allowed: ${field.allowed}` : '';
}

export function profileProblems(profiles, sections) {
  return Object.keys(PROFILE_FIELDS)
    .filter((path) => sections.includes(path.split('.')[0]))
    .map((path) => profileFieldProblem(path, profiles?.[path.split('.')[0]]?.[path.split('.')[1]]))
    .filter(Boolean);
}

function dayNumber(text) {
  const time = Date.parse(String(text || '').slice(0, 10));
  return Number.isFinite(time) ? Math.floor(time / 86400000) : null;
}

export function profileEstimate({ evidence, table, dateColumn, windowDays, dataWindow, entityCap, sampleEntities, discoveryType }) {
  if (discoveryType === 'Standard' || !evidence) return { rows: null, text: 'unknown: Standard discovery read no rows' };
  const entry = Object.entries(evidence.tables || {}).find(([name]) => sameTable(name, table));
  if (!entry || entry[1].rows == null) return { rows: null, text: `unknown: Deep discovery has no row count for ${table || 'the main table'}` };
  const { rows, date_ranges: ranges = {}, sampled } = entry[1];
  const range = dateColumn ? ranges[dateColumn] || ranges[Object.keys(ranges).find((c) => c.toLowerCase() === dateColumn.toLowerCase())] : null;
  let estimate = rows;
  const notes = [];
  if (range) {
    let first = dayNumber(range.min);
    let last = dayNumber(range.max);
    if (first !== null && last !== null && last >= first) {
      const span = last - first + 1;
      const start = dayNumber(dataWindow?.start);
      const end = dayNumber(dataWindow?.end);
      if (start !== null) first = Math.max(first, start);
      if (end !== null) last = Math.min(last, end);
      const days = Number(windowDays) > 0 ? Math.min(Number(windowDays), Math.max(0, last - first + 1)) : Math.max(0, last - first + 1);
      estimate = Math.round(rows * (days / span));
      notes.push(`${days} of ${span} days of ${dateColumn}${sampled ? ', dates from a sample' : ''}`);
    }
  } else if (Number(windowDays) > 0 || dataWindow?.start || dataWindow?.end) {
    notes.push(dateColumn ? 'no date range was profiled, so this is the whole table'
      : 'no event date column is set here, so this is the whole table; the PoC/MVP applies the window to the instruction\'s date');
  }
  if (Number(sampleEntities) > 0) notes.push(`then a sample of ${Number(sampleEntities)} entities`);
  if (Number(entityCap) > 0) notes.push(`capped at ${Number(entityCap)} entities`);
  const prefix = range ? 'about' : 'at most';
  return { rows: estimate, text: `${prefix} ${estimate.toLocaleString('en-US')} rows of ${table}${notes.length ? ` (${notes.join('; ')})` : ''}` };
}

export const PREFLIGHT_LABELS = {
  warehouse: 'SQL warehouse',
  output: 'Output table',
  result_grant: 'Share the result table',
  app_name: 'App name',
  app_access: 'App reads the data',
  apps: 'Apps quota',
  genie_spaces: 'Genie Agents',
  alerts: 'Alerts',
};

export function costHint(spec) {
  const preview = 'one preview run now';
  const alert = spec.outputs?.alert ? ', plus one alert check after each full run' : '';
  if (!spec.schedule?.enabled) return `${preview}; no scheduled runs until you turn the schedule on${alert}.`;
  const runs = cronRunsPerMonth(spec.schedule.cron);
  if (runs == null) return `${preview}; the schedule's run count is unknown until its cron is valid.`;
  const count = runs >= 10 ? Math.round(runs).toLocaleString('en-US') : String(Math.round(runs * 10) / 10);
  const years = String(spec.schedule.cron).trim().split(/\s+/)[6];
  return `${preview}, then about ${count} full serverless runs a month (${cronInWords(spec.schedule.cron, spec.schedule.timezone)})`
    + `${years && years !== '*' ? `, only in ${years}` : ''}${alert}.`;
}

function ownerEmails(owner) {
  const email = String(owner || '').trim();
  return EMAIL_RE.test(email) ? [email] : [];
}

function ownerPrincipals(owner) {
  return ownerEmails(owner).map((name) => ({ type: 'user', name }));
}

function sameEmails(list, emails) {
  return list.length === emails.length && list.every((e, i) => String(e || '').toLowerCase() === emails[i].toLowerCase());
}

export function withDecisionOwner(spec, owner) {
  const before = ownerEmails(spec.use_case.decision_owner);
  const principals = spec.sharing?.principals || [];
  const emailsUntouched = sameEmails(spec.schedule.failure_emails || [], before);
  const sharingUntouched = principals.every((p) => p.type === 'user') && sameEmails(principals.map((p) => p.name), before);
  return {
    ...spec,
    use_case: { ...spec.use_case, decision_owner: owner },
    schedule: emailsUntouched ? { ...spec.schedule, failure_emails: ownerEmails(owner) } : spec.schedule,
    sharing: sharingUntouched ? { ...spec.sharing, principals: ownerPrincipals(owner) } : spec.sharing,
  };
}

export function defaultAlertRecipients(spec) {
  const candidates = [
    spec?.use_case?.decision_owner,
    ...(spec?.sharing?.principals || []).filter((p) => p.type === 'user').map((p) => p.name),
  ];
  const out = [];
  for (const raw of candidates) {
    const email = String(raw || '').trim();
    if (EMAIL_RE.test(email) && !out.some((e) => e.toLowerCase() === email.toLowerCase())) out.push(email);
  }
  return out;
}

export function alertTriggerText(outputs) {
  const tiers = (ALERT_TIER_OPTIONS.find((t) => t.id === outputs?.alert_tiers) || ALERT_TIER_OPTIONS[0]).label;
  const threshold = outputs?.alert_threshold === '' || outputs?.alert_threshold == null ? 1 : outputs.alert_threshold;
  const text = `${tiers} rows in the latest run ${outputs?.alert_operator || '>='} ${numberText(threshold)}`;
  return outputs?.alert_condition_text ? `${text}, or ${outputs.alert_condition_text}` : text;
}

export function nextSpecFrom(latest, changes = {}) {
  return { ...withoutOneVersionKeys(latest?.spec_json), based_on_version: latest?.spec_version ?? null, ...changes };
}

export function editedNotebook(latest) {
  const notebook = latest?.asset_status?.notebook;
  return notebook?.state === 'edited' ? { edited_at: notebook.edited_at ?? null } : null;
}

export function retryableOutputs(latest) {
  if (!latest || latest.status !== 'ready_with_warnings') return [];
  const chosen = latest.spec_json?.outputs || {};
  const assets = latest.asset_status || {};
  return IMPLEMENT_OUTPUTS.filter((o) => chosen[o.id] && assets[o.id]?.state === 'failed')
    .map((o) => ({ ...o, error: String(assets[o.id].error || ''), spec_version: assets[o.id].spec_version ?? latest.spec_version ?? null }));
}

export function rebuildableOutputs(latest) {
  if (!latest || !['ready', 'ready_with_warnings'].includes(latest.status)) return [];
  const chosen = latest.spec_json?.outputs || {};
  const assets = latest.asset_status || {};
  return IMPLEMENT_OUTPUTS.filter((o) => chosen[o.id] && assets[o.id]?.state === 'ready');
}

export function sectionErrors(section, spec, extras = {}) {
  const errors = [];
  if (section === 'use_case') {
    if (!spec.use_case.goal) errors.push('write the goal sentence');
    if (!spec.use_case.decision_owner) errors.push('name the decision owner');
  }
  if (section === 'results') errors.push(...resultTableProblems(spec.config.result_table));
  if (section === 'app_access' && spec.outputs.app) {
    if (!APP_ACCESS_CHOICES.some((c) => c.id === spec.outputs.app_access)) {
      errors.push('choose who the App signs people in as: each person (per-user) or its own service principal');
    }
    const block = appMergeBlock(spec, mergeTargetOf(extras.mergeTargets, 'app', spec.outputs.merge?.app));
    if (block) errors.push(block);
  }
  if (section === 'app_look' && spec.outputs.app && extras.appLook) {
    for (const [key, list] of Object.entries(APP_LOOK_LISTS)) {
      if (!(extras.appLook[list] || []).includes(spec.outputs.app_look?.[key])) errors.push(`pick one of the App's ${list}`);
    }
  }
  if (section === 'data') {
    const roleProblems = columnRoleProblems(spec.data.column_roles, extras.columnsByTable, { trainsModel: extras.trainsModel !== false });
    errors.push(...roleProblems);
    if (roleProblems.length) errors.push(`${RESET_ROLES_LABEL}, under Advanced settings, sets every role back at once`);
    const { start, end } = spec.data.window || {};
    if (start && end && start > end) errors.push('the window starts after it ends');
    for (const kept of (spec.data.filters || []).filter((f) => f.op === 'in')) {
      const both = filterValues(spec, kept.table, kept.column, 'not in').filter((v) => kept.values.includes(v));
      if (both.length) errors.push(`${kept.table}.${kept.column} both keeps and excludes ${both.join(', ')}`);
    }
  }
  if (section === 'configure') {
    if (!spec.config.warehouse_id) errors.push('pick a SQL warehouse');
    errors.push(...widgetProblems(extras.widgets || [], spec.config.widgets || {}));
    errors.push(...profileProblems(spec.config.profiles, extras.trainsModel === false ? ['full_load', 'preview'] : ['training', 'full_load', 'preview']));
  }
  if (section === 'schedule') {
    const cron = String(spec.schedule.cron || '').trim();
    if (spec.schedule.enabled && !cron) errors.push('an enabled schedule needs a cron');
    const problem = cron ? cronProblem(cron) : '';
    if (problem) errors.push(`the cron is not valid: ${problem}`);
    if (extras.trainsModel !== false) errors.push(...profileProblems(spec.config.profiles, ['retrain']));
  }
  if (section === 'use_it') {
    if (!IMPLEMENT_OUTPUTS.some((o) => spec.outputs[o.id])) errors.push('pick at least one way to use it');
    if (spec.outputs.app && !APP_NAME_RE.test(spec.outputs.app_name || '')) {
      errors.push('app name must be 3-30 lowercase letters, digits and dashes');
    }
    if (spec.outputs.app && !spec.outputs.genie_space) errors.push(GENIE_FOR_APP_NOTE);
    for (const name of MERGE_OUTPUTS) {
      const id = spec.outputs.merge?.[name];
      if (!spec.outputs[name] || !id || !extras.mergeTargets || extras.held?.[name] === id) continue;
      if (!mergeTargetOf(extras.mergeTargets, name, id)) {
        errors.push(`pick a ${IMPLEMENT_OUTPUTS.find((o) => o.id === name).label} Inspire built to add to, or choose Create new`);
      }
    }
  }
  if (section === 'alert' && spec.outputs.alert) {
    const recipients = spec.outputs.alert_recipients || [];
    const bad = recipients.filter((e) => !EMAIL_RE.test(String(e || '').trim()));
    if (bad.length) errors.push(`not an email address: ${bad.join(', ')}`);
    if (!recipients.length && !(spec.outputs.alert_destinations || []).length) {
      errors.push('an alert needs at least one recipient email or notification destination');
    }
    const threshold = spec.outputs.alert_threshold;
    if (threshold !== '' && threshold != null && !(Number.isFinite(Number(threshold)) && Number(threshold) >= 0)) {
      errors.push('the alert threshold must be a number of rows, 0 or more');
    }
  }
  return errors;
}

function stepOf(id, mode, spec) {
  const step = wizardSteps(mode, spec).find((s) => s.id === id);
  if (!step) throw new Error(`unknown wizard step '${id}'`);
  return step;
}

export function stepErrors(step, spec, extras = {}, mode = 'poc') {
  return stepOf(step, mode, spec).sections.flatMap((section) => sectionErrors(section, spec, extras));
}

export function advancedErrors(step, spec, extras = {}, mode = 'poc') {
  return stepOf(step, mode, spec).advanced.flatMap((section) => sectionErrors(section, spec, extras));
}

const APP_LOOK_LISTS = { style: 'styles', layout: 'layouts', palette: 'palettes', theme: 'themes' };

export function resultTableProblems(table) {
  const parts = String(table || '').split('.');
  if (parts.length !== 3 || parts.some((p) => !p.trim())) return ['pick a catalog and a schema, and name the result table'];
  if (!parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return ['the result table can only use catalog, schema and table names of letters, digits, _ and -'];
  return [];
}

export function resultTableParts(table) {
  const [catalog = '', schema = '', ...rest] = String(table || '').split('.');
  return { catalog, schema, table: rest.join('.') };
}

export function withResultTable(spec, { catalog, schema, table }) {
  const name = [catalog, schema, table].map((p) => String(p ?? '').trim());
  return { ...spec, config: { ...spec.config, result_table: name.some(Boolean) ? name.join('.') : '' } };
}

export function withOutput(spec, id, checked, assets = {}) {
  if (id === 'genie_space' && !checked && spec.outputs.app) return spec;
  const outputs = { ...spec.outputs, [id]: checked };
  if (id === 'alert' && checked && !(outputs.alert_recipients || []).length) outputs.alert_recipients = defaultAlertRecipients(spec);
  if (id === 'app' && checked) outputs.genie_space = true;
  const removed = { ...spec.removed_outputs };
  if (!checked && assets?.[id]) delete removed[id];
  return { ...spec, outputs, removed_outputs: removed };
}

export function withAppAccess(spec, access) {
  const options = { ...spec.outputs.app_options };
  if (access === 'user') for (const key of PER_USER_OFF) options[key] = false;
  return { ...spec, outputs: { ...spec.outputs, app_access: access, app_options: options } };
}

export function appOptionShown(spec, key) {
  if (PER_USER_OFF.includes(key) && spec.outputs.app_access === 'user') return false;
  return key !== 'replace_edits' || Boolean(spec.outputs.app_options?.modify);
}

export function withAppOption(spec, key, value) {
  const options = { ...spec.outputs.app_options, [key]: Boolean(value) };
  if (key === 'modify' && !value) options.replace_edits = false;
  return { ...spec, outputs: { ...spec.outputs, app_options: options } };
}

export function withAppLook(spec, key, value) {
  return { ...spec, outputs: { ...spec.outputs, app_look: { ...spec.outputs.app_look, [key]: value } } };
}

export function mergeTargetOf(targets, name, id) {
  return id ? ((targets && targets[name]) || []).find((t) => t.id === id) || null : null;
}

export function appMergeBlock(spec, target) {
  return spec?.outputs?.app_access === 'user' && target?.access === 'sp' ? String(target.per_user_block || '') : '';
}

export function withMergeTarget(spec, name, target, freshAppName = '') {
  const outputs = { ...spec.outputs, merge: { ...spec.outputs.merge, [name]: target ? target.id : '' } };
  if (name === 'app') {
    outputs.app_name = target ? target.id : (freshAppName || outputs.app_name);
    outputs.app_look = { ...APP_LOOK_DEFAULT, ...((target && target.look) || {}) };
  }
  return { ...spec, outputs };
}

export function mergeTargetText(target) {
  const held = (target?.use_cases || []).map((u) => u.name || u.use_case_id);
  const shown = held.slice(0, 3).join(', ');
  return held.length > 3 ? `${shown} and ${held.length - 3} more` : shown;
}

export function freshnessOf(schedule) {
  if (!schedule?.enabled) return 'off';
  const cron = String(schedule.cron || '').trim();
  return FRESHNESS_OPTIONS.find((o) => o.cron === cron)?.id || 'custom';
}

export function withFreshness(spec, id) {
  if (id === 'off') return { ...spec, schedule: { ...spec.schedule, enabled: false } };
  const option = FRESHNESS_OPTIONS.find((o) => o.id === id && o.cron);
  if (!option) throw new Error(`unknown freshness '${id}'`);
  return { ...spec, schedule: { ...spec.schedule, enabled: true, cron: option.cron } };
}

export const IMPLEMENT_ACTIVE_STATUSES = ['queued', 'filling', 'previewing', 'building_outputs'];

export function versionActive(latest, stalled = null) {
  return IMPLEMENT_ACTIVE_STATUSES.includes(String(latest?.status || '')) && !stalled;
}

export function statusChip(status, stalled = null) {
  const s = String(status || '');
  if (s === 'ready') return { label: 'Ready', tone: 'success' };
  if (s === 'ready_with_warnings') return { label: 'Warnings', tone: 'warning' };
  if (s === 'failed') return { label: 'Failed', tone: 'error' };
  if (IMPLEMENT_ACTIVE_STATUSES.includes(s)) return stalled ? { label: 'Stopped', tone: 'error' } : { label: s.replace(/_/g, ' '), tone: 'busy' };
  return { label: s || 'New', tone: 'idle' };
}

export function statusReason(latest, stalled = null) {
  const s = String(latest?.status || '');
  if (stalled && IMPLEMENT_ACTIVE_STATUSES.includes(s)) {
    return `${String(stalled.reason || 'its run stopped before it finished').trim()}. Edit submits a new version.`;
  }
  if (!['ready_with_warnings', 'failed'].includes(s)) return '';
  return String(latest?.status_message || '').trim();
}

export function historyStatus(row, latest, stalled = null) {
  const s = String(row?.status || '');
  if (!IMPLEMENT_ACTIVE_STATUSES.includes(s)) return s;
  return row?.spec_version !== latest?.spec_version || stalled ? 'stopped before it finished' : s;
}

export function lostTables(latest, rerunError) {
  const fromRerun = Array.isArray(rerunError?.missing_tables) ? rerunError.missing_tables : [];
  if (fromRerun.length) return fromRerun;
  const data = latest?.asset_status?.data;
  if (latest?.status !== 'failed' || data?.state !== 'failed' || data?.spec_version !== latest?.spec_version) return [];
  return Array.isArray(data.missing_tables) ? data.missing_tables : [];
}

export function lostTablesText(missing) {
  if (!missing?.length) return '';
  return `These source tables are missing or not readable: ${missing.map((m) => `${m.table} (${m.reason})`).join(', ')}. `
    + 'Swap each for a table with the same role, or remove it.';
}

export function initialStepIndex(focus, mode = 'poc', spec = null) {
  const steps = wizardSteps(mode, spec);
  const want = focus?.step;
  if (want === 'review') return steps.length - 1;
  const index = steps.findIndex((s) => s.id === want || s.sections.includes(want));
  return index < 0 ? 0 : index;
}

const flagYes = (value) => ['Y', 'YES', 'TRUE'].includes(String(value ?? '').trim().toUpperCase());

export function notebookStatus(uc, notebookRun) {
  if (flagYes(uc?.has_genie_code)) return { state: 'ready', label: 'Notebook ready', tone: 'success', reason: '', url: '' };
  if (!flagYes(uc?.generate_genie_code_instruction)) return null;
  if (!notebookRun) {
    return { state: 'requested', label: 'Notebook requested', tone: 'idle', reason: 'No notebook run of this session is visible to you yet.', url: '' };
  }
  const url = String(notebookRun.url || '');
  if (notebookRun.state === 'running') return { state: 'running', label: 'Notebook running', tone: 'busy', reason: '', url };
  const ended = notebookRun.result_state || notebookRun.life_cycle_state || 'failed';
  const reason = notebookRun.state === 'succeeded'
    ? 'The notebook run finished without writing this notebook. Open the run to see why.'
    : `The notebook run ended ${ended}${notebookRun.message ? `: ${notebookRun.message}` : ''}.`;
  return { state: 'failed', label: 'Notebook failed', tone: 'error', reason, url };
}

export function notebookRunEnded(prev, run) {
  if (!prev || !run || run.state === 'running') return false;
  return prev.state === 'running' || String(prev.run_id) !== String(run.run_id);
}

export const IMPLEMENT_GROUPS = [
  { id: 'in_progress', label: 'In progress' },
  { id: 'ready', label: 'Ready' },
  { id: 'failed', label: 'Failed' },
  { id: 'not_started', label: 'Not started' },
];

const NOTEBOOK_GROUP = { running: 'in_progress', ready: 'ready', failed: 'failed', requested: 'not_started' };

export function implementState(latest, notebook = null) {
  const s = String(latest?.status || '');
  if (s) {
    if (s === 'ready') return { group: 'ready', label: 'PoC/MVP ready', tone: 'success', kind: 'poc' };
    if (s === 'ready_with_warnings') return { group: 'ready', label: 'PoC/MVP ready with warnings', tone: 'warning', kind: 'poc' };
    if (s === 'failed') return { group: 'failed', label: 'PoC/MVP failed', tone: 'error', kind: 'poc' };
    if (IMPLEMENT_ACTIVE_STATUSES.includes(s) && latest.stalled) return { group: 'failed', label: 'PoC/MVP stopped', tone: 'error', kind: 'poc' };
    if (IMPLEMENT_ACTIVE_STATUSES.includes(s)) return { group: 'in_progress', label: 'PoC/MVP running', tone: 'busy', kind: 'poc' };
    return { group: 'in_progress', label: `PoC/MVP ${s.replace(/_/g, ' ')}`, tone: 'idle', kind: 'poc' };
  }
  if (notebook) return { group: NOTEBOOK_GROUP[notebook.state], label: notebook.label, tone: notebook.tone, kind: 'notebook' };
  return { group: 'not_started', label: '', tone: 'idle', kind: 'none' };
}

export function implementGroups(useCases, latestRows, notebookRun, query = '') {
  const latestById = new Map((Array.isArray(latestRows) ? latestRows : []).map((row) => [String(row?.use_case_id ?? '').trim(), row]));
  const listed = (Array.isArray(useCases) ? useCases : []).filter((uc) => caseIdOf(uc));
  const listedIds = new Set(listed.map(caseIdOf));
  const orphans = [...latestById.entries()]
    .filter(([id]) => id && !listedIds.has(id))
    .map(([id, row]) => ({ id, Name: String(row.use_case_name || id) }));
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const items = [...listed, ...orphans].map((uc) => {
    const id = caseIdOf(uc);
    const latest = latestById.get(id) || null;
    const notebook = notebookStatus(uc, notebookRun);
    return { id, name: caseNameOf(uc) || id, domain: String(uc._domain || uc['Business Domain'] || ''), uc, latest, notebook, state: implementState(latest, notebook) };
  }).filter((item) => {
    const text = `${item.id} ${item.name} ${item.domain}`.toLowerCase();
    return terms.every((t) => text.includes(t));
  });
  return IMPLEMENT_GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.state.group === group.id) }));
}

const questionKey = (text) => String(text ?? '').split(/\s+/).filter(Boolean).join(' ').toLowerCase();

export function genieQuestions(latest) {
  const space = latest?.asset_status?.genie_space;
  const recorded = space?.sample_questions;
  if (Array.isArray(recorded) && recorded.length) {
    const notes = new Map((Array.isArray(space.question_notes) ? space.question_notes : [])
      .filter((n) => n && n.question && n.note).map((n) => [questionKey(n.question), String(n.note)]));
    const questions = recorded.map(String);
    return { source: 'space', questions, notes: questions.map((q) => notes.get(questionKey(q)) || '') };
  }
  const asked = latest?.spec_json?.outputs?.genie_questions;
  const questions = Array.isArray(asked) ? asked.map(String) : [];
  return { source: 'spec', questions, notes: questions.map(() => '') };
}

const APP_HEALTH_TEXT = {
  passed: 'passed: its health page answered 200',
  running: 'running: it answers behind workspace sign-in',
};

export function appStatusRows(appStatus, asset) {
  const rows = [];
  if (appStatus?.ok === false) rows.push(['Live status', appStatus.error]);
  if (appStatus?.ok) {
    const joined = (...parts) => parts.filter(Boolean).join(': ');
    rows.push(['App', joined(appStatus.app_state, appStatus.app_message) || 'unknown']);
    rows.push(['Compute', appStatus.compute_state || 'unknown']);
    const deployment = joined(appStatus.deployment_state, appStatus.deployment_message);
    rows.push(['Last deployment', deployment ? `${deployment}${appStatus.deployed_at ? ` (${appStatus.deployed_at})` : ''}` : 'none']);
  }
  if (asset?.health) rows.push(['Health check', APP_HEALTH_TEXT[asset.health] || asset.health]);
  if (asset?.spec_version) rows.push(['Built on', `v${asset.spec_version}`]);
  return rows;
}

export function runProfileText(profile) {
  return profile || 'full (job default)';
}
