from datetime import datetime, timezone, timedelta
import pytest
from app.core.datetime_utils import para_brasilia_naive, TZ_BRASILIA
from app.services.mb52_service import obter_saldo_material


def test_para_brasilia_naive():
    # 1. Datetime com timezone UTC (vindo com Z do ISO do frontend)
    utc_dt = datetime(2026, 10, 27, 14, 40, 0, tzinfo=timezone.utc)
    res = para_brasilia_naive(utc_dt)
    assert res is not None
    assert res.tzinfo is None
    # 14:40 UTC -> 11:40 Brasília (UTC-3)
    assert res.hour == 11
    assert res.minute == 40

    # 2. Datetime já naive permanece idêntico
    naive_dt = datetime(2026, 10, 27, 8, 0, 0)
    res_naive = para_brasilia_naive(naive_dt)
    assert res_naive == naive_dt
    assert res_naive.tzinfo is None

    # 3. None retorna None
    assert para_brasilia_naive(None) is None


def test_obter_saldo_material_peca_simples():
    stock = {
        "H03161EB6A": 2500.0,
        "I25006EB6C": 350.0,
    }
    assert obter_saldo_material("H03161EB6A", stock) == 2500.0
    assert obter_saldo_material("I25006EB6C", stock) == 350.0
    assert obter_saldo_material("OUTRO", stock) == 0.0


def test_obter_saldo_material_peca_dupla():
    stock = {
        "L34002EB6A": 1000.0,
        "L34003EB6A": 450.0,
    }
    # Peça dupla deve pegar o menor saldo entre as metades (gargalo do conjunto)
    saldo = obter_saldo_material("L34002EB6A / L34003EB6A", stock)
    assert saldo == 450.0

    # Se uma das partes não tiver estoque, saldo é 0.0
    saldo_zero = obter_saldo_material("L34002EB6A / NAO_EXISTE", stock)
    assert saldo_zero == 0.0
