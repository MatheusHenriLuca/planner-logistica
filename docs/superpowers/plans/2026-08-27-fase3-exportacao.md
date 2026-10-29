# Fase 3.3 — Exportação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /producao/exportar` — same scope as `/producao/tabela-b`
(reuses `listar_persistidos`, added in the Calendário plan) but serialized
as downloadable CSV instead of JSON. "Exportar CSV" button on the Produção
screen, using its existing linha/turno/patan filters.

**Architecture:** One new route (no new repository function — reuses
`listar_persistidos` as-is). Frontend: one client function returning a
`Blob`, one button + download handler in `Producao.tsx`.

**Tech Stack:** Python stdlib `csv` module — no new dependency, backend or
frontend.

**Spec:** `docs/superpowers/specs/2026-08-27-fase3-exportacao-design.md`

## Global Constraints

- Tests deferred, no per-task code-reviewer dispatch — same ongoing user
  instruction as the previous sub-projects.
- Any authenticated user, no extra role check.
- Read-only: no `db.commit()`.

## Wave plan

- **Wave 1 (only wave):** Task 1 (backend route), Task 2 (frontend client
  + button) — disjoint files, no dependency (Task 2 can be written against
  the frozen contract in this plan without waiting on Task 1's code to
  exist, same as earlier sub-projects' frontend/backend pairs).

---

### Task 1: Backend — GET /producao/exportar

**Files:**
- Modify: `backend/app/api/routes_producao.py`

**Depends-on:** none

**Interfaces:**
- Consumes: `listar_persistidos` (already in `producao_repository.py`, added by the Calendário plan — no changes needed to it).
- Produces: the `/producao/exportar` route — nothing else in this plan depends on it (Task 2 calls it over HTTP, not by import).

- [ ] **Step 1: Add the route**
  In `backend/app/api/routes_producao.py`, add these two imports at the
  top (alongside the existing ones):
  ```python
  import csv
  import io

  from fastapi import Response
  ```
  (`Response` joins the existing `from fastapi import APIRouter, Depends, HTTPException, status` import — add it to that same line rather than a separate one.)

  Then append this route at the end of the file (after `listar_tabela_b`):
  ```python
  @router.get("/exportar")
  def exportar_tabela_b(
      linha: str,
      patan: Patan,
      turno: Turno | None = None,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> Response:
      registros = listar_persistidos(
          db, linha, patan.value, turno.value if turno is not None else None
      )
      buffer = io.StringIO()
      writer = csv.writer(buffer)
      writer.writerow(
          [
              "linha", "turno", "patan", "posto_trabalho", "status", "sequencia",
              "hora_inicial", "hora_final", "kanbans", "qtd_por_kanban",
              "tempo_por_peca_minutos", "is_critico",
          ]
      )
      for r in registros:
          writer.writerow(
              [
                  r.linha, r.turno, r.patan, r.posto_trabalho, r.status, r.sequencia,
                  r.hora_inicial, r.hora_final, r.kanbans, r.qtd_por_kanban,
                  r.tempo_por_peca_minutos, r.is_critico,
              ]
          )
      return Response(
          content=buffer.getvalue(),
          media_type="text/csv",
          headers={
              "Content-Disposition": f'attachment; filename="producao_{linha}_{patan.value}.csv"'
          },
      )
  ```

- [ ] **Step 2: Verify**
  ```bash
  cd backend && .venv/bin/python -c "
  from app.api.routes_producao import router
  paths = {(r.path, tuple(sorted(r.methods))) for r in router.routes}
  assert ('/producao/exportar', ('GET',)) in paths
  print('OK - /producao/exportar registered')
  "
  ```
  Against real Postgres:
  ```bash
  cd backend && DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica" JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao" .venv/bin/python -m uvicorn app.main:app --port 8010 &
  SERVER_PID=$!
  sleep 2
  TOKEN=$(curl -s -X POST http://localhost:8010/auth/login -d "username=admin&password=admin" -H "Content-Type: application/x-www-form-urlencoded" | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
  echo "Note: if TOKEN is empty, log in with whatever real credentials exist in this dev DB instead - the point is confirming the endpoint returns real CSV bytes with the right headers, not this exact login."
  curl -s -D - -o /tmp/export-check.csv "http://localhost:8010/producao/exportar?linha=L1&patan=A" -H "Authorization: Bearer $TOKEN" | head -20
  cat /tmp/export-check.csv
  kill $SERVER_PID
  ```
  Confirm: `Content-Type: text/csv`, a `Content-Disposition: attachment` header, and the body is well-formed CSV (header row + one row per persisted item in that scope, zero rows is fine if nothing is persisted there).
  Run the existing suite as a regression check:
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 3: Commit**
  ```bash
  cd backend
  git add app/api/routes_producao.py
  git commit -m "feat: add GET /producao/exportar (CSV export of Tabela B)"
  ```

---

### Task 2: Frontend — export button on Produção

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/pages/Producao.tsx`

**Depends-on:** none

**Interfaces:**
- Consumes: none from earlier tasks in THIS plan (calls the backend over HTTP against the frozen contract above, not by import — same pattern as every other frontend/backend pair this session).
- Produces: none (last consumer).

- [ ] **Step 1: Add the client function**
  In `frontend/src/services/api.ts`, append:
  ```ts
  export async function exportarProducaoCsv(
    token: string,
    params: { linha: string; patan: string; turno?: number }
  ): Promise<Blob> {
    const query = new URLSearchParams({ linha: params.linha, patan: params.patan });
    if (params.turno !== undefined) query.set("turno", String(params.turno));
    const response = await fetch(`${API_BASE_URL}/producao/exportar?${query}`, {
      headers: authHeaders(token),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      throw new ApiError(response.status, body.detail ?? "Erro desconhecido");
    }
    return response.blob();
  }
  ```
  (`ApiError` is already defined earlier in this same file — no new import
  needed.)

- [ ] **Step 2: Add the button + handler to Produção**
  In `frontend/src/pages/Producao.tsx`, update the import line:
  ```tsx
  import { ApiError, exportarProducaoCsv, listarTabelaB } from "../services/api";
  ```
  Add this handler function inside the `Producao` component, near the
  other logic (before the `return`):
  ```tsx
    async function handleExportar() {
      if (!token) return;
      try {
        const blob = await exportarProducaoCsv(token, { linha, patan, turno });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `producao_${linha}_${patan}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) logout();
      }
    }
  ```
  Add the button in the filters row (right after the `Patan` `<label>`,
  still inside the same `<div className="mb-6 flex flex-wrap gap-4">`):
  ```tsx
        <button
          onClick={handleExportar}
          className="self-end rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Exportar CSV
        </button>
  ```

- [ ] **Step 3: Verify**
  ```bash
  cd frontend && npx tsc -b && npx eslint src/services/api.ts src/pages/Producao.tsx && npx vitest run
  ```
  Baseline is 44/47 (3 pre-existing `SequenciaBoard.test.tsx` failures,
  unrelated) — must stay exactly there. If `Producao.test.tsx` fails only
  because it now finds an extra button it didn't expect (not because
  existing assertions on other elements broke), that's expected collateral
  from a real new button — note it, don't route around it.

- [ ] **Step 4: Commit**
  ```bash
  cd frontend
  git add src/services/api.ts src/pages/Producao.tsx
  git commit -m "feat: add CSV export button to Producao screen"
  ```
