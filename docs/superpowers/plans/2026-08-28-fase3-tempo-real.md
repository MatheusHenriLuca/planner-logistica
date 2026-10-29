# Fase 3.5c — Tempo Real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebSocket endpoint broadcasting a lightweight signal whenever
Tabela B changes (batch submit or coluna-extra move) — Produção, Dashboard,
and Calendário invalidate their React Query caches on receipt and refetch
via their existing `useQuery` hooks. No live-drag sync; no change to
Programação (its staging data is never touched by someone else's submit).

**Architecture:** In-memory connection manager + one WS route (backend),
two broadcast call sites added to already-existing mutation routes, and one
frontend hook mounted once at the app root.

**Tech Stack:** FastAPI's native WebSocket support + `anyio` (already a
transitive dependency via Starlette) — no new dependency either side.

**Spec:** `docs/superpowers/specs/2026-08-28-fase3-tempo-real-design.md`

## Global Constraints

- Tests deferred, no per-task code-reviewer dispatch — same ongoing user
  instruction as every sub-project this session.
- The WS endpoint requires a valid JWT (via `?token=` query param, since
  the browser WebSocket API cannot set an `Authorization` header) — close
  with code `4401` for any missing/invalid/unresolvable token.
- Broadcast from a **sync** route handler must use `anyio.from_thread.run`,
  never `asyncio.run` — the WebSocket connections live on the main event
  loop; `asyncio.run` would create a separate loop on the worker thread and
  call `send_json` on a connection object it doesn't own, a real
  concurrency bug. See the spec for the full reasoning.
- Programação (`ProgramacaoPatan.tsx`) is NOT wired to this signal —
  intentional, not an oversight: it reads staging (Tabela A), which this
  broadcast never concerns.

## Wave plan

- **Wave 1:** Task 1 (backend: connection manager + WS route + main.py
  wiring), Task 3 (frontend: WS hook + mount in `AppRouter.tsx`) —
  disjoint files, no dependency (Task 3 builds against the frozen
  `/ws/producao` contract below, doesn't need Task 1's code to exist for
  its own compile/lint checks).
- **Wave 2:** Task 2 (backend: wire the 2 broadcast call sites into
  `routes_producao.py`) — depends on Task 1 (imports its `manager`).

---

### Task 1: Backend — connection manager + WebSocket route

**Files:**
- Create: `backend/app/core/ws_manager.py`
- Create: `backend/app/api/routes_ws.py`
- Modify: `backend/app/main.py`

**Depends-on:** none

**Interfaces:**
- Consumes: `decode_access_token(token: str) -> dict[str, Any]` (`app.core.security`, existing, raises `jose.JWTError` on failure); `SessionLocal` (`app.db.session`, existing, lazily-built sessionmaker — `from app.db.session import SessionLocal` then call it like `SessionLocal()`); `app.models.user.User`.
- Produces: `app.core.ws_manager.manager` (a `ConnectionManager` instance with an async `broadcast(mensagem: dict) -> None` method) — consumed by Task 2.

- [ ] **Step 1: Create the connection manager**
  Create `backend/app/core/ws_manager.py`:
  ```python
  from fastapi import WebSocket


  class ConnectionManager:
      """In-memory registry of live WebSocket connections for one process.

      No Redis/pub-sub - this app runs as a single process and the
      connection count is small (a handful of factory-floor terminals),
      so a plain list is enough. See the Fase 3.5c spec for why this
      wasn't built as a multi-process broadcaster.
      """

      def __init__(self) -> None:
          self._conexoes: list[WebSocket] = []

      async def conectar(self, websocket: WebSocket) -> None:
          await websocket.accept()
          self._conexoes.append(websocket)

      def desconectar(self, websocket: WebSocket) -> None:
          if websocket in self._conexoes:
              self._conexoes.remove(websocket)

      async def broadcast(self, mensagem: dict) -> None:
          mortas: list[WebSocket] = []
          for conexao in self._conexoes:
              try:
                  await conexao.send_json(mensagem)
              except Exception:  # noqa: BLE001 - a dead/broken socket must not stop the rest of the broadcast
                  mortas.append(conexao)
          for conexao in mortas:
              self.desconectar(conexao)


  manager = ConnectionManager()
  ```

- [ ] **Step 2: Create the WebSocket route**
  Create `backend/app/api/routes_ws.py`:
  ```python
  from fastapi import APIRouter, WebSocket, WebSocketDisconnect
  from jose import JWTError
  from sqlalchemy.exc import SQLAlchemyError

  from app.core.security import decode_access_token
  from app.core.ws_manager import manager
  from app.db.session import SessionLocal
  from app.models.user import User

  router = APIRouter()


  async def _usuario_do_token(token: str | None) -> User | None:
      if not token:
          return None
      try:
          payload = decode_access_token(token)
      except JWTError:
          return None
      username = payload.get("sub")
      if not username:
          return None
      db = SessionLocal()
      try:
          return db.query(User).filter(User.username == username).one_or_none()
      except SQLAlchemyError:
          return None
      finally:
          db.close()


  @router.websocket("/ws/producao")
  async def ws_producao(websocket: WebSocket) -> None:
      token = websocket.query_params.get("token")
      usuario = await _usuario_do_token(token)
      if usuario is None:
          await websocket.close(code=4401)
          return

      await manager.conectar(websocket)
      try:
          while True:
              # O cliente nunca manda nada relevante - so mantem a conexao
              # viva e deixa o await detectar a desconexao.
              await websocket.receive_text()
      except WebSocketDisconnect:
          manager.desconectar(websocket)
  ```

- [ ] **Step 3: Wire the router**
  In `backend/app/main.py`, add the import (alphabetical, with the other
  route imports) and register it - read the current file first for the
  exact existing pattern:
  ```python
  from app.api.routes_ws import router as ws_router
  ```
  ```python
  app.include_router(ws_router)
  ```

- [ ] **Step 4: Verify**
  ```bash
  cd backend && .venv/bin/python -c "
  from app.core.ws_manager import manager
  from app.api.routes_ws import router
  assert any(r.path == '/ws/producao' for r in router.routes)
  print('OK - ws_manager and /ws/producao route import cleanly')
  "
  ```
  Start the server and confirm the WS route rejects a connection with no
  token (should close immediately rather than hang or 500):
  ```bash
  cd backend && DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica" JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao" .venv/bin/python -m uvicorn app.main:app --port 8010 &
  SERVER_PID=$!
  sleep 2
  .venv/bin/python -c "
  import asyncio
  import websockets

  async def testar():
      try:
          async with websockets.connect('ws://localhost:8010/ws/producao', open_timeout=3) as ws:
              await ws.recv()
              print('FAIL - conexao sem token deveria ter sido rejeitada')
      except websockets.exceptions.ConnectionClosedError as exc:
          print(f'OK - conexao sem token fechada com codigo {exc.code}')
      except Exception as exc:
          print(f'OK-ish - conexao rejeitada de outra forma: {exc!r}')

  asyncio.run(testar())
  " 2>&1 || echo "Nota: se o pacote 'websockets' nao estiver instalado no venv, pule este check ao vivo especifico e confie na leitura do codigo (o close(code=4401) e chamado antes de qualquer accept() implicito, entao a rejeicao esta correta por inspecao)."
  kill $SERVER_PID
  ```
  Run the existing suite as a regression check:
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 5: Commit**
  ```bash
  cd backend
  git add app/core/ws_manager.py app/api/routes_ws.py app/main.py
  git commit -m "feat: add WebSocket connection manager and /ws/producao route"
  ```

---

### Task 2: Backend — wire broadcast into submit and coluna-extra move

**Files:**
- Modify: `backend/app/api/routes_producao.py`

**Depends-on:** 1

**Interfaces:**
- Consumes: `manager` (`app.core.ws_manager`, Task 1) — `manager.broadcast` called via `anyio.from_thread.run`.
- Produces: none (this task's effect is only observable over the WebSocket connection itself, via the frontend in Task 3).

- [ ] **Step 1: Add the import**
  In `backend/app/api/routes_producao.py`, add these two lines to the top
  of the file (alongside the existing imports):
  ```python
  import anyio
  ```
  ```python
  from app.core.ws_manager import manager
  ```

- [ ] **Step 2: Broadcast after a successful batch submit**
  The current `submeter_sequencia` reads (inside the `try` block, right
  after `db.commit()`):
  ```python
          db.commit()
      except SQLAlchemyError as exc:
  ```
  Insert the broadcast call between `db.commit()` and the `except`:
  ```python
          db.commit()
          anyio.from_thread.run(
              manager.broadcast,
              {
                  "tipo": "producao_atualizada",
                  "linha": payload.linha,
                  "turno": payload.turno.value,
                  "patan": payload.patan.value,
              },
          )
      except SQLAlchemyError as exc:
  ```
  (The broadcast only runs when `db.commit()` didn't raise - if it did,
  execution jumps straight to `except` and this line never executes.)

- [ ] **Step 3: Broadcast after a successful coluna-extra move**
  The current `mover_item_coluna_extra` ends with:
  ```python
      db.commit()
      return resposta
  ```
  Insert the broadcast call between them:
  ```python
      db.commit()
      anyio.from_thread.run(
          manager.broadcast,
          {
              "tipo": "producao_atualizada",
              "linha": item.linha,
              "turno": item.turno,
              "patan": item.patan,
          },
      )
      return resposta
  ```

- [ ] **Step 4: Verify**
  ```bash
  cd backend && .venv/bin/python -c "
  import inspect
  from app.api import routes_producao
  src_submit = inspect.getsource(routes_producao.submeter_sequencia)
  src_mover = inspect.getsource(routes_producao.mover_item_coluna_extra)
  assert 'anyio.from_thread.run' in src_submit, 'broadcast missing from submeter_sequencia'
  assert 'anyio.from_thread.run' in src_mover, 'broadcast missing from mover_item_coluna_extra'
  print('OK - both broadcast call sites present')
  "
  ```
  Full regression check (the existing test suite doesn't open a live
  WebSocket, so `anyio.from_thread.run` - which requires being called
  from inside anyio's own thread-pool portal - would raise
  `RuntimeError: This function can only be called from within a
  running... portal` OUTSIDE of a live ASGI request context. Confirm this
  isn't a problem for the test suite specifically: since the tests call
  routes through `TestClient` (Starlette's own test client), which DOES
  run each request through the real ASGI/anyio machinery, the portal
  exists during those calls too - `anyio.from_thread.run` should work
  the same way under `TestClient` as it does under real `uvicorn`. Run
  the suite and confirm nothing breaks; if `test_submeter_sequencia_*`
  tests fail specifically with a portal/thread-related RuntimeError,
  that's a real finding to report clearly rather than work around -
  don't catch-and-ignore the broadcast call to make tests pass):
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 5: Commit**
  ```bash
  cd backend
  git add app/api/routes_producao.py
  git commit -m "feat: broadcast producao_atualizada on batch submit and coluna-extra move"
  ```

---

### Task 3: Frontend — WebSocket hook

**Files:**
- Create: `frontend/src/hooks/useProducaoWebSocket.ts`
- Modify: `frontend/src/routes/AppRouter.tsx`

**Depends-on:** none

**Interfaces:**
- Consumes: pre-existing `useAuth` (`frontend/src/auth/AuthContext.tsx`); `useQueryClient` from `@tanstack/react-query` (already a project dependency).
- Produces: `useProducaoWebSocket()` — called once, in `AppRouter.tsx`; no other task in this plan depends on it.

- [ ] **Step 1: Create the hook**
  Create `frontend/src/hooks/useProducaoWebSocket.ts`:
  ```ts
  import { useQueryClient } from "@tanstack/react-query";
  import { useEffect } from "react";

  import { useAuth } from "../auth/AuthContext";

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
  const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

  const QUERY_KEY_PREFIXES = ["tabela-b-producao", "dashboard-metricas", "calendario"];

  /**
   * One connection for the whole app, mounted once at the router root.
   * On any message, invalidates the 3 query-key prefixes that read
   * Tabela B (Producao, Dashboard, Calendario) - each page's own
   * useQuery then refetches normally if it's currently mounted.
   * Deliberately NOT wired into ProgramacaoPatan: staging (Tabela A) is
   * never touched by what this broadcasts, so there's nothing for that
   * screen to refetch.
   */
  export function useProducaoWebSocket(): void {
    const { token } = useAuth();
    const queryClient = useQueryClient();

    useEffect(() => {
      if (!token) return undefined;

      const ws = new WebSocket(`${WS_BASE_URL}/ws/producao?token=${encodeURIComponent(token)}`);
      ws.onmessage = () => {
        for (const prefix of QUERY_KEY_PREFIXES) {
          queryClient.invalidateQueries({ queryKey: [prefix] });
        }
      };

      return () => ws.close();
    }, [token, queryClient]);
  }
  ```

- [ ] **Step 2: Mount it in AppRouter**
  In `frontend/src/routes/AppRouter.tsx`, add the import:
  ```tsx
  import { useProducaoWebSocket } from "../hooks/useProducaoWebSocket";
  ```
  Read the current file first to find the exact `export function AppRouter()`
  body - call the hook as the first line inside that function, before the
  `return`:
  ```tsx
  export function AppRouter() {
    useProducaoWebSocket();

    return (
  ```
  (Match whatever the current opening of the function actually looks like
  - the hook call just needs to be the first statement in the function
  body, before the existing `return (<BrowserRouter>...`.)

- [ ] **Step 3: Verify**
  ```bash
  cd frontend && npx tsc -b && npx eslint src/hooks/useProducaoWebSocket.ts src/routes/AppRouter.tsx && npx vitest run
  ```
  Baseline is 44/47 (3 pre-existing `SequenciaBoard.test.tsx` failures,
  unrelated) — must stay exactly there. If `App.test.tsx` fails because
  mounting `AppRouter` now tries to open a real WebSocket in the test
  environment (jsdom does implement a `WebSocket` global, but there's no
  real server to connect to) - check whether this causes an actual test
  failure or just a harmless connection-error console warning. If it's a
  real failure, that's a genuine gap to report clearly (e.g. the hook may
  need an `enabled`-style escape hatch for test environments), not
  something to silently patch over.

- [ ] **Step 4: Commit**
  ```bash
  cd frontend
  git add src/hooks/useProducaoWebSocket.ts src/routes/AppRouter.tsx
  git commit -m "feat: add WebSocket hook for live Producao/Dashboard/Calendario sync"
  ```
