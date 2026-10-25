import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { defaultSpecFromUseCase, lostTablesText } from '../../src/lib/implementWizard.js';
import { HARNESS_USE_CASE, HARNESS_SETTINGS } from './implementFixtures.js';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { makeApp, listen } = createRequire(import.meta.url)('../../../backend/test/support/implementApp.js');

const OWNER = 'owner@example.com';
const RESULT_TABLE = 'main.inspire.n01_u01_out';
const GONE = '[TABLE_OR_VIEW_NOT_FOUND] The table or view `main`.`s`.`returns` cannot be found. Verify the spelling. SQLSTATE: 42P01';

const builtSpec = () => {
  const spec = defaultSpecFromUseCase(HARNESS_USE_CASE, { warehouseId: HARNESS_SETTINGS.warehouseId, inspireDatabase: HARNESS_SETTINGS.inspireDatabase, owner: OWNER });
  return {
    ...spec,
    outputs: { ...spec.outputs, genie_space: true, app: true, app_name: 'churn-desk', alert: true, alert_recipients: [OWNER],
      genie_questions: ['Which customers should we call first?'] },
  };
};

const built = (extra = {}) => ({
  session_id: '42', use_case_id: 'N01-U01', spec_version: 1, status: 'ready', change_classes: 'initial', created_by: OWNER,
  updated_at: '2026-10-25T04:00:00Z', spec_json: JSON.stringify(builtSpec()), job_id: '77', last_preview_run_id: '9001', result_rows: '3',
  dashboard_id: 'd1', dashboard_url: 'https://workspace.example.com/dashboardsv3/d1/published',
  genie_space_id: 'g1', genie_space_url: 'https://workspace.example.com/genie/rooms/g1',
  app_name: 'churn-desk', app_url: 'https://churn-desk-1.aws.databricksapps.com',
  alert_id: 'a1', alert_url: 'https://workspace.example.com/sql/alerts-v2/a1',
  genie_widgets: JSON.stringify([
    { name: 'top_k', type: 'text', default: '25', allowed: 'whole number, at least 1', label: 'Top K' },
    { name: 'result_table', type: 'text', default: RESULT_TABLE },
    { name: 'run_profile', type: 'dropdown', default: 'full', choices: ['preview', 'full'] },
  ]),
  asset_status: JSON.stringify({
    genie_space: {
      state: 'ready', sample_questions: ['Which customers should we call first?', 'How many customers are in Act now?'],
      question_notes: [{ question: 'how many customers are in act now?', note: 'The rows are accounts, so it counts accounts in Act now.' }],
      check_question: 'Which customers should we call first?', check_sql: `SELECT entity_id FROM ${RESULT_TABLE} ORDER BY rank LIMIT 10`,
    },
    app: { state: 'ready', health: 'running', spec_version: 1 },
    alert: { state: 'ready', trigger: 'Act now rows in the latest run >= 1', check_state: 'OK', subscribers: 1 },
  }),
  ...extra,
});

const STUDIO_STATE = {
  history: [built()],
  appExists: true,
  app: {
    name: 'churn-desk', url: 'https://churn-desk-1.aws.databricksapps.com', description: 'Inspire use case N01-U01 (session 42): Predict churn',
    app_status: { state: 'RUNNING', message: 'App is running' }, compute_status: { state: 'ACTIVE' },
    active_deployment: { status: { state: 'SUCCEEDED', message: 'App started successfully' }, update_time: '2026-10-25T04:10:00Z' },
  },
  runs: { runs: [
    { run_id: 9001, start_time: Date.UTC(2026, 9, 25, 4, 0, 0), run_duration: 95000, trigger: 'ONE_TIME',
      state: { life_cycle_state: 'TERMINATED', result_state: 'SUCCESS', state_message: '' },
      overriding_parameters: { notebook_params: { run_profile: 'preview' } }, run_page_url: 'https://workspace.example.com/#job/77/run/9001' },
    { run_id: 9002, start_time: Date.UTC(2026, 9, 25, 6, 0, 0), run_duration: 30000, trigger: 'PERIODIC',
      state: { life_cycle_state: 'TERMINATED', result_state: 'FAILED', state_message: 'Workload failed' } },
  ] },
  resultRows: [
    { rank: '1', entity_id: 'C-17', priority_tier: 'Act now', segment_or_item: 'Books', score: '0.91', as_of_date: '2026-10-25' },
    { rank: '2', entity_id: 'C-08', priority_tier: 'Act now', segment_or_item: 'Books', score: '0.88', as_of_date: '2026-10-25' },
    { rank: '3', entity_id: 'C-44', priority_tier: 'Review', segment_or_item: 'Music', score: '0.61', as_of_date: '2026-10-25' },
  ],
  summary: [
    { as_of_date: '2026-10-25', priority_tier: 'Act now', rows: '2' },
    { as_of_date: '2026-10-25', priority_tier: 'Review', rows: '1' },
    { as_of_date: '2026-10-18', priority_tier: 'Monitor', rows: '9' },
  ],
  segments: [{ segment_or_item: 'Books', rows: '2' }, { segment_or_item: 'Music', rows: '1' }],
};

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); });

async function openUi(open, overrides = {}) {
  const made = makeApp({ useCase: HARNESS_USE_CASE, ...overrides });
  const backend = await listen(made.app);
  const vite = await createServer({
    root: frontend,
    configFile: path.join(frontend, 'vite.config.js'),
    logLevel: 'error',
    clearScreen: false,
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': backend.url }, hmr: false },
  });
  await vite.listen();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/test/ui/implement.html?open=${open}`);
  return {
    made, page, pageErrors,
    close: async () => { await page.close(); await vite.close(); await backend.close(); },
  };
}

async function until(check, what, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function onStep(page, label) {
  try {
    await page.locator('[aria-current="step"]', { hasText: label }).waitFor({ timeout: 15000 });
  } catch (e) {
    const shown = await page.locator('p.text-error').allTextContents();
    throw new Error(`the wizard did not reach "${label}": ${shown.join(' | ') || e.message}`);
  }
}

const next = (page) => page.getByRole('button', { name: 'Next' }).click();
const studioTab = (page, name) => page.getByRole('button', { name, exact: true }).click();

test('the wizard walks all six steps and its spec launches exactly one implement run', async () => {
  const ui = await openUi('wizard');
  const { page, made } = ui;
  try {
    await onStep(page, 'Use case');
    assert.equal(await page.getByLabel('Goal sentence').inputValue(), 'Cut churn in the top segment');
    await page.getByLabel('Decision owner').fill(OWNER);
    await next(page);
    await onStep(page, 'Data');
    await page.locator('span.font-mono', { hasText: 'main.s.returns' }).waitFor();
    await next(page);
    await onStep(page, 'Configure');
    await page.getByPlaceholder('25').waitFor();
    await next(page);
    await onStep(page, 'Run and schedule');
    await next(page);
    await onStep(page, 'Use it');
    await page.getByRole('button', { name: `${OWNER} ×` }).waitFor();
    await page.getByRole('checkbox', { name: /^Genie space/ }).check();
    await page.getByPlaceholder('Up to 5 questions, one per line').fill('Which customers should we call first?\nHow many customers are in Act now?');
    await page.getByRole('checkbox', { name: /^App / }).check();
    await page.getByPlaceholder('app-name').fill('churn-desk');
    await page.getByPlaceholder('What the App should let people do').fill('Work the call list and record each call');
    await page.getByRole('checkbox', { name: /^Alert/ }).check();
    assert.equal(await page.getByLabel('Email recipients (comma separated)').inputValue(), OWNER);
    await next(page);
    await onStep(page, 'Review');
    assert.equal(made.jobs.length, 0);
    await page.getByRole('button', { name: 'Implement', exact: true }).click();
    await page.getByRole('heading', { name: 'Use Case Studio' }).waitFor();

    assert.equal(made.jobs.length, 1);
    const params = made.jobs[0].params;
    assert.equal(params['15_operation'], 'Implement Use Cases');
    assert.equal(params.inspire_implement_use_case, 'N01-U01');
    assert.equal(params.inspire_implement_spec_version, '1');
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const spec = JSON.parse(inserts[0].parameters.find((p) => p.name === 'spec').value);
    assert.equal(spec.use_case.decision_owner, OWNER);
    assert.equal(spec.config.result_table, RESULT_TABLE);
    assert.deepEqual(
      { dashboard: spec.outputs.dashboard, genie_space: spec.outputs.genie_space, app: spec.outputs.app, alert: spec.outputs.alert },
      { dashboard: true, genie_space: true, app: true, alert: true },
    );
    assert.equal(spec.outputs.app_name, 'churn-desk');
    assert.deepEqual(spec.outputs.genie_questions, ['Which customers should we call first?', 'How many customers are in Act now?']);
    assert.deepEqual(spec.outputs.alert_recipients, [OWNER]);
    assert.deepEqual(spec.schedule.failure_emails, [OWNER]);
    assert.deepEqual(spec.sharing.principals, [{ type: 'user', name: OWNER }]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the signed-in person starts as decision owner and as the one the outputs are shared with, and removing them sticks', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await onStep(page, 'Use case');
    assert.equal(await page.getByLabel('Decision owner').inputValue(), OWNER);
    await next(page);
    await onStep(page, 'Data');
    await page.locator('span.font-mono', { hasText: 'main.s.returns' }).waitFor();
    await next(page);
    await onStep(page, 'Configure');
    await page.getByPlaceholder('25').waitFor();
    await next(page);
    await onStep(page, 'Run and schedule');
    await next(page);
    await onStep(page, 'Use it');
    const chip = page.getByRole('button', { name: `${OWNER} ×` });
    await chip.waitFor();
    await chip.click();
    await chip.waitFor({ state: 'detached' });
    await next(page);
    await onStep(page, 'Review');
    await page.getByRole('button', { name: 'Implement', exact: true }).click();
    await page.getByRole('heading', { name: 'Use Case Studio' }).waitFor();
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const spec = JSON.parse(inserts[0].parameters.find((p) => p.name === 'spec').value);
    assert.equal(spec.use_case.decision_owner, OWNER);
    assert.deepEqual(spec.sharing.principals, []);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a new App that could not get access is disabled up front with the reason, and a sharing gap warns without blocking', async () => {
  const sp = (level, privilege, principal, mine) => ({ level, privilege, principal, mine: mine ? 'true' : 'false', me: 'inspire-sp' });
  const access = [sp('catalog', 'OWNER', 'admins', false), sp('schema', 'OWNER', 'data-eng', false), sp('catalog', 'USE_CATALOG', 'inspire-sp', true),
    sp('schema', 'USE_SCHEMA', 'inspire-sp', true), sp('schema', 'CREATE_TABLE', 'inspire-sp', true)];
  const ui = await openUi('wizard', { access, me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await onStep(page, 'Use case');
    await next(page);
    await onStep(page, 'Data');
    await page.locator('span.font-mono', { hasText: 'main.s.returns' }).waitFor();
    await next(page);
    await onStep(page, 'Configure');
    await page.getByPlaceholder('25').waitFor();
    await next(page);
    await onStep(page, 'Run and schedule');
    await next(page);
    await onStep(page, 'Use it');
    const appBox = page.getByRole('checkbox', { name: /^App / });
    await appBox.waitFor();
    assert.equal(await appBox.isDisabled(), true);
    const reason = await page.getByText('Inspire cannot create this App:', { exact: false }).textContent();
    assert.ok(reason.startsWith(`Inspire cannot create this App: a new App could not read ${RESULT_TABLE}: its service principal needs USE CATALOG on catalog \`main\` (owner admins)`), reason);
    assert.ok(reason.includes('Inspire cannot manage'), reason);
    assert.equal(await page.getByRole('checkbox', { name: /^Genie space/ }).isDisabled(), false);
    await next(page);
    await onStep(page, 'Review');
    const warn = page.locator('span.text-warning', { hasText: `${OWNER} may not be able to read the result table` });
    await warn.waitFor();
    assert.equal(await warn.count(), 1);
    const implement = page.getByRole('button', { name: 'Implement', exact: true });
    assert.equal(await implement.isEnabled(), true);
    await implement.click();
    await page.getByRole('heading', { name: 'Use Case Studio' }).waitFor();
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    assert.equal(JSON.parse(inserts[0].parameters.find((p) => p.name === 'spec').value).outputs.app, false);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the Studio shows every output, the job runs and the filtered results of a built version', async () => {
  const ui = await openUi('studio', STUDIO_STATE);
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Use Case Studio' }).waitFor();
    await page.locator('p', { hasText: /^Ready$/ }).first().waitFor();

    await studioTab(page, 'Results');
    await page.getByText(`3 row(s) of the latest run in ${RESULT_TABLE}`).waitFor();
    const tier = page.locator('label', { hasText: 'Tier' }).locator('select');
    assert.deepEqual(await tier.locator('option').allTextContents(), ['All', 'Act now (2)', 'Review (1)']);
    await tier.selectOption('Act now');
    await page.locator('label', { hasText: 'Segment' }).locator('select').selectOption('Books');
    await until(() => made.sqlCalls.some((c) => String(c.sql).startsWith('SELECT * FROM `main`.`inspire`.`n01_u01_out` WHERE')
      && JSON.stringify(c.parameters) === JSON.stringify([{ name: 'tier', value: 'Act now', type: 'STRING' }, { name: 'segment', value: 'Books', type: 'STRING' }])),
    'the results query filtered by tier and segment');

    await studioTab(page, 'Dashboard');
    assert.equal(await page.getByRole('link', { name: 'Open dashboard' }).getAttribute('href'), 'https://workspace.example.com/dashboardsv3/d1/published');

    await studioTab(page, 'Genie');
    await page.getByText('Sample questions in the space').waitFor();
    assert.deepEqual(await page.locator('ul.list-disc li > span').allTextContents(), ['Which customers should we call first?', 'How many customers are in Act now?']);
    assert.deepEqual(await page.locator('ul.list-disc li').evaluateAll((items) => items.map((li) => li.querySelector('p')?.textContent || '')),
      ['', 'The rows are accounts, so it counts accounts in Act now.']);
    await page.getByText('Inspire checked the space with: Which customers should we call first?').waitFor();
    await page.getByText(`SELECT entity_id FROM ${RESULT_TABLE} ORDER BY rank LIMIT 10`).waitFor();

    await studioTab(page, 'App');
    const appRows = await page.locator('table tr').evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent)));
    assert.deepEqual(appRows.slice(0, 3), [
      ['App', 'RUNNING: App is running'],
      ['Compute', 'ACTIVE'],
      ['Last deployment', 'SUCCEEDED: App started successfully (2026-10-25T04:10:00Z)'],
    ]);
    assert.ok(appRows.some(([label]) => label === 'Health check'));
    assert.deepEqual(appRows.find(([label]) => label === 'Built on'), ['Built on', 'v1']);

    await studioTab(page, 'Alert');
    await page.getByText('Fires when: Act now rows in the latest run >= 1').waitFor();
    await page.getByText('Last check: OK').waitFor();

    await studioTab(page, 'History');
    await page.getByText('v1 · ready · initial').waitFor();
    await page.getByText('SUCCESS · preview · started by hand').waitFor();
    await page.getByText('FAILED · full (job default) · scheduled').waitFor();
    await page.getByText('Workload failed').waitFor();
    assert.equal(await page.getByRole('link', { name: 'Open run' }).first().getAttribute('href'), 'https://workspace.example.com/#job/77/run/9001');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a quick re-run is a preview that sends only the widgets the person changed and never the result table', async () => {
  const ui = await openUi('studio', STUDIO_STATE);
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Use Case Studio' }).waitFor();
    const rerun = page.getByRole('button', { name: 'Preview re-run' });
    await rerun.waitFor();
    const quick = page.locator('aside').last();
    const ownText = (labels) => labels.map((l) => [...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim());
    assert.deepEqual(await quick.locator('label').evaluateAll(ownText), ['Top K', 'Schedule on']);
    assert.equal(await quick.locator('label', { hasText: 'Top K' }).locator('span').textContent(), 'whole number, at least 1');
    await quick.getByPlaceholder('25').fill(' 10 ');
    await rerun.click();
    await until(() => made.fetches.some((f) => f.path === '/api/2.1/jobs/run-now'), 'the run-now call');
    const body = JSON.parse(made.fetches.find((f) => f.path === '/api/2.1/jobs/run-now').opts.body);
    assert.equal(body.job_id, 77);
    assert.deepEqual(body.notebook_params, { top_k: '10', run_profile: 'preview' });
    assert.equal(made.jobs.length, 0);
    assert.equal(made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO')).length, 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a version that ended with a warning says why under its status, and a ready one stays quiet', async () => {
  const why = 'Decision list: no row of the latest run reached Act now or Review (1000 Monitor), so it has nobody to act on yet; '
    + "the run's output says why, such as a model that missed its acceptance check: https://workspace.example.com/jobs/77/runs/9001";
  const warned = await openUi('studio', { ...STUDIO_STATE, history: [built({ status: 'ready_with_warnings', status_message: why })] });
  try {
    await warned.page.getByRole('heading', { name: 'Use Case Studio' }).waitFor();
    const chip = warned.page.locator('p', { hasText: /^Warnings$/ }).first();
    await chip.waitFor();
    assert.equal(await chip.evaluate((p) => p.nextElementSibling?.textContent), why);
    assert.deepEqual(warned.pageErrors, []);
  } finally {
    await warned.close();
  }
  const ready = await openUi('studio', { ...STUDIO_STATE, history: [built({ status_message: 'ready: preview wrote 3 row(s)' })] });
  try {
    await ready.page.locator('p', { hasText: /^Ready$/ }).first().waitFor();
    assert.equal(await ready.page.getByText('ready: preview wrote 3 row(s)').count(), 0);
  } finally {
    await ready.close();
  }
});

test('a version whose run stopped reads as Stopped with the reason and the run, and Edit and the schedule work again', async () => {
  const stopped = built({ spec_version: 2, status: 'filling', status_message: 'filling: v2', implement_run_id: '1066484287074577',
    updated_at: new Date().toISOString() });
  const run = { run_id: 1066484287074577, run_page_url: 'https://workspace.example.com/#job/77/run/1066484287074577',
    state: { life_cycle_state: 'TERMINATED', result_state: 'CANCELED', state_message: 'Run cancelled' } };
  const ui = await openUi('studio', { ...STUDIO_STATE, history: [stopped, built()], implementRun: run });
  const { page } = ui;
  try {
    await page.getByRole('heading', { name: 'Use Case Studio' }).waitFor();
    const chip = page.locator('p', { hasText: /^Stopped$/ }).first();
    await chip.waitFor();
    assert.equal(await chip.evaluate((p) => p.nextElementSibling?.textContent),
      'the run building v2 ended (CANCELED: Run cancelled) while v2 was still filling. Edit submits a new version.');
    assert.equal(await page.getByRole('link', { name: 'Open the run that stopped' }).getAttribute('href'), run.run_page_url);
    await page.locator('aside').first().getByText('Stopped', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).isEnabled(), true);
    assert.equal(await page.getByRole('checkbox', { name: 'Schedule on' }).isEnabled(), true);
    await studioTab(page, 'History');
    await page.getByText('v2 · stopped before it finished · initial').waitFor();
    await page.getByText('v1 · ready · initial').waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const busy = await openUi('studio', { ...STUDIO_STATE, history: [stopped, built()],
    implementRun: { run_id: 1066484287074577, state: { life_cycle_state: 'RUNNING' } } });
  try {
    await busy.page.locator('p', { hasText: /^filling$/ }).first().waitFor();
    assert.equal(await busy.page.getByRole('button', { name: 'Edit applies after this run' }).isEnabled(), false);
    assert.equal(await busy.page.getByRole('checkbox', { name: 'Schedule on' }).isEnabled(), false);
    assert.equal(await busy.page.getByText('Open the run that stopped').count(), 0);
    assert.deepEqual(busy.pageErrors, []);
  } finally {
    await busy.close();
  }
});

test('a failed output offers its own retry, which submits the next version that rebuilds only that output', async () => {
  const assets = JSON.parse(built().asset_status);
  const warned = built({
    spec_version: 2, status: 'ready_with_warnings', status_message: 'Genie space: space create 403',
    asset_status: JSON.stringify({ ...assets, genie_space: { state: 'failed', error: 'space create 403', spec_version: 1 } }),
  });
  const ui = await openUi('studio', { ...STUDIO_STATE, history: [warned] });
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Use Case Studio' }).waitFor();
    const pane = page.locator('aside').last();
    const retries = pane.getByRole('button', { name: /^Retry the / });
    await retries.first().waitFor();
    assert.deepEqual((await retries.allTextContents()).map((t) => t.trim()), ['Retry the Genie space']);
    await studioTab(page, 'Genie');
    await page.getByText('The Genie space failed on v1: space create 403').waitFor();
    await studioTab(page, 'App');
    await page.locator('table tr').first().waitFor();
    assert.equal(await page.getByText(/failed on v1/).count(), 0);
    assert.equal(made.jobs.length, 0);

    await retries.first().click();
    await until(() => made.jobs.length === 1, 'the retry implement run');
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const value = (name) => inserts[0].parameters.find((p) => p.name === name).value;
    assert.deepEqual([value('v'), value('based'), value('classes')], ['3', '2', 'retry']);
    const spec = JSON.parse(value('spec'));
    assert.deepEqual(spec.retry_outputs, ['genie_space']);
    assert.deepEqual(
      { dashboard: spec.outputs.dashboard, genie_space: spec.outputs.genie_space, app: spec.outputs.app, alert: spec.outputs.alert },
      { dashboard: true, genie_space: true, app: true, alert: true },
    );
    assert.equal(made.jobs[0].params['15_operation'], 'Implement Use Cases');
    assert.equal(made.jobs[0].params.inspire_implement_spec_version, '3');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a dropped source table stops the re-run with its name, and Edit opens the Data step with that table marked', async () => {
  const ui = await openUi('studio', { ...STUDIO_STATE, probeErrors: { '`main`.`s`.`returns`': GONE } });
  const { page, made } = ui;
  const missing = [{ table: 'main.s.returns', reason: 'not found' }];
  try {
    await page.getByRole('heading', { name: 'Use Case Studio' }).waitFor();
    await page.getByRole('button', { name: 'Preview re-run' }).click();
    await page.getByText(lostTablesText(missing)).waitFor();
    await page.getByText('409: the preview cannot run because these source tables are missing or not readable: main.s.returns (not found).', { exact: false }).waitFor();
    assert.ok(!made.fetches.some((f) => f.path === '/api/2.1/jobs/run-now'));

    await page.getByRole('button', { name: 'Edit the Data step' }).click();
    await onStep(page, 'Data');
    await page.getByText(lostTablesText(missing)).waitFor();
    const lost = page.locator('span.font-mono', { hasText: 'main.s.returns' });
    assert.match(await lost.textContent(), /^main\.s\.returnsnot found$/);
    assert.match(await page.locator('span.font-mono', { hasText: 'main.s.orders' }).textContent(), /^main\.s\.ordersPrimary$/);
    const lostCard = page.locator('div.border.rounded-lg', { has: lost });
    assert.match(await lostCard.getAttribute('class'), /border-error\/50/);
    assert.equal(made.jobs.length, 0);
  } finally {
    await ui.close();
  }
});

const EDITED_AT = Date.UTC(2026, 9, 25, 5, 0, 0);
const EDITED_REASON = 'the notebook /tmp/out/acme_implemented/Sales/N01-U01 was edited after Inspire last built it, so this version did not '
  + 'rebuild it: rebuild it from the Studio to overwrite those edits, or keep them and change only the outputs or the schedule';

const editedVersion = () => {
  const spec = builtSpec();
  const assets = JSON.parse(built().asset_status);
  return built({
    spec_version: 2, status: 'failed', status_message: EDITED_REASON,
    spec_json: JSON.stringify({ ...spec, config: { ...spec.config, profiles: { ...spec.config.profiles, preview: { entity_cap: 500 } } } }),
    asset_status: JSON.stringify({ ...assets, notebook: { modified_at: EDITED_AT - 60000, spec_version: 1, state: 'edited', edited_at: EDITED_AT } }),
  });
};

test('a version stopped by notebook edits offers a rebuild that overwrites them, submitted as the next version', async () => {
  const ui = await openUi('studio', { ...STUDIO_STATE, history: [editedVersion(), built()] });
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Use Case Studio' }).waitFor();
    await page.getByText(EDITED_REASON).waitFor();
    assert.equal(await page.getByText(EDITED_REASON).count(), 1, 'the reason shows once, next to its action');
    assert.equal(made.jobs.length, 0);
    await page.getByRole('button', { name: 'Rebuild and overwrite the edits' }).click();
    await until(() => made.jobs.length === 1, 'the rebuild implement run');
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const value = (name) => inserts[0].parameters.find((p) => p.name === name).value;
    assert.deepEqual([value('v'), value('based'), value('classes')], ['3', '2', 'config']);
    const spec = JSON.parse(value('spec'));
    assert.equal(spec.confirm_notebook_overwrite, true);
    assert.equal(spec.config.profiles.preview.entity_cap, 500, 'the rebuild keeps the change the stopped version was making');
    assert.equal('retry_outputs' in spec && spec.retry_outputs.length > 0, false);
    assert.equal(made.jobs[0].params.inspire_implement_spec_version, '3');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const assets = JSON.parse(built().asset_status);
  const kept = await openUi('studio', { ...STUDIO_STATE,
    history: [built({ asset_status: JSON.stringify({ ...assets, notebook: { modified_at: 1, state: 'edited', edited_at: EDITED_AT } }) })] });
  try {
    await kept.page.locator('p', { hasText: /^Ready$/ }).first().waitFor();
    assert.equal(await kept.page.getByRole('button', { name: 'Rebuild and overwrite the edits' }).count(), 0,
      'a built version that kept the edits offers no overwrite');
  } finally {
    await kept.close();
  }
});

test('Edit after notebook edits asks on Review whether to overwrite them, and only a ticked box confirms', async () => {
  const ui = await openUi('wizard', { ...STUDIO_STATE, history: [editedVersion(), built()], me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await onStep(page, 'Use case');
    await next(page);
    await onStep(page, 'Data');
    await page.locator('span.font-mono', { hasText: 'main.s.returns' }).waitFor();
    await next(page);
    await onStep(page, 'Configure');
    await next(page);
    await onStep(page, 'Run and schedule');
    await next(page);
    await onStep(page, 'Use it');
    await next(page);
    await onStep(page, 'Review');
    const box = page.getByRole('checkbox', { name: /^Overwrite the edits made to the notebook on / });
    await box.waitFor();
    assert.equal(await box.isChecked(), false, 'an Edit never starts confirmed');
    const asks = page.getByText('This version rebuilds the notebook, so it stops and asks again unless you tick this.');
    await asks.waitFor();
    await box.check();
    await asks.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Implement', exact: true }).click();
    await page.getByRole('heading', { name: 'Use Case Studio' }).waitFor();
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const value = (name) => inserts[0].parameters.find((p) => p.name === name).value;
    assert.deepEqual([value('v'), value('based')], ['3', '2']);
    assert.equal(JSON.parse(value('spec')).confirm_notebook_overwrite, true);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const fresh = await openUi('wizard', { ...STUDIO_STATE, me: { userName: OWNER, displayName: 'Owner' } });
  try {
    await onStep(fresh.page, 'Use case');
    for (const label of ['Data', 'Configure', 'Run and schedule', 'Use it', 'Review']) {
      await next(fresh.page);
      await onStep(fresh.page, label);
    }
    await fresh.page.getByRole('button', { name: 'Implement', exact: true }).waitFor();
    assert.equal(await fresh.page.getByRole('checkbox', { name: /^Overwrite the edits/ }).count(), 0, 'no recorded edit, no question');
  } finally {
    await fresh.close();
  }
});
