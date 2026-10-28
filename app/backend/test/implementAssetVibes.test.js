const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const I = require('../lib/inspireImplement');
const { makeApp, listen } = require('./support/implementApp');

const lib = (name) => import(pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', name)).href);

const BASE = {
  use_case_id: 'N01-U01',
  use_case_name: 'Predict churn',
  config: { warehouse_id: 'wh1', result_table: 'main.inspire.churn_out' },
  outputs: { dashboard: true, genie_space: true, app: true, app_name: 'churn-desk', app_access: 'sp', alert: true, alert_recipients: ['owner@example.com'] },
};
const PAGE = 'app:page:decisions';
const CHART = 'dashboard:w1a2b3c4';
const ASKED = '  Put the rows to act on first,\n  then a map by region  ';
const NOT_BUILT = (label) => `Inspire has not built the ${label} on this PoC/MVP, so it cannot rebuild it with your vibes; pick an asset the Control tower lists`;

function spec(outputs = {}, top = {}) {
  return I.validateImplementSpec({ ...JSON.parse(JSON.stringify(BASE)), ...top, outputs: { ...BASE.outputs, ...outputs } });
}

async function call(base, route, body) {
  const resp = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: resp.status, data: await resp.json() };
}

const submitBody = (s) => ({ inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: s });

const PARTS = {
  [PAGE]: { state: 'ready', spec_version: 2, name: 'Decisions' },
  'app:page:detail': { state: 'ready', spec_version: 1, title: 'Row detail page' },
  [CHART]: { state: 'ready_with_warnings', spec_version: 2, name: 'Weekly trend' },
  ai_reasoning: { state: 'ready', spec_version: 2 },
  value_formula: { state: 'failed', spec_version: 2, error: 'no amount column' },
  'app:page:gone': { state: 'deleted', spec_version: 2 },
};

function versionRow(version, { outputs = {}, assets = {}, status = 'ready', top = {} } = {}) {
  const asset = () => ({ state: 'ready', spec_version: version, snapshot: true });
  return {
    session_id: '42', use_case_id: 'N01-U01', spec_version: version, status, change_classes: version === 1 ? 'initial' : 'outputs',
    updated_at: `2026-10-2${version}T04:00:00Z`, spec_json: JSON.stringify({ ...BASE, ...top, outputs: { ...BASE.outputs, ...outputs } }), job_id: '77',
    dashboard_id: 'd1', genie_space_id: 'g1', app_name: 'churn-desk', alert_id: 'a1',
    asset_status: JSON.stringify({ dashboard: asset(), genie_space: asset(), app: asset(), alert: asset(), notebook: { spec_version: 1, modified_at: 1 }, ...assets }),
  };
}

function storedSpec(sqlCalls) {
  const insert = sqlCalls.find((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'));
  return insert ? { spec: JSON.parse(insert.parameters.find((p) => p.name === 'spec').value), classes: insert.parameters.find((p) => p.name === 'classes').value } : null;
}

async function served(history, run) {
  const made = makeApp({ history });
  const srv = await listen(made.app);
  try {
    await run(srv.url, made);
  } finally {
    await srv.close();
  }
}

test('vibes for a part of an output are kept exactly as typed under that part id, only while its output is ticked', () => {
  const { spec: out, errors } = spec({
    [`${PAGE}_vibes`]: ASKED, [`${CHART}_vibes`]: 'Weekly bars', ai_reasoning_vibes: 'Name the two columns behind each decision',
    value_formula_vibes: ' Price each row at its open order value ',
  });
  assert.deepEqual(errors, []);
  assert.equal(out.outputs[`${PAGE}_vibes`], ASKED, 'not trimmed and not rewritten');
  assert.equal(out.outputs[`${CHART}_vibes`], 'Weekly bars');
  assert.equal(out.outputs.ai_reasoning_vibes, 'Name the two columns behind each decision');
  assert.equal(out.outputs.value_formula_vibes, ' Price each row at its open order value ');
  const off = spec({ app: false, genie_space: false, [`${PAGE}_vibes`]: 'x'.repeat(5000), ai_reasoning_vibes: 'kept' });
  assert.deepEqual(off.errors, []);
  assert.equal(`${PAGE}_vibes` in off.spec.outputs, false, 'an unticked App drops the vibes of its pages, unchecked');
  assert.equal(off.spec.outputs.ai_reasoning_vibes, 'kept', 'the notebook parts belong to every build');
  const blank = spec({ [`${PAGE}_vibes`]: '   ', [`${CHART}_vibes`]: null });
  assert.deepEqual(blank.errors, []);
  assert.deepEqual(Object.keys(blank.spec.outputs).filter((k) => k.includes(':')), [], 'blank vibes are no vibes');
  const strange = spec({
    pdf_vibes: 'x', 'app:page:two words_vibes': 'x', 'app:page:_vibes': 'x', dashboard_vibes_vibes: 'x', [`app:page:${'p'.repeat(65)}_vibes`]: 'x', 'app:pages:x_vibes': 'x',
  });
  assert.deepEqual(strange.errors, []);
  assert.deepEqual(Object.keys(strange.spec.outputs).filter((k) => k.endsWith('_vibes')).sort(), ['alert_vibes', 'app_vibes', 'dashboard_vibes', 'genie_space_vibes'],
    'a key that is not an asset id is dropped like any unknown option');
});

test('part vibes over 2000 characters or not text are errors that name the part, and are never cut', () => {
  assert.deepEqual(spec({ [`${PAGE}_vibes`]: ` ${'a'.repeat(2000)} ` }).errors, []);
  assert.deepEqual(spec({ [`${PAGE}_vibes`]: 'a'.repeat(2001) }).errors, ['the App page decisions vibes are 2001 characters; at most 2000 are allowed']);
  const long = spec({ [`${CHART}_vibes`]: 'b'.repeat(2001) });
  assert.deepEqual(long.errors, ['the dashboard chart w1a2b3c4 vibes are 2001 characters; at most 2000 are allowed']);
  assert.equal(long.spec.outputs[`${CHART}_vibes`].length, 2001, 'kept whole');
  assert.deepEqual(spec({ value_formula_vibes: 'c'.repeat(2001) }).errors, ['the money at stake formula vibes are 2001 characters; at most 2000 are allowed']);
  assert.deepEqual(spec({ ai_reasoning_vibes: 5 }).errors, ['outputs.ai_reasoning_vibes must be text, not 5']);
  assert.deepEqual(spec({ [`${PAGE}_vibes`]: ['a'] }).errors, [`outputs.${PAGE}_vibes must be text, not ["a"]`]);
});

test('a part is rebuilt on its own through retry_outputs, needs its output ticked, and cannot rebuild while that output rolls back', () => {
  const ok = spec({}, { retry_outputs: [PAGE, ` ${PAGE} `, 'ai_reasoning', CHART] });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.spec.retry_outputs, [PAGE, 'ai_reasoning', CHART]);
  assert.deepEqual(spec({ app: false, genie_space: false }, { retry_outputs: [PAGE] }).errors, ['the App page decisions cannot be rebuilt: the App is not selected']);
  assert.deepEqual(spec({ dashboard: false }, { retry_outputs: [CHART] }).errors, ['the dashboard chart w1a2b3c4 cannot be rebuilt: the Dashboard is not selected']);
  assert.deepEqual(spec({}, { retry_outputs: ['app:page:two words'] }).errors, ["retry output 'app:page:two words' is not one of notebook, genie_space, dashboard, app, alert"]);
  assert.deepEqual(spec({}, { retry_outputs: [PAGE], rollback_outputs: { app: 1 } }).errors, ['the App cannot be retried and rolled back in the same version']);
  assert.deepEqual(spec({}, { retry_outputs: [CHART], rollback_outputs: { app: 1 } }).errors, [], 'a chart rebuilt while the App rolls back is fine');
});

test('rebuilding a part refreshes only its output, a notebook part reruns the notebook, and part vibes never rebuild an output whole', () => {
  const assets = { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk', alert: 'a1' };
  const before = spec().spec;
  const page = I.implementChangeSummary(before, spec({ [`${PAGE}_vibes`]: 'x' }, { retry_outputs: [PAGE] }).spec, assets);
  assert.deepEqual([page.classes, page.refresh, page.build, page.refill], [['retry'], ['app'], [], false]);
  const formula = I.implementChangeSummary(before, spec({}, { retry_outputs: ['value_formula'] }).spec, assets);
  assert.deepEqual([formula.classes, formula.refill], [['retry'], true]);
  assert.deepEqual([...formula.refresh].sort(), Object.keys(assets).sort());
  assert.deepEqual(I.classifyImplementChange(before, spec({ [`${PAGE}_vibes`]: 'x' }).spec), [], 'page vibes are not an option of the whole App');
});

test('submit rebuilds one built part with the vibes exactly as typed, and plan says the same', async () => {
  const history = [versionRow(2, { assets: PARTS }), versionRow(1)];
  await served(history, async (url, { sqlCalls, jobs }) => {
    const sent = { ...BASE, based_on_version: 2, outputs: { ...BASE.outputs, [`${PAGE}_vibes`]: ASKED }, retry_outputs: [PAGE] };
    const plan = await call(url, '/api/inspire/implement/plan', submitBody(sent));
    assert.equal(plan.status, 200, JSON.stringify(plan.data));
    assert.deepEqual([plan.data.summary.classes, plan.data.summary.refresh, plan.data.summary.refill], [['retry'], ['app'], false]);
    const got = await call(url, '/api/inspire/implement/submit', submitBody(sent));
    assert.equal(got.status, 200, JSON.stringify(got.data));
    const stored = storedSpec(sqlCalls);
    assert.equal(stored.spec.outputs[`${PAGE}_vibes`], ASKED, 'the agent spec carries the ask untouched');
    assert.deepEqual(stored.spec.retry_outputs, [PAGE]);
    assert.equal(stored.classes, 'retry');
    assert.deepEqual([stored.spec.outputs.app_vibes, stored.spec.outputs.dashboard_vibes], ['', ''], 'no other asset gets an ask');
    assert.equal(jobs.length, 1);
  });
  for (const [id, field] of [[CHART, `${CHART}_vibes`], ['value_formula', 'value_formula_vibes'], ['app:page:detail', 'app:page:detail_vibes']]) {
    await served(history, async (url, { sqlCalls }) => {
      const got = await call(url, '/api/inspire/implement/submit', submitBody({ ...BASE, based_on_version: 2, outputs: { ...BASE.outputs, [field]: 'Bigger' }, retry_outputs: [id] }));
      assert.equal(got.status, 200, `${id}: ${JSON.stringify(got.data)}`);
      assert.deepEqual(storedSpec(sqlCalls).spec.retry_outputs, [id], `${id}: a part with warnings, a failed part and a carried part can be rebuilt`);
    });
  }
});

test('submit and plan refuse a part that is not a built asset with a clear 400, and write and launch nothing', async () => {
  const history = [versionRow(2, { assets: PARTS }), versionRow(1)];
  const cases = [
    [{ retry_outputs: ['app:page:missing'] }, NOT_BUILT('App page missing')],
    [{ retry_outputs: ['app:page:gone'] }, NOT_BUILT('App page gone')],
    [{ outputs: { ...BASE.outputs, 'dashboard:nope_vibes': 'x' }, retry_outputs: ['dashboard:nope'] }, NOT_BUILT('dashboard chart nope')],
    [{ outputs: { ...BASE.outputs, [`${PAGE}_vibes`]: 'Bigger' } }, `the vibes for the App page decisions changed, so list ${PAGE} in retry_outputs to rebuild it with them`],
    [{ retry_outputs: ['app:page:missing', 'ai_reasoning', 'dashboard:nope'] }, `${NOT_BUILT('App page missing')}; ${NOT_BUILT('dashboard chart nope')}`],
  ];
  for (const [patch, message] of cases) {
    await served(history, async (url, { sqlCalls, jobs }) => {
      for (const route of ['/api/inspire/implement/plan', '/api/inspire/implement/submit']) {
        const got = await call(url, route, submitBody({ ...BASE, based_on_version: 2, ...patch }));
        assert.equal(got.status, 400, `${route}: ${JSON.stringify(got.data)}`);
        assert.equal(got.data.error, message, route);
      }
      assert.equal(storedSpec(sqlCalls), null);
      assert.equal(jobs.length, 0);
    });
  }
  await served([versionRow(1, { status: 'failed' })], async (url, { jobs }) => {
    const got = await call(url, '/api/inspire/implement/submit', submitBody({ ...BASE, based_on_version: 1, retry_outputs: ['ai_reasoning'] }));
    assert.deepEqual([got.status, got.data.error], [400, NOT_BUILT('AI reasoning')], 'with no built version nothing can be rebuilt');
    assert.equal(jobs.length, 0);
  });
});

test('vibes carried for a part that is gone never block an unrelated change, and rolling an output back takes the part vibes of that version', async () => {
  const carried = { [`app:page:gone_vibes`]: 'an old ask', [`${PAGE}_vibes`]: 'v2 page ask', [`${CHART}_vibes`]: 'v2 chart ask' };
  const history = [
    versionRow(2, { assets: PARTS, outputs: carried }),
    versionRow(1, { outputs: { [`${PAGE}_vibes`]: '  v1 page ask ', 'app:page:old_vibes': 'v1 old page ask', [`${CHART}_vibes`]: 'v1 chart ask' } }),
  ];
  await served(history, async (url, { sqlCalls }) => {
    const got = await call(url, '/api/inspire/implement/submit', submitBody({ ...BASE, based_on_version: 2, outputs: { ...BASE.outputs, ...carried }, schedule: { enabled: true, cron: '0 0 6 ? * MON' } }));
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(storedSpec(sqlCalls).spec.outputs['app:page:gone_vibes'], 'an old ask', 'kept as it was');
  });
  await served(history, async (url, { sqlCalls }) => {
    const got = await call(url, '/api/inspire/implement/submit', submitBody({ ...BASE, based_on_version: 2, outputs: { ...BASE.outputs, ...carried }, rollback_outputs: { app: 1 } }));
    assert.equal(got.status, 200, JSON.stringify(got.data));
    const { outputs } = storedSpec(sqlCalls).spec;
    assert.deepEqual([outputs[`${PAGE}_vibes`], outputs['app:page:old_vibes'], 'app:page:gone_vibes' in outputs], ['  v1 page ask ', 'v1 old page ask', false],
      'the App pages get the asks of v1 exactly, and a page v1 did not have loses its ask');
    assert.equal(outputs[`${CHART}_vibes`], 'v2 chart ask', 'the dashboard is not rolled back, so its chart keeps its ask');
  });
});

test('the wizard names, limits and sends part vibes the way the backend reads them', async () => {
  const w = await lib('implementWizard.js');
  const c = await lib('implementControl.js');
  for (const id of [PAGE, CHART, 'ai_reasoning', 'value_formula', 'notebook', 'dashboard', 'app:page:', 'app:page:two words', 'pdf', '', null]) {
    const mine = w.partOf(id);
    assert.deepEqual(mine && { output: mine.output, label: mine.label }, I.implementPart(id), String(id));
  }
  assert.deepEqual([w.vibesProblem(PAGE, 'a'.repeat(2001))], spec({ [`${PAGE}_vibes`]: 'a'.repeat(2001) }).errors);
  assert.equal(w.vibesProblem(PAGE, 'a'.repeat(2001), 'Decisions page'), 'the Decisions page vibes are 2001 characters; at most 2000 are allowed');
  assert.equal(w.vibesLabel(CHART), 'Vibes for the dashboard chart w1a2b3c4');
  assert.deepEqual([w.partLabel(PAGE, 'Decisions'), w.partLabel(PAGE, 'Row detail page'), w.partLabel(CHART, ' '), w.partLabel('value_formula', 'x')],
    ['Decisions page', 'Row detail page', 'dashboard chart w1a2b3c4', 'money at stake formula']);
  const latest = { spec_json: { outputs: { app: true, app_vibes: 'Dark header', [`${PAGE}_vibes`]: 'Rows first' } } };
  assert.deepEqual(c.vibeChanges(latest, PAGE, ASKED), { outputs: { ...latest.spec_json.outputs, [`${PAGE}_vibes`]: ASKED }, retry_outputs: [PAGE] },
    'the ask goes as typed, with only that part to rebuild');
  assert.deepEqual(c.vibeChanges(latest, PAGE, ' Rows first '), { retry_outputs: [PAGE] });
  assert.deepEqual(c.vibeChanges(latest, 'ai_reasoning', ''), { retry_outputs: ['ai_reasoning'] });
  const sent = I.validateImplementSpec({ ...JSON.parse(JSON.stringify(BASE)), ...c.vibeChanges(latest, PAGE, ASKED), outputs: { ...BASE.outputs, ...c.vibeChanges(latest, PAGE, ASKED).outputs } });
  assert.deepEqual([sent.errors, sent.spec.outputs[`${PAGE}_vibes`], sent.spec.retry_outputs], [[], ASKED, [PAGE]]);
});

test('the control tower lists every built asset grouped by output with its parts, and a part with warnings or a failed one stays listed', async () => {
  const c = await lib('implementControl.js');
  const rows = [versionRow(2, { assets: PARTS, outputs: { [`${PAGE}_vibes`]: ASKED } }), versionRow(1)].map(I.parseImplementRow);
  rows[0].dashboard_url = 'https://workspace.example.com/dashboardsv3/d1/published';
  const cards = c.vibeCards(rows, rows[0], null, 'https://host/#workspace/nb');
  assert.deepEqual(cards.map((x) => [x.id, x.output]), [
    ['notebook', 'notebook'], ['ai_reasoning', 'notebook'], ['value_formula', 'notebook'],
    ['dashboard', 'dashboard'], [CHART, 'dashboard'], ['genie_space', 'genie_space'], ['app', 'app'], [PAGE, 'app'], ['app:page:detail', 'app'], ['alert', 'alert'],
  ], 'a deleted page is not a built asset');
  const page = cards.find((x) => x.id === PAGE);
  assert.deepEqual([page.label, page.name, page.vibes, page.rebuild, page.live.version, page.state.label, page.versions],
    ['Decisions page', 'Decisions', ASKED, true, 2, 'Ready', []]);
  assert.equal(cards.find((x) => x.id === 'app:page:detail').live.version, 1, 'a carried page names the version that built it');
  const chart = cards.find((x) => x.id === CHART);
  assert.deepEqual([chart.label, chart.state, chart.url], ['Weekly trend chart', { label: 'Warnings', tone: 'warning' }, rows[0].dashboard_url]);
  const formula = cards.find((x) => x.id === 'value_formula');
  assert.deepEqual([formula.label, formula.live, formula.state.label, formula.url], ['money at stake formula', null, 'Failed', 'https://host/#workspace/nb']);
  const unticked = { ...rows[0], spec_json: { ...rows[0].spec_json, outputs: { ...rows[0].spec_json.outputs, app: false } } };
  assert.equal(c.vibeCards(rows, unticked).some((x) => x.output === 'app'), false, 'an unticked App lists no pages');

  const live = [{ id: 'app', name: 'churn-desk' }, { id: 'dashboard', name: 'Churn dashboard' }];
  const groups = c.assetGroups(cards, live);
  assert.deepEqual(groups.map((g) => [g.output, g.label, g.assets.map((a) => a.pick)]), [
    ['notebook', 'Genie Code notebook', ['Whole notebook', 'AI reasoning', 'Money at stake formula']],
    ['dashboard', 'Dashboard', ['Whole dashboard', 'Weekly trend chart']],
    ['genie_space', 'Genie Agent', ['Instructions']],
    ['app', 'App', ['Whole App', 'Decisions page', 'Row detail page']],
    ['alert', 'Alert', ['Whole alert']],
  ]);
  assert.deepEqual(groups[3].assets.map((a) => a.name), ['churn-desk', 'Decisions', 'Row detail page'], 'an output takes its live name, a part its built name');
  assert.deepEqual(c.assetGroups([], live), []);
});

test('an asset that a missing ask left ready_with_warnings is still built: it can be rebuilt, it stays live, and the App keeps its backend', async () => {
  const w = await lib('implementWizard.js');
  const c = await lib('implementControl.js');
  const rows = [versionRow(2, { assets: { app: { state: 'ready_with_warnings', spec_version: 2, snapshot: true }, dashboard: { state: 'ready_with_warnings', spec_version: 2 } } })]
    .map(I.parseImplementRow);
  rows[0].status = 'ready_with_warnings';
  assert.deepEqual(w.rebuildableOutputs(rows[0]).map((o) => o.id), ['dashboard', 'genie_space', 'app', 'alert']);
  const app = c.vibeCards(rows, rows[0]).find((x) => x.id === 'app');
  assert.deepEqual([app.rebuild, app.live && app.live.version], [true, 2]);
  assert.equal(c.appBackendFacts(rows[0]).backend, c.APP_BACKEND_FACTS.delta, 'an App built before the backend choice still reads Delta tables');
});

const checksOf = (...pairs) => pairs.map(([ask, status, evidence = '']) => ({ ask, status, evidence }));

test('the build record vibes_checks read as a list of asks, each done or missing with its evidence, from an array or its JSON text', async () => {
  const c = await lib('implementControl.js');
  const raw = checksOf(['Rows to act on first', 'done', 'the first widget lists them'], ['A map by region', 'missing', 'no region column'], ['Dark header', ' DONE ']);
  const read = [{ ask: 'Rows to act on first', done: true, evidence: 'the first widget lists them' }, { ask: 'A map by region', done: false, evidence: 'no region column' },
    { ask: 'Dark header', done: true, evidence: '' }];
  assert.deepEqual(c.vibeChecks(raw), read);
  assert.deepEqual(c.vibeChecks(JSON.stringify(raw)), read, 'the agent may store the list as JSON text');
  assert.deepEqual(c.vibeChecks([{ ask: '  ', status: 'done' }, null, 'text', { ask: 'Bigger', status: 'skipped' }, { ask: 'Blue' }]),
    [{ ask: 'Bigger', done: false, evidence: '' }, { ask: 'Blue', done: false, evidence: '' }], 'only a done status counts as done; an empty ask is dropped');
  for (const bad of [undefined, null, '', 'not json', '{"ask":"x"}', 5, {}]) assert.deepEqual(c.vibeChecks(bad), [], JSON.stringify(bad));
  assert.equal(c.checksSummary(c.vibeChecks(raw)), 'You asked for 3 things. Done: 2 of 3');
  assert.equal(c.checksSummary([{ ask: 'x', done: true, evidence: '' }]), 'You asked for 1 thing. Done: 1 of 1');
  assert.equal(c.missingAsks(c.vibeChecks([...raw, { ask: 'Bigger bars', status: 'missing' }])), 'A map by region\nBigger bars');
});

test('every asset shows the checklist of the version that built it, a missing ask marks it with warnings, and the old warning lines give way to it', async () => {
  const c = await lib('implementControl.js');
  const pageChecks = checksOf(['Rows to act on first', 'done', 'first widget'], ['A map by region', 'missing', 'no region column']);
  const rows = [
    versionRow(3, { status: 'ready_with_warnings', assets: {
      app: { state: 'ready', spec_version: 3, snapshot: true, vibes_checks: JSON.stringify(checksOf(['Dark header', 'done', 'header is #111'])) },
      [PAGE]: { state: 'ready_with_warnings', spec_version: 3, name: 'Decisions', vibes_checks: pageChecks },
      dashboard: { state: 'ready', spec_version: 2, snapshot: true },
      notebook: { spec_version: 3, vibes_checks: checksOf(['Hold out the last month', 'done', 'cell 4']) },
      ai_reasoning: { state: 'ready', spec_version: 3, vibes_checks: checksOf(['Name two columns', 'missing', 'it names one']) },
    } }),
    versionRow(2, { assets: { dashboard: { state: 'ready', spec_version: 2, snapshot: true, vibes_checks: checksOf(['Weekly bars', 'done', 'grain is week']) } } }),
    versionRow(1),
  ].map(I.parseImplementRow);
  rows[0].status_message = 'App vibe not done: a logo: no logo file was given';
  const cards = c.vibeCards(rows, rows[0]);
  const byId = (id) => cards.find((x) => x.id === id);
  assert.deepEqual(byId(PAGE).checks.map((x) => [x.ask, x.done]), [['Rows to act on first', true], ['A map by region', false]]);
  assert.equal(byId(PAGE).state.label, 'Warnings');
  assert.deepEqual([byId('app').checks.length, byId('app').state.label, byId('app').warnings], [1, 'Ready', []], 'the checklist replaces the old warning lines');
  assert.deepEqual(byId('dashboard').checks.map((x) => x.ask), ['Weekly bars'], 'a carried dashboard shows the checklist of v2, which built it');
  assert.deepEqual([byId('notebook').checks.length, byId('ai_reasoning').state.label], [1, 'Warnings'], 'a ready part with a missing ask reads Warnings');
  assert.deepEqual(byId('genie_space').checks, []);
  assert.deepEqual(byId('genie_space').warnings, [], 'no checks and no warning lines');
  const legacy = c.vibeCards([{ ...rows[0], asset_status: { ...rows[0].asset_status, app: { state: 'ready', spec_version: 3, snapshot: true } } }, ...rows.slice(1)],
    { ...rows[0], asset_status: { ...rows[0].asset_status, app: { state: 'ready', spec_version: 3, snapshot: true } } });
  assert.deepEqual(legacy.find((x) => x.id === 'app').warnings, ['App vibe not done: a logo: no logo file was given'], 'with no checklist the old warning lines still show');
});

test('a rolled back output, and its parts, show the checklist of the version they rolled back to, and each earlier version shows its own', async () => {
  const c = await lib('implementControl.js');
  const v1 = checksOf(['Put the trend first', 'done', 'first widget'], ['Arabic labels', 'missing', 'no Arabic font']);
  const rows = [
    versionRow(4, { top: { rollback_outputs: { dashboard: 2 } }, assets: {
      dashboard: { state: 'ready', spec_version: 4, snapshot: true, vibes_checks: [] }, [CHART]: { state: 'ready', spec_version: 4, name: 'Trend' } } }),
    versionRow(3, { assets: { dashboard: { state: 'ready', spec_version: 3, snapshot: true, vibes_checks: checksOf(['Make it blue', 'done', 'blue']) } } }),
    versionRow(2, { top: { rollback_outputs: { dashboard: 1 } }, assets: { dashboard: { state: 'ready', spec_version: 2, snapshot: true } } }),
    versionRow(1, { assets: { dashboard: { state: 'ready', spec_version: 1, snapshot: true, vibes_checks: v1 }, [CHART]: { state: 'ready', spec_version: 1, vibes_checks: checksOf(['Weekly', 'done', 'week']) } } }),
  ].map(I.parseImplementRow);
  const cards = c.vibeCards(rows, rows[0]);
  const dash = cards.find((x) => x.id === 'dashboard');
  assert.deepEqual(dash.checks.map((x) => x.ask), ['Put the trend first', 'Arabic labels'], 'v4 rolled back to v2, which rolled back to v1');
  assert.equal(dash.state.label, 'Warnings');
  assert.deepEqual(cards.find((x) => x.id === CHART).checks.map((x) => x.ask), ['Weekly'], 'the chart came back with its dashboard, with the asks of v1');
  assert.deepEqual(dash.versions.map((v) => [v.version, c.checksSummary(v.checks)]),
    [[3, 'You asked for 1 thing. Done: 1 of 1'], [2, 'You asked for 2 things. Done: 1 of 2'], [1, 'You asked for 2 things. Done: 1 of 2']]);
  const latest = { spec_json: { outputs: { dashboard: true, dashboard_vibes: 'Put the trend first\nArabic labels', [`${CHART}_vibes`]: 'Weekly' } } };
  assert.deepEqual(c.vibeChanges(latest, 'dashboard', c.missingAsks(dash.checks)), { outputs: { ...latest.spec_json.outputs, dashboard_vibes: 'Arabic labels' } },
    'Try again sends only the missing asks');
  assert.deepEqual(c.vibeChanges(latest, CHART, c.missingAsks(c.vibeChecks(checksOf(['Weekly', 'missing'])))), { retry_outputs: [CHART] },
    'when the missing asks are all the vibes, Try again rebuilds with them as they are');
});
