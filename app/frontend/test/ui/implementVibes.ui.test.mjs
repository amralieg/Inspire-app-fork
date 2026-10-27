import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { defaultSpecFromUseCase } from '../../src/lib/implementWizard.js';
import { HARNESS_USE_CASE, HARNESS_SETTINGS } from './implementFixtures.js';
import { closeBrowser, lowContrast, openUi, until } from './uiSupport.mjs';

const OWNER = ['owner', 'example.com'].join('@');
const SHOTS = process.env.VIBES_SHOTS || '';
const LONG_ASK = 'Put the weekly trend first, show the twenty rows to act on today, and colour every overdue row so it stands out at once';

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
const footerErrors = (page) => page.locator('[role="alert"] p').allTextContents();
const vibesBox = (page, name) => page.getByRole('textbox', { name, exact: true });

async function toDelivery(page) {
  await onStep(page, 'Choose');
  await next(page);
  await onStep(page, 'Data');
  await next(page);
  await onStep(page, 'Results');
  await next(page);
  await onStep(page, 'Delivery');
}

function insertsOf(made) {
  return made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'))
    .map((c) => ({ spec: JSON.parse(c.parameters.find((p) => p.name === 'spec').value), classes: c.parameters.find((p) => p.name === 'classes').value }));
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function readable(page, selectors, name) {
  for (const dark of [false, true]) {
    await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
    await page.waitForTimeout(300);
    const result = await lowContrast(page, selectors);
    assert.ok(result.checked >= 10, `${name}: measured ${result.checked} elements`);
    assert.deepEqual(result.low, [], `${name} ${dark ? 'dark' : 'light'}`);
    await shot(page, `${name}-${dark ? 'dark' : 'light'}`);
  }
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
}

test('each ticked output gets its own vibes with a live counter, over 2000 characters blocks Next with the shared message, and the asks reach the spec', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await toDelivery(page);
    await page.getByRole('button', { name: 'Add vibes for the Dashboard' }).waitFor();
    for (const label of ['Genie Agent', 'App', 'Alert']) {
      assert.equal(await page.getByRole('button', { name: `Add vibes for the ${label}` }).count(), 0, `an unticked ${label} has no vibes`);
    }
    await page.getByRole('checkbox', { name: /^App / }).check();
    await page.getByRole('button', { name: 'Add vibes for the Genie Agent' }).waitFor();
    await page.getByRole('button', { name: 'Add vibes for the Dashboard' }).click();
    const panel = page.getByRole('region', { name: 'Vibes' });
    await panel.getByText("Tell Genie what you want in your own words. Your asks win over Inspire's defaults.", { exact: false }).waitFor();
    assert.deepEqual(await panel.getByRole('textbox').evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label'))),
      ['Notebook vibes', 'Vibes for the Dashboard', 'Vibes for the Genie Agent', 'App vibes'], 'the notebook, then one box per ticked output, and the App has App vibes');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Vibes for the Dashboard', 'the box asked for has the focus');
    assert.equal(await page.getByRole('checkbox', { name: /^Dashboard/ }).count(), 0, 'the vibes take the place of the tiles');

    const dash = panel.locator('[data-vibes="dashboard"]');
    await vibesBox(page, 'Vibes for the Dashboard').fill(`  ${LONG_ASK}  `);
    assert.equal(await dash.locator('[data-vibes-count]').textContent(), `${LONG_ASK.length}/2000`, 'the counter counts the trimmed ask');
    const genie = panel.locator('[data-vibes="genie_space"]');
    await vibesBox(page, 'Vibes for the Genie Agent').fill('g'.repeat(2001));
    const count = genie.locator('[data-vibes-count]');
    assert.equal(await count.textContent(), '2001/2000');
    assert.match(await count.getAttribute('class'), /text-error-fg/, 'the counter turns to the error style over the limit');
    await genie.getByText('the Genie Agent vibes are 2001 characters; at most 2000 are allowed').waitFor();
    assert.equal(await vibesBox(page, 'Vibes for the Genie Agent').getAttribute('aria-invalid'), 'true');

    await panel.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Edit vibes for the Genie Agent, 2001/2000' }).waitFor();
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['the Genie Agent vibes are 2001 characters; at most 2000 are allowed']);
    await onStep(page, 'Delivery');
    await panel.waitFor();
    await vibesBox(page, 'Vibes for the Genie Agent').fill('g'.repeat(2000));
    assert.equal(await count.textContent(), '2000/2000');
    assert.doesNotMatch(await count.getAttribute('class'), /text-error-fg/);
    await page.locator('[role="alert"]').waitFor({ state: 'detached' });

    await vibesBox(page, 'App vibes').fill('One page: the decision list on the left and the row detail on the right');
    await panel.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Edit vibes for the App, 71/2000' }).waitFor();
    await page.getByRole('checkbox', { name: /^Alert/ }).check();
    await page.getByRole('button', { name: 'Add vibes for the Alert' }).waitFor();
    await next(page);
    await onStep(page, 'App access');
    await page.getByRole('radio', { name: /^Internal data/ }).check();
    await next(page);
    await onStep(page, 'App look');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Start PoC/MVP' && !b.disabled),
      null, { timeout: 15000 });
    await page.getByRole('button', { name: 'Start PoC/MVP', exact: true }).click();
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    const [{ spec }] = insertsOf(made);
    assert.deepEqual([spec.outputs.dashboard_vibes, spec.outputs.genie_space_vibes.length, spec.outputs.app_vibes, spec.outputs.alert_vibes],
      [LONG_ASK, 2000, 'One page: the decision list on the left and the row detail on the right', '']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Delivery with every output ticked fits 1440x900 with its vibes open, and the vibes read at 4.5:1 in light and dark', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  const fits = async (name) => {
    await page.waitForTimeout(250);
    const box = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect();
      const body = document.querySelector('[data-wizard-body]');
      return { top: dialog.top, bottom: dialog.bottom, scroll: body.scrollHeight, client: body.clientHeight, page: document.scrollingElement.scrollHeight };
    });
    assert.ok(box.top >= 0 && box.bottom <= 900, `${name}: the dialog sits inside the screen ${JSON.stringify(box)}`);
    assert.ok(box.scroll <= box.client + 1, `${name}: the step needs no scroll (${box.scroll} > ${box.client})`);
    assert.ok(box.page <= 900, `${name}: the page itself does not scroll (${box.page})`);
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await toDelivery(page);
    for (const name of [/^App /, /^Alert/]) await page.getByRole('checkbox', { name }).check();
    await page.getByText(`Emails ${OWNER} when`, { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Add vibes for the Alert' }).waitFor();
    await fits('vibes-wizard-tiles');
    await page.getByRole('button', { name: 'Add vibes for the App' }).click();
    for (const [name, words] of [['Vibes for the Dashboard', LONG_ASK], ['Vibes for the Genie Agent', 'Answer in plain words and always say which rows you counted'],
      ['App vibes', 'One page: the decision list on the left and the row detail on the right'], ['Vibes for the Alert', 'a'.repeat(2001)]]) {
      await vibesBox(page, name).fill(words);
    }
    await fits('vibes-wizard-open');
    await readable(page, ['[role="dialog"]'], 'vibes-wizard');
    await page.getByRole('region', { name: 'Vibes' }).getByRole('button', { name: 'Done' }).click();
    await fits('vibes-wizard-tiles-set');
    await readable(page, ['[role="dialog"]'], 'vibes-wizard-tiles');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

const builtSpec = (vibes = {}) => {
  const spec = defaultSpecFromUseCase(HARNESS_USE_CASE, { warehouseId: HARNESS_SETTINGS.warehouseId, inspireDatabase: HARNESS_SETTINGS.inspireDatabase, owner: OWNER });
  return {
    ...spec,
    outputs: { ...spec.outputs, genie_space: true, app: true, app_name: 'churn-desk', app_access: 'sp', alert: true, alert_recipients: [OWNER], ...vibes },
  };
};

const ready = (version, extra = {}) => ({ state: 'ready', spec_version: version, ...extra });

const versionRow = (version, { vibes = {}, assets = {}, ...extra } = {}) => ({
  session_id: '42', use_case_id: 'N01-U01', spec_version: version, status: 'ready', change_classes: version === 1 ? 'initial' : 'outputs', created_by: OWNER,
  updated_at: `2026-10-2${version}T04:00:00Z`, spec_json: JSON.stringify(builtSpec(vibes)), job_id: '77', last_preview_run_id: '9001', result_rows: '3',
  dashboard_id: 'd1', dashboard_url: 'https://workspace.example.com/dashboardsv3/d1/published',
  genie_space_id: 'g1', genie_space_url: 'https://workspace.example.com/genie/rooms/g1',
  app_name: 'churn-desk', app_url: 'https://churn-desk-1.aws.example.com',
  alert_id: 'a1', alert_url: 'https://workspace.example.com/sql/alerts-v2/a1',
  asset_status: JSON.stringify(assets),
  ...extra,
});

const HISTORY = [
  versionRow(3, {
    vibes: { dashboard_vibes: 'Make the trend weekly', app_vibes: 'Dark header' },
    assets: { dashboard: ready(3, { snapshot: true }), genie_space: ready(1, { snapshot: true }), app: ready(3, { snapshot: true }), alert: ready(1) },
    status: 'ready_with_warnings',
    status_message: 'Dashboard vibe not done: put it in Arabic: the dashboard has no Arabic font; App vibe not done: a logo: no logo file was given',
  }),
  versionRow(2, {
    vibes: { dashboard_vibes: LONG_ASK, app_vibes: '' },
    assets: { dashboard: ready(2, { snapshot: true }), genie_space: ready(1, { snapshot: true }), app: ready(2, { snapshot: true }), alert: ready(1) },
  }),
  versionRow(1, { assets: { dashboard: ready(1, { snapshot: false }), genie_space: ready(1, { snapshot: true }), app: ready(1, { snapshot: true }), alert: ready(1) } }),
];

const STATE = { history: HISTORY, appExists: true, app: { name: 'churn-desk', description: 'Inspire use case N01-U01 (session 42): Predict churn', compute_status: { state: 'ACTIVE' }, app_status: { state: 'RUNNING' } } };

async function openVibes(state = STATE) {
  const ui = await openUi('implement', state);
  try {
    await ui.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await ui.page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await ui.page.getByRole('region', { name: 'Vibe the outputs' }).waitFor({ timeout: 15000 });
  } catch (e) {
    await ui.close();
    throw e;
  }
  return ui;
}

const card = (page, id) => page.locator(`[data-vibe-card="${id}"]`);

test('the Build page vibe panel starts from the live asks, rebuilds only that output with new vibes, and unchanged text falls back to the retry', async () => {
  const ui = await openVibes();
  const { page, made } = ui;
  try {
    assert.deepEqual(await page.locator('[data-vibe-card]').evaluateAll((cards) => cards.map((c) => c.dataset.vibeCard)), ['dashboard', 'genie_space', 'app', 'alert']);
    const dash = card(page, 'dashboard');
    assert.equal((await dash.getByRole('heading').textContent()).trim(), 'Vibe the Dashboard');
    assert.equal(await dash.getByRole('textbox', { name: 'Vibes for the Dashboard' }).inputValue(), 'Make the trend weekly');
    assert.match(await dash.locator('[data-live]').textContent(), /^Live: built from v3, .+/);
    assert.match(await card(page, 'genie_space').locator('[data-live]').textContent(), /^Live: built from v1/, 'a carried asset names the version it was built on');
    await dash.getByRole('button', { name: 'Rebuild the Dashboard' }).waitFor();
    assert.deepEqual(await dash.getByRole('list', { name: 'Vibes Genie could not do on the Dashboard' }).getByRole('listitem').allTextContents(),
      ['Dashboard vibe not done: put it in Arabic: the dashboard has no Arabic font'], 'only this asset\'s warnings show under it');

    await dash.getByRole('textbox', { name: 'Vibes for the Dashboard' }).fill('  Make the trend weekly and add a map  ');
    await dash.getByRole('button', { name: 'Discard my edits' }).waitFor();
    await page.getByRole('tab', { name: 'Dashboard', exact: true }).click();
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    assert.equal(await dash.getByRole('textbox', { name: 'Vibes for the Dashboard' }).inputValue(), '  Make the trend weekly and add a map  ',
      'an ask being typed survives a look at another tab');
    await dash.getByRole('button', { name: 'Rebuild with these vibes' }).click();
    await until(() => made.jobs.length === 1, 'the vibed rebuild');
    const vibed = insertsOf(made)[0];
    assert.equal(vibed.classes, 'outputs');
    assert.equal(vibed.spec.outputs.dashboard_vibes, 'Make the trend weekly and add a map');
    assert.deepEqual([vibed.spec.outputs.app_vibes, vibed.spec.outputs.genie_space_vibes, vibed.spec.outputs.alert_vibes], ['Dark header', '', ''],
      'only the vibed output\'s asks change');
    assert.deepEqual([vibed.spec.retry_outputs, vibed.spec.rollback_outputs, vibed.spec.based_on_version], [[], {}, 3]);
    await dash.getByRole('button', { name: 'Rebuild the Dashboard' }).waitFor();

    await card(page, 'app').getByRole('button', { name: 'Rebuild the App' }).click();
    await until(() => made.jobs.length === 2, 'the unchanged rebuild');
    const retried = insertsOf(made)[1];
    assert.equal(retried.classes, 'retry');
    assert.deepEqual(retried.spec.retry_outputs, ['app']);
    assert.equal(retried.spec.outputs.app_vibes, 'Dark header');
    const over = card(page, 'alert');
    await over.getByRole('textbox', { name: 'Vibes for the Alert' }).fill('z'.repeat(2001));
    await over.getByText('the Alert vibes are 2001 characters; at most 2000 are allowed').waitFor();
    assert.equal(await over.getByRole('button', { name: 'Rebuild with these vibes' }).isDisabled(), true, 'an ask over the limit cannot be sent');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Versions lists only the earlier versions that kept a snapshot, and a confirmed roll back submits the version and its vibes', async () => {
  const ui = await openVibes();
  const { page, made } = ui;
  const sent = [];
  page.on('request', (req) => { if (req.url().includes('/api/inspire/implement/submit')) sent.push(JSON.parse(req.postData())); });
  try {
    const dash = card(page, 'dashboard');
    const versions = dash.getByRole('list', { name: 'Earlier versions of the Dashboard' });
    assert.deepEqual(await versions.locator('[data-version]').evaluateAll((rows) => rows.map((r) => r.dataset.version)), ['2'],
      'v3 is live and v1 kept no snapshot');
    const row = versions.locator('[data-version="2"]');
    assert.ok((await row.textContent()).includes(`“${LONG_ASK.slice(0, 80).trimEnd()}…”`), await row.textContent());
    await row.getByText('Ready', { exact: true }).waitFor();
    assert.deepEqual(await card(page, 'app').locator('[data-version]').evaluateAll((rows) => rows.map((r) => r.dataset.version)), ['2', '1']);
    await card(page, 'app').locator('[data-version="2"]').getByText('no vibes', { exact: true }).waitFor();
    assert.equal(await card(page, 'genie_space').locator('[data-version]').count(), 0, 'a carried snapshot is the live one, not an earlier version');
    assert.equal(await card(page, 'alert').getByRole('list', { name: 'Earlier versions of the Alert' }).count(), 0);

    await row.getByRole('button', { name: 'Roll back to v2' }).click();
    const confirm = row.getByRole('group', { name: 'Confirm the roll back to v2' });
    await confirm.getByText('Roll back the Dashboard to v2? This replaces the live Dashboard; Genie is not called.').waitFor();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await confirm.waitFor({ state: 'detached' });
    assert.equal(made.jobs.length, 0, 'Cancel sends nothing');
    await row.getByRole('button', { name: 'Roll back to v2' }).click();
    await confirm.getByRole('button', { name: 'Roll back', exact: true }).click();
    await until(() => made.jobs.length === 1, 'the roll back run');
    assert.equal(sent.length, 1);
    const asked = sent[0].spec;
    assert.deepEqual(asked.rollback_outputs, { dashboard: 2 });
    assert.equal(asked.outputs.dashboard_vibes, LONG_ASK, 'the browser sends the vibes of the version it rolls back to');
    assert.equal(asked.outputs.app_vibes, 'Dark header');
    assert.equal('retry_outputs' in asked, false);
    const [stored] = insertsOf(made);
    assert.deepEqual(stored.spec.rollback_outputs, { dashboard: 2 });
    assert.equal(stored.spec.outputs.dashboard_vibes, LONG_ASK);
    assert.deepEqual(stored.classes.split(','), ['outputs', 'rollback']);
    await confirm.waitFor({ state: 'detached' });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('while a version builds or a submit is on its way, every vibe and roll back control is disabled', async () => {
  const building = versionRow(4, { status: 'building_outputs', implement_run_id: '1066484287074577', updated_at: new Date().toISOString(),
    vibes: { dashboard_vibes: 'Make the trend weekly', app_vibes: 'Dark header and a map' }, assets: {} });
  const busy = await openVibes({ ...STATE, history: [building, ...HISTORY], implementRun: { run_id: 1066484287074577, state: { life_cycle_state: 'RUNNING' } } });
  try {
    const { page } = busy;
    await page.getByText('A version is building now; vibes and roll backs apply after it finishes.').waitFor();
    assert.equal(await card(page, 'app').getByRole('textbox', { name: 'App vibes' }).inputValue(), 'Dark header and a map', 'the asks being built show');
    for (const name of ['Rebuild the Dashboard', 'Rebuild the App']) assert.equal(await page.getByRole('button', { name }).isDisabled(), true, name);
    for (const button of await page.getByRole('button', { name: /^Roll back to v/ }).all()) assert.equal(await button.isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: /^Roll back to v/ }).count(), 3);
    assert.deepEqual(busy.pageErrors, []);
  } finally {
    await busy.close();
  }

  const ui = await openVibes();
  try {
    const { page, made } = ui;
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route('**/api/inspire/implement/submit', async (route) => { await held; await route.continue(); });
    await card(page, 'app').getByRole('button', { name: 'Rebuild the App' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-vibe-card] button')].filter((b) => /^Roll back to v/.test(b.textContent.trim()))
      .every((b) => b.disabled));
    assert.equal(await card(page, 'dashboard').getByRole('button', { name: 'Rebuild the Dashboard' }).isDisabled(), true);
    assert.equal(await card(page, 'app').locator('svg.animate-spin').count(), 1, 'the asked rebuild shows its spinner');
    release();
    await until(() => made.jobs.length === 1, 'the held rebuild');
    await page.waitForFunction(() => [...document.querySelectorAll('[data-vibe-card] button')].some((b) => /^Roll back to v/.test(b.textContent.trim()) && !b.disabled));
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the Build page vibe panels and versions fit a 1440x900 screen and read at 4.5:1 in light and dark', async () => {
  const ui = await openVibes();
  const { page } = ui;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const dash = card(page, 'dashboard');
    await dash.getByRole('textbox', { name: 'Vibes for the Dashboard' }).fill('Make the trend weekly and add a map');
    await dash.locator('[data-version="2"]').getByRole('button', { name: 'Roll back to v2' }).click();
    await card(page, 'alert').getByRole('textbox', { name: 'Vibes for the Alert' }).fill('z'.repeat(2001));
    const sizes = await page.evaluate(() => {
      const section = document.querySelector('[aria-label="Vibe the outputs"]').getBoundingClientRect();
      return {
        page: document.scrollingElement.scrollWidth, section: { left: section.left, right: section.right },
        cards: [...document.querySelectorAll('[data-vibe-card]')].map((c) => {
          const r = c.getBoundingClientRect();
          return { left: r.left, right: r.right, wide: c.scrollWidth <= c.clientWidth + 1 };
        }),
      };
    });
    assert.ok(sizes.page <= 1440, `the page does not scroll sideways (${sizes.page})`);
    assert.ok(sizes.section.left >= 0 && sizes.section.right <= 1440, JSON.stringify(sizes.section));
    for (const c of sizes.cards) assert.ok(c.wide && c.left >= sizes.section.left && c.right <= sizes.section.right + 1, JSON.stringify(c));
    await dash.scrollIntoViewIfNeeded();
    await readable(page, ['[aria-label="Vibe the outputs"]'], 'vibes-build');
    await card(page, 'app').scrollIntoViewIfNeeded();
    await shot(page, 'vibes-build-versions-light');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the notebook has its own vibes in the wizard and a card on the Build page that rewrites it or rebuilds it', async () => {
  const wizard = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  try {
    const { page } = wizard;
    await toDelivery(page);
    await page.getByRole('checkbox', { name: /^App / }).check();
    await page.getByRole('button', { name: 'Add vibes for the notebook' }).click();
    const panel = page.getByRole('region', { name: 'Vibes' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Notebook vibes');
    await vibesBox(page, 'Notebook vibes').fill('n'.repeat(2001));
    await panel.locator('[data-vibes="notebook"]').getByText('the notebook vibes are 2001 characters; at most 2000 are allowed').waitFor();
    await panel.getByRole('button', { name: 'Done' }).click();
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['the notebook vibes are 2001 characters; at most 2000 are allowed']);
    await panel.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Notebook vibes', 'the over-limit box reopens with the focus');
    assert.deepEqual(wizard.pageErrors, []);
  } finally {
    await wizard.close();
  }

  const history = HISTORY.map((row, i) => (i ? row : { ...row, asset_status: JSON.stringify({ ...JSON.parse(row.asset_status), notebook: { spec_version: 2, modified_at: 1 } }) }));
  const ui = await openVibes({ ...STATE, history });
  const { page, made } = ui;
  try {
    assert.deepEqual(await page.locator('[data-vibe-card]').evaluateAll((cards) => cards.map((c) => c.dataset.vibeCard)), ['notebook', 'dashboard', 'genie_space', 'app', 'alert']);
    const nb = card(page, 'notebook');
    assert.equal((await nb.getByRole('heading').textContent()).trim(), 'Vibe the notebook');
    assert.match(await nb.locator('[data-live]').textContent(), /^Live: built from v2/);
    await nb.getByText('Genie checks every cell against the current rules, runs the notebook, and refreshes every output from the new result.').waitFor();
    await nb.getByRole('button', { name: 'Rebuild the notebook' }).click();
    await until(() => made.jobs.length === 1, 'the notebook rebuild');
    const rebuilt = insertsOf(made)[0];
    assert.deepEqual([rebuilt.classes, rebuilt.spec.retry_outputs], ['retry', ['notebook']]);
    await nb.getByRole('textbox', { name: 'Notebook vibes' }).fill('  Score every model on the same held-out baskets  ');
    await nb.getByText('Genie rewrites the notebook with your asks, runs it, and refreshes every output from the new result.').waitFor();
    await nb.getByRole('button', { name: 'Rebuild with these vibes' }).click();
    await until(() => made.jobs.length === 2, 'the notebook vibe');
    const vibed = insertsOf(made)[1];
    assert.deepEqual([vibed.classes, vibed.spec.data.notes, vibed.spec.retry_outputs], ['data', 'Score every model on the same held-out baskets', []]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});
