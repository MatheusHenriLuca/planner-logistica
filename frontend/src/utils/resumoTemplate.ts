import type { ItemProducao } from "../types/producao";
import { parseCardDadosProducao } from "./cardComponents";

export type SetorAplicavelResumo = "ambos" | "solda" | "estamparia";

export type ItemBlocoResumoId =
  | "horarios"
  | "duracao"
  | "totais"
  | "material"
  | "dados_lote"
  | "componentes_solda"
  | "materia_prima_estamparia"
  | "paletizacao_estamparia"
  | "ferramenta_estamparia"
  | "observacoes";

export interface BlocoResumoDef {
  id: ItemBlocoResumoId;
  label: string;
  descricao: string;
  aplicavel: SetorAplicavelResumo;
  icone: string;
}

export interface ItemConfigBloco {
  id: ItemBlocoResumoId;
  ativo: boolean;
}

export const BLOCOS_DISPONIVEIS_RESUMO: BlocoResumoDef[] = [
  {
    id: "horarios",
    label: "Horários Agendados (Início e Término)",
    descricao: "Exibe a hora inicial e final do lote planejadas na cascata.",
    aplicavel: "ambos",
    icone: "⏱️",
  },
  {
    id: "duracao",
    label: "Duração / Tempo de Produção",
    descricao: "Tempo total em minutos com indicação de almoço/refeição se inclusa.",
    aplicavel: "ambos",
    icone: "⏳",
  },
  {
    id: "totais",
    label: "Total de Caixas e Peças",
    descricao: "Quantidade de kanbans, peças por caixa e total absoluto de peças.",
    aplicavel: "ambos",
    icone: "📦",
  },
  {
    id: "material",
    label: "Código do Material / Peça",
    descricao: "Código do produto acabado a ser produzido na máquina.",
    aplicavel: "ambos",
    icone: "🏷️",
  },
  {
    id: "dados_lote",
    label: "Contexto do Lote (Linha, Posto, Turno, Patan)",
    descricao: "Identificação completa da linha fabril, máquina, turno e ciclo Patan.",
    aplicavel: "ambos",
    icone: "🏭",
  },
  {
    id: "componentes_solda",
    label: "Componentes & Insumos da Solda (EST, VtoV, MP)",
    descricao: "Lista discriminada de subconjuntos estampados, peças compradas e matéria-prima.",
    aplicavel: "solda",
    icone: "⚡",
  },
  {
    id: "materia_prima_estamparia",
    label: "Matéria-Prima & Peso em KG (Estamparia)",
    descricao: "Especificação do insumo/aço e cálculo de consumo total em KG.",
    aplicavel: "estamparia",
    icone: "⚖️",
  },
  {
    id: "paletizacao_estamparia",
    label: "Paletização & Embalagem (Estamparia)",
    descricao: "Contagem de paletes completos (20 cx/P), paletes quebra e código de embalagem.",
    aplicavel: "estamparia",
    icone: "🏗️",
  },
  {
    id: "ferramenta_estamparia",
    label: "Ferramenta / Matriz (Estamparia)",
    descricao: "Código da ferramenta de conformação/corte associada ao material.",
    aplicavel: "estamparia",
    icone: "🔧",
  },
  {
    id: "observacoes",
    label: "Observações do Programador",
    descricao: "Campo aberto para notas operacionais, restrições e orientações da liderança.",
    aplicavel: "ambos",
    icone: "📝",
  },
];

export const TEMPLATE_PADRAO_SOLDA: ItemConfigBloco[] = [
  { id: "horarios", ativo: true },
  { id: "duracao", ativo: true },
  { id: "totais", ativo: true },
  { id: "material", ativo: true },
  { id: "dados_lote", ativo: true },
  { id: "componentes_solda", ativo: true },
  { id: "observacoes", ativo: true },
];

export const TEMPLATE_PADRAO_ESTAMPARIA: ItemConfigBloco[] = [
  { id: "horarios", ativo: true },
  { id: "duracao", ativo: true },
  { id: "totais", ativo: true },
  { id: "material", ativo: true },
  { id: "paletizacao_estamparia", ativo: true },
  { id: "materia_prima_estamparia", ativo: true },
  { id: "ferramenta_estamparia", ativo: true },
  { id: "dados_lote", ativo: true },
  { id: "observacoes", ativo: true },
];

function formatHora(dataStr: string | null | undefined): string {
  if (!dataStr) return "--:--";
  try {
    const d = new Date(dataStr);
    return isNaN(d.getTime())
      ? "--:--"
      : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

export function obterBlocosDisponiveisParaSetor(setor: "solda" | "estamparia"): BlocoResumoDef[] {
  return BLOCOS_DISPONIVEIS_RESUMO.filter(
    (b) => b.aplicavel === "ambos" || b.aplicavel === setor
  );
}

export const SAMPLE_ITEM_SOLDA: ItemProducao = {
  id: 101,
  linha: "SB6A",
  posto_trabalho: "PONTE 43",
  material: "51834291-EB",
  kanbans: 24,
  qtd_por_kanban: 50,
  tempo_por_peca_minutos: 0.08,
  hora_inicial: "2026-10-21T06:20:00",
  hora_final: "2026-10-21T08:35:00",
  turno: 1,
  patan: "B",
  sequencia: 1,
  status: 2,
  is_critico: false,
  coluna_extra_id: null,
  setor: "solda",
  almoco_incluso: false,
  comp_comb: "51834290-E|1|REFORÇO CENTRAL|4200$$$$00018472-V|2|PARAFUSO FLANGE M8|12500$$$$STEEL-COIL-01|1.5|BOBINA FF 1.20MM|8500",
  anotacoes: "",
  mostrar_anotacoes_quadro: false,
  saldo_estoque: 1200,
  tem_falta_estoque: false,
};

export const SAMPLE_ITEM_ESTAMPARIA: ItemProducao = {
  id: 202,
  linha: "PR-82",
  posto_trabalho: "PR-82",
  material: "52048119",
  kanbans: 40,
  qtd_por_kanban: 100,
  tempo_por_peca_minutos: 0.04,
  hora_inicial: "2026-10-21T14:40:00",
  hora_final: "2026-10-21T18:00:00",
  turno: 2,
  patan: "C1",
  sequencia: 1,
  status: 2,
  is_critico: false,
  coluna_extra_id: null,
  setor: "estamparia",
  almoco_incluso: true,
  comp_comb: "BOBINA AÇO 1.50MM|0.450|AÇO LAMINADO A FRIO|18000$$$$FERR-52048119|1|ESTAMPAGEM PROCESSO 01|0$$$$EMB-KLT-4314|1|CAIXA PLÁSTICA PADRÃO|200",
  anotacoes: "",
  mostrar_anotacoes_quadro: false,
  saldo_estoque: 4000,
  tem_falta_estoque: false,
};

/**
 * Gera o texto formatado para o campo de Anotações do card com base na configuração do template
 */
export function gerarTextoResumoLote(
  item: ItemProducao,
  configBlocos: ItemConfigBloco[]
): string {
  const dadosProd = parseCardDadosProducao(item);
  const setorItem = dadosProd.isEstamparia ? "estamparia" : "solda";
  const mapBlocos = new Map<ItemBlocoResumoId, BlocoResumoDef>(
    BLOCOS_DISPONIVEIS_RESUMO.map((b) => [b.id, b])
  );
  const totalPecas = (item.kanbans || 0) * (item.qtd_por_kanban || 0);
  const ini = formatHora(item.hora_inicial);
  const fim = formatHora(item.hora_final);
  const duracaoMin = dadosProd.duracaoMinutos;
  const refeicaoTxt = item.almoco_incluso ? " (REFEIÇÃO INCLUSA)" : "";

  const linhas: string[] = [];

  for (const config of configBlocos) {
    if (!config.ativo) continue;

    const blocoDef = mapBlocos.get(config.id);
    if (blocoDef && blocoDef.aplicavel !== "ambos" && blocoDef.aplicavel !== setorItem) {
      continue;
    }

    switch (config.id) {
      case "horarios":
        linhas.push(`INÍCIO  : ${ini}`);
        linhas.push(`TÉRMINO : ${fim}`);
        break;

      case "duracao":
        linhas.push(`TEMPO/PRODUÇÃO - ${duracaoMin} MIN.${refeicaoTxt}`);
        break;

      case "totais":
        {
          const embTxt = dadosProd.embalagem ? ` - Embalagem: ${dadosProd.embalagem}` : "";
          linhas.push(
            `TOTAL CAIXAS - ${item.kanbans || 0} K = ${totalPecas.toLocaleString("pt-BR")} PÇS (${item.qtd_por_kanban || 0} pçs/cx)${embTxt}`
          );
        }
        break;

      case "material":
        linhas.push(`MATERIAL: ${item.material || "N/A"}`);
        break;

      case "dados_lote":
        linhas.push(`POSTO / MÁQUINA: ${item.posto_trabalho}`);
        linhas.push(
          `LINHA: ${item.linha} | TURNO: ${item.turno}º | PATAN: ${item.patan}`
        );
        break;

      case "componentes_solda":
        if (dadosProd.componentesSolda.length > 0) {
          linhas.push(`COMPONENTES DA SOLDA:`);
          for (const comp of dadosProd.componentesSolda) {
            const tagTipo = comp.tipo.toUpperCase();
            const saldoTxt =
              comp.saldoLivre < 999999
                ? ` (Saldo: ${comp.saldoLivre.toLocaleString("pt-BR")})`
                : "";
            linhas.push(
              `  • [${tagTipo}] ${comp.codigo} — ${comp.qtdNecessaria.toLocaleString("pt-BR")} pçs${saldoTxt}`
            );
          }
        } else {
          linhas.push(`COMPONENTES DA SOLDA: Nenhum componente mapeado.`);
        }
        break;

      case "paletizacao_estamparia":
        {
          const pal = dadosProd.dadosEstamparia;
          const quebraTxt =
            pal.paletesQuebra > 0 ? ` + 1P (${pal.cxsQuebra} cx quebra)` : "";
          const embTxt = pal.embalagem ? ` | Emb: ${pal.embalagem}` : "";
          linhas.push(
            `PALETIZAÇÃO: ${pal.paletesCompletos}P (${pal.cxsCompletas} cx)${quebraTxt}${embTxt}`
          );
        }
        break;

      case "materia_prima_estamparia":
        {
          const mp = dadosProd.dadosEstamparia;
          if (mp.materiaPrimaCodigo) {
            const kgTxt =
              mp.materiaPrimaKg != null
                ? ` — ${mp.materiaPrimaKg.toLocaleString("pt-BR")} KG`
                : "";
            linhas.push(`MATÉRIA-PRIMA: ${mp.materiaPrimaCodigo}${kgTxt}`);
          }
        }
        break;

      case "ferramenta_estamparia":
        if (dadosProd.dadosEstamparia.ferramenta) {
          linhas.push(`FERRAMENTA: ${dadosProd.dadosEstamparia.ferramenta}`);
        }
        break;

      case "observacoes":
        linhas.push(``);
        linhas.push(`(OBSERVAÇÕES DO PROGRAMADOR):`);
        break;
    }
  }

  return linhas.join("\n").trimEnd();
}

/**
 * Faz o parse seguro do template armazenado como JSON no banco de dados,
 * garantindo fallback para o padrão oficial caso não exista ou seja inválido.
 */
export function parseTemplateConfig(
  jsonStr: string | null | undefined,
  setor: "solda" | "estamparia"
): ItemConfigBloco[] {
  const padrao = setor === "solda" ? TEMPLATE_PADRAO_SOLDA : TEMPLATE_PADRAO_ESTAMPARIA;
  if (!jsonStr || !jsonStr.trim()) return padrao;

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed) || parsed.length === 0) return padrao;

    // Garante que todos os blocos válidos estejam presentes mantendo a ordem configurada
    const blocosValidos = new Set(BLOCOS_DISPONIVEIS_RESUMO.map((b) => b.id));
    const resultado: ItemConfigBloco[] = [];
    const idsIncluidos = new Set<string>();

    for (const item of parsed) {
      if (item && typeof item.id === "string" && blocosValidos.has(item.id as ItemBlocoResumoId)) {
        resultado.push({
          id: item.id as ItemBlocoResumoId,
          ativo: Boolean(item.ativo),
        });
        idsIncluidos.add(item.id);
      }
    }

    // Se novos blocos foram adicionados ao sistema posteriormente, anexa no fim
    for (const itemPadrao of padrao) {
      if (!idsIncluidos.has(itemPadrao.id)) {
        resultado.push(itemPadrao);
      }
    }

    return resultado;
  } catch {
    return padrao;
  }
}
