# Inspire AI — Application bundle

Full-stack Databricks App (Node backend, React frontend, Inspire agent notebooks).

Customers do **not** need this README — they run **`../installer_workspace.py`** at the repo root.

## v1.1.3 — exec notes

- **Agent:** `dbx_inspire_ai_agent` `__AGENT_VERSION__ = v1.1.3` (bundled in `backend/notebook_bundle.js`)
- **Contract:** Genie out of `09_generation_options`; use `13_generate_genie_code_for`. Quality labels canonicalized in `inspireJobParams.js`.
- **Defaults:** notebook `/Shared/inspire-ai/dbx_inspire_ai_agent`; job tags include `inspire_version=v1.1.3`
- **Tests:** `npm test` → `backend/test/inspireJobParams.test.js`, `notebookContract.test.js`
- **Package:** `npm run bundle:agent-notebook` then `npm run package:workspace`

## Local development

```bash
cd app
cp .env.example .env   # fill in DATABRICKS_HOST, token, warehouse, etc.
npm run install:all
npm run dev            # backend :8080 + Vite (see terminal for URL)
```

## Build workspace zip (for customers without Repos)

```bash
cd app
npm run package:workspace
# → app/dist/InspireAI-workspace.zip
```

Upload that zip to the customer's workspace (see [deployment.md](deployment.md)) or ship it with `installer_workspace.py`.

## Full deploy from laptop (optional)

```bash
cd app
npm run deploy
```

Imports the zip + installer notebook and can submit a one-time installer job via Databricks CLI.

See [deployment.md](deployment.md) for details.
