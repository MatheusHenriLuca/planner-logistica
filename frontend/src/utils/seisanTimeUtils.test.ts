import { describe, expect, it } from "vitest";
import type { ItemProducao } from "../types/producao";
import {
  calcularLayoutFaixaRealizado,
  calcularLayoutFaixaSemSobreposicao,
  calcularPosicaoBloco,
  criarJanelaTemporal,
  formatarDataDDMM,
  formatarDuracaoSegundos,
  formatarHoraHHMM,
  formatarHoraHHMMSS,
  gerarMarcadoresHoras,
  gerarMarcadoresTempo,
} from "./seisanTimeUtils";

describe("seisanTimeUtils", () => {
  const dataBase = new Date(2026, 9, 6, 0, 0, 0); // 06 de outubro de 2026

  it("cria janela temporal de 24h cobrindo das 06:00 às 06:00 do dia seguinte", () => {
    const janela = criarJanelaTemporal(dataBase);
    expect(janela.duracaoMinutos).toBe(1440);
    expect(janela.inicioDate.getHours()).toBe(6);
    expect(janela.fimDate.getHours()).toBe(6);
  });

  it("cria janela focada no turno 1 (06:00 às 15:00 = 540 min)", () => {
    const janela = criarJanelaTemporal(dataBase, 1);
    expect(janela.duracaoMinutos).toBe(540);
    expect(janela.inicioDate.getHours()).toBe(6);
    expect(janela.fimDate.getHours()).toBe(15);
  });

  it("calcula posicao percentual de um bloco dentro da janela de 24h", () => {
    const janela = criarJanelaTemporal(dataBase);
    // 06:00 + 60 min = 07:00 (1 hora de 24 horas = ~4.166%)
    const inicio = new Date(2026, 9, 6, 6, 0, 0);
    const fim = new Date(2026, 9, 6, 7, 0, 0);

    const bloco = calcularPosicaoBloco(inicio, fim, janela);
    expect(bloco.visivel).toBe(true);
    expect(bloco.left).toBeCloseTo(0, 1);
    expect(bloco.width).toBeCloseTo(4.166, 1);
  });

  it("calcula bloco que vira a noite no 3º turno", () => {
    const janela = criarJanelaTemporal(dataBase);
    // 23:00 às 01:00 (2 horas)
    const inicio = new Date(2026, 9, 6, 23, 0, 0);
    const fim = new Date(2026, 9, 7, 1, 0, 0);

    const bloco = calcularPosicaoBloco(inicio, fim, janela);
    expect(bloco.visivel).toBe(true);
    // 06:00 às 23:00 = 17 horas = 17/24 = 70.83%
    expect(bloco.left).toBeCloseTo(70.83, 1);
    // 2 horas = 2/24 = 8.33%
    expect(bloco.width).toBeCloseTo(8.33, 1);
  });

  it("formata hora e data corretamente", () => {
    const d = new Date(2026, 9, 6, 14, 45, 0);
    expect(formatarHoraHHMM(d)).toBe("14:45");
    expect(formatarDataDDMM(d)).toBe("06/10");
  });

  it("gera marcadores de hora para a régua", () => {
    const janela = criarJanelaTemporal(dataBase, 1);
    const marcadores = gerarMarcadoresHoras(janela);
    expect(marcadores.length).toBeGreaterThanOrEqual(9);
    expect(marcadores[0].hora).toBe("06:00");
  });

  it("gera marcadores de tempo em granularidades macro e micro", () => {
    const janela = criarJanelaTemporal(dataBase, 1); // 9 horas (06:00 às 15:00)

    // Macro 2h
    const m2h = gerarMarcadoresTempo(janela, "macro_2h");
    expect(m2h.length).toBeGreaterThanOrEqual(4);
    expect(m2h[0].hora).toBe("06:00");

    // 15 minutos
    const m15m = gerarMarcadoresTempo(janela, "min_15m");
    expect(m15m.length).toBeGreaterThanOrEqual(30);
    expect(m15m[1].hora).toBe("06:15");
    expect(m15m[2].hora).toBe("06:30");
    expect(m15m[1].isHoraCheia).toBe(false);
    expect(m15m[0].isHoraCheia).toBe(true);

    // 5 minutos
    const m5m = gerarMarcadoresTempo(janela, "min_5m");
    expect(m5m.length).toBeGreaterThan(50);
    expect(m5m[1].hora).toBe("06:05");
  });

  it("formata hora com precisão de segundos e formata durações legíveis", () => {
    const d = new Date(2026, 9, 7, 9, 57, 36);
    expect(formatarHoraHHMMSS(d)).toBe("09:57:36");

    expect(formatarDuracaoSegundos(2.5)).toBe("3s");
    expect(formatarDuracaoSegundos(45)).toBe("45s");
    expect(formatarDuracaoSegundos(90)).toBe("1m 30s");
    expect(formatarDuracaoSegundos(3600)).toBe("1h");
    expect(formatarDuracaoSegundos(5170)).toBe("1h 26m");
  });

  function criarItemMock(overrides: Partial<ItemProducao> = {}): ItemProducao {
    return {
      id: 1,
      linha: "LINHA 2",
      turno: 1,
      patan: "A",
      posto_trabalho: "B642056",
      status: 2,
      sequencia: 0,
      hora_inicial: "2026-10-07T06:20:00.000Z",
      hora_final: "2026-10-07T08:00:00.000Z",
      almoco_incluso: false,
      kanbans: 2,
      qtd_por_kanban: 50,
      tempo_por_peca_minutos: 1.0,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
      material: "PECA-TESTE",
      em_producao: false,
      ...overrides,
    };
  }

  it("calcula layout da Faixa 3 com anti-colisão e visibilidade para lotes concluídos no mesmo minuto", () => {
    const janela = criarJanelaTemporal(new Date(2026, 9, 7, 0, 0, 0)); // 24h: 06:00 às 06:00

    // Simulação do cenário real do usuário (Posto B642056)
    // 3 lotes concluídos em rápida sucessão às 09:57, seguidos de 1 lote longo até 11:24 e 1 na fila às 23:00
    const itensTeste: ItemProducao[] = [
      criarItemMock({
        id: 170,
        linha: "LINHA 2",
        posto_trabalho: "B642056",
        turno: 1,
        patan: "A",
        sequencia: 0,
        material: "H03147SB6A",
        kanbans: 4,
        qtd_por_kanban: 300,
        inicio_real: "2026-10-07T09:57:36.324Z",
        fim_real: "2026-10-07T09:57:38.849Z",
        quantidade_produzida_real: 1200,
        em_producao: false,
      }),
      criarItemMock({
        id: 171,
        linha: "LINHA 2",
        posto_trabalho: "B642056",
        turno: 1,
        patan: "A",
        sequencia: 0,
        material: "L17937SB6F",
        kanbans: 3,
        qtd_por_kanban: 240,
        inicio_real: "2026-10-07T09:57:39.902Z",
        fim_real: "2026-10-07T09:57:42.852Z",
        quantidade_produzida_real: 720,
        em_producao: false,
      }),
      criarItemMock({
        id: 172,
        linha: "LINHA 2",
        posto_trabalho: "B642056",
        turno: 1,
        patan: "A",
        sequencia: 0,
        material: "L17947SB6F",
        kanbans: 2,
        qtd_por_kanban: 300,
        inicio_real: "2026-10-07T09:57:43.764Z",
        fim_real: "2026-10-07T11:24:10.772Z",
        quantidade_produzida_real: 600,
        em_producao: false,
      }),
      criarItemMock({
        id: 207,
        linha: "LINHA 2",
        posto_trabalho: "B642056",
        turno: 3,
        patan: "A",
        sequencia: 1,
        material: "L34620SB6A",
        kanbans: 4,
        qtd_por_kanban: 250,
        hora_inicial: "2026-10-07T23:00:00.000Z",
        hora_final: "2026-10-08T00:11:40.000Z",
        em_producao: false,
      }),
    ];

    const blocos = calcularLayoutFaixaRealizado(itensTeste, janela, 1400, "todos");

    // Todos os 4 blocos devem estar presentes e visíveis
    expect(blocos).toHaveLength(4);

    const [b170, b171, b172, b207] = blocos;

    // Verificar classificação
    expect(b170.tipo).toBe("concluido");
    expect(b170.isRapido).toBe(true);
    expect(b170.duracaoSegundos).toBe(3); // 2.525s arredonda para 3s

    expect(b171.tipo).toBe("concluido");
    expect(b171.isRapido).toBe(true);
    expect(b171.duracaoSegundos).toBe(3);

    expect(b172.tipo).toBe("concluido");
    expect(b172.isRapido).toBe(false);
    expect(b172.duracaoSegundos).toBeGreaterThan(5000); // ~86 minutos

    expect(b207.tipo).toBe("pendente");

    // ANTI-COLISÃO GARANTIDA: nenhum bloco sobrepõe o outro
    // O bloco 171 deve começar após o término do bloco 170
    expect(b171.leftPercent).toBeGreaterThanOrEqual(b170.leftPercent + b170.widthPercent);

    // O bloco 172 deve começar após o término do bloco 171 (NUNCA coberto pelo bloco grande)
    expect(b172.leftPercent).toBeGreaterThanOrEqual(b171.leftPercent + b171.widthPercent);

    // Cada bloco concluído tem largura mínima garantida (para ser clicável e visível)
    expect(b170.widthPercent).toBeGreaterThanOrEqual(3.0);
    expect(b171.widthPercent).toBeGreaterThanOrEqual(3.0);

    // O lote 207 (agendado para às 23:00) permanece em sua posição natural sem ser deslocado
    expect(b207.leftPercent).toBeGreaterThan(50.0);
  });

  it("calcula layout sem sobreposição (lado a lado) quando o item B começa no mesmo horário que A termina", () => {
    const janela = criarJanelaTemporal(dataBase, 1); // 06:00 às 15:00

    const itens = [
      { id: 1, material: "MAT-A", hora_inicial: "2026-10-06T06:20:00.000Z", hora_final: "2026-10-06T08:35:00.000Z" },
      { id: 2, material: "MAT-B", hora_inicial: "2026-10-06T08:35:00.000Z", hora_final: "2026-10-06T10:20:00.000Z" },
      { id: 3, material: "MAT-C", hora_inicial: "2026-10-06T11:00:00.000Z", hora_final: "2026-10-06T13:40:00.000Z" },
    ];

    const blocos = calcularLayoutFaixaSemSobreposicao(
      itens,
      (it) => it.hora_inicial,
      (it) => it.hora_final,
      janela,
      1800,
      3
    );

    expect(blocos).toHaveLength(3);

    const [blocoA, blocoB, blocoC] = blocos;

    // MAT-A e MAT-B: MAT-B começa exatamente onde MAT-A terminou, sem encavalar
    expect(blocoB.leftPercent).toBeGreaterThanOrEqual(blocoA.leftPercent + blocoA.widthPercent);

    // MAT-C começa após intervalo de almoço e não sobrepõe MAT-B
    expect(blocoC.leftPercent).toBeGreaterThanOrEqual(blocoB.leftPercent + blocoB.widthPercent);

    // MAT-A termina antes ou no início de MAT-B
    expect(blocoA.leftPercent + blocoA.widthPercent).toBeLessThanOrEqual(blocoB.leftPercent);
  });
});

