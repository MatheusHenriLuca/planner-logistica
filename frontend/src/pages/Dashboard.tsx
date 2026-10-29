import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  Zap,
  Factory,
  Layers,
  Search,
  Filter,
  PieChart as PieChartIcon,
  ShieldAlert,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { obterMetricas, listarLinhas } from "../services/api";
import {
  LINHAS_SOLDA_PADRAO,
  LINHAS_ESTAMPARIA_PADRAO,
  PATANS_SOLDA,
  PATANS_ESTAMPARIA,
  type Patan,
} from "../types/producao";

export function Dashboard() {
  const { token, logout, permissoes, role } = useAuth();
  const [setor, setSetor] = useState<string>("todos");
  const [linha, setLinha] = useState<string>("");
  const [turno, setTurno] = useState<string>("");
  const [patan, setPatan] = useState<string>("");
  const [buscaPosto, setBuscaPosto] = useState<string>("");

  const patansDisponiveis = useMemo(() => {
    if (setor === "estamparia") return PATANS_ESTAMPARIA;
    if (setor === "solda") return PATANS_SOLDA;
    return Array.from(new Set([...PATANS_SOLDA, ...PATANS_ESTAMPARIA]));
  }, [setor]);

  const podeVerSolda =
    role === "admin" || role === "programador" || (permissoes ? permissoes.pode_ver_solda : true);
  const podeVerEstamparia =
    role === "admin" || role === "programador" || (permissoes ? permissoes.pode_ver_estamparia : true);

  // Carrega linhas cadastradas
  const { data: linhasApi } = useQuery({
    queryKey: ["linhas-producao"],
    queryFn: () => (token ? listarLinhas(token) : Promise.resolve([])),
    enabled: Boolean(token),
    staleTime: 60000,
  });

  const linhasDisponiveis = useMemo(() => {
    let lista =
      linhasApi && linhasApi.length > 0
        ? linhasApi.map((l) => ({ valor: l.nome, label: l.nome, setor: l.setor }))
        : [
            ...LINHAS_SOLDA_PADRAO.map((l) => ({ ...l, setor: "solda" })),
            ...LINHAS_ESTAMPARIA_PADRAO.map((l) => ({ ...l, setor: "estamparia" })),
          ];

    if (setor !== "todos") {
      lista = lista.filter((l) => l.setor === setor);
    }
    return lista;
  }, [linhasApi, setor]);

  const query = useQuery({
    queryKey: ["dashboard-metricas", setor, linha, turno, patan],
    queryFn: async () => {
      if (!token) throw new Error("sem token");
      try {
        return await obterMetricas(token, {
          setor: setor !== "todos" ? setor : undefined,
          linha: linha || undefined,
          turno: turno ? Number(turno) : undefined,
          patan: patan || undefined,
        });
      } catch (err) {
        throw err;
      }
    },
    enabled: Boolean(token),
    refetchInterval: 30000,
  });

  const data = query.data;

  // Filtra throughput por posto se houver busca
  const throughputFiltrado = useMemo(() => {
    if (!data?.throughput_por_posto) return [];
    if (!buscaPosto.trim()) return data.throughput_por_posto;
    return data.throughput_por_posto.filter((p) =>
      p.posto_trabalho.toLowerCase().includes(buscaPosto.toLowerCase())
    );
  }, [data?.throughput_por_posto, buscaPosto]);

  // Max throughput para normalização da barra do gráfico
  const maxPecasPosto = useMemo(() => {
    if (!data?.throughput_por_posto || data.throughput_por_posto.length === 0) return 1;
    return Math.max(...data.throughput_por_posto.map((p) => p.total_pecas), 1);
  }, [data?.throughput_por_posto]);

  // Donut chart calculations
  const donutData = useMemo(() => {
    if (!data) return [];
    const concluidos = data.itens_concluidos || 0;
    const aoVivo = data.itens_em_producao || 0;
    const naFila = data.itens_na_fila || 0;
    const quebra = data.itens_quebra || 0;
    const criticos = Math.round((data.total_itens * data.pct_itens_criticos) / 100) || 0;

    const total = concluidos + aoVivo + naFila + quebra;
    if (total === 0) {
      return [{ label: "Sem lotes", valor: 1, cor: "#94a3b8", pct: 100 }];
    }

    return [
      {
        label: "Concluídos",
        valor: concluidos,
        cor: "#10b981", // emerald-500
        pct: Math.round((concluidos / total) * 100),
      },
      {
        label: "Em Produção",
        valor: aoVivo,
        cor: "#0ea5e9", // sky-500
        pct: Math.round((aoVivo / total) * 100),
      },
      {
        label: "Na Fila",
        valor: naFila,
        cor: "#f59e0b", // amber-500
        pct: Math.round((naFila / total) * 100),
      },
      {
        label: "Quebras / Paradas",
        valor: quebra,
        cor: "#ef4444", // red-500
        pct: Math.round((quebra / total) * 100),
      },
    ].filter((item) => item.valor > 0);
  }, [data]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6 transition-colors">
      {/* Top Header & Slicers Bar (Power BI Style) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-4 sm:p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <BarChart3 className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Dashboard Executivo de Produção
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Métricas industriais em tempo real, OEE Lean, capacidade e acompanhamento de fábrica
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
              <span>{query.isFetching ? "Atualizando..." : "Sincronizar"}</span>
            </button>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800/70 px-2.5 py-1 rounded-md border border-slate-200/60 dark:border-slate-700/60">
              Auto-refresh: <strong className="text-emerald-600 dark:text-emerald-400">30s</strong>
            </div>
          </div>
        </div>

        {/* Slicers / Filtros */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros:</span>
          </div>

          {/* Slicer Setor */}
          <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => {
                setSetor("todos");
                setLinha("");
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                setor === "todos"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Todos os Setores
            </button>
            {podeVerSolda && (
              <button
                type="button"
                onClick={() => {
                  setSetor("solda");
                  setLinha("");
                }}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  setor === "solda"
                    ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Zap className="w-3 h-3 text-emerald-500" />
                <span>Solda</span>
              </button>
            )}
            {podeVerEstamparia && (
              <button
                type="button"
                onClick={() => {
                  setSetor("estamparia");
                  setLinha("");
                }}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  setor === "estamparia"
                    ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Factory className="w-3 h-3 text-blue-500" />
                <span>Estamparia</span>
              </button>
            )}
          </div>

          {/* Slicer Linha */}
          <select
            value={linha}
            onChange={(e) => setLinha(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-1 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">Linha (Todas)</option>
            {linhasDisponiveis.map((l) => (
              <option key={l.valor} value={l.valor}>
                {l.label}
              </option>
            ))}
          </select>

          {/* Slicer Turno */}
          <select
            value={turno}
            onChange={(e) => setTurno(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-1 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">Turno (Todos)</option>
            <option value="1">1º Turno (06:20)</option>
            <option value="2">2º Turno (14:40)</option>
            <option value="3">3º Turno (23:00)</option>
          </select>

          {/* Slicer Patan */}
          <select
            value={patan}
            onChange={(e) => setPatan(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-1 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">Patan (Todos)</option>
            {patansDisponiveis.map((p) => (
              <option key={p} value={p}>
                Patan {p}
              </option>
            ))}
          </select>

          {(linha || turno || patan || setor !== "todos") && (
            <button
              type="button"
              onClick={() => {
                setSetor("todos");
                setLinha("");
                setTurno("");
                setPatan("");
              }}
              className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer ml-auto"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {query.isLoading && (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin mr-2 text-emerald-500" />
          <span>Calculando métricas industriais...</span>
        </div>
      )}

      {query.isError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 p-4 text-sm text-red-700 dark:text-red-400 flex items-center gap-3"
        >
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>Falha ao carregar as métricas do painel operacional.</span>
        </div>
      )}

      {data && (
        <>
          {/* Grid de KPIs Executivos Estilo Power BI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Volume de Peças & Aderência */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-5 shadow-xs relative overflow-hidden transition-colors">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Volume Produzido</span>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                  {data.total_pecas_produzidas.toLocaleString("pt-BR")}
                </span>
                <span className="text-xs text-slate-400">
                  / {data.total_pecas_planejadas.toLocaleString("pt-BR")} pcs
                </span>
              </div>
              {/* Barra de Progresso */}
              <div className="mt-3">
                <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  <span>Aderência à Meta</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {data.aderencia_plano_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, data.aderencia_plano_pct))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Lotes & Status de Chão de Fábrica */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-5 shadow-xs relative overflow-hidden transition-colors">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Total de Lotes</span>
                <Layers className="w-4 h-4 text-blue-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                  {data.total_itens}
                </span>
                <span className="text-xs text-slate-400">lotes programados</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/70 text-center">
                <div className="p-1 rounded-md bg-emerald-50/60 dark:bg-emerald-500/10">
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">✓ Feitos</div>
                  <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    {data.itens_concluidos}
                  </div>
                </div>
                <div className="p-1 rounded-md bg-sky-50/60 dark:bg-sky-500/10">
                  <div className="text-[10px] text-sky-700 dark:text-sky-400 font-medium">▶ Ao Vivo</div>
                  <div className="text-xs font-bold text-sky-800 dark:text-sky-300">
                    {data.itens_em_producao}
                  </div>
                </div>
                <div className="p-1 rounded-md bg-amber-50/60 dark:bg-amber-500/10">
                  <div className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">⏳ Fila</div>
                  <div className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    {data.itens_na_fila}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: OEE Lean & Eficiência */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-5 shadow-xs relative overflow-hidden transition-colors">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>OEE Operacional Estimado</span>
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                  {data.oee_estimado_pct.toFixed(1)}%
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  Lean TPS
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  <span>Quebras / Paradas:</span>
                </div>
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  {data.itens_quebra} ocorrência(s)
                </span>
              </div>
            </div>

            {/* Card 4: Qualidade & Checklist de Segurança */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-5 shadow-xs relative overflow-hidden transition-colors">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Qualidade & Checklist</span>
                <CheckCircle2 className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                  {data.taxa_conclusao_checklist.toFixed(1)}%
                </span>
                <span className="text-xs text-slate-400">conformidade</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                  <span>Itens Críticos:</span>
                </div>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {data.pct_itens_criticos.toFixed(1)}% do plano
                </span>
              </div>
            </div>
          </div>

          {/* Gráficos Interativos (Power BI Visuals) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Visual 1: Throughput por Posto de Trabalho (Horizontal Bar Chart) */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-5 shadow-xs transition-colors flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-500" />
                    <span>Throughput & Volume de Peças por Posto</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Capacidade e peças produzidas por posto de trabalho e turno
                  </p>
                </div>

                {/* Input de Busca rápida do Posto */}
                <div className="relative w-full sm:w-48">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={buscaPosto}
                    onChange={(e) => setBuscaPosto(e.target.value)}
                    placeholder="Filtrar posto..."
                    className="w-full pl-8 pr-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Lista com Barras Proporcionais */}
              <div className="mt-4 flex-1 space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {throughputFiltrado.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-10">
                    Nenhum posto encontrado para o escopo selecionado.
                  </p>
                ) : (
                  throughputFiltrado.map((item, index) => {
                    const pct = Math.round((item.total_pecas / maxPecasPosto) * 100);
                    return (
                      <div key={`${item.posto_trabalho}-${item.turno}-${index}`} className="group">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {item.posto_trabalho}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                              Turno {item.turno}
                            </span>
                          </div>
                          <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                            {item.total_pecas.toLocaleString("pt-BR")} pcs
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800/80 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 group-hover:from-emerald-400 group-hover:to-teal-300 transition-all duration-300"
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Visual 2: Donut Chart de Distribuição de Ordens */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-5 shadow-xs transition-colors flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <PieChartIcon className="w-4 h-4 text-sky-500" />
                  <span>Distribuição dos Lotes</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Divisão percentual dos estágios operacionais
                </p>

                {/* Donut SVG Moderno */}
                <div className="flex items-center justify-center my-6">
                  <div className="relative w-40 h-40">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      {/* Círculo base */}
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="currentColor"
                        className="text-slate-100 dark:text-slate-800"
                        strokeWidth="4"
                      />
                      {/* Segmentos */}
                      {donutData.reduce(
                        (acc, slice, idx) => {
                          const strokeDasharray = `${slice.pct * 0.88} 100`;
                          const strokeDashoffset = -acc.offset;
                          acc.elements.push(
                            <circle
                              key={idx}
                              cx="18"
                              cy="18"
                              r="14"
                              fill="none"
                              stroke={slice.cor}
                              strokeWidth="4"
                              strokeDasharray={strokeDasharray}
                              strokeDashoffset={strokeDashoffset}
                              strokeLinecap="round"
                              className="transition-all duration-500"
                            />
                          );
                          acc.offset += slice.pct * 0.88;
                          return acc;
                        },
                        { elements: [] as React.ReactNode[], offset: 0 }
                      ).elements}
                    </svg>
                    {/* Centro do Donut */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                        {data.total_itens}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Lotes</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Legenda do Donut */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {donutData.map((slice, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: slice.cor }}
                      />
                      <span className="text-slate-600 dark:text-slate-400 font-medium">
                        {slice.label}
                      </span>
                    </div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {slice.valor} ({slice.pct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Comparação por Linha e Turno */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-5 shadow-xs transition-colors">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Layers className="w-4 h-4 text-purple-500" />
              <span>Matriz de Carga por Linha e Turno</span>
            </h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap min-w-max">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-2.5 px-3">Linha Fabril</th>
                    <th className="py-2.5 px-3">Turno</th>
                    <th className="py-2.5 px-3 text-right">Lotes Alocados</th>
                    <th className="py-2.5 px-3 text-right">% Críticos</th>
                    <th className="py-2.5 px-3">Status de Carga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {data.por_linha_turno.map((row, idx) => (
                    <tr
                      key={`${row.linha}-${row.turno}-${idx}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                        {row.linha}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {row.turno}º Turno
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-slate-800 dark:text-slate-200">
                        {row.total_itens}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`font-semibold ${
                            row.pct_itens_criticos > 20
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-slate-500"
                          }`}
                        >
                          {row.pct_itens_criticos.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="w-32 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.min(100, row.total_itens * 10)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
