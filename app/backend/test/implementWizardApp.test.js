const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const backend = require('../lib/inspireImplement');
const { appShellCatalog, appShellPayload, bundledNotebookText } = require('../lib/appShell');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'implementWizard.js')).href;
const load = () => import(libUrl);

const UC = { id: 'N01-U01', Name: 'Predict churn', statement: 'Cut churn in the top segment', sponsor: 'Head of Retention' };
const SHELL = appShellCatalog();

async function appSpec(outputs = {}) {
  const w = await load();
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  return { w, spec: { ...spec, outputs: { ...spec.outputs, app: true, genie_space: true, ...outputs } } };
}

test('the wizard offers exactly the App choices the backend and the App shell accept, with the C1 defaults', async () => {
  const w = await load();
  assert.deepEqual(w.APP_LOOK_DEFAULT, backend.IMPLEMENT_APP_LOOK_DEFAULT);
  assert.deepEqual(w.APP_OPTION_KEYS, backend.IMPLEMENT_APP_OPTION_KEYS);
  assert.deepEqual(w.PER_USER_OFF, backend.IMPLEMENT_PER_USER_OFF);
  assert.deepEqual(w.MERGE_OUTPUTS, backend.IMPLEMENT_MERGE_OUTPUTS);
  assert.deepEqual(w.APP_ACCESS_CHOICES.map((c) => c.id), SHELL.auths);
  assert.deepEqual(w.APP_STYLES.map((s) => s.id), SHELL.styles);
  assert.deepEqual(w.APP_LAYOUTS.map((l) => l.id), SHELL.layouts);
  assert.deepEqual(w.APP_THEMES.map((t) => t.id), SHELL.themes);
  assert.deepEqual(w.APP_OPTIONS.map((o) => o.id), backend.IMPLEMENT_APP_OPTION_KEYS.filter((o) => o !== 'replace_edits'));
  assert.deepEqual(w.APP_ACCESS_CHOICES.map((c) => c.label), [
    'Sensitive data: each person signs in as themselves (per-user)',
    'Internal data: the App uses its own service principal',
  ]);
  assert.equal(w.LAKEVIEW_STYLE_NOTE, 'Only style A matches the Lakeview dashboard look.');
  assert.deepEqual(w.APP_OPTIONS.map((o) => o.label), ['Let people edit data', 'Record decisions']);
  assert.match(w.APP_OPTIONS.find((o) => o.id === 'modify').blurb, /It also lets people own, track and dismiss each flagged record \(the action tracker\)\.$/);
  assert.equal(w.APP_NO_DOWNLOADS, 'The App offers no data downloads.');
  assert.equal(w.APP_REFRESH_NOTE, 'Refresh now: in a shared App anyone who can open it can refresh it; in an App where each person sees only their own data, '
    + 'only you can. One refresh runs at a time.');
  for (const text of [...w.APP_OPTIONS.flatMap((o) => [o.label, o.blurb]), w.PER_USER_REASON, w.APP_REFRESH_NOTE, w.APP_NO_DOWNLOADS]) {
    assert.doesNotMatch(text, /\u2014|\u2013/, `no dashes: ${text}`);
  }
  assert.doesNotMatch(w.APP_OPTIONS.map((o) => `${o.label} ${o.blurb}`).join(' '), /download|export|csv/i, 'no option offers a download');
  assert.equal(w.REPLACE_EDITS_QUESTION, 'Should a new run replace edited records?');
  assert.deepEqual(w.REPLACE_EDITS_CHOICES.map((c) => [c.id, c.label]), [[false, 'No'], [true, 'Yes']], 'No comes first, as the default');
});

test('a new spec has no App access, the default look, every option off and no merge, and it validates once the access is chosen', async () => {
  const { w, spec } = await appSpec();
  const fresh = w.defaultSpecFromUseCase(UC, {});
  assert.equal(fresh.outputs.app_access, '');
  assert.deepEqual(fresh.outputs.app_look, { style: 'a', layout: 'sidebar', palette: 'default', theme: 'light' });
  assert.deepEqual(fresh.outputs.app_options, { modify: false, replace_edits: false, decisions: false });
  assert.deepEqual(fresh.outputs.merge, { app: '', dashboard: '', genie_space: '' });
  assert.ok(backend.validateImplementSpec(spec).errors.some((e) => e.startsWith('choose who the App reads its data as')));
  const chosen = w.withAppAccess(spec, 'sp');
  assert.deepEqual(backend.validateImplementSpec(chosen).errors, []);
  assert.deepEqual(backend.validateImplementSpec(chosen).spec.outputs.app_look, fresh.outputs.app_look);
});

test('per-user sign-in hides and clears record decisions, and the replace question shows only while edits are on', async () => {
  const { w, spec } = await appSpec({ app_access: 'sp', app_options: { modify: false, replace_edits: false, decisions: true } });
  assert.deepEqual(['modify', 'decisions', 'replace_edits'].map((k) => w.appOptionShown(spec, k)), [true, true, false]);
  const perUser = w.withAppAccess(spec, 'user');
  assert.deepEqual(perUser.outputs.app_options, { modify: false, replace_edits: false, decisions: false });
  assert.deepEqual(['modify', 'decisions'].map((k) => w.appOptionShown(perUser, k)), [true, false]);
  assert.match(w.PER_USER_REASON, /: it offers no recorded decisions and no chart image export\.$/);
  assert.doesNotMatch(w.PER_USER_REASON, /download/i);
  const core = appShellPayload(bundledNotebookText()).files['shell_core.py'];
  if (/image_export/.test(core)) assert.match(core, /"image_export": s\["auth"\] == "sp"/, 'the App shell offers chart image export only to a shared App');
  const editing = w.withAppOption(perUser, 'modify', true);
  assert.equal(w.appOptionShown(editing, 'replace_edits'), true);
  assert.equal(editing.outputs.app_options.replace_edits, false, 'a new run keeps edits unless asked');
  const replacing = w.withAppOption(editing, 'replace_edits', true);
  assert.equal(replacing.outputs.app_options.replace_edits, true);
  assert.equal(w.withAppOption(replacing, 'modify', false).outputs.app_options.replace_edits, false, 'turning edits off clears the replace answer');
  assert.deepEqual(w.withAppAccess(replacing, 'sp').outputs.app_options, replacing.outputs.app_options, 'internal access leaves the options alone');
});

test('ticking the App ticks the Genie Agent and locks it, and the lock refuses an untick', async () => {
  const w = await load();
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  const ticked = w.withOutput(spec, 'app', true);
  assert.deepEqual([ticked.outputs.app, ticked.outputs.genie_space], [true, true]);
  assert.equal(w.withOutput(ticked, 'genie_space', false), ticked, 'the Genie Agent cannot be unticked while the App is ticked');
  const off = w.withOutput(ticked, 'app', false);
  assert.deepEqual([off.outputs.app, off.outputs.genie_space], [false, true], 'unticking the App leaves the Genie Agent as it is');
  assert.equal(w.withOutput(off, 'genie_space', false).outputs.genie_space, false);
  assert.deepEqual(w.withOutput(spec, 'alert', true).outputs.alert_recipients, w.defaultAlertRecipients(spec));
  assert.deepEqual(w.wizardSteps('poc', ticked).map((s) => s.id), ['choose', 'data', 'results', 'delivery', 'app_access', 'app_look']);
  assert.deepEqual(w.wizardSteps('poc', off).map((s) => s.id), ['choose', 'data', 'results', 'delivery']);
  assert.deepEqual(w.stepErrors('delivery', { ...ticked, outputs: { ...ticked.outputs, genie_space: false } }), [w.GENIE_FOR_APP_NOTE]);
});

test('joining an existing App deploys to it with its look, Create new brings the use case name back, and per-user into a service-principal App is blocked', async () => {
  const { w, spec } = await appSpec({ app_access: 'user' });
  const sp = { id: 'churn-desk', name: 'churn-desk', access: 'sp', look: { style: 'b', palette: 'ocean' }, per_user_block: 'churn-desk is internal only',
    use_cases: [{ use_case_id: 'N01-U02', name: 'Forecast demand' }, { use_case_id: 'N01-U03', name: 'Score suppliers' },
      { use_case_id: 'N01-U04', name: 'Plan stock' }, { use_case_id: 'N01-U05', name: 'Route vans' }] };
  const user = { id: 'care-desk', name: 'care-desk', access: 'user', use_cases: [{ use_case_id: 'N02-U01', name: 'Care calls' }] };
  const targets = { app: [sp, user], dashboard: [], genie_space: [] };
  const joined = w.withMergeTarget(spec, 'app', sp, 'predict-churn');
  assert.deepEqual([joined.outputs.merge.app, joined.outputs.app_name], ['churn-desk', 'churn-desk']);
  assert.deepEqual(joined.outputs.app_look, { style: 'b', layout: 'sidebar', palette: 'ocean', theme: 'light' });
  assert.equal(w.appMergeBlock(joined, sp), 'churn-desk is internal only');
  assert.deepEqual(w.stepErrors('app_access', joined, { mergeTargets: targets }), ['churn-desk is internal only']);
  assert.deepEqual(w.stepErrors('app_access', w.withAppAccess(joined, 'sp'), { mergeTargets: targets }), []);
  assert.equal(w.appMergeBlock(w.withMergeTarget(spec, 'app', user), user), '', 'per-user may join a per-user App');
  const back = w.withMergeTarget(joined, 'app', null, 'predict-churn');
  assert.deepEqual([back.outputs.merge.app, back.outputs.app_name], ['', 'predict-churn']);
  assert.deepEqual(back.outputs.app_look, w.APP_LOOK_DEFAULT, 'a new App starts from the default look, not the one it nearly joined');
  assert.deepEqual(w.withMergeTarget(joined, 'app', user).outputs.app_look, w.APP_LOOK_DEFAULT, 'an App with no recorded look shows the default');
  assert.deepEqual(w.withMergeTarget(joined, 'dashboard', { id: 'd1' }).outputs.app_look, joined.outputs.app_look, 'a dashboard pick leaves the App look alone');
  assert.equal(w.mergeTargetText(sp), 'Forecast demand, Score suppliers, Plan stock and 1 more');
  assert.equal(w.mergeTargetText(user), 'Care calls');
  const stale = w.withMergeTarget(w.withAppAccess(spec, 'sp'), 'dashboard', { id: 'gone' });
  assert.deepEqual(w.stepErrors('delivery', stale, { mergeTargets: targets }), ['pick a Dashboard Inspire built to add to, or choose Create new']);
  assert.deepEqual(w.stepErrors('delivery', stale, { mergeTargets: targets, held: { dashboard: 'gone' } }), [], 'the one it already holds is fine');
  assert.deepEqual(w.stepErrors('delivery', stale, {}), [], 'nothing is judged before the list loads');
});

test('the result table is picked as catalog, schema and name, defaults to the Inspire Database and refuses a partial name', async () => {
  const w = await load();
  const spec = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  assert.equal(spec.config.result_table, 'main.inspire.n01_u01_out');
  assert.deepEqual(w.resultTableParts(spec.config.result_table), { catalog: 'main', schema: 'inspire', table: 'n01_u01_out' });
  assert.deepEqual(w.resultTableParts(''), { catalog: '', schema: '', table: '' });
  const moved = w.withResultTable(spec, { catalog: 'sales', schema: 'poc', table: ' churn_out ' });
  assert.equal(moved.config.result_table, 'sales.poc.churn_out');
  assert.deepEqual(w.stepErrors('results', moved), []);
  assert.deepEqual(w.stepErrors('results', w.withResultTable(spec, { catalog: 'sales', schema: '', table: 'x' })),
    ['pick a catalog and a schema, and name the result table']);
  assert.deepEqual(w.stepErrors('results', w.withResultTable(spec, { catalog: 'sales', schema: 'poc', table: 'churn out' })),
    ['the result table can only use catalog, schema and table names of letters, digits, _ and -']);
  assert.equal(w.withResultTable(spec, { catalog: '', schema: '', table: '' }).config.result_table, '');
  assert.match(w.RESULT_TABLE_MOVE_NOTE, /copies its history to the new table and keeps the old one/);
});

test('Edit of a version the old wizard saved gets every new App setting with its default, and keeps the ones it saved', async () => {
  const w = await load();
  const fallback = w.defaultSpecFromUseCase(UC, { warehouseId: 'wh1', inspireDatabase: 'main.inspire' });
  const old = w.specFromLatest({ spec_version: 1, spec_json: { ...fallback, outputs: { dashboard: true, app: true, app_name: 'churn-desk' } } }, fallback);
  assert.equal(old.outputs.app_access, '', 'with no App built yet the access stays a choice for the person');
  const live = w.specFromLatest({ spec_version: 1, spec_json: { ...fallback, outputs: { dashboard: true, app: true, app_name: 'churn-desk' } } }, fallback,
    { app: 'churn-desk' });
  assert.equal(live.outputs.app_access, 'sp', 'an App built before the choice existed signs in with its service principal, and Edit says so');
  assert.deepEqual(old.outputs.app_look, w.APP_LOOK_DEFAULT);
  assert.deepEqual(old.outputs.merge, { app: '', dashboard: '', genie_space: '' });
  const saved = w.specFromLatest({ spec_version: 2, spec_json: { ...fallback, outputs: { ...fallback.outputs, app: true, app_access: 'user',
    app_look: { palette: 'mono' }, app_options: { modify: true }, merge: 'bad' } } }, fallback);
  assert.equal(saved.outputs.app_access, 'user');
  assert.deepEqual(saved.outputs.app_look, { ...w.APP_LOOK_DEFAULT, palette: 'mono' });
  assert.deepEqual(saved.outputs.app_options, { modify: true, replace_edits: false, decisions: false });
  assert.deepEqual(saved.outputs.merge, { app: '', dashboard: '', genie_space: '' }, 'a merge that is not an object is dropped');
});

test('every user-visible output label and preflight label says Genie Agent', async () => {
  const w = await load();
  assert.equal(w.IMPLEMENT_OUTPUTS.find((o) => o.id === 'genie_space').label, 'Genie Agent');
  assert.equal(w.PREFLIGHT_LABELS.genie_spaces, 'Genie Agents');
  assert.equal(backend.IMPLEMENT_OUTPUT_LABELS.genie_space, 'Genie Agent');
  const fs = require('node:fs');
  const files = [
    path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'implementWizard.js'),
    path.resolve(__dirname, '..', '..', 'frontend', 'src', 'pages', 'ImplementWizard.jsx'),
    path.resolve(__dirname, '..', 'lib', 'inspireImplement.js'),
    path.resolve(__dirname, '..', 'implementRoutes.js'),
    path.resolve(__dirname, '..', '..', 'frontend', 'src', 'pages', 'ImplementPage.jsx'),
    path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'implementControl.js'),
    path.resolve(__dirname, '..', 'lib', 'implementControl.js'),
    ...['BuildUi.jsx', 'ImplementControlTower.jsx', 'PocProgress.jsx', 'GenieFeed.jsx', 'ImplementCardActions.jsx', 'ImplementStatusBadge.jsx', 'VibesEditor.jsx']
      .map((name) => path.resolve(__dirname, '..', '..', 'frontend', 'src', 'components', name)),
  ];
  for (const file of files) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /Genie spaces?\b|Space name/, path.basename(file));
});
