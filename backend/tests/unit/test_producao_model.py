import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import Base
from app.models.producao import ItemProducao, ItemProducaoStaging
from app.models.user import User


def test_item_producao_staging_persists_and_reads_back():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[User.__table__, ItemProducaoStaging.__table__])

    with Session(engine) as session:
        session.add(
            ItemProducaoStaging(
                usuario_id=1, material="TEST001",
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1",
                status=2, sequencia=1, kanbans=3, qtd_por_kanban=10,
                tempo_por_peca_minutos=0.5, demanda=100, saldo_estoque=60,
                is_critico=False,
            )
        )
        session.commit()

        persisted = session.query(ItemProducaoStaging).filter_by(linha="L1").one()
        assert persisted.patan == "A"
        assert persisted.saldo_estoque == 60
        assert persisted.usuario_id == 1
        assert persisted.material == "TEST001"


def test_item_producao_defaults_em_producao_false():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[ItemProducao.__table__])

    with Session(engine) as session:
        item = ItemProducao(
            linha="L1", turno=1, patan="A", posto_trabalho="posto-1",
            status=2, sequencia=1, kanbans=3, qtd_por_kanban=10,
            tempo_por_peca_minutos=0.5, is_critico=False,
        )
        session.add(item)
        session.commit()

        persisted = session.query(ItemProducao).filter_by(linha="L1").one()
        assert persisted.em_producao is False


def test_item_producao_rejects_duplicate_sequencia_in_same_posto():
    # Regression guard for M1: (linha, turno, patan, posto_trabalho,
    # sequencia) must be unique at the DB level - this is the last-resort
    # guard behind the application-level fixes for I1/I2, in case anything
    # else ever tries to write a colliding row.
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[ItemProducao.__table__])

    with Session(engine) as session:
        session.add(
            ItemProducao(
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1",
                status=2, sequencia=1, kanbans=1, qtd_por_kanban=1,
                tempo_por_peca_minutos=1, is_critico=False,
            )
        )
        session.commit()

        session.add(
            ItemProducao(
                linha="L1", turno=1, patan="A", posto_trabalho="posto-1",
                status=2, sequencia=1, kanbans=2, qtd_por_kanban=2,
                tempo_por_peca_minutos=2, is_critico=False,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
