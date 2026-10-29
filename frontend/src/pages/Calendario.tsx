import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  Zap,
  Factory,
  CheckCircle2,
  PlayCircle,
  Clock,
  AlertTriangle,
  Search,
  Calendar as CalendarIcon,
  X,
  Package,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { listarTabelaB, listarLinhas } from "../services/api";
import { LINHAS_SOLDA_PADRAO, LINHAS_ESTAMPARIA_PADRAO, type ItemProducao, type Patan } from "../types/producao";

const NOMES_MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function extrairChaveData(isoStr: string | null | undefined): string | null {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return null;
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  } catch {
    return null;
  }
}

function formatarHora(isoStr: string | null | undefined): string {
  if (!isoStr) return "--:--";
  try {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "--:--";
  }
}

export function Calendario() {
  const { token, permissoes, role } = useAuth();

  // Estados de navegação do calendário
  const hoje = new Date();
  const [anoAtual, setAnoAtual] = useState(hoje.getFullYear());
  const [mesAtual, setMesAtual] = useState(hoje.getMonth()); // 0-11
  const [diaSelecionado, setDiaSelecionado] = useState<string>(
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`
  );

  // Estados dos Slicers / Filtros
  const [setor, setSetor] = useState<string>("todos");
  const [linha, setLinha] = useState<string>("");
  const [turno, setTurno] = useState<string>("");
  const [patan, setPatan] = useState<string>("");
  const [buscaMaterial, setBuscaMaterial] = useState<string>("");

  const podeVerSolda =
    role === "admin" || role === "programador" || (permissoes ? permissoes.pode_ver_solda : true);
  const podeVerEstamparia =
    role === "admin" || role === "programador" || (permissoes ? permissoes.pode_ver_estamparia : true);

  // Linhas cadastradas
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

  // Consulta de itens da Tabela B com os filtros
  const query = useQuery({
    queryKey: ["calendario-tabela-b", setor, linha, turno, patan],
    queryFn: async () => {
      if (!token) throw new Error("Nao autenticado.");
      return listarTabelaB(token, {
        setor: setor !== "todos" ? setor : undefined,
        linha: linha || undefined,
        turno: turno ? Number(turno) : undefined,
        patan: patan || undefined,
      });
    },
    enabled: Boolean(token),
  });

  // Agrupamento dos itens por dia ("YYYY-MM-DD")
  const itensPorDia = useMemo(() => {
    const mapa = new Map<string, ItemProducao[]>();
    for (const item of query.data ?? []) {
      // Prioriza hora_inicial ou inicio_real
      const chave = extrairChaveData(item.hora_inicial) || extrairChaveData(item.inicio_real);
      if (chave) {
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave)!.push(item);
      }
    }
    return mapa;
  }, [query.data]);

  // Estrutura de semanas do mês atual
  const gridDias = useMemo(() => {
    const primeiroDiaMes = new Date(anoAtual, mesAtual, 1);
    const ultimoDiaMes = new Date(anoAtual, mesAtual + 1, 0);

    const diaSemanaInicio = primeiroDiaMes.getDay(); // 0 = Dom
    const totalDias = ultimoDiaMes.getDate();

    const dias = [];

    // Dias do mês anterior para completar a primeira semana
    const mesAnteriorUltimoDia = new Date(anoAtual, mesAtual, 0).getDate();
    for (let i = diaSemanaInicio - 1; i >= 0; i--) {
      const d = mesAnteriorUltimoDia - i;
      const m = mesAtual === 0 ? 11 : mesAtual - 1;
      const y = mesAtual === 0 ? anoAtual - 1 : anoAtual;
      const chave = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      dias.push({
        numero: d,
        chave,
        mesAtual: false,
      });
    }

    // Dias do mês atual
    for (let d = 1; d <= totalDias; d++) {
      const chave = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      dias.push({
        numero: d,
        chave,
        mesAtual: true,
      });
    }

    // Dias do próximo mês para completar a última semana (múltiplo de 7)
    const restante = 42 - dias.length; // grade padrão de 6 semanas
    for (let d = 1; d <= restante; d++) {
      const m = mesAtual === 11 ? 0 : mesAtual + 1;
      const y = mesAtual === 11 ? anoAtual + 1 : anoAtual;
      const chave = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      dias.push({
        numero: d,
        chave,
        mesAtual: false,
      });
    }

    return dias;
  }, [anoAtual, mesAtual]);

  // Itens do dia selecionado
  const itensDoDiaSelecionado = useMemo(() => {
    if (!diaSelecionado) return [];
    let itens = itensPorDia.get(diaSelecionado) ?? [];
    if (buscaMaterial.trim()) {
      itens = itens.filter(
        (i) =>
          (i.material || "").toLowerCase().includes(buscaMaterial.toLowerCase()) ||
          (i.posto_trabalho || "").toLowerCase().includes(buscaMaterial.toLowerCase())
      );
    }
    // Ordena por horário inicial e sequência
    return [...itens].sort((a, b) => {
      if (a.hora_inicial && b.hora_inicial) {
        return a.hora_inicial.localeCompare(b.hora_inicial);
      }
      return a.sequencia - b.sequencia;
    });
  }, [diaSelecionado, itensPorDia, buscaMaterial]);

  // Resumo do dia selecionado
  const resumoDiaSelecionado = useMemo(() => {
    const itens = itensDoDiaSelecionado;
    const totalPecasPlan = itens.reduce((acc, i) => acc + i.kanbans * i.qtd_por_kanban, 0);
    const totalPecasReal = itens.reduce((acc, i) => acc + (i.quantidade_produzida_real || 0), 0);
    const concluidos = itens.filter((i) => i.fim_real && !i.motivo_interrupcao).length;
    const aoVivo = itens.filter((i) => i.em_producao).length;
    const quebras = itens.filter((i) => i.motivo_interrupcao).length;
    const postosUnicos = new Set(itens.map((i) => i.posto_trabalho)).size;

    return {
      totalLotes: itens.length,
      totalPecasPlan,
      totalPecasReal,
      concluidos,
      aoVivo,
      quebras,
      postosUnicos,
    };
  }, [itensDoDiaSelecionado]);

  // Navegação de mês
  const irMesAnterior = () => {
    if (mesAtual === 0) {
      setMesAtual(11);
      setAnoAtual((prev) => prev - 1);
    } else {
      setMesAtual((prev) => prev - 1);
    }
  };

  const irProximoMes = () => {
    if (mesAtual === 11) {
      setMesAtual(0);
      setAnoAtual((prev) => prev + 1);
    } else {
      setMesAtual((prev) => prev + 1);
    }
  };

  const irParaHoje = () => {
    setAnoAtual(hoje.getFullYear());
    setMesAtual(hoje.getMonth());
    setDiaSelecionado(
      `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`
    );
  };

  const hojeChave = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6 transition-colors">
      {/* Barra de Filtros e Slicers Estilo Power BI */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-4 sm:p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CalendarDays className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Calendário Mensal de Produção
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Visão cronológica por dia e mês — acompanhamento de lotes executados e histórico diário
            </p>
          </div>

          {/* Navegador de Mês */}
          <div className="flex items-center gap-2 self-start lg:self-auto">
            <button
              type="button"
              onClick={irParaHoje}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-xs cursor-pointer"
            >
              Hoje
            </button>
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={irMesAnterior}
                aria-label="Mês anterior"
                className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-xs font-bold text-slate-900 dark:text-slate-100 min-w-32 text-center">
                {NOMES_MESES[mesAtual]} {anoAtual}
              </span>
              <button
                type="button"
                onClick={irProximoMes}
                aria-label="Próximo mês"
                className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Linha de Filtros */}
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
            {["A", "B", "C", "D", "E", "F", "G", "H"].map((p) => (
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

      {/* Grade Mensal em Quadradinhos */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-4 sm:p-5 shadow-xs transition-colors">
        {/* Cabeçalho dos Dias da Semana */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {DIAS_SEMANA.map((dia, idx) => (
            <div
              key={dia}
              className={`text-center py-2 text-xs font-bold uppercase tracking-wider ${
                idx === 0 || idx === 6
                  ? "text-slate-400 dark:text-slate-500"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {dia}
            </div>
          ))}
        </div>

        {/* Grade de Dias */}
        <div className="grid grid-cols-7 gap-2">
          {gridDias.map((dia) => {
            const itensDia = itensPorDia.get(dia.chave) ?? [];
            const temProducao = itensDia.length > 0;
            const isHoje = dia.chave === hojeChave;
            const isSelecionado = dia.chave === diaSelecionado;

            const concluidos = itensDia.filter((i) => i.fim_real && !i.motivo_interrupcao).length;
            const aoVivo = itensDia.filter((i) => i.em_producao).length;
            const quebras = itensDia.filter((i) => i.motivo_interrupcao).length;
            const pendentes = itensDia.length - concluidos - aoVivo - quebras;
            const totalPecas = itensDia.reduce(
              (acc, i) => acc + (i.quantidade_produzida_real || i.kanbans * i.qtd_por_kanban),
              0
            );

            return (
              <button
                type="button"
                key={dia.chave}
                onClick={() => setDiaSelecionado(dia.chave)}
                className={`min-h-[105px] p-2 rounded-xl text-left flex flex-col justify-between border transition-all duration-200 cursor-pointer ${
                  !dia.mesAtual
                    ? "opacity-35 bg-slate-50/50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800"
                    : isSelecionado
                    ? "ring-2 ring-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700 shadow-sm"
                    : isHoje
                    ? "bg-slate-50 dark:bg-slate-800/60 border-emerald-400 dark:border-emerald-600 shadow-xs"
                    : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                }`}
              >
                {/* Número do Dia & Badge Hoje */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold ${
                      isHoje
                        ? "w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-extrabold shadow-xs"
                        : isSelecionado
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {dia.numero}
                  </span>

                  {temProducao && (
                    <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400">
                      {itensDia.length} {itensDia.length === 1 ? "lote" : "lotes"}
                    </span>
                  )}
                </div>

                {/* Conteúdo do Dia */}
                {temProducao ? (
                  <div className="space-y-1 my-1">
                    <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate">
                      {totalPecas.toLocaleString("pt-BR")} pcs
                    </div>

                    {/* Pills de Status */}
                    <div className="flex flex-wrap gap-1">
                      {concluidos > 0 && (
                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                          ✓ {concluidos}
                        </span>
                      )}
                      {aoVivo > 0 && (
                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 animate-pulse">
                          ▶ {aoVivo}
                        </span>
                      )}
                      {quebras > 0 && (
                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300">
                          ⚠️ {quebras}
                        </span>
                      )}
                      {pendentes > 0 && (
                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          ⏳ {pendentes}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 dark:text-slate-600 font-medium my-auto">
                    Sem ordens
                  </div>
                )}

                {/* Barra de progresso visual */}
                {temProducao && (
                  <div className="w-full h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        quebras > 0
                          ? "bg-rose-500"
                          : concluidos === itensDia.length
                          ? "bg-emerald-500"
                          : aoVivo > 0
                          ? "bg-sky-500"
                          : "bg-slate-400"
                      }`}
                      style={{
                        width: `${Math.round((concluidos / itensDia.length) * 100) || (aoVivo > 0 ? 50 : 20)}%`,
                      }}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Painel de Resumo do Dia Selecionado */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-5 shadow-xs transition-colors space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-emerald-500" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Resumo Operacional do Dia:{" "}
                <span className="text-emerald-600 dark:text-emerald-400">
                  {diaSelecionado
                    ? new Intl.DateTimeFormat("pt-BR", {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      }).format(new Date(`${diaSelecionado}T12:00:00`))
                    : "Nenhum dia selecionado"}
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Detalhamento de todos os lotes, tempos de ciclo e apontamentos executados na data
            </p>
          </div>

          {/* Campo de Busca Rápida por Peça / Posto */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={buscaMaterial}
              onChange={(e) => setBuscaMaterial(e.target.value)}
              placeholder="Buscar peça ou posto..."
              className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Mini Cards de Totais do Dia */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Lotes Programados
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {resumoDiaSelecionado.totalLotes}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Peças Planejadas
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {resumoDiaSelecionado.totalPecasPlan.toLocaleString("pt-BR")}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Peças Realizadas
            </div>
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
              {resumoDiaSelecionado.totalPecasReal.toLocaleString("pt-BR")}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Postos Ocupados
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {resumoDiaSelecionado.postosUnicos}
            </div>
          </div>
        </div>

        {/* Tabela de Ordens do Dia */}
        {itensDoDiaSelecionado.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
            Nenhuma ordem de produção registrada para a data selecionada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap min-w-max">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-3"># Seq</th>
                  <th className="py-2.5 px-3">Turno</th>
                  <th className="py-2.5 px-3">Posto</th>
                  <th className="py-2.5 px-3">Peça / Material</th>
                  <th className="py-2.5 px-3">Patan</th>
                  <th className="py-2.5 px-3">Horário Planejado</th>
                  <th className="py-2.5 px-3 text-right">Kanbans</th>
                  <th className="py-2.5 px-3 text-right">Produzido</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {itensDoDiaSelecionado.map((item) => {
                  const isConcluido = Boolean(item.fim_real && !item.motivo_interrupcao);
                  const isQuebra = Boolean(item.motivo_interrupcao);
                  const isAoVivo = item.em_producao;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-500">
                        #{item.sequencia}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {item.turno}º Turno
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                        {item.posto_trabalho}
                      </td>
                      <td className="py-2.5 px-3 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {item.material || "Sem código"}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                          {item.patan}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-mono">
                        {formatarHora(item.hora_inicial)} → {formatarHora(item.hora_final)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {item.kanbans} × {item.qtd_por_kanban}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                        {item.quantidade_produzida_real !== null &&
                        item.quantidade_produzida_real !== undefined
                          ? item.quantidade_produzida_real
                          : "--"}
                      </td>
                      <td className="py-2.5 px-3">
                        {isConcluido ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" />
                            Concluído
                          </span>
                        ) : isAoVivo ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 animate-pulse">
                            <PlayCircle className="w-3 h-3" />
                            Ao Vivo
                          </span>
                        ) : isQuebra ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300">
                            <AlertTriangle className="w-3 h-3" />
                            Quebra
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            <Clock className="w-3 h-3" />
                            Na Fila
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
