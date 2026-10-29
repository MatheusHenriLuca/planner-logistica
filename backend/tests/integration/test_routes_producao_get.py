import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.db.session import Base, get_db
from app.main import app
from app.models.parametro import ParametroSistema
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
            ParametroSistema.__table__,
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


def _programador_token(client: TestClient) -> str:
    client.post(
        "/auth/register", json={"username": "admin", "password": "s3cret", "role": "admin"}
    )
    login = client.post("/auth/login", data={"username": "admin", "password": "s3cret"})
    admin_token = login.json()["access_token"]
    client.post(
        "/auth/register",
        json={"username": "prog", "password": "s3cret", "role": "programador"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    login = client.post("/auth/login", data={"username": "prog", "password": "s3cret"})
    return login.json()["access_token"]


def _admin_token(client: TestClient) -> str:
    """Requires _programador_token (or equivalent bootstrap) to have run first."""
    login = client.post("/auth/login", data={"username": "admin", "password": "s3cret"})
    return login.json()["access_token"]


def _comum_token(client: TestClient) -> str:
    """Requires an admin to already exist (registration after bootstrap needs one)."""
    admin_token = _admin_token(client)
    client.post(
        "/auth/register",
        json={"username": "comum2", "password": "s3cret", "role": "usuario_comum"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    login = client.post("/auth/login", data={"username": "comum2", "password": "s3cret"})
    return login.json()["access_token"]


def test_get_sequencia_computes_cascade_and_includes_pecas_criticas(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    with SessionLocal() as session:
        user_id = session.query(User).filter_by(username="prog").one().id
        session.add_all([
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT1",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=2, qtd_por_kanban=5, tempo_por_peca_minutos=1,
                demanda=100, saldo_estoque=50, is_critico=False,
            ),
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT2",
                linha="L1", turno=1, patan="B", posto_trabalho="posto-1", status=3,
                sequencia=0, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=10, saldo_estoque=10, is_critico=True,
            ),
        ])
        session.commit()

    response = test_client.get(
        "/producao/sequencia",
        params={"linha": "L1", "turno": 1, "patan": "A"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["itens"][0]["hora_inicial"] == "2026-08-24T06:20:00" or "T06:20:00" in body["itens"][0]["hora_inicial"]
    assert any(item["is_critico"] for item in body["itens"])
    falta = next(item for item in body["itens"] if not item["is_critico"])
    assert falta["tem_falta_estoque"] is True
    critico = next(item for item in body["itens"] if item["is_critico"])
    assert critico["hora_inicial"] is None  # CRITICO is quarantined, never scheduled


def test_get_sequencia_cascade_chains_across_items_in_same_posto(client):
    # Regression guard: the route must feed the whole per-posto queue to
    # calcular_cascata together, not recompute each item independently from
    # the shift start - otherwise item 2 would wrongly also start at 06:20.
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    with SessionLocal() as session:
        user_id = session.query(User).filter_by(username="prog").one().id
        session.add_all([
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT1",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=1, qtd_por_kanban=10, tempo_por_peca_minutos=1,
                demanda=5, saldo_estoque=10, is_critico=False,
            ),
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT2",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=2, kanbans=1, qtd_por_kanban=20, tempo_por_peca_minutos=1,
                demanda=5, saldo_estoque=10, is_critico=False,
            ),
        ])
        session.commit()

    response = test_client.get(
        "/producao/sequencia",
        params={"linha": "L1", "turno": 1, "patan": "A"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    itens = sorted(response.json()["itens"], key=lambda i: i["sequencia"])
    assert itens[0]["hora_inicial"].endswith("T06:20:00")
    assert itens[0]["hora_final"].endswith("T06:30:00")
    assert itens[1]["hora_inicial"] == itens[0]["hora_final"]
    assert itens[1]["tem_falta_estoque"] is False


def test_get_sequencia_does_not_leak_other_scopes(client):
    # Regression guard for the legacy unscoped-operation bug: every dimension
    # of (linha, turno, patan) must independently exclude non-matching rows.
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    with SessionLocal() as session:
        user_id = session.query(User).filter_by(username="prog").one().id
        session.add_all([
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT1",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=1, saldo_estoque=1, is_critico=False,
            ),
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT2",
                linha="L2", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=1, saldo_estoque=1, is_critico=False,
            ),
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT3",
                linha="L1", turno=2, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=1, saldo_estoque=1, is_critico=False,
            ),
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT4",
                linha="L1", turno=1, patan="B", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=1, saldo_estoque=1, is_critico=False,
            ),
        ])
        session.commit()

    response = test_client.get(
        "/producao/sequencia",
        params={"linha": "L1", "turno": 1, "patan": "A"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    itens = response.json()["itens"]
    assert len(itens) == 1
    assert itens[0]["linha"] == "L1"
    assert itens[0]["turno"] == 1
    assert itens[0]["patan"] == "A"


def test_get_sequencia_deduplicates_critico_item_in_queried_scope(client):
    # A CRITICO item that happens to belong to the exact queried scope is
    # matched by both get_staging_itens (status != EXCLUIDO) and
    # get_pecas_criticas_by_linha (status == CRITICO, linha only) - it must
    # still appear exactly once in the response, never twice.
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    with SessionLocal() as session:
        user_id = session.query(User).filter_by(username="prog").one().id
        session.add(
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT1",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=3,
                sequencia=0, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=1, saldo_estoque=1, is_critico=True,
            )
        )
        session.commit()

    response = test_client.get(
        "/producao/sequencia",
        params={"linha": "L1", "turno": 1, "patan": "A"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert len(response.json()["itens"]) == 1


def test_get_sequencia_handles_duplicate_sequencia_zero_independently(client):
    # Regression guard for I2: an unsequenced SAP dump gives every NORMAL row
    # sequencia=0 (server_default). Looking up cascade results by sequencia
    # in a dict would collapse all of them onto the LAST computed window, and
    # would wrongly hand a CRITICO row at sequencia=0 a schedule too. Each
    # NORMAL row must get its OWN distinct window, and CRITICO must stay
    # unscheduled regardless of sharing sequencia=0 with NORMAL rows.
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    with SessionLocal() as session:
        user_id = session.query(User).filter_by(username="prog").one().id
        session.add_all([
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT1",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=0, kanbans=1, qtd_por_kanban=10, tempo_por_peca_minutos=1,
                demanda=5, saldo_estoque=10, is_critico=False,
            ),
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT2",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=0, kanbans=1, qtd_por_kanban=20, tempo_por_peca_minutos=1,
                demanda=5, saldo_estoque=10, is_critico=False,
            ),
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT3",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=3,
                sequencia=0, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=1, saldo_estoque=1, is_critico=True,
            ),
        ])
        session.commit()

    response = test_client.get(
        "/producao/sequencia",
        params={"linha": "L1", "turno": 1, "patan": "A"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    itens = response.json()["itens"]
    normais = [i for i in itens if not i["is_critico"]]
    criticos = [i for i in itens if i["is_critico"]]

    assert len(normais) == 2
    janelas = {(i["hora_inicial"], i["hora_final"]) for i in normais}
    assert len(janelas) == 2  # each NORMAL row got its own distinct window

    assert len(criticos) == 1
    assert criticos[0]["hora_inicial"] is None
    assert criticos[0]["hora_final"] is None


def test_get_sequencia_allows_usuario_comum(client):
    test_client, SessionLocal = client
    _programador_token(test_client)
    token = _comum_token(test_client)

    with SessionLocal() as session:
        user_id = session.query(User).filter_by(username="comum2").one().id
        session.add(
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT1",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=1, saldo_estoque=1, is_critico=False,
            )
        )
        session.commit()

    response = test_client.get(
        "/producao/sequencia",
        params={"linha": "L1", "turno": 1, "patan": "A"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200


def test_get_sequencia_sugestoes_outros_turnos(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    with SessionLocal() as session:
        user_id = session.query(User).filter_by(username="prog").one().id
        # Adiciona item no Turno 2 para Patan O1 na Linha 1 no setor estamparia
        session.add(
            ItemProducaoStaging(
                usuario_id=user_id,
                setor="estamparia",
                material="MAT-O1",
                linha="LINHA 1",
                turno=2,
                patan="O1",
                posto_trabalho="PR-82",
                status=2,
                sequencia=1,
                kanbans=5,
                qtd_por_kanban=10,
                tempo_por_peca_minutos=0.5,
                demanda=50,
                saldo_estoque=100,
                is_critico=False,
            )
        )
        session.commit()

    # Consulta no Turno 1 (onde não há itens)
    response = test_client.get(
        "/producao/sequencia",
        params={"linha": "LINHA 1", "turno": 1, "patan": "O1", "setor": "estamparia"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["itens"]) == 0
    sugestoes = data.get("sugestoes_outros_turnos", [])
    assert len(sugestoes) >= 1
    assert any(s["turno"] == 2 and s["linha"] == "LINHA 1" and s["total"] == 1 for s in sugestoes)


def test_get_resumo_patans(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    with SessionLocal() as session:
        user_id = session.query(User).filter_by(username="prog").one().id
        session.add_all([
            ItemProducaoStaging(
                usuario_id=user_id,
                setor="estamparia",
                material="MAT-L1",
                linha="LINHA 1",
                turno=2,
                patan="L1",
                posto_trabalho="PR-84",
                status=2,
                sequencia=1,
                kanbans=2,
                qtd_por_kanban=10,
                tempo_por_peca_minutos=0.5,
                demanda=20,
                saldo_estoque=50,
                is_critico=False,
            ),
            ItemProducaoStaging(
                usuario_id=user_id,
                setor="solda",
                material="MAT-A",
                linha="LINHA 1",
                turno=1,
                patan="A",
                posto_trabalho="PONTE 23",
                status=2,
                sequencia=1,
                kanbans=2,
                qtd_por_kanban=10,
                tempo_por_peca_minutos=0.5,
                demanda=20,
                saldo_estoque=50,
                is_critico=False,
            ),
        ])
        session.commit()

    # Testa setor estamparia
    response_est = test_client.get(
        "/producao/resumo-patans?setor=estamparia",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response_est.status_code == 200
    dados_est = response_est.json()
    assert "L1" in dados_est
    assert any(item["linha"] == "LINHA 1" and item["turno"] == 2 and item["total"] == 1 for item in dados_est["L1"])

    # Testa setor solda
    response_solda = test_client.get(
        "/producao/resumo-patans?setor=solda",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response_solda.status_code == 200
    dados_solda = response_solda.json()
    assert "A" in dados_solda
    assert any(item["linha"] == "LINHA 1" and item["turno"] == 1 and item["total"] == 1 for item in dados_solda["A"])

