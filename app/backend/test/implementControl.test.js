const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const C = require('../lib/implementControl');
const I = require('../lib/inspireImplement');
const { makeApp, listen } = require('./support/implementApp');

const OURS = 'Inspire use case N01-U01 (session 42): Predict churn';
const SPEC = {
  use_case_id: 'N01-U01',
  use_case_name: 'Predict churn',
  config: { warehouse_id: 'wh1', result_table: 'main.inspire.churn_out' },
  outputs: { dashboard: true, app: true, app_name: 'churn-desk', genie_space: true, alert: true },
};
const BUILT = {
  spec_version: 2, status: 'ready', spec_json: SPEC, use_case_id: 'N01-U01', job_id: '77', implement_run_id: '900',
  dashboard_id: 'd1', genie_space_id: 'g1', app_name: 'churn-desk', alert_id: 'a1',
};
const POC_JOB = { job_id: 77, settings: { tags: { dbx_inspire_ai_run_type: 'implement', dbx_inspire_ai_session_id: '42', dbx_inspire_ai_usecase_id: 'N01-U01' },
  schedule: { quartz_cron_expression: '0 0 6 * * ?', timezone_id: 'Europe/London', pause_status: 'PAUSED' } } };
const CTX = { useCaseId: 'N01-U01', sessionId: '42' };
const Q = 'inspire_database=main.inspire&warehouse_id=wh1&session_id=42&use_case_id=N01-U01';

async function call(base, path, opts = {}) {
  const resp = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: resp.status, data: await resp.json() };
}

async function withApp(overrides, fn) {
  const made = makeApp(overrides);
  const srv = await listen(made.app);
  try {
    await fn(srv.url, made);
  } finally {
    await srv.close();
  }
}

const ok = (data) => ({ ok: true, status: 200, data });
const missing = (message = 'not found') => ({ ok: false, status: 404, data: { message } });

test('the control tower acts only on ids this PoC recorded, and on a build only while it builds', () => {
  assert.deepEqual(C.controlTargets([BUILT]), { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk', alert: 'a1', job: '77' });
  const building = { spec_version: 3, status: 'building_outputs', implement_run_id: '901', use_case_id: 'N01-U01' };
  assert.equal(C.controlTargets([BUILT, building]).build, '901', 'the newest version is the one that builds, whatever the row order');
  assert.equal(C.controlTargets([building, BUILT]).build, '901');
  assert.equal(C.controlTargets([BUILT]).build, undefined, 'a finished version has no build to stop');
  assert.equal(C.controlTargets([{ ...BUILT, job_id: 'x; DROP' }]).job, undefined);
  const removed = { ...BUILT, spec_version: 3, dashboard_id: null, asset_status: { dashboard: { state: 'deleted' } } };
  assert.equal(C.controlTargets([removed, BUILT]).dashboard, undefined, 'a deleted dashboard is never acted on again');
  assert.throws(() => C.controlTarget('dashboard', {}), (e) => e.statusCode === 409 && /no Dashboard that Inspire built/.test(e.message));
  assert.throws(() => C.controlTarget('build', {}), (e) => e.statusCode === 409 && /no version of this PoC is building now/.test(e.message));
  assert.equal(C.controlTarget('job', { job: '77' }), '77');
  assert.throws(() => C.controlTarget('__proto__', { job: '77' }), (e) => e.statusCode === 409, 'an inherited key is never a target');
});

test('only the listed actions run, and an unknown one names every action that does', () => {
  assert.equal(C.controlAction('app', 'stop'), 'Stop the App');
  assert.equal(C.controlAction('dashboard', 'unpublish'), 'Unpublish the dashboard');
  assert.equal(C.controlAction('build', 'cancel'), 'Stop the build');
  for (const [asset, action] of [['genie_space', 'stop'], ['app', 'delete'], ['job', 'pause'], ['alert', 'stop'], ['', ''], ['app', '__proto__']]) {
    assert.throws(() => C.controlAction(asset, action), (e) => e.statusCode === 400
      && e.message.endsWith('it runs app stop, app start, dashboard unpublish, dashboard publish, job cancel, build cancel'));
  }
});

test('each action calls the one Databricks API that does it', () => {
  assert.deepEqual(C.controlRequest('app', 'stop', 'churn-desk'), { method: 'POST', path: '/api/2.0/apps/churn-desk/stop', body: {} });
  assert.deepEqual(C.controlRequest('app', 'start', 'churn desk'), { method: 'POST', path: '/api/2.0/apps/churn%20desk/start', body: {} });
  assert.deepEqual(C.controlRequest('job', 'cancel', '77'), { method: 'POST', path: '/api/2.1/jobs/runs/cancel-all', body: { job_id: 77 } });
  assert.deepEqual(C.controlRequest('build', 'cancel', '900'), { method: 'POST', path: '/api/2.1/jobs/runs/cancel', body: { run_id: 900 } });
  assert.deepEqual(C.controlRequest('dashboard', 'unpublish', 'd1'), { method: 'DELETE', path: '/api/2.0/lakeview/dashboards/d1/published' });
  assert.deepEqual(C.controlRequest('dashboard', 'publish', 'd1', { warehouseId: 'wh1' }),
    { method: 'POST', path: '/api/2.0/lakeview/dashboards/d1/published', body: { warehouse_id: 'wh1', embed_credentials: true } });
  assert.throws(() => C.controlRequest('dashboard', 'publish', 'd1', {}), (e) => e.statusCode === 409 && /no SQL warehouse/.test(e.message));
});

test('a job is this PoC\'s only when its tags say implement, this session and, when tagged, this use case', () => {
  assert.equal(C.jobOwnerProblem(ok(POC_JOB), CTX), '');
  const legacy = { settings: { tags: { dbx_inspire_ai_run_type: 'implement', dbx_inspire_ai_session_id: '42' } } };
  assert.equal(C.jobOwnerProblem(ok(legacy), CTX), '', 'a job built before the use case id tag still counts');
  const tagged = (tags) => ok({ settings: { tags: { ...POC_JOB.settings.tags, ...tags } } });
  assert.equal(C.jobOwnerProblem(tagged({ dbx_inspire_ai_run_type: 'discovery' }), CTX), 'the job is not an Inspire PoC job');
  assert.equal(C.jobOwnerProblem(tagged({ dbx_inspire_ai_session_id: '43' }), CTX), 'the job belongs to another Inspire session');
  assert.equal(C.jobOwnerProblem(tagged({ dbx_inspire_ai_usecase_id: 'N01-U02' }), CTX), 'the job belongs to another use case');
  assert.equal(C.jobOwnerProblem(ok({ settings: {} }), CTX), 'the job is not an Inspire PoC job');
  assert.equal(C.jobOwnerProblem(missing('Job 77 does not exist.'), CTX), 'Inspire cannot read this job: Job 77 does not exist.');
});

test('the App, the dashboard and the build each refuse what is not this PoC\'s or is already gone', () => {
  assert.equal(C.ownerProblem('app', ok({ name: 'churn-desk', description: OURS }), CTX), '');
  assert.equal(C.ownerProblem('app', ok({ name: 'churn-desk', description: 'Finance tool' }), CTX), 'the App named churn-desk is no longer this use case\'s App');
  assert.equal(C.ownerProblem('app', missing(), CTX), 'the App no longer exists');
  assert.equal(C.ownerProblem('dashboard', ok({ lifecycle_state: 'ACTIVE' }), CTX), '');
  assert.equal(C.ownerProblem('dashboard', ok({ lifecycle_state: 'TRASHED' }), CTX), 'the dashboard is in the trash');
  assert.equal(C.ownerProblem('build', ok({ state: { life_cycle_state: 'RUNNING' } }), CTX), '');
  for (const ended of ['TERMINATED', 'SKIPPED', 'INTERNAL_ERROR']) {
    assert.equal(C.ownerProblem('build', ok({ state: { life_cycle_state: ended } }), CTX), 'the build already ended');
  }
  assert.equal(C.ownerProblem('build', missing('Run 900 does not exist.'), CTX), 'Inspire cannot read the build run: Run 900 does not exist.');
});

test('live status reads every asset in one pass and says plainly what is gone or unreadable', () => {
  const targets = { app: 'churn-desk', job: '77', dashboard: 'd1', genie_space: 'g1', alert: 'a1' };
  assert.deepEqual(Object.keys(C.livePaths(targets)), ['app', 'job', 'runs', 'dashboard', 'published', 'genie_space', 'alert']);
  assert.equal(C.livePaths(targets).runs, '/api/2.1/jobs/runs/list?job_id=77&active_only=true&limit=5');
  assert.deepEqual(C.livePaths({}), {});
  const live = C.liveStatus(targets, {
    app: ok({ name: 'churn-desk', description: OURS, url: 'https://churn-desk.example', compute_status: { state: 'STOPPED' }, app_status: { state: 'UNAVAILABLE' } }),
    job: ok(POC_JOB),
    runs: ok({ runs: [{ run_id: 5, state: { life_cycle_state: 'RUNNING' }, run_page_url: 'https://h/run/5' }] }),
    dashboard: ok({ display_name: 'Churn', lifecycle_state: 'ACTIVE' }),
    published: missing(),
    genie_space: ok({ title: 'Churn desk' }),
    alert: ok({ display_name: 'Churn alert', lifecycle_state: 'ACTIVE', evaluation: { state: 'TRIGGERED', last_evaluated_at: '2026-10-26T06:00:05Z' } }),
  }, CTX);
  assert.equal(live.app.compute_state, 'STOPPED');
  assert.deepEqual(live.job, { ok: true, job_id: '77', schedule: { cron: '0 0 6 * * ?', timezone: 'Europe/London', paused: true },
    active_runs: [{ run_id: 5, state: 'RUNNING', url: 'https://h/run/5' }], runs_error: '' });
  assert.deepEqual(live.dashboard, { ok: true, name: 'Churn', trashed: false, published: false, published_at: '' });
  assert.deepEqual(live.genie_space, { ok: true, title: 'Churn desk' });
  assert.deepEqual(live.alert, { ok: true, name: 'Churn alert', state: 'TRIGGERED', checked_at: '2026-10-26T06:00:05Z', trashed: false });
  const gone = C.liveStatus(targets, { app: missing(), job: ok({ settings: { tags: {} } }), runs: { ok: false, status: 403, data: { message: 'no' } },
    dashboard: missing(), published: missing(), genie_space: missing(), alert: { ok: false, status: 403, data: { message: 'PERMISSION_DENIED' } } }, CTX);
  assert.deepEqual(gone.app, { ok: false, error: 'the App no longer exists' });
  assert.deepEqual(gone.job, { ok: false, error: 'the job is not an Inspire PoC job' });
  assert.deepEqual(gone.dashboard, { ok: false, error: 'the dashboard no longer exists' });
  assert.deepEqual(gone.genie_space, { ok: false, error: 'the Genie space no longer exists' });
  assert.deepEqual(gone.alert, { ok: false, error: 'Inspire cannot read the alert: PERMISSION_DENIED' });
  const unread = C.liveStatus({ job: '77' }, { job: ok(POC_JOB), runs: { ok: false, status: 403, data: { message: 'no runs access' } } }, CTX);
  assert.equal(unread.job.active_runs, null, 'unreadable runs are not shown as zero runs');
  assert.equal(unread.job.runs_error, 'no runs access');
  const published = C.liveStatus({ dashboard: 'd1' }, { dashboard: ok({ display_name: 'Churn', lifecycle_state: 'ACTIVE' }),
    published: ok({ revision_create_time: '2026-10-26T08:57:59.570Z' }) }, CTX);
  assert.deepEqual(published.dashboard, { ok: true, name: 'Churn', trashed: false, published: true, published_at: '2026-10-26T08:57:59.570Z' });
});

test('the live cache serves one load for 15 seconds, shares a load in flight, and never stores a load that a control action outran', async () => {
  let clock = 0;
  const cache = C.createLiveCache(15000, () => clock);
  let loads = 0;
  const load = async () => ({ n: ++loads });
  assert.deepEqual(await cache.get('k', load), { n: 1, cached: false });
  clock = 14999;
  assert.deepEqual(await cache.get('k', load), { n: 1, cached: true });
  clock = 15000;
  assert.deepEqual(await cache.get('k', load), { n: 2, cached: false });
  const [a, b] = await Promise.all([cache.get('other', load), cache.get('other', load)]);
  assert.equal(a.n, b.n, 'two readers at once share one load');
  let release;
  const slow = () => new Promise((resolve) => { release = () => resolve({ n: 'before the action' }); });
  const first = cache.get('raced', slow);
  cache.forget('raced');
  const fresh = await cache.get('raced', async () => ({ n: 'after the action' }));
  release();
  assert.equal((await first).n, 'before the action');
  assert.deepEqual(await cache.get('raced', load), { n: 'after the action', cached: true }, 'the slower, older load did not overwrite the newer one');
  await assert.rejects(cache.get('bad', async () => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(await cache.get('bad', async () => ({ n: 'retried' })), { n: 'retried', cached: false }, 'a failed load is not cached');
  assert.equal(fresh.cached, false);
});

test('every control click is written to the control log with who did it', () => {
  const table = C.controlLogTableName('main', 'inspire');
  assert.equal(table, '`main`.`inspire`.`__inspire_control_log`');
  assert.match(C.controlLogCreateSql(table), /^CREATE TABLE IF NOT EXISTS `main`\.`inspire`\.`__inspire_control_log` \(`session_id` BIGINT, `use_case_id` STRING, `asset` STRING, `asset_id` STRING, `action` STRING, `result` STRING, `message` STRING, `acted_by` STRING, `acted_at` TIMESTAMP\) USING DELTA CLUSTER BY/);
  const insert = C.controlLogInsert(table, { sessionId: '42', useCaseId: 'N01-U01', asset: 'app', assetId: 'churn-desk', action: 'stop', result: 'done',
    message: 'm'.repeat(3000), actedBy: 'person@x.com' });
  assert.match(insert.sql, /VALUES \(:sid, :uc, :asset, :id, :action, :result, :message, :by, current_timestamp\(\)\)$/);
  assert.equal(insert.parameters.find((p) => p.name === 'message').value.length, 2000);
  assert.deepEqual(insert.parameters.find((p) => p.name === 'sid'), { name: 'sid', value: '42', type: 'BIGINT' });
  assert.match(C.controlLogSelect(table, { sessionId: '42', useCaseId: 'N01-U01', limit: 10000 }).sql, /LIMIT 200$/);
  assert.match(C.controlLogSelect(table, { sessionId: '42', useCaseId: 'N01-U01', limit: 'x' }).sql, /LIMIT 50$/);
});

const APP_OURS = { name: 'churn-desk', description: OURS, compute_status: { state: 'ACTIVE' } };

test('stopping the App checks it is this PoC\'s, stops it, records who did it and refreshes the live status', async () => {
  await withApp({ history: [BUILT], responses: {
    'GET /api/2.0/apps/churn-desk': [APP_OURS], 'POST /api/2.0/apps/churn-desk/stop': [{}],
    'GET /api/2.1/jobs/get': [POC_JOB], 'GET /api/2.0/lakeview/dashboards/d1': [{ lifecycle_state: 'ACTIVE' }],
    'GET /api/2.0/lakeview/dashboards/d1/published': [{}, 404], 'GET /api/2.0/genie/spaces/g1': [{ title: 'g' }], 'GET /api/2.0/alerts/a1': [{}],
  } }, async (url, made) => {
    const before = await call(url, `/api/inspire/implement/live?${Q}`);
    assert.equal(before.status, 200, JSON.stringify(before.data));
    assert.equal(before.data.cached, false);
    assert.equal((await call(url, `/api/inspire/implement/live?${Q}`)).data.cached, true);
    const got = await call(url, `/api/inspire/implement/control?${Q}`, { method: 'POST', body: { asset: 'app', action: 'stop' } });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(got.data, { ok: true, asset: 'app', action: 'stop', asset_id: 'churn-desk', message: 'Stop the App: done', audit_error: '' });
    assert.ok(made.fetches.some((f) => f.path === '/api/2.0/apps/churn-desk/stop' && f.opts.method === 'POST'));
    const created = made.sqlCalls.findIndex((c) => String(c.sql).startsWith('CREATE TABLE IF NOT EXISTS `main`.`inspire`.`__inspire_control_log`'));
    const stopped = made.fetches.findIndex((f) => f.path === '/api/2.0/apps/churn-desk/stop');
    assert.ok(created >= 0 && stopped >= 0);
    const logged = made.sqlCalls.find((c) => String(c.sql).startsWith('INSERT INTO `main`.`inspire`.`__inspire_control_log`'));
    assert.deepEqual(logged.parameters.map((p) => [p.name, p.value]), [['sid', '42'], ['uc', 'N01-U01'], ['asset', 'app'], ['id', 'churn-desk'],
      ['action', 'stop'], ['result', 'done'], ['message', 'Stop the App: done'], ['by', 'amr@x']]);
    assert.equal((await call(url, `/api/inspire/implement/live?${Q}`)).data.cached, false, 'an action makes the next status read fresh');
  });
});

test('the control log is created before anything is touched, so no action runs unrecorded', async () => {
  await withApp({ history: [BUILT], responses: { 'GET /api/2.0/apps/churn-desk': [APP_OURS], 'POST /api/2.0/apps/churn-desk/stop': [{}] } },
    async (url, made) => {
      const order = [];
      const executeSql = made.sqlCalls.push.bind(made.sqlCalls);
      made.sqlCalls.push = (entry) => { order.push(`sql ${String(entry.sql).split(' ').slice(0, 3).join(' ')}`); return executeSql(entry); };
      const fetchesPush = made.fetches.push.bind(made.fetches);
      made.fetches.push = (entry) => { order.push(`${entry.opts.method || 'GET'} ${entry.path}`); return fetchesPush(entry); };
      assert.equal((await call(url, `/api/inspire/implement/control?${Q}`, { method: 'POST', body: { asset: 'app', action: 'stop' } })).status, 200);
      assert.ok(order.indexOf('sql CREATE TABLE IF') < order.indexOf('POST /api/2.0/apps/churn-desk/stop'));
    });
});

test('another team\'s App, a job of another session, and an App or the job mid-build are refused before any change', async () => {
  const cases = [
    [{ history: [BUILT], responses: { 'GET /api/2.0/apps/churn-desk': [{ ...APP_OURS, description: 'Finance team tool' }] } },
      { asset: 'app', action: 'stop' }, 409, "Inspire did not stop the App: the App named churn-desk is no longer this use case's App"],
    [{ history: [BUILT], responses: { 'GET /api/2.1/jobs/get': [{ settings: { tags: { ...POC_JOB.settings.tags, dbx_inspire_ai_session_id: '7' } } }] } },
      { asset: 'job', action: 'cancel' }, 409, 'Inspire did not stop the running job: the job belongs to another Inspire session'],
    [{ history: [{ ...BUILT, spec_version: 3, status: 'building_outputs', implement_run_id: '901' }, BUILT] },
      { asset: 'app', action: 'start' }, 409, 'spec v3 is still building_outputs; start the App after it finishes, or stop the build first'],
    [{ history: [{ ...BUILT, spec_version: 3, status: 'previewing', implement_run_id: '901' }, BUILT] },
      { asset: 'job', action: 'cancel' }, 409, 'spec v3 is still previewing; stop the running job after it finishes, or stop the build first'],
    [{ history: [BUILT] }, { asset: 'build', action: 'cancel' }, 409, 'no version of this PoC is building now'],
    [{ history: [] }, { asset: 'dashboard', action: 'unpublish' }, 409, 'this PoC has no Dashboard that Inspire built'],
    [{ history: [BUILT] }, { asset: 'genie_space', action: 'stop' }, 400, null],
  ];
  for (const [overrides, body, status, error] of cases) {
    await withApp(overrides, async (url, made) => {
      const got = await call(url, `/api/inspire/implement/control?${Q}`, { method: 'POST', body });
      assert.equal(got.status, status, JSON.stringify(got.data));
      if (error) assert.equal(got.data.error, error);
      assert.ok(!made.fetches.some((f) => ['POST', 'DELETE'].includes(f.opts.method)), `${body.asset} ${body.action} changed nothing`);
      assert.ok(!made.sqlCalls.some((c) => String(c.sql).includes('__inspire_control_log')), 'a refused click writes no log row');
    });
  }
});

test('a failed Databricks call is logged as failed and reported with its reason', async () => {
  await withApp({ history: [BUILT], responses: {
    'GET /api/2.0/lakeview/dashboards/d1': [{ lifecycle_state: 'ACTIVE' }],
    'POST /api/2.0/lakeview/dashboards/d1/published': [{ message: 'PERMISSION_DENIED: no CAN_MANAGE' }, 403],
  } }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/control?${Q}`, { method: 'POST', body: { asset: 'dashboard', action: 'publish' } });
    assert.equal(got.status, 403);
    assert.equal(got.data.error, 'Publish the dashboard failed: PERMISSION_DENIED: no CAN_MANAGE');
    const sent = made.fetches.find((f) => f.path === '/api/2.0/lakeview/dashboards/d1/published');
    assert.deepEqual(JSON.parse(sent.opts.body), { warehouse_id: 'wh1', embed_credentials: true });
    const logged = made.sqlCalls.find((c) => String(c.sql).startsWith('INSERT INTO `main`.`inspire`.`__inspire_control_log`'));
    assert.equal(logged.parameters.find((p) => p.name === 'result').value, 'failed');
  });
});

test('stopping a build cancels the run of the version that builds', async () => {
  const building = { ...BUILT, spec_version: 3, status: 'previewing', implement_run_id: '901' };
  await withApp({ history: [building, BUILT], implementRun: { run_id: 901, state: { life_cycle_state: 'RUNNING' } },
    responses: { 'POST /api/2.1/jobs/runs/cancel': [{}] } }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/control?${Q}`, { method: 'POST', body: { asset: 'build', action: 'cancel' } });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(got.data.asset_id, '901');
    assert.deepEqual(JSON.parse(made.fetches.find((f) => f.path === '/api/2.1/jobs/runs/cancel').opts.body), { run_id: 901 });
  });
});

test('live status lists the latest control actions, tolerates a missing control log and fails on any other error', async () => {
  const done = { asset: 'app', asset_id: 'churn-desk', action: 'stop', result: 'done', message: 'Stop the App: done', acted_by: 'amr@x', acted_at: '2026-10-26 10:00:00' };
  await withApp({ history: [BUILT], controlLog: [done], responses: { 'GET /api/2.0/apps/churn-desk': [APP_OURS] } }, async (url) => {
    const got = await call(url, `/api/inspire/implement/live?${Q}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(got.data.actions, [done]);
    assert.deepEqual(got.data.targets, { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk', alert: 'a1', job: '77' });
    assert.equal(got.data.assets.app.ok, true);
  });
  await withApp({ history: [BUILT], controlLogError: '[TABLE_OR_VIEW_NOT_FOUND] The table or view `main`.`inspire`.`__inspire_control_log` cannot be found.' },
    async (url) => {
      const got = await call(url, `/api/inspire/implement/live?${Q}`);
      assert.equal(got.status, 200, JSON.stringify(got.data));
      assert.deepEqual(got.data.actions, []);
    });
  await withApp({ history: [BUILT], controlLogError: 'PERMISSION_DENIED: no SELECT on __inspire_control_log' }, async (url) => {
    const got = await call(url, `/api/inspire/implement/live?${Q}`);
    assert.equal(got.status, 500);
    assert.match(got.data.error, /PERMISSION_DENIED/);
  });
});

const viewUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'implementControl.js')).href;
const wizardUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'implementWizard.js')).href;
const view = () => import(viewUrl);
const LIVE_TARGETS = { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk', alert: 'a1', job: '77' };
const LATEST = {
  spec_version: 2, status: 'ready', dashboard_url: 'https://w/dashboardsv3/d1/published', genie_space_url: 'https://w/genie/rooms/g1',
  app_url: 'https://churn-desk-1.aws.databricksapps.com', alert_url: 'https://w/sql/alerts-v2/a1',
  spec_json: { schedule: { enabled: true, cron: '0 0 6 * * ?' }, outputs: { dashboard: true, genie_space: true, app: true, app_name: 'churn-desk', alert: true } },
};
const app = (compute, appState = 'RUNNING', message = '') => ({ ok: true, name: 'churn-desk', compute_state: compute, app_state: appState, app_message: message });
const row = (rows, id) => rows.find((r) => r.id === id);
const actionsOf = (r) => r.actions.map((a) => `${a.asset}:${a.action}`);

test('the control tower lists the build, the job and each output Inspire built, in that order, and nothing it did not build', async () => {
  const v = await view();
  const live = { targets: { ...LIVE_TARGETS, build: '901' }, assets: { dashboard: { ok: true, published: true }, genie_space: { ok: true, title: 'Churn' },
    app: app('ACTIVE'), alert: { ok: true, state: 'OK' }, job: { ok: true, schedule: null, active_runs: [] } } };
  assert.deepEqual(v.controlRows(live, { ...LATEST, status: 'previewing' }).map((r) => r.id), ['build', 'job', 'dashboard', 'genie_space', 'app', 'alert']);
  const some = v.controlRows({ targets: { dashboard: 'd1' }, assets: { dashboard: { ok: true, published: false } } }, LATEST);
  assert.deepEqual(some.map((r) => r.id), ['dashboard'], 'no row for an output Inspire did not build');
  assert.deepEqual(v.controlRows(null, LATEST), []);
  assert.deepEqual(row(some, 'dashboard').url, LATEST.dashboard_url);
  assert.equal(row(v.controlRows(live, LATEST), 'genie_space').name, 'Churn');
  assert.deepEqual(row(v.controlRows(live, { ...LATEST, status: 'previewing' }), 'build'),
    { id: 'build', label: 'Build', name: 'spec v2', removable: false, state: { label: 'Building', tone: 'busy' }, detail: 'previewing', actions: [{ asset: 'build', action: 'cancel', label: 'Stop the build', danger: true }] });
});

test('each App state offers only the action that makes sense, and a crashed App on running compute reads as an error', async () => {
  const v = await view();
  const appRow = (entry) => row(v.controlRows({ targets: { app: 'churn-desk' }, assets: { app: entry } }, LATEST), 'app');
  assert.deepEqual([appRow(app('ACTIVE')).state, actionsOf(appRow(app('ACTIVE')))], [{ label: 'Running', tone: 'success' }, ['app:stop']]);
  assert.equal(appRow(app('ACTIVE', 'RUNNING', 'App has status: App is running')).detail, '', 'a running App says nothing more');
  assert.equal(appRow(app('STOPPED', 'UNAVAILABLE', 'App has not been deployed')).detail, 'App has not been deployed');
  assert.deepEqual([appRow(app('STOPPED', 'UNAVAILABLE')).state, actionsOf(appRow(app('STOPPED', 'UNAVAILABLE')))], [{ label: 'Stopped', tone: 'idle' }, ['app:start']]);
  assert.deepEqual(actionsOf(appRow(app('ERROR'))), ['app:start']);
  for (const moving of ['STARTING', 'STOPPING', 'UPDATING', 'DELETING']) assert.deepEqual(actionsOf(appRow(app(moving))), [], moving);
  const crashed = appRow(app('ACTIVE', 'CRASHED', "TypeError: 'dict' object is not callable"));
  assert.deepEqual([crashed.state, crashed.detail, actionsOf(crashed)], [{ label: 'App crashed', tone: 'error' }, "TypeError: 'dict' object is not callable", ['app:stop']]);
  const gone = appRow({ ok: false, error: 'the App no longer exists' });
  assert.deepEqual([gone.state, gone.detail, gone.actions, gone.removable], [{ label: 'Cannot read', tone: 'error' }, 'the App no longer exists', [], true],
    'an App that cannot be read offers no stop or start, but can still be removed');
  assert.equal(appRow(undefined).detail, 'Inspire has not read it yet');
});

test('the dashboard, Genie space, alert and job rows read their live state and offer only their own actions', async () => {
  const v = await view();
  const one = (id, entry, latest = LATEST) => row(v.controlRows({ targets: { [id]: LIVE_TARGETS[id] }, assets: { [id]: entry } }, latest), id);
  assert.deepEqual(actionsOf(one('dashboard', { ok: true, published: true, published_at: '2026-10-26' })), ['dashboard:unpublish']);
  assert.equal(one('dashboard', { ok: true, published: true, published_at: '2026-10-26' }).detail, 'Published 2026-10-26');
  assert.deepEqual(actionsOf(one('dashboard', { ok: true, published: false })), ['dashboard:publish']);
  assert.deepEqual([one('dashboard', { ok: true, trashed: true, published: true }).state.label, one('dashboard', { ok: true, trashed: true }).actions], ['In the trash', []]);
  assert.deepEqual([one('genie_space', { ok: true }).state, one('genie_space', { ok: true }).actions], [{ label: 'Live', tone: 'success' }, []]);
  assert.deepEqual(['TRIGGERED', 'OK', 'ERROR', 'UNKNOWN', '', 'PAUSED_STATE'].map((s) => one('alert', { ok: true, state: s }).state),
    [{ label: 'Triggered', tone: 'warning' }, { label: 'OK', tone: 'success' }, { label: 'Check failed', tone: 'error' },
      { label: 'Not checked yet', tone: 'idle' }, { label: 'Not checked yet', tone: 'idle' }, { label: 'PAUSED_STATE', tone: 'warning' }],
    'a failed check is an error, never read as not checked');
  assert.equal(one('alert', { ok: true, state: 'OK', checked_at: '2026-10-26T06:00:05Z' }).detail, 'The latest check found nothing to act on (checked 2026-10-26T06:00:05Z)');
  assert.equal(one('alert', { ok: true, state: 'ERROR' }).detail, 'The alert query failed on its latest check; open the alert to see why');
  assert.deepEqual(one('alert', { ok: true, state: 'OK' }).actions, []);
  const running = one('job', { ok: true, schedule: { cron: '0 0 6 * * ?', timezone: 'UTC', paused: true }, active_runs: [{ run_id: 5, url: 'https://w/run/5' }] });
  assert.deepEqual([running.state, running.detail, running.url, actionsOf(running), running.removable],
    [{ label: '1 running', tone: 'busy' }, 'Schedule paused: 0 0 6 * * ? (UTC)', 'https://w/run/5', ['job:cancel'], false]);
  assert.deepEqual(running.schedule, { label: 'Pause the schedule', on: true }, 'the schedule button follows the spec the agent applies');
  const idle = one('job', { ok: true, schedule: null, active_runs: [] }, { ...LATEST, spec_json: { ...LATEST.spec_json, schedule: { enabled: false } } });
  assert.deepEqual([idle.state.label, idle.detail, idle.actions, idle.schedule.label], ['Idle', 'No schedule', [], 'Resume the schedule']);
  const blind = one('job', { ok: true, schedule: null, active_runs: null, runs_error: 'HTTP 403' });
  assert.deepEqual([blind.state.label, blind.detail, blind.actions], ['Runs unknown', 'No schedule. Inspire cannot read its runs: HTTP 403', []]);
});

test('Remove submits a version that deletes only that output, which the backend accepts and plans as one delete', async () => {
  const v = await view();
  const w = await import(wizardUrl);
  const spec = w.defaultSpecFromUseCase({ id: 'N01-U01', Name: 'Predict churn' }, { warehouseId: 'wh1', inspireDatabase: 'main.inspire', owner: 'amr@example.com' });
  const before = { ...spec, outputs: { ...spec.outputs, genie_space: true, app: true, app_name: 'churn-desk', alert: true, alert_recipients: ['amr@example.com'] },
    removed_outputs: { app: 'keep' } };
  const latest = { spec_version: 2, spec_json: before };
  const changes = v.removeChanges(latest, 'dashboard');
  assert.deepEqual(changes.removed_outputs, { app: 'keep', dashboard: 'delete' });
  assert.equal(changes.outputs.dashboard, false);
  assert.deepEqual(['genie_space', 'app', 'alert'].map((n) => changes.outputs[n]), [true, true, true]);
  const next = I.validateImplementSpec(w.nextSpecFrom(latest, changes));
  assert.deepEqual(next.errors, []);
  const prior = I.validateImplementSpec(before).spec;
  const plan = I.implementChangeSummary(prior, next.spec, { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk', alert: 'a1' });
  assert.deepEqual([plan.delete, plan.build, plan.refresh, plan.keep_unmanaged, plan.undecided], [['dashboard'], [], [], [], []]);
  assert.ok(plan.classes.includes('deselect'));
});

test('Remove needs the exact use case id typed, and nothing else confirms it', async () => {
  const v = await view();
  assert.equal(v.removeConfirmed('N01-U01', 'N01-U01'), true);
  assert.equal(v.removeConfirmed('  N01-U01 ', 'N01-U01'), true);
  for (const typed of ['', 'n01-u01', 'N01-U0', 'N01-U01x', 'yes', null, undefined]) assert.equal(v.removeConfirmed(typed, 'N01-U01'), false, String(typed));
  assert.equal(v.removeConfirmed('', ''), false, 'an empty id never confirms');
  assert.equal(v.controlActionText({ message: 'Stop the App: done', acted_by: 'amr@x', acted_at: '2026-10-26 10:00:00' }), 'Stop the App: done by amr@x, 2026-10-26 10:00:00');
  assert.equal(v.controlActionText({ asset: 'app', action: 'stop' }), 'app stop');
});

test('the control log is handed to the owner of the other tracking tables, so people can read the audit, and never to a name that breaks the SQL', () => {
  const log = '`main`.`inspire`.`__inspire_control_log`';
  const rows = (impl, ctl) => [{ table_name: '__inspire_implement', table_owner: impl }, { table_name: '__inspire_control_log', table_owner: ctl }];
  assert.equal(C.controlLogOwnerFix(rows('amr@example.com', 'sp-1'), log), 'ALTER TABLE `main`.`inspire`.`__inspire_control_log` OWNER TO `amr@example.com`');
  assert.equal(C.controlLogOwnerFix(rows('amr@example.com', 'amr@example.com'), log), '', 'already the same owner');
  assert.equal(C.controlLogOwnerFix([{ table_name: '__inspire_implement', table_owner: 'amr@example.com' }], log), '', 'no log yet');
  assert.equal(C.controlLogOwnerFix([], log), '');
  assert.equal(C.controlLogOwnerFix(rows('a`b', 'sp-1'), log), '', 'an owner name with a backtick is never put in SQL');
  const q = C.controlLogOwnerSql('main', 'inspire');
  assert.equal(q.sql, "SELECT table_name, table_owner FROM `main`.information_schema.tables WHERE table_schema = :schema AND table_name IN ('__inspire_implement', '__inspire_control_log')");
  assert.deepEqual(q.parameters, [{ name: 'schema', value: 'inspire', type: 'STRING' }]);
});

test('the first action hands the App-created control log to the tracking tables\' owner once, and a failed hand-over is a warning, not a refusal', async () => {
  const owners = [{ table_name: '__inspire_implement', table_owner: 'amr@example.com' }, { table_name: '__inspire_control_log', table_owner: 'sp-1' }];
  const responses = { 'GET /api/2.0/apps/churn-desk': [APP_OURS], 'POST /api/2.0/apps/churn-desk/stop': [{}], 'POST /api/2.0/apps/churn-desk/start': [{}] };
  await withApp({ history: [BUILT], tableOwners: owners, responses }, async (url, made) => {
    const stop = await call(url, `/api/inspire/implement/control?${Q}`, { method: 'POST', body: { asset: 'app', action: 'stop' } });
    assert.equal(stop.status, 200, JSON.stringify(stop.data));
    assert.equal(stop.data.audit_error, '');
    const alters = () => made.sqlCalls.filter((c) => String(c.sql).startsWith('ALTER TABLE'));
    assert.deepEqual(alters().map((c) => c.sql), ['ALTER TABLE `main`.`inspire`.`__inspire_control_log` OWNER TO `amr@example.com`']);
    const order = made.sqlCalls.map((c) => String(c.sql).split(' ')[0]);
    assert.ok(order.indexOf('ALTER') < order.indexOf('INSERT'), 'the owner changes before the first row is written');
    assert.equal((await call(url, `/api/inspire/implement/control?${Q}`, { method: 'POST', body: { asset: 'app', action: 'start' } })).status, 200);
    assert.equal(made.sqlCalls.filter((c) => String(c.sql).startsWith('SELECT table_name, table_owner FROM')).length, 1, 'checked once per App process');
    assert.equal(alters().length, 1);
  });
  await withApp({ history: [BUILT], tableOwners: owners, sqlErrors: { 'ALTER TABLE': 'PERMISSION_DENIED: no MANAGE on the table' }, responses }, async (url, made) => {
    const stop = await call(url, `/api/inspire/implement/control?${Q}`, { method: 'POST', body: { asset: 'app', action: 'stop' } });
    assert.equal(stop.status, 200, 'the App still stops');
    assert.equal(stop.data.audit_error, '__inspire_control_log keeps the App as its owner, so only the App can read it: PERMISSION_DENIED: no MANAGE on the table');
    assert.ok(made.fetches.some((f) => f.path === '/api/2.0/apps/churn-desk/stop'));
    assert.ok(made.sqlCalls.some((c) => String(c.sql).startsWith('INSERT INTO `main`.`inspire`.`__inspire_control_log`')), 'the action is still recorded');
  });
});
