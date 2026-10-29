import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.db.session import Base, get_db
from app.main import app
from app.models.audit_log import AuditLog
from app.models.perfil import Cargo
from app.models.producao import ItemProducao, LinhaProducao
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
        engine,
        tables=[
            User.__table__,
            Cargo.__table__,
            LinhaProducao.__table__,
            ItemProducao.__table__,
            AuditLog.__table__,
        ],
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
        "/auth/register", json={"username": "admin_user", "password": "s3cret", "role": "admin"}
    )
    login = client.post("/auth/login", data={"username": "admin_user", "password": "s3cret"})
    return login.json()["access_token"]


@pytest.fixture
def comum_token(client, admin_token):
    client.post(
        "/auth/register",
        json={"username": "comum_user", "password": "s3cret", "role": "usuario_comum"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    login = client.post("/auth/login", data={"username": "comum_user", "password": "s3cret"})
    return login.json()["access_token"]


def test_linhas_seed_and_list(client, admin_token):
    # Ao listar pela primeira vez, deve rodar o seed com 6 linhas padrão
    res = client.get("/linhas", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    linhas = res.json()
    assert len(linhas) == 6

    # Filtrar por setor solda
    res_solda = client.get(
        "/linhas?setor=solda", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_solda.status_code == 200
    linhas_solda = res_solda.json()
    assert len(linhas_solda) == 3
    nomes_solda = [l["nome"] for l in linhas_solda]
    assert "LINHA 1" in nomes_solda
    assert "LINHA 2" in nomes_solda
    assert "LINHA 3" in nomes_solda

    # Filtrar por setor estamparia
    res_estamparia = client.get(
        "/linhas?setor=estamparia", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_estamparia.status_code == 200
    linhas_estamparia = res_estamparia.json()
    assert len(linhas_estamparia) == 3
    nomes_estamparia = [l["nome"] for l in linhas_estamparia]
    assert "LINHA 1" in nomes_estamparia
    assert "LINHA 3" in nomes_estamparia
    assert "LINHA 4" in nomes_estamparia


def test_criar_e_remover_linha(client, admin_token, comum_token):
    # Usuário comum não pode criar
    res_deny = client.post(
        "/linhas",
        json={"nome": "LINHA 5", "setor": "solda", "descricao": "Nova célula"},
        headers={"Authorization": f"Bearer {comum_token}"},
    )
    assert res_deny.status_code == 403

    # Admin pode criar
    res_create = client.post(
        "/linhas",
        json={"nome": "LINHA 5", "setor": "solda", "descricao": "Nova célula"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_create.status_code == 201
    linha_id = res_create.json()["id"]
    assert res_create.json()["nome"] == "LINHA 5"
    assert res_create.json()["setor"] == "solda"

    # Duplicata no mesmo setor é rejeitada com 409 Conflict
    res_dup = client.post(
        "/linhas",
        json={"nome": "LINHA 5", "setor": "solda"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_dup.status_code == 409

    # Mesma linha em outro setor é permitida (ex: LINHA 5 em estamparia)
    res_other_setor = client.post(
        "/linhas",
        json={"nome": "LINHA 5", "setor": "estamparia"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_other_setor.status_code == 201

    # Remover linha
    res_del = client.delete(f"/linhas/{linha_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_del.status_code == 204

    # Verificar que foi removida
    res_list = client.get(
        "/linhas?setor=solda", headers={"Authorization": f"Bearer {admin_token}"}
    )
    nomes_solda = [l["nome"] for l in res_list.json()]
    assert "LINHA 5" not in nomes_solda


def test_limpar_producao_admin_only(client, admin_token, comum_token):
    # Testar negação para usuário comum
    res_deny = client.delete(
        "/producao/limpar-producao?linha=LINHA 1&setor=solda",
        headers={"Authorization": f"Bearer {comum_token}"},
    )
    assert res_deny.status_code == 403

    # Testar sucesso para admin
    res_clean = client.delete(
        "/producao/limpar-producao?linha=LINHA 1&setor=solda",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_clean.status_code == 200
    assert "itens_removidos" in res_clean.json()
