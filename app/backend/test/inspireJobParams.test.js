const test = require('node:test');
const assert = require('node:assert/strict');

const {
  INSPIRE_AGENT_VERSION,
  INSPIRE_NOTEBOOK_WIDGET_KEYS,
  buildDemoInspireDiscoveryParams,
  normalizeGenerationOptionsParams,
  normalizeUseCasesQualityParams,
  sanitizeInspireNotebookJobParams,
} = require('../lib/inspireJobParams');

test('advertises the integrated notebook version', () => {
  assert.equal(INSPIRE_AGENT_VERSION, 'v1.1.3');
});

test('demo discovery parameters only use v1.1.3 generation choices', () => {
  const params = buildDemoInspireDiscoveryParams({
    inspireDatabase: 'main._inspire',
    sessionId: '123456789',
  });

  assert.equal(params['09_generation_options'], 'PDF Catalog');
  assert.equal(params['13_generate_genie_code_for'], '5');
  assert.equal(params['14_session_id'], '123456789');
});

test('removes the retired Genie generation option from legacy requests', () => {
  const params = {
    '09_generation_options': 'PDF Catalog,Genie Code Instructions,Presentation',
  };

  normalizeGenerationOptionsParams(params);
  assert.equal(params['09_generation_options'], 'PDF Catalog,Presentation');
});

test('normalizes legacy quality aliases to v1.1.3 canonical labels', () => {
  for (const [input, expected] of [
    ['Coverage Mode (All)', 'Coverage Mode (All)'],
    ['Balanced', 'Balanced'],
    ['Strict Quality', 'Strict Quality'],
    ['Good Quality', 'Coverage Mode (All)'],
    ['High Quality', 'Balanced'],
    ['Very High Quality', 'Strict Quality'],
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
    legacy_widget: 'must not be forwarded',
  });

  assert.deepEqual(Object.keys(params).sort(), [
    '00_business_name',
    '09_generation_options',
    '13_generate_genie_code_for',
  ]);
  assert.equal(params['09_generation_options'], 'PDF Catalog');
  assert.equal(params['13_generate_genie_code_for'], 'all');
  assert.ok(!INSPIRE_NOTEBOOK_WIDGET_KEYS.includes('legacy_widget'));
});
