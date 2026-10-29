import { CheckCircle2, PlayCircle, Clock, AlertTriangle, TrendingUp, Boxes } from "lucide-react";
import type { ItemProducao } from "../../types/producao";

export interface SeisanKanibanKpisProps {
  itens: ItemProducao[];
}

export function SeisanKanibanKpis({ itens }: SeisanKanibanKpisProps) {
  // Cálculos de métricas TPS
  let totalPecasProgramadas = 0;
  let totalPecasRealizadas = 0;
  let concluidos = 0;
  let emProducao = 0;
  let quebras = 0;
  let pendentes = 0;

  for (const item of itens) {
    const programadoPecas = item.kanbans * item.qtd_por_kanban;
    totalPecasProgramadas += programadoPecas;

    if (item.motivo_interrupcao === "quebra" || (item.fim_real && (item.quantidade_produzida_real ?? 0) < programadoPecas && !item.em_producao && item.motivo_interrupcao)) {
      quebras++;
      totalPecasRealizadas += item.quantidade_produzida_real ?? 0;
    } else if (item.fim_real) {
      concluidos++;
      totalPecasRealizadas += item.quantidade_produzida_real ?? programadoPecas;
    } else if (item.em_producao) {
      emProducao++;
      totalPecasRealizadas += item.quantidade_produzida_real ?? 0;
    } else {
      pendentes++;
    }
  }

  const aderenciaPecas =
    totalPecasProgramadas > 0
      ? Math.min(100, (totalPecasRealizadas / totalPecasProgramadas) * 100)
      : 0;

  const totalLotes = itens.length;
  const taxaConclusaoLotes = totalLotes > 0 ? (concluidos / totalLotes) * 100 : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800">
      {/* KPI 1: Aderência ao Plano */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-3 shadow-xs">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold uppercase tracking-wider text-[10px]">Aderência ao Plano</span>
          <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {aderenciaPecas.toFixed(1)}%
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            ({taxaConclusaoLotes.toFixed(0)}% lotes)
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${aderenciaPecas}%` }}
          />
        </div>
      </div>

      {/* KPI 2: Volume de Peças */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-3 shadow-xs">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold uppercase tracking-wider text-[10px]">Peças Produzidas</span>
          <Boxes className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {totalPecasRealizadas.toLocaleString("pt-BR")}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            / {totalPecasProgramadas.toLocaleString("pt-BR")} pçs
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {totalPecasProgramadas - totalPecasRealizadas > 0
            ? `${(totalPecasProgramadas - totalPecasRealizadas).toLocaleString("pt-BR")} pçs restantes no ciclo`
            : "Meta de produção alcançada!"}
        </p>
      </div>

      {/* KPI 3: Status dos Lotes */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-3 shadow-xs">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold uppercase tracking-wider text-[10px]">Fluxo de Lotes</span>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          </div>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-bold text-lg">{concluidos}</span>
            <span className="text-[10px] text-slate-400">OK</span>
          </div>
          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
            <PlayCircle className="w-3.5 h-3.5" />
            <span className="font-bold text-lg">{emProducao}</span>
            <span className="text-[10px] text-slate-400">Ao vivo</span>
          </div>
          <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-bold text-lg">{pendentes}</span>
            <span className="text-[10px] text-slate-400">Fila</span>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {totalLotes} ordens cadastradas na linha
        </p>
      </div>

      {/* KPI 4: Quebras / GAPs de Máquina */}
      <div className={`rounded-xl border p-3 shadow-xs transition-colors ${
        quebras > 0
          ? "border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20"
          : "border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800/90"
      }`}>
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold uppercase tracking-wider text-[10px] text-rose-700 dark:text-rose-400">
            Paradas & Quebras
          </span>
          <AlertTriangle className={`w-4 h-4 ${quebras > 0 ? "text-rose-600 dark:text-rose-400 animate-bounce" : "text-slate-400"}`} />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`text-2xl font-bold tracking-tight ${quebras > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-100"}`}>
            {quebras}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {quebras === 1 ? "avaria registrada" : "avarias registradas"}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-rose-600/90 dark:text-rose-400/90 truncate font-medium">
          {quebras > 0
            ? "GAPs temporais abertos no Gantt para remanejamento"
            : "Nenhuma quebra registrada no período"}
        </p>
      </div>
    </div>
  );
}
