import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { closeBrowser, lowContrast, openUi } from './uiSupport.mjs';

const { appShellCatalog } = createRequire(import.meta.url)('../../../backend/lib/appShell.js');
const SHELL = appShellCatalog();
const OWNER = ['owner', 'example.com'].join('@');
const SHOTS = process.env.WIZARD_SHOTS || '';

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

async function toDelivery(page) {
  await onStep(page, 'Choose');
  await next(page);
  await onStep(page, 'Data');
  await next(page);
  await onStep(page, 'Results');
  await next(page);
  await onStep(page, 'Delivery');
}

async function startWhenReady(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Start PoC/MVP' && !b.disabled),
    null, { timeout: 15000 });
  await page.getByRole('button', { name: 'Start PoC/MVP', exact: true }).click();
  await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
}

function submittedSpec(made) {
  const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'));
  assert.equal(inserts.length, 1);
  return JSON.parse(inserts[0].parameters.find((p) => p.name === 'spec').value);
}

const rgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return `rgb(${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)})`;
};

test('ticking the App locks the Genie Agent on, App access must be chosen, per-user hides download and decisions, and App look previews every style, layout and palette', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await toDelivery(page);
    const genie = page.getByRole('checkbox', { name: /^Genie Agent/ });
    assert.equal(await genie.isChecked(), false);
    await page.getByRole('checkbox', { name: /^App / }).check();
    assert.equal(await genie.isChecked(), true, 'the App ticks the Genie Agent');
    assert.equal(await genie.isDisabled(), true, 'and locks it');
    await page.locator('[data-output="genie_space"]').getByText('Ask Genie in the App needs a Genie Agent.').waitFor();
    await next(page);
    await onStep(page, 'App access');
    const access = page.getByRole('region', { name: 'App access' });
    const perUser = access.getByRole('radio', { name: /^Sensitive data: each person signs in as themselves \(per-user\)/ });
    const internal = access.getByRole('radio', { name: /^Internal data: the App uses its own service principal/ });
    assert.deepEqual([await perUser.isChecked(), await internal.isChecked()], [false, false], 'no access is chosen for the person');
    assert.deepEqual(await access.getByRole('checkbox').evaluateAll((boxes) => boxes.map((b) => [b.closest('label').querySelector('span span').textContent, b.checked])),
      [['Let people download data', false], ['Let people edit data', false], ['Record decisions', false]], 'every option starts off');
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['choose who the App signs people in as: each person (per-user) or its own service principal']);
    await onStep(page, 'App access');
    await access.getByRole('checkbox', { name: /^Let people download data/ }).check();
    await perUser.check();
    assert.equal(await access.getByRole('checkbox', { name: /^Let people download data/ }).count(), 0, 'per-user hides download');
    assert.equal(await access.getByRole('checkbox', { name: /^Record decisions/ }).count(), 0, 'and record decisions');
    await access.getByRole('note', { name: 'Why some options are hidden' }).getByText(/no downloads, no recorded decisions and no chart image export/).waitFor();
    const replace = access.getByRole('radiogroup', { name: 'Should a new run replace edited records?' });
    assert.equal(await replace.count(), 0, 'the replace question waits for edits');
    await access.getByRole('checkbox', { name: /^Let people edit data/ }).check();
    await replace.waitFor();
    assert.deepEqual([await replace.getByRole('radio', { name: /^No \(default\)/ }).isChecked(), await replace.getByRole('radio', { name: /^Yes/ }).isChecked()],
      [true, false], 'a new run keeps edited records by default');
    await next(page);
    await onStep(page, 'App look');
    const look = page.getByRole('region', { name: 'App look' });
    assert.deepEqual(await look.locator('[data-preview^="style-"]').evaluateAll((els) => els.map((e) => e.dataset.preview)), ['style-a', 'style-b', 'style-c']);
    assert.deepEqual(await look.locator('[data-preview^="layout-"]').evaluateAll((els) => els.map((e) => e.dataset.preview)),
      ['layout-sidebar', 'layout-tabs', 'layout-home']);
    await look.getByText('Only style A matches the Lakeview dashboard look.').waitFor();
    assert.equal(await look.getByRole('radio', { name: /^Style A/ }).isChecked(), true, 'style A is the default');
    assert.equal(await look.getByRole('radio', { name: /^Sidebar/ }).isChecked(), true, 'the sidebar is the default');
    assert.deepEqual(await look.locator('[data-swatch]').evaluateAll((els) => els.map((e) => e.dataset.swatch)), SHELL.palettes, 'the 13 shell palettes, in order');
    assert.equal(await look.getByRole('radio', { name: 'Default', exact: true }).isChecked(), true);
    const mode = look.getByRole('group', { name: 'Light or dark' });
    assert.equal(await mode.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed'), 'true');
    const nordic = SHELL.palette_colors.find((p) => p.id === 'nordic');
    await look.getByText('Style C', { exact: true }).click();
    await look.getByText('Home cards', { exact: true }).click();
    await look.getByText('Nordic', { exact: true }).click();
    await mode.getByRole('button', { name: 'Dark' }).click();
    assert.equal(await look.locator('[data-preview="layout-home"]').evaluate((el) => getComputedStyle(el).backgroundColor), rgb(nordic.dark.base.bg),
      'the previews draw with the palette and the mode picked');
    assert.equal(await look.locator('[data-preview="style-c"]').evaluate((el) => getComputedStyle(el).backgroundColor), rgb(nordic.dark.base.card));
    await startWhenReady(page);
    const spec = submittedSpec(made);
    assert.deepEqual([spec.outputs.app, spec.outputs.genie_space, spec.outputs.app_access], [true, true, 'user']);
    assert.deepEqual(spec.outputs.app_look, { style: 'c', layout: 'home', palette: 'nordic', theme: 'dark' });
    assert.deepEqual(spec.outputs.app_options, { download: false, modify: true, replace_edits: false, decisions: false });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Where results live picks a catalog and a schema from Unity Catalog, offers the default back, and Next checks the table live', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' }, catalogs: ['main', 'sales'], schemas: { main: ['inspire', 's'], sales: ['poc', 'gold'] } });
  const { page, made } = ui;
  try {
    await onStep(page, 'Choose');
    await next(page);
    await onStep(page, 'Data');
    assert.equal(await page.getByLabel('Output table').count(), 0, 'the result table left the Data step');
    await next(page);
    await onStep(page, 'Results');
    const step = page.getByRole('region', { name: 'Where the result table lives' });
    await step.getByRole('heading', { name: 'Where should the result table live?' }).waitFor();
    const catalog = step.getByLabel('Catalog');
    const schema = step.getByLabel('Schema');
    await catalog.locator('option[value="sales"]').waitFor({ state: 'attached' });
    assert.deepEqual([await catalog.inputValue(), await schema.inputValue(), await step.getByLabel('Table name').inputValue()], ['main', 'inspire', 'n01_u01_out']);
    await step.getByText("Inspire's default").waitFor();
    await step.getByRole('note', { name: 'Moving the result table' }).getByText('Moving the table later copies its history to the new table and keeps the old one.').waitFor();
    await catalog.selectOption('sales');
    assert.equal(await schema.inputValue(), '', 'a new catalog asks for its schema again');
    await schema.locator('option[value="gold"]').waitFor({ state: 'attached' });
    assert.deepEqual(await schema.locator('option').evaluateAll((os) => os.map((o) => o.value)), ['', 'gold', 'poc']);
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['pick a catalog and a schema, and name the result table']);
    await schema.selectOption('poc');
    await step.getByLabel('Table name').fill('churn_out');
    await step.getByText('sales.poc.churn_out', { exact: true }).waitFor();
    made.state.access = [];
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['catalog sales does not exist or you have no access to it']);
    await onStep(page, 'Results');
    await step.getByRole('button', { name: 'Use the default, main.inspire.n01_u01_out' }).click();
    assert.deepEqual([await catalog.inputValue(), await schema.inputValue()], ['main', 'inspire']);
    made.state.access = [
      { level: 'catalog', privilege: 'OWNER', principal: 'admins', mine: 'false', me: OWNER },
      { level: 'catalog', privilege: 'USE_CATALOG', principal: 'account users', mine: 'true', me: OWNER },
      { level: 'schema', privilege: 'OWNER', principal: OWNER, mine: 'true', me: OWNER },
    ];
    await catalog.selectOption('sales');
    await schema.locator('option[value="poc"]').waitFor({ state: 'attached' });
    await schema.selectOption('poc');
    await next(page);
    await onStep(page, 'Delivery');
    await startWhenReady(page);
    assert.equal(submittedSpec(made).config.result_table, 'sales.poc.n01_u01_out');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

const target = (sid, uc, name, outputs, version = 1) => ({
  session_id: sid, use_case_id: uc, spec_version: version, status: 'ready', updated_at: '2026-10-26T00:00:00Z', asset_status: null,
  spec_json: JSON.stringify({ use_case_id: uc, use_case_name: name, outputs }), dashboard_id: null, genie_space_id: null, app_name: null,
});

const MERGE_STATE = {
  me: { userName: OWNER, displayName: 'Owner' },
  registry: [
    { ...target('42', 'N01-U02', 'Forecast demand', { app: true, app_access: 'sp', app_look: { style: 'b', layout: 'tabs', palette: 'ocean', theme: 'light' } }),
      app_name: 'ops-desk', dashboard_id: 'd1' },
    { ...target('42', 'N01-U03', 'Score suppliers', { app: true, app_access: 'user' }), app_name: 'care-desk' },
    { ...target('42', 'N01-U04', 'Plan stock', { app: true, app_access: 'sp' }), app_name: 'someone-else' },
  ],
  appsByName: {
    'ops-desk': { name: 'ops-desk', description: 'Inspire use case N01-U02 (session 42): Forecast demand' },
    'care-desk': { name: 'care-desk', description: 'Inspire use case N01-U03 (session 42): Score suppliers' },
    'someone-else': { name: 'someone-else', description: 'A tool the team built by hand' },
    'predict-churn': null,
  },
};

test('each asset can be built new or added to one Inspire built, the list shows its use cases and sign-in, and per-user cannot join a service-principal App', async () => {
  const ui = await openUi('wizard', MERGE_STATE);
  const { page, made } = ui;
  try {
    await toDelivery(page);
    const dash = page.locator('[data-merge="dashboard"]');
    await dash.getByRole('button', { name: 'Create new' }).waitFor();
    assert.equal(await dash.getByRole('button', { name: 'Create new' }).getAttribute('aria-pressed'), 'true', 'Create new is the default');
    await page.getByRole('checkbox', { name: /^App / }).check();
    const app = page.locator('[data-merge="app"]');
    await app.getByRole('button', { name: 'Add to an existing one' }).click();
    const pick = app.getByLabel('App to add this use case to');
    assert.deepEqual(await pick.locator('option').evaluateAll((os) => os.map((o) => o.textContent)), [
      'ops-desk · holds Forecast demand · its own service principal',
      'care-desk · holds Score suppliers · each person signs in',
    ], 'only Apps Inspire built, never one whose description is not an Inspire owner tag');
    await app.getByText('Adds this use case to ops-desk, which holds Forecast demand; it signs in with its own service principal.').waitFor();
    assert.equal(await page.getByLabel('App name').count(), 0, 'a joined App keeps its own name');
    const genie = page.locator('[data-merge="genie_space"]');
    await genie.getByText('Inspire has built none yet').waitFor();
    assert.equal(await genie.getByRole('button', { name: 'Add to an existing one' }).isDisabled(), true);
    await next(page);
    await onStep(page, 'App access');
    const access = page.getByRole('region', { name: 'App access' });
    assert.equal(await access.getByRole('radio', { name: /^Sensitive data/ }).isDisabled(), true, 'per-user cannot join a service-principal App');
    await access.getByRole('note', { name: 'Why per-user sign-in is off' })
      .getByText('ops-desk signs everyone in with its own service principal, so a per-user (sensitive) use case cannot join it: create a new App, or choose Internal data').waitFor();
    await page.getByRole('button', { name: 'Back' }).click();
    await onStep(page, 'Delivery');
    await pick.selectOption('care-desk');
    await next(page);
    await onStep(page, 'App access');
    await access.getByRole('radio', { name: /^Sensitive data/ }).check();
    await page.getByRole('button', { name: 'Back' }).click();
    await onStep(page, 'Delivery');
    assert.equal(await pick.locator('option[value="ops-desk"]').isDisabled(), true, 'with per-user chosen, the service-principal App cannot be picked');
    assert.match(await pick.locator('option[value="ops-desk"]').textContent(), /per-user use cases cannot join$/);
    await next(page);
    await onStep(page, 'App access');
    await next(page);
    await onStep(page, 'App look');
    await page.getByRole('region', { name: 'App look' }).getByText('The look applies to every use case in care-desk.', { exact: false }).waitFor();
    await startWhenReady(page);
    const spec = submittedSpec(made);
    assert.deepEqual([spec.outputs.app_access, spec.outputs.app_name, spec.outputs.merge], ['user', 'care-desk', { app: 'care-desk', dashboard: '', genie_space: '' }]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

async function measure(page, name) {
  await page.waitForTimeout(250);
  const box = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const body = document.querySelector('[data-wizard-body]');
    return { top: dialog.top, bottom: dialog.bottom, height: Math.round(dialog.height), scroll: body.scrollHeight, client: body.clientHeight,
      page: document.scrollingElement.scrollHeight };
  });
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  }
  return box;
}

test('every wizard step fits a 1440x900 screen with nothing to scroll, the App steps included, and reads at 4.5:1 in light and dark', async () => {
  const ui = await openUi('wizard', { ...MERGE_STATE, me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  const heights = {};
  const fits = async (name) => {
    const box = await measure(page, name);
    heights[name] = box.height;
    assert.ok(box.top >= 0 && box.bottom <= 900, `${name}: the dialog sits inside the screen ${JSON.stringify(box)}`);
    assert.ok(box.scroll <= box.client + 1, `${name}: the step needs no scroll (${box.scroll} > ${box.client})`);
    assert.ok(box.page <= 900, `${name}: the page itself does not scroll (${box.page})`);
  };
  const readable = async (name) => {
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(300);
      const result = await lowContrast(page, ['[role="dialog"]']);
      assert.ok(result.checked >= 10, `${name}: measured ${result.checked} elements`);
      assert.deepEqual(result.low, [], `${name} ${dark ? 'dark' : 'light'}`);
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await onStep(page, 'Choose');
    await page.getByRole('radio', { name: /^Notebook only/ }).check();
    await next(page);
    await onStep(page, 'Data');
    await fits('0-notebook-data');
    await next(page);
    await onStep(page, 'Notebook');
    await fits('0-notebook');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    await onStep(page, 'Choose');
    await page.getByRole('radio', { name: /^Full PoC\/MVP/ }).check();
    await fits('1-choose');
    await next(page);
    await onStep(page, 'Data');
    await fits('2-data');
    await next(page);
    await onStep(page, 'Results');
    await page.getByRole('region', { name: 'Where the result table lives' }).getByLabel('Catalog').locator('option[value="main"]').waitFor({ state: 'attached' });
    await fits('3-results');
    await readable('results');
    await next(page);
    await onStep(page, 'Delivery');
    for (const name of [/^App /, /^Alert/]) await page.getByRole('checkbox', { name }).check();
    await page.locator('[data-merge="dashboard"]').getByRole('button', { name: 'Create new' }).waitFor();
    await page.getByText(`Emails ${OWNER} when`, { exact: false }).waitFor();
    await fits('4-delivery');
    await page.locator('[data-merge="app"]').getByRole('button', { name: 'Add to an existing one' }).click();
    await page.locator('[data-merge="dashboard"]').getByRole('button', { name: 'Add to an existing one' }).click();
    await fits('4-delivery-joining');
    await readable('delivery');
    await page.locator('[data-merge="app"]').getByRole('button', { name: 'Create new' }).click();
    await next(page);
    await onStep(page, 'App access');
    const access = page.getByRole('region', { name: 'App access' });
    await access.getByRole('radio', { name: /^Internal data/ }).check();
    await access.getByRole('checkbox', { name: /^Let people edit data/ }).check();
    await fits('5-app-access-internal');
    await access.getByRole('radio', { name: /^Sensitive data/ }).check();
    await fits('5-app-access-per-user');
    await readable('app access');
    await next(page);
    await onStep(page, 'App look');
    await page.locator('[data-swatch="mono"]').waitFor();
    await fits('6-app-look');
    await readable('app look');
    await page.getByRole('group', { name: 'Light or dark' }).getByRole('button', { name: 'Dark' }).click();
    await fits('6-app-look-dark-palette');
    console.log(`wizard step heights at 1440x900: ${JSON.stringify(heights)}`);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});
