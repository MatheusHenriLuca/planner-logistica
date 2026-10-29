from datetime import datetime, timezone, timedelta
from app.domain.catalogo_estamparia import obter_embalagem_estamparia, obter_mp_estamparia
from app.domain.catalogo_embalagens import obter_embalagem
from app.core.datetime_utils import agora_brasilia, TZ_BRASILIA


def test_obter_embalagem_estamparia():
    # Item oficial do teste do usuário: I25006EB6C
    assert obter_embalagem_estamparia("I25006EB6C") == "24 35 704"
    # Prefixo de 8 caracteres
    assert obter_embalagem_estamparia("I25006EB6") == "24 35 704"
    # None ou vazio
    assert obter_embalagem_estamparia(None) is None
    assert obter_embalagem_estamparia("") is None


def test_obter_mp_estamparia():
    # Item oficial do teste do usuário: I25006EB6C -> I060548B6A com 0.526 kg/peça
    res = obter_mp_estamparia("I25006EB6C")
    assert res is not None
    mp_cod, consumo = res
    assert mp_cod == "I060548B6A"
    assert consumo == 0.526

    # Prefixo
    res_pref = obter_mp_estamparia("I25006EB6")
    assert res_pref is not None
    assert res_pref[0] == "I060548B6A"
    assert res_pref[1] == 0.526

    # Item do exemplo de áudio do usuário: H03161EB6A / H0316EB6 -> H000688B6A com 0.021 kg/peça
    res_h0316 = obter_mp_estamparia("H03161EB6A")
    assert res_h0316 is not None
    assert res_h0316[0] == "H000688B6A"
    assert res_h0316[1] == 0.021

    res_h0316_var = obter_mp_estamparia("H0316EB6")
    assert res_h0316_var is not None
    assert res_h0316_var[0] == "H000688B6A"
    assert res_h0316_var[1] == 0.021
    assert obter_embalagem_estamparia("H03161EB6A") == "24 35 703"

    # Peça dupla com dois materiais no título
    res_dupla = obter_mp_estamparia("L34002EB6A / L34003EB6A")
    assert res_dupla is not None
    assert res_dupla[0] == "L002528B6A"
    assert res_dupla[1] == 0.177
    assert obter_embalagem_estamparia("L34002EB6A / L34003EB6A") == "24 35 704"


def test_obter_embalagem_unificado():
    # Para setor estamparia
    assert obter_embalagem("I25006EB6C", setor="estamparia") == "24 35 704"
    # Para setor solda (ex: I001000B6A)
    assert obter_embalagem("I001000B6A", setor="solda") == "24 35 509"


def test_agora_brasilia():
    agora = agora_brasilia()
    assert agora.tzinfo is None  # Deve ser ingênuo para salvar no banco
    # A diferença entre UTC e agora_brasilia deve ser de aproximadamente 3 horas (10800 segundos)
    utc_now = datetime.now(timezone.utc).replace(tzinfo=None)
    diff_segundos = (utc_now - agora).total_seconds()
    # Em horário padrão de Brasília (UTC-3), utc - brasilia ~ 10800s (com tolerância de 5 segundos)
    assert abs(diff_segundos - 10800) < 5
