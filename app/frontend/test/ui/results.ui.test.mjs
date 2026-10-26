import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { closeBrowser, lowContrast, lowContrastThroughAnimations, openUi } from './uiSupport.mjs';

const { SLOW_WAREHOUSE_MESSAGE } = createRequire(import.meta.url)('../../../backend/lib/sqlStatements.js');

test.after(closeBrowser);

const uc = (no, name, extra) => ({
  No: no, Name: name, Statement: `${name} for the business`, Solution: `Build ${name.toLowerCase()}`, 'Business Value': `${name} pays back`,
  'Tables Involved': 'main.s.orders', ...extra,
});

const RESULTS = {
  discovery_type: 'Deep',
  domains: [
    { domain_name: 'Customer', use_cases: [
      uc('N01-U01', 'Predict churn', { Subdomain: 'Retention', Priority: 'Very High', Quality: 'High', 'Analytics Technique': 'Classification',
        priority_score: '4.6', value_score: '4.8', feasibility_score: '4.4', Sponsor: 'Head of Retention', has_genie_code: 'Y',
        best_of_best: 'Y', best_of_best_rank: '1', strategy_alignment: JSON.stringify([{ id: 'S1', path: 'Grow > Keep customers', evidence: 'churn' }]),
        kpis: JSON.stringify([{ name: 'Churn rate', direction: 'decrease' }]), channels: JSON.stringify(['Email', 'SMS']) }),
      uc('N01-U02', 'Score upsell', { Subdomain: 'Growth', Priority: 'High', Quality: 'Medium', 'Analytics Technique': 'Regression',
        priority_score: '3.9', Sponsor: 'Head of Sales', strategy_alignment: JSON.stringify([{ id: 'S2', path: 'Grow > Sell more', evidence: 'upsell' }]),
        channels: JSON.stringify(['Email']) }),
      uc('N01-U03', 'Segment shoppers', { Subdomain: 'Growth', Priority: 'Medium', Quality: 'Medium', 'Analytics Technique': 'Clustering',
        priority_score: '3.1', channels: JSON.stringify(['App']) }),
      uc('N01-U04', 'Price elasticity', { Subdomain: 'Pricing', Priority: 'Low', Quality: 'Low', 'Analytics Technique': 'Regression',
        priority_score: '2.2', strategy_alignment: '[]' }),
    ] },
    { domain_name: 'Supply', use_cases: [
      uc('N02-U01', 'Forecast stock', { Subdomain: 'Inventory', Priority: 'High', Quality: 'High', 'Analytics Technique': 'Forecasting',
        priority_score: '4.1', best_of_best: 'Y', best_of_best_rank: '2', channels: JSON.stringify(['SMS']), 'Tables Involved': 'main.s.stock' }),
      uc('N02-U02', 'Spot late suppliers', { Subdomain: 'Procurement', Priority: 'Medium', Quality: 'High', 'Analytics Technique': 'Anomaly detection',
        priority_score: '3.4' }),
    ] },
  ],
};

const STATE = { results: RESULTS, useCases: [] };

const list = (page) => page.getByRole('region', { name: 'Use case list' });
const cards = (page) => list(page).locator('[aria-expanded]');
const card = (page, name) => cards(page).filter({ hasText: name });
const panel = (page, title) => page.getByRole('button', { name: new RegExp(`^${title}\\b`) }).first();

async function ready(page) {
  await list(page).waitFor();
  await cards(page).first().waitFor();
}

test('the Results page is the list it was before the grid: the sidebar and the filter bar narrow the cards, best of best comes first, and Clear brings every card back', async () => {
  const ui = await openUi('results', STATE);
  const { page } = ui;
  try {
    await ready(page);
    assert.equal(await page.locator('[data-use-case-grid], [data-use-case-catalog]').count(), 0, 'no grid or facet rail');
    assert.equal(await cards(page).count(), 6);
    assert.match(await cards(page).first().innerText(), /Predict churn/, 'best of best rank 1 leads');
    assert.match(await cards(page).nth(1).innerText(), /Forecast stock/, 'best of best rank 2 follows');
    await panel(page, 'Domains').click();
    await page.getByRole('button', { name: /^Supply\b/ }).click();
    assert.equal(await cards(page).count(), 2);
    assert.match(await page.getByText(/use cases$/).filter({ hasText: ' of ' }).first().innerText(), /2\s+of\s+6 use cases/);
    await page.getByPlaceholder('Search use cases...').fill('late');
    assert.equal(await cards(page).count(), 1);
    assert.match(await cards(page).first().innerText(), /Spot late suppliers/);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await cards(page).count(), 6);
    await panel(page, 'Sponsors').click();
    await page.getByRole('button', { name: /^Head of Sales\b/ }).click();
    assert.equal(await cards(page).count(), 1);
    assert.match(await cards(page).first().innerText(), /Score upsell/);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    const churn = card(page, 'Predict churn');
    await churn.click();
    assert.equal(await churn.getAttribute('aria-expanded'), 'true');
    await list(page).getByText('Build predict churn').first().waitFor();
    await card(page, 'Forecast stock').click();
    assert.equal(await churn.getAttribute('aria-expanded'), 'false', 'one card is open at a time');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the contrast check measures gradient fills by their weakest stop and skips decoration and disabled controls', async () => {
  const ui = await openUi('header');
  const { page } = ui;
  try {
    await page.setContent(`<body style="margin:0;background:#ffffff">
      <button style="background-image:linear-gradient(to right,#D92E1B,#CC2A19);color:#fff">Solid gradient</button>
      <button style="background-image:linear-gradient(to right,#FF3621,#FF4A36);color:#fff">Bright on light</button>
      <div style="background:#09090B"><button style="background:transparent;background-image:linear-gradient(to right,#D92E1B,#FF4A36);color:#fff">Bright stop on dark</button></div>
      <p style="background-image:linear-gradient(to right,rgba(255,54,33,0.06),transparent);color:#18181B">Faint tint</p>
      <p style="background-image:linear-gradient(to right,rgba(255,54,33,0.06),transparent);color:#ffffff">White on faint tint</p>
      <span aria-hidden="true" style="color:#eeeeee">Decoration</span>
      <button disabled style="color:#eeeeee">Locked</button>
    </body>`);
    const result = await lowContrast(page, ['body']);
    assert.equal(result.checked, 5);
    assert.deepEqual(result.low.map((l) => l.replace(/: [\d.]+$/, '')), ['Bright on light', 'Bright stop on dark', 'White on faint tint']);
  } finally {
    await ui.close();
  }
});

test('the landing page reads at 4.5:1 or better in light and in dark at every point of its animations', async () => {
  const ui = await openUi('landing');
  const { page } = ui;
  try {
    await page.getByText('Scroll to explore').waitFor();
    await page.waitForTimeout(1500);
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const mode = dark ? 'dark' : 'light';
      const result = await lowContrastThroughAnimations(page, ['body']);
      assert.ok(result.checked >= 15, `${mode}: measured ${result.checked} text elements`);
      assert.ok(result.animations >= 3, `${mode}: paused ${result.animations} animations`);
      assert.deepEqual(result.low, [], `${mode} landing`);
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the header reads at 4.5:1 or better in light and in dark on its current, open and locked steps', async () => {
  const ui = await openUi('header');
  const { page } = ui;
  try {
    const nav = page.locator('header nav');
    await nav.waitFor();
    assert.equal(await nav.getByRole('button', { name: /Build/ }).isDisabled(), true, 'a locked step');
    assert.equal(await nav.getByRole('button', { name: /Get Started/ }).isEnabled(), true, 'an open step');
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const mode = dark ? 'dark' : 'light';
      const result = await lowContrast(page, ['header']);
      assert.ok(result.checked >= 8, `${mode}: measured ${result.checked} header elements`);
      assert.deepEqual(result.low, [], `${mode} header`);
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the whole Results page, its open sidebar panels and every kind of open card read at 4.5:1 or better in light and in dark', async () => {
  const ui = await openUi('results', STATE);
  const { page } = ui;
  try {
    await ready(page);
    for (const title of ['Domains', 'Strategy', 'Beneficiaries', 'Sponsors']) {
      if (await panel(page, title).count()) await panel(page, title).click();
    }
    await page.getByRole('button', { name: /^Customer\b/ }).click();
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const mode = dark ? 'dark' : 'light';
      const plain = await lowContrast(page, ['body']);
      assert.ok(plain.checked >= 80, `${mode}: measured ${plain.checked} text elements`);
      assert.deepEqual(plain.low, [], `${mode} Results page with a domain filter on`);
      for (const name of ['Predict churn', 'Score upsell', 'Price elasticity']) {
        const open = card(page, name);
        await open.click();
        await page.waitForTimeout(300);
        const withCard = await lowContrast(page, ['[aria-label="Use case list"]']);
        assert.ok(withCard.checked >= 20, `${mode} ${name}: measured ${withCard.checked} card elements`);
        assert.deepEqual(withCard.low, [], `${mode} open card ${name}`);
        await open.click();
      }
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a warehouse too slow to answer shows its own message with Retry, and Retry brings the sessions back', async () => {
  const ui = await openUi('results', { ...STATE, sessionsErrors: [SLOW_WAREHOUSE_MESSAGE] });
  const { page, made } = ui;
  try {
    await ready(page);
    await page.getByRole('button', { name: /Change Session/ }).click();
    await page.getByText('Could not load sessions').waitFor();
    assert.equal(await page.getByText(SLOW_WAREHOUSE_MESSAGE, { exact: false }).count(), 1, 'the page shows why and what to do');
    assert.equal(await page.getByText('Failed to fetch').count(), 0);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    const session = page.locator('button', { hasText: made.state.session.business_name }).filter({ hasText: 'Complete' });
    await session.first().waitFor();
    assert.equal(await page.getByText('Could not load sessions').count(), 0);
    await session.first().click();
    await ready(page);
    assert.deepEqual(ui.pageErrors.filter((e) => !/status of 500/.test(e)), []);
  } finally {
    await ui.close();
  }
});
