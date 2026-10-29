import { describe, expect, it } from "vitest";
import { parseCardDadosProducao } from "./cardComponents";
import { PlanItemStatus, type ItemProducao } from "../types/producao";

describe("cardComponents utils", () => {
  it("calcula duração e alerta de lote curto (< 60 min) na estamparia", () => {
    const itemEstampariaCurto: ItemProducao = {
      id: 1,
      setor: "estamparia",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "PR-92",
      status: PlanItemStatus.Normal,
      sequencia: 1,
      hora_inicial: "2026-10-20T06:20:00",
      hora_final: "2026-10-20T07:05:00", // 45 minutos
      almoco_incluso: false,
      kanbans: 5,
      qtd_por_kanban: 10,
      tempo_por_peca_minutos: 0.9,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
    };

    const res = parseCardDadosProducao(itemEstampariaCurto);
    expect(res.isEstamparia).toBe(true);
    expect(res.duracaoMinutos).toBe(45);
    expect(res.isAlertaCurtoEstamparia).toBe(true);
  });

  it("não dispara alerta se lote na estamparia for >= 60 min", () => {
    const itemEstampariaLongo: ItemProducao = {
      id: 2,
      setor: "estamparia",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "PR-92",
      status: PlanItemStatus.Normal,
      sequencia: 1,
      hora_inicial: "2026-10-20T06:20:00",
      hora_final: "2026-10-20T08:55:00", // 155 minutos
      almoco_incluso: false,
      kanbans: 45,
      qtd_por_kanban: 80,
      tempo_por_peca_minutos: 0.043,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
    };

    const res = parseCardDadosProducao(itemEstampariaLongo);
    expect(res.isEstamparia).toBe(true);
    expect(res.duracaoMinutos).toBe(155);
    expect(res.isAlertaCurtoEstamparia).toBe(false);
  });

  it("calcula paletes completos e quebra para estamparia (20 cxs por palete)", () => {
    const item: ItemProducao = {
      id: 3,
      setor: "estamparia",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "PR-92",
      status: PlanItemStatus.Normal,
      sequencia: 1,
      hora_inicial: null,
      hora_final: null,
      almoco_incluso: false,
      kanbans: 45,
      qtd_por_kanban: 80,
      tempo_por_peca_minutos: 0.1,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
    };

    const res = parseCardDadosProducao(item);
    expect(res.dadosEstamparia.paletesCompletos).toBe(2); // 40 cxs
    expect(res.dadosEstamparia.cxsCompletas).toBe(40);
    expect(res.dadosEstamparia.paletesQuebra).toBe(1); // 5 cxs
    expect(res.dadosEstamparia.cxsQuebra).toBe(5);
  });

  it("parseia componentes de solda a partir de comp_comb com classificação VtoV e Estampado", () => {
    const compCombStr =
      "L050637B6A|1|SUPORTE GUIA|500|0$$$$L19201EB6C|1|REFORCO ESTAMPADO|100|0$$$$L051097B6A|1|PINO FIXACAO|250|0";
    const itemSolda: ItemProducao = {
      id: 4,
      setor: "solda",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "Ponteadeira 23",
      status: PlanItemStatus.Normal,
      sequencia: 1,
      hora_inicial: null,
      hora_final: null,
      almoco_incluso: false,
      kanbans: 17,
      qtd_por_kanban: 12, // totalPecas = 204
      tempo_por_peca_minutos: 0.2,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
      comp_comb: compCombStr,
    };

    const res = parseCardDadosProducao(itemSolda);
    expect(res.componentesSolda.length).toBe(3);

    // L050637B6A -> VtoV
    expect(res.componentesSolda[0].codigo).toBe("L050637B6A");
    expect(res.componentesSolda[0].tipo).toBe("VtoV");
    expect(res.componentesSolda[0].qtdNecessaria).toBe(204);
    expect(res.componentesSolda[0].temFalta).toBe(false); // 500 >= 204

    // L19201EB6C -> EST (tem 'EB' no código)
    expect(res.componentesSolda[1].codigo).toBe("L19201EB6C");
    expect(res.componentesSolda[1].tipo).toBe("EST");
    expect(res.componentesSolda[1].qtdNecessaria).toBe(204);
    expect(res.componentesSolda[1].temFalta).toBe(true); // 100 < 204 (saldo insuficiente)
  });

  it("não exibe alerta de lote curto quando estiver na tela de Produção (isProgramacao: false)", () => {
    const itemEstampariaCurto: ItemProducao = {
      id: 5,
      setor: "estamparia",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "PR-92",
      status: PlanItemStatus.Normal,
      sequencia: 1,
      hora_inicial: "2026-10-20T06:20:00",
      hora_final: "2026-10-20T07:05:00", // 45 minutos
      almoco_incluso: false,
      kanbans: 5,
      qtd_por_kanban: 10,
      tempo_por_peca_minutos: 0.9,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
    };

    const res = parseCardDadosProducao(itemEstampariaCurto, { isProgramacao: false });
    expect(res.isEstamparia).toBe(true);
    expect(res.duracaoMinutos).toBe(45);
    expect(res.isAlertaCurtoEstamparia).toBe(false); // Suprimido na Produção!
  });

  it("respeita limite customizado de lote curto via parâmetro", () => {
    const itemEstampariaMedio: ItemProducao = {
      id: 6,
      setor: "estamparia",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "PR-92",
      status: PlanItemStatus.Normal,
      sequencia: 1,
      hora_inicial: "2026-10-20T06:20:00",
      hora_final: "2026-10-20T07:35:00", // 75 minutos
      almoco_incluso: false,
      kanbans: 5,
      qtd_por_kanban: 10,
      tempo_por_peca_minutos: 0.9,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
    };

    // Com limite padrão de 60 min -> não é curto
    const resPadrao = parseCardDadosProducao(itemEstampariaMedio, { limiteLoteCurtoMinutos: 60 });
    expect(resPadrao.isAlertaCurtoEstamparia).toBe(false);
    expect(resPadrao.isLoteCurto).toBe(false);

    // Com limite parametrizado de 90 min -> é curto!
    const resParam = parseCardDadosProducao(itemEstampariaMedio, { limiteLoteCurtoMinutos: 90 });
    expect(resParam.isAlertaCurtoEstamparia).toBe(true);
    expect(resParam.isLoteCurto).toBe(true);
    expect(resParam.limiteLoteCurtoAplicavel).toBe(90);
  });

  it("calcula lote curto para a solda com parâmetro independente", () => {
    const itemSoldaCurto: ItemProducao = {
      id: 7,
      setor: "solda",
      linha: "LINHA SOLDA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "PONTE 23",
      material: "PC-SOLDA-01",
      status: PlanItemStatus.Normal,
      sequencia: 1,
      hora_inicial: "2026-10-20T06:20:00",
      hora_final: "2026-10-20T07:05:00", // 45 minutos
      almoco_incluso: false,
      kanbans: 3,
      qtd_por_kanban: 15,
      tempo_por_peca_minutos: 1.0,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
    };

    // Com limite de solda em 60 min -> é lote curto na solda!
    const resSoldaCurto = parseCardDadosProducao(itemSoldaCurto, {
      limiteLoteCurtoMinutos: 90, // Estamparia em 90 não afeta solda
      limiteLoteCurtoSoldaMinutos: 60,
      isProgramacao: true,
    });
    expect(resSoldaCurto.isSolda).toBe(true);
    expect(resSoldaCurto.isEstamparia).toBe(false);
    expect(resSoldaCurto.duracaoMinutos).toBe(45);
    expect(resSoldaCurto.isAlertaCurtoSolda).toBe(true);
    expect(resSoldaCurto.isAlertaCurtoEstamparia).toBe(false);
    expect(resSoldaCurto.isLoteCurto).toBe(true);
    expect(resSoldaCurto.limiteLoteCurtoAplicavel).toBe(60);

    // Com limite de solda ajustado para 30 min -> deixa de ser lote curto na solda!
    const resSoldaAjustado = parseCardDadosProducao(itemSoldaCurto, {
      limiteLoteCurtoMinutos: 90,
      limiteLoteCurtoSoldaMinutos: 30,
      isProgramacao: true,
    });
    expect(resSoldaAjustado.isAlertaCurtoSolda).toBe(false);
    expect(resSoldaAjustado.isLoteCurto).toBe(false);
    expect(resSoldaAjustado.limiteLoteCurtoAplicavel).toBe(30);

    // Na tela de produção (isProgramacao = false), lote curto de solda NUNCA é exibido
    const resSoldaProducao = parseCardDadosProducao(itemSoldaCurto, {
      limiteLoteCurtoSoldaMinutos: 60,
      isProgramacao: false,
    });
    expect(resSoldaProducao.isAlertaCurtoSolda).toBe(false);
    expect(resSoldaProducao.isLoteCurto).toBe(false);
  });

  it("resolve embalagem e matéria-prima da estamparia via catálogo com cálculo de KG", () => {
    const itemEstamparia: ItemProducao = {
      id: 99,
      setor: "estamparia",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "PR-92",
      material: "I25006EB6C",
      status: PlanItemStatus.Normal,
      sequencia: 1,
      hora_inicial: "2026-10-26T06:20:00",
      hora_final: "2026-10-26T08:00:00",
      almoco_incluso: false,
      kanbans: 20,
      qtd_por_kanban: 50, // totalPecas = 1000
      tempo_por_peca_minutos: 0.1,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
    };

    const res = parseCardDadosProducao(itemEstamparia);
    expect(res.isEstamparia).toBe(true);
    expect(res.embalagem).toBe("24 35 704");
    expect(res.dadosEstamparia.embalagem).toBe("24 35 704");
    expect(res.dadosEstamparia.materiaPrimaCodigo).toBe("I060548B6A");
    // 1000 peças * 0.526 kg/peça = 526 KG
    expect(res.dadosEstamparia.materiaPrimaKg).toBe(526);
  });

  it("resolve matéria-prima e cálculo de KG para H0316EB6 / H03161EB6A da baseMP.XLSX", () => {
    const itemH0316: ItemProducao = {
      id: 100,
      setor: "estamparia",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "PR-93",
      material: "H03161EB6A",
      status: PlanItemStatus.Normal,
      sequencia: 1,
      hora_inicial: "2026-10-26T06:20:00",
      hora_final: "2026-10-26T08:00:00",
      almoco_incluso: false,
      kanbans: 10,
      qtd_por_kanban: 100, // totalPecas = 1000
      tempo_por_peca_minutos: 0.1,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
    };

    const res = parseCardDadosProducao(itemH0316);
    expect(res.isEstamparia).toBe(true);
    expect(res.embalagem).toBe("24 35 703");
    expect(res.dadosEstamparia.materiaPrimaCodigo).toBe("H000688B6A");
    // 1000 peças * 0.021 kg/peça = 21 KG
    expect(res.dadosEstamparia.materiaPrimaKg).toBe(21);

    // Testar com variação H0316EB6
    const resVar = parseCardDadosProducao({ ...itemH0316, material: "H0316EB6" });
    expect(resVar.dadosEstamparia.materiaPrimaCodigo).toBe("H000688B6A");
    expect(resVar.dadosEstamparia.materiaPrimaKg).toBe(21);
  });

  it("resolve MP, KG e embalagem para peça dupla com dois materiais no título (ex: L34002EB6A / L34003EB6A)", () => {
    const itemDupla: ItemProducao = {
      id: 101,
      setor: "estamparia",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "PR-92",
      material: "L34002EB6A / L34003EB6A",
      status: PlanItemStatus.Normal,
      sequencia: 2,
      hora_inicial: "2026-10-26T06:20:00",
      hora_final: "2026-10-26T07:20:00",
      almoco_incluso: false,
      kanbans: 10,
      qtd_por_kanban: 100, // totalPecas = 1000
      tempo_por_peca_minutos: 0.06,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
    };

    const res = parseCardDadosProducao(itemDupla);
    expect(res.isEstamparia).toBe(true);
    expect(res.embalagem).toBe("24 35 704");
    expect(res.dadosEstamparia.materiaPrimaCodigo).toBe("L002528B6A");
    // 1000 peças * 0.177 kg/peça = 177 KG
    expect(res.dadosEstamparia.materiaPrimaKg).toBe(177);
    expect(res.dadosEstamparia.ferramenta).toBe("FERR. - L34002EB6A / L34003EB6A");
  });

  it("extrai matéria-prima e KG das anotações mesmo com traço em-dash '—' ou en-dash '–'", () => {
    const itemComAnotacoes: ItemProducao = {
      id: 102,
      setor: "estamparia",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "PR-92",
      material: "CUSTOM_PART",
      status: PlanItemStatus.Normal,
      sequencia: 3,
      hora_inicial: null,
      hora_final: null,
      almoco_incluso: false,
      kanbans: 5,
      qtd_por_kanban: 50,
      tempo_por_peca_minutos: 0.1,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
      anotacoes: "PALETIZAÇÃO: 1P (250 cx)\nMATÉRIA-PRIMA: H000688B6A — 21.5 KG\nFERRAMENTA: FERR. - CUSTOM_PART",
    };

    const res = parseCardDadosProducao(itemComAnotacoes);
    expect(res.dadosEstamparia.materiaPrimaCodigo).toBe("H000688B6A");
    expect(res.dadosEstamparia.materiaPrimaKg).toBe(21.5);
  });

  it("correlaciona MP da estamparia com saldo do MB52 em comp_comb e diagnostica falta de matéria-prima", () => {
    // Exemplo: B00601EB6A -> MP: B001128B6A, consumo: 0.209 kg/pç, estoque: 1777.7 kg
    // Caso 1: 5000 peças * 0.209 = 1045 kg <= 1777.7 kg -> sem falta (temFalta = false)
    const itemSemFalta: ItemProducao = {
      id: 201,
      setor: "estamparia",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "PR-93",
      material: "B00601EB6A",
      status: PlanItemStatus.Normal,
      sequencia: 1,
      hora_inicial: "2026-10-26T06:20:00",
      hora_final: "2026-10-26T07:20:00",
      almoco_incluso: false,
      kanbans: 50,
      qtd_por_kanban: 100, // totalPecas = 5000
      tempo_por_peca_minutos: 0.05,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
      comp_comb: "B001128B6A|0.209|MATERIA-PRIMA|1777.7",
    };

    const resSemFalta = parseCardDadosProducao(itemSemFalta, { isProgramacao: true });
    expect(resSemFalta.isEstamparia).toBe(true);
    expect(resSemFalta.componentesSolda).toHaveLength(0); // Não deve criar componentes de solda
    expect(resSemFalta.dadosEstamparia.materiaPrimaCodigo).toBe("B001128B6A");
    expect(resSemFalta.dadosEstamparia.materiaPrimaSaldoEstoque).toBe(1777.7);
    expect(resSemFalta.dadosEstamparia.materiaPrimaKg).toBe(1045);
    expect(resSemFalta.dadosEstamparia.materiaPrimaTemFalta).toBe(false);

    // Caso 2: Aumenta produção para 10.000 peças -> consumo = 2090 kg > 1777.7 kg -> falta (temFalta = true)
    const itemComFalta: ItemProducao = {
      ...itemSemFalta,
      kanbans: 100, // 100 * 100 = 10.000 peças
    };
    const resComFalta = parseCardDadosProducao(itemComFalta, { isProgramacao: true });
    expect(resComFalta.dadosEstamparia.materiaPrimaKg).toBe(2090);
    expect(resComFalta.dadosEstamparia.materiaPrimaTemFalta).toBe(true);

    // Caso 3: Fora da programação (ex: tela de Produção), nunca diagnostica falta
    const resProducao = parseCardDadosProducao(itemComFalta, { isProgramacao: false });
    expect(resProducao.dadosEstamparia.materiaPrimaTemFalta).toBe(false);
  });
});



