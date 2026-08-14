const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  INSPIRE_AGENT_VERSION,
  INSPIRE_NOTEBOOK_WIDGET_KEYS,
} = require('../lib/inspireJobParams');

const appRoot = path.resolve(__dirname, '..', '..');
const notebookPath = path.join(appRoot, 'dbx_inspire_ai_agent.ipynb');
const notebookBytes = fs.readFileSync(notebookPath);
const notebook = JSON.parse(notebookBytes.toString('utf8'));
const source = notebook.cells.map((cell) => (cell.source || []).join('')).join('\n');

test('bundled notebook is a valid v1.1.3 Jupyter notebook', () => {
  assert.equal(notebook.nbformat, 4);
  assert.match(source, new RegExp(`__AGENT_VERSION__\\s*=\\s*["']${INSPIRE_AGENT_VERSION}["']`));
  assert.match(source, /\[AGENT_VERSION FIRED\]/);
  assert.match(source, /def _auto_detect_llm_endpoints\(/);
  assert.match(source, /def _ensure_inspire_database_ready\(/);
  assert.match(source, /class SessionMutationWriter:/);
  assert.equal(notebook.cells.length, 3);
});

test('backend widget allowlist matches the notebook contract', () => {
  const match = source.match(/_NOTEBOOK_WIDGET_NAMES\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(match, '_NOTEBOOK_WIDGET_NAMES must exist');
  const notebookKeys = [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
  assert.deepEqual(notebookKeys, INSPIRE_NOTEBOOK_WIDGET_KEYS);
});

test('v1.1.3 generation widget only offers PDF and Presentation', () => {
  const match = source.match(/generation_options\s*=\s*\[([\s\S]*?)\]\s*\n\s*dbutils\.widgets\.multiselect/);
  assert.ok(match, 'generation_options list must exist');
  const choices = [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
  assert.deepEqual(choices, ['PDF Catalog', 'Presentation']);
  assert.doesNotMatch(match[1], /Genie Code Instructions/);
});

test('embedded backend fallback is byte-identical to the physical notebook', () => {
  const embedded = Buffer.from(require('../notebook_bundle'), 'base64');
  assert.deepEqual(embedded, notebookBytes);
});

test('launch UI does not expose the retired generation option', () => {
  const launchPage = fs.readFileSync(
    path.join(appRoot, 'frontend', 'src', 'pages', 'LaunchPage.jsx'),
    'utf8',
  );
  assert.doesNotMatch(launchPage, /key:\s*['"]Genie Code Instructions['"]/);
  assert.match(launchPage, /'09_generation_options':\s*'PDF Catalog'/);
  assert.match(
    launchPage,
    /QUALITY_OPTIONS\s*=\s*\['Coverage Mode \(All\)', 'Balanced', 'Strict Quality'\]/,
  );
  assert.match(launchPage, /'05_use_cases_quality':\s*'Balanced'/);
});

test('deployment and API surfaces advertise v1.1.3 consistently', () => {
  const server = fs.readFileSync(path.join(appRoot, 'backend', 'server.js'), 'utf8');
  const bundleConfig = fs.readFileSync(path.join(appRoot, 'databricks.yml'), 'utf8');

  assert.match(server, /agentVersion:\s*INSPIRE_AGENT_VERSION/);
  assert.match(server, /inspire_version:\s*INSPIRE_AGENT_VERSION/);
  assert.match(bundleConfig, /inspire_version:\s*"v1\.1\.3"/);
});

test('all app launch defaults use the installer notebook destination', () => {
  const canonicalPath = '/Shared/inspire-ai/dbx_inspire_ai_agent';
  const installer = fs.readFileSync(path.join(appRoot, '..', 'installer_workspace.py'), 'utf8');
  assert.match(installer, /notebook_dest = f"\/Shared\/\{app_name\}\/dbx_inspire_ai_agent"/);
  const files = [
    'backend/server.js',
    'backend/lib/demoDataPipeline.js',
    'databricks.yml',
    'dbx_inspire_after_demo.py',
    'frontend/src/App.jsx',
    'frontend/src/pages/ConfigPage.jsx',
    'frontend/src/pages/GenerateDataPage.jsx',
  ];

  for (const relativePath of files) {
    const contents = fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
    assert.ok(contents.includes(canonicalPath), `${relativePath} must use ${canonicalPath}`);
  }
});

test('OpenAPI documents v1.1.3 operation and artifact values', () => {
  const openapi = fs.readFileSync(path.join(appRoot, 'backend', 'openapi.yaml'), 'utf8');
  assert.match(openapi, /enum: \[Discover Use Cases, Generate Use Cases\]/);
  assert.doesNotMatch(openapi, /operation_mode:\s*full/);
  assert.doesNotMatch(openapi, /generate_choices:\s*genie,pdf/);
});
