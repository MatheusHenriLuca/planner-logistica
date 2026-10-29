import type { ItemProducao, Patan } from "../types/producao";

export const PATAN_CICLO: Patan[] = ["A", "B", "C", "D", "E", "F", "G", "H"];

/**
 * Calcula a distância em dias do Patan atual até uma letra de Patan alvo.
 * Ciclo fechado de 8 dias (A até H).
 *
 * Exemplo real:
 * - Se hoje é 'B' (index 1) e o alvo é 'A' (index 0):
 *   (0 - 1 + 8) % 8 = 7 dias. (O lote 'A' acabou de rodar e só voltará em 7 dias).
 * - Se hoje é 'B' (index 1) e o alvo é 'C' (index 2):
 *   (2 - 1 + 8) % 8 = 1 dia. (Rodará amanhã).
 * - Se hoje é 'B' (index 1) e o alvo é 'B' (index 1):
 *   Retorna 8 dias para representar o próximo ciclo de produção caso não seja produzido hoje.
 */
export function calcularDiasAtePatan(patanAtual: Patan, patanAlvo: string): number {
  const idxAtual = PATAN_CICLO.indexOf(patanAtual);
  const idxAlvo = PATAN_CICLO.indexOf(patanAlvo as Patan);
  if (idxAtual === -1 || idxAlvo === -1) return 8;

  const diff = (idxAlvo - idxAtual + 8) % 8;
  return diff === 0 ? 8 : diff;
}

/**
 * Calcula a menor quantidade de dias até a próxima produção regular do material,
 * considerando todas as letras de Patan em que ele roda.
 */
export function calcularDiasAteProximaProducao(
  patanAtual: Patan,
  patansDoMaterial: string[]
): number {
  if (!patansDoMaterial || patansDoMaterial.length === 0) return 8;

  let menorDias = 8;
  for (const p of patansDoMaterial) {
    const d = calcularDiasAtePatan(patanAtual, p);
    if (d < menorDias) {
      menorDias = d;
    }
  }
  return menorDias;
}

export interface ItemCriticoConsolidado {
  chave: string;
  itemPrincipal: ItemProducao;
  material: string;
  posto_trabalho: string;
  linha: string;
  patans: string[];
  turnos: number[];
  saldo_estoque: number;
  demanda: number;
  kanban_min: number | null;
  kanban_max: number | null;
  dias_prod: number | null;
  diasAteProximaProducao: number;
  scoreCriticidade: number;
  temFaltaSeguranca: boolean;
}

/**
 * Calcula um score ponderado de criticidade (maior score = mais urgente).
 * Regra:
 * 1. Dias sem produzir (Ciclo Patan): peso altíssimo (100 pts por dia de espera até próxima produção regular).
 * 2. Situação de Estoque (MB52 vs Mínimo de Segurança vs Demanda):
 *    - Estoque zerado ou negativo: +500 pts.
 *    - Abaixo do estoque mínimo/segurança: +250 pts + proporcional da falta.
 *    - Saldo menor que a demanda: +150 pts.
 * 3. Frequência do item (itens de 8 dias ganham prioridade adicional sobre itens diários).
 */
export function calcularScoreCriticidade(
  item: ItemProducao,
  diasAteProximaProducao: number,
  frequenciaCiclo: number
): number {
  let score = diasAteProximaProducao * 100;

  const saldo = item.saldo_estoque ?? 0;
  const qtdCx = Math.max(1, item.qtd_por_kanban || 1);
  const estoqueMinPcs = (item.kanban_min ?? 0) * qtdCx;
  const demanda = item.demanda ?? 0;

  if (saldo <= 0) {
    score += 500;
  } else if (estoqueMinPcs > 0 && saldo < estoqueMinPcs) {
    const falta = estoqueMinPcs - saldo;
    score += 250 + Math.min(100, (falta / estoqueMinPcs) * 100);
  } else if (demanda > 0 && saldo < demanda) {
    score += 150;
  }

  // Itens com frequência rara (ex: 8 dias) têm maior risco de desabastecimento
  if (frequenciaCiclo >= 8) {
    score += 50;
  } else if (frequenciaCiclo >= 4) {
    score += 25;
  }

  return Math.round(score);
}

/**
 * Consolida múltiplos registros de staging do mesmo material e posto,
 * identificando todos os Patans em que o material roda e calculando
 * os dias até a próxima produção e a criticidade.
 */
export function consolidarItensCriticos(
  itensCriticos: ItemProducao[],
  patanAtual: Patan
): ItemCriticoConsolidado[] {
  const grupos = new Map<string, ItemProducao[]>();

  for (const item of itensCriticos) {
    const chave = `${item.material || "SEM_MAT"}::${item.posto_trabalho}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(item);
    grupos.set(chave, lista);
  }

  const resultado: ItemCriticoConsolidado[] = [];

  for (const [chave, lista] of grupos.entries()) {
    // Escolhe o item principal (prioriza o do patanAtual se houver, ou o primeiro)
    const itemPrincipal =
      lista.find((it) => it.patan === patanAtual) || lista[0];

    const patansSet = new Set<string>();
    const turnosSet = new Set<number>();
    for (const it of lista) {
      if (it.patan) patansSet.add(it.patan);
      if (it.turno) turnosSet.add(it.turno);
    }
    const patans = Array.from(patansSet).sort();
    const turnos = Array.from(turnosSet).sort((a, b) => a - b);

    const diasAteProximaProducao = calcularDiasAteProximaProducao(
      patanAtual,
      patans
    );

    const qtdCx = Math.max(1, itemPrincipal.qtd_por_kanban || 1);
    const estoqueMinPcs = (itemPrincipal.kanban_min ?? 0) * qtdCx;
    const saldo = itemPrincipal.saldo_estoque ?? 0;
    const temFaltaSeguranca =
      saldo <= 0 ||
      (estoqueMinPcs > 0 && saldo < estoqueMinPcs) ||
      (itemPrincipal.demanda ? saldo < itemPrincipal.demanda : false);

    const frequenciaCiclo = itemPrincipal.dias_prod ?? (patans.length === 1 ? 8 : patans.length === 2 ? 4 : patans.length === 4 ? 2 : 1);

    const scoreCriticidade = calcularScoreCriticidade(
      itemPrincipal,
      diasAteProximaProducao,
      frequenciaCiclo
    );

    resultado.push({
      chave,
      itemPrincipal,
      material: itemPrincipal.material || "",
      posto_trabalho: itemPrincipal.posto_trabalho,
      linha: itemPrincipal.linha,
      patans,
      turnos,
      saldo_estoque: saldo,
      demanda: itemPrincipal.demanda ?? 0,
      kanban_min: itemPrincipal.kanban_min ?? null,
      kanban_max: itemPrincipal.kanban_max ?? null,
      dias_prod: itemPrincipal.dias_prod ?? null,
      diasAteProximaProducao,
      scoreCriticidade,
      temFaltaSeguranca,
    });
  }

  return resultado;
}
