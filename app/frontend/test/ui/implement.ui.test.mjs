import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSpecFromUseCase, lostTablesText } from '../../src/lib/implementWizard.js';
import { HARNESS_USE_CASE, HARNESS_SETTINGS } from './implementFixtures.js';
import { closeBrowser, lowContrast, openUi, until } from './uiSupport.mjs';

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
};

test.after(closeBrowser);

async function onStep(page, label) {
  try {
    await page.locator('[aria-current="step"]', { hasText: label }).waitFor({ timeout: 15000 });
  } catch (e) {
    const shown = await page.locator('[role="alert"] p').allTextContents();
    throw new Error(`the wizard did not reach "${label}": ${shown.join(' | ') || e.message}`);
  }
}

const next = (page) => page.getByRole('button', { name: 'Next' }).click();
const studioTab = (page, name) => page.getByRole('tab', { name, exact: true }).click();
const editPane = (page) => page.getByRole('region', { name: 'Edit the PoC/MVP' });

async function toData(page) {
  await onStep(page, 'Choose');
  await next(page);
  await onStep(page, 'Data');
}
const advanced = (page) => page.getByRole('button', { name: 'Advanced settings' });
const footerErrors = (page) => page.locator('[role="alert"] p').allTextContents();

async function implementWhenReady(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Start PoC/MVP' && !b.disabled),
    null, { timeout: 15000 });
  await page.getByRole('button', { name: 'Start PoC/MVP', exact: true }).click();
}

function submittedSpec(made) {
  const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'));
  assert.equal(inserts.length, 1);
  return JSON.parse(inserts[0].parameters.find((p) => p.name === 'spec').value);
}

test('the wizard is three steps: Choose shows the summary with Full PoC as the default, Data shows Inspire\'s tables, Delivery picks the outputs, and Start PoC launches one run', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await onStep(page, 'Choose');
    assert.deepEqual(await page.locator('ol li').allTextContents(), ['1. Choose', '2. Data', '3. Delivery']);
    const summary = page.getByRole('region', { name: 'Executive summary' });
    await summary.getByText('Cut churn in the top segment').waitFor();
    await summary.getByText('Head of Retention').waitFor();
    assert.equal(await page.getByRole('radio', { name: /^Full PoC\/MVP \(default\)/ }).isChecked(), true);
    assert.equal(await page.getByRole('radio', { name: /^Notebook only/ }).isChecked(), false);
    assert.equal(await advanced(page).count(), 0, 'Choose has nothing under Advanced settings');
    await next(page);
    await onStep(page, 'Data');
    assert.deepEqual(await page.locator('[data-table]').evaluateAll((rows) => rows.map((r) => r.dataset.table)), ['main.s.orders', 'main.s.returns']);
    assert.equal(await advanced(page).getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByLabel('Goal sentence').count(), 0, 'every other setting waits under Advanced settings');
    await next(page);
    await onStep(page, 'Delivery');
    assert.equal(await page.getByRole('checkbox', { name: /^Dashboard/ }).isChecked(), true, 'the dashboard is the default');
    for (const name of [/^Genie space/, /^App /, /^Alert/]) assert.equal(await page.getByRole('checkbox', { name }).isChecked(), false, String(name));
    await page.getByRole('checkbox', { name: /^Genie space/ }).check();
    await page.getByRole('checkbox', { name: /^App / }).check();
    assert.equal(await page.getByLabel('App name').inputValue(), 'predict-churn', 'the App is named after the use case');
    await page.getByText("'predict-churn' is free").waitFor();
    await page.getByRole('checkbox', { name: /^Alert/ }).check();
    await page.getByText(`Emails ${OWNER} when Act now rows in the latest run >= 1.`).waitFor();
    const fresh = page.getByRole('group', { name: 'Keep it fresh' });
    assert.equal(await fresh.getByRole('button', { name: 'Off' }).getAttribute('aria-pressed'), 'true', 'Keep it fresh starts Off');
    await fresh.getByRole('button', { name: 'Weekly' }).click();
    assert.equal(await fresh.getByRole('button', { name: 'Weekly' }).getAttribute('aria-pressed'), 'true');
    assert.equal(made.jobs.length, 0);
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();

    assert.equal(made.jobs.length, 1);
    const params = made.jobs[0].params;
    assert.equal(params['15_operation'], 'Implement Use Cases');
    assert.equal(params.inspire_implement_use_case, 'N01-U01');
    assert.equal(params.inspire_implement_spec_version, '1');
    const spec = submittedSpec(made);
    assert.equal(spec.use_case.decision_owner, OWNER);
    assert.deepEqual(spec.data.column_roles, {}, 'a new PoC/MVP leaves every column role to Inspire');
    assert.equal(spec.config.result_table, RESULT_TABLE);
    assert.deepEqual(
      { dashboard: spec.outputs.dashboard, genie_space: spec.outputs.genie_space, app: spec.outputs.app, alert: spec.outputs.alert },
      { dashboard: true, genie_space: true, app: true, alert: true },
    );
    assert.equal(spec.outputs.app_name, 'predict-churn');
    assert.deepEqual(spec.outputs.alert_recipients, [OWNER]);
    assert.deepEqual([spec.schedule.enabled, spec.schedule.cron], [true, '0 0 6 ? * MON']);
    assert.deepEqual(spec.schedule.failure_emails, [OWNER]);
    assert.deepEqual(spec.sharing.principals, [{ type: 'user', name: OWNER }]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the wizard names the use case as the card the person clicked, while the data comes from the tracking table', async () => {
  const { Name: _cardName, ...row } = HARNESS_USE_CASE;
  const ui = await openUi('wizard', { useCase: { ...row, use_case: 'Keep customers who would leave', statement: 'Keep the top segment buying' } });
  const { page, made } = ui;
  try {
    await onStep(page, 'Choose');
    const summary = page.getByRole('region', { name: 'Executive summary' });
    await summary.getByText('Keep the top segment buying').waitFor();
    assert.equal(await summary.locator('h3').innerText(), HARNESS_USE_CASE.Name);
    assert.equal(await page.getByRole('dialog').getByText('Keep customers who would leave').count(), 0, 'one name for the use case, the one on its card');
    await next(page);
    await onStep(page, 'Data');
    await next(page);
    await onStep(page, 'Delivery');
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.equal(submittedSpec(made).use_case_name, HARNESS_USE_CASE.Name);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Edit keeps the card name even when the saved version carries the tracking-table name', async () => {
  const legacy = built({ spec_json: JSON.stringify({ ...builtSpec(), use_case_name: 'Keep customers who would leave' }) });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [legacy] });
  const { page } = ui;
  try {
    const shown = page.locator('[data-implement-page]');
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.getByRole('heading', { name: HARNESS_USE_CASE.Name, exact: true }).waitFor();
    assert.equal(await shown.getByText('Keep customers who would leave').count(), 0);
    await studioTab(page, 'Edit');
    await editPane(page).getByRole('button', { name: 'Edit the PoC/MVP' }).click();
    await onStep(page, 'Choose');
    const summary = page.getByRole('region', { name: 'Executive summary' });
    await summary.waitFor();
    assert.equal(await summary.locator('h3').innerText(), HARNESS_USE_CASE.Name);
    assert.equal(await page.getByRole('dialog').getByText('Keep customers who would leave').count(), 0, 'one name for the use case, the one on its card');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Edit of a failed version the old wizard saved under the use case id names the App from the use case, since no App was built', async () => {
  const oldWizard = { ...builtSpec(), outputs: { ...builtSpec().outputs, app_name: 'n01-u01' } };
  const failed = built({
    status: 'failed', spec_json: JSON.stringify(oldWizard), result_rows: null, asset_status: null,
    dashboard_id: null, dashboard_url: null, genie_space_id: null, genie_space_url: null, app_name: null, app_url: null, alert_id: null, alert_url: null,
  });
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' }, history: [failed] });
  try {
    await toData(ui.page);
    await next(ui.page);
    await onStep(ui.page, 'Delivery');
    assert.equal(await ui.page.getByLabel('App name').inputValue(), 'predict-churn', 'the App is named after the use case, not its id');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the wizard covers the screen from any scroll position, above the App header, inside an animated page', async () => {
  const ui = await openUi('wizard&nest=1', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  try {
    const overlay = page.locator('[data-implement-overlay]');
    await overlay.waitFor();
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForFunction(() => window.scrollY === 1200);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('main')).transform === 'none', null, { timeout: 5000 })
      .catch(async () => {
        throw new Error(`the page animation leaves a transform behind: ${await page.evaluate(() => getComputedStyle(document.querySelector('main')).transform)}`);
      });
    assert.equal(await overlay.evaluate((el) => el.parentElement === document.body), true, 'the wizard renders at the top of the page');
    const box = await overlay.boundingBox();
    assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 1440, 1000], 'the wizard fills the viewport');
    assert.equal(await page.evaluate(() => Boolean(document.elementFromPoint(720, 30)?.closest('[data-implement-overlay]'))), true,
      'the App header never paints over the wizard');
    const dialog = await page.getByRole('dialog', { name: 'Start Use Case PoC/MVP with Genie' }).boundingBox();
    assert.ok(dialog.y >= 0 && dialog.y + dialog.height <= 1000, JSON.stringify(dialog));
    const button = await page.getByRole('button', { name: 'Next' }).boundingBox();
    assert.ok(button.y >= 0 && button.y + button.height <= 1000, 'Next is on screen without scrolling the page');
    await page.getByRole('region', { name: 'Executive summary' }).waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the signed-in person is the decision owner and is shared with by default, and removing them under Advanced sticks', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await toData(page);
    await advanced(page).click();
    assert.equal(await page.getByLabel('Decision owner').inputValue(), OWNER);
    await next(page);
    await onStep(page, 'Delivery');
    await advanced(page).click();
    const chip = page.getByRole('button', { name: `${OWNER} ×` });
    await chip.waitFor();
    await chip.click();
    await chip.waitFor({ state: 'detached' });
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const spec = submittedSpec(made);
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
    await toData(page);
    await next(page);
    await onStep(page, 'Delivery');
    const appBox = page.getByRole('checkbox', { name: /^App / });
    await appBox.waitFor();
    assert.equal(await appBox.isDisabled(), true);
    const reason = await page.getByText('Inspire cannot create this App:', { exact: false }).textContent();
    assert.ok(reason.includes(`Inspire cannot create this App: a new App could not read ${RESULT_TABLE}: its service principal needs USE CATALOG on catalog \`main\` (owner admins)`), reason);
    assert.ok(reason.includes('Inspire cannot manage'), reason);
    assert.equal(await page.getByRole('checkbox', { name: /^Genie space/ }).isDisabled(), false);
    const warn = page.locator('span.text-warning-fg', { hasText: `${OWNER} may not be able to read the result table` });
    await warn.waitFor();
    assert.equal(await warn.count(), 1, 'the warning shows on the main view, once');
    assert.match(await warn.textContent(), new RegExp(`${OWNER} needs CAN USE on .* to open the dashboard, because they query with their own access`));
    assert.equal(await page.getByRole('note', { name: 'Where Inspire saves the PoC/MVP' }).count(), 0, 'a session outside /Shared shows no folder warning');
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.equal(submittedSpec(made).outputs.app, false);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a session that saves under /Shared says on Delivery that everyone can edit the PoC, without blocking it', async () => {
  const session = { business_name: 'Acme', discovery_type: 'Deep', catalogs: 'main', schemas_str: 's', tables_str: 'main.s.orders',
    generation_path: '/Shared/demos', inspire_database_name: 'main.inspire' };
  const ui = await openUi('wizard', { session });
  const { page } = ui;
  try {
    await toData(page);
    await next(page);
    await onStep(page, 'Delivery');
    const note = page.getByRole('note', { name: 'Where Inspire saves the PoC/MVP' });
    await note.waitFor();
    assert.match(await note.textContent(), /^Inspire saves this PoC\/MVP under \/Workspace\/Shared\/demos\/acme_implemented\. Everyone in the workspace can edit/);
    assert.equal(await note.evaluate((el) => el.className.includes('text-warning-fg')), true);
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('every column role starts as Inspire\'s choice, a picked column is type-checked, and only the roles the user picked are sent', async () => {
  const columns = [{ column_name: 'order_id', data_type: 'STRING', ordinal_position: 1 }, { column_name: 'order_date', data_type: 'DATE', ordinal_position: 2 }];
  const ui = await openUi('wizard', { columns, me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  const role = (name) => page.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) }).locator('select');
  try {
    await toData(page);
    await advanced(page).click();
    await role('event date').locator('option[value="main.s.orders.order_date"]').waitFor({ state: 'attached' });
    for (const name of ['entity id', 'event date', 'measure', 'label', 'segment']) {
      assert.equal(await role(name).inputValue(), '', `${name} starts empty`);
      assert.equal(await role(name).evaluate((s) => s.selectedOptions[0]?.textContent), "Inspire's choice", name);
    }
    await role('event date').selectOption('main.s.orders.order_id');
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.ok((await footerErrors(page)).some((e) => e.includes('event date main.s.orders.order_id: pick a DATE or TIMESTAMP column')),
      (await footerErrors(page)).join(' | '));
    assert.equal(await page.locator('[aria-current="step"]').innerText(), '2. Data', 'a wrong type keeps the wizard on Data');
    await role('event date').selectOption('main.s.orders.order_date');
    await role('entity id').selectOption('main.s.orders.order_id');
    await role('event date').selectOption('');
    await next(page);
    await onStep(page, 'Delivery');
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.deepEqual(submittedSpec(made).data.column_roles, { entity_id: 'main.s.orders.order_id' },
      'a role set back to Inspire\'s choice is not sent');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('roles an older wizard guessed come back with the version, and one click sets every role back to Inspire\'s choice', async () => {
  const columns = [{ column_name: 'order_id', data_type: 'STRING', ordinal_position: 1 }, { column_name: 'order_date', data_type: 'DATE', ordinal_position: 2 }];
  const guessed = { ...builtSpec(), data: { ...builtSpec().data, column_roles: { entity_id: 'main.s.orders.order_date', event_date: 'main.s.orders.order_id' } } };
  const failed = built({
    status: 'failed', spec_json: JSON.stringify(guessed), result_rows: null, asset_status: null,
    dashboard_id: null, dashboard_url: null, genie_space_id: null, genie_space_url: null, app_name: null, app_url: null, alert_id: null, alert_url: null,
  });
  const ui = await openUi('wizard', { columns, me: { userName: OWNER, displayName: 'Owner' }, history: [failed] });
  const { page, made } = ui;
  const role = (name) => page.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) }).locator('select');
  const reset = page.getByRole('button', { name: "Reset roles to Inspire's choice", exact: true });
  try {
    await toData(page);
    await advanced(page).click();
    await role('event date').locator('option[value="main.s.orders.order_date"]').waitFor({ state: 'attached' });
    assert.equal(await role('entity id').inputValue(), 'main.s.orders.order_date', 'the earlier version\'s roles come back');
    assert.equal(await reset.count(), 1, 'a set role shows the reset');
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    const shown = await footerErrors(page);
    assert.ok(shown.some((e) => e.startsWith('entity id main.s.orders.order_date:')), shown.join(' | '));
    assert.ok(shown.includes("Reset roles to Inspire's choice, under Advanced settings, sets every role back at once"), shown.join(' | '));
    await reset.click();
    for (const name of ['entity id', 'event date', 'measure', 'label', 'segment']) {
      assert.equal(await role(name).inputValue(), '', `${name} is back to Inspire's choice`);
    }
    assert.equal(await reset.count(), 0, 'with every role on Inspire\'s choice there is nothing to reset');
    await next(page);
    await onStep(page, 'Delivery');
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.deepEqual(submittedSpec(made).data.column_roles, {}, 'the reset sends no role');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Next stops when the data to work with has no rows and says what to widen, and the count says what it leaves out', async () => {
  const columns = [{ column_name: 'order_id', data_type: 'STRING', ordinal_position: 1 }, { column_name: 'order_date', data_type: 'DATE', ordinal_position: 2 }];
  const ui = await openUi('wizard&discovery=Deep', { columns, readinessRows: [{ row_count: '0' }], me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  const eventDate = () => page.getByLabel('event date');
  try {
    await toData(page);
    await advanced(page).click();
    await eventDate().locator('option[value="main.s.returns.order_date"]').waitFor({ state: 'attached' });
    await eventDate().selectOption('main.s.orders.order_date');
    await page.getByLabel('Window start').fill('2026-10-26');
    await page.getByLabel('Window end').fill('2026-10-28');
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page),
      ['No rows to work with: main.s.orders has no rows inside the date window you picked. Widen or clear it under Advanced settings.']);
    assert.equal(await page.locator('[aria-current="step"]').innerText(), '2. Data', 'the wizard stays on Data');
    assert.equal(await advanced(page).getAttribute('aria-expanded'), 'true');
    const counted = made.sqlCalls.filter((c) => String(c.sql).startsWith('SELECT COUNT(*) AS row_count'));
    assert.equal(counted.length, 1);
    assert.ok(counted[0].sql.includes('`order_date` >= CAST(:wstart AS DATE)'), counted[0].sql);

    made.state.readinessRows = [{ row_count: '1200' }];
    await eventDate().selectOption('main.s.returns.order_date');
    await next(page);
    await onStep(page, 'Delivery');
    await page.getByText('Inspire found 1,200 rows to work with in main.s.orders. This count leaves out the date window on main.s.returns; the preview run applies it.').waitFor();
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('what blocks a step shows in the footer, opens Advanced on the field to fix, and clears as it is fixed', async () => {
  const ui = await openUi('wizard', { useCase: { ...HARNESS_USE_CASE, statement: '', sponsor: '' }, me: { userName: '', displayName: '' } });
  const { page, made } = ui;
  try {
    await toData(page);
    assert.deepEqual(await footerErrors(page), [], 'nothing is flagged before the person tries to move on');
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['write the goal sentence', 'name the decision owner']);
    assert.equal(await advanced(page).getAttribute('aria-expanded'), 'true');
    await page.getByLabel('Goal sentence').fill('Cut churn in the top segment');
    await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"] p')].length === 1);
    assert.deepEqual(await footerErrors(page), ['name the decision owner']);
    await page.getByLabel('Decision owner').fill('Head of Retention');
    await next(page);
    await onStep(page, 'Delivery');
    await page.getByRole('checkbox', { name: /^Alert/ }).check();
    await page.getByText('Nobody gets it yet: add an email under Advanced settings.').waitFor();
    assert.equal(await advanced(page).getAttribute('aria-expanded'), 'false');
    await implementWhenReady(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['an alert needs at least one recipient email or notification destination']);
    assert.equal(await advanced(page).getAttribute('aria-expanded'), 'true');
    assert.equal(made.jobs.length, 0);
    await page.getByLabel('Email recipients (comma separated)').fill(OWNER);
    await page.locator('[role="alert"]').waitFor({ state: 'detached' });
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.deepEqual(submittedSpec(made).outputs.alert_recipients, [OWNER]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('an App name another App already uses offers the next name, and Implement waits until the name is free', async () => {
  const ui = await openUi('wizard', {
    me: { userName: OWNER, displayName: 'Owner' },
    appsByName: { 'predict-churn': { name: 'predict-churn', description: 'Sales forecasting tool' } },
  });
  const { page, made } = ui;
  try {
    await toData(page);
    await next(page);
    await onStep(page, 'Delivery');
    await page.getByRole('checkbox', { name: /^App / }).check();
    await page.getByText("'predict-churn' is used by another App in this workspace; pick another name.", { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start PoC/MVP', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Use predict-churn-2' }).click();
    assert.equal(await page.getByLabel('App name').inputValue(), 'predict-churn-2');
    await page.getByText("'predict-churn-2' is free").waitFor();
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    assert.equal(submittedSpec(made).outputs.app_name, 'predict-churn-2');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Change swaps a table for a similar one or drops it, and never offers to drop the primary table', async () => {
  const ui = await openUi('wizard', {
    me: { userName: OWNER, displayName: 'Owner' },
    swapRows: [{ table_schema: 's2', table_name: 'orders_v2', matched: '5', total: '6' }],
  });
  const { page, made } = ui;
  try {
    await toData(page);
    const row = (table) => page.locator(`[data-table="${table}"]`);
    await row('main.s.orders').getByRole('button', { name: 'Change' }).click();
    const ordersPick = page.getByLabel('Table to use for main.s.orders');
    await page.waitForFunction(() => [...document.querySelectorAll('option')].some((o) => o.textContent === 'main.s2.orders_v2 (5 of 6 columns match)'));
    const drop = ordersPick.locator('option', { hasText: "Don't use this table" });
    assert.equal(await drop.textContent(), "Don't use this table (the primary table can be swapped, not removed)");
    assert.equal(await drop.isDisabled(), true);
    await ordersPick.selectOption('main.s2.orders_v2');
    await row('main.s.orders').getByText('main.s2.orders_v2', { exact: true }).waitFor();
    await row('main.s.orders').getByText('instead of main.s.orders').waitFor();
    await row('main.s.returns').getByRole('button', { name: 'Change' }).click();
    await page.getByLabel('Table to use for main.s.returns').selectOption('__remove__');
    await page.getByText('Removed main.s.returns.', { exact: false }).waitFor();
    await row('main.s.returns').getByRole('button', { name: 'Use it again' }).waitFor();
    await next(page);
    await onStep(page, 'Delivery');
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const spec = submittedSpec(made);
    assert.deepEqual(spec.data.tables, { 'main.s.orders': 'main.s2.orders_v2' });
    assert.deepEqual(spec.data.removed_tables, ['main.s.returns']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the Implement page is about the delivery methods: every output and the job runs of a built version, and no result rows', async () => {
  const ui = await openUi('implement', STUDIO_STATE);
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.locator('p', { hasText: /^Ready$/ }).first().waitFor();
    const listed = page.getByRole('navigation', { name: 'Use cases' });
    await listed.getByRole('region', { name: 'Ready' }).getByText('PoC/MVP ready', { exact: true }).waitFor();
    assert.equal(await listed.locator('[aria-current="true"]').innerText().then((t) => t.includes(HARNESS_USE_CASE.Name)), true);
    assert.deepEqual(await page.getByRole('tablist', { name: 'PoC/MVP views' }).getByRole('tab').allTextContents(),
      ['Progress', 'Dashboard', 'Genie', 'App', 'Alert', 'History', 'Edit']);
    assert.equal(await page.getByRole('tab', { name: 'Results', exact: true }).count(), 0);

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
  const ui = await openUi('implement', STUDIO_STATE);
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.locator('p', { hasText: /^Ready$/ }).first().waitFor();
    await studioTab(page, 'Edit');
    const rerun = page.getByRole('button', { name: 'Preview re-run' });
    await rerun.waitFor();
    const quick = editPane(page);
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
  const warned = await openUi('implement', { ...STUDIO_STATE, history: [built({ status: 'ready_with_warnings', status_message: why })] });
  try {
    await warned.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const chip = warned.page.locator('p', { hasText: /^Warnings$/ }).first();
    await chip.waitFor();
    assert.equal(await chip.evaluate((p) => p.nextElementSibling?.textContent), why);
    assert.deepEqual(warned.pageErrors, []);
  } finally {
    await warned.close();
  }
  const ready = await openUi('implement', { ...STUDIO_STATE, history: [built({ status_message: 'ready: preview wrote 3 row(s)' })] });
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
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [stopped, built()], implementRun: run });
  const { page } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const chip = page.locator('p', { hasText: /^Stopped$/ }).first();
    await chip.waitFor();
    assert.equal(await chip.evaluate((p) => p.nextElementSibling?.textContent),
      'the run building v2 ended (CANCELED: Run cancelled) while v2 was still filling. Edit submits a new version.');
    assert.equal(await page.getByRole('link', { name: 'Open the run that stopped' }).getAttribute('href'), run.run_page_url);
    await page.getByRole('navigation', { name: 'Use cases' }).getByRole('region', { name: 'Failed' }).getByText('PoC/MVP stopped', { exact: true }).waitFor();
    await studioTab(page, 'Edit');
    assert.equal(await editPane(page).getByRole('button', { name: 'Edit the PoC/MVP' }).isEnabled(), true);
    assert.equal(await page.getByRole('checkbox', { name: 'Schedule on' }).isEnabled(), true);
    await studioTab(page, 'History');
    await page.getByText('v2 · stopped before it finished · initial').waitFor();
    await page.getByText('v1 · ready · initial').waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const busy = await openUi('implement', { ...STUDIO_STATE, history: [stopped, built()],
    implementRun: { run_id: 1066484287074577, state: { life_cycle_state: 'RUNNING' } } });
  try {
    await busy.page.locator('p', { hasText: /^filling$/ }).first().waitFor();
    await busy.page.getByRole('navigation', { name: 'Use cases' }).getByRole('region', { name: 'In progress' }).getByText('PoC/MVP running', { exact: true }).waitFor();
    await studioTab(busy.page, 'Edit');
    assert.equal(await busy.page.getByRole('button', { name: 'Edit applies after this run' }).isEnabled(), false);
    assert.equal(await busy.page.getByRole('checkbox', { name: 'Schedule on' }).isEnabled(), false);
    assert.equal(await busy.page.getByText('Open the run that stopped').count(), 0);
    assert.deepEqual(busy.pageErrors, []);
  } finally {
    await busy.close();
  }
});

const genieLogLine = (second, words) => `2026-10-26 10:${String(Math.floor(second / 60)).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}`
  + ` - inspire - INFO - [GENIE N01-U01] [build] Genie: ${words}`;

test('the Progress tab keeps Genie\'s messages in a fixed box that scrolls as they arrive, types them out, and never shows log lines or JSON', async () => {
  const said = (i) => `Step ${i}: I'm checking the notebook instructions and the Databricks workflow before I build the dashboard.`;
  const first = Array.from({ length: 24 }, (_, i) => genieLogLine(i, said(i)));
  first.push(genieLogLine(30, JSON.stringify({ status: 'built', summary: 'Built the dashboard and checked every tile.', files: ['x.py'] })));
  const building = built({ status: 'building_outputs', status_message: 'building outputs', implement_run_id: '1066484287074577', updated_at: new Date().toISOString() });
  const stepRow = (phase, status, time) => ({
    stage_name: 'Implement Use Cases', step_id: phase.length, step_name: `Inspire is working on ${phase.toLowerCase()}`, sub_step_name: 'Completed: n01-u01',
    status, last_updated: `2026-10-26T${time}.000Z`, result_json: JSON.stringify({ use_case_id: 'N01-U01', phase }),
  });
  const steps = [stepRow('Plan', 'ended_success', '10:01:00'), stepRow('Instruction', 'started', '10:01:05'),
    stepRow('Instruction', 'ended_success', '10:03:50'), stepRow('Genie build', 'started', '10:04:05')];
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [building], liveLog: first.join('\n'), steps,
    implementRun: { run_id: 1066484287074577, state: { life_cycle_state: 'RUNNING' } } });
  const { page, made } = ui;
  const box = page.getByRole('log', { name: "Genie's messages" });
  const metrics = () => box.evaluate((el) => ({
    height: el.offsetHeight, scroll: el.scrollHeight, gap: el.scrollHeight - el.scrollTop - el.clientHeight,
    page: document.scrollingElement.scrollHeight, y: window.scrollY,
  }));
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await box.getByText('Built the dashboard and checked every tile.').waitFor();
    await page.locator('[data-stage-state="done"]', { hasText: '2m 45s' }).waitFor();
    const text = await box.innerText();
    assert.ok(text.includes(said(23)), 'messages already in the log show at once');
    for (const raw of ['[GENIE', '[build]', 'Genie: ', '{"status"', '"summary"', 'x.py']) assert.ok(!text.includes(raw), `the box never shows ${raw}`);
    assert.ok(await box.locator('svg').count() >= 25, 'every Genie message carries the Genie logo');
    assert.equal(await page.getByRole('progressbar', { name: 'Build progress' }).isVisible(), true);
    assert.equal(await page.locator('[data-genie-working]').isVisible(), true, 'a working row shows while Genie builds');
    const before = await metrics();
    assert.equal(before.height, 320, 'the box keeps a fixed height');
    assert.ok(before.scroll > before.height * 2, 'the messages scroll inside the box');
    assert.ok(before.gap < 48, 'the box opens on the latest message');

    const later = Array.from({ length: 12 }, (_, i) => genieLogLine(40 + i, `Now wiring tile ${i} of the Drivers page with its own query and a short caption.`));
    made.state.liveLog = [...first, ...later].join('\n');
    await page.locator('[data-genie-feed] .animate-cursor-blink').waitFor({ timeout: 20000 });
    await box.getByText('Now wiring tile 11 of the Drivers page with its own query and a short caption.').waitFor({ timeout: 30000 });
    const after = await metrics();
    assert.equal(after.height, 320);
    assert.ok(after.scroll > before.scroll, 'new messages land inside the box');
    assert.ok(after.gap < 48, 'the box follows new messages to the bottom');
    assert.equal(after.page, before.page, 'the page does not grow as messages arrive');
    assert.equal(after.y, before.y, 'the page does not scroll as messages arrive');
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const progress = await lowContrast(page, ['[data-poc-progress]', '[data-genie-feed]']);
      assert.ok(progress.checked >= 20, `measured ${progress.checked} progress elements`);
      assert.deepEqual(progress.low, [], dark ? 'dark Progress tab' : 'light Progress tab');
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a failed output offers its own retry, which submits the next version that rebuilds only that output', async () => {
  const assets = JSON.parse(built().asset_status);
  const warned = built({
    spec_version: 2, status: 'ready_with_warnings', status_message: 'Genie space: space create 403',
    asset_status: JSON.stringify({ ...assets, genie_space: { state: 'failed', error: 'space create 403', spec_version: 1 } }),
  });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [warned] });
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.getByText('The Genie space failed.', { exact: false }).waitFor();
    await studioTab(page, 'Genie');
    await page.getByText('The Genie space failed on v1: space create 403').waitFor();
    await studioTab(page, 'App');
    await page.locator('table tr').first().waitFor();
    assert.equal(await page.getByText(/failed on v1/).count(), 0);
    assert.equal(made.jobs.length, 0);

    await page.getByRole('button', { name: 'Retry on the Edit tab' }).click();
    const retries = editPane(page).getByRole('button', { name: /^Retry the / });
    await retries.first().waitFor();
    assert.deepEqual((await retries.allTextContents()).map((t) => t.trim()), ['Retry the Genie space']);
    assert.equal(await page.getByRole('button', { name: 'Retry on the Edit tab' }).count(), 0, 'the pointer goes once the retries are on screen');
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

test('an output that was built can be rebuilt on its own from the Edit tab, and a failed one stays under the retries', async () => {
  const assets = JSON.parse(built().asset_status);
  const warned = built({
    spec_version: 2, status: 'ready_with_warnings', status_message: 'Genie space: space create 403',
    asset_status: JSON.stringify({ ...assets, genie_space: { state: 'failed', error: 'space create 403', spec_version: 2 } }),
  });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [warned] });
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await studioTab(page, 'Edit');
    const rebuilds = editPane(page).getByRole('button', { name: /^Rebuild the / });
    await rebuilds.first().waitFor();
    assert.deepEqual((await rebuilds.allTextContents()).map((t) => t.trim()), ['Rebuild the App', 'Rebuild the Alert']);
    assert.deepEqual((await editPane(page).getByRole('button', { name: /^Retry the / }).allTextContents()).map((t) => t.trim()),
      ['Retry the Genie space']);
    await editPane(page).getByRole('button', { name: 'Rebuild the App' }).click();
    await until(() => made.jobs.length === 1, 'the rebuild implement run');
    const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO'));
    assert.equal(inserts.length, 1);
    const value = (name) => inserts[0].parameters.find((p) => p.name === name).value;
    assert.deepEqual([value('v'), value('based'), value('classes')], ['3', '2', 'retry']);
    const spec = JSON.parse(value('spec'));
    assert.deepEqual(spec.retry_outputs, ['app']);
    assert.equal(spec.outputs.app_name, 'churn-desk', 'the rebuild keeps the App it replaces');
    assert.equal(made.jobs[0].params.inspire_implement_spec_version, '3');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const busy = await openUi('implement', { ...STUDIO_STATE, history: [built({ status: 'building_outputs' })],
    implementRun: { run_id: 1066484287074577, state: { life_cycle_state: 'RUNNING' } } });
  try {
    await busy.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await studioTab(busy.page, 'Edit');
    await busy.page.getByRole('checkbox', { name: 'Schedule on' }).waitFor();
    assert.equal(await editPane(busy.page).getByRole('button', { name: /^Rebuild the / }).count(), 0, 'nothing is rebuilt while a version runs');
    assert.deepEqual(busy.pageErrors, []);
  } finally {
    await busy.close();
  }
});

test('a dropped source table stops the re-run with its name, and Edit opens the Data step with that table marked and its Change open', async () => {
  const ui = await openUi('implement', { ...STUDIO_STATE, probeErrors: { '`main`.`s`.`returns`': GONE } });
  const { page, made } = ui;
  const missing = [{ table: 'main.s.returns', reason: 'not found' }];
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.locator('p', { hasText: /^Ready$/ }).first().waitFor();
    await studioTab(page, 'Edit');
    await page.getByRole('button', { name: 'Preview re-run' }).click();
    await page.getByText(lostTablesText(missing)).waitFor();
    await page.getByText('409: the preview cannot run because these source tables are missing or not readable: main.s.returns (not found).', { exact: false }).waitFor();
    assert.ok(!made.fetches.some((f) => f.path === '/api/2.1/jobs/run-now'));

    await page.getByRole('button', { name: 'Edit the Data step' }).click();
    await onStep(page, 'Data');
    await page.getByRole('dialog').getByText(lostTablesText(missing)).waitFor();
    const lostRow = page.locator('[data-table="main.s.returns"]');
    await lostRow.getByText('not found', { exact: true }).waitFor();
    assert.match(await lostRow.getAttribute('class'), /border-error\/50/);
    await page.getByLabel('Table to use for main.s.returns').waitFor();
    const primaryRow = page.locator('[data-table="main.s.orders"]');
    await primaryRow.getByText('Primary', { exact: true }).waitFor();
    assert.doesNotMatch(await primaryRow.getAttribute('class'), /border-error/);
    assert.equal(await page.getByLabel('Table to use for main.s.orders').count(), 0, 'only the lost table opens its Change');
    assert.equal(made.sqlCalls.some((c) => /FROM `main`\.`inspire`\.`n01_u01_out` WHERE as_of_date/.test(String(c.sql))), false, 'no result rows are read');
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(ui.pageErrors, ['Failed to load resource: the server responded with a status of 409 (Conflict)'], 'the refused re-run is the only error');
  } finally {
    await ui.close();
  }
});

test('Use case details on the Implement page open the full use case in a drawer that closes with Escape and leaves the tabs alone', async () => {
  const ui = await openUi('implement', STUDIO_STATE);
  const { page } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await studioTab(page, 'Genie');
    await page.getByRole('button', { name: 'Use case details' }).click();
    const drawer = page.getByRole('dialog', { name: `Use case details: ${HARNESS_USE_CASE.Name}` });
    await drawer.getByRole('heading', { name: HARNESS_USE_CASE.Name, level: 2 }).waitFor();
    await drawer.getByText(HARNESS_USE_CASE.statement).first().waitFor();
    await drawer.getByText('PoC/MVP ready', { exact: true }).first().waitFor();
    assert.equal(await drawer.getByRole('button', { name: 'Open in Build' }).count(), 0, 'already on the Implement page');
    assert.equal(await drawer.getByRole('button', { name: /^(Previous|Next) use case$/ }).count(), 0, 'one use case, no paging');
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('tab', { name: 'Genie', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: 'Use case details' }).click();
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await drawer.waitFor({ state: 'detached' });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a use case with no PoC offers to start one, reads no result table, and the wizard shows its title and id on every step', async () => {
  const never = await openUi('implement', { ...STUDIO_STATE, history: [] });
  try {
    await never.page.getByText('No PoC/MVP yet.', { exact: false }).waitFor();
    await never.page.getByRole('navigation', { name: 'Use cases' }).getByRole('region', { name: 'Not started' }).getByText(HARNESS_USE_CASE.Name).waitFor();
    assert.equal(await never.page.getByRole('tablist', { name: 'PoC/MVP views' }).count(), 0, 'no tabs before a PoC exists');
    assert.equal(never.made.sqlCalls.some((c) => /^SELECT \* FROM `main`\.`inspire`\.`n01_u01_out`/.test(String(c.sql))), false, 'no result table read');
    await never.page.getByRole('button', { name: 'Start Use Case PoC/MVP with Genie' }).click();
    await onStep(never.page, 'Choose');
    assert.equal(await never.page.getByRole('region', { name: 'Executive summary' }).locator('h3').innerText(), HARNESS_USE_CASE.Name);
    const header = never.page.locator('[data-wizard-header]');
    for (const label of ['Choose', 'Data', 'Delivery']) {
      if (label !== 'Choose') {
        await next(never.page);
        await onStep(never.page, label);
      }
      assert.equal(await header.getByRole('heading', { level: 2 }).innerText(), HARNESS_USE_CASE.Name, label);
      assert.equal(await header.getByRole('list', { name: 'About this use case' }).innerText().then((t) => t.replace(/\s+/g, ' ').trim()), 'ID N01-U01', label);
    }
    await never.page.getByRole('dialog', { name: `Start Use Case PoC/MVP with Genie: ${HARNESS_USE_CASE.Name}` }).waitFor();
    assert.deepEqual(never.pageErrors, []);
  } finally {
    await never.close();
  }
});

const EDITED_AT = Date.UTC(2026, 9, 25, 5, 0, 0);
const EDITED_REASON = 'the notebook /tmp/out/acme_implemented/Sales/N01-U01 was edited after Inspire last built it, so this version did not '
  + 'rebuild it: rebuild it with Edit the PoC/MVP on the Build page to overwrite those edits, or keep them and change only the outputs or the schedule';

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
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [editedVersion(), built()] });
  const { page, made } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
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
  const kept = await openUi('implement', { ...STUDIO_STATE,
    history: [built({ asset_status: JSON.stringify({ ...assets, notebook: { modified_at: 1, state: 'edited', edited_at: EDITED_AT } }) })] });
  try {
    await kept.page.locator('p', { hasText: /^Ready$/ }).first().waitFor();
    assert.equal(await kept.page.getByRole('button', { name: 'Rebuild and overwrite the edits' }).count(), 0,
      'a built version that kept the edits offers no overwrite');
  } finally {
    await kept.close();
  }
});

test('Edit after notebook edits asks on Delivery whether to overwrite them, and only a ticked box confirms', async () => {
  const ui = await openUi('wizard', { ...STUDIO_STATE, history: [editedVersion(), built()], me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await toData(page);
    await next(page);
    await onStep(page, 'Delivery');
    const box = page.getByRole('checkbox', { name: /^Overwrite the edits made to the notebook on / });
    await box.waitFor();
    assert.equal(await box.isChecked(), false, 'an Edit never starts confirmed');
    const asks = page.getByText('This version rebuilds the notebook, so it stops and asks again unless you tick this.');
    await asks.waitFor();
    await box.check();
    await asks.waitFor({ state: 'detached' });
    await implementWhenReady(page);
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
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
    await toData(fresh.page);
    await next(fresh.page);
    await onStep(fresh.page, 'Delivery');
    await fresh.page.getByText('nothing changed since the last built version', { exact: false }).waitFor();
    assert.equal(await fresh.page.getByRole('button', { name: 'Start PoC/MVP', exact: true }).isDisabled(), true, 'an edit with no change cannot submit');
    assert.equal(await fresh.page.getByRole('checkbox', { name: /^Overwrite the edits/ }).count(), 0, 'no recorded edit, no question');
    assert.equal(await fresh.page.getByLabel('App name').inputValue(), 'churn-desk', 'an edit keeps the live App name');
  } finally {
    await fresh.close();
  }
});

test('Notebook only skips the PoC settings, flags only this use case, starts Generate Use Cases, and the Implement page follows the notebook run', async () => {
  const notebookPath = '/Users/owner@example.com/inspire/Acme/N01-U01';
  const flaggedRow = { ...HARNESS_USE_CASE, generate_genie_code_instruction: 'Yes', has_genie_code: 'N' };
  const runUrl = 'https://workspace.example.com/#job/7/run/99';
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  made.state.afterTrigger = () => {
    made.state.useCase = flaggedRow;
    made.state.jobsList = { jobs: [{ job_id: 7, created_time: 1, settings: { name: 'Inspire AI - Genie Code - 42' } }] };
    made.state.runsByJob = { 7: { runs: [{ run_id: 99, state: { life_cycle_state: 'RUNNING' }, run_page_url: runUrl }] } };
  };
  try {
    await onStep(page, 'Choose');
    await page.getByRole('radio', { name: /^Notebook only/ }).check();
    assert.deepEqual(await page.locator('ol li').allTextContents(), ['1. Choose', '2. Data', '3. Notebook']);
    await next(page);
    await onStep(page, 'Data');
    const tables = page.getByRole('region', { name: 'Tables the notebook uses' });
    assert.deepEqual(await tables.locator('li > span.font-mono').allTextContents(), ['main.s.orders', 'main.s.returns']);
    await tables.locator('li', { hasText: 'main.s.orders' }).getByText('primary', { exact: true }).waitFor();
    assert.equal(await advanced(page).count(), 0, 'Notebook only has no PoC settings');
    assert.equal(await page.getByRole('button', { name: 'Change' }).count(), 0, 'Notebook only never swaps a table');
    await next(page);
    await onStep(page, 'Notebook');
    const step = page.getByRole('region', { name: 'Notebook' });
    await step.getByRole('heading', { name: 'Write the Genie Code notebook' }).waitFor();
    await step.getByText('under /tmp/out/acme.', { exact: false }).waitFor();
    assert.equal(made.jobs.length, 0);
    await page.getByRole('button', { name: 'Generate notebook' }).click();
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();

    assert.equal(made.jobs.length, 1);
    assert.equal(made.jobs[0].jobType, 'genie_regen');
    assert.equal(made.jobs[0].jobName, 'Inspire AI - Genie Code - 42');
    assert.equal(made.jobs[0].params['15_operation'], 'Generate Use Cases');
    assert.deepEqual(made.flagged.map((f) => [f.sid, f.ids]), [['42', ['N01-U01']]]);
    assert.equal(made.sqlCalls.some((c) => String(c.sql).includes('INSERT INTO')), false, 'Notebook only writes no PoC version');

    const nav = page.getByRole('navigation', { name: 'Use cases' });
    await nav.getByRole('region', { name: 'In progress' }).getByText('Notebook running', { exact: true }).waitFor();
    const panel = page.getByRole('region', { name: 'Genie Code notebook' });
    assert.equal(await panel.getByRole('link', { name: 'Open the notebook run' }).getAttribute('href'), runUrl);
    assert.equal(await panel.getByRole('link', { name: 'Open the notebook', exact: true }).count(), 0, 'no notebook link before it is written');

    made.state.useCase = { ...flaggedRow, generate_genie_code_instruction: 'No', has_genie_code: 'Y', notebook_path: notebookPath };
    made.state.runsByJob = { 7: { runs: [{ run_id: 99, state: { life_cycle_state: 'TERMINATED', result_state: 'SUCCESS' }, run_page_url: runUrl }] } };
    await nav.getByRole('region', { name: 'Ready' }).getByText('Notebook ready', { exact: true }).waitFor({ timeout: 25000 });
    assert.equal(await panel.getByRole('link', { name: 'Open the notebook', exact: true }).getAttribute('href'),
      `https://workspace.example.com/#workspace/Workspace${notebookPath}`);
    await page.getByRole('button', { name: 'Start Use Case PoC/MVP with Genie' }).waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the Implement page groups every use case by its state, searches by name, id or domain, and starts a PoC from one with none', async () => {
  const useCases = [
    { ...HARNESS_USE_CASE, _domain: 'Retention' },
    { id: 'N01-U02', Name: 'Forecast demand', use_case: 'Forecast demand', _domain: 'Supply', statement: 'Plan stock a week ahead',
      primary_table: 'main.s.orders', tables_involved: 'main.s.orders' },
    { id: 'N02-U01', Name: 'Score suppliers', use_case: 'Score suppliers', _domain: 'Supply', has_genie_code: 'Y',
      notebook_path: '/Users/owner@example.com/inspire/Acme/N02-U01' },
  ];
  const ui = await openUi('implement', { ...STUDIO_STATE, useCases });
  const { page } = ui;
  const nav = page.getByRole('navigation', { name: 'Use cases' });
  const group = (name) => nav.getByRole('region', { name });
  const names = (name) => group(name).locator('button > div:first-child').allTextContents();
  const search = (text) => page.getByLabel('Search use cases').fill(text);
  try {
    await group('Ready').getByText('PoC/MVP ready', { exact: true }).waitFor();
    assert.deepEqual(await nav.locator('h2').allTextContents(), ['In progress (0)', 'Ready (2)', 'Failed (0)', 'Not started (1)']);
    assert.deepEqual(await names('Ready'), ['Predict churn', 'Score suppliers']);
    assert.deepEqual(await names('Not started'), ['Forecast demand']);
    await group('Ready').getByRole('button', { name: /Score suppliers/ }).getByText('Notebook ready', { exact: true }).waitFor();
    assert.equal(await group('Not started').locator('[data-implement-status]').count(), 0, 'a use case with nothing built has no label');
    await page.getByRole('heading', { name: 'Predict churn', exact: true }).waitFor();

    await search('supply');
    await group('Ready').getByText('Predict churn').waitFor({ state: 'detached' });
    assert.deepEqual(await names('Ready'), ['Score suppliers']);
    assert.deepEqual(await names('Not started'), ['Forecast demand']);
    await page.getByRole('heading', { name: 'Predict churn', exact: true }).waitFor();
    await search('N01-U02');
    await group('Ready').getByText('Score suppliers').waitFor({ state: 'detached' });
    assert.deepEqual(await names('Not started'), ['Forecast demand']);
    await search('nothing like this');
    await nav.getByText('No use case matches "nothing like this".').waitFor();
    await search('');

    await group('Not started').getByRole('button', { name: /Forecast demand/ }).click();
    await page.getByRole('heading', { name: 'Forecast demand', exact: true }).waitFor();
    await page.getByText('No PoC/MVP yet.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('tablist', { name: 'PoC/MVP views' }).count(), 0);
    await page.getByRole('button', { name: 'Start Use Case PoC/MVP with Genie' }).click();
    await onStep(page, 'Choose');
    assert.equal(await page.getByRole('region', { name: 'Executive summary' }).locator('h3').innerText(), 'Forecast demand');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('[data-implement-overlay]').waitFor({ state: 'detached' });

    await group('Ready').getByRole('button', { name: /Score suppliers/ }).click();
    const panel = page.getByRole('region', { name: 'Genie Code notebook' });
    assert.equal(await panel.getByRole('link', { name: 'Open the notebook', exact: true }).getAttribute('href'),
      'https://workspace.example.com/#workspace/Workspace/Users/owner@example.com/inspire/Acme/N02-U01');
    await page.getByRole('button', { name: 'Start Use Case PoC/MVP with Genie' }).waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a card has one button, Start Use Case PoC/MVP with Genie, and a status label that is text, not a control', async () => {
  const ui = await openUi('card');
  const { page } = ui;
  const card = (id) => page.locator(`[data-card="${id}"]`);
  try {
    await card('running').getByText('PoC/MVP running', { exact: true }).waitFor();
    for (const id of ['not-started', 'running', 'notebook']) {
      assert.deepEqual(await card(id).getByRole('button').allTextContents(), ['Start Use Case PoC/MVP with Genie'], id);
      assert.equal(await card(id).getByRole('link').count(), 0, id);
    }
    assert.equal(await card('not-started').locator('[data-implement-status]').count(), 0, 'nothing built, no label');
    const label = card('notebook').locator('[data-implement-status]');
    assert.equal(await label.textContent(), 'Notebook ready');
    assert.equal(await label.evaluate((el) => el.tagName), 'SPAN');
    assert.equal(await card('no-session').getByRole('button').count(), 0, 'without a session and warehouse the card offers no start');
    await card('no-session').getByText('PoC/MVP ready', { exact: true }).waitFor();
    await card('running').getByRole('button').click();
    await label.click();
    assert.equal(await page.getByLabel('Clicks').textContent(), 'start:running,card:notebook', 'the button never toggles the card, and the label has no action of its own');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the control tower shows each asset live, stops the App through Inspire, and removes the dashboard only once the use case id is typed', async () => {
  const pocJob = { job_id: 77, settings: { tags: { dbx_inspire_ai_run_type: 'implement', dbx_inspire_ai_session_id: '42', dbx_inspire_ai_usecase_id: 'N01-U01' },
    schedule: { quartz_cron_expression: '0 0 6 * * ?', timezone_id: 'UTC', pause_status: 'UNPAUSED' } } };
  const ui = await openUi('implement', { ...STUDIO_STATE, job: pocJob, spacesOk: true, alertsOk: true,
    responses: { 'POST /api/2.0/apps/churn-desk/stop': [{}] } });
  const { page, made } = ui;
  try {
    const tower = page.getByRole('region', { name: 'Control tower' });
    await tower.locator('[data-control="app"]').getByText('Running', { exact: true }).waitFor();
    assert.deepEqual(await tower.locator('[data-control]').evaluateAll((rows) => rows.map((r) => r.dataset.control)),
      ['job', 'dashboard', 'genie_space', 'app', 'alert']);
    await tower.locator('[data-control="dashboard"]').getByText('Published', { exact: true }).waitFor();
    await tower.locator('[data-control="job"]').getByText('Scheduled: 0 0 6 * * ? (UTC)').waitFor();
    assert.equal(await tower.locator('[data-control="genie_space"]').getByRole('button', { name: /Stop|Start|Publish/ }).count(), 0,
      'a Genie space has nothing to stop or start');

    await tower.getByRole('button', { name: 'Stop the App' }).click();
    await until(() => made.fetches.some((f) => f.path === '/api/2.0/apps/churn-desk/stop' && f.opts.method === 'POST'), 'the App stop call');
    await until(() => made.sqlCalls.some((c) => String(c.sql).startsWith('INSERT INTO `main`.`inspire`.`__inspire_control_log`')), 'the audit row');
    assert.equal(made.jobs.length, 0, 'stopping the App starts no Inspire run');

    await tower.locator('[data-control="dashboard"]').getByRole('button', { name: 'Remove' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove the Dashboard' });
    const confirm = dialog.getByRole('button', { name: 'Remove the Dashboard' });
    assert.equal(await confirm.isDisabled(), true);
    await dialog.getByLabel('Type the use case id to confirm').fill('n01-u01');
    assert.equal(await confirm.isDisabled(), true, 'the id must match exactly');
    await dialog.getByLabel('Type the use case id to confirm').fill('N01-U01');
    await confirm.click();
    await until(() => made.jobs.length === 1, 'the implement run that deletes the dashboard');
    const spec = submittedSpec(made);
    assert.deepEqual([spec.outputs.dashboard, spec.outputs.genie_space, spec.outputs.app, spec.outputs.alert], [false, true, true, true]);
    assert.deepEqual(spec.removed_outputs, { dashboard: 'delete' });
    assert.equal(made.jobs[0].params['15_operation'], 'Implement Use Cases');
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the whole Implement page, the use case details and the wizard read at 4.5:1 or better in light and in dark', async () => {
  const ui = await openUi('implement', STUDIO_STATE);
  const { page } = ui;
  try {
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.locator('p', { hasText: /^Ready$/ }).first().waitFor();
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const mode = dark ? 'dark' : 'light';
      const plain = await lowContrast(page, ['body']);
      assert.ok(plain.checked >= 40, `${mode}: measured ${plain.checked} text elements`);
      assert.deepEqual(plain.low, [], `${mode} Implement page`);
      await page.getByRole('button', { name: 'Use case details' }).click();
      const details = await lowContrast(page, ['[role="dialog"]']);
      assert.ok(details.checked >= 15, `${mode}: measured ${details.checked} detail elements`);
      assert.deepEqual(details.low, [], `${mode} use case details`);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      await studioTab(page, 'Edit');
      await editPane(page).getByRole('button', { name: 'Edit the PoC/MVP' }).click();
      await onStep(page, 'Choose');
      const wizard = await lowContrast(page, ['[role="dialog"]']);
      assert.ok(wizard.checked >= 15, `${mode}: measured ${wizard.checked} wizard elements`);
      assert.deepEqual(wizard.low, [], `${mode} wizard`);
      await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the control tower and its Remove dialog read at 4.5:1 or better in light and in dark', async () => {
  const pocJob = { job_id: 77, settings: { tags: { dbx_inspire_ai_run_type: 'implement', dbx_inspire_ai_session_id: '42', dbx_inspire_ai_usecase_id: 'N01-U01' },
    schedule: { quartz_cron_expression: '0 0 6 * * ?', timezone_id: 'UTC', pause_status: 'UNPAUSED' } } };
  const note = "Ask Genie is off because this use case's Genie Agent is not ready: the space has no tables";
  const assets = JSON.parse(built().asset_status);
  const warned = built({ status: 'ready_with_warnings', status_message: `App: ${note}`,
    asset_status: JSON.stringify({ ...assets, app: { ...assets.app, warnings: [note] } }) });
  const ui = await openUi('implement', { ...STUDIO_STATE, history: [warned], job: pocJob, spacesOk: true, alertsOk: true,
    controlLog: [{ asset: 'app', asset_id: 'churn-desk', action: 'stop', result: 'done', message: 'Stop the App: done', acted_by: OWNER, acted_at: '2026-10-26T10:00:00.000Z' },
      { asset: 'dashboard', asset_id: 'd1', action: 'unpublish', result: 'failed', message: 'Unpublish the dashboard: failed', acted_by: OWNER, acted_at: '2026-10-26T09:00:00.000Z' }],
    responses: { 'GET /api/2.0/lakeview/dashboards/d1/published': [{ embed_credentials: true, revision_create_time: '2026-10-26T08:00:00.000Z' }] } });
  const { page } = ui;
  try {
    const tower = page.getByRole('region', { name: 'Control tower' });
    await tower.locator('[data-control="app"]').getByText('Running', { exact: true }).waitFor();
    await tower.getByRole('list', { name: 'Recent control actions' }).waitFor();
    await tower.locator('[data-control="dashboard"]').getByText('Shares its publisher’s access', { exact: true }).waitFor();
    await tower.locator('[data-control="dashboard"]').getByRole('button', { name: 'Publish again' }).waitFor();
    await tower.locator('[data-control="app"]').getByRole('list', { name: 'App warnings' }).getByText(note, { exact: true }).waitFor();
    assert.equal(await tower.getByRole('list', { name: /warnings$/ }).count(), 1, 'only the App ended with a warning');
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const mode = dark ? 'dark' : 'light';
      const plain = await lowContrast(page);
      assert.ok(plain.checked >= 20, `${mode}: measured ${plain.checked} text elements`);
      assert.deepEqual(plain.low, [], `${mode} tower`);
      await tower.locator('[data-control="dashboard"]').getByRole('button', { name: 'Remove' }).click();
      const dialog = page.getByRole('dialog', { name: 'Remove the Dashboard' });
      await dialog.getByLabel('Type the use case id to confirm').fill('N01');
      const withDialog = await lowContrast(page);
      assert.ok(withDialog.checked > plain.checked, `${mode}: the dialog was measured`);
      assert.deepEqual(withDialog.low, [], `${mode} Remove dialog`);
      await dialog.getByLabel('Type the use case id to confirm').fill('N01-U01');
      const confirm = dialog.getByRole('button', { name: /^Remove/ }).last();
      assert.equal(await confirm.isEnabled(), true, 'the right id enables the confirm');
      const armed = await lowContrast(page);
      assert.ok(armed.checked > withDialog.checked, `${mode}: the enabled confirm was measured`);
      assert.deepEqual(armed.low, [], `${mode} armed Remove dialog`);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await dialog.waitFor({ state: 'detached' });
    }
    const times = await tower.getByRole('list', { name: 'Recent control actions' }).innerText();
    assert.doesNotMatch(times, /T10:00|\.000Z/, 'times read as a local date and time');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});
