import { describe, expect, it } from "vitest";
import {
  calcularDiasAtePatan,
  calcularDiasAteProximaProducao,
  calcularScoreCriticidade,
  consolidarItensCriticos,
} from "./criticidade";
import { PlanItemStatus, type ItemProducao } from "../types/producao";

describe("criticidade e ciclo Patan", () => {
  it("calcula dias até próximo patan respeitando o ciclo de 8 dias", () => {
    // Exemplo do usuário: Hoje = B, Alvo = A -> acabou de passar, próximo em 7 dias
    expect(calcularDiasAtePatan("B", "A")).toBe(7);

    // Hoje = B, Alvo = C -> amanhã (1 dia)
    expect(calcularDiasAtePatan("B", "C")).toBe(1);

    // Hoje = B, Alvo = B -> próximo ciclo completo (8 dias)
    expect(calcularDiasAtePatan("B", "B")).toBe(8);

    // Hoje = A, Alvo = H -> 7 dias
    expect(calcularDiasAtePatan("A", "H")).toBe(7);

    // Hoje = H, Alvo = A -> 1 dia
    expect(calcularDiasAtePatan("H", "A")).toBe(1);
  });

  it("calcula menor quantidade de dias até a próxima produção para material com múltiplos patans", () => {
    // Hoje = B, material roda em B e F
    // Para F faltam 4 dias; para B faltam 8 dias. Menor = 4 dias
    expect(calcularDiasAteProximaProducao("B", ["B", "F"])).toBe(4);

    // Hoje = B, material roda em A, C, E, G
    // Para C falta 1 dia. Menor = 1 dia
    expect(calcularDiasAteProximaProducao("B", ["A", "C", "E", "G"])).toBe(1);

    // Hoje = B, material roda apenas em A
    // Menor = 7 dias
    expect(calcularDiasAteProximaProducao("B", ["A"])).toBe(7);
  });

  it("atribui score maior para item com mais dias sem produzir e estoque crítico", () => {
    const itemA: ItemProducao = {
      id: 1,
      material: "MAT_A",
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      posto_trabalho: "P1",
      status: PlanItemStatus.Critico,
      sequencia: 0,
      hora_inicial: null,
      hora_final: null,
      almoco_incluso: false,
      kanbans: 2,
      qtd_por_kanban: 100,
      tempo_por_peca_minutos: 1,
      is_critico: true,
      tem_falta_estoque: true,
      saldo_estoque: 0, // zerado!
      kanban_min: 5,
      kanban_max: 10,
      coluna_extra_id: null,
    };

    const itemC: ItemProducao = {
      ...itemA,
      id: 2,
      material: "MAT_C",
      patan: "C",
      saldo_estoque: 300, // tem 300 peças
    };

    const scoreA = calcularScoreCriticidade(itemA, 7, 8); // 7 dias até produzir, freq 8 dias
    const scoreC = calcularScoreCriticidade(itemC, 1, 1); // 1 dia até produzir, freq diária

    expect(scoreA).toBeGreaterThan(scoreC);
  });

  it("consolida itens repetidos da staging por material e posto", () => {
    const itens: ItemProducao[] = [
      {
        id: 10,
        material: "MAT_X",
        linha: "LINHA 1",
        turno: 1,
        patan: "A",
        posto_trabalho: "POSTO_1",
        status: PlanItemStatus.Critico,
        sequencia: 0,
        hora_inicial: null,
        hora_final: null,
        almoco_incluso: false,
        kanbans: 2,
        qtd_por_kanban: 50,
        tempo_por_peca_minutos: 0.5,
        is_critico: true,
        tem_falta_estoque: true,
        saldo_estoque: 10,
        kanban_min: 2,
        kanban_max: 8,
        coluna_extra_id: null,
      },
      {
        id: 11,
        material: "MAT_X",
        linha: "LINHA 1",
        turno: 2,
        patan: "C",
        posto_trabalho: "POSTO_1",
        status: PlanItemStatus.Critico,
        sequencia: 0,
        hora_inicial: null,
        hora_final: null,
        almoco_incluso: false,
        kanbans: 2,
        qtd_por_kanban: 50,
        tempo_por_peca_minutos: 0.5,
        is_critico: true,
        tem_falta_estoque: true,
        saldo_estoque: 10,
        kanban_min: 2,
        kanban_max: 8,
        coluna_extra_id: null,
      },
    ];

    const consolidados = consolidarItensCriticos(itens, "B");
    expect(consolidados).toHaveLength(1);
    expect(consolidados[0].material).toBe("MAT_X");
    expect(consolidados[0].patans).toEqual(["A", "C"]);
    expect(consolidados[0].turnos).toEqual([1, 2]);
    // Hoje é B: próximo patan é C (1 dia)
    expect(consolidados[0].diasAteProximaProducao).toBe(1);
  });
});
