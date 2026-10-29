"""Integration tests for the Patan Teórico endpoint (GET /producao/patan-teorico)."""

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


def _auth_token(client: TestClient) -> str:
    client.post(
        "/auth/register",
        json={"username": "user_patan", "password": "password123", "role": "admin"},
    )
    login = client.post("/auth/login", data={"username": "user_patan", "password": "password123"})
    return login.json()["access_token"]


def test_obter_patan_teorico_requires_auth(client):
    resp = client.get("/producao/patan-teorico")
    assert resp.status_code == 401


def test_obter_patan_teorico_success(client):
    token = _auth_token(client)
    resp = client.get(
        "/producao/patan-teorico?setor=estamparia&linha=LINHA 1&patan=A&turno=1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["setor"] == "estamparia"
    assert data["linha"] == "LINHA 1"
    assert data["patan"] == "A"
    assert "maquinas" in data
    assert len(data["maquinas"]) > 0

    primeira_maq = data["maquinas"][0]
    assert "prensa" in primeira_maq
    assert "tempo_total_minutos" in primeira_maq
    assert "itens" in primeira_maq
    assert len(primeira_maq["itens"]) > 0

    primeiro_item = primeira_maq["itens"][0]
    assert "sequencia" in primeiro_item
    assert "numero_produto" in primeiro_item
    assert "tempo_producao_min" in primeiro_item
    assert "hora_inicio_estimada" in primeiro_item
    assert "hora_fim_estimada" in primeiro_item
