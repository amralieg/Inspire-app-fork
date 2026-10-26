const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const lib = (name) => pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', name)).href;
const load = async () => ({ ...(await import(lib('useCaseFacets.js'))), ...(await import(lib('v130UseCase.js'))) });

const withView = (f, uc) => ({ ...uc, _v130: f.v130View(uc) });

const useCases = (f) => [
  withView(f, {
    id: 'N01-U01', Name: 'Predict churn', _domain: 'Customer', Subdomain: 'Retention', Priority: 'Very High', Quality: 'High',
    'Analytics Technique': 'Classification', priority_score: '4.5', value_score: '4', feasibility_score: '5', Beneficiary: 'CRM team',
    has_genie_code: 'Y', best_of_best: 'Y', best_of_best_rank: '1',
    strategy_alignment: JSON.stringify([{ id: 'S1', path: 'Grow > Keep customers', evidence: 'churn' }]),
    kpis: JSON.stringify([{ name: 'Churn rate', direction: 'decrease' }]),
    tables_involved: 'main.s.orders, main.s.customers',
    selection_flags: JSON.stringify({ elite_coverage_pick: true, elite_fallback_pick: false }),
    channels: JSON.stringify(['Email', 'App']),
    notes_json: JSON.stringify(['x'.repeat(120), 'short']),
    only_once: JSON.stringify(['alpha', 'beta']),
  }),
  withView(f, {
    id: 'N01-U02', Name: 'Score upsell', _domain: 'Customer', Subdomain: 'Growth', Priority: 'High', Quality: 'Medium',
    'Analytics Technique': 'Regression', priority_score: '3.9', genie_instruction: 'draft',
    strategy_alignment: JSON.stringify([{ id: 'S2', path: 'Grow > Sell more', evidence: 'upsell' }]),
    kpis: JSON.stringify([{ name: 'Revenue per customer', direction: 'increase' }]),
    tables_involved: 'main.s.orders',
    channels: JSON.stringify(['Email']),
    notes_json: JSON.stringify(['short']),
  }),
  withView(f, {
    id: 'N02-U01', Name: 'Forecast stock', _domain: 'Supply', Subdomain: 'Inventory', Priority: 'Medium', Quality: 'Medium',
    'Analytics Technique': 'Forecasting', priority_score: '2.1',
    strategy_alignment: '[]',
    tables_involved: '["main.s.stock"]',
    channels: JSON.stringify({ email: true, sms: false, store: 'Dubai' }),
  }),
];

const ctx = (extra = {}) => ({ statusOf: (_uc, id) => (id === 'N01-U02' ? { label: 'PoC ready' } : { label: '' }), ...extra });

test('a catalog row explodes every JSON and list field into its facet values', async () => {
  const f = await load();
  const rows = f.catalogRows(useCases(f), ctx({ resolveTable: (t) => t.toUpperCase() }));
  assert.deepEqual(rows.map((r) => r.id), ['N01-U01', 'N01-U02', 'N02-U01']);
  const [churn, upsell, stock] = rows;
  assert.deepEqual(churn.strategy, ['Grow', 'Grow > Keep customers']);
  assert.deepEqual(churn.kpis, ['Churn rate']);
  assert.deepEqual(churn.kpiDirections, ['Down']);
  assert.deepEqual(upsell.kpiDirections, ['Up']);
  assert.deepEqual(churn.tables, ['MAIN.S.ORDERS', 'MAIN.S.CUSTOMERS']);
  assert.deepEqual(stock.tables, ['MAIN.S.STOCK']);
  assert.deepEqual(churn.flags, ['Elite coverage pick'], 'a false flag is not a value');
  assert.deepEqual(stock.strategy, [f.STRATEGY_NOT_ALIGNED]);
  const legacy = f.catalogRow(withView(f, { id: 'L1', Name: 'Old', 'Strategic Goals Alignment': 'Grow' }), 0, {});
  assert.deepEqual(legacy.strategy, [], 'a use case from before strategy alignment is not counted as not aligned');
  const care = f.catalogRow(withView(f, { id: 'C1', 'Strategy Alignment': [{ id: 'S9', path: 'Customer Care > Faster replies' }] }), 0, {});
  assert.equal(care.strategy.includes('Customer'), false);
  assert.equal(churn.genie, f.GENIE_LABELS.shipped);
  assert.equal(upsell.genie, f.GENIE_LABELS.draft);
  assert.equal(stock.genie, f.GENIE_LABELS.none);
  assert.equal(churn.poc, f.NOT_STARTED, 'an empty status label reads as not started');
  assert.equal(upsell.poc, 'PoC ready');
  assert.equal(churn.inspire, 4.5);
  assert.ok(churn.bob, 'best of best comes first');
  const tracked = f.catalogRow(withView(f, { id: 'T1', use_case: 'From tracking', business_domain: 'Ops', subdomain: 'Fleet', analytics_technique: 'Forecasting', quality: 'High', priority: 'Very High', Subdomain: ' ' }), 0, {});
  assert.deepEqual([tracked.domain, tracked.subdomain, tracked.technique, tracked.quality, tracked.priority], ['Ops', 'Fleet', 'Forecasting', 'High', 'Very High'], 'a tracking-table row reads its lowercase columns, and a blank display key falls back');
});

test('explodeJson labels arrays by name, keeps true object keys and drops false or empty ones', async () => {
  const f = await load();
  assert.deepEqual(f.explodeJson('[{"name":"A"},{"label":"B"},"C",{"other":1}]'), ['A', 'B', 'C']);
  assert.deepEqual(f.explodeJson({ email: true, sms: false, store: 'Dubai', empty: '', nested: { a: 'x' } }),
    ['Email', 'Store: Dubai', 'Nested: A: x']);
  assert.deepEqual(f.explodeJson('not json'), []);
  assert.deepEqual(f.explodeJson(42), []);
  assert.deepEqual(f.splitList('a, b,,a'), ['a', 'b']);
  assert.deepEqual(f.splitList('["x","y"]'), ['x', 'y']);
  assert.deepEqual(f.splitList(null), []);
});

test('extra JSON facets keep fields with repeated short values and exclude long text, singletons and covered fields', async () => {
  const f = await load();
  const extra = f.extraJsonFacets(useCases(f));
  assert.deepEqual(extra.map((d) => d.key), ['json:channels']);
  const row = f.catalogRow(useCases(f)[2], 2, ctx());
  assert.deepEqual(extra[0].get(row), ['Email', 'Store: Dubai']);
  assert.equal(extra.some((d) => d.key === 'json:notes_json'), false, 'a field with any value over 80 characters is excluded');
  assert.equal(extra.some((d) => d.key === 'json:only_once'), false, 'a field whose values each appear once is excluded');
  assert.equal(extra.some((d) => d.key === 'json:kpis' || d.key === 'json:strategy_alignment' || d.key === 'json:selection_flags'), false);
  assert.equal(extra.some((d) => d.key.startsWith('json:_')), false);
});

test('filters AND across facets, OR within a facet, and every search word must match', async () => {
  const f = await load();
  const rows = f.catalogRows(useCases(f), ctx());
  const index = f.facetIndex(rows, f.catalogFacetDefs({ extra: f.extraJsonFacets(useCases(f)) }));
  const ids = (state) => f.filterRows(index, rows, state).map((r) => r.id);
  assert.deepEqual(ids(f.emptyFacetState()), ['N01-U01', 'N01-U02', 'N02-U01']);
  assert.deepEqual(ids({ sel: { domain: ['Customer', 'Supply'] }, q: '' }), ['N01-U01', 'N01-U02', 'N02-U01']);
  assert.deepEqual(ids({ sel: { domain: ['Customer'], quality: ['Medium'] }, q: '' }), ['N01-U02']);
  assert.deepEqual(ids({ sel: { domain: ['Supply'], quality: ['High'] }, q: '' }), []);
  assert.deepEqual(ids({ sel: { strategy: ['Grow'] }, q: '' }), ['N01-U01', 'N01-U02']);
  assert.deepEqual(ids({ sel: { 'json:channels': ['Email'] }, q: '' }), ['N01-U01', 'N01-U02', 'N02-U01']);
  assert.deepEqual(ids({ sel: { 'json:channels': ['App'] }, q: '' }), ['N01-U01']);
  assert.deepEqual(ids({ sel: {}, q: 'churn orders' }), ['N01-U01']);
  assert.deepEqual(ids({ sel: {}, q: 'churn stock' }), []);
  assert.deepEqual(ids({ sel: { tables: ['main.s.stock'] }, q: '' }), ['N02-U01']);
});

test('facet counts ignore their own selection but honour every other facet', async () => {
  const f = await load();
  const rows = f.catalogRows(useCases(f), ctx());
  const index = f.facetIndex(rows, f.catalogFacetDefs());
  const state = { sel: { domain: ['Customer'], quality: ['Medium'] }, q: '' };
  assert.deepEqual(Object.fromEntries(f.facetCounts(index, rows, state, 'domain')), { Customer: 1, Supply: 1 });
  assert.deepEqual(Object.fromEntries(f.facetCounts(index, rows, state, 'quality')), { High: 1, Medium: 1 });
  assert.deepEqual(Object.fromEntries(f.facetCounts(index, rows, state, 'priority')), { High: 1 });
  assert.deepEqual(index.options.priority, ['Very High', 'High', 'Medium'], 'priority keeps its tier order');
});

test('a facet shows only with two or more options, or when it holds a stale selection', async () => {
  const f = await load();
  const rows = f.catalogRows(useCases(f), ctx());
  const index = f.facetIndex(rows, f.catalogFacetDefs());
  const visible = (state) => f.visibleFacetDefs(index, state).map((d) => d.key);
  assert.equal(visible(f.emptyFacetState()).includes('beneficiary'), false, 'one beneficiary is not a choice');
  assert.equal(visible(f.emptyFacetState()).includes('domain'), true);
  const stale = { sel: { beneficiary: ['Gone team'] }, q: '' };
  assert.equal(visible(stale).includes('beneficiary'), true);
  assert.deepEqual(f.facetOptions(index, stale, 'beneficiary'), ['CRM team', 'Gone team']);
});

test('toggling, setting and clearing facet values never leaves an empty selection behind', async () => {
  const f = await load();
  let state = f.emptyFacetState();
  state = f.toggleFacetValue(state, 'domain', 'Customer');
  state = f.toggleFacetValue(state, 'domain', 'Supply');
  assert.deepEqual(state.sel.domain, ['Customer', 'Supply']);
  state = f.toggleFacetValue(state, 'domain', 'Customer');
  assert.deepEqual(state.sel.domain, ['Supply']);
  state = f.toggleFacetValue(state, 'domain', 'Supply');
  assert.equal('domain' in state.sel, false);
  state = f.setFacetValues(state, 'strategy', ['Grow', 'Grow', ' ']);
  assert.deepEqual(state.sel.strategy, ['Grow']);
  state = f.clearFacet(state, 'strategy');
  assert.deepEqual(state.sel, {});
  assert.equal(f.sameFacetState({ sel: { a: ['2', '1'] }, q: ' X ' }, { sel: { a: ['1', '2'], b: [] }, q: 'x' }), true);
  assert.equal(f.sameFacetState({ sel: { a: ['1'] }, q: '' }, { sel: { a: ['2'] }, q: '' }), false);
});

test('filter chips name their facet and show the last part of a strategy path', async () => {
  const f = await load();
  const rows = f.catalogRows(useCases(f), ctx());
  const index = f.facetIndex(rows, f.catalogFacetDefs());
  const chips = f.activeFilters(index, { sel: { strategy: ['Grow > Keep customers'], domain: ['Supply'] }, q: '' });
  assert.deepEqual(chips.map((c) => [c.label, c.text]), [['Domain', 'Supply'], ['Strategy path', 'Keep customers']]);
});

test('built-in views appear only when the catalog has rows for them', async () => {
  const f = await load();
  const rows = f.catalogRows(useCases(f), ctx());
  const index = f.facetIndex(rows, f.catalogFacetDefs());
  const views = f.builtInViews(index);
  assert.deepEqual(views.map((v) => v.name), ['All use cases', 'Best of best', 'Top priority', 'Has Genie code', 'In Implement']);
  assert.deepEqual(views.find((v) => v.id === 'top').state.sel.priority, ['Very High', 'High']);
  assert.deepEqual(views.find((v) => v.id === 'poc').state.sel.poc, ['PoC ready']);
  assert.ok(views.every((v) => v.builtIn));

  const plain = [withView(f, { id: 'X1', Name: 'Plain', Priority: 'Low' }), withView(f, { id: 'X2', Name: 'Other', Priority: 'Low' })];
  const bare = f.builtInViews(f.facetIndex(f.catalogRows(plain, {}), f.catalogFacetDefs()));
  assert.deepEqual(bare.map((v) => v.name), ['All use cases'], 'no empty view is offered');

  const favKey = f.catalogRow(plain[0], 0, {}).favKey;
  assert.ok(favKey);
  const fav = f.catalogRows(plain, { favorites: { [favKey]: true } });
  const withFav = f.builtInViews(f.facetIndex(fav, f.catalogFacetDefs()));
  assert.deepEqual(withFav.map((v) => v.name), ['All use cases', 'Favorites']);
});

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
};

test('saved views are cleaned, kept per business name and limited in number', async () => {
  const f = await load();
  assert.equal(f.savedViewsKey('  Acme   Retail '), 'inspire_results_views:acme retail');
  assert.equal(f.savedViewsKey(''), 'inspire_results_views:default');

  const clean = f.cleanSavedView({ name: `  ${'v'.repeat(80)} `, state: { sel: { domain: ['A', 'A', ''], bad: 'x', empty: [] }, q: 'q'.repeat(300) },
    sorting: [{ id: 'inspire', desc: 1 }, { id: '' }, null, { id: 'a' }, { id: 'b' }, { id: 'c' }], columns: { id: true, title: 'yes' },
    density: 'huge', mode: 'list' });
  assert.equal(clean.name.length, 60);
  assert.equal(clean.id, `saved:${'v'.repeat(60)}`);
  assert.deepEqual(clean.state.sel, { domain: ['A'] });
  assert.equal(clean.state.q.length, 200);
  assert.deepEqual(clean.sorting, [{ id: 'inspire', desc: true }, { id: 'a', desc: false }, { id: 'b', desc: false }]);
  assert.deepEqual(clean.columns, { id: true });
  assert.equal(clean.density, 'compact');
  assert.equal(clean.mode, 'grid');
  assert.equal(f.cleanSavedView({ name: '   ' }), null);
  assert.equal(f.cleanSavedView(null), null);

  const storage = memoryStorage();
  let got = f.storeSavedView(storage, 'Acme', [], { name: 'Mine', state: { sel: { domain: ['Customer'] }, q: '' } });
  assert.equal(got.error, '');
  assert.deepEqual(f.loadSavedViews(storage, 'acme').map((v) => v.name), ['Mine']);
  assert.deepEqual(f.loadSavedViews(storage, 'Other'), [], 'another business does not see it');
  got = f.storeSavedView(storage, 'Acme', got.views, { name: 'MINE', state: { sel: {}, q: 'x' } });
  assert.deepEqual(got.views.map((v) => v.name), ['MINE'], 'the same name replaces the view');
  assert.equal(f.storeSavedView(storage, 'Acme', got.views, { name: ' ' }).error, 'Give the view a name.');

  const full = Array.from({ length: 30 }, (_, i) => f.cleanSavedView({ name: `View ${i}` }));
  const over = f.storeSavedView(storage, 'Acme', full, { name: 'One more' });
  assert.match(over.error, /up to 30 saved views/);
  assert.equal(over.views, full);
  assert.equal(f.storeSavedView(storage, 'Acme', full, { name: 'View 3', mode: 'cards' }).error, '', 'replacing one at the limit is allowed');

  const removed = f.removeSavedView(storage, 'Acme', got.views, 'saved:mine');
  assert.deepEqual(removed.views, []);
  assert.deepEqual(f.loadSavedViews(storage, 'Acme'), []);
});

test('a saved view that the browser cannot store reports why and keeps the old list', async () => {
  const f = await load();
  const broken = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const views = [f.cleanSavedView({ name: 'Kept' })];
  const got = f.storeSavedView(broken, 'Acme', views, { name: 'New' });
  assert.match(got.error, /did not save the view/);
  assert.equal(got.views, views);
  assert.deepEqual(f.loadSavedViews({ getItem: () => '{not json' }, 'Acme'), []);
  assert.deepEqual(f.loadSavedViews({ getItem: () => '{"a":1}' }, 'Acme'), []);
  assert.deepEqual(f.loadSavedViews(null, 'Acme'), []);
});
