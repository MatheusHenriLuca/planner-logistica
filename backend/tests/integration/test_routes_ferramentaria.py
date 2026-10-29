import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.security import create_access_token
from app.db.session import Base, get_db
from app.main import app
from app.models.audit_log import AuditLog
from app.models.colaboracao import ChecklistItem, Comentario
from app.models.ferramentaria import CatalogoFerramenta, ManutencaoFerramenta
from app.models.perfil import Cargo
from app.models.producao import ColunaExtra, ItemProducao, ItemProducaoStaging
from app.models.user import Role, User


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
            Comentario.__table__,
            AuditLog.__table__,
            ColunaExtra.__table__,
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
    yield TestClient(app)
    app.dependency_overrides.clear()


def _auth_header(username: str, role: str) -> dict[str, str]:
    token = create_access_token(username, role)
    return {"Authorization": f"Bearer {token}"}


def test_ferramentaria_fluxo_completo(client):
    db = next(app.dependency_overrides[get_db]())
    admin = User(username="admin_ferr", hashed_password="pw", role=Role.ADMIN.value)
    db.add(admin)
    db.commit()

    headers = _auth_header("admin_ferr", Role.ADMIN.value)

    # 1. Cria ordem de manutenção
    resp = client.post(
        "/ferramentaria/manutencoes",
        headers=headers,
        json={
            "material": "FERR-999",
            "descricao": "Molde Estampo 999",
            "linha": "LINHA 1",
            "posto_trabalho": "P1",
            "motivo_quebra": "Trinca na matriz principal",
            "pecas_produzidas": 150,
            "observacoes": "Necessário solda e polimento",
        },
    )
    assert resp.status_code == 201
    manut_id = resp.json()["id"]
    assert resp.json()["status"] == "aguardando_manutencao"

    # 2. Material aparece como bloqueado
    resp_bloq = client.get("/ferramentaria/materiais-bloqueados", headers=headers)
    assert resp_bloq.status_code == 200
    assert "FERR-999" in resp_bloq.json()

    # 3. Tentar submeter lote de produção contendo este material deve falhar
    submit_payload = {
        "linha": "LINHA 1",
        "turno": "1",
        "patan": "A",
        "itens": [
            {
                "linha": "LINHA 1",
                "turno": "1",
                "patan": "A",
                "posto_trabalho": "P1",
                "sequencia": 1,
                "status": 2,
                "kanbans": 2,
                "qtd_por_kanban": 10,
                "tempo_por_peca_minutos": 0.5,
                "material": "FERR-999",
            }
        ],
    }
    resp_submit = client.post("/producao/sequencia", headers=headers, json=submit_payload)
    assert resp_submit.status_code == 400
    assert "estão em manutenção na Ferramentaria" in resp_submit.json()["detail"]

    # 4. Transição de status na ferramentaria:
    # 4.1 Inicia manutenção na bancada
    resp_manut = client.patch(
        f"/ferramentaria/manutencoes/{manut_id}/status",
        headers=headers,
        json={"status": "em_manutencao", "observacoes": "Ferramenta desmontada na bancada"},
    )
    assert resp_manut.status_code == 200
    assert resp_manut.json()["status"] == "em_manutencao"

    # 4.2 Ferramenteiro conclui bancada e envia para aguardando_tryout
    resp_aguard = client.patch(
        f"/ferramentaria/manutencoes/{manut_id}/status",
        headers=headers,
        json={"status": "aguardando_tryout", "observacoes": "Bancada concluída, aguardando agendamento"},
    )
    assert resp_aguard.status_code == 200
    assert resp_aguard.json()["status"] == "aguardando_tryout"

    # 4.3 Programador da Ferramentaria agenda e envia para tryout
    now_str = "2026-10-20T10:00:00"
    end_str = "2026-10-20T12:00:00"
    resp_tryout = client.patch(
        f"/ferramentaria/manutencoes/{manut_id}/status",
        headers=headers,
        json={
            "status": "tryout",
            "observacoes": "Testes na prensa 01",
            "tryout_setor": "estamparia",
            "tryout_prensa": "PR-108",
            "tryout_ferramenta": "FERR-999",
            "tryout_inicio": now_str,
            "tryout_fim": end_str,
        },
    )
    assert resp_tryout.status_code == 200
    assert resp_tryout.json()["status"] == "tryout"
    assert resp_tryout.json()["tryout_prensa"] == "PR-108"
    assert resp_tryout.json()["tryout_setor"] == "estamparia"

    resp_liberar = client.patch(
        f"/ferramentaria/manutencoes/{manut_id}/status",
        headers=headers,
        json={"status": "disponivel", "observacoes": "Liberada com laudo aprovado"},
    )
    assert resp_liberar.status_code == 200
    assert resp_liberar.json()["status"] == "disponivel"
    assert resp_liberar.json()["data_liberacao"] is not None

    # 5. Agora o material não está mais bloqueado
    resp_bloq2 = client.get("/ferramentaria/materiais-bloqueados", headers=headers)
    assert "FERR-999" not in resp_bloq2.json()

    # 6. Agora o lote pode ser enviado com sucesso
    resp_submit2 = client.post("/producao/sequencia", headers=headers, json=submit_payload)
    assert resp_submit2.status_code == 201
    item_id = resp_submit2.json()[0]["id"]

    # 7. Testar quebra de ferramenta a partir da produção
    resp_quebra = client.patch(
        f"/producao/itens/{item_id}/quebra-ferramenta",
        headers=headers,
        json={
            "pecas_produzidas": 50,
            "motivo_quebra": "Quebra de pino guia",
            "observacoes": "Parada imediata da linha",
        },
    )
    assert resp_quebra.status_code == 200
    assert resp_quebra.json()["coluna_extra_id"] is not None

    # Verifica que entrou novamente como bloqueado na ferramentaria
    resp_bloq3 = client.get("/ferramentaria/materiais-bloqueados", headers=headers)
    assert "FERR-999" in resp_bloq3.json()


def test_concluir_producao_requer_pecas_produzidas(client):
    db = next(app.dependency_overrides[get_db]())
    admin = User(username="operador_prod", hashed_password="pw", role=Role.ADMIN.value)
    db.add(admin)
    db.commit()

    headers = _auth_header("operador_prod", Role.ADMIN.value)

    # Cria um item na Tabela B
    item = ItemProducao(
        linha="LINHA 1",
        turno="1",
        patan="A",
        posto_trabalho="P1",
        sequencia=1,
        status=2,
        kanbans=1,
        qtd_por_kanban=10,
        tempo_por_peca_minutos=1.0,
        material="PROD-101",
        em_producao=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    # Tenta concluir sem informar pecas_produzidas -> deve dar 422
    resp_invalido = client.patch(
        f"/producao/itens/{item.id}/concluir-producao",
        headers=headers,
        json={"comentarios": "Faltou quantidade"},
    )
    assert resp_invalido.status_code == 422

    # Conclui com pecas_produzidas informada -> sucesso
    resp_valido = client.patch(
        f"/producao/itens/{item.id}/concluir-producao",
        headers=headers,
        json={"pecas_produzidas": 10, "comentarios": "Lote finalizado com sucesso"},
    )
    assert resp_valido.status_code == 200
    assert resp_valido.json()["em_producao"] is False
    assert resp_valido.json()["coluna_extra_id"] is not None


def test_catalogo_e_preventiva_fluxo(client: TestClient):
    db = next(app.dependency_overrides[get_db]())
    user = User(username="chefe_ferramentaria", hashed_password="pw", role=Role.ADMIN.value)
    db.add(user)
    db.commit()

    headers = _auth_header("chefe_ferramentaria", Role.ADMIN.value)

    # 1. Cadastrar ferramenta no catálogo
    resp_cad = client.post(
        "/ferramentaria/catalogo",
        headers=headers,
        json={
            "codigo": "EST-FERR-99",
            "descricao": "Matriz de Estamparia Lateral",
            "setor": "estamparia",
            "linha": "LINHA 1",
            "posto_trabalho": "PRENSA 01",
            "periodicidade_dias": 30,
            "observacoes": "Limpeza e polimento periódico",
        },
    )
    assert resp_cad.status_code == 201
    cat_id = resp_cad.json()["id"]
    assert resp_cad.json()["codigo"] == "EST-FERR-99"
    assert resp_cad.json()["periodicidade_dias"] == 30

    # 2. Listar catálogo
    resp_list = client.get("/ferramentaria/catalogo", headers=headers)
    assert resp_list.status_code == 200
    assert any(c["codigo"] == "EST-FERR-99" for c in resp_list.json())

    # 3. Acionar preventiva
    resp_prev = client.post(f"/ferramentaria/catalogo/{cat_id}/abrir-preventiva", headers=headers)
    assert resp_prev.status_code == 200
    manut_id = resp_prev.json()["id"]
    assert resp_prev.json()["material"] == "EST-FERR-99"
    assert resp_prev.json()["status"] == "aguardando_preventiva"
    assert resp_prev.json()["tipo_manutencao"] == "preventiva"

    # 4. Verifica que ferramenta está bloqueada
    bloqueados = client.get("/ferramentaria/materiais-bloqueados", headers=headers).json()
    assert "EST-FERR-99" in bloqueados

    # 5. Libera a ferramenta
    resp_lib = client.patch(
        f"/ferramentaria/manutencoes/{manut_id}/status",
        headers=headers,
        json={"status": "disponivel", "observacoes": "Preventiva realizada com sucesso"},
    )
    assert resp_lib.status_code == 200
    assert resp_lib.json()["status"] == "disponivel"

    # 6. Verifica desbloqueio
    bloqueados_pos = client.get("/ferramentaria/materiais-bloqueados", headers=headers).json()
    assert "EST-FERR-99" not in bloqueados_pos


def test_tryout_permissoes_e_liberacao_direta(client: TestClient):
    db = next(app.dependency_overrides[get_db]())

    # Cargo ferramenteiro comum com permissão de gerenciar ferramentaria
    cargo_ferr = Cargo(
        nome="ferramenteiro",
        descricao="Operador da bancada de ferramentaria",
        pode_gerenciar_ferramentaria=True,
    )
    cargo_prog = Cargo(
        nome="programador_ferramentaria",
        descricao="Programador da Ferramentaria",
        pode_gerenciar_ferramentaria=True,
    )
    db.add_all([cargo_ferr, cargo_prog])
    ferramenteiro = User(username="joao_ferramenteiro", hashed_password="pw", role="ferramenteiro")
    prog_ferr = User(
        username="carlos_prog_ferr",
        hashed_password="pw",
        role="programador_ferramentaria",
    )
    db.add_all([ferramenteiro, prog_ferr])
    db.commit()

    headers_ferr = _auth_header("joao_ferramenteiro", "ferramenteiro")
    headers_prog = _auth_header("carlos_prog_ferr", "programador_ferramentaria")

    # 1. Criação de ordem
    resp = client.post(
        "/ferramentaria/manutencoes",
        headers=headers_ferr,
        json={
            "material": "MAT-TRYOUT-1",
            "motivo_quebra": "Revisão de corte",
        },
    )
    assert resp.status_code == 201
    manut_id = resp.json()["id"]

    # 2. Ferramenteiro inicia manutenção
    resp_ini = client.patch(
        f"/ferramentaria/manutencoes/{manut_id}/status",
        headers=headers_ferr,
        json={"status": "em_manutencao", "observacoes": "Ajuste de facas"},
    )
    assert resp_ini.status_code == 200

    # 3. Ferramenteiro move para aguardando_tryout
    resp_ag = client.patch(
        f"/ferramentaria/manutencoes/{manut_id}/status",
        headers=headers_ferr,
        json={"status": "aguardando_tryout"},
    )
    assert resp_ag.status_code == 200

    # 4. Ferramenteiro tenta enviar para tryout -> 403 Forbidden!
    resp_403 = client.patch(
        f"/ferramentaria/manutencoes/{manut_id}/status",
        headers=headers_ferr,
        json={
            "status": "tryout",
            "tryout_setor": "estamparia",
            "tryout_prensa": "PR-109",
            "tryout_ferramenta": "MAT-TRYOUT-1",
            "tryout_inicio": "2026-10-20T10:00:00",
            "tryout_fim": "2026-10-20T12:00:00",
        },
    )
    assert resp_403.status_code == 403
    assert "Apenas o Programador da Ferramentaria pode agendar" in resp_403.json()["detail"]

    # 5. Programador tenta enviar sem preencher prensa ou horários -> 422!
    resp_422 = client.patch(
        f"/ferramentaria/manutencoes/{manut_id}/status",
        headers=headers_prog,
        json={"status": "tryout"},
    )
    assert resp_422.status_code == 422

    # 6. Programador tenta enviar com fim anterior ao início -> 400!
    resp_400 = client.patch(
        f"/ferramentaria/manutencoes/{manut_id}/status",
        headers=headers_prog,
        json={
            "status": "tryout",
            "tryout_prensa": "PR-109",
            "tryout_inicio": "2026-10-20T14:00:00",
            "tryout_fim": "2026-10-20T13:00:00",
        },
    )
    assert resp_400.status_code == 400
    assert "posterior ao horário de início" in resp_400.json()["detail"]

    # 7. Programador envia com dados válidos -> 200 OK!
    resp_ok = client.patch(
        f"/ferramentaria/manutencoes/{manut_id}/status",
        headers=headers_prog,
        json={
            "status": "tryout",
            "tryout_setor": "estamparia",
            "tryout_prensa": "PR-109",
            "tryout_ferramenta": "MAT-TRYOUT-1",
            "tryout_inicio": "2026-10-20T14:00:00",
            "tryout_fim": "2026-10-20T16:00:00",
            "observacoes": "Agendado para o 2º turno",
        },
    )
    assert resp_ok.status_code == 200
    assert resp_ok.json()["status"] == "tryout"
    assert resp_ok.json()["tryout_prensa"] == "PR-109"

    # 8. Teste de Liberação Direta da bancada (sem tryout)
    resp2 = client.post(
        "/ferramentaria/manutencoes",
        headers=headers_ferr,
        json={"material": "MAT-DIRETO-2", "motivo_quebra": "Troca de mola"},
    )
    id2 = resp2.json()["id"]
    client.patch(
        f"/ferramentaria/manutencoes/{id2}/status",
        headers=headers_ferr,
        json={"status": "em_manutencao"},
    )
    # Ferramenteiro libera direto para disponivel!
    resp_lib_direto = client.patch(
        f"/ferramentaria/manutencoes/{id2}/status",
        headers=headers_ferr,
        json={"status": "disponivel", "observacoes": "Mola trocada e testada manualmente."},
    )
    assert resp_lib_direto.status_code == 200
    assert resp_lib_direto.json()["status"] == "disponivel"

