import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { RESULTS, STUDIO_STATE, built, builtSpec } from './implementFixtures.js';
import { closeBrowser, openUi } from './uiSupport.mjs';
import { apiWatch, routeInspireDemo, walkInspireDemo, walkMvpTabs } from '../../../scripts/showcaseRecorder.mjs';
import { SHOWCASE_DASHBOARD_NOTE, SHOWCASE_GENIE_NOTE, SHOWCASE_NOTE, SHOWCASE_OPEN_APP } from '../../src/lib/showcase.js';
import { BUILD_TAB, MVP_TABS } from '../../src/lib/implementControl.js';
import { START_MVP_LABEL } from '../../src/lib/implementWizard.js';

const require = createRequire(import.meta.url);
const { DEMO_HOST, makeRecorder, showcaseLeaks } = require('../../../backend/lib/showcaseRecord.js');
const { SHOWCASE_HEADER, SHOWCASE_READ_ONLY, registerShowcaseRoutes, showcaseMvpPath } = require('../../../backend/lib/showcase.js');

test.after(closeBrowser);

const DEMO = { id: 'acme', title: 'Acme retail', business: 'Acme', summary: 'Use cases Inspire found on the Acme sales data.' };
const MVP_URL = STUDIO_STATE.history[0].app_url;
const HOSTED = showcaseMvpPath(DEMO.id, 'N01-U01');
const STATE = { ...STUDIO_STATE, results: RESULTS, useCases: [] };
const DEFAULTS = {
  envSkipsSetupWizard: true, isDatabricksApp: true, databricksHost: 'https://workspace.example.com',
  warehouseId: 'wh1', inspireDatabase: 'main.inspire', notebookPath: '/Shared/inspire_ai',
};
const SHELL = {
  'static/index.html': '<!doctype html><html><head><link rel="stylesheet" href="assets/index.css"></head><body><main class="app">Loading</main><script src="assets/app.js"></script></body></html>',
  'static/assets/app.js': "fetch('api/app').then((r) => r.json()).then((d) => { document.querySelector('.app').textContent = d.title; });",
  'static/assets/index.css': '.app { font: 16px sans-serif; }',
};
const WRITE_SQL = /\b(?:INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|MERGE\s+INTO)\b/i;
const serveDefaults = (app) => app.get('/api/defaults', (_req, res) => res.json(DEFAULTS));
const besidesRefusals = (errors) => errors.filter((e) => !/status of 403 \(Forbidden\)/.test(e));
const demoBar = (page) => page.getByRole('region', { name: 'Demo' });
const list = (page) => page.getByRole('region', { name: 'Use case list' });
const MVP_TAB_IDS = MVP_TABS.map((t) => t.id);
const BUILD_REGIONS = ['Build and job', "Genie's build messages", 'Run and schedule', 'History'];
const FACTS_NOTES = { dashboard: SHOWCASE_DASHBOARD_NOTE, genie_space: SHOWCASE_GENIE_NOTE };
const HOSTED_OUTPUTS = ['app', 'dashboard', 'genie_space'];
const showTab = async (page, id) => {
  await page.locator(`[data-mvp-tab="${id}"]`).click();
  await page.locator(`[data-mvp-panel="${id}"]`).waitFor();
};
const showBuildTab = (page) => showTab(page, BUILD_TAB);
const runPane = (page) => page.getByRole('region', { name: 'Run and schedule', exact: true });
const demoWrite = (page, pathname) => page.evaluate(async ([to, header, id]) => {
  const r = await fetch(to, { method: 'POST', headers: { [header]: id, 'Content-Type': 'application/json' }, body: '{}' });
  return { status: r.status, error: (await r.json()).error };
}, [pathname, SHOWCASE_HEADER, DEMO.id]);
const READ_CONTROLS = ['Use case details', 'Check the live status now', 'Jump to latest', 'Search use cases'];
const READ_PLACES = ['tab', 'use case list', 'asset filter', 'History'];
const readsOnly = (c) => READ_PLACES.includes(c.place) || READ_CONTROLS.includes(c.name) || /^Open the .+ tab$/.test(c.name);
const controlsOf = (page) => page.locator('[data-implement-page]').evaluate((root) => [...root.querySelectorAll('button, input, select, textarea')].map((el) => {
  const own = (node) => [...(node?.childNodes || [])].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
  const name = (el.getAttribute('aria-label') || own(el.labels?.[0]) || el.textContent || el.tagName).replace(/\s+/g, ' ').trim();
  const place = el.getAttribute('role') === 'tab' ? 'tab'
    : el.closest('nav[aria-label="Use cases"]') ? 'use case list'
      : el.closest('[role="group"][aria-label="Show use cases with"]') ? 'asset filter'
        : el.closest('section[aria-label="History"]') && el.hasAttribute('aria-expanded') ? 'History' : '';
  return { name, place, enabled: !el.disabled, title: el.getAttribute('title') || '' };
}));

let demoDir = '';

test('recording the demo walks every Results and Build view through the read-only guard and changes nothing', async () => {
  const exchanges = [];
  const blocked = [];
  const summary = { ...DEMO, session_id: '42', mvps: [] };
  const ui = await openUi('app', STATE, '', {
    mount: serveDefaults,
    init: (page, origin) => routeInspireDemo(page, {
      origin, summary, real: { inspire_database: DEFAULTS.inspireDatabase, warehouse_id: DEFAULTS.warehouseId }, exchanges, blocked,
    }),
  });
  const { page, made } = ui;
  try {
    const settle = apiWatch(page);
    const walk = await walkInspireDemo(page, { settle });
    assert.deepEqual(blocked, [], 'viewing the demo sends no write');
    assert.equal(walk.results, 6, 'the walk opened every use case on the Results page');
    assert.equal(walk.build.length, 6, 'the walk opened every use case on the Build page');
    assert.deepEqual(walk.build.filter((b) => b.tabs.length), [{ name: 'Predict churn', tabs: MVP_TAB_IDS }],
      'the walk opened every tab of the one MVP, and a use case with no MVP has no tabs');
    await page.locator('nav[aria-label="Use cases"] section button', { hasText: 'Predict churn' }).click();
    await settle();
    await showBuildTab(page);
    assert.equal(await runPane(page).getByRole('button', { name: 'Preview re-run' }).isDisabled(), true, 'the demo offers no re-run');
    assert.deepEqual(await demoWrite(page, '/api/inspire/implement/rerun'), { status: 403, error: SHOWCASE_READ_ONLY });
    assert.deepEqual(blocked, ['POST /api/inspire/implement/rerun'], 'the recorder refuses a write before it reaches the workspace');
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(made.sqlCalls.filter((c) => WRITE_SQL.test(String(c.sql))).map((c) => c.sql), []);
    assert.deepEqual(made.fetches.filter((f) => String(f.opts.method || 'GET').toUpperCase() !== 'GET').map((f) => f.path), []);
    const paths = new Set(exchanges.map((x) => `${x.method} ${new URL(x.url).pathname}`));
    for (const want of ['GET /api/inspire/sessions', 'GET /api/inspire/results', 'GET /api/inspire/implement/history',
      'GET /api/inspire/implement/status', 'GET /api/inspire/implement/live', 'GET /api/inspire/implement/money']) {
      assert.ok(paths.has(want), `the walk read ${want}`);
    }

    const recorder = makeRecorder({
      ...DEMO, sessionId: '42', replace: { 'amr@x': 'person@example.com' }, mvps: [{ id: 'N01-U01', title: 'Predict churn', url: MVP_URL }],
    });
    for (const x of exchanges) recorder.addInspire(x);
    recorder.addMvp('N01-U01', { method: 'GET', url: `${MVP_URL}/api/app`, status: 200, body: { title: 'Churn desk' } });
    const bundle = recorder.bundle();
    assert.deepEqual(showcaseLeaks(bundle, ['amr@x']), []);
    const text = JSON.stringify(bundle);
    assert.ok(!text.includes(new URL(MVP_URL).host), 'the MVP App host is gone');
    assert.ok(text.includes(`"app_url":"${HOSTED}"`), 'the App link points at the MVP hosted in Inspire');
    assert.ok(text.includes(`"dashboard_url":"${HOSTED}"`) && text.includes(`"genie_space_url":"${HOSTED}"`));
    demoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inspire-showcase-'));
    fs.writeFileSync(path.join(demoDir, `${DEMO.id}.json`), JSON.stringify(bundle));
    assert.deepEqual(besidesRefusals(ui.pageErrors), []);
  } finally {
    await ui.close();
  }
});

test('the demo replays every view from the bundle with no workspace call, refuses changes in plain words, and Get Started or Leave demo leave it', async () => {
  assert.ok(demoDir, 'the recording test saved the demo');
  const ui = await openUi('app', STATE, '', {
    mount: (app) => {
      serveDefaults(app);
      registerShowcaseRoutes(app, { dir: demoDir, shellFiles: SHELL });
    },
  });
  const { page, made } = ui;
  const failed = [];
  const sent = [];
  page.on('response', (r) => {
    const p = new URL(r.url()).pathname;
    if ((p.startsWith('/api/') || p.startsWith('/showcase/')) && r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${p}`);
  });
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith('/api/') && p !== '/api/showcase') sent.push({ path: p, demo: Boolean(r.headers()[SHOWCASE_HEADER]) });
  });
  const settle = apiWatch(page);
  try {
    await page.getByRole('button', { name: 'See Demo Results' }).first().waitFor();
    await settle();
    const opened = sent.length;
    await page.getByRole('button', { name: 'See Demo Results' }).first().click();
    await demoBar(page).getByText(SHOWCASE_NOTE).waitFor();
    const cards = list(page).locator('[aria-expanded]');
    await cards.first().waitFor();
    assert.equal(await cards.count(), 6);
    assert.equal(await page.getByRole('button', { name: START_MVP_LABEL }).count(), 0, 'the demo offers no new build');
    await cards.filter({ hasText: 'Predict churn' }).click();
    await settle();
    await list(page).getByRole('button', { name: 'Open MVP' }).click();
    await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
    await page.locator('nav[aria-label="Use cases"] section button').first().waitFor();
    await page.getByRole('tablist', { name: 'MVP views' }).waitFor();
    await settle();
    assert.equal((await page.locator('[data-pinned-name] h2').textContent()).trim(), 'Predict churn');
    await page.locator('[data-mvp-progress]').waitFor();
    assert.equal(await page.locator('[data-mvp-tab][aria-selected="true"]').getAttribute('data-mvp-tab'), 'app', 'a ready MVP opens on its App');
    for (const name of ['Edit MVP', 'Uninstall all', START_MVP_LABEL]) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0, name);
    assert.equal(await page.locator('[data-edit-mvp]').count(), 0, 'no Edit MVP, with or without vibes waiting');

    let vibeCards = 0;
    const toMvp = [];
    let alertFacts = '';
    const tabs = await walkMvpTabs(page, settle, async (id, panel) => {
      assert.equal(await page.getByRole('button', { name: /Uninstall/ }).count(), 0, `no Uninstall on the ${id} tab`);
      assert.equal(await page.locator('textarea').count(), 0, `no vibe box on the ${id} tab, nor above the tabs`);
      assert.equal(await page.getByRole('button', { name: /^(Add|Update) vibes$|^Take it out$|^(Remove|Keep) “/ }).count(), 0, `no ask to add or remove on the ${id} tab`);
      assert.equal(await page.locator('[data-vibe-box]').count(), 0);
      vibeCards += await panel.locator('[data-vibe-card]').count();
      if (id === 'alert') alertFacts = await panel.locator('[data-asset-facts="alert"]').innerText();
      const hrefs = await panel.locator('a[href]').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
      assert.deepEqual(hrefs.filter((href) => href.startsWith(DEMO_HOST)), [], `no link on the ${id} tab opens the made-up demo workspace`);
      if (id === BUILD_TAB) {
        for (const name of BUILD_REGIONS) await panel.getByRole('region', { name, exact: true }).waitFor();
        return;
      }
      const asset = panel.locator(`[data-asset-panel="${id}"]`);
      await asset.waitFor();
      if (HOSTED_OUTPUTS.includes(id)) {
        assert.equal(await asset.getByRole('link', { name: 'Open', exact: true }).getAttribute('href'), HOSTED, `the ${id} Open link opens the MVP hosted in Inspire`);
      }
      if (!FACTS_NOTES[id]) return;
      const facts = panel.locator(`[data-asset-facts="${id}"]`);
      await facts.getByText(FACTS_NOTES[id], { exact: true }).waitFor();
      const link = facts.getByRole('link', { name: SHOWCASE_OPEN_APP });
      assert.equal(await link.getAttribute('href'), HOSTED, `the ${id} facts open the MVP hosted in Inspire`);
      const [mvp] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
      await mvp.locator('.app', { hasText: 'Churn desk' }).waitFor();
      assert.equal(new URL(mvp.url()).pathname, HOSTED);
      await mvp.close();
      toMvp.push(id);
    });
    assert.deepEqual(tabs, MVP_TAB_IDS, 'the demo shows every tab of the MVP');
    assert.deepEqual(toMvp, ['dashboard', 'genie_space'], 'the Dashboard and the Agent tabs open the MVP App');
    assert.ok(vibeCards > 0, 'the part vibe cards show, read-only');
    assert.match(alertFacts, /Fires when: Act now rows in the latest run >= 1/, 'the demo shows what fires the alert though its link is blanked');
    assert.match(alertFacts, /Notifies: owner@example\.com/);
    assert.doesNotMatch(alertFacts, /No alert on this version/);

    await showBuildTab(page);
    assert.equal(await runPane(page).getByRole('button', { name: 'Preview re-run' }).isDisabled(), true, 'the demo offers no re-run');
    await demoBar(page).getByText(SHOWCASE_NOTE).waitFor();
    assert.deepEqual(await demoWrite(page, '/api/inspire/implement/rerun'), { status: 403, error: SHOWCASE_READ_ONLY },
      'a write sent anyway is refused in plain words');
    await settle();

    assert.equal(made.sqlCalls.length, 0, 'the demo reads nothing from the warehouse');
    assert.equal(made.fetches.length, 0, 'the demo calls no workspace API');
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(failed, ['403 POST /api/inspire/implement/rerun'], 'every view had a saved answer');
    assert.ok(sent.length > opened, 'the demo read its saved answers');
    assert.deepEqual(sent.slice(opened).filter((s) => !s.demo).map((s) => s.path), [], 'every request in the demo was a demo request');
    assert.deepEqual(besidesRefusals(ui.pageErrors), []);

    await demoBar(page).getByRole('button', { name: 'Leave demo' }).click();
    await page.getByRole('button', { name: 'See Demo Results' }).first().waitFor();
    assert.equal(await demoBar(page).count(), 0);
    await page.getByRole('button', { name: 'See Demo Results' }).first().click();
    await demoBar(page).waitFor();
    await settle();
    const before = sent.length;
    await demoBar(page).getByRole('button', { name: 'Get Started' }).click();
    await demoBar(page).waitFor({ state: 'detached' });
    await settle();
    assert.deepEqual(sent.slice(before).filter((s) => s.demo).map((s) => s.path), [], 'Get Started works on the real workspace');
  } finally {
    await ui.close();
    if (demoDir) fs.rmSync(demoDir, { recursive: true, force: true });
  }
});

const checksOf = (...items) => items.map(([ask, status, evidence]) => ({ ask, status, evidence }));
const BASE_ASSETS = JSON.parse(STUDIO_STATE.history[0].asset_status);
const MVP_JOB = { job_id: 77, settings: { tags: { dbx_inspire_ai_run_type: 'implement', dbx_inspire_ai_session_id: '42', dbx_inspire_ai_usecase_id: 'N01-U01' },
  schedule: { quartz_cron_expression: '0 0 6 * * ?', timezone_id: 'UTC', pause_status: 'UNPAUSED' } } };
const WARNED_SPEC = { ...builtSpec(), outputs: { ...builtSpec().outputs, app_access: 'sp', app_backend: 'lakebase', dashboard_vibes: 'Put the weekly trend first\nArabic labels' } };
const WARNED = [
  built({
    spec_version: 2, status: 'ready_with_warnings', status_message: 'Genie Agent: space create 403', change_classes: 'outputs', spec_json: JSON.stringify(WARNED_SPEC),
    asset_status: JSON.stringify({
      ...BASE_ASSETS,
      dashboard: { state: 'ready', spec_version: 2, snapshot: true, vibes_checks: checksOf(['Put the weekly trend first', 'done', 'The first widget is the weekly trend'],
        ['Arabic labels', 'missing', 'The dashboard has no Arabic font']) },
      app: { ...BASE_ASSETS.app, spec_version: 2, backend: 'delta' },
      genie_space: { state: 'failed', error: 'space create 403', spec_version: 2 },
      kept: { assets: [{ output: 'dashboard', id: 'd0', version: 1, title: 'Weekly dashboard' }] },
    }),
  }),
  built({ asset_status: JSON.stringify({ ...BASE_ASSETS, dashboard: { state: 'ready', spec_version: 1, snapshot: true } }) }),
];
const NOTHING_BUILT = { result_rows: null, asset_status: null, dashboard_id: null, dashboard_url: null, genie_space_id: null, genie_space_url: null,
  app_name: null, app_url: null, alert_id: null, alert_url: null };
const EDITED_NOTEBOOK = built({
  spec_version: 2, status: 'failed', status_message: 'the notebook was edited after Inspire last built it, so this version did not rebuild it',
  asset_status: JSON.stringify({ ...BASE_ASSETS, notebook: { modified_at: 1, spec_version: 1, state: 'edited', edited_at: Date.UTC(2026, 9, 25, 5) } }),
});
const DEMO_WRITES = {
  build: [/^(Pause|Resume) the schedule$/, /^Remove v1$/, /^Top K$/, /^Preview re-run$/, /^Schedule on$/, /^Retry the Genie Agent$/],
  app: [/^Stop the App$/, /^Switch to Lakebase$/],
  dashboard: [/^Unpublish$/, /^Roll back to version 1$/, /^Try again with the missing thing$/],
  genie_space: [/^Retry the Genie Agent$/],
};

async function openDemoBuild(history) {
  const blocked = [];
  const ui = await openUi('app', {
    ...STATE, history, job: MVP_JOB,
    responses: { 'GET /api/2.0/lakeview/dashboards/d1/published': [{ embed_credentials: false, revision_create_time: '2026-10-26T08:00:00.000Z' }] },
  }, '', {
    mount: serveDefaults,
    init: (page, origin) => routeInspireDemo(page, {
      origin, summary: { ...DEMO, session_id: '42', mvps: [] }, real: { inspire_database: DEFAULTS.inspireDatabase, warehouse_id: DEFAULTS.warehouseId },
      exchanges: [], blocked,
    }),
  });
  const settle = apiWatch(ui.page);
  try {
    await ui.page.getByRole('button', { name: 'See Demo Results' }).first().click();
    await demoBar(ui.page).getByText(SHOWCASE_NOTE).waitFor();
    await list(ui.page).locator('[aria-expanded]').filter({ hasText: 'Predict churn' }).click();
    await settle();
    await list(ui.page).getByRole('button', { name: 'Open MVP' }).click();
    await ui.page.getByRole('tablist', { name: 'MVP views' }).waitFor();
    await settle();
  } catch (e) {
    await ui.close();
    throw e;
  }
  return { ...ui, settle, blocked };
}

async function sweepTab(page, id) {
  const controls = await controlsOf(page);
  const offending = controls.filter((c) => c.enabled && !readsOnly(c)).map((c) => c.name);
  assert.deepEqual(offending, [], `the ${id} tab: every enabled control only reads`);
  const unexplained = controls.filter((c) => !c.enabled && !readsOnly(c) && c.title !== SHOWCASE_NOTE).map((c) => `${c.name}: ${c.title || 'no title'}`);
  assert.deepEqual(unexplained, [], `the ${id} tab: every disabled write says why, in the words of the demo bar`);
  assert.equal(await page.locator('[data-vibe-box]').count(), 0, `the ${id} tab has no vibe box, nor one above the tabs`);
  assert.equal(await page.locator('textarea').count(), 0, `the ${id} tab has no box to type in`);
  assert.equal(await page.getByRole('button', { name: /^(Add vibes|(Remove|Keep) “)/ }).count(), 0, `the ${id} tab has no Add vibes and no Remove on an ask`);
  return controls;
}

test('the demo disables every control that writes on every Build tab, hides the vibe boxes, and leaves only the controls that read', async () => {
  const ui = await openDemoBuild(WARNED);
  const { page, made, settle, blocked } = ui;
  try {
    await page.locator('[data-asset-panel="app"][data-tile-kind="live"]').getByText('Running', { exact: true }).waitFor({ timeout: 20000 });
    const seen = {};
    const reads = new Set();
    for (const id of MVP_TAB_IDS) {
      await showTab(page, id);
      await settle();
      const controls = await sweepTab(page, id);
      seen[id] = controls.filter((c) => !c.enabled).map((c) => c.name);
      for (const c of controls.filter((x) => x.enabled)) reads.add(c.place || c.name);
      for (const want of DEMO_WRITES[id] || []) assert.ok(seen[id].some((name) => want.test(name)), `the ${id} tab shows ${want} and it is disabled: ${seen[id].join(' | ')}`);
    }
    assert.deepEqual([...reads].sort(), ['Check the live status now', 'History', 'Open the Agent tab', 'Search use cases', 'Use case details', 'asset filter', 'tab', 'use case list'],
      'the controls left enabled are the ones that read');
    await showTab(page, 'dashboard');
    assert.equal(await page.locator('[data-vibe-card="dashboard"]').count(), 1, 'the dashboard card still shows what was asked and how it was checked');
    await page.locator('[data-vibe-card="dashboard"] [data-checks]').getByText('You asked for 2 things. Done: 1 of 2.', { exact: true }).waitFor();
    const builtWith = page.locator('[data-vibe-card="dashboard"] [data-built-with]');
    await builtWith.getByText('Built with', { exact: true }).waitFor({ timeout: 5000 });
    assert.deepEqual(await builtWith.locator('[data-held-ask] > span').allTextContents(), ['“Put the weekly trend first”', '“Arabic labels”'],
      'the demo shows each ask the dashboard was built with');
    assert.equal(await builtWith.getByRole('button').count(), 0, 'and offers no Remove on them');
    assert.deepEqual(blocked, [], 'the demo sent no write');
    assert.equal(made.jobs.length, 0);
    assert.deepEqual(besidesRefusals(ui.pageErrors), []);
  } finally {
    await ui.close();
  }
  for (const [history, write] of [[[built({ status: 'failed', status_message: 'Genie stopped the build: no approved model yet', ...NOTHING_BUILT })], 'Build again'],
    [[EDITED_NOTEBOOK, built()], 'Rebuild and overwrite the edits']]) {
    const failed = await openDemoBuild(history);
    try {
      await failed.page.locator(`[data-mvp-panel="${BUILD_TAB}"]`).waitFor();
      await failed.page.getByRole('button', { name: write }).waitFor();
      assert.equal(await failed.page.getByRole('button', { name: write }).isDisabled(), true, `${write} waits outside the demo`);
      await sweepTab(failed.page, `${BUILD_TAB} (${write})`);
      assert.deepEqual(failed.blocked, []);
      assert.deepEqual(besidesRefusals(failed.pageErrors), []);
    } finally {
      await failed.close();
    }
  }
});
