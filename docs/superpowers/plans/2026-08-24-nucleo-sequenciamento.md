# plannerLogistica Fase 1 — Núcleo de Sequenciamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parallel execution override:** this project overrides subagent-driven-development's serial
> default with parallel waves — see `.claude/rules/08-parallel-subagent-driven-development.md`.
> Every task below is tagged `Files:` and `Depends-on:`. Two tasks with disjoint `Files` and no
> `Depends-on` relationship (direct or transitive) may run in the same wave.

**Goal:** Replace the legacy Power Apps/SharePoint/Planner Kanban sequencing system with a
FastAPI + React application: local auth/RBAC, a pure domain layer encoding the escadinha
cascade + lunch-break + stock-diagnosis business rules, staging-to-official persistence
(Tabela A → Tabela B), and a drag-and-drop Kanban board with entirely client-side sequence
recalculation.

**Architecture:** Layered backend (domain → repositories → api, per `01-ddd.md`) with the
domain layer pure Python with zero DB/framework imports; SQLAlchemy 2.0-style ORM models
map to two production tables (staging buffer vs. official/persisted); FastAPI routes are
thin orchestration that convert ORM rows to domain value objects, call domain functions, and
convert results to Pydantic schemas. Frontend is a Vite SPA where `useReducer` owns all
sequencing state — the reducer runs a TypeScript port of the same cascade algorithm, so
reordering a card never round-trips to the backend; only the final bulk submit does.

**Tech Stack:** Backend: FastAPI, SQLAlchemy 2.x + Alembic, PostgreSQL, `psycopg[binary]`,
pydantic-settings, `passlib[bcrypt]`, `python-jose[cryptography]`; dev: pytest, pytest-cov,
httpx, ruff. Frontend: React + Vite + TypeScript, react-router-dom, `@dnd-kit/core` +
`@dnd-kit/sortable`, `@tanstack/react-query`; dev: vitest, `@testing-library/react`, eslint.
No axios (native fetch), no Redux/Zustand (`useReducer` covers in-memory state).

**Spec:** `docs/superpowers/specs/2026-08-24-nucleo-sequenciamento-design.md`

## Global Constraints

- Patan is a single letter A–H — never a multi-character code, never string-sliced.
- `PlanItemStatus` (item de produção: 0/2/3/9) and `RequestStatus` (requisição: `'1'`/`'2'`)
  are two distinct enum types — never merged, never share a name.
- Escadinha shift starts: turno 1 → 06:20, turno 2 → 14:40, turno 3 → 23:00. Item
  `sequencia==1` takes the shift start time; every later item's `hora_inicial` equals the
  previous item's `hora_final` on the same posto de trabalho — never computed independently.
- Lunch break: placeholder meal times (turno 1 → 10:20, turno 2 → 18:40, turno 3 → 03:00,
  next calendar day) stored as an easily-editable constant. If an item's production window
  crosses the meal instant, add +40min to that item's `hora_final` exactly once; the card
  must carry the exact string `"HORARIO DE ALMOCO INCLUSO"` when applied.
- Production time formula: `(Kanbans × Qtd_por_Kanban) × Tempo_por_Peca`.
- Auth is local only (no AD/SSO): bcrypt password hashing + JWT. Three roles — Admin,
  Programador, Usuário Comum. Every endpoint's authorization is enforced backend-side via a
  dependency, never frontend-only.
- Bulk send is a single all-or-nothing POST from frontend to backend on explicit user
  submit — never per-edit. New items append to the bottom of their posto's queue.
  Already-in-progress cards are never overwritten or deleted.
- Every destructive/bulk DB operation is scoped by (Patan, Linha, Turno) — never global
  (regression guard for the legacy's unscoped-delete bug).
- Frontend sequencing state (edits, reorder, cascade recalculation) lives entirely
  client-side in `useReducer` — no per-edit network calls.
- Domain layer (`app/domain/*`) has zero DB/framework imports and is testable in isolation.

## Design Decisions (stated assumptions — not literally spelled out in the spec)

The spec fixes the business rules; these are the concrete engineering choices this plan
makes to implement them. Flagging them explicitly per this project's "state assumptions,
don't pick silently" rule, so a reviewer can redirect before implementation starts:

1. **`Role` enum lives in `app/models/user.py`**, not a new `domain/role.py` — the spec's
   domain file list is explicit (patan/status/sequenciamento/estoque only) and a 3-value
   role enum has no branching business rule of its own.
2. **Admin bootstrap:** `POST /auth/register` creates the *first* user in the system
   unauthenticated (auto-assigned Admin); once any user exists, the same endpoint requires
   an authenticated Admin caller and an explicit `role` in the request body. Avoids a
   separate seed script (YAGNI) while keeping the endpoint safe after bootstrap.
3. **One GET endpoint serves both `ProgramacaoPatan` and `Producao` pages in Fase 1** —
   `GET /producao/sequencia` reads Tabela A staging for both. A dedicated Tabela B
   read/history endpoint is deferred: the spec's explicit Fase 1 route scope names only
   "get sequence" + "bulk submit," and Tabela B read is explicitly a dashboards/Fase-3
   concern per the spec's Gaps section. `Producao.tsx` renders the same board read-only
   for Usuário Comum (no submit button).
4. **`ItemProducao.em_producao: bool`** (default `False`) added to the Tabela B model so
   "never overwrite/delete an in-progress card" is a concrete, tested guard now, even
   though no Fase 1 UI yet flips it to `True` (forward-compatible no-op today).
5. **`sequencia` is scoped per (linha, turno, patan, posto_trabalho)** — posto_trabalho is
   a Kanban column; each column has its own local 1,2,3... ordering. "Append to bottom"
   means bottom of that item's posto column.
6. **Lunch-break boundary tie-break:** a window that touches the meal instant exactly at
   `hora_inicial` or `hora_final` (not strictly inside it) does **not** count as crossing —
   only `hora_inicial < almoço < hora_final` (strict) triggers the +40min. This is the
   concrete rule the spec's "cruza exatamente na virada" edge case tests.
7. **Stock diagnosis runs backend-side**, inside the GET response (the spec allows backend
   *or* frontend-mount) — kept fully outside the cascade recalculation path, so reordering
   a card never touches it.
8. **Peças críticas are filtered by `linha` only** (not turno/patan) — the literal spec
   wording ("peças críticas da linha, fora do Patan pedido") doesn't scope by turno either.
9. **`calcular_tempo_producao_minutos` lives in `domain/sequenciamento.py`** (not a new
   file) since its output is a direct input to the cascade function.
10. **`routes/RequireRole.tsx`** is one small file added alongside the spec's named
    `AppRouter.tsx`, splitting the reusable role-guard wrapper from the route table —
    minor, justified decomposition, not new scope.

## File Structure

```
backend/
├── pyproject.toml
├── .env.example
├── .gitignore
├── alembic.ini
├── alembic/{env.py, script.py.mako, versions/0001_initial.py}
├── app/
│   ├── main.py
│   ├── core/{config.py, security.py, deps.py}
│   ├── api/{routes_auth.py, routes_users.py, routes_producao.py}
│   ├── domain/{patan.py, status.py, sequenciamento.py, estoque.py}
│   ├── repositories/producao_repository.py
│   ├── models/{user.py, producao.py}
│   ├── schemas/{user.py, producao.py}
│   └── db/session.py
└── tests/{unit/, integration/}

frontend/
├── package.json, vite.config.ts, tsconfig.json, tsconfig.node.json, index.html, .gitignore
├── src/
│   ├── main.tsx, App.tsx
│   ├── types/producao.ts
│   ├── services/api.ts
│   ├── auth/AuthContext.tsx
│   ├── state/sequenciaReducer.ts
│   ├── components/SequenciaBoard/{SequenciaBoard.tsx, SequenciaCard.tsx}
│   ├── pages/{GerenciamentoUsuarios.tsx, ProgramacaoPatan.tsx, Producao.tsx}
│   └── routes/{RequireRole.tsx, AppRouter.tsx}
```

---

### Task 1: Backend project scaffold + FastAPI app + health endpoint

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.gitignore`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/domain/__init__.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/repositories/__init__.py`
- Create: `backend/app/db/__init__.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/unit/__init__.py`
- Create: `backend/tests/integration/__init__.py`
- Test: `backend/tests/integration/test_main.py`

**Depends-on:** none

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `app.main.app` (a `fastapi.FastAPI` instance) with `GET /health`. Every later
  backend task that registers a router imports `app` from `app.main`. All `app/*` and
  `tests/*` subpackages exist as importable packages (empty `__init__.py`) so later tasks
  never need to create one.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/integration/test_main.py
from fastapi.testclient import TestClient

from app.main import app


def test_health_check_returns_ok():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m venv .venv && source .venv/bin/activate && pip install fastapi "uvicorn[standard]" httpx pytest && pytest tests/integration/test_main.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app'` (or import error; `app/main.py` doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/__init__.py
```

```python
# backend/app/core/__init__.py
```

```python
# backend/app/api/__init__.py
```

```python
# backend/app/domain/__init__.py
```

```python
# backend/app/models/__init__.py
```

```python
# backend/app/schemas/__init__.py
```

```python
# backend/app/repositories/__init__.py
```

```python
# backend/app/db/__init__.py
```

```python
# backend/tests/__init__.py
```

```python
# backend/tests/unit/__init__.py
```

```python
# backend/tests/integration/__init__.py
```

```python
# backend/app/main.py
from fastapi import FastAPI

app = FastAPI(title="plannerLogistica")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
```

```toml
# backend/pyproject.toml
[project]
name = "planner-logistica-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi",
    "uvicorn[standard]",
    "sqlalchemy>=2.0,<3.0",
    "alembic",
    "psycopg[binary]",
    "pydantic-settings",
    "passlib[bcrypt]",
    "python-jose[cryptography]",
]

[project.optional-dependencies]
dev = [
    "pytest",
    "pytest-cov",
    "httpx",
    "ruff",
]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py311"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
```

```
# backend/.gitignore
__pycache__/
*.pyc
.venv/
.env
*.egg-info/
.pytest_cache/
.ruff_cache/
htmlcov/
.coverage
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pip install -e ".[dev]" && pytest tests/integration/test_main.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/.gitignore backend/app backend/tests
git commit -m "feat: scaffold FastAPI backend with health endpoint"
```

---

### Task 2: Config module (pydantic-settings)

**Files:**
- Create: `backend/app/core/config.py`
- Create: `backend/.env.example`
- Test: `backend/tests/unit/test_config.py`

**Depends-on:** 1

**Interfaces:**
- Consumes: nothing beyond the scaffold (Task 1).
- Produces: `app.core.config.Settings` (pydantic-settings `BaseSettings` with
  `database_url: str`, `jwt_secret_key: str`, `jwt_algorithm: str = "HS256"`,
  `jwt_expire_minutes: int = 60`) and `get_settings() -> Settings`. Later tasks needing
  config call `get_settings()`, never instantiate `Settings()` directly.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_config.py
import os

from app.core.config import Settings, get_settings


def test_settings_reads_required_fields_from_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@localhost/db")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")

    settings = Settings()

    assert settings.database_url == "postgresql+psycopg://user:pass@localhost/db"
    assert settings.jwt_secret_key == "test-secret"
    assert settings.jwt_algorithm == "HS256"
    assert settings.jwt_expire_minutes == 60


def test_get_settings_is_cached(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@localhost/db")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")

    assert get_settings() is get_settings()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.config'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/core/config.py
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

```
# backend/.env.example
DATABASE_URL=postgresql+psycopg://planner:planner@localhost:5432/planner_logistica
JWT_SECRET_KEY=change-me
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_config.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/config.py backend/.env.example backend/tests/unit/test_config.py
git commit -m "feat: add pydantic-settings config module"
```

---

### Task 3: Security utilities (password hashing + JWT)

**Files:**
- Create: `backend/app/core/security.py`
- Test: `backend/tests/unit/test_security.py`

**Depends-on:** 2

**Interfaces:**
- Consumes: `app.core.config.get_settings` (Task 2).
- Produces: `hash_password(password: str) -> str`, `verify_password(plain_password: str,
  hashed_password: str) -> bool`, `create_access_token(subject: str, role: str,
  expires_minutes: int | None = None) -> str`, `decode_access_token(token: str) -> dict`.
  JWT payload shape: `{"sub": subject, "role": role, "exp": <timestamp>}`. Task 14
  (`core/deps.py`) and Task 15 (`routes_auth.py`) consume these exact names.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_security.py
import pytest
from jose import jwt

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


@pytest.fixture(autouse=True)
def _settings_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@localhost/db")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_hash_password_does_not_return_plaintext():
    hashed = hash_password("s3cret")
    assert hashed != "s3cret"


def test_verify_password_accepts_correct_and_rejects_wrong():
    hashed = hash_password("s3cret")
    assert verify_password("s3cret", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_create_access_token_embeds_subject_and_role():
    token = create_access_token(subject="joana", role="admin")
    payload = jwt.get_unverified_claims(token)
    assert payload["sub"] == "joana"
    assert payload["role"] == "admin"
    assert "exp" in payload


def test_decode_access_token_roundtrips():
    token = create_access_token(subject="joana", role="admin")
    payload = decode_access_token(token)
    assert payload["sub"] == "joana"
    assert payload["role"] == "admin"


def test_decode_access_token_rejects_garbage():
    with pytest.raises(Exception):
        decode_access_token("not-a-real-token")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_security.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.security'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/core/security.py
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    subject: str, role: str, expires_minutes: int | None = None
) -> str:
    settings = get_settings()
    minutes = expires_minutes if expires_minutes is not None else settings.jwt_expire_minutes
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_security.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/security.py backend/tests/unit/test_security.py
git commit -m "feat: add password hashing and JWT utilities"
```

---

### Task 4: DB session module

**Files:**
- Create: `backend/app/db/session.py`
- Test: `backend/tests/unit/test_session.py`

**Depends-on:** 2

**Interfaces:**
- Consumes: `app.core.config.get_settings` (Task 2).
- Produces: `app.db.session.Base` (SQLAlchemy 2.0 `DeclarativeBase` subclass — every ORM
  model inherits from this), `engine`, `SessionLocal`, and `get_db() -> Generator[Session,
  None, None]`. Tasks 9, 10 (`models/*`) inherit from `Base`; Task 14 (`core/deps.py`) and
  every route task consume `get_db` as a FastAPI dependency.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_session.py
import pytest
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db


@pytest.fixture(autouse=True)
def _settings_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_get_db_yields_a_session_and_closes_it():
    gen = get_db()
    db = next(gen)
    assert isinstance(db, Session)
    with pytest.raises(StopIteration):
        next(gen)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_session.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.db.session'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/db/session.py
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _build_engine():
    settings = get_settings()
    return create_engine(settings.database_url)


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_session.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/session.py backend/tests/unit/test_session.py
git commit -m "feat: add SQLAlchemy session module"
```

---

### Task 5: domain/patan.py

**Files:**
- Create: `backend/app/domain/patan.py`
- Test: `backend/tests/unit/test_patan.py`

**Depends-on:** 1

**Interfaces:**
- Consumes: nothing (pure domain, only needs the scaffold from Task 1).
- Produces: `app.domain.patan.Patan` — a `str, Enum` with exactly 8 members `A`..`H`.
  Task 13 (`schemas/producao.py`) and Task 18 (`routes_producao.py`) type fields as
  `Patan` directly.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_patan.py
import pytest

from app.domain.patan import Patan


def test_patan_has_exactly_eight_single_letter_members():
    # Regression guard: Patan was historically miscoded as an 8-character
    # string; it is one letter, A-H, per the confirmed business rule.
    assert [p.value for p in Patan] == ["A", "B", "C", "D", "E", "F", "G", "H"]
    assert all(len(p.value) == 1 for p in Patan)


def test_patan_rejects_value_outside_a_to_h():
    with pytest.raises(ValueError):
        Patan("Z")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_patan.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.domain.patan'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/domain/patan.py
from enum import Enum


class Patan(str, Enum):
    """A production line's requesting Patan — always exactly one letter, A-H."""

    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"
    F = "F"
    G = "G"
    H = "H"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_patan.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/domain/patan.py backend/tests/unit/test_patan.py
git commit -m "feat: add Patan domain enum"
```

---

### Task 6: domain/status.py

**Files:**
- Create: `backend/app/domain/status.py`
- Test: `backend/tests/unit/test_status.py`

**Depends-on:** 1

**Interfaces:**
- Consumes: nothing (needs only Task 1's scaffold).
- Produces: `app.domain.status.PlanItemStatus` (`int, Enum`: `EXCLUIDO=0`, `NORMAL=2`,
  `CRITICO=3`, `LOCKED=9`) and `app.domain.status.RequestStatus` (`str, Enum`:
  `PENDING="1"`, `PROCESSED="2"`) — two distinct, non-interchangeable types. Task 7
  (`sequenciamento.py`), Task 9 (`models/user.py` — no), Task 10 (`models/producao.py`),
  Task 13 (`schemas/producao.py`), Task 18 (`routes_producao.py`) consume
  `PlanItemStatus`. `RequestStatus` has no Fase 1 consumer — it exists purely so future
  intake work never collides with `PlanItemStatus`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_status.py
import pytest

from app.domain.status import PlanItemStatus, RequestStatus


def test_plan_item_status_matches_the_state_machine_values():
    assert PlanItemStatus.EXCLUIDO == 0
    assert PlanItemStatus.NORMAL == 2
    assert PlanItemStatus.CRITICO == 3
    assert PlanItemStatus.LOCKED == 9


def test_request_status_matches_string_values():
    assert RequestStatus.PENDING.value == "1"
    assert RequestStatus.PROCESSED.value == "2"


def test_plan_item_status_and_request_status_are_not_interchangeable():
    # Regression guard: the legacy system reuses the field name "STATUS" for
    # two unrelated state machines. They must never collide in this codebase.
    assert PlanItemStatus is not RequestStatus
    with pytest.raises(ValueError):
        PlanItemStatus("1")
    with pytest.raises(ValueError):
        RequestStatus(2)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_status.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.domain.status'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/domain/status.py
from enum import Enum


class PlanItemStatus(int, Enum):
    """State machine for a producao item. Never merge with RequestStatus."""

    EXCLUIDO = 0
    NORMAL = 2
    CRITICO = 3
    LOCKED = 9


class RequestStatus(str, Enum):
    """Unrelated STATUS field on the intake/request list. Two-value flag."""

    PENDING = "1"
    PROCESSED = "2"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_status.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/domain/status.py backend/tests/unit/test_status.py
git commit -m "feat: add PlanItemStatus and RequestStatus domain enums"
```

---

### Task 7: domain/sequenciamento.py (escadinha cascade + lunch break)

**Files:**
- Create: `backend/app/domain/sequenciamento.py`
- Test: `backend/tests/unit/test_sequenciamento.py`

**Depends-on:** 6

**Interfaces:**
- Consumes: `app.domain.status.PlanItemStatus` (Task 6).
- Produces: `Turno` (`int, Enum`: `PRIMEIRO=1`, `SEGUNDO=2`, `TERCEIRO=3`),
  `SHIFT_START_TIME: dict[Turno, time]`, `MEAL_TIME: dict[Turno, time]`,
  `LUNCH_BREAK_MINUTES = 40`, `LUNCH_BREAK_LABEL = "HORARIO DE ALMOCO INCLUSO"`,
  `SequenciaItem` (frozen dataclass: `sequencia: int, status: PlanItemStatus,
  posto_trabalho: str, tempo_producao_minutos: float, hora_inicial: datetime | None =
  None, hora_final: datetime | None = None, almoco_incluso: bool = False`),
  `calcular_tempo_producao_minutos(kanbans: int, qtd_por_kanban: int,
  tempo_por_peca_minutos: float) -> float`, `calcular_cascata(turno: Turno, data_base:
  date, itens: list[SequenciaItem]) -> list[SequenciaItem]` (returns a new list; never
  mutates `itens`; caller must pre-filter/sort `itens` to `PlanItemStatus.NORMAL` ordered
  by `sequencia` ascending). Task 13 (`schemas/producao.py`) consumes `Turno`. Task 17
  (`producao_repository.py`) and Task 18 (`routes_producao.py`) consume everything above.
  Frontend Task 23 (`state/sequenciaReducer.ts`) is a hand-ported mirror of
  `calcular_tempo_producao_minutos` + `calcular_cascata` — same constants, same semantics.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_sequenciamento.py
from datetime import date, datetime

from app.domain.sequenciamento import (
    LUNCH_BREAK_LABEL,
    SequenciaItem,
    Turno,
    calcular_cascata,
    calcular_tempo_producao_minutos,
)
from app.domain.status import PlanItemStatus


def test_calcular_tempo_producao_minutos_applies_the_formula():
    assert calcular_tempo_producao_minutos(kanbans=3, qtd_por_kanban=10, tempo_por_peca_minutos=0.5) == 15.0


def test_primeiro_item_comeca_no_horario_fixo_do_turno():
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=30),
    ]
    resultado = calcular_cascata(Turno.PRIMEIRO, date(2026, 8, 24), itens)
    assert resultado[0].hora_inicial == datetime(2026, 8, 24, 6, 20)
    assert resultado[0].hora_final == datetime(2026, 8, 24, 6, 50)
    assert resultado[0].almoco_incluso is False


def test_item_seguinte_comeca_onde_o_anterior_terminou():
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=30),
        SequenciaItem(2, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=20),
    ]
    resultado = calcular_cascata(Turno.PRIMEIRO, date(2026, 8, 24), itens)
    assert resultado[1].hora_inicial == resultado[0].hora_final
    assert resultado[1].hora_final == datetime(2026, 8, 24, 7, 10)


def test_item_que_cruza_o_almoco_ganha_quarenta_minutos_uma_vez():
    # Turno 1 meal placeholder is 10:20. An item starting 10:00 for 40min
    # (10:00-10:40) strictly spans it.
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=220),  # 06:20 -> 10:00
        SequenciaItem(2, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=40),   # 10:00 -> 10:40 (+lunch)
        SequenciaItem(3, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=10),
    ]
    resultado = calcular_cascata(Turno.PRIMEIRO, date(2026, 8, 24), itens)
    assert resultado[0].almoco_incluso is False
    assert resultado[1].almoco_incluso is True
    assert resultado[1].hora_final == datetime(2026, 8, 24, 11, 20)  # 10:40 + 40min lunch
    assert resultado[1].hora_final.time().strftime("%H:%M") == "11:20"
    # Cascade inherits the delay for free — not added again.
    assert resultado[2].hora_inicial == resultado[1].hora_final
    assert resultado[2].almoco_incluso is False


def test_item_que_nao_cruza_o_almoco_nao_ganha_atraso():
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=30),
    ]
    resultado = calcular_cascata(Turno.PRIMEIRO, date(2026, 8, 24), itens)
    assert resultado[0].almoco_incluso is False


def test_janela_que_toca_o_almoco_exatamente_na_virada_nao_conta_como_cruzamento():
    # Item ends exactly at 10:20 (the meal instant) - boundary touch, not a
    # strict crossing, per this plan's stated tie-break decision.
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=240),  # 06:20 -> 10:20
    ]
    resultado = calcular_cascata(Turno.PRIMEIRO, date(2026, 8, 24), itens)
    assert resultado[0].hora_final == datetime(2026, 8, 24, 10, 20)
    assert resultado[0].almoco_incluso is False


def test_turno_tres_vira_o_dia_para_calcular_o_almoco():
    # Turno 3 starts 23:00; its meal placeholder 03:00 is the next calendar
    # day. An item spanning 23:00 -> 04:00 must cross it.
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=300),  # 23:00 -> 04:00 (+1 day)
    ]
    resultado = calcular_cascata(Turno.TERCEIRO, date(2026, 8, 24), itens)
    assert resultado[0].hora_inicial == datetime(2026, 8, 24, 23, 0)
    assert resultado[0].almoco_incluso is True
    assert resultado[0].hora_final == datetime(2026, 8, 25, 4, 40)  # +40min lunch


def test_almoco_incluso_card_mostra_o_texto_exato():
    assert LUNCH_BREAK_LABEL == "HORARIO DE ALMOCO INCLUSO"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_sequenciamento.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.domain.sequenciamento'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/domain/sequenciamento.py
from dataclasses import dataclass, replace
from datetime import date, datetime, time, timedelta
from enum import Enum

from app.domain.status import PlanItemStatus


class Turno(int, Enum):
    PRIMEIRO = 1
    SEGUNDO = 2
    TERCEIRO = 3


SHIFT_START_TIME: dict[Turno, time] = {
    Turno.PRIMEIRO: time(6, 20),
    Turno.SEGUNDO: time(14, 40),
    Turno.TERCEIRO: time(23, 0),
}

# Placeholder meal times (shift start + 4h) - user will hand-tune later.
# Edit these directly; the cascade logic reads them, it does not derive
# them from SHIFT_START_TIME.
MEAL_TIME: dict[Turno, time] = {
    Turno.PRIMEIRO: time(10, 20),
    Turno.SEGUNDO: time(18, 40),
    Turno.TERCEIRO: time(3, 0),
}

LUNCH_BREAK_MINUTES = 40
LUNCH_BREAK_LABEL = "HORARIO DE ALMOCO INCLUSO"


@dataclass(frozen=True)
class SequenciaItem:
    sequencia: int
    status: PlanItemStatus
    posto_trabalho: str
    tempo_producao_minutos: float
    hora_inicial: datetime | None = None
    hora_final: datetime | None = None
    almoco_incluso: bool = False


def calcular_tempo_producao_minutos(
    kanbans: int, qtd_por_kanban: int, tempo_por_peca_minutos: float
) -> float:
    return (kanbans * qtd_por_kanban) * tempo_por_peca_minutos


def _meal_datetime(turno: Turno, data_base: date) -> datetime:
    inicio = datetime.combine(data_base, SHIFT_START_TIME[turno])
    almoco = datetime.combine(data_base, MEAL_TIME[turno])
    if almoco <= inicio:
        almoco += timedelta(days=1)
    return almoco


def calcular_cascata(
    turno: Turno,
    data_base: date,
    itens: list[SequenciaItem],
) -> list[SequenciaItem]:
    """Chain hora_inicial/hora_final/almoco_incluso for one posto's queue.

    `itens` must already be filtered to PlanItemStatus.NORMAL and sorted by
    `sequencia` ascending - item sequencia==1 starts at the shift's fixed
    start time; every later item starts where the previous one ended. If an
    item's window strictly spans the shift's meal instant, +40min is added
    to that item's hora_final once; later items inherit the delay through
    the chain. Returns a new list - `itens` is never mutated.
    """
    almoco = _meal_datetime(turno, data_base)
    proximo_inicio = datetime.combine(data_base, SHIFT_START_TIME[turno])
    resultado: list[SequenciaItem] = []

    for item in itens:
        hora_inicial = proximo_inicio
        hora_final = hora_inicial + timedelta(minutes=item.tempo_producao_minutos)
        almoco_incluso = hora_inicial < almoco < hora_final
        if almoco_incluso:
            hora_final += timedelta(minutes=LUNCH_BREAK_MINUTES)

        resultado.append(
            replace(
                item,
                hora_inicial=hora_inicial,
                hora_final=hora_final,
                almoco_incluso=almoco_incluso,
            )
        )
        proximo_inicio = hora_final

    return resultado
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_sequenciamento.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/domain/sequenciamento.py backend/tests/unit/test_sequenciamento.py
git commit -m "feat: add escadinha cascade and lunch-break domain logic"
```

---

### Task 8: domain/estoque.py

**Files:**
- Create: `backend/app/domain/estoque.py`
- Test: `backend/tests/unit/test_estoque.py`

**Depends-on:** 1

**Interfaces:**
- Consumes: nothing (needs only Task 1's scaffold).
- Produces: `DiagnosticoEstoque` (frozen dataclass: `demanda: float, saldo_disponivel:
  float, tem_falta: bool`), `diagnosticar_estoque(demanda: float, saldo: float) ->
  DiagnosticoEstoque`. Task 18 (`routes_producao.py`) consumes this to populate
  `tem_falta_estoque` on each response item.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_estoque.py
from app.domain.estoque import diagnosticar_estoque


def test_demanda_maior_que_saldo_sinaliza_falta():
    diagnostico = diagnosticar_estoque(demanda=100, saldo=60)
    assert diagnostico.tem_falta is True
    assert diagnostico.demanda == 100
    assert diagnostico.saldo_disponivel == 60


def test_demanda_menor_que_saldo_nao_sinaliza_falta():
    diagnostico = diagnosticar_estoque(demanda=40, saldo=60)
    assert diagnostico.tem_falta is False


def test_demanda_igual_ao_saldo_nao_sinaliza_falta():
    diagnostico = diagnosticar_estoque(demanda=60, saldo=60)
    assert diagnostico.tem_falta is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_estoque.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.domain.estoque'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/domain/estoque.py
from dataclasses import dataclass


@dataclass(frozen=True)
class DiagnosticoEstoque:
    demanda: float
    saldo_disponivel: float
    tem_falta: bool


def diagnosticar_estoque(demanda: float, saldo: float) -> DiagnosticoEstoque:
    return DiagnosticoEstoque(
        demanda=demanda,
        saldo_disponivel=saldo,
        tem_falta=demanda > saldo,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_estoque.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/domain/estoque.py backend/tests/unit/test_estoque.py
git commit -m "feat: add stock diagnosis domain logic"
```

---

### Task 9: models/user.py (Role enum + User ORM model)

**Files:**
- Create: `backend/app/models/user.py`
- Test: `backend/tests/unit/test_user_model.py`

**Depends-on:** 4

**Interfaces:**
- Consumes: `app.db.session.Base` (Task 4).
- Produces: `Role` (`str, Enum`: `ADMIN="admin"`, `PROGRAMADOR="programador"`,
  `USUARIO_COMUM="usuario_comum"`) and `User` ORM model (`__tablename__ = "users"`;
  columns: `id: int` PK, `username: str` unique, `hashed_password: str`, `role: str`).
  Task 11 (migration), Task 12 (`schemas/user.py`), Task 14 (`core/deps.py`), Task 15/16
  (routes) all consume `Role` and `User` by these exact names.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_user_model.py
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.session import Base
from app.models.user import Role, User


def test_role_has_exactly_three_members():
    assert {r.value for r in Role} == {"admin", "programador", "usuario_comum"}


def test_user_model_persists_and_reads_back():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[User.__table__])

    with Session(engine) as session:
        session.add(User(username="joana", hashed_password="hashed", role=Role.ADMIN.value))
        session.commit()

        persisted = session.query(User).filter_by(username="joana").one()
        assert persisted.role == Role.ADMIN.value
        assert persisted.hashed_password == "hashed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_user_model.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.user'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/models/user.py
from enum import Enum

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Role(str, Enum):
    ADMIN = "admin"
    PROGRAMADOR = "programador"
    USUARIO_COMUM = "usuario_comum"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_user_model.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/user.py backend/tests/unit/test_user_model.py
git commit -m "feat: add User ORM model and Role enum"
```

---

### Task 10: models/producao.py (Tabela A staging + Tabela B oficial)

**Files:**
- Create: `backend/app/models/producao.py`
- Test: `backend/tests/unit/test_producao_model.py`

**Depends-on:** 4

**Interfaces:**
- Consumes: `app.db.session.Base` (Task 4).
- Produces: `ItemProducaoStaging` (`__tablename__ = "producao_staging"` — Tabela A: id,
  linha, turno, patan, posto_trabalho, status, sequencia, kanbans, qtd_por_kanban,
  tempo_por_peca_minutos, demanda, saldo_estoque, is_critico) and `ItemProducao`
  (`__tablename__ = "producao"` — Tabela B: same fields as staging minus demanda/
  saldo_estoque, plus hora_inicial, hora_final, almoco_incluso, `em_producao: bool`).
  Task 11 (migration), Task 17 (repository), Task 18 (routes) consume both by these exact
  names and column names.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_producao_model.py
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.session import Base
from app.models.producao import ItemProducao, ItemProducaoStaging


def test_item_producao_staging_persists_and_reads_back():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[ItemProducaoStaging.__table__])

    with Session(engine) as session:
        session.add(
            ItemProducaoStaging(
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1",
                status=2, sequencia=1, kanbans=3, qtd_por_kanban=10,
                tempo_por_peca_minutos=0.5, demanda=100, saldo_estoque=60,
                is_critico=False,
            )
        )
        session.commit()

        persisted = session.query(ItemProducaoStaging).filter_by(linha="L1").one()
        assert persisted.patan == "A"
        assert persisted.saldo_estoque == 60


def test_item_producao_defaults_em_producao_false():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[ItemProducao.__table__])

    with Session(engine) as session:
        item = ItemProducao(
            linha="L1", turno=1, patan="A", posto_trabalho="posto-1",
            status=2, sequencia=1, kanbans=3, qtd_por_kanban=10,
            tempo_por_peca_minutos=0.5, is_critico=False,
        )
        session.add(item)
        session.commit()

        persisted = session.query(ItemProducao).filter_by(linha="L1").one()
        assert persisted.em_producao is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_producao_model.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.producao'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/models/producao.py
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ItemProducaoStaging(Base):
    """Tabela A - SAP dump buffer, cleared after a batch send. Read-only source."""

    __tablename__ = "producao_staging"

    id: Mapped[int] = mapped_column(primary_key=True)
    linha: Mapped[str] = mapped_column(String(50), nullable=False)
    turno: Mapped[int] = mapped_column(Integer, nullable=False)
    patan: Mapped[str] = mapped_column(String(1), nullable=False)
    posto_trabalho: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    sequencia: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    kanbans: Mapped[int] = mapped_column(Integer, nullable=False)
    qtd_por_kanban: Mapped[int] = mapped_column(Integer, nullable=False)
    tempo_por_peca_minutos: Mapped[float] = mapped_column(Float, nullable=False)
    demanda: Mapped[float] = mapped_column(Float, nullable=False)
    saldo_estoque: Mapped[float] = mapped_column(Float, nullable=False)
    is_critico: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ItemProducao(Base):
    """Tabela B - official Kanban, immutable persisted source. Never overwritten by staging."""

    __tablename__ = "producao"

    id: Mapped[int] = mapped_column(primary_key=True)
    linha: Mapped[str] = mapped_column(String(50), nullable=False)
    turno: Mapped[int] = mapped_column(Integer, nullable=False)
    patan: Mapped[str] = mapped_column(String(1), nullable=False)
    posto_trabalho: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    sequencia: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hora_inicial: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hora_final: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    almoco_incluso: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    kanbans: Mapped[int] = mapped_column(Integer, nullable=False)
    qtd_por_kanban: Mapped[int] = mapped_column(Integer, nullable=False)
    tempo_por_peca_minutos: Mapped[float] = mapped_column(Float, nullable=False)
    is_critico: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    em_producao: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_producao_model.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/producao.py backend/tests/unit/test_producao_model.py
git commit -m "feat: add ItemProducaoStaging (Tabela A) and ItemProducao (Tabela B) models"
```

---

### Task 11: Alembic setup + initial migration

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/0001_initial.py`
- Test: `backend/tests/integration/test_migrations.py`

**Depends-on:** 4, 9, 10

**Interfaces:**
- Consumes: `app.db.session.Base`, `app.models.user.User` (Task 9), `app.models.producao.
  ItemProducaoStaging`/`ItemProducao` (Task 10).
- Produces: a runnable Alembic environment (`alembic upgrade head` creates tables `users`,
  `producao_staging`, `producao`). No later task imports anything from this task in
  Python — it's infrastructure other tasks rely on only by having the tables exist when
  integration tests run against a real database.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/integration/test_migrations.py
import os

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_alembic_upgrade_head_creates_expected_tables(tmp_path):
    db_path = tmp_path / "test.db"
    database_url = f"sqlite:///{db_path}"
    os.environ.setdefault("JWT_SECRET_KEY", "test-secret")

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(cfg, "head")

    engine = create_engine(database_url)
    tables = inspect(engine).get_table_names()

    assert "users" in tables
    assert "producao_staging" in tables
    assert "producao" in tables
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/integration/test_migrations.py -v`
Expected: FAIL — `alembic.util.exc.CommandError` (no `alembic.ini` / no `versions/` yet)

- [ ] **Step 3: Write minimal implementation**

```ini
# backend/alembic.ini
[alembic]
script_location = alembic

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

```python
# backend/alembic/env.py
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.db.session import Base
from app.models.producao import ItemProducao, ItemProducaoStaging  # noqa: F401
from app.models.user import User  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

```mako
## backend/alembic/script.py.mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

```python
# backend/alembic/versions/0001_initial.py
"""initial tables

Revision ID: 0001
Revises:
Create Date: 2026-08-24

"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "producao_staging",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("linha", sa.String(length=50), nullable=False),
        sa.Column("turno", sa.Integer(), nullable=False),
        sa.Column("patan", sa.String(length=1), nullable=False),
        sa.Column("posto_trabalho", sa.String(length=50), nullable=False),
        sa.Column("status", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("sequencia", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("kanbans", sa.Integer(), nullable=False),
        sa.Column("qtd_por_kanban", sa.Integer(), nullable=False),
        sa.Column("tempo_por_peca_minutos", sa.Float(), nullable=False),
        sa.Column("demanda", sa.Float(), nullable=False),
        sa.Column("saldo_estoque", sa.Float(), nullable=False),
        sa.Column("is_critico", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.create_table(
        "producao",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("linha", sa.String(length=50), nullable=False),
        sa.Column("turno", sa.Integer(), nullable=False),
        sa.Column("patan", sa.String(length=1), nullable=False),
        sa.Column("posto_trabalho", sa.String(length=50), nullable=False),
        sa.Column("status", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("sequencia", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hora_inicial", sa.DateTime(), nullable=True),
        sa.Column("hora_final", sa.DateTime(), nullable=True),
        sa.Column("almoco_incluso", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("kanbans", sa.Integer(), nullable=False),
        sa.Column("qtd_por_kanban", sa.Integer(), nullable=False),
        sa.Column("tempo_por_peca_minutos", sa.Float(), nullable=False),
        sa.Column("is_critico", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("em_producao", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_table("producao")
    op.drop_table("producao_staging")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/integration/test_migrations.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/alembic.ini backend/alembic
git commit -m "feat: add Alembic setup and initial migration"
```

---

### Task 12: schemas/user.py

**Files:**
- Create: `backend/app/schemas/user.py`
- Test: `backend/tests/unit/test_user_schema.py`

**Depends-on:** 9

**Interfaces:**
- Consumes: `app.models.user.Role` (Task 9).
- Produces: `UserCreate` (username: str, password: str, role: Role =
  `Role.USUARIO_COMUM`), `UserOut` (id: int, username: str, role: Role, `from_attributes`
  enabled), `UserRoleUpdate` (role: Role), `Token` (access_token: str, token_type: str =
  `"bearer"`). Task 15 (`routes_auth.py`) and Task 16 (`routes_users.py`) consume all four
  by these exact names.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_user_schema.py
import pytest
from pydantic import ValidationError

from app.models.user import Role
from app.schemas.user import Token, UserCreate, UserOut


def test_user_create_accepts_valid_role():
    payload = UserCreate(username="joana", password="s3cret", role=Role.ADMIN)
    assert payload.role is Role.ADMIN


def test_user_create_rejects_invalid_role():
    with pytest.raises(ValidationError):
        UserCreate(username="joana", password="s3cret", role="not-a-role")


def test_user_out_builds_from_orm_attributes():
    class FakeOrmUser:
        id = 1
        username = "joana"
        role = "admin"

    out = UserOut.model_validate(FakeOrmUser())
    assert out.role is Role.ADMIN


def test_token_defaults_to_bearer_type():
    token = Token(access_token="abc")
    assert token.token_type == "bearer"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_user_schema.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas.user'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/schemas/user.py
from pydantic import BaseModel, ConfigDict

from app.models.user import Role


class UserCreate(BaseModel):
    username: str
    password: str
    role: Role = Role.USUARIO_COMUM


class UserOut(BaseModel):
    id: int
    username: str
    role: Role

    model_config = ConfigDict(from_attributes=True)


class UserRoleUpdate(BaseModel):
    role: Role


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_user_schema.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/user.py backend/tests/unit/test_user_schema.py
git commit -m "feat: add user Pydantic schemas"
```

---

### Task 13: schemas/producao.py

**Files:**
- Create: `backend/app/schemas/producao.py`
- Test: `backend/tests/unit/test_producao_schema.py`

**Depends-on:** 5, 6, 7

**Interfaces:**
- Consumes: `app.domain.patan.Patan` (Task 5), `app.domain.status.PlanItemStatus` (Task
  6), `app.domain.sequenciamento.Turno` (Task 7).
- Produces: `ItemProducaoOut` (id: int|None, linha: str, turno: Turno, patan: Patan,
  posto_trabalho: str, status: PlanItemStatus, sequencia: int, hora_inicial:
  datetime|None, hora_final: datetime|None, almoco_incluso: bool, kanbans: int,
  qtd_por_kanban: int, tempo_por_peca_minutos: float, is_critico: bool,
  tem_falta_estoque: bool; `from_attributes` enabled), `SequenciaResponse` (linha: str,
  turno: Turno, patan: Patan, itens: list[ItemProducaoOut]), `ItemProducaoBulkIn` (same
  fields as `ItemProducaoOut` minus `tem_falta_estoque`, `id` optional defaulting `None`),
  `BulkSubmitRequest` (linha: str, turno: Turno, patan: Patan, itens:
  list[ItemProducaoBulkIn]). Task 17 (repository) and Task 18 (routes) consume all four by
  these exact names.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_producao_schema.py
import pytest
from pydantic import ValidationError

from app.schemas.producao import BulkSubmitRequest, ItemProducaoBulkIn


def _item(**overrides):
    base = dict(
        linha="L1", turno=1, patan="A", posto_trabalho="posto-1",
        status=2, sequencia=1, kanbans=3, qtd_por_kanban=10,
        tempo_por_peca_minutos=0.5,
    )
    base.update(overrides)
    return base


def test_bulk_submit_request_accepts_valid_payload():
    request = BulkSubmitRequest(
        linha="L1", turno=1, patan="A", itens=[ItemProducaoBulkIn(**_item())]
    )
    assert request.itens[0].patan.value == "A"


def test_item_producao_bulk_in_rejects_invalid_patan():
    with pytest.raises(ValidationError):
        ItemProducaoBulkIn(**_item(patan="Z"))


def test_item_producao_bulk_in_rejects_invalid_status():
    with pytest.raises(ValidationError):
        ItemProducaoBulkIn(**_item(status=7))


def test_item_producao_bulk_in_defaults_id_to_none_for_new_items():
    item = ItemProducaoBulkIn(**_item())
    assert item.id is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_producao_schema.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas.producao'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/schemas/producao.py
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.domain.patan import Patan
from app.domain.sequenciamento import Turno
from app.domain.status import PlanItemStatus


class ItemProducaoOut(BaseModel):
    id: int | None
    linha: str
    turno: Turno
    patan: Patan
    posto_trabalho: str
    status: PlanItemStatus
    sequencia: int
    hora_inicial: datetime | None
    hora_final: datetime | None
    almoco_incluso: bool
    kanbans: int
    qtd_por_kanban: int
    tempo_por_peca_minutos: float
    is_critico: bool
    tem_falta_estoque: bool

    model_config = ConfigDict(from_attributes=True)


class SequenciaResponse(BaseModel):
    linha: str
    turno: Turno
    patan: Patan
    itens: list[ItemProducaoOut]


class ItemProducaoBulkIn(BaseModel):
    id: int | None = None
    linha: str
    turno: Turno
    patan: Patan
    posto_trabalho: str
    status: PlanItemStatus
    sequencia: int
    hora_inicial: datetime | None = None
    hora_final: datetime | None = None
    almoco_incluso: bool = False
    kanbans: int
    qtd_por_kanban: int
    tempo_por_peca_minutos: float
    is_critico: bool = False


class BulkSubmitRequest(BaseModel):
    linha: str
    turno: Turno
    patan: Patan
    itens: list[ItemProducaoBulkIn]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_producao_schema.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/producao.py backend/tests/unit/test_producao_schema.py
git commit -m "feat: add producao Pydantic schemas"
```

---

### Task 14: core/deps.py (current-user + role-gate dependencies)

**Files:**
- Create: `backend/app/core/deps.py`
- Test: `backend/tests/integration/test_deps.py`

**Depends-on:** 3, 4, 9

**Interfaces:**
- Consumes: `app.core.security.decode_access_token` (Task 3), `app.db.session.get_db`
  (Task 4), `app.models.user.Role`/`User` (Task 9).
- Produces: `oauth2_scheme` (`OAuth2PasswordBearer(tokenUrl="/auth/login")`),
  `get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) ->
  User` (raises `HTTPException(401)` on invalid token or unknown user), `require_role(
  *allowed_roles: Role)` — a dependency factory returning a callable that raises
  `HTTPException(403)` when `current_user.role` isn't in `allowed_roles`. Every route task
  (15, 16, 18) consumes `get_current_user` and `require_role` by these exact names.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/integration/test_deps.py
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.deps import get_current_user, require_role
from app.core.security import create_access_token
from app.db.session import Base
from app.models.user import Role, User


@pytest.fixture(autouse=True)
def _settings_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[User.__table__])
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def test_get_current_user_resolves_user_from_valid_token(db_session):
    db_session.add(User(username="joana", hashed_password="x", role=Role.ADMIN.value))
    db_session.commit()

    token = create_access_token(subject="joana", role=Role.ADMIN.value)
    user = get_current_user(token=token, db=db_session)

    assert user.username == "joana"


def test_get_current_user_rejects_invalid_token(db_session):
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token="garbage", db=db_session)
    assert exc_info.value.status_code == 401


def test_require_role_allows_matching_role(db_session):
    db_session.add(User(username="joana", hashed_password="x", role=Role.ADMIN.value))
    db_session.commit()
    user = db_session.query(User).filter_by(username="joana").one()

    dependency = require_role(Role.ADMIN)
    assert dependency(current_user=user) is user


def test_require_role_denies_mismatched_role(db_session):
    db_session.add(User(username="usuario", hashed_password="x", role=Role.USUARIO_COMUM.value))
    db_session.commit()
    user = db_session.query(User).filter_by(username="usuario").one()

    dependency = require_role(Role.ADMIN)
    with pytest.raises(HTTPException) as exc_info:
        dependency(current_user=user)
    assert exc_info.value.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/integration/test_deps.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.deps'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/core/deps.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import Role, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais invalidas.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
    except Exception as exc:
        raise credentials_error from exc

    username = payload.get("sub")
    if username is None:
        raise credentials_error

    user = db.query(User).filter(User.username == username).one_or_none()
    if user is None:
        raise credentials_error
    return user


def require_role(*allowed_roles: Role):
    allowed_values = {role.value for role in allowed_roles}

    def _dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Voce nao tem permissao para esta acao.",
            )
        return current_user

    return _dependency
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/integration/test_deps.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/deps.py backend/tests/integration/test_deps.py
git commit -m "feat: add current-user and role-gate dependencies"
```

---

### Task 15: api/routes_auth.py (bootstrap register + login)

**Files:**
- Create: `backend/app/api/routes_auth.py`
- Modify: `backend/app/main.py` (register the router)
- Test: `backend/tests/integration/test_routes_auth.py`

**Depends-on:** 3, 4, 9, 12

**Interfaces:**
- Consumes: `app.core.security.{create_access_token, decode_access_token, hash_password,
  verify_password}` (Task 3), `app.models.user.{Role, User}` (Task 9),
  `app.schemas.user.{Token, UserCreate, UserOut}` (Task 12), `app.db.session.get_db`
  (Task 4).
- Produces: `router` (`APIRouter(prefix="/auth")`) with `POST /auth/register` (see Design
  Decision 2: first user ever is unauthenticated and becomes Admin; every later call
  requires a valid Admin bearer token and honors the `role` in the payload) and
  `POST /auth/login` (OAuth2 password flow, returns `Token`). Task 16 and Task 18 modify
  `main.py` after this task — see their `Depends-on`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/integration/test_routes_auth.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.db.session import Base, get_db
from app.main import app
from app.models.user import User


@pytest.fixture(autouse=True)
def _settings_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine, tables=[User.__table__])
    TestingSessionLocal = sessionmaker(bind=engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_first_registration_is_unauthenticated_and_becomes_admin(client):
    response = client.post(
        "/auth/register",
        json={"username": "joana", "password": "s3cret", "role": "usuario_comum"},
    )
    assert response.status_code == 201
    assert response.json()["role"] == "admin"


def test_second_registration_without_token_is_forbidden(client):
    client.post(
        "/auth/register", json={"username": "joana", "password": "s3cret", "role": "admin"}
    )

    response = client.post(
        "/auth/register",
        json={"username": "pedro", "password": "s3cret", "role": "programador"},
    )
    assert response.status_code == 403


def test_second_registration_with_admin_token_succeeds(client):
    client.post(
        "/auth/register", json={"username": "joana", "password": "s3cret", "role": "admin"}
    )
    login = client.post("/auth/login", data={"username": "joana", "password": "s3cret"})
    token = login.json()["access_token"]

    response = client.post(
        "/auth/register",
        json={"username": "pedro", "password": "s3cret", "role": "programador"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    assert response.json()["role"] == "programador"


def test_login_rejects_wrong_password(client):
    client.post(
        "/auth/register", json={"username": "joana", "password": "s3cret", "role": "admin"}
    )

    response = client.post("/auth/login", data={"username": "joana", "password": "wrong"})
    assert response.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/integration/test_routes_auth.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.api.routes_auth'` (route
doesn't exist, 404 on every request)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/routes_auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.user import Token, UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
_optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def _authenticated_admin_or_none(token: str | None, db: Session) -> User | None:
    if token is None:
        return None
    try:
        payload = decode_access_token(token)
    except Exception:
        return None
    user = db.query(User).filter(User.username == payload.get("sub")).one_or_none()
    if user is not None and user.role == Role.ADMIN.value:
        return user
    return None


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(
    payload: UserCreate,
    db: Session = Depends(get_db),
    token: str | None = Depends(_optional_oauth2_scheme),
) -> User:
    is_first_user = db.query(User).first() is None

    if is_first_user:
        role = Role.ADMIN
    else:
        admin = _authenticated_admin_or_none(token, db)
        if admin is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cadastro de novos usuarios requer um administrador autenticado.",
            )
        role = payload.role

    user = User(
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role=role.value,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    user = db.query(User).filter(User.username == form_data.username).one_or_none()
    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario ou senha invalidos.",
        )
    access_token = create_access_token(subject=user.username, role=user.role)
    return Token(access_token=access_token)
```

```python
# backend/app/main.py  (modify — add router registration)
from fastapi import FastAPI

from app.api.routes_auth import router as auth_router

app = FastAPI(title="plannerLogistica")
app.include_router(auth_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/integration/test_routes_auth.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes_auth.py backend/app/main.py backend/tests/integration/test_routes_auth.py
git commit -m "feat: add auth register/login routes"
```

---

### Task 16: api/routes_users.py (Admin CRUD)

**Files:**
- Create: `backend/app/api/routes_users.py`
- Modify: `backend/app/main.py` (register the router)
- Test: `backend/tests/integration/test_routes_users.py`

**Depends-on:** 4, 9, 12, 14, 15

**Interfaces:**
- Consumes: `app.core.deps.require_role` (Task 14), `app.models.user.{Role, User}` (Task
  9), `app.schemas.user.{UserOut, UserRoleUpdate}` (Task 12), `app.db.session.get_db`
  (Task 4).
- Produces: `router` (`APIRouter(prefix="/users")`) with `GET /users` (Admin-only, list),
  `PATCH /users/{user_id}/role` (Admin-only), `DELETE /users/{user_id}` (Admin-only, 404
  if missing).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/integration/test_routes_users.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.db.session import Base, get_db
from app.main import app
from app.models.user import User


@pytest.fixture(autouse=True)
def _settings_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine, tables=[User.__table__])
    TestingSessionLocal = sessionmaker(bind=engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def admin_token(client):
    client.post(
        "/auth/register", json={"username": "joana", "password": "s3cret", "role": "admin"}
    )
    login = client.post("/auth/login", data={"username": "joana", "password": "s3cret"})
    return login.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_list_users_requires_admin(client, admin_token):
    client.post(
        "/auth/register",
        json={"username": "pedro", "password": "s3cret", "role": "usuario_comum"},
        headers=_auth_headers(admin_token),
    )

    response = client.get("/users", headers=_auth_headers(admin_token))

    assert response.status_code == 200
    usernames = {u["username"] for u in response.json()}
    assert usernames == {"joana", "pedro"}


def test_list_users_denies_non_admin(client, admin_token):
    client.post(
        "/auth/register",
        json={"username": "pedro", "password": "s3cret", "role": "usuario_comum"},
        headers=_auth_headers(admin_token),
    )
    login = client.post("/auth/login", data={"username": "pedro", "password": "s3cret"})
    pedro_token = login.json()["access_token"]

    response = client.get("/users", headers=_auth_headers(pedro_token))

    assert response.status_code == 403


def test_update_user_role(client, admin_token):
    create = client.post(
        "/auth/register",
        json={"username": "pedro", "password": "s3cret", "role": "usuario_comum"},
        headers=_auth_headers(admin_token),
    )
    user_id = create.json()["id"]

    response = client.patch(
        f"/users/{user_id}/role", json={"role": "programador"}, headers=_auth_headers(admin_token)
    )

    assert response.status_code == 200
    assert response.json()["role"] == "programador"


def test_update_user_role_missing_user_returns_404(client, admin_token):
    response = client.patch(
        "/users/9999/role", json={"role": "programador"}, headers=_auth_headers(admin_token)
    )
    assert response.status_code == 404


def test_delete_user(client, admin_token):
    create = client.post(
        "/auth/register",
        json={"username": "pedro", "password": "s3cret", "role": "usuario_comum"},
        headers=_auth_headers(admin_token),
    )
    user_id = create.json()["id"]

    response = client.delete(f"/users/{user_id}", headers=_auth_headers(admin_token))
    assert response.status_code == 204

    listed = client.get("/users", headers=_auth_headers(admin_token))
    assert all(u["id"] != user_id for u in listed.json())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/integration/test_routes_users.py -v`
Expected: FAIL — 404 on `/users` (router not registered yet)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/routes_users.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.user import UserOut, UserRoleUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.ADMIN)),
) -> list[User]:
    return db.query(User).order_by(User.username).all()


@router.patch("/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.ADMIN)),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado.")
    user.role = payload.role.value
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.ADMIN)),
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado.")
    db.delete(user)
    db.commit()
```

```python
# backend/app/main.py  (modify — add router registration)
from fastapi import FastAPI

from app.api.routes_auth import router as auth_router
from app.api.routes_users import router as users_router

app = FastAPI(title="plannerLogistica")
app.include_router(auth_router)
app.include_router(users_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/integration/test_routes_users.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes_users.py backend/app/main.py backend/tests/integration/test_routes_users.py
git commit -m "feat: add admin user-management routes"
```

---

### Task 17: repositories/producao_repository.py

**Files:**
- Create: `backend/app/repositories/producao_repository.py`
- Test: `backend/tests/integration/test_producao_repository.py`

**Depends-on:** 6, 10, 13

**Interfaces:**
- Consumes: `app.domain.status.PlanItemStatus` (Task 6), `app.models.producao.
  {ItemProducao, ItemProducaoStaging}` (Task 10), `app.schemas.producao.ItemProducaoBulkIn`
  (Task 13).
- Produces: `get_staging_itens(db: Session, linha: str, turno: int, patan: str) ->
  list[ItemProducaoStaging]`, `get_pecas_criticas_by_linha(db: Session, linha: str) ->
  list[ItemProducaoStaging]`, `bulk_persist(db: Session, linha: str, turno: int, patan:
  str, itens: list[ItemProducaoBulkIn]) -> list[ItemProducao]` (does **not** commit — the
  caller commits/rolls back, making the whole call site all-or-nothing). Task 18
  (`routes_producao.py`) consumes all three by these exact names.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/integration/test_producao_repository.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.domain.patan import Patan
from app.domain.sequenciamento import Turno
from app.domain.status import PlanItemStatus
from app.models.producao import ItemProducao, ItemProducaoStaging
from app.repositories.producao_repository import (
    bulk_persist,
    get_pecas_criticas_by_linha,
    get_staging_itens,
)
from app.schemas.producao import ItemProducaoBulkIn


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine, tables=[ItemProducaoStaging.__table__, ItemProducao.__table__]
    )
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def _bulk_item(**overrides):
    base = dict(
        id=None, linha="L1", turno=Turno.PRIMEIRO, patan=Patan.A,
        posto_trabalho="posto-1", status=PlanItemStatus.NORMAL, sequencia=1,
        kanbans=3, qtd_por_kanban=10, tempo_por_peca_minutos=0.5,
    )
    base.update(overrides)
    return ItemProducaoBulkIn(**base)


def test_get_staging_itens_filters_by_linha_turno_patan(db_session):
    db_session.add_all([
        ItemProducaoStaging(
            linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
            sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
            demanda=1, saldo_estoque=1, is_critico=False,
        ),
        ItemProducaoStaging(
            linha="L1", turno=1, patan="B", posto_trabalho="posto-1", status=2,
            sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
            demanda=1, saldo_estoque=1, is_critico=False,
        ),
    ])
    db_session.commit()

    resultado = get_staging_itens(db_session, "L1", 1, "A")

    assert len(resultado) == 1
    assert resultado[0].patan == "A"


def test_get_pecas_criticas_by_linha_ignores_patan_and_turno(db_session):
    db_session.add(
        ItemProducaoStaging(
            linha="L1", turno=2, patan="C", posto_trabalho="posto-1", status=3,
            sequencia=0, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
            demanda=1, saldo_estoque=1, is_critico=True,
        )
    )
    db_session.commit()

    resultado = get_pecas_criticas_by_linha(db_session, "L1")

    assert len(resultado) == 1
    assert resultado[0].is_critico is True


def test_bulk_persist_is_scoped_and_never_touches_other_scopes(db_session):
    outro_escopo = ItemProducao(
        linha="L2", turno=1, patan="A", posto_trabalho="posto-1", status=2,
        sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
        is_critico=False, em_producao=False,
    )
    db_session.add(outro_escopo)
    db_session.commit()

    bulk_persist(db_session, "L1", 1, "A", [_bulk_item()])
    db_session.commit()

    # Regression guard: an unscoped delete would have wiped producao entirely
    # (the legacy bug this rule exists to prevent).
    ainda_existe = db_session.query(ItemProducao).filter_by(linha="L2").one_or_none()
    assert ainda_existe is not None


def test_bulk_persist_never_overwrites_em_producao_rows(db_session):
    em_producao = ItemProducao(
        linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
        sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
        is_critico=False, em_producao=True,
    )
    db_session.add(em_producao)
    db_session.commit()
    preservado_id = em_producao.id

    bulk_persist(db_session, "L1", 1, "A", [_bulk_item(sequencia=2)])
    db_session.commit()

    ainda_existe = db_session.get(ItemProducao, preservado_id)
    assert ainda_existe is not None
    assert ainda_existe.em_producao is True


def test_bulk_persist_appends_new_items_after_preserved_ones_in_same_posto(db_session):
    em_producao = ItemProducao(
        linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
        sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
        is_critico=False, em_producao=True,
    )
    db_session.add(em_producao)
    db_session.commit()

    persistidos = bulk_persist(db_session, "L1", 1, "A", [_bulk_item()])
    db_session.commit()

    assert persistidos[0].sequencia == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/integration/test_producao_repository.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.repositories.producao_repository'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/repositories/producao_repository.py
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.domain.status import PlanItemStatus
from app.models.producao import ItemProducao, ItemProducaoStaging
from app.schemas.producao import ItemProducaoBulkIn


def get_staging_itens(
    db: Session, linha: str, turno: int, patan: str
) -> list[ItemProducaoStaging]:
    stmt = select(ItemProducaoStaging).where(
        ItemProducaoStaging.linha == linha,
        ItemProducaoStaging.turno == turno,
        ItemProducaoStaging.patan == patan,
        ItemProducaoStaging.status != PlanItemStatus.EXCLUIDO.value,
    )
    return list(db.scalars(stmt).all())


def get_pecas_criticas_by_linha(db: Session, linha: str) -> list[ItemProducaoStaging]:
    stmt = select(ItemProducaoStaging).where(
        ItemProducaoStaging.linha == linha,
        ItemProducaoStaging.status == PlanItemStatus.CRITICO.value,
    )
    return list(db.scalars(stmt).all())


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
    return persistidos
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/integration/test_producao_repository.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/producao_repository.py backend/tests/integration/test_producao_repository.py
git commit -m "feat: add producao repository with scoped bulk persist"
```

---

### Task 18: api/routes_producao.py (GET sequencia + POST bulk submit)

**Files:**
- Create: `backend/app/api/routes_producao.py`
- Modify: `backend/app/main.py` (register the router)
- Test: `backend/tests/integration/test_routes_producao.py`

**Depends-on:** 5, 6, 7, 8, 9, 13, 14, 16, 17

**Interfaces:**
- Consumes: `app.core.deps.{get_current_user, require_role}` (Task 14),
  `app.domain.estoque.diagnosticar_estoque` (Task 8), `app.domain.patan.Patan` (Task 5),
  `app.domain.sequenciamento.{SequenciaItem, Turno, calcular_cascata,
  calcular_tempo_producao_minutos}` (Task 7), `app.domain.status.PlanItemStatus` (Task 6),
  `app.models.user.Role` (Task 9), `app.repositories.producao_repository.{bulk_persist,
  get_pecas_criticas_by_linha, get_staging_itens}` (Task 17), `app.schemas.producao.
  {BulkSubmitRequest, ItemProducaoOut, SequenciaResponse}` (Task 13).
- Produces: `router` (`APIRouter(prefix="/producao")`) with `GET /producao/sequencia`
  (any authenticated role; query params `linha: str, turno: Turno, patan: Patan,
  data_base: date | None`) and `POST /producao/sequencia` (Admin/Programador only, body
  `BulkSubmitRequest`, all-or-nothing commit/rollback).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/integration/test_routes_producao.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.db.session import Base, get_db
from app.main import app
from app.models.producao import ItemProducao, ItemProducaoStaging
from app.models.user import User


@pytest.fixture(autouse=True)
def _settings_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(
        engine,
        tables=[User.__table__, ItemProducaoStaging.__table__, ItemProducao.__table__],
    )
    TestingSessionLocal = sessionmaker(bind=engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app), TestingSessionLocal
    app.dependency_overrides.clear()


def _programador_token(client: TestClient) -> str:
    client.post(
        "/auth/register", json={"username": "admin", "password": "s3cret", "role": "admin"}
    )
    login = client.post("/auth/login", data={"username": "admin", "password": "s3cret"})
    admin_token = login.json()["access_token"]
    client.post(
        "/auth/register",
        json={"username": "prog", "password": "s3cret", "role": "programador"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    login = client.post("/auth/login", data={"username": "prog", "password": "s3cret"})
    return login.json()["access_token"]


def test_get_sequencia_computes_cascade_and_includes_pecas_criticas(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    with SessionLocal() as session:
        session.add_all([
            ItemProducaoStaging(
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=2, qtd_por_kanban=5, tempo_por_peca_minutos=1,
                demanda=100, saldo_estoque=50, is_critico=False,
            ),
            ItemProducaoStaging(
                linha="L1", turno=1, patan="B", posto_trabalho="posto-1", status=3,
                sequencia=0, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=10, saldo_estoque=10, is_critico=True,
            ),
        ])
        session.commit()

    response = test_client.get(
        "/producao/sequencia",
        params={"linha": "L1", "turno": 1, "patan": "A"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["itens"][0]["hora_inicial"] == "2026-08-24T06:20:00" or "T06:20:00" in body["itens"][0]["hora_inicial"]
    assert any(item["is_critico"] for item in body["itens"])
    falta = next(item for item in body["itens"] if not item["is_critico"])
    assert falta["tem_falta_estoque"] is True


def test_submeter_sequencia_is_scoped_all_or_nothing(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    payload = {
        "linha": "L1", "turno": 1, "patan": "A",
        "itens": [
            {
                "id": None, "linha": "L1", "turno": 1, "patan": "A",
                "posto_trabalho": "posto-1", "status": 2, "sequencia": 1,
                "kanbans": 2, "qtd_por_kanban": 5, "tempo_por_peca_minutos": 1,
            }
        ],
    }

    response = test_client.post(
        "/producao/sequencia", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 201
    assert len(response.json()) == 1


def test_submeter_sequencia_denies_usuario_comum(client):
    test_client, SessionLocal = client
    _programador_token(test_client)  # ensures an admin exists to create the next user
    admin_login = test_client.post("/auth/login", data={"username": "admin", "password": "s3cret"})
    admin_token = admin_login.json()["access_token"]
    test_client.post(
        "/auth/register",
        json={"username": "comum", "password": "s3cret", "role": "usuario_comum"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    login = test_client.post("/auth/login", data={"username": "comum", "password": "s3cret"})
    comum_token = login.json()["access_token"]

    response = test_client.post(
        "/producao/sequencia",
        json={"linha": "L1", "turno": 1, "patan": "A", "itens": []},
        headers={"Authorization": f"Bearer {comum_token}"},
    )

    assert response.status_code == 403


def test_submeter_sequencia_is_all_or_nothing_on_failure(client, monkeypatch):
    # Regression guard for "envio em lote tudo-ou-nada": if persistence fails
    # partway, nothing from this submission may remain in Tabela B.
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    import app.api.routes_producao as routes_producao_module

    def _falha(*args, **kwargs):
        raise RuntimeError("falha simulada")

    monkeypatch.setattr(routes_producao_module, "bulk_persist", _falha)

    payload = {
        "linha": "L1", "turno": 1, "patan": "A",
        "itens": [
            {
                "id": None, "linha": "L1", "turno": 1, "patan": "A",
                "posto_trabalho": "posto-1", "status": 2, "sequencia": 1,
                "kanbans": 2, "qtd_por_kanban": 5, "tempo_por_peca_minutos": 1,
            }
        ],
    }

    response = test_client.post(
        "/producao/sequencia", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 422
    with SessionLocal() as session:
        assert session.query(ItemProducao).filter_by(linha="L1").count() == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/integration/test_routes_producao.py -v`
Expected: FAIL — 404 on `/producao/sequencia` (router not registered yet)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/routes_producao.py
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.domain.estoque import diagnosticar_estoque
from app.domain.patan import Patan
from app.domain.sequenciamento import (
    SequenciaItem,
    Turno,
    calcular_cascata,
    calcular_tempo_producao_minutos,
)
from app.domain.status import PlanItemStatus
from app.models.producao import ItemProducaoStaging
from app.models.user import Role, User
from app.repositories.producao_repository import (
    bulk_persist,
    get_pecas_criticas_by_linha,
    get_staging_itens,
)
from app.schemas.producao import BulkSubmitRequest, ItemProducaoOut, SequenciaResponse

router = APIRouter(prefix="/producao", tags=["producao"])


@router.get("/sequencia", response_model=SequenciaResponse)
def obter_sequencia(
    linha: str,
    turno: Turno,
    patan: Patan,
    data_base: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SequenciaResponse:
    data = data_base or date.today()
    staging = get_staging_itens(db, linha, turno.value, patan.value)
    criticos = get_pecas_criticas_by_linha(db, linha)

    registros_por_posto: dict[str, list[ItemProducaoStaging]] = defaultdict(list)
    for registro in [*staging, *criticos]:
        registros_por_posto[registro.posto_trabalho].append(registro)

    resultado: list[ItemProducaoOut] = []
    for registros in registros_por_posto.values():
        normais = sorted(
            (r for r in registros if r.status == PlanItemStatus.NORMAL.value),
            key=lambda r: r.sequencia,
        )
        itens_dominio = [
            SequenciaItem(
                sequencia=r.sequencia,
                status=PlanItemStatus(r.status),
                posto_trabalho=r.posto_trabalho,
                tempo_producao_minutos=calcular_tempo_producao_minutos(
                    r.kanbans, r.qtd_por_kanban, r.tempo_por_peca_minutos
                ),
            )
            for r in normais
        ]
        calculados_por_sequencia = {
            item.sequencia: item for item in calcular_cascata(turno, data, itens_dominio)
        }

        for r in registros:
            calculado = calculados_por_sequencia.get(r.sequencia)
            diagnostico = diagnosticar_estoque(r.demanda, r.saldo_estoque)
            resultado.append(
                ItemProducaoOut(
                    id=r.id,
                    linha=r.linha,
                    turno=r.turno,
                    patan=r.patan,
                    posto_trabalho=r.posto_trabalho,
                    status=r.status,
                    sequencia=r.sequencia,
                    hora_inicial=calculado.hora_inicial if calculado else None,
                    hora_final=calculado.hora_final if calculado else None,
                    almoco_incluso=calculado.almoco_incluso if calculado else False,
                    kanbans=r.kanbans,
                    qtd_por_kanban=r.qtd_por_kanban,
                    tempo_por_peca_minutos=r.tempo_por_peca_minutos,
                    is_critico=r.is_critico,
                    tem_falta_estoque=diagnostico.tem_falta,
                )
            )

    return SequenciaResponse(linha=linha, turno=turno, patan=patan, itens=resultado)


@router.post(
    "/sequencia", response_model=list[ItemProducaoOut], status_code=status.HTTP_201_CREATED
)
def submeter_sequencia(
    payload: BulkSubmitRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),
) -> list[ItemProducaoOut]:
    try:
        persistidos = bulk_persist(
            db, payload.linha, payload.turno.value, payload.patan.value, payload.itens
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Falha ao persistir o lote; nada foi salvo.",
        ) from exc

    return [
        ItemProducaoOut(
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
        )
        for item in persistidos
    ]
```

```python
# backend/app/main.py  (modify — add router registration)
from fastapi import FastAPI

from app.api.routes_auth import router as auth_router
from app.api.routes_producao import router as producao_router
from app.api.routes_users import router as users_router

app = FastAPI(title="plannerLogistica")
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(producao_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/integration/test_routes_producao.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes_producao.py backend/app/main.py backend/tests/integration/test_routes_producao.py
git commit -m "feat: add producao sequencia GET and bulk-submit POST routes"
```

---

### Task 19: Frontend project scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/vitest.setup.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/eslint.config.js`
- Create: `frontend/index.html`
- Create: `frontend/.gitignore`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Test: `frontend/src/App.test.tsx`

**Depends-on:** none

**Interfaces:**
- Consumes: nothing (first frontend task).
- Produces: a runnable Vite + React + TS app (`npm run dev`), a working `vitest` +
  Testing Library setup (`npm test`), and a placeholder `App` component. Task 29 replaces
  `App.tsx`'s body and `App.test.tsx`'s assertions once the router exists; every other
  frontend task builds new files under `src/` without touching this task's files.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/App.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("renders the app shell", () => {
    render(<App />);
    expect(screen.getByText("plannerLogistica")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm install && npm test`
Expected: FAIL — `src/App.tsx` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```json
// frontend/package.json
{
  "name": "planner-logistica-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@tanstack/react-query": "^5.51.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.8.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "eslint": "^9.8.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.9",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.0",
    "typescript-eslint": "^8.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

```typescript
// frontend/vite.config.ts
/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
```

```typescript
// frontend/vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

```json
// frontend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

```json
// frontend/tsconfig.node.json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

```javascript
// frontend/eslint.config.js
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  }
);
```

```html
<!-- frontend/index.html -->
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>plannerLogistica</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```
# frontend/.gitignore
node_modules/
dist/
.env
.env.local
coverage/
```

```typescript
// frontend/src/App.tsx
function App() {
  return <div>plannerLogistica</div>;
}

export default App;
```

```typescript
// frontend/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/vite.config.ts frontend/vitest.setup.ts frontend/tsconfig.json frontend/tsconfig.node.json frontend/eslint.config.js frontend/index.html frontend/.gitignore frontend/src/main.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: scaffold Vite + React + TypeScript frontend"
```

---

### Task 20: types/producao.ts

**Files:**
- Create: `frontend/src/types/producao.ts`

**Depends-on:** 19

**Interfaces:**
- Consumes: nothing beyond the scaffold (Task 19).
- Produces: `Patan` (union of the 8 letters), `PlanItemStatus` enum (`Excluido=0,
  Normal=2, Critico=3, Locked=9`), `ItemProducao`, `SequenciaResponse`,
  `BulkSubmitRequest` interfaces — field-for-field mirrors of the backend's
  `schemas/producao.py` (snake_case preserved, no mapping layer). Tasks 21, 22, 23, 25,
  26, 27, 28 all import from here.

**Note:** no unit test for this task — pure type/enum declarations with zero runtime
logic (05-testing.md: skip config/no-logic code). Verified instead by the TypeScript
compiler in Step 2.

- [ ] **Step 1: Write the file**

```typescript
// frontend/src/types/producao.ts
export type Patan = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export enum PlanItemStatus {
  Excluido = 0,
  Normal = 2,
  Critico = 3,
  Locked = 9,
}

export interface ItemProducao {
  id: number | null;
  linha: string;
  turno: number;
  patan: Patan;
  posto_trabalho: string;
  status: PlanItemStatus;
  sequencia: number;
  hora_inicial: string | null;
  hora_final: string | null;
  almoco_incluso: boolean;
  kanbans: number;
  qtd_por_kanban: number;
  tempo_por_peca_minutos: number;
  is_critico: boolean;
  tem_falta_estoque: boolean;
}

export interface SequenciaResponse {
  linha: string;
  turno: number;
  patan: string;
  itens: ItemProducao[];
}

export interface BulkSubmitRequest {
  linha: string;
  turno: number;
  patan: Patan;
  itens: ItemProducao[];
}
```

- [ ] **Step 2: Run the TypeScript compiler to verify it compiles cleanly**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/producao.ts
git commit -m "feat: add producao TypeScript types"
```

---

### Task 21: services/api.ts

**Files:**
- Create: `frontend/src/services/api.ts`
- Test: `frontend/src/services/api.test.ts`

**Depends-on:** 20

**Interfaces:**
- Consumes: `ItemProducao`, `SequenciaResponse`, `BulkSubmitRequest` from
  `../types/producao` (Task 20).
- Produces: `ApiError` (Error subclass with `status: number`), `login(username: string,
  password: string) -> Promise<string>`, `getSequencia(token: string, params: {linha:
  string, turno: number, patan: string}) -> Promise<SequenciaResponse>`,
  `submitBulkSequencia(token: string, payload: BulkSubmitRequest) ->
  Promise<ItemProducao[]>`, `UserOut` interface (`id: number, username: string, role:
  string`), `listUsers(token: string) -> Promise<UserOut[]>`, `updateUserRole(token:
  string, userId: number, role: string) -> Promise<UserOut>`, `deleteUser(token: string,
  userId: number) -> Promise<void>`, `registerUser(token: string | null, payload:
  {username: string, password: string, role: string}) -> Promise<UserOut>`. Task 22
  consumes `login`. Tasks 26/27 consume `getSequencia`/`submitBulkSequencia`. Task 28
  consumes `listUsers`/`updateUserRole`/`deleteUser`/`registerUser`.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/services/api.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getSequencia, login } from "./api";

describe("api service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("login posts form-encoded credentials and returns the access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "abc123", token_type: "bearer" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await login("joana", "s3cret");

    expect(token).toBe("abc123");
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(String(requestInit.body)).toContain("username=joana");
  });

  it("getSequencia sends the bearer token and query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ linha: "L1", turno: 1, patan: "A", itens: [] }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSequencia("token123", { linha: "L1", turno: 1, patan: "A" });

    expect(result.linha).toBe("L1");
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/producao/sequencia?linha=L1&turno=1&patan=A");
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer token123"
    );
  });

  it("throws ApiError with the backend detail message on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Usuario ou senha invalidos." }), { status: 401 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(login("joana", "wrong")).rejects.toThrow(ApiError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/api.test.ts`
Expected: FAIL — `src/services/api.ts` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/services/api.ts
import type { BulkSubmitRequest, ItemProducao, SequenciaResponse } from "../types/producao";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, body.detail ?? "Erro desconhecido");
  }
  return response.json() as Promise<T>;
}

export async function login(username: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username, password });
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await parseJsonOrThrow<{ access_token: string }>(response);
  return data.access_token;
}

export async function getSequencia(
  token: string,
  params: { linha: string; turno: number; patan: string }
): Promise<SequenciaResponse> {
  const query = new URLSearchParams({
    linha: params.linha,
    turno: String(params.turno),
    patan: params.patan,
  });
  const response = await fetch(`${API_BASE_URL}/producao/sequencia?${query}`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<SequenciaResponse>(response);
}

export async function submitBulkSequencia(
  token: string,
  payload: BulkSubmitRequest
): Promise<ItemProducao[]> {
  const response = await fetch(`${API_BASE_URL}/producao/sequencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ItemProducao[]>(response);
}

export interface UserOut {
  id: number;
  username: string;
  role: string;
}

export async function listUsers(token: string): Promise<UserOut[]> {
  const response = await fetch(`${API_BASE_URL}/users`, { headers: authHeaders(token) });
  return parseJsonOrThrow<UserOut[]>(response);
}

export async function updateUserRole(
  token: string,
  userId: number,
  role: string
): Promise<UserOut> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ role }),
  });
  return parseJsonOrThrow<UserOut>(response);
}

export async function deleteUser(token: string, userId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new ApiError(response.status, "Falha ao remover usuario.");
  }
}

export async function registerUser(
  token: string | null,
  payload: { username: string; password: string; role: string }
): Promise<UserOut> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<UserOut>(response);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/services/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/services/api.test.ts
git commit -m "feat: add fetch-based API service layer"
```

---

### Task 22: auth/AuthContext.tsx

**Files:**
- Create: `frontend/src/auth/AuthContext.tsx`
- Test: `frontend/src/auth/AuthContext.test.tsx`

**Depends-on:** 21

**Interfaces:**
- Consumes: `login` from `../services/api` (Task 21).
- Produces: `Role` type (`"admin" | "programador" | "usuario_comum"`), `AuthProvider`
  (`{children}` wrapper component), `useAuth()` returning `{token: string | null,
  username: string | null, role: Role | null, login: (username: string, password:
  string) => Promise<void>, logout: () => void}`. Persists the JWT to
  `localStorage["planner_logistica_token"]`. Tasks 24, 26, 27, 28, 29 consume `useAuth`
  and `Role` by these exact names.

**Additional dependency:** this task's test needs `@testing-library/user-event`
(already added to `package.json` in Task 19 — confirm with
`cd frontend && npm ls @testing-library/user-event` before starting; run
`npm install --save-dev @testing-library/user-event` if it's missing).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/auth/AuthContext.test.tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../services/api";
import { AuthProvider, useAuth } from "./AuthContext";

function LoginProbe() {
  const { token, role, username, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="token">{token ?? "no-token"}</span>
      <span data-testid="role">{role ?? "no-role"}</span>
      <span data-testid="username">{username ?? "no-username"}</span>
      <button onClick={() => login("joana", "s3cret")}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function fakeJwt(sub: string, role: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const payload = btoa(JSON.stringify({ sub, role, exp: 9999999999 }));
  return `${header}.${payload}.signature`;
}

describe("AuthContext", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("login stores the decoded role and username", async () => {
    vi.spyOn(api, "login").mockResolvedValue(fakeJwt("joana", "admin"));
    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>
    );

    await act(async () => {
      await userEvent.click(screen.getByText("login"));
    });

    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("admin"));
    expect(screen.getByTestId("username").textContent).toBe("joana");
  });

  it("logout clears the stored token", async () => {
    vi.spyOn(api, "login").mockResolvedValue(fakeJwt("joana", "admin"));
    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>
    );

    await act(async () => {
      await userEvent.click(screen.getByText("login"));
    });
    await act(async () => {
      await userEvent.click(screen.getByText("logout"));
    });

    expect(screen.getByTestId("token").textContent).toBe("no-token");
    expect(localStorage.getItem("planner_logistica_token")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/auth/AuthContext.test.tsx`
Expected: FAIL — `src/auth/AuthContext.tsx` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/auth/AuthContext.tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { login as apiLogin } from "../services/api";

export type Role = "admin" | "programador" | "usuario_comum";

interface DecodedToken {
  sub: string;
  role: Role;
  exp: number;
}

interface AuthState {
  token: string | null;
  username: string | null;
  role: Role | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = "planner_logistica_token";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeToken(token: string): DecodedToken {
  const payload = token.split(".")[1];
  return JSON.parse(atob(payload)) as DecodedToken;
}

function readInitialState(): AuthState {
  const token = localStorage.getItem(STORAGE_KEY);
  if (!token) {
    return { token: null, username: null, role: null };
  }
  try {
    const decoded = decodeToken(token);
    return { token, username: decoded.sub, role: decoded.role };
  } catch {
    return { token: null, username: null, role: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(readInitialState);

  const login = useCallback(async (username: string, password: string) => {
    const token = await apiLogin(username, password);
    const decoded = decodeToken(token);
    localStorage.setItem(STORAGE_KEY, token);
    setState({ token, username: decoded.sub, role: decoded.role });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ token: null, username: null, role: null });
  }, []);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/auth/AuthContext.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth/AuthContext.tsx frontend/src/auth/AuthContext.test.tsx
git commit -m "feat: add AuthContext with JWT persistence"
```

---

### Task 23: state/sequenciaReducer.ts (client-side cascade port)

**Files:**
- Create: `frontend/src/state/sequenciaReducer.ts`
- Test: `frontend/src/state/sequenciaReducer.test.ts`

**Depends-on:** 20

**Interfaces:**
- Consumes: `PlanItemStatus`, `ItemProducao` from `../types/producao` (Task 20).
- Produces: `SHIFT_START_TIME`, `MEAL_TIME` (same placeholder values as the backend's
  `domain/sequenciamento.py`), `LUNCH_BREAK_MINUTES = 40`, `LUNCH_BREAK_LABEL =
  "HORARIO DE ALMOCO INCLUSO"`, `calcularTempoProducaoMinutos(kanbans: number,
  qtdPorKanban: number, tempoPorPecaMinutos: number) -> number`, `calcularCascata(turno:
  number, dataBase: Date, itens: ItemProducao[]) -> ItemProducao[]` (mirrors Task 7's
  Python `calcular_cascata` exactly — same tie-break rule, same +40min-once semantics),
  `SequenciaState` (`{turno: number, dataBase: string, itensPorPosto: Record<string,
  ItemProducao[]>}`), `SequenciaAction` (`{type: "CARREGAR", payload: {turno, dataBase,
  itens}} | {type: "REORDENAR", payload: {posto, itens}}`), `sequenciaReducer(state,
  action) -> SequenciaState`, `initialSequenciaState: SequenciaState`. Task 25
  (`SequenciaBoard`) and Tasks 26/27/29 (pages/router) consume these by these exact
  names.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/state/sequenciaReducer.test.ts
import { describe, expect, it } from "vitest";

import { PlanItemStatus, type ItemProducao } from "../types/producao";
import {
  LUNCH_BREAK_LABEL,
  calcularCascata,
  calcularTempoProducaoMinutos,
  initialSequenciaState,
  sequenciaReducer,
} from "./sequenciaReducer";

function item(overrides: Partial<ItemProducao> = {}): ItemProducao {
  return {
    id: 1,
    linha: "L1",
    turno: 1,
    patan: "A",
    posto_trabalho: "posto-1",
    status: PlanItemStatus.Normal,
    sequencia: 1,
    hora_inicial: null,
    hora_final: null,
    almoco_incluso: false,
    kanbans: 1,
    qtd_por_kanban: 1,
    tempo_por_peca_minutos: 30,
    is_critico: false,
    tem_falta_estoque: false,
    ...overrides,
  };
}

describe("calcularTempoProducaoMinutos", () => {
  it("applies the (kanbans x qtd_por_kanban) x tempo_por_peca formula", () => {
    expect(calcularTempoProducaoMinutos(3, 10, 0.5)).toBe(15);
  });
});

describe("calcularCascata", () => {
  it("starts the first item at the shift's fixed start time", () => {
    const dataBase = new Date(2026, 7, 24);
    const [resultado] = calcularCascata(1, dataBase, [
      item({ sequencia: 1, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 30 }),
    ]);
    expect(resultado.hora_inicial).toBe(new Date(2026, 7, 24, 6, 20).toISOString());
  });

  it("chains the next item's start to the previous item's end", () => {
    const dataBase = new Date(2026, 7, 24);
    const itens = [
      item({ sequencia: 1, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 30 }),
      item({ sequencia: 2, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 20 }),
    ];
    const resultado = calcularCascata(1, dataBase, itens);
    expect(resultado[1].hora_inicial).toBe(resultado[0].hora_final);
  });

  it("adds the lunch break once when a window strictly crosses the meal instant", () => {
    const dataBase = new Date(2026, 7, 24);
    const itens = [
      item({ sequencia: 1, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 220 }), // 06:20 -> 10:00
      item({ sequencia: 2, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 40 }), // 10:00 -> 10:40 (+lunch)
    ];
    const resultado = calcularCascata(1, dataBase, itens);
    expect(resultado[0].almoco_incluso).toBe(false);
    expect(resultado[1].almoco_incluso).toBe(true);
    expect(resultado[1].hora_final).toBe(new Date(2026, 7, 24, 11, 20).toISOString());
  });

  it("rolls turno 3's meal instant into the next calendar day", () => {
    const dataBase = new Date(2026, 7, 24);
    const itens = [
      item({ sequencia: 1, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 300 }), // 23:00 -> 04:00
    ];
    const resultado = calcularCascata(3, dataBase, itens);
    expect(resultado[0].almoco_incluso).toBe(true);
    expect(resultado[0].hora_final).toBe(new Date(2026, 7, 25, 4, 40).toISOString());
  });

  it("exposes the exact lunch label string", () => {
    expect(LUNCH_BREAK_LABEL).toBe("HORARIO DE ALMOCO INCLUSO");
  });
});

describe("sequenciaReducer", () => {
  it("CARREGAR groups by posto and computes the initial cascade", () => {
    const state = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase: new Date(2026, 7, 24).toISOString(),
        itens: [item({ posto_trabalho: "posto-1", sequencia: 1 })],
      },
    });
    expect(state.itensPorPosto["posto-1"][0].hora_inicial).not.toBeNull();
  });

  it("REORDENAR recalculates only the affected posto", () => {
    const dataBase = new Date(2026, 7, 24).toISOString();
    const loaded = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [
          item({ posto_trabalho: "posto-1", sequencia: 1, id: 1 }),
          item({
            posto_trabalho: "posto-1",
            sequencia: 2,
            id: 2,
            tempo_por_peca_minutos: 10,
          }),
        ],
      },
    });

    const reordenado = sequenciaReducer(loaded, {
      type: "REORDENAR",
      payload: {
        posto: "posto-1",
        itens: [
          { ...loaded.itensPorPosto["posto-1"][1], sequencia: 1 },
          { ...loaded.itensPorPosto["posto-1"][0], sequencia: 2 },
        ],
      },
    });

    expect(reordenado.itensPorPosto["posto-1"][0].id).toBe(2);
  });

  it("keeps critical items out of the cascade timing chain", () => {
    const dataBase = new Date(2026, 7, 24).toISOString();
    const state = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [
          item({ posto_trabalho: "posto-1", sequencia: 1, status: PlanItemStatus.Normal }),
          item({
            posto_trabalho: "posto-1",
            sequencia: 0,
            status: PlanItemStatus.Critico,
            id: 2,
          }),
        ],
      },
    });

    const critico = state.itensPorPosto["posto-1"].find(
      (i) => i.status === PlanItemStatus.Critico
    );
    expect(critico?.hora_inicial).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/state/sequenciaReducer.test.ts`
Expected: FAIL — `src/state/sequenciaReducer.ts` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/state/sequenciaReducer.ts
import { PlanItemStatus, type ItemProducao } from "../types/producao";

export const SHIFT_START_TIME: Record<number, [number, number]> = {
  1: [6, 20],
  2: [14, 40],
  3: [23, 0],
};

// Placeholder meal times (shift start + 4h) - user will hand-tune later.
// Edit these directly; the cascade logic reads them, it does not derive
// them from SHIFT_START_TIME. Must match backend domain/sequenciamento.py.
export const MEAL_TIME: Record<number, [number, number]> = {
  1: [10, 20],
  2: [18, 40],
  3: [3, 0],
};

export const LUNCH_BREAK_MINUTES = 40;
export const LUNCH_BREAK_LABEL = "HORARIO DE ALMOCO INCLUSO";

function toDateTime(base: Date, [hour, minute]: [number, number]): Date {
  const result = new Date(base);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function mealDateTime(turno: number, dataBase: Date): Date {
  const inicio = toDateTime(dataBase, SHIFT_START_TIME[turno]);
  let almoco = toDateTime(dataBase, MEAL_TIME[turno]);
  if (almoco.getTime() <= inicio.getTime()) {
    almoco = new Date(almoco.getTime() + 24 * 60 * 60 * 1000);
  }
  return almoco;
}

export function calcularTempoProducaoMinutos(
  kanbans: number,
  qtdPorKanban: number,
  tempoPorPecaMinutos: number
): number {
  return kanbans * qtdPorKanban * tempoPorPecaMinutos;
}

export function calcularCascata(
  turno: number,
  dataBase: Date,
  itens: ItemProducao[]
): ItemProducao[] {
  const almoco = mealDateTime(turno, dataBase);
  let proximoInicio = toDateTime(dataBase, SHIFT_START_TIME[turno]);
  const resultado: ItemProducao[] = [];

  for (const item of itens) {
    const horaInicial = new Date(proximoInicio);
    const duracaoMinutos = calcularTempoProducaoMinutos(
      item.kanbans,
      item.qtd_por_kanban,
      item.tempo_por_peca_minutos
    );
    let horaFinal = new Date(horaInicial.getTime() + duracaoMinutos * 60000);
    const almocoIncluso =
      horaInicial.getTime() < almoco.getTime() && almoco.getTime() < horaFinal.getTime();
    if (almocoIncluso) {
      horaFinal = new Date(horaFinal.getTime() + LUNCH_BREAK_MINUTES * 60000);
    }

    resultado.push({
      ...item,
      hora_inicial: horaInicial.toISOString(),
      hora_final: horaFinal.toISOString(),
      almoco_incluso: almocoIncluso,
    });

    proximoInicio = horaFinal;
  }

  return resultado;
}

function agruparPorPosto(itens: ItemProducao[]): Record<string, ItemProducao[]> {
  const grupos: Record<string, ItemProducao[]> = {};
  for (const item of itens) {
    grupos[item.posto_trabalho] = grupos[item.posto_trabalho] ?? [];
    grupos[item.posto_trabalho].push(item);
  }
  return grupos;
}

function recalcularGrupo(turno: number, dataBase: Date, itens: ItemProducao[]): ItemProducao[] {
  const normais = itens
    .filter((item) => item.status === PlanItemStatus.Normal)
    .sort((a, b) => a.sequencia - b.sequencia);
  const outros = itens.filter((item) => item.status !== PlanItemStatus.Normal);
  return [...calcularCascata(turno, dataBase, normais), ...outros];
}

export interface SequenciaState {
  turno: number;
  dataBase: string;
  itensPorPosto: Record<string, ItemProducao[]>;
}

export type SequenciaAction =
  | { type: "CARREGAR"; payload: { turno: number; dataBase: string; itens: ItemProducao[] } }
  | { type: "REORDENAR"; payload: { posto: string; itens: ItemProducao[] } };

export function sequenciaReducer(
  state: SequenciaState,
  action: SequenciaAction
): SequenciaState {
  switch (action.type) {
    case "CARREGAR": {
      const dataBase = new Date(action.payload.dataBase);
      const grupos = agruparPorPosto(action.payload.itens);
      const recalculados: Record<string, ItemProducao[]> = {};
      for (const [posto, itensDoGrupo] of Object.entries(grupos)) {
        recalculados[posto] = recalcularGrupo(action.payload.turno, dataBase, itensDoGrupo);
      }
      return {
        turno: action.payload.turno,
        dataBase: action.payload.dataBase,
        itensPorPosto: recalculados,
      };
    }
    case "REORDENAR": {
      const dataBase = new Date(state.dataBase);
      const recalculado = recalcularGrupo(state.turno, dataBase, action.payload.itens);
      return {
        ...state,
        itensPorPosto: { ...state.itensPorPosto, [action.payload.posto]: recalculado },
      };
    }
    default:
      return state;
  }
}

export const initialSequenciaState: SequenciaState = {
  turno: 1,
  dataBase: new Date().toISOString(),
  itensPorPosto: {},
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/state/sequenciaReducer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/state/sequenciaReducer.ts frontend/src/state/sequenciaReducer.test.ts
git commit -m "feat: add client-side escadinha cascade reducer"
```

---

### Task 24: routes/RequireRole.tsx

**Files:**
- Create: `frontend/src/routes/RequireRole.tsx`
- Test: `frontend/src/routes/RequireRole.test.tsx`

**Depends-on:** 22

**Interfaces:**
- Consumes: `useAuth`, `Role` from `../auth/AuthContext` (Task 22).
- Produces: `RequireRole({allowed: Role[], children: ReactNode})` — redirects to
  `/login` when `role === null`, redirects to `/` when `role` isn't in `allowed`,
  otherwise renders `children`. Task 29 (`AppRouter.tsx`) consumes this by this exact
  name.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/routes/RequireRole.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import * as authModule from "../auth/AuthContext";
import { RequireRole } from "./RequireRole";

function renderWithRole(role: authModule.Role | null) {
  vi.spyOn(authModule, "useAuth").mockReturnValue({
    token: role ? "token" : null,
    username: role ? "joana" : null,
    role,
    login: vi.fn(),
    logout: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <RequireRole allowed={["admin"]}>
              <div>conteudo protegido</div>
            </RequireRole>
          }
        />
        <Route path="/login" element={<div>tela de login</div>} />
        <Route path="/" element={<div>pagina inicial</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireRole", () => {
  it("renders children when the role is allowed", () => {
    renderWithRole("admin");
    expect(screen.getByText("conteudo protegido")).toBeInTheDocument();
  });

  it("redirects to /login when there is no authenticated user", () => {
    renderWithRole(null);
    expect(screen.getByText("tela de login")).toBeInTheDocument();
  });

  it("redirects to / when the role is not allowed", () => {
    renderWithRole("usuario_comum");
    expect(screen.getByText("pagina inicial")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/routes/RequireRole.test.tsx`
Expected: FAIL — `src/routes/RequireRole.tsx` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/routes/RequireRole.tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth, type Role } from "../auth/AuthContext";

interface RequireRoleProps {
  allowed: Role[];
  children: ReactNode;
}

export function RequireRole({ allowed, children }: RequireRoleProps) {
  const { role } = useAuth();

  if (role === null) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/routes/RequireRole.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/RequireRole.tsx frontend/src/routes/RequireRole.test.tsx
git commit -m "feat: add role-gated route guard"
```

---

### Task 25: components/SequenciaBoard (drag-and-drop Kanban board)

**Files:**
- Create: `frontend/src/components/SequenciaBoard/SequenciaCard.tsx`
- Create: `frontend/src/components/SequenciaBoard/SequenciaBoard.tsx`
- Test: `frontend/src/components/SequenciaBoard/SequenciaBoard.test.tsx`

**Depends-on:** 20

**Interfaces:**
- Consumes: `ItemProducao`, `PlanItemStatus` from `../../types/producao` (Task 20).
- Produces: `SequenciaCard({item: ItemProducao})` and `SequenciaBoard({itensPorPosto:
  Record<string, ItemProducao[]>, onReordenar: (posto: string, itens: ItemProducao[]) =>
  void, somenteLeitura?: boolean})` — one dnd-kit `SortableContext` column per posto;
  dragging a card within its column calls `onReordenar(posto, itensReordenados)` with
  fresh `sequencia` values for `PlanItemStatus.Normal` items (critical items keep
  `sequencia=0`); `somenteLeitura` (default `false`) short-circuits `onDragEnd` so
  Usuário Comum can view but never trigger a reorder callback. Tasks 26, 27 consume
  `SequenciaBoard` by this exact name and prop shape.

**Scope note:** this task's test covers rendering (cards per posto, the exact lunch
label, the stock-shortage marker) — it does not simulate an actual pointer-driven drag
gesture. `@dnd-kit`'s pointer sensor is not practically simulatable in jsdom without
scaffolding disproportionate to Fase 1; `onReordenar`'s behavior is already fully
covered by Task 23's reducer tests, which is where the real reordering logic lives.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/components/SequenciaBoard/SequenciaBoard.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlanItemStatus, type ItemProducao } from "../../types/producao";
import { SequenciaBoard } from "./SequenciaBoard";

function item(overrides: Partial<ItemProducao> = {}): ItemProducao {
  return {
    id: 1,
    linha: "L1",
    turno: 1,
    patan: "A",
    posto_trabalho: "posto-1",
    status: PlanItemStatus.Normal,
    sequencia: 1,
    hora_inicial: "2026-08-24T06:20:00",
    hora_final: "2026-08-24T06:50:00",
    almoco_incluso: false,
    kanbans: 1,
    qtd_por_kanban: 1,
    tempo_por_peca_minutos: 30,
    is_critico: false,
    tem_falta_estoque: false,
    ...overrides,
  };
}

describe("SequenciaBoard", () => {
  it("renders one card per item, grouped under its posto heading", () => {
    render(
      <SequenciaBoard
        itensPorPosto={{ "posto-1": [item({ id: 1 }), item({ id: 2, sequencia: 2 })] }}
        onReordenar={vi.fn()}
      />
    );

    expect(screen.getByText("posto-1")).toBeInTheDocument();
    expect(screen.getAllByTestId("sequencia-card")).toHaveLength(2);
  });

  it("shows the exact lunch label only for items with almoco_incluso", () => {
    render(
      <SequenciaBoard
        itensPorPosto={{ "posto-1": [item({ id: 1, almoco_incluso: true })] }}
        onReordenar={vi.fn()}
      />
    );

    expect(screen.getByTestId("almoco-label")).toHaveTextContent(
      "HORARIO DE ALMOCO INCLUSO"
    );
  });

  it("shows a falta de estoque marker when the item lacks stock", () => {
    render(
      <SequenciaBoard
        itensPorPosto={{ "posto-1": [item({ id: 1, tem_falta_estoque: true })] }}
        onReordenar={vi.fn()}
      />
    );

    expect(screen.getByTestId("falta-estoque")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/SequenciaBoard/SequenciaBoard.test.tsx`
Expected: FAIL — `src/components/SequenciaBoard/SequenciaBoard.tsx` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/components/SequenciaBoard/SequenciaCard.tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { ItemProducao } from "../../types/producao";

interface SequenciaCardProps {
  item: ItemProducao;
}

export function SequenciaCard({ item }: SequenciaCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
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
      className={item.is_critico ? "sequencia-card sequencia-card--critico" : "sequencia-card"}
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
    </div>
  );
}
```

```typescript
// frontend/src/components/SequenciaBoard/SequenciaBoard.tsx
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
    <div className="sequencia-board">
      {Object.entries(itensPorPosto).map(([posto, itens]) => (
        <div key={posto} className="sequencia-board__coluna">
          <h3>{posto}</h3>
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/SequenciaBoard/SequenciaBoard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SequenciaBoard
git commit -m "feat: add SequenciaBoard drag-and-drop Kanban component"
```

---

### Task 26: pages/ProgramacaoPatan.tsx

**Files:**
- Create: `frontend/src/pages/ProgramacaoPatan.tsx`
- Test: `frontend/src/pages/ProgramacaoPatan.test.tsx`

**Depends-on:** 20, 21, 22, 23, 25

**Interfaces:**
- Consumes: `useAuth` (Task 22), `SequenciaBoard` (Task 25), `getSequencia`/
  `submitBulkSequencia` (Task 21), `sequenciaReducer`/`initialSequenciaState` (Task 23),
  `Patan`/`BulkSubmitRequest` (Task 20).
- Produces: `ProgramacaoPatan()` page component — linha/turno/patan selectors, loads the
  sequence via `@tanstack/react-query`, renders `SequenciaBoard` wired to the reducer's
  `REORDENAR` action, and a submit button calling `submitBulkSequencia` with every
  currently-held item across all postos. Task 29 (`AppRouter.tsx`) consumes this by this
  exact name, gated to Admin/Programador.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/pages/ProgramacaoPatan.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as authModule from "../auth/AuthContext";
import * as api from "../services/api";
import { ProgramacaoPatan } from "./ProgramacaoPatan";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramacaoPatan />
    </QueryClientProvider>
  );
}

describe("ProgramacaoPatan", () => {
  it("shows a loading state, then the board once the sequence loads", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "L1",
      turno: 1,
      patan: "A",
      itens: [
        {
          id: 1,
          linha: "L1",
          turno: 1,
          patan: "A",
          posto_trabalho: "posto-1",
          status: 2,
          sequencia: 1,
          hora_inicial: "2026-08-24T06:20:00",
          hora_final: "2026-08-24T06:50:00",
          almoco_incluso: false,
          kanbans: 1,
          qtd_por_kanban: 1,
          tempo_por_peca_minutos: 30,
          is_critico: false,
          tem_falta_estoque: false,
        },
      ],
    });

    renderPage();

    expect(screen.getByText("Carregando sequencia...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("posto-1")).toBeInTheDocument());
    expect(screen.getByText("Enviar lote")).toBeInTheDocument();
  });

  it("shows an error message when the sequence fails to load", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockRejectedValue(new Error("network"));

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Erro ao carregar a sequencia.")).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/ProgramacaoPatan.test.tsx`
Expected: FAIL — `src/pages/ProgramacaoPatan.tsx` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/pages/ProgramacaoPatan.tsx
import { useQuery } from "@tanstack/react-query";
import { useReducer, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { SequenciaBoard } from "../components/SequenciaBoard/SequenciaBoard";
import { getSequencia, submitBulkSequencia } from "../services/api";
import { initialSequenciaState, sequenciaReducer } from "../state/sequenciaReducer";
import type { BulkSubmitRequest, Patan } from "../types/producao";

export function ProgramacaoPatan() {
  const { token } = useAuth();
  const [linha, setLinha] = useState("L1");
  const [turno, setTurno] = useState(1);
  const [patan, setPatan] = useState<Patan>("A");
  const [state, dispatch] = useReducer(sequenciaReducer, initialSequenciaState);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { isLoading, isError } = useQuery({
    queryKey: ["sequencia", linha, turno, patan],
    queryFn: async () => {
      if (!token) throw new Error("Nao autenticado.");
      const response = await getSequencia(token, { linha, turno, patan });
      dispatch({
        type: "CARREGAR",
        payload: { turno, dataBase: new Date().toISOString(), itens: response.itens },
      });
      return response;
    },
    enabled: Boolean(token),
  });

  async function handleEnviar() {
    if (!token) return;
    setEnviando(true);
    setErro(null);
    try {
      const itens = Object.values(state.itensPorPosto).flat();
      const payload: BulkSubmitRequest = { linha, turno, patan, itens };
      await submitBulkSequencia(token, payload);
    } catch {
      setErro("Falha ao enviar o lote. Nada foi salvo.");
    } finally {
      setEnviando(false);
    }
  }

  if (isLoading) return <p>Carregando sequencia...</p>;
  if (isError) return <p>Erro ao carregar a sequencia.</p>;

  return (
    <div>
      <h1>Programacao de Patan</h1>
      <label>
        Linha
        <input value={linha} onChange={(event) => setLinha(event.target.value)} />
      </label>
      <label>
        Turno
        <select value={turno} onChange={(event) => setTurno(Number(event.target.value))}>
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>
      <label>
        Patan
        <select value={patan} onChange={(event) => setPatan(event.target.value as Patan)}>
          {["A", "B", "C", "D", "E", "F", "G", "H"].map((letra) => (
            <option key={letra} value={letra}>
              {letra}
            </option>
          ))}
        </select>
      </label>

      <SequenciaBoard
        itensPorPosto={state.itensPorPosto}
        onReordenar={(posto, itens) => dispatch({ type: "REORDENAR", payload: { posto, itens } })}
      />

      {erro && <p role="alert">{erro}</p>}
      <button onClick={handleEnviar} disabled={enviando}>
        {enviando ? "Enviando..." : "Enviar lote"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/ProgramacaoPatan.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ProgramacaoPatan.tsx frontend/src/pages/ProgramacaoPatan.test.tsx
git commit -m "feat: add ProgramacaoPatan page"
```

---

### Task 27: pages/Producao.tsx

**Files:**
- Create: `frontend/src/pages/Producao.tsx`
- Test: `frontend/src/pages/Producao.test.tsx`

**Depends-on:** 20, 21, 22, 23, 25

**Interfaces:**
- Consumes: `useAuth` (Task 22), `SequenciaBoard` (Task 25), `getSequencia` (Task 21),
  `sequenciaReducer`/`initialSequenciaState` (Task 23), `Patan` (Task 20).
- Produces: `Producao()` page component — same data flow as `ProgramacaoPatan` (Task 26)
  but read-only: no submit button ever renders, and `somenteLeitura` is passed to
  `SequenciaBoard` as `role === "usuario_comum"` (see Design Decision 3: this page reads
  the same staging-backed endpoint in Fase 1; a dedicated Tabela B read endpoint is
  deferred). Task 29 (`AppRouter.tsx`) consumes this by this exact name, open to all
  three roles.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/pages/Producao.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as authModule from "../auth/AuthContext";
import * as api from "../services/api";
import { Producao } from "./Producao";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Producao />
    </QueryClientProvider>
  );
}

describe("Producao", () => {
  it("renders the board without a submit button for usuario_comum", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "op",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "L1",
      turno: 1,
      patan: "A",
      itens: [
        {
          id: 1,
          linha: "L1",
          turno: 1,
          patan: "A",
          posto_trabalho: "posto-1",
          status: 2,
          sequencia: 1,
          hora_inicial: "2026-08-24T06:20:00",
          hora_final: "2026-08-24T06:50:00",
          almoco_incluso: false,
          kanbans: 1,
          qtd_por_kanban: 1,
          tempo_por_peca_minutos: 30,
          is_critico: false,
          tem_falta_estoque: false,
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("posto-1")).toBeInTheDocument());
    expect(screen.queryByText("Enviar lote")).not.toBeInTheDocument();
  });

  it("shows an error message when the sequence fails to load", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "op",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockRejectedValue(new Error("network"));

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Erro ao carregar a producao.")).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/Producao.test.tsx`
Expected: FAIL — `src/pages/Producao.tsx` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/pages/Producao.tsx
import { useQuery } from "@tanstack/react-query";
import { useReducer, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { SequenciaBoard } from "../components/SequenciaBoard/SequenciaBoard";
import { getSequencia } from "../services/api";
import { initialSequenciaState, sequenciaReducer } from "../state/sequenciaReducer";
import type { Patan } from "../types/producao";

export function Producao() {
  const { token, role } = useAuth();
  const [linha, setLinha] = useState("L1");
  const [turno, setTurno] = useState(1);
  const [patan, setPatan] = useState<Patan>("A");
  const [state, dispatch] = useReducer(sequenciaReducer, initialSequenciaState);

  const { isLoading, isError } = useQuery({
    queryKey: ["sequencia-producao", linha, turno, patan],
    queryFn: async () => {
      if (!token) throw new Error("Nao autenticado.");
      const response = await getSequencia(token, { linha, turno, patan });
      dispatch({
        type: "CARREGAR",
        payload: { turno, dataBase: new Date().toISOString(), itens: response.itens },
      });
      return response;
    },
    enabled: Boolean(token),
  });

  if (isLoading) return <p>Carregando producao...</p>;
  if (isError) return <p>Erro ao carregar a producao.</p>;

  const somenteLeitura = role === "usuario_comum";

  return (
    <div>
      <h1>Producao</h1>
      <label>
        Linha
        <input value={linha} onChange={(event) => setLinha(event.target.value)} />
      </label>
      <label>
        Turno
        <select value={turno} onChange={(event) => setTurno(Number(event.target.value))}>
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>
      <label>
        Patan
        <select value={patan} onChange={(event) => setPatan(event.target.value as Patan)}>
          {["A", "B", "C", "D", "E", "F", "G", "H"].map((letra) => (
            <option key={letra} value={letra}>
              {letra}
            </option>
          ))}
        </select>
      </label>

      <SequenciaBoard
        itensPorPosto={state.itensPorPosto}
        onReordenar={(posto, itens) => dispatch({ type: "REORDENAR", payload: { posto, itens } })}
        somenteLeitura={somenteLeitura}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/Producao.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Producao.tsx frontend/src/pages/Producao.test.tsx
git commit -m "feat: add read-only Producao page"
```

---

### Task 28: pages/GerenciamentoUsuarios.tsx

**Files:**
- Create: `frontend/src/pages/GerenciamentoUsuarios.tsx`
- Test: `frontend/src/pages/GerenciamentoUsuarios.test.tsx`

**Depends-on:** 21, 22

**Interfaces:**
- Consumes: `useAuth` (Task 22), `listUsers`/`updateUserRole`/`deleteUser`/
  `registerUser`/`UserOut` (Task 21).
- Produces: `GerenciamentoUsuarios()` page component — lists users in a table with an
  inline role `<select>` per row and a Remover button, plus a small create-user form.
  Task 29 (`AppRouter.tsx`) consumes this by this exact name, gated to Admin only.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/pages/GerenciamentoUsuarios.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import * as authModule from "../auth/AuthContext";
import * as api from "../services/api";
import { GerenciamentoUsuarios } from "./GerenciamentoUsuarios";

describe("GerenciamentoUsuarios", () => {
  it("lists users once loaded", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "admin",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listUsers").mockResolvedValue([
      { id: 1, username: "joana", role: "admin" },
      { id: 2, username: "pedro", role: "programador" },
    ]);

    render(<GerenciamentoUsuarios />);

    expect(screen.getByText("Carregando usuarios...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("joana")).toBeInTheDocument());
    expect(screen.getByText("pedro")).toBeInTheDocument();
  });

  it("shows an error message when the user list fails to load", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "admin",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listUsers").mockRejectedValue(new Error("network"));

    render(<GerenciamentoUsuarios />);

    await waitFor(() =>
      expect(screen.getByText("Falha ao carregar usuarios.")).toBeInTheDocument()
    );
  });

  it("removes a user when Remover is clicked", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "admin",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listUsers").mockResolvedValue([{ id: 1, username: "joana", role: "admin" }]);
    const deleteSpy = vi.spyOn(api, "deleteUser").mockResolvedValue();

    render(<GerenciamentoUsuarios />);
    await waitFor(() => expect(screen.getByText("joana")).toBeInTheDocument());

    await userEvent.click(screen.getByText("Remover"));

    expect(deleteSpy).toHaveBeenCalledWith("token123", 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/GerenciamentoUsuarios.test.tsx`
Expected: FAIL — `src/pages/GerenciamentoUsuarios.tsx` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/pages/GerenciamentoUsuarios.tsx
import { useEffect, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { deleteUser, listUsers, registerUser, updateUserRole, type UserOut } from "../services/api";

const ROLES = ["admin", "programador", "usuario_comum"] as const;

export function GerenciamentoUsuarios() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novoUsername, setNovoUsername] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoRole, setNovoRole] = useState<(typeof ROLES)[number]>("usuario_comum");

  async function carregar() {
    if (!token) return;
    setLoading(true);
    try {
      setUsers(await listUsers(token));
      setErro(null);
    } catch {
      setErro("Falha ao carregar usuarios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCriar() {
    if (!token) return;
    await registerUser(token, { username: novoUsername, password: novaSenha, role: novoRole });
    setNovoUsername("");
    setNovaSenha("");
    await carregar();
  }

  async function handleAlterarRole(userId: number, role: string) {
    if (!token) return;
    await updateUserRole(token, userId, role);
    await carregar();
  }

  async function handleRemover(userId: number) {
    if (!token) return;
    await deleteUser(token, userId);
    await carregar();
  }

  if (loading) return <p>Carregando usuarios...</p>;

  return (
    <div>
      <h1>Gerenciamento de Usuarios</h1>
      {erro && <p role="alert">{erro}</p>}

      <table>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.username}</td>
              <td>
                <select
                  value={user.role}
                  onChange={(event) => handleAlterarRole(user.id, event.target.value)}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button onClick={() => handleRemover(user.id)}>Remover</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Novo usuario</h2>
      <input
        placeholder="usuario"
        value={novoUsername}
        onChange={(event) => setNovoUsername(event.target.value)}
      />
      <input
        placeholder="senha"
        type="password"
        value={novaSenha}
        onChange={(event) => setNovaSenha(event.target.value)}
      />
      <select
        value={novoRole}
        onChange={(event) => setNovoRole(event.target.value as (typeof ROLES)[number])}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
      <button onClick={handleCriar}>Criar usuario</button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/GerenciamentoUsuarios.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GerenciamentoUsuarios.tsx frontend/src/pages/GerenciamentoUsuarios.test.tsx
git commit -m "feat: add GerenciamentoUsuarios admin page"
```

---

### Task 29: routes/AppRouter.tsx + wire into App.tsx

**Files:**
- Create: `frontend/src/routes/AppRouter.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Depends-on:** 22, 24, 26, 27, 28

**Interfaces:**
- Consumes: `useAuth`/`AuthProvider` (Task 22), `RequireRole` (Task 24),
  `GerenciamentoUsuarios` (Task 28), `ProgramacaoPatan` (Task 26), `Producao` (Task 27).
- Produces: `AppRouter()` — `BrowserRouter` with routes `/login` (public), `/usuarios`
  (Admin only), `/programacao` (Admin/Programador), `/` (all three roles, `Producao`).
  `App.tsx` now renders `QueryClientProvider > AuthProvider > AppRouter`, replacing the
  Task 19 placeholder. This is the final task — no later task consumes anything from it.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/App.test.tsx  (modify — replaces the Task 19 placeholder assertion)
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as authModule from "./auth/AuthContext";
import App from "./App";

describe("App", () => {
  it("redirects an unauthenticated user to the login screen", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: null,
      username: null,
      role: null,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<App />);

    await waitFor(() => expect(screen.getByPlaceholderText("usuario")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: FAIL — `src/routes/AppRouter.tsx` doesn't exist yet; `App.tsx` still renders
the Task 19 placeholder, so there is no `usuario` placeholder input to find.

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/routes/AppRouter.tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { GerenciamentoUsuarios } from "../pages/GerenciamentoUsuarios";
import { Producao } from "../pages/Producao";
import { ProgramacaoPatan } from "../pages/ProgramacaoPatan";
import { RequireRole } from "./RequireRole";

function LoginPage() {
  const { login } = useAuth();
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await login(String(form.get("username")), String(form.get("password")));
      }}
    >
      <input name="username" placeholder="usuario" />
      <input name="password" type="password" placeholder="senha" />
      <button type="submit">Entrar</button>
    </form>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/usuarios"
          element={
            <RequireRole allowed={["admin"]}>
              <GerenciamentoUsuarios />
            </RequireRole>
          }
        />
        <Route
          path="/programacao"
          element={
            <RequireRole allowed={["admin", "programador"]}>
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

```typescript
// frontend/src/App.tsx  (modify)
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "./auth/AuthContext";
import { AppRouter } from "./routes/AppRouter";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/AppRouter.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: wire role-gated router into App"
```

---

## Execution Handoff

After saving the plan, offer execution choice:

1. **Subagent-Driven (recommended, with this project's parallel-wave override)** —
   dispatch every wave's implementers in one message, controller serializes commits and
   review after each wave. See `.claude/rules/08-parallel-subagent-driven-development.md`.
2. **Inline Execution** — execute tasks in this session using
   `superpowers:executing-plans`, batch execution with checkpoints.
