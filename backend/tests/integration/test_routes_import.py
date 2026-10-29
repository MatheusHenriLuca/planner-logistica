"""Integration tests for the Excel import endpoint (POST /producao/importar-excel)."""
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.deps import get_db
from app.db.session import Base
from app.main import app
from app.models.audit_log import AuditLog
from app.models.colaboracao import ChecklistItem
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
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            ItemProducaoStaging.__table__,
            ItemProducao.__table__,
            ChecklistItem.__table__,
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
    yield TestClient(app), TestingSessionLocal
    app.dependency_overrides.clear()


def _register_and_login(client: TestClient, username: str, role: str, admin_token: str | None = None) -> str:
    headers = {"Authorization": f"Bearer {admin_token}"} if admin_token else {}
    client.post(
        "/auth/register",
        json={"username": username, "password": "password123", "role": role},
        headers=headers,
    )
    login = client.post("/auth/login", data={"username": username, "password": "password123"})
    return login.json()["access_token"]


def _make_mock_items(prefix: str):
    return [
        {
            "material": f"{prefix}_MAT1",
            "linha": "LINHA 1",
            "turno": 1,
            "patan": "A",
            "posto_trabalho": "PT1",
            "kanbans": 5,
            "qtd_por_kanban": 10,
            "tempo_por_peca_minutos": 0.5,
            "demanda": 50.0,
            "saldo_estoque": 100.0,
            "sequencia": 1,
            "status": 2,
            "is_critico": False,
        },
        {
            "material": f"{prefix}_MAT2",
            "linha": "LINHA 1",
            "turno": 1,
            "patan": "A",
            "posto_trabalho": "PT1",
            "kanbans": 2,
            "qtd_por_kanban": 20,
            "tempo_por_peca_minutos": 0.2,
            "demanda": 40.0,
            "saldo_estoque": 80.0,
            "sequencia": 2,
            "status": 2,
            "is_critico": False,
        },
    ]


def test_importar_excel_requires_auth(client):
    test_client, _ = client
    resp = test_client.post("/producao/importar-excel")
    assert resp.status_code == 401


def test_importar_excel_denies_usuario_comum(client):
    test_client, _ = client
    admin_token = _register_and_login(test_client, "admin", "admin")
    comum_token = _register_and_login(test_client, "comum", "usuario_comum", admin_token)

    resp = test_client.post(
        "/producao/importar-excel",
        headers={"Authorization": f"Bearer {comum_token}"},
    )
    assert resp.status_code == 403


def test_importar_excel_file_not_found_returns_404(client):
    test_client, _ = client
    admin_token = _register_and_login(test_client, "admin", "admin")

    with patch("app.api.routes_import.Path.is_file", return_value=False):
        resp = test_client.post(
            "/producao/importar-excel",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 404
    assert "nao encontrado" in resp.json()["detail"]


def test_importar_excel_success_and_isolation_between_programmers(client):
    test_client, SessionLocal = client
    admin_token = _register_and_login(test_client, "admin", "admin")
    prog1_token = _register_and_login(test_client, "prog1", "programador", admin_token)
    prog2_token = _register_and_login(test_client, "prog2", "programador", admin_token)

    # Programador 1 imports
    with patch("app.api.routes_import.Path.is_file", return_value=True), \
         patch("app.services.excel_import._parse_rows", return_value=_make_mock_items("P1")):
        resp1 = test_client.post(
            "/producao/importar-excel",
            headers={"Authorization": f"Bearer {prog1_token}"},
        )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["total_importados"] == 2
    assert data1["resumo_por_linha"] == {"LINHA 1": 2}

    # Programador 2 imports different items
    with patch("app.api.routes_import.Path.is_file", return_value=True), \
         patch("app.services.excel_import._parse_rows", return_value=_make_mock_items("P2")):
        resp2 = test_client.post(
            "/producao/importar-excel",
            headers={"Authorization": f"Bearer {prog2_token}"},
        )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["total_importados"] == 2

    # Verify database state and isolation
    with SessionLocal() as session:
        u1 = session.query(User).filter_by(username="prog1").one()
        u2 = session.query(User).filter_by(username="prog2").one()

        p1_items = session.query(ItemProducaoStaging).filter_by(usuario_id=u1.id).all()
        p2_items = session.query(ItemProducaoStaging).filter_by(usuario_id=u2.id).all()

        assert len(p1_items) == 2
        assert {i.material for i in p1_items} == {"P1_MAT1", "P1_MAT2"}

        assert len(p2_items) == 2
        assert {i.material for i in p2_items} == {"P2_MAT1", "P2_MAT2"}

    # Re-import for prog1 with new items: prog1 is replaced, prog2 stays untouched
    new_items_p1 = [
        {
            "material": "P1_NEW_MAT",
            "linha": "LINHA 2",
            "turno": 2,
            "patan": "B",
            "posto_trabalho": "PT2",
            "kanbans": 1,
            "qtd_por_kanban": 5,
            "tempo_por_peca_minutos": 1.0,
            "demanda": 10.0,
            "saldo_estoque": 20.0,
            "sequencia": 1,
            "status": 2,
            "is_critico": False,
        }
    ]
    with patch("app.api.routes_import.Path.is_file", return_value=True), \
         patch("app.services.excel_import._parse_rows", return_value=new_items_p1):
        resp3 = test_client.post(
            "/producao/importar-excel",
            headers={"Authorization": f"Bearer {prog1_token}"},
        )
    assert resp3.status_code == 200
    assert resp3.json()["total_importados"] == 1

    with SessionLocal() as session:
        u1 = session.query(User).filter_by(username="prog1").one()
        u2 = session.query(User).filter_by(username="prog2").one()

        p1_items = session.query(ItemProducaoStaging).filter_by(usuario_id=u1.id).all()
        p2_items = session.query(ItemProducaoStaging).filter_by(usuario_id=u2.id).all()

        assert len(p1_items) == 1
        assert p1_items[0].material == "P1_NEW_MAT"

        # Prog2 items are intact!
        assert len(p2_items) == 2
        assert {i.material for i in p2_items} == {"P2_MAT1", "P2_MAT2"}


def test_atualizar_sap_requires_auth(client):
    test_client, _ = client
    resp = test_client.post("/producao/atualizar-sap")
    assert resp.status_code == 401


def test_atualizar_sap_denies_usuario_comum(client):
    test_client, _ = client
    admin_token = _register_and_login(test_client, "admin_sap", "admin")
    comum_token = _register_and_login(test_client, "comum_sap", "usuario_comum", admin_token)

    resp = test_client.post(
        "/producao/atualizar-sap",
        headers={"Authorization": f"Bearer {comum_token}"},
    )
    assert resp.status_code == 403


def test_atualizar_sap_success(client):
    from pathlib import Path
    from app.services.sap_service import SapSyncResult

    test_client, SessionLocal = client
    admin_token = _register_and_login(test_client, "admin_sap_ok", "admin")

    mock_sync = SapSyncResult(
        arquivo_path=Path("dummy_sap.xlsx"),
        origem="rede_compartilhada",
        mensagem="Planilha mestre do SAP sincronizada com sucesso a partir da rede interna.",
        data_arquivo="09/10/2026 às 08:30:00",
    )

    with patch("app.api.routes_import.sincronizar_dados_sap", return_value=mock_sync), \
         patch("app.api.routes_import.Path.is_file", return_value=True), \
         patch("app.services.excel_import._parse_rows", return_value=_make_mock_items("SAP")):
        resp = test_client.post(
            "/producao/atualizar-sap?setor=solda",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["sucesso"] is True
    assert data["origem"] == "rede_compartilhada"
    assert data["data_arquivo"] == "09/10/2026 às 08:30:00"
    assert data["total_importados"] == 2
    assert data["resumo_por_linha"] == {"LINHA 1": 2}
