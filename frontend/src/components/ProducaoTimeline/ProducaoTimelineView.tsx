import { useMemo, useState, useRef, useEffect } from "react";
import { Clock, CheckCircle2, Play, AlertTriangle } from "lucide-react";
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
  posicaoPercentual,
  formatarHoraHHMM,
} from "../../utils/seisanTimeUtils";
import { SeisanTimeRuler } from "../SeisanKaniban/SeisanTimeRuler";
import { SeisanZoomControl } from "../SeisanKaniban/SeisanZoomControl";

export interface ProducaoTimelineViewProps {
  itens: ItemProducao[];
  turno: number; // 0 = todos os turnos, 1, 2, 3
  dataBase?: string; // YYYY-MM-DD ou "todas"
  horariosConfig?: HorariosTurnosConfig;
  onSelectItem?: (item: ItemProducao) => void;
  onIniciarProducao?: (item: ItemProducao) => void;
  onSolicitarConcluir?: (item: ItemProducao) => void;
  onSolicitarQuebra?: (item: ItemProducao) => void;
  onPausarProducao?: (item: ItemProducao) => void;
}

export function ProducaoTimelineView({
  itens,
  turno,
  dataBase,
  horariosConfig,
  onSelectItem,
}: ProducaoTimelineViewProps) {
  const [granularidadeZoom, setGranularidadeZoom] = useState<GranularidadeZoom>("hora_1h");
  const [agora, setAgora] = useState<Date>(new Date());
  const [containerLargura, setContainerLargura] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Observa largura real do contêiner para aproveitamento de 100% da tela
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

  // Atualiza relógio do marcador ao vivo a cada 30 segundos
  useEffect(() => {
    const timer = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Agrupa os itens por posto de trabalho
  const postosMap = useMemo(() => {
    const mapa: Record<string, ItemProducao[]> = {};
    for (const it of itens) {
      if (!it.posto_trabalho) continue;
      mapa[it.posto_trabalho] = mapa[it.posto_trabalho] ?? [];
      mapa[it.posto_trabalho].push(it);
    }
    // Ordena os itens de cada posto cronologicamente
    for (const p of Object.keys(mapa)) {
      mapa[p].sort((a, b) => {
        // Se estiver em produção, vai para o topo
        if (a.em_producao && !b.em_producao) return -1;
        if (!a.em_producao && b.em_producao) return 1;
        const iniA = a.hora_inicial ? new Date(a.hora_inicial).getTime() : 0;
        const iniB = b.hora_inicial ? new Date(b.hora_inicial).getTime() : 0;
        if (iniA !== iniB) return iniA - iniB;
        return a.sequencia - b.sequencia;
      });
    }
    return mapa;
  }, [itens]);

  const postos = useMemo(() => Object.keys(postosMap).sort(), [postosMap]);

  // Janela temporal com base no turno e na data selecionada
  const janela = useMemo<JanelaTemporal>(() => {
    let dataRef = agora;
    if (dataBase && dataBase !== "todas") {
      const parts = dataBase.split("-").map(Number);
      if (parts.length === 3 && !isNaN(parts[0])) {
        dataRef = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
      }
    } else {
      const itemComHora = itens.find((it) => it.hora_inicial || it.inicio_real);
      if (itemComHora) {
        const raw = itemComHora.hora_inicial || itemComHora.inicio_real;
        if (raw) {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) dataRef = d;
        }
      }
    }

    const baseJanela = criarJanelaTemporal(dataRef, turno === 0 ? undefined : turno);

    let menorInicio = baseJanela.inicioDate.getTime();
    let maiorFim = baseJanela.fimDate.getTime();

    for (const it of itens) {
      const ini = it.inicio_real || it.hora_inicial;
      if (ini) {
        const tIni = new Date(ini).getTime();
        if (!isNaN(tIni) && tIni < menorInicio) {
          menorInicio = tIni - 20 * 60000;
        }
      }
      const fim = it.fim_real || it.hora_final;
      if (fim) {
        const tFim = new Date(fim).getTime();
        if (!isNaN(tFim) && tFim > maiorFim) {
          maiorFim = tFim + 30 * 60000;
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
  }, [agora, turno, dataBase, itens]);

  // Marcadores de grade baseados na granularidade ativa do Seisan
  const marcadoresHoras = useMemo(() => {
    return gerarMarcadoresTempo(janela, granularidadeZoom);
  }, [janela, granularidadeZoom]);

  const zonasAlmoco = useMemo(() => {
    return obterZonasAlmoco(janela, horariosConfig);
  }, [janela, horariosConfig]);

  // Calibra a largura para ocupar 100% da viewport ou a largura mínima da granularidade selecionada
  const configZoom = ESCALAS_ZOOM_CONFIG[granularidadeZoom] || ESCALAS_ZOOM_CONFIG.hora_1h;
  const larguraBaseCalculada = Math.max(containerLargura || 1600, configZoom.larguraMinimaPx);
  const larguraMinimaPx = larguraBaseCalculada;

  const agoraPct = posicaoPercentual(agora, janela);
  const agoraEstaNaJanela = agora >= janela.inicioDate && agora <= janela.fimDate;

  return (
    <div className="w-full flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
      {/* Barra de Controles da Linha do Tempo da Produção */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 px-3 py-1.5">
        <div className="flex items-center gap-2.5 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
            <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Linha do Tempo (Chão de Fábrica)</span>
          </div>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <div className="flex items-center gap-2.5 text-[11px] text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-emerald-500 inline-block" />
              <span>✓ Concluído</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-blue-500 animate-pulse inline-block" />
              <span>▶ Em Produção</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-rose-500 inline-block" />
              <span>⚠️ Parada / Quebra</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-slate-300 dark:bg-slate-600 inline-block" />
              <span>⏳ Na Fila</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-amber-400/60 dark:bg-amber-500/40 border border-amber-500/50 inline-block" />
              <span>🍽️ Almoço</span>
            </span>
          </div>
        </div>

        {/* Controles de Escala / Zoom TPS Reutilizáveis */}
        <SeisanZoomControl
          granularidadeZoom={granularidadeZoom}
          onGranularidadeZoomChange={setGranularidadeZoom}
        />
      </div>

      {/* Área com Rolagem Horizontal Unificada */}
      <div
        ref={containerRef}
        className="w-full overflow-x-auto select-none bg-slate-50/40 dark:bg-slate-950/40"
      >
        <div style={{ minWidth: `${larguraMinimaPx}px` }} className="relative flex flex-col">
          {postos.length === 0 ? (
            <div className="p-16 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhum item em produção encontrado para os filtros selecionados.
            </div>
          ) : (
            postos.map((posto) => {
              const itensDoPosto = postosMap[posto] ?? [];
              const concluidos = itensDoPosto.filter((it) => it.fim_real && it.motivo_interrupcao !== "quebra");
              const emProd = itensDoPosto.filter((it) => it.em_producao && !it.fim_real);
              const quebras = itensDoPosto.filter((it) => it.motivo_interrupcao === "quebra");
              const totalPecas = itensDoPosto.reduce(
                (acc, it) => acc + (it.quantidade_produzida_real ?? it.kanbans * it.qtd_por_kanban),
                0
              );

              return (
                <div
                  key={posto}
                  className="flex border-b border-slate-200/90 dark:border-slate-800 hover:bg-slate-100/40 dark:hover:bg-slate-800/30 transition-colors"
                >
                  {/* Coluna Lateral Congelada (Sticky Left) com o Nome do Posto / Prensa */}
                  <div className="sticky left-0 z-20 w-48 flex-shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-center shadow-xs">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            emProd.length > 0
                              ? "bg-blue-500 animate-ping"
                              : quebras.length > 0
                              ? "bg-rose-500"
                              : "bg-emerald-500"
                          }`}
                        />
                        <span className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100 font-mono truncate">
                          {posto}
                        </span>
                      </div>
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                        {itensDoPosto.length}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Total:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">
                        {totalPecas.toLocaleString("pt-BR")} pçs
                      </span>
                    </div>

                    {/* Resumo de Status do Posto */}
                    <div className="mt-1.5 flex items-center gap-1 text-[9px] font-semibold">
                      {concluidos.length > 0 && (
                        <span className="px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">
                          {concluidos.length}✓
                        </span>
                      )}
                      {emProd.length > 0 && (
                        <span className="px-1 py-0.2 rounded bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 animate-pulse">
                          Ao Vivo
                        </span>
                      )}
                      {quebras.length > 0 && (
                        <span className="px-1 py-0.2 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300">
                          {quebras.length}⚠️
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Trilha Horizontal da Linha do Tempo do Posto */}
                  <div className="relative flex-1 h-24 overflow-hidden">
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

                    {/* Zonas de Refeição Hachuradas */}
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

                    {/* Marcador Vertical "AGORA" */}
                    {agoraEstaNaJanela && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-rose-500 dark:bg-rose-400 z-20 pointer-events-none shadow-sm"
                        style={{ left: `${agoraPct}%` }}
                      />
                    )}

                    {/* Blocos de Produção (Sem Sobreposição Geométrica) */}
                    {(() => {
                      const blocosDoPosto = calcularLayoutFaixaSemSobreposicao(
                        itensDoPosto,
                        (it) => it.inicio_real || it.hora_inicial || janela.inicioDate,
                        (it) =>
                          it.fim_real ||
                          (it.em_producao ? agora : it.hora_final) ||
                          new Date(
                            new Date(it.inicio_real || it.hora_inicial || janela.inicioDate).getTime() +
                              30 * 60000
                          ),
                        janela,
                        larguraMinimaPx,
                        2
                      );

                      return blocosDoPosto.map((bloco) => {
                        const item = bloco.item;
                        const isEmProducao = Boolean(item.em_producao && !item.fim_real);
                        const isConcluido = Boolean(item.fim_real && item.motivo_interrupcao !== "quebra");
                        const isQuebra = Boolean(item.motivo_interrupcao === "quebra");
                        const isPendente = !item.fim_real && !item.em_producao;

                        const tInicio = bloco.inicio;
                        const tFim = bloco.fim;
                        const pecasMostradas =
                          item.quantidade_produzida_real ?? item.kanbans * item.qtd_por_kanban;

                        // Estilização por status
                        let blocoEstilo =
                          "bg-white/95 dark:bg-slate-800/95 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-slate-400";
                        let badgeStatus = null;

                        if (isConcluido) {
                          blocoEstilo =
                            "bg-emerald-600/90 hover:bg-emerald-600 text-white border-emerald-700 shadow-xs";
                          badgeStatus = (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold text-white bg-emerald-800/60 px-1 py-0.2 rounded">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Concluído
                            </span>
                          );
                        } else if (isEmProducao) {
                          blocoEstilo =
                            "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-400 shadow-md ring-2 ring-blue-400/50 animate-pulse";
                          badgeStatus = (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold text-white bg-blue-900/60 px-1 py-0.2 rounded">
                              <Play className="w-2.5 h-2.5" /> Ao Vivo
                            </span>
                          );
                        } else if (isQuebra) {
                          blocoEstilo =
                            "bg-rose-600/90 hover:bg-rose-600 text-white border-rose-700 shadow-xs";
                          badgeStatus = (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold text-white bg-rose-900/60 px-1 py-0.2 rounded">
                              <AlertTriangle className="w-2.5 h-2.5" /> Quebra
                            </span>
                          );
                        } else if (isPendente) {
                          blocoEstilo =
                            item.turno === 1
                              ? "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
                              : item.turno === 2
                              ? "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-100 dark:border-amber-700"
                              : "bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-100 dark:border-indigo-700";
                          badgeStatus = (
                            <span className="text-[9px] text-slate-500 dark:text-slate-400">
                              Fila #{item.sequencia}
                            </span>
                          );
                        }

                        return (
                          <div
                            key={`bloco-prod-${item.id}`}
                            onClick={() => onSelectItem?.(item)}
                            className={`group absolute top-1.5 bottom-1.5 rounded-xl border p-2 flex flex-col justify-between shadow-xs transition-all cursor-pointer hover:shadow-md hover:z-30 select-none ${blocoEstilo}`}
                            style={{
                              left: `${bloco.leftPercent}%`,
                              width: `${bloco.widthPercent}%`,
                              minWidth: "48px",
                            }}
                            title={`${item.material} - ${pecasMostradas} peças (${formatarHoraHHMM(tInicio)} - ${formatarHoraHHMM(tFim)})`}
                          >
                            {/* Cabeçalho do Bloco */}
                            <div className="flex items-center justify-between gap-1 leading-tight">
                              <div className="flex items-center gap-1 truncate min-w-0">
                                <span className="font-mono text-[10px] font-bold opacity-80">
                                  #{item.sequencia}
                                </span>
                                <span className="font-bold text-xs truncate">
                                  {item.material}
                                </span>
                              </div>
                              <div className="shrink-0">{badgeStatus}</div>
                            </div>

                            {/* Horário e Peças */}
                            <div className="flex items-center justify-between text-[10px] font-mono opacity-90">
                              <span>
                                {formatarHoraHHMM(tInicio)} - {formatarHoraHHMM(tFim)}
                              </span>
                              <span className="font-bold">
                                {pecasMostradas.toLocaleString("pt-BR")} pçs
                              </span>
                            </div>

                            {/* Rodapé: Kanbans e Almoço */}
                            <div className="flex items-center justify-between text-[9px] opacity-80 pt-0.5 border-t border-current/20">
                              <span>{item.kanbans} cx × {item.qtd_por_kanban}</span>
                              {item.almoco_incluso && (
                                <span className="font-bold" title="Horário de Almoço Incluso">
                                  🍽️ Almoço
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              );
            })
          )}

          {/* Régua de Tempo no Rodapé (Eixo X) */}
          <div className="flex bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
            <div className="sticky left-0 z-20 w-48 flex-shrink-0 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 px-3.5 h-[35px] flex items-center">
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
    </div>
  );
}
