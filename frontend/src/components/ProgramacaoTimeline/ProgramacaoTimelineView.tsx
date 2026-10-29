import { useMemo, useState, useRef, useEffect } from "react";
import { Clock } from "lucide-react";
import type { ItemProducao } from "../../types/producao";
import {
  type JanelaTemporal,
  type HorariosTurnosConfig,
  type GranularidadeZoom,
  ESCALAS_ZOOM_CONFIG,
  criarJanelaTemporal,
  calcularPosicaoBloco,
  calcularLayoutFaixaSemSobreposicao,
  gerarMarcadoresTempo,
  obterZonasAlmoco,
  formatarHoraHHMM,
} from "../../utils/seisanTimeUtils";
import { SeisanTimeRuler } from "../SeisanKaniban/SeisanTimeRuler";
import { SeisanZoomControl } from "../SeisanKaniban/SeisanZoomControl";
import { ItemDetalhe } from "../ItemDetalhe/ItemDetalhe";
import { isMaterialBloqueado } from "../../utils/ferramentariaUtils";

export interface ProgramacaoTimelineViewProps {
  itensPorPosto: Record<string, ItemProducao[]>;
  turno: number; // 1, 2, 3 ou 0 (todos)
  onAjustarKanban: (posto: string, chave: string, delta: number) => void;
  onRemoverItem: (posto: string, chave: string) => void;
  onReordenar?: (posto: string, itens: ItemProducao[]) => void;
  materiaisBloqueados?: string[];
  horariosConfig?: HorariosTurnosConfig;
  onSolicitarEditarItem?: (item: ItemProducao) => void;
}

export function ProgramacaoTimelineView({
  itensPorPosto,
  turno,
  onAjustarKanban,
  onRemoverItem,
  onReordenar,
  materiaisBloqueados = [],
  horariosConfig,
  onSolicitarEditarItem,
}: ProgramacaoTimelineViewProps) {
  const [granularidadeZoom, setGranularidadeZoom] = useState<GranularidadeZoom>("hora_1h");
  const [itemDetalhe, setItemDetalhe] = useState<ItemProducao | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [draggedItem, setDraggedItem] = useState<{
    posto: string;
    index: number;
    chave: string;
  } | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const handleTrocarOrdem = (posto: string, fromIdx: number, toIdx: number) => {
    const lista = itensPorPosto[posto];
    if (
      !lista ||
      fromIdx < 0 ||
      fromIdx >= lista.length ||
      toIdx < 0 ||
      toIdx >= lista.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const novaLista = [...lista];
    const [itemMovido] = novaLista.splice(fromIdx, 1);
    novaLista.splice(toIdx, 0, itemMovido);
    onReordenar?.(posto, novaLista);
  };

  // Calcula a janela temporal com base no turno e nos itens da programação
  const janela = useMemo<JanelaTemporal>(() => {
    let dataRef = new Date();
    for (const itens of Object.values(itensPorPosto)) {
      const primeiroComHora = itens.find((it) => it.hora_inicial);
      if (primeiroComHora?.hora_inicial) {
        const d = new Date(primeiroComHora.hora_inicial);
        if (!isNaN(d.getTime())) {
          dataRef = d;
        }
      }
    }
    const baseJanela = criarJanelaTemporal(dataRef, turno === 0 ? undefined : turno);

    // Ajusta a janela se algum item iniciar antes ou terminar depois, com limite de segurança
    let menorInicio = baseJanela.inicioDate.getTime();
    let maiorFim = baseJanela.fimDate.getTime();

    // Limites de segurança: até 60 min antes do turno e até 180 min após o turno
    const minPermitido = baseJanela.inicioDate.getTime() - 60 * 60000;
    const maxPermitido = baseJanela.fimDate.getTime() + 180 * 60000;

    for (const itens of Object.values(itensPorPosto)) {
      for (const it of itens) {
        if (it.hora_inicial) {
          const tIni = new Date(it.hora_inicial).getTime();
          if (!isNaN(tIni) && tIni >= minPermitido && tIni < menorInicio) {
            menorInicio = tIni - 15 * 60000; // margem de 15 min
          }
        }
        if (it.hora_final) {
          const tFim = new Date(it.hora_final).getTime();
          if (!isNaN(tFim) && tFim <= maxPermitido && tFim > maiorFim) {
            maiorFim = tFim + 20 * 60000; // margem de 20 min
          }
        }
      }
    }

    const duracaoMinutos = Math.max(
      baseJanela.duracaoMinutos,
      Math.round((maiorFim - menorInicio) / 60000)
    );

    return {
      inicioDate: new Date(menorInicio),
      fimDate: new Date(maiorFim),
      duracaoMinutos,
    };
  }, [turno, itensPorPosto]);

  const marcadoresHoras = useMemo(() => {
    return gerarMarcadoresTempo(janela, granularidadeZoom);
  }, [janela, granularidadeZoom]);

  const zonasAlmoco = useMemo(() => {
    return obterZonasAlmoco(janela, horariosConfig);
  }, [janela, horariosConfig]);

  const [containerLargura, setContainerLargura] = useState<number>(0);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerLargura(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Calibra a largura para ocupar 100% da tela disponível, com base ampla da escala selecionada
  const configZoom = ESCALAS_ZOOM_CONFIG[granularidadeZoom] || ESCALAS_ZOOM_CONFIG.hora_1h;
  const larguraBaseCalculada = Math.max(containerLargura || 1600, configZoom.larguraMinimaPx);
  const larguraMinimaPx = larguraBaseCalculada;

  const postos = Object.keys(itensPorPosto).sort();

  return (
    <div className="w-full flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* Barra Superior da Linha do Tempo: Legenda e Controles de Zoom */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 px-4 py-2.5">
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
            <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Seisan Kanriban — Linha do Tempo por Prensa / Posto</span>
          </div>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500/80 dark:bg-indigo-600/80 inline-block" />
              <span>Lote Programado</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/60 dark:bg-amber-500/40 border border-amber-500/50 inline-block" />
              <span>Pausa Almoço</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-400/80 inline-block" />
              <span>Crítico / Bloqueado</span>
            </span>
          </div>
        </div>

        {/* Controles de Zoom TPS Reutilizáveis */}
        <SeisanZoomControl
          granularidadeZoom={granularidadeZoom}
          onGranularidadeZoomChange={setGranularidadeZoom}
        />
      </div>

      {/* Área Principal de Rolagem com Trilhas por Prensa/Posto */}
      <div
        ref={containerRef}
        className="w-full overflow-x-auto select-none bg-slate-50/40 dark:bg-slate-950/40"
      >
        <div style={{ minWidth: `${larguraMinimaPx}px` }} className="relative flex flex-col">
          {postos.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhum posto de trabalho encontrado para esta linha e turno.
            </div>
          ) : (
            postos.map((posto) => {
              const itens = itensPorPosto[posto] ?? [];
              const totalPecas = itens.reduce((acc, it) => acc + it.kanbans * it.qtd_por_kanban, 0);

              return (
                <div
                  key={posto}
                  className="flex border-b border-slate-200/90 dark:border-slate-800 hover:bg-slate-100/40 dark:hover:bg-slate-800/30 transition-colors"
                >
                  {/* Coluna Lateral Congelada (Sticky Left) com o Nome da Prensa / Posto */}
                  <div className="sticky left-0 z-20 w-52 flex-shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 p-3.5 flex flex-col justify-center shadow-xs">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100 font-mono">
                        {posto}
                      </span>
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                        {itens.length} {itens.length === 1 ? "lote" : "lotes"}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Total:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {totalPecas.toLocaleString("pt-BR")} pçs
                      </span>
                    </div>
                  </div>

                  {/* Trilha Horizontal Temporal */}
                  <div className="relative flex-1 h-28 overflow-hidden">
                    {/* Linhas de Grade Verticais das Horas */}
                    {marcadoresHoras.map((m, idx) => (
                      <div
                        key={`${m.hora}-${idx}`}
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{ left: `${m.percentual}%` }}
                      >
                        <div
                          className={`w-px h-full ${
                            m.isHoraCheia
                              ? "bg-slate-200/90 dark:bg-slate-700/60"
                              : "bg-slate-100/60 dark:bg-slate-800/40"
                          }`}
                        />
                      </div>
                    ))}

                    {/* Zonas de Almoço Hachuradas */}
                    {zonasAlmoco.map((za, idx) => {
                      const posAlm = calcularPosicaoBloco(za.inicio, za.fim, janela);
                      if (!posAlm.visivel) return null;
                      return (
                        <div
                          key={`almoco-${idx}`}
                          className="absolute top-0 bottom-0 bg-amber-400/10 dark:bg-amber-400/5 border-x border-amber-300/40 dark:border-amber-500/20 pointer-events-none flex items-center justify-center"
                          style={{ left: `${posAlm.left}%`, width: `${posAlm.width}%` }}
                        >
                          <span className="text-[10px] font-semibold text-amber-700/70 dark:text-amber-400/50 uppercase tracking-widest rotate-90 sm:rotate-0">
                            🍽️ Almoço
                          </span>
                        </div>
                      );
                    })}

                    {/* Blocos dos Itens Programados (Com layout sem sobreposição) */}
                    {itens.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 italic">
                        Sem programação
                      </div>
                    ) : (
                      (() => {
                        const blocosDoPosto = calcularLayoutFaixaSemSobreposicao(
                          itens,
                          (it) => it.hora_inicial || janela.inicioDate,
                          (it) =>
                            it.hora_final ||
                            new Date(
                              new Date(it.hora_inicial || janela.inicioDate).getTime() + 30 * 60000
                            ),
                          janela,
                          larguraMinimaPx,
                          2
                        );

                        return blocosDoPosto.map((bloco, itemIdx) => {
                          const item = bloco.item;
                          const chave = String(item.id ?? `novo-${item.sequencia}`);

                          const isBloqueado = isMaterialBloqueado(
                            item.material,
                            materiaisBloqueados
                          );
                          const isCritico = Boolean(item.is_critico);
                          const pecasLote = item.kanbans * item.qtd_por_kanban;

                          const isDragging = draggedItem?.chave === chave;
                          const isDragOver = dragOverKey === chave && !isDragging;

                          return (
                            <div
                              key={chave}
                              draggable={Boolean(onReordenar && itens.length > 1)}
                              onDragStart={(e) => {
                                if (!onReordenar || itens.length <= 1) return;
                                setDraggedItem({ posto, index: itemIdx, chave });
                                try {
                                  e.dataTransfer.setData(
                                    "application/json",
                                    JSON.stringify({ posto, index: itemIdx })
                                  );
                                  e.dataTransfer.setData("text/plain", `${posto}:${itemIdx}`);
                                } catch {
                                  // fallback
                                }
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                setDraggedItem(null);
                                setDragOverKey(null);
                              }}
                              onDragEnter={(e) => {
                                if (onReordenar && draggedItem && draggedItem.posto === posto && draggedItem.chave !== chave) {
                                  e.preventDefault();
                                  setDragOverKey(chave);
                                }
                              }}
                              onDragOver={(e) => {
                                if (onReordenar) {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = "move";
                                  if (draggedItem && draggedItem.posto === posto && draggedItem.chave !== chave && dragOverKey !== chave) {
                                    setDragOverKey(chave);
                                  }
                                }
                              }}
                              onDragLeave={(e) => {
                                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                if (dragOverKey === chave) {
                                  setDragOverKey(null);
                                }
                              }}
                              onDrop={(e) => {
                                if (!onReordenar) return;
                                e.preventDefault();
                                e.stopPropagation();
                                setDragOverKey(null);

                                let fromIndex: number | null = null;
                                if (draggedItem && draggedItem.posto === posto) {
                                  fromIndex = draggedItem.index;
                                } else {
                                  try {
                                    const raw = e.dataTransfer.getData("application/json");
                                    if (raw) {
                                      const data = JSON.parse(raw);
                                      if (data.posto === posto && typeof data.index === "number") {
                                        fromIndex = data.index;
                                      }
                                    }
                                  } catch {
                                    // fallback
                                  }
                                }

                                setDraggedItem(null);

                                if (fromIndex !== null && fromIndex !== itemIdx) {
                                  handleTrocarOrdem(posto, fromIndex, itemIdx);
                                }
                              }}
                              onClick={() => {
                                if (!isDragging && item.id !== null) setItemDetalhe(item);
                              }}
                              title={
                                onReordenar && itens.length > 1
                                  ? `Lote #${item.sequencia} • ${item.material}\n(Arraste para reordenar ou use as setas ◀ ▶)`
                                  : `Lote #${item.sequencia} • ${item.material}`
                              }
                              className={`group absolute top-1.5 bottom-1.5 rounded-xl border p-2.5 flex flex-col justify-between shadow-xs transition-all cursor-grab active:cursor-grabbing hover:shadow-md hover:z-30 select-none ${
                                isDragging
                                  ? "opacity-35 border-dashed border-indigo-400 dark:border-indigo-500 scale-[0.98] z-20 pointer-events-none"
                                  : isDragOver
                                  ? "ring-2 ring-indigo-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900 shadow-lg scale-[1.03] z-40 bg-indigo-50/95 dark:bg-indigo-950/80 border-indigo-400 dark:border-indigo-500 text-indigo-950 dark:text-indigo-100"
                                  : isBloqueado
                                  ? "bg-red-50/95 dark:bg-red-950/80 border-red-300 dark:border-red-700 hover:border-red-400 text-red-900 dark:text-red-200"
                                  : isCritico
                                  ? "bg-amber-50/95 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200"
                                  : "bg-white/95 dark:bg-slate-800/95 border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-slate-800 dark:text-slate-100"
                              }`}
                              style={{
                                left: `${bloco.leftPercent}%`,
                                width: `${bloco.widthPercent}%`,
                                minWidth: "52px",
                              }}
                            >
                            {/* Linha 1 do Card: Seq, Material, Almoço, Reordenar e Botão Remover */}
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5 truncate min-w-0">
                                <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:text-slate-200">
                                  #{item.sequencia}
                                </span>
                                <span className="font-bold text-xs truncate font-mono text-slate-900 dark:text-slate-100" title={item.material}>
                                  {item.material}
                                </span>
                                {item.almoco_incluso && (
                                  <span title="Horário de Almoço Incluso" className="text-xs">
                                    🍽️
                                  </span>
                                )}
                              </div>
                              <div
                                className="flex items-center gap-0.5 shrink-0"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                {onReordenar && itens.length > 1 && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={itemIdx === 0}
                                      draggable={false}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleTrocarOrdem(posto, itemIdx, itemIdx - 1);
                                      }}
                                      title={
                                        itemIdx === 0
                                          ? "Primeiro lote da sequência"
                                          : "Mover lote para trás (◀ adiantar na sequência)"
                                      }
                                      aria-label="Mover lote para trás"
                                      className="w-4.5 h-4.5 flex items-center justify-center rounded text-[10px] font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 disabled:opacity-20 transition-all cursor-pointer disabled:cursor-not-allowed"
                                    >
                                      ◀
                                    </button>
                                    <button
                                      type="button"
                                      disabled={itemIdx === itens.length - 1}
                                      draggable={false}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleTrocarOrdem(posto, itemIdx, itemIdx + 1);
                                      }}
                                      title={
                                        itemIdx === itens.length - 1
                                          ? "Último lote da sequência"
                                          : "Mover lote para frente (▶ atrasar na sequência)"
                                      }
                                      aria-label="Mover lote para frente"
                                      className="w-4.5 h-4.5 flex items-center justify-center rounded text-[10px] font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 disabled:opacity-20 transition-all cursor-pointer disabled:cursor-not-allowed"
                                    >
                                      ▶
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  draggable={false}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoverItem(posto, chave);
                                  }}
                                  title="Retirar este lote da fila"
                                  aria-label={`Retirar ${item.material || "item"} da fila`}
                                  className="rounded p-0.5 text-slate-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors shrink-0 ml-0.5 cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            {/* Linha 2 do Card: Horário Planejado e Peças em Destaque */}
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                                <span className="text-[10px] text-indigo-500">⏱️</span>
                                <span>{formatarHoraHHMM(bloco.inicio)}</span>
                                <span className="text-slate-400">➜</span>
                                <span>{formatarHoraHHMM(bloco.fim)}</span>
                              </span>
                              <span className="font-bold text-indigo-700 dark:text-indigo-300">
                                {pecasLote.toLocaleString("pt-BR")} pçs
                              </span>
                            </div>

                            {/* Linha 3 do Card: Ajustador Interativo de Kanbans (+ / -) e Badges */}
                            <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                              <div
                                className="flex items-center gap-1"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  draggable={false}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAjustarKanban(posto, chave, -1);
                                  }}
                                  title="Diminuir kanban (-1)"
                                  aria-label="Diminuir kanban"
                                  className="w-5.5 h-5.5 flex items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-slate-50 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-bold transition-all active:scale-95 leading-none cursor-pointer shadow-2xs"
                                >
                                  -
                                </button>
                                <span className="font-bold text-xs text-slate-900 dark:text-slate-100 min-w-[36px] text-center font-mono">
                                  {item.kanbans} cx
                                </span>
                                <button
                                  type="button"
                                  draggable={false}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAjustarKanban(posto, chave, 1);
                                  }}
                                  title="Aumentar kanban (+1)"
                                  aria-label="Aumentar kanban"
                                  className="w-5.5 h-5.5 flex items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-slate-50 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-bold transition-all active:scale-95 leading-none cursor-pointer shadow-2xs"
                                >
                                  +
                                </button>
                              </div>

                              {isBloqueado ? (
                                <span className="rounded bg-red-100 dark:bg-red-900/60 px-1.5 py-0.5 text-[9px] font-bold text-red-800 dark:text-red-200">
                                  ⛔ Bloqueado
                                </span>
                              ) : isCritico ? (
                                <span className="rounded bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:text-amber-200">
                                  🔴 Crítico
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                  {item.qtd_por_kanban} pç/cx
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()
                  )}
                  </div>
                </div>
              );
            })
          )}

          {/* Régua de Tempo no Rodapé (Eixo X) */}
          <div className="flex bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
            <div className="sticky left-0 z-20 w-52 flex-shrink-0 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 px-3.5 h-[35px] flex items-center">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                ⏱️ Régua de Horário
              </span>
            </div>
            <div className="flex-1">
              <SeisanTimeRuler
                janela={janela}
                larguraMinimaPx={larguraMinimaPx}
                granularidade={granularidadeZoom}
                horariosConfig={horariosConfig}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Detalhes do Item */}
      {itemDetalhe && (
        <ItemDetalhe
          item={itemDetalhe}
          onClose={() => setItemDetalhe(null)}
          onSolicitarEditarItem={
            onSolicitarEditarItem
              ? (it) => {
                  setItemDetalhe(null);
                  onSolicitarEditarItem(it);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
