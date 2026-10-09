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
} = require('../lib/inspireJobParams');

test('advertises the integrated notebook version', () => {
  assert.equal(INSPIRE_AGENT_VERSION, 'v1.2.0');
});

test('demo discovery parameters only use v1.2.0 generation choices', () => {
  const params = buildDemoInspireDiscoveryParams({
    inspireDatabase: 'main._inspire',
    sessionId: '123456789',
  });

  assert.equal(params['09_generation_options'], 'PDF Catalog');
  assert.equal(params['13_generate_genie_code_for'], '5');
  assert.equal(params['14_session_id'], '123456789');
  assert.equal(params['05_use_cases_quality'], 'Good');
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
    '05_use_cases_quality',
    '09_generation_options',
    '13_generate_genie_code_for',
  ]);
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
