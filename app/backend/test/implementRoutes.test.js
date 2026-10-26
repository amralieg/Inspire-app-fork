const test = require('node:test');
const assert = require('node:assert/strict');
const { makeApp, json, listen } = require('./support/implementApp');
const I = require('../lib/inspireImplement');

async function call(base, path, opts = {}) {
  const resp = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await resp.json();
  return { status: resp.status, data };
}

const Q = 'inspire_database=main.inspire&warehouse_id=wh1&session_id=42&use_case_id=N01-U01';
const OUT = 'result_table=main.inspire.churn_out';

const SPEC = {
  use_case_id: 'N01-U01',
  use_case_name: 'Predict churn',
  config: { warehouse_id: 'wh1', result_table: 'main.inspire.churn_out' },
  outputs: { dashboard: true },
};

test('context returns the use case, widgets and empty history', async () => {
  const { app } = makeApp();
  const srv = await listen(app);
  try {
    const got = await call(srv.url, `/api/inspire/implement/context?${Q}`);
    assert.equal(got.status, 200);
    assert.equal(got.data.use_case.id, 'N01-U01');
    assert.equal(got.data.discovery_type, 'Deep');
    assert.ok(got.data.widgets.some((w) => w.name === 'top_k'));
    assert.equal(got.data.me.username, 'amr@x');
  } finally {
    await srv.close();
  }
});

test('preflight disables Apps when the workspace returns 404', async () => {
  const { app } = makeApp({ appsOk: false, spacesOk: true });
  const srv = await listen(app);
  try {
    const got = await call(srv.url, `/api/inspire/implement/preflight?${Q}&${OUT}&app_name=churn-desk`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(got.data.features.apps, false);
    assert.equal(got.data.checks.apps.ok, false);
    assert.equal(got.data.checks.warehouse.ok, true);
    assert.equal(got.data.ok, false);
  } finally {
    await srv.close();
  }
});

test('submit writes the spec then launches an implement job', async () => {
  const { app, jobs, sqlCalls } = makeApp();
  const srv = await listen(app);
  try {
    const got = await call(srv.url, '/api/inspire/implement/submit', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: SPEC },
    });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(got.data.spec_version, 1);
    assert.equal(got.data.run_id, 99);
    assert.equal(jobs[0].jobType, 'implement');
    assert.equal(jobs[0].params['15_operation'], 'Implement Use Cases');
    assert.equal(jobs[0].params.inspire_implement_use_case, 'N01-U01');
    assert.ok(sqlCalls.some((c) => String(c.sql).includes('CREATE TABLE IF NOT EXISTS')));
    assert.ok(sqlCalls.some((c) => String(c.sql).includes('INSERT INTO')));
  } finally {
    await srv.close();
  }
});

test('behind the Apps proxy the wizard and the spec row name the signed-in person, and the checks name the identity that ran them', async () => {
  const sp = { userName: 'c008a947-727f-4779-bd49-3aeb8fd1a2da', displayName: 'app-p50o0f inspire-ai-implement' };
  const { app, sqlCalls } = makeApp({ me: sp });
  const srv = await listen(app);
  const headers = { 'x-forwarded-email': 'person@x.com' };
  try {
    const context = await call(srv.url, `/api/inspire/implement/context?${Q}`, { headers });
    assert.deepEqual(context.data.me, { username: 'person@x.com' });
    const local = await call(srv.url, `/api/inspire/implement/context?${Q}`);
    assert.deepEqual(local.data.me, { username: sp.userName });
    const preflight = await call(srv.url, `/api/inspire/implement/preflight?${Q}&${OUT}`, { headers });
    assert.equal(preflight.data.identity, 'amr@x');
    const got = await call(srv.url, '/api/inspire/implement/submit', {
      method: 'POST',
      headers,
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: SPEC },
    });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    const insert = sqlCalls.find((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(insert.parameters.find((p) => p.name === 'by').value, 'person@x.com');
  } finally {
    await srv.close();
  }
  await withApp({ me: sp, accessError: 'PERMISSION_DENIED: You do not have CAN_USE on warehouse wh1' }, async (url) => {
    const blocked = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}`, { headers });
    assert.equal(blocked.data.checks.warehouse.ok, false);
    assert.equal(blocked.data.identity, sp.userName);
  });
});

test('submit 409s while a run is still active', async () => {
  const { app } = makeApp({
    history: [{ spec_version: 1, status: 'filling', spec_json: SPEC, use_case_id: 'N01-U01' }],
  });
  const srv = await listen(app);
  try {
    const got = await call(srv.url, '/api/inspire/implement/submit', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: SPEC },
    });
    assert.equal(got.status, 409);
    assert.match(got.data.error, /still filling/);
  } finally {
    await srv.close();
  }
});

const SUBMIT = { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: SPEC };
const RAIL = 'inspire_database=main.inspire&warehouse_id=wh1&session_id=42';

test('submit records the run it started on the version it wrote', async () => {
  await withApp({}, async (url, made) => {
    const got = await call(url, '/api/inspire/implement/submit', { method: 'POST', body: SUBMIT });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    const writes = made.sqlCalls.filter((c) => /^(INSERT|UPDATE)/.test(String(c.sql)));
    assert.deepEqual(writes.map((c) => String(c.sql).split(' ')[0]), ['INSERT', 'UPDATE']);
    assert.match(writes[1].sql, /SET implement_run_id = :run, status_message = CASE WHEN status = 'queued'/);
    assert.deepEqual(writes[1].parameters.map((p) => [p.name, p.value]),
      [['run', '99'], ['message', 'https://example/#job/7/run/99'], ['sid', '42'], ['uc', 'N01-U01'], ['v', '1']]);
  });
});

test('a version whose run could not start is failed with the reason, so it never blocks the next one', async () => {
  await withApp({ triggerError: 'RESOURCE_EXHAUSTED: too many concurrent runs' }, async (url, made) => {
    const got = await call(url, '/api/inspire/implement/submit', { method: 'POST', body: SUBMIT });
    assert.equal(got.status, 500);
    assert.match(got.data.error, /too many concurrent runs/);
    const writes = made.sqlCalls.filter((c) => /^(INSERT|UPDATE)/.test(String(c.sql)));
    assert.deepEqual(writes.map((c) => String(c.sql).split(' ')[0]), ['INSERT', 'UPDATE']);
    assert.match(writes[1].sql, /SET status = 'failed', status_message = :message, updated_at = current_timestamp\(\) .* AND status = 'queued'$/);
    assert.deepEqual(writes[1].parameters.map((p) => [p.name, p.value]), [['message', 'the Implement run could not start: RESOURCE_EXHAUSTED: too many concurrent runs'],
      ['sid', '42'], ['uc', 'N01-U01'], ['v', '1']]);
  });
});

test('a session without UC metadata is refused before a spec row is written', async () => {
  await withApp({ ucMetadata: '' }, async (url, made) => {
    const got = await call(url, '/api/inspire/implement/submit', { method: 'POST', body: SUBMIT });
    assert.equal(got.status, 400);
    assert.match(got.data.error, /no UC metadata/);
    assert.ok(!made.sqlCalls.some((c) => /^(INSERT|UPDATE)/.test(String(c.sql))));
    assert.equal(made.jobs.length, 0);
  });
});

test('a version whose run ended while it was still active shows as stalled, and a new version may replace it', async () => {
  const history = [{ spec_version: 1, status: 'filling', spec_json: SPEC, use_case_id: 'N01-U01', implement_run_id: '1066484287074577',
    updated_at: new Date().toISOString() }];
  const ended = { run_id: 1066484287074577, run_page_url: 'https://x/run/1066484287074577',
    state: { life_cycle_state: 'TERMINATED', result_state: 'CANCELED', state_message: 'Run cancelled by amr@x' } };
  const stalled = { run_id: '1066484287074577', run_url: 'https://x/run/1066484287074577',
    reason: 'the run building v1 ended (CANCELED: Run cancelled by amr@x) while v1 was still filling' };
  await withApp({ history, implementRun: ended }, async (url, made) => {
    const status = await call(url, `/api/inspire/implement/status?${Q}`);
    assert.equal(status.status, 200, JSON.stringify(status.data));
    assert.deepEqual(status.data.stalled, stalled);
    assert.ok(made.fetches.some((f) => f.path === '/api/2.1/jobs/runs/get?run_id=1066484287074577'));
    const rail = await call(url, `/api/inspire/implement/history?${RAIL}`);
    assert.deepEqual(rail.data.latest.map((r) => r.stalled), [stalled]);
    const got = await call(url, '/api/inspire/implement/submit', { method: 'POST', body: SUBMIT });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(got.data.spec_version, 2);
  });
  await withApp({ history, implementRun: { run_id: 1066484287074577, state: { life_cycle_state: 'RUNNING' } } }, async (url) => {
    const status = await call(url, `/api/inspire/implement/status?${Q}`);
    assert.equal(status.data.stalled, null);
    const got = await call(url, '/api/inspire/implement/submit', { method: 'POST', body: SUBMIT });
    assert.equal(got.status, 409);
    assert.match(got.data.error, /still filling/);
  });
  await withApp({ history, implementRun: { error_code: 'PERMISSION_DENIED', message: 'no access' }, implementRunStatus: 403 }, async (url) => {
    const status = await call(url, `/api/inspire/implement/status?${Q}`);
    assert.equal(status.data.stalled, null, 'a run Inspire cannot read is not called stopped while the version is still recent');
  });
  const old = [{ ...history[0], implement_run_id: null, updated_at: '2026-01-01T00:00:00Z' }];
  await withApp({ history: old }, async (url, made) => {
    const status = await call(url, `/api/inspire/implement/status?${Q}`);
    assert.match(status.data.stalled.reason, /^v1 has been filling with no progress since 2026-01-01T00:00:00.000Z/);
    assert.ok(!made.fetches.some((f) => f.path.startsWith('/api/2.1/jobs/runs/get')), 'a version without a run id is never looked up');
  });
  await withApp({ history: [{ ...history[0], status: 'ready' }] }, async (url, made) => {
    const status = await call(url, `/api/inspire/implement/status?${Q}`);
    assert.equal(status.data.stalled, null);
    await call(url, `/api/inspire/implement/history?${RAIL}`);
    assert.ok(!made.fetches.some((f) => f.path.startsWith('/api/2.1/jobs/runs/get')), 'a finished version never costs a run lookup');
  });
});

test('an invalid spec is 400 and does not launch a job', async () => {
  const { app, jobs } = makeApp();
  const srv = await listen(app);
  try {
    const got = await call(srv.url, '/api/inspire/implement/submit', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: { use_case_id: '' } },
    });
    assert.equal(got.status, 400);
    assert.equal(jobs.length, 0);
  } finally {
    await srv.close();
  }
});

const ALERT_SPEC = {
  ...SPEC,
  outputs: { dashboard: true, alert: true, alert_recipients: ['owner@x.com'], alert_destinations: [{ id: '1234abcd-ef', name: 'Slack' }] },
};

test('submit on a table from an older build adds the alert columns before it writes the spec', async () => {
  const { app, sqlCalls, altered, state } = makeApp();
  state.implementColumns = state.implementColumns.filter((c) => c !== 'alert_id' && c !== 'alert_url');
  const srv = await listen(app);
  try {
    const got = await call(srv.url, '/api/inspire/implement/submit', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: ALERT_SPEC },
    });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(altered, [{ table: '`main`.`inspire`.`__inspire_implement`', columns: [['alert_id', 'STRING'], ['alert_url', 'STRING']] }]);
    const describeAt = sqlCalls.findIndex((c) => String(c.sql).startsWith('DESCRIBE TABLE'));
    const insertAt = sqlCalls.findIndex((c) => String(c.sql).includes('INSERT INTO'));
    assert.ok(describeAt >= 0 && insertAt > describeAt);
    const stored = JSON.parse(sqlCalls[insertAt].parameters.find((p) => p.name === 'spec').value);
    assert.equal(stored.outputs.alert_tiers, 'act_now');
    assert.equal(stored.outputs.alert_threshold, 1);
    assert.deepEqual(stored.outputs.alert_recipients, ['owner@x.com']);
  } finally {
    await srv.close();
  }
});

test('submit on a current table alters nothing', async () => {
  const { app, altered } = makeApp();
  const srv = await listen(app);
  try {
    const got = await call(srv.url, '/api/inspire/implement/submit', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: SPEC },
    });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(altered, []);
  } finally {
    await srv.close();
  }
});

test('an alert with nobody to notify is 400 and launches nothing', async () => {
  const { app, jobs } = makeApp();
  const srv = await listen(app);
  try {
    const got = await call(srv.url, '/api/inspire/implement/submit', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: { ...SPEC, outputs: { dashboard: true, alert: true } } },
    });
    assert.equal(got.status, 400);
    assert.match(got.data.error, /at least one recipient email or notification destination/);
    assert.equal(jobs.length, 0);
  } finally {
    await srv.close();
  }
});

test('history on a table from an older build reads the missing columns as empty instead of failing', async () => {
  const history = [{ spec_version: 1, status: 'ready', use_case_id: 'N01-U01', spec_json: JSON.stringify(SPEC), dashboard_id: 'd1' }];
  const { app, sqlCalls, state, altered } = makeApp({ history });
  state.implementColumns = state.implementColumns.filter((c) => c !== 'alert_id' && c !== 'alert_url');
  const srv = await listen(app);
  try {
    const got = await call(srv.url, `/api/inspire/implement/context?${Q}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(got.data.history.length, 1);
    assert.equal(got.data.history[0].dashboard_id, 'd1');
    const selects = sqlCalls.filter((c) => String(c.sql).startsWith('SELECT') && String(c.sql).includes('__inspire_implement'));
    assert.ok(selects.some((c) => c.sql.includes('NULL AS `alert_id`') && c.sql.includes('NULL AS `alert_url`')));
    assert.deepEqual(altered, [], 'a read never alters the table');
  } finally {
    await srv.close();
  }
});

test('preflight blocks an alert only when the alert was asked for and alerts are unavailable', async () => {
  const { app } = makeApp({ alertsOk: false });
  const srv = await listen(app);
  try {
    const asked = await call(srv.url, `/api/inspire/implement/preflight?${Q}&${OUT}&alert=1`);
    assert.equal(asked.status, 200);
    assert.equal(asked.data.ok, false);
    assert.equal(asked.data.checks.alerts.ok, false);
    assert.equal(asked.data.features.alerts, false);
    const notAsked = await call(srv.url, `/api/inspire/implement/preflight?${Q}&${OUT}`);
    assert.equal(notAsked.data.ok, true, JSON.stringify(notAsked.data));
    assert.equal(notAsked.data.features.alerts, false);
  } finally {
    await srv.close();
  }
  const ok = makeApp();
  const srv2 = await listen(ok.app);
  try {
    const got = await call(srv2.url, `/api/inspire/implement/preflight?${Q}&${OUT}&alert=1`);
    assert.equal(got.data.ok, true);
    assert.equal(got.data.features.alerts, true);
  } finally {
    await srv2.close();
  }
});

test('destinations list every page, drop entries without a usable id, and pass errors through', async () => {
  const { app } = makeApp({
    destinations: [
      { results: [{ id: '1234abcd-ef01', display_name: 'Churn Slack', destination_type: 'SLACK' }, { id: 'x', display_name: 'bad' }], next_page_token: '1' },
      { results: [{ id: 'abcdef12-3456', destination_type: 'MICROSOFT_TEAMS' }] },
    ],
  });
  const srv = await listen(app);
  try {
    const got = await call(srv.url, '/api/inspire/implement/destinations');
    assert.equal(got.status, 200);
    assert.deepEqual(got.data.destinations, [
      { id: '1234abcd-ef01', name: 'Churn Slack', type: 'slack' },
      { id: 'abcdef12-3456', name: 'abcdef12-3456', type: 'microsoft_teams' },
    ]);
  } finally {
    await srv.close();
  }
  const denied = makeApp({ destinations: { message: 'User is not authorized' }, destinationsStatus: 403 });
  const srv2 = await listen(denied.app);
  try {
    const got = await call(srv2.url, '/api/inspire/implement/destinations');
    assert.equal(got.status, 403);
    assert.match(got.data.error, /not authorized/);
  } finally {
    await srv2.close();
  }
});

test('a Studio re-run is a preview of the notebook task only, so the alert task never fires on it', async () => {
  const history = [{ spec_version: 2, status: 'ready', use_case_id: 'N01-U01', job_id: 77, spec_json: JSON.stringify(ALERT_SPEC),
    genie_widgets: JSON.stringify([{ name: 'top_k', type: 'text', default: '25' }]) }];
  const { app, fetches } = makeApp({ history });
  const srv = await listen(app);
  try {
    const got = await call(srv.url, `/api/inspire/implement/rerun?${Q}`, { method: 'POST', body: { overrides: { top_k: '10' } } });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    const runNow = fetches.find((f) => f.path === '/api/2.1/jobs/run-now');
    assert.deepEqual(JSON.parse(runNow.opts.body), { job_id: 77, notebook_params: { top_k: '10', run_profile: 'preview' }, only: ['inspire_task'] });
  } finally {
    await srv.close();
  }
});

const TWO_TABLES = { id: 'N01-U01', use_case: 'Predict churn', primary_table: 'main.s.orders', tables_involved: 'main.s.orders,main.s.returns' };

test('submit refuses to remove the primary table and never writes or launches', async () => {
  const { app, jobs, sqlCalls } = makeApp({ useCase: TWO_TABLES });
  const srv = await listen(app);
  try {
    const got = await call(srv.url, '/api/inspire/implement/submit', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42',
        spec: { ...SPEC, data: { removed_tables: ['main.s.orders'] } } },
    });
    assert.equal(got.status, 400);
    assert.match(got.data.error, /main\.s\.orders is the primary table of this use case; swap it instead of removing it/);
    assert.equal(jobs.length, 0);
    assert.ok(!sqlCalls.some((c) => String(c.sql).includes('INSERT INTO')));
  } finally {
    await srv.close();
  }
});

test('submit accepts removing a side table and stores it in the spec', async () => {
  const { app, sqlCalls } = makeApp({ useCase: TWO_TABLES });
  const srv = await listen(app);
  try {
    const got = await call(srv.url, '/api/inspire/implement/submit', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42',
        spec: { ...SPEC, data: { removed_tables: ['main.s.returns'] } } },
    });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    const insert = sqlCalls.find((c) => String(c.sql).includes('INSERT INTO'));
    const spec = JSON.parse(insert.parameters.find((p) => p.name === 'spec').value);
    assert.deepEqual(spec.data.removed_tables, ['main.s.returns']);
  } finally {
    await srv.close();
  }
});

test('submit 404s for a use case that is not in the session', async () => {
  const { app, jobs } = makeApp({ useCase: null });
  const srv = await listen(app);
  try {
    const got = await call(srv.url, '/api/inspire/implement/submit', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: SPEC },
    });
    assert.equal(got.status, 404);
    assert.match(got.data.error, /No use case N01-U01 in this session/);
    assert.equal(jobs.length, 0);
  } finally {
    await srv.close();
  }
});

test('plan returns the change list for the pending edit without writing or launching', async () => {
  const built = { spec_version: 2, status: 'ready', use_case_id: 'N01-U01', dashboard_id: 'd1', notebook_path: '/W/nb',
    spec_json: { ...SPEC, outputs: { dashboard: true } } };
  const { app, jobs, sqlCalls } = makeApp({ useCase: TWO_TABLES, history: [built] });
  const srv = await listen(app);
  try {
    const got = await call(srv.url, '/api/inspire/implement/plan', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42',
        spec: { ...SPEC, based_on_version: 2, outputs: { dashboard: true, genie_space: true } } },
    });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(got.data.spec_version, 3);
    assert.equal(got.data.based_on_version, 2);
    assert.deepEqual(got.data.summary.classes, ['outputs']);
    assert.deepEqual(got.data.summary.build, ['genie_space']);
    assert.equal(got.data.summary.refill, false);
    assert.equal(jobs.length, 0);
    assert.ok(!sqlCalls.some((c) => /INSERT INTO|CREATE TABLE/.test(String(c.sql))));
  } finally {
    await srv.close();
  }
});

test('plan reports the same refusals submit would', async () => {
  const built = { spec_version: 2, status: 'ready', use_case_id: 'N01-U01', dashboard_id: 'd1', notebook_path: '/W/nb',
    spec_json: { ...SPEC, outputs: { dashboard: true } } };
  const { app } = makeApp({ useCase: TWO_TABLES, history: [built] });
  const srv = await listen(app);
  try {
    const same = await call(srv.url, '/api/inspire/implement/plan', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: { ...SPEC, based_on_version: 2 } },
    });
    assert.equal(same.status, 400);
    assert.match(same.data.error, /nothing changed since the last built version/);
    const primary = await call(srv.url, '/api/inspire/implement/plan', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42',
        spec: { ...SPEC, based_on_version: 2, data: { removed_tables: ['main.s.orders'] } } },
    });
    assert.equal(primary.status, 400);
    assert.match(primary.data.error, /is the primary table/);
  } finally {
    await srv.close();
  }
});

async function withApp(overrides, run) {
  const made = makeApp(overrides);
  const srv = await listen(made.app);
  try {
    await run(srv.url, made);
  } finally {
    await srv.close();
  }
}

const NOT_MINE_SCHEMA = [
  { level: 'catalog', privilege: 'OWNER', principal: 'admins', mine: 'false', me: 'amr@x' },
  { level: 'catalog', privilege: 'USE_CATALOG', principal: 'account users', mine: 'true', me: 'amr@x' },
  { level: 'schema', privilege: 'OWNER', principal: 'data-eng', mine: 'false', me: 'amr@x' },
];
const EXISTING = [...NOT_MINE_SCHEMA,
  { level: 'schema', privilege: 'USE_SCHEMA', principal: 'analysts', mine: 'true', me: 'amr@x' },
  { level: 'table', privilege: 'OWNER', principal: 'data-eng', mine: 'false', me: 'amr@x' },
  { level: 'table', privilege: 'MODIFY', principal: 'analysts', mine: 'true', me: 'amr@x' },
  { level: 'table', privilege: 'SELECT', principal: 'analysts', mine: 'true', me: 'amr@x' }];
const KEY_COLUMNS = ['use_case_id', 'run_id', 'as_of_date', 'score'].map((column_name) => ({ column_name }));
const CHECK = `/api/inspire/implement/output-check?${Q}&table=main.inspire.churn_out`;

test('the output check passes a new table the user can create and names what is missing otherwise', async () => {
  await withApp({}, async (url) => {
    const got = await call(url, CHECK);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(got.data.ok, true);
    assert.equal(got.data.identity, 'amr@x');
    assert.deepEqual(got.data.write, { ok: true, detail: 'you can create main.inspire.churn_out' });
    assert.deepEqual(got.data.safety, { ok: true, detail: 'main.inspire.churn_out is new; the first run creates it' });
  });
  await withApp({ access: NOT_MINE_SCHEMA }, async (url, made) => {
    const got = await call(url, CHECK);
    assert.equal(got.data.ok, false);
    assert.equal(got.data.write.detail, 'you need USE SCHEMA on main.inspire and CREATE TABLE on main.inspire to create main.inspire.churn_out');
    assert.ok(!made.sqlCalls.some((c) => String(c.sql).includes('COUNT_IF')), 'no row count when the user cannot write');
  });
  await withApp({}, async (url) => {
    const got = await call(url, `/api/inspire/implement/output-check?${Q}&table=main.out`);
    assert.equal(got.status, 400);
    assert.match(got.data.error, /result_table 'main.out' must be catalog.schema.table/);
  });
});

test('the output check refuses an existing table that is not an Inspire result table or that holds other use cases', async () => {
  await withApp({ access: EXISTING, columns: [{ column_name: 'order_id' }] }, async (url) => {
    const got = await call(url, CHECK);
    assert.equal(got.data.ok, false);
    assert.equal(got.data.write.ok, true);
    assert.match(got.data.safety.detail, /is not an Inspire result table \(it has no use_case_id, run_id and as_of_date\)/);
  });
  await withApp({ access: EXISTING, columns: KEY_COLUMNS, others: 4 }, async (url, made) => {
    const got = await call(url, CHECK);
    assert.equal(got.data.ok, false);
    assert.match(got.data.safety.detail, /already holds 4 row\(s\) of other use cases/);
    const counted = made.sqlCalls.find((c) => String(c.sql).includes('COUNT_IF'));
    assert.deepEqual(counted.parameters, [{ name: 'uc', value: 'N01-U01', type: 'STRING' }]);
  });
  await withApp({ access: EXISTING, columns: KEY_COLUMNS, others: 0 }, async (url) => {
    const got = await call(url, CHECK);
    assert.equal(got.data.ok, true);
    assert.equal(got.data.safety.detail, "main.inspire.churn_out holds only this use case's rows");
    assert.equal(got.data.grant.ok, false);
  });
  await withApp({ access: EXISTING, columns: [] }, async (url) => {
    const got = await call(url, CHECK);
    assert.equal(got.data.ok, true);
    assert.match(got.data.safety.detail, /its columns could not be read, so Inspire could not check whose rows it holds/);
  });
});

test('preflight checks the grant only when sharing, and names a warehouse that cannot run statements', async () => {
  await withApp({ access: EXISTING, columns: KEY_COLUMNS }, async (url) => {
    const shared = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}&share=1`);
    assert.equal(shared.data.ok, false);
    assert.equal(shared.data.checks.output.ok, true);
    assert.match(shared.data.checks.result_grant.detail, /you cannot share main.inspire.churn_out/);
    const solo = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}`);
    assert.equal(solo.data.ok, true, JSON.stringify(solo.data));
    assert.equal(solo.data.checks.result_grant, undefined);
  });
  await withApp({ accessError: 'PERMISSION_DENIED: You do not have CAN_USE on warehouse wh1' }, async (url) => {
    const got = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}`);
    assert.equal(got.status, 200);
    assert.equal(got.data.ok, false);
    assert.equal(got.data.checks.warehouse.detail, 'wh1 could not run a statement for you: PERMISSION_DENIED: You do not have CAN_USE on warehouse wh1');
    assert.equal(got.data.checks.output.ok, false);
  });
  await withApp({}, async (url) => {
    const got = await call(url, `/api/inspire/implement/preflight?${Q}`);
    assert.equal(got.status, 400);
    assert.match(got.data.error, /must be catalog.schema.table/);
  });
});

test('preflight refuses an App name used by another App, updates this use case\'s App, and checks the quota only for a new App', async () => {
  await withApp({ appExists: true, app: { name: 'churn-desk', description: 'Finance team tool' } }, async (url) => {
    const got = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}&app_name=churn-desk`);
    assert.equal(got.data.ok, false);
    assert.equal(got.data.checks.app_name.detail, "'churn-desk' is used by another App in this workspace; pick another name");
  });
  await withApp({ appExists: true, app: { name: 'churn-desk', description: 'Inspire use case N01-U01 (session 42): churn' } }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}&app_name=churn-desk`);
    assert.equal(got.data.ok, true, JSON.stringify(got.data));
    assert.match(got.data.checks.apps.detail, /no new App is needed/);
    assert.ok(!made.fetches.some((f) => f.path.includes('/api/2.0/apps?page_size=100')), 'no quota count for an App that exists');
  });
  const full = { apps: Array.from({ length: 100 }, (_, i) => ({ name: `app-${i}` })) };
  await withApp({ appsList: full }, async (url) => {
    const got = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}&app_name=churn-desk`);
    assert.equal(got.data.checks.app_name.ok, true);
    assert.deepEqual(got.data.checks.apps, { ok: false, detail: 'this workspace already has 100 of its 100 Apps; delete one or untick the App' });
    assert.equal(got.data.ok, false);
  });
  await withApp({ spacesOk: false }, async (url) => {
    const asked = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}&genie=1`);
    assert.deepEqual([asked.data.ok, asked.data.checks.genie_spaces.ok], [false, false]);
    const notAsked = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}`);
    assert.equal(notAsked.data.ok, true);
  });
});

const SP_ROW = (level, privilege, principal, mine) => ({ level, privilege, principal, mine: mine ? 'true' : 'false', me: 'inspire-sp' });
const SP_INSTALL = [SP_ROW('catalog', 'OWNER', 'amr@x', false), SP_ROW('schema', 'OWNER', 'amr@x', false),
  SP_ROW('table', 'OWNER', 'inspire-sp', true), SP_ROW('catalog', 'USE_CATALOG', 'inspire-sp', true),
  SP_ROW('schema', 'USE_SCHEMA', 'inspire-sp', true), SP_ROW('schema', 'CREATE_TABLE', 'inspire-sp', true)];
const SP_STATE = {
  access: SP_INSTALL,
  columns: KEY_COLUMNS,
  others: 0,
  me: { userName: 'inspire-sp', groups: [{ display: 'users' }] },
  warehousePermissions: { access_control_list: [{ service_principal_name: 'inspire-sp', all_permissions: [{ permission_level: 'CAN_USE' }] },
    { group_name: 'admins', all_permissions: [{ permission_level: 'CAN_MANAGE' }] }] },
};
const CANNOT_MANAGE = 'Inspire cannot manage wh1, so it cannot give a new App access to it: ask the warehouse owner to grant Inspire CAN MANAGE on it, or re-run the Inspire installer';

test('preflight disables a new App up front when its service principal could not read the table or Inspire cannot manage the warehouse', async () => {
  const gaps = [{ privilege: 'USE CATALOG', level: 'catalog', object: '`main`', owner: 'amr@x' },
    { privilege: 'USE SCHEMA', level: 'schema', object: '`main`.`inspire`', owner: 'amr@x' }];
  const principals = encodeURIComponent(JSON.stringify(['amr@x', 'planners']));
  await withApp(SP_STATE, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}&app_name=churn-desk&share=1&principals=${principals}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(got.data.checks.app_access,
      { ok: false, detail: `${I.appAccessMessage('main.inspire.churn_out', gaps, 'inspire-sp')}; ${CANNOT_MANAGE}` });
    assert.equal(got.data.ok, false);
    assert.equal(got.data.checks.result_grant.ok, true);
    assert.equal(got.data.checks.result_grant.warn, I.accessGapMessage('planners', gaps));
    assert.ok(made.fetches.some((f) => f.path === '/api/2.0/permissions/sql/warehouses/wh1'));
    const check = await call(url, CHECK);
    assert.equal(check.data.ok, true, 'App access never blocks the Data step');
    assert.equal(check.data.app.ok, false);
    assert.equal(check.data.grant.warn, undefined);
  });
  const managed = {
    ...SP_STATE,
    access: [...SP_INSTALL, SP_ROW('catalog', 'MANAGE', 'inspire-sp', true)],
    warehousePermissions: { access_control_list: [{ service_principal_name: 'inspire-sp', all_permissions: [{ permission_level: 'CAN_MANAGE' }] }] },
  };
  await withApp(managed, async (url) => {
    const got = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}&app_name=churn-desk&share=1&principals=${principals}`);
    assert.equal(got.data.ok, true, JSON.stringify(got.data));
    assert.equal(got.data.checks.app_access.ok, true);
    assert.equal(got.data.checks.result_grant.warn, undefined);
  });
  await withApp({ ...SP_STATE, warehousePermissionsStatus: 403, warehousePermissions: { message: 'no' },
    me: { userName: 'inspire-sp', groups: [{ display: 'admins' }] } }, async (url) => {
    const got = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}&app_name=churn-desk`);
    assert.match(got.data.checks.app_access.detail, new RegExp(`${CANNOT_MANAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  });
  await withApp({ ...SP_STATE, appExists: true, app: { name: 'churn-desk', description: 'Inspire use case N01-U01 (session 42): churn' } }, async (url) => {
    const got = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}&app_name=churn-desk`);
    assert.equal(got.data.checks.app_access, undefined, 'an App that exists is updated, so nothing is attached or granted to a new one');
    assert.equal(got.data.ok, true, JSON.stringify(got.data));
  });
  await withApp(SP_STATE, async (url) => {
    const got = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}&share=1&principals=not-json`);
    assert.equal(got.status, 400);
    assert.equal(got.data.error, 'principals must be a JSON list of principal names');
    const obj = await call(url, `/api/inspire/implement/preflight?${Q}&${OUT}&share=1&principals=${encodeURIComponent('{"a":1}')}`);
    assert.equal(obj.status, 400);
  });
});

test('context returns the execution family, whether it trains a model, the Deep evidence and the workspace features', async () => {
  const evidence = { tables: { 'main.s.orders': { rows: 1200, sampled: false, date_ranges: { order_date: { min: '2024-01-01', max: '2024-12-31' } } } } };
  const cases = [['Execution pattern: family E, anomaly detection.\nRun pattern: x.', 'E', false], ['Execution pattern: family B, classification.', 'B', true], ['', '', null]];
  for (const [mandate, family, trains] of cases) {
    await withApp({ useCase: { id: 'N01-U01', use_case: 'Predict churn', code_structure_mandate: mandate, data_evidence: JSON.stringify(evidence), genie_instruction: '' }, spacesOk: false }, async (url) => {
      const got = await call(url, `/api/inspire/implement/context?${Q}`);
      assert.equal(got.status, 200, JSON.stringify(got.data));
      assert.deepEqual([got.data.family, got.data.trains_model], [family, trains], mandate);
      assert.equal(got.data.evidence.tables['main.s.orders'].rows, 1200);
      assert.deepEqual(got.data.features, { apps: true, genie_spaces: false, alerts: true });
    });
  }
});

test('submit refuses an output table the user cannot create, and a widget value outside its range, before writing or launching', async () => {
  await withApp({ access: NOT_MINE_SCHEMA }, async (url, made) => {
    const got = await call(url, '/api/inspire/implement/submit', {
      method: 'POST', body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: SPEC },
    });
    assert.equal(got.status, 403);
    assert.match(got.data.error, /you need USE SCHEMA on main.inspire and CREATE TABLE on main.inspire/);
    assert.equal(made.jobs.length, 0);
    assert.ok(!made.sqlCalls.some((c) => String(c.sql).includes('INSERT INTO')));
  });
  const instruction = '## 3. Parameters\n| widget | type | default | allowed | used for |\n|---|---|---|---|---|\n| `top_k` | text | 5 | whole number, 1 to 10 | Rows to show |\n';
  await withApp({ useCase: { id: 'N01-U01', use_case: 'Predict churn', genie_instruction: instruction } }, async (url, made) => {
    const bad = await call(url, '/api/inspire/implement/submit', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: { ...SPEC, config: { ...SPEC.config, widgets: { top_k: '50' } } } },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error, "widget values are out of range: top_k is '50'; allowed: whole number, 1 to 10");
    assert.equal(made.jobs.length, 0);
    const good = await call(url, '/api/inspire/implement/submit', {
      method: 'POST',
      body: { inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: { ...SPEC, config: { ...SPEC.config, widgets: { top_k: '7' } } } },
    });
    assert.equal(good.status, 200, JSON.stringify(good.data));
  });
});

test('a Studio re-run after an outputs-only version still knows the widgets Genie built', async () => {
  const history = [
    { spec_version: 3, status: 'ready', use_case_id: 'N01-U01', job_id: 77, spec_json: JSON.stringify(SPEC), genie_widgets: null },
    { spec_version: 1, status: 'ready', use_case_id: 'N01-U01', job_id: 77, spec_json: JSON.stringify(SPEC),
      genie_widgets: JSON.stringify([{ name: 'top_k', type: 'text', default: '25', allowed: 'whole number, at least 1' }]) }];
  await withApp({ history }, async (url, made) => {
    const ok = await call(url, `/api/inspire/implement/rerun?${Q}`, { method: 'POST', body: { overrides: { top_k: '10' } } });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const runNow = made.fetches.find((f) => f.path === '/api/2.1/jobs/run-now');
    assert.deepEqual(JSON.parse(runNow.opts.body).notebook_params, { top_k: '10', run_profile: 'preview' });
    const bad = await call(url, `/api/inspire/implement/rerun?${Q}`, { method: 'POST', body: { overrides: { top_k: '-3' } } });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error, "widget values are out of range: top_k is '-3'; allowed: whole number, at least 1");
  });
});

test('a Studio re-run refuses an override outside the widget\'s range and never calls run-now', async () => {
  const history = [{ spec_version: 2, status: 'ready', use_case_id: 'N01-U01', job_id: 77, spec_json: JSON.stringify(SPEC),
    genie_widgets: JSON.stringify([{ name: 'top_k', type: 'text', default: '25', allowed: 'whole number, at least 1' }]) }];
  await withApp({ history }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/rerun?${Q}`, { method: 'POST', body: { overrides: { top_k: '-3' } } });
    assert.equal(got.status, 400);
    assert.equal(got.data.error, "widget values are out of range: top_k is '-3'; allowed: whole number, at least 1");
    assert.ok(!made.fetches.some((f) => f.path === '/api/2.1/jobs/run-now'));
  });
});

const BUILT = (extra = {}) => ({ spec_version: 2, status: 'ready', use_case_id: 'N01-U01', job_id: 77, spec_json: JSON.stringify(SPEC),
  genie_widgets: JSON.stringify([{ name: 'top_k', type: 'text', default: '25', allowed: 'whole number, at least 1' }]), ...extra });

test('a Studio re-run whose source table was dropped names the exact table and never calls run-now', async () => {
  const gone = '[TABLE_OR_VIEW_NOT_FOUND] The table or view `main`.`s`.`returns` cannot be found. Verify the spelling. SQLSTATE: 42P01';
  await withApp({ history: [BUILT()], useCase: TWO_TABLES, probeErrors: { '`main`.`s`.`returns`': gone } }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/rerun?${Q}`, { method: 'POST', body: { overrides: {} } });
    assert.equal(got.status, 409);
    assert.equal(got.data.error, 'the preview cannot run because these source tables are missing or not readable: main.s.returns '
      + '(not found). Open Edit, Data step, to swap each for a table with the same role or remove it');
    assert.deepEqual(got.data.missing_tables, [{ table: 'main.s.returns', reason: 'not found', error: gone }]);
    assert.ok(!made.fetches.some((f) => f.path === '/api/2.1/jobs/run-now'));
    assert.deepEqual(made.sqlCalls.filter((c) => c.sql.endsWith('LIMIT 0')).map((c) => c.sql).sort(),
      ['SELECT * FROM `main`.`s`.`orders` LIMIT 0', 'SELECT * FROM `main`.`s`.`returns` LIMIT 0']);
  });
  const denied = "[INSUFFICIENT_PERMISSIONS] Insufficient privileges: User does not have SELECT on Table 'main.s.orders'.";
  await withApp({ history: [BUILT()], useCase: TWO_TABLES, probeErrors: { '`main`.`s`.`orders`': denied } }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/rerun?${Q}`, { method: 'POST', body: { overrides: {} } });
    assert.equal(got.status, 409);
    assert.deepEqual(got.data.missing_tables.map((m) => [m.table, m.reason]), [['main.s.orders', 'no read access']]);
    assert.ok(!made.fetches.some((f) => f.path === '/api/2.1/jobs/run-now'));
  });
});

test('a Studio re-run checks the swapped table, skips removed ones, and is not blocked by an unrelated probe error', async () => {
  const swapped = { ...SPEC, data: { tables: { 'main.s.orders': 'main.s.orders_v2' }, removed_tables: ['main.s.returns'] } };
  const timeout = 'Statement timed out after 50 seconds on warehouse wh1';
  await withApp({ history: [BUILT({ spec_json: JSON.stringify(swapped) })], useCase: TWO_TABLES,
    probeErrors: { '`main`.`s`.`orders_v2`': timeout } }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/rerun?${Q}`, { method: 'POST', body: { overrides: {} } });
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(made.sqlCalls.filter((c) => c.sql.endsWith('LIMIT 0')).map((c) => c.sql), ['SELECT * FROM `main`.`s`.`orders_v2` LIMIT 0']);
    assert.ok(made.fetches.some((f) => f.path === '/api/2.1/jobs/run-now'));
  });
});

test('a Studio re-run refuses to override the result table and drops blank overrides', async () => {
  await withApp({ history: [BUILT()] }, async (url, made) => {
    for (const name of ['result_table', 'RESULT_TABLE']) {
      const got = await call(url, `/api/inspire/implement/rerun?${Q}`, { method: 'POST', body: { overrides: { [name]: 'main.other.t' } } });
      assert.equal(got.status, 400);
      assert.equal(got.data.error, 'the result table is part of the spec; change it with Edit, which checks the table before any run writes to it');
    }
    assert.ok(!made.fetches.some((f) => f.path === '/api/2.1/jobs/run-now'));
    const blank = await call(url, `/api/inspire/implement/rerun?${Q}`, { method: 'POST', body: { overrides: { top_k: '   ', as_of_date: '' } } });
    assert.equal(blank.status, 200, JSON.stringify(blank.data));
    assert.deepEqual(blank.data.notebook_params, { run_profile: 'preview' });
  });
});

test('the Studio status returns the re-run widgets, the App\'s live status and the job\'s recent runs', async () => {
  const widgets = [{ name: 'result_table', type: 'text', default: 'main.inspire.churn_out' }, { name: 'run_profile', type: 'dropdown', default: 'full_load' },
    { name: 'top_k', type: 'text', default: '25', allowed: 'whole number, at least 1' }, { name: 'as_of_date', type: 'text', default: '' }];
  const history = [
    { spec_version: 3, status: 'ready', use_case_id: 'N01-U01', job_id: 77, app_name: 'n01-u01-churn', spec_json: JSON.stringify(SPEC), genie_widgets: null },
    { spec_version: 1, status: 'ready', use_case_id: 'N01-U01', job_id: 77, app_name: 'n01-u01-churn', spec_json: JSON.stringify(SPEC),
      genie_widgets: JSON.stringify(widgets) }];
  const app = { name: 'n01-u01-churn', url: 'https://n01-u01-churn.example.databricksapps.com', app_status: { state: 'RUNNING', message: 'App is running' },
    description: 'Inspire use case N01-U01 (session 42): Predict churn',
    compute_status: { state: 'ACTIVE' }, active_deployment: { status: { state: 'SUCCEEDED', message: 'App started successfully' }, update_time: '2026-10-25T03:00:00Z' } };
  const runs = { runs: [{ run_id: 9, start_time: 1761361200000, run_duration: 125400, trigger: 'ONE_TIME', run_page_url: 'https://x/run/9',
    state: { life_cycle_state: 'TERMINATED', result_state: 'SUCCESS', state_message: '' }, overriding_parameters: { notebook_params: { run_profile: 'preview' } } },
  { run_id: 8, start_time: 1761357600000, execution_duration: 3000, trigger: 'PERIODIC', state: { life_cycle_state: 'RUNNING' } }] };
  await withApp({ history, app, appExists: true, runs }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/status?${Q}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(got.data.rerun_widgets.map((w) => w.name), ['top_k', 'as_of_date']);
    assert.deepEqual(got.data.app_status, { ok: true, name: 'n01-u01-churn', url: app.url, app_state: 'RUNNING', app_message: 'App is running',
      compute_state: 'ACTIVE', deployment_state: 'SUCCEEDED', deployment_message: 'App started successfully', deployed_at: '2026-10-25T03:00:00Z' });
    assert.deepEqual(got.data.runs, { ok: true, runs: [
      { run_id: 9, started: '2025-10-25T03:00:00.000Z', duration_s: 125, state: 'SUCCESS', message: '', trigger: 'ONE_TIME', profile: 'preview', url: 'https://x/run/9' },
      { run_id: 8, started: '2025-10-25T02:00:00.000Z', duration_s: 3, state: 'RUNNING', message: '', trigger: 'PERIODIC', profile: '', url: '' }] });
    assert.ok(made.fetches.some((f) => f.path === '/api/2.0/apps/n01-u01-churn'));
    assert.ok(made.fetches.some((f) => f.path === '/api/2.1/jobs/runs/list?job_id=77&limit=10'));
    assert.ok(!made.fetches.some((f) => f.path.startsWith('/api/2.1/jobs/get')));
  });
  await withApp({ history, appExists: false, runs: { has_more: false }, job: { error_code: 'PERMISSION_DENIED', message: 'User sp does not have View permissions on Job 77' },
    jobStatus: 403 }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/status?${Q}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(got.data.runs, { ok: false, error: 'Inspire cannot see this job, so it cannot list its runs: User sp does not have View permissions on Job 77', runs: [] });
    assert.ok(made.fetches.some((f) => f.path === '/api/2.1/jobs/get?job_id=77'));
  });
  await withApp({ history, appExists: false, runs: { has_more: false } }, async (url) => {
    const got = await call(url, `/api/inspire/implement/status?${Q}`);
    assert.deepEqual(got.data.runs, { ok: true, runs: [] });
  });
  await withApp({ history, appExists: false, runs: { message: 'no permission to view runs of job 77' }, runsStatus: 403 }, async (url) => {
    const got = await call(url, `/api/inspire/implement/status?${Q}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(got.data.app_status, { ok: false, error: 'the App no longer exists' });
    assert.deepEqual(got.data.runs, { ok: false, error: 'no permission to view runs of job 77', runs: [] });
  });
  await withApp({ history: [] }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/status?${Q}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(got.data.app_status, null);
    assert.equal(got.data.runs, null);
    assert.deepEqual(got.data.rerun_widgets, []);
    assert.ok(!made.fetches.some((f) => f.path.startsWith('/api/2.0/apps/') || f.path.startsWith('/api/2.1/jobs/runs/list')));
  });
});

test('the Studio results return the segments of the latest run for the display filter', async () => {
  const segments = [{ segment_or_item: 'Electronics', rows: '12' }, { segment_or_item: 'Books', rows: '4' }];
  await withApp({ history: [BUILT()], segments }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/results?${Q}&tier=Act%20now&segment=Books`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(got.data.exists, true);
    assert.deepEqual(got.data.segments, segments);
    const rowsCall = made.sqlCalls.find((c) => c.sql.startsWith('SELECT * FROM `main`.`inspire`.`churn_out` WHERE'));
    assert.deepEqual(rowsCall.parameters, [{ name: 'tier', value: 'Act now', type: 'STRING' }, { name: 'segment', value: 'Books', type: 'STRING' }]);
    assert.ok(made.sqlCalls.some((c) => c.sql === 'SELECT segment_or_item, COUNT(*) AS rows FROM `main`.`inspire`.`churn_out` WHERE as_of_date = '
      + '(SELECT MAX(as_of_date) FROM `main`.`inspire`.`churn_out`) AND segment_or_item IS NOT NULL GROUP BY segment_or_item ORDER BY rows DESC, '
      + 'segment_or_item LIMIT 100'));
  });
});

test('the Studio results of a version whose first run has not written the output table yet are empty, not a 500', async () => {
  const missing = '[TABLE_OR_VIEW_NOT_FOUND] The table or view `main`.`inspire`.`churn_out` cannot be found. SQLSTATE: 42P01; line 1 pos 46';
  await withApp({ history: [BUILT()], resultTableError: missing }, async (url) => {
    const got = await call(url, `/api/inspire/implement/results?${Q}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(got.data, { result_table: 'main.inspire.churn_out', exists: false, rows: [], summary: [], segments: [] });
  });
});

test('the Studio results of a use case with no implementation say there is nothing yet without reading any table', async () => {
  await withApp({ history: [] }, async (url, made) => {
    const got = await call(url, `/api/inspire/implement/results?${Q}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(got.data, { result_table: '', exists: false, rows: [], summary: [], segments: [] });
    assert.ok(!made.sqlCalls.some((c) => /^SELECT .* FROM `main`\.`inspire`\.`churn_out`/.test(c.sql)));
  });
});

test('the Studio results still fail when the output table exists but cannot be read', async () => {
  const denied = '[INSUFFICIENT_PERMISSIONS] User does not have SELECT on Table main.inspire.churn_out';
  await withApp({ history: [BUILT()], resultTableError: denied }, async (url) => {
    const got = await call(url, `/api/inspire/implement/results?${Q}`);
    assert.equal(got.status, 500, JSON.stringify(got.data));
    assert.match(JSON.stringify(got.data), /INSUFFICIENT_PERMISSIONS/);
    assert.equal(got.data.exists, undefined);
  });
});
