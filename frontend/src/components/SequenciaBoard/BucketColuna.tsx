import { useState } from "react";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { ColunaExtra, ItemProducao } from "../../types/producao";
import { isMaterialBloqueado } from "../../utils/ferramentariaUtils";
import { SequenciaCard } from "./SequenciaCard";

interface BucketColunaProps {
  coluna: ColunaExtra;
  itens: ItemProducao[];
  colunasExtras?: ColunaExtra[];
  podeGerenciar: boolean;
  menuAberto: boolean;
  onToggleMenu: () => void;
  renomeando: boolean;
  onIniciarRenomear: () => void;
  onConfirmarRenomear: (novoNome: string) => void;
  onCancelarRenomear: () => void;
  onApagar: () => void;
  onMoverParaColunaExtra?: (itemId: number, colunaExtraId: number | null) => void;
  onDefinirKanban?: (chave: string, kanbans: number) => void;
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
  onSolicitarEditarItem?: (item: ItemProducao) => void;
}

export function BucketColuna({
  coluna,
  itens,
  colunasExtras,
  podeGerenciar,
  menuAberto,
  onToggleMenu,
  renomeando,
  onIniciarRenomear,
  onConfirmarRenomear,
  onCancelarRenomear,
  onApagar,
  onMoverParaColunaExtra,
  onDefinirKanban,
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
  onSolicitarEditarItem,
}: BucketColunaProps) {
  const { setNodeRef } = useDroppable({ id: `container:bucket:${coluna.id}` });
  const [valorRenomear, setValorRenomear] = useState(coluna.nome);
  const colNomeLower = coluna.nome.toLowerCase();
  const isColunaFinalizada =
    colNomeLower.includes("concluid") || colNomeLower.includes("quebra");

  return (
    <div
      ref={setNodeRef}
      className="sequencia-board__coluna w-80 md:w-[330px] xl:w-[350px] flex-shrink-0 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 shadow-sm border border-transparent dark:border-slate-800"
    >
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        {renomeando ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              autoFocus
              value={valorRenomear}
              onChange={(event) => setValorRenomear(event.target.value)}
              className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-1 py-0.5 text-sm text-slate-900 dark:text-slate-100"
            />
            <button
              onClick={() => onConfirmarRenomear(valorRenomear)}
              className="text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
              aria-label="Confirmar novo nome"
            >
              ✓
            </button>
            <button
              onClick={onCancelarRenomear}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Cancelar"
            >
              ✕
            </button>
          </div>
        ) : (
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            {coluna.nome}
          </h3>
        )}
        {podeGerenciar && !isColunaFinalizada && !renomeando && (
          <div className="relative">
            <button
              onClick={onToggleMenu}
              className="rounded px-1 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              aria-label="Opcoes da coluna"
            >
              ⋯
            </button>
            {menuAberto && (
              <div className="absolute right-0 z-10 mt-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-md">
                <button
                  onClick={onIniciarRenomear}
                  className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  Renomear
                </button>
                <button
                  onClick={onApagar}
                  className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  Apagar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <SortableContext
        items={itens.map((item) => String(item.id))}
        strategy={verticalListSortingStrategy}
      >
        {itens.map((item) => (
          <SequenciaCard
            key={item.id}
            item={item}
            colunasExtras={colunasExtras}
            onMoverParaColunaExtra={isColunaFinalizada ? undefined : onMoverParaColunaExtra}
            onDefinirKanban={
              !isColunaFinalizada && onDefinirKanban
                ? (kanbans) => onDefinirKanban(String(item.id), kanbans)
                : undefined
            }
            exibirEstoque={exibirEstoque}
            podeIniciar={false}
            isBloqueadoFerramentaria={isMaterialBloqueado(
              item.material,
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
            isProducaoEmLinha={false}
            postosVinculados={[]}
            onSolicitarEditarItem={isColunaFinalizada ? undefined : onSolicitarEditarItem}
          />
        ))}
      </SortableContext>
    </div>
  );
}
