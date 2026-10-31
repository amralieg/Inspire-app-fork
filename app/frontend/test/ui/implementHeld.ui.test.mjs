import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSpecFromUseCase, specFromHeld } from '../../src/lib/implementWizard.js';
import { HARNESS_USE_CASE, HARNESS_SETTINGS, HARNESS_SESSION_ID } from './implementFixtures.js';
import { closeBrowser, openUi, startMvp, until } from './uiSupport.mjs';

const OWNER = ['owner', 'example.com'].join('@');
const VIBE = 'Put the riskiest customers first';
const REASON = '1 of 2 vibe requirements met after 3 rounds';

test.after(closeBrowser);

const builtSpec = (top = {}) => {
  const spec = defaultSpecFromUseCase(HARNESS_USE_CASE, { warehouseId: HARNESS_SETTINGS.warehouseId, inspireDatabase: HARNESS_SETTINGS.inspireDatabase, sessionId: HARNESS_SESSION_ID, owner: OWNER });
  return { ...spec, ...top, outputs: { ...spec.outputs, dashboard: true } };
};
const ready = (version) => ({ state: 'ready', spec_version: version });

const versionRow = (version, status, { top = {}, assets = { dashboard: ready(1), notebook: ready(1) }, ...extra } = {}) => ({
  session_id: '42', use_case_id: 'N01-U01', spec_version: version, status, change_classes: version === 1 ? 'initial' : 'vibe', created_by: OWNER,
  updated_at: `2026-10-2${version}T04:00:00Z`, spec_json: JSON.stringify(builtSpec(top)), job_id: '77', last_preview_run_id: '9001', result_rows: '3',
  notebook_path: '/Users/owner@example.com/inspire/Acme_implemented/N01-U01',
  dashboard_id: 'd1', dashboard_url: 'https://workspace.example.com/dashboardsv3/d1/published',
  asset_status: JSON.stringify(assets),
  ...extra,
});

const held = versionRow(2, 'vibe_not_met', {
  top: { vibes: VIBE, vibe_previous: 'keep', based_on_version: 1 },
  assets: { dashboard: ready(1), notebook: ready(1), held: { parts: ['dashboard'], reason: REASON }, checklist_summary: { met: 1, total: 2 } },
});

test('a held version reads Vibes not met in the rail, the chip and the history, keeps the version before live, and is never ready or failed', async () => {
  const ui = await openUi('implement', { history: [held, versionRow(1, 'ready')] });
  const { page } = ui;
  try {
    const nav = page.getByRole('navigation', { name: 'Use cases' });
    const group = nav.getByRole('region', { name: 'Vibes not met' });
    await group.getByText('Predict churn').waitFor({ timeout: 15000 });
    for (const other of ['Ready', 'Failed', 'In progress']) {
      assert.equal(await nav.getByRole('region', { name: other }).getByText('Predict churn').count(), 0, `never listed as ${other}`);
    }
    const progress = page.locator('[data-mvp-progress]');
    await progress.getByText(`Vibes not met, not published: the version before stays live. ${REASON}`, { exact: true }).waitFor({ timeout: 15000 });
    await progress.getByText('Vibes not met', { exact: true }).first().waitFor();
    assert.equal(await progress.getByText(/^(Ready|Failed)$/).count(), 0);
    const pane = page.getByRole('region', { name: 'History', exact: true });
    const toggle = pane.getByRole('button', { name: /^History/ });
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await pane.getByText('v2 · vibes not met, not published · vibe').waitFor();
    await pane.getByText('v1 · ready · initial').waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a held first build says nothing is live yet', async () => {
  const first = versionRow(1, 'vibe_not_met', {
    top: { vibes: VIBE }, dashboard_id: null, dashboard_url: null,
    assets: { held: { parts: ['dashboard'], reason: REASON } },
  });
  const ui = await openUi('implement', { history: [first] });
  const { page } = ui;
  try {
    await page.locator('[data-mvp-progress]').getByText(`Vibes not met, not published: nothing is live yet. ${REASON}`, { exact: true }).waitFor({ timeout: 15000 });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

const PAGE = 'app:page:n01_u01';
const UNCHECKED = 'Inspire could not check this ask: the App page did not load in time. Nothing shows the ask was missed: press Try again to check it again';
const ENTRIES = {
  met: { n: 1, requirement: VIBE, part: PAGE, where: 'records', status: 'met', evidence: 'The decision list sorts by risk', rounds: 1, tried: [], checks: [], published_anyway: null },
  missed: { n: 2, requirement: 'Answer in euros', part: 'genie_space', where: '', status: 'not_met', evidence: 'The answers are in dollars', rounds: 3,
    tried: ['Asked Genie to answer in euros'], checks: [], published_anyway: null },
  unchecked: { n: 3, requirement: 'Count returns by week', part: 'notebook', where: 'result table', status: 'not_met', unchecked: true, evidence: UNCHECKED, rounds: 3,
    tried: [], checks: [], published_anyway: null },
};
const liveAssets = (version) => ({ notebook: ready(version), dashboard: ready(version), genie_space: ready(version), app: ready(version),
  [PAGE]: { ...ready(version), name: 'Decisions' } });
const mvpSpec = (top = {}, outputs = {}) => {
  const spec = defaultSpecFromUseCase(HARNESS_USE_CASE, { warehouseId: HARNESS_SETTINGS.warehouseId, inspireDatabase: HARNESS_SETTINGS.inspireDatabase, sessionId: HARNESS_SESSION_ID, owner: OWNER });
  return { ...spec, ...top, outputs: { ...spec.outputs, dashboard: true, genie_space: true, app: true, app_name: 'churn-desk', app_access: 'sp', app_backend: 'delta', alert: false, ...outputs } };
};
const SENT = mvpSpec({ vibes: `${VIBE}\nAnswer in euros\nCount returns by week`, vibe_previous: 'keep', based_on_version: 1, retry_outputs: ['dashboard'],
  confirm_notebook_overwrite: true }, { dashboard_vibes: 'Weekly bars' });
const STORED = {
  ...SENT,
  outputs: { ...SENT.outputs, dashboard_vibes: `Weekly bars\n${VIBE}`, [`${PAGE}_vibes`]: VIBE, genie_space_vibes: 'Answer in euros' },
  data: { ...SENT.data, notes: 'Count returns by week' },
  retry_outputs: ['dashboard', PAGE, 'genie_space'],
};
const mvpRow = (version, status, { spec = mvpSpec(), assets = liveAssets(1), ...extra } = {}) => versionRow(version, status, {
  spec_json: JSON.stringify(spec), asset_status: JSON.stringify(assets), genie_space_id: 'g1', genie_space_url: 'https://workspace.example.com/genie/rooms/g1',
  app_name: 'churn-desk', app_url: 'https://churn-desk-1.aws.example.com', ...extra,
});
const heldMvp = (checklist) => mvpRow(2, 'vibe_not_met', {
  spec: STORED,
  assets: { ...liveAssets(1), checklist, held: { parts: ['dashboard', PAGE], reason: REASON } },
});
const APP = { name: 'churn-desk', description: 'Inspire use case N01-U01 (session 42): Predict churn', compute_status: { state: 'ACTIVE' }, app_status: { state: 'RUNNING' } };
const mvpState = (checklist = [ENTRIES.met, ENTRIES.missed]) => ({
  history: [heldMvp(checklist), mvpRow(1, 'ready')], appExists: true, app: APP, me: { userName: OWNER, displayName: 'Owner' },
});
const HELD_ROW = { status: 'vibe_not_met', spec_version: 2, spec_json: STORED };
const heldBox = (page) => page.getByRole('region', { name: 'v2 is held', exact: true });
const insertsOf = (made) => made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'))
  .map((c) => JSON.parse(c.parameters.find((p) => p.name === 'spec').value));

function leafDiff(want, got, at = []) {
  if (want && typeof want === 'object' && !Array.isArray(want)) return Object.keys(want).flatMap((key) => leafDiff(want[key], got?.[key], [...at, key]));
  return JSON.stringify(want) === JSON.stringify(got) ? [] : [at.join('.')];
}

async function openHeld(state) {
  const ui = await openUi('implement', state);
  try {
    await ui.page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await ui.page.getByRole('tablist', { name: 'MVP views' }).waitFor({ timeout: 15000 });
    const tab = ui.page.locator('[data-mvp-tab="build"]');
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    await heldBox(ui.page).waitFor({ timeout: 15000 });
  } catch (e) {
    await ui.close();
    throw e;
  }
  return ui;
}

const bodiesTo = (page, route) => {
  const sent = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === route) sent.push(JSON.parse(req.postData() || '{}'));
  });
  return sent;
};

test('Try again on a held version sends its spec exactly as the agent stored it, through the one shared helper', async () => {
  const ui = await openHeld(mvpState());
  const { page, made } = ui;
  const sent = bodiesTo(page, '/api/inspire/implement/submit');
  try {
    await heldBox(page).getByRole('button', { name: 'Try again', exact: true }).click();
    await until(() => made.jobs.length === 1, 'the try again run');
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].spec, specFromHeld(HELD_ROW), 'the request body is the helper output');
    assert.deepEqual(sent[0].spec, STORED, 'which is the stored held spec, retry_outputs and every routed ask included');
    const stripped = { ...sent[0].spec };
    delete stripped.retry_outputs;
    assert.throws(() => assert.deepEqual(stripped, specFromHeld(HELD_ROW)), 'a body missing a stored key fails this check');
    const [inserted] = insertsOf(made);
    assert.deepEqual([inserted.retry_outputs, inserted.data.notes, inserted.outputs[`${PAGE}_vibes`], Object.hasOwn(inserted, 'publish_held')],
      [['dashboard', PAGE, 'genie_space'], 'Count returns by week', VIBE, false]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Publish anyway sends the held spec as stored with publish_held and based_on_version set to the held version, through the same helper', async () => {
  const ui = await openHeld(mvpState());
  const { page, made } = ui;
  const sent = bodiesTo(page, '/api/inspire/implement/publish');
  try {
    const held = heldBox(page);
    await held.getByRole('button', { name: 'Publish anyway', exact: true }).click();
    await held.getByRole('group', { name: 'Confirm publishing v2 anyway' }).getByRole('button', { name: 'Publish anyway', exact: true }).click();
    await until(() => made.jobs.length === 1, 'the publish anyway run');
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].spec, specFromHeld(HELD_ROW, { publish: true }), 'the request body is the helper output');
    assert.deepEqual(sent[0].spec, { ...STORED, publish_held: 2, based_on_version: 2 });
    const [inserted] = insertsOf(made);
    assert.deepEqual([inserted.publish_held, inserted.based_on_version, inserted.retry_outputs], [2, 2, ['dashboard', PAGE, 'genie_space']]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Edit MVP after a hold starts the wizard from every leaf of the held spec as stored, and Start MVP sends them all', async () => {
  const ui = await openHeld(mvpState());
  const { page, made } = ui;
  const sent = bodiesTo(page, '/api/inspire/implement/submit');
  try {
    await page.locator('[data-edit-mvp]').click();
    await startMvp(page);
    await until(() => made.jobs.length === 1, 'the edited run');
    assert.equal(sent.length, 1);
    assert.deepEqual(leafDiff(specFromHeld(HELD_ROW), sent[0].spec), [], 'no stored key is stripped or changed on the way through the wizard');
    const stripped = JSON.parse(JSON.stringify(sent[0].spec));
    delete stripped.retry_outputs;
    delete stripped.confirm_notebook_overwrite;
    assert.deepEqual(leafDiff(specFromHeld(HELD_ROW), stripped).sort(), ['confirm_notebook_overwrite', 'retry_outputs'], 'a stripped key fails this check');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('while the version history is still loading the held banner says nothing about what is live, then names the version that stays live', async () => {
  let release = () => {};
  const gate = new Promise((done) => { release = done; });
  const init = (page) => page.route((url) => url.pathname === '/api/inspire/implement/status', async (route) => {
    await gate;
    await route.continue();
  });
  const ui = await openUi('implement', mvpState(), '', { init });
  const { page } = ui;
  try {
    const text = heldBox(page).locator('[data-held-text]');
    await text.waitFor({ timeout: 15000 });
    const early = await text.textContent();
    assert.ok(early.endsWith('Nothing of v2 is published.'), early);
    assert.ok(!/nothing is live yet|stays live/.test(early), `no claim about what is live before the history loads: ${early}`);
    release();
    await page.waitForFunction(() => document.querySelector('[data-held-text]')?.textContent.endsWith('Nothing of v2 is published, and v1 stays live.'), null, { timeout: 15000 });
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    release();
    await ui.close();
  }
});

const rowsOf = (page) => page.getByRole('region', { name: 'Vibe checklist of v2', exact: true }).locator('[data-requirement]');

test('a held version whose only open ask could not be checked shows it as could not be checked, not as missed, with Try again first and no Rephrase', async () => {
  const ui = await openHeld(mvpState([ENTRIES.met, ENTRIES.unchecked]));
  const { page } = ui;
  try {
    const held = heldBox(page);
    assert.equal(await held.locator('[data-held-text]').textContent(),
      "1 of 2 vibe requirements met, 1 could not be checked after Genie's rounds. Nothing of v2 is published, and v1 stays live.");
    assert.deepEqual(await rowsOf(page).evaluateAll((rows) => rows.map((r) => r.dataset.requirement)), ['met', 'unchecked']);
    const row = rowsOf(page).nth(1);
    assert.equal(await row.locator('[data-requirement-status]').textContent(), `Could not be checked after 3 rounds. ${UNCHECKED}.`);
    assert.equal(await row.locator('.sr-only').first().textContent(), 'Could not be checked: ');
    assert.equal(await page.getByRole('region', { name: 'Vibe checklist of v2', exact: true }).locator('[data-checklist-headline]').textContent(),
      '1 of 2 vibe requirements met, 1 could not be checked');
    assert.equal(await held.getByRole('button', { name: 'Rephrase', exact: true }).count(), 0, 'nothing was missed, so there is nothing to rephrase');
    assert.equal(await held.locator('[data-held-next]').textContent(), 'Try again builds the same asks again as v3 and checks again the ask Inspire could not check.');
    const buttons = await held.getByRole('button').evaluateAll((all) => all.map((b) => [b.textContent.trim(), b.className.includes('bg-db-red-solid')]));
    assert.deepEqual(buttons[0], ['Try again', true], 'Try again is the first and the primary action');
    await held.getByRole('button', { name: 'Publish anyway', exact: true }).click();
    const confirm = held.getByRole('group', { name: 'Confirm publishing v2 anyway' });
    await confirm.getByText('Publish v2 anyway? This ask is not met or could not be checked:', { exact: true }).waitFor();
    assert.deepEqual(await confirm.getByRole('listitem').allTextContents(), ['“Count returns by week” (Inspire could not check it)']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a held version whose open asks were all missed reads not met and offers Rephrase, with Try again still the primary action', async () => {
  const ui = await openHeld(mvpState([ENTRIES.met, ENTRIES.missed]));
  const { page } = ui;
  try {
    const held = heldBox(page);
    assert.equal(await held.locator('[data-held-text]').textContent(),
      "1 of 2 vibe requirements met after Genie's rounds. Nothing of v2 is published, and v1 stays live.");
    assert.deepEqual(await rowsOf(page).evaluateAll((rows) => rows.map((r) => r.dataset.requirement)), ['met', 'not_met']);
    assert.equal(await rowsOf(page).nth(1).locator('[data-requirement-status]').textContent(), 'Not met after 3 rounds. The answers are in dollars.');
    assert.equal(await held.locator('[data-held-next]').textContent(),
      'Rephrase puts the asks that were not met in the vibe box, to say them another way. Try again builds the same asks again as v3.');
    const buttons = await held.getByRole('button').evaluateAll((all) => all.map((b) => [b.textContent.trim(), b.className.includes('bg-db-red-solid')]));
    assert.deepEqual(buttons, [['Rephrase', false], ['Try again', true], ['Publish anyway', false]]);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a hold that mixes a missed ask and one Inspire could not check names both counts and shows each as what it is', async () => {
  const ui = await openHeld(mvpState([ENTRIES.met, ENTRIES.missed, ENTRIES.unchecked]));
  const { page } = ui;
  try {
    const held = heldBox(page);
    assert.equal(await held.locator('[data-held-text]').textContent(),
      "1 of 3 vibe requirements met, 1 not met, 1 could not be checked after Genie's rounds. Nothing of v2 is published, and v1 stays live.");
    assert.deepEqual(await rowsOf(page).evaluateAll((rows) => rows.map((r) => r.dataset.requirement)), ['met', 'not_met', 'unchecked']);
    assert.equal(await held.locator('[data-held-next]').textContent(),
      'Rephrase puts the asks that were not met in the vibe box, to say them another way. Try again builds the same asks again as v3 and checks again the ask Inspire could not check.');
    await held.getByRole('button', { name: 'Rephrase', exact: true }).click();
    const box = page.locator('[data-vibe-box="mvp"]').getByRole('textbox', { name: 'Vibes for the MVP', exact: true });
    await box.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-vibe-box="mvp"] textarea')?.value === 'Answer in euros', null, { timeout: 10000 });
    assert.equal(await box.inputValue(), 'Answer in euros', 'Rephrase fills only the missed ask');
    await held.getByRole('button', { name: 'Publish anyway', exact: true }).click();
    const confirm = held.getByRole('group', { name: 'Confirm publishing v2 anyway' });
    await confirm.getByText('Publish v2 anyway? These 2 asks are not met or could not be checked:', { exact: true }).waitFor();
    assert.deepEqual(await confirm.getByRole('listitem').allTextContents(), ['“Answer in euros”', '“Count returns by week” (Inspire could not check it)']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});
