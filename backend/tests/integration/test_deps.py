import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
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


def test_get_current_user_rejects_expired_token(db_session):
    db_session.add(User(username="joana", hashed_password="x", role=Role.ADMIN.value))
    db_session.commit()

    token = create_access_token(subject="joana", role=Role.ADMIN.value, expires_minutes=-1)
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token=token, db=db_session)
    assert exc_info.value.status_code == 401


def test_get_current_user_rejects_token_for_unknown_user(db_session):
    token = create_access_token(subject="fantasma", role=Role.ADMIN.value)
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token=token, db=db_session)
    assert exc_info.value.status_code == 401


def test_get_current_user_rejects_when_db_lookup_fails(db_session, monkeypatch):
    token = create_access_token(subject="joana", role=Role.ADMIN.value)

    def _raise_db_error(*args, **kwargs):
        raise SQLAlchemyError("conexao perdida")

    monkeypatch.setattr(db_session, "query", _raise_db_error)

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token=token, db=db_session)
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


def test_require_role_allows_any_of_multiple_roles(db_session):
    db_session.add(User(username="pedro", hashed_password="x", role=Role.PROGRAMADOR.value))
    db_session.commit()
    user = db_session.query(User).filter_by(username="pedro").one()

    dependency = require_role(Role.ADMIN, Role.PROGRAMADOR)
    assert dependency(current_user=user) is user
