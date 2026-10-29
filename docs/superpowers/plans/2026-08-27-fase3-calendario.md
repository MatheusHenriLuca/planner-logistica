# Fase 3.2 — Calendário Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `GET /producao/tabela-b` endpoint reading the real persisted
`ItemProducao` (Tabela B) — used both by a new Calendário timeline page and
to fix `Producao.tsx`, which currently (a pre-existing Fase 1 bug found
while researching this feature) reads the staging-recomputed
`GET /producao/sequencia` instead of the actually-persisted table.

**Architecture:** One new repository function + one new route in the
existing `producao` route file (reuses the existing `ItemProducaoOut`
schema — no new schema). Frontend: one new client function (reuses the
existing `ItemProducao` type), a surgical data-source swap in
`Producao.tsx`, and a new Calendário page.

**Tech Stack:** Same as the rest of the app, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-27-fase3-calendario-design.md`

## Global Constraints

- Tests deferred, no per-task code-reviewer dispatch — same explicit,
  ongoing user instruction as the last two sub-projects. Each task still
  runs the existing suite as a regression check.
- `GET /producao/tabela-b` and the Calendário page: any authenticated user,
  no extra role check (same page-level RBAC convention as the rest of the
  app).
- `Producao.tsx`'s fix must NOT change its drag-and-drop/reducer wiring or
  its `somenteLeitura` logic — only the data source (which endpoint it
  fetches from, and how the response is unwrapped).

## Wave plan

- **Wave 1:** Task 1 (backend: repository+route), Task 2 (frontend: API
  client) — disjoint files, no dependency.
- **Wave 2:** Task 3 (fix `Producao.tsx`), Task 4 (Calendário page + Nav +
  route) — both depend on Task 2 only, disjoint files from each other.

---

### Task 1: Backend — GET /producao/tabela-b

**Files:**
- Modify: `backend/app/repositories/producao_repository.py`
- Modify: `backend/app/api/routes_producao.py`

**Depends-on:** none

**Interfaces:**
- Consumes: `app.models.producao.ItemProducao` (pre-existing); `app.schemas.producao.ItemProducaoOut` (pre-existing, reused as-is — no new schema).
- Produces: `listar_persistidos(db, linha, patan, turno=None) -> list[ItemProducao]` (repository) and the `GET /producao/tabela-b` route — consumed by Task 3/4 via the frontend client Task 2 builds.

- [ ] **Step 1: Add the repository function**
  In `backend/app/repositories/producao_repository.py`, append (after
  `bulk_persist`, at the end of the file):
  ```python
  def listar_persistidos(
      db: Session, linha: str, patan: str, turno: int | None = None
  ) -> list[ItemProducao]:
      """Reads the real persisted Tabela B rows - no cascade recompute,
      hora_inicial/hora_final are already stored from submit time. turno is
      optional: omitted returns every turno for this linha/patan (needed by
      the Calendario day-timeline view), present scopes to just that turno.
      """
      filtros = [ItemProducao.linha == linha, ItemProducao.patan == patan]
      if turno is not None:
          filtros.append(ItemProducao.turno == turno)
      stmt = (
          select(ItemProducao)
          .where(*filtros)
          .order_by(ItemProducao.turno, ItemProducao.posto_trabalho, ItemProducao.sequencia)
      )
      return list(db.scalars(stmt).all())
  ```
  (`select` and `Session` are already imported at the top of this file — no
  new imports needed for this function.)

- [ ] **Step 2: Add the route**
  In `backend/app/api/routes_producao.py`, add `listar_persistidos` to the
  existing import from `app.repositories.producao_repository` (alongside
  `bulk_persist`, `get_pecas_criticas_by_linha`, `get_staging_itens` —
  keep alphabetical):
  ```python
  from app.repositories.producao_repository import (
      bulk_persist,
      get_pecas_criticas_by_linha,
      get_staging_itens,
      listar_persistidos,
  )
  ```
  Then append this route at the end of the file (after `submeter_sequencia`):
  ```python
  @router.get("/tabela-b", response_model=list[ItemProducaoOut])
  def listar_tabela_b(
      linha: str,
      patan: Patan,
      turno: Turno | None = None,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> list[ItemProducaoOut]:
      registros = listar_persistidos(
          db, linha, patan.value, turno.value if turno is not None else None
      )
      return [
          ItemProducaoOut(
              id=r.id,
              linha=r.linha,
              turno=r.turno,
              patan=r.patan,
              posto_trabalho=r.posto_trabalho,
              status=r.status,
              sequencia=r.sequencia,
              hora_inicial=r.hora_inicial,
              hora_final=r.hora_final,
              almoco_incluso=r.almoco_incluso,
              kanbans=r.kanbans,
              qtd_por_kanban=r.qtd_por_kanban,
              tempo_por_peca_minutos=r.tempo_por_peca_minutos,
              is_critico=r.is_critico,
              tem_falta_estoque=False,
          )
          for r in registros
      ]
  ```
  `tem_falta_estoque` is hardcoded `False` here — that field only exists on
  staging (`demanda`/`saldo_estoque`), not on Tabela B; `submeter_sequencia`
  already does the exact same thing for its own response, so this matches
  existing precedent, not a new pattern.

- [ ] **Step 3: Verify**
  ```bash
  cd backend && .venv/bin/python -c "
  from app.api.routes_producao import router
  paths = {(r.path, tuple(sorted(r.methods))) for r in router.routes}
  assert ('/producao/tabela-b', ('GET',)) in paths
  print('OK - /producao/tabela-b registered')
  "
  ```
  Then against real Postgres (already has sample data from earlier manual
  testing this session):
  ```bash
  cd backend && DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica" JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao" .venv/bin/python -c "
  from sqlalchemy import create_engine
  from sqlalchemy.orm import sessionmaker

  from app.repositories.producao_repository import listar_persistidos

  engine = create_engine('postgresql+psycopg://planner:planner@localhost:5432/planner_logistica')
  db = sessionmaker(bind=engine)()
  todos = listar_persistidos(db, 'L1', 'A')
  so_turno_1 = listar_persistidos(db, 'L1', 'A', turno=1)
  print(f'todos os turnos: {len(todos)} itens; so turno 1: {len(so_turno_1)} itens')
  assert len(so_turno_1) <= len(todos)
  db.close()
  "
  ```
  (Zero rows either way is fine and expected if nothing has been submitted
  yet through the UI for this exact scope — the assertion just confirms the
  turno filter actually narrows, not that there's necessarily live data.)
  Run the existing suite as a regression check:
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd backend
  git add app/repositories/producao_repository.py app/api/routes_producao.py
  git commit -m "$(cat <<'EOF'
  feat: add GET /producao/tabela-b (reads persisted Tabela B directly)

  Fixes a pre-existing gap: Producao.tsx (Task 3, next commit) was reading
  the staging-recomputed GET /producao/sequencia instead of the actually
  persisted table, contradicting this project's own documented Tabela A/B
  split. Also needed as-is for the Calendario timeline (Task 4), which
  needs all 3 turnos at once - turno is optional here for that reason.
  EOF
  )"
  ```

---

### Task 2: Frontend — tabela-b API client

**Files:**
- Modify: `frontend/src/services/api.ts`

**Depends-on:** none

**Interfaces:**
- Consumes: none from earlier tasks; reuses existing `authHeaders`, `parseJsonOrThrow`, `API_BASE_URL`, and the already-imported `ItemProducao` type.
- Produces: `listarTabelaB(token, params)` — consumed by Task 3 and Task 4.

- [ ] **Step 1: Add the client function**
  In `frontend/src/services/api.ts`, append (the file already imports
  `ItemProducao` at the top — no new import needed):
  ```ts
  export async function listarTabelaB(
    token: string,
    params: { linha: string; patan: string; turno?: number }
  ): Promise<ItemProducao[]> {
    const query = new URLSearchParams({ linha: params.linha, patan: params.patan });
    if (params.turno !== undefined) query.set("turno", String(params.turno));
    const response = await fetch(`${API_BASE_URL}/producao/tabela-b?${query}`, {
      headers: authHeaders(token),
    });
    return parseJsonOrThrow<ItemProducao[]>(response);
  }
  ```

- [ ] **Step 2: Verify**
  ```bash
  cd frontend && npx tsc -b && npx eslint src/services/api.ts && npx vitest run
  ```
  Baseline before this task is 44/47 (3 pre-existing, already-ledgered
  `SequenciaBoard.test.tsx` failures, unrelated) — this task only adds code,
  must stay exactly at that baseline.

- [ ] **Step 3: Commit**
  ```bash
  cd frontend
  git add src/services/api.ts
  git commit -m "feat: add listarTabelaB API client function"
  ```

---

### Task 3: Fix Producao.tsx to read the real persisted Tabela B

**Files:**
- Modify: `frontend/src/pages/Producao.tsx`

**Depends-on:** 2

**Interfaces:**
- Consumes: `listarTabelaB(token, { linha, patan, turno }) -> Promise<ItemProducao[]>` (Task 2).
- Produces: none (last consumer of this specific fix).

- [ ] **Step 1: Swap the data source**
  Current top of `frontend/src/pages/Producao.tsx`:
  ```tsx
  import { ApiError, getSequencia } from "../services/api";
  ```
  Replace with:
  ```tsx
  import { ApiError, listarTabelaB } from "../services/api";
  ```
  Current `queryFn`:
  ```tsx
    const { data, isLoading, isError, error } = useQuery({
      queryKey: ["sequencia-producao", linha, turno, patan],
      queryFn: async () => {
        if (!token) throw new Error("Nao autenticado.");
        return getSequencia(token, { linha, turno, patan });
      },
  ```
  Replace with:
  ```tsx
    const { data, isLoading, isError, error } = useQuery({
      queryKey: ["tabela-b-producao", linha, turno, patan],
      queryFn: async () => {
        if (!token) throw new Error("Nao autenticado.");
        return listarTabelaB(token, { linha, patan, turno });
      },
  ```
  (`queryKey` renamed too, so this page's cache doesn't collide with
  `ProgramacaoPatan.tsx`'s own `getSequencia`-based query, which uses a
  different key already and is unaffected by this change.)

  Current `useEffect`:
  ```tsx
    useEffect(() => {
      if (!data) return;
      dispatch({
        type: "CARREGAR",
        payload: { turno, dataBase: new Date().toISOString(), itens: data.itens },
      });
    }, [data, turno]);
  ```
  Replace `data.itens` with `data` (the new endpoint returns the array
  directly, no `{ itens: [...] }` wrapper):
  ```tsx
    useEffect(() => {
      if (!data) return;
      dispatch({
        type: "CARREGAR",
        payload: { turno, dataBase: new Date().toISOString(), itens: data },
      });
    }, [data, turno]);
  ```
  Nothing else in the file changes — `somenteLeitura`, the `SequenciaBoard`
  render, the filter inputs, `sequenciaReducer`'s `CARREGAR`/`REORDENAR`
  handling are all untouched.

- [ ] **Step 2: Verify**
  ```bash
  cd frontend && npx tsc -b && npx eslint src/pages/Producao.tsx && npx vitest run src/pages/Producao.test.tsx
  ```
  `Producao.test.tsx` mocks `getSequencia` today — read it first; if it
  mocks the module-level function by name, update the mock target to
  `listarTabelaB` and its return value from `{ itens: [...] }` to a bare
  array (matching the new response shape). This is a required fix to keep
  the existing test meaningful, not new test-writing — the test still
  covers the same loading/error/render behavior, just against the corrected
  data source. Then the full suite:
  ```bash
  cd frontend && npx vitest run
  ```
  Must stay at the 44/47 baseline (same 3 pre-existing unrelated failures).

- [ ] **Step 3: Commit**
  ```bash
  cd frontend
  git add src/pages/Producao.tsx src/pages/Producao.test.tsx
  git commit -m "$(cat <<'EOF'
  fix: Producao.tsx reads the persisted Tabela B, not staging

  Was calling GET /producao/sequencia (staging-recomputed - the same
  source ProgramacaoPatan.tsx uses for its pre-submit preview) instead of
  the actually-persisted table, contradicting this project's own
  documented Tabela A/B split. Now uses GET /producao/tabela-b.
  EOF
  )"
  ```

---

### Task 4: Calendário page (day timeline)

**Files:**
- Create: `frontend/src/pages/Calendario.tsx`
- Modify: `frontend/src/routes/AppRouter.tsx`
- Modify: `frontend/src/routes/Nav.tsx`

**Depends-on:** 2

**Interfaces:**
- Consumes: `listarTabelaB(token, { linha, patan }) -> Promise<ItemProducao[]>` (Task 2, called WITHOUT `turno` — every turno for the linha/patan at once); pre-existing `useAuth`, `RequireRole`.
- Produces: `Calendario` component, `/calendario` route — nothing else in this plan depends on it (last task).

- [ ] **Step 1: Create the Calendário page**
  Create `frontend/src/pages/Calendario.tsx`:
  ```tsx
  import { useQuery } from "@tanstack/react-query";
  import { useState } from "react";

  import { useAuth } from "../auth/AuthContext";
  import { listarTabelaB } from "../services/api";
  import type { ItemProducao, Patan } from "../types/producao";

  const FIELD_CLASSES = "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900";

  const TURNO_INICIO_MINUTOS: Record<number, number> = {
    1: 6 * 60 + 20,
    2: 14 * 60 + 40,
    3: 23 * 60,
  };
  const TURNO_DURACAO_MINUTOS: Record<number, number> = { 1: 500, 2: 500, 3: 440 };

  function minutosDesdeInicioTurno(horaIso: string, turno: number): number {
    const data = new Date(horaIso);
    let minutosDoDia = data.getHours() * 60 + data.getMinutes();
    const inicio = TURNO_INICIO_MINUTOS[turno];
    if (minutosDoDia < inicio) minutosDoDia += 24 * 60;
    return minutosDoDia - inicio;
  }

  function formatarHora(horaIso: string): string {
    const data = new Date(horaIso);
    return `${String(data.getHours()).padStart(2, "0")}:${String(data.getMinutes()).padStart(2, "0")}`;
  }

  export function Calendario() {
    const { token } = useAuth();
    const [linha, setLinha] = useState("L1");
    const [patan, setPatan] = useState<Patan>("A");

    const query = useQuery({
      queryKey: ["calendario", linha, patan],
      queryFn: async () => {
        if (!token) throw new Error("Nao autenticado.");
        return listarTabelaB(token, { linha, patan });
      },
      enabled: Boolean(token),
      retry: false,
    });

    const itensPorTurno: Record<number, ItemProducao[]> = { 1: [], 2: [], 3: [] };
    for (const item of query.data ?? []) {
      if (item.hora_inicial && item.hora_final) {
        itensPorTurno[item.turno]?.push(item);
      }
    }

    return (
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Calendario</h1>

        <div className="mb-6 flex flex-wrap gap-3">
          <input
            placeholder="linha"
            value={linha}
            onChange={(event) => setLinha(event.target.value)}
            className={FIELD_CLASSES}
          />
          <select
            value={patan}
            onChange={(event) => setPatan(event.target.value as Patan)}
            className={FIELD_CLASSES}
          >
            {["A", "B", "C", "D", "E", "F", "G", "H"].map((letra) => (
              <option key={letra} value={letra}>
                {letra}
              </option>
            ))}
          </select>
        </div>

        {query.isLoading && <p>Carregando calendario...</p>}
        {query.isError && (
          <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            Erro ao carregar o calendario.
          </p>
        )}

        {query.data && (
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((turno) => (
              <div key={turno}>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Turno {turno}
                </h2>
                <div className="relative h-16 w-full rounded-lg bg-slate-100">
                  {itensPorTurno[turno].map((item) => {
                    const inicioMin = minutosDesdeInicioTurno(item.hora_inicial as string, turno);
                    const fimMin = minutosDesdeInicioTurno(item.hora_final as string, turno);
                    const duracao = TURNO_DURACAO_MINUTOS[turno];
                    const left = Math.max(0, Math.min(100, (inicioMin / duracao) * 100));
                    const width = Math.max(1, Math.min(100 - left, ((fimMin - inicioMin) / duracao) * 100));
                    return (
                      <div
                        key={item.id}
                        title={`${item.posto_trabalho} - ${formatarHora(item.hora_inicial as string)} a ${formatarHora(item.hora_final as string)}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className={[
                          "absolute top-1 bottom-1 overflow-hidden rounded px-1 text-xs text-white",
                          item.is_critico ? "bg-red-500" : "bg-slate-600",
                        ].join(" ")}
                      >
                        {item.posto_trabalho}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Wire the route**
  In `frontend/src/routes/AppRouter.tsx`, add the import:
  ```tsx
  import { Calendario } from "../pages/Calendario";
  ```
  And a new `<Route>` (same RBAC pattern as `/dashboard`):
  ```tsx
  <Route
    path="/calendario"
    element={
      <RequireRole allowed={["admin", "programador", "usuario_comum"]}>
        <Calendario />
      </RequireRole>
    }
  />
  ```

- [ ] **Step 3: Add the Nav link**
  In `frontend/src/routes/Nav.tsx`, add a link (same style/position pattern
  as the existing links, no role gate — read the current file first, it
  was touched by the Dashboard task earlier this session):
  ```tsx
  <Link
    to="/calendario"
    className="rounded px-2 py-1 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
  >
    Calendario
  </Link>
  ```

- [ ] **Step 4: Verify**
  ```bash
  cd frontend && npx tsc -b && npx eslint src/pages/Calendario.tsx src/routes/AppRouter.tsx src/routes/Nav.tsx
  ```
  If `Nav.test.tsx` asserts on an exact/exhaustive link list and fails only
  because it doesn't expect "Calendario" (not because logic broke), that's
  expected collateral from genuinely adding a nav entry — note it, don't
  route around it:
  ```bash
  cd frontend && npx vitest run
  ```

- [ ] **Step 5: Commit**
  ```bash
  cd frontend
  git add src/pages/Calendario.tsx src/routes/AppRouter.tsx src/routes/Nav.tsx
  git commit -m "feat: add Calendario page (day timeline by turno) and Nav link"
  ```
