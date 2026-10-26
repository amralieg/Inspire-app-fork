const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'workspaceLinks.js')).href;
const load = () => import(libUrl);

test('a notebook link opens the workspace path on the host, adding /Workspace and https only where they are missing', async () => {
  const { workspaceNotebookUrl } = await load();
  assert.equal(workspaceNotebookUrl('https://w.example.com/', '/Users/a@x/inspire/n01'), 'https://w.example.com/#workspace/Workspace/Users/a@x/inspire/n01');
  assert.equal(workspaceNotebookUrl('w.example.com', '/Workspace/Shared/n01'), 'https://w.example.com/#workspace/Workspace/Shared/n01');
  assert.equal(workspaceNotebookUrl('http://w.example.com', '/Shared/../demos/./n01'), 'https://w.example.com/#workspace/Workspace/demos/n01');
  assert.equal(workspaceNotebookUrl('', '/Shared/n01'), '');
  assert.equal(workspaceNotebookUrl('https://w.example.com', ''), '');
  assert.equal(workspaceNotebookUrl('https://w.example.com', null), '');
});

test('volume paths are kept as they are and blank paths stay blank', async () => {
  const { normalizeDatabricksFsPath, workspaceWebUiHashPath } = await load();
  assert.equal(workspaceWebUiHashPath('/Volumes/c/s/v/x/'), '/Volumes/c/s/v/x');
  assert.equal(normalizeDatabricksFsPath('  //Shared//a/../b  '), '/Shared/b');
  assert.equal(normalizeDatabricksFsPath('relative/path'), 'relative/path');
  assert.equal(normalizeDatabricksFsPath(42), '');
  assert.equal(workspaceWebUiHashPath(''), '');
});
