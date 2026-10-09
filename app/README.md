# Inspire AI — Application bundle

Full-stack Databricks App (Node backend, React frontend, Inspire agent notebooks).

Customers do **not** need this README — they run **`../installer_workspace.py`** at the repo root.

## v1.2.0 — exec notes

- **Agent:** `dbx_inspire_ai_agent` `__AGENT_VERSION__ = v1.2.0`
- **Quality:** widget `05_use_cases_quality` = Good / High / Ultra High (legacy labels mapped in `inspireJobParams.js`)
- **Genie:** `13_generate_genie_code_for` only; persistent per-notebook jobs; pass `dbx_inspire_ai_child_run=1` if you trigger those jobs yourself
- **Tracking:** `__inspire_usecases` quality/elite/selection_flags columns are nullable; below-bar flags are valid results
- **PDF:** WeasyPrint >= 70.0
- **Tests:** `npm test`

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
