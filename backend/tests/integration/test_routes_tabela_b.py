from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.db.session import Base, get_db
from app.main import app
from app.models.audit_log import AuditLog
from app.models.colaboracao import ChecklistItem, Comentario
from app.models.ferramentaria import CatalogoFerramenta, ManutencaoFerramenta
from app.models.perfil import Cargo
from app.models.producao import ColunaExtra, ItemProducao, ItemProducaoStaging
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
            ItemProducaoStaging.__table__,
            ItemProducao.__table__,
            ChecklistItem.__table__,
            AuditLog.__table__,
            ColunaExtra.__table__,
            Comentario.__table__,
            ManutencaoFerramenta.__table__,
            CatalogoFerramenta.__table__,
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


def _usuario_comum_token(client: TestClient) -> str:
    """Requires _programador_token (or equivalent bootstrap) to have run first."""
    admin_login = client.post("/auth/login", data={"username": "admin", "password": "s3cret"})
    admin_token = admin_login.json()["access_token"]
    client.post(
        "/auth/register",
        json={"username": "comum", "password": "s3cret", "role": "usuario_comum"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    login = client.post("/auth/login", data={"username": "comum", "password": "s3cret"})
    return login.json()["access_token"]


def _seed_dois_itens(SessionLocal):
    with SessionLocal() as session:
        item_a = ItemProducao(
            linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
            sequencia=1, hora_inicial=datetime(2026, 8, 24, 6, 20),  # noqa: DTZ001
            hora_final=datetime(2026, 8, 24, 6, 50),  # noqa: DTZ001
            kanbans=1, qtd_por_kanban=1,
            tempo_por_peca_minutos=30, is_critico=False, em_producao=False,
        )
        item_b = ItemProducao(
            linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
            sequencia=2, hora_inicial=datetime(2026, 8, 24, 6, 50),  # noqa: DTZ001
            hora_final=datetime(2026, 8, 24, 7, 20),  # noqa: DTZ001
            kanbans=1, qtd_por_kanban=1,
            tempo_por_peca_minutos=30, is_critico=False, em_producao=False,
        )
        session.add_all([item_a, item_b])
        session.commit()
        session.refresh(item_a)
        session.refresh(item_b)
        return item_a.id, item_b.id


def test_reordenar_producao_updates_sequencia_and_preserves_horarios(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    id_a, id_b = _seed_dois_itens(SessionLocal)

    response = test_client.patch(
        "/producao/reordenar",
        json={
            "linha": "L1", "turno": 1, "patan": "A", "posto_trabalho": "posto-1",
            "ids_em_ordem": [id_b, id_a],
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    corpo = {item["id"]: item for item in response.json()}
    assert corpo[id_b]["sequencia"] == 1
    assert corpo[id_a]["sequencia"] == 2
    # Horario congelado desde o submit original - reordenar nao recalcula.
    assert corpo[id_a]["hora_inicial"] == "2026-08-24T06:20:00"
    assert corpo[id_b]["hora_final"] == "2026-08-24T07:20:00"


def test_reordenar_producao_404_when_id_belongs_to_different_posto(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    id_a, _ = _seed_dois_itens(SessionLocal)

    response = test_client.patch(
        "/producao/reordenar",
        json={
            "linha": "L1", "turno": 1, "patan": "A", "posto_trabalho": "posto-2",
            "ids_em_ordem": [id_a],
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404


def test_reordenar_producao_denies_usuario_comum(client):
    test_client, SessionLocal = client
    _programador_token(test_client)  # ensures an admin exists to create the next user
    token = _usuario_comum_token(test_client)
    id_a, id_b = _seed_dois_itens(SessionLocal)

    response = test_client.patch(
        "/producao/reordenar",
        json={
            "linha": "L1", "turno": 1, "patan": "A", "posto_trabalho": "posto-1",
            "ids_em_ordem": [id_b, id_a],
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


def test_listar_tabela_b_sem_patan_retorna_todos_os_patans(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    with SessionLocal() as session:
        session.add_all([
            ItemProducao(
                linha="LINHA 1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, hora_inicial=datetime(2026, 8, 24, 6, 20),  # noqa: DTZ001
                hora_final=datetime(2026, 8, 24, 6, 50),  # noqa: DTZ001
                kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=30,
                is_critico=False, em_producao=False,
            ),
            ItemProducao(
                linha="LINHA 1", turno=1, patan="B", posto_trabalho="posto-1", status=2,
                sequencia=2, hora_inicial=datetime(2026, 8, 24, 6, 50),  # noqa: DTZ001
                hora_final=datetime(2026, 8, 24, 7, 20),  # noqa: DTZ001
                kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=30,
                is_critico=False, em_producao=False,
            ),
            ItemProducao(
                linha="LINHA 2", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, hora_inicial=datetime(2026, 8, 24, 6, 20),  # noqa: DTZ001
                hora_final=datetime(2026, 8, 24, 6, 50),  # noqa: DTZ001
                kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=30,
                is_critico=False, em_producao=False,
            ),
        ])
        session.commit()

    resp = test_client.get(
        "/producao/tabela-b?linha=LINHA 1&turno=1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    patans = {item["patan"] for item in data}
    assert patans == {"A", "B"}


def test_listar_tabela_b_com_patan_filtra_patan_especifico(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    with SessionLocal() as session:
        session.add_all([
            ItemProducao(
                linha="LINHA 1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, hora_inicial=datetime(2026, 8, 24, 6, 20),  # noqa: DTZ001
                hora_final=datetime(2026, 8, 24, 6, 50),  # noqa: DTZ001
                kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=30,
                is_critico=False, em_producao=False,
            ),
            ItemProducao(
                linha="LINHA 1", turno=1, patan="B", posto_trabalho="posto-1", status=2,
                sequencia=2, hora_inicial=datetime(2026, 8, 24, 6, 50),  # noqa: DTZ001
                hora_final=datetime(2026, 8, 24, 7, 20),  # noqa: DTZ001
                kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=30,
                is_critico=False, em_producao=False,
            ),
        ])
        session.commit()

    resp = test_client.get(
        "/producao/tabela-b?linha=LINHA 1&turno=1&patan=A",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["patan"] == "A"


def test_reordenar_producao_sem_patan_funciona_com_multiplos_patans(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    with SessionLocal() as session:
        it_a = ItemProducao(
            linha="LINHA 1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
            sequencia=1, hora_inicial=datetime(2026, 8, 24, 6, 20),  # noqa: DTZ001
            hora_final=datetime(2026, 8, 24, 6, 50),  # noqa: DTZ001
            kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=30,
            is_critico=False, em_producao=False,
        )
        it_b = ItemProducao(
            linha="LINHA 1", turno=1, patan="B", posto_trabalho="posto-1", status=2,
            sequencia=2, hora_inicial=datetime(2026, 8, 24, 6, 50),  # noqa: DTZ001
            hora_final=datetime(2026, 8, 24, 7, 20),  # noqa: DTZ001
            kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=30,
            is_critico=False, em_producao=False,
        )
        session.add_all([it_a, it_b])
        session.commit()
        session.refresh(it_a)
        session.refresh(it_b)
        id_a, id_b = it_a.id, it_b.id

    resp = test_client.patch(
        "/producao/reordenar",
        json={
            "linha": "LINHA 1",
            "turno": 1,
            "posto_trabalho": "posto-1",
            "ids_em_ordem": [id_b, id_a],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    corpo = {item["id"]: item for item in resp.json()}
    assert corpo[id_b]["sequencia"] == 1
    assert corpo[id_a]["sequencia"] == 2


def test_exportar_csv_sem_patan_e_com_patan(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    with SessionLocal() as session:
        session.add(
            ItemProducao(
                linha="LINHA 1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, hora_inicial=datetime(2026, 8, 24, 6, 20),  # noqa: DTZ001
                hora_final=datetime(2026, 8, 24, 6, 50),  # noqa: DTZ001
                kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=30,
                is_critico=False, em_producao=False,
            )
        )
        session.commit()

    # Sem patan
    resp = test_client.get(
        "/producao/exportar?linha=LINHA 1&turno=1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert 'attachment; filename="producao_LINHA 1_todos.csv"' in resp.headers["Content-Disposition"]
    assert "LINHA 1" in resp.text

    # Com patan
    resp_patan = test_client.get(
        "/producao/exportar?linha=LINHA 1&turno=1&patan=A",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_patan.status_code == 200
    assert 'attachment; filename="producao_LINHA 1_A.csv"' in resp_patan.headers["Content-Disposition"]


def test_listar_tabela_b_filtrando_por_setor(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    with SessionLocal() as session:
        session.add(
            ItemProducao(
                setor="solda",
                linha="LINHA 1", turno=1, patan="A", posto_trabalho="SOLDA 1", status=2,
                sequencia=1, kanbans=1, qtd_por_kanban=10, tempo_por_peca_minutos=1,
                material="SOLDA-01",
            )
        )
        session.add(
            ItemProducao(
                setor="estamparia",
                linha="LINHA 1", turno=1, patan="A", posto_trabalho="PRENSA 1", status=2,
                sequencia=1, kanbans=2, qtd_por_kanban=20, tempo_por_peca_minutos=1,
                material="ESTAMP-01",
            )
        )
        session.commit()

    # Consulta solda
    resp_solda = test_client.get(
        "/producao/tabela-b?linha=LINHA 1&setor=solda",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_solda.status_code == 200
    materiais_solda = [it["material"] for it in resp_solda.json()]
    assert "SOLDA-01" in materiais_solda
    assert "ESTAMP-01" not in materiais_solda

    # Consulta estamparia
    resp_estamp = test_client.get(
        "/producao/tabela-b?linha=LINHA 1&setor=estamparia",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_estamp.status_code == 200
    materiais_estamp = [it["material"] for it in resp_estamp.json()]
    assert "ESTAMP-01" in materiais_estamp
    assert "SOLDA-01" not in materiais_estamp


def test_auth_me_retorna_permissoes_setor(client):
    test_client, _ = client
    token = _programador_token(test_client)
    resp = test_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    dados = resp.json()
    assert "permissoes" in dados
    assert "pode_ver_solda" in dados["permissoes"]
    assert "pode_ver_estamparia" in dados["permissoes"]
    assert dados["permissoes"]["pode_ver_solda"] is True
    assert dados["permissoes"]["pode_ver_estamparia"] is True


def test_inserir_card_producao_rejeita_usuario_comum(client):
    test_client, _ = client
    _programador_token(test_client)
    token = _usuario_comum_token(test_client)
    payload = {
        "setor": "solda",
        "linha": "LINHA 1",
        "turno": 1,
        "patan": "A",
        "posto_trabalho": "SB6A",
        "material": "URGENTE-99",
        "kanbans": 1,
        "qtd_por_kanban": 10,
        "tempo_por_peca_minutos": 1.0,
        "hora_inicial": "2026-08-24T06:20:00",
    }
    resp = test_client.post(
        "/producao/inserir-card",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert resp.status_code == 403


def test_inserir_card_producao_e_reordenacao_em_cascata(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    # 1. Cria um item existente no posto SB6A
    with SessionLocal() as session:
        item_existente = ItemProducao(
            setor="solda",
            linha="LINHA 1",
            turno=1,
            patan="A",
            posto_trabalho="SB6A",
            status=2,
            sequencia=1,
            kanbans=2,
            qtd_por_kanban=10,
            tempo_por_peca_minutos=3.0,  # 60 min de duração
            hora_inicial=datetime(2026, 8, 24, 6, 20, 0),
            hora_final=datetime(2026, 8, 24, 7, 20, 0),
            material="MAT-EXISTENTE",
        )
        session.add(item_existente)
        session.commit()

    # 2. Programador insere card de emergência para começar às 06:20 com 30 minutos de duração
    payload = {
        "setor": "solda",
        "linha": "LINHA 1",
        "turno": 1,
        "patan": "A",
        "posto_trabalho": "SB6A",
        "material": "MAT-EMERGENCIA",
        "kanbans": 1,
        "qtd_por_kanban": 10,
        "tempo_por_peca_minutos": 3.0,  # 30 min de duração
        "hora_inicial": "2026-08-24T06:20:00",
    }
    resp = test_client.post(
        "/producao/inserir-card",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert resp.status_code == 200, resp.text
    dados = resp.json()
    assert dados["total_afetados"] >= 1
    assert dados["item_criado"]["material"] == "MAT-EMERGENCIA"
    assert dados["item_criado"]["sequencia"] == 1

    # 3. Verifica a fila da Tabela B para checar o empurrão do horário
    resp_tabela = test_client.get(
        "/producao/tabela-b?linha=LINHA 1&setor=solda",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_tabela.status_code == 200
    itens = resp_tabela.json()
    assert len(itens) == 2

    item_emergencia = next(i for i in itens if i["material"] == "MAT-EMERGENCIA")
    item_empurrado = next(i for i in itens if i["material"] == "MAT-EXISTENTE")

    # Item emergência: 06:20 até 06:50
    assert "06:20" in item_emergencia["hora_inicial"]
    assert "06:50" in item_emergencia["hora_final"]
    assert item_emergencia["sequencia"] == 1

    # Item empurrado: deve começar agora em 06:50 e ir até 07:50
    assert "06:50" in item_empurrado["hora_inicial"]
    assert "07:50" in item_empurrado["hora_final"]
    assert item_empurrado["sequencia"] == 2


def test_listar_tabela_b_com_filtro_de_data(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    with SessionLocal() as session:
        item_hoje = ItemProducao(
            linha="LINHA 1",
            setor="solda",
            turno=1,
            patan="A",
            posto_trabalho="SB6A",
            material="PECA-HOJE",
            kanbans=2,
            qtd_por_kanban=50,
            tempo_por_peca_minutos=0.5,
            status=2,
            sequencia=1,
            hora_inicial=datetime(2026, 10, 20, 6, 20, 0),
            hora_final=datetime(2026, 10, 20, 7, 10, 0),
        )
        item_amanha = ItemProducao(
            linha="LINHA 1",
            setor="solda",
            turno=1,
            patan="A",
            posto_trabalho="SB6A",
            material="PECA-AMANHA",
            kanbans=2,
            qtd_por_kanban=50,
            tempo_por_peca_minutos=0.5,
            status=2,
            sequencia=2,
            hora_inicial=datetime(2026, 10, 21, 6, 20, 0),
            hora_final=datetime(2026, 10, 21, 7, 10, 0),
        )
        session.add_all([item_hoje, item_amanha])
        session.commit()

    # 1. Filtra por 2026-10-20 -> deve retornar somente PECA-HOJE
    resp = test_client.get(
        "/producao/tabela-b?linha=LINHA 1&setor=solda&data=2026-10-20",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    dados = resp.json()
    assert len(dados) == 1
    assert dados[0]["material"] == "PECA-HOJE"

    # 2. Filtra por 2026-10-21 -> deve retornar somente PECA-AMANHA
    resp2 = test_client.get(
        "/producao/tabela-b?linha=LINHA 1&setor=solda&data=2026-10-21",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 200
    dados2 = resp2.json()
    assert len(dados2) == 1
    assert dados2[0]["material"] == "PECA-AMANHA"

    # 3. Sem filtro de data -> retorna ambos
    resp_todos = test_client.get(
        "/producao/tabela-b?linha=LINHA 1&setor=solda",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_todos.status_code == 200
    dados_todos = resp_todos.json()
    assert len(dados_todos) == 2


def test_iniciar_e_desfazer_inicio_producao(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    with SessionLocal() as session:
        item = ItemProducao(
            linha="LINHA 1",
            setor="solda",
            turno=1,
            patan="A",
            posto_trabalho="posto-1",
            material="PECA-TESTE-UNDO",
            status=2,
            sequencia=1,
            kanbans=1,
            qtd_por_kanban=100,
            tempo_por_peca_minutos=1.0,
            hora_inicial=datetime(2026, 10, 20, 6, 20, 0),
            hora_final=datetime(2026, 10, 20, 7, 10, 0),
            em_producao=False,
            inicio_real=None,
        )
        session.add(item)
        session.commit()
        item_id = item.id

    # 1. Inicia produção
    resp_iniciar = test_client.patch(
        f"/producao/itens/{item_id}/iniciar-producao",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_iniciar.status_code == 200
    dados_iniciado = resp_iniciar.json()
    assert dados_iniciado["em_producao"] is True
    assert dados_iniciado["inicio_real"] is not None

    # 2. Desfaz início acidental
    resp_desfazer = test_client.patch(
        f"/producao/itens/{item_id}/desfazer-inicio",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_desfazer.status_code == 200
    dados_desfeito = resp_desfazer.json()
    assert dados_desfeito["em_producao"] is False
    assert dados_desfeito["inicio_real"] is None


def test_editar_item_producao_admin_ou_programador(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    with SessionLocal() as session:
        it1 = ItemProducao(
            linha="LINHA 1", setor="solda", turno=1, patan="A", posto_trabalho="PONTE 23",
            material="MAT-01", status=2, sequencia=1, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.5, hora_inicial=datetime(2026, 10, 20, 6, 20, 0),
            hora_final=datetime(2026, 10, 20, 7, 10, 0), em_producao=False,
        )
        it2 = ItemProducao(
            linha="LINHA 1", setor="solda", turno=1, patan="A", posto_trabalho="PONTE 23",
            material="MAT-02", status=2, sequencia=2, kanbans=1, qtd_por_kanban=100,
            tempo_por_peca_minutos=0.5, hora_inicial=datetime(2026, 10, 20, 7, 10, 0),
            hora_final=datetime(2026, 10, 20, 8, 0, 0), em_producao=False,
        )
        session.add_all([it1, it2])
        session.commit()
        session.refresh(it1)
        session.refresh(it2)
        id1, id2 = it1.id, it2.id

    # Editar it1: alterar kanbans de 2 para 4 e recalcular subsequentes
    resp = test_client.patch(
        f"/producao/itens/{id1}",
        json={
            "kanbans": 4,
            "hora_inicial": "2026-10-20T06:30:00",
            "recalcular_subsequentes": True,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    dados = resp.json()
    assert dados["kanbans"] == 4
    assert dados["hora_inicial"] == "2026-10-20T06:30:00"
    # Duração it1: 4 * 50 * 0.5 = 100 min -> 06:30 + 100m = 08:10
    assert dados["hora_final"] == "2026-10-20T08:10:00"

    # Verificar que it2 foi recalculado a partir do novo término de it1
    with SessionLocal() as session:
        it2_atualizado = session.get(ItemProducao, id2)
        assert it2_atualizado.hora_inicial == datetime(2026, 10, 20, 8, 10, 0)
        # Duração it2: 1 * 100 * 0.5 = 50 min -> 08:10 + 50m = 09:00
        assert it2_atualizado.hora_final == datetime(2026, 10, 20, 9, 0, 0)


def test_editar_e_excluir_item_producao_bloqueia_usuario_comum(client):
    test_client, SessionLocal = client
    _ = _programador_token(test_client)
    comum_token = _usuario_comum_token(test_client)
    with SessionLocal() as session:
        it = ItemProducao(
            linha="LINHA 1", setor="solda", turno=1, patan="A", posto_trabalho="PONTE 23",
            material="MAT-BLOQUEADO", status=2, sequencia=1, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.5, hora_inicial=datetime(2026, 10, 20, 6, 20, 0),
            hora_final=datetime(2026, 10, 20, 7, 10, 0), em_producao=False,
        )
        session.add(it)
        session.commit()
        session.refresh(it)
        item_id = it.id

    # Tentativa de editar por operador / usuário comum -> HTTP 403
    resp_patch = test_client.patch(
        f"/producao/itens/{item_id}",
        json={"kanbans": 10},
        headers={"Authorization": f"Bearer {comum_token}"},
    )
    assert resp_patch.status_code == 403

    # Tentativa de excluir por operador / usuário comum -> HTTP 403
    resp_delete = test_client.delete(
        f"/producao/itens/{item_id}",
        headers={"Authorization": f"Bearer {comum_token}"},
    )
    assert resp_delete.status_code == 403


def test_reordenar_producao_recalcular_horarios(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    with SessionLocal() as session:
        it1 = ItemProducao(
            linha="LINHA 1", setor="solda", turno=1, patan="A", posto_trabalho="PONTE 43",
            material="MAT-A", status=2, sequencia=1, kanbans=1, qtd_por_kanban=60,
            tempo_por_peca_minutos=1.0, hora_inicial=datetime(2026, 10, 20, 6, 20, 0),
            hora_final=datetime(2026, 10, 20, 7, 20, 0), em_producao=False,
        )
        it2 = ItemProducao(
            linha="LINHA 1", setor="solda", turno=1, patan="A", posto_trabalho="PONTE 43",
            material="MAT-B", status=2, sequencia=2, kanbans=1, qtd_por_kanban=30,
            tempo_por_peca_minutos=1.0, hora_inicial=datetime(2026, 10, 20, 7, 20, 0),
            hora_final=datetime(2026, 10, 20, 7, 50, 0), em_producao=False,
        )
        session.add_all([it1, it2])
        session.commit()
        session.refresh(it1)
        session.refresh(it2)
        id1, id2 = it1.id, it2.id

    # Inverter ordem com recalcular_horarios=True
    resp = test_client.patch(
        "/producao/reordenar",
        json={
            "linha": "LINHA 1",
            "turno": 1,
            "posto_trabalho": "PONTE 43",
            "ids_em_ordem": [id2, id1],
            "recalcular_horarios": True,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    mapa = {item["id"]: item for item in resp.json()}
    # it2 agora é o primeiro: hora_inicial = 06:20, duração 30m -> hora_final = 06:50
    assert mapa[id2]["sequencia"] == 1
    assert mapa[id2]["hora_inicial"] == "2026-10-20T06:20:00"
    assert mapa[id2]["hora_final"] == "2026-10-20T06:50:00"
    # it1 agora é o segundo: hora_inicial = 06:50, duração 60m -> hora_final = 07:50
    assert mapa[id1]["sequencia"] == 2
    assert mapa[id1]["hora_inicial"] == "2026-10-20T06:50:00"
    assert mapa[id1]["hora_final"] == "2026-10-20T07:50:00"


def test_iniciar_producao_tandem_bloqueio_quando_posto_irmao_nao_esta_no_topo(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)

    hoje = datetime(2026, 10, 22, 6, 20, 0)
    with SessionLocal() as session:
        # Posto A: MAT-TANDEM é o primeiro (seq 1)
        it_a = ItemProducao(
            linha="LINHA 2", setor="solda", turno=1, patan="A", posto_trabalho="PONTE 47",
            material="MAT-TANDEM", status=2, sequencia=1, kanbans=1, qtd_por_kanban=10,
            tempo_por_peca_minutos=1.0, hora_inicial=hoje,
            hora_final=hoje + timedelta(minutes=10), em_producao=False,
        )
        # Posto B: tem MAT-OUTRO em seq 1 e MAT-TANDEM em seq 2
        it_b1 = ItemProducao(
            linha="LINHA 2", setor="solda", turno=1, patan="A", posto_trabalho="PONTE 48",
            material="MAT-OUTRO", status=2, sequencia=1, kanbans=1, qtd_por_kanban=10,
            tempo_por_peca_minutos=1.0, hora_inicial=hoje,
            hora_final=hoje + timedelta(minutes=10), em_producao=False,
        )
        it_b2 = ItemProducao(
            linha="LINHA 2", setor="solda", turno=1, patan="A", posto_trabalho="PONTE 48",
            material="MAT-TANDEM", status=2, sequencia=2, kanbans=1, qtd_por_kanban=10,
            tempo_por_peca_minutos=1.0, hora_inicial=hoje + timedelta(minutes=10),
            hora_final=hoje + timedelta(minutes=20), em_producao=False,
        )
        session.add_all([it_a, it_b1, it_b2])
        session.commit()
        session.refresh(it_a)
        session.refresh(it_b1)
        session.refresh(it_b2)
        id_a = it_a.id
        id_b1 = it_b1.id
        id_b2 = it_b2.id

    # Tentativa de iniciar it_a (Posto A) deve falhar pois Posto B ainda tem MAT-OUTRO na frente
    resp = test_client.patch(
        f"/producao/itens/{id_a}/iniciar-producao",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert "o posto PONTE 48 ainda precisa concluir o item 'MAT-OUTRO'" in resp.json()["detail"]

    # Agora conclui o item it_b1 no Posto B
    resp_concluir = test_client.patch(
        f"/producao/itens/{id_b1}/concluir-producao",
        headers={"Authorization": f"Bearer {token}"},
        json={"pecas_produzidas": 10, "comentarios": "Lote finalizado"},
    )
    assert resp_concluir.status_code == 200

    # Agora tentar iniciar it_a deve suceder e iniciar ambos it_a e it_b2!
    resp_iniciar = test_client.patch(
        f"/producao/itens/{id_a}/iniciar-producao",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_iniciar.status_code == 200
    dados = resp_iniciar.json()
    assert dados["em_producao"] is True
    assert dados["producao_em_linha"] is True
    assert "PONTE 48" in dados["postos_vinculados"]

    # Verifica que it_b2 também iniciou em produção
    with SessionLocal() as session:
        it_b2_db = session.get(ItemProducao, id_b2)
        assert it_b2_db.em_producao is True


def test_concluir_producao_tandem_conclui_todos_ao_mesmo_tempo(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    hoje = datetime(2026, 10, 22, 6, 20, 0)
    with SessionLocal() as session:
        it_p1 = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-108",
            material="MAT-TANDEM-CONCLUIR", status=2, sequencia=1, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje,
            hora_final=hoje + timedelta(minutes=10), em_producao=True,
        )
        it_p2 = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-110",
            material="MAT-TANDEM-CONCLUIR", status=2, sequencia=1, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje,
            hora_final=hoje + timedelta(minutes=10), em_producao=True,
        )
        session.add_all([it_p1, it_p2])
        session.commit()
        session.refresh(it_p1)
        session.refresh(it_p2)
        id_1 = it_p1.id
        id_2 = it_p2.id

    # Conclui no posto PR-108
    resp = test_client.patch(
        f"/producao/itens/{id_1}/concluir-producao",
        headers={"Authorization": f"Bearer {token}"},
        json={"pecas_produzidas": 90, "comentarios": "Concluído com 90 peças"},
    )
    assert resp.status_code == 200

    # Ambos os postos devem estar agora em Concluídas com em_producao=False e 90 peças produzidas
    with SessionLocal() as session:
        it1_db = session.get(ItemProducao, id_1)
        it2_db = session.get(ItemProducao, id_2)
        assert it1_db.em_producao is False
        assert it2_db.em_producao is False
        assert it1_db.coluna_extra_id is not None
        assert it2_db.coluna_extra_id is not None
        assert it1_db.coluna_extra_id == it2_db.coluna_extra_id
        assert it1_db.quantidade_produzida_real == 90
        assert it2_db.quantidade_produzida_real == 90


def test_quebra_ferramenta_tandem_envia_quebrado_p_ferramentaria_e_irmaos_p_concluidas(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    hoje = datetime(2026, 10, 22, 6, 20, 0)
    with SessionLocal() as session:
        it_p1 = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-112",
            material="MAT-TANDEM-QUEBRA", status=2, sequencia=1, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje,
            hora_final=hoje + timedelta(minutes=10), em_producao=True,
        )
        it_p2 = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-114",
            material="MAT-TANDEM-QUEBRA", status=2, sequencia=1, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje,
            hora_final=hoje + timedelta(minutes=10), em_producao=True,
        )
        session.add_all([it_p1, it_p2])
        session.commit()
        session.refresh(it_p1)
        session.refresh(it_p2)
        id_1 = it_p1.id
        id_2 = it_p2.id

    # Registra quebra em PR-112
    resp = test_client.patch(
        f"/producao/itens/{id_1}/quebra-ferramenta",
        headers={"Authorization": f"Bearer {token}"},
        json={"pecas_produzidas": 35, "motivo_quebra": "Pino quebrado", "observacoes": "Trocar pino"},
    )
    assert resp.status_code == 200

    # PR-112 deve ir para Quebra de Máquina; PR-114 deve ir para Concluídas!
    with SessionLocal() as session:
        it1_db = session.get(ItemProducao, id_1)
        it2_db = session.get(ItemProducao, id_2)
        assert it1_db.em_producao is False
        assert it2_db.em_producao is False
        assert it1_db.motivo_interrupcao == "quebra"
        assert it2_db.motivo_interrupcao is None

        col_it1 = session.get(ColunaExtra, it1_db.coluna_extra_id)
        col_it2 = session.get(ColunaExtra, it2_db.coluna_extra_id)
        assert "quebra" in col_it1.nome.lower()
        assert "conclu" in col_it2.nome.lower()
        assert it1_db.quantidade_produzida_real == 35
        assert it2_db.quantidade_produzida_real == 35


def test_excluir_item_producao_recalcula_cascata_proximos_itens(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    hoje = datetime(2026, 10, 22, 6, 20, 0)
    with SessionLocal() as session:
        it1 = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-82",
            material="MAT-A", status=2, sequencia=1, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje,
            hora_final=hoje + timedelta(minutes=10),
        )
        it2 = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-82",
            material="MAT-B", status=2, sequencia=2, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje + timedelta(minutes=10),
            hora_final=hoje + timedelta(minutes=20),
        )
        it3 = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-82",
            material="MAT-C", status=2, sequencia=3, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje + timedelta(minutes=20),
            hora_final=hoje + timedelta(minutes=30),
        )
        session.add_all([it1, it2, it3])
        session.commit()
        session.refresh(it2)
        session.refresh(it3)
        id_2 = it2.id
        id_3 = it3.id

    # Exclui item 2
    resp = test_client.delete(
        f"/producao/itens/{id_2}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["itens_removidos"] == 1

    # Verifica se item 2 sumiu e item 3 avançou para 06:30
    with SessionLocal() as session:
        assert session.get(ItemProducao, id_2) is None
        it3_db = session.get(ItemProducao, id_3)
        assert it3_db is not None
        assert it3_db.sequencia == 2
        assert it3_db.hora_inicial == hoje + timedelta(minutes=10)
        assert it3_db.hora_final == hoje + timedelta(minutes=20)


def test_excluir_item_producao_com_remover_irmaos_tandem(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    hoje = datetime(2026, 10, 22, 6, 20, 0)
    with SessionLocal() as session:
        it_p1 = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-112",
            material="MAT-TANDEM-DEL", status=2, sequencia=1, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje,
            hora_final=hoje + timedelta(minutes=10),
        )
        it_p2 = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-114",
            material="MAT-TANDEM-DEL", status=2, sequencia=1, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje,
            hora_final=hoje + timedelta(minutes=10),
        )
        it_prox = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-112",
            material="MAT-PROX", status=2, sequencia=2, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje + timedelta(minutes=10),
            hora_final=hoje + timedelta(minutes=20),
        )
        session.add_all([it_p1, it_p2, it_prox])
        session.commit()
        session.refresh(it_p1)
        session.refresh(it_p2)
        session.refresh(it_prox)
        id_1 = it_p1.id
        id_2 = it_p2.id
        id_prox = it_prox.id

    # Exclui com remover_irmaos_tandem=true
    resp = test_client.delete(
        f"/producao/itens/{id_1}?remover_irmaos_tandem=true",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["itens_removidos"] == 2

    # Verifica se ambos foram removidos e o próximo assumiu o topo da fila às 06:20
    with SessionLocal() as session:
        assert session.get(ItemProducao, id_1) is None
        assert session.get(ItemProducao, id_2) is None
        it_prox_db = session.get(ItemProducao, id_prox)
        assert it_prox_db.sequencia == 1
        assert it_prox_db.hora_inicial == hoje
        assert it_prox_db.hora_final == hoje + timedelta(minutes=10)


def test_bloquear_movimentacao_e_edicao_item_concluido(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    hoje = datetime(2026, 10, 22, 6, 20, 0)
    with SessionLocal() as session:
        col_concluidas = ColunaExtra(nome="Concluídas", setor="estamparia")
        col_outra = ColunaExtra(nome="Aguardando Qualidade", setor="estamparia")
        session.add_all([col_concluidas, col_outra])
        session.commit()
        session.refresh(col_concluidas)
        session.refresh(col_outra)

        item = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-82",
            material="MAT-CONCLUIDO", status=2, sequencia=0, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje,
            hora_final=hoje + timedelta(minutes=10),
            coluna_extra_id=col_concluidas.id,
            fim_real=hoje + timedelta(minutes=10),
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        item_id = item.id
        id_outra = col_outra.id
        id_concluidas = col_concluidas.id

    # 1. Tentar mover para a fila normal (coluna_extra_id: None) deve ser rejeitado com 400
    resp_normal = test_client.patch(
        f"/producao/itens/{item_id}/coluna-extra",
        json={"coluna_extra_id": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_normal.status_code == 400
    assert "não podem retornar" in resp_normal.json()["detail"]

    # 2. Tentar mover para outra coluna extra deve ser rejeitado com 400
    resp_outra = test_client.patch(
        f"/producao/itens/{item_id}/coluna-extra",
        json={"coluna_extra_id": id_outra},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_outra.status_code == 400
    assert "não podem retornar" in resp_outra.json()["detail"]

    # 3. Tentar editar item concluído deve ser rejeitado com 400
    resp_edit = test_client.patch(
        f"/producao/itens/{item_id}",
        json={"kanbans": 5},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_edit.status_code == 400
    assert "não podem ser editadas" in resp_edit.json()["detail"]

    # 4. Tentar apagar ou renomear a coluna Concluídas deve ser rejeitado com 400
    resp_del_col = test_client.delete(
        f"/producao/colunas-extras/{id_concluidas}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_del_col.status_code == 400
    assert "não podem ser removidas" in resp_del_col.json()["detail"]

    resp_ren_col = test_client.patch(
        f"/producao/colunas-extras/{id_concluidas}",
        json={"nome": "Finalizadas"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_ren_col.status_code == 400
    assert "não podem ser renomeadas" in resp_ren_col.json()["detail"]


def test_bloquear_movimentacao_item_quebra_maquina(client):
    test_client, SessionLocal = client
    token = _programador_token(test_client)
    hoje = datetime(2026, 10, 22, 6, 20, 0)
    with SessionLocal() as session:
        col_quebra = ColunaExtra(nome="Quebra de Máquina", setor="estamparia")
        session.add(col_quebra)
        session.commit()
        session.refresh(col_quebra)

        item = ItemProducao(
            linha="LINHA 1", setor="estamparia", turno=1, patan="A", posto_trabalho="PR-82",
            material="MAT-QUEBRADO", status=2, sequencia=0, kanbans=2, qtd_por_kanban=50,
            tempo_por_peca_minutos=0.1, hora_inicial=hoje,
            hora_final=hoje + timedelta(minutes=10),
            coluna_extra_id=col_quebra.id,
            motivo_interrupcao="quebra",
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        item_id = item.id
        id_quebra = col_quebra.id

    # Tentar mover para a fila normal deve falhar
    resp = test_client.patch(
        f"/producao/itens/{item_id}/coluna-extra",
        json={"coluna_extra_id": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert "não podem retornar" in resp.json()["detail"]

    # Tentar apagar coluna de Quebra de Máquina deve falhar
    resp_del = test_client.delete(
        f"/producao/colunas-extras/{id_quebra}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_del.status_code == 400
    assert "não podem ser removidas" in resp_del.json()["detail"]





