import { useState } from "react";
import { toast } from "sonner";
import { Clock, Layers, Sparkles, Trash2, X, Link as LinkIcon } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import { editarItemProducao, excluirItemProducao } from "../../services/api";
import type { ItemProducao } from "../../types/producao";

interface EditarCardProducaoModalProps {
  item: ItemProducao;
  onClose: () => void;
  onSucesso: () => void;
}

function formatIsoForInput(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    // Formato local YYYY-MM-DDTHH:mm
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

function formatParaEnvioIso(val: string | undefined): string | undefined {
  if (!val || !val.trim()) return undefined;
  const limpo = val.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(limpo)) {
    return `${limpo}:00`;
  }
  return limpo;
}

export function EditarCardProducaoModal({
  item,
  onClose,
  onSucesso,
}: EditarCardProducaoModalProps) {
  const { token } = useAuth();
  const [horaInicial, setHoraInicial] = useState<string>(() => formatIsoForInput(item.hora_inicial));
  const [horaFinal, setHoraFinal] = useState<string>(() => formatIsoForInput(item.hora_final));
  const [kanbans, setKanbans] = useState<number>(item.kanbans);
  const [qtdPorKanban, setQtdPorKanban] = useState<number>(item.qtd_por_kanban);
  const [tempoPorPeca, setTempoPorPeca] = useState<number>(item.tempo_por_peca_minutos);
  const [recalcularSubsequentes, setRecalcularSubsequentes] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<boolean>(false);
  const [removerTandem, setRemoverTandem] = useState<boolean>(true);
  const [excluindo, setExcluindo] = useState<boolean>(false);

  const isTandem = Boolean(item.producao_em_linha && item.postos_vinculados && item.postos_vinculados.length > 1);
  const duracaoMinutosCalculada = Math.round(kanbans * qtdPorKanban * tempoPorPeca * 100) / 100;
  const totalPecas = kanbans * qtdPorKanban;

  async function handleExcluir() {
    if (!token || item.id === null) return;
    setExcluindo(true);
    try {
      const res = await excluirItemProducao(token, item.id, isTandem ? removerTandem : false);
      toast.success(res.mensagem || "Card removido da produção! Horários seguintes recalculados.");
      onSucesso();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao excluir card da produção.";
      toast.error(msg);
    } finally {
      setExcluindo(false);
    }
  }

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

  async function handleSalvar() {
    if (!token || item.id === null) return;
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

    if (horaInicial && horaFinal) {
      const dIni = new Date(horaInicial).getTime();
      const dFim = new Date(horaFinal).getTime();
      if (!isNaN(dIni) && !isNaN(dFim) && dFim <= dIni) {
        toast.error("O horário de término deve ser posterior ao horário inicial.");
        return;
      }
    }

    setSalvando(true);
    try {
      const horaInicialIso = formatParaEnvioIso(horaInicial);
      const horaFinalIso = formatParaEnvioIso(horaFinal);

      await editarItemProducao(token, item.id, {
        hora_inicial: horaInicialIso,
        hora_final: horaFinalIso,
        kanbans: Number(kanbans),
        qtd_por_kanban: Number(qtdPorKanban),
        tempo_por_peca_minutos: Number(tempoPorPeca),
        recalcular_subsequentes: recalcularSubsequentes,
      });

      toast.success("Card em produção atualizado com sucesso!");
      onSucesso();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao atualizar card.";
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-editar-card-titulo"
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
                id="modal-editar-card-titulo"
                className="text-base font-black text-slate-900 dark:text-slate-100"
              >
                Editar Card em Produção
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
          {/* Alerta Informativo */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3 text-xs text-amber-800 dark:text-amber-300">
            <p className="font-semibold">
              ⚠️ Ajuste direto de parâmetros e horários de lote na fábrica.
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
              Alterações aqui refletem instantaneamente no painel Kanban da linha e nas TVs da fábrica.
            </p>
          </div>

          {/* Horários */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>Horários da Ordem</span>
              </span>
              <button
                type="button"
                onClick={handleAutoCalcularTermino}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                title="Calcular horário final baseado na duração calculada das peças"
              >
                <Sparkles className="w-3 h-3" />
                <span>Auto-calcular Término</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Horário Inicial (Início)
                </label>
                <input
                  type="datetime-local"
                  value={horaInicial}
                  onChange={(e) => setHoraInicial(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 shadow-2xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Horário Final (Término)
                </label>
                <input
                  type="datetime-local"
                  value={horaFinal}
                  onChange={(e) => setHoraFinal(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 shadow-2xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Quantidades e Tempos */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3.5 space-y-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-500" />
              <span>Dimensões do Lote & Ciclo</span>
            </span>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="campo-kanbans" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Kanbans
                </label>
                <input
                  id="campo-kanbans"
                  aria-label="Kanbans"
                  type="number"
                  min="1"
                  value={kanbans}
                  onChange={(e) => setKanbans(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 shadow-2xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="campo-qtd-por-kanban" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Peças / Kanban
                </label>
                <input
                  id="campo-qtd-por-kanban"
                  aria-label="Peças por Kanban"
                  type="number"
                  min="1"
                  value={qtdPorKanban}
                  onChange={(e) => setQtdPorKanban(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 shadow-2xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="campo-tempo-por-peca" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Tempo / Pç (min)
                </label>
                <input
                  id="campo-tempo-por-peca"
                  aria-label="Tempo por Peça"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={tempoPorPeca}
                  onChange={(e) => setTempoPorPeca(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 shadow-2xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Resumo Dinâmico do Lote */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-700/60 font-semibold">
              <span className="text-slate-500">
                Total: <strong className="text-slate-800 dark:text-slate-200">{totalPecas} pçs</strong>
              </span>
              <span className="text-slate-500">
                Duração planejada:{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  {duracaoMinutosCalculada} min ({Math.round((duracaoMinutosCalculada / 60) * 10) / 10}h)
                </strong>
              </span>
            </div>
          </div>

          {/* Opção de Recálculo em Cascata */}
          <label className="flex items-start gap-2.5 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-950/30 p-3.5 cursor-pointer">
            <input
              type="checkbox"
              checked={recalcularSubsequentes}
              onChange={(e) => setRecalcularSubsequentes(e.target.checked)}
              className="mt-0.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div className="text-xs">
              <span className="font-bold text-indigo-950 dark:text-indigo-200 block">
                ⚡ Rebalancear cascata horária dos próximos lotes deste posto
              </span>
              <p className="text-[11px] text-indigo-900/90 dark:text-indigo-200/90 mt-1 leading-relaxed">
                Se este lote terminar às{" "}
                <strong className="font-mono bg-indigo-100 dark:bg-indigo-900/60 px-1 py-0.2 rounded text-indigo-950 dark:text-indigo-100">
                  {horaFinal ? horaFinal.split("T")[1]?.slice(0, 5) || "--:--" : "--:--"}
                </strong>
                , o próximo lote desta máquina começará exatamente às{" "}
                <strong className="font-mono bg-indigo-100 dark:bg-indigo-900/60 px-1 py-0.2 rounded text-indigo-950 dark:text-indigo-100">
                  {horaFinal ? horaFinal.split("T")[1]?.slice(0, 5) || "--:--" : "--:--"}
                </strong>
                , rebalanceando em cascata todas as ordens seguintes da fila.
              </p>
            </div>
          </label>
          {/* Banner de Confirmação de Exclusão */}
          {confirmandoExclusao && (
            <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50/95 dark:bg-red-950/60 p-4 text-xs text-red-900 dark:text-red-200 space-y-3 shadow-md animate-in fade-in duration-150">
              <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300">
                <Trash2 className="w-4 h-4 text-red-600" />
                <span>Confirmar Exclusão deste Card da Produção</span>
              </div>
              <p className="leading-relaxed">
                Tem certeza que deseja remover o lote <strong className="font-mono underline">{item.material}</strong> da produção?
                Os horários dos lotes seguintes desta máquina serão recalculados em cascata para fechar o espaço e adiantar a fila.
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
                  onClick={handleExcluir}
                  disabled={excluindo}
                  className="rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold px-3.5 py-1.5 shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {excluindo ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirmar e Excluir Card</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(false)}
                  disabled={excluindo}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5">
          {!confirmandoExclusao ? (
            <button
              type="button"
              onClick={() => setConfirmandoExclusao(true)}
              disabled={salvando || excluindo}
              className="flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-800/80 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 px-3 py-2 text-xs font-bold transition-colors cursor-pointer mr-auto"
              title="Remover este card da fila de produção e recalcular os horários seguintes"
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
              disabled={salvando || excluindo}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando || excluindo}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 text-xs font-black shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {salvando ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
