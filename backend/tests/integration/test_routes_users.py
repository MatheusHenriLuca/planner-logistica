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


@pytest.fixture
def admin_token(client):
    client.post(
        "/auth/register", json={"username": "joana", "password": "s3cret", "role": "admin"}
    )
    login = client.post("/auth/login", data={"username": "joana", "password": "s3cret"})
    return login.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def pedro(client, admin_token):
    """A registered non-admin user (usuario_comum) plus their login token."""
    create = client.post(
        "/auth/register",
        json={"username": "pedro", "password": "s3cret", "role": "usuario_comum"},
        headers=_auth_headers(admin_token),
    )
    login = client.post("/auth/login", data={"username": "pedro", "password": "s3cret"})
    return {"id": create.json()["id"], "token": login.json()["access_token"]}


def test_list_users_requires_admin(client, admin_token, pedro):
    response = client.get("/users", headers=_auth_headers(admin_token))

    assert response.status_code == 200
    usernames = {u["username"] for u in response.json()}
    assert usernames == {"joana", "pedro"}


def test_list_users_denies_non_admin(client, pedro):
    response = client.get("/users", headers=_auth_headers(pedro["token"]))

    assert response.status_code == 403


def test_update_user_role(client, admin_token, pedro):
    response = client.patch(
        f"/users/{pedro['id']}/role",
        json={"role": "programador"},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 200
    assert response.json()["role"] == "programador"


def test_update_user_role_denies_non_admin(client, pedro):
    response = client.patch(
        f"/users/{pedro['id']}/role",
        json={"role": "programador"},
        headers=_auth_headers(pedro["token"]),
    )

    assert response.status_code == 403


def test_update_user_role_rejects_self_demotion(client, admin_token):
    listed = client.get("/users", headers=_auth_headers(admin_token)).json()
    admin_id = listed[0]["id"]  # only joana (the admin) is registered at this point

    response = client.patch(
        f"/users/{admin_id}/role",
        json={"role": "programador"},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 400
    still_admin = client.get("/users", headers=_auth_headers(admin_token)).json()[0]
    assert still_admin["role"] == "admin"


def test_update_user_role_missing_user_returns_404(client, admin_token):
    response = client.patch(
        "/users/9999/role", json={"role": "programador"}, headers=_auth_headers(admin_token)
    )
    assert response.status_code == 404


def test_update_user_role_rejects_invalid_role_value(client, admin_token, pedro):
    response = client.patch(
        f"/users/{pedro['id']}/role",
        json={"role": "super_admin"},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 422


def test_delete_user(client, admin_token, pedro):
    response = client.delete(f"/users/{pedro['id']}", headers=_auth_headers(admin_token))
    assert response.status_code == 204

    listed = client.get("/users", headers=_auth_headers(admin_token))
    assert all(u["id"] != pedro["id"] for u in listed.json())


def test_delete_user_denies_non_admin(client, pedro):
    response = client.delete(f"/users/{pedro['id']}", headers=_auth_headers(pedro["token"]))

    assert response.status_code == 403


def test_delete_user_missing_user_returns_404(client, admin_token):
    response = client.delete("/users/9999", headers=_auth_headers(admin_token))
    assert response.status_code == 404


def test_delete_user_rejects_self_delete(client, admin_token):
    listed = client.get("/users", headers=_auth_headers(admin_token)).json()
    admin_id = listed[0]["id"]  # only joana (the admin) is registered at this point

    response = client.delete(f"/users/{admin_id}", headers=_auth_headers(admin_token))

    assert response.status_code == 400
    still_listed = client.get("/users", headers=_auth_headers(admin_token)).json()
    assert any(u["id"] == admin_id for u in still_listed)
