import test from 'node:test';
import assert from 'node:assert/strict';
import { closeBrowser, lowContrast, lowContrastThroughAnimations, openUi } from './uiSupport.mjs';

test.after(closeBrowser);

const uc = (no, name, extra) => ({
  No: no, Name: name, Statement: `${name} for the business`, Solution: `Build ${name.toLowerCase()}`, 'Business Value': `${name} pays back`,
  'Tables Involved': 'main.s.orders', ...extra,
});

const CATALOG = {
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

const STATE = { results: CATALOG, useCases: [] };

const catalog = (page) => page.locator('[data-use-case-catalog]');
const rail = (page) => page.getByRole('complementary', { name: 'Filters' });
const facet = (page, key) => rail(page).locator(`[data-facet="${key}"]`);
const option = (page, key, value) => facet(page, key).getByRole('checkbox', { name: new RegExp(`^${value}\\s*\\d+$`) });
const shownCount = (page) => catalog(page).locator('[aria-live="polite"]').innerText().then((t) => t.replace(/\s+/g, ' ').trim());
const gridIds = (page) => page.locator('[data-use-case-grid] tbody tr').evaluateAll((trs) => trs.map((tr) => tr.dataset.rowId));
const optionCount = async (page, key, value) => Number((await option(page, key, value).locator('xpath=..').innerText()).match(/(\d+)\s*$/)[1]);

async function ready(page) {
  await catalog(page).waitFor();
  await page.locator('[data-use-case-grid] tbody tr').first().waitFor();
}

test('the catalog is a grid with a facet rail: facets AND across and OR within, their counts ignore their own selection, and chips clear them', async () => {
  const ui = await openUi('catalog', STATE);
  const { page } = ui;
  try {
    await ready(page);
    assert.equal(await shownCount(page), '6 of 6 use cases');
    assert.deepEqual(await gridIds(page), ['N01-U01', 'N02-U01', 'N01-U02', 'N02-U02', 'N01-U03', 'N01-U04'], 'best of best first, then by Inspire score');
    assert.equal(await page.locator('aside').filter({ hasText: 'Domain filter' }).count(), 0, 'the old filter sidebar is gone');

    await option(page, 'domain', 'Supply').check();
    assert.equal(await shownCount(page), '2 of 6 use cases');
    assert.equal(await optionCount(page, 'domain', 'Customer'), 4, 'the domain counts ignore the domain selection');
    assert.equal(await optionCount(page, 'quality', 'High'), 2);
    assert.equal(await optionCount(page, 'quality', 'Low'), 0);

    await option(page, 'domain', 'Customer').check();
    assert.equal(await shownCount(page), '6 of 6 use cases', 'two values of one facet are OR');
    await option(page, 'quality', 'Medium').check();
    assert.deepEqual(await gridIds(page), ['N01-U02', 'N01-U03'], 'two facets are AND');

    await catalog(page).getByRole('button', { name: 'Remove Quality Medium' }).click();
    assert.equal(await shownCount(page), '6 of 6 use cases');
    await rail(page).getByRole('button', { name: 'Clear Domain' }).click();
    assert.equal(await catalog(page).getByRole('button', { name: /^Remove Domain/ }).count(), 0);

    await option(page, 'strategy', 'Grow').check();
    assert.deepEqual(await gridIds(page), ['N01-U01', 'N01-U02'], 'a strategy entry holds everything under it');
    await catalog(page).getByRole('button', { name: 'Clear all', exact: true }).first().click();

    const more = rail(page).getByRole('region', { name: 'More fields' });
    await more.locator('[data-facet="json:channels"] button[aria-expanded]').click();
    await option(page, 'json:channels', 'SMS').check();
    assert.deepEqual(await gridIds(page), ['N01-U01', 'N02-U01'], 'a JSON list field is exploded into a facet');

    await page.getByRole('searchbox', { name: 'Search use cases' }).fill('churn');
    assert.deepEqual(await gridIds(page), ['N01-U01']);
    await page.getByRole('searchbox', { name: 'Search use cases' }).fill('churn stock');
    await catalog(page).getByText('No use cases match your filters.').waitFor();
    await catalog(page).getByRole('button', { name: 'Clear all filters' }).click();
    assert.equal(await shownCount(page), '6 of 6 use cases');
    assert.equal(await page.getByText('{"', { exact: false }).count(), 0, 'no raw JSON on the page');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the use case title keeps its room however many columns are on: a narrow page scrolls the grid sideways and a wide one gives the title the spare width', async () => {
  const ui = await openUi('catalog', STATE);
  const { page } = ui;
  try {
    await ready(page);
    const titleWidth = () => page.locator('[data-use-case-grid] thead th').nth(2).evaluate((th) => th.getBoundingClientRect().width);
    const overflow = () => page.getByRole('region', { name: 'Use case grid' }).evaluate((el) => el.scrollWidth - el.clientWidth);
    assert.equal(await page.locator('[data-use-case-grid] thead th').nth(2).innerText().then((t) => t.trim().toLowerCase()), 'use case');
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.getByRole('button', { name: /^Columns/ }).click();
    const chooser = page.getByRole('group', { name: 'Choose columns' });
    for (const box of await chooser.getByRole('checkbox').all()) await box.check();
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('[data-use-case-grid] thead th').count() >= 15, 'every column is on');
    assert.ok(await titleWidth() >= 239, `the title keeps 240px with every column on (${await titleWidth()})`);
    assert.ok(await overflow() > 0, 'the grid scrolls sideways instead of crushing the title');
    await page.getByRole('button', { name: /^Columns/ }).click();
    await chooser.getByRole('button', { name: 'Reset to default columns' }).click();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1330, height: 900 });
    await page.waitForTimeout(300);
    assert.ok(await titleWidth() >= 239, `the default columns leave the title 240px (${await titleWidth()})`);
    assert.ok(await overflow() <= 1, 'the default columns fit a page as wide as the Results page');
    const clipped = await page.locator('[data-use-case-grid] tbody td').evaluateAll((tds) => tds
      .filter((td) => td.cellIndex !== 2 && td.scrollWidth > td.clientWidth + 1)
      .map((td) => `${td.closest('tr').dataset.rowId} col ${td.cellIndex}: ${td.innerText.trim()}`));
    assert.deepEqual(clipped, [], 'no default cell spills out of its column');
    await page.setViewportSize({ width: 1800, height: 900 });
    await page.waitForTimeout(300);
    assert.ok(await titleWidth() > 260, `the title grows past its floor on a wide page (${await titleWidth()})`);
    assert.ok(await overflow() <= 1, 'no sideways scroll when everything fits');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a column header sorts the grid, and the column chooser adds a column and resets to the default set', async () => {
  const ui = await openUi('catalog', STATE);
  const { page } = ui;
  try {
    await ready(page);
    const inspire = page.getByRole('button', { name: /^Inspire/ });
    await inspire.click();
    assert.equal(await page.locator('th', { has: inspire }).getAttribute('aria-sort'), 'descending');
    assert.deepEqual(await gridIds(page), ['N01-U01', 'N02-U01', 'N01-U02', 'N02-U02', 'N01-U03', 'N01-U04']);
    await inspire.click();
    assert.equal(await page.locator('th', { has: inspire }).getAttribute('aria-sort'), 'ascending');
    assert.deepEqual((await gridIds(page))[0], 'N01-U04');
    await page.getByRole('button', { name: /^Use case/ }).click();
    assert.deepEqual(await gridIds(page), ['N02-U01', 'N01-U01', 'N01-U04', 'N01-U02', 'N01-U03', 'N02-U02'], 'one sort at a time, A to Z first');

    assert.equal(await page.locator('[data-use-case-grid] th', { hasText: 'Sponsor' }).count(), 0);
    await page.getByRole('button', { name: /^Columns/ }).click();
    const chooser = page.getByRole('group', { name: 'Choose columns' });
    await chooser.getByRole('checkbox', { name: 'Sponsor' }).check();
    await page.locator('[data-use-case-grid] th', { hasText: 'Sponsor' }).waitFor();
    await page.locator('[data-use-case-grid] td', { hasText: 'Head of Retention' }).waitFor();
    await page.keyboard.press('Escape');
    await chooser.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /^Columns/ }).click();
    await chooser.getByRole('button', { name: 'Reset to default columns' }).click();
    assert.equal(await page.locator('[data-use-case-grid] th', { hasText: 'Sponsor' }).count(), 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a saved view keeps the filters, sort, columns and layout across a reload, built-in views apply only filters, and a view is deleted only after Delete', async () => {
  const ui = await openUi('catalog', STATE);
  const { page } = ui;
  const views = () => page.getByRole('list', { name: 'Views' });
  try {
    await ready(page);
    assert.deepEqual(await views().getByRole('button').allTextContents(), ['All use cases', 'Best of best', 'Top priority', 'Has Genie code', 'In Implement']);
    assert.equal(await views().getByRole('button', { name: 'All use cases' }).getAttribute('aria-pressed'), 'true');
    await views().getByRole('button', { name: 'In Implement' }).click();
    assert.deepEqual(await gridIds(page), ['N01-U01'], 'a use case with a Genie Code notebook is listed on the Implement page');
    await views().getByRole('button', { name: 'All use cases' }).click();

    await option(page, 'domain', 'Customer').check();
    await page.getByRole('button', { name: /^Inspire/ }).click();
    await page.getByRole('button', { name: /^Inspire/ }).click();
    await page.getByRole('button', { name: /^Columns/ }).click();
    await page.getByRole('group', { name: 'Choose columns' }).getByRole('checkbox', { name: 'Sponsor' }).check();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Comfortable' }).click();
    await page.getByRole('button', { name: 'Save view' }).click();
    await page.getByRole('textbox', { name: 'View name' }).fill('Customer, low first');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal(await views().getByRole('button', { name: 'Customer, low first', exact: true }).getAttribute('aria-pressed'), 'true');

    await page.reload();
    await ready(page);
    assert.equal(await shownCount(page), '6 of 6 use cases', 'a reload starts unfiltered');
    await views().getByRole('button', { name: 'Customer, low first', exact: true }).click();
    assert.equal(await shownCount(page), '4 of 6 use cases');
    assert.deepEqual(await gridIds(page), ['N01-U04', 'N01-U03', 'N01-U02', 'N01-U01']);
    await page.locator('[data-use-case-grid] th', { hasText: 'Sponsor' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Comfortable' }).getAttribute('aria-pressed'), 'true');

    await views().getByRole('button', { name: 'Best of best' }).click();
    assert.deepEqual(await gridIds(page), ['N02-U01', 'N01-U01'], 'the built-in view replaces the filters and keeps the sort');
    assert.equal(await page.getByRole('button', { name: 'Comfortable' }).getAttribute('aria-pressed'), 'true');

    await page.getByRole('button', { name: 'Save view' }).click();
    await page.getByRole('textbox', { name: 'View name' }).fill('   ');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('alert').getByText('Give the view a name.').waitFor();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Delete view Customer, low first' }).click();
    await page.getByRole('button', { name: 'Keep' }).click();
    assert.equal(await views().getByRole('button', { name: 'Customer, low first', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Delete view Customer, low first' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    assert.equal(await views().getByRole('button', { name: 'Customer, low first', exact: true }).count(), 0);
    await page.reload();
    await ready(page);
    assert.equal(await views().getByRole('button', { name: 'Customer, low first', exact: true }).count(), 0);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a row opens its details in a drawer with the keyboard, the arrows page through the shown order, and the favorite never opens the row', async () => {
  const ui = await openUi('catalog', STATE);
  const { page } = ui;
  try {
    await ready(page);
    await option(page, 'domain', 'Supply').check();
    await page.locator('[data-row-id="N02-U01"]').focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'Use case details: Forecast stock' });
    await drawer.getByRole('heading', { name: 'Forecast stock', level: 2 }).waitFor();
    await drawer.getByText('1 of 2').waitFor();
    await drawer.getByText('Forecast stock for the business').first().waitFor();
    assert.equal(await drawer.getByRole('button', { name: 'Previous use case' }).isDisabled(), true);
    await page.keyboard.press('ArrowDown');
    await page.getByRole('dialog', { name: 'Use case details: Spot late suppliers' }).getByText('2 of 2').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Next use case' }).isDisabled(), true);
    await page.keyboard.press('k');
    await drawer.waitFor();
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });

    await page.getByRole('button', { name: 'Add Forecast stock to favorites' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Remove Forecast stock from favorites' }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'the favorite button does not open the row');
    await page.getByRole('button', { name: 'Remove Forecast stock from favorites' }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('button', { name: 'Add Forecast stock to favorites' }).click();
    await page.getByRole('list', { name: 'Views' }).getByRole('button', { name: 'Favorites' }).click();
    assert.deepEqual(await gridIds(page), ['N02-U01']);

    await page.locator('[data-row-id="N02-U01"]').click();
    assert.equal(await drawer.getByRole('button', { name: 'Open in Implement' }).count(), 0, 'no PoC yet, nothing to open');
    await drawer.getByRole('button', { name: 'Start Use Case PoC with Genie' }).waitFor();
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the cards layout shows the same rows in the same order and a card opens the same details', async () => {
  const ui = await openUi('catalog', STATE);
  const { page } = ui;
  try {
    await ready(page);
    await option(page, 'quality', 'High').check();
    const inGrid = await gridIds(page);
    await page.getByRole('button', { name: 'Cards' }).click();
    const list = page.getByRole('region', { name: 'Use case list' });
    await list.waitFor();
    assert.equal(await page.getByRole('button', { name: 'Compact' }).count(), 0, 'density and columns belong to the grid');
    const titles = await list.locator('h3').allTextContents();
    assert.equal(titles.length, inGrid.length);
    assert.deepEqual(titles.map((t) => t.trim()), ['Predict churn', 'Forecast stock', 'Spot late suppliers']);
    await list.getByText('Spot late suppliers', { exact: true }).click();
    await list.getByText('Spot late suppliers for the business').first().waitFor();
    assert.equal(await shownCount(page), '3 of 6 use cases');
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
    assert.equal(await nav.getByRole('button', { name: /Implement/ }).isDisabled(), true, 'a locked step');
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

test('the whole Results page and the drawer of every kind of use case read at 4.5:1 or better in light and in dark', async () => {
  const ui = await openUi('catalog', STATE);
  const { page } = ui;
  try {
    await ready(page);
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(400);
      const mode = dark ? 'dark' : 'light';
      const plain = await lowContrast(page, ['body']);
      assert.ok(plain.checked >= 80, `${mode}: measured ${plain.checked} text elements`);
      assert.deepEqual(plain.low, [], `${mode} Results page`);
      for (const id of ['N01-U01', 'N02-U01', 'N01-U04']) {
        await page.locator(`[data-row-id="${id}"]`).click();
        const withDrawer = await lowContrast(page, ['[role="dialog"]']);
        assert.ok(withDrawer.checked >= 15, `${mode} ${id}: measured ${withDrawer.checked} drawer elements`);
        assert.deepEqual(withDrawer.low, [], `${mode} drawer ${id}`);
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
      }
      await option(page, 'domain', 'Supply').check();
      assert.equal(await optionCount(page, 'quality', 'Low'), 0, 'a value with no matches stays listed');
      const filtered = await lowContrast(page, ['aside[aria-label="Filters"]']);
      assert.ok(filtered.checked >= 20, `${mode}: measured ${filtered.checked} filter elements`);
      assert.deepEqual(filtered.low, [], `${mode} filters with a value at 0`);
      await option(page, 'domain', 'Supply').uncheck();
    }
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});
