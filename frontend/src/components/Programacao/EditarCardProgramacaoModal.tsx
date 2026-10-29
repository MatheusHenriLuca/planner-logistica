import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Layers, Sparkles, Trash2, X, Link as LinkIcon } from "lucide-react";

import type { ItemProducao } from "../../types/producao";

export interface EditarCardProgramacaoDados {
  kanbans?: number;
  qtd_por_kanban?: number;
  tempo_por_peca_minutos?: number;
  hora_inicial?: string;
  hora_final?: string;
  recalcular_subsequentes?: boolean;
}

interface EditarCardProgramacaoModalProps {
  item: ItemProducao;
  onClose: () => void;
  onSalvar: (dados: EditarCardProgramacaoDados) => void;
  onRemover?: (removerTandem: boolean) => void;
}

function formatIsoForInput(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    const hora = String(d.getHours()).padStart(2, "0");
    const minuto = String(d.getMinutes()).padStart(2, "0");
    return `${ano}-${mes}-${dia}T${hora}:${minuto}`;
  } catch {
    return "";
  }
}

export function EditarCardProgramacaoModal({
  item,
  onClose,
  onSalvar,
  onRemover,
}: EditarCardProgramacaoModalProps) {
  const [horaInicial, setHoraInicial] = useState<string>(() => formatIsoForInput(item.hora_inicial));
  const [horaFinal, setHoraFinal] = useState<string>(() => formatIsoForInput(item.hora_final));
  const [kanbans, setKanbans] = useState<number>(item.kanbans);
  const [qtdPorKanban, setQtdPorKanban] = useState<number>(item.qtd_por_kanban);
  const [tempoPorPeca, setTempoPorPeca] = useState<number>(item.tempo_por_peca_minutos);
  const [recalcularSubsequentes, setRecalcularSubsequentes] = useState<boolean>(true);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<boolean>(false);
  const [removerTandem, setRemoverTandem] = useState<boolean>(true);

  const duracaoMinutosCalculada = Math.round(kanbans * qtdPorKanban * tempoPorPeca * 100) / 100;
  const totalPecas = kanbans * qtdPorKanban;
  const isTandem = Boolean(item.producao_em_linha && item.postos_vinculados && item.postos_vinculados.length > 1);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleAutoCalcularTermino() {
    if (!horaInicial) {
      toast.error("Preencha o horário inicial para calcular o término.");
      return;
    }
    const d = new Date(horaInicial);
    if (isNaN(d.getTime())) return;
    d.setMinutes(d.getMinutes() + Math.round(duracaoMinutosCalculada));
    setHoraFinal(formatIsoForInput(d.toISOString()));
    toast.success("Horário de término calculado automaticamente!");
  }

  function handleSalvar() {
    if (kanbans <= 0) {
      toast.error("Quantidade de kanbans deve ser maior que zero.");
      return;
    }
    if (qtdPorKanban <= 0) {
      toast.error("Quantidade por kanban deve ser maior que zero.");
      return;
    }
    if (tempoPorPeca <= 0) {
      toast.error("Tempo por peça deve ser maior que zero.");
      return;
    }

    onSalvar({
      hora_inicial: horaInicial ? `${horaInicial}:00` : undefined,
      hora_final: horaFinal ? `${horaFinal}:00` : undefined,
      kanbans: Number(kanbans),
      qtd_por_kanban: Number(qtdPorKanban),
      tempo_por_peca_minutos: Number(tempoPorPeca),
      recalcular_subsequentes: recalcularSubsequentes,
    });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-editar-programacao-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-black shadow-xs">
              ✏️
            </span>
            <div>
              <h2
                id="modal-editar-programacao-titulo"
                className="text-base font-black text-slate-900 dark:text-slate-100"
              >
                Editar Card na Programação
              </h2>
              <p className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                {item.material} • {item.linha} • {item.posto_trabalho}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Formulário */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Banner Informativo se for Produção em Linha (Tandem) */}
          {isTandem ? (
            <div className="rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 p-3 text-xs text-sky-900 dark:text-sky-200">
              <div className="flex items-center gap-2 font-bold mb-1">
                <LinkIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>Produção em Linha (Tandem)</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Este material é produzido simultaneamente nos postos{" "}
                <strong className="underline font-mono">
                  {item.postos_vinculados?.join(" ↔ ") ?? ""}
                </strong>
                . A quantidade de kanbans e o rebalanceamento horária serão sincronizados automaticamente em cadeia em todos os postos parceiros.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-700 dark:text-slate-300">
              <p className="font-semibold">
                Ajuste os parâmetros de planejamento antes de persistir a programação oficial.
              </p>
            </div>
          )}

          {/* Quantidades e Tempos */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Kanbans (Cx) *
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={kanbans}
                onChange={(e) => setKanbans(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Qtd / Caixa *
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={qtdPorKanban}
                onChange={(e) => setQtdPorKanban(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tempo/Pç (min) *
              </label>
              <input
                type="number"
                min="0.001"
                step="0.01"
                value={tempoPorPeca}
                onChange={(e) => setTempoPorPeca(Math.max(0.001, Number(e.target.value)))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          {/* Resumo calculado */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
              <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Total: {totalPecas.toLocaleString("pt-BR")} peças</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono font-bold text-amber-900 dark:text-amber-200">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Duração: {duracaoMinutosCalculada} min</span>
            </div>
          </div>

          {/* Horários Planejados */}
          <div className="space-y-3 pt-1 border-t border-slate-200 dark:border-slate-800">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Horário Inicial Planejado
              </label>
              <input
                type="datetime-local"
                value={horaInicial}
                onChange={(e) => setHoraInicial(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Horário de Término Planejado
                </label>
                <button
                  type="button"
                  onClick={handleAutoCalcularTermino}
                  className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Calcular término automaticamente</span>
                </button>
              </div>
              <input
                type="datetime-local"
                value={horaFinal}
                onChange={(e) => setHoraFinal(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          {/* Checkbox de Rebalanceamento em Cascata */}
          <div className="pt-2">
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 transition-colors">
              <input
                type="checkbox"
                checked={recalcularSubsequentes}
                onChange={(e) => setRecalcularSubsequentes(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  ⚡ Rebalancear cascata horária e postos parceiros em cadeia
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px] leading-tight block mt-0.5">
                  Propaga o novo término para os próximos lotes deste posto e sincroniza os itens em linha vinculados.
                </span>
              </div>
            </label>
          </div>
          {/* Banner de Confirmação de Exclusão */}
          {confirmandoExclusao && (
            <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50/95 dark:bg-red-950/60 p-4 text-xs text-red-900 dark:text-red-200 space-y-3 shadow-md animate-in fade-in duration-150">
              <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300">
                <Trash2 className="w-4 h-4 text-red-600" />
                <span>Confirmar Exclusão deste Card do Planejamento</span>
              </div>
              <p className="leading-relaxed">
                Tem certeza que deseja retirar o lote <strong className="font-mono underline">{item.material}</strong> da fila de programação?
                A cascata horária deste posto e as máquinas parceiras em linha serão recalculadas em cadeia.
              </p>
              {isTandem && (
                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-red-100/60 dark:bg-red-900/40 border border-red-200 dark:border-red-800 font-bold cursor-pointer text-red-950 dark:text-red-100">
                  <input
                    type="checkbox"
                    checked={removerTandem}
                    onChange={(e) => setRemoverTandem(e.target.checked)}
                    className="rounded border-red-400 text-red-600 focus:ring-red-500 h-4 w-4"
                  />
                  <div className="flex items-center gap-1.5">
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>Excluir também dos postos vinculados em linha ({item.postos_vinculados?.join(", ")})</span>
                  </div>
                </label>
              )}
              <div className="flex items-center gap-2 pt-1 border-t border-red-200 dark:border-red-800/60">
                <button
                  type="button"
                  onClick={() => {
                    if (onRemover) onRemover(isTandem ? removerTandem : false);
                    onClose();
                  }}
                  className="rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold px-3.5 py-1.5 shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confirmar e Retirar da Fila</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(false)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5">
          {onRemover && !confirmandoExclusao ? (
            <button
              type="button"
              onClick={() => setConfirmandoExclusao(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-800/80 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 px-3 py-2 text-xs font-bold transition-colors cursor-pointer mr-auto"
              title="Retirar este card da fila de programação e recalcular os tempos das outras ordens"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir Card</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSalvar}
              className="rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 px-5 py-2 text-xs font-black shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Salvar Alterações</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
