import { useMemo, useState } from "react";
import {
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Search,
  Filter,
  Layers,
  Clock,
  Calendar,
  Box,
} from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import type { ColunaExtra, ItemProducao } from "../../types/producao";
import { isMaterialBloqueado } from "../../utils/ferramentariaUtils";

interface ProducaoTabelaViewProps {
  itens: ItemProducao[];
  colunasExtras?: ColunaExtra[];
  materiaisBloqueados?: string[];
  onIniciarProducao?: (itemId: number) => void;
  onPausarProducao?: (itemId: number) => void;
  onDesfazerInicio?: (itemId: number) => void;
  onSolicitarConcluir?: (item: ItemProducao) => void;
  onSolicitarQuebra?: (item: ItemProducao) => void;
  onMoverParaColunaExtra?: (itemId: number, colunaExtraId: number | null) => void;
  onVerDetalhes?: (item: ItemProducao) => void;
  somenteLeitura?: boolean;
}

const TURNO_BADGES: Record<number, { bg: string; text: string; label: string }> = {
  1: {
    bg: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
    text: "text-slate-700 dark:text-slate-300",
    label: "1º Turno",
  },
  2: {
    bg: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    text: "text-blue-700 dark:text-blue-300",
    label: "2º Turno",
  },
  3: {
    bg: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    text: "text-purple-700 dark:text-purple-300",
    label: "3º Turno",
  },
};

function formatarDataSimples(iso?: string | null): string {
  if (!iso) return "--";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "--";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "--";
  }
}

function formatarHoraSimples(iso?: string | null): string {
  if (!iso) return "--:--";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "--:--";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

export function ProducaoTabelaView({
  itens,
  colunasExtras = [],
  materiaisBloqueados = [],
  onIniciarProducao,
  onPausarProducao,
  onDesfazerInicio,
  onSolicitarConcluir,
  onSolicitarQuebra,
  onMoverParaColunaExtra,
  onVerDetalhes,
  somenteLeitura = false,
}: ProducaoTabelaViewProps) {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [busca, setBusca] = useState("");
  const [postoFiltro, setPostoFiltro] = useState<string>("TODOS");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "em_producao" | "fila" | "extras">("todos");

  // Postos distintos
  const postosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const item of itens) {
      if (item.posto_trabalho) set.add(item.posto_trabalho);
    }
    return Array.from(set).sort();
  }, [itens]);

  // Mapa de nomes de colunas extras
  const nomesColunasExtras = useMemo(() => {
    const mapa = new Map<number, string>();
    for (const col of colunasExtras) {
      mapa.set(col.id, col.nome);
    }
    return mapa;
  }, [colunasExtras]);

  // Mapa para saber qual posto tem item em produção e identificar o primeiro da fila
  const { postosComItemEmProducao, primeiroDaFilaPorPosto, primeiroItemPorPosto } = useMemo(() => {
    const comProducao = new Set<string>();
    const primeiroFila = new Map<string, number>();
    const primeiroItem = new Map<string, ItemProducao>();

    // Agrupa e ordena itens por posto da mesma forma que o Kanban
    const grupos: Record<string, ItemProducao[]> = {};
    for (const item of itens) {
      if (item.coluna_extra_id === null) {
        (grupos[item.posto_trabalho] ??= []).push(item);
      }
    }

    for (const [posto, lista] of Object.entries(grupos)) {
      lista.sort((a, b) => {
        if (a.em_producao && !b.em_producao) return -1;
        if (!a.em_producao && b.em_producao) return 1;
        if (a.hora_inicial && b.hora_inicial) {
          const diff = new Date(a.hora_inicial).getTime() - new Date(b.hora_inicial).getTime();
          if (diff !== 0) return diff;
        }
        if (a.turno !== b.turno) return a.turno - b.turno;
        return a.sequencia - b.sequencia;
      });

      for (const it of lista) {
        if (it.em_producao) {
          comProducao.add(posto);
        }
      }

      // O primeiro item que não está em produção e não está em coluna extra é o topo da fila
      const primeiro = lista.find((it) => !it.em_producao && it.id !== null);
      if (primeiro && primeiro.id !== null) {
        primeiroFila.set(posto, primeiro.id);
        primeiroItem.set(posto, primeiro);
      }
    }

    return {
      postosComItemEmProducao: comProducao,
      primeiroDaFilaPorPosto: primeiroFila,
      primeiroItemPorPosto: primeiroItem,
    };
  }, [itens]);

  // Itens filtrados e ordenados
  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return itens
      .filter((item) => {
        // Filtro de Posto
        if (postoFiltro !== "TODOS" && item.posto_trabalho !== postoFiltro) return false;

        // Filtro de Status
        if (statusFiltro === "em_producao" && !item.em_producao) return false;
        if (statusFiltro === "fila" && (item.em_producao || item.coluna_extra_id !== null)) return false;
        if (statusFiltro === "extras" && item.coluna_extra_id === null) return false;

        // Filtro de Busca
        if (termo) {
          const atendeMaterial = item.material?.toLowerCase().includes(termo) ?? false;
          const atendePosto = item.posto_trabalho.toLowerCase().includes(termo);
          const atendePatan = item.patan.toLowerCase().includes(termo);
          if (!atendeMaterial && !atendePosto && !atendePatan) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Em produção sempre no topo geral ou por posto
        if (a.em_producao && !b.em_producao) return -1;
        if (!a.em_producao && b.em_producao) return 1;

        // Ordenação cronológica por hora_inicial
        if (a.hora_inicial && b.hora_inicial) {
          const diff = new Date(a.hora_inicial).getTime() - new Date(b.hora_inicial).getTime();
          if (diff !== 0) return diff;
        } else if (a.hora_inicial && !b.hora_inicial) {
          return -1;
        } else if (!a.hora_inicial && b.hora_inicial) {
          return 1;
        }

        if (a.turno !== b.turno) return a.turno - b.turno;
        return a.sequencia - b.sequencia;
      });
  }, [itens, busca, postoFiltro, statusFiltro]);

  // Contadores gerais
  const contadores = useMemo(() => {
    let total = itens.length;
    let emProducao = 0;
    let naFila = 0;
    let emExtras = 0;

    for (const it of itens) {
      if (it.em_producao) emProducao++;
      else if (it.coluna_extra_id !== null) emExtras++;
      else naFila++;
    }

    return { total, emProducao, naFila, emExtras };
  }, [itens]);

  return (
    <div className="w-full space-y-4">
      {/* Barra de Filtros e Busca da Tabela */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Campo de Busca Textual */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por peça, posto ou patan..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Filtro por Posto de Trabalho */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> Posto:
            </span>
            <select
              value={postoFiltro}
              onChange={(e) => setPostoFiltro(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="TODOS">Todos os Postos ({postosDisponiveis.length})</option>
              {postosDisponiveis.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Pills de Filtro por Status */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setStatusFiltro("todos")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                statusFiltro === "todos"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Todos ({contadores.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFiltro("em_producao")}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                statusFiltro === "em_producao"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Ao Vivo ({contadores.emProducao})
            </button>
            <button
              type="button"
              onClick={() => setStatusFiltro("fila")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                statusFiltro === "fila"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Na Fila ({contadores.naFila})
            </button>
            {contadores.emExtras > 0 && (
              <button
                type="button"
                onClick={() => setStatusFiltro("extras")}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  statusFiltro === "extras"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                Extras / Concluídas ({contadores.emExtras})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabela de Ordens de Produção */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden w-full">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/80 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                <th className="py-3.5 px-4 w-16 text-center"># Seq</th>
                <th className="py-3.5 px-4">Posto</th>
                <th className="py-3.5 px-4">Peça / Material</th>
                <th className="py-3.5 px-4">Turno / Data</th>
                <th className="py-3.5 px-4 text-center">Patan</th>
                <th className="py-3.5 px-4">Horário Planejado</th>
                <th className="py-3.5 px-4 text-right">Kanbans × Qtd</th>
                <th className="py-3.5 px-4 text-right">Tempo Est.</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-center min-w-[220px]">Ações Chão de Fábrica</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {itensFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400 dark:text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Box className="w-10 h-10 opacity-40" />
                      <p className="font-semibold text-base">Nenhum item encontrado nesta visualização</p>
                      <p className="text-xs">Tente ajustar a busca textual ou os filtros de posto e status.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                itensFiltrados.map((item, index) => {
                  const turnoBadge = TURNO_BADGES[item.turno] ?? TURNO_BADGES[1];
                  const totalPecas = item.kanbans * item.qtd_por_kanban;
                  const tempoMinutos = Math.round(
                    item.kanbans * item.qtd_por_kanban * (item.tempo_por_peca_minutos ?? 0)
                  );
                  const isBloqueado = isMaterialBloqueado(item.material, materiaisBloqueados);
                  const nomeColunaExtra = item.coluna_extra_id
                    ? nomesColunasExtras.get(item.coluna_extra_id)
                    : null;
                  const colExtraLower = (nomeColunaExtra ?? "").toLowerCase();
                  const isColunaConcluida =
                    colExtraLower.includes("concluid") ||
                    Boolean(item.fim_real && item.motivo_interrupcao !== "quebra");
                  const isColunaQuebra =
                    colExtraLower.includes("quebra") || item.motivo_interrupcao === "quebra";
                  const isItemFinalizado = isColunaConcluida || isColunaQuebra;

                  // Regra de ouro TPS: Pode iniciar se for o primeiro da fila regular deste posto e o posto não estiver ocupado
                  const ehPrimeiroDaFila =
                    item.id !== null && primeiroDaFilaPorPosto.get(item.posto_trabalho) === item.id;
                  const postoOcupado = postosComItemEmProducao.has(item.posto_trabalho);
                  let podeIniciar =
                    !somenteLeitura &&
                    item.coluna_extra_id === null &&
                    !item.em_producao &&
                    ehPrimeiroDaFila &&
                    !postoOcupado;

                  let bloqueioTandem: string | null = null;
                  if (
                    podeIniciar &&
                    item.coluna_extra_id === null &&
                    item.producao_em_linha &&
                    item.postos_vinculados &&
                    item.postos_vinculados.length > 1
                  ) {
                    const mat = (item.material ?? "").trim().toUpperCase();
                    for (const outroPosto of item.postos_vinculados) {
                      if (outroPosto === item.posto_trabalho) continue;
                      const itemOutro = primeiroItemPorPosto.get(outroPosto);
                      if (itemOutro) {
                        const matOutro = (itemOutro.material ?? "").trim().toUpperCase();
                        if (matOutro !== mat) {
                          podeIniciar = false;
                          bloqueioTandem = `Aguardando ${outroPosto} (concluir ${itemOutro.material})`;
                          break;
                        }
                      }
                    }
                  }

                  return (
                    <tr
                      key={item.id ?? `seq-${index}`}
                      className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        item.em_producao
                          ? "bg-emerald-50/50 dark:bg-emerald-950/25 font-medium"
                          : ""
                      }`}
                    >
                      {/* Seq */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md text-xs font-bold border ${
                            item.em_producao
                              ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          #{item.sequencia > 0 ? item.sequencia : index + 1}
                        </span>
                      </td>

                      {/* Posto */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 font-mono">
                          {item.posto_trabalho}
                        </span>
                      </td>

                      {/* Peça / Material */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
                            {item.material || "Sem código"}
                          </span>
                          {isBloqueado && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                              <AlertTriangle className="w-3.5 h-3.5" /> Ferramenta Bloqueada
                            </span>
                          )}
                          {item.is_critico && !isBloqueado && (
                            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                              ⚠️ Item Crítico
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Turno / Data */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-md text-[11px] font-bold border ${turnoBadge.bg}`}
                          >
                            <Calendar className="w-3 h-3" />
                            {turnoBadge.label}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {formatarDataSimples(item.hora_inicial)}
                          </span>
                        </div>
                      </td>

                      {/* Patan */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 font-bold text-slate-800 dark:text-slate-200 text-xs shadow-2xs">
                          {item.patan}
                        </span>
                      </td>

                      {/* Horário Planejado */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {formatarHoraSimples(item.hora_inicial)} - {formatarHoraSimples(item.hora_final)}
                          </span>
                          {item.almoco_incluso && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 w-fit">
                              🍽️ Almoço
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Kanbans x Qtd */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100 block">
                          {item.kanbans} × {item.qtd_por_kanban}
                        </span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                          ({totalPecas.toLocaleString("pt-BR")} pçs)
                        </span>
                      </td>

                      {/* Tempo Estimado */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
                        {tempoMinutos}m
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {item.em_producao ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 animate-pulse shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            EM PRODUÇÃO
                          </span>
                        ) : nomeColunaExtra ? (
                          (() => {
                            const isConcluida =
                              nomeColunaExtra.toLowerCase().includes("concluid") ||
                              Boolean(item.fim_real && item.motivo_interrupcao !== "quebra");
                            const isParcial =
                              isConcluida &&
                              item.quantidade_produzida_real !== null &&
                              item.quantidade_produzida_real !== undefined &&
                              item.quantidade_produzida_real < totalPecas;
                            if (isParcial) {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs">
                                  ⚠️ Concluída Parcial ({item.quantidade_produzida_real}/{totalPecas} pçs)
                                </span>
                              );
                            }
                            if (isConcluida) {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shadow-2xs">
                                  ✓ Concluída ({item.quantidade_produzida_real ?? totalPecas} pçs)
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                {nomeColunaExtra}
                              </span>
                            );
                          })()
                        ) : ehPrimeiroDaFila ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            Próximo da Fila
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400 text-xs">
                            Na Fila
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* Botão Iniciar Produção */}
                          {podeIniciar && onIniciarProducao && item.id !== null && (
                            <button
                              type="button"
                              onClick={() => onIniciarProducao(item.id as number)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer active:scale-95"
                              title="Iniciar produção desta ordem no posto"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Iniciar</span>
                            </button>
                          )}

                          {/* Indicador de Espera Tandem */}
                          {item.coluna_extra_id === null && !item.em_producao && bloqueioTandem && (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-100/90 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60"
                              title={`Produção em Linha aguardando sincronismo: ${bloqueioTandem}`}
                            >
                              <span>⏳</span>
                              <span className="truncate max-w-[150px]">{bloqueioTandem}</span>
                            </span>
                          )}

                          {/* Ações Quando em Produção */}
                          {item.em_producao && (
                            <>
                              {onSolicitarConcluir && (
                                <button
                                  type="button"
                                  onClick={() => onSolicitarConcluir(item)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer active:scale-95"
                                  title="Concluir produção e apontar peças"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Concluir</span>
                                </button>
                              )}
                              {onSolicitarQuebra && (
                                <button
                                  type="button"
                                  onClick={() => onSolicitarQuebra(item)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer active:scale-95"
                                  title="Registrar quebra e abrir OS na Ferramentaria"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>Quebra</span>
                                </button>
                              )}
                              {onDesfazerInicio && item.id !== null && (
                                <button
                                  type="button"
                                  onClick={() => onDesfazerInicio(item.id as number)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-semibold text-xs shadow-2xs transition-colors cursor-pointer active:scale-95"
                                  title="Desfazer início acidental de produção"
                                >
                                  <span>↩ Desfazer</span>
                                </button>
                              )}
                              {isAdmin && onPausarProducao && item.id !== null && (
                                <button
                                  type="button"
                                  onClick={() => onPausarProducao(item.id as number)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer active:scale-95"
                                  title="Pausar produção (Admin)"
                                >
                                  <Pause className="w-3.5 h-3.5" />
                                  <span>Pausar</span>
                                </button>
                              )}
                            </>
                          )}

                          {/* Mover para Coluna Extra (apenas para itens não finalizados) */}
                          {!isItemFinalizado && colunasExtras.length > 0 && onMoverParaColunaExtra && item.id !== null && (
                            <select
                              value={item.coluna_extra_id ?? ""}
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : null;
                                onMoverParaColunaExtra(item.id as number, val);
                              }}
                              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer shadow-2xs"
                              title="Classificar em coluna extra"
                            >
                              <option value="">Fila Normal</option>
                              {colunasExtras.map((col) => (
                                <option key={col.id} value={col.id}>
                                  {col.nome}
                                </option>
                              ))}
                            </select>
                          )}

                          {/* Botão Ver Detalhes / Comentários */}
                          {onVerDetalhes && (
                            <button
                              type="button"
                              onClick={() => onVerDetalhes(item)}
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:text-slate-100 transition-colors cursor-pointer"
                              title="Ver detalhes, checklist e comentários"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
