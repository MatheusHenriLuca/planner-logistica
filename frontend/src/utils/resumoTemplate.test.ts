import { describe, expect, it } from "vitest";
import {
  BLOCOS_DISPONIVEIS_RESUMO,
  TEMPLATE_PADRAO_SOLDA,
  TEMPLATE_PADRAO_ESTAMPARIA,
  SAMPLE_ITEM_SOLDA,
  SAMPLE_ITEM_ESTAMPARIA,
  gerarTextoResumoLote,
  parseTemplateConfig,
  obterBlocosDisponiveisParaSetor,
  ItemConfigBloco,
} from "./resumoTemplate";
import type { ItemProducao } from "../types/producao";

describe("resumoTemplate utilitário", () => {
  it("deve conter 10 blocos disponíveis catalogados", () => {
    expect(BLOCOS_DISPONIVEIS_RESUMO.length).toBe(10);
    const ids = BLOCOS_DISPONIVEIS_RESUMO.map((b) => b.id);
    expect(ids).toContain("horarios");
    expect(ids).toContain("duracao");
    expect(ids).toContain("totais");
    expect(ids).toContain("material");
    expect(ids).toContain("dados_lote");
    expect(ids).toContain("componentes_solda");
    expect(ids).toContain("materia_prima_estamparia");
    expect(ids).toContain("paletizacao_estamparia");
    expect(ids).toContain("ferramenta_estamparia");
    expect(ids).toContain("observacoes");
  });

  it("deve filtrar blocos disponíveis para Solda e Estamparia corretamente", () => {
    const blocosSolda = obterBlocosDisponiveisParaSetor("solda");
    const blocosEstamparia = obterBlocosDisponiveisParaSetor("estamparia");

    expect(blocosSolda.some((b) => b.id === "componentes_solda")).toBe(true);
    expect(blocosSolda.some((b) => b.id === "paletizacao_estamparia")).toBe(false);

    expect(blocosEstamparia.some((b) => b.id === "paletizacao_estamparia")).toBe(true);
    expect(blocosEstamparia.some((b) => b.id === "componentes_solda")).toBe(false);
  });

  it("deve fazer parse seguro de JSON do template com fallback para padrões", () => {
    // Null ou string vazia
    expect(parseTemplateConfig(null, "solda")).toEqual(TEMPLATE_PADRAO_SOLDA);
    expect(parseTemplateConfig("", "estamparia")).toEqual(TEMPLATE_PADRAO_ESTAMPARIA);
    expect(parseTemplateConfig("invalido", "solda")).toEqual(TEMPLATE_PADRAO_SOLDA);

    // JSON válido customizado
    const custom: ItemConfigBloco[] = [
      { id: "material", ativo: true },
      { id: "totais", ativo: false },
    ];
    const parsed = parseTemplateConfig(JSON.stringify(custom), "solda");
    expect(parsed[0].id).toBe("material");
    expect(parsed[0].ativo).toBe(true);
    expect(parsed[1].id).toBe("totais");
    expect(parsed[1].ativo).toBe(false);
    // Deve conter os outros blocos padrão no final
    expect(parsed.some((p) => p.id === "horarios")).toBe(true);
  });

  it("deve gerar resumo para item de Solda conforme template padrão", () => {
    const texto = gerarTextoResumoLote(SAMPLE_ITEM_SOLDA, TEMPLATE_PADRAO_SOLDA);

    expect(texto).toContain("INÍCIO  : 06:20");
    expect(texto).toContain("TÉRMINO : 08:35");
    expect(texto).toContain("TEMPO/PRODUÇÃO - 135 MIN.");
    expect(texto).toContain("TOTAL CAIXAS - 24 K = 1.200 PÇS (50 pçs/cx)");
    expect(texto).toContain("MATERIAL: 51834291-EB");
    expect(texto).toContain("POSTO / MÁQUINA: PONTE 43");
    expect(texto).toContain("LINHA: SB6A | TURNO: 1º | PATAN: B");
    expect(texto).toContain("COMPONENTES DA SOLDA:");
    expect(texto).toContain("[EST] 51834290-E");
    expect(texto).toContain("[VTOV] 00018472-V");
    expect(texto).toContain("(OBSERVAÇÕES DO PROGRAMADOR):");
  });

  it("deve gerar resumo para item de Estamparia conforme template padrão", () => {
    const texto = gerarTextoResumoLote(SAMPLE_ITEM_ESTAMPARIA, TEMPLATE_PADRAO_ESTAMPARIA);

    expect(texto).toContain("INÍCIO  : 14:40");
    expect(texto).toContain("TÉRMINO : 18:00");
    expect(texto).toContain("TEMPO/PRODUÇÃO - 200 MIN. (REFEIÇÃO INCLUSA)");
    expect(texto).toContain("TOTAL CAIXAS - 40 K = 4.000 PÇS (100 pçs/cx)");
    expect(texto).toContain("MATERIAL: 52048119");
    expect(texto).toContain("PALETIZAÇÃO: 2P (40 cx)");
    expect(texto).toContain("MATÉRIA-PRIMA: BOBINA AÇO 1.50MM — 1.800 KG");
    expect(texto).toContain("FERRAMENTA: FERR. - 52048119");
    expect(texto).toContain("POSTO / MÁQUINA: PR-82");
    expect(texto).toContain("(OBSERVAÇÕES DO PROGRAMADOR):");
  });

  it("deve respeitar a desativação de blocos (ativo: false)", () => {
    const configSemHorarios: ItemConfigBloco[] = [
      { id: "horarios", ativo: false },
      { id: "material", ativo: true },
      { id: "totais", ativo: true },
    ];

    const texto = gerarTextoResumoLote(SAMPLE_ITEM_SOLDA, configSemHorarios);
    expect(texto).not.toContain("INÍCIO");
    expect(texto).not.toContain("TÉRMINO");
    expect(texto).toContain("MATERIAL: 51834291-EB");
    expect(texto).toContain("TOTAL CAIXAS");
  });

  it("deve respeitar a reordenação de blocos no texto final", () => {
    const configReordenada: ItemConfigBloco[] = [
      { id: "totais", ativo: true },
      { id: "material", ativo: true },
      { id: "horarios", ativo: true },
    ];

    const texto = gerarTextoResumoLote(SAMPLE_ITEM_SOLDA, configReordenada);
    const posTotais = texto.indexOf("TOTAL CAIXAS");
    const posMaterial = texto.indexOf("MATERIAL");
    const posHorarios = texto.indexOf("INÍCIO");

    expect(posTotais).toBeLessThan(posMaterial);
    expect(posMaterial).toBeLessThan(posHorarios);
  });
});
