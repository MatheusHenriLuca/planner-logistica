# Fase 3.1 — Dashboard de Métricas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `GET /dashboard/metricas` endpoint (overview + optional
linha/turno/patan filter) and a `/dashboard` frontend page, showing 4 scalar
metrics (total itens, % críticos, itens travados, taxa de conclusão de
checklist) plus two breakdown tables (throughput por posto, comparação
linha/turno) — reading only current state from `producao`/Tabela B, no new
tables.

**Architecture:** One new backend route file + one new repository file
(SQL aggregation, no ORM entity behind it) + Pydantic schemas; one new
frontend page + API client functions + a Nav link, all 3 roles.

**Tech Stack:** Same as the rest of the app — FastAPI + SQLAlchemy 2.x
(backend), React + Vite + TypeScript + Tailwind + `@tanstack/react-query`
(frontend). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-27-fase3-dashboard-metricas-design.md`

## Global Constraints

- Tests deferred to a later gate, per the same explicit user instruction as
  Fase 2 — no task writes new automated tests. Each task still runs the
  existing suite as a regression check.
- No dedicated code-reviewer dispatch per task this time either, per the
  user's explicit process-change request during Fase 2 — build straight
  through, single comprehensive review later when the user asks for it.
- Read-only feature: no route in this plan calls `db.commit()` — nothing
  here mutates `producao`, `checklist_item`, or any other table.
- Any authenticated user (`admin`, `programador`, `usuario_comum`) — no
  extra role check, matching this project's page-level RBAC convention.

## Wave plan

- **Wave 1:** Task 1 (backend: schema+repository+route+wire), Task 2
  (frontend: API client+types) — disjoint files, no dependency.
- **Wave 2:** Task 3 (frontend: Dashboard page+Nav link+route wire) —
  depends on Task 2.

---

### Task 1: Backend — dashboard metrics endpoint

**Files:**
- Create: `backend/app/schemas/dashboard.py`
- Create: `backend/app/repositories/dashboard_repository.py`
- Create: `backend/app/api/routes_dashboard.py`
- Modify: `backend/app/main.py`

**Depends-on:** none

**Interfaces:**
- Consumes: `app.models.producao.ItemProducao`, `app.models.colaboracao.ChecklistItem`, `app.domain.status.PlanItemStatus` (all pre-existing).
- Produces: `app.api.routes_dashboard.router` (`APIRouter`), consumed by this same task's Step 4 (main.py wiring) — nothing outside this task depends on it.

- [ ] **Step 1: Create the schemas**
  Create `backend/app/schemas/dashboard.py`:
  ```python
  from pydantic import BaseModel


  class ThroughputPostoOut(BaseModel):
      posto_trabalho: str
      turno: int
      total_pecas: int


  class LinhaTurnoOut(BaseModel):
      linha: str
      turno: int
      total_itens: int
      pct_itens_criticos: float


  class DashboardMetricasOut(BaseModel):
      total_itens: int
      pct_itens_criticos: float
      itens_travados: int
      taxa_conclusao_checklist: float
      throughput_por_posto: list[ThroughputPostoOut]
      por_linha_turno: list[LinhaTurnoOut]
  ```

- [ ] **Step 2: Create the repository**
  Create `backend/app/repositories/dashboard_repository.py`:
  ```python
  from sqlalchemy import func, select
  from sqlalchemy.orm import Session

  from app.domain.status import PlanItemStatus
  from app.models.colaboracao import ChecklistItem
  from app.models.producao import ItemProducao


  def obter_metricas(
      db: Session,
      linha: str | None = None,
      turno: int | None = None,
      patan: str | None = None,
  ) -> dict:
      """Aggregates current-state metrics from producao (Tabela B).

      No historical/time-series data exists (producao is replaced, not
      appended to, on every bulk_persist resubmission) - every number here
      is a snapshot of right now. linha/turno/patan are all optional: no
      filters at all means the overview (whole table); all three present
      scopes to one plan the same way GET /producao/sequencia does.
      """
      filtros = []
      if linha is not None:
          filtros.append(ItemProducao.linha == linha)
      if turno is not None:
          filtros.append(ItemProducao.turno == turno)
      if patan is not None:
          filtros.append(ItemProducao.patan == patan)

      total_itens, total_criticos, itens_travados = db.execute(
          select(
              func.count(),
              func.count().filter(ItemProducao.is_critico.is_(True)),
              func.count().filter(ItemProducao.status == PlanItemStatus.LOCKED.value),
          )
          .select_from(ItemProducao)
          .where(*filtros)
      ).one()
      total_itens = total_itens or 0
      itens_travados = itens_travados or 0
      pct_itens_criticos = (total_criticos / total_itens * 100) if total_itens else 0.0

      total_checklist, concluidos_checklist = db.execute(
          select(
              func.count(),
              func.count().filter(ChecklistItem.concluido.is_(True)),
          )
          .select_from(ChecklistItem)
          .join(ItemProducao, ChecklistItem.item_producao_id == ItemProducao.id)
          .where(*filtros)
      ).one()
      taxa_conclusao_checklist = (
          (concluidos_checklist / total_checklist * 100) if total_checklist else 0.0
      )

      throughput_rows = db.execute(
          select(
              ItemProducao.posto_trabalho,
              ItemProducao.turno,
              func.sum(ItemProducao.kanbans * ItemProducao.qtd_por_kanban),
          )
          .where(*filtros)
          .group_by(ItemProducao.posto_trabalho, ItemProducao.turno)
      ).all()
      throughput_por_posto = [
          {"posto_trabalho": posto, "turno": turno_linha, "total_pecas": total or 0}
          for posto, turno_linha, total in throughput_rows
      ]

      linha_turno_rows = db.execute(
          select(
              ItemProducao.linha,
              ItemProducao.turno,
              func.count(),
              func.count().filter(ItemProducao.is_critico.is_(True)),
          )
          .where(*filtros)
          .group_by(ItemProducao.linha, ItemProducao.turno)
      ).all()
      por_linha_turno = [
          {
              "linha": linha_row,
              "turno": turno_row,
              "total_itens": total,
              "pct_itens_criticos": (criticos / total * 100) if total else 0.0,
          }
          for linha_row, turno_row, total, criticos in linha_turno_rows
      ]

      return {
          "total_itens": total_itens,
          "pct_itens_criticos": pct_itens_criticos,
          "itens_travados": itens_travados,
          "taxa_conclusao_checklist": taxa_conclusao_checklist,
          "throughput_por_posto": throughput_por_posto,
          "por_linha_turno": por_linha_turno,
      }
  ```

- [ ] **Step 3: Create the route**
  Create `backend/app/api/routes_dashboard.py`:
  ```python
  from fastapi import APIRouter, Depends
  from sqlalchemy.orm import Session

  from app.core.deps import get_current_user
  from app.db.session import get_db
  from app.models.user import User
  from app.repositories.dashboard_repository import obter_metricas
  from app.schemas.dashboard import DashboardMetricasOut

  router = APIRouter(prefix="/dashboard", tags=["dashboard"])


  @router.get("/metricas", response_model=DashboardMetricasOut)
  def obter_metricas_dashboard(
      linha: str | None = None,
      turno: int | None = None,
      patan: str | None = None,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> DashboardMetricasOut:
      metricas = obter_metricas(db, linha=linha, turno=turno, patan=patan)
      return DashboardMetricasOut(**metricas)
  ```
  Read-only (GET, aggregation only) — no `db.commit()` needed anywhere in
  this route, unlike the mutation routes in the collaboration feature.

- [ ] **Step 4: Wire the router into the app**
  In `backend/app/main.py`, add the import (alphabetical, alongside the
  other route imports) and register it:
  ```python
  from app.api.routes_dashboard import router as dashboard_router
  ```
  ```python
  app.include_router(dashboard_router)
  ```
  Read the current file first for the exact existing import block/
  `include_router` call order to slot this in correctly (same pattern as
  every other router already there).

- [ ] **Step 5: Verify**
  ```bash
  cd backend && .venv/bin/python -c "
  from app.api.routes_dashboard import router
  paths = sorted({r.path for r in router.routes})
  print(paths)
  assert paths == ['/dashboard/metricas']
  print('OK - routes_dashboard router has the expected path')
  "
  ```
  Then against real Postgres (already has the 6 sample staging rows and
  live data from earlier manual testing this session — env vars:
  `DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica"`,
  `JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao"`):
  ```bash
  cd backend && DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica" JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao" .venv/bin/python -c "
  from sqlalchemy import create_engine
  from sqlalchemy.orm import sessionmaker

  from app.repositories.dashboard_repository import obter_metricas

  engine = create_engine('postgresql+psycopg://planner:planner@localhost:5432/planner_logistica')
  db = sessionmaker(bind=engine)()
  print(obter_metricas(db))
  print(obter_metricas(db, linha='L1', turno=1, patan='A'))
  db.close()
  "
  ```
  Confirm no exception and both calls return a dict matching the schema's
  shape (empty lists/zeros are fine if `producao`/Tabela B has no rows for
  a given scope — Tabela B may be empty even when staging has rows, since
  nothing has necessarily been "enviado" yet).
  Run the existing suite as a regression check:
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 6: Commit**
  ```bash
  cd backend
  git add app/schemas/dashboard.py app/repositories/dashboard_repository.py app/api/routes_dashboard.py app/main.py
  git commit -m "feat: add dashboard metrics endpoint (GET /dashboard/metricas)"
  ```

---

### Task 2: Frontend — dashboard API client + types

**Files:**
- Create: `frontend/src/types/dashboard.ts`
- Modify: `frontend/src/services/api.ts`

**Depends-on:** none

**Interfaces:**
- Consumes: none from earlier tasks; reuses existing `authHeaders`,
  `parseJsonOrThrow`, `API_BASE_URL` already in `frontend/src/services/api.ts`.
- Produces: `DashboardMetricasOut`, `ThroughputPostoOut`, `LinhaTurnoOut`
  (types) and `obterMetricas(token, params?)` (client function) —
  consumed by Task 3.

- [ ] **Step 1: Create the types**
  Create `frontend/src/types/dashboard.ts`:
  ```ts
  export interface ThroughputPostoOut {
    posto_trabalho: string;
    turno: number;
    total_pecas: number;
  }

  export interface LinhaTurnoOut {
    linha: string;
    turno: number;
    total_itens: number;
    pct_itens_criticos: number;
  }

  export interface DashboardMetricasOut {
    total_itens: number;
    pct_itens_criticos: number;
    itens_travados: number;
    taxa_conclusao_checklist: number;
    throughput_por_posto: ThroughputPostoOut[];
    por_linha_turno: LinhaTurnoOut[];
  }
  ```

- [ ] **Step 2: Add the client function**
  In `frontend/src/services/api.ts`, add the import at the top:
  ```ts
  import type { DashboardMetricasOut } from "../types/dashboard";
  ```
  And append this function (matches the existing `getSequencia`
  query-string-building pattern):
  ```ts
  export async function obterMetricas(
    token: string,
    params: { linha?: string; turno?: number; patan?: string } = {}
  ): Promise<DashboardMetricasOut> {
    const query = new URLSearchParams();
    if (params.linha) query.set("linha", params.linha);
    if (params.turno !== undefined) query.set("turno", String(params.turno));
    if (params.patan) query.set("patan", params.patan);
    const queryString = query.toString();
    const response = await fetch(
      `${API_BASE_URL}/dashboard/metricas${queryString ? `?${queryString}` : ""}`,
      { headers: authHeaders(token) }
    );
    return parseJsonOrThrow<DashboardMetricasOut>(response);
  }
  ```

- [ ] **Step 3: Verify**
  ```bash
  cd frontend && npx tsc -b && npx eslint src/services/api.ts src/types/dashboard.ts && npx vitest run
  ```
  Full suite must still pass (this only adds code, touches no existing
  logic).

- [ ] **Step 4: Commit**
  ```bash
  cd frontend
  git add src/types/dashboard.ts src/services/api.ts
  git commit -m "feat: add dashboard API client function + types"
  ```

---

### Task 3: Frontend — Dashboard page + Nav link

**Files:**
- Create: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/routes/AppRouter.tsx`
- Modify: `frontend/src/routes/Nav.tsx`

**Depends-on:** 2

**Interfaces:**
- Consumes: `obterMetricas` (Task 2, `frontend/src/services/api.ts`);
  `DashboardMetricasOut` (Task 2, `frontend/src/types/dashboard.ts`);
  pre-existing `useAuth` (`frontend/src/auth/AuthContext.tsx`);
  pre-existing `RequireRole` (`frontend/src/routes/RequireRole.tsx`).
- Produces: `Dashboard` component, the `/dashboard` route — nothing else in
  this plan depends on it (last task).

- [ ] **Step 1: Create the Dashboard page**
  Create `frontend/src/pages/Dashboard.tsx`:
  ```tsx
  import { useQuery } from "@tanstack/react-query";
  import { useState } from "react";

  import { useAuth } from "../auth/AuthContext";
  import { ApiError, obterMetricas } from "../services/api";

  const CARD_CLASSES = "rounded-lg bg-white p-4 shadow-sm";
  const LABEL_CLASSES = "text-sm text-slate-500";
  const VALUE_CLASSES = "mt-1 text-2xl font-semibold text-slate-900";
  const TABLE_HEADER_CLASSES =
    "border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500";
  const TABLE_CELL_CLASSES = "border-b border-slate-100 px-3 py-2 text-sm text-slate-700";
  const SELECT_CLASSES = "rounded-md border border-slate-300 px-2 py-1 text-sm";

  export function Dashboard() {
    const { token, logout } = useAuth();
    const [linha, setLinha] = useState("");
    const [turno, setTurno] = useState("");
    const [patan, setPatan] = useState("");
    const [erro, setErro] = useState<string | null>(null);

    const query = useQuery({
      queryKey: ["dashboard-metricas", linha, turno, patan],
      queryFn: async () => {
        if (!token) throw new Error("sem token");
        try {
          return await obterMetricas(token, {
            linha: linha || undefined,
            turno: turno ? Number(turno) : undefined,
            patan: patan || undefined,
          });
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            logout();
          }
          throw err;
        }
      },
      enabled: Boolean(token),
      retry: false,
    });

    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Dashboard</h1>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            placeholder="linha (todas)"
            value={linha}
            onChange={(event) => setLinha(event.target.value)}
            className={SELECT_CLASSES}
          />
          <select
            value={turno}
            onChange={(event) => setTurno(event.target.value)}
            className={SELECT_CLASSES}
          >
            <option value="">turno (todos)</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
          <select
            value={patan}
            onChange={(event) => setPatan(event.target.value)}
            className={SELECT_CLASSES}
          >
            <option value="">patan (todos)</option>
            {["A", "B", "C", "D", "E", "F", "G", "H"].map((letra) => (
              <option key={letra} value={letra}>
                {letra}
              </option>
            ))}
          </select>
        </div>

        {query.isLoading && <p>Carregando metricas...</p>}
        {query.isError && (
          <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            Erro ao carregar as metricas.
          </p>
        )}
        {erro && <p role="alert">{erro}</p>}

        {query.data && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className={CARD_CLASSES}>
                <div className={LABEL_CLASSES}>Total de itens</div>
                <div className={VALUE_CLASSES}>{query.data.total_itens}</div>
              </div>
              <div className={CARD_CLASSES}>
                <div className={LABEL_CLASSES}>% criticos</div>
                <div className={VALUE_CLASSES}>{query.data.pct_itens_criticos.toFixed(1)}%</div>
              </div>
              <div className={CARD_CLASSES}>
                <div className={LABEL_CLASSES}>Itens travados</div>
                <div className={VALUE_CLASSES}>{query.data.itens_travados}</div>
              </div>
              <div className={CARD_CLASSES}>
                <div className={LABEL_CLASSES}>Checklist concluido</div>
                <div className={VALUE_CLASSES}>
                  {query.data.taxa_conclusao_checklist.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                Throughput por posto
              </h2>
              <table className="w-full overflow-hidden rounded-lg bg-white shadow-sm">
                <thead>
                  <tr>
                    <th className={TABLE_HEADER_CLASSES}>Posto</th>
                    <th className={TABLE_HEADER_CLASSES}>Turno</th>
                    <th className={TABLE_HEADER_CLASSES}>Total pecas</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.throughput_por_posto.map((linha_item) => (
                    <tr key={`${linha_item.posto_trabalho}-${linha_item.turno}`}>
                      <td className={TABLE_CELL_CLASSES}>{linha_item.posto_trabalho}</td>
                      <td className={TABLE_CELL_CLASSES}>{linha_item.turno}</td>
                      <td className={TABLE_CELL_CLASSES}>{linha_item.total_pecas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                Comparacao linha/turno
              </h2>
              <table className="w-full overflow-hidden rounded-lg bg-white shadow-sm">
                <thead>
                  <tr>
                    <th className={TABLE_HEADER_CLASSES}>Linha</th>
                    <th className={TABLE_HEADER_CLASSES}>Turno</th>
                    <th className={TABLE_HEADER_CLASSES}>Total itens</th>
                    <th className={TABLE_HEADER_CLASSES}>% criticos</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.por_linha_turno.map((item) => (
                    <tr key={`${item.linha}-${item.turno}`}>
                      <td className={TABLE_CELL_CLASSES}>{item.linha}</td>
                      <td className={TABLE_CELL_CLASSES}>{item.turno}</td>
                      <td className={TABLE_CELL_CLASSES}>{item.total_itens}</td>
                      <td className={TABLE_CELL_CLASSES}>{item.pct_itens_criticos.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Wire the route**
  In `frontend/src/routes/AppRouter.tsx`, add the import:
  ```tsx
  import { Dashboard } from "../pages/Dashboard";
  ```
  And a new `<Route>` inside `<Routes>` (any authenticated role, same
  pattern as the `/` route for `Producao`):
  ```tsx
  <Route
    path="/dashboard"
    element={
      <RequireRole allowed={["admin", "programador", "usuario_comum"]}>
        <Dashboard />
      </RequireRole>
    }
  />
  ```

- [ ] **Step 3: Add the Nav link**
  In `frontend/src/routes/Nav.tsx`, add a `Dashboard` link. It's visible to
  every logged-in user with no role gate (same as the existing `Producao`
  link) — read the current file first and add it in the same style/
  position as the other links (right after `Producao`):
  ```tsx
  <Link
    to="/dashboard"
    className="rounded px-2 py-1 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
  >
    Dashboard
  </Link>
  ```

- [ ] **Step 4: Verify**
  ```bash
  cd frontend && npx tsc -b && npx eslint src/pages/Dashboard.tsx src/routes/AppRouter.tsx src/routes/Nav.tsx
  ```
  Run the full suite — `Nav.test.tsx` may need attention if it asserts on
  an exact/exhaustive list of links; if it fails only because it didn't
  expect a new "Dashboard" link (not because logic broke), that's expected
  collateral from adding a real nav entry, not a regression to silently
  work around:
  ```bash
  cd frontend && npx vitest run
  ```

- [ ] **Step 5: Commit**
  ```bash
  cd frontend
  git add src/pages/Dashboard.tsx src/routes/AppRouter.tsx src/routes/Nav.tsx
  git commit -m "feat: add Dashboard page (metrics + filters) and Nav link"
  ```
