import pytest
from pydantic import ValidationError

from app.schemas.producao import BulkSubmitRequest, ItemProducaoBulkIn


def _item(**overrides):
    base = {
        "linha": "L1", "turno": 1, "patan": "A", "posto_trabalho": "posto-1",
        "status": 2, "sequencia": 1, "kanbans": 3, "qtd_por_kanban": 10,
        "tempo_por_peca_minutos": 0.5,
    }
    base.update(overrides)
    return base


def test_bulk_submit_request_accepts_valid_payload():
    request = BulkSubmitRequest(
        linha="L1", turno=1, patan="A", itens=[ItemProducaoBulkIn(**_item())]
    )
    assert request.itens[0].patan.value == "A"


def test_item_producao_bulk_in_rejects_invalid_patan():
    with pytest.raises(ValidationError):
        ItemProducaoBulkIn(**_item(patan="Z"))


def test_item_producao_bulk_in_rejects_invalid_status():
    with pytest.raises(ValidationError):
        ItemProducaoBulkIn(**_item(status=7))


def test_item_producao_bulk_in_defaults_id_to_none_for_new_items():
    item = ItemProducaoBulkIn(**_item())
    assert item.id is None
