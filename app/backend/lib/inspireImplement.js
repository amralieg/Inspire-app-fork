const IMPLEMENT_OPERATION = 'Implement Use Cases';
const IMPLEMENT_TABLE = '__inspire_implement';
const IMPLEMENT_STATUSES = ['queued', 'filling', 'previewing', 'building_outputs', 'ready', 'ready_with_warnings', 'failed'];
const IMPLEMENT_ACTIVE_STATUSES = ['queued', 'filling', 'previewing', 'building_outputs'];
const IMPLEMENT_DONE_STATUSES = ['ready', 'ready_with_warnings'];
const IMPLEMENT_OUTPUTS = ['dashboard', 'genie_space', 'app', 'alert'];
const IMPLEMENT_OUTPUT_LABELS = { dashboard: 'Dashboard', genie_space: 'Genie space', app: 'App', alert: 'Alert' };
const IMPLEMENT_OUTPUT_ID_COLUMNS = { dashboard: 'dashboard_id', genie_space: 'genie_space_id', app: 'app_name', alert: 'alert_id' };
const IMPLEMENT_STOPPED_STATES = ['deleted', 'released'];
const IMPLEMENT_RUN_ENDED_STATES = ['TERMINATED', 'SKIPPED', 'INTERNAL_ERROR'];
const IMPLEMENT_STALE_AFTER_MS = 4 * 3600 * 1000;
const IMPLEMENT_CHANGE_CLASSES = ['initial', 'data', 'config', 'schedule', 'outputs', 'deselect', 'sharing', 'retry'];
const IMPLEMENT_RUN_PROFILES = ['preview', 'full'];
const IMPLEMENT_FILTER_OPS = ['=', '!=', '>', '>=', '<', '<=', 'in', 'not in', 'between'];
const IMPLEMENT_COLUMN_ROLES = ['entity_id', 'event_date', 'measure', 'label', 'segment'];
const IMPLEMENT_OUTPUT_OPTIONS = {
  dashboard: ['dashboard_name', 'dashboard_filters'],
  genie_space: ['genie_space_name', 'genie_questions'],
  app: ['app_purpose'],
  alert: ['alert_name', 'alert_tiers', 'alert_operator', 'alert_threshold', 'alert_condition_text', 'alert_recipients',
    'alert_destinations'],
};
const IMPLEMENT_ALERT_TIER_SETS = { act_now: ['Act now'], act_now_review: ['Act now', 'Review'] };
const IMPLEMENT_ALERT_OPERATORS = ['>=', '>', '=', '!=', '<', '<='];
const IMPLEMENT_ALERT_MAX_SUBSCRIBERS = 100;
const IMPLEMENT_NOTEBOOK_TASK_KEY = 'inspire_task';
const IMPLEMENT_PRINCIPAL_TYPES = ['user', 'group', 'service_principal'];
const IMPLEMENT_USE_CASE_PARAM = 'inspire_implement_use_case';
const IMPLEMENT_SPEC_VERSION_PARAM = 'inspire_implement_spec_version';
const IMPLEMENT_APP_NAME_RE = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;
const IMPLEMENT_WIDGET_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const IMPLEMENT_TABLE_NAME_RE = /^[A-Za-z0-9_`-]+\.[A-Za-z0-9_`-]+\.[A-Za-z0-9_`-]+$/;
const IMPLEMENT_USE_CASE_ID_RE = /^[a-zA-Z0-9_.-]+$/;
const IMPLEMENT_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const IMPLEMENT_DESTINATION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const DECIMAL_RE = /^\s*[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?\s*$/;
const IMPLEMENT_COLUMNS = [
  ['session_id', 'BIGINT'], ['use_case_id', 'STRING'], ['spec_version', 'INT'], ['based_on_version', 'INT'],
  ['spec_json', 'VARIANT'], ['status', 'STRING'], ['status_message', 'STRING'], ['change_classes', 'STRING'],
  ['notebook_path', 'STRING'], ['job_id', 'BIGINT'], ['last_preview_run_id', 'BIGINT'], ['result_rows', 'BIGINT'],
  ['dashboard_id', 'STRING'], ['dashboard_url', 'STRING'], ['genie_space_id', 'STRING'], ['genie_space_url', 'STRING'],
  ['app_name', 'STRING'], ['app_url', 'STRING'], ['genie_widgets', 'VARIANT'], ['data_profiles', 'VARIANT'],
  ['suggested_schedule', 'VARIANT'], ['asset_status', 'VARIANT'], ['created_by', 'STRING'], ['created_at', 'TIMESTAMP'],
  ['updated_at', 'TIMESTAMP'], ['alert_id', 'STRING'], ['alert_url', 'STRING'], ['implement_run_id', 'BIGINT'],
];
const IMPLEMENT_VARIANT_COLUMNS = IMPLEMENT_COLUMNS.filter(([, t]) => t === 'VARIANT').map(([n]) => n);
const IMPLEMENT_NOT_AVAILABLE =
  'Implement with Genie needs the Inspire Database: set it in Settings, then try again.';

function badRequest(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function str(value) {
  return value == null ? '' : String(value);
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function plainTable(name) {
  return str(name).split('.').map((part) => part.trim().replace(/^`+|`+$/g, '')).join('.');
}

function resultTableNameError(name) {
  return IMPLEMENT_TABLE_NAME_RE.test(plainTable(name)) ? '' : `result_table '${str(name)}' must be catalog.schema.table`;
}

const CRON_FIELDS = [
  ['second', 0, 59, []], ['minute', 0, 59, []], ['hour', 0, 23, []], ['day of month', 1, 31, []],
  ['month', 1, 12, ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']],
  ['day of week', 1, 7, ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']], ['year', 1970, 2099, []],
];

function cronValueProblem(part, label, low, high, names) {
  if (names.includes(part) || (/^[0-9]+$/.test(part) && Number(part) >= low && Number(part) <= high)) return '';
  return `the ${label} value '${part}' is not ${low} to ${high}` + (names.length ? ` or ${names[0]} to ${names[names.length - 1]}` : '');
}

function cronProblem(cron) {
  const fields = str(cron).toUpperCase().trim().split(/\s+/).filter(Boolean);
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

function wholeNumber(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^\s*[-+]?\d+\s*$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

function decimalNumber(value) {
  const number = typeof value === 'number' ? value : (typeof value === 'string' && DECIMAL_RE.test(value) ? Number(value) : Number.NaN);
  return Number.isFinite(number) ? number : null;
}

function listField(value, field, errors) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  errors.push(`${field} must be a list`);
  return [];
}

function objectField(value, field, errors) {
  if (value == null || value === '') return {};
  if (isPlainObject(value)) return value;
  errors.push(`${field} must be an object`);
  return {};
}

function validateImplementSpec(input) {
  const errors = [];
  let spec = input;
  if (typeof spec === 'string') {
    try {
      spec = JSON.parse(spec);
    } catch (e) {
      return { spec: {}, errors: [`the spec is not valid JSON: ${e.message}`] };
    }
  }
  if (!isPlainObject(spec)) return { spec: {}, errors: ['the spec must be a JSON object'] };
  const out = {
    use_case_id: str(spec.use_case_id).trim(),
    use_case_name: str(spec.use_case_name).trim(),
    confirm_notebook_overwrite: Boolean(spec.confirm_notebook_overwrite),
  };
  if (!out.use_case_id) errors.push('use_case_id is required');
  if (spec.based_on_version != null && spec.based_on_version !== '') {
    const based = wholeNumber(spec.based_on_version);
    if (based == null) errors.push(`based_on_version ${JSON.stringify(spec.based_on_version)} must be an integer`);
    else out.based_on_version = based;
  }

  const framing = objectField(spec.use_case, 'use_case', errors);
  const measures = listField(framing.success_measures, 'use_case.success_measures', errors)
    .map((m) => str(m).trim()).filter(Boolean);
  if (measures.length > 3) errors.push('at most 3 success measures are allowed');
  out.use_case = {
    goal: str(framing.goal).trim().slice(0, 500),
    decision_owner: str(framing.decision_owner).trim().slice(0, 200),
    success_measures: measures.slice(0, 3),
  };

  const data = objectField(spec.data, 'data', errors);
  const tables = {};
  for (const [original, chosen] of Object.entries(objectField(data.tables, 'data.tables', errors))) {
    const o = plainTable(original);
    const c = plainTable(chosen);
    if (!IMPLEMENT_TABLE_NAME_RE.test(o) || !IMPLEMENT_TABLE_NAME_RE.test(c)) {
      errors.push(`table swap '${original}' -> '${chosen}' must name two catalog.schema.table tables`);
      continue;
    }
    if (o.toLowerCase() !== c.toLowerCase()) tables[o] = c;
  }
  const filters = [];
  for (const item of listField(data.filters, 'data.filters', errors)) {
    if (!isPlainObject(item)) {
      errors.push('each data filter must be an object');
      continue;
    }
    const table = plainTable(item.table);
    const column = str(item.column).trim();
    const op = str(item.op).trim().toLowerCase();
    let values;
    if (Array.isArray(item.values)) values = item.values;
    else values = item.values == null || item.values === '' ? [] : [item.values];
    values = values.map((v) => str(v));
    const single = ['=', '!=', '>', '>=', '<', '<='];
    if (!IMPLEMENT_TABLE_NAME_RE.test(table) || !IMPLEMENT_WIDGET_NAME_RE.test(column.replace(/-/g, '_'))) {
      errors.push(`filter on '${str(item.table)}'.'${str(item.column)}' must name a catalog.schema.table table and a column`);
    } else if (!IMPLEMENT_FILTER_OPS.includes(op)) {
      errors.push(`filter operator '${str(item.op)}' is not one of ${IMPLEMENT_FILTER_OPS.join(', ')}`);
    } else if (!values.length || (op === 'between' && values.length !== 2) || (single.includes(op) && values.length !== 1)) {
      const need = op === 'between' ? 'two values' : (!['in', 'not in'].includes(op) ? 'one value' : 'at least one value');
      errors.push(`filter ${table}.${column} ${op} needs ${need}`);
    } else {
      filters.push({ table, column, op, values });
    }
  }
  const profile = str(data.run_profile || 'preview').trim().toLowerCase();
  if (!IMPLEMENT_RUN_PROFILES.includes(profile)) errors.push(`run_profile must be one of ${IMPLEMENT_RUN_PROFILES.join(', ')}`);
  const roles = {};
  for (const [role, refRaw] of Object.entries(objectField(data.column_roles, 'data.column_roles', errors))) {
    const ref = str(refRaw).trim().replace(/^`+|`+$/g, '');
    if (!IMPLEMENT_COLUMN_ROLES.includes(role)) {
      errors.push(`column role '${role}' is not one of ${IMPLEMENT_COLUMN_ROLES.join(', ')}`);
    } else if (ref && !/^[^.\s`]+\.[^.\s`]+\.[^.\s`]+\.[^.\s`]+$/.test(ref)) {
      errors.push(`column role ${role} must name catalog.schema.table.column, not '${ref}'`);
    } else if (ref) {
      roles[role] = ref;
    }
  }
  const removedTables = [];
  for (const raw of listField(data.removed_tables, 'data.removed_tables', errors)) {
    const table = plainTable(raw);
    if (!IMPLEMENT_TABLE_NAME_RE.test(table)) {
      errors.push(`removed table '${str(raw)}' must be catalog.schema.table`);
    } else if (Object.keys(tables).some((o) => o.toLowerCase() === table.toLowerCase())) {
      errors.push(`${table} cannot be swapped and removed at once`);
    } else if (!removedTables.some((r) => r.toLowerCase() === table.toLowerCase())) {
      removedTables.push(table);
    }
  }
  const gone = new Set(removedTables.map((r) => r.toLowerCase()));
  for (const [role, ref] of Object.entries(roles).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (gone.has(ref.split('.').slice(0, 3).join('.').toLowerCase())) {
      errors.push(`the ${role.replace(/_/g, ' ')} column ${ref} is in a table you removed`);
    }
  }
  for (const item of filters) {
    if (gone.has(item.table.toLowerCase())) errors.push(`the filter on ${item.table}.${item.column} reads a table you removed`);
  }
  const window = objectField(data.window, 'data.window', errors);
  const start = str(window.start).trim();
  const end = str(window.end).trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const [label, value] of [['start', start], ['end', end]]) {
    if (value && !dateRe.test(value)) errors.push(`the data window ${label} '${value}' must be a YYYY-MM-DD date`);
  }
  if (start && end && dateRe.test(start) && dateRe.test(end) && start > end) {
    errors.push(`the data window starts (${start}) after it ends (${end})`);
  }
  out.data = {
    tables, removed_tables: removedTables, filters, run_profile: profile, column_roles: roles, window: { start, end },
    notes: str(data.notes).trim().slice(0, 2000),
  };

  const config = objectField(spec.config, 'config', errors);
  const widgets = {};
  for (const [name, value] of Object.entries(objectField(config.widgets, 'config.widgets', errors))) {
    if (!IMPLEMENT_WIDGET_NAME_RE.test(name)) errors.push(`widget name '${name}' is not a valid widget name`);
    else widgets[name] = value == null ? '' : String(value);
  }
  const resultTable = plainTable(config.result_table);
  if (resultTable && resultTableNameError(config.result_table)) errors.push(resultTableNameError(config.result_table));
  const profilesIn = objectField(config.profiles, 'config.profiles', errors);
  const profiles = {};
  for (const [name, fields] of [['training', ['window_days', 'sample_entities']], ['full_load', ['window_days']],
    ['preview', ['entity_cap']], ['retrain', ['every_runs']]]) {
    const section = objectField(profilesIn[name], `config.profiles.${name}`, errors);
    const clean = {};
    for (const field of fields) {
      const value = section[field];
      if (value == null || value === '') continue;
      const number = wholeNumber(value);
      if (number == null) errors.push(`${name} ${field} ${JSON.stringify(value)} must be a whole number`);
      else if (number < 1) errors.push(`${name} ${field} must be at least 1`);
      else clean[field] = number;
    }
    if (name === 'training' && str(section.stratify_by).trim()) clean.stratify_by = str(section.stratify_by).trim();
    if (name === 'retrain' && section.drift_threshold != null && section.drift_threshold !== '') {
      const drift = decimalNumber(section.drift_threshold);
      if (drift == null || drift <= 0 || drift > 1) {
        errors.push(`retrain drift_threshold ${JSON.stringify(section.drift_threshold)} must be a number above 0 and at most 1`);
      } else clean.drift_threshold = drift;
    }
    profiles[name] = clean;
  }
  out.config = {
    widgets,
    result_table: resultTable,
    ai_endpoint: str(config.ai_endpoint).trim(),
    warehouse_id: str(config.warehouse_id).trim(),
    profiles,
  };

  const schedule = objectField(spec.schedule, 'schedule', errors);
  const cron = str(schedule.cron).trim();
  const enabled = Boolean(schedule.enabled);
  const cronIssue = cron ? cronProblem(cron) : '';
  if (cronIssue) errors.push(`schedule cron '${cron}' is not a valid Quartz cron: ${cronIssue}`);
  if (enabled && !cron) errors.push('an enabled schedule needs a cron expression');
  const emails = [];
  for (const raw of listField(schedule.failure_emails, 'schedule.failure_emails', errors)) {
    const email = str(raw).trim();
    if (!IMPLEMENT_EMAIL_RE.test(email)) errors.push(`failure email '${email}' is not an email address`);
    else if (!emails.some((e) => e.toLowerCase() === email.toLowerCase())) emails.push(email);
  }
  out.schedule = { enabled, cron, timezone: str(schedule.timezone || 'UTC').trim() || 'UTC', failure_emails: emails };

  const outputs = objectField(spec.outputs, 'outputs', errors);
  const chosen = {};
  for (const name of IMPLEMENT_OUTPUTS) chosen[name] = Boolean(outputs[name]);
  if (!Object.prototype.hasOwnProperty.call(spec, 'outputs')) chosen.dashboard = true;
  const appName = str(outputs.app_name).trim().toLowerCase();
  if (chosen.app && !IMPLEMENT_APP_NAME_RE.test(appName)) {
    errors.push(`app_name '${str(outputs.app_name)}' must be 3-30 characters: lowercase letters, digits and dashes, starting with a letter`);
  }
  if (Object.values(chosen).some(Boolean) && !out.config.warehouse_id) {
    errors.push('a SQL warehouse is required to build a dashboard, a Genie space, an App or an alert');
  }
  const alert = chosen.alert ? alertOptions(outputs) : { options: alertOptions({}).options, errors: [] };
  errors.push(...alert.errors);
  const removed = {};
  for (const [name, action] of Object.entries(objectField(spec.removed_outputs, 'removed_outputs', errors))) {
    const a = str(action).toLowerCase();
    if (IMPLEMENT_OUTPUTS.includes(name) && (a === 'keep' || a === 'delete')) removed[name] = a;
  }
  const questions = listField(outputs.genie_questions, 'outputs.genie_questions', errors)
    .map((q) => str(q).trim().slice(0, 300)).filter(Boolean);
  if (questions.length > 5) errors.push('at most 5 Genie space sample questions are allowed');
  const dashFilters = listField(outputs.dashboard_filters, 'outputs.dashboard_filters', errors)
    .map((w) => str(w).trim()).filter(Boolean);
  const badFilters = dashFilters.filter((w) => !IMPLEMENT_WIDGET_NAME_RE.test(w));
  if (badFilters.length) errors.push(`dashboard filters must be widget names: ${badFilters.join(', ')}`);
  out.outputs = {
    ...chosen,
    app_name: chosen.app ? appName : '',
    dashboard_name: chosen.dashboard ? str(outputs.dashboard_name).trim().slice(0, 200) : '',
    dashboard_filters: chosen.dashboard ? dashFilters : [],
    genie_space_name: chosen.genie_space ? str(outputs.genie_space_name).trim().slice(0, 200) : '',
    genie_questions: chosen.genie_space ? questions.slice(0, 5) : [],
    app_purpose: chosen.app ? str(outputs.app_purpose).trim().slice(0, 1500) : '',
    ...alert.options,
  };
  out.removed_outputs = removed;
  const retry = [];
  for (const raw of listField(spec.retry_outputs, 'retry_outputs', errors)) {
    const name = str(raw).trim();
    if (!IMPLEMENT_OUTPUTS.includes(name)) errors.push(`retry output '${name}' is not one of ${IMPLEMENT_OUTPUTS.join(', ')}`);
    else if (!chosen[name]) errors.push(`the ${IMPLEMENT_OUTPUT_LABELS[name]} cannot be retried: it is not selected`);
    else if (!retry.includes(name)) retry.push(name);
  }
  out.retry_outputs = retry;

  const sharing = objectField(spec.sharing, 'sharing', errors);
  const principals = [];
  const seen = new Set();
  for (const item of listField(sharing.principals, 'sharing.principals', errors)) {
    const kind = str(item && item.type).trim().toLowerCase();
    const name = str(item && item.name).trim();
    if (!IMPLEMENT_PRINCIPAL_TYPES.includes(kind) || !name || name.includes('`')) {
      errors.push(`principal ${JSON.stringify(item)} must have a type (${IMPLEMENT_PRINCIPAL_TYPES.join(', ')}) and a name without backticks`);
    } else if (!seen.has(`${kind}:${name.toLowerCase()}`)) {
      seen.add(`${kind}:${name.toLowerCase()}`);
      principals.push({ type: kind, name });
    }
  }
  out.sharing = { principals };
  return { spec: out, errors };
}

function alertOptions(outputs) {
  const errors = [];
  const on = Boolean(outputs.alert);
  let tiers = str(outputs.alert_tiers || 'act_now').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(IMPLEMENT_ALERT_TIER_SETS, tiers)) {
    errors.push(`alert_tiers '${str(outputs.alert_tiers)}' must be one of ${Object.keys(IMPLEMENT_ALERT_TIER_SETS).join(', ')}`);
    tiers = 'act_now';
  }
  let operator = str(outputs.alert_operator || '>=').trim();
  if (!IMPLEMENT_ALERT_OPERATORS.includes(operator)) {
    errors.push(`alert_operator '${str(outputs.alert_operator)}' must be one of ${IMPLEMENT_ALERT_OPERATORS.join(' ')}`);
    operator = '>=';
  }
  const raw = outputs.alert_threshold;
  let threshold = 1;
  if (raw != null && raw !== '') {
    const number = decimalNumber(raw);
    if (number != null && number >= 0) threshold = number;
    else errors.push(`alert_threshold ${JSON.stringify(raw)} must be a number of rows, 0 or more`);
  }
  const recipients = [];
  for (const rawEmail of listField(outputs.alert_recipients, 'outputs.alert_recipients', errors)) {
    const email = str(rawEmail).trim();
    if (!IMPLEMENT_EMAIL_RE.test(email)) errors.push(`alert recipient '${email}' is not an email address`);
    else if (!recipients.some((e) => e.toLowerCase() === email.toLowerCase())) recipients.push(email);
  }
  const destinations = [];
  for (const rawItem of listField(outputs.alert_destinations, 'outputs.alert_destinations', errors)) {
    const item = isPlainObject(rawItem) ? rawItem : { id: rawItem };
    const id = str(item.id).trim();
    if (!IMPLEMENT_DESTINATION_ID_RE.test(id)) {
      errors.push(`alert destination ${JSON.stringify(rawItem)} needs the id of a workspace notification destination`);
    } else if (!destinations.some((d) => d.id === id)) {
      destinations.push({ id, name: str(item.name).trim().slice(0, 200) });
    }
  }
  if (on && !recipients.length && !destinations.length) {
    errors.push('an alert needs at least one recipient email or notification destination');
  }
  if (recipients.length + destinations.length > IMPLEMENT_ALERT_MAX_SUBSCRIBERS) {
    errors.push(`an alert can notify at most ${IMPLEMENT_ALERT_MAX_SUBSCRIBERS} recipients and destinations`);
  }
  return {
    options: {
      alert_name: on ? str(outputs.alert_name).trim().slice(0, 200) : '',
      alert_tiers: tiers,
      alert_operator: operator,
      alert_threshold: threshold,
      alert_condition_text: on ? str(outputs.alert_condition_text).trim().slice(0, 500) : '',
      alert_recipients: recipients,
      alert_destinations: destinations,
    },
    errors,
  };
}

function sortedJson(value) {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${sortedJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function section(spec, key) {
  const value = (spec || {})[key];
  return sortedJson(value == null ? {} : value);
}

function optionChanges(before, after) {
  return IMPLEMENT_OUTPUTS.filter((name) => before[name] && after[name]
    && IMPLEMENT_OUTPUT_OPTIONS[name].some((o) => sortedJson(before[o]) !== sortedJson(after[o])));
}

function classifyImplementChange(previous, current) {
  if (!previous) return ['initial'];
  const classes = new Set();
  if (section(previous, 'data') !== section(current, 'data')) classes.add('data');
  if (section(previous, 'config') !== section(current, 'config') || section(previous, 'use_case') !== section(current, 'use_case')) {
    classes.add('config');
  }
  if (section(previous, 'schedule') !== section(current, 'schedule')) classes.add('schedule');
  const before = previous.outputs || {};
  const after = current.outputs || {};
  if (IMPLEMENT_OUTPUTS.some((n) => after[n] && !before[n])
    || (after.app && before.app && after.app_name !== before.app_name)
    || optionChanges(before, after).length) {
    classes.add('outputs');
  }
  if (IMPLEMENT_OUTPUTS.some((n) => before[n] && !after[n])) classes.add('deselect');
  if (section(previous, 'sharing') !== section(current, 'sharing')) classes.add('sharing');
  if ((current.retry_outputs || []).length) classes.add('retry');
  return IMPLEMENT_CHANGE_CLASSES.filter((c) => classes.has(c));
}

function implementChangeSummary(previous, current, assets = {}) {
  const classes = classifyImplementChange(previous, current);
  const refill = classes.some((c) => ['initial', 'data', 'config'].includes(c));
  const before = (previous && previous.outputs) || {};
  const after = current.outputs || {};
  const changedOptions = previous ? optionChanges(before, after) : [];
  const retry = current.retry_outputs || [];
  const build = [];
  const refresh = [];
  for (const name of IMPLEMENT_OUTPUTS) {
    if (!after[name]) continue;
    const renamed = name === 'app' && before.app && before.app_name !== after.app_name;
    if (!assets[name] || !before[name] || renamed) build.push(name);
    else if (refill || changedOptions.includes(name) || retry.includes(name)) refresh.push(name);
  }
  const deselected = IMPLEMENT_OUTPUTS.filter((n) => before[n] && !after[n]);
  const removed = current.removed_outputs || {};
  const undecided = deselected.filter((n) => assets[n] && !removed[n]);
  return {
    classes,
    refill,
    build,
    refresh,
    delete: deselected.filter((n) => removed[n] === 'delete' && assets[n]),
    keep_unmanaged: deselected.filter((n) => removed[n] !== 'delete' && assets[n]),
    undecided,
    schedule: classes.includes('initial') || classes.includes('schedule') || refill,
    nothing_to_do: previous != null && classes.length === 0,
  };
}

function implementTableName(catalog, schema) {
  return `\`${catalog}\`.\`${schema}\`.\`${IMPLEMENT_TABLE}\``;
}

function implementTableCreateSql(table) {
  const columns = IMPLEMENT_COLUMNS.map(([name, kind]) => `\`${name}\` ${kind}`).join(', ');
  return `CREATE TABLE IF NOT EXISTS ${table} (${columns}) USING DELTA CLUSTER BY (\`session_id\`, \`use_case_id\`) `
    + "COMMENT 'Implement with Genie: one row per wizard spec version. The Inspire App inserts the spec and the id of the run "
    + "that builds it; the Inspire agent writes every other column.'";
}

function implementSelectColumns(existing = null) {
  return IMPLEMENT_COLUMNS.map(([name, kind]) => {
    if (existing && !existing.has(name.toLowerCase())) return `NULL AS \`${name}\``;
    return kind === 'VARIANT' ? `to_json(\`${name}\`) AS \`${name}\`` : `\`${name}\``;
  }).join(', ');
}

function implementHistoryStatement(table, sessionId, useCaseId, existing = null) {
  const where = useCaseId ? 'session_id = :sid AND use_case_id = :uc' : 'session_id = :sid';
  const parameters = [{ name: 'sid', value: String(sessionId), type: 'BIGINT' }];
  if (useCaseId) parameters.push({ name: 'uc', value: String(useCaseId), type: 'STRING' });
  return {
    sql: `SELECT ${implementSelectColumns(existing)} FROM ${table} WHERE ${where} ORDER BY use_case_id, spec_version DESC LIMIT 2000`,
    parameters,
  };
}

function describedColumnNames(rows) {
  const names = new Set();
  for (const row of rows || []) {
    const name = str(row && row.col_name).trim();
    if (!name || name.startsWith('#')) break;
    names.add(name.toLowerCase());
  }
  return names;
}

function implementMissingColumns(existing) {
  return IMPLEMENT_COLUMNS.filter(([name]) => !existing.has(name.toLowerCase()));
}

function isMissingColumnError(err) {
  return /UNRESOLVED_COLUMN|42703|FIELD_NOT_FOUND|cannot be resolved|cannot resolve/i.test(str(err && err.message ? err.message : err));
}

function implementInsertStatement(table, { sessionId, useCaseId, specVersion, basedOnVersion, spec, createdBy, statusMessage, changeClasses }) {
  const classes = Array.isArray(changeClasses) ? changeClasses.join(',') : str(changeClasses);
  return {
    sql:
      `INSERT INTO ${table} (session_id, use_case_id, spec_version, based_on_version, spec_json, status, status_message, `
      + 'change_classes, created_by, created_at, updated_at) VALUES (:sid, :uc, :v, :based, parse_json(:spec), \'queued\', :message, '
      + ':classes, :by, current_timestamp(), current_timestamp())',
    parameters: [
      { name: 'sid', value: String(sessionId), type: 'BIGINT' },
      { name: 'uc', value: String(useCaseId), type: 'STRING' },
      { name: 'v', value: String(specVersion), type: 'INT' },
      basedOnVersion == null ? { name: 'based', type: 'INT' } : { name: 'based', value: String(basedOnVersion), type: 'INT' },
      { name: 'spec', value: JSON.stringify(spec), type: 'STRING' },
      { name: 'message', value: str(statusMessage).slice(0, 2000), type: 'STRING' },
      { name: 'classes', value: classes.slice(0, 500), type: 'STRING' },
      { name: 'by', value: str(createdBy).slice(0, 320), type: 'STRING' },
    ],
  };
}

function implementVersionParameters({ sessionId, useCaseId, specVersion }) {
  return [
    { name: 'sid', value: String(sessionId), type: 'BIGINT' },
    { name: 'uc', value: String(useCaseId), type: 'STRING' },
    { name: 'v', value: String(specVersion), type: 'INT' },
  ];
}

function implementRunStartedStatement(table, { sessionId, useCaseId, specVersion, runId, message }) {
  const run = /^\d{1,19}$/.test(str(runId)) ? { name: 'run', value: str(runId), type: 'BIGINT' } : { name: 'run', type: 'BIGINT' };
  return {
    sql: `UPDATE ${table} SET implement_run_id = :run, `
      + "status_message = CASE WHEN status = 'queued' THEN :message ELSE status_message END "
      + 'WHERE session_id = :sid AND use_case_id = :uc AND spec_version = :v',
    parameters: [
      run,
      { name: 'message', value: str(message).slice(0, 2000), type: 'STRING' },
      ...implementVersionParameters({ sessionId, useCaseId, specVersion }),
    ],
  };
}

function implementStartFailedStatement(table, { sessionId, useCaseId, specVersion, message }) {
  return {
    sql: `UPDATE ${table} SET status = 'failed', status_message = :message, updated_at = current_timestamp() `
      + "WHERE session_id = :sid AND use_case_id = :uc AND spec_version = :v AND status = 'queued'",
    parameters: [
      { name: 'message', value: str(message).slice(0, 2000), type: 'STRING' },
      ...implementVersionParameters({ sessionId, useCaseId, specVersion }),
    ],
  };
}

function implementStalled(row, run, now = Date.now()) {
  if (!row || !IMPLEMENT_ACTIVE_STATUSES.includes(row.status)) return null;
  const version = `v${row.spec_version}`;
  const doing = String(row.status).replace(/_/g, ' ');
  const runId = /^\d{1,19}$/.test(str(row.implement_run_id)) ? str(row.implement_run_id) : null;
  if (run) {
    const state = isPlainObject(run.state) ? run.state : {};
    const status = isPlainObject(run.status) ? run.status : {};
    const lifeCycle = str(state.life_cycle_state || status.state).toUpperCase();
    if (!IMPLEMENT_RUN_ENDED_STATES.includes(lifeCycle)) return null;
    const details = isPlainObject(status.termination_details) ? status.termination_details : {};
    const how = [str(state.result_state || details.code || lifeCycle), str(state.state_message || details.message).trim()]
      .filter(Boolean).join(': ');
    return {
      run_id: runId,
      run_url: str(run.run_page_url) || null,
      reason: `the run building ${version} ended (${how}) while ${version} was still ${doing}`,
    };
  }
  const last = Date.parse(str(row.updated_at || row.created_at));
  if (!Number.isFinite(last) || now - last <= IMPLEMENT_STALE_AFTER_MS) return null;
  return {
    run_id: runId,
    run_url: null,
    reason: `${version} has been ${doing} with no progress since ${new Date(last).toISOString()}, longer than an Implement run `
      + `may take (${IMPLEMENT_STALE_AFTER_MS / 3600000} hours)`,
  };
}

function parseImplementRow(row) {
  const out = { ...row };
  for (const name of IMPLEMENT_VARIANT_COLUMNS) {
    if (typeof out[name] === 'string' && out[name]) {
      try {
        out[name] = JSON.parse(out[name]);
      } catch {
        out[name] = null;
      }
    } else if (out[name] === '' || out[name] === undefined) {
      out[name] = null;
    }
  }
  for (const name of ['spec_version', 'based_on_version']) {
    out[name] = out[name] == null || out[name] === '' ? null : Number.parseInt(out[name], 10);
  }
  return out;
}

function carriedAssets(history) {
  const carried = {};
  const stopped = new Set();
  for (const row of [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0))) {
    const status = isPlainObject(row.asset_status) ? row.asset_status : {};
    for (const [name, entry] of Object.entries(status)) if (entry && IMPLEMENT_STOPPED_STATES.includes(entry.state)) stopped.add(name);
    for (const [output, column] of Object.entries(IMPLEMENT_OUTPUT_ID_COLUMNS)) {
      if (carried[output] || stopped.has(output) || row[column] == null || row[column] === '') continue;
      carried[output] = row[column];
    }
  }
  return carried;
}

function planSubmission(history, spec, stalled = null) {
  const rows = [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0));
  const latest = rows[0] || null;
  if (latest && IMPLEMENT_ACTIVE_STATUSES.includes(latest.status) && !stalled) {
    throw badRequest(`spec v${latest.spec_version} is still ${latest.status}; your edit applies after the current run`, 409);
  }
  const built = rows.find((r) => IMPLEMENT_DONE_STATUSES.includes(r.status)) || null;
  if (built && spec.based_on_version != null && built.spec_version > spec.based_on_version) {
    throw badRequest(`v${built.spec_version} was built after the version you edited (v${spec.based_on_version}); `
      + 'reopen Edit to see it and submit again', 409);
  }
  const previous = built ? validateImplementSpec(built.spec_json).spec : null;
  const summary = implementChangeSummary(previous, spec, carriedAssets(rows));
  if (summary.undecided.length) {
    throw badRequest(`choose whether to delete or keep ${summary.undecided.map((n) => IMPLEMENT_OUTPUT_LABELS[n]).join(' and ')}, `
      + 'which you unticked; Inspire never deletes an output without asking');
  }
  if (summary.nothing_to_do && latest && IMPLEMENT_DONE_STATUSES.includes(latest.status)) {
    throw badRequest('nothing changed since the last built version');
  }
  return { nextVersion: latest ? latest.spec_version + 1 : 1, latest, built, summary };
}

function implementJobParams(baseParams, useCaseId, specVersion) {
  return {
    ...baseParams,
    '15_operation': IMPLEMENT_OPERATION,
    [IMPLEMENT_USE_CASE_PARAM]: String(useCaseId),
    [IMPLEMENT_SPEC_VERSION_PARAM]: String(specVersion),
  };
}

const PARAMETERS_SECTION_RE = /^## (?:\d+\. )?Parameters[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m;
const WIDGET_ROW_RE = /^\|\s*`?([A-Za-z][A-Za-z0-9_]{0,40})`?\s*\|\s*(text|dropdown)\s*\|\s*(.*?)\s*\|(?:\s*(.*?)\s*\|)?\s*(.*?)\s*\|\s*$/;
const ALLOWED_RE = /^(?:(whole number)(?:, |$))?(?:(-?[0-9]+(?:\.[0-9]+)?) to (-?[0-9]+(?:\.[0-9]+)?)|at least (-?[0-9]+(?:\.[0-9]+)?)|at most (-?[0-9]+(?:\.[0-9]+)?))?$/;
const WIDGET_NUMBER_RE = /^-?[0-9]+(?:\.[0-9]+)?$/;

function allowedRule(text) {
  const value = str(text).trim();
  const match = ALLOWED_RE.exec(value.toLowerCase() === 'any' ? '' : value);
  if (!match) return null;
  const low = match[2] !== undefined ? match[2] : match[4];
  const high = match[3] !== undefined ? match[3] : match[5];
  return { low: low !== undefined ? Number(low) : null, high: high !== undefined ? Number(high) : null, whole: Boolean(match[1]) };
}

function numberText(value) {
  return Number(value).toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
}

function allowedText(rule) {
  const { low = null, high = null, whole = false } = rule || {};
  let bounds = '';
  if (low !== null && high !== null) bounds = `${numberText(low)} to ${numberText(high)}`;
  else if (low !== null) bounds = `at least ${numberText(low)}`;
  else if (high !== null) bounds = `at most ${numberText(high)}`;
  if (!whole) return bounds;
  return bounds ? `whole number, ${bounds}` : 'whole number';
}

function widgetValueProblem(name, value, allowed) {
  const rule = allowedRule(allowed);
  if (!rule || (rule.low === null && rule.high === null && !rule.whole)) return '';
  const text = str(value).trim();
  const number = WIDGET_NUMBER_RE.test(text) && !(rule.whole && text.includes('.')) ? Number(text) : null;
  if (number === null || (rule.low !== null && number < rule.low) || (rule.high !== null && number > rule.high)) {
    return `${name} is '${text}'; allowed: ${allowedText(rule)}`;
  }
  return '';
}

function widgetSetProblems(values) {
  const number = (name) => {
    const text = str(values[name]).trim();
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

function widgetProblems(widgets, values) {
  const known = (widgets || []).filter((w) => w && typeof w === 'object');
  const allowed = Object.fromEntries(known.map((w) => [str(w.name), w.allowed]));
  const problems = Object.keys(values || {}).sort()
    .map((name) => widgetValueProblem(name, values[name], allowed[name] ?? ''))
    .filter(Boolean);
  const merged = Object.fromEntries(known.map((w) => [str(w.name), w.default]));
  Object.assign(merged, values || {});
  return problems.concat(widgetSetProblems(merged));
}

function widgetsFromInstruction(instruction) {
  const match = PARAMETERS_SECTION_RE.exec(str(instruction));
  const widgets = [];
  for (const line of (match ? match[1] : '').split('\n')) {
    const row = WIDGET_ROW_RE.exec(line.trim());
    if (!row || row[1].toLowerCase() === 'widget' || widgets.some((w) => w.name === row[1])) continue;
    const rule = row[2] === 'dropdown' ? null : allowedRule(row[4]);
    widgets.push({ name: row[1], type: row[2], default: row[3].replace(/^`|`$/g, ''), allowed: rule ? allowedText(rule) : '', label: row[5], choices: [] });
  }
  return widgets;
}

function implementWidgets(history, instruction) {
  const rows = [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0));
  const built = rows.find((r) => r && Array.isArray(r.genie_widgets) && r.genie_widgets.length);
  const fromGenie = built ? built.genie_widgets : null;
  const parsed = widgetsFromInstruction(instruction);
  if (fromGenie) {
    const ranges = Object.fromEntries(parsed.map((w) => [w.name, w.allowed]));
    return {
      source: 'genie',
      widgets: fromGenie.filter((w) => w && IMPLEMENT_WIDGET_NAME_RE.test(str(w.name)))
        .map((w) => (w.allowed == null && ranges[w.name] ? { ...w, allowed: ranges[w.name] } : w)),
    };
  }
  return { source: 'instruction', widgets: parsed };
}

function tableParts(name) {
  const parts = plainTable(name).split('.');
  if (parts.length !== 3 || parts.some((p) => !p || p.includes('`'))) throw badRequest(`'${str(name)}' must be catalog.schema.table`);
  return { catalog: parts[0], schema: parts[1], table: parts[2] };
}

function columnsStatement(name) {
  const t = tableParts(name);
  return {
    sql: `SELECT column_name, data_type, ordinal_position FROM \`${t.catalog}\`.information_schema.columns `
      + 'WHERE table_schema = :s AND table_name = :t ORDER BY ordinal_position',
    parameters: [{ name: 's', value: t.schema, type: 'STRING' }, { name: 't', value: t.table, type: 'STRING' }],
  };
}

function tableSwapStatement(name, requiredColumns = []) {
  const t = tableParts(name);
  const required = requiredColumns.map((c) => str(c).trim().toLowerCase()).filter(Boolean);
  if (required.some((c) => !/^[a-z0-9_]{1,128}$/.test(c))) throw badRequest('required columns must be plain column names');
  const requiredParams = required.map((c, i) => ({ name: `r${i}`, value: c, type: 'STRING' }));
  const requiredClause = required.length
    ? ` AND SUM(CASE WHEN o.c IN (${required.map((_, i) => `:r${i}`).join(', ')}) THEN 1 ELSE 0 END) = ${required.length}`
    : '';
  const cols = `\`${t.catalog}\`.information_schema.columns`;
  return {
    sql: `WITH o AS (SELECT lower(column_name) AS c, upper(data_type) AS ty FROM ${cols} WHERE table_schema = :s AND table_name = :t), `
      + `n AS (SELECT COUNT(*) AS total FROM o), `
      + `k AS (SELECT table_schema, table_name, lower(column_name) AS c, upper(data_type) AS ty FROM ${cols} `
      + "WHERE table_schema <> 'information_schema' AND NOT (table_schema = :s AND table_name = :t)) "
      + `SELECT k.table_schema, k.table_name, COUNT(*) AS matched, MAX(n.total) AS total FROM k JOIN o ON k.c = o.c AND k.ty = o.ty `
      + `CROSS JOIN n GROUP BY k.table_schema, k.table_name HAVING COUNT(*) >= GREATEST(2, CEIL(MAX(n.total) * 0.5))${requiredClause} `
      + 'ORDER BY matched DESC, k.table_schema, k.table_name LIMIT 20',
    parameters: [{ name: 's', value: t.schema, type: 'STRING' }, { name: 't', value: t.table, type: 'STRING' }, ...requiredParams],
    catalog: t.catalog,
  };
}

function columnValuesStatement(name, column, limit = 200) {
  const table = quoteTable(name);
  const col = quoteColumn(column);
  const cap = Math.max(1, Math.min(500, Number.parseInt(limit, 10) || 200));
  return {
    sql: `SELECT DISTINCT CAST(${col} AS STRING) AS value FROM ${table} WHERE ${col} IS NOT NULL ORDER BY value LIMIT ${cap}`,
    parameters: null,
  };
}

function filterClause(filter, index) {
  const col = quoteColumn(filter.column);
  const op = str(filter.op).toLowerCase();
  const values = (Array.isArray(filter.values) ? filter.values : []).map((v) => str(v));
  const params = values.map((v, i) => ({ name: `f${index}_${i}`, value: v, type: 'STRING' }));
  const refs = params.map((p) => `:${p.name}`);
  if (!IMPLEMENT_FILTER_OPS.includes(op)) throw badRequest(`filter operator '${op}' is not supported`);
  if (op === 'in' || op === 'not in') {
    if (!refs.length) throw badRequest(`filter ${filter.column} ${op} needs at least one value`);
    return { sql: `CAST(${col} AS STRING) ${op.toUpperCase()} (${refs.join(', ')})`, params };
  }
  if (op === 'between') {
    if (refs.length !== 2) throw badRequest(`filter ${filter.column} between needs two values`);
    return { sql: `CAST(${col} AS STRING) BETWEEN ${refs[0]} AND ${refs[1]}`, params };
  }
  if (refs.length !== 1) throw badRequest(`filter ${filter.column} ${op} needs one value`);
  return { sql: `CAST(${col} AS STRING) ${op} ${refs[0]}`, params };
}

function readinessStatement(name, { columns = [], filters = [], window = {} } = {}) {
  const table = quoteTable(name);
  const wanted = [...new Set(columns.map((c) => str(c).trim()).filter(Boolean))].slice(0, 20);
  const where = [];
  const parameters = [];
  filters.forEach((f, i) => {
    const clause = filterClause(f, i);
    where.push(clause.sql);
    parameters.push(...clause.params);
  });
  if (window && window.column && (window.start || window.end)) {
    const col = quoteColumn(window.column);
    if (window.start) {
      where.push(`${col} >= CAST(:wstart AS DATE)`);
      parameters.push({ name: 'wstart', value: str(window.start), type: 'STRING' });
    }
    if (window.end) {
      where.push(`${col} <= CAST(:wend AS DATE)`);
      parameters.push({ name: 'wend', value: str(window.end), type: 'STRING' });
    }
  }
  const nulls = wanted.map((c, i) => `SUM(CASE WHEN ${quoteColumn(c)} IS NULL THEN 1 ELSE 0 END) AS null_${i}`);
  return {
    sql: `SELECT COUNT(*) AS row_count${nulls.length ? `, ${nulls.join(', ')}` : ''} FROM ${table}`
      + `${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`,
    parameters: parameters.length ? parameters : null,
    columns: wanted,
  };
}

function readinessFromRow(row, columns) {
  const rows = Number(row && row.row_count) || 0;
  return {
    row_count: rows,
    null_share: Object.fromEntries(columns.map((c, i) => [c, rows ? (Number(row[`null_${i}`]) || 0) / rows : null])),
  };
}

function resultsStatement(name, { tier, segment, limit = 500 } = {}) {
  const table = quoteTable(name);
  const latestRun = 'as_of_date = (SELECT MAX(as_of_date) FROM ' + table + ')';
  const where = [latestRun];
  const parameters = [];
  if (tier) {
    where.push('priority_tier = :tier');
    parameters.push({ name: 'tier', value: str(tier), type: 'STRING' });
  }
  if (segment) {
    where.push('segment_or_item = :segment');
    parameters.push({ name: 'segment', value: str(segment), type: 'STRING' });
  }
  const cap = Math.max(1, Math.min(2000, Number.parseInt(limit, 10) || 500));
  return {
    sql: `SELECT * FROM ${table} WHERE ${where.join(' AND ')} ORDER BY rank LIMIT ${cap}`,
    parameters: parameters.length ? parameters : null,
    summarySql: `SELECT as_of_date, priority_tier, COUNT(*) AS rows FROM ${table} GROUP BY as_of_date, priority_tier `
      + 'ORDER BY as_of_date DESC, priority_tier LIMIT 300',
    segmentsSql: `SELECT segment_or_item, COUNT(*) AS rows FROM ${table} WHERE ${latestRun} AND segment_or_item IS NOT NULL `
      + 'GROUP BY segment_or_item ORDER BY rows DESC, segment_or_item LIMIT 100',
  };
}

function destinationsFromList(data) {
  return (Array.isArray(data && data.results) ? data.results : [])
    .filter((d) => d && IMPLEMENT_DESTINATION_ID_RE.test(str(d.id)))
    .map((d) => ({ id: str(d.id), name: str(d.display_name || d.id), type: str(d.destination_type).toLowerCase() }));
}

const IMPLEMENT_SPEC_WIDGETS = ['result_table', 'run_profile'];

function rerunWidgets(history) {
  return implementWidgets(history, '').widgets.filter((w) => !IMPLEMENT_SPEC_WIDGETS.includes(str(w.name).toLowerCase()));
}

function rerunOverrides(raw) {
  const out = {};
  for (const [name, value] of Object.entries(isPlainObject(raw) ? raw : {})) {
    if (str(value).trim() !== '') out[name] = str(value).trim();
  }
  return out;
}

function rerunParams(widgetNames, overrides) {
  const allowed = new Set((widgetNames || []).filter((n) => IMPLEMENT_WIDGET_NAME_RE.test(str(n))));
  const params = {};
  for (const [name, value] of Object.entries(isPlainObject(overrides) ? overrides : {})) {
    if (name === 'run_profile') continue;
    if (name.toLowerCase() === 'result_table') {
      throw badRequest('the result table is part of the spec; change it with Edit, which checks the table before any run writes to it');
    }
    if (!allowed.has(name)) throw badRequest(`'${name}' is not a widget of this notebook`);
    params[name] = str(value);
  }
  params.run_profile = 'preview';
  return params;
}

function sourceTables(spec, involved) {
  const data = (spec && spec.data) || {};
  const swaps = Object.fromEntries(Object.entries(isPlainObject(data.tables) ? data.tables : {})
    .map(([original, chosen]) => [plainTable(original).toLowerCase(), plainTable(chosen)]));
  const gone = new Set((Array.isArray(data.removed_tables) ? data.removed_tables : []).map((t) => plainTable(t).toLowerCase()));
  const out = [];
  for (const table of involved || []) {
    const key = plainTable(table).toLowerCase();
    if (gone.has(key)) continue;
    const chosen = swaps[key] || plainTable(table);
    if (!out.some((t) => t.toLowerCase() === chosen.toLowerCase())) out.push(chosen);
  }
  return out;
}

function tableProbeStatement(name) {
  return { sql: `SELECT * FROM ${quoteTable(name)} LIMIT 0`, parameters: null };
}

const IMPLEMENT_TABLE_GONE_RE = /\b(TABLE_OR_VIEW_NOT_FOUND|SCHEMA_NOT_FOUND|CATALOG_NOT_FOUND|NO_SUCH_CATALOG_EXCEPTION)\b|cannot be found|was not found/i;
const IMPLEMENT_TABLE_DENIED_RE = /\b(INSUFFICIENT_PERMISSIONS|PERMISSION_DENIED)\b|does not have \w+( \w+)? (privilege )?on/i;

function tableAccessReason(table, message) {
  const text = str(message);
  const catalog = plainTable(table).split('.')[0].toLowerCase();
  if (!catalog || !text.replace(/[`'"]/g, '').toLowerCase().includes(catalog)) return '';
  if (IMPLEMENT_TABLE_GONE_RE.test(text)) return 'not found';
  if (IMPLEMENT_TABLE_DENIED_RE.test(text)) return 'no read access';
  return '';
}

function missingTablesMessage(missing) {
  return 'the preview cannot run because these source tables are missing or not readable: '
    + missing.map((m) => `${m.table} (${m.reason})`).join(', ')
    + '. Open Edit, Data step, to swap each for a table with the same role or remove it';
}

function appStatusFrom(got, { useCaseId, sessionId } = {}) {
  if (!got) return null;
  const d = (got.data && typeof got.data === 'object') ? got.data : {};
  if (!got.ok) {
    return { ok: false, error: got.status === 404 ? 'the App no longer exists' : str(d.message || d.error || `HTTP ${got.status}`) };
  }
  if (!str(d.description).startsWith(appOwnerTag(useCaseId, sessionId))) {
    return { ok: false, error: `the App named ${str(d.name)} is no longer this use case's App` };
  }
  const deployment = d.active_deployment || d.pending_deployment || {};
  return {
    ok: true,
    name: str(d.name),
    url: str(d.url),
    app_state: str(d.app_status && d.app_status.state),
    app_message: str(d.app_status && d.app_status.message),
    compute_state: str(d.compute_status && d.compute_status.state),
    deployment_state: str(deployment.status && deployment.status.state),
    deployment_message: str(deployment.status && deployment.status.message),
    deployed_at: str(deployment.update_time || deployment.create_time),
  };
}

function jobRunsFrom(got, job = null) {
  if (!got) return null;
  const d = (got.data && typeof got.data === 'object') ? got.data : {};
  if (!got.ok) return { ok: false, error: str(d.message || d.error || `HTTP ${got.status}`), runs: [] };
  if (job && !job.ok) {
    const j = (job.data && typeof job.data === 'object') ? job.data : {};
    return { ok: false, error: `Inspire cannot see this job, so it cannot list its runs: ${str(j.message || j.error || `HTTP ${job.status}`)}`, runs: [] };
  }
  return {
    ok: true,
    runs: (Array.isArray(d.runs) ? d.runs : []).map((r) => {
      const params = (r.overriding_parameters && r.overriding_parameters.notebook_params) || {};
      const state = r.state || {};
      return {
        run_id: r.run_id,
        started: Number(r.start_time) ? new Date(Number(r.start_time)).toISOString() : '',
        duration_s: Math.round((Number(r.run_duration) || Number(r.execution_duration) || 0) / 1000),
        state: str(state.result_state || state.life_cycle_state || (r.status && r.status.state)),
        message: str(state.state_message),
        trigger: str(r.trigger),
        profile: str(params.run_profile),
        url: str(r.run_page_url),
      };
    }),
  };
}

function liveLogPath(inspireDatabase, businessName, sessionId) {
  const parts = str(inspireDatabase).split('.');
  if (parts.length !== 2 || parts.some((p) => !p)) return null;
  const biz = str(businessName).replace(/[^A-Za-z0-9._-]+/g, '_');
  return `/Volumes/${parts[0]}/${parts[1]}/vol_root/logs/${biz}/session_${sessionId}/log.log`;
}

function useCaseLogLines(text, useCaseId) {
  const id = str(useCaseId);
  if (!id) return [];
  return str(text).split('\n').filter((line) => line.includes(`[GENIE ${id}]`) || line.includes(`[IMPLEMENT ${id}]`)
    || (line.includes(id) && /\[IMPLEMENT-[A-Z -]+\]/.test(line)));
}

function filterImplementSteps(rows, useCaseId) {
  const id = str(useCaseId);
  return (rows || []).filter((row) => {
    if (str(row.stage_name) !== IMPLEMENT_OPERATION) return false;
    if (!id) return true;
    let payload = row.result_json;
    if (typeof payload === 'string' && payload) {
      try { payload = JSON.parse(payload); } catch { payload = {}; }
    }
    const fromJson = payload && typeof payload === 'object' ? str(payload.use_case_id) : '';
    return fromJson === id || str(row.step_name).includes(id) || str(row.sub_step_name).includes(id);
  });
}

const IMPLEMENT_INSPIRE_WIDGETS = ['result_table', 'as_of_date', 'run_profile'];
const IMPLEMENT_MAX_EXTRA_WIDGETS = 6;

function groupWidgets(widgets) {
  const business = [];
  const model = [];
  const ai = [];
  const extras = [];
  for (const widget of widgets || []) {
    const name = str(widget && widget.name).toLowerCase();
    if (IMPLEMENT_INSPIRE_WIDGETS.includes(name)) continue;
    if (/^(act_now_share|review_share|explanation_top_k|alert_quantile|fdr_alpha|spot_check_rows|(min|max)_.+|.+_threshold)$/.test(name)) business.push(widget);
    else if (/^(model_name|horizon|season_length)$/.test(name)) model.push(widget);
    else if (name === 'ai_endpoint') ai.push(widget);
    else extras.push(widget);
  }
  return {
    business,
    model,
    ai,
    extras: extras.slice(0, IMPLEMENT_MAX_EXTRA_WIDGETS),
    extras_kept_default: extras.slice(IMPLEMENT_MAX_EXTRA_WIDGETS).map((w) => str(w.name)),
  };
}

const IMPLEMENT_RESULT_KEY_COLUMNS = ['use_case_id', 'run_id', 'as_of_date'];

function outputAccessStatement(name) {
  if (resultTableNameError(name)) throw badRequest(resultTableNameError(name));
  const t = tableParts(name);
  const c = 'lower(catalog_name) = lower(:c)';
  const s = 'lower(schema_name) = lower(:s)';
  const tbl = 'lower(table_catalog) = lower(:c) AND lower(table_schema) = lower(:s) AND lower(table_name) = lower(:t)';
  const isc = 'system.information_schema';
  return {
    sql: 'SELECT level, privilege, principal, '
      + '(lower(principal) = lower(current_user()) OR is_account_group_member(principal)) AS mine, current_user() AS me FROM ('
      + `SELECT 'catalog' AS level, 'OWNER' AS privilege, catalog_owner AS principal FROM ${isc}.catalogs WHERE ${c} `
      + `UNION ALL SELECT 'schema', 'OWNER', schema_owner FROM ${isc}.schemata WHERE ${c} AND ${s} `
      + `UNION ALL SELECT 'table', 'OWNER', table_owner FROM ${isc}.tables WHERE ${tbl} `
      + `UNION ALL SELECT 'catalog', privilege_type, grantee FROM ${isc}.catalog_privileges WHERE ${c} `
      + `UNION ALL SELECT 'schema', privilege_type, grantee FROM ${isc}.schema_privileges WHERE ${c} AND ${s} `
      + `UNION ALL SELECT 'table', privilege_type, grantee FROM ${isc}.table_privileges WHERE ${tbl}`
      + ') WHERE principal IS NOT NULL',
    parameters: [
      { name: 'c', value: t.catalog, type: 'STRING' },
      { name: 's', value: t.schema, type: 'STRING' },
      { name: 't', value: t.table, type: 'STRING' },
    ],
  };
}

function privilegeOf(value) {
  return str(value).trim().toUpperCase().replace(/_/g, ' ');
}

function joinAnd(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function outputAccess(rows, name) {
  const t = tableParts(name);
  const table = `${t.catalog}.${t.schema}.${t.table}`;
  const list = Array.isArray(rows) ? rows : [];
  const owner = (level) => list.some((r) => r.level === level && privilegeOf(r.privilege) === 'OWNER');
  const mine = list.filter((r) => r.mine === true || str(r.mine).toLowerCase() === 'true');
  const holds = (levels, privilege) => mine.some((r) => levels.includes(r.level)
    && ['OWNER', 'ALL PRIVILEGES', privilege].includes(privilegeOf(r.privilege)));
  const exists = owner('table');
  const identity = str((list[0] || {}).me);
  const verb = exists ? 'write to' : 'create';
  let write;
  if (!owner('catalog')) write = { ok: false, detail: `catalog ${t.catalog} does not exist or you have no access to it` };
  else if (!owner('schema')) write = { ok: false, detail: `schema ${t.catalog}.${t.schema} does not exist or you have no access to it; create it or pick another schema` };
  else {
    const needs = [];
    if (!holds(['catalog'], 'USE CATALOG')) needs.push(`USE CATALOG on ${t.catalog}`);
    if (!holds(['catalog', 'schema'], 'USE SCHEMA')) needs.push(`USE SCHEMA on ${t.catalog}.${t.schema}`);
    if (exists) {
      if (!holds(['catalog', 'schema', 'table'], 'MODIFY')) needs.push(`MODIFY on ${table}`);
      if (!holds(['catalog', 'schema', 'table'], 'SELECT')) needs.push(`SELECT on ${table}`);
    } else if (!holds(['catalog', 'schema'], 'CREATE TABLE')) needs.push(`CREATE TABLE on ${t.catalog}.${t.schema}`);
    write = needs.length
      ? { ok: false, detail: `you need ${joinAnd(needs)} to ${verb} ${table}` }
      : { ok: true, detail: `you can ${verb} ${table}` };
  }
  const grantable = exists
    ? mine.some((r) => ['catalog', 'schema', 'table'].includes(r.level) && ['OWNER', 'MANAGE'].includes(privilegeOf(r.privilege)))
    : write.ok;
  const grant = grantable
    ? { ok: true, detail: exists ? `you can share ${table}` : `you will own ${table}, so you can share it` }
    : { ok: false, detail: `you cannot share ${table}: you need to own it, its schema or its catalog, or hold MANAGE on one of them` };
  const readable = accessPlan(name, list);
  const app = readable.gaps.length
    ? { ok: false, detail: appAccessMessage(table, readable.gaps, readable.me) }
    : { ok: true, detail: `Inspire can give a new App read access to ${table}` };
  return { table, exists, identity, write, grant, app };
}

const IMPLEMENT_ALL_USERS = 'account users';
const IMPLEMENT_READ_NEEDS = [
  ['USE CATALOG', 'catalog', ['catalog']],
  ['USE SCHEMA', 'schema', ['catalog', 'schema']],
  ['SELECT', 'table', ['catalog', 'schema', 'table']],
];
const IMPLEMENT_TRAVERSE_PRIVILEGES = IMPLEMENT_READ_NEEDS.filter(([, level]) => level !== 'table').map(([privilege]) => privilege);

function grantSql(need, who) {
  return `GRANT ${need.privilege} ON ${need.level.toUpperCase()} ${need.object} TO \`${who}\``;
}

function accessPlan(name, rows, principal = '') {
  const who = str(principal).trim();
  let t;
  try {
    t = tableParts(name);
  } catch {
    return { grants: [], gaps: [], me: '' };
  }
  if (who.includes('`')) return { grants: [], gaps: [], me: '' };
  const objects = {
    catalog: `\`${t.catalog}\``,
    schema: `\`${t.catalog}\`.\`${t.schema}\``,
    table: `\`${t.catalog}\`.\`${t.schema}\`.\`${t.table}\``,
  };
  const need = (privilege, level) => ({ privilege, level, object: objects[level] });
  if (rows == null) return { grants: who ? IMPLEMENT_READ_NEEDS.map(([p, level]) => need(p, level)) : [], gaps: [], me: '' };
  const list = Array.isArray(rows) ? rows : [];
  const facts = list.map((r) => ({
    level: str(r.level).toLowerCase(),
    privilege: privilegeOf(r.privilege),
    principal: str(r.principal).trim(),
    mine: r.mine === true || str(r.mine).toLowerCase() === 'true',
  }));
  const me = str((list.find((r) => str(r.me).trim()) || {}).me).trim();
  const holders = new Set([IMPLEMENT_ALL_USERS, ...(who ? [who.toLowerCase()] : [])]);
  const tableExists = facts.some((f) => f.level === 'table' && f.privilege === 'OWNER');
  const plan = { grants: [], gaps: [], me };
  for (const [privilege, level, levels] of IMPLEMENT_READ_NEEDS) {
    const owns = !!who && facts.some((f) => f.level === level && f.privilege === 'OWNER' && f.principal.toLowerCase() === who.toLowerCase());
    const granted = facts.some((f) => levels.includes(f.level) && [privilege, 'ALL PRIVILEGES'].includes(f.privilege)
      && holders.has(f.principal.toLowerCase()));
    if (owns || granted) continue;
    const manages = facts.some((f) => f.mine && levels.includes(f.level) && ['OWNER', 'MANAGE'].includes(f.privilege));
    if (manages || (level === 'table' && !tableExists)) {
      if (who) plan.grants.push(need(privilege, level));
      continue;
    }
    const owner = (facts.find((f) => f.level === level && f.privilege === 'OWNER') || {}).principal || '';
    plan.gaps.push({ ...need(privilege, level), owner });
  }
  return plan;
}

function gapList(gaps) {
  return joinAnd(gaps.map((g) => `${g.privilege} on ${g.level} ${g.object}${g.owner ? ` (owner ${g.owner})` : ''}`));
}

function accessGapMessage(who, gaps) {
  const it = gaps.length === 1 ? 'it' : 'them';
  const statements = gaps.map((g) => grantSql(g, who)).join('; ');
  return `${who} may not be able to read the result table: Inspire cannot grant ${gapList(gaps)}, because it `
    + `neither owns nor holds MANAGE on ${it}. If ${who} does not have ${it} yet, ask the owner to run: ${statements}`;
}

function appAccessMessage(table, gaps, me = '') {
  const inspire = me ? `\`${me}\`` : 'the identity Inspire runs as';
  const statements = gaps.map((g) => `GRANT MANAGE ON ${g.level.toUpperCase()} ${g.object} TO ${inspire}`).join('; ');
  const one = gaps.length === 1;
  const shared = gaps.length && gaps.every((g) => IMPLEMENT_TRAVERSE_PRIVILEGES.includes(g.privilege))
    ? `, or ${gaps.map((g) => grantSql(g, IMPLEMENT_ALL_USERS)).join('; ')}, which ${one ? 'opens' : 'open'} no data by ${one ? 'itself' : 'themselves'}`
    : '';
  return `a new App could not read ${table}: its service principal needs ${gapList(gaps)}, which not all `
    + `account users have, and Inspire can grant ${one ? 'it' : 'them'} only with MANAGE or ownership. `
    + `Ask the owner to run: ${statements}${shared}; or choose a result table in a catalog and schema Inspire manages`;
}

function shareWarnings(name, rows, principals) {
  return (Array.isArray(principals) ? principals : [])
    .map((p) => str(p && typeof p === 'object' ? p.name : p).trim())
    .filter(Boolean)
    .map((who) => ({ who, gaps: accessPlan(name, rows, who).gaps }))
    .filter((p) => p.gaps.length)
    .map((p) => accessGapMessage(p.who, p.gaps));
}

function warehouseManageCheck(got, identities, groups, warehouseName) {
  const name = str(warehouseName).trim() || 'the SQL warehouse';
  const cannot = `Inspire cannot manage ${name}, so it cannot give a new App access to it: ask the warehouse owner to grant `
    + 'Inspire CAN MANAGE on it, or re-run the Inspire installer';
  if (!got || !got.ok) {
    const status = got ? Number(got.status) : 0;
    if (status === 401 || status === 403) return { ok: false, detail: cannot };
    const d = got && got.data && typeof got.data === 'object' ? got.data : {};
    return { ok: false, detail: `Inspire could not check its permission on ${name}: ${str(d.message || d.error || `HTTP ${status}`)}` };
  }
  const lower = (v) => str(v).trim().toLowerCase();
  const ids = new Set((identities || []).map(lower).filter(Boolean));
  const memberOf = new Set((groups || []).map(lower).filter(Boolean));
  const entries = Array.isArray(got.data && got.data.access_control_list) ? got.data.access_control_list : [];
  const manages = entries.some((e) => (ids.has(lower(e.user_name)) || ids.has(lower(e.service_principal_name)) || memberOf.has(lower(e.group_name)))
    && (Array.isArray(e.all_permissions) ? e.all_permissions : []).some((p) => ['CAN_MANAGE', 'IS_OWNER'].includes(str(p.permission_level).toUpperCase())));
  return manages ? { ok: true, detail: `Inspire can give a new App access to ${name}` } : { ok: false, detail: cannot };
}

function appAccessCheck(table, warehouse) {
  const parts = [table, warehouse].filter(Boolean);
  const failed = parts.filter((c) => !c.ok);
  return failed.length
    ? { ok: false, detail: failed.map((c) => c.detail).join('; ') }
    : { ok: true, detail: parts.map((c) => c.detail).join('; ') };
}

function resultTableProblem(table, columns, otherRows) {
  const names = new Set((columns || []).map((c) => str(c && (c.column_name ?? c.col_name ?? c)).toLowerCase()));
  if (!names.size) return '';
  const missing = IMPLEMENT_RESULT_KEY_COLUMNS.filter((c) => !names.has(c));
  if (missing.length) {
    return `${table} already exists and is not an Inspire result table (it has no ${joinAnd(missing)}); pick a new table name so Inspire never rewrites it`;
  }
  const others = Number(otherRows) || 0;
  if (others > 0) {
    return `${table} already holds ${others} row(s) of other use cases; give each use case its own result table so its outputs show only its rows`;
  }
  return '';
}

function otherUseCaseRowsStatement(table, useCaseId) {
  return {
    sql: `SELECT COUNT_IF(use_case_id IS NULL OR use_case_id <> :uc) AS others FROM ${quoteTable(table)}`,
    parameters: [{ name: 'uc', value: String(useCaseId), type: 'STRING' }],
  };
}

function appOwnerTag(useCaseId, sessionId) {
  return `Inspire use case ${str(useCaseId)} (session ${str(sessionId)})`;
}

function appNameCheck(appName, existing, { useCaseId, sessionId } = {}) {
  if (!appName) return { ok: true, detail: '', creates: false };
  if (!existing) return { ok: true, detail: `'${appName}' is free`, creates: true };
  const ours = str(existing.description).startsWith(appOwnerTag(useCaseId, sessionId));
  return ours
    ? { ok: true, detail: `'${appName}' is this use case's App; Inspire updates it`, creates: false }
    : { ok: false, detail: `'${appName}' is used by another App in this workspace; pick another name`, creates: true };
}

function appsLimit(host) {
  return /\.gcp\.databricks\.com/i.test(str(host)) ? 50 : 100;
}

function appsQuotaCheck(count, limit, creates) {
  if (!creates) return { ok: true, detail: `no new App is needed (${count} of ${limit} Apps used)` };
  return count < limit
    ? { ok: true, detail: `${count} of ${limit} Apps used; one more fits` }
    : { ok: false, detail: `this workspace already has ${count} of its ${limit} Apps; delete one or untick the App` };
}

function executionFamily(mandate) {
  const match = /^Execution pattern: family ([A-H])\b/.exec(str(mandate).trim());
  return match ? match[1] : '';
}

const IMPLEMENT_MODEL_FAMILIES = ['A', 'B', 'C', 'D'];

function parseEvidence(raw) {
  let value = raw;
  if (typeof value === 'string' && value.trim()) {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  if (!isPlainObject(value) || !isPlainObject(value.tables)) return null;
  const tables = {};
  for (const [name, entry] of Object.entries(value.tables)) {
    if (!isPlainObject(entry)) continue;
    const rows = wholeNumber(entry.rows);
    const ranges = {};
    for (const [column, range] of Object.entries(isPlainObject(entry.date_ranges) ? entry.date_ranges : {})) {
      if (isPlainObject(range) && str(range.min) && str(range.max)) ranges[column] = { min: str(range.min), max: str(range.max) };
    }
    tables[name] = { rows: rows == null ? null : rows, date_ranges: ranges, sampled: Boolean(entry.sampled) };
  }
  return { tables };
}

function tableNames(text) {
  const names = [];
  for (const part of str(text).split(/[,\s]+/)) {
    const name = part.replace(/`/g, '').trim().replace(/[.;:)]+$/, '').replace(/^\(+/, '');
    const parts = name.split('.');
    if (parts.length === 3 && parts.every(Boolean) && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

function useCaseTables(useCase) {
  const names = tableNames(useCase && useCase.tables_involved);
  for (const name of tableNames(useCase && useCase.primary_table)) {
    if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

function primaryTableOf(useCase) {
  return tableNames(useCase && useCase.primary_table)[0] || '';
}

function removedTableProblems(spec, involved, primary = '') {
  const removed = ((spec && spec.data && spec.data.removed_tables) || []).map(plainTable);
  if (!removed.length) return [];
  const gone = new Set(removed.map((t) => t.toLowerCase()));
  const known = new Set((involved || []).map((t) => plainTable(t).toLowerCase()));
  const main = plainTable(primary);
  const problems = [];
  if (main && gone.has(main.toLowerCase())) problems.push(`${main} is the primary table of this use case; swap it instead of removing it`);
  const strangers = removed.filter((t) => !known.has(t.toLowerCase()));
  if (strangers.length) {
    problems.push(`${strangers.join(', ')} ${strangers.length === 1 ? 'is' : 'are'} not among the tables of this use case`);
  }
  if (known.size && [...known].every((t) => gone.has(t))) problems.push('every table of this use case was removed; keep at least one');
  return problems;
}

function useCaseRowStatement(table, sessionId, useCaseId) {
  return {
    sql: `SELECT * FROM ${table} WHERE session_id = :sid AND id = :uc LIMIT 1`,
    parameters: [
      { name: 'sid', value: String(sessionId), type: 'BIGINT' },
      { name: 'uc', value: String(useCaseId), type: 'STRING' },
    ],
  };
}

function validateUseCaseId(value) {
  const id = str(value).trim();
  if (!id || !IMPLEMENT_USE_CASE_ID_RE.test(id)) throw badRequest('use_case_id must match /^[a-zA-Z0-9_.-]+$/.');
  return id;
}

function quoteTable(name) {
  const parts = plainTable(name).split('.');
  if (parts.length !== 3 || parts.some((p) => !p || p.includes('`'))) throw badRequest(`'${str(name)}' must be catalog.schema.table`);
  return parts.map((p) => `\`${p}\``).join('.');
}

function quoteColumn(name) {
  const col = str(name).trim();
  if (!col || col.includes('`') || col.length > 255) throw badRequest(`'${col}' is not a column name`);
  return `\`${col}\``;
}

module.exports = {
  IMPLEMENT_OPERATION,
  IMPLEMENT_TABLE,
  IMPLEMENT_STATUSES,
  IMPLEMENT_ACTIVE_STATUSES,
  IMPLEMENT_DONE_STATUSES,
  IMPLEMENT_OUTPUTS,
  IMPLEMENT_OUTPUT_LABELS,
  IMPLEMENT_OUTPUT_ID_COLUMNS,
  IMPLEMENT_STOPPED_STATES,
  IMPLEMENT_RUN_ENDED_STATES,
  IMPLEMENT_STALE_AFTER_MS,
  IMPLEMENT_OUTPUT_OPTIONS,
  IMPLEMENT_CHANGE_CLASSES,
  IMPLEMENT_COLUMN_ROLES,
  IMPLEMENT_FILTER_OPS,
  IMPLEMENT_COLUMNS,
  IMPLEMENT_ALERT_TIER_SETS,
  IMPLEMENT_ALERT_OPERATORS,
  IMPLEMENT_NOTEBOOK_TASK_KEY,
  IMPLEMENT_USE_CASE_PARAM,
  IMPLEMENT_SPEC_VERSION_PARAM,
  IMPLEMENT_APP_NAME_RE,
  IMPLEMENT_NOT_AVAILABLE,
  validateImplementSpec,
  classifyImplementChange,
  implementChangeSummary,
  implementTableName,
  implementTableCreateSql,
  implementHistoryStatement,
  describedColumnNames,
  implementMissingColumns,
  isMissingColumnError,
  destinationsFromList,
  implementInsertStatement,
  implementRunStartedStatement,
  implementStartFailedStatement,
  implementStalled,
  parseImplementRow,
  carriedAssets,
  planSubmission,
  implementJobParams,
  widgetsFromInstruction,
  implementWidgets,
  tableParts,
  columnsStatement,
  tableSwapStatement,
  columnValuesStatement,
  readinessStatement,
  readinessFromRow,
  resultsStatement,
  rerunParams,
  rerunWidgets,
  rerunOverrides,
  sourceTables,
  tableProbeStatement,
  tableAccessReason,
  missingTablesMessage,
  appStatusFrom,
  jobRunsFrom,
  IMPLEMENT_SPEC_WIDGETS,
  liveLogPath,
  useCaseLogLines,
  filterImplementSteps,
  groupWidgets,
  IMPLEMENT_INSPIRE_WIDGETS,
  IMPLEMENT_RESULT_KEY_COLUMNS,
  IMPLEMENT_MODEL_FAMILIES,
  allowedRule,
  allowedText,
  widgetValueProblem,
  widgetSetProblems,
  widgetProblems,
  cronProblem,
  resultTableNameError,
  outputAccessStatement,
  outputAccess,
  resultTableProblem,
  otherUseCaseRowsStatement,
  appOwnerTag,
  appNameCheck,
  appsLimit,
  appsQuotaCheck,
  IMPLEMENT_ALL_USERS,
  accessPlan,
  grantSql,
  accessGapMessage,
  appAccessMessage,
  shareWarnings,
  warehouseManageCheck,
  appAccessCheck,
  executionFamily,
  parseEvidence,
  badRequest,
  useCaseRowStatement,
  useCaseTables,
  primaryTableOf,
  removedTableProblems,
  validateUseCaseId,
  quoteTable,
  quoteColumn,
};
