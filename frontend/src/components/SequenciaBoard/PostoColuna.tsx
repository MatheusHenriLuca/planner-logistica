import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { ColunaExtra, ItemProducao } from "../../types/producao";
import { isMaterialBloqueado } from "../../utils/ferramentariaUtils";
import { SequenciaCard } from "./SequenciaCard";

interface PostoColunaProps {
  posto: string;
  itens: ItemProducao[];
  itensPorPosto?: Record<string, ItemProducao[]>;
  colunasExtras?: ColunaExtra[];
  onMoverParaColunaExtra?: (itemId: number, colunaExtraId: number | null) => void;
  onAjustarKanban?: (chave: string, delta: number) => void;
  onDefinirKanban?: (chave: string, kanbans: number) => void;
  itensCriticosIncluidos?: Set<number>;
  onAlternarCriticoIncluido?: (itemId: number, incluido: boolean) => void;
  onRemoverItem?: (chave: string) => void;
  exibirEstoque?: boolean;
  onIniciarProducao?: (itemId: number) => void;
  onPausarProducao?: (itemId: number) => void;
  onDesfazerInicio?: (itemId: number) => void;
  onConcluirProducao?: (itemId: number) => void;
  onSolicitarConcluir?: (item: ItemProducao) => void;
  onSolicitarQuebra?: (item: ItemProducao) => void;
  materiaisBloqueados?: string[];
  corDestaque?: "emerald" | "blue";
  modoCompacto?: boolean;
  postosPorMaterial?: Record<string, string[]>;
  materialDestacado?: string | null;
  onHoverMaterial?: (material: string | null) => void;
  limiteLoteCurtoMinutos?: number;
  limiteLoteCurtoSoldaMinutos?: number;
  modoEdicao?: boolean;
  onSolicitarEditarItem?: (item: ItemProducao) => void;
}

export function PostoColuna({
  posto,
  itens,
  itensPorPosto,
  colunasExtras,
  onMoverParaColunaExtra,
  onAjustarKanban,
  onDefinirKanban,
  itensCriticosIncluidos,
  onAlternarCriticoIncluido,
  onRemoverItem,
  exibirEstoque = true,
  onIniciarProducao,
  onPausarProducao,
  onDesfazerInicio,
  onConcluirProducao,
  onSolicitarConcluir,
  onSolicitarQuebra,
  materiaisBloqueados,
  corDestaque,
  modoCompacto,
  postosPorMaterial,
  materialDestacado,
  onHoverMaterial,
  limiteLoteCurtoMinutos,
  limiteLoteCurtoSoldaMinutos,
  modoEdicao,
  onSolicitarEditarItem,
}: PostoColunaProps) {
  const { setNodeRef } = useDroppable({ id: `container:posto:${posto}` });
  return (
    <div
      ref={setNodeRef}
      className="sequencia-board__coluna relative z-10 w-80 md:w-[330px] xl:w-[350px] flex-shrink-0 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 shadow-sm border border-transparent dark:border-slate-800"
    >
      <div className="mb-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
        <h3 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
          {posto}
        </h3>
        <span className="rounded-full bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-400">
          {itens.length}
        </span>
      </div>
      <SortableContext
        items={itens.map((entry) => String(entry.id ?? `novo-${entry.sequencia}`))}
        strategy={verticalListSortingStrategy}
      >
        {itens.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500 font-medium border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            Nenhum lote na fila
          </div>
        ) : (
          itens.map((entry, index) => {
            const mat = (entry.material ?? "").trim();
            const dataRef = entry.data_programada
              ? String(entry.data_programada).slice(0, 10)
              : (entry.hora_inicial ? String(entry.hora_inicial).slice(0, 10) : "sem_data");
            const chaveTandem = `${mat.toUpperCase()}__${dataRef}`;
            const postosVinculados =
              (mat && postosPorMaterial?.[chaveTandem]) ||
              (dataRef === "sem_data" && mat && postosPorMaterial?.[mat.toUpperCase()]) ||
              entry.postos_vinculados;
            const isTandem = Boolean(
              entry.coluna_extra_id === null &&
              ((postosVinculados && postosVinculados.length > 1) || entry.producao_em_linha)
            );
            const isDestacado = Boolean(mat && materialDestacado === mat);

            // Regra Fundamental: uma máquina NUNCA pode ter mais de um item em produção simultaneamente!
            const itemJaEmProducaoNoPosto = itens.find(
              (it) => it.id !== entry.id && it.em_producao && it.coluna_extra_id === null
            );
            let podeIniciar = index === 0 && !itemJaEmProducaoNoPosto && !entry.em_producao && entry.coluna_extra_id === null;
            let bloqueioTandem: string | null = null;

            if (podeIniciar && isTandem && postosVinculados && itensPorPosto) {
              for (const outroPosto of postosVinculados) {
                if (outroPosto === posto) continue;
                const filaOutro = (itensPorPosto[outroPosto] || []).filter(
                  (it) => it.coluna_extra_id === null && it.status !== 0
                );
                // Se o outro posto já tem algum item em produção que não é este lote
                const ativoOutro = filaOutro.find((it) => it.em_producao);
                if (ativoOutro && (ativoOutro.material ?? "").trim().toUpperCase() !== mat.toUpperCase()) {
                  podeIniciar = false;
                  bloqueioTandem = `Aguardando ${outroPosto} (em produção: ${ativoOutro.material})`;
                  break;
                }
                const itemPrimeiro = filaOutro[0];
                if (itemPrimeiro) {
                  const matOutro = (itemPrimeiro.material ?? "").trim().toUpperCase();
                  const dataOutro = itemPrimeiro.data_programada
                    ? String(itemPrimeiro.data_programada).slice(0, 10)
                    : (itemPrimeiro.hora_inicial ? String(itemPrimeiro.hora_inicial).slice(0, 10) : "sem_data");
                  const mesmoDia = dataRef === "sem_data" || dataOutro === "sem_data" || dataOutro === dataRef;
                  if (matOutro !== mat.toUpperCase() || !mesmoDia) {
                    podeIniciar = false;
                    bloqueioTandem = `Aguardando ${outroPosto} (concluir ${itemPrimeiro.material})`;
                    break;
                  }
                }
              }
            }

            return (
              <SequenciaCard
                key={entry.id ?? `novo-${entry.sequencia}`}
                item={entry}
                colunasExtras={colunasExtras}
                onMoverParaColunaExtra={onMoverParaColunaExtra}
                onAjustarKanban={
                  onAjustarKanban
                    ? (delta) => onAjustarKanban(String(entry.id ?? `novo-${entry.sequencia}`), delta)
                    : undefined
                }
                onDefinirKanban={
                  onDefinirKanban
                    ? (kanbans) =>
                        onDefinirKanban(String(entry.id ?? `novo-${entry.sequencia}`), kanbans)
                    : undefined
                }
                criticoIncluido={entry.id !== null ? itensCriticosIncluidos?.has(entry.id) : undefined}
                onAlternarCriticoIncluido={
                  entry.id !== null && onAlternarCriticoIncluido
                    ? (incluido) => onAlternarCriticoIncluido(entry.id as number, incluido)
                    : undefined
                }
                onRemoverDoBoard={
                  onRemoverItem
                    ? () => onRemoverItem(String(entry.id ?? `novo-${entry.sequencia}`))
                    : undefined
                }
                exibirEstoque={exibirEstoque}
                podeIniciar={podeIniciar}
                bloqueioTandem={bloqueioTandem}
                isBloqueadoFerramentaria={isMaterialBloqueado(
                  entry.material,
                  materiaisBloqueados
                )}
                onIniciarProducao={onIniciarProducao}
                onPausarProducao={onPausarProducao}
                onDesfazerInicio={onDesfazerInicio}
                onConcluirProducao={onConcluirProducao}
                onSolicitarConcluir={onSolicitarConcluir}
                onSolicitarQuebra={onSolicitarQuebra}
                corDestaque={corDestaque}
                modoCompacto={modoCompacto}
                isProducaoEmLinha={isTandem}
                postosVinculados={postosVinculados}
                isMaterialDestacado={isDestacado}
                onHoverMaterial={onHoverMaterial}
                limiteLoteCurtoMinutos={limiteLoteCurtoMinutos}
                limiteLoteCurtoSoldaMinutos={limiteLoteCurtoSoldaMinutos}
                modoEdicao={modoEdicao}
                onSolicitarEditarItem={onSolicitarEditarItem}
              />
            );
          })
        )}
      </SortableContext>
    </div>
  );
}
