---
name: mb52-pipeline-reality-not-a-live-comparison
description: mb52.py only exports a raw SAP dump — the demand-vs-stock comparison happens elsewhere against a workbook that may never get refreshed with it; "peças críticas" (STATUS 3) is an opaque external flag, not derived from the stock check.
metadata:
  type: business-rule
---

Found via `code-archaeologist` deep-read of the legacy `014. Planner Project Modularizado` project (not visible from `requisitos.md`'s summary):

- `mb52.py` only drives SAP GUI through MB52 and exports a raw ALV grid to `estoque.xlsx` — it does **no** demand-vs-stock comparison itself.
- The real demand-vs-stock logic lives in `montar_patan_logic.py`, run against fields already inside `AutomacaoPlanner.xlsx`. The function that would merge the fresh `estoque.xlsx` dump into that workbook (`excel_utils.updateExcel`) is imported in `main.py` but **never actually called** in the reviewed pipeline — the legacy system may be planning against stale stock every cycle.
- "Peças críticas" (the items that get `STATUS=3`) are **not** derived from the MB52/stock check at all — they come from a pre-existing `isCritico` boolean column on the source Excel, with no visible logic anywhere in the reviewed files that computes it. Its origin is unknown/external to this codebase.

**Why:** `main.md` and `requisitos.md` both imply the stock check and "peças críticas" are the same live, connected pipeline (BOM demand crossed with real-time stock → flag critical). The actual legacy implementation is looser and has a likely-dead refresh step.

**How to apply:** don't assume "critical piece" detection can be derived purely from a stock-vs-demand rule in the new system — ask where `isCritico` is actually supposed to come from before designing that feature. Also make sure the new backend's stock-refresh step is actually wired into the request path (not an unused function like `updateExcel`), so this specific staleness bug isn't inherited.
