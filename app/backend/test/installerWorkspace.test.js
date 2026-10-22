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

const GRANTS_PROBE = String.raw`
import ast, sys, types
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "step_grant_permissions"], type_ignores=[])
class StatementState:
    SUCCEEDED = "SUCCEEDED"
executed = []
class Statements:
    def execute_statement(self, warehouse_id, statement, wait_timeout):
        executed.append(statement)
        return types.SimpleNamespace(status=types.SimpleNamespace(state=StatementState.SUCCEEDED, error=None))
class Catalogs:
    def list(self):
        return [types.SimpleNamespace(name="sales"), types.SimpleNamespace(name="samples")]
ns = {"StatementState": StatementState}
exec(compile(module, path, "exec"), ns)
ctx = {"NEW_SP_APP_ID": "SP", "WAREHOUSE_ID": "wh", "CATALOG": "main", "SCHEMA": "_inspire", "available_catalogs": ["main"],
       "w": types.SimpleNamespace(statement_execution=Statements(), catalogs=Catalogs()),
       "api": lambda method, url, body=None: types.SimpleNamespace(status_code=200, text="")}
ns["step_grant_permissions"](ctx)
volume = sorted(s for s in executed if "VOLUME" in s)
assert volume == sorted(f"GRANT {p} VOLUME ON SCHEMA \x60main\x60.\x60_inspire\x60 TO \x60SP\x60" for p in ("CREATE", "READ", "WRITE")), volume
assert "GRANT MODIFY ON SCHEMA \x60main\x60.\x60_inspire\x60 TO \x60SP\x60" in executed, executed
assert "GRANT BROWSE ON CATALOG \x60sales\x60 TO \x60SP\x60" in executed, executed
assert not [s for s in executed if "samples" in s], executed
print("ok")
`;

const REMOVE_PROBE = String.raw`
import ast, sys, types
path = sys.argv[1]
tree = ast.parse(open(path, encoding="utf-8").read())
module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_remove_workspace_folder"], type_ignores=[])
clock = {"now": 0.0, "polls": 0}
def make_ns(visible_polls):
    def exists(p):
        clock["polls"] += 1
        return clock["polls"] <= visible_polls
    def sleep(seconds):
        clock["now"] += seconds
    return {"os": types.SimpleNamespace(path=types.SimpleNamespace(exists=exists)),
            "shutil": types.SimpleNamespace(rmtree=lambda p, ignore_errors=False: None),
            "time": types.SimpleNamespace(time=lambda: clock["now"], sleep=sleep), "print": lambda *a, **k: None}
deleted = []
w = types.SimpleNamespace(workspace=types.SimpleNamespace(delete=lambda p, recursive=False: deleted.append((p, recursive))))
ns = make_ns(3)
exec(compile(module, path, "exec"), ns)
ns["_remove_workspace_folder"](w, "/Workspace/Users/me/InspireAI", timeout_s=120)
assert deleted == [("/Workspace/Users/me/InspireAI", True)], deleted
assert clock["polls"] == 4 and clock["now"] > 0, clock
clock.update(now=0.0, polls=0)
ns = make_ns(10 ** 6)
exec(compile(module, path, "exec"), ns)
try:
    ns["_remove_workspace_folder"](w, "/Workspace/Users/me/InspireAI", timeout_s=30)
except RuntimeError as exc:
    assert "still exists" in str(exc), exc
else:
    raise AssertionError("a folder that never disappears must stop the install with a clear error")
print("ok")
`;

test('a reinstall waits until the deleted bundle folder is gone before unpacking the new one', (t) => {
  if (spawnSync('python3', ['--version']).status !== 0) {
    t.skip('python3 is not installed');
    return;
  }
  const run = spawnSync('python3', ['-c', REMOVE_PROBE, INSTALLER], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(run.stdout.trim().split('\n').pop(), 'ok');
});

test('the installer lets the app service principal create, read and write volumes in the Inspire schema only', (t) => {
  if (spawnSync('python3', ['--version']).status !== 0) {
    t.skip('python3 is not installed');
    return;
  }
  const run = spawnSync('python3', ['-c', GRANTS_PROBE, INSTALLER], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(run.stdout.trim().split('\n').pop(), 'ok');
});
