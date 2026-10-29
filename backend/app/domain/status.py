from enum import Enum


class PlanItemStatus(int, Enum):
    """State machine for a producao item. Never merge with RequestStatus."""

    EXCLUIDO = 0
    NORMAL = 2
    CRITICO = 3
    LOCKED = 9


class RequestStatus(str, Enum):
    """Unrelated STATUS field on the intake/request list. Two-value flag."""

    PENDING = "1"
    PROCESSED = "2"
