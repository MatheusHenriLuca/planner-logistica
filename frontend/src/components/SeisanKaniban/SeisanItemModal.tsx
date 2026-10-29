import { X, CheckCircle2, AlertTriangle, PlayCircle, Clock, Calendar, ArrowRight, Zap, Boxes } from "lucide-react";
import type { ItemProducao } from "../../types/producao";
import { formatarHoraHHMM, formatarHoraHHMMSS, formatarDuracaoSegundos, formatarDataDDMM } from "../../utils/seisanTimeUtils";

export interface SeisanItemModalProps {
  item: ItemProducao | null;
  tipo: "programado" | "realizado" | "gap" | "teorico" | null;
  onClose: () => void;
}

export function SeisanItemModal({ item, tipo, onClose }: SeisanItemModalProps) {
  if (!item) return null;

  const pecasProgramadas = item.kanbans * item.qtd_por_kanban;
  const pecasRealizadas = item.quantidade_produzida_real ?? (item.fim_real ? pecasProgramadas : 0);

  const duracaoProgramadaMin =
    item.hora_inicial && item.hora_final
      ? Math.round((new Date(item.hora_final).getTime() - new Date(item.hora_inicial).getTime()) / (60 * 1000))
      : 0;

  const duracaoRealSegundos =
    item.inicio_real && item.fim_real
      ? Math.max(0, Math.round((new Date(item.fim_real).getTime() - new Date(item.inicio_real).getTime()) / 1000))
      : item.inicio_real && item.em_producao
      ? Math.max(0, Math.round((Date.now() - new Date(item.inicio_real).getTime()) / 1000))
      : null;

  const duracaoRealMin = duracaoRealSegundos !== null ? Math.round(duracaoRealSegundos / 60) : null;
  const duracaoRealTexto = duracaoRealSegundos !== null ? formatarDuracaoSegundos(duracaoRealSegundos) : null;

  const desvioMinutos = duracaoRealMin !== null ? duracaoRealMin - duracaoProgramadaMin : null;
  const aderenciaPecasPct = pecasProgramadas > 0 ? (pecasRealizadas / pecasProgramadas) * 100 : 0;

  const isQuebra =
    item.motivo_interrupcao === "quebra" ||
    (item.fim_real && (item.quantidade_produzida_real ?? 0) < pecasProgramadas && item.motivo_interrupcao === "quebra");

  const isConclusaoParcial =
    !isQuebra &&
    Boolean(item.fim_real) &&
    item.quantidade_produzida_real !== null &&
    item.quantidade_produzida_real !== undefined &&
    item.quantidade_produzida_real < pecasProgramadas;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
              #{item.sequencia}
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{item.material || "Material Sem Código"}</span>
                {item.is_critico && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-600 text-white">
                    CRÍTICO
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {item.linha} • {item.posto_trabalho} • {item.turno}º Turno (Patan {item.patan})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-5 space-y-4 text-xs">
          {/* Se for visualização do Patan Teórico */}
          {tipo === "teorico" && (
            <div className="p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>FAIXA 1 — PATAN TEÓRICO (BASELINE PADRÃO)</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Este bloco representa a receita/referência padrão do ciclo do Patan <strong>{item.patan}</strong>.
                O programador pode manter esta mesma quantidade na Faixa 2 (Programado) ou ajustá-la para mais ou para menos conforme a demanda fabril.
              </p>
            </div>
          )}
          {/* Se for visualização de GAP */}
          {tipo === "gap" && (
            <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-700 dark:text-rose-300 mb-1">
                <AlertTriangle className="w-4 h-4" />
                <span>GAP DE PRODUÇÃO LIBERADO POR QUEBRA</span>
              </div>
              <p className="text-xs leading-relaxed">
                Este lote foi interrompido antes do término planejado. O posto de trabalho{" "}
                <strong>{item.posto_trabalho}</strong> possui janela de tempo aberta que pode ser utilizada
                para remanejamento ou manutenção corretiva pela Ferramentaria.
              </p>
            </div>
          )}

          {/* Comparativo Lado a Lado (Planejado vs Realizado) */}
          <div className="grid grid-cols-2 gap-3">
            {/* Coluna 1: Programado (Faixa 2) */}
            <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1 mb-2">
                <Clock className="w-3.5 h-3.5" /> Programado (Tabela B)
              </span>
              <div className="space-y-1.5 text-slate-700 dark:text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Janela:</span>
                  <span className="font-semibold font-mono">
                    {formatarHoraHHMM(item.hora_inicial)} - {formatarHoraHHMM(item.hora_final)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Duração Prevista:</span>
                  <span className="font-semibold font-mono">{duracaoProgramadaMin} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Volume Planejado:</span>
                  <span className="font-semibold font-mono">{pecasProgramadas} pçs</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kanbans:</span>
                  <span className="font-semibold font-mono">
                    {item.kanbans} x {item.qtd_por_kanban}
                  </span>
                </div>
                {item.almoco_incluso && (
                  <div className="pt-1 text-[10px] text-amber-700 dark:text-amber-400 font-bold">
                    🍽️ Horário de almoço (+40m) incluso
                  </div>
                )}
              </div>
            </div>

            {/* Coluna 2: Realizado (Faixa 3) */}
            <div className={`p-3 rounded-xl border ${
              isQuebra
                ? "border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20"
                : isConclusaoParcial
                ? "border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20"
                : item.fim_real
                ? "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20"
                : item.em_producao
                ? "border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20"
                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 mb-2 ${
                isQuebra
                  ? "text-rose-700 dark:text-rose-400"
                  : isConclusaoParcial
                  ? "text-amber-700 dark:text-amber-400"
                  : item.fim_real
                  ? "text-emerald-700 dark:text-emerald-400"
                  : item.em_producao
                  ? "text-blue-700 dark:text-blue-400"
                  : "text-slate-500"
              }`}>
                {isQuebra ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" /> Quebra Registrada
                  </>
                ) : isConclusaoParcial ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Concluída Parcial
                  </>
                ) : item.fim_real ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Produção Concluída
                  </>
                ) : item.em_producao ? (
                  <>
                    <PlayCircle className="w-3.5 h-3.5 animate-spin" /> Em Produção Ao Vivo
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5" /> Aguardando na Fila
                  </>
                )}
              </span>

              <div className="space-y-1.5 text-slate-700 dark:text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Início Real:</span>
                  <span className="font-semibold font-mono" title={item.inicio_real ? new Date(item.inicio_real).toLocaleString() : undefined}>
                    {formatarHoraHHMMSS(item.inicio_real)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fim Real:</span>
                  <span className="font-semibold font-mono" title={item.fim_real ? new Date(item.fim_real).toLocaleString() : undefined}>
                    {item.em_producao ? "Em linha..." : formatarHoraHHMMSS(item.fim_real)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Duração Efetiva:</span>
                  <div className="flex items-center gap-1.5 font-semibold font-mono">
                    <span>{duracaoRealTexto ?? "--"}</span>
                    {duracaoRealSegundos !== null && duracaoRealSegundos < 120 && (
                      <span className="text-[9px] bg-emerald-700 text-emerald-100 px-1 py-0.5 rounded font-sans font-bold">
                        ⚡ Rápido
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Peças Feitas:</span>
                  <span className="font-semibold font-mono">
                    {item.quantidade_produzida_real !== null && item.quantidade_produzida_real !== undefined
                      ? `${item.quantidade_produzida_real} pçs`
                      : item.fim_real
                      ? `${pecasProgramadas} pçs`
                      : "--"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Análise de Desvios e Aderência */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Desempenho Operacional Lean
            </span>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block">Variação de Tempo</span>
                <span className={`text-base font-bold font-mono ${
                  desvioMinutos === null
                    ? "text-slate-400"
                    : desvioMinutos > 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}>
                  {desvioMinutos === null
                    ? "--"
                    : desvioMinutos > 0
                    ? `+${desvioMinutos} min (Atraso)`
                    : `${desvioMinutos} min (Adiantado)`}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block">Aderência de Volume</span>
                <span className={`text-base font-bold font-mono ${
                  aderenciaPecasPct >= 100
                    ? "text-emerald-600 dark:text-emerald-400"
                    : aderenciaPecasPct > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-400"
                }`}>
                  {aderenciaPecasPct.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
