# Fase 3.5a — Colunas Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin/programador-managed "coluna extra" catalog (e.g. "Quebra de
Ferramenta", "Concluídas") + a nullable `coluna_extra_id` on `ItemProducao`
so a published item can be classified into one via a dropdown on the
Produção screen.

**Architecture:** New `ColunaExtra` model + migration (adds the table and
the nullable FK column on `producao`), schemas, repository functions, and
routes — all added to the existing `producao`-domain files (same bounded
context, direct FK relationship). Frontend: types + client functions +
a dropdown per card and a small admin/programador-only create/delete
section on `Producao.tsx`.

**Tech Stack:** Same as the rest of the app, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-27-fase3-colunas-extras-design.md`

## Global Constraints

- Tests deferred, no per-task code-reviewer dispatch — same ongoing user
  instruction as every sub-project this session.
- `POST /colunas-extras` and `DELETE /colunas-extras/{id}`: admin/
  programador only (`require_role(Role.ADMIN, Role.PROGRAMADOR)`, the
  same helper `submeter_sequencia` already uses — do not invent a new
  role-check mechanism).
- `GET /colunas-extras` and `PATCH .../coluna-extra`: any authenticated
  user, no extra role check.
- Deleting a coluna extra must NOT delete or block-on items currently
  assigned to it — `ON DELETE SET NULL` at the DB level, items just
  revert to unclassified.
- This does NOT touch `bulk_persist`, `ItemProducaoBulkIn`, or the
  staging/Programação submit flow at all — `coluna_extra_id` is a
  Produção-only, post-publish concept, set exclusively through the new
  `PATCH` route.

## Wave plan

- **Wave 1:** Task 1 (backend: model+migration+schemas+repository+routes),
  Task 2 (frontend: types+API client) — disjoint files, no dependency.
- **Wave 2:** Task 3 (frontend: dropdown + admin/programador create/delete
  UI on `Producao.tsx`) — depends on Task 2.

---

### Task 1: Backend — coluna_extra model, migration, schemas, repository, routes

**Files:**
- Modify: `backend/app/models/producao.py`
- Create: `backend/alembic/versions/0004_coluna_extra.py`
- Modify: `backend/alembic/env.py`
- Modify: `backend/app/schemas/producao.py`
- Modify: `backend/app/repositories/producao_repository.py`
- Modify: `backend/app/api/routes_producao.py`

**Depends-on:** none

**Interfaces:**
- Consumes: existing `Base` (`app.db.session`), existing `ItemProducao`, existing `require_role`/`Role`/`get_current_user` auth helpers already imported in `routes_producao.py`.
- Produces: `app.models.producao.ColunaExtra` (`id: int`, `nome: str`); `ItemProducao.coluna_extra_id: int | None`; the 4 new routes — nothing else in this plan imports these directly (Task 2/3 call the routes over HTTP).

- [ ] **Step 1: Add the model**
  In `backend/app/models/producao.py`, add these imports to the existing
  `from sqlalchemy import ...` line (merge with what's already there —
  read the file first to see the exact current line):
  ```python
  ForeignKey
  ```
  Add the new model (anywhere in the file, e.g. right before
  `ItemProducaoStaging`):
  ```python
  class ColunaExtra(Base):
      """Admin/programador-managed outcome column (e.g. "Quebra de
      Ferramenta", "Concluidas") - independent of STATUS. Items reference
      this via ItemProducao.coluna_extra_id (nullable - NULL means
      unclassified/normal flow).
      """

      __tablename__ = "coluna_extra"

      id: Mapped[int] = mapped_column(primary_key=True)
      nome: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
  ```
  Add the new column to the existing `ItemProducao` class (after
  `em_producao`):
  ```python
      coluna_extra_id: Mapped[int | None] = mapped_column(
          Integer, ForeignKey("coluna_extra.id", ondelete="SET NULL"), nullable=True
      )
  ```

- [ ] **Step 2: Create the migration**
  First check the actual revision id of migration `0003` (read
  `backend/alembic/versions/0003_colaboracao_tables.py`'s `revision =`
  line - it should be `"0003"`, matching the filename, but confirm rather
  than assume). Create `backend/alembic/versions/0004_coluna_extra.py`:
  ```python
  """add coluna_extra table and ItemProducao.coluna_extra_id

  Revision ID: 0004
  Revises: 0003
  Create Date: 2026-08-27

  """
  import sqlalchemy as sa

  from alembic import op

  revision = "0004"
  down_revision = "0003"
  branch_labels = None
  depends_on = None


  def upgrade() -> None:
      op.create_table(
          "coluna_extra",
          sa.Column("id", sa.Integer(), primary_key=True),
          sa.Column("nome", sa.String(length=100), nullable=False),
      )
      op.create_index("ix_coluna_extra_nome", "coluna_extra", ["nome"], unique=True)
      op.add_column(
          "producao",
          sa.Column(
              "coluna_extra_id",
              sa.Integer(),
              sa.ForeignKey("coluna_extra.id", ondelete="SET NULL"),
              nullable=True,
          ),
      )


  def downgrade() -> None:
      op.drop_column("producao", "coluna_extra_id")
      op.drop_index("ix_coluna_extra_nome", table_name="coluna_extra")
      op.drop_table("coluna_extra")
  ```

- [ ] **Step 3: Register the model in Alembic's target_metadata**
  In `backend/alembic/env.py`, find the line importing from
  `app.models.producao` (currently `from app.models.producao import
  ItemProducao, ItemProducaoStaging  # noqa: F401`) and add `ColunaExtra`
  to it, alphabetical:
  ```python
  from app.models.producao import ColunaExtra, ItemProducao, ItemProducaoStaging  # noqa: F401
  ```

- [ ] **Step 4: Verify the migration applies cleanly**
  ```bash
  cd backend && DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica" JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao" .venv/bin/python -m alembic upgrade head
  ```
  Expect revision `0004` applied with no error.

- [ ] **Step 5: Add the schemas**
  In `backend/app/schemas/producao.py`, add:
  ```python
  class ColunaExtraOut(BaseModel):
      id: int
      nome: str

      model_config = ConfigDict(from_attributes=True)


  class ColunaExtraCreate(BaseModel):
      nome: str


  class MoverColunaExtraRequest(BaseModel):
      coluna_extra_id: int | None
  ```
  Read the top of the file first to confirm `BaseModel`/`ConfigDict` are
  already imported (they should be, from the existing schemas there) - add
  to the existing import line rather than duplicating it. Also add
  `coluna_extra_id: int | None = None` as a field on the existing
  `ItemProducaoOut` class (so it round-trips through every route that
  already returns that schema).

- [ ] **Step 6: Add the repository functions**
  In `backend/app/repositories/producao_repository.py`, append:
  ```python
  from app.models.producao import ColunaExtra  # add to the existing models import line


  def listar_colunas_extras(db: Session) -> list[ColunaExtra]:
      return list(db.scalars(select(ColunaExtra).order_by(ColunaExtra.nome)).all())


  def criar_coluna_extra(db: Session, nome: str) -> ColunaExtra:
      coluna = ColunaExtra(nome=nome)
      db.add(coluna)
      db.flush()
      return coluna


  def remover_coluna_extra(db: Session, coluna_extra_id: int) -> bool:
      coluna = db.get(ColunaExtra, coluna_extra_id)
      if coluna is None:
          return False
      db.delete(coluna)
      db.flush()
      return True


  def mover_para_coluna_extra(
      db: Session, item_id: int, coluna_extra_id: int | None
  ) -> ItemProducao | None:
      item = db.get(ItemProducao, item_id)
      if item is None:
          return None
      item.coluna_extra_id = coluna_extra_id
      db.flush()
      return item
  ```
  (`select` and `Session` are already imported at the top of this file.)

- [ ] **Step 7: Add the routes**
  In `backend/app/api/routes_producao.py`, add to the existing
  repository-function import block:
  ```python
  criar_coluna_extra,
  listar_colunas_extras,
  mover_para_coluna_extra,
  remover_coluna_extra,
  ```
  (alphabetical within the existing `from app.repositories.producao_repository import (...)` block)
  and add `ColunaExtraCreate, ColunaExtraOut, MoverColunaExtraRequest` to
  the existing `from app.schemas.producao import (...)` line.

  Append these routes at the end of the file:
  ```python
  @router.get("/colunas-extras", response_model=list[ColunaExtraOut])
  def listar_colunas(
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> list[ColunaExtraOut]:
      return listar_colunas_extras(db)


  @router.post(
      "/colunas-extras", response_model=ColunaExtraOut, status_code=status.HTTP_201_CREATED
  )
  def criar_coluna(
      payload: ColunaExtraCreate,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
  ) -> ColunaExtraOut:
      coluna = criar_coluna_extra(db, payload.nome)
      resposta = ColunaExtraOut(id=coluna.id, nome=coluna.nome)
      db.commit()
      return resposta


  @router.delete("/colunas-extras/{coluna_extra_id}", status_code=status.HTTP_204_NO_CONTENT)
  def remover_coluna(
      coluna_extra_id: int,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
  ) -> None:
      if not remover_coluna_extra(db, coluna_extra_id):
          raise HTTPException(
              status_code=status.HTTP_404_NOT_FOUND, detail="Coluna extra nao encontrada."
          )
      db.commit()


  @router.patch("/itens/{item_id}/coluna-extra", response_model=ItemProducaoOut)
  def mover_item_coluna_extra(
      item_id: int,
      payload: MoverColunaExtraRequest,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> ItemProducaoOut:
      item = mover_para_coluna_extra(db, item_id, payload.coluna_extra_id)
      if item is None:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado.")
      resposta = ItemProducaoOut(
          id=item.id,
          linha=item.linha,
          turno=item.turno,
          patan=item.patan,
          posto_trabalho=item.posto_trabalho,
          status=item.status,
          sequencia=item.sequencia,
          hora_inicial=item.hora_inicial,
          hora_final=item.hora_final,
          almoco_incluso=item.almoco_incluso,
          kanbans=item.kanbans,
          qtd_por_kanban=item.qtd_por_kanban,
          tempo_por_peca_minutos=item.tempo_por_peca_minutos,
          is_critico=item.is_critico,
          tem_falta_estoque=False,
          coluna_extra_id=item.coluna_extra_id,
      )
      db.commit()
      return resposta
  ```
  This route's path is `/itens/{item_id}/coluna-extra` - combined with the
  router's existing `prefix="/producao"`, the full path is
  `/producao/itens/{item_id}/coluna-extra`, matching the spec.

  Also update `listar_tabela_b`'s existing `ItemProducaoOut(...)`
  construction (added in the Calendário plan) to include
  `coluna_extra_id=r.coluna_extra_id`, and `submeter_sequencia`'s existing
  construction to include `coluna_extra_id=item.coluna_extra_id` (a
  freshly-created item's `coluna_extra_id` is always `None` at creation
  time, but read it from the object rather than hardcoding `None`, for
  correctness if that ever changes), and `obter_sequencia`'s construction
  to include `coluna_extra_id=None` explicitly (staging rows have no such
  concept - hardcode `None`, same pattern already used there for other
  Tabela-B-only fields).

- [ ] **Step 8: Verify**
  ```bash
  cd backend && .venv/bin/python -c "
  from app.api.routes_producao import router
  paths = {(r.path, tuple(sorted(r.methods))) for r in router.routes}
  for p in ['/producao/colunas-extras', '/producao/itens/{item_id}/coluna-extra']:
      assert any(path == p for path, _ in paths), f'missing {p}'
  print('OK - all new routes registered')
  "
  ```
  Against real Postgres (already migrated through 0004 by Step 4):
  ```bash
  cd backend && DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica" JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao" .venv/bin/python -c "
  from sqlalchemy import create_engine
  from sqlalchemy.orm import sessionmaker

  from app.repositories.producao_repository import (
      criar_coluna_extra, listar_colunas_extras, mover_para_coluna_extra, remover_coluna_extra,
  )

  engine = create_engine('postgresql+psycopg://planner:planner@localhost:5432/planner_logistica')
  db = sessionmaker(bind=engine)()

  coluna = criar_coluna_extra(db, 'Teste Verificacao')
  assert coluna.id is not None
  todas = listar_colunas_extras(db)
  assert any(c.id == coluna.id for c in todas)
  removido = remover_coluna_extra(db, coluna.id)
  assert removido is True
  db.rollback()  # discard the verification row, do not pollute the dev DB
  db.close()
  print('OK - coluna_extra CRUD works')
  "
  ```
  Run the existing suite as a regression check:
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 9: Commit**
  ```bash
  cd backend
  git add app/models/producao.py alembic/versions/0004_coluna_extra.py alembic/env.py app/schemas/producao.py app/repositories/producao_repository.py app/api/routes_producao.py
  git commit -m "feat: add coluna_extra (admin/programador outcome columns on Producao)"
  ```

---

### Task 2: Frontend — coluna-extra types + API client

**Files:**
- Modify: `frontend/src/types/producao.ts`
- Modify: `frontend/src/services/api.ts`

**Depends-on:** none

**Interfaces:**
- Consumes: none from earlier tasks; reuses existing `authHeaders`, `parseJsonOrThrow`, `API_BASE_URL`, `ApiError`.
- Produces: `ColunaExtra` type, `ItemProducao.coluna_extra_id` field, `listarColunasExtras`, `criarColunaExtra`, `removerColunaExtra`, `moverParaColunaExtra` — all consumed by Task 3.

- [ ] **Step 1: Add the type and extend ItemProducao**
  In `frontend/src/types/producao.ts`, add:
  ```ts
  export interface ColunaExtra {
    id: number;
    nome: string;
  }
  ```
  And add `coluna_extra_id: number | null;` as a field on the existing
  `ItemProducao` interface (anywhere in the field list, e.g. right after
  `tem_falta_estoque`).

- [ ] **Step 2: Add the client functions**
  In `frontend/src/services/api.ts`, append:
  ```ts
  export async function listarColunasExtras(token: string): Promise<ColunaExtra[]> {
    const response = await fetch(`${API_BASE_URL}/producao/colunas-extras`, {
      headers: authHeaders(token),
    });
    return parseJsonOrThrow<ColunaExtra[]>(response);
  }

  export async function criarColunaExtra(token: string, nome: string): Promise<ColunaExtra> {
    const response = await fetch(`${API_BASE_URL}/producao/colunas-extras`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ nome }),
    });
    return parseJsonOrThrow<ColunaExtra>(response);
  }

  export async function removerColunaExtra(token: string, colunaExtraId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/producao/colunas-extras/${colunaExtraId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    if (!response.ok) {
      throw new ApiError(response.status, "Falha ao remover coluna extra.");
    }
  }

  export async function moverParaColunaExtra(
    token: string,
    itemId: number,
    colunaExtraId: number | null
  ): Promise<ItemProducao> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/coluna-extra`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ coluna_extra_id: colunaExtraId }),
    });
    return parseJsonOrThrow<ItemProducao>(response);
  }
  ```
  `ColunaExtra` needs to join the existing `import type { ... } from
  "../types/producao"` line at the top of this file (it currently imports
  `BulkSubmitRequest, ItemProducao, SequenciaResponse` - add `ColunaExtra`
  to that same line, alphabetical).

- [ ] **Step 3: Verify**
  ```bash
  cd frontend && npx tsc -b && npx eslint src/services/api.ts src/types/producao.ts && npx vitest run
  ```
  Baseline is 44/47 (3 pre-existing `SequenciaBoard.test.tsx` failures,
  unrelated) — must stay exactly there.

- [ ] **Step 4: Commit**
  ```bash
  cd frontend
  git add src/types/producao.ts src/services/api.ts
  git commit -m "feat: add coluna-extra types and API client functions"
  ```

---

### Task 3: Frontend — coluna extra UI on Produção

**Files:**
- Modify: `frontend/src/pages/Producao.tsx`

**Depends-on:** 2

**Interfaces:**
- Consumes: `listarColunasExtras`, `criarColunaExtra`, `removerColunaExtra`, `moverParaColunaExtra` (Task 2, `services/api.ts`); `ColunaExtra` type (Task 2, `types/producao.ts`).
- Produces: none (last task of this plan).

- [ ] **Step 1: Add the coluna-extra fetch, dropdown, and admin section**
  Read the CURRENT `frontend/src/pages/Producao.tsx` first (it already has
  `role`, `token`, `logout` from `useAuth()`, the existing filter row, and
  `<SequenciaBoard>` — this task adds alongside that, does not restructure
  it). Add:
  - Import `listarColunasExtras, criarColunaExtra, removerColunaExtra,
    moverParaColunaExtra` into the existing `services/api` import line.
  - A `useQuery` for the coluna-extra catalog (`queryKey:
    ["colunas-extras"]`, `queryFn: () => listarColunasExtras(token as
    string)`, `enabled: Boolean(token)`).
  - For each rendered item card, a `<select>` showing "Sem coluna extra"
    plus one `<option>` per catalog entry, `value={item.coluna_extra_id ??
    ""}`, `onChange` calling `moverParaColunaExtra(token, item.id,
    event.target.value ? Number(event.target.value) : null)` then
    refetching the board's own query (`queryClient.invalidateQueries` on
    the `["tabela-b-producao", ...]` key, or simplest: call
    `query.refetch()` if that ref is in scope — match whatever the
    existing `useQuery` call in this file already exposes). This dropdown
    only needs to render for items where `item.id !== null` (a real,
    persisted item — matches the same guard already used elsewhere in this
    codebase for id-dependent actions).
  - A small section below the filters, visible only when `role === "admin"
    || role === "programador"`: a text input + "Criar coluna" button
    calling `criarColunaExtra(token, nome)` then refetching the
    colunas-extras query, and a list of existing columns each with a
    "Remover" button calling `removerColunaExtra(token, coluna.id)` then
    refetching.
  - Wrap any `moverParaColunaExtra`/`criarColunaExtra`/`removerColunaExtra`
    call in the same try/catch-401-logout pattern already used elsewhere
    in this file (`ApiError` is already imported).

  Write the actual JSX/TS code directly in the file to accomplish this -
  match the existing Tailwind class conventions already used in this file
  (`FIELD_LABEL_CLASSES`/`FIELD_INPUT_CLASSES` and the general spacing/
  color palette) rather than inventing a new visual style.

- [ ] **Step 2: Verify**
  ```bash
  cd frontend && npx tsc -b && npx eslint src/pages/Producao.tsx
  ```
  Then the full suite:
  ```bash
  cd frontend && npx vitest run
  ```
  Baseline is 44/47 (3 pre-existing `SequenciaBoard.test.tsx` failures,
  unrelated). If `Producao.test.tsx` fails only because it now finds new
  elements (the dropdown, the admin section) it didn't expect - not
  because an existing assertion on something else broke - that's expected
  collateral from real new UI, note it plainly rather than hiding the new
  UI to keep the old test passing unchanged.

- [ ] **Step 3: Commit**
  ```bash
  cd frontend
  git add src/pages/Producao.tsx
  git commit -m "feat: add coluna-extra dropdown and admin management UI to Producao"
  ```
