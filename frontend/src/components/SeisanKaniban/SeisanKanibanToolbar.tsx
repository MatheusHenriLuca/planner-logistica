import {
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Clock,
  Layers,
  Eye,
  Sliders,
  MousePointer,
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar,
} from "lucide-react";
import type { GranularidadeZoom } from "../../utils/seisanTimeUtils";
import { LINHAS_DISPONIVEIS, type Linha } from "../../types/producao";
import { SeisanZoomControl } from "./SeisanZoomControl";

export type AlturaFaixa = "compacta" | "normal" | "espacosa";
export type FiltroStatusRealizado = "todos" | "concluidos" | "quebras" | "produzindo" | "pendentes";

export interface SeisanKanibanToolbarProps {
  // Filtros Operacionais de Produção (Unificados)
  linha?: Linha;
  onLinhaChange?: (linha: Linha) => void;
  turno?: number;
  onTurnoChange?: (turno: number) => void;
  dataSelecionada?: string;
  onDataChange?: (data: string) => void;
  datasDisponiveis?: { data: string; programados: number; realizados: number }[];
  onNavegarDia?: (offsetDias: number) => void;
  onIrParaHoje?: () => void;
  busca?: string;
  onBuscaChange?: (busca: string) => void;

  // Zoom Temporal
  granularidadeZoom: GranularidadeZoom;
  onGranularidadeZoomChange: (zoom: GranularidadeZoom) => void;
  // Visibilidade das Faixas
  exibirFaixaTeorico: boolean;
  onToggleFaixaTeorico: () => void;
  exibirFaixaProgramado: boolean;
  onToggleFaixaProgramado: () => void;
  exibirFaixaRealizado: boolean;
  onToggleFaixaRealizado: () => void;
  onMostrarTodasFaixas: () => void;
  // Filtro do Realizado
  filtroRealizado: FiltroStatusRealizado;
  onFiltroRealizadoChange: (filtro: FiltroStatusRealizado) => void;
  // Altura / Densidade das Faixas
  alturaFaixa: AlturaFaixa;
  onAlturaFaixaChange: (altura: AlturaFaixa) => void;
  // Contadores para os filtros
  contadores?: {
    total: number;
    concluidos: number;
    quebras: number;
    produzindo: number;
    pendentes: number;
  };
}

const SELECT_CLASSES =
  "rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-semibold px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors shadow-2xs";

export function SeisanKanibanToolbar({
  linha,
  onLinhaChange,
  turno,
  onTurnoChange,
  dataSelecionada,
  onDataChange,
  datasDisponiveis = [],
  onNavegarDia,
  onIrParaHoje,
  busca = "",
  onBuscaChange,
  granularidadeZoom,
  onGranularidadeZoomChange,
  exibirFaixaTeorico,
  onToggleFaixaTeorico,
  exibirFaixaProgramado,
  onToggleFaixaProgramado,
  exibirFaixaRealizado,
  onToggleFaixaRealizado,
  onMostrarTodasFaixas,
  filtroRealizado,
  onFiltroRealizadoChange,
  alturaFaixa,
  onAlturaFaixaChange,
  contadores,
}: SeisanKanibanToolbarProps) {
  const todasFaixasVisiveis = exibirFaixaTeorico && exibirFaixaProgramado && exibirFaixaRealizado;

  return (
    <div className="mx-4 my-2.5 p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-all space-y-2.5">
      {/* LINHA 1: Filtros de Linha/Turno/Data/Busca + Ferramentas de Zoom e Altura */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        {/* Bloco de Filtros Operacionais */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Linha */}
          {linha !== undefined && onLinhaChange && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="toolbar-linha" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Linha:
              </label>
              <select
                id="toolbar-linha"
                value={linha}
                onChange={(e) => onLinhaChange(e.target.value as Linha)}
                className={SELECT_CLASSES}
              >
                {LINHAS_DISPONIVEIS.map((l) => (
                  <option key={l.valor} value={l.valor}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Seletor de Turno */}
          {turno !== undefined && onTurnoChange && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="toolbar-turno" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" /> Turno:
              </label>
              <select
                id="toolbar-turno"
                value={turno}
                onChange={(e) => onTurnoChange(Number(e.target.value))}
                className={SELECT_CLASSES}
              >
                <option value={0}>Todos (24h)</option>
                <option value={1}>1º Turno (06:20 - 14:40)</option>
                <option value={2}>2º Turno (14:40 - 23:00)</option>
                <option value={3}>3º Turno (23:00 - 06:20)</option>
              </select>
            </div>
          )}

          {/* Seletor de Data com Navegação Rápida (◀, ▶, Hoje) */}
          {dataSelecionada !== undefined && onDataChange && (
            <div className="flex items-center gap-1">
              <label htmlFor="toolbar-data" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-0.5">
                <Calendar className="w-3 h-3 text-slate-400" /> Data:
              </label>

              {onNavegarDia && (
                <button
                  type="button"
                  title="Dia anterior"
                  onClick={() => onNavegarDia(-1)}
                  className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors shadow-2xs cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              )}

              <input
                id="toolbar-data"
                type="date"
                value={dataSelecionada}
                onChange={(e) => onDataChange(e.target.value)}
                className={SELECT_CLASSES}
              />

              {onNavegarDia && (
                <button
                  type="button"
                  title="Próximo dia"
                  onClick={() => onNavegarDia(1)}
                  className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors shadow-2xs cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}

              {onIrParaHoje && (
                <button
                  type="button"
                  title="Ir para a data de hoje"
                  onClick={onIrParaHoje}
                  className="px-2 py-1 text-[11px] font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-2xs cursor-pointer"
                >
                  Hoje
                </button>
              )}
            </div>
          )}

          {/* Atalhos para Datas com Produção */}
          {datasDisponiveis && datasDisponiveis.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider shrink-0 mr-0.5">
                Com Ordens:
              </span>
              {datasDisponiveis.slice(0, 4).map((d) => {
                const isAtiva = d.data === dataSelecionada;
                const [ano, mes, dia] = d.data.split("-");
                return (
                  <button
                    key={d.data}
                    type="button"
                    onClick={() => onDataChange?.(d.data)}
                    className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all shrink-0 border cursor-pointer ${
                      isAtiva
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                    title={`${dia}/${mes}/${ano}: ${d.programados} programados, ${d.realizados} realizados`}
                  >
                    {dia}/{mes} ({d.programados || d.realizados})
                  </button>
                );
              })}
            </div>
          )}

          {/* Busca por Posto / Material */}
          {onBuscaChange && (
            <div className="relative min-w-[150px] sm:w-44">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Filtrar posto ou peça..."
                value={busca}
                onChange={(e) => onBuscaChange(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}
        </div>

        {/* Bloco de Escala, Zoom e Altura das Faixas */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {/* Altura / Densidade das Faixas */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1.5 flex items-center gap-1">
              <Sliders className="w-3 h-3 text-slate-400" /> Altura:
            </span>

            <button
              type="button"
              onClick={() => onAlturaFaixaChange("compacta")}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition-all ${
                alturaFaixa === "compacta"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Compacta
            </button>
            <button
              type="button"
              onClick={() => onAlturaFaixaChange("normal")}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition-all ${
                alturaFaixa === "normal"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Padrão
            </button>
            <button
              type="button"
              onClick={() => onAlturaFaixaChange("espacosa")}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition-all ${
                alturaFaixa === "espacosa"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Espaçosa
            </button>
          </div>

          {/* Controle de Zoom Temporal TPS */}
          <SeisanZoomControl
            granularidadeZoom={granularidadeZoom}
            onGranularidadeZoomChange={onGranularidadeZoomChange}
          />
        </div>
      </div>

      {/* LINHA 2: Status do Realizado e Visibilidade das Faixas Integrados */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
        {/* Filtro de Status do Realizado */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pr-1 flex items-center gap-1">
            <Eye className="w-3 h-3 text-slate-400" /> Realizado:
          </span>

          {/* Todos */}
          <button
            type="button"
            onClick={() => onFiltroRealizadoChange("todos")}
            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
              filtroRealizado === "todos"
                ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Todos {contadores && `(${contadores.total})`}
          </button>

          {/* Concluídos */}
          <button
            type="button"
            onClick={() => onFiltroRealizadoChange("concluidos")}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
              filtroRealizado === "concluidos"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Concluídos {contadores && `(${contadores.concluidos})`}</span>
          </button>

          {/* Quebras / Paradas */}
          <button
            type="button"
            onClick={() => onFiltroRealizadoChange("quebras")}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
              filtroRealizado === "quebras"
                ? "bg-rose-600 text-white shadow-xs"
                : "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Quebras {contadores && `(${contadores.quebras})`}</span>
          </button>

          {/* Ao Vivo */}
          <button
            type="button"
            onClick={() => onFiltroRealizadoChange("produzindo")}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
              filtroRealizado === "produzindo"
                ? "bg-blue-600 text-white shadow-xs animate-pulse"
                : "text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            }`}
          >
            <PlayCircle className="w-3 h-3" />
            <span>Ao Vivo {contadores && `(${contadores.produzindo})`}</span>
          </button>

          {/* Pendentes */}
          <button
            type="button"
            onClick={() => onFiltroRealizadoChange("pendentes")}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
              filtroRealizado === "pendentes"
                ? "bg-slate-700 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>Fila {contadores && `(${contadores.pendentes})`}</span>
          </button>
        </div>

        {/* Toggles de Faixas (Teórico, Programado, Realizado) */}
        <div className="flex items-center gap-1.5 self-start lg:self-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 flex items-center gap-1">
            <Layers className="w-3 h-3 text-slate-400" /> Faixas:
          </span>

          {/* Faixa 1: Teórico */}
          <button
            type="button"
            onClick={onToggleFaixaTeorico}
            title="Ativar/Desativar visualização da Faixa 1 (Patan Teórico)"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold transition-all ${
              exibirFaixaTeorico
                ? "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-2xs"
                : "text-slate-400 dark:text-slate-500 line-through hover:text-slate-600"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                exibirFaixaTeorico ? "bg-slate-500 dark:bg-slate-400" : "bg-slate-300 dark:bg-slate-600"
              }`}
            />
            <span>1. Teórico</span>
          </button>

          {/* Faixa 2: Programado */}
          <button
            type="button"
            onClick={onToggleFaixaProgramado}
            title="Ativar/Desativar visualização da Faixa 2 (Programado Tabela B)"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold transition-all ${
              exibirFaixaProgramado
                ? "bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs"
                : "text-slate-400 dark:text-slate-500 line-through hover:text-blue-600"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                exibirFaixaProgramado ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
              }`}
            />
            <span>2. Programado</span>
          </button>

          {/* Faixa 3: Realizado */}
          <button
            type="button"
            onClick={onToggleFaixaRealizado}
            title="Ativar/Desativar visualização da Faixa 3 (Realizado Chão de Fábrica)"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold transition-all ${
              exibirFaixaRealizado
                ? "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs"
                : "text-slate-400 dark:text-slate-500 line-through hover:text-emerald-600"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                exibirFaixaRealizado ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"
              }`}
            />
            <span>3. Realizado</span>
          </button>

          {!todasFaixasVisiveis && (
            <button
              type="button"
              onClick={onMostrarTodasFaixas}
              className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline px-1 font-bold"
            >
              Todas
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
