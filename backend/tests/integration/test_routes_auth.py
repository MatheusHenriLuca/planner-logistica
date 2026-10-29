import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
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


def test_registration_with_non_admin_token_is_forbidden(client):
    client.post(
        "/auth/register", json={"username": "joana", "password": "s3cret", "role": "admin"}
    )
    admin_login = client.post("/auth/login", data={"username": "joana", "password": "s3cret"})
    admin_token = admin_login.json()["access_token"]

    client.post(
        "/auth/register",
        json={"username": "pedro", "password": "s3cret", "role": "usuario_comum"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    pedro_login = client.post("/auth/login", data={"username": "pedro", "password": "s3cret"})
    pedro_token = pedro_login.json()["access_token"]

    # pedro is not an admin: must not be able to register anyone, let alone
    # self-assign an elevated role via the payload's `role` field.
    response = client.post(
        "/auth/register",
        json={"username": "invasor", "password": "s3cret", "role": "admin"},
        headers={"Authorization": f"Bearer {pedro_token}"},
    )
    assert response.status_code == 403


def test_duplicate_username_registration_returns_409(client):
    # Regression guard for I5: users.username has a unique index - a
    # duplicate registration must return a clean 409 with a clear message,
    # never an unhandled 500 stack trace.
    client.post(
        "/auth/register", json={"username": "joana", "password": "s3cret", "role": "admin"}
    )
    login = client.post("/auth/login", data={"username": "joana", "password": "s3cret"})
    admin_token = login.json()["access_token"]

    response = client.post(
        "/auth/register",
        json={"username": "joana", "password": "outra-senha", "role": "programador"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 409


def test_login_rejects_wrong_password(client):
    client.post(
        "/auth/register", json={"username": "joana", "password": "s3cret", "role": "admin"}
    )

    response = client.post("/auth/login", data={"username": "joana", "password": "wrong"})
    assert response.status_code == 401
