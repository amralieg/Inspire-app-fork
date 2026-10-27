const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const I = require('../lib/inspireImplement');
const S = require('../lib/appShell');
const { makeApp, listen } = require('./support/implementApp');

const BASE = {
  use_case_id: 'N01-U01',
  use_case_name: 'Predict churn',
  config: { warehouse_id: 'wh1', result_table: 'main.inspire.n01_u01_out' },
  outputs: { dashboard: true, app: true, app_name: 'churn-desk', app_access: 'sp' },
};

const withOutputs = (outputs) => ({ ...BASE, outputs: { ...BASE.outputs, ...outputs } });
const check = (outputs, options) => I.validateImplementSpec(withOutputs(outputs), options);
const SHELL = S.appShellCatalog();

test('the bundled agent notebook carries the App shell, and its lists and palettes are the ones the shell validates against', () => {
  assert.equal(SHELL.ok, true, SHELL.error);
  assert.deepEqual(SHELL.styles, ['a', 'b', 'c']);
  assert.deepEqual(SHELL.layouts, ['sidebar', 'tabs', 'home']);
  assert.deepEqual(SHELL.auths, ['user', 'sp']);
  assert.deepEqual(SHELL.themes, ['light', 'dark']);
  assert.deepEqual(SHELL.options, I.IMPLEMENT_APP_OPTION_KEYS, 'the C1 option keys are the shell OPTIONS');
  assert.equal(SHELL.palettes.length, 13);
  assert.equal(SHELL.palettes[0], 'default');
  assert.deepEqual(SHELL.palette_colors.map((p) => p.id), SHELL.palettes);
  for (const p of SHELL.palette_colors) {
    for (const theme of ['light', 'dark']) {
      assert.match(p[theme].base.bg, /^#[0-9a-f]{3,8}$/i, `${p.id} ${theme}`);
      assert.equal(Object.keys(p[theme].hues).length, 9, `${p.id} ${theme} hues`);
      for (const hue of Object.values(p[theme].hues)) assert.match(hue.line, /^#[0-9a-f]{6}$/i);
    }
  }
  assert.notDeepEqual(SHELL.palette_colors[0].light.hues, SHELL.palette_colors[1].light.hues, 'each palette has its own colours');
  for (const [key, list] of Object.entries({ style: 'styles', layout: 'layouts', palette: 'palettes', theme: 'themes' })) {
    assert.ok(SHELL[list].includes(I.IMPLEMENT_APP_LOOK_DEFAULT[key]), `the default ${key} is one the shell offers`);
  }
  const core = S.appShellPayload(S.bundledNotebookText()).files['shell_core.py'];
  assert.deepEqual(S.pythonTuple(core, 'PALETTES'), SHELL.palettes);
  if (SHELL.user_off) assert.deepEqual(SHELL.user_off, I.IMPLEMENT_PER_USER_OFF, 'the options a per-user App turns off are the shell\'s');
  const userOff = S.appShellLook({ version: 1, files: { 'shell_core.py': `${core}\nUSER_OFF = ("download", "decisions")\n`, 'static/assets/app.js': S.appShellPayload(S.bundledNotebookText()).files['static/assets/app.js'] } });
  assert.deepEqual(userOff.user_off, I.IMPLEMENT_PER_USER_OFF);
});

test('the palettes come from the payload when the notebook carries them, and from the built bundle otherwise, never from a copy', () => {
  const ids = ['default', 'mono'];
  const one = (bg) => ({ light: { base: { bg, line: '#e3e7ec' }, hues: { blue: { line: '#365691' } } }, dark: { base: { bg: '#0c1015' }, hues: { blue: { line: '#6c8fd0' } } } });
  const js = `var q=1;const Ab={light:{base:{bg:"#111111","line-strong":"#cfd5dc"},hues:{blue:{line:"#123456"}}},dark:{base:{bg:"#000000"},hues:{blue:{line:"#654321"}}}},`
    + `Zz={default:{light:{base:{bg:"#f4f6f8"},hues:{blue:{line:"#365691"}}},dark:{base:{bg:"#0c1015"},hues:{blue:{line:"#6c8fd0"}}}},mono:Ab},Fu=["blue"];`;
  const fromBundle = S.palettesFromBundle(js, ids);
  assert.equal(fromBundle.default.light.base.bg, '#f4f6f8');
  assert.equal(fromBundle.mono.light.base['line-strong'], '#cfd5dc');
  assert.equal(fromBundle.mono.dark.hues.blue.line, '#654321');
  assert.throws(() => S.palettesFromBundle(js, ['default', 'mono', 'neon']), /holds no colours for the palettes default, mono, neon/);
  assert.throws(() => S.palettesFromBundle('const a={default:1}', ids), /holds no colours/);
  const core = 'STYLES = ("a", "b", "c")\nLAYOUTS = ("sidebar", "tabs", "home")\nAUTHS = ("user", "sp")\nTHEMES = ("light", "dark")\n'
    + 'PALETTES = ("default", "mono")\nOPTIONS = ("download", "modify", "replace_edits", "decisions")\n';
  const viaPayload = S.appShellLook({ version: 1, files: { 'shell_core.py': core, 'static/assets/app.js': 'nothing here' }, palettes: { default: one('#abcdef'), mono: one('#fedcba') } });
  assert.equal(viaPayload.palette_source, 'payload');
  assert.deepEqual(viaPayload.palette_colors.map((p) => p.light.base.bg), ['#abcdef', '#fedcba']);
  const viaBundle = S.appShellLook({ version: 1, files: { 'shell_core.py': core, 'static/assets/app.js': js } });
  assert.equal(viaBundle.palette_source, 'bundle');
  assert.deepEqual(viaBundle.palette_colors.map((p) => p.light.base.bg), ['#f4f6f8', '#111111']);
  assert.throws(() => S.appShellLook({ version: 1, files: { 'shell_core.py': core.replace(/^PALETTES.*$/m, '') } }), /defines no PALETTES/);
});

test('a notebook without the App shell, or with a broken one, is refused with the reason', () => {
  const notebook = (line) => JSON.stringify({ cells: [{ source: [] }, { source: ['x = 1\n', ...(line === null ? [] : [line])] }] });
  const encode = (data) => zlib.deflateSync(Buffer.from(JSON.stringify(data))).toString('base64');
  assert.throws(() => S.appShellPayload(notebook(null)), /carries no App shell \(0 _INSPIRE_APP_SHELL lines\)/);
  assert.throws(() => S.appShellPayload(notebook(`${S.APP_SHELL_CONSTANT}""`)), /App shell is empty/);
  assert.throws(() => S.appShellPayload(notebook(`${S.APP_SHELL_CONSTANT}"bm90IHpsaWI="`)), /does not decode/);
  assert.throws(() => S.appShellPayload(notebook(`${S.APP_SHELL_CONSTANT}"${encode({ version: 2, files: {} })}"`)), /is not version 1/);
  assert.throws(() => S.appShellPayload('{nope'), /not valid JSON/);
  assert.equal(S.appShellPayload(notebook(`${S.APP_SHELL_CONSTANT}"${encode({ version: 1, files: { a: 'b' } })}"`)).files.a, 'b');
  const { errors } = check({}, { shell: { ok: false, error: 'the bundled agent notebook carries no App shell' } });
  assert.ok(errors.includes('the App cannot be built: the bundled agent notebook carries no App shell'), JSON.stringify(errors));
  assert.deepEqual(I.validateImplementSpec({ ...BASE, outputs: { dashboard: true } }, { shell: { ok: false, error: 'x' } }).errors, [],
    'a spec without an App never needs the shell');
});

test('an App needs its access chosen: a missing or unknown app_access is an error, and per-user turns download and decisions off', () => {
  const missing = check({ app_access: undefined });
  assert.ok(missing.errors.some((e) => e.startsWith('app_access is required when the App is ticked')), JSON.stringify(missing.errors));
  assert.ok(check({ app_access: '' }).errors.some((e) => e.startsWith('app_access is required')));
  assert.ok(check({ app_access: 'everyone' }).errors.includes('app_access "everyone" must be one of user, sp'));
  assert.ok(check({ app_access: 3 }).errors.includes('app_access 3 must be one of user, sp'));
  const all = { download: true, modify: true, replace_edits: true, decisions: true };
  const sp = check({ app_options: all });
  assert.deepEqual(sp.errors, []);
  assert.deepEqual(sp.spec.outputs.app_options, all);
  const user = check({ app_access: 'USER', app_options: all });
  assert.deepEqual(user.errors, []);
  assert.equal(user.spec.outputs.app_access, 'user');
  assert.deepEqual(user.spec.outputs.app_options, { download: false, modify: true, replace_edits: true, decisions: false });
  assert.deepEqual(check({ app_options: { replace_edits: true } }).spec.outputs.app_options,
    { download: false, modify: false, replace_edits: false, decisions: false }, 'replacing edits means nothing while edits are off');
  const off = I.validateImplementSpec({ ...BASE, outputs: { dashboard: true, app: false, app_access: 'nobody', app_options: { download: 'yes' } } });
  assert.deepEqual(off.errors, [], 'App settings are not checked while the App is unticked');
  assert.deepEqual([off.spec.outputs.app_access, off.spec.outputs.app_options.download], ['', false]);
});

test('App options are true or false only, and an unknown option is an error', () => {
  assert.ok(check({ app_options: { download: 'yes' } }).errors.includes('app_options.download must be true or false, not "yes"'));
  assert.ok(check({ app_options: { modify: 1 } }).errors.includes('app_options.modify must be true or false, not 1'));
  assert.ok(check({ app_options: { export: true } }).errors.includes('app_options.export is not an App option; the options are download, modify, replace_edits, decisions'));
  assert.ok(check({ app_options: ['download'] }).errors.includes('outputs.app_options must be an object'));
  assert.deepEqual(check({ app_options: { download: null } }).errors, []);
});

test('the App look defaults to style A, sidebar, the default palette and light, and an unknown value is an error', () => {
  assert.deepEqual(check({}).spec.outputs.app_look, { style: 'a', layout: 'sidebar', palette: 'default', theme: 'light' });
  assert.deepEqual(check({ app_look: { style: '', palette: null } }).spec.outputs.app_look, I.IMPLEMENT_APP_LOOK_DEFAULT);
  const picked = check({ app_look: { style: 'C', layout: 'home', palette: 'Nordic', theme: 'dark' } });
  assert.deepEqual(picked.errors, []);
  assert.deepEqual(picked.spec.outputs.app_look, { style: 'c', layout: 'home', palette: 'nordic', theme: 'dark' });
  const unknownPalette = check({ app_look: { palette: 'rainbow' } });
  assert.ok(unknownPalette.errors.includes(`app_look.palette "rainbow" must be one of ${SHELL.palettes.join(', ')}`), JSON.stringify(unknownPalette.errors));
  assert.equal(unknownPalette.spec.outputs.app_look.palette, 'default');
  assert.ok(check({ app_look: { style: 'd' } }).errors.includes('app_look.style "d" must be one of a, b, c'));
  assert.ok(check({ app_look: { layout: 'grid' } }).errors.includes('app_look.layout "grid" must be one of sidebar, tabs, home'));
  assert.ok(check({ app_look: { theme: 'sepia' } }).errors.includes('app_look.theme "sepia" must be one of light, dark'));
  assert.ok(check({ app_look: { font: 'serif' } }).errors.includes('app_look.font is not an App look setting; the settings are style, layout, palette, theme'));
  assert.ok(check({ app_look: 'dark' }).errors.includes('outputs.app_look must be an object'));
});

test('ticking the App ticks the Genie Agent, since Ask Genie in the App needs one', () => {
  const { spec, errors } = check({ genie_space: false });
  assert.deepEqual(errors, []);
  assert.equal(spec.outputs.genie_space, true);
  assert.equal(I.validateImplementSpec({ ...BASE, outputs: { dashboard: true, genie_space: false } }).spec.outputs.genie_space, false,
    'without the App the Genie Agent stays as chosen');
});

test('a merge names an existing App, dashboard or Genie Agent, "" creates a new one, and a merge into an unticked output is dropped', () => {
  const fresh = check({});
  assert.deepEqual(fresh.spec.outputs.merge, { app: '', dashboard: '', genie_space: '' });
  const merged = check({ app_name: 'predict-churn', merge: { app: 'Churn-Desk', dashboard: '01ef2a3b4c5d6e7f', genie_space: '01abc_def-9' } });
  assert.deepEqual(merged.errors, []);
  assert.deepEqual(merged.spec.outputs.merge, { app: 'churn-desk', dashboard: '01ef2a3b4c5d6e7f', genie_space: '01abc_def-9' });
  assert.equal(merged.spec.outputs.app_name, 'churn-desk', 'joining an App deploys to that App');
  assert.ok(check({ merge: { app: 'Churn_Desk' } }).errors.includes("merge.app 'Churn_Desk' is not an App name"));
  assert.ok(check({ merge: { dashboard: 'a b' } }).errors.includes("merge.dashboard 'a b' is not a dashboard id"));
  assert.ok(check({ merge: { genie_space: 'x'.repeat(65) } }).errors.includes(`merge.genie_space '${'x'.repeat(65)}' is not a Genie Agent id`));
  assert.ok(check({ merge: { alert: 'a1' } }).errors.includes('merge.alert is not an output Inspire adds to; it adds to an existing app, dashboard, genie_space'));
  assert.ok(check({ merge: { app: 7 } }).errors.includes('merge.app must name the App to add to, or be "" to create a new one'));
  const unticked = I.validateImplementSpec({ ...BASE, outputs: { dashboard: false, alert: false, app: false, genie_space: true, merge: { dashboard: 'd1', app: 'churn-desk' } } });
  assert.deepEqual(unticked.spec.outputs.merge, { app: '', dashboard: '', genie_space: '' });
});

test('a change of access, look or options refreshes only the App, and a new merge target rebuilds that output there', () => {
  const before = check({ merge: { dashboard: '' } }).spec;
  const assets = { dashboard: 'd1', genie_space: 'g1', app: 'churn-desk' };
  for (const outputs of [{ app_access: 'user' }, { app_look: { palette: 'ocean' } }, { app_options: { modify: true } }]) {
    const summary = I.implementChangeSummary(before, check(outputs).spec, assets);
    assert.deepEqual([summary.classes, summary.refresh, summary.build, summary.refill], [['outputs'], ['app'], [], false], JSON.stringify(outputs));
  }
  const moved = I.implementChangeSummary(before, check({ merge: { dashboard: '01ef2a3b4c5d6e7f' } }).spec, assets);
  assert.deepEqual([moved.classes, moved.build, moved.refresh], [['outputs'], ['dashboard'], []]);
  assert.deepEqual(I.classifyImplementChange(before, check({}).spec), [], 'the same App settings are no change');
});

test('a version built before the access choice keeps its service principal when a retry or a removal re-submits it', () => {
  const legacy = { spec_version: 2, status: 'ready', spec_json: { ...BASE, outputs: { dashboard: true, app: true, app_name: 'churn-desk' } } };
  assert.equal(I.legacyAppAccess([legacy]), 'sp');
  assert.equal(I.legacyAppAccess([{ ...legacy, spec_json: withOutputs({ app_access: 'user' }) }]), '', 'a version that chose access has no legacy default');
  assert.equal(I.legacyAppAccess([{ ...legacy, status: 'failed' }]), '', 'only a built App carries a mode to keep');
  assert.equal(I.legacyAppAccess([{ ...legacy, spec_json: { ...BASE, outputs: { dashboard: true } } }]), '');
  assert.equal(I.legacyAppAccess([]), '');
  const resubmit = { ...BASE, outputs: { dashboard: false, app: true, app_name: 'churn-desk' } };
  assert.ok(I.validateImplementSpec(resubmit).errors.some((e) => e.startsWith('app_access is required')), 'without the history the access stays required');
  const kept = I.validateImplementSpec(resubmit, { legacyAccess: 'sp' });
  assert.deepEqual(kept.errors, []);
  assert.equal(kept.spec.outputs.app_access, 'sp');
  assert.ok(I.validateImplementSpec({ ...resubmit, outputs: { ...resubmit.outputs, app_access: '' } }, { legacyAccess: 'sp' }).errors
    .some((e) => e.startsWith('app_access is required')), 'the wizard sends the key, so its empty choice is never filled in');
});

test('an Edit that only states the service principal an older App already had is no change', () => {
  const legacy = { spec_version: 1, status: 'ready', spec_json: { ...BASE, outputs: { dashboard: true, app: true, app_name: 'churn-desk' } } };
  const same = check({ app_access: 'sp' }).spec;
  assert.equal(I.planSubmission([legacy], { ...same, based_on_version: 1 }).unchanged, true);
  const plan = I.planSubmission([legacy], { ...check({ app_access: 'user' }).spec, based_on_version: 1 });
  assert.deepEqual([plan.summary.classes, plan.summary.build, plan.summary.refresh], [['outputs'], ['dashboard', 'genie_space', 'app'], []]);
});

const row = (sid, uc, version, extra = {}) => ({
  session_id: sid, use_case_id: uc, spec_version: version, status: 'ready', updated_at: `2026-10-2${version}T00:00:00Z`,
  spec_json: JSON.stringify(withOutputs({ app_access: 'sp' })), asset_status: null, dashboard_id: null, genie_space_id: null, app_name: null, ...extra,
});
const named = (name, outputs = {}) => JSON.stringify({ ...withOutputs(outputs), use_case_name: name });

test('the merge registry lists the assets other use cases hold, with their use cases and the App sign-in, never the use case\'s own', () => {
  const rows = [
    row('42', 'N01-U02', 1, { app_name: 'churn-desk', dashboard_id: 'd1', spec_json: named('Forecast demand') }),
    row('42', 'N01-U03', 2, { app_name: 'churn-desk', spec_json: named('Score suppliers', { app_access: 'user' }) }),
    row('42', 'N01-U03', 1, { status: 'failed', app_name: 'old-app' }),
    row('7', 'N01-U01', 1, { genie_space_id: 'g9', spec_json: named('Other session churn') }),
    row('42', 'N01-U01', 1, { app_name: 'own-app', dashboard_id: 'own-dash' }),
    row('42', 'N02-U01', 2, { asset_status: JSON.stringify({ dashboard: { state: 'deleted' } }), spec_json: named('Deleted one') }),
    row('42', 'N02-U01', 1, { dashboard_id: 'gone-dash' }),
  ].map(I.parseImplementRow);
  const reg = I.mergeRegistry(rows, { sessionId: '42', useCaseId: 'N01-U01' });
  assert.deepEqual(reg.app.map((e) => e.id), ['churn-desk']);
  assert.deepEqual(reg.app[0].holders.map((h) => [h.use_case_id, h.use_case_name, h.app_access]),
    [['N01-U02', 'Forecast demand', 'sp'], ['N01-U03', 'Score suppliers', 'user']]);
  assert.deepEqual(reg.dashboard.map((e) => e.id), ['d1'], 'a deleted dashboard and the use case\'s own are not targets');
  assert.deepEqual(reg.genie_space.map((e) => [e.id, e.holders[0].session_id]), [['g9', '7']], 'other sessions count too');
  const only = I.mergeRegistry(rows, { sessionId: '42', useCaseId: 'N01-U01', only: { app: 'churn-desk', dashboard: '', genie_space: '' } });
  assert.deepEqual([only.app.length, only.dashboard.length, only.genie_space.length], [1, 0, 0]);
  const app = I.mergeTarget('app', reg.app[0], { ok: true, data: { name: 'churn-desk', url: 'https://churn-desk.example.com',
    description: 'Inspire use case N01-U02 (session 42): Forecast demand' } });
  assert.deepEqual([app.access, app.use_cases.map((u) => u.name)], ['user', ['Forecast demand', 'Score suppliers']], 'one per-user holder makes a per-user App');
  assert.equal(I.mergeTarget('app', reg.app[0], { ok: true, data: { name: 'churn-desk', description: 'Sales forecasting tool' } }), null,
    'an App whose description is not an Inspire owner tag is not Inspire-built');
  assert.equal(I.mergeTarget('app', reg.app[0], { ok: false, status: 404, data: {} }), null);
  assert.equal(I.mergeTarget('dashboard', reg.dashboard[0], { ok: true, data: { lifecycle_state: 'TRASHED' } }), null);
  assert.deepEqual(I.mergeTarget('dashboard', reg.dashboard[0], { ok: true, data: { display_name: 'Demand' } }, 'https://w.example.com/'),
    { id: 'd1', name: 'Demand', url: 'https://w.example.com/dashboardsv3/d1/published', use_cases: [{ session_id: '42', use_case_id: 'N01-U02', name: 'Forecast demand' }] });
  assert.equal(I.mergeTarget('genie_space', reg.genie_space[0], { ok: true, data: { title: 'Churn agent' } }).name, 'Churn agent');
  const statement = I.implementRegistryStatement('`main`.`inspire`.`__inspire_implement`', new Set(['session_id', 'app_name']));
  assert.match(statement.sql, /WHERE `app_name` IS NOT NULL ORDER BY/);
  assert.match(statement.sql, /NULL AS `dashboard_id`/);
  assert.match(I.implementRegistryStatement('t').sql, /WHERE `app_name` IS NOT NULL OR `dashboard_id` IS NOT NULL OR `genie_space_id` IS NOT NULL OR `asset_status` IS NOT NULL/);
});

test('a per-user use case cannot join a service-principal App, and a merge target must be one Inspire listed', () => {
  const sp = { id: 'churn-desk', name: 'churn-desk', access: 'sp', use_cases: [] };
  const user = { id: 'care-desk', name: 'care-desk', access: 'user', use_cases: [] };
  const targets = { app: [sp, user], dashboard: [{ id: 'd1' }], genie_space: [] };
  const spec = (outputs) => check(outputs).spec;
  assert.deepEqual(I.mergeProblems(spec({ merge: { app: 'churn-desk' } }), targets), []);
  const blocked = I.mergeProblems(spec({ app_access: 'user', merge: { app: 'churn-desk' } }), targets);
  assert.deepEqual(blocked, ['churn-desk signs everyone in with its own service principal, so a per-user (sensitive) use case cannot join it: '
    + 'create a new App, or choose Internal data']);
  assert.equal(I.appMergeBlock(sp, 'user'), blocked[0]);
  assert.deepEqual(I.mergeProblems(spec({ app_access: 'user', merge: { app: 'care-desk' } }), targets), [], 'per-user into per-user is fine');
  assert.deepEqual(I.mergeProblems(spec({ merge: { app: 'care-desk' } }), targets), [], 'an internal use case may join a per-user App');
  assert.deepEqual(I.mergeProblems(spec({ merge: { dashboard: 'd2', genie_space: 'g1' } }), targets), [
    'd2 is not a dashboard Inspire built that you can open: pick one Inspire lists, or create a new one',
    'g1 is not a Genie Agent Inspire built that you can open: pick one Inspire lists, or create a new one',
  ]);
  assert.deepEqual(I.mergeProblems(spec({ merge: { dashboard: 'd2' } }), targets, { dashboard: 'd2' }), [], 'the dashboard it already holds is not re-checked');
});

const Q = 'inspire_database=main.inspire&warehouse_id=wh1&session_id=42&use_case_id=N01-U01';

async function call(base, path, body) {
  const resp = await fetch(base + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return { status: resp.status, data: await resp.json() };
}

const REGISTRY = [
  row('42', 'N01-U02', 1, { app_name: 'churn-desk', dashboard_id: 'd1', genie_space_id: 'g1', spec_json: named('Forecast demand') }),
  row('42', 'N01-U03', 1, { app_name: 'not-ours', spec_json: named('Score suppliers') }),
];
const REST = {
  appsByName: {
    'churn-desk': { name: 'churn-desk', url: 'https://churn-desk.example.com', description: 'Inspire use case N01-U02 (session 42): Forecast demand' },
    'not-ours': { name: 'not-ours', description: 'Somebody else built this' },
  },
  responses: { 'GET /api/2.0/genie/spaces/g1': [{ space_id: 'g1', title: 'Demand agent' }] },
};

test('the App lists the merge targets Inspire built and confirms each one live', async () => {
  const { app, fetches } = makeApp({ registry: REGISTRY, ...REST });
  const srv = await listen(app);
  try {
    const got = await call(srv.url, `/api/inspire/implement/merge-targets?${Q}`);
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.deepEqual(got.data.targets.app.map((t) => [t.id, t.access, t.use_cases.map((u) => u.name)]), [['churn-desk', 'sp', ['Forecast demand']]]);
    assert.match(got.data.targets.app[0].per_user_block, /^churn-desk signs everyone in with its own service principal/);
    assert.deepEqual(got.data.targets.dashboard.map((t) => [t.id, t.name]), [['d1', 'Dashboard']]);
    assert.deepEqual(got.data.targets.genie_space.map((t) => [t.id, t.name]), [['g1', 'Demand agent']]);
    assert.ok(fetches.some((f) => f.path === '/api/2.0/apps/not-ours'), 'every recorded App is checked live');
  } finally {
    await srv.close();
  }
});

test('plan and submit refuse a per-user use case joining a service-principal App, and accept the internal one', async () => {
  const { app, jobs, fetches } = makeApp({ registry: REGISTRY, ...REST });
  const srv = await listen(app);
  const body = (outputs) => ({ inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: withOutputs({ merge: { app: 'churn-desk' }, ...outputs }) });
  try {
    const refused = await call(srv.url, '/api/inspire/implement/plan', body({ app_access: 'user' }));
    assert.equal(refused.status, 400);
    assert.match(refused.data.error, /churn-desk signs everyone in with its own service principal, so a per-user \(sensitive\) use case cannot join it/);
    const notListed = await call(srv.url, '/api/inspire/implement/submit', body({ merge: { app: 'not-ours' } }));
    assert.equal(notListed.status, 400);
    assert.match(notListed.data.error, /not-ours is not an App Inspire built that you can open/);
    assert.equal(jobs.length, 0);
    fetches.length = 0;
    const ok = await call(srv.url, '/api/inspire/implement/plan', body({}));
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.deepEqual(fetches.filter((f) => f.path.startsWith('/api/2.0/apps/') && !f.path.includes('?')).map((f) => f.path), ['/api/2.0/apps/churn-desk'],
      'a plan checks only the App it joins, not every App Inspire built');
    assert.deepEqual(ok.data.summary.build, ['dashboard', 'genie_space', 'app']);
  } finally {
    await srv.close();
  }
});

test('a re-submission of an App built before the access choice keeps its service principal, and a new App without one is refused', async () => {
  const legacySpec = { ...BASE, outputs: { dashboard: true, app: true, app_name: 'churn-desk' } };
  const history = [{ session_id: '42', use_case_id: 'N01-U01', spec_version: 1, status: 'ready', spec_json: JSON.stringify(legacySpec), app_name: 'churn-desk' }];
  const { app, sqlCalls } = makeApp({ history });
  const srv = await listen(app);
  try {
    const retry = await call(srv.url, '/api/inspire/implement/submit', {
      inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: { ...legacySpec, based_on_version: 1, retry_outputs: ['app'] },
    });
    assert.equal(retry.status, 200, JSON.stringify(retry.data));
    const insert = sqlCalls.find((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(JSON.parse(insert.parameters.find((p) => p.name === 'spec').value).outputs.app_access, 'sp');
  } finally {
    await srv.close();
  }
  const fresh = makeApp();
  const srv2 = await listen(fresh.app);
  try {
    const refused = await call(srv2.url, '/api/inspire/implement/submit', {
      inspire_database: 'main.inspire', warehouse_id: 'wh1', session_id: '42', spec: withOutputs({ app_access: '' }),
    });
    assert.equal(refused.status, 400);
    assert.match(refused.data.error, /app_access is required when the App is ticked/);
    assert.equal(fresh.jobs.length, 0);
  } finally {
    await srv2.close();
  }
});

test('the App look endpoint serves the shell\'s 13 palettes, and preflight checks a joined App\'s access without a name check', async () => {
  const { app } = makeApp({ appsByName: REST.appsByName });
  const srv = await listen(app);
  try {
    const look = await call(srv.url, '/api/inspire/implement/app-look');
    assert.equal(look.status, 200);
    assert.deepEqual(look.data.palettes, SHELL.palettes);
    assert.equal(look.data.palette_colors.length, 13);
    const joined = await call(srv.url, `/api/inspire/implement/preflight?${Q}&result_table=main.inspire.n01_u01_out&app_name=&merge_app=churn-desk&genie=1`);
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    assert.ok(joined.data.checks.app_access, 'the joined App must read the result table');
    assert.equal(joined.data.checks.app_name, undefined, 'joining an App never checks its name as a new one');
    assert.equal(joined.data.checks.genie_spaces.detail, 'you can create Genie Agents');
  } finally {
    await srv.close();
  }
});
