# Inspire AI — Workspace Installer

This repository is structured for **customer deployment**: only the installer notebook lives at the root; the full Databricks App lives in **`app/`**.

## Agent v1.1.3 (current)

| | |
|--|--|
| **Ship** | Agent notebook + App aligned to **v1.1.3** |
| **Path** | `/Shared/inspire-ai/dbx_inspire_ai_agent` |
| **Artifacts** | `09_generation_options` → **PDF Catalog** / **Presentation** only |
| **Genie** | Scope via `13_generate_genie_code_for` (not generation options) |
| **Quality** | Canonical: Coverage Mode (All) / Balanced / Strict Quality |
| **Jobs** | Always pass non-empty `14_session_id` (skips nested launcher gate) |
| **Runtime** | Auto-detects LLM serving endpoints; adaptive timeouts |
| **Validate** | `cd app && npm test` |

## Customer deployment (no npm)

1. Import into your Databricks workspace:
   - **`installer_workspace.py`** (this file — Python notebook)
   - The **`app/`** folder **next to it** (same parent folder), **or** upload **`app/dist/InspireAI-workspace.zip`** to  
     `/Workspace/Users/<your-email>/InspireAI-workspace.zip`
2. Open **`installer_workspace.py`**, attach **Serverless** (or a cluster with UC + Apps access).
3. Pick **SQL warehouse** and **Unity Catalog** in the notebook parameters.
4. **Run All** (last cell runs `main()`).

The installer will:

- Deploy the **inspire-ai** Databricks App from the `app/` bundle
- Publish agent notebooks under `/Shared/inspire-ai/`
- Grant the App **service principal** UC and warehouse permissions

Then open **Compute → Apps → inspire-ai**.

## Layout

| Path | Purpose |
|------|---------|
| **`installer_workspace.py`** | One-time workspace installer (customer entry point) |
| **`app/`** | Full-stack app — backend, frontend, notebooks, internal deploy scripts |

Developers: see [app/README.md](app/README.md) and [app/deployment.md](app/deployment.md).

## Legal Information

This software is provided as-is and is not officially supported by Databricks through customer technical support channels. Support, questions, and feature requests can be communicated through the Issues page of this repo.
