import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.domain.postos import normalizar_posto_trabalho
from app.models.colaboracao import ItemProducaoLabel, Label
from app.models.producao import ItemProducao
from app.models.user import User
from app.repositories.colaboracao_repository import (
    CATALOGO_PRENSAS_ESTAMPARIA,
    CATALOGO_PONTEADEIRAS_SOLDA,
    atualizar_anotacoes_item,
    seed_labels_catalogo,
    seed_labels_padrao,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            ItemProducao.__table__,
            Label.__table__,
            ItemProducaoLabel.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def test_normalizar_posto_trabalho():
    """Valida a conversão de códigos legados SAP para nomes reais de ponteadeiras (PONTE XX)."""
    assert normalizar_posto_trabalho("B642043") == "PONTE 43"
    assert normalizar_posto_trabalho("B642036") == "PONTE 36"
    assert normalizar_posto_trabalho("b642023") == "PONTE 23"
    assert normalizar_posto_trabalho("B642068") == "PONTE 68"
    assert normalizar_posto_trabalho("PONT 43") == "PONTE 43"
    assert normalizar_posto_trabalho("PONTEADEIRA 36") == "PONTE 36"
    assert normalizar_posto_trabalho("PONTE 43") == "PONTE 43"

    # Prensas da Estamparia devem ser preservadas
    assert normalizar_posto_trabalho("PR-108") == "PR-108"
    assert normalizar_posto_trabalho("PR-82") == "PR-82"
    assert normalizar_posto_trabalho("PRENSA 01") == "PRENSA 01"


def test_catalogo_e_auto_atribuicao_labels(db):
    """Valida a criação do catálogo e auto-associação de etiquetas às ordens."""
    seed_labels_catalogo(db)

    labels = db.query(Label).all()
    nomes = {l.nome for l in labels}

    # Verifica se prensas e ponteadeiras estão cadastradas
    assert "PR-108" in nomes
    assert "PR-82" in nomes
    assert "PONTE 43" in nomes
    assert "PONTE 36" in nomes

    # Cria um card na PONTE 43
    item = ItemProducao(
        linha="LINHA 1",
        turno=1,
        patan="A",
        posto_trabalho="PONTE 43",
        sequencia=1,
        kanbans=5,
        qtd_por_kanban=20,
        tempo_por_peca_minutos=0.5,
        setor="solda",
    )
    db.add(item)
    db.flush()

    # Associa a label padrão
    seed_labels_padrao(db, item.id, item.posto_trabalho)

    item_labels = db.query(ItemProducaoLabel).filter_by(item_producao_id=item.id).all()
    assert len(item_labels) == 1
    lbl = db.get(Label, item_labels[0].label_id)
    assert lbl.nome == "PONTE 43"



def test_atualizar_anotacoes_item(db):
    """Valida salvar anotações fixas do programador e visibilidade no quadro."""
    item = ItemProducao(
        linha="LINHA 1",
        turno=1,
        patan="A",
        posto_trabalho="Ponteadeira 36",
        sequencia=1,
        kanbans=4,
        qtd_por_kanban=50,
        tempo_por_peca_minutos=0.2,
        setor="solda",
        anotacoes=None,
        mostrar_anotacoes_quadro=False,
    )
    db.add(item)
    db.commit()

    texto_anotacoes = (
        "INÍCIO: 06:20 | TÉRMINO: 07:15\n"
        "TOTAL: 4 KANBANS (200 PÇS)\n"
        "ESTAMPADO: 50381395 | VTOV: EMB-01"
    )
    atualizado = atualizar_anotacoes_item(
        db,
        item_producao_id=item.id,
        anotacoes=texto_anotacoes,
        mostrar_no_quadro=True,
    )

    assert atualizado is not None
    assert atualizado.anotacoes == texto_anotacoes
    assert atualizado.mostrar_anotacoes_quadro is True

    # Valida releitura do banco
    recarregado = db.get(ItemProducao, item.id)
    assert recarregado.anotacoes == texto_anotacoes
    assert recarregado.mostrar_anotacoes_quadro is True
