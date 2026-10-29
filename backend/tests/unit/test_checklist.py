import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.models.colaboracao import ChecklistItem
from app.models.producao import ItemProducao
from app.models.user import User
from app.repositories.colaboracao_repository import (
    CHECKLIST_ESTAMPARIA,
    CHECKLIST_SOLDA,
    listar_checklist,
    seed_checklist_padrao,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            ItemProducao.__table__,
            ChecklistItem.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def test_constantes_checklist_oficiais():
    """Valida que as listas de verificação contêm exatamente os itens especificados."""
    assert len(CHECKLIST_ESTAMPARIA) == 8
    assert CHECKLIST_ESTAMPARIA == [
        "(FERRAMENTARIA) FERRAMENTA DISPONÍVEL",
        "(RECEBIMENTO) MATÉRIA PRIMA",
        "(PRODUÇÃO) PRÉ-SETUP",
        "(PRODUÇÃO) FECHAMENTO",
        "(QUALIDADE) LIBERAÇÃO FIM DE PRODUÇÃO",
        "(FERRAMENTARIA) FERRAMENTA LIBERADA",
        "(SAP) LIMPEZA CABECEIRA",
        "(SAP) LIMPEZA WIP1",
    ]

    assert len(CHECKLIST_SOLDA) == 5
    assert CHECKLIST_SOLDA == [
        "1 - (ABASTECIMENTO) ESTAMPADO ABASTECIDO",
        "2 - (ABASTECIMENTO) EMBALAGEM E VTOV ABASTECIDOS",
        "3 - (PRODUÇÃO) PRÉ-SETUP",
        "4 - (PRODUÇÃO) FECHAMENTO",
        "5 - LIMPEZA WIP2 OU DTR3",
    ]


def test_seed_checklist_estamparia(db):
    """Tarefas de Estamparia recebem exatamente os 8 itens oficiais, não concluídos."""
    item = ItemProducao(
        linha="LINHA 1",
        turno=1,
        patan="A",
        posto_trabalho="PR-110",
        sequencia=1,
        kanbans=1,
        qtd_por_kanban=10,
        tempo_por_peca_minutos=1.0,
        setor="estamparia",
    )
    db.add(item)
    db.flush()

    seed_checklist_padrao(db, item.id, setor="estamparia")

    itens = listar_checklist(db, item.id)
    assert len(itens) == 8
    assert [i.ordem for i in itens] == list(range(1, 9))
    assert [i.texto for i in itens] == CHECKLIST_ESTAMPARIA
    assert all(i.concluido is False for i in itens)


def test_seed_checklist_solda(db):
    """Tarefas de Solda recebem exatamente os 5 itens oficiais, não concluídos."""
    item = ItemProducao(
        linha="LINHA 1",
        turno=1,
        patan="A",
        posto_trabalho="SB6A",
        sequencia=1,
        kanbans=1,
        qtd_por_kanban=10,
        tempo_por_peca_minutos=1.0,
        setor="solda",
    )
    db.add(item)
    db.flush()

    seed_checklist_padrao(db, item.id, setor="solda")

    itens = listar_checklist(db, item.id)
    assert len(itens) == 5
    assert [i.ordem for i in itens] == list(range(1, 6))
    assert [i.texto for i in itens] == CHECKLIST_SOLDA
    assert all(i.concluido is False for i in itens)


def test_seed_checklist_infere_setor_do_item(db):
    """Quando setor não é passado, seed_checklist_padrao busca no próprio ItemProducao."""
    item_est = ItemProducao(
        linha="LINHA 1",
        turno=1,
        patan="A",
        posto_trabalho="PR-108",
        sequencia=1,
        kanbans=1,
        qtd_por_kanban=10,
        tempo_por_peca_minutos=1.0,
        setor="estamparia",
    )
    item_sol = ItemProducao(
        linha="LINHA 1",
        turno=1,
        patan="A",
        posto_trabalho="SB6B",
        sequencia=1,
        kanbans=1,
        qtd_por_kanban=10,
        tempo_por_peca_minutos=1.0,
        setor="solda",
    )
    db.add_all([item_est, item_sol])
    db.flush()

    seed_checklist_padrao(db, item_est.id)
    seed_checklist_padrao(db, item_sol.id)

    itens_est = listar_checklist(db, item_est.id)
    itens_sol = listar_checklist(db, item_sol.id)

    assert len(itens_est) == 8
    assert [i.texto for i in itens_est] == CHECKLIST_ESTAMPARIA

    assert len(itens_sol) == 5
    assert [i.texto for i in itens_sol] == CHECKLIST_SOLDA
