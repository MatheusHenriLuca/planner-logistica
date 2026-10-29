import { RotateCcw, ZoomIn, ZoomOut, ChevronDown } from "lucide-react";
import {
  type GranularidadeZoom,
  LISTA_ESCALAS_ZOOM,
} from "../../utils/seisanTimeUtils";

export interface SeisanZoomControlProps {
  granularidadeZoom: GranularidadeZoom;
  onGranularidadeZoomChange: (zoom: GranularidadeZoom) => void;
  className?: string;
}

export function SeisanZoomControl({
  granularidadeZoom,
  onGranularidadeZoomChange,
  className = "",
}: SeisanZoomControlProps) {
  const indexAtual = LISTA_ESCALAS_ZOOM.indexOf(granularidadeZoom);

  function handleZoomIn() {
    if (indexAtual < LISTA_ESCALAS_ZOOM.length - 1) {
      onGranularidadeZoomChange(LISTA_ESCALAS_ZOOM[indexAtual + 1]);
    }
  }

  function handleZoomOut() {
    if (indexAtual > 0) {
      onGranularidadeZoomChange(LISTA_ESCALAS_ZOOM[indexAtual - 1]);
    }
  }

  function handleResetZoom() {
    onGranularidadeZoomChange("hora_1h");
  }

  return (
    <div
      className={`flex items-center gap-1 p-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 shadow-2xs ${className}`}
    >
      {/* Reset Zoom */}
      <button
        type="button"
        onClick={handleResetZoom}
        title="Restaurar escala padrão (1 em 1 hora)"
        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer"
        aria-label="Restaurar zoom"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {/* Botão Zoom Out */}
      <button
        type="button"
        onClick={handleZoomOut}
        disabled={indexAtual === 0}
        title="Afastar escala de tempo (Zoom Out)"
        className="p-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
        aria-label="Afastar zoom"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      {/* Dropdown / Seletor de Escala */}
      <div className="relative">
        <select
          value={granularidadeZoom}
          onChange={(e) => onGranularidadeZoomChange(e.target.value as GranularidadeZoom)}
          aria-label="Escala de tempo"
          className="appearance-none pl-2 pr-6 py-1 text-xs font-bold rounded-lg bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 border border-slate-300/80 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
        >
          <optgroup label="Visão Macro (Horas)">
            <option value="macro_6h">6 em 6 horas (Dia aberto)</option>
            <option value="macro_4h">4 em 4 horas</option>
            <option value="macro_2h">2 em 2 horas</option>
            <option value="hora_1h">1 em 1 hora (Padrão)</option>
          </optgroup>
          <optgroup label="Visão Detalhada (Minutos)">
            <option value="min_30m">30 em 30 minutos</option>
            <option value="min_15m">15 em 15 minutos</option>
            <option value="min_10m">10 em 10 minutos</option>
            <option value="min_5m">5 em 5 minutos</option>
            <option value="min_1m">Minuto a Minuto (1 min)</option>
          </optgroup>
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {/* Botão Zoom In */}
      <button
        type="button"
        onClick={handleZoomIn}
        disabled={indexAtual === LISTA_ESCALAS_ZOOM.length - 1}
        title="Aproximar escala para minutos (Zoom In)"
        className="p-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
        aria-label="Aproximar zoom"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      {/* Dica de atalho Ctrl + Scroll */}
      <span
        title="Segure Ctrl e gire a roda do mouse sobre a linha do tempo para zoom suave!"
        className="hidden md:inline-flex items-center text-[10px] text-slate-400 dark:text-slate-500 px-1 font-mono select-none"
      >
        Ctrl+Wheel
      </span>
    </div>
  );
}
