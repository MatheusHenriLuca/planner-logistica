import pytest

from app.domain.patan import Patan


def test_patan_has_exactly_eight_single_letter_members():
    # Regression guard: Patan was historically miscoded as an 8-character
    # string; it is one letter, A-H, per the confirmed business rule.
    assert [p.value for p in Patan] == ["A", "B", "C", "D", "E", "F", "G", "H"]
    assert all(len(p.value) == 1 for p in Patan)


def test_patan_rejects_value_outside_a_to_h():
    with pytest.raises(ValueError):
        Patan("Z")
