import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, PlayCircle, Clock, Utensils } from "lucide-react";
import type { ItemProducao } from "../../types/producao";
import {
  type JanelaTemporal,
  type GranularidadeZoom,
  type HorariosTurnosConfig,
  calcularPosicaoBloco,
  formatarHoraHHMM,
  formatarHoraHHMMSS,
  formatarDuracaoSegundos,
  gerarMarcadoresTempo,
  posicaoPercentual,
  calcularLayoutFaixaRealizado,
  obterZonasAlmoco,
} from "../../utils/seisanTimeUtils";
import { SeisanTimeRuler } from "./SeisanTimeRuler";
import type { AlturaFaixa, FiltroStatusRealizado } from "./SeisanKanibanToolbar";

export interface SeisanPostoTrackProps {
  posto: string;
  itens: ItemProducao[];
  janela: JanelaTemporal;
  larguraMinimaPx: number;
  granularidade?: GranularidadeZoom;
  alturaFaixa?: AlturaFaixa;
  exibirFaixaTeorico?: boolean;
  exibirFaixaProgramado?: boolean;
  exibirFaixaRealizado?: boolean;
  filtroRealizado?: FiltroStatusRealizado;
  horariosConfig?: HorariosTurnosConfig;
  onSelectItem: (item: ItemProducao, tipo: "programado" | "realizado" | "gap" | "teorico") => void;
}

const ALTURAS_FAIXA_MAP: Record<AlturaFaixa, number> = {
  compacta: 46,
  normal: 58,
  espacosa: 74,
};

export function SeisanPostoTrack({
  posto,
  itens,
  janela,
  larguraMinimaPx,
  granularidade = "hora_1h",
  alturaFaixa = "normal",
  exibirFaixaTeorico = true,
  exibirFaixaProgramado = true,
  exibirFaixaRealizado = true,
  filtroRealizado = "todos",
  horariosConfig,
  onSelectItem,
}: SeisanPostoTrackProps) {
  const marcadoresHoras = gerarMarcadoresTempo(janela, granularidade);
  const agora = new Date();
  const agoraPct = posicaoPercentual(agora, janela);
  const agoraEstaNaJanela = agora >= janela.inicioDate && agora <= janela.fimDate;

  // Status consolidado e contadores do posto
  const concluidosCount = itens.filter(
    (i) => i.fim_real && i.motivo_interrupcao !== "quebra"
  ).length;
  const quebrasCount = itens.filter(
    (i) =>
      i.motivo_interrupcao === "quebra" ||
      Boolean(
        i.fim_real &&
          (i.quantidade_produzida_real ?? 0) < i.kanbans * i.qtd_por_kanban &&
          i.motivo_interrupcao
      )
  ).length;
  const produzindoCount = itens.filter((i) => i.em_producao && !i.fim_real).length;
  const pendentesCount = itens.filter(
    (i) => !i.fim_real && !i.em_producao && i.motivo_interrupcao !== "quebra"
  ).length;

  const temItemProduzindo = produzindoCount > 0;
  const temItemQuebrado = quebrasCount > 0;

  // Layout anti-colisão e expansão visível da Faixa 3 (Realizado)
  const blocosRealizados = useMemo(() => {
    return calcularLayoutFaixaRealizado(
      itens,
      janela,
      larguraMinimaPx,
      filtroRealizado,
      agora,
      48,
      3
    );
  }, [itens, janela, larguraMinimaPx, filtroRealizado, agora]);

  // Zonas de Almoço de fundo para o quadrante dinâmicas conforme parametrização
  const almocos = useMemo(
    () => obterZonasAlmoco(janela, horariosConfig),
    [janela, horariosConfig]
  );

  const alturaPx = ALTURAS_FAIXA_MAP[alturaFaixa];
  const minBlocoFaixasSuperioresPct = (46 / Math.max(800, larguraMinimaPx)) * 100;

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 transition-colors">
      {/* Cabeçalho do Posto de Trabalho */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-700/80 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-xs" />
          <span className="font-bold text-base tracking-tight text-slate-900 dark:text-slate-100 font-mono">
            {posto}
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300">
            {itens.length} {itens.length === 1 ? "lote total" : "lotes totais"}
          </span>

          {/* Badges de Contadores do Posto */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {concluidosCount > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                {concluidosCount} {concluidosCount === 1 ? "concluído" : "concluídos"}
              </span>
            )}
            {produzindoCount > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 flex items-center gap-1 animate-pulse">
                <PlayCircle className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                {produzindoCount} em produção
              </span>
            )}
            {quebrasCount > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                {quebrasCount} {quebrasCount === 1 ? "parada/quebra" : "paradas/quebras"}
              </span>
            )}
            {pendentesCount > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700/80 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                {pendentesCount} na fila
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {temItemProduzindo && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-700 animate-pulse">
              <PlayCircle className="w-3.5 h-3.5" /> EM OPERAÇÃO
            </span>
          )}
          {temItemQuebrado && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
              <AlertTriangle className="w-3.5 h-3.5" /> PARADA / QUEBRA
            </span>
          )}
        </div>
      </div>

      {/* QUADRANTE TEMPORAL ÚNICO (Faixas com Espaçamento e Régua como Eixo X) */}
      <div className="overflow-x-auto relative">
        <div className="p-4 flex gap-3" style={{ minWidth: `${larguraMinimaPx}px` }}>
          {/* Legenda Lateral das Faixas - COLUNA FIXA NO SCROLL */}
          <div
            data-testid="seisan-coluna-fixa-faixas"
            className="sticky left-0 z-40 w-44 shrink-0 flex flex-col justify-between select-none border-r border-slate-200 dark:border-slate-800 pr-3 py-2 bg-white dark:bg-slate-900 shadow-[6px_0_16px_-2px_rgba(0,0,0,0.12)] dark:shadow-[6px_0_16px_-2px_rgba(0,0,0,0.5)]"
          >
            <div className="space-y-3">
              {/* Faixa 1 Label */}
              {exibirFaixaTeorico && (
                <div
                  style={{ height: `${alturaPx}px` }}
                  className="flex flex-col justify-center px-2 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                    Faixa 1
                  </span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                    Patan Teórico
                  </span>
                  <span className="text-[9px] text-slate-400 leading-none">Baseline Padrão</span>
                </div>
              )}

              {/* Faixa 2 Label */}
              {exibirFaixaProgramado && (
                <div
                  style={{ height: `${alturaPx}px` }}
                  className="flex flex-col justify-center px-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">
                    Faixa 2
                  </span>
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-300 truncate">
                    Programado
                  </span>
                  <span className="text-[9px] text-blue-400 dark:text-blue-500 leading-none">
                    Ajuste do Lote
                  </span>
                </div>
              )}

              {/* Faixa 3 Label */}
              {exibirFaixaRealizado && (
                <div
                  style={{ height: `${alturaPx}px` }}
                  className="flex flex-col justify-center px-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Faixa 3
                  </span>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 truncate">
                    Realizado
                  </span>
                  <span className="text-[9px] text-emerald-500 dark:text-emerald-400 leading-none">
                    Chão de Fábrica
                  </span>
                </div>
              )}
            </div>

            {/* Eixo X Label */}
            <div className="h-[35px] flex flex-col justify-center pt-1 border-t border-slate-200 dark:border-slate-800 mt-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Eixo X
              </span>
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate">
                Linha do Tempo
              </span>
            </div>
          </div>

          {/* Área Gráfica Contínua do Quadrante */}
          <div className="flex-1 relative bg-slate-50/70 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs p-2">
            {/* Linhas de Grade Verticais do Tempo (descem por todo o quadrante) */}
            {marcadoresHoras.map((m, idx) => (
              <div
                key={`grid-col-${m.hora}-${idx}`}
                className={`absolute top-0 bottom-[35px] border-l pointer-events-none z-0 ${
                  m.isHoraCheia
                    ? "border-slate-200/80 dark:border-slate-800/90"
                    : "border-slate-100 dark:border-slate-800/40 border-dashed"
                }`}
                style={{ left: `${m.percentual}%` }}
              />
            ))}

            {/* Zonas de Almoço de Fundo (transparentes e hachuradas) */}
            {almocos.map((alm, idx) => {
              const pos = calcularPosicaoBloco(alm.inicio, alm.fim, janela);
              if (!pos.visivel) return null;
              return (
                <div
                  key={`almoco-bg-${idx}`}
                  title={`${alm.label} (${formatarHoraHHMM(alm.inicio)} - ${formatarHoraHHMM(alm.fim)})`}
                  className="absolute top-0 bottom-8 pointer-events-none z-0 border-x border-amber-300/40 dark:border-amber-700/30 bg-amber-100/20 dark:bg-amber-950/20 flex items-start justify-center pt-1"
                  style={{
                    left: `${pos.left}%`,
                    width: `${pos.width}%`,
                    backgroundImage:
                      "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(245, 158, 11, 0.05) 5px, rgba(245, 158, 11, 0.05) 10px)",
                  }}
                >
                  <span className="text-[9px] font-bold text-amber-600/80 dark:text-amber-400/70 uppercase">
                    🍽️ {alm.label}
                  </span>
                </div>
              );
            })}

            {/* Linha vertical dinâmica do "AGORA" cortando todo o quadrante */}
            {agoraEstaNaJanela && (
              <div
                className="absolute top-0 bottom-0 border-l-2 border-rose-500 z-20 pointer-events-none"
                style={{ left: `${agoraPct}%` }}
              />
            )}

            {/* CONTEÚDO DAS FAIXAS COM ESPAÇAMENTO */}
            <div className="space-y-3 pb-2 relative z-10">
              {/* ======================================================== */}
              {/* TRILHA 1: FAIXA 1 — PATAN TEÓRICO (Baseline Padrão) */}
              {/* ======================================================== */}
              {exibirFaixaTeorico && (
                <div
                  style={{ height: `${alturaPx}px` }}
                  className="relative rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-100/50 dark:bg-slate-800/30 px-1 shadow-2xs"
                >
                  {itens.map((item) => {
                    if (!item.hora_inicial || !item.hora_final) return null;
                    const pos = calcularPosicaoBloco(item.hora_inicial, item.hora_final, janela);
                    if (!pos.visivel) return null;

                    const qtdPecas = item.kanbans * item.qtd_por_kanban;

                    return (
                      <button
                        key={`teorico-${item.id ?? item.sequencia}`}
                        type="button"
                        onClick={() => onSelectItem(item, "teorico")}
                        style={{ left: `${pos.left}%`, width: `${Math.max(minBlocoFaixasSuperioresPct, pos.width)}%` }}
                        className="absolute top-1.5 bottom-1.5 rounded-lg px-2 py-1 text-left bg-slate-200/90 hover:bg-slate-300/90 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300/90 dark:border-slate-600/90 flex flex-col justify-between overflow-hidden shadow-xs transition-all hover:scale-[1.01] hover:z-20 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-1 leading-tight">
                          <span className="font-bold text-[11px] font-mono truncate">
                            #{item.sequencia} {item.material || "LOTE"}
                          </span>
                          <span className="text-[8px] px-1.5 py-0.5 bg-slate-300 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300 font-sans font-bold shrink-0">
                            Patan Padrão
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-600 dark:text-slate-400 font-mono">
                          <span>{qtdPecas} pçs ({item.kanbans}k)</span>
                          <span>{formatarHoraHHMM(item.hora_inicial)} - {formatarHoraHHMM(item.hora_final)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ======================================================== */}
              {/* TRILHA 2: FAIXA 2 — PROGRAMADO (Tabela B com Ajustes) */}
              {/* ======================================================== */}
              {exibirFaixaProgramado && (
                <div
                  style={{ height: `${alturaPx}px` }}
                  className="relative rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 px-1 shadow-2xs"
                >
                  {itens.map((item) => {
                    if (!item.hora_inicial || !item.hora_final) return null;
                    const pos = calcularPosicaoBloco(item.hora_inicial, item.hora_final, janela);
                    if (!pos.visivel) return null;

                    const qtdPecas = item.kanbans * item.qtd_por_kanban;

                    let corBloco =
                      item.turno === 1
                        ? "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
                        : item.turno === 2
                        ? "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-100 dark:border-amber-700"
                        : "bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-100 dark:border-indigo-700";

                    if (item.is_critico) {
                      corBloco =
                        "bg-rose-100 hover:bg-rose-200 text-rose-950 border-rose-400 dark:bg-rose-950/80 dark:text-rose-100 dark:border-rose-700";
                    }

                    return (
                      <button
                        key={`prog-${item.id ?? item.sequencia}`}
                        type="button"
                        onClick={() => onSelectItem(item, "programado")}
                        style={{ left: `${pos.left}%`, width: `${Math.max(minBlocoFaixasSuperioresPct, pos.width)}%` }}
                        className={`absolute top-1.5 bottom-1.5 rounded-lg px-2 py-1 text-left border flex flex-col justify-between overflow-hidden shadow-xs transition-all hover:scale-[1.01] hover:z-20 cursor-pointer ${corBloco}`}
                      >
                        <div className="flex items-center justify-between gap-1 leading-tight">
                          <span className="font-bold text-[11px] font-mono truncate">
                            #{item.sequencia} {item.material || "LOTE"}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.almoco_incluso && (
                              <span
                                title="Horário de refeição/almoço incluso neste lote"
                                className="px-1 py-0.2 bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/40 rounded text-[8px] font-bold uppercase flex items-center gap-0.5"
                              >
                                🍽️ Almoço
                              </span>
                            )}
                            {item.is_critico && (
                              <span className="px-1.5 py-0.5 bg-rose-600 text-white rounded text-[8px] font-extrabold uppercase shrink-0">
                                CRÍTICO
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-600 dark:text-slate-400 font-mono">
                          <span>{qtdPecas} pçs ({item.kanbans}k)</span>
                          <span>{formatarHoraHHMM(item.hora_inicial)} - {formatarHoraHHMM(item.hora_final)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ======================================================== */}
              {/* TRILHA 3: FAIXA 3 — REALIZADO (Chão de Fábrica & GAPs) */}
              {/* ======================================================== */}
              {exibirFaixaRealizado && (
                <div
                  style={{ height: `${alturaPx}px` }}
                  className="relative rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 px-1 shadow-2xs"
                >
                  {blocosRealizados.map((bloco) => {
                    const qtdPecas =
                      bloco.item.quantidade_produzida_real ??
                      bloco.item.kanbans * bloco.item.qtd_por_kanban;

                    // Caso 1: Quebra / Avaria de Máquina
                    if (bloco.tipo === "quebra") {
                      const duracaoTexto = formatarDuracaoSegundos(bloco.duracaoSegundos);
                      const tooltip = `⚠️ QUEBRA: ${bloco.item.material}\nProduzidas: ${qtdPecas} peças\nHorário Real: ${formatarHoraHHMMSS(bloco.inicio)} até ${formatarHoraHHMMSS(bloco.fim)} (${duracaoTexto})\nClique para detalhes`;

                      return (
                        <div key={`real-quebra-${bloco.item.id}`}>
                          {/* Barra Encurtada de Quebra */}
                          <button
                            type="button"
                            onClick={() => onSelectItem(bloco.item, "realizado")}
                            style={{
                              left: `${bloco.leftPercent}%`,
                              width: `${bloco.widthPercent}%`,
                            }}
                            title={tooltip}
                            className="absolute top-1.5 bottom-1.5 rounded-lg px-2 py-1 text-left bg-rose-600 hover:bg-rose-700 text-white border border-rose-700 flex flex-col justify-between overflow-hidden shadow-xs z-10 transition-all hover:scale-[1.02] hover:z-30 hover:ring-2 hover:ring-rose-300 cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-1 leading-tight">
                              <span className="font-bold text-[11px] truncate flex items-center gap-1 font-mono">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                <span className="truncate">⚠️ QUEBRA: {bloco.item.material}</span>
                              </span>
                              <span className="text-[9px] bg-rose-800 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                                {bloco.item.quantidade_produzida_real ?? 0} pçs
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-rose-200 font-mono leading-none">
                              <span>Quebra ({duracaoTexto})</span>
                              <span>{formatarHoraHHMM(bloco.inicio)} - {formatarHoraHHMM(bloco.fim)}</span>
                            </div>
                          </button>

                          {/* GAP VISUAL LIVRE (Parada de máquina / Tempo Livre para Remanejar) */}
                          {bloco.gap && (
                            <button
                              type="button"
                              onClick={() => onSelectItem(bloco.item, "gap")}
                              style={{
                                left: `${bloco.gap.leftPercent}%`,
                                width: `${bloco.gap.widthPercent}%`,
                                backgroundImage:
                                  "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(225, 29, 72, 0.08) 6px, rgba(225, 29, 72, 0.08) 12px)",
                              }}
                              className="absolute top-1.5 bottom-1.5 rounded-lg px-2 border-2 border-dashed border-rose-400 dark:border-rose-600 bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 flex items-center justify-center gap-1.5 overflow-hidden hover:bg-rose-100/70 transition-colors cursor-pointer group hover:z-20"
                              title="GAP Disponível: Máquina interrompida por quebra. Espaço livre para remanejamento de programação!"
                            >
                              <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 truncate text-rose-600 dark:text-rose-400 group-hover:scale-105 transition-transform">
                                ⚡ GAP LIVRE / PARADA ({formatarHoraHHMM(bloco.fim)} - {formatarHoraHHMM(bloco.gap.fimPlanejado)})
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    }

                    // Caso 2: Concluído (Normal ou Parcial)
                    if (bloco.tipo === "concluido") {
                      const duracaoTexto = formatarDuracaoSegundos(bloco.duracaoSegundos);
                      const totalProgramado = bloco.item.kanbans * bloco.item.qtd_por_kanban;
                      const isParcial =
                        bloco.item.quantidade_produzida_real !== null &&
                        bloco.item.quantidade_produzida_real !== undefined &&
                        bloco.item.quantidade_produzida_real < totalProgramado;

                      const tooltip = isParcial
                        ? `⚠️ CONCLUSÃO PARCIAL: ${bloco.item.material || "LOTE"} | Produzidas ${bloco.item.quantidade_produzida_real} de ${totalProgramado} peças programadas\nHorário Real: ${formatarHoraHHMMSS(bloco.inicio)} até ${formatarHoraHHMMSS(bloco.fim)} (${duracaoTexto})\nClique para detalhes completos`
                        : `${bloco.item.material || "LOTE"} | ${qtdPecas} peças\nHorário Real: ${formatarHoraHHMMSS(bloco.inicio)} até ${formatarHoraHHMMSS(bloco.fim)} (${duracaoTexto})\nClique para detalhes completos`;

                      return (
                        <button
                          key={`real-concluido-${bloco.item.id}`}
                          type="button"
                          onClick={() => onSelectItem(bloco.item, "realizado")}
                          style={{
                            left: `${bloco.leftPercent}%`,
                            width: `${bloco.widthPercent}%`,
                          }}
                          title={tooltip}
                          className={`absolute top-1.5 bottom-1.5 rounded-lg px-2 py-1 text-left shadow-xs flex flex-col justify-between overflow-hidden transition-all duration-150 hover:scale-[1.02] hover:z-30 hover:ring-2 hover:shadow-md cursor-pointer ${
                            isParcial
                              ? "bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-600 hover:ring-amber-300"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 hover:ring-emerald-300"
                          } ${
                            bloco.isRapido
                              ? isParcial
                                ? "ring-1 ring-amber-300/80 bg-amber-500/95"
                                : "ring-1 ring-emerald-300/80 bg-emerald-600/95"
                              : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 leading-tight">
                            <span className="font-bold text-[11px] truncate flex items-center gap-1 font-mono">
                              {isParcial ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-950 shrink-0" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
                              )}
                              <span className="truncate">{bloco.item.material}</span>
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {bloco.item.almoco_incluso && (
                                <span
                                  className={`text-[7.5px] px-1 py-0.2 rounded font-bold uppercase shrink-0 ${
                                    isParcial
                                      ? "bg-amber-950/20 text-amber-950 border border-amber-950/30"
                                      : "bg-amber-400/30 text-amber-100 border border-amber-300/40"
                                  }`}
                                  title="Horário de almoço/refeição incluso neste lote"
                                >
                                  🍽️ Almoço
                                </span>
                              )}
                              {isParcial ? (
                                <span className="text-[9px] bg-amber-950 text-amber-100 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                                  {bloco.item.quantidade_produzida_real} / {totalProgramado} pçs
                                </span>
                              ) : bloco.isRapido ? (
                                <span
                                  className="text-[8px] bg-emerald-800/90 text-emerald-100 px-1 py-0.5 rounded font-mono font-bold shrink-0 flex items-center gap-0.5"
                                  title="Conclusão rápida em segundos"
                                >
                                  ⚡ {duracaoTexto}
                                </span>
                              ) : (
                                <span className="text-[9px] bg-emerald-800 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                                  {qtdPecas} pçs
                                </span>
                              )}
                            </div>
                          </div>
                          <div
                            className={`flex items-center justify-between text-[9px] font-mono leading-none ${
                              isParcial ? "text-amber-950/90 font-semibold" : "text-emerald-100"
                            }`}
                          >
                            <span className="truncate">
                              {isParcial
                                ? `⚠️ Parcial (${bloco.item.quantidade_produzida_real} pçs)`
                                : bloco.isRapido
                                ? `${qtdPecas} pçs`
                                : "Realizado OK"}
                            </span>
                            <span className="shrink-0">
                              {formatarHoraHHMM(bloco.inicio)} - {formatarHoraHHMM(bloco.fim)}
                            </span>
                          </div>
                        </button>
                      );
                    }

                    // Caso 3: Em Produção ao Vivo
                    if (bloco.tipo === "produzindo") {
                      const decorridoMin = Math.round(
                        (agora.getTime() - new Date(bloco.inicio).getTime()) / (60 * 1000)
                      );
                      const tooltip = `▶ EM PRODUÇÃO: ${bloco.item.material || "LOTE"}\nIniciado às: ${formatarHoraHHMMSS(bloco.inicio)} (${decorridoMin} min decorridos)\nClique para detalhes`;

                      return (
                        <button
                          key={`real-produzindo-${bloco.item.id}`}
                          type="button"
                          onClick={() => onSelectItem(bloco.item, "realizado")}
                          style={{
                            left: `${bloco.leftPercent}%`,
                            width: `${bloco.widthPercent}%`,
                          }}
                          title={tooltip}
                          className="absolute top-1.5 bottom-1.5 rounded-lg px-2 py-1 text-left bg-gradient-to-r from-blue-600 to-emerald-600 text-white border border-blue-400 flex flex-col justify-between overflow-hidden shadow-md ring-2 ring-emerald-400 z-10 animate-pulse transition-all hover:scale-[1.02] hover:z-30 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-1 leading-tight">
                            <span className="font-bold text-[11px] truncate flex items-center gap-1 font-mono">
                              <PlayCircle className="w-3.5 h-3.5 text-white animate-spin shrink-0" />
                              <span className="truncate">▶ AO VIVO: {bloco.item.material}</span>
                            </span>
                            <span className="text-[9px] bg-blue-900/90 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                              {decorridoMin} min
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-blue-100 font-mono leading-none">
                            <span>Em linha</span>
                            <span>Desde {formatarHoraHHMM(bloco.inicio)}</span>
                          </div>
                        </button>
                      );
                    }

                    // Caso 4: Pendente na fila
                    return (
                      <button
                        key={`real-pendente-${bloco.item.id}`}
                        type="button"
                        onClick={() => onSelectItem(bloco.item, "programado")}
                        style={{
                          left: `${bloco.leftPercent}%`,
                          width: `${bloco.widthPercent}%`,
                        }}
                        title={`⏳ Fila: ${bloco.item.material || "LOTE"}\nProgramado: ${formatarHoraHHMM(bloco.inicio)} às ${formatarHoraHHMM(bloco.fim)}`}
                        className="absolute top-1.5 bottom-1.5 rounded-lg px-2 py-1 text-left border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 flex flex-col justify-between overflow-hidden transition-colors hover:bg-slate-200/50 hover:z-20 cursor-pointer"
                      >
                        <span className="text-[10px] font-mono truncate font-semibold">
                          ⏳ Fila: {bloco.item.material}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">
                          {bloco.item.kanbans * bloco.item.qtd_por_kanban} pçs
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ======================================================== */}
            {/* EIXO X: RÉGUA HORÁRIA NA BASE DO QUADRANTE */}
            {/* ======================================================== */}
            <SeisanTimeRuler janela={janela} granularidade={granularidade} horariosConfig={horariosConfig} />
          </div>
        </div>
      </div>
    </div>
  );
}
