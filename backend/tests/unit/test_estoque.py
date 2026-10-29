from app.domain.estoque import diagnosticar_estoque


def test_demanda_maior_que_saldo_sinaliza_falta():
    diagnostico = diagnosticar_estoque(demanda=100, saldo=60)
    assert diagnostico.tem_falta is True
    assert diagnostico.demanda == 100
    assert diagnostico.saldo_disponivel == 60


def test_demanda_menor_que_saldo_nao_sinaliza_falta():
    diagnostico = diagnosticar_estoque(demanda=40, saldo=60)
    assert diagnostico.tem_falta is False


def test_demanda_igual_ao_saldo_nao_sinaliza_falta():
    diagnostico = diagnosticar_estoque(demanda=60, saldo=60)
    assert diagnostico.tem_falta is False
