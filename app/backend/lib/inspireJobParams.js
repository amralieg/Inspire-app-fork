const INSPIRE_AGENT_VERSION = 'v1.2.0';

/** Notebook widget keys for dbx_inspire_ai_agent job base_parameters (v1.2.0). */
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

const USE_CASES_QUALITY_VALID = ['Good', 'High', 'Ultra High'];
const USE_CASES_QUALITY_DEFAULT = 'Good';

/** Legacy widget labels → v1.2.0 canonical modes (matches notebook USE_CASES_QUALITY_ALIASES). */
const USE_CASES_QUALITY_ALIASES = {
  'Coverage Mode (All)': 'Good',
  Balanced: 'Good',
  'Good Quality': 'Good',
  'High Quality': 'Good',
  'Strict Quality': 'High',
  'Very High Quality': 'High',
  Good: 'Good',
  High: 'High',
  'Ultra High': 'Ultra High',
};

function normalizeUseCasesQualityParams(params) {
  const uq = String(params['05_use_cases_quality'] || '').trim();
  if (!uq) {
    params['05_use_cases_quality'] = USE_CASES_QUALITY_DEFAULT;
    return params;
  }
  const folded = uq.toLowerCase();
  for (const mode of USE_CASES_QUALITY_VALID) {
    if (mode.toLowerCase() === folded) {
      params['05_use_cases_quality'] = mode;
      return params;
    }
  }
  for (const [legacy, mode] of Object.entries(USE_CASES_QUALITY_ALIASES)) {
    if (legacy.toLowerCase() === folded) {
      params['05_use_cases_quality'] = mode;
      return params;
    }
  }
  params['05_use_cases_quality'] = USE_CASES_QUALITY_DEFAULT;
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
  normalizeUseCasesQualityParams(params);
  const out = {};
  for (const k of INSPIRE_NOTEBOOK_WIDGET_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
    const v = params[k];
    if (v == null) continue;
    out[k] = String(v);
  }
  if (!out['13_generate_genie_code_for']) out['13_generate_genie_code_for'] = '5';
  delete out.discover_auto_genie_top_n;
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
    '05_use_cases_quality': USE_CASES_QUALITY_DEFAULT,
    '06_business_domains': '',
    '07_business_priorities': 'Increase Revenue',
    '08_generation_instructions': `{{tasks.${tk}.values.user_description}}`,
    '09_generation_options': 'PDF Catalog',
    '11_generation_path': './../demos/',
    '12_documents_languages': 'English',
    '13_generate_genie_code_for': '5',
    '14_session_id': sessionId,
  };
  return sanitizeInspireNotebookJobParams(raw);
}

function parseMaybeJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** True when a use case shipped as a valid below-bar fallback (not an empty result). */
function belowBarLabelFromUseCase(uc) {
  if (!uc || typeof uc !== 'object') return '';
  const flags = parseMaybeJson(uc.selection_flags) || parseMaybeJson(uc.selectionFlags);
  if (flags && typeof flags === 'object') {
    for (const key of ['elite_fallback_pick', 'elite_fallback_near_miss', 'elite_coverage_pick', 'label', 'reason']) {
      const v = flags[key];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    for (const v of Object.values(flags)) {
      if (typeof v === 'string' && /below the /i.test(v)) return v.trim();
    }
  }
  const reason = uc.selection_drop_reason || uc.selectionDropReason;
  if (reason && /below the /i.test(String(reason))) return String(reason).trim();
  return '';
}

module.exports = {
  INSPIRE_AGENT_VERSION,
  INSPIRE_NOTEBOOK_WIDGET_KEYS,
  USE_CASES_QUALITY_VALID,
  USE_CASES_QUALITY_DEFAULT,
  USE_CASES_QUALITY_ALIASES,
  buildDemoInspireDiscoveryParams,
  sanitizeInspireNotebookJobParams,
  normalizeGenerationOptionsParams,
  normalizeUseCasesQualityParams,
  parseMaybeJson,
  belowBarLabelFromUseCase,
};
