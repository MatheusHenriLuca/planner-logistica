"""Utilitários de data e hora para fuso horário oficial de Brasília (America/Sao_Paulo - UTC-3).

Garante que registros de tempo de produção (inicio_real, fim_real, data_quebra, etc.)
sejam salvos no fuso horário correto de operação fabril (UTC-3), imunes a variações de sistema operacional ou containers em UTC.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

# Fuso Horário Oficial de Brasília (UTC-3)
TZ_BRASILIA = timezone(timedelta(hours=-3))


def agora_brasilia() -> datetime:
    """Retorna datetime atual no fuso horário de Brasília (UTC-3), ingênuo para armazenamento em colunas sem timezone."""
    return datetime.now(TZ_BRASILIA).replace(tzinfo=None)


def para_brasilia_naive(dt: datetime | None) -> datetime | None:
    """Converte datetime (mesmo que com timezone/offset-aware UTC do ISO frontend) para horário de Brasília offset-naive.
    
    Evita o erro 'can't compare offset-naive and offset-aware datetimes' e previne o deslocamento de +3 horas.
    """
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(TZ_BRASILIA).replace(tzinfo=None)
    return dt

