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

test('only an output that was built and still works can be rebuilt, and only once the MVP is ready', async () => {
  const w = await load();
  const latest = {
    status: 'ready_with_warnings',
    spec_json: { outputs: { dashboard: true, genie_space: true, app: true, alert: false } },
    asset_status: {
      dashboard: { state: 'ready' },
      genie_space: { state: 'failed', error: 'space create 403' },
      app: { state: 'ready', health: 'running' },
      alert: { state: 'ready' },
    },
  };
  assert.deepEqual(w.rebuildableOutputs(latest).map((o) => o.id), ['dashboard', 'app'],
    'a failed output belongs to the retries and an unticked one is not rebuilt');
  assert.deepEqual(w.rebuildableOutputs({ ...latest, status: 'ready' }).map((o) => o.id), ['dashboard', 'app']);
  for (const status of ['queued', 'filling', 'building_outputs', 'failed']) {
    assert.deepEqual(w.rebuildableOutputs({ ...latest, status }), [], status);
  }
  assert.deepEqual(w.rebuildableOutputs({ ...latest, asset_status: { app: { state: 'unmanaged' }, dashboard: { state: 'deleted' } } }), []);
  assert.deepEqual(w.rebuildableOutputs(null), []);
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

test('the Delivery step accepts an alert on its own and blocks one nobody would receive', async () => {
  const w = await load();
  const base = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  const only = (outputs) => ({ ...base, outputs: { ...base.outputs, dashboard: false, ...outputs } });
  assert.deepEqual(w.stepErrors('delivery', only({ alert: true, alert_recipients: ['a@example.com'] })), []);
  assert.deepEqual(w.stepErrors('delivery', only({ alert: true, alert_destinations: [{ id: '1234abcd-ef' }] })), []);
  assert.deepEqual(w.stepErrors('delivery', only({})), ['pick at least one way to use it']);
  assert.ok(w.stepErrors('delivery', only({ alert: true })).includes('an alert needs at least one recipient email or notification destination'));
  assert.ok(w.stepErrors('delivery', only({ alert: true, alert_recipients: ['nope'] })).some((e) => e.includes('not an email address: nope')));
  assert.ok(w.stepErrors('delivery', only({ alert: true, alert_recipients: ['a@example.com'], alert_threshold: '-1' }))
    .includes('the alert threshold must be a number of rows, 0 or more'));
  assert.deepEqual(w.stepErrors('delivery', only({ alert: true, alert_recipients: ['a@example.com'], alert_threshold: '' })), []);
  assert.deepEqual(w.sectionErrors('use_it', only({ alert: true })), [], 'the tile choice itself is fine; the alert details are their own section');
  assert.deepEqual(w.sectionErrors('alert', only({ alert: false, alert_recipients: ['nope'] })), [], 'an alert that is off is never checked');
});

test('a baseline alert fires only on a rise or a fall, like the agent checks', async () => {
  const w = await load();
  const base = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  const alert = (outputs) => ({ ...base, outputs: { ...base.outputs, alert: true, alert_recipients: ['a@example.com'], ...outputs } });
  assert.equal(base.outputs.alert_threshold_basis, 'fixed');
  for (const op of ['>=', '>', '<=', '<']) {
    assert.deepEqual(w.sectionErrors('alert', alert({ alert_threshold_basis: 'baseline', alert_operator: op })), [], op);
  }
  for (const op of ['=', '!=']) {
    assert.deepEqual(w.sectionErrors('alert', alert({ alert_threshold_basis: 'baseline', alert_operator: op })),
      ['compared with earlier runs, the alert fires on a rise or a fall, so pick one of >= > <= <'], op);
    assert.deepEqual(w.sectionErrors('alert', alert({ alert_threshold_basis: 'fixed', alert_operator: op })), [], `fixed ${op}`);
    assert.equal(w.baselineOperatorOk(op), false, op);
  }
  assert.equal(w.baselineOperatorOk(''), true);
  assert.equal(w.baselineOperatorOk('constructor'), false);
});

test('each Full MVP step runs the checks of every section it shows, and only those', async () => {
  const w = await load();
  assert.deepEqual(w.IMPLEMENT_STEPS.map((s) => [s.id, s.label]), [['choose', 'Choose'], ['data', 'Data'], ['results', 'Results'], ['delivery', 'Delivery']]);
  assert.deepEqual(w.APP_STEPS.map((s) => [s.id, s.label]), [['app_access', 'App access'], ['app_look', 'App look']]);
  const shown = [...w.IMPLEMENT_STEPS, ...w.APP_STEPS].flatMap((s) => s.sections);
  assert.deepEqual([...shown].sort(), ['alert', 'app_access', 'app_look', 'app_owners', 'configure', 'data', 'holdout', 'results', 'schedule', 'use_case', 'use_it']);
  for (const s of [...w.IMPLEMENT_STEPS, ...w.APP_STEPS]) assert.ok(s.advanced.every((a) => s.sections.includes(a)), s.id);
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: '', inspireDatabase: 'main.inspire' });
  const bad = { ...spec, use_case: { ...spec.use_case, decision_owner: '' }, schedule: { ...spec.schedule, enabled: true, cron: '0 0 25 * * ?' },
    config: { ...spec.config, result_table: 'main.inspire' },
    outputs: { ...spec.outputs, dashboard: false, app: true, app_name: 'X', alert: true } };
  assert.deepEqual(w.stepErrors('data', bad), ['name the decision owner', 'pick a SQL warehouse']);
  assert.deepEqual(w.stepErrors('results', bad), ['pick a catalog and a schema, and name the result table']);
  assert.deepEqual(w.stepErrors('delivery', bad), [
    'app name must be 3-30 lowercase letters, digits and dashes',
    w.GENIE_FOR_APP_NOTE,
    'an alert needs at least one recipient email or notification destination',
    "the cron is not valid: the hour value '25' is not 0 to 23",
  ]);
  assert.deepEqual(w.advancedErrors('delivery', bad), [
    'an alert needs at least one recipient email or notification destination',
    "the cron is not valid: the hour value '25' is not 0 to 23",
  ], 'the App name lives on the main view, so it never opens Advanced');
  assert.deepEqual(w.advancedErrors('data', bad), w.stepErrors('data', bad));
  assert.deepEqual(w.advancedErrors('results', bad), [], 'the result table lives on its own step, never under Advanced');
  assert.deepEqual(w.stepErrors('app_access', bad), ['choose who the App signs people in as: each person (per-user) or its own service principal']);
  assert.deepEqual(w.stepErrors('app_access', { ...bad, outputs: { ...bad.outputs, app_access: 'sp' } }), []);
  assert.deepEqual(w.stepErrors('app_look', bad), [], 'the look is checked only against the looks the App shell offers, once they load');
  const shell = { styles: ['a', 'b', 'c'], layouts: ['sidebar', 'tabs', 'home'], palettes: ['default', 'mono'], themes: ['light', 'dark'] };
  assert.deepEqual(w.stepErrors('app_look', bad, { appLook: shell }), []);
  assert.deepEqual(w.stepErrors('app_look', w.withAppLook(bad, 'palette', 'neon'), { appLook: shell }), ["pick one of the App's palettes"]);
  assert.throws(() => w.stepErrors('use_it', bad), /unknown wizard step 'use_it'/);
  assert.throws(() => w.advancedErrors('review', bad), /unknown wizard step 'review'/);
  assert.throws(() => w.stepErrors('app_access', { ...bad, outputs: { ...bad.outputs, app: false } }), /unknown wizard step 'app_access'/,
    'without an App the wizard has no App steps');
  assert.deepEqual(w.stepErrors('choose', bad), []);
});

test('the App name is the use case name cut at a word inside the 30-character limit, else the use case id', async () => {
  const w = await load();
  const cases = [
    ['Predict churn', 'N01-U01', 'predict-churn'],
    ['Recommend Next-Best Products to Lift Basket Size', 'N05-U01', 'recommend-next-best-products'],
    ['Forecast demand by zone to reduce idle time', 'N02-U03', 'forecast-demand-by-zone-to'],
    ['Supercalifragilisticexpialidocious forecasting', 'N01-U02', 'supercalifragilisticexpialidoc'],
    ['Café Ünïcode churn', 'N01-U03', 'cafe-unicode-churn'],
    ['360 customer view', 'N01-U04', 'uc-360-customer-view'],
    ['  --Churn!!  risk--  ', 'N01-U05', 'churn-risk'],
    ['توقع فقدان العملاء', 'N07-U02', 'n07-u02'],
    ['AI', 'N03-U01', 'n03-u01'],
    ['', 'N03-U02', 'n03-u02'],
    ['', '', ''],
  ];
  for (const [name, id, want] of cases) {
    const got = w.appNameOf(name, id);
    assert.equal(got, want, name);
    if (got) {
      assert.match(got, w.APP_NAME_RE, name);
      assert.ok(got.length <= 30, name);
      assert.ok(!got.endsWith('-'), name);
    }
  }
  const spec = w.defaultSpecFromUseCase({ ...UC, Name: 'Recommend Next-Best Products to Lift Basket Size' }, { warehouseId: 'wh1', inspireDatabase: 'main.inspire', owner: 'amr@example.com' });
  assert.equal(spec.outputs.app_name, 'recommend-next-best-products');
  assert.equal(w.defaultSpecFromUseCase({ ...UC, short_name: 'Churn desk' }).outputs.app_name, 'churn-desk', 'a short name wins over the full name');
  const withApp = { ...spec, outputs: { ...spec.outputs, app: true, app_access: 'sp' } };
  assert.deepEqual(backend.validateImplementSpec(withApp).errors, []);
  assert.equal(backend.validateImplementSpec(withApp).spec.outputs.app_name, 'recommend-next-best-products');
});

test('a taken App name suggests the next free-looking name and stays inside the limit', async () => {
  const w = await load();
  assert.equal(w.nextAppName('predict-churn'), 'predict-churn-2');
  assert.equal(w.nextAppName('predict-churn-2'), 'predict-churn-3');
  assert.equal(w.nextAppName('predict-churn-9'), 'predict-churn-10');
  assert.equal(w.nextAppName('n07-u02'), 'n07-u02-2', 'an id ending in letters and digits is not a counter');
  assert.equal(w.nextAppName('uc-360'), 'uc-360-2', 'a three-digit number is part of the name');
  assert.equal(w.nextAppName('predict-churn-1'), 'predict-churn-1-2', 'a -1 is part of the name, not a counter');
  assert.equal(w.nextAppName('recommend-next-best-products'), 'recommend-next-best-products-2');
  assert.equal(w.nextAppName('supercalifragilisticexpialidoc'), 'supercalifragilisticexpialid-2');
  assert.equal(w.nextAppName('forecast-demand-by-zone-to-red'), 'forecast-demand-by-zone-to-2');
  for (const name of ['predict-churn', 'recommend-next-best-products', 'supercalifragilisticexpialidoc', 'forecast-demand-by-zone-to-red', 'n07-u02']) {
    let next = name;
    for (let i = 0; i < 12; i += 1) {
      next = w.nextAppName(next);
      assert.match(next, w.APP_NAME_RE, next);
      assert.notEqual(next, name);
    }
  }
});

test('Keep it fresh maps Off, Daily and Weekly onto the schedule, and shows Custom for any other cron', async () => {
  const w = await load();
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire', owner: 'amr@example.com' });
  assert.equal(w.freshnessOf(spec.schedule), 'off', 'a new use case starts Off');
  const daily = w.withFreshness(spec, 'daily');
  assert.deepEqual([daily.schedule.enabled, daily.schedule.cron], [true, '0 0 6 * * ?']);
  assert.equal(w.freshnessOf(daily.schedule), 'daily');
  const weekly = w.withFreshness(daily, 'weekly');
  assert.deepEqual([weekly.schedule.enabled, weekly.schedule.cron], [true, '0 0 6 ? * MON']);
  assert.equal(w.freshnessOf(weekly.schedule), 'weekly');
  const off = w.withFreshness(weekly, 'off');
  assert.deepEqual([off.schedule.enabled, off.schedule.cron], [false, '0 0 6 ? * MON'], 'Off keeps the cron for the next time it is turned on');
  assert.equal(w.freshnessOf(off.schedule), 'off');
  assert.equal(w.freshnessOf({ enabled: true, cron: '0 30 2 1 * ?' }), 'custom');
  assert.equal(w.freshnessOf({ enabled: true, cron: ' 0 0 6 * * ? ' }), 'daily');
  assert.equal(w.freshnessOf(null), 'off');
  for (const option of w.FRESHNESS_OPTIONS.filter((o) => o.cron)) {
    assert.equal(w.cronProblem(option.cron), '', option.id);
    assert.deepEqual(w.stepErrors('delivery', w.withFreshness(spec, option.id)), [], option.id);
    assert.deepEqual(backend.validateImplementSpec(w.withFreshness(spec, option.id)).errors, [], option.id);
  }
  assert.equal(spec.schedule.enabled, false, 'withFreshness never mutates the spec it was given');
  assert.throws(() => w.withFreshness(spec, 'hourly'), /unknown freshness 'hourly'/);
  assert.throws(() => w.withFreshness(spec, 'custom'), /unknown freshness 'custom'/);
});

test('an edit offers the use case App name in place of the old id default unless an App was built under it, and keeps a typed name', async () => {
  const w = await load();
  const fallback = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire', owner: 'amr@example.com' });
  const stored = backend.validateImplementSpec(fallback).spec;
  const saved = (outputs) => ({ spec_version: 2, spec_json: { ...stored, outputs: { ...stored.outputs, ...outputs } } });
  assert.equal(stored.outputs.app_name, '', 'the backend stores no App name when the App is off');
  const noApp = w.specFromLatest({ spec_version: 2, spec_json: stored }, fallback);
  assert.equal(noApp.outputs.app_name, 'predict-churn');
  const legacy = w.specFromLatest(saved({ app_name: 'n01-u01' }), fallback);
  assert.equal(legacy.outputs.app_name, 'predict-churn', 'a name kept from an App that was never built is replaced');
  const tickedNeverBuilt = w.specFromLatest(saved({ app: true, app_name: 'n01-u01' }), fallback, {});
  assert.equal(tickedNeverBuilt.outputs.app_name, 'predict-churn', 'the old wizard ticked the App under the id default, and the run failed before building it');
  assert.equal(tickedNeverBuilt.outputs.app, true, 'the App stays ticked; only its name changes');
  const builtUnderId = w.specFromLatest(saved({ app: true, app_name: 'n01-u01' }), fallback, { app: 'n01-u01' });
  assert.equal(builtUnderId.outputs.app_name, 'n01-u01', 'renaming a built App would build a second one');
  const typed = w.specFromLatest(saved({ app: true, app_name: 'churn-desk' }), fallback, {});
  assert.equal(typed.outputs.app_name, 'churn-desk', 'a name the user typed is theirs');
  const live = w.specFromLatest({ spec_version: 3, spec_json: { ...stored, outputs: { ...stored.outputs, app: true, app_name: 'n01-u01-churn' } } }, fallback, { app: 'n01-u01-churn' });
  assert.equal(live.outputs.app_name, 'n01-u01-churn', 'renaming a live App would build a second one');
  assert.equal(live.outputs.app, true);
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
  assert.deepEqual(w.sectionErrors('data', spec), []);
  const clash = w.setFilterValues(spec, 'main.s.web', 'region', 'not in', ['EU']);
  assert.deepEqual(w.sectionErrors('data', clash), ['main.s.web.region both keeps and excludes EU']);
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
    uncounted: ['the filters on main.s.web'],
  });
  const elsewhere = { ...spec, data: { ...spec.data, column_roles: { event_date: 'main.s.web.visit_date' } } };
  assert.deepEqual(w.readinessScope(elsewhere, ROW).window, {});
  assert.deepEqual(w.readinessScope(elsewhere, ROW).uncounted, ['the date window on main.s.web', 'the filters on main.s.web']);
  const unmapped = { ...spec, data: { ...spec.data, column_roles: {}, filters: [] } };
  assert.deepEqual(w.readinessScope(unmapped, ROW).uncounted, ['the date window, which has no event date column']);
  const open = { ...spec, data: { ...spec.data, column_roles: { event_date: 'main.s.web.visit_date' }, filters: [], window: { start: '', end: '' } } };
  assert.deepEqual(w.readinessScope(open, ROW).uncounted, [], 'an empty window is not left out of anything');
});

test('a use case is named by its card first, then its tracking row, then any plain name', async () => {
  const w = await load();
  assert.equal(w.caseNameOf({ Name: 'Predict churn', use_case: 'Keep customers who would leave' }), 'Predict churn');
  assert.equal(w.caseNameOf({ use_case: ' Keep customers who would leave ' }), 'Keep customers who would leave');
  assert.equal(w.caseNameOf({ name: 'churn' }), 'churn');
  assert.equal(w.caseNameOf({}), '');
  assert.equal(w.caseNameOf(null), '');
  assert.equal(w.defaultSpecFromUseCase({ id: 'N01-U01', Name: 'Predict churn', use_case: 'Keep customers' }).use_case_name, 'Predict churn');
});

test('the row count says what it left out, and an empty scope names what to widen', async () => {
  const w = await load();
  const scope = (over) => ({ table: 'main.s.orders', columns: [], filters: [], window: {}, uncounted: [], ...over });
  assert.equal(w.readinessText({ skipped: true, row_count: null }, scope()), '');
  assert.equal(w.readinessText(null, scope()), '');
  assert.equal(w.readinessText({ skipped: false, row_count: 2879789 }, scope()),
    'Inspire found 2,879,789 rows to work with in main.s.orders.');
  assert.equal(w.readinessText({ skipped: false, row_count: 2879789 }, scope({ uncounted: ['the date window on main.s.dates'] })),
    'Inspire found 2,879,789 rows to work with in main.s.orders. This count leaves out the date window on main.s.dates; the preview run applies it.');
  assert.equal(w.readinessText({ skipped: false, row_count: 5 }, scope({ uncounted: ['the date window on main.s.dates', 'the filters on main.s.web'] })),
    'Inspire found 5 rows to work with in main.s.orders. This count leaves out the date window on main.s.dates and the filters on main.s.web; the preview run applies them.');

  const window = { column: 'order_date', start: '2026-10-26', end: '2026-10-28' };
  const filters = [{ table: 'main.s.orders', column: 'channel', op: 'in', values: ['web'] }];
  assert.deepEqual(w.scopeNarrowing(scope()), []);
  assert.deepEqual(w.scopeNarrowing(scope({ window: { column: 'order_date', start: '', end: '' } })), [], 'a mapped column with no dates narrows nothing');
  assert.deepEqual(w.scopeNarrowing(scope({ window, filters })), ['window', 'filters']);
  assert.equal(w.emptyScopeError(scope()), 'No rows to work with: main.s.orders is empty. Change it to a table with rows.');
  assert.equal(w.emptyScopeError(scope({ window })),
    'No rows to work with: main.s.orders has no rows inside the date window you picked. Widen or clear it under Advanced settings.');
  assert.equal(w.emptyScopeError(scope({ filters })),
    'No rows to work with: main.s.orders has no rows that pass the filters you picked. Widen or clear them under Advanced settings.');
  assert.equal(w.emptyScopeError(scope({ window, filters })),
    'No rows to work with: main.s.orders has no rows inside the date window that pass the filters you picked. Widen or clear them under Advanced settings.');
});

test('plan lines say what the edit builds, refreshes, deletes and keeps', async () => {
  const w = await load();
  assert.deepEqual(w.planLines(null), []);
  assert.deepEqual(w.planLines({ classes: ['outputs'], refill: false, build: ['genie_space', 'alert'], refresh: ['dashboard'],
    delete: ['app'], keep_unmanaged: [], schedule: false }), [
    'Changes: outputs',
    'The built notebook is kept as it is',
    'Builds: Genie Agent, Alert',
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
  assert.deepEqual(w.sectionErrors('configure', spec, { widgets }), []);
  const bad = JSON.parse(JSON.stringify(spec));
  bad.config.widgets = { act_now_share: '1.2', note: 'anything' };
  bad.config.profiles.training.window_days = '30.5';
  bad.config.profiles.retrain.drift_threshold = '2';
  assert.deepEqual(w.sectionErrors('configure', bad, { widgets }), [
    "act_now_share is '1.2'; allowed: 0 to 1",
    'act_now_share + review_share is 1.4; allowed: at most 1',
    "training window days is '30.5'; allowed: whole number, at least 1",
  ]);
  assert.deepEqual(w.sectionErrors('configure', bad, { widgets, trainsModel: false }), [
    "act_now_share is '1.2'; allowed: 0 to 1",
    'act_now_share + review_share is 1.4; allowed: at most 1',
  ]);
  bad.schedule.cron = '0 0 25 * * ?';
  assert.deepEqual(w.sectionErrors('schedule', bad), [
    "the cron is not valid: the hour value '25' is not 0 to 23",
    "retrain drift threshold is '2'; allowed: above 0, at most 1",
  ]);
  assert.deepEqual(w.sectionErrors('schedule', bad, { trainsModel: false }), ["the cron is not valid: the hour value '25' is not 0 to 23"]);
  assert.deepEqual(w.sectionErrors('schedule', spec), []);
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
  assert.equal(w.profileEstimate({ ...base, table: 'main.s.events', windowDays: '30' }).text,
    'at most 500 rows of main.s.events (no date range was profiled, so this is the whole table)');
  assert.equal(w.profileEstimate({ ...base, table: 'main.s.events', dateColumn: '', windowDays: '30' }).text,
    "at most 500 rows of main.s.events (no event date column is set here, so this is the whole table; the MVP applies the "
    + "window to the instruction's date)");
});

test('every permission check the preflight can return has a label', async () => {
  const w = await load();
  for (const key of ['warehouse', 'output', 'result_grant', 'app_name', 'apps', 'genie_spaces', 'alerts']) assert.ok(w.PREFLIGHT_LABELS[key], key);
  assert.deepEqual(Object.keys(w.PROFILE_FIELDS).sort(), ['full_load.window_days', 'preview.entity_cap', 'retrain.drift_threshold',
    'retrain.every_runs', 'training.sample_entities', 'training.window_days']);
});

test('the Implement page shows lost tables from a refused re-run first, else only from a failed latest version that recorded them', async () => {
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

test('the business Hub App is inspire-hub- and the business name, at most 30 characters, and a fresh App of a known business takes that name', async () => {
  const w = await load();
  assert.equal(w.hubAppName('TPCDS Retail V130 Ship'), 'inspire-hub-tpcds-retail-v130');
  assert.equal(w.hubAppName('Acme'), 'inspire-hub-acme');
  assert.equal(w.hubAppName('  Société Générale & Co  '), 'inspire-hub-societe-generale');
  assert.equal(w.hubAppName('Supercalifragilisticexpialidocious'), 'inspire-hub-supercalifragilist');
  assert.equal(w.hubAppName('A'), 'inspire-hub-a');
  assert.equal(w.hubAppName(''), '');
  assert.equal(w.hubAppName('&&&'), '');
  assert.equal(w.hubAppName(undefined), '');
  for (const biz of ['TPCDS Retail V130 Ship', 'Acme', 'Supercalifragilisticexpialidocious', 'x'.repeat(80), 'a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p']) {
    const name = w.hubAppName(biz);
    assert.ok(w.APP_NAME_RE.test(name) && name.length <= 30 && name.startsWith('inspire-hub-'), `${biz}: ${name}`);
  }
  assert.equal(w.defaultSpecFromUseCase(UC, { businessName: 'Acme' }).outputs.app_name, 'inspire-hub-acme');
  assert.equal(w.defaultSpecFromUseCase(UC).outputs.app_name, 'predict-churn', 'with no business name the App keeps the use case name');
  assert.equal(w.defaultSpecFromUseCase(UC, { businessName: '***' }).outputs.app_name, 'predict-churn');
});

test('a use case goes into its business Hub App by default only when that Hub exists, can take it, and nothing else was chosen', async () => {
  const w = await load();
  const hub = { id: 'inspire-hub-acme', name: 'inspire-hub-acme', access: 'sp', per_user_block: 'inspire-hub-acme signs everyone in with its own service principal', look: { palette: 'ocean' } };
  const legacy = { id: 'ops-desk', name: 'ops-desk', access: 'sp' };
  const on = w.withOutput(w.defaultSpecFromUseCase(UC, { businessName: 'Acme' }), 'app', true);
  const merged = w.withHubDefault(on, { app: [legacy, hub] }, 'Acme', {});
  assert.deepEqual([merged.outputs.merge.app, merged.outputs.app_name, merged.outputs.app_look.palette], ['inspire-hub-acme', 'inspire-hub-acme', 'ocean']);
  assert.equal(w.withHubDefault(on, { app: [legacy] }, 'Acme', {}), on, 'an App Inspire built for one use case is not the Hub');
  assert.equal(w.withHubDefault(on, { app: [hub] }, 'Other Co', {}), on, 'another business has another Hub');
  assert.equal(w.withHubDefault(on, null, 'Acme', {}), on);
  assert.equal(w.withHubDefault(on, { app: [hub] }, 'Acme', { app: 'predict-churn' }), on, 'a use case with its own App keeps it');
  const off = w.defaultSpecFromUseCase(UC, { businessName: 'Acme' });
  assert.equal(w.withHubDefault(off, { app: [hub] }, 'Acme', {}), off, 'no App asked, nothing joins');
  const picked = w.withMergeTarget(on, 'app', legacy);
  assert.equal(w.withHubDefault(picked, { app: [hub] }, 'Acme', {}), picked, 'a choice already made stays');
  const perUser = w.withAppAccess(on, 'user');
  assert.equal(w.withHubDefault(perUser, { app: [hub] }, 'Acme', {}), perUser, 'a per-user use case cannot join a service-principal Hub');
});

test('an output that no longer exists is not held, so the use case can join the Hub, and the wizard says which one is gone', async () => {
  const w = await load();
  assert.deepEqual(w.heldAssets({ dashboard: 'd1', genie_space: 'g1', app: 'old-desk', alert: 'a1' }, ['app', 'dashboard']), { genie_space: 'g1', alert: 'a1' });
  assert.deepEqual(w.heldAssets({ app: 'old-desk' }, undefined), { app: 'old-desk' });
  assert.deepEqual(w.heldAssets(undefined, ['app']), {});
  assert.equal(w.goneAssetText('App', 'old-desk'), 'The App this use case had, old-desk, no longer exists, so Genie can add the use case to one Inspire built or create a new one.');
  const hub = { id: 'inspire-hub-acme', name: 'inspire-hub-acme', access: 'sp' };
  const on = w.withOutput(w.defaultSpecFromUseCase(UC, { businessName: 'Acme' }), 'app', true);
  const assets = { app: 'old-desk' };
  assert.equal(w.withHubDefault(on, { app: [hub] }, 'Acme', w.heldAssets(assets, [])).outputs.merge.app, '', 'a live App of its own stays');
  assert.equal(w.withHubDefault(on, { app: [hub] }, 'Acme', w.heldAssets(assets, ['app'])).outputs.merge.app, 'inspire-hub-acme', 'a gone App of its own lets it join the Hub');
});

test('a rebuild that inherits a swap to a gone table goes back to the use case\'s own table, clears what pointed at the gone one, and says so', async () => {
  const w = await load();
  const uc = { primary_table: 'main.s.orders', tables_involved: 'main.s.orders,main.s.returns,main.s.items' };
  const spec = w.defaultSpecFromUseCase({ ...UC, ...uc });
  const inherited = { ...spec, data: { ...spec.data,
    tables: { 'MAIN.S.RETURNS': 'main.s.returns_old', 'main.s.items': 'main.s.items_v2', 'main.s.orders': 'main.s.orders_v9' },
    column_roles: { event_date: 'main.s.returns_old.returned_on', segment: 'main.s.items_v2.category' },
    filters: [{ table: 'main.s.returns_old', column: 'reason', op: 'in', values: ['damaged'] }, { table: 'main.s.items_v2', column: 'kind', op: 'in', values: ['a'] }] } };
  const lost = [{ table: 'main.s.returns_old', reason: 'not found' }, { table: 'main.s.orders_v9', reason: 'not found' }, { table: 'main.s.orders', reason: 'no read access' }];
  const { spec: next, reverted } = w.revertLostSwaps(inherited, uc, lost);
  assert.deepEqual(next.data.tables, { 'main.s.items': 'main.s.items_v2', 'main.s.orders': 'main.s.orders_v9' },
    'the gone swap goes back; a live swap stays; a gone swap whose own table is gone too stays for the person to fix');
  assert.deepEqual(next.data.column_roles, { segment: 'main.s.items_v2.category' });
  assert.deepEqual(next.data.filters, [{ table: 'main.s.items_v2', column: 'kind', op: 'in', values: ['a'] }]);
  assert.deepEqual(next.data.removed_tables, []);
  assert.deepEqual(reverted, [{ original: 'main.s.returns', chosen: 'main.s.returns_old', reason: 'not found', cleared: { roles: ['event_date'], filters: 1 } }]);
  assert.equal(w.revertedSwapsText(reverted), 'main.s.returns_old is missing or not readable (not found), so this version goes back to main.s.returns, '
    + 'the table Inspire picked, and clears its column roles (event date) and 1 filter(s) on it. Use Change to pick another table.');
  assert.equal(w.revertedSwapsText([{ original: 'a.b.c', chosen: 'a.b.d', reason: 'no read access', cleared: { roles: [], filters: 0 } }]),
    'a.b.d is missing or not readable (no read access), so this version goes back to a.b.c, the table Inspire picked. Use Change to pick another table.');
  assert.equal(w.revertedSwapsText([]), '');
  const removedToo = { ...inherited, data: { ...inherited.data, removed_tables: ['main.s.returns'] } };
  assert.deepEqual(w.revertLostSwaps(removedToo, uc, lost).reverted, [], 'a removed table is not brought back');
  assert.equal(w.revertLostSwaps(inherited, uc, []).spec, inherited, 'with nothing lost the spec is untouched');
  assert.equal(w.revertLostSwaps(inherited, uc, undefined).spec, inherited);
  assert.equal(w.clearedText({ roles: ['event_date', 'segment'], filters: 2 }), 'its column roles (event date, segment) and 2 filter(s) on it');
  assert.equal(w.clearedText({ roles: [], filters: 0 }), '');
});

test('Edit opens the wizard on the step it was asked for, and on Choose otherwise', async () => {
  const w = await load();
  assert.equal(w.initialStepIndex({ step: 'data' }), 1);
  assert.equal(w.initialStepIndex({ step: 'results' }), 2);
  assert.equal(w.initialStepIndex({ step: 'delivery' }), 3);
  for (const section of ['use_case', 'configure']) assert.equal(w.initialStepIndex({ step: section }), 1, section);
  for (const section of ['use_it', 'alert', 'schedule', 'review']) assert.equal(w.initialStepIndex({ step: section }), 3, section);
  const withApp = { outputs: { app: true } };
  assert.equal(w.initialStepIndex({ step: 'review' }, 'mvp', withApp), 5, 'review lands on the last step, App look when the App is ticked');
  assert.equal(w.initialStepIndex({ step: 'app_access' }, 'mvp', withApp), 4);
  assert.equal(w.initialStepIndex({ step: 'app_access' }), 0, 'no App, no App access step');
  assert.equal(w.initialStepIndex({ step: 'nope' }), 0);
  assert.equal(w.initialStepIndex(null), 0);
  assert.equal(w.initialStepIndex({ step: 'choose' }), 0);
  assert.equal(w.initialStepIndex({ step: 'notebook' }, 'notebook'), 2);
  assert.equal(w.initialStepIndex({ step: 'review' }, 'notebook'), 2);
  assert.equal(w.initialStepIndex({ step: 'delivery' }, 'notebook'), 0);
});

test('Full MVP is the first mode, and Notebook only swaps Delivery for a Notebook step with nothing to check', async () => {
  const w = await load();
  assert.deepEqual(w.IMPLEMENT_MODES.map((m) => [m.id, m.label]), [['mvp', 'Full MVP'], ['notebook', 'Notebook only']]);
  assert.equal(w.wizardSteps('mvp'), w.IMPLEMENT_STEPS);
  assert.deepEqual(w.wizardSteps('notebook').map((s) => [s.id, s.label]), [['choose', 'Choose'], ['data', 'Data'], ['notebook', 'Notebook']]);
  assert.throws(() => w.wizardSteps('both'), /unknown implement mode 'both'/);
  assert.throws(() => w.wizardSteps(undefined), /unknown implement mode 'undefined'/);
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: '', inspireDatabase: 'main.inspire' });
  const bad = { ...spec, use_case: { ...spec.use_case, decision_owner: '' } };
  assert.ok(w.stepErrors('data', bad).length > 0, 'Full MVP checks the Data step');
  for (const id of ['choose', 'data', 'notebook']) {
    assert.deepEqual(w.stepErrors(id, bad, {}, 'notebook'), [], id);
    assert.deepEqual(w.advancedErrors(id, bad, {}, 'notebook'), [], id);
  }
  assert.throws(() => w.stepErrors('delivery', bad, {}, 'notebook'), /unknown wizard step 'delivery'/);
  assert.throws(() => w.stepErrors('notebook', bad), /unknown wizard step 'notebook'/);
});

const RUN = (state, extra = {}) => ({ run_id: 7, job_id: 3, state, url: 'https://w/#job/3/run/7', ...extra });

test('a use case notebook reads ready, running, failed or requested from its flags and the session notebook run', async () => {
  const w = await load();
  for (const has of ['Y', 'Yes', 'yes', ' y ', 'TRUE']) {
    assert.equal(w.notebookStatus({ has_genie_code: has, generate_genie_code_instruction: 'Yes' }, RUN('running')).label, 'Notebook ready', has);
  }
  for (const flag of ['No', 'N', '', null, undefined, 'maybe']) {
    assert.equal(w.notebookStatus({ has_genie_code: 'N', generate_genie_code_instruction: flag }, RUN('running')), null, String(flag));
  }
  const asked = { has_genie_code: 'N', generate_genie_code_instruction: 'Yes' };
  assert.deepEqual(w.notebookStatus(asked, RUN('running')), { state: 'running', label: 'Notebook running', tone: 'busy', reason: '', url: 'https://w/#job/3/run/7' });
  const failed = w.notebookStatus(asked, RUN('failed', { result_state: 'FAILED', message: 'Cell 4 raised' }));
  assert.equal(failed.label, 'Notebook failed');
  assert.equal(failed.reason, 'The notebook run ended FAILED: Cell 4 raised.');
  assert.equal(w.notebookStatus(asked, RUN('failed', { life_cycle_state: 'INTERNAL_ERROR' })).reason, 'The notebook run ended INTERNAL_ERROR.');
  assert.match(w.notebookStatus(asked, RUN('succeeded')).reason, /finished without writing this notebook/);
  assert.equal(w.notebookStatus(asked, RUN('succeeded')).state, 'failed');
  const requested = w.notebookStatus(asked, null);
  assert.equal(requested.state, 'requested');
  assert.equal(requested.url, '');
  assert.equal(w.notebookStatus({}, null), null);
  assert.equal(w.notebookStatus(null, RUN('running')), null);
});

test('the MVP state outranks the notebook, and a stopped MVP run counts as failed', async () => {
  const w = await load();
  const ready = { state: 'ready', label: 'Notebook ready', tone: 'success' };
  const cases = [
    [{ status: 'ready' }, ready, 'ready', 'MVP ready'],
    [{ status: 'ready_with_warnings' }, null, 'ready', 'MVP ready with warnings'],
    [{ status: 'failed' }, ready, 'failed', 'MVP failed'],
    [{ status: 'filling', stalled: { reason: 'run ended' } }, null, 'failed', 'MVP stopped'],
    [{ status: 'previewing', stalled: null }, ready, 'in_progress', 'MVP running'],
    [{ status: 'queued' }, null, 'in_progress', 'MVP running'],
    [{ status: 'building_outputs' }, null, 'in_progress', 'MVP running'],
    [{ status: 'archived_v2' }, null, 'in_progress', 'MVP archived v2'],
    [null, ready, 'ready', 'Notebook ready'],
    [null, { state: 'running', label: 'Notebook running', tone: 'busy' }, 'in_progress', 'Notebook running'],
    [null, { state: 'failed', label: 'Notebook failed', tone: 'error' }, 'failed', 'Notebook failed'],
    [null, { state: 'requested', label: 'Notebook requested', tone: 'idle' }, 'not_started', 'Notebook requested'],
    [{ status: '' }, null, 'not_started', ''],
    [null, null, 'not_started', ''],
  ];
  for (const [latest, notebook, group, label] of cases) {
    const got = w.implementState(latest, notebook);
    assert.deepEqual([got.group, got.label], [group, label], JSON.stringify([latest, notebook]));
  }
  assert.equal(w.implementState({ status: 'ready' }, ready).kind, 'mvp');
  assert.equal(w.implementState(null, ready).kind, 'notebook');
  assert.equal(w.implementState(null, null).kind, 'none');
});

test('the Implement page groups every use case in a fixed order, keeps MVPs of unlisted use cases, and searches id, name and domain', async () => {
  const w = await load();
  const useCases = [
    { id: 'N01-U01', Name: 'Predict churn', _domain: 'Retention' },
    { id: 'N01-U02', Name: 'Basket growth', _domain: 'Sales', has_genie_code: 'Y' },
    { id: 'N02-U01', Name: 'Stock outs', _domain: 'Supply', generate_genie_code_instruction: 'Yes', has_genie_code: 'N' },
    { id: 'N02-U02', Name: 'Fraud flags', _domain: 'Risk' },
    { No: '', Name: 'No id at all' },
  ];
  const latest = [
    { use_case_id: 'N01-U01', status: 'filling', stalled: null },
    { use_case_id: 'N02-U02', status: 'failed' },
    { use_case_id: 'N09-U09', use_case_name: 'Removed from the catalog', status: 'ready' },
  ];
  const groups = w.implementGroups(useCases, latest, RUN('running'));
  assert.deepEqual(groups.map((g) => g.label), ['In progress', 'Ready', 'Failed', 'Not started']);
  assert.deepEqual(groups.map((g) => g.items.map((i) => i.id)), [['N01-U01', 'N02-U01'], ['N01-U02', 'N09-U09'], ['N02-U02'], []]);
  assert.equal(groups[1].items[1].name, 'Removed from the catalog');
  assert.equal(groups[0].items[1].state.label, 'Notebook running');
  const afterRun = w.implementGroups(useCases, [], RUN('failed', { result_state: 'FAILED' }));
  assert.deepEqual(afterRun.map((g) => g.items.map((i) => i.id)), [[], ['N01-U02'], ['N02-U01'], ['N01-U01', 'N02-U02']]);
  const search = (q) => w.implementGroups(useCases, latest, null, q).flatMap((g) => g.items.map((i) => i.id));
  assert.deepEqual(search('churn'), ['N01-U01']);
  assert.deepEqual(search('  SUPPLY  '), ['N02-U01']);
  assert.deepEqual(search('n02 fraud'), ['N02-U02']);
  assert.deepEqual(search('fraud churn'), []);
  assert.equal(search('').length, 5);
  assert.deepEqual(w.implementGroups(null, undefined, null).map((g) => g.items.length), [0, 0, 0, 0]);
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

test('the run profile reads as the job default when none is chosen', async () => {
  const w = await load();
  assert.equal(w.resultTierOptions, undefined);
  assert.equal(w.runProfileText('preview'), 'preview');
  assert.equal(w.runProfileText(''), 'full (job default)');
});

test('the Implement page gives the reason only for a warning or a failure', async () => {
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

test('a stalled version reads as stopped, frees the Implement page actions, says why, and the History calls older active versions stopped', async () => {
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

test('a notebook run counts as ended when it stops running or a newer finished run replaces it, never on the first read', async () => {
  const w = await load();
  const run = (id, state) => ({ run_id: id, state });
  assert.equal(w.notebookRunEnded(run(1, 'running'), run(1, 'succeeded')), true);
  assert.equal(w.notebookRunEnded(run(1, 'running'), run(1, 'failed')), true);
  assert.equal(w.notebookRunEnded(run(1, 'succeeded'), run(2, 'failed')), true, 'a run that started and ended between two reads');
  assert.equal(w.notebookRunEnded(run(1, 'running'), run(1, 'running')), false);
  assert.equal(w.notebookRunEnded(run(1, 'succeeded'), run(2, 'running')), false);
  assert.equal(w.notebookRunEnded(run(1, 'succeeded'), run(1, 'succeeded')), false);
  assert.equal(w.notebookRunEnded(null, run(1, 'succeeded')), false);
  assert.equal(w.notebookRunEnded(run(1, 'running'), null), false);
  assert.equal(w.notebookRunEnded({ run_id: 7, state: 'succeeded' }, { run_id: '7', state: 'failed' }), false, 'ids compare as text');
});


test('the wizard judges column roles by the rules and cases the agent shares', async () => {
  const w = await load();
  const rules = FIXTURE.role_rules;
  assert.deepEqual(w.ROLE_RULES.keyNameSuffixes, rules.key_name_suffixes);
  assert.deepEqual(w.ROLE_RULES.keyNamePrefixes, rules.key_name_prefixes);
  assert.deepEqual(w.ROLE_RULES.genericKeyNames, rules.generic_key_names);
  assert.deepEqual(w.ROLE_RULES.concatKeySuffixes, rules.concat_key_suffixes);
  assert.deepEqual(w.ROLE_RULES.textNameTokens, rules.text_name_tokens);
  assert.deepEqual(w.ROLE_RULES.personNameTokens, rules.person_name_tokens);
  for (const c of rules.cases) {
    assert.equal(w.isDateKeyColumn(c.column, c.type), c.date_key, `${c.column} date key`);
    assert.equal(w.columnRoleProblem(c.role, c.column, c.type) === '', c.fits, `${c.role} ${c.column}`);
  }
  assert.equal(w.columnRoleProblem('label', 'c_first_name', 'STRING', { trainsModel: false }), '');
});

test('the Data step names each column role that does not fit and leaves unset roles to Inspire', async () => {
  const w = await load();
  const columnsByTable = {
    'samples.tpcds_sf1.web_sales': [{ column_name: 'ws_sold_date_sk', data_type: 'INT' }, { column_name: 'ws_quantity', data_type: 'INT' }],
    'samples.tpcds_sf1.customer': [{ column_name: 'c_first_name', data_type: 'STRING' }, { column_name: 'c_last_review_date', data_type: 'INT' }],
  };
  const guessed = specWith(w, { column_roles: {
    entity_id: 'samples.tpcds_sf1.web_sales.ws_sold_date_sk', event_date: 'samples.tpcds_sf1.customer.c_last_review_date',
    label: 'samples.tpcds_sf1.customer.c_first_name', measure: 'samples.tpcds_sf1.web_sales.ws_quantity' } });
  const errors = w.sectionErrors('data', guessed, { columnsByTable, trainsModel: true });
  assert.deepEqual(errors.filter((e) => /^(entity id|event date|label|measure|segment) samples\./.test(e)), [
    'entity id samples.tpcds_sf1.web_sales.ws_sold_date_sk: a date, a date key or a measure is not the entity the decision acts on',
    'event date samples.tpcds_sf1.customer.c_last_review_date: pick a DATE or TIMESTAMP column, or a date key that joins a date table',
    'label samples.tpcds_sf1.customer.c_first_name: an outcome is a flag, a number or a category, never a date, a key, a name or free text',
  ]);
  const hint = "Reset roles to Inspire's choice, under Advanced settings, sets every role back at once";
  assert.equal(w.RESET_ROLES_LABEL, "Reset roles to Inspire's choice");
  assert.equal(errors.filter((e) => e === hint).length, 1, 'the footer names the one-click reset once, after the role problems');
  assert.ok(errors.indexOf(hint) > errors.findIndex((e) => e.startsWith('label samples.')));
  const unset = specWith(w, { column_roles: {} });
  assert.deepEqual(w.sectionErrors('data', unset, { columnsByTable }).filter((e) => e.includes('samples.')), []);
  assert.ok(!w.sectionErrors('data', unset, { columnsByTable }).includes(hint), 'no role problem, no reset hint');
  const fits = specWith(w, { column_roles: { measure: 'samples.tpcds_sf1.web_sales.ws_quantity' } });
  assert.ok(!w.sectionErrors('data', fits, { columnsByTable, trainsModel: true }).includes(hint), 'a role that fits needs no reset');
  assert.deepEqual(w.defaultSpecFromUseCase(ROW, {}).data.column_roles, {});
  const gone = specWith(w, { column_roles: { measure: 'samples.tpcds_sf1.web_sales.ws_gone' } });
  assert.deepEqual(w.sectionErrors('data', gone, { columnsByTable }).filter((e) => e.includes('ws_gone')),
    ['measure samples.tpcds_sf1.web_sales.ws_gone: samples.tpcds_sf1.web_sales has no column ws_gone']);
});

test('the wizard never fills a column role on its own', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'pages', 'ImplementWizard.jsx'), 'utf8');
  assert.doesNotMatch(source, /guessColumnRole|confirmedRoles|unconfirmedRoles/);
  assert.match(source, /<option value="">Inspire&apos;s choice<\/option>/);
  assert.doesNotMatch(source, /column_roles: roles/);
});
