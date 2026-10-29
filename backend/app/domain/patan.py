from enum import Enum
from typing import Any

from pydantic_core import core_schema

# Patans da Solda (ciclo de 8 dias: A a H)
PATANS_SOLDA: list[str] = ["A", "B", "C", "D", "E", "F", "G", "H"]

# Patans da Estamparia (ciclo de 64 dias com sub-patans: A a P)
PATANS_ESTAMPARIA: list[str] = [
    "A", "B", "C", "C1", "C2", "C3", "C4",
    "D", "D1", "D2",
    "E", "E1", "E2", "E3", "E4",
    "F", "F1", "F2", "F3", "F4",
    "G", "G1", "G2",
    "H", "H1", "H2", "H3", "H4",
    "I",
    "J", "J1", "J2",
    "K", "K1", "K2", "K3", "K4",
    "L", "L1", "L2", "L3", "L4",
    "M", "M1", "M2",
    "N", "N1", "N2",
    "O", "O1", "O2", "O3", "O4",
    "P", "P1", "P2",
]


class PatanStr(str):
    """String que representa um Patan válido (Solda ou Estamparia) com compatibilidade com atributo .value."""

    @property
    def value(self) -> str:
        return str(self)

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type: Any, handler: Any) -> core_schema.CoreSchema:
        def validate(value: Any) -> "PatanStr":
            if hasattr(value, "value"):
                value = value.value
            s = str(value).strip().upper()
            if s not in PATANS_SOLDA and s not in PATANS_ESTAMPARIA:
                raise ValueError(
                    f"Patan inválido: '{s}'. Deve ser um dos patans aceitos de Solda (A-H) ou Estamparia (A-P com sub-patans)."
                )
            return PatanStr(s)

        return core_schema.chain_schema([
            core_schema.str_schema(),
            core_schema.no_info_plain_validator_function(validate),
        ])


class Patan(str, Enum):
    """A production line's requesting Patan — always exactly one letter, A-H (Solda)."""

    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"
    F = "F"
    G = "G"
    H = "H"


def validar_patan(patan: str, setor: str = "solda") -> bool:
    """Valida se o patan é aceito no setor correspondente."""
    p = str(patan).strip().upper()
    if setor == "estamparia":
        return p in PATANS_ESTAMPARIA
    return p in PATANS_SOLDA


