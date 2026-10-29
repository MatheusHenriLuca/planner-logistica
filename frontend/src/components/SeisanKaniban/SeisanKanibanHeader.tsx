import { Search, RefreshCw, Calendar, Clock } from "lucide-react";
import { LINHAS_DISPONIVEIS, type Linha } from "../../types/producao";

export interface SeisanKanibanHeaderProps {
  setor: string;
  onSetorChange: (setor: string) => void;
  podeVerSolda: boolean;
  podeVerEstamparia: boolean;
  onRefresh: () => void;
  isFetching: boolean;
}

export function SeisanKanibanHeader({
  setor,
  onSetorChange,
  podeVerSolda,
  podeVerEstamparia,
  onRefresh,
  isFetching,
}: SeisanKanibanHeaderProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 sticky top-0 z-30 shadow-xs">
      {/* Topo Limpo: Título Lean TPS, Abas de Setor e Atualização */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
              LEAN TPS • GANTT TRIPLO
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">生産管理板</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mt-0.5 flex items-center gap-2">
            Seisan Kanriban
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Controle visual comparativo em 3 faixas: Patan Teórico, Programado e Realizado com gaps de parada.
          </p>
        </div>

        {/* Setor e Ações */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* Tabs de Setor */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
            {podeVerSolda && (
              <button
                type="button"
                onClick={() => onSetorChange("solda")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  setor === "solda"
                    ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs border border-slate-200 dark:border-slate-700"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <span>⚡ Solda</span>
              </button>
            )}

            {podeVerEstamparia && (
              <button
                type="button"
                onClick={() => onSetorChange("estamparia")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  setor === "estamparia"
                    ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <span>🏭 Estamparia</span>
              </button>
            )}
          </div>

          {/* Botão de Atualizar */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isFetching}
            title="Atualizar dados do Seisan Kanriban"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-emerald-600" : ""}`} />
            <span className="hidden md:inline">Atualizar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
