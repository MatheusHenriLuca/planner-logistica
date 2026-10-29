import { describe, expect, it } from "vitest";

import { PlanItemStatus, type ItemProducao } from "../types/producao";
import {
  LUNCH_BREAK_LABEL,
  calcularCascata,
  calcularTempoProducaoMinutos,
  calcularTemFaltaEstoque,
  initialSequenciaState,
  sequenciaReducer,
} from "./sequenciaReducer";

function item(overrides: Partial<ItemProducao> = {}): ItemProducao {
  return {
    id: 1,
    linha: "L1",
    turno: 1,
    patan: "A",
    posto_trabalho: "posto-1",
    status: PlanItemStatus.Normal,
    sequencia: 1,
    hora_inicial: null,
    hora_final: null,
    almoco_incluso: false,
    kanbans: 1,
    qtd_por_kanban: 1,
    tempo_por_peca_minutos: 30,
    is_critico: false,
    tem_falta_estoque: false,
    coluna_extra_id: null,
    ...overrides,
  };
}

describe("calcularTempoProducaoMinutos", () => {
  it("applies the (kanbans x qtd_por_kanban) x tempo_por_peca formula", () => {
    expect(calcularTempoProducaoMinutos(3, 10, 0.5)).toBe(15);
  });
});

describe("calcularCascata", () => {
  it("starts the first item at the shift's fixed start time", () => {
    const dataBase = new Date(2026, 7, 24);
    const [resultado] = calcularCascata(1, dataBase, [
      item({ sequencia: 1, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 30 }),
    ]);
    expect(resultado.hora_inicial).toBe("2026-08-24T06:20:00");
  });

  it("chains the next item's start to the previous item's end", () => {
    const dataBase = new Date(2026, 7, 24);
    const itens = [
      item({ sequencia: 1, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 30 }),
      item({ sequencia: 2, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 20 }),
    ];
    const resultado = calcularCascata(1, dataBase, itens);
    expect(resultado[1].hora_inicial).toBe(resultado[0].hora_final);
  });

  it("adds the lunch break once when a window strictly crosses the meal instant", () => {
    const dataBase = new Date(2026, 7, 24);
    const itens = [
      item({ sequencia: 1, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 220 }), // 06:20 -> 10:00
      item({ sequencia: 2, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 40 }), // 10:00 -> 10:40 (+lunch)
    ];
    const resultado = calcularCascata(1, dataBase, itens);
    expect(resultado[0].almoco_incluso).toBe(false);
    expect(resultado[1].almoco_incluso).toBe(true);
    expect(resultado[1].hora_final).toBe("2026-08-24T11:20:00");
  });

  it("does not treat touching the meal instant exactly at a window boundary as crossing", () => {
    // Boundary tie-break: a window that only *touches* the meal instant at its
    // start or end (not strictly inside) must NOT trigger the lunch break.
    const dataBase = new Date(2026, 7, 24);
    const itens = [
      // 06:20 -> 10:20 : ends exactly ON the meal instant (turno 1 meal = 10:20).
      item({ sequencia: 1, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 240 }),
      // chained start lands exactly ON the meal instant (10:20) -> 10:50.
      item({ sequencia: 2, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 30 }),
    ];
    const resultado = calcularCascata(1, dataBase, itens);

    expect(resultado[0].almoco_incluso).toBe(false);
    expect(resultado[0].hora_final).toBe("2026-08-24T10:20:00");

    expect(resultado[1].hora_inicial).toBe(resultado[0].hora_final);
    expect(resultado[1].almoco_incluso).toBe(false);
    expect(resultado[1].hora_final).toBe("2026-08-24T10:50:00");
  });

  it("rolls turno 3's meal instant into the next calendar day", () => {
    const dataBase = new Date(2026, 7, 24);
    const itens = [
      item({ sequencia: 1, kanbans: 1, qtd_por_kanban: 1, tempo_por_peca_minutos: 300 }), // 23:00 -> 04:00
    ];
    const resultado = calcularCascata(3, dataBase, itens);
    expect(resultado[0].almoco_incluso).toBe(true);
    expect(resultado[0].hora_final).toBe("2026-08-25T04:40:00");
  });

  it("exposes the exact lunch label string", () => {
    expect(LUNCH_BREAK_LABEL).toBe("HORARIO DE ALMOCO INCLUSO");
  });
});

describe("sequenciaReducer", () => {
  it("CARREGAR groups by posto and computes the initial cascade", () => {
    const state = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase: new Date(2026, 7, 24).toISOString(),
        itens: [item({ posto_trabalho: "posto-1", sequencia: 1 })],
      },
    });
    expect(state.itensPorPosto["posto-1"][0].hora_inicial).not.toBeNull();
  });

  it("REORDENAR recalculates only the affected posto", () => {
    const dataBase = new Date(2026, 7, 24).toISOString();
    const loaded = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [
          item({ posto_trabalho: "posto-1", sequencia: 1, id: 1 }),
          item({
            posto_trabalho: "posto-1",
            sequencia: 2,
            id: 2,
            tempo_por_peca_minutos: 10,
          }),
        ],
      },
    });

    const reordenado = sequenciaReducer(loaded, {
      type: "REORDENAR",
      payload: {
        posto: "posto-1",
        itens: [
          { ...loaded.itensPorPosto["posto-1"][1], sequencia: 1 },
          { ...loaded.itensPorPosto["posto-1"][0], sequencia: 2 },
        ],
      },
    });

    expect(reordenado.itensPorPosto["posto-1"][0].id).toBe(2);
  });

  it("REORDENAR preserves the new array order even if items still carry their previous sequencia numbers", () => {
    const dataBase = new Date(2026, 7, 24).toISOString();
    const loaded = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [
          item({ posto_trabalho: "posto-1", sequencia: 1, id: 1 }),
          item({ posto_trabalho: "posto-1", sequencia: 2, id: 2 }),
        ],
      },
    });

    // Pass the items swapped in array order, but WITHOUT manually updating item.sequencia
    const reordenado = sequenciaReducer(loaded, {
      type: "REORDENAR",
      payload: {
        posto: "posto-1",
        itens: [
          loaded.itensPorPosto["posto-1"][1], // id: 2, sequencia: 2
          loaded.itensPorPosto["posto-1"][0], // id: 1, sequencia: 1
        ],
      },
    });

    // Item 2 must now be at index 0 with sequencia: 1
    expect(reordenado.itensPorPosto["posto-1"][0].id).toBe(2);
    expect(reordenado.itensPorPosto["posto-1"][0].sequencia).toBe(1);
    // Item 1 must now be at index 1 with sequencia: 2
    expect(reordenado.itensPorPosto["posto-1"][1].id).toBe(1);
    expect(reordenado.itensPorPosto["posto-1"][1].sequencia).toBe(2);
  });

  it("REORDENAR synchronizes tandem partner machines and keeps timing within shift", () => {
    const dataBase = "2026-10-23";
    const loaded = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [
          item({ id: 101, posto_trabalho: "PR-82", material: "MAT-T1", sequencia: 1, kanbans: 1, qtd_por_kanban: 10, tempo_por_peca_minutos: 1 }),
          item({ id: 102, posto_trabalho: "PR-82", material: "MAT-T2", sequencia: 2, kanbans: 1, qtd_por_kanban: 10, tempo_por_peca_minutos: 1 }),
          item({ id: 201, posto_trabalho: "PR-84", material: "MAT-T1", sequencia: 1, kanbans: 1, qtd_por_kanban: 10, tempo_por_peca_minutos: 1 }),
          item({ id: 202, posto_trabalho: "PR-84", material: "MAT-T2", sequencia: 2, kanbans: 1, qtd_por_kanban: 10, tempo_por_peca_minutos: 1 }),
        ],
      },
    });

    // Invert order on PR-82 to [MAT-T2, MAT-T1]
    const reordenado = sequenciaReducer(loaded, {
      type: "REORDENAR",
      payload: {
        posto: "PR-82",
        itens: [
          loaded.itensPorPosto["PR-82"][1],
          loaded.itensPorPosto["PR-82"][0],
        ],
      },
    });

    // PR-82 must be [MAT-T2, MAT-T1]
    expect(reordenado.itensPorPosto["PR-82"][0].material).toBe("MAT-T2");
    expect(reordenado.itensPorPosto["PR-82"][1].material).toBe("MAT-T1");

    // Partner machine PR-84 must also have been synchronized to [MAT-T2, MAT-T1]
    expect(reordenado.itensPorPosto["PR-84"][0].material).toBe("MAT-T2");
    expect(reordenado.itensPorPosto["PR-84"][1].material).toBe("MAT-T1");

    // Start time must start at 06:20 and NOT jump to next day or 1:00 AM!
    expect(reordenado.itensPorPosto["PR-82"][0].hora_inicial).toContain("06:20");
    expect(reordenado.itensPorPosto["PR-84"][0].hora_inicial).toContain("06:20");
    expect(reordenado.itensPorPosto["PR-82"][0].hora_inicial).toContain("2026-10-23");
  });

  it("REORDENAR on Linha 3 Estamparia keeps tandem alignment and stays strictly within shift without 3rd shift blowout", () => {
    const dataBase = "2026-10-26T00:00:00.000Z";
    const itensPR109 = [
      item({ id: 1, posto_trabalho: "PR-109", material: "L30401EB6A", kanbans: 4, qtd_por_kanban: 200, tempo_por_peca_minutos: 0.13375 }),
      item({ id: 2, posto_trabalho: "PR-109", material: "I25700AB6A", kanbans: 30, qtd_por_kanban: 40, tempo_por_peca_minutos: 0.08333 }),
      item({ id: 3, posto_trabalho: "PR-109", material: "K00901EB6B", kanbans: 2, qtd_por_kanban: 280, tempo_por_peca_minutos: 0.13571 }),
      item({ id: 4, posto_trabalho: "PR-109", material: "K20301EB6A", kanbans: 2, qtd_por_kanban: 200, tempo_por_peca_minutos: 0.1325 }),
      item({ id: 5, posto_trabalho: "PR-109", material: "K20100AB6A", kanbans: 2, qtd_por_kanban: 360, tempo_por_peca_minutos: 0.1069 }),
    ];
    const itensPR99 = [
      item({ id: 11, posto_trabalho: "PR-99", material: "L30401EB6A", kanbans: 4, qtd_por_kanban: 200, tempo_por_peca_minutos: 0.13375 }),
      item({ id: 12, posto_trabalho: "PR-99", material: "I25700AB6A", kanbans: 30, qtd_por_kanban: 40, tempo_por_peca_minutos: 0.08333 }),
      item({ id: 13, posto_trabalho: "PR-99", material: "K00901EB6B", kanbans: 2, qtd_por_kanban: 280, tempo_por_peca_minutos: 0.13571 }),
      item({ id: 14, posto_trabalho: "PR-99", material: "I27501EB6A", kanbans: 3, qtd_por_kanban: 200, tempo_por_peca_minutos: 0.14833 }),
      item({ id: 15, posto_trabalho: "PR-99", material: "L43200AB6A", kanbans: 4, qtd_por_kanban: 100, tempo_por_peca_minutos: 0.2025 }),
    ];
    const itensPR98 = [
      item({ id: 21, posto_trabalho: "PR-98", material: "I25700AB6A", kanbans: 30, qtd_por_kanban: 40, tempo_por_peca_minutos: 0.08333 }),
      item({ id: 22, posto_trabalho: "PR-98", material: "K00901EB6B", kanbans: 2, qtd_por_kanban: 280, tempo_por_peca_minutos: 0.13571 }),
      item({ id: 23, posto_trabalho: "PR-98", material: "I27501EB6A", kanbans: 3, qtd_por_kanban: 200, tempo_por_peca_minutos: 0.14833 }),
      item({ id: 24, posto_trabalho: "PR-98", material: "L43200AB6A", kanbans: 4, qtd_por_kanban: 100, tempo_por_peca_minutos: 0.2025 }),
    ];
    const itensPR97 = [
      item({ id: 31, posto_trabalho: "PR-97", material: "I25700AB6A", kanbans: 30, qtd_por_kanban: 40, tempo_por_peca_minutos: 0.08333 }),
      item({ id: 32, posto_trabalho: "PR-97", material: "K00901EB6B", kanbans: 2, qtd_por_kanban: 280, tempo_por_peca_minutos: 0.13571 }),
      item({ id: 33, posto_trabalho: "PR-97", material: "I27501EB6A", kanbans: 3, qtd_por_kanban: 200, tempo_por_peca_minutos: 0.14833 }),
      item({ id: 34, posto_trabalho: "PR-97", material: "L43200AB6A", kanbans: 4, qtd_por_kanban: 100, tempo_por_peca_minutos: 0.2025 }),
    ];

    const loaded = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [...itensPR109, ...itensPR99, ...itensPR98, ...itensPR97],
      },
    });

    // Swapping I275 with K009 on PR-99
    const filaPR99 = loaded.itensPorPosto["PR-99"];
    const novaFilaPR99 = [filaPR99[0], filaPR99[1], filaPR99[3], filaPR99[2], filaPR99[4]];

    const reordenado = sequenciaReducer(loaded, {
      type: "REORDENAR",
      payload: {
        posto: "PR-99",
        itens: novaFilaPR99,
      },
    });

    // Verify all machines have I275 before K009
    expect(reordenado.itensPorPosto["PR-99"][2].material).toBe("I27501EB6A");
    expect(reordenado.itensPorPosto["PR-99"][3].material).toBe("K00901EB6B");
    expect(reordenado.itensPorPosto["PR-98"][1].material).toBe("I27501EB6A");
    expect(reordenado.itensPorPosto["PR-98"][2].material).toBe("K00901EB6B");
    expect(reordenado.itensPorPosto["PR-97"][1].material).toBe("I27501EB6A");
    expect(reordenado.itensPorPosto["PR-97"][2].material).toBe("K00901EB6B");

    // All tandem start times must match across machines
    expect(reordenado.itensPorPosto["PR-99"][2].hora_inicial).toBe(reordenado.itensPorPosto["PR-98"][1].hora_inicial);
    expect(reordenado.itensPorPosto["PR-99"][3].hora_inicial).toBe(reordenado.itensPorPosto["PR-98"][2].hora_inicial);

    // No items should be pushed into 3rd shift (23:00) or late night!
    const allItems = Object.values(reordenado.itensPorPosto).flat();
    for (const it of allItems) {
      if (it.hora_final) {
        const hour = parseInt(it.hora_final.slice(11, 13), 10);
        expect(hour).toBeLessThan(16); // Must finish within 1º turno / normal window (< 16:00)
      }
    }
  });

  it("keeps critical items out of the cascade timing chain", () => {
    const dataBase = new Date(2026, 7, 24).toISOString();
    const state = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [
          item({ posto_trabalho: "posto-1", sequencia: 1, status: PlanItemStatus.Normal }),
          item({
            posto_trabalho: "posto-1",
            sequencia: 0,
            status: PlanItemStatus.Critico,
            id: 2,
          }),
        ],
      },
    });

    const critico = state.itensPorPosto["posto-1"].find(
      (i) => i.status === PlanItemStatus.Critico
    );
    expect(critico?.hora_inicial).toBeNull();
  });

  it("AJUSTAR_KANBAN increases kanbans of the matching item and recalculates the cascade", () => {
    const dataBase = new Date(2026, 7, 24).toISOString();
    const loaded = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [item({ posto_trabalho: "posto-1", sequencia: 1, id: 1, kanbans: 2 })],
      },
    });

    const ajustado = sequenciaReducer(loaded, {
      type: "AJUSTAR_KANBAN",
      payload: { posto: "posto-1", chave: "1", delta: 3 },
    });

    expect(ajustado.itensPorPosto["posto-1"][0].kanbans).toBe(5);
    expect(ajustado.itensPorPosto["posto-1"][0].hora_inicial).not.toBeNull();
  });

  it("AJUSTAR_KANBAN never lets kanbans drop below 1", () => {
    const dataBase = new Date(2026, 7, 24).toISOString();
    const loaded = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [item({ posto_trabalho: "posto-1", sequencia: 1, id: 1, kanbans: 1 })],
      },
    });

    const ajustado = sequenciaReducer(loaded, {
      type: "AJUSTAR_KANBAN",
      payload: { posto: "posto-1", chave: "1", delta: -1 },
    });

    expect(ajustado.itensPorPosto["posto-1"][0].kanbans).toBe(1);
  });

  it("INCLUIR_ITEM adds an item to the end of the post's sequence and recalculates cascade timing", () => {
    const dataBase = new Date(2026, 7, 24).toISOString();
    const loaded = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [item({ posto_trabalho: "posto-1", sequencia: 1, id: 1 })],
      },
    });

    const critico = item({
      id: 99,
      posto_trabalho: "posto-1",
      status: PlanItemStatus.Critico,
      is_critico: true,
      sequencia: 0,
    });

    const included = sequenciaReducer(loaded, {
      type: "INCLUIR_ITEM",
      payload: { item: critico },
    });

    const lista = included.itensPorPosto["posto-1"];
    expect(lista).toHaveLength(2);
    expect(lista[1].id).toBe(99);
    expect(lista[1].sequencia).toBe(2);
    expect(lista[1].hora_inicial).toBe(lista[0].hora_final);
    expect(lista[1].hora_final).not.toBeNull();
  });

  it("REMOVER_ITEM removes an item by key and recalculates the rest", () => {
    const dataBase = new Date(2026, 7, 24).toISOString();
    const loaded = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [
          item({ posto_trabalho: "posto-1", sequencia: 1, id: 1 }),
          item({ posto_trabalho: "posto-1", sequencia: 2, id: 2 }),
        ],
      },
    });

    const removed = sequenciaReducer(loaded, {
      type: "REMOVER_ITEM",
      payload: { posto: "posto-1", chave: "1" },
    });

    const lista = removed.itensPorPosto["posto-1"];
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe(2);
    expect(lista[0].sequencia).toBe(1);
  });

  it("ALTERNAR_MODO_DIMENSIONAMENTO switches between PATAN_FIXO and ESTOQUE_MAXIMO", () => {
    const dataBase = new Date(2026, 7, 24).toISOString();
    const loaded = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase,
        itens: [
          item({
            posto_trabalho: "posto-1",
            sequencia: 1,
            id: 1,
            kanbans: 10,
            qtd_por_kanban: 80,
            demanda: 400, // Patan fixo: 400 / 80 = 5 cx
            kanban_max: 16, // Estoque máximo: 16 cx
          }),
        ],
      },
    });

    // Switch to PATAN_FIXO
    const patanFixo = sequenciaReducer(loaded, {
      type: "ALTERNAR_MODO_DIMENSIONAMENTO",
      payload: { modo: "PATAN_FIXO" },
    });
    expect(patanFixo.modoDimensionamento).toBe("PATAN_FIXO");
    expect(patanFixo.itensPorPosto["posto-1"][0].kanbans).toBe(5);

    // Switch to ESTOQUE_MAXIMO
    const estoqueMax = sequenciaReducer(patanFixo, {
      type: "ALTERNAR_MODO_DIMENSIONAMENTO",
      payload: { modo: "ESTOQUE_MAXIMO" },
    });
    expect(estoqueMax.modoDimensionamento).toBe("ESTOQUE_MAXIMO");
    expect(estoqueMax.itensPorPosto["posto-1"][0].kanbans).toBe(16);
  });

  it("recalculates cascade timestamps when ALTERAR_DATA_BASE is dispatched", () => {
    const loaded = sequenciaReducer(initialSequenciaState, {
      type: "CARREGAR",
      payload: {
        turno: 1,
        dataBase: "2026-08-24",
        itens: [
          item({
            id: 1,
            posto_trabalho: "posto-1",
            sequencia: 1,
            kanbans: 2,
            qtd_por_kanban: 10,
            tempo_por_peca_minutos: 1, // 20 min
          }),
        ],
      },
    });

    expect(loaded.itensPorPosto["posto-1"][0].hora_inicial).toContain("2026-08-24T06:20:00");

    // Change programming date to 2026-10-20
    const updated = sequenciaReducer(loaded, {
      type: "ALTERAR_DATA_BASE",
      payload: { dataBase: "2026-10-20" },
    });

    expect(updated.dataBase).toBe("2026-10-20");
    expect(updated.itensPorPosto["posto-1"][0].hora_inicial).toContain("2026-10-20T06:20:00");
    expect(updated.itensPorPosto["posto-1"][0].hora_final).toContain("2026-10-20T06:40:00");
  });

  describe("calcularTemFaltaEstoque & AJUSTAR_KANBAN dynamically", () => {
    it("determina falta de estoque estritamente quando demanda excede o saldo físico", () => {
      // 20 kanbans x 10 pçs = 200 pçs. Saldo = 200. Demanda <= Saldo -> SEM falta!
      expect(calcularTemFaltaEstoque(20, 10, 200)).toBe(false);

      // 21 kanbans x 10 pçs = 210 pçs. Saldo = 200. Demanda > Saldo -> COM falta!
      expect(calcularTemFaltaEstoque(21, 10, 200)).toBe(true);

      // 19 kanbans x 10 pçs = 190 pçs. Saldo = 200. Demanda <= Saldo -> SEM falta!
      expect(calcularTemFaltaEstoque(19, 10, 200)).toBe(false);

      // Saldo ausente ou nulo: respeita fallback
      expect(calcularTemFaltaEstoque(10, 10, null, true)).toBe(true);
      expect(calcularTemFaltaEstoque(10, 10, undefined, false)).toBe(false);
    });

    it("remove aviso de falta de estoque ao reduzir kanbans para a capacidade viável e reativa ao exceder", () => {
      // Começa com 22 kanbans (demanda = 220), mas saldo só permite 20 kanbans (saldo = 200)
      const inicial = sequenciaReducer(initialSequenciaState, {
        type: "CARREGAR",
        payload: {
          turno: 1,
          dataBase: "2026-08-24",
          itens: [
            item({
              id: 10,
              posto_trabalho: "SB6A",
              sequencia: 1,
              kanbans: 22,
              qtd_por_kanban: 10,
              saldo_estoque: 200,
              tem_falta_estoque: true,
            }),
          ],
        },
      });

      // Inicialmente tem falta de estoque (220 > 200)
      expect(inicial.itensPorPosto["SB6A"][0].tem_falta_estoque).toBe(true);

      // Usuário ajusta diminuindo 2 kanbans (chega a 20 kanbans = 200 pçs <= 200)
      const ajustadoParaVivel = sequenciaReducer(inicial, {
        type: "AJUSTAR_KANBAN",
        payload: { posto: "SB6A", chave: "10", delta: -2 },
      });

      expect(ajustadoParaVivel.itensPorPosto["SB6A"][0].kanbans).toBe(20);
      // Falta de estoque DEVE SUMIR!
      expect(ajustadoParaVivel.itensPorPosto["SB6A"][0].tem_falta_estoque).toBe(false);

      // Usuário tenta produzir 1 a mais (21 kanbans = 210 pçs > 200)
      const aumentadoAlemDoEstoque = sequenciaReducer(ajustadoParaVivel, {
        type: "AJUSTAR_KANBAN",
        payload: { posto: "SB6A", chave: "10", delta: 1 },
      });

      expect(aumentadoAlemDoEstoque.itensPorPosto["SB6A"][0].kanbans).toBe(21);
      // Falta de estoque DEVE APARECER!
      expect(aumentadoAlemDoEstoque.itensPorPosto["SB6A"][0].tem_falta_estoque).toBe(true);
    });

    it("permite definir diretamente a quantidade de kanbans via DEFINIR_KANBAN e recalcula falta e cascata", () => {
      // 69 kanbans x 10 pçs = 690 pçs. Saldo = 330 pçs (capacidade = 33 kanbans).
      const inicial = sequenciaReducer(initialSequenciaState, {
        type: "CARREGAR",
        payload: {
          turno: 1,
          dataBase: "2026-08-24",
          itens: [
            item({
              id: 15,
              posto_trabalho: "SB6A",
              sequencia: 1,
              kanbans: 69,
              qtd_por_kanban: 10,
              saldo_estoque: 330,
              tem_falta_estoque: true,
              tempo_por_peca_minutos: 1,
            }),
          ],
        },
      });

      expect(inicial.itensPorPosto["SB6A"][0].tem_falta_estoque).toBe(true);
      expect(inicial.itensPorPosto["SB6A"][0].kanbans).toBe(69);

      // Usuário clica no botão "Consegue produzir 33" e aciona DEFINIR_KANBAN com 33
      const definidoParaViável = sequenciaReducer(inicial, {
        type: "DEFINIR_KANBAN",
        payload: { posto: "SB6A", chave: "15", kanbans: 33 },
      });

      expect(definidoParaViável.itensPorPosto["SB6A"][0].kanbans).toBe(33);
      // 33 x 10 = 330 <= 330 -> falta de estoque eliminada!
      expect(definidoParaViável.itensPorPosto["SB6A"][0].tem_falta_estoque).toBe(false);
      expect(definidoParaViável.itensPorPosto["SB6A"][0].hora_final).toBeDefined();
    });
  });

  describe("Sincronização Tandem e Recálculo em Cadeia (Linha 3 / Prensas / Ponteadeiras)", () => {
    it("sincroniza a quantidade de kanbans entre todos os postos parceiros ao usar AJUSTAR_KANBAN", () => {
      // Posto 1 e Posto 2 produzem Material MAT-A em linha (ambos com 10 kanbans inicialmente)
      const inicial = sequenciaReducer(initialSequenciaState, {
        type: "CARREGAR",
        payload: {
          turno: 1,
          dataBase: "2026-08-24",
          itens: [
            item({
              id: 101,
              material: "MAT-A",
              posto_trabalho: "PONTE 47",
              sequencia: 1,
              kanbans: 10,
              qtd_por_kanban: 10,
              tempo_por_peca_minutos: 0.5,
            }),
            item({
              id: 102,
              material: "MAT-A",
              posto_trabalho: "PONTE 48",
              sequencia: 1,
              kanbans: 10,
              qtd_por_kanban: 10,
              tempo_por_peca_minutos: 0.5,
            }),
          ],
        },
      });

      expect(inicial.itensPorPosto["PONTE 47"][0].kanbans).toBe(10);
      expect(inicial.itensPorPosto["PONTE 48"][0].kanbans).toBe(10);
      expect(inicial.itensPorPosto["PONTE 47"][0].producao_em_linha).toBe(true);
      expect(inicial.itensPorPosto["PONTE 48"][0].producao_em_linha).toBe(true);

      // Usuário aumenta +2 kanbans no Posto 47
      const ajustado = sequenciaReducer(inicial, {
        type: "AJUSTAR_KANBAN",
        payload: { posto: "PONTE 47", chave: "101", delta: 2 },
      });

      // AMBOS os postos parceiros DEVEM ter 12 kanbans!
      expect(ajustado.itensPorPosto["PONTE 47"][0].kanbans).toBe(12);
      expect(ajustado.itensPorPosto["PONTE 48"][0].kanbans).toBe(12);
      expect(ajustado.itensPorPosto["PONTE 47"][0].hora_final).toBe(ajustado.itensPorPosto["PONTE 48"][0].hora_final);
    });

    it("sincroniza a quantidade de kanbans entre todos os postos parceiros ao usar DEFINIR_KANBAN", () => {
      const inicial = sequenciaReducer(initialSequenciaState, {
        type: "CARREGAR",
        payload: {
          turno: 1,
          dataBase: "2026-08-24",
          itens: [
            item({
              id: 201,
              material: "5X0803701",
              posto_trabalho: "PR-97",
              sequencia: 1,
              kanbans: 15,
              qtd_por_kanban: 20,
              tempo_por_peca_minutos: 0.1,
            }),
            item({
              id: 202,
              material: "5X0803701",
              posto_trabalho: "PR-98",
              sequencia: 1,
              kanbans: 15,
              qtd_por_kanban: 20,
              tempo_por_peca_minutos: 0.1,
            }),
          ],
        },
      });

      const definido = sequenciaReducer(inicial, {
        type: "DEFINIR_KANBAN",
        payload: { posto: "PR-97", chave: "201", kanbans: 25 },
      });

      expect(definido.itensPorPosto["PR-97"][0].kanbans).toBe(25);
      expect(definido.itensPorPosto["PR-98"][0].kanbans).toBe(25);
    });

    it("propaga recálculo em cadeia ('tipo em cadeia') através de múltiplos itens tandem e downstream", () => {
      // Cenário com 4 Postos:
      // Posto 1:
      //   Item 1A: MAT-1 (tandem com Posto 2) - 10 kanbans x 10 x 0.5 = 50 min (06:20 -> 07:10)
      //   Item 2A: MAT-2 (tandem com Posto 2 e Posto 3) - 10 kanbans x 10 x 0.5 = 50 min
      // Posto 2:
      //   Item 1B: MAT-1 (tandem com Posto 1) - 10 kanbans x 10 x 0.5 = 50 min (06:20 -> 07:10)
      //   Item 2B: MAT-2 (tandem com Posto 1 e Posto 3) - 10 kanbans x 10 x 0.5 = 50 min
      //   Item 3B: MAT-4 (tandem com Posto 4) - 10 kanbans x 10 x 0.5 = 50 min
      // Posto 3:
      //   Item 1C: MAT-SOLO-3 (exclusivo do Posto 3, longo: 120 min, 06:20 -> 08:20)
      //   Item 2C: MAT-2 (tandem com Posto 1 e Posto 2)
      // Posto 4:
      //   Item 1D: MAT-SOLO-4 (exclusivo do Posto 4, 30 min, 06:20 -> 06:50)
      //   Item 2D: MAT-4 (tandem com Posto 2)

      const inicial = sequenciaReducer(initialSequenciaState, {
        type: "CARREGAR",
        payload: {
          turno: 1,
          dataBase: "2026-08-24",
          itens: [
            // Posto 1
            item({ id: 1, material: "MAT-1", posto_trabalho: "P1", sequencia: 1, kanbans: 10, qtd_por_kanban: 10, tempo_por_peca_minutos: 0.5 }),
            item({ id: 2, material: "MAT-2", posto_trabalho: "P1", sequencia: 2, kanbans: 10, qtd_por_kanban: 10, tempo_por_peca_minutos: 0.5 }),
            // Posto 2
            item({ id: 3, material: "MAT-1", posto_trabalho: "P2", sequencia: 1, kanbans: 10, qtd_por_kanban: 10, tempo_por_peca_minutos: 0.5 }),
            item({ id: 4, material: "MAT-2", posto_trabalho: "P2", sequencia: 2, kanbans: 10, qtd_por_kanban: 10, tempo_por_peca_minutos: 0.5 }),
            item({ id: 5, material: "MAT-4", posto_trabalho: "P2", sequencia: 3, kanbans: 10, qtd_por_kanban: 10, tempo_por_peca_minutos: 0.5 }),
            // Posto 3
            item({ id: 6, material: "MAT-SOLO-3", posto_trabalho: "P3", sequencia: 1, kanbans: 12, qtd_por_kanban: 10, tempo_por_peca_minutos: 1.0 }), // 120 min
            item({ id: 7, material: "MAT-2", posto_trabalho: "P3", sequencia: 2, kanbans: 10, qtd_por_kanban: 10, tempo_por_peca_minutos: 0.5 }),
            // Posto 4
            item({ id: 8, material: "MAT-SOLO-4", posto_trabalho: "P4", sequencia: 1, kanbans: 3, qtd_por_kanban: 10, tempo_por_peca_minutos: 1.0 }), // 30 min
            item({ id: 9, material: "MAT-4", posto_trabalho: "P4", sequencia: 2, kanbans: 10, qtd_por_kanban: 10, tempo_por_peca_minutos: 0.5 }),
          ],
        },
      });

      // MAT-SOLO-3 no Posto 3 termina às 08:20 (06:20 + 120min)
      expect(inicial.itensPorPosto["P3"][0].hora_final).toBe("2026-08-24T08:20:00");

      // Como MAT-2 é tandem em P1, P2 e P3, P1 e P2 NÃO podem começar MAT-2 às 07:10:
      // Ambos DEVEM ser empurrados para 08:20 para esperar P3!
      expect(inicial.itensPorPosto["P1"][1].hora_inicial).toBe("2026-08-24T08:20:00");
      expect(inicial.itensPorPosto["P2"][1].hora_inicial).toBe("2026-08-24T08:20:00");
      expect(inicial.itensPorPosto["P3"][1].hora_inicial).toBe("2026-08-24T08:20:00");

      // MAT-2 dura 50 min, logo termina às 09:10
      expect(inicial.itensPorPosto["P2"][1].hora_final).toBe("2026-08-24T09:10:00");

      // Em P2, o próximo item (MAT-4) começa às 09:10
      expect(inicial.itensPorPosto["P2"][2].hora_inicial).toBe("2026-08-24T09:10:00");

      // MAT-4 também é tandem com P4!
      // Em P4, MAT-SOLO-4 terminou às 06:50.
      // Mas por estar em tandem com P2, P4 DEVE ser empurrado em cadeia para 09:10!
      expect(inicial.itensPorPosto["P4"][1].hora_inicial).toBe("2026-08-24T09:10:00");

      // Agora, o programador edita MAT-1 no Posto 1 via EDITAR_ITEM, aumentando a quantidade
      // ou tempo de modo que MAT-1 agora termine às 08:40 (> 08:20)!
      const editado = sequenciaReducer(inicial, {
        type: "EDITAR_ITEM",
        payload: {
          posto: "P1",
          chave: "1",
          kanbans: 28, // 28 x 10 x 0.5 = 140 min -> 06:20 + 140 min = 08:40
        },
      });

      // MAT-1 em P1 e P2 agora ambos têm 28 kanbans e terminam às 08:40
      expect(editado.itensPorPosto["P1"][0].kanbans).toBe(28);
      expect(editado.itensPorPosto["P2"][0].kanbans).toBe(28);
      expect(editado.itensPorPosto["P1"][0].hora_final).toBe("2026-08-24T08:40:00");
      expect(editado.itensPorPosto["P2"][0].hora_final).toBe("2026-08-24T08:40:00");

      // Cadeia 1: MAT-2 em P1, P2 e P3 agora precisa iniciar às 08:40 (porque P1 e P2 só liberam às 08:40)
      expect(editado.itensPorPosto["P1"][1].hora_inicial).toBe("2026-08-24T08:40:00");
      expect(editado.itensPorPosto["P2"][1].hora_inicial).toBe("2026-08-24T08:40:00");
      expect(editado.itensPorPosto["P3"][1].hora_inicial).toBe("2026-08-24T08:40:00");

      // MAT-2 dura 50 min -> termina às 09:30
      expect(editado.itensPorPosto["P2"][1].hora_final).toBe("2026-08-24T09:30:00");

      // Cadeia 2: MAT-4 em P2 e P4 agora são empurrados para 09:30!
      expect(editado.itensPorPosto["P2"][2].hora_inicial).toBe("2026-08-24T09:30:00");
      expect(editado.itensPorPosto["P4"][1].hora_inicial).toBe("2026-08-24T09:30:00");
    });
  });
});


