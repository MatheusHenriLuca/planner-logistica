import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { PlanItemStatus, type ColunaExtra, type ItemProducao } from "../../types/producao";

// Toda coluna (posto ou bucket) e um alvo valido de drop mesmo vazia -
// useDroppable no container cobre esse caso; useSortable nos cards cobre
// o caso de soltar em cima de outro card. "container:" so aparece quando
// nao ha nenhum card por baixo do ponteiro.
export type ContainerKey = `posto:${string}` | `bucket:${number}`;

export type AcaoDrop =
  | { tipo: "reordenar"; posto: string; itens: ItemProducao[] }
  | { tipo: "mover-bucket"; itemId: number; colunaExtraId: number | null }
  | { tipo: "nenhuma" };

export function construirIndiceContainers(
  itensPorPosto: Record<string, ItemProducao[]>,
  colunasExtras: ColunaExtra[] | undefined,
  itensPorColunaExtra: Record<number, ItemProducao[]> | undefined
): Map<string, ContainerKey> {
  const containerPorItemId = new Map<string, ContainerKey>();
  for (const [posto, itens] of Object.entries(itensPorPosto)) {
    for (const item of itens) {
      containerPorItemId.set(String(item.id ?? `novo-${item.sequencia}`), `posto:${posto}`);
    }
  }
  for (const coluna of colunasExtras ?? []) {
    for (const item of itensPorColunaExtra?.[coluna.id] ?? []) {
      if (item.id !== null) containerPorItemId.set(String(item.id), `bucket:${coluna.id}`);
    }
  }
  return containerPorItemId;
}

function resolverContainer(
  id: string,
  containerPorItemId: Map<string, ContainerKey>
): ContainerKey | undefined {
  if (id.startsWith("container:")) {
    const resto = id.slice("container:".length);
    if (resto.startsWith("posto:") || resto.startsWith("bucket:")) return resto as ContainerKey;
    return undefined;
  }
  return containerPorItemId.get(id);
}

// Regras de negocio do drag-and-drop: reordenar dentro do mesmo posto,
// mover entre posto<->bucket ou bucket<->bucket, e bloquear posto<->posto
// diferente (cards nao trocam de maquina fisica).
export function resolverAcaoDrop(
  event: DragEndEvent,
  containerPorItemId: Map<string, ContainerKey>,
  itensPorPosto: Record<string, ItemProducao[]>,
  somenteLeitura: boolean,
  colunasExtras?: ColunaExtra[]
): AcaoDrop {
  const { active, over } = event;
  if (!over) return { tipo: "nenhuma" };

  const origem = containerPorItemId.get(String(active.id));
  const destino = resolverContainer(String(over.id), containerPorItemId);
  if (!origem || !destino) return { tipo: "nenhuma" };

  // Bloqueio estrito de ordens finalizadas: se a origem for um bucket de Concluídas
  // ou Quebra de Máquina, o item está finalizado e não pode ser movido para nenhum lugar.
  if (origem.startsWith("bucket:")) {
    const bucketId = Number(origem.slice("bucket:".length));
    const colunaOrigem = colunasExtras?.find((c) => c.id === bucketId);
    if (colunaOrigem) {
      const nomeLower = colunaOrigem.nome.toLowerCase();
      if (nomeLower.includes("concluid") || nomeLower.includes("quebra")) {
        return { tipo: "nenhuma" };
      }
    }
  }

  if (origem === destino) {
    // Buckets nao tem ordem interna - so postos reordenam.
    if (!origem.startsWith("posto:") || somenteLeitura || active.id === over.id) {
      return { tipo: "nenhuma" };
    }
    const posto = origem.slice("posto:".length);
    const itens = itensPorPosto[posto] ?? [];
    const ids = itens.map((entry) => String(entry.id ?? `novo-${entry.sequencia}`));
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return { tipo: "nenhuma" };
    const reordenado = arrayMove(itens, oldIndex, newIndex).map((entry, index) => ({
      ...entry,
      sequencia: entry.status === PlanItemStatus.Normal ? index + 1 : entry.sequencia,
    }));
    return { tipo: "reordenar", posto, itens: reordenado };
  }

  if (origem.startsWith("posto:") && destino.startsWith("posto:")) return { tipo: "nenhuma" };

  const itemId = Number(active.id);
  if (Number.isNaN(itemId)) return { tipo: "nenhuma" }; // item ainda nao salvo (id null) nao entra em bucket
  const colunaExtraId = destino.startsWith("bucket:")
    ? Number(destino.slice("bucket:".length))
    : null;
  return { tipo: "mover-bucket", itemId, colunaExtraId };
}
