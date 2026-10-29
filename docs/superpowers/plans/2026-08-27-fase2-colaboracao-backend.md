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
