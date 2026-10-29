import pytest

from app.domain.status import PlanItemStatus, RequestStatus


def test_plan_item_status_matches_the_state_machine_values():
    assert PlanItemStatus.EXCLUIDO == 0
    assert PlanItemStatus.NORMAL == 2
    assert PlanItemStatus.CRITICO == 3
    assert PlanItemStatus.LOCKED == 9


def test_request_status_matches_string_values():
    assert RequestStatus.PENDING.value == "1"
    assert RequestStatus.PROCESSED.value == "2"


def test_plan_item_status_and_request_status_are_not_interchangeable():
    # Regression guard: the legacy system reuses the field name "STATUS" for
    # two unrelated state machines. They must never collide in this codebase.
    assert PlanItemStatus is not RequestStatus
    with pytest.raises(ValueError):
        PlanItemStatus("1")
    with pytest.raises(ValueError):
        RequestStatus(2)
