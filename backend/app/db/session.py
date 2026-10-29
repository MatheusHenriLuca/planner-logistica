from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


@lru_cache
def _get_engine():
    settings = get_settings()
    if settings.database_url.startswith("sqlite"):
        return create_engine(settings.database_url)

    # Configuração de pool de alta concorrência para PostgreSQL em produção (20-50 conexões simultâneas)
    return create_engine(
        settings.database_url,
        pool_size=25,
        max_overflow=25,
        pool_timeout=30,
        pool_pre_ping=True,
        pool_recycle=1800,
    )


@lru_cache
def _get_session_local():
    return sessionmaker(autocommit=False, autoflush=False, bind=_get_engine())


def __getattr__(name: str):
    # engine/SessionLocal are built lazily on first access, not at import time,
    # so DATABASE_URL can still be set (e.g. monkeypatch in tests) before first use.
    if name == "engine":
        return _get_engine()
    if name == "SessionLocal":
        return _get_session_local()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def get_db() -> Generator[Session, None, None]:
    db = _get_session_local()()
    try:
        yield db
    finally:
        db.close()
