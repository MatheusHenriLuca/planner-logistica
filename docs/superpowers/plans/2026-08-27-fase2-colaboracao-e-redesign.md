# Fase 2 — Colaboração + Redesign UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add checklist, label, comentário, and anexo (link-style attachment) to
`ItemProducao` (Tabela B), seeded with sensible defaults on creation, plus a
full Tailwind-based visual redesign of every existing screen — while keeping
Fase 1's sequencing/RBAC/persistence behavior byte-for-byte unchanged.

**Architecture:** 5 new backend tables (`checklist_item`, `label`,
`item_producao_label`, `comentario`, `anexo`), a repository + schema + route
layer per the project's existing conventions, `bulk_persist` extended to seed
a 5-step default checklist per newly created item. Frontend gains a Tailwind
design system, a collaboration API client, a compact read-only footer on each
`SequenciaCard` (checklist progress, label chips, comment/anexo counts), and
an `ItemDetalhe` panel for full interaction. All 6 existing screens get a pure
visual redesign (no logic changes).

**Tech Stack:** FastAPI + SQLAlchemy 2.x + Alembic + PostgreSQL (backend);
React + Vite + TypeScript + Tailwind CSS + `@tanstack/react-query` +
`@dnd-kit` (frontend) — all already in place except Tailwind, added in Task 10.

**Spec:** `docs/superpowers/specs/2026-08-27-fase2-colaboracao-e-redesign-design.md`

## Global Constraints

- Tests are deferred to a single gate at the end of the whole phase, per
  explicit user instruction — no task writes new automated tests. Every task
  still runs the EXISTING suite (`pytest` / `vitest run`) as a regression
  check, and still gets a normal `code-reviewer` pass (code quality/bugs,
  which is not "testing" or "security" in the sense the user asked to defer).
- `security-reviewer`/`penetration-tester` passes are deferred to the same
  end-of-phase gate — do not dispatch them per-task.
- RBAC for every new collaboration route: any authenticated user (`admin`,
  `programador`, `usuario_comum`) — no additional per-feature role or
  ownership check. Page-level RBAC (who can reach a screen at all) is
  unchanged from Fase 1.
- Anexo is a link (título + URL) for this phase — no file upload/storage.
- No task changes Fase 1 sequencing/cascade/escadinha logic, RBAC gating, or
  bulk-submit all-or-nothing semantics — only additive schema/routes plus
  pure-visual changes to existing components.
- Implementers do NOT self-commit inside a parallel wave — the controller
  serializes commits per task after each wave
  (`.claude/rules/08-parallel-subagent-driven-development.md`). Where a
  task's own steps below include a `git commit` step, the controller runs it
  after verifying that task's diff, not the implementer.

## Wave plan (from Files/Depends-on tags below)

- **Wave 1:** Task 1 (backend models/migration), Task 10 (Tailwind setup), Task 11 (frontend API client) — all disjoint files, no mutual dependency.
- **Wave 2:** Task 2 (schemas), Task 3 (repository) — both depend only on Task 1.
- **Wave 3:** Task 4 (bulk_persist seeding), Task 5 (checklist routes), Task 6 (label routes), Task 7 (comentario routes), Task 8 (anexo routes), Task 12 (Nav redesign), Task 13 (Login/Register redesign), Task 14 (Usuarios redesign), Task 15 (Produção/Programação redesign) — all depend only on Wave 1/2 tasks, disjoint files within this wave.
- **Wave 4:** Task 9 (wire routers), Task 16 (SequenciaCard redesign + footer) — Task 9 depends on 5-8; Task 16 depends on 10, 11.
- **Wave 5:** Task 17 (ItemDetalhe panel + wire click) — depends on 11, 16.

---

### Task 1: Migration + models for colaboracao tables, plus seed data

**Files:**
- Create: `backend/app/models/colaboracao.py`
- Create: `backend/alembic/versions/0003_colaboracao_tables.py`
- Modify: `backend/alembic/env.py:8-9`

**Depends-on:** none

**Interfaces:**
- Consumes: existing tables `producao` (`app.models.producao.ItemProducao.__tablename__`) and `users` (`app.models.user.User.__tablename__`) as FK targets — DDL-level reference only, no Python import from the migration.
- Produces:
  - `app.models.colaboracao.ChecklistItem` — `id: int`, `item_producao_id: int`, `texto: str`, `concluido: bool`, `ordem: int`
  - `app.models.colaboracao.Label` — `id: int`, `nome: str`, `cor: str`
  - `app.models.colaboracao.ItemProducaoLabel` — `item_producao_id: int`, `label_id: int` (composite PK, no `id`)
  - `app.models.colaboracao.Comentario` — `id: int`, `item_producao_id: int`, `autor_id: int`, `texto: str`, `criado_em: datetime`
  - `app.models.colaboracao.Anexo` — `id: int`, `item_producao_id: int`, `titulo: str`, `url: str`, `enviado_por: int`, `criado_em: datetime`
  - Alembic revision `"0003"` (`down_revision = "0002"`), applied by `alembic upgrade head`
  - Exactly 6 pre-seeded `label` rows (see Step 2) — later tasks/frontend must not invent different ones

**Design note (read before writing code):** `producao_repository.bulk_persist` (existing, unmodified by this task) deletes and re-inserts every non-`em_producao` `ItemProducao` row on **every** resubmission of a `(linha, turno, patan)` scope — confirmed by reading the function: it always excludes `"id"` from the row it constructs, regardless of whether the submitted item carried an id. Task 4 will seed a checklist for every newly created item, which means the very next resubmission of that scope deletes a `producao` row that now has `checklist_item` children. Without `ondelete="CASCADE"` on every FK targeting `producao.id`, that delete raises a foreign-key violation and the existing, already-shipped bulk-submit endpoint starts throwing 500s. All four `item_producao_id` FKs below use `ondelete="CASCADE"` for exactly this reason — do not drop it as "unnecessary." FKs to `users.id` (`autor_id`, `enviado_por`) and to `label.id` are left as plain `RESTRICT` (default) since user-deletion and label-deletion are rare, deliberate admin actions, not a routine resubmit path.

- [ ] **Step 1: Create the ORM models**
  Create `backend/app/models/colaboracao.py`:
  ```python
  """ORM models for Fase 2 collaboration features (checklist, label, comentario, anexo).

  FK cascade note: producao_repository.bulk_persist deletes and re-inserts every
  non-preserved ItemProducao row on each resubmission of a (linha, turno, patan)
  scope (existing Fase 1 behavior - see that function's own docstring). Every FK
  below that targets producao.id uses ondelete="CASCADE" so a resubmission does
  not raise a FK-violation IntegrityError when a resequenced item already has
  checklist/label/comment/attachment rows: the child rows are cleared along with
  the row they belong to, instead of blocking the delete. A plain reorder-and-
  resubmit therefore clears an item's collaboration data - a consequence of
  bulk_persist's replace-not-update design, not something this migration can fix
  without redesigning bulk_persist itself (out of scope here).
  """

  from datetime import datetime

  from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
  from sqlalchemy.orm import Mapped, mapped_column

  from app.db.session import Base


  class ChecklistItem(Base):
      """Checklist step attached to an ItemProducao (Tabela B) card."""

      __tablename__ = "checklist_item"

      id: Mapped[int] = mapped_column(primary_key=True)
      item_producao_id: Mapped[int] = mapped_column(
          Integer, ForeignKey("producao.id", ondelete="CASCADE"), nullable=False
      )
      texto: Mapped[str] = mapped_column(Text, nullable=False)
      concluido: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
      ordem: Mapped[int] = mapped_column(Integer, nullable=False)


  class Label(Base):
      """Catalog entry for a colored tag; applied to items via ItemProducaoLabel."""

      __tablename__ = "label"

      id: Mapped[int] = mapped_column(primary_key=True)
      nome: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
      cor: Mapped[str] = mapped_column(String(20), nullable=False)


  class ItemProducaoLabel(Base):
      """Join table: which labels are applied to which ItemProducao (N:N)."""

      __tablename__ = "item_producao_label"

      item_producao_id: Mapped[int] = mapped_column(
          Integer, ForeignKey("producao.id", ondelete="CASCADE"), primary_key=True
      )
      label_id: Mapped[int] = mapped_column(Integer, ForeignKey("label.id"), primary_key=True)


  class Comentario(Base):
      """Comment thread entry on an ItemProducao card."""

      __tablename__ = "comentario"

      id: Mapped[int] = mapped_column(primary_key=True)
      item_producao_id: Mapped[int] = mapped_column(
          Integer, ForeignKey("producao.id", ondelete="CASCADE"), nullable=False
      )
      autor_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
      texto: Mapped[str] = mapped_column(Text, nullable=False)
      # DB-computed timestamp (no Python-side default): criado_em must reflect
      # when Postgres persisted the row, not the app server's clock.
      criado_em: Mapped[datetime] = mapped_column(
          DateTime, nullable=False, server_default=func.now()
      )


  class Anexo(Base):
      """Link-style attachment on an ItemProducao card (title + URL, no file upload)."""

      __tablename__ = "anexo"

      id: Mapped[int] = mapped_column(primary_key=True)
      item_producao_id: Mapped[int] = mapped_column(
          Integer, ForeignKey("producao.id", ondelete="CASCADE"), nullable=False
      )
      titulo: Mapped[str] = mapped_column(Text, nullable=False)
      url: Mapped[str] = mapped_column(Text, nullable=False)
      enviado_por: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
      criado_em: Mapped[datetime] = mapped_column(
          DateTime, nullable=False, server_default=func.now()
      )
  ```

- [ ] **Step 2: Create the migration**
  Create `backend/alembic/versions/0003_colaboracao_tables.py`:
  ```python
  """add colaboracao tables (checklist, label, comentario, anexo)

  Revision ID: 0003
  Revises: 0002
  Create Date: 2026-08-27

  """
  import sqlalchemy as sa

  from alembic import op

  revision = "0003"
  down_revision = "0002"
  branch_labels = None
  depends_on = None

  LABELS_PADRAO = [
      {"nome": "Etiqueta Azul", "cor": "#3B82F6"},
      {"nome": "Etiqueta Verde", "cor": "#22C55E"},
      {"nome": "Etiqueta Amarela", "cor": "#EAB308"},
      {"nome": "Etiqueta Vermelha", "cor": "#EF4444"},
      {"nome": "Etiqueta Roxa", "cor": "#A855F7"},
      {"nome": "Etiqueta Cinza", "cor": "#6B7280"},
  ]


  def upgrade() -> None:
      op.create_table(
          "checklist_item",
          sa.Column("id", sa.Integer(), primary_key=True),
          sa.Column(
              "item_producao_id",
              sa.Integer(),
              sa.ForeignKey("producao.id", ondelete="CASCADE"),
              nullable=False,
          ),
          sa.Column("texto", sa.Text(), nullable=False),
          sa.Column("concluido", sa.Boolean(), nullable=False, server_default=sa.false()),
          sa.Column("ordem", sa.Integer(), nullable=False),
      )

      label_table = op.create_table(
          "label",
          sa.Column("id", sa.Integer(), primary_key=True),
          sa.Column("nome", sa.String(length=50), nullable=False),
          sa.Column("cor", sa.String(length=20), nullable=False),
      )
      op.create_index("ix_label_nome", "label", ["nome"], unique=True)

      op.create_table(
          "item_producao_label",
          sa.Column(
              "item_producao_id",
              sa.Integer(),
              sa.ForeignKey("producao.id", ondelete="CASCADE"),
              primary_key=True,
          ),
          sa.Column("label_id", sa.Integer(), sa.ForeignKey("label.id"), primary_key=True),
      )

      op.create_table(
          "comentario",
          sa.Column("id", sa.Integer(), primary_key=True),
          sa.Column(
              "item_producao_id",
              sa.Integer(),
              sa.ForeignKey("producao.id", ondelete="CASCADE"),
              nullable=False,
          ),
          sa.Column("autor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
          sa.Column("texto", sa.Text(), nullable=False),
          sa.Column("criado_em", sa.DateTime(), nullable=False, server_default=sa.func.now()),
      )

      op.create_table(
          "anexo",
          sa.Column("id", sa.Integer(), primary_key=True),
          sa.Column(
              "item_producao_id",
              sa.Integer(),
              sa.ForeignKey("producao.id", ondelete="CASCADE"),
              nullable=False,
          ),
          sa.Column("titulo", sa.Text(), nullable=False),
          sa.Column("url", sa.Text(), nullable=False),
          sa.Column("enviado_por", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
          sa.Column("criado_em", sa.DateTime(), nullable=False, server_default=sa.func.now()),
      )

      op.bulk_insert(label_table, LABELS_PADRAO)


  def downgrade() -> None:
      op.drop_table("anexo")
      op.drop_table("comentario")
      op.drop_table("item_producao_label")
      op.drop_index("ix_label_nome", table_name="label")
      op.drop_table("label")
      op.drop_table("checklist_item")
  ```

- [ ] **Step 3: Register the new models in Alembic's target_metadata**
  In `backend/alembic/env.py`, this block currently reads:
  ```python
  from app.models.producao import ItemProducao, ItemProducaoStaging  # noqa: F401
  from app.models.user import User  # noqa: F401
  ```
  Replace it with (alphabetical, matching the existing ordering convention):
  ```python
  from app.models.colaboracao import (  # noqa: F401
      Anexo,
      ChecklistItem,
      Comentario,
      ItemProducaoLabel,
      Label,
  )
  from app.models.producao import ItemProducao, ItemProducaoStaging  # noqa: F401
  from app.models.user import User  # noqa: F401
  ```
  This migration itself is hand-written DDL (not autogenerate) so this import isn't required for `upgrade()` to run, but every existing model module is imported here to keep `target_metadata` accurate for any future `alembic revision --autogenerate` — omitting it would make autogenerate think these 5 tables don't belong to the app and propose dropping them.

- [ ] **Step 4: Verify the migration applies cleanly against real Postgres**
  ```bash
  cd backend && DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica" JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao" .venv/bin/python -m alembic upgrade head
  ```
  Expect no errors and the final line to show revision `0003` applied.

- [ ] **Step 5: Verify the 6 label rows were seeded**
  ```bash
  cd backend && DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica" JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao" .venv/bin/python -c "
  from sqlalchemy import create_engine, text

  engine = create_engine('postgresql+psycopg://planner:planner@localhost:5432/planner_logistica')
  with engine.connect() as conn:
      rows = conn.execute(text('SELECT id, nome, cor FROM label ORDER BY id')).fetchall()
      assert len(rows) == 6, f'esperado 6 labels, encontrado {len(rows)}: {rows}'
      for row in rows:
          print(row)
  print('OK - 6 labels seeded')
  "
  ```

- [ ] **Step 6: Run the existing backend test suite (regression check)**
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```
  Must pass unchanged — this task adds new files only, it does not touch any file an existing test imports.

- [ ] **Step 7: Commit**
  ```bash
  cd backend
  git add app/models/colaboracao.py alembic/versions/0003_colaboracao_tables.py alembic/env.py
  git commit -m "$(cat <<'EOF'
  feat: add colaboracao tables (checklist, label, comentario, anexo)

  Adds the 5 Fase 2 collaboration tables plus 6 seeded label rows. FKs to
  producao.id use ondelete=CASCADE so bulk_persist's delete-and-reinsert
  resubmission flow does not raise a FK violation once items carry
  checklist/comment/attachment children (see Task 4).
  EOF
  )"
  ```

---

### Task 2: Pydantic schemas for colaboracao

**Files:**
- Create: `backend/app/schemas/colaboracao.py`

**Depends-on:** 1

**Interfaces:**
- Consumes: field names/types of `app.models.colaboracao.{ChecklistItem, Label, Comentario, Anexo}` (Task 1) — used only to keep field names aligned, no import of the model module itself (matches `app/schemas/producao.py`'s existing convention of not importing ORM models).
- Produces: `app.schemas.colaboracao.{ChecklistItemOut, ChecklistItemCreate, ChecklistItemUpdate, LabelOut, LabelSetRequest, ComentarioOut, ComentarioCreate, AnexoOut, AnexoCreate}` — consumed by Tasks 5, 6, 7, 8.

- [ ] **Step 1: Create the schemas file**
  Create `backend/app/schemas/colaboracao.py`:
  ```python
  from datetime import datetime

  from pydantic import BaseModel, ConfigDict


  class ChecklistItemOut(BaseModel):
      id: int
      item_producao_id: int
      texto: str
      concluido: bool
      ordem: int

      model_config = ConfigDict(from_attributes=True)


  class ChecklistItemCreate(BaseModel):
      texto: str
      ordem: int


  class ChecklistItemUpdate(BaseModel):
      texto: str | None = None
      concluido: bool | None = None


  class LabelOut(BaseModel):
      id: int
      nome: str
      cor: str

      model_config = ConfigDict(from_attributes=True)


  class LabelSetRequest(BaseModel):
      label_ids: list[int]


  class ComentarioOut(BaseModel):
      id: int
      texto: str
      autor_id: int
      autor_username: str
      criado_em: datetime


  class ComentarioCreate(BaseModel):
      texto: str


  class AnexoOut(BaseModel):
      id: int
      titulo: str
      url: str
      enviado_por: int
      enviado_por_username: str
      criado_em: datetime


  class AnexoCreate(BaseModel):
      titulo: str
      url: str
  ```
  Note: `ComentarioOut`/`AnexoOut` intentionally have no `model_config`/`from_attributes` — `autor_username`/`enviado_por_username` are not plain attributes on the `Comentario`/`Anexo` ORM models (they come from a join against `users`), so these two schemas are always constructed explicitly via keyword arguments in the route layer (Tasks 7, 8), never via `.model_validate(orm_obj)`.

- [ ] **Step 2: Verify the module imports cleanly and schemas validate**
  ```bash
  cd backend && .venv/bin/python -c "
  from app.schemas.colaboracao import (
      AnexoCreate, AnexoOut, ChecklistItemCreate, ChecklistItemOut, ChecklistItemUpdate,
      ComentarioCreate, ComentarioOut, LabelOut, LabelSetRequest,
  )

  c = ChecklistItemOut(id=1, item_producao_id=2, texto='Passo 1', concluido=False, ordem=1)
  assert c.texto == 'Passo 1'
  u = ChecklistItemUpdate()
  assert u.texto is None and u.concluido is None
  s = LabelSetRequest(label_ids=[1, 2, 3])
  assert s.label_ids == [1, 2, 3]
  print('OK - schemas import and validate')
  "
  ```

- [ ] **Step 3: Run the existing backend test suite (regression check)**
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd backend
  git add app/schemas/colaboracao.py
  git commit -m "$(cat <<'EOF'
  feat: add pydantic schemas for colaboracao (checklist, label, comentario, anexo)
  EOF
  )"
  ```

---

### Task 3: Repository layer for colaboracao

**Files:**
- Create: `backend/app/repositories/colaboracao_repository.py`

**Depends-on:** 1

**Interfaces:**
- Consumes: `app.models.colaboracao.{ChecklistItem, Label, ItemProducaoLabel, Comentario, Anexo}` (Task 1); `app.models.user.User` (pre-existing).
- Produces (all plain functions, first arg `db: Session`, no `db.commit()` anywhere — matches `producao_repository.py`'s flush-only convention, caller commits):
  - `listar_checklist(db, item_producao_id: int) -> list[ChecklistItem]`
  - `criar_checklist_item(db, item_producao_id: int, texto: str, ordem: int) -> ChecklistItem`
  - `atualizar_checklist_item(db, checklist_item_id: int, texto: str | None = None, concluido: bool | None = None) -> ChecklistItem | None`
  - `remover_checklist_item(db, checklist_item_id: int) -> bool`
  - `seed_checklist_padrao(db, item_producao_id: int) -> None` — consumed by Task 4
  - `listar_catalogo_labels(db) -> list[Label]`
  - `listar_labels_do_item(db, item_producao_id: int) -> list[Label]`
  - `substituir_labels_do_item(db, item_producao_id: int, label_ids: list[int]) -> list[Label]`
  - `listar_comentarios(db, item_producao_id: int) -> list[Comentario]`
  - `criar_comentario(db, item_producao_id: int, autor_id: int, texto: str) -> Comentario`
  - `listar_anexos(db, item_producao_id: int) -> list[Anexo]`
  - `criar_anexo(db, item_producao_id: int, titulo: str, url: str, enviado_por: int) -> Anexo`
  - `remover_anexo(db, anexo_id: int) -> bool`
  - `obter_usernames(db, user_ids: set[int]) -> dict[int, str]` — added beyond the original spec list; consumed by Tasks 7 and 8 to resolve `autor_username`/`enviado_por_username` in one batched query instead of an N+1 per comment/anexo (see Step 1 docstring).

- [ ] **Step 1: Create the repository module**
  Create `backend/app/repositories/colaboracao_repository.py`:
  ```python
  from sqlalchemy import delete, select
  from sqlalchemy.orm import Session

  from app.models.colaboracao import Anexo, ChecklistItem, Comentario, ItemProducaoLabel, Label
  from app.models.user import User

  CHECKLIST_PADRAO = ["Passo 1", "Passo 2", "Passo 3", "Passo 4", "Passo 5"]


  def listar_checklist(db: Session, item_producao_id: int) -> list[ChecklistItem]:
      stmt = (
          select(ChecklistItem)
          .where(ChecklistItem.item_producao_id == item_producao_id)
          .order_by(ChecklistItem.ordem)
      )
      return list(db.scalars(stmt).all())


  def criar_checklist_item(
      db: Session, item_producao_id: int, texto: str, ordem: int
  ) -> ChecklistItem:
      item = ChecklistItem(item_producao_id=item_producao_id, texto=texto, ordem=ordem)
      db.add(item)
      db.flush()
      return item


  def atualizar_checklist_item(
      db: Session,
      checklist_item_id: int,
      texto: str | None = None,
      concluido: bool | None = None,
  ) -> ChecklistItem | None:
      item = db.get(ChecklistItem, checklist_item_id)
      if item is None:
          return None
      if texto is not None:
          item.texto = texto
      if concluido is not None:
          item.concluido = concluido
      db.flush()
      return item


  def remover_checklist_item(db: Session, checklist_item_id: int) -> bool:
      item = db.get(ChecklistItem, checklist_item_id)
      if item is None:
          return False
      db.delete(item)
      db.flush()
      return True


  def seed_checklist_padrao(db: Session, item_producao_id: int) -> None:
      """Insert the 5 fixed default checklist steps for a newly created item.

      Called from producao_repository.bulk_persist right after each new
      ItemProducao row is flushed (so item_producao_id is a real, persisted id).
      """
      for ordem, texto in enumerate(CHECKLIST_PADRAO, start=1):
          db.add(ChecklistItem(item_producao_id=item_producao_id, texto=texto, ordem=ordem))
      db.flush()


  def listar_catalogo_labels(db: Session) -> list[Label]:
      return list(db.scalars(select(Label).order_by(Label.id)).all())


  def listar_labels_do_item(db: Session, item_producao_id: int) -> list[Label]:
      stmt = (
          select(Label)
          .join(ItemProducaoLabel, ItemProducaoLabel.label_id == Label.id)
          .where(ItemProducaoLabel.item_producao_id == item_producao_id)
          .order_by(Label.id)
      )
      return list(db.scalars(stmt).all())


  def substituir_labels_do_item(
      db: Session, item_producao_id: int, label_ids: list[int]
  ) -> list[Label]:
      """Replace the full set of labels applied to an item (delete then re-insert)."""
      db.execute(
          delete(ItemProducaoLabel).where(
              ItemProducaoLabel.item_producao_id == item_producao_id
          )
      )
      for label_id in label_ids:
          db.add(ItemProducaoLabel(item_producao_id=item_producao_id, label_id=label_id))
      db.flush()
      return listar_labels_do_item(db, item_producao_id)


  def listar_comentarios(db: Session, item_producao_id: int) -> list[Comentario]:
      stmt = (
          select(Comentario)
          .where(Comentario.item_producao_id == item_producao_id)
          .order_by(Comentario.criado_em)
      )
      return list(db.scalars(stmt).all())


  def criar_comentario(
      db: Session, item_producao_id: int, autor_id: int, texto: str
  ) -> Comentario:
      comentario = Comentario(item_producao_id=item_producao_id, autor_id=autor_id, texto=texto)
      db.add(comentario)
      db.flush()
      return comentario


  def listar_anexos(db: Session, item_producao_id: int) -> list[Anexo]:
      stmt = select(Anexo).where(Anexo.item_producao_id == item_producao_id).order_by(Anexo.id)
      return list(db.scalars(stmt).all())


  def criar_anexo(
      db: Session, item_producao_id: int, titulo: str, url: str, enviado_por: int
  ) -> Anexo:
      anexo = Anexo(
          item_producao_id=item_producao_id, titulo=titulo, url=url, enviado_por=enviado_por
      )
      db.add(anexo)
      db.flush()
      return anexo


  def remover_anexo(db: Session, anexo_id: int) -> bool:
      anexo = db.get(Anexo, anexo_id)
      if anexo is None:
          return False
      db.delete(anexo)
      db.flush()
      return True


  def obter_usernames(db: Session, user_ids: set[int]) -> dict[int, str]:
      """Batch-resolve {user_id: username} for join-style display fields
      (ComentarioOut.autor_username, AnexoOut.enviado_por_username) - avoids an
      N+1 query per comment/anexo in the route layer.
      """
      if not user_ids:
          return {}
      stmt = select(User.id, User.username).where(User.id.in_(user_ids))
      return dict(db.execute(stmt).all())
  ```

- [ ] **Step 2: Verify the module imports cleanly**
  ```bash
  cd backend && .venv/bin/python -c "
  from app.repositories.colaboracao_repository import (
      atualizar_checklist_item, criar_anexo, criar_checklist_item, criar_comentario,
      listar_anexos, listar_catalogo_labels, listar_checklist, listar_comentarios,
      listar_labels_do_item, obter_usernames, remover_anexo, remover_checklist_item,
      seed_checklist_padrao, substituir_labels_do_item,
  )
  print('OK - colaboracao_repository imports cleanly')
  "
  ```

- [ ] **Step 3: Verify against the real dev database (Postgres, already migrated by Task 1)**
  ```bash
  cd backend && DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica" JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao" .venv/bin/python -c "
  from sqlalchemy import create_engine
  from sqlalchemy.orm import sessionmaker

  from app.repositories.colaboracao_repository import (
      listar_catalogo_labels, seed_checklist_padrao, criar_comentario,
  )

  engine = create_engine('postgresql+psycopg://planner:planner@localhost:5432/planner_logistica')
  Session = sessionmaker(bind=engine)
  db = Session()

  catalogo = listar_catalogo_labels(db)
  assert len(catalogo) == 6, f'esperado 6 labels no catalogo, encontrado {len(catalogo)}'
  print('OK -', len(catalogo), 'labels no catalogo')
  db.rollback()
  db.close()
  "
  ```

- [ ] **Step 4: Run the existing backend test suite (regression check)**
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 5: Commit**
  ```bash
  cd backend
  git add app/repositories/colaboracao_repository.py
  git commit -m "$(cat <<'EOF'
  feat: add colaboracao repository (checklist, label, comentario, anexo)
  EOF
  )"
  ```

---

### Task 4: Extend `bulk_persist` to seed default checklist

**Files:**
- Modify: `backend/app/repositories/producao_repository.py:1-6,82-87`
- Modify: `backend/tests/integration/test_producao_repository.py:9,21-23`
- Modify: `backend/tests/integration/test_routes_producao_post.py:14-15,31-34`

**Depends-on:** 1, 3

**Interfaces:**
- Consumes: `app.repositories.colaboracao_repository.seed_checklist_padrao(db: Session, item_producao_id: int) -> None` (Task 3); `app.models.colaboracao.ChecklistItem` (Task 1, test fixtures only).
- Produces: `bulk_persist(db, linha, turno, patan, itens) -> list[ItemProducao]` — unchanged signature, now also seeds 5 `checklist_item` rows per row it creates.

**Why the two test files must change (found by tracing, not in the original brief):** both `test_producao_repository.py` and `test_routes_producao_post.py` build their SQLite test schema via `Base.metadata.create_all(engine, tables=[...])` with an explicit table allowlist that does not include `checklist_item`. Every test in those two files that calls `bulk_persist` with at least one `item.id is None` entry — most of them — will start failing with `no such table: checklist_item` the moment `seed_checklist_padrao` is wired in, unless the allowlist is extended. This is a required fix to keep the existing suite green, not a new test.

- [ ] **Step 1: Add the import to `producao_repository.py`**
  Current top of `backend/app/repositories/producao_repository.py`:
  ```python
  from sqlalchemy import delete, select
  from sqlalchemy.orm import Session

  from app.domain.status import PlanItemStatus
  from app.models.producao import ItemProducao, ItemProducaoStaging
  from app.schemas.producao import ItemProducaoBulkIn
  ```
  Replace with:
  ```python
  from sqlalchemy import delete, select
  from sqlalchemy.orm import Session

  from app.domain.status import PlanItemStatus
  from app.models.producao import ItemProducao, ItemProducaoStaging
  from app.repositories.colaboracao_repository import seed_checklist_padrao
  from app.schemas.producao import ItemProducaoBulkIn
  ```

- [ ] **Step 2: Seed the default checklist after the existing flush**
  The current end of `bulk_persist` reads:
  ```python
          registro = ItemProducao(**dados)
          db.add(registro)
          persistidos.append(registro)

      db.flush()
      return persistidos
  ```
  Replace the last four lines (`db.flush()` through `return persistidos`) with:
  ```python
      db.flush()

      # Every row built in the loop above is a brand-new physical row - "id" is
      # always excluded from dados (see model_dump exclude above), so item.id in
      # the request only ever affects sequencia bookkeeping, never which row
      # gets written. preservados (em_producao=True) rows never enter this loop,
      # so persistidos already excludes them - nothing further to filter here.
      for registro in persistidos:
          seed_checklist_padrao(db, registro.id)

      return persistidos
  ```
  The full function must now read exactly:
  ```python
  def bulk_persist(
      db: Session,
      linha: str,
      turno: int,
      patan: str,
      itens: list[ItemProducaoBulkIn],
  ) -> list[ItemProducao]:
      """All-or-nothing persist to Tabela B, scoped to (patan, linha, turno).

      Deletes existing rows in scope that are not em_producao, preserves rows
      marked em_producao untouched, then inserts every submitted item. Items
      with id=None are new - they get the next free sequencia in their posto's
      column, after any preserved em_producao rows in that same posto. Runs
      inside the caller's transaction (caller commits/rolls back for
      all-or-nothing semantics).
      """
      escopo = (
          (ItemProducao.linha == linha)
          & (ItemProducao.turno == turno)
          & (ItemProducao.patan == patan)
      )

      db.execute(delete(ItemProducao).where(escopo, ItemProducao.em_producao.is_(False)))

      preservados = db.scalars(
          select(ItemProducao).where(escopo, ItemProducao.em_producao.is_(True))
      ).all()
      max_sequencia_por_posto: dict[str, int] = {}
      for registro in preservados:
          atual = max_sequencia_por_posto.get(registro.posto_trabalho, 0)
          max_sequencia_por_posto[registro.posto_trabalho] = max(atual, registro.sequencia)

      # Also seed from the submitted items' OWN sequencia (the ones being kept,
      # not newly created) - otherwise a new item (id=None) can be assigned a
      # number that collides with an existing item in the same posto that is
      # part of this very submission, instead of appending after it.
      for item in itens:
          if item.id is not None:
              atual = max_sequencia_por_posto.get(item.posto_trabalho, 0)
              max_sequencia_por_posto[item.posto_trabalho] = max(atual, item.sequencia)

      persistidos: list[ItemProducao] = []
      for item in itens:
          dados = item.model_dump(exclude={"id", "turno", "patan", "status"})
          dados["turno"] = item.turno.value
          dados["patan"] = item.patan.value
          dados["status"] = item.status.value

          if item.id is None:
              proximo = max_sequencia_por_posto.get(item.posto_trabalho, 0) + 1
              dados["sequencia"] = proximo
              max_sequencia_por_posto[item.posto_trabalho] = proximo

          registro = ItemProducao(**dados)
          db.add(registro)
          persistidos.append(registro)

      db.flush()

      # Every row built in the loop above is a brand-new physical row - "id" is
      # always excluded from dados (see model_dump exclude above), so item.id in
      # the request only ever affects sequencia bookkeeping, never which row
      # gets written. preservados (em_producao=True) rows never enter this loop,
      # so persistidos already excludes them - nothing further to filter here.
      for registro in persistidos:
          seed_checklist_padrao(db, registro.id)

      return persistidos
  ```

- [ ] **Step 3: Fix `test_producao_repository.py`'s fixture to create the new table**
  Current:
  ```python
  from app.models.producao import ItemProducao, ItemProducaoStaging
  ```
  and
  ```python
  @pytest.fixture
  def db_session():
      engine = create_engine("sqlite:///:memory:")
      Base.metadata.create_all(
          engine, tables=[ItemProducaoStaging.__table__, ItemProducao.__table__]
      )
  ```
  Replace with:
  ```python
  from app.models.colaboracao import ChecklistItem
  from app.models.producao import ItemProducao, ItemProducaoStaging
  ```
  and
  ```python
  @pytest.fixture
  def db_session():
      engine = create_engine("sqlite:///:memory:")
      Base.metadata.create_all(
          engine,
          tables=[
              ItemProducaoStaging.__table__,
              ItemProducao.__table__,
              ChecklistItem.__table__,
          ],
      )
  ```

- [ ] **Step 4: Fix `test_routes_producao_post.py`'s fixture to create the new table**
  Current:
  ```python
  from app.models.producao import ItemProducao, ItemProducaoStaging
  from app.models.user import User
  ```
  and
  ```python
      Base.metadata.create_all(
          engine,
          tables=[User.__table__, ItemProducaoStaging.__table__, ItemProducao.__table__],
      )
  ```
  Replace with:
  ```python
  from app.models.colaboracao import ChecklistItem
  from app.models.producao import ItemProducao, ItemProducaoStaging
  from app.models.user import User
  ```
  and
  ```python
      Base.metadata.create_all(
          engine,
          tables=[
              User.__table__,
              ItemProducaoStaging.__table__,
              ItemProducao.__table__,
              ChecklistItem.__table__,
          ],
      )
  ```

- [ ] **Step 5: Verify against the real dev database that a fresh bulk_persist seeds 5 checklist rows**
  ```bash
  cd backend && DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica" JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao" .venv/bin/python -c "
  from sqlalchemy import create_engine, text
  from sqlalchemy.orm import sessionmaker

  from app.domain.patan import Patan
  from app.domain.sequenciamento import Turno
  from app.domain.status import PlanItemStatus
  from app.repositories.producao_repository import bulk_persist
  from app.schemas.producao import ItemProducaoBulkIn

  engine = create_engine('postgresql+psycopg://planner:planner@localhost:5432/planner_logistica')
  Session = sessionmaker(bind=engine)
  db = Session()

  item = ItemProducaoBulkIn(
      id=None, linha='TASK4-VERIFY', turno=Turno.PRIMEIRO, patan=Patan.A,
      posto_trabalho='posto-verify', status=PlanItemStatus.NORMAL, sequencia=1,
      kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
  )
  persistidos = bulk_persist(db, 'TASK4-VERIFY', 1, 'A', [item])
  novo_id = persistidos[0].id

  rows = db.execute(
      text('SELECT count(*) FROM checklist_item WHERE item_producao_id = :id'),
      {'id': novo_id},
  ).scalar()
  assert rows == 5, f'esperado 5 checklist_item, encontrado {rows}'
  print('OK -', rows, 'checklist_item criados para o item', novo_id)

  db.rollback()  # discard the verification row, do not pollute the dev DB
  db.close()
  "
  ```

- [ ] **Step 6: Run the existing backend test suite (regression check)**
  ```bash
  cd backend && .venv/bin/python -m pytest tests/integration/test_routes_producao_post.py tests/integration/test_producao_repository.py -v
  ```
  Then the full suite:
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 7: Commit**
  ```bash
  cd backend
  git add app/repositories/producao_repository.py tests/integration/test_producao_repository.py tests/integration/test_routes_producao_post.py
  git commit -m "$(cat <<'EOF'
  feat: seed default checklist on bulk_persist item creation

  Extends bulk_persist so every newly created ItemProducao row gets the 5
  default checklist steps. Also extends the two existing test fixtures'
  Base.metadata.create_all table allowlist to include checklist_item -
  without it, every existing test that creates an item would start failing
  with "no such table: checklist_item" once seeding is wired in.
  EOF
  )"
  ```

---

### Task 5: Checklist routes

**Files:**
- Create: `backend/app/api/routes_checklist.py`

**Depends-on:** 2, 3

**Interfaces:**
- Consumes: `ChecklistItemOut, ChecklistItemCreate, ChecklistItemUpdate` (Task 2); `listar_checklist, criar_checklist_item, atualizar_checklist_item, remover_checklist_item` (Task 3); `app.core.deps.get_current_user`; `app.db.session.get_db`; `app.models.colaboracao.ChecklistItem` (for the GET route's return-type annotation only).
- Produces: `app.api.routes_checklist.router` (`APIRouter`) — consumed by Task 9.

- [ ] **Step 1: Create the router**
  Create `backend/app/api/routes_checklist.py`:
  ```python
  from fastapi import APIRouter, Depends, HTTPException, status
  from sqlalchemy.orm import Session

  from app.core.deps import get_current_user
  from app.db.session import get_db
  from app.models.colaboracao import ChecklistItem
  from app.models.user import User
  from app.repositories.colaboracao_repository import (
      atualizar_checklist_item,
      criar_checklist_item,
      listar_checklist,
      remover_checklist_item,
  )
  from app.schemas.colaboracao import ChecklistItemCreate, ChecklistItemOut, ChecklistItemUpdate

  router = APIRouter(prefix="/producao/itens/{item_id}/checklist", tags=["checklist"])


  @router.get("", response_model=list[ChecklistItemOut])
  def listar_checklist_do_item(
      item_id: int,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> list[ChecklistItem]:
      return listar_checklist(db, item_id)


  @router.post("", response_model=ChecklistItemOut, status_code=status.HTTP_201_CREATED)
  def criar_item_checklist(
      item_id: int,
      payload: ChecklistItemCreate,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> ChecklistItemOut:
      item = criar_checklist_item(db, item_id, payload.texto, payload.ordem)
      # Build the response before commit: expire_on_commit=True would force a
      # lazy-reload on each attribute access below otherwise - same pattern/
      # reasoning as routes_producao.py's submeter_sequencia.
      resposta = ChecklistItemOut(
          id=item.id,
          item_producao_id=item.item_producao_id,
          texto=item.texto,
          concluido=item.concluido,
          ordem=item.ordem,
      )
      db.commit()
      return resposta


  @router.patch("/{checklist_item_id}", response_model=ChecklistItemOut)
  def atualizar_item_checklist(
      item_id: int,
      checklist_item_id: int,
      payload: ChecklistItemUpdate,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> ChecklistItemOut:
      item = atualizar_checklist_item(
          db, checklist_item_id, texto=payload.texto, concluido=payload.concluido
      )
      if item is None or item.item_producao_id != item_id:
          # Safe to reject even though atualizar_checklist_item already flushed
          # the change: without a db.commit() below, get_db's finally-block
          # db.close() discards the uncommitted flush.
          raise HTTPException(
              status_code=status.HTTP_404_NOT_FOUND,
              detail="Item de checklist nao encontrado.",
          )
      resposta = ChecklistItemOut(
          id=item.id,
          item_producao_id=item.item_producao_id,
          texto=item.texto,
          concluido=item.concluido,
          ordem=item.ordem,
      )
      db.commit()
      return resposta


  @router.delete("/{checklist_item_id}", status_code=status.HTTP_204_NO_CONTENT)
  def remover_item_checklist(
      item_id: int,
      checklist_item_id: int,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> None:
      pertence_ao_item = any(i.id == checklist_item_id for i in listar_checklist(db, item_id))
      if not pertence_ao_item:
          raise HTTPException(
              status_code=status.HTTP_404_NOT_FOUND,
              detail="Item de checklist nao encontrado.",
          )
      remover_checklist_item(db, checklist_item_id)
      db.commit()
  ```

- [ ] **Step 2: Verify the module imports cleanly**
  ```bash
  cd backend && .venv/bin/python -c "
  from app.api.routes_checklist import router
  paths = sorted({r.path for r in router.routes})
  print(paths)
  assert paths == ['/producao/itens/{item_id}/checklist', '/producao/itens/{item_id}/checklist/{checklist_item_id}']
  print('OK - routes_checklist router has the expected paths')
  "
  ```

- [ ] **Step 3: Run the existing backend test suite (regression check)**
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd backend
  git add app/api/routes_checklist.py
  git commit -m "$(cat <<'EOF'
  feat: add checklist routes (GET/POST/PATCH/DELETE)
  EOF
  )"
  ```

---

### Task 6: Label routes

**Files:**
- Create: `backend/app/api/routes_labels.py`

**Depends-on:** 2, 3

**Interfaces:**
- Consumes: `LabelOut, LabelSetRequest` (Task 2); `listar_catalogo_labels, listar_labels_do_item, substituir_labels_do_item` (Task 3); `app.models.colaboracao.Label` (GET routes' return-type annotation only).
- Produces: `app.api.routes_labels.router` (`APIRouter`) — consumed by Task 9.

- [ ] **Step 1: Create the router**
  Create `backend/app/api/routes_labels.py`:
  ```python
  from fastapi import APIRouter, Depends, HTTPException, status
  from sqlalchemy.orm import Session

  from app.core.deps import get_current_user
  from app.db.session import get_db
  from app.models.colaboracao import Label
  from app.models.user import User
  from app.repositories.colaboracao_repository import (
      listar_catalogo_labels,
      listar_labels_do_item,
      substituir_labels_do_item,
  )
  from app.schemas.colaboracao import LabelOut, LabelSetRequest

  router = APIRouter(tags=["labels"])


  @router.get("/labels", response_model=list[LabelOut])
  def listar_catalogo(
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> list[Label]:
      return listar_catalogo_labels(db)


  @router.get("/producao/itens/{item_id}/labels", response_model=list[LabelOut])
  def listar_labels_do_item_route(
      item_id: int,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> list[Label]:
      return listar_labels_do_item(db, item_id)


  @router.put("/producao/itens/{item_id}/labels", response_model=list[LabelOut])
  def substituir_labels_do_item_route(
      item_id: int,
      payload: LabelSetRequest,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> list[LabelOut]:
      catalogo_ids = {label.id for label in listar_catalogo_labels(db)}
      ids_invalidos = set(payload.label_ids) - catalogo_ids
      if ids_invalidos:
          raise HTTPException(
              status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
              detail=f"Labels inexistentes: {sorted(ids_invalidos)}.",
          )
      labels = substituir_labels_do_item(db, item_id, payload.label_ids)
      # Build the response before commit - same reasoning as routes_checklist.py.
      resposta = [LabelOut(id=label.id, nome=label.nome, cor=label.cor) for label in labels]
      db.commit()
      return resposta
  ```

- [ ] **Step 2: Verify the module imports cleanly**
  ```bash
  cd backend && .venv/bin/python -c "
  from app.api.routes_labels import router
  paths = sorted({r.path for r in router.routes})
  print(paths)
  assert paths == ['/labels', '/producao/itens/{item_id}/labels']
  print('OK - routes_labels router has the expected paths')
  "
  ```

- [ ] **Step 3: Run the existing backend test suite (regression check)**
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd backend
  git add app/api/routes_labels.py
  git commit -m "$(cat <<'EOF'
  feat: add label routes (catalog GET, item GET/PUT)
  EOF
  )"
  ```

---

### Task 7: Comentario routes

**Files:**
- Create: `backend/app/api/routes_comentarios.py`

**Depends-on:** 2, 3

**Interfaces:**
- Consumes: `ComentarioOut, ComentarioCreate` (Task 2); `listar_comentarios, criar_comentario, obter_usernames` (Task 3); `app.models.user.User` (for the authenticated-user dependency and its `.id`/`.username`).
- Produces: `app.api.routes_comentarios.router` (`APIRouter`) — consumed by Task 9.

- [ ] **Step 1: Create the router**
  Create `backend/app/api/routes_comentarios.py`:
  ```python
  from fastapi import APIRouter, Depends, status
  from sqlalchemy.orm import Session

  from app.core.deps import get_current_user
  from app.db.session import get_db
  from app.models.user import User
  from app.repositories.colaboracao_repository import (
      criar_comentario,
      listar_comentarios,
      obter_usernames,
  )
  from app.schemas.colaboracao import ComentarioCreate, ComentarioOut

  router = APIRouter(prefix="/producao/itens/{item_id}/comentarios", tags=["comentarios"])


  @router.get("", response_model=list[ComentarioOut])
  def listar_comentarios_do_item(
      item_id: int,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> list[ComentarioOut]:
      comentarios = listar_comentarios(db, item_id)
      usernames = obter_usernames(db, {c.autor_id for c in comentarios})
      return [
          ComentarioOut(
              id=c.id,
              texto=c.texto,
              autor_id=c.autor_id,
              autor_username=usernames.get(c.autor_id, ""),
              criado_em=c.criado_em,
          )
          for c in comentarios
      ]


  @router.post("", response_model=ComentarioOut, status_code=status.HTTP_201_CREATED)
  def criar_comentario_do_item(
      item_id: int,
      payload: ComentarioCreate,
      db: Session = Depends(get_db),  # noqa: B008
      usuario_atual: User = Depends(get_current_user),  # noqa: B008
  ) -> ComentarioOut:
      # autor_id always comes from the authenticated user, never from the
      # request body - see Task 7's spec.
      comentario = criar_comentario(db, item_id, usuario_atual.id, payload.texto)
      resposta = ComentarioOut(
          id=comentario.id,
          texto=comentario.texto,
          autor_id=comentario.autor_id,
          autor_username=usuario_atual.username,
          criado_em=comentario.criado_em,
      )
      db.commit()
      return resposta
  ```

- [ ] **Step 2: Verify the module imports cleanly**
  ```bash
  cd backend && .venv/bin/python -c "
  from app.api.routes_comentarios import router
  paths = sorted({r.path for r in router.routes})
  print(paths)
  assert paths == ['/producao/itens/{item_id}/comentarios']
  print('OK - routes_comentarios router has the expected path')
  "
  ```

- [ ] **Step 3: Run the existing backend test suite (regression check)**
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd backend
  git add app/api/routes_comentarios.py
  git commit -m "$(cat <<'EOF'
  feat: add comentario routes (GET/POST)
  EOF
  )"
  ```

---

### Task 8: Anexo routes

**Files:**
- Create: `backend/app/api/routes_anexos.py`

**Depends-on:** 2, 3

**Interfaces:**
- Consumes: `AnexoOut, AnexoCreate` (Task 2); `listar_anexos, criar_anexo, remover_anexo, obter_usernames` (Task 3); `app.models.user.User`.
- Produces: `app.api.routes_anexos.router` (`APIRouter`) — consumed by Task 9.

- [ ] **Step 1: Create the router**
  Create `backend/app/api/routes_anexos.py`:
  ```python
  from fastapi import APIRouter, Depends, HTTPException, status
  from sqlalchemy.orm import Session

  from app.core.deps import get_current_user
  from app.db.session import get_db
  from app.models.user import User
  from app.repositories.colaboracao_repository import (
      criar_anexo,
      listar_anexos,
      obter_usernames,
      remover_anexo,
  )
  from app.schemas.colaboracao import AnexoCreate, AnexoOut

  router = APIRouter(prefix="/producao/itens/{item_id}/anexos", tags=["anexos"])


  @router.get("", response_model=list[AnexoOut])
  def listar_anexos_do_item(
      item_id: int,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> list[AnexoOut]:
      anexos = listar_anexos(db, item_id)
      usernames = obter_usernames(db, {a.enviado_por for a in anexos})
      return [
          AnexoOut(
              id=a.id,
              titulo=a.titulo,
              url=a.url,
              enviado_por=a.enviado_por,
              enviado_por_username=usernames.get(a.enviado_por, ""),
              criado_em=a.criado_em,
          )
          for a in anexos
      ]


  @router.post("", response_model=AnexoOut, status_code=status.HTTP_201_CREATED)
  def criar_anexo_do_item(
      item_id: int,
      payload: AnexoCreate,
      db: Session = Depends(get_db),  # noqa: B008
      usuario_atual: User = Depends(get_current_user),  # noqa: B008
  ) -> AnexoOut:
      # enviado_por always comes from the authenticated user, never from the
      # request body - see Task 8's spec.
      anexo = criar_anexo(db, item_id, payload.titulo, payload.url, usuario_atual.id)
      resposta = AnexoOut(
          id=anexo.id,
          titulo=anexo.titulo,
          url=anexo.url,
          enviado_por=anexo.enviado_por,
          enviado_por_username=usuario_atual.username,
          criado_em=anexo.criado_em,
      )
      db.commit()
      return resposta


  @router.delete("/{anexo_id}", status_code=status.HTTP_204_NO_CONTENT)
  def remover_anexo_do_item(
      item_id: int,
      anexo_id: int,
      db: Session = Depends(get_db),  # noqa: B008
      _: User = Depends(get_current_user),  # noqa: B008
  ) -> None:
      pertence_ao_item = any(a.id == anexo_id for a in listar_anexos(db, item_id))
      if not pertence_ao_item:
          raise HTTPException(
              status_code=status.HTTP_404_NOT_FOUND, detail="Anexo nao encontrado."
          )
      remover_anexo(db, anexo_id)
      db.commit()
  ```

- [ ] **Step 2: Verify the module imports cleanly**
  ```bash
  cd backend && .venv/bin/python -c "
  from app.api.routes_anexos import router
  paths = sorted({r.path for r in router.routes})
  print(paths)
  assert paths == ['/producao/itens/{item_id}/anexos', '/producao/itens/{item_id}/anexos/{anexo_id}']
  print('OK - routes_anexos router has the expected paths')
  "
  ```

- [ ] **Step 3: Run the existing backend test suite (regression check)**
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd backend
  git add app/api/routes_anexos.py
  git commit -m "$(cat <<'EOF'
  feat: add anexo routes (GET/POST/DELETE)
  EOF
  )"
  ```

---

### Task 9: Wire the 4 new routers into the app

**Files:**
- Modify: `backend/app/main.py:1-24`

**Depends-on:** 5, 6, 7, 8

**Interfaces:**
- Consumes: `app.api.routes_checklist.router`, `app.api.routes_labels.router`, `app.api.routes_comentarios.router`, `app.api.routes_anexos.router` (Tasks 5-8).
- Produces: the fully wired FastAPI app — final integration point for the Fase 2 backend; nothing downstream in this plan depends on it.

- [ ] **Step 1: Register the new routers**
  Replace the full contents of `backend/app/main.py` with:
  ```python
  from fastapi import FastAPI
  from fastapi.middleware.cors import CORSMiddleware

  from app.api.routes_anexos import router as anexos_router
  from app.api.routes_auth import router as auth_router
  from app.api.routes_checklist import router as checklist_router
  from app.api.routes_comentarios import router as comentarios_router
  from app.api.routes_labels import router as labels_router
  from app.api.routes_producao import router as producao_router
  from app.api.routes_users import router as users_router
  from app.core.config import get_settings

  app = FastAPI(title="plannerLogistica")
  app.add_middleware(
      CORSMiddleware,
      allow_origins=get_settings().cors_origins_list,
      allow_credentials=False,
      allow_methods=["*"],
      allow_headers=["*"],
  )
  app.include_router(auth_router)
  app.include_router(users_router)
  app.include_router(producao_router)
  app.include_router(checklist_router)
  app.include_router(labels_router)
  app.include_router(comentarios_router)
  app.include_router(anexos_router)


  @app.get("/health")
  def health_check() -> dict[str, str]:
      return {"status": "ok"}
  ```

- [ ] **Step 2: Start the dev server and verify it boots with all routes present**
  ```bash
  cd backend
  DATABASE_URL="postgresql+psycopg://planner:planner@localhost:5432/planner_logistica" JWT_SECRET_KEY="dev-only-secret-nao-usar-em-producao" .venv/bin/python -m uvicorn app.main:app --port 8000 &
  SERVER_PID=$!
  sleep 2

  curl -s -o /dev/null -w "docs status: %{http_code}\n" http://localhost:8000/docs

  curl -s http://localhost:8000/openapi.json | .venv/bin/python -c "
  import json, sys
  paths = json.load(sys.stdin)['paths']
  expected = [
      '/producao/itens/{item_id}/checklist',
      '/producao/itens/{item_id}/checklist/{checklist_item_id}',
      '/labels',
      '/producao/itens/{item_id}/labels',
      '/producao/itens/{item_id}/comentarios',
      '/producao/itens/{item_id}/anexos',
      '/producao/itens/{item_id}/anexos/{anexo_id}',
  ]
  missing = [p for p in expected if p not in paths]
  print('OK - todas as rotas presentes' if not missing else f'FALTANDO: {missing}')
  assert not missing
  "

  kill $SERVER_PID
  ```

- [ ] **Step 3: Run the FULL existing backend test suite (final regression gate for all 9 tasks)**
  ```bash
  cd backend && .venv/bin/python -m pytest
  ```
  Zero failures expected across the whole backend suite.

- [ ] **Step 4: Commit**
  ```bash
  cd backend
  git add app/main.py
  git commit -m "$(cat <<'EOF'
  feat: wire checklist, label, comentario, and anexo routers into the app

  Completes the Fase 2 collaboration backend API surface.
  EOF
  )"
  ```
### Task 10: Tailwind CSS setup

**Files:**
- Create: `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/src/index.css`
- Modify: `frontend/package.json`, `frontend/src/main.tsx`

**Depends-on:** none

**Interfaces:**
- Consumes: none.
- Produces: the Tailwind processing pipeline (`src/index.css` → `postcss.config.js` → `tailwind.config.js` → Vite's PostCSS integration); 4 custom color tokens in `tailwind.config.js`'s `theme.extend.colors` — `status-normal`, `status-critico`, `status-excluido`, `status-travado` — usable by any later task as `bg-status-*` / `text-status-*` / `border-status-*` utility classes (with optional `/<opacity>` suffix, e.g. `bg-status-critico/10`). Consumed directly by Task 16 (status-linked card coloring); consumed implicitly (generic Tailwind utilities, not the custom tokens) by Tasks 12-15 and 17.

Registry check performed before pinning versions: `npm view tailwindcss@3 version` → latest 3.x is `3.4.19` (Tailwind v4, the overall latest tag, changes the config format entirely — no `tailwind.config.js` by default, `@import "tailwindcss"` instead of the 3 `@tailwind` directives, `@tailwindcss/postcss` instead of `tailwindcss` as the PostCSS plugin name, autoprefixer folded in — which would break the exact file layout this task requires; v3 is the correct major for this setup). `npm view postcss version` → `8.5.26`. `npm view autoprefixer version` → `10.5.4`.

- [ ] **Step 1: Add the three devDependencies and install**
  Edit `frontend/package.json`'s `devDependencies` block to (alphabetical, matching the existing ordering):
  ```json
  "devDependencies": {
    "@eslint/js": "^9.8.0",
    "@testing-library/dom": "^10.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.5.4",
    "eslint": "^9.8.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.4.9",
    "jsdom": "^24.1.0",
    "postcss": "^8.5.26",
    "tailwindcss": "^3.4.19",
    "typescript": "^5.5.0",
    "typescript-eslint": "^8.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
  ```
  Then install:
  ```bash
  cd frontend && npm install
  ```

- [ ] **Step 2: Create `tailwind.config.js`**
  Repo's `package.json` has `"type": "module"`, so this must be an ES module (matches `vite.config.ts`'s `export default`), not `module.exports`:
  ```js
  /** @type {import('tailwindcss').Config} */
  export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
      extend: {
        colors: {
          "status-normal": "#64748b",
          "status-critico": "#ef4444",
          "status-excluido": "#9ca3af",
          "status-travado": "#3b82f6",
        },
      },
    },
    plugins: [],
  };
  ```

- [ ] **Step 3: Create `postcss.config.js`**
  ```js
  export default {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  };
  ```

- [ ] **Step 4: Create `src/index.css`**
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  ```

- [ ] **Step 5: Import the stylesheet in `main.tsx`**
  Replace the full contents of `frontend/src/main.tsx` with:
  ```tsx
  import React from "react";
  import ReactDOM from "react-dom/client";

  import "./index.css";
  import App from "./App";

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  ```

- [ ] **Step 6: Verify types/lint and that Tailwind is actually processing (not just present in package.json)**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/main.tsx
  npx vite build
  grep -q "box-sizing" dist/assets/*.css && echo "OK - tailwind preflight compiled into the bundle"
  ```
  The `box-sizing` check targets Tailwind's Preflight base-reset layer (`@tailwind base`), which is always emitted regardless of which utility classes exist in source yet — a bootstrap-safe check at this point in the plan, since no component references the 4 custom `status-*` tokens yet (that only happens starting Task 16, whose own verify step re-checks the build specifically for those). Optionally, `npm run dev` and inspect any element's computed style in devtools for a second manual confirmation.

- [ ] **Step 7: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run
  ```

- [ ] **Step 8: Commit**
  ```bash
  cd frontend
  git add package.json package-lock.json tailwind.config.js postcss.config.js src/index.css src/main.tsx
  git commit -m "$(cat <<'EOF'
  feat: add tailwind css with status-linked color tokens
  EOF
  )"
  ```

---

### Task 11: API client functions + types for the 4 collaboration features

**Files:**
- Create: `frontend/src/types/colaboracao.ts`
- Modify: `frontend/src/services/api.ts`

**Depends-on:** none

**Interfaces:**
- Consumes: none from earlier tasks; reuses the existing `authHeaders`, `parseJsonOrThrow`, `ApiError`, `API_BASE_URL` already defined in `frontend/src/services/api.ts`.
- Produces (all in `frontend/src/types/colaboracao.ts` unless noted):
  - `ChecklistItemOut { id: number; item_producao_id: number; texto: string; concluido: boolean; ordem: number }`
  - `LabelOut { id: number; nome: string; cor: string }`
  - `ComentarioOut { id: number; texto: string; autor_id: number; autor_username: string; criado_em: string }`
  - `AnexoOut { id: number; titulo: string; url: string; enviado_por: number; enviado_por_username: string; criado_em: string }`
  - `CriarChecklistItemRequest { texto: string; ordem: number }`
  - `AtualizarChecklistItemRequest { texto?: string; concluido?: boolean }`
  - `SubstituirLabelsRequest { label_ids: number[] }`
  - `CriarComentarioRequest { texto: string }`
  - `CriarAnexoRequest { titulo: string; url: string }`
  - In `frontend/src/services/api.ts`: `listarChecklist(token: string, itemId: number): Promise<ChecklistItemOut[]>`, `criarChecklistItem(token: string, itemId: number, payload: CriarChecklistItemRequest): Promise<ChecklistItemOut>`, `atualizarChecklistItem(token: string, itemId: number, checklistItemId: number, payload: AtualizarChecklistItemRequest): Promise<ChecklistItemOut>`, `removerChecklistItem(token: string, itemId: number, checklistItemId: number): Promise<void>`, `listarCatalogoLabels(token: string): Promise<LabelOut[]>`, `listarLabelsDoItem(token: string, itemId: number): Promise<LabelOut[]>`, `substituirLabelsDoItem(token: string, itemId: number, labelIds: number[]): Promise<LabelOut[]>`, `listarComentarios(token: string, itemId: number): Promise<ComentarioOut[]>`, `criarComentario(token: string, itemId: number, payload: CriarComentarioRequest): Promise<ComentarioOut>`, `listarAnexos(token: string, itemId: number): Promise<AnexoOut[]>`, `criarAnexo(token: string, itemId: number, payload: CriarAnexoRequest): Promise<AnexoOut>`, `removerAnexo(token: string, itemId: number, anexoId: number): Promise<void>`.
  - Consumed by Task 16 (`listarChecklist`, `listarLabelsDoItem`, `listarComentarios`, `listarAnexos` + the 4 `*Out` types) and Task 17 (all 12 functions + all types).

Note on `ChecklistItemOut`: the backend's actual Pydantic schema (`docs/superpowers/plans/2026-08-27-fase2-colaboracao-backend.md` Task 2) returns `item_producao_id` in addition to `id`/`texto`/`concluido`/`ordem`. Included here for type accuracy even though no frontend call site needs to read it (the item id is already known from the parent `ItemProducao` in every call site).

- [ ] **Step 1: Create `frontend/src/types/colaboracao.ts`**
  ```ts
  export interface ChecklistItemOut {
    id: number;
    item_producao_id: number;
    texto: string;
    concluido: boolean;
    ordem: number;
  }

  export interface LabelOut {
    id: number;
    nome: string;
    cor: string;
  }

  export interface ComentarioOut {
    id: number;
    texto: string;
    autor_id: number;
    autor_username: string;
    criado_em: string;
  }

  export interface AnexoOut {
    id: number;
    titulo: string;
    url: string;
    enviado_por: number;
    enviado_por_username: string;
    criado_em: string;
  }

  export interface CriarChecklistItemRequest {
    texto: string;
    ordem: number;
  }

  export interface AtualizarChecklistItemRequest {
    texto?: string;
    concluido?: boolean;
  }

  export interface SubstituirLabelsRequest {
    label_ids: number[];
  }

  export interface CriarComentarioRequest {
    texto: string;
  }

  export interface CriarAnexoRequest {
    titulo: string;
    url: string;
  }
  ```

- [ ] **Step 2: Extend the import at the top of `frontend/src/services/api.ts`**
  Replace:
  ```ts
  import type { BulkSubmitRequest, ItemProducao, SequenciaResponse } from "../types/producao";
  ```
  With:
  ```ts
  import type {
    AnexoOut,
    AtualizarChecklistItemRequest,
    ChecklistItemOut,
    ComentarioOut,
    CriarAnexoRequest,
    CriarChecklistItemRequest,
    CriarComentarioRequest,
    LabelOut,
  } from "../types/colaboracao";
  import type { BulkSubmitRequest, ItemProducao, SequenciaResponse } from "../types/producao";
  ```

- [ ] **Step 3: Append the 12 client functions at the end of `frontend/src/services/api.ts`**
  (after the existing `registerUser` function, following the exact same `authHeaders`/`parseJsonOrThrow`/`ApiError` pattern used by every function already in the file):
  ```ts
  export async function listarChecklist(token: string, itemId: number): Promise<ChecklistItemOut[]> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/checklist`, {
      headers: authHeaders(token),
    });
    return parseJsonOrThrow<ChecklistItemOut[]>(response);
  }

  export async function criarChecklistItem(
    token: string,
    itemId: number,
    payload: CriarChecklistItemRequest
  ): Promise<ChecklistItemOut> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow<ChecklistItemOut>(response);
  }

  export async function atualizarChecklistItem(
    token: string,
    itemId: number,
    checklistItemId: number,
    payload: AtualizarChecklistItemRequest
  ): Promise<ChecklistItemOut> {
    const response = await fetch(
      `${API_BASE_URL}/producao/itens/${itemId}/checklist/${checklistItemId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify(payload),
      }
    );
    return parseJsonOrThrow<ChecklistItemOut>(response);
  }

  export async function removerChecklistItem(
    token: string,
    itemId: number,
    checklistItemId: number
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/producao/itens/${itemId}/checklist/${checklistItemId}`,
      { method: "DELETE", headers: authHeaders(token) }
    );
    if (!response.ok) {
      throw new ApiError(response.status, "Falha ao remover item do checklist.");
    }
  }

  export async function listarCatalogoLabels(token: string): Promise<LabelOut[]> {
    const response = await fetch(`${API_BASE_URL}/labels`, { headers: authHeaders(token) });
    return parseJsonOrThrow<LabelOut[]>(response);
  }

  export async function listarLabelsDoItem(token: string, itemId: number): Promise<LabelOut[]> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/labels`, {
      headers: authHeaders(token),
    });
    return parseJsonOrThrow<LabelOut[]>(response);
  }

  export async function substituirLabelsDoItem(
    token: string,
    itemId: number,
    labelIds: number[]
  ): Promise<LabelOut[]> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/labels`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ label_ids: labelIds }),
    });
    return parseJsonOrThrow<LabelOut[]>(response);
  }

  export async function listarComentarios(token: string, itemId: number): Promise<ComentarioOut[]> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/comentarios`, {
      headers: authHeaders(token),
    });
    return parseJsonOrThrow<ComentarioOut[]>(response);
  }

  export async function criarComentario(
    token: string,
    itemId: number,
    payload: CriarComentarioRequest
  ): Promise<ComentarioOut> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/comentarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow<ComentarioOut>(response);
  }

  export async function listarAnexos(token: string, itemId: number): Promise<AnexoOut[]> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/anexos`, {
      headers: authHeaders(token),
    });
    return parseJsonOrThrow<AnexoOut[]>(response);
  }

  export async function criarAnexo(
    token: string,
    itemId: number,
    payload: CriarAnexoRequest
  ): Promise<AnexoOut> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/anexos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow<AnexoOut>(response);
  }

  export async function removerAnexo(token: string, itemId: number, anexoId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/anexos/${anexoId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    if (!response.ok) {
      throw new ApiError(response.status, "Falha ao remover anexo.");
    }
  }
  ```

- [ ] **Step 4: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/services/api.ts src/types/colaboracao.ts
  ```

- [ ] **Step 5: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run src/services/api.test.ts
  ```

- [ ] **Step 6: Commit**
  ```bash
  cd frontend
  git add src/types/colaboracao.ts src/services/api.ts
  git commit -m "$(cat <<'EOF'
  feat: add colaboracao api client (checklist, labels, comentarios, anexos)
  EOF
  )"
  ```

---

### Task 12: Nav/shell visual redesign

**Files:**
- Modify: `frontend/src/routes/Nav.tsx`

**Depends-on:** 10

**Interfaces:**
- Consumes: none (pure visual restyle; Tailwind's utility-class pipeline from Task 10, no imported symbols beyond what the file already imports).
- Produces: none (the component's export signature, `PROGRAMACAO_ROLES`/`USUARIOS_ROLES` exports, and all conditional logic are unchanged).

The current file is small — token-gated links plus a logout button, no styling at all today. The restyle below only adds `className` props and wrapper `<div>`s; the `if (!token) return null` guard, the `PROGRAMACAO_ROLES`/`USUARIOS_ROLES` arrays, the role-gating conditionals, and every visible text string (`"Producao"`, `"Programacao"`, `"Usuarios"`, `"Sair"`) stay byte-identical, since `Nav.test.tsx` asserts on that exact text.

- [ ] **Step 1: Replace the full contents of `frontend/src/routes/Nav.tsx`**
  ```tsx
  import { Link } from "react-router-dom";

  import { useAuth, type Role } from "../auth/AuthContext";

  export const PROGRAMACAO_ROLES: Role[] = ["admin", "programador"];
  export const USUARIOS_ROLES: Role[] = ["admin"];

  export function Nav() {
    const { token, role, logout } = useAuth();

    if (!token) return null;

    return (
      <nav className="flex items-center justify-between gap-4 bg-slate-900 px-6 py-3 text-slate-100 shadow-md">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold tracking-tight text-white">plannerLogistica</span>
          <div className="flex items-center gap-4 text-sm">
            <Link
              to="/"
              className="rounded px-2 py-1 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
            >
              Producao
            </Link>
            {role && PROGRAMACAO_ROLES.includes(role) && (
              <Link
                to="/programacao"
                className="rounded px-2 py-1 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Programacao
              </Link>
            )}
            {role && USUARIOS_ROLES.includes(role) && (
              <Link
                to="/usuarios"
                className="rounded px-2 py-1 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Usuarios
              </Link>
            )}
          </div>
        </div>
        <button
          onClick={logout}
          className="rounded border border-red-400/40 px-3 py-1 text-sm font-medium text-red-300 transition-colors hover:bg-red-400/10 hover:text-red-200"
        >
          Sair
        </button>
      </nav>
    );
  }
  ```

- [ ] **Step 2: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/routes/Nav.tsx
  ```

- [ ] **Step 3: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run src/routes/Nav.test.tsx
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd frontend
  git add src/routes/Nav.tsx
  git commit -m "$(cat <<'EOF'
  feat: redesign nav bar with tailwind
  EOF
  )"
  ```

---

### Task 13: Login/Register visual redesign

**Files:**
- Modify: `frontend/src/routes/AppRouter.tsx`

**Depends-on:** 10

**Interfaces:**
- Consumes: none (pure visual restyle; Tailwind's utility-class pipeline from Task 10).
- Produces: none (submit handlers, `useAuth()` calls, the `if (token) return <Navigate .../>` guards, and the `registerUser(null, { username, password, role: "admin" })` call are unchanged; `AppRouter`'s route table is unchanged).

`LoginPage` and `RegisterPage` are both plain unstyled `<form>` elements today. Restyled below into centered card-style auth forms — page wrapper centers content, form has padding/shadow/rounded corners/max-width, inputs share consistent border/padding/focus styles, the primary button is styled solid, the error `<p role="alert">` becomes a visible red banner, and the secondary link is styled as normal link text. Deliberately no page heading was added inside either form: `App.test.tsx` calls `screen.getByText("Entrar")`, which throws on multiple matches — a heading reading "Entrar" next to a button reading "Entrar" would break that assertion (the same risk applies symmetrically to `RegisterPage`'s "Criar administrador" button), so both forms stay heading-less. Every other string (placeholders `"usuario"`/`"senha"`, button labels, the exact error text `"Usuario ou senha invalidos."`, the link copy) is unchanged.

- [ ] **Step 1: Replace the full contents of `frontend/src/routes/AppRouter.tsx`**
  ```tsx
  import { useState } from "react";
  import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";

  import { useAuth } from "../auth/AuthContext";
  import { GerenciamentoUsuarios } from "../pages/GerenciamentoUsuarios";
  import { Producao } from "../pages/Producao";
  import { ProgramacaoPatan } from "../pages/ProgramacaoPatan";
  import { ApiError, registerUser } from "../services/api";
  import { Nav, PROGRAMACAO_ROLES, USUARIOS_ROLES } from "./Nav";
  import { RequireRole } from "./RequireRole";

  const AUTH_INPUT_CLASSES =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300";

  function LoginPage() {
    const { login, token } = useAuth();
    const [erro, setErro] = useState<string | null>(null);

    if (token) return <Navigate to="/" replace />;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <form
          className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await login(String(form.get("username")), String(form.get("password")));
            } catch {
              setErro("Usuario ou senha invalidos.");
            }
          }}
        >
          <div className="flex flex-col gap-3">
            <input name="username" placeholder="usuario" className={AUTH_INPUT_CLASSES} />
            <input
              name="password"
              type="password"
              placeholder="senha"
              className={AUTH_INPUT_CLASSES}
            />
            <button
              type="submit"
              className="mt-2 rounded-md bg-slate-900 px-4 py-2 font-medium text-white transition-colors hover:bg-slate-700"
            >
              Entrar
            </button>
          </div>
          {erro && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </p>
          )}
          <p className="mt-6 text-sm text-slate-600">
            Primeiro acesso?{" "}
            <Link to="/register" className="font-medium text-slate-900 underline">
              Criar administrador
            </Link>
          </p>
        </form>
      </div>
    );
  }

  function RegisterPage() {
    const { login, token } = useAuth();
    const [erro, setErro] = useState<string | null>(null);

    if (token) return <Navigate to="/" replace />;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <form
          className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const username = String(form.get("username"));
            const password = String(form.get("password"));
            try {
              await registerUser(null, { username, password, role: "admin" });
              await login(username, password);
            } catch (err) {
              setErro(
                err instanceof ApiError
                  ? err.message
                  : "Falha ao criar administrador."
              );
            }
          }}
        >
          <div className="flex flex-col gap-3">
            <input name="username" placeholder="usuario" className={AUTH_INPUT_CLASSES} />
            <input
              name="password"
              type="password"
              placeholder="senha"
              className={AUTH_INPUT_CLASSES}
            />
            <button
              type="submit"
              className="mt-2 rounded-md bg-slate-900 px-4 py-2 font-medium text-white transition-colors hover:bg-slate-700"
            >
              Criar administrador
            </button>
          </div>
          {erro && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </p>
          )}
          <p className="mt-6 text-sm text-slate-600">
            Ja tem conta?{" "}
            <Link to="/login" className="font-medium text-slate-900 underline">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    );
  }

  export function AppRouter() {
    return (
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/usuarios"
            element={
              <RequireRole allowed={USUARIOS_ROLES}>
                <GerenciamentoUsuarios />
              </RequireRole>
            }
          />
          <Route
            path="/programacao"
            element={
              <RequireRole allowed={PROGRAMACAO_ROLES}>
                <ProgramacaoPatan />
              </RequireRole>
            }
          />
          <Route
            path="/"
            element={
              <RequireRole allowed={["admin", "programador", "usuario_comum"]}>
                <Producao />
              </RequireRole>
            }
          />
        </Routes>
      </BrowserRouter>
    );
  }
  ```

- [ ] **Step 2: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/routes/AppRouter.tsx
  ```

- [ ] **Step 3: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run src/App.test.tsx
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd frontend
  git add src/routes/AppRouter.tsx
  git commit -m "$(cat <<'EOF'
  feat: redesign login/register forms with tailwind
  EOF
  )"
  ```

---

### Task 14: GerenciamentoUsuarios visual redesign

**Files:**
- Modify: `frontend/src/pages/GerenciamentoUsuarios.tsx`

**Depends-on:** 10

**Interfaces:**
- Consumes: none (pure visual restyle; Tailwind's utility-class pipeline from Task 10).
- Produces: none (`handleCriar`/`handleAlterarRole`/`handleRemover`/`tratarErro`/`carregar` and the fetch-on-mount `useEffect` are unchanged).

The current file is a plain `<table>` plus a "novo usuario" form below it, no styling. Restyled below: table with zebra-striped rows, styled role `<select>` and "Remover" button, the "Novo usuario" section visually separated into a bordered card. DOM order is preserved exactly (table rows first, "novo usuario" section after) — `GerenciamentoUsuarios.test.tsx` picks the row's role `<select>` via `screen.getAllByRole("combobox")[0]`, which only holds if the table's select still precedes the "novo usuario" select in document order.

- [ ] **Step 1: Replace the full contents of `frontend/src/pages/GerenciamentoUsuarios.tsx`**
  ```tsx
  import { useEffect, useState } from "react";

  import { useAuth } from "../auth/AuthContext";
  import {
    ApiError,
    deleteUser,
    listUsers,
    registerUser,
    updateUserRole,
    type UserOut,
  } from "../services/api";

  const ROLES = ["admin", "programador", "usuario_comum"] as const;

  const SELECT_CLASSES =
    "rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300";
  const INPUT_CLASSES =
    "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300";

  export function GerenciamentoUsuarios() {
    const { token, logout } = useAuth();
    const [users, setUsers] = useState<UserOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [novoUsername, setNovoUsername] = useState("");
    const [novaSenha, setNovaSenha] = useState("");
    const [novoRole, setNovoRole] = useState<(typeof ROLES)[number]>("usuario_comum");

    // Sessao expirada (401): desloga em vez de mostrar um erro generico -
    // RequireRole redireciona para /login assim que o token cai.
    function tratarErro(err: unknown, mensagem: string) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setErro(mensagem);
    }

    async function carregar() {
      if (!token) return;
      setLoading(true);
      try {
        setUsers(await listUsers(token));
        setErro(null);
      } catch (err) {
        tratarErro(err, "Falha ao carregar usuarios.");
      } finally {
        setLoading(false);
      }
    }

    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount: carregar's setLoading(true) is synchronous, but deps is [token] only (none of the states carregar sets), so there's no loop or stale-closure risk; same suppression pattern as exhaustive-deps below.
      carregar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    async function handleCriar() {
      if (!token) return;
      try {
        await registerUser(token, { username: novoUsername, password: novaSenha, role: novoRole });
        setNovoUsername("");
        setNovaSenha("");
        await carregar();
      } catch (err) {
        tratarErro(err, "Falha ao criar usuario.");
      }
    }

    async function handleAlterarRole(userId: number, role: string) {
      if (!token) return;
      try {
        await updateUserRole(token, userId, role);
        await carregar();
      } catch (err) {
        tratarErro(err, "Falha ao atualizar usuario.");
      }
    }

    async function handleRemover(userId: number) {
      if (!token) return;
      try {
        await deleteUser(token, userId);
        await carregar();
      } catch (err) {
        tratarErro(err, "Falha ao remover usuario.");
      }
    }

    if (loading) return <p className="p-6 text-slate-600">Carregando usuarios...</p>;

    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Gerenciamento de Usuarios</h1>
        {erro && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        )}

        <table className="w-full table-auto border-collapse overflow-hidden rounded-lg shadow-sm">
          <tbody>
            {users.map((user, index) => (
              <tr key={user.id} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className="px-4 py-2 text-sm text-slate-900">{user.username}</td>
                <td className="px-4 py-2">
                  <select
                    value={user.role}
                    onChange={(event) => handleAlterarRole(user.id, event.target.value)}
                    className={SELECT_CLASSES}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleRemover(user.id)}
                    className="rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 rounded-lg border border-slate-200 p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Novo usuario</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              placeholder="usuario"
              value={novoUsername}
              onChange={(event) => setNovoUsername(event.target.value)}
              className={INPUT_CLASSES}
            />
            <input
              placeholder="senha"
              type="password"
              value={novaSenha}
              onChange={(event) => setNovaSenha(event.target.value)}
              className={INPUT_CLASSES}
            />
            <select
              value={novoRole}
              onChange={(event) => setNovoRole(event.target.value as (typeof ROLES)[number])}
              className={SELECT_CLASSES}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              onClick={handleCriar}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              Criar usuario
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/pages/GerenciamentoUsuarios.tsx
  ```

- [ ] **Step 3: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run src/pages/GerenciamentoUsuarios.test.tsx
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd frontend
  git add src/pages/GerenciamentoUsuarios.tsx
  git commit -m "$(cat <<'EOF'
  feat: redesign gerenciamento de usuarios with tailwind
  EOF
  )"
  ```

---

### Task 15: Producao/ProgramacaoPatan pages — visual redesign + staging checklist preview

**Files:**
- Modify: `frontend/src/pages/Producao.tsx`, `frontend/src/pages/ProgramacaoPatan.tsx`

**Depends-on:** 10

**Interfaces:**
- Consumes: none (pure visual restyle + one static string; Tailwind's utility-class pipeline from Task 10).
- Produces: none (data-fetching logic, the `CARREGAR` dispatch/`useEffect`, `staleTime`/`refetchOnWindowFocus` query options, and 401-handling are unchanged in both files).

Restyled: page container/heading, loading state as a small spinner instead of raw text, error state as a styled alert banner instead of a raw `<p>`, consistent spacing around `<SequenciaBoard>`. Both files keep every string the existing tests assert on (`"Carregando producao..."`, `"Erro ao carregar a producao."`, `"Carregando sequencia..."`, `"Erro ao carregar a sequencia."`, `"Enviar lote"`/`"Enviando..."`, `"Falha ao enviar o lote. Nada foi salvo."`) — adding a `role="alert"`/wrapper markup around a text node does not change what `getByText` matches.

**Deviation from the brief, flagged explicitly:** the brief describes the "5 passos padrao serao criados" marker as appearing "on each staging card." In the actual codebase neither `Producao.tsx` nor `ProgramacaoPatan.tsx` renders individual item cards — that happens inside `SequenciaCard.tsx`, which belongs exclusively to Tasks 16/17 under the parallel-wave file-disjointness rule (this task's `Files:` is `Producao.tsx`/`ProgramacaoPatan.tsx` only, with `Depends-on: 10`, so it runs in the same wave as Task 16 — touching `SequenciaCard.tsx` here would silently create a same-file collision with no declared dependency edge). Since every card would show the exact same unconditional text, a single page-level note carries identical information with less repetition. Resolution: render the note once, as a small pill above `<SequenciaBoard>`, in `ProgramacaoPatan.tsx` only (not `Producao.tsx` — the design spec scopes this preview to the Programação/staging screen specifically, since `Producao.tsx` shows already-persisted items, not pre-submit ones). Exact text is unchanged (`"5 passos padrao serao criados"`).

- [ ] **Step 1: Replace the full contents of `frontend/src/pages/Producao.tsx`**
  ```tsx
  import { useQuery } from "@tanstack/react-query";
  import { useEffect, useReducer, useState } from "react";

  import { useAuth } from "../auth/AuthContext";
  import { SequenciaBoard } from "../components/SequenciaBoard/SequenciaBoard";
  import { ApiError, getSequencia } from "../services/api";
  import { initialSequenciaState, sequenciaReducer } from "../state/sequenciaReducer";
  import type { Patan } from "../types/producao";

  const FIELD_LABEL_CLASSES = "flex flex-col gap-1 text-sm font-medium text-slate-700";
  const FIELD_INPUT_CLASSES =
    "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300";

  export function Producao() {
    const { token, role, logout } = useAuth();
    const [linha, setLinha] = useState("L1");
    const [turno, setTurno] = useState(1);
    const [patan, setPatan] = useState<Patan>("A");
    const [state, dispatch] = useReducer(sequenciaReducer, initialSequenciaState);

    const { data, isLoading, isError, error } = useQuery({
      queryKey: ["sequencia-producao", linha, turno, patan],
      queryFn: async () => {
        if (!token) throw new Error("Nao autenticado.");
        return getSequencia(token, { linha, turno, patan });
      },
      enabled: Boolean(token),
      retry: false,
      // Ver ProgramacaoPatan.tsx: refetch em segundo plano nao pode
      // sobrescrever silenciosamente o estado local.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    });

    useEffect(() => {
      if (!data) return;
      dispatch({
        type: "CARREGAR",
        payload: { turno, dataBase: new Date().toISOString(), itens: data.itens },
      });
    }, [data, turno]);

    useEffect(() => {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      }
    }, [error, logout]);

    if (isLoading) {
      return (
        <div className="flex items-center gap-3 p-6 text-slate-600">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          <p>Carregando producao...</p>
        </div>
      );
    }
    if (isError) {
      return (
        <p role="alert" className="m-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Erro ao carregar a producao.
        </p>
      );
    }

    const somenteLeitura = role === "usuario_comum";

    return (
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Producao</h1>
        <div className="mb-6 flex flex-wrap gap-4">
          <label className={FIELD_LABEL_CLASSES}>
            Linha
            <input
              value={linha}
              onChange={(event) => setLinha(event.target.value)}
              className={FIELD_INPUT_CLASSES}
            />
          </label>
          <label className={FIELD_LABEL_CLASSES}>
            Turno
            <select
              value={turno}
              onChange={(event) => setTurno(Number(event.target.value))}
              className={FIELD_INPUT_CLASSES}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className={FIELD_LABEL_CLASSES}>
            Patan
            <select
              value={patan}
              onChange={(event) => setPatan(event.target.value as Patan)}
              className={FIELD_INPUT_CLASSES}
            >
              {["A", "B", "C", "D", "E", "F", "G", "H"].map((letra) => (
                <option key={letra} value={letra}>
                  {letra}
                </option>
              ))}
            </select>
          </label>
        </div>

        <SequenciaBoard
          itensPorPosto={state.itensPorPosto}
          onReordenar={(posto, itens) => dispatch({ type: "REORDENAR", payload: { posto, itens } })}
          somenteLeitura={somenteLeitura}
        />
      </div>
    );
  }
  ```

- [ ] **Step 2: Replace the full contents of `frontend/src/pages/ProgramacaoPatan.tsx`**
  ```tsx
  import { useQuery } from "@tanstack/react-query";
  import { useEffect, useReducer, useState } from "react";

  import { useAuth } from "../auth/AuthContext";
  import { SequenciaBoard } from "../components/SequenciaBoard/SequenciaBoard";
  import { ApiError, getSequencia, submitBulkSequencia } from "../services/api";
  import { initialSequenciaState, sequenciaReducer } from "../state/sequenciaReducer";
  import type { BulkSubmitRequest, Patan } from "../types/producao";

  const FIELD_LABEL_CLASSES = "flex flex-col gap-1 text-sm font-medium text-slate-700";
  const FIELD_INPUT_CLASSES =
    "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300";

  export function ProgramacaoPatan() {
    const { token, logout } = useAuth();
    const [linha, setLinha] = useState("L1");
    const [turno, setTurno] = useState(1);
    const [patan, setPatan] = useState<Patan>("A");
    const [state, dispatch] = useReducer(sequenciaReducer, initialSequenciaState);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const { data, isLoading, isError, error } = useQuery({
      queryKey: ["sequencia", linha, turno, patan],
      queryFn: async () => {
        if (!token) throw new Error("Nao autenticado.");
        return getSequencia(token, { linha, turno, patan });
      },
      enabled: Boolean(token),
      retry: false,
      // Sequenciamento e editado em memoria pelo operador; um refetch em
      // segundo plano (foco de janela, reconexao) nao pode sobrescrever
      // silenciosamente uma reordenacao ainda nao enviada.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    });

    // So carrega no reducer quando a query realmente traz um dado novo
    // (troca de linha/turno/patan), nao a cada re-render.
    useEffect(() => {
      if (!data) return;
      dispatch({
        type: "CARREGAR",
        payload: { turno, dataBase: new Date().toISOString(), itens: data.itens },
      });
    }, [data, turno]);

    useEffect(() => {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      }
    }, [error, logout]);

    async function handleEnviar() {
      if (!token) return;
      setEnviando(true);
      setErro(null);
      try {
        const itens = Object.values(state.itensPorPosto).flat();
        const payload: BulkSubmitRequest = { linha, turno, patan, itens };
        await submitBulkSequencia(token, payload);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logout();
        } else {
          setErro("Falha ao enviar o lote. Nada foi salvo.");
        }
      } finally {
        setEnviando(false);
      }
    }

    if (isLoading) {
      return (
        <div className="flex items-center gap-3 p-6 text-slate-600">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          <p>Carregando sequencia...</p>
        </div>
      );
    }
    if (isError) {
      return (
        <p role="alert" className="m-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Erro ao carregar a sequencia.
        </p>
      );
    }

    return (
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Programacao de Patan</h1>
        <div className="mb-6 flex flex-wrap gap-4">
          <label className={FIELD_LABEL_CLASSES}>
            Linha
            <input
              value={linha}
              onChange={(event) => setLinha(event.target.value)}
              className={FIELD_INPUT_CLASSES}
            />
          </label>
          <label className={FIELD_LABEL_CLASSES}>
            Turno
            <select
              value={turno}
              onChange={(event) => setTurno(Number(event.target.value))}
              className={FIELD_INPUT_CLASSES}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className={FIELD_LABEL_CLASSES}>
            Patan
            <select
              value={patan}
              onChange={(event) => setPatan(event.target.value as Patan)}
              className={FIELD_INPUT_CLASSES}
            >
              {["A", "B", "C", "D", "E", "F", "G", "H"].map((letra) => (
                <option key={letra} value={letra}>
                  {letra}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mb-4 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          5 passos padrao serao criados
        </p>

        <SequenciaBoard
          itensPorPosto={state.itensPorPosto}
          onReordenar={(posto, itens) => dispatch({ type: "REORDENAR", payload: { posto, itens } })}
        />

        {erro && (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </p>
        )}
        <button
          onClick={handleEnviar}
          disabled={enviando}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {enviando ? "Enviando..." : "Enviar lote"}
        </button>
      </div>
    );
  }
  ```

- [ ] **Step 3: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/pages/Producao.tsx src/pages/ProgramacaoPatan.tsx
  ```

- [ ] **Step 4: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run src/pages/Producao.test.tsx src/pages/ProgramacaoPatan.test.tsx
  ```

- [ ] **Step 5: Commit**
  ```bash
  cd frontend
  git add src/pages/Producao.tsx src/pages/ProgramacaoPatan.tsx
  git commit -m "$(cat <<'EOF'
  feat: redesign producao/programacao pages, add staging checklist preview note
  EOF
  )"
  ```

---

### Task 16: SequenciaCard/SequenciaBoard visual redesign + collaboration footer

**Files:**
- Modify: `frontend/src/components/SequenciaBoard/SequenciaBoard.tsx`, `frontend/src/components/SequenciaBoard/SequenciaCard.tsx`

**Depends-on:** 10, 11

**Interfaces:**
- Consumes: `listarChecklist(token: string, itemId: number): Promise<ChecklistItemOut[]>`, `listarLabelsDoItem(token: string, itemId: number): Promise<LabelOut[]>`, `listarComentarios(token: string, itemId: number): Promise<ComentarioOut[]>`, `listarAnexos(token: string, itemId: number): Promise<AnexoOut[]>` (Task 11, `frontend/src/services/api.ts`); `ChecklistItemOut`, `LabelOut`, `ComentarioOut`, `AnexoOut` (Task 11, `frontend/src/types/colaboracao.ts`); the `status-normal`/`status-critico`/`status-excluido`/`status-travado` Tailwind color tokens (Task 10, `tailwind.config.js`); pre-existing `useAuth` (`frontend/src/auth/AuthContext.tsx`).
- Produces: `SequenciaCard({ item }: SequenciaCardProps): JSX.Element` (same external signature as before) with an internal (non-exported) `STATUS_CARD_CLASSES` lookup and `CardFooter` helper — Task 17 further edits this same file and must preserve both. `SequenciaBoard`'s props/signature are unchanged.

Both files today implement drag-and-drop via `@dnd-kit` — none of that logic changes (`onDragEnd`, `arrayMove`, the sequence recompute, `useSortable`). Restyled: board columns get headers/background/shadow; cards get shadow/rounded corners/hover-lift, a distinct look while `isDragging` (from `useSortable`'s own return value), and a status-linked border/background color looked up from `item.status` (`PlanItemStatus` from `frontend/src/types/producao.ts`). Each card also gains a compact read-only footer — checklist progress ("x/y"), label chips (background = each label's own `cor`), a comment count, an attachment count — fetched with one `useQuery` per data kind per card (this scales fine at this board's size; no batching needed).

Tailwind class names are used as complete literal strings everywhere below (e.g. `"border-status-critico bg-status-critico/10"`), never built via string interpolation — Tailwind's content scanner only picks up classes that appear as literal substrings in scanned files, so a template-interpolated class name would silently fail to compile.

Since `SequenciaBoard.test.tsx` renders `<SequenciaBoard>` directly with no `QueryClientProvider` in the tree, and `CardFooter`'s new `useQuery` calls require one, every test in that file is expected to fail after this change (`useQuery` throws synchronously without a provider — this is not scoped to just the footer's own assertions, the whole render throws). This is expected collateral, not a task failure: test-writing/mocking for the new footer is deferred to the project's end-of-phase testing gate, per the design spec's explicit "Fora de escopo" section. Note it in your report; do not add test mocking to work around it.

- [ ] **Step 1: Replace the full contents of `frontend/src/components/SequenciaBoard/SequenciaBoard.tsx`**
  ```tsx
  import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
  import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";

  import { PlanItemStatus, type ItemProducao } from "../../types/producao";
  import { SequenciaCard } from "./SequenciaCard";

  interface SequenciaBoardProps {
    itensPorPosto: Record<string, ItemProducao[]>;
    onReordenar: (posto: string, itens: ItemProducao[]) => void;
    somenteLeitura?: boolean;
  }

  export function SequenciaBoard({
    itensPorPosto,
    onReordenar,
    somenteLeitura = false,
  }: SequenciaBoardProps) {
    return (
      <div className="sequencia-board flex flex-wrap gap-4">
        {Object.entries(itensPorPosto).map(([posto, itens]) => (
          <div
            key={posto}
            className="sequencia-board__coluna w-72 rounded-lg bg-slate-50 p-3 shadow-sm"
          >
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
              {posto}
            </h3>
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={(event: DragEndEvent) => {
                if (somenteLeitura) return;
                const { active, over } = event;
                if (!over || active.id === over.id) return;

                const ids = itens.map((entry) => String(entry.id ?? `novo-${entry.sequencia}`));
                const oldIndex = ids.indexOf(String(active.id));
                const newIndex = ids.indexOf(String(over.id));
                if (oldIndex === -1 || newIndex === -1) return;

                const reordenado = arrayMove(itens, oldIndex, newIndex).map((entry, index) => ({
                  ...entry,
                  sequencia: entry.status === PlanItemStatus.Normal ? index + 1 : entry.sequencia,
                }));
                onReordenar(posto, reordenado);
              }}
            >
              <SortableContext
                items={itens.map((entry) => String(entry.id ?? `novo-${entry.sequencia}`))}
                strategy={verticalListSortingStrategy}
              >
                {itens.map((entry) => (
                  <SequenciaCard key={entry.id ?? `novo-${entry.sequencia}`} item={entry} />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        ))}
      </div>
    );
  }
  ```

- [ ] **Step 2: Replace the full contents of `frontend/src/components/SequenciaBoard/SequenciaCard.tsx`**
  ```tsx
  import { useSortable } from "@dnd-kit/sortable";
  import { CSS } from "@dnd-kit/utilities";
  import { useQuery } from "@tanstack/react-query";

  import { useAuth } from "../../auth/AuthContext";
  import {
    listarAnexos,
    listarChecklist,
    listarComentarios,
    listarLabelsDoItem,
  } from "../../services/api";
  import { PlanItemStatus, type ItemProducao } from "../../types/producao";

  interface SequenciaCardProps {
    item: ItemProducao;
  }

  const STATUS_CARD_CLASSES: Record<PlanItemStatus, string> = {
    [PlanItemStatus.Normal]: "border-status-normal bg-white",
    [PlanItemStatus.Critico]: "border-status-critico bg-status-critico/10",
    [PlanItemStatus.Excluido]: "border-status-excluido bg-status-excluido/10 opacity-60",
    [PlanItemStatus.Locked]: "border-status-travado bg-status-travado/10",
  };

  function CardFooter({ itemId }: { itemId: number }) {
    const { token } = useAuth();

    const checklistQuery = useQuery({
      queryKey: ["item-checklist", itemId],
      queryFn: () => listarChecklist(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const labelsQuery = useQuery({
      queryKey: ["item-labels", itemId],
      queryFn: () => listarLabelsDoItem(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const comentariosQuery = useQuery({
      queryKey: ["item-comentarios", itemId],
      queryFn: () => listarComentarios(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const anexosQuery = useQuery({
      queryKey: ["item-anexos", itemId],
      queryFn: () => listarAnexos(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });

    const checklist = checklistQuery.data ?? [];
    const concluidos = checklist.filter((passo) => passo.concluido).length;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
        <span>
          {concluidos}/{checklist.length}
        </span>
        {(labelsQuery.data ?? []).map((label) => (
          <span
            key={label.id}
            className="rounded-full px-2 py-0.5 text-white"
            style={{ backgroundColor: label.cor }}
          >
            {label.nome}
          </span>
        ))}
        <span>{(comentariosQuery.data ?? []).length} comentario(s)</span>
        <span>{(anexosQuery.data ?? []).length} anexo(s)</span>
      </div>
    );
  }

  export function SequenciaCard({ item }: SequenciaCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: String(item.id ?? `novo-${item.sequencia}`),
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        data-testid="sequencia-card"
        className={[
          "sequencia-card",
          item.is_critico ? "sequencia-card--critico" : "",
          "mb-2 rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md",
          STATUS_CARD_CLASSES[item.status],
          isDragging ? "rotate-1 shadow-lg" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <strong>
          {item.linha} - {item.posto_trabalho}
        </strong>
        <div>{item.kanbans} kanban(s)</div>
        {item.hora_inicial && item.hora_final && (
          <div>
            {item.hora_inicial.slice(11, 16)} - {item.hora_final.slice(11, 16)}
          </div>
        )}
        {item.almoco_incluso && <div data-testid="almoco-label">HORARIO DE ALMOCO INCLUSO</div>}
        {item.tem_falta_estoque && <div data-testid="falta-estoque">Falta de estoque</div>}
        {item.id !== null && <CardFooter itemId={item.id} />}
      </div>
    );
  }
  ```

- [ ] **Step 3: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/components/SequenciaBoard/SequenciaBoard.tsx src/components/SequenciaBoard/SequenciaCard.tsx
  ```

- [ ] **Step 4: Verify the status-linked Tailwind tokens actually compile**
  ```bash
  cd frontend
  npx vite build
  grep -c "border-status-critico" dist/assets/*.css
  ```
  Expect a non-zero count in at least one built CSS file — confirms Tailwind picked up the custom `status-critico` token now that real source (`SequenciaCard.tsx`) references it as a literal class name (Task 10's own build check couldn't verify this yet, since nothing referenced the token at that point).

- [ ] **Step 5: Run the existing test suite (regression check — failures here are expected, see note above)**
  ```bash
  cd frontend && npx vitest run src/components/SequenciaBoard/SequenciaBoard.test.tsx
  ```
  If every test in this file now fails with a "No QueryClient set" error, that is the expected collateral described above — report it, do not attempt to fix it by adding test mocking.

- [ ] **Step 6: Commit**
  ```bash
  cd frontend
  git add src/components/SequenciaBoard/SequenciaBoard.tsx src/components/SequenciaBoard/SequenciaCard.tsx
  git commit -m "$(cat <<'EOF'
  feat: redesign sequencia board/card with tailwind, add collaboration footer
  EOF
  )"
  ```

---

### Task 17: ItemDetalhe panel (full checklist/label/comment/attachment interaction) + wire click-to-open

**Files:**
- Create: `frontend/src/components/ItemDetalhe/ItemDetalhe.tsx`
- Modify: `frontend/src/components/SequenciaBoard/SequenciaCard.tsx`

**Depends-on:** 11, 16

**Interfaces:**
- Consumes: `atualizarChecklistItem, criarAnexo, criarChecklistItem, criarComentario, listarAnexos, listarCatalogoLabels, listarChecklist, listarComentarios, listarLabelsDoItem, removerAnexo, removerChecklistItem, substituirLabelsDoItem` (Task 11, `frontend/src/services/api.ts`, exact signatures in Task 11's Interfaces section); `ChecklistItemOut, LabelOut, ComentarioOut, AnexoOut` (Task 11, `frontend/src/types/colaboracao.ts`); the Task 16 version of `SequenciaCard.tsx` (this task replaces its content, preserving `STATUS_CARD_CLASSES` and `CardFooter` verbatim and adding click-to-open on top).
- Produces: `ItemDetalhe({ item, onClose }: ItemDetalheProps): JSX.Element`.

Mechanism chosen for "which item is open": local `useState` inside `SequenciaCard` itself (not lifted to `SequenciaBoard` or the page components, which are out of this task's `Files:` scope). Clicking a card sets `detalheAberto = true` and renders `<ItemDetalhe>` as a sibling overlay (not nested inside the draggable `<div>`, so none of its internal buttons/inputs interact with `@dnd-kit`'s drag listeners). No routing/URL-state involved, per the brief. Write operations reuse this codebase's one existing write pattern (`GerenciamentoUsuarios.tsx`'s manual-refetch-after-write idiom) rather than introducing `useMutation`, which nothing in this codebase uses today.

- [ ] **Step 1: Create `frontend/src/components/ItemDetalhe/ItemDetalhe.tsx`**
  ```tsx
  import { useQuery } from "@tanstack/react-query";
  import { useState } from "react";

  import { useAuth } from "../../auth/AuthContext";
  import {
    atualizarChecklistItem,
    criarAnexo,
    criarChecklistItem,
    criarComentario,
    listarAnexos,
    listarCatalogoLabels,
    listarChecklist,
    listarComentarios,
    listarLabelsDoItem,
    removerAnexo,
    removerChecklistItem,
    substituirLabelsDoItem,
  } from "../../services/api";
  import type { ItemProducao } from "../../types/producao";

  interface ItemDetalheProps {
    item: ItemProducao;
    onClose: () => void;
  }

  export function ItemDetalhe({ item, onClose }: ItemDetalheProps) {
    const { token } = useAuth();
    const itemId = item.id as number;

    const [novoPasso, setNovoPasso] = useState("");
    const [novoComentario, setNovoComentario] = useState("");
    const [novoAnexoTitulo, setNovoAnexoTitulo] = useState("");
    const [novoAnexoUrl, setNovoAnexoUrl] = useState("");

    const checklistQuery = useQuery({
      queryKey: ["item-checklist", itemId],
      queryFn: () => listarChecklist(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const catalogoLabelsQuery = useQuery({
      queryKey: ["catalogo-labels"],
      queryFn: () => listarCatalogoLabels(token as string),
      enabled: Boolean(token),
      retry: false,
    });
    const labelsDoItemQuery = useQuery({
      queryKey: ["item-labels", itemId],
      queryFn: () => listarLabelsDoItem(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const comentariosQuery = useQuery({
      queryKey: ["item-comentarios", itemId],
      queryFn: () => listarComentarios(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const anexosQuery = useQuery({
      queryKey: ["item-anexos", itemId],
      queryFn: () => listarAnexos(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });

    async function handleToggleChecklistItem(checklistItemId: number, concluido: boolean) {
      if (!token) return;
      await atualizarChecklistItem(token, itemId, checklistItemId, { concluido });
      await checklistQuery.refetch();
    }

    async function handleRenomearChecklistItem(checklistItemId: number, texto: string) {
      if (!token) return;
      await atualizarChecklistItem(token, itemId, checklistItemId, { texto });
      await checklistQuery.refetch();
    }

    async function handleAdicionarPasso() {
      if (!token || !novoPasso.trim()) return;
      const ordem = (checklistQuery.data?.length ?? 0) + 1;
      await criarChecklistItem(token, itemId, { texto: novoPasso, ordem });
      setNovoPasso("");
      await checklistQuery.refetch();
    }

    async function handleRemoverPasso(checklistItemId: number) {
      if (!token) return;
      await removerChecklistItem(token, itemId, checklistItemId);
      await checklistQuery.refetch();
    }

    async function handleAlternarLabel(labelId: number) {
      if (!token) return;
      const atuais = labelsDoItemQuery.data ?? [];
      const jaSelecionada = atuais.some((label) => label.id === labelId);
      const novoConjunto = jaSelecionada
        ? atuais.filter((label) => label.id !== labelId).map((label) => label.id)
        : [...atuais.map((label) => label.id), labelId];
      await substituirLabelsDoItem(token, itemId, novoConjunto);
      await labelsDoItemQuery.refetch();
    }

    async function handleEnviarComentario() {
      if (!token || !novoComentario.trim()) return;
      await criarComentario(token, itemId, { texto: novoComentario });
      setNovoComentario("");
      await comentariosQuery.refetch();
    }

    async function handleAdicionarAnexo() {
      if (!token || !novoAnexoTitulo.trim() || !novoAnexoUrl.trim()) return;
      await criarAnexo(token, itemId, { titulo: novoAnexoTitulo, url: novoAnexoUrl });
      setNovoAnexoTitulo("");
      setNovoAnexoUrl("");
      await anexosQuery.refetch();
    }

    async function handleRemoverAnexo(anexoId: number) {
      if (!token) return;
      await removerAnexo(token, itemId, anexoId);
      await anexosQuery.refetch();
    }

    const checklist = checklistQuery.data ?? [];
    const catalogoLabels = catalogoLabelsQuery.data ?? [];
    const labelsDoItem = labelsDoItemQuery.data ?? [];
    const comentarios = comentariosQuery.data ?? [];
    const anexos = anexosQuery.data ?? [];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {item.linha} - {item.posto_trabalho}
            </h2>
            <button
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              Fechar
            </button>
          </div>

          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Checklist
            </h3>
            <ul className="flex flex-col gap-2">
              {checklist.map((passo) => (
                <li key={passo.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={passo.concluido}
                    onChange={(event) => handleToggleChecklistItem(passo.id, event.target.checked)}
                  />
                  <input
                    value={passo.texto}
                    onChange={(event) => handleRenomearChecklistItem(passo.id, event.target.value)}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => handleRemoverPasso(passo.id)}
                    className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                placeholder="novo passo"
                value={novoPasso}
                onChange={(event) => setNovoPasso(event.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                onClick={handleAdicionarPasso}
                className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700"
              >
                Adicionar
              </button>
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Labels
            </h3>
            <div className="flex flex-wrap gap-2">
              {catalogoLabels.map((label) => {
                const selecionada = labelsDoItem.some((atual) => atual.id === label.id);
                return (
                  <button
                    key={label.id}
                    onClick={() => handleAlternarLabel(label.id)}
                    className="rounded-full px-3 py-1 text-xs font-medium text-white"
                    style={{
                      backgroundColor: label.cor,
                      opacity: selecionada ? 1 : 0.35,
                    }}
                  >
                    {label.nome}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Comentarios
            </h3>
            <ul className="mb-2 flex flex-col gap-2">
              {comentarios.map((comentario) => (
                <li key={comentario.id} className="rounded-md bg-slate-50 p-2 text-sm">
                  <div className="font-medium text-slate-800">{comentario.autor_username}</div>
                  <div className="text-slate-600">{comentario.texto}</div>
                  <div className="text-xs text-slate-400">{comentario.criado_em}</div>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <textarea
                value={novoComentario}
                onChange={(event) => setNovoComentario(event.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                onClick={handleEnviarComentario}
                className="self-end rounded-md bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700"
              >
                Comentar
              </button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Anexos
            </h3>
            <ul className="mb-2 flex flex-col gap-2">
              {anexos.map((anexo) => (
                <li key={anexo.id} className="flex items-center justify-between text-sm">
                  <a
                    href={anexo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-slate-900 underline"
                  >
                    {anexo.titulo}
                  </a>
                  <span className="text-xs text-slate-500">{anexo.enviado_por_username}</span>
                  <button
                    onClick={() => handleRemoverAnexo(anexo.id)}
                    className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                placeholder="titulo"
                value={novoAnexoTitulo}
                onChange={(event) => setNovoAnexoTitulo(event.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <input
                placeholder="url"
                value={novoAnexoUrl}
                onChange={(event) => setNovoAnexoUrl(event.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                onClick={handleAdicionarAnexo}
                className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700"
              >
                Anexar
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Replace the full contents of `frontend/src/components/SequenciaBoard/SequenciaCard.tsx`**
  (builds on Task 16's version — adds `useState` for the open/closed panel, an `onClick` on the card, and the `<ItemDetalhe>` render; `STATUS_CARD_CLASSES` and `CardFooter` are otherwise unchanged from Task 16):
  ```tsx
  import { useSortable } from "@dnd-kit/sortable";
  import { CSS } from "@dnd-kit/utilities";
  import { useQuery } from "@tanstack/react-query";
  import { useState } from "react";

  import { useAuth } from "../../auth/AuthContext";
  import {
    listarAnexos,
    listarChecklist,
    listarComentarios,
    listarLabelsDoItem,
  } from "../../services/api";
  import { PlanItemStatus, type ItemProducao } from "../../types/producao";
  import { ItemDetalhe } from "../ItemDetalhe/ItemDetalhe";

  interface SequenciaCardProps {
    item: ItemProducao;
  }

  const STATUS_CARD_CLASSES: Record<PlanItemStatus, string> = {
    [PlanItemStatus.Normal]: "border-status-normal bg-white",
    [PlanItemStatus.Critico]: "border-status-critico bg-status-critico/10",
    [PlanItemStatus.Excluido]: "border-status-excluido bg-status-excluido/10 opacity-60",
    [PlanItemStatus.Locked]: "border-status-travado bg-status-travado/10",
  };

  function CardFooter({ itemId }: { itemId: number }) {
    const { token } = useAuth();

    const checklistQuery = useQuery({
      queryKey: ["item-checklist", itemId],
      queryFn: () => listarChecklist(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const labelsQuery = useQuery({
      queryKey: ["item-labels", itemId],
      queryFn: () => listarLabelsDoItem(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const comentariosQuery = useQuery({
      queryKey: ["item-comentarios", itemId],
      queryFn: () => listarComentarios(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const anexosQuery = useQuery({
      queryKey: ["item-anexos", itemId],
      queryFn: () => listarAnexos(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });

    const checklist = checklistQuery.data ?? [];
    const concluidos = checklist.filter((passo) => passo.concluido).length;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
        <span>
          {concluidos}/{checklist.length}
        </span>
        {(labelsQuery.data ?? []).map((label) => (
          <span
            key={label.id}
            className="rounded-full px-2 py-0.5 text-white"
            style={{ backgroundColor: label.cor }}
          >
            {label.nome}
          </span>
        ))}
        <span>{(comentariosQuery.data ?? []).length} comentario(s)</span>
        <span>{(anexosQuery.data ?? []).length} anexo(s)</span>
      </div>
    );
  }

  export function SequenciaCard({ item }: SequenciaCardProps) {
    const [detalheAberto, setDetalheAberto] = useState(false);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: String(item.id ?? `novo-${item.sequencia}`),
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={() => {
            if (item.id !== null) setDetalheAberto(true);
          }}
          data-testid="sequencia-card"
          className={[
            "sequencia-card",
            item.is_critico ? "sequencia-card--critico" : "",
            "mb-2 rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md",
            STATUS_CARD_CLASSES[item.status],
            isDragging ? "rotate-1 shadow-lg" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <strong>
            {item.linha} - {item.posto_trabalho}
          </strong>
          <div>{item.kanbans} kanban(s)</div>
          {item.hora_inicial && item.hora_final && (
            <div>
              {item.hora_inicial.slice(11, 16)} - {item.hora_final.slice(11, 16)}
            </div>
          )}
          {item.almoco_incluso && <div data-testid="almoco-label">HORARIO DE ALMOCO INCLUSO</div>}
          {item.tem_falta_estoque && <div data-testid="falta-estoque">Falta de estoque</div>}
          {item.id !== null && <CardFooter itemId={item.id} />}
        </div>
        {detalheAberto && item.id !== null && (
          <ItemDetalhe item={item} onClose={() => setDetalheAberto(false)} />
        )}
      </>
    );
  }
  ```

- [ ] **Step 3: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/components/ItemDetalhe/ItemDetalhe.tsx src/components/SequenciaBoard/SequenciaCard.tsx
  ```

- [ ] **Step 4: Run the FULL existing test suite (final regression gate for the whole frontend plan)**
  ```bash
  cd frontend && npx vitest run
  ```
  `SequenciaBoard.test.tsx` failures carried over from Task 16 (missing `QueryClientProvider`) are still expected here — confirm no *other* file regressed.

- [ ] **Step 5: Commit**
  ```bash
  cd frontend
  git add src/components/ItemDetalhe/ItemDetalhe.tsx src/components/SequenciaBoard/SequenciaCard.tsx
  git commit -m "$(cat <<'EOF'
  feat: add item detalhe panel with click-to-open
  EOF
  )"
  ```
