from dataclasses import dataclass


@dataclass(frozen=True)
class DiagnosticoEstoque:
    demanda: float
    saldo_disponivel: float
    tem_falta: bool


def diagnosticar_estoque(demanda: float, saldo: float) -> DiagnosticoEstoque:
    return DiagnosticoEstoque(
        demanda=demanda,
        saldo_disponivel=saldo,
        tem_falta=demanda > saldo,
    )
