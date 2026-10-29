import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSpecFromUseCase } from '../../src/lib/implementWizard.js';
import { HARNESS_USE_CASE, HARNESS_SETTINGS } from './implementFixtures.js';
import { closeBrowser, lowContrast, openUi, until } from './uiSupport.mjs';

const OWNER = ['owner', 'example.com'].join('@');
const PAGE = 'app:page:decisions';
const CHART = 'dashboard:w1a2b3c4';
const NOT_BUILT = 'Inspire has not built the App page decisions on this PoC/MVP, so it cannot rebuild it with your vibes; pick an asset the Control tower lists';

test.after(closeBrowser);

const checks = (...items) => items.map(([ask, status, evidence]) => ({ ask, status, evidence }));
const ready = (version, extra = {}) => ({ state: 'ready', spec_version: version, ...extra });

const builtSpec = (outputs = {}, top = {}) => {
  const spec = defaultSpecFromUseCase(HARNESS_USE_CASE, { warehouseId: HARNESS_SETTINGS.warehouseId, inspireDatabase: HARNESS_SETTINGS.inspireDatabase, owner: OWNER });
  return {
    ...spec,
    ...top,
    outputs: { ...spec.outputs, genie_space: true, app: true, app_name: 'churn-desk', app_access: 'sp', alert: true, alert_recipients: [OWNER], ...outputs },
  };
};

const versionRow = (version, { outputs = {}, assets = {}, top = {}, ...extra } = {}) => ({
  session_id: '42', use_case_id: 'N01-U01', spec_version: version, status: 'ready', change_classes: version === 1 ? 'initial' : 'outputs', created_by: OWNER,
  updated_at: `2026-10-2${version}T04:00:00Z`, spec_json: JSON.stringify(builtSpec(outputs, top)), job_id: '77', last_preview_run_id: '9001', result_rows: '3',
  dashboard_id: 'd1', dashboard_url: 'https://workspace.example.com/dashboardsv3/d1/published',
  genie_space_id: 'g1', genie_space_url: 'https://workspace.example.com/genie/rooms/g1',
  app_name: 'churn-desk', app_url: 'https://churn-desk-1.aws.example.com',
  alert_id: 'a1', alert_url: 'https://workspace.example.com/sql/alerts-v2/a1',
  asset_status: JSON.stringify(assets),
  ...extra,
});

const V3_OUTPUTS = {
  dashboard_vibes: 'Put the weekly trend first\nArabic labels',
  genie_space_vibes: 'Answer in euros, name the rows you counted and add a question about returns',
  [`${PAGE}_vibes`]: 'Dark header\nRows to act on first',
  [`${CHART}_vibes`]: 'Bars by week\nA map by region',
};

const V3_ASSETS = {
  notebook: { spec_version: 2, modified_at: 1 },
  dashboard: ready(3, { snapshot: true, vibes_checks: checks(['Put the weekly trend first', 'done', 'The first widget is the weekly trend'],
    ['Arabic labels', 'missing', 'The dashboard has no Arabic font']) }),
  [CHART]: { state: 'ready_with_warnings', spec_version: 3, name: 'Weekly trend', what: 'Bars by week, the last 8 weeks', vibes_checks: checks(
    ['Bars by week', 'done', 'Checked by running the rebuilt chart query'], ['A map by region', 'missing', 'The result table has no region column']) },
  genie_space: ready(1, { snapshot: true }),
  app: ready(3, { snapshot: true }),
  [PAGE]: ready(3, { name: 'Decisions', what: 'The rows to act on, with their filters', vibes_checks: JSON.stringify(checks(
    ['Dark header', 'done', 'Checked by opening the rebuilt page with the latest data'], ['Rows to act on first', 'done', 'The decision list opens the page'])) }),
  'app:page:detail': ready(2, { title: 'Row detail' }),
  alert: ready(1),
  ai_reasoning: ready(2),
  value_formula: ready(2),
};

const HISTORY = [
  versionRow(3, { outputs: V3_OUTPUTS, assets: V3_ASSETS, status: 'ready_with_warnings' }),
  versionRow(2, {
    outputs: { dashboard_vibes: 'Make the trend weekly' },
    assets: { dashboard: ready(2, { snapshot: true, vibes_checks: checks(['Make the trend weekly', 'done', 'The trend is weekly']) }), genie_space: ready(1, { snapshot: true }),
      app: ready(2, { snapshot: true }), alert: ready(1) },
  }),
  versionRow(1, { assets: { dashboard: ready(1, { snapshot: false }), app: ready(1, { snapshot: true }), alert: ready(1),
    genie_space: ready(1, { snapshot: true, vibes_checks: checks(['Answer in euros', 'missing', 'The answers are in dollars'], ['Name the rows you counted', 'done', 'Checked by asking Genie 5 test questions'],
      ['Add a question about returns', 'missing', '']) }) } }),
];

const STATE = {
  history: HISTORY, appExists: true,
  app: { name: 'churn-desk', description: 'Inspire use case N01-U01 (session 42): Predict churn', compute_status: { state: 'ACTIVE' }, app_status: { state: 'RUNNING' } },
  responses: { 'GET /api/2.0/alerts/a1': [{ display_name: 'Churn over 25' }] },
};

function insertsOf(made) {
  return made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'))
    .map((c) => ({ spec: JSON.parse(c.parameters.find((p) => p.name === 'spec').value), classes: c.parameters.find((p) => p.name === 'classes').value }));
}

const picker = (page) => page.getByRole('region', { name: 'Control tower' }).getByRole('region', { name: 'Vibe any asset' });
const pick = async (page, name) => {
  const button = picker(page).getByRole('button', { name, exact: true });
  await button.click();
  return button;
};
const picked = (page, id) => picker(page).locator(`[data-vibe-card="${id}"]`);
const box = (card) => card.getByRole('textbox', { name: 'How should it work?', exact: true });

async function openTower(state = STATE) {
  const ui = await openUi('implement', state);
  try {
    await ui.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const control = ui.page.getByRole('tab', { name: 'Control Tower', exact: true });
    if (await control.getAttribute('aria-selected') !== 'true') await control.click();
    await ui.page.getByRole('region', { name: 'History', exact: true }).getByText(/^\d+ spec versions? · /).waitFor({ timeout: 15000 });
    await picker(ui.page).locator('[data-vibe-card]').waitFor({ timeout: 15000 });
  } catch (e) {
    await ui.close();
    throw e;
  }
  return ui;
}

test('the control tower lists every built asset in the groups of the approved design with its pill, the first is picked, and picking another shows what it is now', async () => {
  const ui = await openTower();
  const { page } = ui;
  try {
    const tower = picker(page);
    await tower.getByRole('button', { name: 'Alert: Churn over 25, Ready', exact: true }).waitFor();
    const nav = tower.getByRole('navigation', { name: 'Everything this use case built' });
    const groups = {};
    for (const name of ['Genie Code notebook', 'Results', 'App', 'Dashboard', 'Genie Agent', 'Alert']) {
      groups[name] = await nav.getByRole('list', { name, exact: true }).getByRole('button').evaluateAll((items) => items.map((b) => b.getAttribute('aria-label')));
    }
    assert.deepEqual(groups, {
      'Genie Code notebook': ['Notebook, Ready'],
      Results: ['AI reasoning, Ready', 'Money at stake, Ready'],
      App: ['Page: Decisions, Ready', 'Page: Row detail, Ready'],
      Dashboard: ['Chart: Weekly trend, Ready with warnings'],
      'Genie Agent': ['Instructions, Ready with warnings'],
      Alert: ['Alert: Churn over 25, Ready'],
    }, 'one row per page and per chart, and the whole App or dashboard only when the build lists no parts');
    assert.deepEqual(await nav.locator('[data-asset]').evaluateAll((items) => items.map((b) => b.dataset.asset)),
      ['notebook', 'ai_reasoning', 'value_formula', PAGE, 'app:page:detail', CHART, 'genie_space', 'alert']);
    assert.equal(await nav.getByRole('button', { name: 'Notebook, Ready' }).getAttribute('aria-pressed'), 'true', 'the first asset is picked from the start');
    await picked(page, 'notebook').getByRole('heading', { name: 'Notebook', exact: true }).waitFor();

    const button = await pick(page, 'Page: Decisions, Ready');
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    const card = picked(page, PAGE);
    assert.equal(await card.getByRole('heading').textContent(), 'Page: Decisions');
    await card.getByText('App', { exact: true }).waitFor();
    await card.getByText('The rows to act on, with their filters', { exact: true }).waitFor();
    assert.match(await card.locator('[data-live]').textContent(), /^Version 3, built .+/);
    assert.equal(await box(card).inputValue(), V3_OUTPUTS[`${PAGE}_vibes`], 'the box holds the asks the page was built with, as written');
    assert.equal(await box(card).getAttribute('placeholder'), 'For example: put the rows to act on first and add a filter by region');
    await card.getByText('Say each thing you want. Inspire checks every one after the rebuild.').waitFor();
    const versions = picker(page).getByRole('region', { name: 'Versions' });
    await versions.getByText('Roll back puts the whole App of an earlier version live again').waitFor();
    assert.deepEqual(await versions.locator('[data-version]').evaluateAll((rows) => rows.map((r) => r.dataset.version)), ['3', '2', '1']);
    await versions.locator('[data-live-version]').getByText('Live', { exact: true }).waitFor();
    await versions.getByRole('button', { name: 'Roll back to version 2', exact: true }).waitFor();

    for (const [name, id, holder, live] of [
      ['Instructions, Ready with warnings', 'genie_space', 'For example: answer in plain words and always say which rows you counted', /^Version 1, built /],
      ['Money at stake, Ready', 'value_formula', 'For example: price each row at its open order value times the chance it is lost', /^Version 2, built /],
      ['AI reasoning, Ready', 'ai_reasoning', 'For example: explain each decision in one sentence that names the two columns behind it', /^Version 2, built /],
      ['Chart: Weekly trend, Ready with warnings', CHART, 'For example: make it a weekly bar chart and label each bar with its count', /^Version 3, built /],
    ]) {
      await pick(page, name);
      const shown = picked(page, id);
      await shown.waitFor();
      assert.equal(await picker(page).locator('[data-vibe-card]').count(), 1, `${name}: one asset at a time`);
      assert.equal(await box(shown).getAttribute('placeholder'), holder, name);
      assert.match(await shown.locator('[data-live]').textContent(), live, name);
    }
    assert.equal(await button.getAttribute('aria-pressed'), 'false', 'the earlier pick is let go');
    await picked(page, 'ai_reasoning').waitFor({ state: 'detached' });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Rebuild this stays off until there is text, and sends the vibes exactly as typed for only the picked asset', async () => {
  const ui = await openTower();
  const { page, made } = ui;
  const asked = '  Put the rows to act on first,\n  then a map by region  ';
  try {
    await pick(page, 'Page: Row detail, Ready');
    const card = picked(page, 'app:page:detail');
    const rebuild = card.getByRole('button', { name: 'Rebuild this', exact: true });
    assert.equal(await box(card).inputValue(), '');
    assert.equal(await rebuild.isDisabled(), true, 'no text, no rebuild');
    await box(card).fill('   ');
    assert.equal(await rebuild.isDisabled(), true, 'spaces are no text');
    await box(card).fill(asked);
    assert.equal(await rebuild.isDisabled(), false);
    await rebuild.click();
    await until(() => made.jobs.length === 1, 'the page rebuild');
    const [vibed] = insertsOf(made);
    assert.equal(vibed.spec.outputs['app:page:detail_vibes'], asked, 'the ask reaches the agent spec exactly as typed');
    assert.deepEqual([vibed.spec.retry_outputs, vibed.spec.rollback_outputs, vibed.classes, 'retry_asks' in vibed.spec], [['app:page:detail'], {}, 'retry', false]);
    for (const [key, value] of Object.entries(V3_OUTPUTS)) assert.equal(vibed.spec.outputs[key], value, `${key} stays as it was`);

    await pick(page, 'Money at stake, Ready');
    const formula = picked(page, 'value_formula');
    await box(formula).fill('x'.repeat(2001));
    await formula.getByText('the money at stake formula vibes are 2001 characters; at most 2000 are allowed').waitFor();
    assert.equal(await formula.getByRole('button', { name: 'Rebuild this', exact: true }).isDisabled(), true, 'an ask over the limit cannot be sent');
    assert.equal(insertsOf(made).length, 1);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('an asset whose asks were all done says You asked for 2 things. Done: 2 of 2. with how each was checked, and offers no Try again', async () => {
  const ui = await openTower();
  const { page } = ui;
  try {
    await pick(page, 'Page: Decisions, Ready');
    const list = picked(page, PAGE).locator('[data-checks]');
    const tally = list.getByText('You asked for 2 things. Done: 2 of 2.', { exact: true });
    await tally.waitFor();
    assert.match(await tally.getAttribute('class'), /text-success-fg/);
    const items = list.getByRole('list', { name: 'What you asked for on the Decisions page' }).getByRole('listitem');
    assert.deepEqual(await items.evaluateAll((li) => li.map((x) => x.dataset.check)), ['done', 'done']);
    assert.deepEqual(await items.allTextContents(), [
      '✓Done: Dark headerChecked by opening the rebuilt page with the latest data. Version 3.',
      '✓Done: Rows to act on firstThe decision list opens the page. Version 3.',
    ]);
    assert.equal(await list.getByRole('button', { name: /^Try again/ }).count(), 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a missing ask reads not done yet with the asset ready with warnings, and Try again rebuilds that asset with only the missing asks, keeping the vibes as written', async () => {
  const ui = await openTower();
  const { page, made } = ui;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await pick(page, 'Chart: Weekly trend, Ready with warnings');
    const chart = picked(page, CHART);
    const list = chart.locator('[data-checks]');
    const tally = list.getByText('You asked for 2 things. Done: 1 of 2.', { exact: true });
    await tally.waitFor();
    assert.match(await tally.getAttribute('class'), /text-error-fg/);
    const items = list.getByRole('listitem');
    assert.deepEqual(await items.evaluateAll((li) => li.map((x) => x.dataset.check)), ['done', 'missing']);
    assert.equal(await items.nth(1).textContent(),
      '!Not done yet: A map by regionNot done yet. The result table has no region column. This chart is marked ready with warnings.');
    await chart.getByText('Ready with warnings', { exact: true }).waitFor();
    await list.getByText('Only what is missing is rebuilt.').waitFor();
    const sizes = await page.evaluate(() => {
      const card = document.querySelector('[aria-label="Vibe any asset"] [data-vibe-card]');
      return { page: document.scrollingElement.scrollWidth, wide: card.scrollWidth <= card.clientWidth + 1 };
    });
    assert.ok(sizes.page <= 1440 && sizes.wide, JSON.stringify(sizes));
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(300);
      const result = await lowContrast(page, ['[aria-label="Vibe any asset"]']);
      assert.ok(result.checked >= 10, `measured ${result.checked} elements`);
      assert.deepEqual(result.low, [], dark ? 'dark' : 'light');
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'));

    await list.getByRole('button', { name: 'Try again with the missing thing', exact: true }).click();
    await until(() => made.jobs.length === 1, 'the chart try again');
    const [retried] = insertsOf(made);
    assert.deepEqual([retried.spec.retry_outputs, retried.spec.retry_asks, retried.classes], [[CHART], { [CHART]: ['A map by region'] }, 'retry'],
      'only the missing ask is rebuilt, on the chart alone');
    assert.equal(retried.spec.outputs[`${CHART}_vibes`], V3_OUTPUTS[`${CHART}_vibes`], 'the vibes stay exactly as the user wrote them');

    await pick(page, 'Instructions, Ready with warnings');
    const genie = picked(page, 'genie_space');
    await genie.locator('[data-checks]').getByText('You asked for 3 things. Done: 1 of 3.', { exact: true }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Vibe any asset"] [data-checks] button')].some((b) => !b.disabled));
    await genie.getByRole('button', { name: 'Try again with the 2 missing things', exact: true }).click();
    await until(() => made.jobs.length === 2, 'the Genie Agent try again');
    const whole = insertsOf(made)[1];
    assert.deepEqual([whole.spec.retry_outputs, whole.spec.retry_asks, whole.spec.outputs.genie_space_vibes, whole.classes],
      [['genie_space'], { genie_space: ['Answer in euros', 'Add a question about returns'] }, V3_OUTPUTS.genie_space_vibes, 'retry']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('while a version rebuilds the picked asset, it reads Rebuilding with the three steps, its box and Rebuild this wait, and nothing else is rebuilding', async () => {
  const building = versionRow(4, {
    status: 'building_outputs', implement_run_id: '1066484287074577', updated_at: new Date().toISOString(), change_classes: 'retry',
    outputs: { ...V3_OUTPUTS, [`${PAGE}_vibes`]: 'Rows first, then a map by region and a filter' }, top: { retry_outputs: [PAGE] }, assets: {},
  });
  const ui = await openTower({ ...STATE, history: [building, ...HISTORY], implementRun: { run_id: 1066484287074577, state: { life_cycle_state: 'RUNNING' } } });
  const { page } = ui;
  try {
    const nav = picker(page).getByRole('navigation', { name: 'Everything this use case built' });
    await nav.getByRole('button', { name: 'Page: Decisions, Rebuilding', exact: true }).waitFor();
    await nav.getByRole('button', { name: 'Page: Row detail, Ready', exact: true }).waitFor();
    assert.equal(await nav.getByRole('button', { name: /, Rebuilding$/ }).count(), 1, 'only the page is rebuilding');
    await pick(page, 'Page: Decisions, Rebuilding');
    const card = picked(page, PAGE);
    const steps = card.getByRole('list', { name: 'Rebuilding the Decisions page' }).getByRole('listitem');
    assert.deepEqual(await steps.evaluateAll((li) => li.map((x) => [x.dataset.step, x.textContent])), [
      ['done', '✓Reading what you asked: 3 things'],
      ['now', '2Rebuilding the Decisions page only. Nothing else changes.'],
      ['next', '3Checking each thing you asked for'],
    ]);
    assert.equal(await box(card).inputValue(), 'Rows first, then a map by region and a filter', 'the asks being built show');
    assert.equal(await box(card).isDisabled(), true);
    assert.equal(await card.getByRole('button', { name: 'Rebuild this', exact: true }).isDisabled(), true);
    assert.equal(await card.locator('[data-checks]').count(), 0, 'the checklist comes back once the build ends');
    await pick(page, 'Page: Row detail, Ready');
    await picked(page, 'app:page:detail').getByText('A version is building now; vibes and roll backs apply after it finishes.').waitFor();
    assert.equal(await picked(page, 'app:page:detail').getByRole('button', { name: 'Rebuild this', exact: true }).isDisabled(), true);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a rolled back output shows the checklist of the version it rolled back to, its Versions card marks Live, and Roll back still works from the picker', async () => {
  const rolled = [
    versionRow(4, {
      outputs: { ...V3_OUTPUTS, dashboard_vibes: 'Make the trend weekly', [`${CHART}_vibes`]: '' }, top: { rollback_outputs: { dashboard: 2 } }, change_classes: 'rollback',
      assets: { ...V3_ASSETS, dashboard: ready(4, { snapshot: true }), [CHART]: undefined },
    }),
    ...HISTORY,
  ];
  const ui = await openTower({ ...STATE, history: rolled });
  const { page, made } = ui;
  const sent = [];
  page.on('request', (req) => { if (req.url().includes('/api/inspire/implement/submit')) sent.push(JSON.parse(req.postData())); });
  try {
    await pick(page, 'The whole dashboard, Ready');
    const dash = picked(page, 'dashboard');
    const list = dash.locator('[data-checks]');
    await list.getByText('You asked for 1 thing. Done: 1 of 1.', { exact: true }).waitFor();
    assert.deepEqual(await list.getByRole('listitem').allTextContents(), ['✓Done: Make the trend weeklyThe trend is weekly. Version 2.'], 'the checklist of v2');
    const versions = picker(page).getByRole('region', { name: 'Versions' });
    await versions.getByText('Roll back puts an earlier version live again', { exact: true }).waitFor();
    assert.deepEqual(await versions.locator('[data-version]').evaluateAll((rows) => rows.map((r) => r.dataset.version)), ['4', '3', '2']);
    assert.deepEqual(await versions.locator('[data-version-checks]').allTextContents(), ['You asked for 2 things. Done: 1 of 2.', 'You asked for 1 thing. Done: 1 of 1.']);
    const row = versions.locator('[data-version="3"]');
    await row.getByRole('button', { name: 'Roll back to version 3', exact: true }).click();
    const confirm = row.getByRole('group', { name: 'Confirm the roll back to version 3' });
    await confirm.getByText('Roll back the Dashboard to version 3? This replaces the live Dashboard; Genie is not called.').waitFor();
    await confirm.getByRole('button', { name: 'Roll back', exact: true }).click();
    await until(() => made.jobs.length === 1, 'the roll back');
    assert.deepEqual([sent[0].spec.rollback_outputs, sent[0].spec.outputs.dashboard_vibes], [{ dashboard: 3 }, V3_OUTPUTS.dashboard_vibes]);
    const [stored] = insertsOf(made);
    assert.deepEqual(stored.spec.rollback_outputs, { dashboard: 3 });
    assert.equal(stored.spec.outputs[`${CHART}_vibes`], V3_OUTPUTS[`${CHART}_vibes`], 'the chart gets back the asks of v3 with its dashboard');
    assert.deepEqual(stored.classes.split(','), ['outputs', 'rollback']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a roll back of a dashboard that no longer exists says Genie builds a new one, and while it runs it shows the build steps, not a roll back', async () => {
  const noChart = { ...V3_ASSETS, [CHART]: undefined };
  const lost = versionRow(3, {
    outputs: V3_OUTPUTS, status: 'ready_with_warnings', dashboard_id: null, dashboard_url: null,
    assets: { ...noChart, dashboard: { state: 'failed', spec_version: 3, error: 'the warehouse is stopped' } },
  });
  const live = versionRow(3, { outputs: V3_OUTPUTS, status: 'ready_with_warnings', assets: noChart });
  const rolling = versionRow(4, {
    status: 'building_outputs', implement_run_id: '1066484287074577', updated_at: new Date().toISOString(), change_classes: 'rollback',
    outputs: { ...V3_OUTPUTS, dashboard_vibes: 'Make the trend weekly' }, top: { rollback_outputs: { dashboard: 2 } }, assets: {},
  });
  const whole = (page) => picker(page).getByRole('button', { name: /^The whole dashboard, / });
  let ui = await openTower({ ...STATE, history: [lost, ...HISTORY.slice(1)] });
  try {
    await whole(ui.page).click();
    const row = picker(ui.page).getByRole('region', { name: 'Versions' }).locator('[data-version="2"]');
    await row.getByRole('button', { name: 'Roll back to version 2', exact: true }).click();
    await row.getByRole('group', { name: 'Confirm the roll back to version 2' })
      .getByText('Roll back the Dashboard to version 2? The Dashboard no longer exists, so Genie builds a new one from the vibes of version 2.', { exact: true })
      .waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const run = { run_id: 1066484287074577, state: { life_cycle_state: 'RUNNING' } };
  for (const [base, builds] of [[lost, true], [live, false]]) {
    ui = await openTower({ ...STATE, history: [rolling, base, ...HISTORY.slice(1)], implementRun: run });
    try {
      await whole(ui.page).click();
      const card = picked(ui.page, 'dashboard');
      const steps = card.getByRole('list', { name: 'Rebuilding the Dashboard' });
      const back = card.locator('[data-rolling-back]');
      if (builds) {
        await steps.waitFor();
        assert.equal(await back.count(), 0, 'a dashboard that is gone is built by Genie, so it never says Genie is not called');
      } else {
        await back.waitFor();
        assert.equal((await back.textContent()).trim(), 'Putting version 2 live again. Genie is not called and nothing else changes.');
        assert.equal(await steps.count(), 0);
      }
      assert.deepEqual(ui.pageErrors, []);
    } finally {
      await ui.close();
    }
  }
});

test('a notebook rebuild that would read a swapped table that is gone is refused on its card with the table named, and nothing is written or started', async () => {
  const gone = '[TABLE_OR_VIEW_NOT_FOUND] The table or view `main`.`s`.`returns_old` cannot be found. Verify the spelling. SQLSTATE: 42P01';
  const lost = versionRow(3, { outputs: V3_OUTPUTS, assets: V3_ASSETS, status: 'ready_with_warnings', top: { data: { ...builtSpec().data, tables: { 'main.s.returns': 'main.s.returns_old' } } } });
  const ui = await openTower({ ...STATE, history: [lost, ...HISTORY.slice(1)], probeErrors: { '`main`.`s`.`returns_old`': gone } });
  const { page, made } = ui;
  try {
    await pick(page, 'Notebook, Ready');
    const card = picked(page, 'notebook');
    await box(card).fill('Use only the last 90 days');
    await card.getByRole('button', { name: 'Rebuild this', exact: true }).click();
    const alert = card.getByRole('alert');
    await alert.waitFor();
    assert.equal((await alert.textContent()).trim(), 'the preview cannot run because these source tables are missing or not readable: main.s.returns_old (not found). '
      + 'Open Edit, Data step, to swap each for a table with the same role or remove it');
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(insertsOf(made), []);
  } finally {
    await ui.close();
  }
});

test('an asset the build no longer has is refused with a clear message on its card, and nothing is written or started', async () => {
  const ui = await openTower();
  const { page, made } = ui;
  try {
    await pick(page, 'Page: Decisions, Ready');
    const card = picked(page, PAGE);
    await box(card).fill('Put the rows to act on first');
    const { [PAGE]: _gone, ...rest } = V3_ASSETS;
    made.state.history = [{ ...HISTORY[0], asset_status: JSON.stringify(rest) }, ...HISTORY.slice(1)];
    await card.getByRole('button', { name: 'Rebuild this', exact: true }).click();
    const alert = card.getByRole('alert');
    await alert.waitFor();
    assert.equal((await alert.textContent()).trim(), NOT_BUILT);
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(insertsOf(made), []);
    await pick(page, 'Notebook, Ready');
    await picker(page).getByRole('alert').waitFor({ state: 'detached' });
    assert.deepEqual(ui.pageErrors.filter((e) => !/status of 400/.test(e)), []);
  } finally {
    await ui.close();
  }
});
