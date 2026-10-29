---
name: sap-integration-is-desktop-automation-not-api
description: Legacy SAP integration drives the interactive SAP GUI desktop client via win32com (not RFC/BAPI/OData) — cannot run inside a headless backend; needs a separate Windows-hosted adapter. Also avoid the legacy's plaintext-credential patterns.
metadata:
  type: architecture
---

`src/AutoSap/sap.py` (in the legacy `014. Planner Project Modularizado` reference project) automates the real SAP GUI Windows client via `win32com.client` COM scripting against hardcoded control IDs (e.g. `wnd[0]/usr/chkPA_SOND`) and a specific ALV layout variant (`sorpcp`) for transaction MB52. It requires a live, interactive Windows session with SAP GUI installed and logged in — there is no RFC/BAPI/OData call anywhere in the legacy code.

**Why:** this only surfaced from a full `code-archaeologist` read of the legacy scripts — `requisitos.md` just says "Scripts Python de automação (SAP GUI)" without spelling out that it's UI automation, not an API integration. Materially changes backend deployment: a standard FastAPI service (Linux-friendly, stateless, horizontally scalable) cannot run this inline.

**How to apply:** design the new system's SAP data flow as a separate Windows-hosted adapter/worker process (or push for a real RFC/BAPI/OData middleware if the business can get one) that feeds extracted stock data into the main DB/API — not as a function called directly by the FastAPI app. Also avoid two credential anti-patterns found in the same legacy project: a hardcoded Azure AD client secret in `config.py`, and SAP passwords read from a **plaintext password spreadsheet** on a network share (`sap.py`) — the new system must use env vars / a secrets manager for both Graph and SAP credentials, per this project's own `06-security.md`.
