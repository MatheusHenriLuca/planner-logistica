---
name: status-field-collision-two-lists
description: SharePoint field name "STATUS" is reused for two unrelated state machines across two different legacy lists — do not conflate into one enum in the new backend.
metadata:
  type: business-rule
---

Legacy system has two lists both with a field called `STATUS`, meaning completely different things:
- Planning list (`list_automacaoPlanner_py` / the production sequencing table): numeric `0/2/3/9` — matches the documented state machine (0=excluded, 2=normal, 3=critical/quarantine, 9=locked batch ready to persist).
- Request/intake list (`list_solicitacao_planner_py`): string `'1'`/`'2'` — unrelated meaning, `'1'`=pending request, `'2'`=processed (`sharepoint_utils.py:78,193`).

**Why:** found only by reading the legacy Python + Power Apps source directly (`code-archaeologist` pass on `requisitosBases/014. Planner Project Modularizado/`); neither `requisitos.md` nor `main.md` mention a second STATUS field or the request/intake list at all — a same-name-different-meaning trap that's invisible from the summary specs.

**How to apply:** when designing the new backend's domain model, use two distinct enums/types (e.g. `PlanItemStatus` for 0/2/3/9, `RequestStatus` for pending/processed) — never a single shared `Status` type, even if a "requisição"/intake feature is added later.
