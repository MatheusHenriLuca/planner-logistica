import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.db.session import Base, get_db
from app.main import app
from app.models.audit_log import AuditLog
from app.models.parametro import ParametroSistema
from app.models.perfil import Cargo
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
    Base.metadata.create_all(
        engine, tables=[User.__table__, Cargo.__table__, ParametroSistema.__table__, AuditLog.__table__]
    )
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


@pytest.fixture
def pedro(client, admin_token):
    res = client.post(
        "/auth/register",
        json={"username": "pedro", "password": "s3cret", "role": "usuario_comum"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    user_id = res.json()["id"]
    login = client.post("/auth/login", data={"username": "pedro", "password": "s3cret"})
    return {"id": user_id, "token": login.json()["access_token"]}


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_list_parametros(client, admin_token, pedro):
    # Admin can list parameters
    res = client.get("/parametros", headers=_auth_headers(admin_token))
    assert res.status_code == 200
    chaves = [p["chave"] for p in res.json()]
    assert "bloquear_arraste_producao" in chaves
    assert "cor_destaque_producao" in chaves

    # Non-admin (pedro) can read parameters
    res_pedro = client.get("/parametros", headers=_auth_headers(pedro["token"]))
    assert res_pedro.status_code == 200


def test_update_parametro(client, admin_token, pedro):
    # Non-admin cannot update parameter
    res_pedro = client.patch(
        "/parametros/bloquear_arraste_producao",
        json={"valor": "false"},
        headers=_auth_headers(pedro["token"]),
    )
    assert res_pedro.status_code == 403

    # Admin can update parameter
    res = client.patch(
        "/parametros/bloquear_arraste_producao",
        json={"valor": "false"},
        headers=_auth_headers(admin_token),
    )
    assert res.status_code == 200
    assert res.json()["valor"] == "false"


def test_cargos_crud(client, admin_token, pedro):
    # List cargos includes default system cargos
    res = client.get("/cargos", headers=_auth_headers(admin_token))
    assert res.status_code == 200
    nomes = [c["nome"] for c in res.json()]
    assert "admin" in nomes
    assert "programador" in nomes
    assert "usuario_comum" in nomes

    # Create new cargo as admin
    novo_cargo = {
        "nome": "supervisor",
        "descricao": "Supervisor de Linha",
        "pode_programar": False,
        "pode_iniciar_producao": True,
        "pode_reordenar_producao": False,
        "pode_mover_colunas": True,
        "pode_gerenciar_colunas": False,
        "pode_ver_historico": True,
        "pode_gerenciar_usuarios": False,
        "pode_importar_sap": False,
        "pode_configurar_parametros": False,
    }
    res_create = client.post("/cargos", json=novo_cargo, headers=_auth_headers(admin_token))
    assert res_create.status_code == 201
    cargo_id = res_create.json()["id"]
    assert res_create.json()["nome"] == "supervisor"
    assert res_create.json()["pode_ver_historico"] is True

    # Update cargo permissions
    res_update = client.patch(
        f"/cargos/{cargo_id}",
        json={"pode_reordenar_producao": True},
        headers=_auth_headers(admin_token),
    )
    assert res_update.status_code == 200
    assert res_update.json()["pode_reordenar_producao"] is True

    # Cannot delete system cargo (admin)
    admin_cargo = next(c for c in res.json() if c["nome"] == "admin")
    res_del_system = client.delete(f"/cargos/{admin_cargo['id']}", headers=_auth_headers(admin_token))
    assert res_del_system.status_code == 400

    # Delete custom cargo
    res_del = client.delete(f"/cargos/{cargo_id}", headers=_auth_headers(admin_token))
    assert res_del.status_code == 204
