import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Wrench,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  LayoutGrid,
  TableProperties,
  PlusCircle,
  Clock,
  Download,
  Zap,
  Factory,
  Maximize2,
  Minimize2,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { isOperador } from "../routes/RequireRole";
import { ItemDetalhe } from "../components/ItemDetalhe/ItemDetalhe";
import { InserirCardModal } from "../components/Producao/InserirCardModal";
import { EditarCardProducaoModal } from "../components/Producao/EditarCardProducaoModal";
import { ProducaoTabelaView } from "../components/ProducaoTabela/ProducaoTabelaView";
import { ProducaoTimelineView } from "../components/ProducaoTimeline/ProducaoTimelineView";
import { SequenciaBoard } from "../components/SequenciaBoard/SequenciaBoard";
import {
  ApiError,
  criarColunaExtra,
  exportarProducaoCsv,
  listarColunasExtras,
  listarTabelaB,
  moverParaColunaExtra,
  removerColunaExtra,
  renomearColunaExtra,
  reordenarProducao,
  iniciarProducao,
  pausarProducao,
  desfazerInicioProducao,
  concluirProducao,
  quebraFerramenta,
  getMateriaisBloqueados,
  getParametros,
  getManutencoes,
  listarLinhas,
  limparProducao,
  excluirItemProducao,
} from "../services/api";
import { agruparPorPosto, getHojeLocalIso } from "../state/sequenciaReducer";
import {
  LINHAS_DISPONIVEIS,
  LINHAS_SOLDA_PADRAO,
  LINHAS_ESTAMPARIA_PADRAO,
  type ItemProducao,
} from "../types/producao";

const FIELD_LABEL_CLASSES = "flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300";
const FIELD_INPUT_CLASSES =
  "rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600";

interface ProducaoProps {
  setor?: "solda" | "estamparia";
}

function useSafePathname(): string {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useLocation().pathname;
  } catch {
    return "";
  }
}

export function Producao({ setor: setorProp }: ProducaoProps) {
  const { token, role, logout, permissoes } = useAuth();
  const pathname = useSafePathname();
  const [searchParams, setSearchParams] = useSearchParams();
  const linhaParam = searchParams.get("linha");

  const podeVerSolda =
    role === "admin" ||
    role === "programador" ||
    (permissoes
      ? permissoes.pode_ver_solda
      : role === "operador_estamparia"
      ? false
      : true);

  const podeVerEstamparia =
    role === "admin" ||
    role === "programador" ||
    (permissoes
      ? permissoes.pode_ver_estamparia
      : role === "operador_solda"
      ? false
      : true);

  const setor: "solda" | "estamparia" =
    setorProp ?? (pathname.includes("estamparia") ? "estamparia" : "solda");

  if (setor === "solda" && !podeVerSolda && podeVerEstamparia) {
    return <Navigate to="/producao/estamparia" replace />;
  }
  if (setor === "estamparia" && !podeVerEstamparia && podeVerSolda) {
    return <Navigate to="/producao/solda" replace />;
  }

  const linhasQuery = useQuery({
    queryKey: ["linhas-producao", setor],
    queryFn: () => listarLinhas(token as string, setor),
    enabled: Boolean(token),
  });

  const linhasDisponiveis = useMemo(() => {
    if (linhasQuery.data && linhasQuery.data.length > 0) {
      return linhasQuery.data.map((l) => ({ valor: l.nome, label: l.nome }));
    }
    return setor === "estamparia" ? LINHAS_ESTAMPARIA_PADRAO : LINHAS_SOLDA_PADRAO;
  }, [linhasQuery.data, setor]);

  const [linha, setLinha] = useState<string>(() => {
    if (linhaParam) return linhaParam;
    return setor === "estamparia" ? LINHAS_ESTAMPARIA_PADRAO[0].valor : LINHAS_SOLDA_PADRAO[0].valor;
  });

  // Sincroniza se a linha na URL mudar (via submenu)
  useEffect(() => {
    if (linhaParam && linhaParam !== linha) {
      setLinha(linhaParam);
    }
  }, [linhaParam, linha]);

  // Se a linha atual não for válida para o setor ativo, seleciona a primeira do setor
  useEffect(() => {
    const existe = linhasDisponiveis.some((l) => l.valor === linha);
    if (!existe && linhasDisponiveis.length > 0) {
      setLinha(linhasDisponiveis[0].valor);
    }
  }, [linhasDisponiveis, linha]);

  const [turno, setTurno] = useState<number>(0);
  const [dataProducao, setDataProducao] = useState<string>("todas");
  const [modoVisualizacao, setModoVisualizacao] = useState<"cards" | "tabela" | "timeline">("cards");
  const [modoCompacto, setModoCompacto] = useState<boolean>(false);
  const [itemSelecionadoDetalhe, setItemSelecionadoDetalhe] = useState<ItemProducao | null>(null);
  const [tryoutMinimizado, setTryoutMinimizado] = useState<boolean>(() => {
    try {
      const salvo = localStorage.getItem("tryout_estamparia_minimizado");
      return salvo !== null ? salvo === "true" : true;
    } catch {
      return true;
    }
  });

  function handleToggleTryoutMinimizado() {
    setTryoutMinimizado((prev) => {
      const novo = !prev;
      try {
        localStorage.setItem("tryout_estamparia_minimizado", String(novo));
      } catch {
        // ignora se localStorage indisponível
      }
      return novo;
    });
  }

  function handleNavegarDiaProducao(offsetDias: number) {
    const dataBaseParaCalculo = dataProducao === "todas" ? getHojeLocalIso() : dataProducao;
    const parts = dataBaseParaCalculo.split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2] + offsetDias);
    const pad = (n: number) => String(n).padStart(2, "0");
    setDataProducao(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tabela-b-producao", setor, linha, turno, dataProducao],
    queryFn: async () => {
      if (!token) throw new Error("Nao autenticado.");
      return listarTabelaB(token, {
        linha,
        turno: turno === 0 ? undefined : turno,
        setor,
        data: dataProducao !== "todas" ? dataProducao : undefined,
      });
    },
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const colunasExtrasQuery = useQuery({
    queryKey: ["colunas-extras", setor],
    queryFn: () => listarColunasExtras(token as string, setor),
    enabled: Boolean(token),
  });

  const parametrosQuery = useQuery({
    queryKey: ["parametros-sistema"],
    queryFn: () => getParametros(token as string),
    enabled: Boolean(token),
  });

  const horariosConfig = useMemo(() => {
    if (!parametrosQuery.data) return undefined;
    const p = (k: string) => parametrosQuery.data?.find((x) => x.chave === k)?.valor;
    return {
      t1Inicio: p("hora_inicio_turno_1") || "06:20",
      t2Inicio: p("hora_inicio_turno_2") || "14:40",
      t3Inicio: p("hora_inicio_turno_3") || "23:00",
      t1Almoco: p("hora_refeicao_turno_1") || "10:20",
      t2Almoco: p("hora_refeicao_turno_2") || "18:40",
      t3Almoco: p("hora_refeicao_turno_3") || "03:00",
      almocoDuracaoMinutos: Number(p("duracao_refeicao_minutos")) || 40,
    };
  }, [parametrosQuery.data]);

  const materiaisBloqueadosQuery = useQuery({
    queryKey: ["materiais-bloqueados"],
    queryFn: () => getMateriaisBloqueados(token as string),
    enabled: Boolean(token),
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  // Na Estamparia, buscar os itens em tryout na Ferramentaria
  const tryoutFerramentasQuery = useQuery({
    queryKey: ["ferramentaria-tryout", linha],
    queryFn: () => getManutencoes(token as string, "tryout"),
    enabled: Boolean(token) && setor === "estamparia",
  });

  const [itemParaConcluir, setItemParaConcluir] = useState<ItemProducao | null>(null);
  const [pecasConcluidas, setPecasConcluidas] = useState<number>(1);
  const [comentariosConclusao, setComentariosConclusao] = useState<string>("");

  const [itemParaQuebra, setItemParaQuebra] = useState<ItemProducao | null>(null);
  const [pecasQuebra, setPecasQuebra] = useState<number>(0);
  const [motivoQuebra, setMotivoQuebra] = useState<string>("");
  const [observacoesQuebra, setObservacoesQuebra] = useState<string>("");
  const [salvandoModal, setSalvandoModal] = useState<boolean>(false);
  const [modalLimparAberto, setModalLimparAberto] = useState(false);
  const [limparApenasTurno, setLimparApenasTurno] = useState(false);
  const [executandoLimpeza, setExecutandoLimpeza] = useState(false);
  const [modalInserirCardAberto, setModalInserirCardAberto] = useState(false);
  const [dadosInserirTryout, setDadosInserirTryout] = useState<{
    material?: string;
    posto_trabalho?: string;
    kanbans?: number;
    qtd_por_kanban?: number;
    tituloModal?: string;
  } | null>(null);
  const [modoEdicaoProducao, setModoEdicaoProducao] = useState(false);
  const [itemParaEditar, setItemParaEditar] = useState<ItemProducao | null>(null);

  const podeInserirCard = role === "admin" || role === "programador";
  const podeEditarProducao = role === "admin" || role === "programador";

  const parametros = parametrosQuery.data ?? [];
  const bloquearArraste = parametros.find((p) => p.chave === "bloquear_arraste_producao")?.valor === "true";
  const corDestaqueParam = parametros.find((p) => p.chave === "cor_destaque_producao")?.valor;
  const corDestaque: "emerald" | "blue" = corDestaqueParam === "blue" ? "blue" : "emerald";

  const itensPorPosto = useMemo(() => {
    const itens = data ?? [];
    const grupos: Record<string, ItemProducao[]> = {};
    for (const item of itens) {
      (grupos[item.posto_trabalho] ??= []).push(item);
    }
    // Ordenar itens dentro de cada posto alinhados cronologicamente por data e horário:
    for (const posto of Object.keys(grupos)) {
      grupos[posto].sort((a, b) => {
        if (a.em_producao && !b.em_producao) return -1;
        if (!a.em_producao && b.em_producao) return 1;

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
    }
    return grupos;
  }, [data]);

  const postosDisponiveis = useMemo(() => {
    const postos = Object.keys(itensPorPosto);
    return postos.length > 0 ? postos : ["SB6A"];
  }, [itensPorPosto]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      logout();
    }
  }, [error, logout]);

  // Atalhos de teclado globais para operação rápida no chão de fábrica
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
        if (podeInserirCard && !modalInserirCardAberto) {
          e.preventDefault();
          setModalInserirCardAberto(true);
        }
      } else if (e.key === "Escape") {
        if (modalInserirCardAberto) setModalInserirCardAberto(false);
        if (modalLimparAberto) setModalLimparAberto(false);
        if (itemParaConcluir) setItemParaConcluir(null);
        if (itemParaQuebra) setItemParaQuebra(null);
        if (itemSelecionadoDetalhe) setItemSelecionadoDetalhe(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    podeInserirCard,
    modalInserirCardAberto,
    modalLimparAberto,
    itemParaConcluir,
    itemParaQuebra,
    itemSelecionadoDetalhe,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-6 text-slate-600 dark:text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-slate-600 dark:border-t-slate-400" />
        <p>Carregando produção...</p>
      </div>
    );
  }
  if (isError) {
    return (
      <p role="alert" className="m-6 rounded-md bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        Erro ao carregar a producao.
      </p>
    );
  }

  if (!podeVerSolda && !podeVerEstamparia) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
        <h2 className="text-xl font-bold">Acesso Restrito à Produção</h2>
        <p className="text-sm text-slate-500">Seu perfil não possui permissão para visualizar Solda nem Estamparia.</p>
      </div>
    );
  }

  // Se o parâmetro do sistema bloquear arraste estiver ativo, apenas admin pode arrastar.
  // Porém, quando o modo de edição estiver ativado por admin ou programador, a reordenação é liberada.
  const somenteLeitura =
    !modoEdicaoProducao &&
    (isOperador(role) || (bloquearArraste && role !== "admin"));

  async function handleIniciarProducao(itemId: number) {
    if (!token) return;
    try {
      const item = data?.find((i) => i.id === itemId);
      await iniciarProducao(token, itemId);
      await refetch();
      if (item?.producao_em_linha && item.postos_vinculados && item.postos_vinculados.length > 1) {
        toast.success(`Produção em Linha iniciada nos postos sincronizados: ${item.postos_vinculados.join(", ")}!`);
      } else {
        toast.success("Item colocado em produção!");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Falha ao iniciar produção.");
    }
  }

  async function handlePausarProducao(itemId: number) {
    if (!token) return;
    try {
      await pausarProducao(token, itemId);
      await refetch();
      toast.success("Produção do item pausada.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Falha ao pausar produção.");
    }
  }

  async function handleDesfazerInicioProducao(itemId: number) {
    if (!token) return;
    try {
      await desfazerInicioProducao(token, itemId);
      await refetch();
      toast.success("Início acidental desfeito. Card retornou à fila de produção.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Falha ao desfazer início de produção.");
    }
  }

  function handleAbrirModalConcluir(item: ItemProducao) {
    setItemParaConcluir(item);
    const sugerido = item.kanbans * item.qtd_por_kanban;
    setPecasConcluidas(sugerido > 0 ? sugerido : 1);
    setComentariosConclusao("");
  }

  async function handleConfirmarConclusao() {
    if (!token || !itemParaConcluir || itemParaConcluir.id === null) return;
    if (!pecasConcluidas || pecasConcluidas <= 0) {
      toast.error("Informe a quantidade de peças produzidas (maior que zero).");
      return;
    }
    setSalvandoModal(true);
    try {
      await concluirProducao(token, itemParaConcluir.id, {
        pecas_produzidas: Number(pecasConcluidas),
        comentarios: comentariosConclusao.trim() || undefined,
      });
      await Promise.all([refetch(), colunasExtrasQuery.refetch()]);
      toast.success("Item concluído e movido para Concluídas!");
      setItemParaConcluir(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Falha ao concluir produção.");
    } finally {
      setSalvandoModal(false);
    }
  }

  function handleAbrirModalQuebra(item: ItemProducao) {
    setItemParaQuebra(item);
    setPecasQuebra(0);
    setMotivoQuebra("");
    setObservacoesQuebra("");
  }

  async function handleConfirmarQuebra() {
    if (!token || !itemParaQuebra || itemParaQuebra.id === null) return;
    if (!motivoQuebra.trim()) {
      toast.error("Informe o motivo da quebra/avaria da ferramenta.");
      return;
    }
    if (pecasQuebra < 0) {
      toast.error("A quantidade de peças produzidas não pode ser negativa.");
      return;
    }
    setSalvandoModal(true);
    try {
      await quebraFerramenta(token, itemParaQuebra.id, {
        pecas_produzidas: Number(pecasQuebra),
        motivo_quebra: motivoQuebra.trim(),
        observacoes: observacoesQuebra.trim() || undefined,
      });
      await Promise.all([
        refetch(),
        colunasExtrasQuery.refetch(),
        materiaisBloqueadosQuery.refetch(),
      ]);
      toast.success("Quebra registrada! Item encaminhado para a Ferramentaria.");
      setItemParaQuebra(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Falha ao registrar quebra da ferramenta.");
    } finally {
      setSalvandoModal(false);
    }
  }

  async function handleExportar() {
    if (!token) return;
    try {
      const blob = await exportarProducaoCsv(token, {
        linha,
        turno: turno === 0 ? undefined : turno,
        setor,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const sufixoTurno = turno === 0 ? "todos_turnos" : `turno${turno}`;
      link.download = `producao_${setor}_${linha}_${sufixoTurno}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Produção exportada com sucesso!");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Falha ao exportar produção.");
    }
  }

  async function handleReordenar(posto: string, itens: ItemProducao[]) {
    if (!token) return;
    const ids = itens
      .filter((item): item is ItemProducao & { id: number } => item.id !== null)
      .map((item) => item.id);
    try {
      await reordenarProducao(token, {
        linha,
        turno: turno === 0 ? undefined : turno,
        posto_trabalho: posto,
        ids_em_ordem: ids,
        setor,
        recalcular_horarios: modoEdicaoProducao,
      });
      await refetch();
      toast.success(
        modoEdicaoProducao
          ? "Produção reordenada e horários recalculados!"
          : "Produção reordenada com sucesso."
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Falha ao reordenar produção.");
    }
  }

  async function handleMoverColunaExtra(itemId: number, colunaExtraId: number | null) {
    if (!token) return;
    try {
      await moverParaColunaExtra(token, itemId, colunaExtraId);
      await refetch();
      toast.success("Item movido com sucesso.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error(err instanceof ApiError && err.message ? err.message : "Falha ao mover item.");
    }
  }

  async function handleCriarColunaExtra(nome: string) {
    if (!token) return;
    try {
      await criarColunaExtra(token, nome, setor);
      await colunasExtrasQuery.refetch();
      toast.success("Coluna criada com sucesso.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Falha ao criar coluna extra.");
    }
  }

  async function handleRenomearColunaExtra(colunaExtraId: number, novoNome: string) {
    if (!token) return;
    try {
      await renomearColunaExtra(token, colunaExtraId, novoNome);
      await colunasExtrasQuery.refetch();
      toast.success("Coluna renomeada com sucesso.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Falha ao renomear coluna extra.");
    }
  }

  async function handleRemoverColunaExtra(colunaExtraId: number) {
    if (!token) return;
    try {
      await removerColunaExtra(token, colunaExtraId);
      await colunasExtrasQuery.refetch();
      toast.success("Coluna removida com sucesso.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Falha ao remover coluna extra.");
    }
  }

  async function handleLimparProducao() {
    if (!token) return;
    setExecutandoLimpeza(true);
    try {
      const res = await limparProducao(token, {
        linha,
        setor,
        turno: limparApenasTurno && turno > 0 ? turno : undefined,
      });
      toast.success(res.mensagem || "Produção limpa com sucesso!");
      setModalLimparAberto(false);
      await refetch();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Falha ao limpar itens de produção.");
    } finally {
      setExecutandoLimpeza(false);
    }
  }

  const podeGerenciarColunasExtras = role === "admin" || role === "programador";
  const colunasExtras = colunasExtrasQuery.data ?? [];

  // Itens classificados numa coluna extra saem da coluna de posto
  const itensPorPostoFiltrado: Record<string, ItemProducao[]> = {};
  const itensPorColunaExtra: Record<number, ItemProducao[]> = {};
  for (const [posto, itens] of Object.entries(itensPorPosto)) {
    const semColunaExtra: ItemProducao[] = [];
    for (const item of itens) {
      if (item.coluna_extra_id !== null) {
        (itensPorColunaExtra[item.coluna_extra_id] ??= []).push(item);
      } else {
        semColunaExtra.push(item);
      }
    }
    itensPorPostoFiltrado[posto] = semColunaExtra;
  }

  // Ferramentas em tryout para Estamparia
  const tryouts = tryoutFerramentasQuery.data ?? [];
  const tryoutsFiltrados = tryouts.filter(
    (t) => !linha || t.linha === linha || t.linha === "TODAS"
  );

  return (
    <div
      className={`w-full min-h-[calc(100vh-4rem)] transition-all duration-150 ${
        modoVisualizacao === "tabela" || modoVisualizacao === "timeline"
          ? "px-2 sm:px-3 py-3"
          : "px-6 py-6"
      }`}
    >
      {/* Cockpit de Controle da Produção (2 Tiers - Limpo, Organizado e Sem Duplicidade) */}
      <div className="mb-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        {/* Tier 1: Identificação do Setor, Troca Rápida e Ações Principais */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl border shadow-2xs font-bold ${
                setor === "estamparia"
                  ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800"
                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
              }`}
            >
              {setor === "estamparia" ? <Factory className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Produção — {setor === "estamparia" ? "Estamparia" : "Solda"}
                </h1>
                {/* Switcher Rápido de Setor se tiver permissão em ambos */}
                <div className="flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                  {podeVerSolda && (
                    <Link
                      to="/producao/solda"
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                        setor === "solda"
                          ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      <span>Solda</span>
                    </Link>
                  )}
                  {podeVerEstamparia && (
                    <Link
                      to="/producao/estamparia"
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                        setor === "estamparia"
                          ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <Factory className="w-3 h-3" />
                      <span>Estamparia</span>
                    </Link>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {setor === "estamparia"
                  ? "Prensas, matrizes, corte e conformação de peças com coluna integrada de Tryout."
                  : "Postos de solda (SB6A), sequenciamento de lotes e acompanhamento da linha de montagem."}
              </p>
            </div>
          </div>

          {/* Ações Primárias da Produção */}
          <div className="flex items-center gap-2.5">
            {podeInserirCard && (
              <button
                type="button"
                onClick={() => setModalInserirCardAberto(true)}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold shadow-2xs transition-all cursor-pointer"
                title="Inserir ordem de emergência diretamente na produção (Ctrl + I)"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Ordem de Emergência</span>
                <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.2 text-[10px] font-mono bg-emerald-700 text-emerald-100 rounded">
                  Ctrl+I
                </kbd>
              </button>
            )}
            {podeEditarProducao && (
              <button
                type="button"
                data-testid="btn-toggle-modo-edicao-producao"
                onClick={() => setModoEdicaoProducao((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-bold shadow-2xs transition-all cursor-pointer ${
                  modoEdicaoProducao
                    ? "border-amber-500 bg-amber-500 hover:bg-amber-600 text-slate-950 ring-2 ring-amber-400/50"
                    : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
                title="Ativar/desativar modo de edição e reordenação com recálculo em tempo real da produção"
              >
                <span>✏️</span>
                <span>{modoEdicaoProducao ? "Modo Edição Ativo" : "Editar em Produção"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportar}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3.5 py-2 text-xs font-semibold shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Exportar dados da produção atual em formato CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Exportar CSV</span>
            </button>
            {role === "admin" && (
              <button
                type="button"
                onClick={() => setModalLimparAberto(true)}
                className="flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors shadow-2xs cursor-pointer"
                title="Limpar itens em produção desta linha para testes (Exclusivo Admin)"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Limpar Produção</span>
              </button>
            )}
          </div>
        </div>

        {/* Tier 2: Escopo de Filtros (Linha, Turno, Data) & Alternador de Visualização */}
        <div className="px-5 py-3 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-4">
          {/* Filtros de Escopo */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Linha</span>
              <select
                aria-label="Linha"
                value={linha}
                onChange={(event) => {
                  const novaLinha = event.target.value;
                  setLinha(novaLinha);
                  setSearchParams((prev) => {
                    const p = new URLSearchParams(prev);
                    p.set("linha", novaLinha);
                    return p;
                  });
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 shadow-2xs focus:border-indigo-500 focus:outline-none cursor-pointer"
              >
                {linhasDisponiveis.map((item) => (
                  <option key={item.valor} value={item.valor}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Turno</span>
              <select
                aria-label="Turno"
                value={turno}
                onChange={(event) => setTurno(Number(event.target.value))}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 shadow-2xs focus:border-indigo-500 focus:outline-none cursor-pointer"
              >
                <option value={0}>Todos os Turnos</option>
                <option value={1}>1º Turno</option>
                <option value={2}>2º Turno</option>
                <option value={3}>3º Turno</option>
              </select>
            </label>

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <label htmlFor="data-producao-input">Data da Produção</label>
              <div className="flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleNavegarDiaProducao(-1)}
                  title="Dia anterior"
                  className="px-1.5 py-0.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded text-xs cursor-pointer font-bold"
                >
                  ◀
                </button>
                <input
                  id="data-producao-input"
                  type="date"
                  value={dataProducao === "todas" ? "" : dataProducao}
                  onChange={(e) => setDataProducao(e.target.value || "todas")}
                  className="bg-transparent text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                  title="Filtrar por data específica da produção"
                />
                <button
                  type="button"
                  onClick={() => handleNavegarDiaProducao(1)}
                  title="Próximo dia"
                  className="px-1.5 py-0.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded text-xs cursor-pointer font-bold"
                >
                  ▶
                </button>
                <button
                  type="button"
                  onClick={() => setDataProducao(getHojeLocalIso())}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                    dataProducao === getHojeLocalIso()
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                  title="Visualizar a produção de hoje"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setDataProducao("todas")}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                    dataProducao === "todas"
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                  title="Visualizar todas as datas da linha"
                >
                  Todas
                </button>
              </div>
            </div>
          </div>

          {/* Alternador de Visualização Cards / Tabela / Linha do Tempo */}
          <div className="flex items-center rounded-lg bg-slate-200/80 dark:bg-slate-800 p-1 border border-slate-300 dark:border-slate-700 shadow-2xs">
            <button
              type="button"
              onClick={() => setModoVisualizacao("cards")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                modoVisualizacao === "cards"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Visualização em Quadro Kanban"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Quadro</span>
            </button>
            <button
              type="button"
              onClick={() => setModoVisualizacao("tabela")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                modoVisualizacao === "tabela"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Visualização em Tabela Detalhada"
            >
              <TableProperties className="w-3.5 h-3.5" />
              <span>Tabela</span>
            </button>
            <button
              type="button"
              onClick={() => setModoVisualizacao("timeline")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                modoVisualizacao === "timeline"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Visualização em Linha do Tempo (Fluxo Cronológico do Chão de Fábrica)"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Linha do Tempo</span>
            </button>
          </div>

          {/* Alternador de Densidade dos Cards na Produção */}
          {modoVisualizacao === "cards" && (
            <button
              type="button"
              onClick={() => setModoCompacto((prev) => !prev)}
              title={
                modoCompacto
                  ? "Expandir cartões (visão detalhada com insumos)"
                  : "Compactar cartões (visão minimalista otimizada)"
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                modoCompacto
                  ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shadow-2xs"
                  : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs"
              }`}
            >
              {modoCompacto ? (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>📐 Modo Compacto</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>📑 Modo Detalhado</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Banner de Modo de Edição em Produção Ativado */}
      {modoEdicaoProducao && (
        <div
          data-testid="banner-modo-edicao-producao"
          className="mb-4 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/90 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between shadow-xs animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">✏️</span>
            <span>
              <strong>Modo Edição em Produção Ativo:</strong> Arraste os cards para reordenar a fila ou clique em <strong>✏️ Editar</strong> em qualquer card para alterar horários, kanbans e tempos. As alterações são sincronizadas imediatamente com as TVs fabris.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setModoEdicaoProducao(false)}
            className="text-xs font-bold text-amber-900 dark:text-amber-100 bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 px-2.5 py-1 rounded-md transition-colors cursor-pointer shrink-0"
          >
            Concluir Edição
          </button>
        </div>
      )}

      {/* Conteúdo Principal: Quadro Kanban ou Visão Tabela */}
      {modoVisualizacao === "cards" ? (
        <div className="flex gap-4 overflow-x-auto pb-4 items-start">
          {/* Board Principal de Postos e Buckets */}
          <div className="flex-1 min-w-0">
            <SequenciaBoard
              itensPorPosto={itensPorPostoFiltrado}
              onReordenar={handleReordenar}
              somenteLeitura={somenteLeitura}
              colunasExtras={colunasExtras}
              itensPorColunaExtra={itensPorColunaExtra}
              podeGerenciarColunasExtras={podeGerenciarColunasExtras}
              onCriarColunaExtra={handleCriarColunaExtra}
              onApagarColunaExtra={handleRemoverColunaExtra}
              onRenomearColunaExtra={handleRenomearColunaExtra}
              onMoverParaColunaExtra={handleMoverColunaExtra}
              exibirEstoque={false}
              modoCompacto={modoCompacto}
              modoEdicao={modoEdicaoProducao}
              onSolicitarEditarItem={(item) => setItemParaEditar(item)}
              onIniciarProducao={handleIniciarProducao}
              onPausarProducao={handlePausarProducao}
              onDesfazerInicio={handleDesfazerInicioProducao}
              onSolicitarConcluir={handleAbrirModalConcluir}
              onSolicitarQuebra={handleAbrirModalQuebra}
              materiaisBloqueados={materiaisBloqueadosQuery.data ?? []}
              corDestaque={corDestaque}
              onRemoverItem={
                podeGerenciarColunasExtras && modoEdicaoProducao
                  ? async (posto, chave) => {
                      const id = Number(chave);
                      if (!Number.isNaN(id) && token) {
                        const itemAlvo = (itensPorPosto[posto] ?? []).find((i) => i.id === id);
                        const isTandem = Boolean(itemAlvo?.producao_em_linha);
                        if (
                          confirm(
                            `Remover o card ${itemAlvo?.material || ""} da produção? Os horários subsequentes serão recalculados.`
                          )
                        ) {
                          try {
                            const res = await excluirItemProducao(token, id, isTandem);
                            toast.success(res.mensagem || "Card removido da produção!");
                            refetch();
                          } catch (err: unknown) {
                            const msg = err instanceof Error ? err.message : "Erro ao remover card.";
                            toast.error(msg);
                          }
                        }
                      }
                    }
                  : undefined
              }
            />
          </div>

          {/* Coluna Especial Tryout na Estamparia */}
          {setor === "estamparia" && !tryoutMinimizado && (
            <div className="w-80 md:w-[320px] shrink-0 rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 flex flex-col min-h-[500px] overflow-hidden shadow-2xs">
              {/* Header da Coluna Tryout */}
              <div className="border-b border-blue-200 dark:border-blue-900/40 bg-blue-100/70 dark:bg-blue-900/30 px-3.5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">⚙️</span>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-950 dark:text-blue-200">
                      Tryout de Matrizes
                    </h3>
                    <span className="text-[10px] text-blue-700 dark:text-blue-400 font-medium block">
                      Bancada de Prensa
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-blue-200 dark:bg-blue-800 text-xs font-bold text-blue-900 dark:text-blue-100">
                    {tryoutsFiltrados.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleTryoutMinimizado}
                    className="flex items-center gap-1 text-[11px] font-bold text-blue-800 dark:text-blue-300 hover:bg-blue-200/80 dark:hover:bg-blue-800/80 px-2 py-0.5 rounded cursor-pointer transition-colors"
                    title="Minimizar coluna para widget flutuante no rodapé"
                  >
                    <span>—</span>
                    <span>Minimizar</span>
                  </button>
                </div>
              </div>

              {/* Lista de Ferramentas em Tryout */}
              <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto max-h-[calc(100vh-16rem)]">
                {tryoutsFiltrados.length === 0 ? (
                  <div className="py-16 text-center text-xs text-blue-500/80 dark:text-blue-400/80 px-4">
                    Nenhuma matriz aguardando teste ou tryout em prensa neste momento.
                  </div>
                ) : (
                  tryoutsFiltrados.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-blue-200/80 dark:border-blue-800/80 bg-white dark:bg-slate-800/95 p-3 shadow-2xs hover:shadow-md transition-shadow relative"
                    >
                      <div className="flex items-start justify-between gap-1.5 mb-1">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100 font-mono">
                          {item.material}
                        </span>
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
                          Tryout
                        </span>
                      </div>

                      {item.descricao && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mb-2">
                          {item.descricao}
                        </p>
                      )}

                      <div className="space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/60 pt-1.5 mb-2">
                        <div className="flex justify-between">
                          <span>Máquina / Prensa:</span>
                          <strong className="text-blue-700 dark:text-blue-300 font-mono">
                            {item.tryout_prensa || item.posto_trabalho || "PRENSA"}
                          </strong>
                        </div>
                        {item.tryout_ferramenta && item.tryout_ferramenta !== item.material && (
                          <div className="flex justify-between">
                            <span>Ferramenta:</span>
                            <strong className="font-mono text-slate-700 dark:text-slate-300">{item.tryout_ferramenta}</strong>
                          </div>
                        )}
                        {item.tryout_inicio && item.tryout_fim && (
                          <div className="flex justify-between text-[10px] text-blue-800 dark:text-blue-300 font-medium">
                            <span>Janela Tryout:</span>
                            <span>
                              {new Date(item.tryout_inicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} {new Date(item.tryout_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} - {new Date(item.tryout_fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Origem:</span>
                          <span>{item.linha}</span>
                        </div>
                        {item.pecas_produzidas > 0 && (
                          <div className="flex justify-between">
                            <span>Amostras:</span>
                            <strong>{item.pecas_produzidas} peças</strong>
                          </div>
                        )}
                      </div>

                      {item.observacoes && (
                        <div className="text-[10px] text-blue-900 dark:text-blue-200 bg-blue-50/80 dark:bg-blue-950/40 p-1.5 rounded mb-2 border border-blue-100 dark:border-blue-900/30 italic">
                          {item.observacoes}
                        </div>
                      )}

                      {/* Botão de Encaixe em Produção */}
                      <button
                        type="button"
                        onClick={() => {
                          const prensaAlvo = item.tryout_prensa || item.posto_trabalho || "PR-108";
                          setDadosInserirTryout({
                            material: item.material,
                            posto_trabalho: prensaAlvo,
                            kanbans: 1,
                            qtd_por_kanban: item.pecas_produzidas > 0 ? item.pecas_produzidas : 10,
                            tituloModal: `Encaixar Tryout em Produção (${prensaAlvo})`,
                          });
                          setModalInserirCardAberto(true);
                        }}
                        className="w-full mt-2 flex items-center justify-center gap-1.5 rounded bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs py-1.5 shadow-xs transition-colors cursor-pointer"
                        title="Encaixar teste deste tryout na fila de produção da prensa"
                      >
                        <span>➕</span>
                        <span>Encaixar em Produção</span>
                      </button>

                      <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 mt-2 border-t border-slate-100 dark:border-slate-700/40">
                        <span>Em teste na Prensa</span>
                        <span className="text-blue-600 dark:text-blue-400 font-medium">
                          Ferramentaria ➜ Prensa
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ) : modoVisualizacao === "timeline" ? (
        <ProducaoTimelineView
          itens={data ?? []}
          turno={turno}
          dataBase={dataProducao}
          horariosConfig={horariosConfig}
          onSelectItem={(item) => setItemSelecionadoDetalhe(item)}
          onIniciarProducao={(item) => item.id !== null && handleIniciarProducao(item.id)}
          onSolicitarConcluir={handleAbrirModalConcluir}
          onSolicitarQuebra={handleAbrirModalQuebra}
          onPausarProducao={(item) => item.id !== null && handlePausarProducao(item.id)}
        />
      ) : (
        <ProducaoTabelaView
          itens={data ?? []}
          colunasExtras={colunasExtras}
          materiaisBloqueados={materiaisBloqueadosQuery.data ?? []}
          onIniciarProducao={handleIniciarProducao}
          onPausarProducao={handlePausarProducao}
          onDesfazerInicio={handleDesfazerInicioProducao}
          onSolicitarConcluir={handleAbrirModalConcluir}
          onSolicitarQuebra={handleAbrirModalQuebra}
          onMoverParaColunaExtra={handleMoverColunaExtra}
          onVerDetalhes={(item) => setItemSelecionadoDetalhe(item)}
          somenteLeitura={somenteLeitura}
        />
      )}

      {/* Modal de Conclusão de Produção */}
      {itemParaConcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-800 p-6 shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400">
                ✓
              </span>
              Concluir Produção
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Posto: <strong className="text-slate-700 dark:text-slate-200">{itemParaConcluir.posto_trabalho}</strong>
              {itemParaConcluir.material && (
                <> | Material: <strong className="text-slate-700 dark:text-slate-200">{itemParaConcluir.material}</strong></>
              )}
            </p>
            {itemParaConcluir.producao_em_linha && (
              <div className="mt-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-2 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-bold">🔗</span>
                <div className="space-y-0.5">
                  <span className="font-bold">Item de Produção em Linha (Tandem):</span>
                  <p className="text-[11px] text-blue-800 dark:text-blue-300">
                    Este material opera sincronizado
                    {itemParaConcluir.postos_vinculados?.length
                      ? ` nos postos: ${itemParaConcluir.postos_vinculados.join(" ↔ ")}.`
                      : "."}
                  </p>
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmarConclusao();
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Quantidade de Peças Produzidas <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={pecasConcluidas}
                  onChange={(e) => setPecasConcluidas(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Ex: 50"
                  autoFocus
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Total programado: {itemParaConcluir.kanbans * itemParaConcluir.qtd_por_kanban} peças ({itemParaConcluir.kanbans} kanbans)
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Comentários / Observações do Turno
                </label>
                <textarea
                  rows={3}
                  value={comentariosConclusao}
                  onChange={(e) => setComentariosConclusao(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Observações sobre a tiragem, qualidade ou apontamentos (opcional)..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setItemParaConcluir(null)}
                  disabled={salvandoModal}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoModal}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {salvandoModal ? "Concluindo..." : "Confirmar Conclusão"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Quebra de Máquina / Ferramenta */}
      {itemParaQuebra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-800 p-6 shadow-2xl border border-red-200 dark:border-red-900/50 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400">
                ⚠️
              </span>
              Quebra de Ferramenta / Máquina
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              O item será movido para <strong>Quebra de Máquina</strong> e a ferramenta entrará em manutenção na <strong>Ferramentaria</strong>.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmarQuebra();
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Quantidade de Peças Produzidas até a Parada <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={pecasQuebra}
                  onChange={(e) => setPecasQuebra(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  placeholder="Ex: 25"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo da Quebra / Descrição da Avaria <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={motivoQuebra}
                  onChange={(e) => setMotivoQuebra(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  placeholder="Ex: Quebra do pino extrator, trinca na navalha, desajuste na matriz..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Observações Adicionais para a Ferramentaria
                </label>
                <textarea
                  rows={2}
                  value={observacoesQuebra}
                  onChange={(e) => setObservacoesQuebra(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  placeholder="Detalhes sobre ruído, impacto, sugestões de reparo..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setItemParaQuebra(null)}
                  disabled={salvandoModal}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoModal}
                  className="rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-semibold text-white shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {salvandoModal ? "Registrando..." : "Registrar Quebra"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Limpeza de Produção (Exclusivo Admin) */}
      {modalLimparAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4">
              <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">
                  Limpar Itens de Produção
                </h3>
                <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold uppercase tracking-wider">
                  Ação Administrativa de Testes
                </span>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Deseja remover os lotes persistidos na Tabela B da{" "}
              <strong className="text-slate-900 dark:text-slate-100">{linha}</strong> no setor{" "}
              <strong className="text-slate-900 dark:text-slate-100">{setor.toUpperCase()}</strong>?
            </p>

            <div className="mb-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5 border border-slate-200 dark:border-slate-700 space-y-2.5">
              {turno > 0 ? (
                <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={limparApenasTurno}
                    onChange={(e) => setLimparApenasTurno(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                  />
                  <span>Limpar apenas o {turno}º Turno (manter os demais turnos)</span>
                </label>
              ) : (
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Filtro atual: Todos os turnos
                </p>
              )}
              {(!limparApenasTurno || turno === 0) && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Todos os turnos da {linha} serão completamente limpos.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={executandoLimpeza}
                onClick={() => setModalLimparAberto(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={executandoLimpeza}
                onClick={handleLimparProducao}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {executandoLimpeza ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Limpando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar Limpeza</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer / Modal de Detalhes do Item na Visão Tabela */}
      {itemSelecionadoDetalhe && (
        <ItemDetalhe
          item={itemSelecionadoDetalhe}
          onClose={() => setItemSelecionadoDetalhe(null)}
          onSolicitarEditarItem={(item) => {
            setItemSelecionadoDetalhe(null);
            setItemParaEditar(item);
          }}
        />
      )}

      {/* Modal de Inserção Direta de Card na Produção */}
      <InserirCardModal
        isOpen={modalInserirCardAberto}
        onClose={() => {
          setModalInserirCardAberto(false);
          setDadosInserirTryout(null);
        }}
        onSucesso={(msg) => {
          toast.success(msg);
          setDadosInserirTryout(null);
          refetch();
        }}
        linha={linha}
        setor={setor}
        turnoInicial={turno}
        postosDisponiveis={postosDisponiveis}
        dadosIniciais={dadosInserirTryout}
      />

      {/* Modal de Edição Direta de Card na Produção */}
      {itemParaEditar && (
        <EditarCardProducaoModal
          item={itemParaEditar}
          onClose={() => setItemParaEditar(null)}
          onSucesso={() => refetch()}
        />
      )}

      {/* Botão Flutuante de Tryout de Matrizes na Estamparia */}
      {setor === "estamparia" && tryoutMinimizado && (
        <button
          type="button"
          onClick={handleToggleTryoutMinimizado}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 shadow-xl hover:shadow-2xl border border-blue-400 dark:border-blue-500 transition-all cursor-pointer hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-bottom-4 duration-200"
          title="Clique para expandir o painel de Tryout de Matrizes"
        >
          <span className="text-base">⚙️</span>
          <div className="text-left leading-tight">
            <span className="block text-xs font-black tracking-wide">Tryout de Matrizes</span>
            <span className="block text-[10px] text-blue-200">Bancada de Prensas</span>
          </div>
          <span className="flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-white text-blue-700 text-xs font-black shadow-xs">
            {tryoutsFiltrados.length}
          </span>
          {tryoutsFiltrados.length > 0 && (
            <span className="relative flex h-2.5 w-2.5 -ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
            </span>
          )}
        </button>
      )}
    </div>
  );
}
