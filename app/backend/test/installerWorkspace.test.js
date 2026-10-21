const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const INSTALLER = path.resolve(__dirname, '..', '..', '..', 'installer_workspace.py');

const PROBE = String.raw`
import ast, sys
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
wanted = {"_is_own_service_principal", "_app_service_principal_ids", "_deletable_service_principals"}
module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted], type_ignores=[])
ns = {}
exec(compile(module, path, "exec"), ns)
pages = {
    "/api/2.0/apps": {"apps": [{"name": "inspire-ai", "service_principal_client_id": "MEHDI"},
                               {"name": "inspire-ai-v130", "service_principal_client_id": "LIVE"}],
                      "next_page_token": "p2"},
    "/api/2.0/apps?page_token=p2": {"apps": [{"name": "other", "service_principal_client_id": "OTHER"}, {"name": "no-sp"}]},
}
in_use = ns["_app_service_principal_ids"](lambda p: pages[p])
assert in_use == {"MEHDI", "LIVE", "OTHER"}, in_use
sps = [{"displayName": "app-p50o0f inspire-ai-v130", "applicationId": "LIVE", "id": "1"},
       {"displayName": "app-p50o0f inspire-ai-v130", "applicationId": "STALE", "id": "2"},
       {"displayName": "app-p50o0f inspire-ai", "applicationId": "MEHDI", "id": "3"},
       {"displayName": "inspire-ai-v130-sp", "applicationId": "OLD", "id": "4"},
       {"displayName": "inspire-ai-cicd", "applicationId": "CICD", "id": "5"}]
deletable = ns["_deletable_service_principals"](sps, "inspire-ai-v130", "inspire-ai-v130-sp", in_use)
assert [sp["id"] for sp in deletable] == ["2", "4"], deletable
assert ns["_deletable_service_principals"](sps, "inspire-ai-v130", "inspire-ai-v130-sp", None) == []
print("ok")
`;

test('the installer never deletes a service principal an existing app still uses', (t) => {
  if (spawnSync('python3', ['--version']).status !== 0) {
    t.skip('python3 is not installed');
    return;
  }
  const run = spawnSync('python3', ['-c', PROBE, INSTALLER], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), 'ok');
});
