import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.db.session import Base, get_db
from app.main import app
from app.models.audit_log import AuditLog
from app.models.colaboracao import ChecklistItem
from app.models.ferramentaria import ManutencaoFerramenta
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
            ManutencaoFerramenta.__table__,
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


def test_submeter_sequencia_is_scoped_all_or_nothing(client):
    test_client, _ = client
    token = _programador_token(test_client)

    payload = {
        "linha": "L1", "turno": 1, "patan": "A",
        "itens": [
            {
                "id": None, "linha": "L1", "turno": 1, "patan": "A",
                "posto_trabalho": "posto-1", "status": 2, "sequencia": 1,
                "kanbans": 2, "qtd_por_kanban": 5, "tempo_por_peca_minutos": 1,
            }
        ],
    }

    response = test_client.post(
        "/producao/sequencia", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 201
    assert len(response.json()) == 1


def test_submeter_sequencia_rejects_item_scope_mismatch(client):
    # Security regression guard: bulk_persist scopes its delete/read by the
    # request's top-level linha/turno/patan but writes each item using the
    # item's OWN linha/turno/patan - an item that diverges from the
    # request's declared scope must be rejected outright, never silently
    # written into a different (linha, turno, patan)'s plan.
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    payload = {
        "linha": "L1", "turno": 1, "patan": "A",
        "itens": [
            {
                "id": None, "linha": "L9", "turno": 3, "patan": "H",
                "posto_trabalho": "posto-1", "status": 2, "sequencia": 1,
                "kanbans": 1, "qtd_por_kanban": 1, "tempo_por_peca_minutos": 1,
            }
        ],
    }

    response = test_client.post(
        "/producao/sequencia", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 422
    with SessionLocal() as session:
        assert session.query(ItemProducao).count() == 0


def test_submeter_sequencia_clears_matching_staging_rows(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    with SessionLocal() as session:
        user_id = session.query(User).filter_by(username="prog").one().id
        session.add(
            ItemProducaoStaging(
                usuario_id=user_id, material="MAT1",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=1, saldo_estoque=1, is_critico=False,
            )
        )
        session.commit()

    payload = {
        "linha": "L1", "turno": 1, "patan": "A",
        "itens": [
            {
                "id": None, "linha": "L1", "turno": 1, "patan": "A",
                "posto_trabalho": "posto-1", "status": 2, "sequencia": 1,
                "kanbans": 2, "qtd_por_kanban": 5, "tempo_por_peca_minutos": 1,
            }
        ],
    }

    response = test_client.post(
        "/producao/sequencia", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 201
    with SessionLocal() as session:
        restantes = (
            session.query(ItemProducaoStaging).filter_by(linha="L1", turno=1, patan="A").count()
        )
        # Itens normais são preservados como receita do Patan para permitir programações futuras
        assert restantes == 1


def test_submeter_sequencia_accepts_critico_with_different_turno_patan(client):
    # Criticos sao carregados por linha inteira (get_pecas_criticas_by_linha
    # nao filtra por turno/patan) - podem legitimamente ter turno/patan
    # diferente da tela que esta enviando o lote.
    test_client, _ = client
    token = _programador_token(test_client)

    payload = {
        "linha": "L1", "turno": 1, "patan": "A",
        "itens": [
            {
                "id": None, "linha": "L1", "turno": 2, "patan": "B",
                "posto_trabalho": "posto-1", "status": 3, "sequencia": 0,
                "kanbans": 1, "qtd_por_kanban": 1, "tempo_por_peca_minutos": 1,
            }
        ],
    }

    response = test_client.post(
        "/producao/sequencia", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 201
    assert response.json()[0]["turno"] == 2
    assert response.json()[0]["patan"] == "B"


def test_submeter_sequencia_rejects_non_critico_with_different_turno_patan_same_linha(client):
    test_client, _ = client
    token = _programador_token(test_client)

    payload = {
        "linha": "L1", "turno": 1, "patan": "A",
        "itens": [
            {
                "id": None, "linha": "L1", "turno": 2, "patan": "B",
                "posto_trabalho": "posto-1", "status": 2, "sequencia": 1,
                "kanbans": 1, "qtd_por_kanban": 1, "tempo_por_peca_minutos": 1,
            }
        ],
    }

    response = test_client.post(
        "/producao/sequencia", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 422


def test_submeter_sequencia_allows_admin(client):
    test_client, _ = client
    _programador_token(test_client)
    token = _admin_token(test_client)

    payload = {
        "linha": "L1", "turno": 1, "patan": "A",
        "itens": [
            {
                "id": None, "linha": "L1", "turno": 1, "patan": "A",
                "posto_trabalho": "posto-1", "status": 2, "sequencia": 1,
                "kanbans": 1, "qtd_por_kanban": 1, "tempo_por_peca_minutos": 1,
            }
        ],
    }

    response = test_client.post(
        "/producao/sequencia", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 201


def test_submeter_sequencia_denies_usuario_comum(client):
    test_client, _ = client
    _programador_token(test_client)  # ensures an admin exists to create the next user
    admin_login = test_client.post("/auth/login", data={"username": "admin", "password": "s3cret"})
    admin_token = admin_login.json()["access_token"]
    test_client.post(
        "/auth/register",
        json={"username": "comum", "password": "s3cret", "role": "usuario_comum"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    login = test_client.post("/auth/login", data={"username": "comum", "password": "s3cret"})
    comum_token = login.json()["access_token"]

    response = test_client.post(
        "/producao/sequencia",
        json={"linha": "L1", "turno": 1, "patan": "A", "itens": []},
        headers={"Authorization": f"Bearer {comum_token}"},
    )

    assert response.status_code == 403


def test_submeter_sequencia_is_all_or_nothing_on_failure(client, monkeypatch):
    # Regression guard for "envio em lote tudo-ou-nada": if persistence fails
    # partway, nothing from this submission may remain in Tabela B. Uses a
    # genuine SQLAlchemyError (a real DB-layer failure) rather than a bare
    # RuntimeError, since I7 narrows the route's handler to catch only
    # SQLAlchemyError - see test_submeter_sequencia_unexpected_error_is_not_swallowed
    # below for the complementary guard on a truly unexpected bug.
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    import app.api.routes_producao as routes_producao_module

    def _falha(db, *args, **kwargs):
        # Actually write (flush) a row before failing, so the "0 rows after
        # failure" assertion below proves rollback discarded a real,
        # already-flushed-but-uncommitted row - not just that nothing was
        # ever added in the first place.
        db.add(
            ItemProducao(
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                is_critico=False, em_producao=False,
            )
        )
        db.flush()
        raise SQLAlchemyError("falha simulada")

    monkeypatch.setattr(routes_producao_module, "bulk_persist", _falha)

    payload = {
        "linha": "L1", "turno": 1, "patan": "A",
        "itens": [
            {
                "id": None, "linha": "L1", "turno": 1, "patan": "A",
                "posto_trabalho": "posto-1", "status": 2, "sequencia": 1,
                "kanbans": 2, "qtd_por_kanban": 5, "tempo_por_peca_minutos": 1,
            }
        ],
    }

    response = test_client.post(
        "/producao/sequencia", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 422
    with SessionLocal() as session:
        assert session.query(ItemProducao).filter_by(linha="L1").count() == 0


def test_submeter_sequencia_unexpected_error_is_not_swallowed(client, monkeypatch):
    # Regression guard for I7: a genuine unexpected bug (not a DB failure)
    # must propagate as an unhandled error - surfacing as a 500 visible in
    # logs/monitoring - never get silently flattened into the bulk-submit's
    # 422 "invalid data" response.
    test_client, _ = client
    token = _programador_token(test_client)

    import app.api.routes_producao as routes_producao_module

    def _bug(db, *args, **kwargs):
        raise RuntimeError("bug inesperado")

    monkeypatch.setattr(routes_producao_module, "bulk_persist", _bug)

    payload = {
        "linha": "L1", "turno": 1, "patan": "A",
        "itens": [
            {
                "id": None, "linha": "L1", "turno": 1, "patan": "A",
                "posto_trabalho": "posto-1", "status": 2, "sequencia": 1,
                "kanbans": 1, "qtd_por_kanban": 1, "tempo_por_peca_minutos": 1,
            }
        ],
    }

    with pytest.raises(RuntimeError, match="bug inesperado"):
        test_client.post(
            "/producao/sequencia", json=payload, headers={"Authorization": f"Bearer {token}"}
        )


def test_submeter_sequencia_com_multiplos_itens_sequencia_zero_atribui_sequencias_unicas(client):
    test_client, _ = client
    token = _programador_token(test_client)

    payload = {
        "linha": "L1", "turno": 1, "patan": "A",
        "itens": [
            {
                "id": None, "linha": "L1", "turno": 1, "patan": "A",
                "posto_trabalho": "posto-1", "status": 2, "sequencia": 0,
                "kanbans": 1, "qtd_por_kanban": 1, "tempo_por_peca_minutos": 1,
            },
            {
                "id": None, "linha": "L1", "turno": 1, "patan": "A",
                "posto_trabalho": "posto-1", "status": 2, "sequencia": 0,
                "kanbans": 2, "qtd_por_kanban": 1, "tempo_por_peca_minutos": 1,
            },
            {
                "id": None, "linha": "L1", "turno": 1, "patan": "B",
                "posto_trabalho": "posto-1", "status": 3, "sequencia": 0,
                "kanbans": 3, "qtd_por_kanban": 1, "tempo_por_peca_minutos": 1,
            },
        ],
    }

    response = test_client.post(
        "/producao/sequencia", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 201
    dados = response.json()
    assert len(dados) == 3
    normais = [d for d in dados if d["status"] == 2]
    assert len(normais) == 2
    # Normais recebem sequencias unicas 1 e 2
    assert {d["sequencia"] for d in normais} == {1, 2}

