import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

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


def test_engine_and_session_local_are_importable_singletons():
    from app.db.session import SessionLocal, engine
    from app.db.session import SessionLocal as session_local2
    from app.db.session import engine as engine2

    assert isinstance(engine, Engine)
    assert isinstance(SessionLocal, sessionmaker)
    assert engine is engine2
    assert SessionLocal is session_local2
