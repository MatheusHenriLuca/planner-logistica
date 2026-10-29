import { useEffect, useState } from "react";
import {
  type JanelaTemporal,
  type GranularidadeZoom,
  type HorariosTurnosConfig,
  gerarMarcadoresTempo,
  posicaoPercentual,
  parseHoraMinuto,
  formatarHoraHHMM,
} from "../../utils/seisanTimeUtils";

export interface SeisanTimeRulerProps {
  janela: JanelaTemporal;
  larguraMinimaPx?: number;
  granularidade?: GranularidadeZoom;
  horariosConfig?: HorariosTurnosConfig;
}

export function SeisanTimeRuler({
  janela,
  larguraMinimaPx,
  granularidade = "hora_1h",
  horariosConfig,
}: SeisanTimeRulerProps) {
  const [agora, setAgora] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setAgora(new Date());
    }, 30000); // atualiza a cada 30 segundos
    return () => clearInterval(timer);
  }, []);

  const marcadores = gerarMarcadoresTempo(janela, granularidade);
  const agoraPct = posicaoPercentual(agora, janela);
  const agoraEstaNaJanela = agora >= janela.inicioDate && agora <= janela.fimDate;

  const ano = janela.inicioDate.getFullYear();
  const mes = janela.inicioDate.getMonth();
  const dia = janela.inicioDate.getDate();

  const [t1H, t1M] = parseHoraMinuto(horariosConfig?.t1Inicio ?? "06:20", 6, 20);
  const [t2H, t2M] = parseHoraMinuto(horariosConfig?.t2Inicio ?? "14:40", 14, 40);
  const [t3H, t3M] = parseHoraMinuto(horariosConfig?.t3Inicio ?? "23:00", 23, 0);

  const t1Date = new Date(ano, mes, dia, t1H, t1M);
  const t2Date = new Date(ano, mes, dia, t2H, t2M);
  const t3Date = new Date(ano, mes, dia, t3H, t3M);

  const pctT1 = posicaoPercentual(t1Date, janela);
  const pctT2 = posicaoPercentual(t2Date, janela);
  const pctT3 = posicaoPercentual(t3Date, janela);

  return (
    <div
      className="relative h-[35px] bg-slate-100 dark:bg-slate-900/90 border-t border-slate-300 dark:border-slate-700 select-none text-[10px] font-mono text-slate-500 dark:text-slate-400"
      style={larguraMinimaPx ? { minWidth: `${larguraMinimaPx}px` } : undefined}
    >
      {/* Marcadores de hora / minuto (Eixo X) */}
      {marcadores.map((m, idx) => (
        <div
          key={`${m.hora}-${idx}`}
          className="absolute top-0 bottom-0 flex flex-col items-start pl-1"
          style={{ left: `${m.percentual}%` }}
        >
          {/* Tick superior no Eixo X */}
          <div
            className={`w-px ${
              m.isHoraCheia
                ? "h-3.5 bg-slate-500 dark:bg-slate-400"
                : "h-2 bg-slate-300 dark:bg-slate-600"
            }`}
          />
          <span
            className={`mt-0.5 leading-none ${
              m.isHoraCheia
                ? "font-bold text-[10px] text-slate-700 dark:text-slate-200"
                : "text-[9px] text-slate-400 dark:text-slate-500 font-normal"
            }`}
          >
            {m.hora}
          </span>
        </div>
      ))}

      {/* Destaque dos marcos de turno */}
      {pctT1 > 0 && pctT1 < 100 && (
        <div
          className="absolute top-0 bottom-0 border-l-2 border-emerald-500 pointer-events-none z-10"
          style={{ left: `${pctT1}%` }}
        >
          <span className="absolute top-1 left-0.5 px-1 py-0.2 bg-emerald-600 text-white rounded text-[8px] font-sans font-bold shadow-xs whitespace-nowrap">
            {formatarHoraHHMM(t1Date)} • 1ºT
          </span>
        </div>
      )}

      {pctT2 > 0 && pctT2 < 100 && (
        <div
          className="absolute top-0 bottom-0 border-l-2 border-amber-500 pointer-events-none z-10"
          style={{ left: `${pctT2}%` }}
        >
          <span className="absolute top-1 left-0.5 px-1 py-0.2 bg-amber-600 text-white rounded text-[8px] font-sans font-bold shadow-xs whitespace-nowrap">
            {formatarHoraHHMM(t2Date)} • 2ºT
          </span>
        </div>
      )}

      {pctT3 > 0 && pctT3 < 100 && (
        <div
          className="absolute top-0 bottom-0 border-l-2 border-indigo-500 pointer-events-none z-10"
          style={{ left: `${pctT3}%` }}
        >
          <span className="absolute top-1 left-0.5 px-1 py-0.2 bg-indigo-600 text-white rounded text-[8px] font-sans font-bold shadow-xs whitespace-nowrap">
            {formatarHoraHHMM(t3Date)} • 3ºT
          </span>
        </div>
      )}

      {/* Marcador Dinâmico "AGORA" no Eixo X */}
      {agoraEstaNaJanela && (
        <div
          className="absolute top-0 bottom-0 border-l-2 border-rose-500 z-20 pointer-events-none"
          style={{ left: `${agoraPct}%` }}
        >
          <div className="absolute -top-3 -left-2 flex items-center gap-1 bg-rose-600 text-white font-sans text-[8px] font-bold px-1.5 py-0.2 rounded-full shadow-md whitespace-nowrap animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            <span>AGORA {formatarHoraHHMM(agora)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
