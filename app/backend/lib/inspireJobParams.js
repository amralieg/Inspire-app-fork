const INSPIRE_AGENT_VERSION = 'v1.1.3';

/** Notebook widget keys for dbx_inspire_ai_agent job base_parameters (v1.1.3). */
const INSPIRE_NOTEBOOK_WIDGET_KEYS = [
  '15_operation',
  '00_business_name',
  '01_uc_metadata',
  '02_inspire_database',
  '04_table_election',
  '05_use_cases_quality',
  '06_business_domains',
  '07_business_priorities',
  '08_generation_instructions',
  '09_generation_options',
  '11_generation_path',
  '12_documents_languages',
  '13_generate_genie_code_for',
  '14_session_id',
];

function normalizeUseCasesQualityParams(params) {
  const uq = String(params['05_use_cases_quality'] || '').trim();
  const map = {
    'Good Quality': 'Coverage Mode (All)',
    'High Quality': 'Balanced',
    'Very High Quality': 'Strict Quality',
    'Coverage Mode (All)': 'Coverage Mode (All)',
    Balanced: 'Balanced',
    'Strict Quality': 'Strict Quality',
  };
  if (map[uq]) params['05_use_cases_quality'] = map[uq];
  if (!params['05_use_cases_quality']) params['05_use_cases_quality'] = 'Balanced';
  return params;
}

function normalizeGenerationOptionsParams(params) {
  const allowed = new Set(['PDF Catalog', 'Presentation']);
  const normalized = String(params['09_generation_options'] || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => allowed.has(value));
  params['09_generation_options'] = [...new Set(normalized)].join(',') || 'PDF Catalog';
  return params;
}

function sanitizeInspireNotebookJobParams(params) {
  normalizeGenerationOptionsParams(params);
  const out = {};
  for (const k of INSPIRE_NOTEBOOK_WIDGET_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
    const v = params[k];
    if (v == null) continue;
    out[k] = String(v);
  }
  if (!out['13_generate_genie_code_for']) out['13_generate_genie_code_for'] = '5';
  return out;
}

/** Static + task-value parameters for demo pipeline task 2 (Inspire discovery). */
function buildDemoInspireDiscoveryParams({ inspireDatabase, sessionId, generateTaskKey = 'generate_demo_data' }) {
  const tk = generateTaskKey;
  const raw = {
    '15_operation': 'Discover Use Cases',
    '00_business_name': `{{tasks.${tk}.values.display_name}}`,
    '01_uc_metadata': `{{tasks.${tk}.values.uc_metadata}}`,
    '02_inspire_database': inspireDatabase,
    '04_table_election': 'All Tables',
    '05_use_cases_quality': 'Balanced',
    '06_business_domains': '',
    '07_business_priorities': 'Increase Revenue',
    '08_generation_instructions': `{{tasks.${tk}.values.user_description}}`,
    '09_generation_options': 'PDF Catalog',
    '11_generation_path': './../demos/',
    '12_documents_languages': 'English',
    '13_generate_genie_code_for': '5',
    '14_session_id': sessionId,
  };
  normalizeUseCasesQualityParams(raw);
  return sanitizeInspireNotebookJobParams(raw);
}

module.exports = {
  INSPIRE_AGENT_VERSION,
  INSPIRE_NOTEBOOK_WIDGET_KEYS,
  buildDemoInspireDiscoveryParams,
  sanitizeInspireNotebookJobParams,
  normalizeGenerationOptionsParams,
  normalizeUseCasesQualityParams,
};
