from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.domain.patan import Patan
from app.domain.sequenciamento import Turno
from app.domain.status import PlanItemStatus
from app.models.colaboracao import ChecklistItem
from app.models.producao import ItemProducao, ItemProducaoStaging
from app.models.user import User
from app.repositories.producao_repository import (
    bulk_persist,
    get_pecas_criticas_by_linha,
    get_staging_itens,
    limpar_staging_apos_submit,
    reordenar_persistidos,
)
from app.schemas.producao import ItemProducaoBulkIn


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            ItemProducaoStaging.__table__,
            ItemProducao.__table__,
            ChecklistItem.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def _bulk_item(**overrides):
    base = {
        "id": None, "linha": "L1", "turno": Turno.PRIMEIRO, "patan": Patan.A,
        "posto_trabalho": "posto-1", "status": PlanItemStatus.NORMAL, "sequencia": 1,
        "kanbans": 3, "qtd_por_kanban": 10, "tempo_por_peca_minutos": 0.5,
    }
    base.update(overrides)
    return ItemProducaoBulkIn(**base)


def test_get_staging_itens_filters_by_linha_turno_patan(db_session):
    db_session.add_all([
        ItemProducaoStaging(
            usuario_id=1, material="M1",
            linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
            sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
            demanda=1, saldo_estoque=1, is_critico=False,
        ),
        ItemProducaoStaging(
            usuario_id=1, material="M2",
            linha="L1", turno=1, patan="B", posto_trabalho="posto-1", status=2,
            sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
            demanda=1, saldo_estoque=1, is_critico=False,
        ),
    ])
    db_session.commit()

    resultado = get_staging_itens(db_session, 1, "L1", 1, "A")

    assert len(resultado) == 1
    assert resultado[0].patan == "A"
    # Fallback check: different user without staging rows sees master staging
    assert len(get_staging_itens(db_session, 2, "L1", 1, "A")) == 1


def test_get_pecas_criticas_by_linha_ignores_patan_and_turno(db_session):
    db_session.add(
        ItemProducaoStaging(
            usuario_id=1, material="M1",
            linha="L1", turno=2, patan="C", posto_trabalho="posto-1", status=3,
            sequencia=0, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
            demanda=1, saldo_estoque=1, is_critico=True,
        )
    )
    db_session.commit()

    resultado = get_pecas_criticas_by_linha(db_session, 1, "L1")

    assert len(resultado) == 1
    assert resultado[0].is_critico is True
    # Fallback check: different user without staging rows sees master critical parts
    assert len(get_pecas_criticas_by_linha(db_session, 2, "L1")) == 1


def test_bulk_persist_is_scoped_and_never_touches_other_scopes(db_session):
    outro_escopo = ItemProducao(
        linha="L2", turno=1, patan="A", posto_trabalho="posto-1", status=2,
        sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
        is_critico=False, em_producao=False,
    )
    db_session.add(outro_escopo)
    db_session.commit()

    bulk_persist(db_session, "L1", 1, "A", [_bulk_item()])
    db_session.commit()

    # Regression guard: an unscoped delete would have wiped producao entirely
    # (the legacy bug this rule exists to prevent).
    ainda_existe = db_session.query(ItemProducao).filter_by(linha="L2").one_or_none()
    assert ainda_existe is not None


def test_bulk_persist_never_overwrites_em_producao_rows(db_session):
    em_producao = ItemProducao(
        linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
        sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
        is_critico=False, em_producao=True,
    )
    db_session.add(em_producao)
    db_session.commit()
    preservado_id = em_producao.id

    bulk_persist(db_session, "L1", 1, "A", [_bulk_item(sequencia=2)])
    db_session.commit()

    ainda_existe = db_session.get(ItemProducao, preservado_id)
    assert ainda_existe is not None
    assert ainda_existe.em_producao is True


def test_bulk_persist_appends_new_items_after_preserved_ones_in_same_posto(db_session):
    em_producao = ItemProducao(
        linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
        sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
        is_critico=False, em_producao=True,
    )
    db_session.add(em_producao)
    db_session.commit()

    persistidos = bulk_persist(db_session, "L1", 1, "A", [_bulk_item()])
    db_session.commit()

    assert persistidos[0].sequencia == 2


def test_bulk_persist_new_item_appends_after_submitted_items_own_sequencias(db_session):
    # Regression guard for I1: max_sequencia_por_posto must also be seeded
    # from the submitted items' OWN sequencia (id is not None), not only from
    # preserved em_producao rows - otherwise a new item (id=None) submitted
    # alongside existing items 1 and 2 in the same posto collides with one of
    # them instead of appending as 3.
    persistidos = bulk_persist(
        db_session,
        "L1",
        1,
        "A",
        [
            _bulk_item(id=1, sequencia=1),
            _bulk_item(id=2, sequencia=2),
            _bulk_item(id=None),
        ],
    )
    db_session.commit()

    sequencias = sorted(item.sequencia for item in persistidos)
    assert sequencias == [1, 2, 3]


def test_limpar_staging_apos_submit_removes_normal_scope_rows_but_keeps_other_scopes(
    db_session,
):
    db_session.add_all(
        [
            ItemProducaoStaging(
                usuario_id=1, material="M1",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=1, saldo_estoque=1, is_critico=False,
            ),
            ItemProducaoStaging(
                usuario_id=1, material="M2",
                linha="L1", turno=1, patan="B", posto_trabalho="posto-1", status=2,
                sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
                demanda=1, saldo_estoque=1, is_critico=False,
            ),
        ]
    )
    db_session.commit()

    limpar_staging_apos_submit(db_session, 1, "L1", 1, "A", [])
    db_session.commit()

    restantes = db_session.query(ItemProducaoStaging).all()
    # Itens normais continuam na staging como receita/modelo do Patan
    assert len(restantes) == 2


def test_limpar_staging_apos_submit_only_removes_specified_critico_ids(db_session):
    incluido = ItemProducaoStaging(
        usuario_id=1, material="M1",
        linha="L1", turno=2, patan="C", posto_trabalho="posto-1", status=3,
        sequencia=0, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
        demanda=1, saldo_estoque=1, is_critico=True,
    )
    outro = ItemProducaoStaging(
        usuario_id=1, material="M2",
        linha="L1", turno=3, patan="D", posto_trabalho="posto-1", status=3,
        sequencia=0, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
        demanda=1, saldo_estoque=1, is_critico=True,
    )
    db_session.add_all([incluido, outro])
    db_session.commit()

    limpar_staging_apos_submit(db_session, 1, "L1", 1, "A", [incluido.id])
    db_session.commit()

    restantes = db_session.query(ItemProducaoStaging).all()
    assert len(restantes) == 1
    assert restantes[0].id == outro.id


def test_reordenar_persistidos_updates_sequencia_and_preserves_horarios(db_session):
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
    db_session.add_all([item_a, item_b])
    db_session.commit()

    resultado = reordenar_persistidos(db_session, "L1", 1, "A", "posto-1", [item_b.id, item_a.id])
    db_session.commit()

    assert resultado is not None
    assert item_b.sequencia == 1
    assert item_a.sequencia == 2
    assert item_a.hora_inicial == datetime(2026, 8, 24, 6, 20)  # noqa: DTZ001
    assert item_b.hora_final == datetime(2026, 8, 24, 7, 20)  # noqa: DTZ001


def test_reordenar_persistidos_returns_none_when_id_belongs_to_different_posto(db_session):
    item_a = ItemProducao(
        linha="L1", turno=1, patan="A", posto_trabalho="posto-2", status=2,
        sequencia=1, kanbans=1, qtd_por_kanban=1, tempo_por_peca_minutos=1,
        is_critico=False, em_producao=False,
    )
    db_session.add(item_a)
    db_session.commit()

    resultado = reordenar_persistidos(db_session, "L1", 1, "A", "posto-1", [item_a.id])

    assert resultado is None
