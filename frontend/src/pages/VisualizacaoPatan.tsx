import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Factory,
  Zap,
  Calendar,
  Clock,
  Layers,
  ChevronRight,
  Filter,
  Maximize2,
  Minimize2,
  Box,
  TrendingUp,
  Info,
  CheckCircle2,
  X,
} from "lucide-react";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import {
  getPatanTeorico,
  getResumoPatans,
  type ResumoPatanInfo,
  type ItemPatanTeorico,
  type MaquinaPatanTeorico,
  type PatanTeoricoResponse,
} from "../services/api";
import { PATANS_SOLDA, PATANS_ESTAMPARIA } from "../types/producao";

// Paleta de cores por sequência para diferenciar visualmente os blocos
const BLOCK_COLORS = [
  {
    bg: "bg-blue-500/15 dark:bg-blue-500/25",
    border: "border-blue-400 dark:border-blue-600",
    text: "text-blue-900 dark:text-blue-200",
    badge: "bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200",
  },
  {
    bg: "bg-emerald-500/15 dark:bg-emerald-500/25",
    border: "border-emerald-400 dark:border-emerald-600",
    text: "text-emerald-900 dark:text-emerald-200",
    badge: "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200",
  },
  {
    bg: "bg-purple-500/15 dark:bg-purple-500/25",
    border: "border-purple-400 dark:border-purple-600",
    text: "text-purple-900 dark:text-purple-200",
    badge: "bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200",
  },
  {
    bg: "bg-amber-500/15 dark:bg-amber-500/25",
    border: "border-amber-400 dark:border-amber-600",
    text: "text-amber-900 dark:text-amber-200",
    badge: "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200",
  },
  {
    bg: "bg-indigo-500/15 dark:bg-indigo-500/25",
    border: "border-indigo-400 dark:border-indigo-600",
    text: "text-indigo-900 dark:text-indigo-200",
    badge: "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200",
  },
  {
    bg: "bg-rose-500/15 dark:bg-rose-500/25",
    border: "border-rose-400 dark:border-rose-600",
    text: "text-rose-900 dark:text-rose-200",
    badge: "bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200",
  },
  {
    bg: "bg-cyan-500/15 dark:bg-cyan-500/25",
    border: "border-cyan-400 dark:border-cyan-600",
    text: "text-cyan-900 dark:text-cyan-200",
    badge: "bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-200",
  },
  {
    bg: "bg-teal-500/15 dark:bg-teal-500/25",
    border: "border-teal-400 dark:border-teal-600",
    text: "text-teal-900 dark:text-teal-200",
    badge: "bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200",
  },
];

export function VisualizacaoPatan() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Estados principais de filtro
  const setorParam = searchParams.get("setor") || "estamparia";
  const linhaParam = searchParams.get("linha") || "LINHA 1";
  const turnoParam = searchParams.get("turno") ? Number(searchParams.get("turno")) : 1;
  const patanParam = searchParams.get("patan") || "A";

  const [setor, setSetor] = useState<string>(setorParam);
  const [linha, setLinha] = useState<string>(linhaParam);
  const [turno, setTurno] = useState<number>(turnoParam);
  const [patan, setPatan] = useState<string>(patanParam);

  const patansDisponiveis = useMemo(
    () => (setor === "estamparia" ? PATANS_ESTAMPARIA : PATANS_SOLDA),
    [setor]
  );

  useEffect(() => {
    if (patan !== "todos" && !(patansDisponiveis as readonly string[]).includes(patan)) {
      setPatan(patansDisponiveis[0]);
    }
  }, [patansDisponiveis, patan]);

  const { data: resumoPatans } = useQuery<Record<string, ResumoPatanInfo[]>>({
    queryKey: ["resumo-patans", setor],
    queryFn: () =>
      token
        ? getResumoPatans(token, setor)
        : Promise.resolve<Record<string, ResumoPatanInfo[]>>({}),
    enabled: Boolean(token),
    staleTime: 60000,
  });

  function handlePatanChange(novoPatan: string) {
    setPatan(novoPatan);
    if (resumoPatans && resumoPatans[novoPatan] && turno !== 0) {
      const ocorrencias: ResumoPatanInfo[] = resumoPatans[novoPatan];
      const temNaAtual = ocorrencias.some(
        (o: ResumoPatanInfo) => (linha === "todas" || o.linha === linha) && o.turno === turno
      );
      if (!temNaAtual && ocorrencias.length > 0) {
        const melhor =
          ocorrencias.find((o: ResumoPatanInfo) => linha === "todas" || o.linha === linha) ||
          ocorrencias[0];
        if (linha !== "todas" && melhor.linha !== linha) setLinha(melhor.linha);
        setTurno(melhor.turno);
        toast.info(
          `✨ Patan ${novoPatan}: alternado para ${melhor.linha} • ${melhor.turno}º Turno`
        );
      }
    }
  }

  const [loading, setLoading] = useState<boolean>(true);
  const [dados, setDados] = useState<PatanTeoricoResponse | null>(null);
  const [itemSelecionado, setItemSelecionado] = useState<{
    item: ItemPatanTeorico;
    maquina: MaquinaPatanTeorico;
  } | null>(null);

  // Escala de zoom (pixels por minuto)
  const [zoomPixelsPorMinuto, setZoomPixelsPorMinuto] = useState<number>(2.2);

  // Sincroniza query params
  useEffect(() => {
    const params = new URLSearchParams();
    if (setor) params.set("setor", setor);
    if (linha) params.set("linha", linha);
    if (turno !== undefined && turno !== 0) params.set("turno", String(turno));
    if (patan) params.set("patan", patan);
    setSearchParams(params, { replace: true });
  }, [setor, linha, turno, patan, setSearchParams]);

  // Carrega dados da API
  useEffect(() => {
    if (!token) return;
    let isMounted = true;
    setLoading(true);

    getPatanTeorico(token, {
      setor,
      linha: linha !== "todas" ? linha : undefined,
      turno: turno !== 0 ? turno : undefined,
      patan: patan !== "todos" ? patan : undefined,
    })
      .then((res) => {
        if (isMounted) {
          setDados(res);
        }
      })
      .catch((err) => {
        if (isMounted) {
          toast.error("Erro ao carregar dados do Patan Teórico.");
          console.error(err);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token, setor, linha, turno, patan]);

  // Totais agregados
  const totais = useMemo(() => {
    if (!dados || !dados.maquinas) {
      return { totalMaquinas: 0, totalPecas: 0, totalMinutos: 0, totalKanbans: 0 };
    }
    const totalMaquinas = dados.maquinas.length;
    let totalPecas = 0;
    let totalMinutos = 0;
    let totalKanbans = 0;

    for (const m of dados.maquinas) {
      totalPecas += m.total_pecas;
      totalMinutos += m.tempo_total_minutos;
      totalKanbans += m.total_kanbans;
    }
    return { totalMaquinas, totalPecas, totalMinutos, totalKanbans };
  }, [dados]);

  // Linhas disponíveis por setor
  const linhasOpcoes = useMemo(() => {
    if (setor === "estamparia") {
      return ["LINHA 1", "LINHA 3", "LINHA 4"];
    }
    return ["LINHA 1", "LINHA 2", "LINHA 3"];
  }, [setor]);

  return (
    <div className="w-full px-6 py-6 min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100">
      {/* Cabeçalho Superior */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl border shadow-2xs bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
            <Layers className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <span>Visualização do Patan</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full border bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                Padrão Teórico Lean TPS
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Receita mestre de sequenciamento por prensa/máquina, tempos de ciclo padrão e kanbans teóricos.
            </p>
          </div>
        </div>

        {/* Abas de Setor */}
        <div className="flex items-center gap-2 bg-slate-200/80 dark:bg-slate-900 p-1 rounded-xl border border-slate-300 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              setSetor("estamparia");
              setLinha("LINHA 1");
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              setor === "estamparia"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-2xs font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Factory className="w-4 h-4" />
            <span>🏭 Estamparia</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSetor("solda");
              setLinha("LINHA 1");
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              setor === "solda"
                ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-300 shadow-2xs font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>⚡ Solda</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros e KPIs */}
      <div className="mb-6 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* Controles de Filtros */}
        <div className="lg:col-span-8 flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          {/* Seletor Linha */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Linha:</label>
            <select
              value={linha}
              onChange={(e) => setLinha(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {linhasOpcoes.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              <option value="todas">Todas as Linhas</option>
            </select>
          </div>

          {/* Seletor Turno */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Turno:</label>
            <select
              value={turno}
              onChange={(e) => setTurno(Number(e.target.value))}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            >
              {[1, 2, 3].map((t) => {
                const ocorrencias = resumoPatans?.[patan];
                const noTurno =
                  ocorrencias?.find(
                    (o: ResumoPatanInfo) => (linha === "todas" || o.linha === linha) && o.turno === t
                  )?.total ?? 0;
                return (
                  <option key={t} value={t}>
                    {t}º Turno{noTurno > 0 ? ` (${noTurno} it.)` : ""}
                  </option>
                );
              })}
              <option value={0}>Todos os Turnos</option>
            </select>
          </div>

          {/* Seletor de Patan */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-800">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">Patan:</label>
            {setor === "estamparia" ? (
              <select
                value={patan}
                onChange={(e) => handlePatanChange(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              >
                <option value="todos">Todos os Patans ({patansDisponiveis.length})</option>
                {patansDisponiveis.map((p) => {
                  const ocorrencias = resumoPatans?.[p];
                  const total = ocorrencias
                    ? ocorrencias.reduce((acc: number, curr: ResumoPatanInfo) => acc + curr.total, 0)
                    : 0;
                  const turnoInfo =
                    ocorrencias && ocorrencias.length === 1 ? ` (${ocorrencias[0].turno}ºT)` : "";
                  return (
                    <option key={p} value={p}>
                      Patan {p}{total > 0 ? `${turnoInfo} • ${total} it.` : ""}
                    </option>
                  );
                })}
              </select>
            ) : (
              <>
                {patansDisponiveis.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePatanChange(p)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${
                      patan === p
                        ? "bg-indigo-600 text-white shadow-2xs scale-105"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPatan("todos")}
                  className={`px-2 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${
                    patan === "todos"
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  Todos
                </button>
              </>
            )}
          </div>

          {/* Controle de Zoom da Escala Temporal */}
          <div className="flex items-center gap-1.5 ml-auto pl-2 border-l border-slate-200 dark:border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Escala:</span>
            <button
              type="button"
              onClick={() => setZoomPixelsPorMinuto((z) => Math.max(1.2, z - 0.4))}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer"
              title="Reduzir Escala Temporal"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300 w-10 text-center">
              {zoomPixelsPorMinuto.toFixed(1)}x
            </span>
            <button
              type="button"
              onClick={() => setZoomPixelsPorMinuto((z) => Math.min(4.0, z + 0.4))}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer"
              title="Ampliar Escala Temporal"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* KPIs Resumo */}
        <div className="lg:col-span-4 grid grid-cols-3 gap-2.5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prensas</span>
            <div className="text-lg font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
              {totais.totalMaquinas}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Peças</span>
            <div className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
              {totais.totalPecas.toLocaleString("pt-BR")}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tempo Total</span>
            <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {(totais.totalMinutos / 60).toFixed(1)}h
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal: Máquinas Empilhadas (Uma embaixo da outra) */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 h-44"
            />
          ))}
        </div>
      ) : !dados || dados.maquinas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-12 text-center">
          <Layers className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
            Nenhum dado encontrado para os filtros selecionados
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Tente selecionar outro Patan ou Linha na barra superior.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {dados.maquinas.map((maq) => (
            <div
              key={`${maq.linha}_${maq.prensa}_${maq.turno}`}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-all duration-200"
            >
              {/* Cabeçalho da Máquina */}
              <div className="px-5 py-3.5 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-extrabold text-sm tracking-wide shadow-2xs">
                    {maq.prensa}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {maq.linha}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {maq.turno_desc}
                    </span>
                    {patan !== "todos" && (
                      <>
                        <span className="text-slate-400">•</span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          Patan {patan}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Métricas da Máquina */}
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <Box className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      <strong>{maq.itens.length}</strong> lotes
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                    <span>
                      <strong>{maq.total_pecas.toLocaleString("pt-BR")}</strong> peças ({maq.total_kanbans}K)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <Clock className="w-3.5 h-3.5 text-emerald-500" />
                    <span>
                      <strong>{maq.tempo_total_minutos} min</strong> ({(maq.tempo_total_minutos / 60).toFixed(1)}h)
                    </span>
                  </div>
                </div>
              </div>

              {/* Linha do Tempo Gráfica Horizontal */}
              <div className="p-4 overflow-x-auto">
                <div
                  className="relative min-w-max pb-2 pt-1"
                  style={{
                    width: `${Math.max(800, (maq.tempo_total_minutos + 60) * zoomPixelsPorMinuto)}px`,
                  }}
                >
                  {/* Régua Horária Superior */}
                  <div className="flex border-b border-slate-200 dark:border-slate-800 pb-1.5 mb-3 text-[11px] font-mono text-slate-400 select-none">
                    {Array.from({ length: Math.ceil((maq.tempo_total_minutos + 60) / 60) }).map((_, hIdx) => {
                      const horaMin = hIdx * 60;
                      return (
                        <div
                          key={hIdx}
                          className="flex items-center gap-1 border-l border-slate-300 dark:border-slate-700 pl-1.5"
                          style={{ width: `${60 * zoomPixelsPorMinuto}px` }}
                        >
                          <span className="font-bold text-slate-600 dark:text-slate-300">
                            +{hIdx}h ({horaMin}m)
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Trilho de Cards de Produtos do Patan */}
                  <div className="flex items-stretch gap-1.5">
                    {maq.itens.map((it, idx) => {
                      const color = BLOCK_COLORS[idx % BLOCK_COLORS.length];
                      const widthPx = Math.max(130, it.tempo_producao_min * zoomPixelsPorMinuto);

                      return (
                        <div
                          key={`${it.numero_produto}_${it.sequencia}_${idx}`}
                          onClick={() => setItemSelecionado({ item: it, maquina: maq })}
                          style={{ width: `${widthPx}px` }}
                          className={`group relative rounded-xl border-2 p-3 transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-md hover:scale-[1.01] flex flex-col justify-between shrink-0 ${color.bg} ${color.border}`}
                          title={`Clique para detalhes: ${it.numero_produto} (${it.tempo_producao_min} min)`}
                        >
                          {/* Topo do Card */}
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900/10 dark:bg-white/10 text-xs font-black">
                              #{it.sequencia}
                            </span>
                            <div className="flex items-center gap-1">
                              {it.dupla_batida && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide bg-amber-500 text-white shadow-2xs">
                                  Dupla
                                </span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${color.badge}`}>
                                {it.operacao}
                              </span>
                            </div>
                          </div>

                          {/* Código da Peça */}
                          <div className="my-1">
                            <div className={`text-xs font-black tracking-tight truncate ${color.text}`}>
                              {it.numero_produto}
                            </div>
                            {it.produto_antigo && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {it.produto_antigo}
                              </div>
                            )}
                          </div>

                          {/* Rodapé do Card com Métricas */}
                          <div className="pt-2 border-t border-slate-900/10 dark:border-white/10 mt-1 flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            <span className="flex items-center gap-1 font-mono text-indigo-700 dark:text-indigo-300">
                              <Clock className="w-3 h-3" />
                              {it.tempo_producao_min}m
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {it.qtd_k} ({it.qtd_pecas.toLocaleString("pt-BR")} pçs)
                            </span>
                          </div>

                          {/* Horários Estimados */}
                          <div className="mt-1 text-[10px] font-mono text-slate-500 dark:text-slate-400 text-center bg-white/40 dark:bg-slate-900/40 rounded py-0.5">
                            {it.hora_inicio_estimada} → {it.hora_fim_estimada}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Detalhes do Item Clicado */}
      {itemSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setItemSelecionado(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-lg">
                #{itemSelecionado.item.sequencia}
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {itemSelecionado.item.numero_produto}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {itemSelecionado.maquina.prensa} • {itemSelecionado.maquina.linha} (
                  {itemSelecionado.maquina.turno_desc})
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs border-y border-slate-200 dark:border-slate-800 py-4 my-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Operação:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {itemSelecionado.item.operacao}
                </span>
              </div>
              {itemSelecionado.item.produto_antigo && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Identificação Antiga:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {itemSelecionado.item.produto_antigo}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Tempo de Produção:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {itemSelecionado.item.tempo_producao_min} minutos (
                  {(itemSelecionado.item.tempo_producao_min / 60).toFixed(2)}h)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Quantidade de Kanbans:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {itemSelecionado.item.qtd_k} ({itemSelecionado.item.kanbans} caixas)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total de Peças:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {itemSelecionado.item.qtd_pecas.toLocaleString("pt-BR")} peças
                </span>
              </div>
              {itemSelecionado.item.pecas_hora_padrao && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Ritmo Padrão (P/H):</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {itemSelecionado.item.pecas_hora_padrao.toLocaleString("pt-BR")} pçs/h
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Horário Previsto no Ciclo:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {itemSelecionado.item.hora_inicio_estimada} às {itemSelecionado.item.hora_fim_estimada}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Dupla Batida (2 saídas):</span>
                <span
                  className={`font-bold ${
                    itemSelecionado.item.dupla_batida
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {itemSelecionado.item.dupla_batida ? "SIM (Matriz Dupla)" : "NÃO (Peça Individual)"}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setItemSelecionado(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
