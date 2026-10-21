const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'strategyContext.js')).href;
const load = () => import(libUrl);

const PLAN_EXAMPLE = {
  schema_version: 1,
  levels: ['Strategic Pillar', 'Business Objective'],
  strategy: [
    {
      name: 'Customer',
      children: [
        {
          name: 'Grow repeat purchases',
          kpis: [{ name: 'Repeat purchase rate', definition: 'Share of customers with 2+ orders in 90 days', unit: '%', direction: 'increase' }],
          key_results: [{ statement: 'Raise repeat purchase rate from 18% to 24%', kpi: 'Repeat purchase rate' }],
        },
      ],
    },
    { name: 'Operations', children: ['Cut stockouts', 'Lower delivery cost'] },
  ],
  priorities: ['Grow revenue', 'Protect margin'],
  sponsors: [{ role: 'Chief Customer Officer', reports_to: 'Chief Executive Officer', owns: ['Customer'] }],
  labels: { priority: 'Business Priority', kpi: 'KPI' },
};

test('an empty editor sends an empty string', async () => {
  const lib = await load();
  assert.equal(lib.serializeStrategy(lib.emptyStrategy()), '');
  assert.equal(lib.parseStrategicContext('').mode, 'empty');
  assert.deepEqual(lib.validateStrategicContextText(''), []);
});

test('the plan example round-trips and validates', async () => {
  const lib = await load();
  const parsed = lib.parseStrategicContext(JSON.stringify(PLAN_EXAMPLE));
  assert.equal(parsed.mode, 'tree');
  assert.deepEqual(lib.validateStrategy(parsed.model), []);
  const out = JSON.parse(lib.serializeStrategy(parsed.model));
  assert.equal(out.schema_version, 1);
  assert.deepEqual(out.levels, PLAN_EXAMPLE.levels);
  assert.deepEqual(out.strategy[1].children.map((c) => c.name), ['Cut stockouts', 'Lower delivery cost']);
  assert.deepEqual(out.strategy[0].children[0].key_results, [{ statement: 'Raise repeat purchase rate from 18% to 24%', kpi: 'Repeat purchase rate' }]);
  assert.deepEqual(out.sponsors, [{ role: 'Chief Customer Officer', reports_to: 'Chief Executive Officer', owns: ['Customer'] }]);
  assert.deepEqual(out.labels, { priority: 'Business Priority', kpi: 'KPI' });
  assert.deepEqual(lib.parseStrategicContext(lib.serializeStrategy(parsed.model)).model, parsed.model, 'a second round trip is stable');
});

test('a tree stored by the agent reads back with its KPI links and without ids', async () => {
  const lib = await load();
  const stored = {
    schema_version: 1, source: 'customer', levels: ['Pillar'],
    strategy: [{ id: 'S1', name: 'Customer', level: 'Pillar', description: '',
      kpis: [{ id: 'K1', name: 'Repeat rate', definition: '', unit: '%', direction: 'increase' }],
      key_results: [{ id: 'R1', statement: 'Lift it', kpi_id: 'K1', baseline: '', target: '', due: '' }], children: [] }],
    priorities: ['Grow revenue'], sponsors: [{ id: 'SP1', role: 'CCO', name: '', reports_to: '', owns: [] }], labels: {},
  };
  const out = JSON.parse(lib.serializeStrategy(lib.parseStrategicContext(JSON.stringify(stored)).model));
  assert.deepEqual(out.strategy[0].key_results, [{ statement: 'Lift it', kpi: 'Repeat rate' }]);
  assert.equal(JSON.stringify(out).includes('"id"'), false);
  assert.equal(out.source, undefined);
});

test('a path is kept as a path', async () => {
  const lib = await load();
  const parsed = lib.parseStrategicContext('  /Volumes/main/s/v/strategy.json ');
  assert.equal(parsed.mode, 'path');
  assert.equal(parsed.path, '/Volumes/main/s/v/strategy.json');
});

test('every rule the agent stops the run for is caught here', async () => {
  const lib = await load();
  const problems = (tree) => lib.validateStrategy(lib.parseStrategicContext(JSON.stringify(tree)).model);
  assert.match(problems({ strategy: ['A', 'a'] }).join(' '), /appears twice/);
  assert.match(problems({ strategy: [{ name: 'A', children: ['B'] }] }).join(' '), /Name the levels/);
  assert.match(problems({ levels: ['One'], strategy: [{ name: 'A', children: ['B'] }] }).join(' '), /only 1 level names/);
  const deep = { name: 'L1', children: [{ name: 'L2', children: [{ name: 'L3', children: [{ name: 'L4', children: ['L5'] }] }] }] };
  assert.match(problems({ levels: ['1', '2', '3', '4'], strategy: [deep] }).join(' '), /5 levels deep; the most is 4/);
  assert.match(problems({ strategy: [{ name: 'A', kpis: [{ name: 'K', direction: 'up' }] }] }).join(' '), /direction must be one of/);
  assert.match(problems({ strategy: [{ name: 'A', kpis: [{ name: ' ' }] }] }).join(' '), /empty name/);
  assert.match(problems({ strategy: [{ name: 'A', key_results: [{ statement: '' }] }] }).join(' '), /empty name/);
  assert.match(problems({ strategy: [''] }).join(' '), /empty name/);
  assert.match(problems({ strategy: ['x'.repeat(301)] }).join(' '), /longer than 300/);
  assert.match(problems({ strategy: Array.from({ length: 201 }, (_, i) => `E${i}`) }).join(' '), /more than 200 entries/);
  assert.match(problems({ levels: ['Same', 'same'], strategy: ['A'] }).join(' '), /unique/);
  assert.match(problems({ sponsors: [{ role: '', name: 'Ann' }] }).join(' '), /no role/);
  assert.deepEqual(problems({ strategy: ['A', 'B'] }), [], 'a flat list needs no level names');
  assert.match(lib.validateStrategicContextText('{not json').join(' '), /Invalid JSON/);
  assert.match(lib.validateStrategicContextText('[1, 2]').join(' '), /JSON object/);
});

test('the size limit is the agent limit in bytes', async () => {
  const lib = await load();
  const big = { strategy: Array.from({ length: 150 }, (_, i) => ({ name: `E${i}`, description: 'd'.repeat(6200) })) };
  assert.match(lib.validateStrategy(lib.parseStrategicContext(JSON.stringify(big)).model).join(' '), /limit is 900000/);
});
