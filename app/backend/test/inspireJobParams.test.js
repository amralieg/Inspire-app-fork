const test = require('node:test');
const assert = require('node:assert/strict');

const {
  INSPIRE_AGENT_VERSION,
  INSPIRE_NOTEBOOK_WIDGET_KEYS,
  buildDemoInspireDiscoveryParams,
  normalizeGenerationOptionsParams,
  normalizeUseCasesQualityParams,
  sanitizeInspireNotebookJobParams,
  belowBarLabelFromUseCase,
  normalizeDiscoveryTypeParams,
  validateStrategicContextParams,
  normalizeV130UseCaseFields,
  STRATEGIC_CONTEXT_MAX_BYTES,
} = require('../lib/inspireJobParams');

test('advertises the integrated notebook version', () => {
  assert.equal(INSPIRE_AGENT_VERSION, 'v1.3.0');
});

test('demo discovery parameters use v1.2.0 generation choices and the v1.3.0 discovery defaults', () => {
  const params = buildDemoInspireDiscoveryParams({
    inspireDatabase: 'main._inspire',
    sessionId: '123456789',
  });

  assert.equal(params['09_generation_options'], 'PDF Catalog');
  assert.equal(params['13_generate_genie_code_for'], '5');
  assert.equal(params['14_session_id'], '123456789');
  assert.equal(params['05_use_cases_quality'], 'Good');
  assert.equal(params['03_discovery_type'], 'Deep');
  assert.equal(params['10_strategic_context'], '');
});

test('removes the retired Genie generation option from legacy requests', () => {
  const params = {
    '09_generation_options': 'PDF Catalog,Genie Code Instructions,Presentation',
  };

  normalizeGenerationOptionsParams(params);
  assert.equal(params['09_generation_options'], 'PDF Catalog,Presentation');
});

test('normalizes quality aliases to v1.2.0 canonical modes', () => {
  for (const [input, expected] of [
    ['Good', 'Good'],
    ['High', 'High'],
    ['Ultra High', 'Ultra High'],
    ['Coverage Mode (All)', 'Good'],
    ['Balanced', 'Good'],
    ['Good Quality', 'Good'],
    ['High Quality', 'Good'],
    ['Strict Quality', 'High'],
    ['Very High Quality', 'High'],
    ['', 'Good'],
  ]) {
    const params = { '05_use_cases_quality': input };
    normalizeUseCasesQualityParams(params);
    assert.equal(params['05_use_cases_quality'], expected);
  }
});

test('sanitizer forwards only notebook widget keys and valid generation choices', () => {
  const params = sanitizeInspireNotebookJobParams({
    '00_business_name': 'Retail',
    '09_generation_options': 'Genie Code Instructions',
    '13_generate_genie_code_for': 'all',
    discover_auto_genie_top_n: '7',
    legacy_widget: 'must not be forwarded',
  });

  assert.deepEqual(Object.keys(params).sort(), [
    '00_business_name',
    '03_discovery_type',
    '05_use_cases_quality',
    '09_generation_options',
    '10_strategic_context',
    '13_generate_genie_code_for',
  ]);
  assert.equal(params['03_discovery_type'], 'Deep');
  assert.equal(params['10_strategic_context'], '');
  assert.equal(params['09_generation_options'], 'PDF Catalog');
  assert.equal(params['13_generate_genie_code_for'], 'all');
  assert.equal(params['05_use_cases_quality'], 'Good');
  assert.ok(!INSPIRE_NOTEBOOK_WIDGET_KEYS.includes('legacy_widget'));
  assert.equal(params.discover_auto_genie_top_n, undefined);
});

test('below-bar fallback flags are treated as a valid result label', () => {
  assert.match(
    belowBarLabelFromUseCase({
      selection_flags: '{"elite_fallback_pick":"Below the High bar"}',
    }),
    /Below the High bar/,
  );
  assert.equal(belowBarLabelFromUseCase({ Name: 'ok' }), '');
});

test('widget keys follow the notebook order with the two v1.3.0 keys in their slots', () => {
  assert.equal(INSPIRE_NOTEBOOK_WIDGET_KEYS.indexOf('03_discovery_type'), INSPIRE_NOTEBOOK_WIDGET_KEYS.indexOf('02_inspire_database') + 1);
  assert.equal(INSPIRE_NOTEBOOK_WIDGET_KEYS.indexOf('10_strategic_context'), INSPIRE_NOTEBOOK_WIDGET_KEYS.indexOf('09_generation_options') + 1);
  assert.equal(INSPIRE_NOTEBOOK_WIDGET_KEYS.length, 16);
});

test('discovery type keeps Deep or Standard, defaults to Deep and refuses anything else', () => {
  for (const [input, expected] of [['Deep', 'Deep'], ['standard', 'Standard'], [' STANDARD ', 'Standard'], ['', 'Deep'], [undefined, 'Deep']]) {
    const params = { '03_discovery_type': input };
    normalizeDiscoveryTypeParams(params);
    assert.equal(params['03_discovery_type'], expected, String(input));
  }
  for (const bad of ['Standrad', 'Deeper', 'off']) {
    assert.throws(() => normalizeDiscoveryTypeParams({ '03_discovery_type': bad }),
      (err) => err.statusCode === 400 && /not supported/.test(err.message), bad);
  }
  assert.throws(() => sanitizeInspireNotebookJobParams({ '03_discovery_type': 'Standrad' }), (err) => err.statusCode === 400,
    'a mistyped Standard never reaches the notebook as Deep');
});

test('strategic context is trimmed and capped at the agent limit in bytes', () => {
  const params = { '10_strategic_context': '  {"strategy": []}  ' };
  validateStrategicContextParams(params);
  assert.equal(params['10_strategic_context'], '{"strategy": []}');
  validateStrategicContextParams({ '10_strategic_context': 'a'.repeat(STRATEGIC_CONTEXT_MAX_BYTES) });
  assert.throws(() => validateStrategicContextParams({ '10_strategic_context': 'a'.repeat(STRATEGIC_CONTEXT_MAX_BYTES + 1) }),
    (err) => err.statusCode === 400 && /Workspace or Volumes file/.test(err.message));
  const arabic = 'ا'.repeat(Math.floor(STRATEGIC_CONTEXT_MAX_BYTES / 2) + 1);
  assert.throws(() => validateStrategicContextParams({ '10_strategic_context': arabic }), (err) => err.statusCode === 400,
    'multibyte text is measured in bytes');
});

test('v1.3.0 use case fields are parsed and stay NULL-safe on older rows', () => {
  const row = normalizeV130UseCaseFields({
    strategy_alignment: '[{"id":"S1.1","path":"Customer > Grow","evidence":"`orders`"}]',
    kpis: '[{"name":"Repeat rate","baseline":{"value":23.4}}]',
    expected_key_results: 'not json',
    measures_of_success: 'One\n\nTwo ',
    financial_benefits: 'Margin',
    foundation_ids: 'F1, F2,',
    strategy_path: 'Customer > Grow',
    use_case_key: 'forecast demand|main.s.orders',
  });
  assert.equal(row.strategy_alignment[0].id, 'S1.1');
  assert.equal(row.kpis[0].baseline.value, 23.4);
  assert.equal(row.expected_key_results, null, 'invalid JSON becomes null, never a crash');
  assert.deepEqual(row.measures_of_success, ['One', 'Two']);
  assert.deepEqual(row.financial_benefits, ['Margin']);
  assert.deepEqual(row.non_financial_benefits, []);
  assert.deepEqual(row.foundation_ids, ['F1', 'F2']);
  const legacy = normalizeV130UseCaseFields({ id: 'N01-U01', use_case: 'Old row' });
  assert.equal(legacy.strategy_alignment, null);
  assert.equal(legacy.kpis, null);
  assert.equal(legacy.data_evidence, null);
  assert.deepEqual(legacy.measures_of_success, []);
  assert.deepEqual(legacy.foundation_ids, []);
  assert.equal(legacy.strategy_path, null);
  assert.equal(legacy.use_case_key, null);
  assert.equal(legacy.use_case, 'Old row');
});
