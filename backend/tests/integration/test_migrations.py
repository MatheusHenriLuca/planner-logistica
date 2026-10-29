import os

from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command
from app.core.config import get_settings


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


def test_alembic_upgrade_head_falls_back_to_settings_when_ini_has_no_url(
    tmp_path, monkeypatch
):
    # Regression guard for C3: alembic.ini defines no sqlalchemy.url (real
    # state of the file on disk). Deliberately do NOT call
    # cfg.set_main_option("sqlalchemy.url", ...) here, unlike the test above -
    # env.py must fall back to app.core.config.get_settings().database_url on
    # its own, or this raises KeyError: 'url' before ever reaching a table.
    db_path = tmp_path / "fallback.db"
    database_url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    get_settings.cache_clear()

    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")

    engine = create_engine(database_url)
    tables = inspect(engine).get_table_names()

    assert "users" in tables
    assert "producao_staging" in tables
    assert "producao" in tables

    get_settings.cache_clear()
