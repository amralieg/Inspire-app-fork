const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const backend = require('../lib/inspireImplement');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'implementWizard.js')).href;
const load = () => import(libUrl);

const UC = { id: 'N01-U01', Name: 'Predict churn', statement: 'Cut churn in the top segment', sponsor: 'Head of Retention' };

test('the wizard offers exactly the outputs, tiers and operators the backend validates', async () => {
  const w = await load();
  assert.deepEqual(w.IMPLEMENT_OUTPUTS.map((o) => o.id), backend.IMPLEMENT_OUTPUTS);
  assert.deepEqual(w.IMPLEMENT_OUTPUTS.map((o) => o.label), backend.IMPLEMENT_OUTPUTS.map((o) => backend.IMPLEMENT_OUTPUT_LABELS[o]));
  assert.deepEqual(w.ALERT_TIER_OPTIONS.map((t) => t.id), Object.keys(backend.IMPLEMENT_ALERT_TIER_SETS));
  assert.deepEqual(w.ALERT_TIER_OPTIONS.map((t) => t.label), Object.values(backend.IMPLEMENT_ALERT_TIER_SETS).map((s) => s.join(' or ')));
  assert.deepEqual(w.ALERT_OPERATORS, backend.IMPLEMENT_ALERT_OPERATORS);
});

test('the default spec carries every output option and validates clean once an owner and warehouse are set', async () => {
  const w = await load();
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire', owner: 'amr@example.com' });
  for (const name of backend.IMPLEMENT_OUTPUTS) {
    assert.ok(name in spec.outputs, name);
    for (const option of backend.IMPLEMENT_OUTPUT_OPTIONS[name]) assert.ok(option in spec.outputs, `${name}.${option}`);
  }
  assert.equal(spec.outputs.alert, false);
  const { errors, spec: normalized } = backend.validateImplementSpec(spec);
  assert.deepEqual(errors, []);
  assert.deepEqual([normalized.outputs.alert_tiers, normalized.outputs.alert_operator, normalized.outputs.alert_threshold], ['act_now', '>=', 1]);
  const withAlert = { ...spec, outputs: { ...spec.outputs, alert: true, alert_recipients: w.defaultAlertRecipients(spec) } };
  assert.deepEqual(backend.validateImplementSpec(withAlert).errors, []);
});

test('a use case is found by its catalog id, then its number, then its implement row id', async () => {
  const w = await load();
  assert.equal(w.caseIdOf({ id: 'N01-U01', No: 'N09-U09', use_case_id: 'N08-U08' }), 'N01-U01');
  assert.equal(w.caseIdOf({ id: null, No: 'N01-U02', use_case_id: 'N08-U08' }), 'N01-U02');
  assert.equal(w.caseIdOf({ use_case_id: 'N01-U03' }), 'N01-U03');
  assert.equal(w.caseIdOf({ id: ' N01-U04 ' }), 'N01-U04');
  assert.equal(w.caseIdOf({ id: 7 }), '7');
  for (const empty of [null, undefined, {}, { id: '' }, 'N01-U01']) assert.equal(w.caseIdOf(empty), '', String(empty));
});

test('an edit never carries a retry forward', async () => {
  const w = await load();
  const fallback = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  const latest = { spec_version: 3, spec_json: { ...fallback, retry_outputs: ['dashboard'], outputs: { ...fallback.outputs, alert: true } } };
  const edited = w.specFromLatest(latest, fallback);
  assert.equal('retry_outputs' in edited, false);
  assert.equal(edited.based_on_version, 3);
  assert.equal(edited.outputs.alert, true);
  const next = w.nextSpecFrom(latest, { schedule: { enabled: true } });
  assert.equal('retry_outputs' in next, false);
  assert.equal(next.based_on_version, 3);
  assert.deepEqual(next.schedule, { enabled: true });
  assert.deepEqual(w.nextSpecFrom(latest, { retry_outputs: ['alert'] }).retry_outputs, ['alert']);
  assert.deepEqual(w.nextSpecFrom(null, {}), { based_on_version: null });
});

test('a confirmation to overwrite notebook edits applies to its own version only', async () => {
  const w = await load();
  const fallback = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  assert.equal(fallback.confirm_notebook_overwrite, false);
  const latest = { spec_version: 4, spec_json: { ...fallback, confirm_notebook_overwrite: true, retry_outputs: ['dashboard'] } };
  const edited = w.specFromLatest(latest, fallback);
  assert.equal(edited.confirm_notebook_overwrite, false, 'an Edit after a confirmed rebuild starts unconfirmed');
  assert.equal(backend.validateImplementSpec(edited).spec.confirm_notebook_overwrite, false);
  const next = w.nextSpecFrom(latest, { schedule: { enabled: true } });
  assert.equal('confirm_notebook_overwrite' in next, false);
  assert.equal(backend.validateImplementSpec(next).spec.confirm_notebook_overwrite, false);
  const confirmed = w.nextSpecFrom(latest, { confirm_notebook_overwrite: true });
  assert.equal(confirmed.confirm_notebook_overwrite, true);
  assert.equal(confirmed.based_on_version, 4);
  assert.equal('retry_outputs' in confirmed, false);
  assert.equal(backend.validateImplementSpec(confirmed).spec.confirm_notebook_overwrite, true);
});

test('a notebook counts as edited only when the agent recorded the edit', async () => {
  const w = await load();
  const at = 1761400000000;
  assert.deepEqual(w.editedNotebook({ status: 'failed', asset_status: { notebook: { modified_at: 1, state: 'edited', edited_at: at } } }),
    { edited_at: at });
  assert.deepEqual(w.editedNotebook({ status: 'ready', asset_status: { notebook: { state: 'edited' } } }), { edited_at: null });
  for (const latest of [null, {}, { asset_status: null }, { asset_status: {} }, { asset_status: { notebook: null } },
    { asset_status: { notebook: { modified_at: at, spec_version: 3 } } },
    { asset_status: { notebook: { modified_at: at, rewriting: { spec_version: 4, run_id: '11' } } } },
    { asset_status: { dashboard: { state: 'edited' } } }]) {
    assert.equal(w.editedNotebook(latest), null, JSON.stringify(latest));
  }
});

test('only failed outputs that are still selected on a version with warnings can be retried', async () => {
  const w = await load();
  const latest = {
    status: 'ready_with_warnings',
    spec_version: 8,
    spec_json: { outputs: { dashboard: true, genie_space: true, app: false, alert: true } },
    asset_status: {
      dashboard: { state: 'ready' },
      genie_space: { state: 'failed', error: 'space create 403' },
      app: { state: 'failed', error: 'old' },
      alert: { state: 'failed', spec_version: 7 },
    },
  };
  assert.deepEqual(w.retryableOutputs(latest).map((o) => [o.id, o.error, o.spec_version]),
    [['genie_space', 'space create 403', 8], ['alert', '', 7]], 'a failure carried from an older version names the version it failed on');
  assert.deepEqual(w.retryableOutputs({ ...latest, status: 'failed' }), []);
  assert.deepEqual(w.retryableOutputs({ ...latest, status: 'ready' }), []);
  assert.deepEqual(w.retryableOutputs(null), []);
  assert.deepEqual(w.retryableOutputs({ status: 'ready_with_warnings', spec_json: {}, asset_status: null }), []);
});

test('alert recipients default to the decision owner and the users it is shared with, never groups', async () => {
  const w = await load();
  const spec = {
    use_case: { decision_owner: 'Owner@Example.com' },
    sharing: { principals: [
      { type: 'user', name: 'owner@example.com' }, { type: 'user', name: 'b@example.com' },
      { type: 'group', name: 'planners' }, { type: 'user', name: 'not an email' }, { type: 'service_principal', name: 'sp@example.com' },
    ] },
  };
  assert.deepEqual(w.defaultAlertRecipients(spec), ['Owner@Example.com', 'b@example.com']);
  assert.deepEqual(w.defaultAlertRecipients({ use_case: { decision_owner: 'Head of Retention' }, sharing: { principals: [] } }), []);
  assert.deepEqual(w.defaultAlertRecipients({}), []);
});

test('the Use it step accepts an alert on its own and blocks one nobody would receive', async () => {
  const w = await load();
  const base = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  const only = (outputs) => ({ ...base, outputs: { ...base.outputs, dashboard: false, ...outputs } });
  assert.deepEqual(w.stepErrors('use_it', only({ alert: true, alert_recipients: ['a@example.com'] })), []);
  assert.deepEqual(w.stepErrors('use_it', only({ alert: true, alert_destinations: [{ id: '1234abcd-ef' }] })), []);
  assert.deepEqual(w.stepErrors('use_it', only({})), ['pick at least one way to use it']);
  assert.ok(w.stepErrors('use_it', only({ alert: true })).includes('an alert needs at least one recipient email or notification destination'));
  assert.ok(w.stepErrors('use_it', only({ alert: true, alert_recipients: ['nope'] })).some((e) => e.includes('not an email address: nope')));
  assert.ok(w.stepErrors('use_it', only({ alert: true, alert_recipients: ['a@example.com'], alert_threshold: '-1' }))
    .includes('the alert threshold must be a number of rows, 0 or more'));
  assert.deepEqual(w.stepErrors('use_it', only({ alert: true, alert_recipients: ['a@example.com'], alert_threshold: '' })), []);
});

test('the trigger reads the same as the one the agent writes on the alert', async () => {
  const w = await load();
  assert.ok(FIXTURE.alert_triggers.length >= 6);
  for (const [outputs, text] of FIXTURE.alert_triggers) assert.equal(w.alertTriggerText(outputs), text, JSON.stringify(outputs));
});

const FIXTURE = require('./fixtures/implement_change_classes.json');
const ROW = { id: 'N01-U01', primary_table: 'main.s.orders', tables_involved: 'main.s.orders,main.s.returns,main.s.web' };

function specWith(w, data) {
  const spec = w.defaultSpecFromUseCase(ROW, { warehouseId: 'wh1', inspireDatabase: 'main.inspire', owner: 'amr@example.com' });
  return { ...spec, data: { ...spec.data, ...data } };
}

test('the wizard lists the same tables the backend and the agent enforce', async () => {
  const w = await load();
  for (const c of FIXTURE.table_names) {
    const row = { tables_involved: c.tables_involved, primary_table: c.primary_table };
    assert.deepEqual(w.tablesOf(row), backend.useCaseTables(row), JSON.stringify(c));
    assert.equal(w.primaryTableOf(row), backend.primaryTableOf(row));
  }
  assert.deepEqual(w.tablesOf({ Tables: 'main.s.a, main.s.b', 'Primary Table': 'main.s.c' }), ['main.s.a', 'main.s.b', 'main.s.c']);
});

test('removing a table clears its swap, roles and filters, says so, and validates clean', async () => {
  const w = await load();
  const spec = specWith(w, {
    tables: { 'main.s.returns': 'main.s.returns_v2' },
    column_roles: { entity_id: 'main.s.orders.customer_id', segment: 'main.s.returns_v2.region', label: 'main.s.returns.reason' },
    filters: [{ table: 'main.s.returns_v2', column: 'region', op: 'in', values: ['EU'] },
      { table: 'main.s.orders', column: 'channel', op: 'not in', values: ['test'] }],
  });
  const { spec: next, cleared } = w.removeTable(spec, 'main.s.returns');
  assert.deepEqual(next.data.removed_tables, ['main.s.returns']);
  assert.deepEqual(next.data.tables, {});
  assert.deepEqual(next.data.column_roles, { entity_id: 'main.s.orders.customer_id' });
  assert.deepEqual(next.data.filters, [{ table: 'main.s.orders', column: 'channel', op: 'not in', values: ['test'] }]);
  assert.deepEqual(cleared, { roles: ['segment', 'label'], filters: 1 });
  assert.deepEqual(backend.validateImplementSpec(next).errors, []);
  assert.deepEqual(backend.removedTableProblems(backend.validateImplementSpec(next).spec, backend.useCaseTables(ROW), backend.primaryTableOf(ROW)), []);
  assert.deepEqual(w.removeTable(next, 'MAIN.S.RETURNS').spec.data.removed_tables, ['main.s.returns']);
  assert.deepEqual(w.restoreTable(next, 'MAIN.S.RETURNS').data.removed_tables, []);
});

test('the primary table and the last kept table cannot be removed', async () => {
  const w = await load();
  const spec = specWith(w, {});
  assert.equal(w.removalBlocker(ROW, spec, 'main.s.orders'), 'the primary table can be swapped, not removed');
  assert.equal(w.removalBlocker(ROW, spec, 'main.s.returns'), '');
  const two = w.removeTable(spec, 'main.s.returns').spec;
  assert.equal(w.removalBlocker({ ...ROW, primary_table: '' }, w.removeTable(two, 'main.s.web').spec, 'main.s.orders'), 'keep at least one table');
});

test('segment and exclusion filters are set, replaced and dropped by column and operator', async () => {
  const w = await load();
  let spec = specWith(w, {});
  spec = w.setFilterValues(spec, 'main.s.web', 'region', 'in', ['EU', 'UK']);
  spec = w.setFilterValues(spec, 'main.s.web', 'region', 'not in', ['XX']);
  assert.deepEqual(w.filterValues(spec, 'main.s.web', 'region', 'in'), ['EU', 'UK']);
  spec = w.setFilterValues(spec, 'main.s.web', 'region', 'in', ['EU']);
  assert.equal(spec.data.filters.length, 2);
  assert.deepEqual(backend.validateImplementSpec(spec).spec.data.filters, [
    { table: 'main.s.web', column: 'region', op: 'not in', values: ['XX'] },
    { table: 'main.s.web', column: 'region', op: 'in', values: ['EU'] },
  ]);
  assert.deepEqual(w.stepErrors('data', spec), []);
  const clash = w.setFilterValues(spec, 'main.s.web', 'region', 'not in', ['EU']);
  assert.deepEqual(w.stepErrors('data', clash), ['main.s.web.region both keeps and excludes EU']);
  assert.deepEqual(w.setFilterValues(spec, 'main.s.web', 'region', 'in', []).data.filters, [
    { table: 'main.s.web', column: 'region', op: 'not in', values: ['XX'] },
  ]);
});

test('the live check reads only the primary table, after its swap', async () => {
  const w = await load();
  const spec = specWith(w, {
    tables: { 'main.s.orders': 'main.s.orders_v2' },
    column_roles: { entity_id: 'main.s.orders_v2.customer_id', event_date: 'main.s.orders_v2.order_date', segment: 'main.s.web.region' },
    filters: [{ table: 'main.s.web', column: 'region', op: 'in', values: ['EU'] },
      { table: 'main.s.orders_v2', column: 'channel', op: 'not in', values: ['test'] }],
    window: { start: '2026-01-01', end: '2026-06-30' },
  });
  assert.deepEqual(w.readinessScope(spec, ROW), {
    table: 'main.s.orders_v2',
    columns: ['customer_id', 'order_date'],
    filters: [{ table: 'main.s.orders_v2', column: 'channel', op: 'not in', values: ['test'] }],
    window: { column: 'order_date', start: '2026-01-01', end: '2026-06-30' },
  });
  const elsewhere = { ...spec, data: { ...spec.data, column_roles: { event_date: 'main.s.web.visit_date' } } };
  assert.deepEqual(w.readinessScope(elsewhere, ROW).window, {});
});

test('plan lines say what the edit builds, refreshes, deletes and keeps', async () => {
  const w = await load();
  assert.deepEqual(w.planLines(null), []);
  assert.deepEqual(w.planLines({ classes: ['outputs'], refill: false, build: ['genie_space', 'alert'], refresh: ['dashboard'],
    delete: ['app'], keep_unmanaged: [], schedule: false }), [
    'Changes: outputs',
    'The built notebook is kept as it is',
    'Builds: Genie space, Alert',
    'Refreshes: Dashboard',
    'Deletes: App',
  ]);
  assert.deepEqual(w.planLines({ classes: ['data'], refill: true, build: [], refresh: ['dashboard'], delete: [], keep_unmanaged: ['app'], schedule: true }), [
    'Changes: data',
    'Genie rewrites the notebook and Inspire re-runs the preview',
    'Refreshes: Dashboard',
    'Leaves in place, no longer managed: App',
    'Updates the job schedule',
  ]);
});

test('failure emails start as the decision owner and follow the owner until the user edits them', async () => {
  const w = await load();
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire', owner: 'amr@example.com' });
  assert.deepEqual(spec.schedule.failure_emails, ['amr@example.com']);
  assert.deepEqual(backend.validateImplementSpec(spec).spec.schedule.failure_emails, ['amr@example.com']);
  assert.deepEqual(w.defaultSpecFromUseCase(UC, {}).schedule.failure_emails, []);
  const moved = w.withDecisionOwner(spec, 'lead@example.com');
  assert.equal(moved.use_case.decision_owner, 'lead@example.com');
  assert.deepEqual(moved.schedule.failure_emails, ['lead@example.com']);
  assert.deepEqual(w.withDecisionOwner(moved, 'Head of Pricing').schedule.failure_emails, []);
  assert.deepEqual(w.withDecisionOwner(w.withDecisionOwner(moved, 'Head of Pricing'), 'x@example.com').schedule.failure_emails, ['x@example.com']);
  const edited = { ...moved, schedule: { ...moved.schedule, failure_emails: ['ops@example.com'] } };
  assert.deepEqual(w.withDecisionOwner(edited, 'other@example.com').schedule.failure_emails, ['ops@example.com']);
  const cleared = { ...moved, schedule: { ...moved.schedule, failure_emails: [] } };
  assert.deepEqual(w.withDecisionOwner(cleared, 'other@example.com').schedule.failure_emails, []);
  assert.deepEqual(w.withDecisionOwner({ ...moved, schedule: { ...moved.schedule, failure_emails: ['LEAD@example.com'] } }, 'new@example.com')
    .schedule.failure_emails, ['new@example.com']);
});

test('sharing starts with the decision owner and follows the owner until the user edits it', async () => {
  const w = await load();
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire', owner: 'amr@example.com' });
  assert.deepEqual(spec.sharing.principals, [{ type: 'user', name: 'amr@example.com' }]);
  assert.deepEqual(backend.validateImplementSpec(spec).spec.sharing.principals, [{ type: 'user', name: 'amr@example.com' }]);
  assert.deepEqual(w.defaultSpecFromUseCase(UC, {}).sharing.principals, []);
  const moved = w.withDecisionOwner(spec, 'lead@example.com');
  assert.deepEqual(moved.sharing.principals, [{ type: 'user', name: 'lead@example.com' }]);
  const named = w.withDecisionOwner(moved, 'Head of Pricing');
  assert.deepEqual(named.sharing.principals, []);
  assert.deepEqual(w.withDecisionOwner(named, 'x@example.com').sharing.principals, [{ type: 'user', name: 'x@example.com' }]);
  const edited = { ...moved, sharing: { principals: [{ type: 'user', name: 'lead@example.com' }, { type: 'group', name: 'analysts' }] } };
  assert.deepEqual(w.withDecisionOwner(edited, 'other@example.com').sharing.principals, edited.sharing.principals);
  const cleared = { ...moved, sharing: { principals: [] } };
  assert.deepEqual(w.withDecisionOwner(cleared, 'other@example.com').sharing.principals, []);
  const group = { ...moved, sharing: { principals: [{ type: 'group', name: 'lead@example.com' }] } };
  assert.deepEqual(w.withDecisionOwner(group, 'other@example.com').sharing.principals, group.sharing.principals);
  assert.deepEqual(w.withDecisionOwner({ ...moved, sharing: { principals: [{ type: 'user', name: 'LEAD@example.com' }] } }, 'new@example.com')
    .sharing.principals, [{ type: 'user', name: 'new@example.com' }]);
  const kept = w.specFromLatest({ spec_version: 2, spec_json: { ...spec, sharing: { principals: [] } } }, spec);
  assert.deepEqual(kept.sharing.principals, []);
});

test('a cron is shown in plain words, and one it cannot read is called custom rather than guessed', async () => {
  const w = await load();
  const cases = [
    ['0 0 * * * ?', 'every hour, on the hour'],
    ['0 0 6 * * ?', 'every day at 06:00 Asia/Dubai'],
    ['0 0 6 ? * MON', 'every Monday at 06:00 Asia/Dubai'],
    ['0 0 6 1 * ?', 'on day 1 of every month at 06:00 Asia/Dubai'],
    ['0 0 6 1 1,4,7,10 ?', 'on day 1 of January, April, July and October at 06:00 Asia/Dubai'],
    ['0 0 6 1 1 ?', 'on day 1 of January at 06:00 Asia/Dubai'],
    ['0 30 18 ? * MON-FRI', 'every Monday to Friday at 18:30 Asia/Dubai'],
    ['0 0 6,18 ? * 2,4,6', 'every Monday, Wednesday and Friday at 06:00 and 18:00 Asia/Dubai'],
    ['0 15 7 L * ?', 'on the last day of every month at 07:15 Asia/Dubai'],
    ['0 0/15 * * * ?', 'every 15 minutes'],
    ['0 */1 * * * ?', 'every minute'],
    ['0 30 */6 * * ?', 'every 6 hours at minute 30'],
    ['0 0 6 * * ? 2027', 'a custom schedule (0 0 6 * * ? 2027)'],
    ['0 0 6 ? * 6L', 'a custom schedule (0 0 6 ? * 6L)'],
    ['0 0 6 ? 1 MON', 'a custom schedule (0 0 6 ? 1 MON)'],
    ['0 0 25 * * ?', 'a custom schedule (0 0 25 * * ?)'],
    ['30 0 6 * * ?', 'a custom schedule (30 0 6 * * ?)'],
    ['0 6 * * *', 'a custom schedule (0 6 * * *)'],
    ['', 'no schedule'],
  ];
  for (const [cron, words] of cases) assert.equal(w.cronInWords(cron, 'Asia/Dubai'), words, cron);
  assert.equal(w.cronInWords('0 0 6 * * ?', ''), 'every day at 06:00 UTC');
  const invalid = ['0 6 * * *', '0 0 25 * * ?'];
  for (const [cron] of cases.filter(([c]) => c)) {
    assert.equal(backend.validateImplementSpec({ schedule: { cron } }).errors.some((e) => e.includes('is not a valid Quartz cron')), invalid.includes(cron), cron);
    assert.equal(Boolean(w.cronProblem(cron)), invalid.includes(cron), cron);
  }
});

test('the wizard checks crons and widget values with the same rules and words as the backend and the agent', async () => {
  const w = await load();
  for (const cron of FIXTURE.crons.valid) assert.equal(w.cronProblem(cron), backend.cronProblem(cron), cron);
  for (const [cron, problem] of FIXTURE.crons.invalid) {
    assert.equal(w.cronProblem(cron), problem, cron);
    assert.equal(backend.cronProblem(cron), problem, cron);
  }
  for (const [text, rule, printed] of FIXTURE.widget_ranges.allowed) {
    assert.deepEqual(w.allowedRule(text), rule, text);
    if (rule) assert.equal(w.allowedText(rule), printed, text);
  }
  for (const [name, value, allowed, problem] of FIXTURE.widget_ranges.values) assert.equal(w.widgetValueProblem(name, value, allowed), problem, `${name}=${value}`);
  for (const item of FIXTURE.widget_ranges.problems) {
    assert.deepEqual(w.widgetProblems(item.widgets, item.values), item.problems, item.name);
    assert.deepEqual(backend.widgetProblems(item.widgets, item.values), item.problems, item.name);
  }
});

test('Next is blocked on a bad cron, an out-of-range widget or profile value, and never on a field the step does not show', async () => {
  const w = await load();
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire', owner: 'amr@example.com' });
  const widgets = [{ name: 'act_now_share', default: '0.05', allowed: '0 to 1' }, { name: 'review_share', default: '0.2', allowed: '0 to 1' }, { name: 'note', default: '', allowed: '' }];
  assert.deepEqual(w.stepErrors('configure', spec, { widgets }), []);
  const bad = JSON.parse(JSON.stringify(spec));
  bad.config.widgets = { act_now_share: '1.2', note: 'anything' };
  bad.config.profiles.training.window_days = '30.5';
  bad.config.profiles.retrain.drift_threshold = '2';
  assert.deepEqual(w.stepErrors('configure', bad, { widgets }), [
    "act_now_share is '1.2'; allowed: 0 to 1",
    'act_now_share + review_share is 1.4; allowed: at most 1',
    "training window days is '30.5'; allowed: whole number, at least 1",
  ]);
  assert.deepEqual(w.stepErrors('configure', bad, { widgets, trainsModel: false }), [
    "act_now_share is '1.2'; allowed: 0 to 1",
    'act_now_share + review_share is 1.4; allowed: at most 1',
  ]);
  bad.schedule.cron = '0 0 25 * * ?';
  assert.deepEqual(w.stepErrors('schedule', bad), [
    "the cron is not valid: the hour value '25' is not 0 to 23",
    "retrain drift threshold is '2'; allowed: above 0, at most 1",
  ]);
  assert.deepEqual(w.stepErrors('schedule', bad, { trainsModel: false }), ["the cron is not valid: the hour value '25' is not 0 to 23"]);
  assert.deepEqual(w.stepErrors('schedule', spec), []);
  for (const drift of ['0', '0.0', '-0.1', 'abc']) {
    assert.equal(w.profileFieldProblem('retrain.drift_threshold', drift), `retrain drift threshold is '${drift}'; allowed: above 0, at most 1`, drift);
  }
  for (const drift of ['0.2', ' 1 ', '', null]) assert.equal(w.profileFieldProblem('retrain.drift_threshold', drift), '', String(drift));
  assert.equal(w.profileFieldProblem('training.window_days', ' 30 '), '');
  assert.equal(w.profileFieldProblem('training.window_days', '0'), "training window days is '0'; allowed: whole number, at least 1");
});

test('every profile value Next accepts is one the server accepts', async () => {
  const w = await load();
  const { validateImplementSpec } = backend;
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  for (const [path, values] of [['retrain.drift_threshold', ['0', '0.0', '0.5', '1', '1.5', '-1', 'abc', '.5']],
    ['training.window_days', ['0', '1', '30', '2.5', '-3', 'x', '1e3']], ['preview.entity_cap', ['1', '0', '7.0']]]) {
    for (const value of values) {
      const [section, field] = path.split('.');
      const candidate = JSON.parse(JSON.stringify(spec));
      candidate.config.profiles[section][field] = value;
      const serverErrors = validateImplementSpec(candidate).errors.filter((e) => e.includes(field));
      if (!w.profileFieldProblem(path, value)) assert.deepEqual(serverErrors, [], `${path}=${value} passes Next but not the server`);
      else assert.ok(serverErrors.length || value === '.5', `${path}=${value} is blocked at Next for no server reason`);
    }
  }
});

test('the run count and cost hint follow the cron', async () => {
  const w = await load();
  const near = (cron, expected) => assert.ok(Math.abs(w.cronRunsPerMonth(cron) - expected) < 0.01, `${cron}: ${w.cronRunsPerMonth(cron)}`);
  near('0 0 6 * * ?', 30.44);
  near('0 0 6 ? * MON-FRI', 5 * 30.44 / 7);
  near('0 0 6 ? * MON', 30.44 / 7);
  near('0 0/15 * * * ?', 4 * 24 * 30.44);
  near('0 0 6,18 * * ?', 2 * 30.44);
  near('0 0 22-2 * * ?', 5 * 30.44);
  near('0 0 6 1 * ?', 1);
  near('0 0 6 1 1,4,7,10 ?', 4 / 12);
  near('0 15 7 L * ?', 1);
  near('0 0 6 ? * MON#2', 1);
  near('0 0 6 ? * 6L', 1);
  near('0 0 6 ? JAN-MAR MON-FRI', (5 * 30.44 / 7) * (3 / 12));
  assert.equal(w.cronRunsPerMonth('0 0 25 * * ?'), null);
  assert.equal(w.cronRunsPerMonth(''), null);
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  const on = (cron, extra = {}) => ({ ...spec, schedule: { ...spec.schedule, enabled: true, cron, timezone: 'Asia/Dubai' }, outputs: { ...spec.outputs, ...extra } });
  assert.equal(w.costHint({ ...spec, schedule: { ...spec.schedule, enabled: false } }), 'one preview run now; no scheduled runs until you turn the schedule on.');
  assert.equal(w.costHint(on('0 0 6 * * ?')), 'one preview run now, then about 30 full serverless runs a month (every day at 06:00 Asia/Dubai).');
  assert.equal(w.costHint(on('0 0 6 1 1,4,7,10 ?', { alert: true })),
    'one preview run now, then about 0.3 full serverless runs a month (on day 1 of January, April, July and October at 06:00 Asia/Dubai), plus one alert check after each full run.');
  assert.equal(w.costHint(on('0 0 6 * * ? 2027')), 'one preview run now, then about 30 full serverless runs a month (a custom schedule (0 0 6 * * ? 2027)), only in 2027.');
  assert.equal(w.costHint(on('0 0 25 * * ?')), "one preview run now; the schedule's run count is unknown until its cron is valid.");
});

test('profile estimates come from Deep evidence, and say unknown when there is none', async () => {
  const w = await load();
  const evidence = { tables: { 'main.s.orders': { rows: 3650, sampled: false, date_ranges: { order_date: { min: '2024-01-01', max: '2024-12-31' } } },
    'main.s.events': { rows: 500, sampled: true, date_ranges: {} } } };
  const base = { evidence, table: 'main.s.orders', dateColumn: 'order_date', discoveryType: 'Deep', dataWindow: {} };
  assert.deepEqual(w.profileEstimate({ ...base, discoveryType: 'Standard' }), { rows: null, text: 'unknown: Standard discovery read no rows' });
  assert.deepEqual(w.profileEstimate({ ...base, evidence: null }), { rows: null, text: 'unknown: Standard discovery read no rows' });
  assert.equal(w.profileEstimate({ ...base, table: 'main.s.orders_v2' }).text, 'unknown: Deep discovery has no row count for main.s.orders_v2');
  assert.deepEqual(w.profileEstimate(base), { rows: 3650, text: 'about 3,650 rows of main.s.orders (366 of 366 days of order_date)' });
  assert.equal(w.profileEstimate({ ...base, windowDays: '30' }).rows, Math.round(3650 * 30 / 366));
  const windowed = w.profileEstimate({ ...base, dataWindow: { start: '2024-07-01', end: '2024-07-31' }, windowDays: '90' });
  assert.deepEqual(windowed, { rows: Math.round(3650 * 31 / 366), text: `about ${Math.round(3650 * 31 / 366)} rows of main.s.orders (31 of 366 days of order_date)` });
  assert.equal(w.profileEstimate({ ...base, table: 'MAIN.S.ORDERS', sampleEntities: '200', entityCap: '50' }).text,
    'about 3,650 rows of MAIN.S.ORDERS (366 of 366 days of order_date; then a sample of 200 entities; capped at 50 entities)');
  assert.equal(w.profileEstimate({ ...base, table: 'main.s.events', dateColumn: '', windowDays: '30' }).text,
    'at most 500 rows of main.s.events (no date range was profiled, so this is the whole table)');
});

test('every permission check the preflight can return has a label', async () => {
  const w = await load();
  for (const key of ['warehouse', 'output', 'result_grant', 'app_name', 'apps', 'genie_spaces', 'alerts']) assert.ok(w.PREFLIGHT_LABELS[key], key);
  assert.deepEqual(Object.keys(w.PROFILE_FIELDS).sort(), ['full_load.window_days', 'preview.entity_cap', 'retrain.drift_threshold',
    'retrain.every_runs', 'training.sample_entities', 'training.window_days']);
});

test('the Studio shows lost tables from a refused re-run first, else only from a failed latest version that recorded them', async () => {
  const w = await load();
  const lost = [{ table: 'main.s.returns', reason: 'not found' }];
  const failed = { status: 'failed', spec_version: 4, asset_status: { data: { state: 'failed', spec_version: 4, missing_tables: lost } } };
  assert.deepEqual(w.lostTables(failed, null), lost);
  assert.deepEqual(w.lostTables({ status: 'ready' }, { missing_tables: lost }), lost);
  assert.deepEqual(w.lostTables({ ...failed, status: 'ready' }, null), []);
  assert.deepEqual(w.lostTables({ ...failed, spec_version: 5 }, null), [], 'an entry from an older version is not this version\'s problem');
  assert.deepEqual(w.lostTables({ ...failed, asset_status: { data: { ...failed.asset_status.data, state: 'ready' } } }, null), []);
  assert.deepEqual(w.lostTables({ ...failed, asset_status: { data: { state: 'failed', spec_version: 4, missing_tables: 'x' } } }, null), []);
  assert.deepEqual(w.lostTables(null, { missing_tables: [] }), []);
  assert.deepEqual(w.lostTables(undefined, undefined), []);
  assert.equal(w.lostTablesText(lost), 'These source tables are missing or not readable: main.s.returns (not found). '
    + 'Swap each for a table with the same role, or remove it.');
  assert.equal(w.lostTablesText([]), '');
  assert.equal(w.lostTablesText(undefined), '');
});

test('Edit opens the wizard on the step it was asked for, and on the first step otherwise', async () => {
  const w = await load();
  assert.equal(w.initialStepIndex({ step: 'data' }), 1);
  assert.equal(w.initialStepIndex({ step: 'review' }), 5);
  assert.equal(w.initialStepIndex({ step: 'nope' }), 0);
  assert.equal(w.initialStepIndex(null), 0);
});

test('the Genie tab lists the questions recorded in the space, else the ones the user asked for', async () => {
  const w = await load();
  const asked = { spec_json: { outputs: { genie_questions: ['Which act now?'] } } };
  assert.deepEqual(w.genieQuestions({ ...asked, asset_status: { genie_space: { sample_questions: ['A?', 'B?'] } } }),
    { source: 'space', questions: ['A?', 'B?'], notes: ['', ''] });
  assert.deepEqual(w.genieQuestions({ ...asked, asset_status: { genie_space: { sample_questions: [] } } }),
    { source: 'spec', questions: ['Which act now?'], notes: [''] });
  assert.deepEqual(w.genieQuestions(asked), { source: 'spec', questions: ['Which act now?'], notes: [''] });
  assert.deepEqual(w.genieQuestions(null), { source: 'spec', questions: [], notes: [] });
});

test('the Genie tab shows the note on a question of the user that the results cannot answer as asked', async () => {
  const w = await load();
  const space = {
    sample_questions: ['Which stores act now?', 'How many  customers are in Act now?', 'Who is next?'],
    question_notes: [{ question: 'how many customers are in act now?', note: 'The rows are stores, so it counts stores.' },
      { question: 'Who is next?', note: '' }, { note: 'no question' }, null, { question: 'Not in the space?', note: 'x' }],
  };
  assert.deepEqual(w.genieQuestions({ asset_status: { genie_space: space } }), {
    source: 'space', questions: space.sample_questions, notes: ['', 'The rows are stores, so it counts stores.', ''],
  });
  assert.deepEqual(w.genieQuestions({ asset_status: { genie_space: { ...space, question_notes: 'not a list' } } }).notes, ['', '', '']);
});

test('the App tab shows the live state, the last deployment and the health check in words', async () => {
  const w = await load();
  const live = { ok: true, app_state: 'RUNNING', app_message: 'App is running', compute_state: 'ACTIVE', deployment_state: 'SUCCEEDED',
    deployment_message: 'App started successfully', deployed_at: '2026-10-25T03:00:00Z' };
  assert.deepEqual(w.appStatusRows(live, { health: 'running', spec_version: 4 }), [
    ['App', 'RUNNING: App is running'], ['Compute', 'ACTIVE'], ['Last deployment', 'SUCCEEDED: App started successfully (2026-10-25T03:00:00Z)'],
    ['Health check', 'running: it answers behind workspace sign-in'], ['Built on', 'v4']]);
  assert.deepEqual(w.appStatusRows({ ok: true }, { health: 'unverified: HTTP 502' }), [
    ['App', 'unknown'], ['Compute', 'unknown'], ['Last deployment', 'none'], ['Health check', 'unverified: HTTP 502']]);
  assert.deepEqual(w.appStatusRows({ ok: false, error: 'the App no longer exists' }, {}), [['Live status', 'the App no longer exists']]);
  assert.deepEqual(w.appStatusRows(null, null), []);
});

test('the tier filter lists the tiers of the latest run only, with their row counts', async () => {
  const w = await load();
  const summary = [{ as_of_date: '2026-10-24', priority_tier: 'Act now', rows: '3' }, { as_of_date: '2026-10-24', priority_tier: 'Review', rows: '9' },
    { as_of_date: '2026-10-17', priority_tier: 'Monitor', rows: '40' }, { as_of_date: '2026-10-24', priority_tier: null, rows: '1' }];
  assert.deepEqual(w.resultTierOptions(summary), [{ tier: 'Act now', rows: 3 }, { tier: 'Review', rows: 9 }]);
  assert.deepEqual(w.resultTierOptions([]), []);
  assert.deepEqual(w.resultTierOptions(undefined), []);
  assert.equal(w.runProfileText('preview'), 'preview');
  assert.equal(w.runProfileText(''), 'full (job default)');
});

test('the Studio gives the reason only for a warning or a failure', async () => {
  const w = await load();
  const why = 'Decision list: no row of the latest run reached Act now or Review (1000 Monitor), so it has nobody to act on yet';
  assert.equal(w.statusReason({ status: 'ready_with_warnings', status_message: ` ${why} ` }), why);
  assert.equal(w.statusReason({ status: 'failed', status_message: 'the preview run did not write rows: stopped' }),
    'the preview run did not write rows: stopped');
  for (const quiet of [{ status: 'ready', status_message: 'ready: preview wrote 12 row(s)' },
    { status: 'previewing', status_message: 'Dashboard: Genie round 1/3' }, { status: 'ready_with_warnings' },
    { status: 'failed', status_message: null }, null, undefined]) {
    assert.equal(w.statusReason(quiet), '', JSON.stringify(quiet));
  }
});

test('a stalled version reads as stopped, frees the Studio actions, says why, and the History calls older active versions stopped', async () => {
  const w = await load();
  assert.deepEqual(w.IMPLEMENT_ACTIVE_STATUSES, backend.IMPLEMENT_ACTIVE_STATUSES);
  const latest = { spec_version: 4, status: 'filling', status_message: 'filling' };
  const stalled = { run_id: '77', run_url: 'https://x/run/77', reason: 'the run building v4 ended (CANCELED) while v4 was still filling' };
  assert.equal(w.versionActive(latest), true);
  assert.equal(w.versionActive(latest, stalled), false);
  for (const status of ['ready', 'ready_with_warnings', 'failed', '']) assert.equal(w.versionActive({ status }), false, status);
  assert.equal(w.versionActive(null), false);
  assert.deepEqual(w.statusChip('filling', stalled), { label: 'Stopped', tone: 'error' });
  assert.deepEqual(w.statusChip('building_outputs'), { label: 'building outputs', tone: 'busy' });
  assert.deepEqual(w.statusChip('ready', stalled), { label: 'Ready', tone: 'success' });
  assert.equal(w.statusReason(latest, stalled), 'the run building v4 ended (CANCELED) while v4 was still filling. Edit submits a new version.');
  assert.equal(w.statusReason(latest), '');
  assert.equal(w.statusReason({ status: 'failed', status_message: 'boom' }, stalled), 'boom');
  assert.equal(w.historyStatus({ spec_version: 3, status: 'previewing' }, latest), 'stopped before it finished');
  assert.equal(w.historyStatus(latest, latest), 'filling');
  assert.equal(w.historyStatus(latest, latest, stalled), 'stopped before it finished');
  assert.equal(w.historyStatus({ spec_version: 2, status: 'ready_with_warnings' }, latest, stalled), 'ready_with_warnings');
});
