import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useReducer, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Zap,
  Factory,
  ShieldAlert,
  RotateCcw,
  FileSpreadsheet,
  Send,
  Database,
  Plus,
  LayoutGrid,
  Clock,
  Maximize2,
  Minimize2,
  ChevronDown,
  SlidersHorizontal,
  Boxes,
  Upload,
  TableProperties,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { SequenciaBoard } from "../components/SequenciaBoard/SequenciaBoard";
import { ProgramacaoTimelineView } from "../components/ProgramacaoTimeline/ProgramacaoTimelineView";
import { EditarCardProgramacaoModal } from "../components/Programacao/EditarCardProgramacaoModal";
import { consolidarItensCriticos } from "../domain/criticidade";
import {
  ApiError,
  atualizarSap,
  getMateriaisBloqueados,
  getParametros,
  getResumoPatans,
  type ResumoPatanInfo,
  getSequencia,
  importarExcel,
  listarLinhas,
  listarTabelaB,
  sincronizarEstoqueMb52,
  uploadEstoqueMb52,
  submitBulkSequencia,
} from "../services/api";
import type { ImportResponse } from "../services/api/importacao";
import type { HorariosTurnosConfig } from "../utils/seisanTimeUtils";
import { isMaterialBloqueado } from "../utils/ferramentariaUtils";
import { obterPostoSap } from "../utils/postos";
import {
  gerarTextoResumoLote,
  TEMPLATE_PADRAO_SOLDA,
  TEMPLATE_PADRAO_ESTAMPARIA,
} from "../utils/resumoTemplate";
import {
  getHojeLocalIso,
  initialSequenciaState,
  sequenciaReducer,
  type ModoDimensionamento,
} from "../state/sequenciaReducer";
import {
  LINHAS_SOLDA_PADRAO,
  LINHAS_ESTAMPARIA_PADRAO,
  PATANS_SOLDA,
  PATANS_ESTAMPARIA,
  PlanItemStatus,
  type BulkSubmitRequest,
  type ItemProducao,
  type Patan,
} from "../types/producao";

const FIELD_LABEL_CLASSES = "flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300";
const FIELD_INPUT_CLASSES =
  "rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600";

type CriterioOrdenacao =
  | "CRITICIDADE"
  | "DIAS_DESC"
  | "SALDO_ASC"
  | "FALTA_DESC"
  | "POSTO"
  | "MATERIAL";

export interface ProgramacaoPatanProps {
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

function useSafeSearchParams(): [URLSearchParams, (updater: (prev: URLSearchParams) => URLSearchParams) => void] {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSearchParams();
  } catch {
    return [new URLSearchParams(), () => {}];
  }
}

function SafeLink({
  to,
  children,
  className,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = useSafePathname();
  if (!pathname) {
    return (
      <a href={to} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

export function ProgramacaoPatan({ setor: setorProp }: ProgramacaoPatanProps = {}) {
  const { token, role, permissoes, logout } = useAuth();
  const pathname = useSafePathname();
  const [searchParams, setSearchParams] = useSafeSearchParams();

  // Determinar setor através de prop ou rota (/programacao/estamparia vs /programacao/solda)
  const setor: "solda" | "estamparia" =
    setorProp ?? (pathname.includes("estamparia") ? "estamparia" : "solda");

  // Permissões granulares de acesso por setor
  const podeVerSolda =
    role === "admin" ||
    (permissoes ? permissoes.pode_ver_solda : true);

  const podeVerEstamparia =
    role === "admin" ||
    (permissoes ? permissoes.pode_ver_estamparia : true);

  const semPermissao =
    (setor === "solda" && !podeVerSolda) ||
    (setor === "estamparia" && !podeVerEstamparia);

  // Buscar linhas cadastradas do setor
  const { data: linhasApi } = useQuery({
    queryKey: ["linhas-producao", setor],
    queryFn: () => (token ? listarLinhas(token, setor) : Promise.resolve([])),
    enabled: Boolean(token),
  });

  const linhasDisponiveis = useMemo(() => {
    if (linhasApi && linhasApi.length > 0) {
      return linhasApi.map((l) => ({ valor: l.nome, label: l.nome }));
    }
    return setor === "estamparia" ? LINHAS_ESTAMPARIA_PADRAO : LINHAS_SOLDA_PADRAO;
  }, [linhasApi, setor]);

  const linhaParam = searchParams.get("linha");
  const linha =
    linhaParam && linhasDisponiveis.some((l) => l.valor === linhaParam)
      ? linhaParam
      : (linhasDisponiveis[0]?.valor ?? "LINHA 1");

  function handleLinhaChange(novaLinha: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("linha", novaLinha);
      return next;
    });
  }

  const [turno, setTurno] = useState(1);
  const [patan, setPatan] = useState<Patan>("A");

  const patansDisponiveis = useMemo(
    () => (setor === "estamparia" ? PATANS_ESTAMPARIA : PATANS_SOLDA),
    [setor]
  );

  useEffect(() => {
    if (!(patansDisponiveis as readonly string[]).includes(patan)) {
      setPatan(patansDisponiveis[0]);
    }
  }, [patansDisponiveis, patan]);
  const [state, dispatch] = useReducer(sequenciaReducer, initialSequenciaState);
  const [dataProgramacao, setDataProgramacao] = useState<string>(getHojeLocalIso);
  const [modoDimensionamento, setModoDimensionamento] = useState<ModoDimensionamento>("PATAN_FIXO");
  const [continuarAposProducao, setContinuarAposProducao] = useState<boolean>(false);
  const [enviando, setEnviando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [atualizandoSap, setAtualizandoSap] = useState(false);
  const [sincronizandoEstoque, setSincronizandoEstoque] = useState(false);
  const [modalInserirAberto, setModalInserirAberto] = useState(false);
  const [novoPosto, setNovoPosto] = useState("");
  const [novoMaterial, setNovoMaterial] = useState("");
  const [novosKanbans, setNovosKanbans] = useState(1);
  const [novaQtdPorKanban, setNovaQtdPorKanban] = useState(100);
  const [novoTempoPorPeca, setNovoTempoPorPeca] = useState(1.0);
  const [novaDemanda, setNovaDemanda] = useState("");
  const [novoKanbanMax, setNovoKanbanMax] = useState("");
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [criticosIncluidos, setCriticosIncluidos] = useState<Set<number>>(new Set());
  const [itensRemovidos, setItensRemovidos] = useState<Set<string>>(new Set());
  const [painelCriticosAberto, setPainelCriticosAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Alternador de visão (Quadro vs Tabela vs Linha do Tempo) e densidade (Compacto vs Detalhado)
  const [modoVisao, setModoVisao] = useState<"cards" | "tabela" | "timeline">("cards");
  const [modoCompacto, setModoCompacto] = useState<boolean>(false);
  const [acoesExpandidas, setAcoesExpandidas] = useState<boolean>(false);
  const [itemParaEditar, setItemParaEditar] = useState<ItemProducao | null>(null);
  const [buscaTabelaProg, setBuscaTabelaProg] = useState<string>("");
  const [postoTabelaProg, setPostoTabelaProg] = useState<string>("TODOS");

  function handleDataProgramacaoChange(novaData: string) {
    if (!novaData || novaData === dataProgramacao) return;
    setDataProgramacao(novaData);
    dispatch({
      type: "ALTERAR_DATA_BASE",
      payload: { dataBase: novaData },
    });
  }

  function handleNavegarDiaProgramacao(offsetDias: number) {
    const parts = dataProgramacao.split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2] + offsetDias);
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    handleDataProgramacaoChange(iso);
  }

  // Parâmetros do sistema para horários e pausas de almoço
  const parametrosQuery = useQuery({
    queryKey: ["parametros-sistema"],
    queryFn: () => (token ? getParametros(token) : Promise.resolve([])),
    enabled: Boolean(token),
  });

  const horariosConfig = useMemo<HorariosTurnosConfig>(() => {
    const params = parametrosQuery.data ?? [];
    return {
      t1Inicio: params.find((p) => p.chave === "hora_inicio_turno_1")?.valor,
      t2Inicio: params.find((p) => p.chave === "hora_inicio_turno_2")?.valor,
      t3Inicio: params.find((p) => p.chave === "hora_inicio_turno_3")?.valor,
      t1AlmocoInicio: params.find((p) => p.chave === "hora_refeicao_turno_1")?.valor,
      t2AlmocoInicio: params.find((p) => p.chave === "hora_refeicao_turno_2")?.valor,
      t3AlmocoInicio: params.find((p) => p.chave === "hora_refeicao_turno_3")?.valor,
      duracaoRefeicaoMin: Number(params.find((p) => p.chave === "duracao_refeicao_minutos")?.valor) || 40,
    };
  }, [parametrosQuery.data]);

  const limiteLoteCurtoMinutos = useMemo<number>(() => {
    const valor = parametrosQuery.data?.find((p) => p.chave === "limite_lote_curto_minutos")?.valor;
    const num = Number(valor);
    return Number.isFinite(num) && num > 0 ? num : 60;
  }, [parametrosQuery.data]);

  const limiteLoteCurtoSoldaMinutos = useMemo<number>(() => {
    const valor = parametrosQuery.data?.find((p) => p.chave === "limite_lote_curto_solda_minutos")?.valor;
    const num = Number(valor);
    return Number.isFinite(num) && num > 0 ? num : 60;
  }, [parametrosQuery.data]);

  function handleTrocarModo(novoModo: ModoDimensionamento) {
    if (modoDimensionamento === novoModo) return;
    setModoDimensionamento(novoModo);
    dispatch({
      type: "ALTERNAR_MODO_DIMENSIONAMENTO",
      payload: { modo: novoModo },
    });
    toast.info(
      novoModo === "PATAN_FIXO"
        ? "Modo ativado: 🎯 Lote Fixo do Patan (Receita padrão do ciclo)."
        : "Modo ativado: 📊 Estoque Máximo (Dimensionado para reposição até kanban máx.)."
    );
  }

  function handleInserirCard(e: React.FormEvent) {
    e.preventDefault();
    if (!novoPosto.trim() || !novoMaterial.trim()) {
      toast.error("Preencha o posto de trabalho e o código da peça.");
      return;
    }
    const kanbansVal = Math.max(1, Number(novosKanbans) || 1);
    const qtdCxVal = Math.max(1, Number(novaQtdPorKanban) || 1);
    const tempoVal = Math.max(0.01, Number(novoTempoPorPeca) || 1.0);
    const demandaVal = Number(novaDemanda) > 0 ? Number(novaDemanda) : kanbansVal * qtdCxVal;
    const kanbanMaxVal = Number(novoKanbanMax) > 0 ? Number(novoKanbanMax) : kanbansVal;

    const novoItem: ItemProducao = {
      id: Date.now(),
      linha,
      turno,
      patan,
      posto_trabalho: novoPosto.trim().toUpperCase(),
      material: novoMaterial.trim().toUpperCase(),
      kanbans: modoDimensionamento === "ESTOQUE_MAXIMO" ? kanbanMaxVal : kanbansVal,
      qtd_por_kanban: qtdCxVal,
      tempo_por_peca_minutos: tempoVal,
      status: PlanItemStatus.Normal,
      sequencia: 0,
      almoco_incluso: false,
      is_critico: false,
      tem_falta_estoque: false,
      coluna_extra_id: null,
      demanda: demandaVal,
      kanban_max: kanbanMaxVal,
      hora_inicial: null,
      hora_final: null,
      setor,
      mostrar_anotacoes_quadro: false,
    };
    novoItem.anotacoes = gerarTextoResumoLote(
      novoItem,
      setor === "estamparia" ? TEMPLATE_PADRAO_ESTAMPARIA : TEMPLATE_PADRAO_SOLDA
    );

    dispatch({ type: "INCLUIR_ITEM", payload: { item: novoItem } });
    toast.success(`Card adicionado ao Posto ${novoItem.posto_trabalho}!`);
    setModalInserirAberto(false);
    setNovoMaterial("");
    setNovosKanbans(1);
    setNovaDemanda("");
    setNovoKanbanMax("");
  }

  // Filtros e ordenação do painel de itens críticos
  const [filtroPosto, setFiltroPosto] = useState<string>("TODOS");
  const [filtroBusca, setFiltroBusca] = useState<string>("");
  const [criterioOrdenacao, setCriterioOrdenacao] = useState<CriterioOrdenacao>("CRITICIDADE");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["sequencia", linha, turno, patan, setor, dataProgramacao],
    queryFn: async () => {
      if (!token) throw new Error("Nao autenticado.");
      return getSequencia(token, { linha, turno, patan, setor, data_base: dataProgramacao });
    },
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const materiaisBloqueadosQuery = useQuery({
    queryKey: ["materiais-bloqueados"],
    queryFn: () => getMateriaisBloqueados(token as string),
    enabled: Boolean(token),
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });
  const materiaisBloqueados = materiaisBloqueadosQuery.data ?? [];

  const { data: resumoPatans } = useQuery<Record<string, ResumoPatanInfo[]>>({
    queryKey: ["resumo-patans", setor],
    queryFn: () =>
      token
        ? getResumoPatans(token, setor)
        : Promise.resolve<Record<string, ResumoPatanInfo[]>>({}),
    enabled: Boolean(token),
    staleTime: 60000,
  });

  // Busca itens em produção da linha ativa para permitir sequenciamento contínuo após o último item
  const producaoAtivaQuery = useQuery({
    queryKey: ["producao-ativa-tabela-b", setor, linha],
    queryFn: () => (token ? listarTabelaB(token, { linha, setor, data: "todas" }) : Promise.resolve([])),
    enabled: Boolean(token),
    staleTime: 30000,
  });

  const horariosUltimoItemProducaoPorPosto = useMemo(() => {
    const mapa: Record<string, string> = {};
    if (!producaoAtivaQuery.data) return mapa;

    const itensAtivos = producaoAtivaQuery.data.filter(
      (it) => it.status !== 0 && it.coluna_extra_id === null && Boolean(it.hora_final)
    );

    for (const it of itensAtivos) {
      if (!it.posto_trabalho || !it.hora_final) continue;
      const posto = it.posto_trabalho;
      const finalAtual = mapa[posto];
      if (!finalAtual || new Date(it.hora_final).getTime() > new Date(finalAtual).getTime()) {
        mapa[posto] = it.hora_final;
      }
    }
    return mapa;
  }, [producaoAtivaQuery.data]);

  function handleToggleContinuarAposProducao(ativo: boolean) {
    setContinuarAposProducao(ativo);
    dispatch({
      type: "CONFIGURAR_CONTINUAR_PRODUCAO",
      payload: {
        continuar: ativo,
        horariosInicioPorPosto: horariosUltimoItemProducaoPorPosto,
      },
    });
    if (ativo) {
      const postosComProd = Object.keys(horariosUltimoItemProducaoPorPosto);
      if (postosComProd.length > 0) {
        toast.info(
          `⚡ Sequenciamento contínuo ativado: iniciando após lotes ativos em ${postosComProd.length} posto(s).`
        );
      } else {
        toast.info(
          "⚡ Sequenciamento contínuo ativado (nenhum lote ativo em execução encontrado nesta linha)."
        );
      }
    } else {
      toast.info("Horários redefinidos para o início padrão do turno.");
    }
  }

  function handlePatanChange(novoPatan: string) {
    const p = novoPatan as Patan;
    setPatan(p);

    if (resumoPatans && resumoPatans[novoPatan]) {
      const ocorrencias: ResumoPatanInfo[] = resumoPatans[novoPatan];
      const temNaAtual = ocorrencias.some((o: ResumoPatanInfo) => o.linha === linha && o.turno === turno);
      if (!temNaAtual && ocorrencias.length > 0) {
        const mesmaLinha = ocorrencias.find((o: ResumoPatanInfo) => o.linha === linha);
        const melhor = mesmaLinha || ocorrencias[0];
        if (melhor.linha !== linha) handleLinhaChange(melhor.linha);
        if (melhor.turno !== turno) setTurno(melhor.turno);
        toast.info(
          `✨ Patan ${novoPatan}: alternado para ${melhor.linha} • ${melhor.turno}º Turno (${melhor.total} itens)`
        );
      }
    }
  }

  // Auto-switch inteligente reativo se a resposta da API trouxer sugestões e nenhum item normal
  useEffect(() => {
    if (!data) return;
    const itensNormais = data.itens.filter((it) => it.status === PlanItemStatus.Normal);
    if (itensNormais.length === 0 && data.sugestoes_outros_turnos && data.sugestoes_outros_turnos.length > 0) {
      const melhor = data.sugestoes_outros_turnos[0];
      if (melhor.linha !== linha || melhor.turno !== turno) {
        if (melhor.linha !== linha) handleLinhaChange(melhor.linha);
        if (melhor.turno !== turno) setTurno(melhor.turno);
        toast.info(
          `✨ Patan ${patan}: alternado automaticamente para ${melhor.linha} • ${melhor.turno}º Turno (${melhor.total} itens)`
        );
      }
    }
  }, [data, patan]);

  // Limpa os críticos incluídos e itens removidos ao mudar de lote (linha, turno, patan, setor)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/rules-of-hooks, no-restricted-syntax, react-compiler/react-compiler
    setCriticosIncluidos(new Set());
    setItensRemovidos(new Set());
  }, [linha, turno, patan, setor]);

  // Carrega no reducer os itens normais do lote e os itens críticos
  // que o programador optou explicitamente por incluir no board.
  // Itens críticos incluídos entram na série de produção como parte do plano.
  // Itens explicitamente removidos pelo usuário da fila são preservados fora do board.
  useEffect(() => {
    if (!data) return;
    const itensDoBoard = data.itens
      .filter((item) => {
        const chave = String(item.id ?? `novo-${item.sequencia}`);
        if (itensRemovidos.has(chave)) return false;
        return (
          item.status === PlanItemStatus.Normal ||
          (item.id !== null && criticosIncluidos.has(item.id))
        );
      })
      .map((item) => {
        const itemAtualizado =
          item.status === PlanItemStatus.Critico || (item.id !== null && criticosIncluidos.has(item.id))
            ? {
                ...item,
                status: PlanItemStatus.Normal,
                is_critico: true,
                linha,
                turno,
                patan,
              }
            : { ...item };

        if (!itemAtualizado.anotacoes || !itemAtualizado.anotacoes.trim()) {
          itemAtualizado.anotacoes = gerarTextoResumoLote(
            itemAtualizado,
            setor === "estamparia" ? TEMPLATE_PADRAO_ESTAMPARIA : TEMPLATE_PADRAO_SOLDA
          );
          itemAtualizado.mostrar_anotacoes_quadro = false;
        }
        return itemAtualizado;
      });
    dispatch({
      type: "CARREGAR",
      payload: {
        turno,
        dataBase: dataProgramacao,
        itens: itensDoBoard,
        modoDimensionamento,
        continuarAposProducao,
        horariosInicioPorPosto: horariosUltimoItemProducaoPorPosto,
      },
    });
  }, [
    data,
    turno,
    criticosIncluidos,
    itensRemovidos,
    linha,
    patan,
    dataProgramacao,
    continuarAposProducao,
    horariosUltimoItemProducaoPorPosto,
  ]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      logout();
    }
  }, [error, logout]);

  // Todos os itens críticos retornados para a linha
  const todosCriticosDaLinha = useMemo(() => {
    if (!data?.itens) return [];
    return data.itens.filter((item) => item.status === PlanItemStatus.Critico);
  }, [data]);

  // Consolidação por (material, posto_trabalho) calculando ciclo de Patan e dias até próxima prod
  const criticosConsolidados = useMemo(() => {
    if (!todosCriticosDaLinha.length) return [];
    return consolidarItensCriticos(todosCriticosDaLinha, patan);
  }, [todosCriticosDaLinha, patan]);

  // Lista de postos únicos presentes entre os materiais críticos
  const postosComCriticos = useMemo(() => {
    const set = new Set<string>();
    for (const c of criticosConsolidados) {
      if (c.posto_trabalho) set.add(c.posto_trabalho);
    }
    return Array.from(set).sort();
  }, [criticosConsolidados]);

  // Filtragem e ordenação dos itens críticos para exibição no drawer
  const criticosFiltradosEOrdenados = useMemo(() => {
    let lista = [...criticosConsolidados];

    if (filtroPosto !== "TODOS") {
      lista = lista.filter((c) => c.posto_trabalho === filtroPosto);
    }

    if (filtroBusca.trim()) {
      const termo = filtroBusca.trim().toLowerCase();
      lista = lista.filter(
        (c) =>
          c.material.toLowerCase().includes(termo) ||
          c.posto_trabalho.toLowerCase().includes(termo)
      );
    }

    lista.sort((a, b) => {
      switch (criterioOrdenacao) {
        case "CRITICIDADE":
          return b.scoreCriticidade - a.scoreCriticidade;
        case "DIAS_DESC":
          return b.diasAteProximaProducao - a.diasAteProximaProducao;
        case "SALDO_ASC":
          return a.saldo_estoque - b.saldo_estoque;
        case "FALTA_DESC": {
          const faltaA =
            (a.kanban_min ?? 0) * (a.itemPrincipal.qtd_por_kanban || 1) - a.saldo_estoque;
          const faltaB =
            (b.kanban_min ?? 0) * (b.itemPrincipal.qtd_por_kanban || 1) - b.saldo_estoque;
          return faltaB - faltaA;
        }
        case "POSTO":
          return a.posto_trabalho.localeCompare(b.posto_trabalho);
        case "MATERIAL":
          return a.material.localeCompare(b.material);
        default:
          return b.scoreCriticidade - a.scoreCriticidade;
      }
    });

    return lista;
  }, [criticosConsolidados, filtroPosto, filtroBusca, criterioOrdenacao]);

  async function handleEnviar() {
    if (!token) return;
    setEnviando(true);
    setErro(null);
    try {
      const itens: BulkSubmitRequest["itens"] = [];
      for (const itensDoPosto of Object.values(state.itensPorPosto)) {
        let seqNormal = 1;
        for (const item of itensDoPosto) {
          const isCrit = Boolean(item.is_critico || (item.id !== null && criticosIncluidos.has(item.id)));
          const anotacoesFinais =
            item.anotacoes && item.anotacoes.trim()
              ? item.anotacoes
              : gerarTextoResumoLote(
                  item,
                  setor === "estamparia" ? TEMPLATE_PADRAO_ESTAMPARIA : TEMPLATE_PADRAO_SOLDA
                );
          itens.push({
            ...item,
            sequencia: seqNormal++,
            status: PlanItemStatus.Normal,
            is_critico: isCrit,
            anotacoes: anotacoesFinais,
            mostrar_anotacoes_quadro: false,
            posto_sap: item.posto_sap || obterPostoSap(item.posto_trabalho, setor),
            data_programada: dataProgramacao,
          });
        }
      }

      // Validação de ferramentas em manutenção na Ferramentaria com refetch fresco
      const { data: bloqueadosAtualizados = materiaisBloqueados } =
        await materiaisBloqueadosQuery.refetch();
      const conflitos = itens
        .filter((it) => it.material && isMaterialBloqueado(it.material, bloqueadosAtualizados))
        .map((it) => it.material);
      if (conflitos.length > 0) {
        const lista = Array.from(new Set(conflitos)).join(", ");
        const msg = `Não é possível enviar o lote: As ferramentas [${lista}] estão em manutenção na Ferramentaria. Aguarde a liberação.`;
        setErro(msg);
        toast.error(msg);
        setEnviando(false);
        return;
      }

      const payload: BulkSubmitRequest = {
        linha,
        turno,
        patan,
        setor,
        data_programada: dataProgramacao,
        itens,
      };
      await submitBulkSequencia(token, payload);
      setCriticosIncluidos(new Set());
      setItensRemovidos(new Set());
      await refetch();
      toast.success("Lote enviado com sucesso!");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
      } else if (err instanceof ApiError) {
        toast.error(`Falha ao enviar o lote: ${err.message}`);
      } else {
        toast.error("Falha ao enviar o lote. Nada foi salvo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  async function handleSincronizar() {
    if (!token) return;
    setSincronizando(true);
    setImportResult(null);
    try {
      const result = await importarExcel(token, setor);
      await refetch();
      toast.success(
        `Sincronização de ${setor === "estamparia" ? "Estamparia" : "Solda"} concluída: ${result.total_importados} itens processados.`
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
      } else if (err instanceof ApiError) {
        toast.error(`Falha ao sincronizar: ${err.message}`);
      } else {
        toast.error("Falha ao sincronizar o Excel.");
      }
    } finally {
      setSincronizando(false);
    }
  }

  async function handleAtualizarSap() {
    if (!token) return;
    setAtualizandoSap(true);
    setImportResult(null);
    try {
      const result = await atualizarSap(token, setor);
      await refetch();
      const detalheData = result.data_arquivo ? ` (${result.data_arquivo})` : "";
      const detalheOrigem =
        result.origem === "rede_compartilhada"
          ? "Rede Gestamp"
          : result.origem === "sap_script"
          ? "Automação SAP"
          : "Arquivo Local";
      toast.success(
        `SAP Atualizado com sucesso: ${result.total_importados} itens sincronizados${detalheData}. [Fonte: ${detalheOrigem}]`
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
      } else if (err instanceof ApiError) {
        toast.error(`Falha ao atualizar SAP: ${err.message}`);
      } else {
        toast.error("Falha ao atualizar dados do SAP. Verifique se o arquivo está disponível.");
      }
    } finally {
      setAtualizandoSap(false);
    }
  }

  async function handleSincronizarEstoqueMb52() {
    if (!token) return;
    setSincronizandoEstoque(true);
    try {
      const res = await sincronizarEstoqueMb52(token, setor);
      await refetch();
      toast.success(
        res.mensagem ||
          `Estoque MB52 sincronizado: ${res.total_materiais_mb52} materiais no SAP (${res.staging_atualizados} itens atualizados)!`
      );
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
      } else {
        const msg = err instanceof Error ? err.message : "Falha ao sincronizar estoque MB52.";
        toast.error(msg);
      }
    } finally {
      setSincronizandoEstoque(false);
    }
  }

  async function handleUploadEstoqueMb52(file: File) {
    if (!token) return;
    setSincronizandoEstoque(true);
    try {
      const res = await uploadEstoqueMb52(token, file, setor);
      await refetch();
      toast.success(
        `Arquivo '${file.name}' carregado: ${res.total_materiais_mb52} materiais no MB52 (${res.staging_atualizados} itens atualizados)!`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao enviar arquivo de estoque MB52.";
      toast.error(msg);
    } finally {
      setSincronizandoEstoque(false);
    }
  }

  async function handleMontarPadrao() {
    setCriticosIncluidos(new Set());
    setItensRemovidos(new Set());
    try {
      const res = await refetch();
      const itensBase = res.data?.itens ?? data?.itens ?? [];
      const itensPadrao = itensBase
        .filter((it) => it.status === PlanItemStatus.Normal && !it.is_critico)
        .map((it) => ({
          ...it,
          status: PlanItemStatus.Normal,
          linha,
          turno,
          patan,
        }));

      dispatch({
        type: "CARREGAR",
        payload: {
          turno,
          dataBase: dataProgramacao,
          itens: itensPadrao,
          modoDimensionamento,
        },
      });

      toast.success(
        `Patan Teórico restaurado! Grade padrão do Patan ${patan} montada no modo ${
          modoDimensionamento === "PATAN_FIXO" ? "Lote Fixo" : "Estoque Máximo"
        }.`
      );
    } catch {
      toast.error("Falha ao recarregar Patan Padrão.");
    }
  }

  // Atalhos de teclado globais no Cockpit do PCP (Programação Patan)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (!enviando) {
          e.preventDefault();
          handleEnviar();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
        if (!modalInserirAberto) {
          e.preventDefault();
          const postosDisponiveis = Object.keys(state.itensPorPosto);
          if (postosDisponiveis.length > 0 && !novoPosto) {
            setNovoPosto(postosDisponiveis[0]);
          }
          setModalInserirAberto(true);
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPainelCriticosAberto((prev) => !prev);
      } else if (e.key === "Escape") {
        if (modalInserirAberto) setModalInserirAberto(false);
        if (painelCriticosAberto) setPainelCriticosAberto(false);
        if (acoesExpandidas) setAcoesExpandidas(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enviando,
    modalInserirAberto,
    painelCriticosAberto,
    acoesExpandidas,
    state.itensPorPosto,
    novoPosto,
    handleEnviar,
  ]);

  if (semPermissao) {
    return (
      <div className="w-full max-w-xl mx-auto my-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900 p-8 shadow-sm">
        <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-950/80 flex items-center justify-center mx-auto text-rose-600 mb-3.5">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Acesso Restrito: Programação — {setor === "estamparia" ? "Estamparia" : "Solda"}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
          Seu perfil de usuário não possui permissão para programar ou enviar lotes para o setor de{" "}
          <strong className="capitalize">{setor}</strong>. Solicite acesso ao administrador do sistema caso necessite dessa permissão.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          {setor === "solda" && podeVerEstamparia && (
            <SafeLink
              to="/programacao/estamparia"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <Factory className="w-4 h-4" />
              <span>Acessar Programação — Estamparia</span>
            </SafeLink>
          )}
          {setor === "estamparia" && podeVerSolda && (
            <SafeLink
              to="/programacao/solda"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <Zap className="w-4 h-4" />
              <span>Acessar Programação — Solda</span>
            </SafeLink>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-6 text-slate-600 dark:text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-slate-600 dark:border-t-slate-400" />
        <p>Carregando sequencia...</p>
      </div>
    );
  }
  if (isError) {
    return (
      <p role="alert" className="m-6 rounded-md bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        Erro ao carregar a sequencia.
      </p>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] px-3 sm:px-4 py-2.5 transition-all duration-150">
      <h1 className="sr-only">
        Programação — {setor === "estamparia" ? "Estamparia" : "Solda"}
      </h1>

      {/* Barra de Controle Compacta e Padronizada (Proporções Fixas em Todas as Visões e Setores) */}
      <div className="mb-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
        {/* Linha 1: Setor, Alternador de Visão (Quadro/Tabela/Linha do Tempo), Densidade e Ações */}
        <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          {/* Esquerda: Setor + Visões + Densidade (Mesmas Posições da Produção) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Alternador Rápido de Setor */}
            <div className="flex items-center h-7 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/80 dark:border-slate-700 text-xs font-semibold">
              {podeVerSolda && (
                <SafeLink
                  to={`/programacao/solda${linhaParam ? `?linha=${encodeURIComponent(linhaParam)}` : ""}`}
                  className={`flex items-center gap-1 h-full px-2.5 rounded-md transition-all ${
                    setor === "solda"
                      ? "bg-emerald-600 text-white shadow-2xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  <span>Solda</span>
                </SafeLink>
              )}
              {podeVerEstamparia && (
                <SafeLink
                  to={`/programacao/estamparia${linhaParam ? `?linha=${encodeURIComponent(linhaParam)}` : ""}`}
                  className={`flex items-center gap-1 h-full px-2.5 rounded-md transition-all ${
                    setor === "estamparia"
                      ? "bg-indigo-600 text-white shadow-2xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <Factory className="w-3 h-3" />
                  <span>Estamparia</span>
                </SafeLink>
              )}
            </div>

            <span className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            {/* Alternador de Visão: Quadro / Tabela / Linha do Tempo */}
            <div className="flex items-center h-7 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/80 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setModoVisao("cards")}
                title="Visualização em Quadro Kanban"
                className={`flex items-center gap-1.5 h-full px-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  modoVisao === "cards"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Quadro</span>
              </button>
              <button
                type="button"
                onClick={() => setModoVisao("tabela")}
                title="Visualização em Tabela Detalhada"
                className={`flex items-center gap-1.5 h-full px-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  modoVisao === "tabela"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <TableProperties className="w-3.5 h-3.5" />
                <span>Tabela</span>
              </button>
              <button
                type="button"
                onClick={() => setModoVisao("timeline")}
                title="Visualização em Linha do Tempo (Seisan Kanriban)"
                className={`flex items-center gap-1.5 h-full px-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  modoVisao === "timeline"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Linha do Tempo</span>
              </button>
            </div>

            {/* Alternador de Densidade dos Cards (Mantém posição fixa em todas as visões) */}
            <button
              type="button"
              disabled={modoVisao !== "cards"}
              onClick={() => setModoCompacto((prev) => !prev)}
              title={
                modoVisao !== "cards"
                  ? "Disponível na visão de Quadro"
                  : modoCompacto
                  ? "Expandir todos os cartões (visão detalhada com estoque)"
                  : "Compactar todos os cartões (visão minimalista)"
              }
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs font-semibold transition-all ${
                modoVisao !== "cards"
                  ? "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 opacity-50 cursor-not-allowed"
                  : modoCompacto
                  ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shadow-2xs cursor-pointer"
                  : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs cursor-pointer"
              }`}
            >
              {modoCompacto ? (
                <>
                  <Maximize2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>Modo Compacto</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3 h-3 text-slate-500" />
                  <span>Modo Detalhado</span>
                </>
              )}
            </button>
          </div>

          {/* Direita: Botões de Ação da Programação */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Botão: + Inserir Card */}
            <button
              type="button"
              onClick={() => {
                const postosDisponiveis = Object.keys(state.itensPorPosto);
                if (postosDisponiveis.length > 0 && !novoPosto) {
                  setNovoPosto(postosDisponiveis[0]);
                }
                setModalInserirAberto(true);
              }}
              title="Adiciona um novo card/peça manualmente à fila de programação deste lote (Ctrl + I)"
              className="flex items-center gap-1.5 h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>+ Inserir Card</span>
              <kbd className="hidden sm:inline-block ml-0.5 px-1 py-0.2 text-[10px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-600">
                Ctrl+I
              </kbd>
            </button>

            {/* Menu Colapsável de Ações Secundárias (Montar Padrão, Atualizar SAP, Sincronizar Excel) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAcoesExpandidas((prev) => !prev)}
                className={`flex items-center gap-1.5 h-7 rounded-lg border px-2.5 text-xs font-semibold shadow-2xs transition-all cursor-pointer ${
                  acoesExpandidas
                    ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300"
                    : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
                title="Expandir ações de dados (Montar Padrão, Atualizar SAP, Sincronizar Excel)"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Mais Ações</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    acoesExpandidas ? "rotate-180" : ""
                  }`}
                />
              </button>

              {acoesExpandidas && (
                <div
                  className="absolute right-0 top-full mt-1.5 z-40 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAcoesExpandidas(false);
                      handleMontarPadrao();
                    }}
                    disabled={isLoading || enviando}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-semibold block text-slate-900 dark:text-slate-100">Montar Padrão</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Restaura receita original do Patan</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAcoesExpandidas(false);
                      handleAtualizarSap();
                    }}
                    disabled={atualizandoSap || sincronizando || enviando}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {atualizandoSap ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600 shrink-0" />
                    ) : (
                      <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    )}
                    <div>
                      <span className="font-semibold block text-slate-900 dark:text-slate-100">Atualizar SAP</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Extração direta da API do SAP</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAcoesExpandidas(false);
                      handleSincronizarEstoqueMb52();
                    }}
                    disabled={sincronizandoEstoque || atualizandoSap || sincronizando || enviando}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {sincronizandoEstoque ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600 shrink-0" />
                    ) : (
                      <Boxes className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    )}
                    <div>
                      <span className="font-semibold block text-slate-900 dark:text-slate-100">Sincronizar Estoque MB52</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Atualiza saldos reais (estoque.xlsx)</span>
                    </div>
                  </button>

                  <label
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    <div>
                      <span className="font-semibold block text-slate-900 dark:text-slate-100">Subir estoque.xlsx (MB52)</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Carregar novo arquivo MB52</span>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setAcoesExpandidas(false);
                          handleUploadEstoqueMb52(file);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setAcoesExpandidas(false);
                      handleSincronizar();
                    }}
                    disabled={sincronizandoEstoque || atualizandoSap || sincronizando || enviando}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {sincronizando ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600 shrink-0" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    )}
                    <div>
                      <span className="font-semibold block text-slate-900 dark:text-slate-100">Sincronizar Excel</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Importa do AutomacaoPlanner.xlsx</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Botão de Gatilho do Drawer de Críticos */}
            <button
              type="button"
              onClick={() => setPainelCriticosAberto(true)}
              title="Abrir gaveta de peças críticas e quarentena (Ctrl + K)"
              className={`relative flex items-center gap-1.5 h-7 rounded-lg border px-2.5 text-xs font-semibold shadow-2xs transition-all cursor-pointer ${
                criticosConsolidados.length > 0
                  ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20"
                  : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              {criticosConsolidados.length > 0 && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
                </span>
              )}
              <span>Itens Críticos ({criticosConsolidados.length})</span>
              {criticosIncluidos.size > 0 && (
                <span className="rounded-full bg-red-200 dark:bg-red-500/30 px-1.5 py-0.2 text-[10px] font-bold text-red-800 dark:text-red-300">
                  {criticosIncluidos.size}
                </span>
              )}
              <kbd className="hidden sm:inline-block ml-0.5 px-1 py-0.2 text-[10px] font-mono bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                Ctrl+K
              </kbd>
            </button>

            {/* Botão Enviar Lote no Topo (Único e oficial) */}
            <button
              type="button"
              data-testid="btn-enviar-lote"
              onClick={handleEnviar}
              disabled={enviando}
              title="Enviar lote persistido para o chão de fábrica (Ctrl + Enter)"
              className="flex items-center gap-1.5 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{enviando ? "Enviando..." : "Enviar lote"}</span>
              <kbd className="hidden sm:inline-block ml-0.5 px-1 py-0.2 text-[10px] font-mono bg-emerald-700 text-emerald-100 rounded">
                Ctrl+Enter
              </kbd>
            </button>
          </div>
        </div>

        {/* Linha 2: Escopo do Lote (Linha, Turno, Patan, Data, Continuidade) e Modo de Dimensionamento */}
        <div className="px-3 py-1.5 bg-slate-50/70 dark:bg-slate-900/50 rounded-b-xl flex flex-wrap items-center justify-between gap-2">
          {/* Esquerda: Filtros de Escopo */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Linha</span>
              <select
                aria-label="Linha"
                value={linha}
                onChange={(event) => handleLinhaChange(event.target.value)}
                className="h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
              >
                {linhasDisponiveis.map((item) => (
                  <option key={item.valor} value={item.valor}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Turno</span>
              <select
                aria-label="Turno"
                value={turno}
                onChange={(event) => setTurno(Number(event.target.value))}
                className="h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono cursor-pointer shadow-2xs"
              >
                {[1, 2, 3].map((t) => {
                  const ocorrencias = resumoPatans?.[patan];
                  const noTurno =
                    ocorrencias?.find((o: ResumoPatanInfo) => o.linha === linha && o.turno === t)
                      ?.total ?? 0;
                  return (
                    <option key={t} value={t}>
                      {t}º Turno{noTurno > 0 ? ` (${noTurno} it.)` : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Patan</span>
              <select
                aria-label="Patan"
                value={patan}
                onChange={(event) => handlePatanChange(event.target.value)}
                className="h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono cursor-pointer shadow-2xs"
              >
                {patansDisponiveis.map((letra) => {
                  const ocorrencias = resumoPatans?.[letra];
                  const total = ocorrencias
                    ? ocorrencias.reduce((acc: number, curr: ResumoPatanInfo) => acc + curr.total, 0)
                    : 0;
                  const turnoInfo =
                    ocorrencias && ocorrencias.length === 1 ? ` (${ocorrencias[0].turno}ºT)` : "";
                  return (
                    <option key={letra} value={letra}>
                      Patan {letra}{total > 0 ? `${turnoInfo} • ${total} it.` : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Data</span>
              <div className="flex items-center gap-0.5 h-7 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 px-1.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleNavegarDiaProgramacao(-1)}
                  title="Dia anterior"
                  className="px-1 py-0.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded text-[11px] cursor-pointer font-bold"
                >
                  ◀
                </button>
                <input
                  type="date"
                  value={dataProgramacao}
                  onChange={(e) => e.target.value && handleDataProgramacaoChange(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                  title="Escolha o dia da programação"
                />
                <button
                  type="button"
                  onClick={() => handleNavegarDiaProgramacao(1)}
                  title="Próximo dia"
                  className="px-1 py-0.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded text-[11px] cursor-pointer font-bold"
                >
                  ▶
                </button>
                {dataProgramacao !== getHojeLocalIso() && (
                  <button
                    type="button"
                    onClick={() => handleDataProgramacaoChange(getHojeLocalIso())}
                    className="px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded transition-colors cursor-pointer"
                    title="Retornar para o dia de hoje"
                  >
                    Hoje
                  </button>
                )}
              </div>
            </label>

            <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            {/* Opção Selecionável: Continuar a partir do último item ativo em produção */}
            <label
              title="Quando ativado, os horários das ordens deste lote começam logo após o término do último item ativo na fábrica em cada posto (em vez do horário fixo do turno)."
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
                continuarAposProducao
                  ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 shadow-2xs font-bold"
                  : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              <input
                type="checkbox"
                checked={continuarAposProducao}
                onChange={(e) => handleToggleContinuarAposProducao(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>⚡ Continuar após produção ativa</span>
            </label>
          </div>

          {/* Direita: Alternador dos 2 Modos de Dimensionamento (Lote Fixo vs Estoque Máximo) */}
          <div className="flex items-center h-7 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/80 dark:border-slate-700 shadow-2xs">
            <button
              type="button"
              aria-label="Lote Fixo (Patan)"
              onClick={() => handleTrocarModo("PATAN_FIXO")}
              title="Programar conforme o Lote Fixo oficial do Patan (demanda padrão / embalagem)"
              className={`flex items-center gap-1.5 h-full px-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                modoDimensionamento === "PATAN_FIXO"
                  ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <span>🎯 Lote Fixo (Patan)</span>
            </button>
            <button
              type="button"
              aria-label="Estoque Máximo (Carga Máq.)"
              onClick={() => handleTrocarModo("ESTOQUE_MAXIMO")}
              title="Programar conforme Carga Máquina / Estoque Máximo (kanban_max)"
              className={`flex items-center gap-1.5 h-full px-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                modoDimensionamento === "ESTOQUE_MAXIMO"
                  ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <span>📊 Estoque Máximo (Carga Máq.)</span>
            </button>
          </div>
        </div>

        {/* Informações adicionais / feedback de sincronização */}
        {importResult && (
          <div className="mx-3 mb-2 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
            <span>✓</span>
            <span>{importResult.total_importados} itens processados e sincronizados com sucesso.</span>
          </div>
        )}
      </div>

      {/* Pop-up / Drawer Lateral de Críticos com Filtro por Posto e Ordenação por Criticidade */}
      {painelCriticosAberto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setPainelCriticosAberto(false)}
          />

          <div className="relative z-50 flex h-full w-full md:max-w-lg flex-col bg-white dark:bg-slate-900 shadow-2xl md:border-l border-slate-200 dark:border-slate-800">
            {/* Cabeçalho do Drawer */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-red-50/95 dark:bg-red-500/10 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 dark:bg-red-500 text-xs font-bold text-white shadow-xs">
                    !
                  </span>
                  <h2 className="text-base font-bold text-red-950 dark:text-red-300">
                    Itens Críticos ({linha})
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-red-700 dark:text-red-400 font-medium">
                  {criticosConsolidados.length} materiais críticos na linha • Patan atual:{" "}
                  <strong className="underline">{patan}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPainelCriticosAberto(false)}
                className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                aria-label="Fechar painel"
              >
                ✕
              </button>
            </div>

            {/* Barra de Controles: Filtro de Posto, Ordenação e Busca */}
            <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Filtro por Posto
                  <select
                    value={filtroPosto}
                    onChange={(e) => setFiltroPosto(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-500 focus:outline-none"
                  >
                    <option value="TODOS">Todos os postos ({criticosConsolidados.length})</option>
                    {postosComCriticos.map((p) => {
                      const count = criticosConsolidados.filter(
                        (c) => c.posto_trabalho === p
                      ).length;
                      return (
                        <option key={p} value={p}>
                          Posto {p} ({count})
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ordenar por (Order By)
                  <select
                    value={criterioOrdenacao}
                    onChange={(e) => setCriterioOrdenacao(e.target.value as CriterioOrdenacao)}
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-500 focus:outline-none"
                  >
                    <option value="CRITICIDADE">★ Mais Crítico (Ciclo Patan + Falta)</option>
                    <option value="DIAS_DESC">Dias s/ produzir (Maior p/ Menor)</option>
                    <option value="SALDO_ASC">Menor Estoque Livre (MB52)</option>
                    <option value="FALTA_DESC">Maior Falta de Estoque</option>
                    <option value="POSTO">Posto de Trabalho (A-Z)</option>
                    <option value="MATERIAL">Material (A-Z)</option>
                  </select>
                </label>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Filtrar por material ou posto..."
                  value={filtroBusca}
                  onChange={(e) => setFiltroBusca(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
                <span>
                  Exibindo <strong>{criticosFiltradosEOrdenados.length}</strong> de{" "}
                  {criticosConsolidados.length} materiais críticos
                </span>
                {criticosIncluidos.size > 0 && (
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {criticosIncluidos.size} selecionado(s) para o lote
                  </span>
                )}
              </div>
            </div>

            {/* Lista Rolável de Itens Críticos */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {criticosFiltradosEOrdenados.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  Nenhum item crítico encontrado com os filtros aplicados.
                </div>
              ) : (
                criticosFiltradosEOrdenados.map((itemCritico) => {
                  const id = itemCritico.itemPrincipal.id as number;
                  const incluido = criticosIncluidos.has(id);
                  const diasAteProd = itemCritico.diasAteProximaProducao;
                  const item = itemCritico.itemPrincipal;
                  const qtdCx = Math.max(1, item.qtd_por_kanban || 1);

                  // Destaque semafórico dos dias até a próxima produção (Regra de Negócio do Ciclo Patan)
                  let badgeDiasClasses =
                    "border-red-300 dark:border-red-500/30 bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300 font-bold";
                  let badgeDiasTexto = `🔴 Próx. prod. em ${diasAteProd} dias`;
                  if (diasAteProd <= 2) {
                    badgeDiasClasses =
                      "border-emerald-300 dark:border-emerald-500/30 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-medium";
                    badgeDiasTexto = `🟢 Próx. prod. em ${diasAteProd} dia(s)`;
                  } else if (diasAteProd <= 4) {
                    badgeDiasClasses =
                      "border-amber-300 dark:border-amber-500/30 bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-semibold";
                    badgeDiasTexto = `🟡 Próx. prod. em ${diasAteProd} dias`;
                  }

                  return (
                    <div
                      key={itemCritico.chave}
                      className={`rounded-lg border p-3.5 transition-all shadow-xs ${
                        incluido
                          ? "border-emerald-300 dark:border-emerald-500/50 bg-emerald-50/40 dark:bg-emerald-900/20 ring-1 ring-emerald-300 dark:ring-emerald-500/50"
                          : "border-red-200 dark:border-red-500/20 bg-white dark:bg-slate-800 hover:border-red-300 dark:hover:border-red-500/50"
                      }`}
                    >
                      {/* Topo do Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              {itemCritico.material || itemCritico.posto_trabalho}
                            </span>
                            <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                              Posto {itemCritico.posto_trabalho}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[11px] ${badgeDiasClasses}`}
                            >
                              {badgeDiasTexto}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Patans:{" "}
                              <strong className="text-slate-700 dark:text-slate-300">
                                {itemCritico.patans.join(", ")}
                              </strong>
                              {itemCritico.dias_prod && (
                                <span> (ciclo {itemCritico.dias_prod}d)</span>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Checkbox de Inclusão Rápida */}
                        <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                          <input
                            type="checkbox"
                            checked={incluido}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              if (checked) {
                                const itemParaIncluir: ItemProducao = {
                                  ...item,
                                  linha,
                                  turno,
                                  patan,
                                  status: PlanItemStatus.Normal,
                                  is_critico: true,
                                  sequencia: 0,
                                };
                                dispatch({ type: "INCLUIR_ITEM", payload: { item: itemParaIncluir } });
                                setCriticosIncluidos((prev) => new Set(prev).add(id));
                              } else {
                                dispatch({
                                  type: "REMOVER_ITEM",
                                  payload: { posto: item.posto_trabalho, chave: String(id) },
                                });
                                setCriticosIncluidos((prev) => {
                                  const next = new Set(prev);
                                  next.delete(id);
                                  return next;
                                });
                              }
                            }}
                            className="h-4 w-4 rounded border-red-300 dark:border-red-600 text-red-600 dark:text-red-500 focus:ring-red-500 bg-white dark:bg-slate-900"
                          />
                          <span className="text-[11px] font-medium">
                            {incluido ? "No lote" : "Incluir"}
                          </span>
                        </label>
                      </div>

                      {/* Grade de Informações de Estoque (Máximo, Mínimo/Segurança, MB52) */}
                      <div className="mt-2.5 space-y-1 rounded bg-slate-50 dark:bg-slate-900/50 p-2.5 text-xs border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 dark:text-slate-400">Estoque Livre (MB52):</span>
                          <span
                            className={`font-bold ${
                              itemCritico.saldo_estoque <= 0
                                ? "text-red-700 dark:text-red-400"
                                : itemCritico.temFaltaSeguranca
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-slate-900 dark:text-slate-200"
                            }`}
                          >
                            {itemCritico.saldo_estoque.toLocaleString("pt-BR")} pçs
                            {itemCritico.saldo_estoque <= 0 && " (ZERADO)"}
                          </span>
                        </div>

                        {itemCritico.kanban_min != null && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 dark:text-slate-400">Mínimo (Segurança):</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-300">
                              {itemCritico.kanban_min} cx (
                              {(itemCritico.kanban_min * qtdCx).toLocaleString("pt-BR")} pçs)
                            </span>
                          </div>
                        )}

                        {itemCritico.kanban_max != null && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 dark:text-slate-400">Máximo:</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {itemCritico.kanban_max} cx (
                              {(itemCritico.kanban_max * qtdCx).toLocaleString("pt-BR")} pçs)
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between items-center border-t border-slate-200/60 dark:border-slate-800/60 pt-1">
                          <span className="text-slate-500 dark:text-slate-400">Qtd / Caixa:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{qtdCx} pçs/cx</span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 dark:text-slate-400">Lote Crítico:</span>
                          <span className="font-bold text-slate-900 dark:text-slate-200">
                            {item.kanbans} cx ({(item.kanbans * qtdCx).toLocaleString("pt-BR")}{" "}
                            pçs)
                          </span>
                        </div>
                      </div>

                      {/* Botão de Ação */}
                      {incluido ? (
                        <div className="mt-2.5 flex items-center justify-between rounded bg-emerald-100/70 dark:bg-emerald-900/30 px-2.5 py-1.5 text-xs text-emerald-800 dark:text-emerald-400">
                          <span className="font-semibold">
                            ✓ Incluído no Posto {item.posto_trabalho}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              dispatch({
                                type: "REMOVER_ITEM",
                                payload: { posto: item.posto_trabalho, chave: String(id) },
                              });
                              setCriticosIncluidos((prev) => {
                                const next = new Set(prev);
                                next.delete(id);
                                return next;
                              });
                            }}
                            className="text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline"
                          >
                            Retirar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const itemParaIncluir: ItemProducao = {
                              ...item,
                              linha,
                              turno,
                              patan,
                              status: PlanItemStatus.Normal,
                              is_critico: true,
                              sequencia: 0,
                            };
                            dispatch({ type: "INCLUIR_ITEM", payload: { item: itemParaIncluir } });
                            setCriticosIncluidos((prev) => new Set(prev).add(id));
                          }}
                          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md bg-red-600 dark:bg-red-500 px-3 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-red-700 dark:hover:bg-red-600 active:scale-[0.98]"
                        >
                          <span className="text-base font-black leading-none">+</span>
                          <span>Incluir no Posto {item.posto_trabalho}</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Rodapé do Drawer */}
            <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-4">
              <button
                type="button"
                onClick={() => setPainelCriticosAberto(false)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600"
              >
                Concluir seleção ({criticosIncluidos.size} no lote)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Inserir Card na Fila de Programação */}
      {modalInserirAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setModalInserirAberto(false)}
          />
          <div className="relative z-50 w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Inserir Card na Programação</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalInserirAberto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleInserirCard} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Posto de Trabalho *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: SB6A ou PRENSA 01"
                  value={novoPosto}
                  onChange={(e) => setNovoPosto(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Código do Material / Peça *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 5X0803701"
                  value={novoMaterial}
                  onChange={(e) => setNovoMaterial(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Kanbans (Caixas) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={novosKanbans}
                    onChange={(e) => setNovosKanbans(Math.max(1, Number(e.target.value)))}
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Qtd por Caixa *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={novaQtdPorKanban}
                    onChange={(e) => setNovaQtdPorKanban(Math.max(1, Number(e.target.value)))}
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tempo / Pç (min)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={novoTempoPorPeca}
                    onChange={(e) => setNovoTempoPorPeca(Math.max(0.01, Number(e.target.value)))}
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Lote Patan (Pçs)
                  </label>
                  <input
                    type="number"
                    placeholder="Opcional"
                    value={novaDemanda}
                    onChange={(e) => setNovaDemanda(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Kanban Máx (cx)
                  </label>
                  <input
                    type="number"
                    placeholder="Opcional"
                    value={novoKanbanMax}
                    onChange={(e) => setNovoKanbanMax(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalInserirAberto(false)}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Adicionar à Fila
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Estado Vazio com Sugestões Inteligentes de Turnos/Linhas */}
      {Object.values(state.itensPorPosto).flat().length === 0 && !isLoading && (
        <div className="mb-4 flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 shadow-2xs">
          <span className="text-3xl mb-2">📋</span>
          <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200">
            Nenhuma ordem encontrada para {linha} • {turno}º Turno no Patan {patan}
          </h4>
          {data?.sugestoes_outros_turnos && data.sugestoes_outros_turnos.length > 0 ? (
            <div className="mt-3 flex flex-col items-center gap-2 max-w-lg">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                O Patan <strong className="font-mono text-slate-800 dark:text-slate-200">{patan}</strong> possui programações cadastradas em outros turnos/linhas da fábrica:
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                {data.sugestoes_outros_turnos.map((sug) => (
                  <button
                    key={`${sug.linha}-${sug.turno}`}
                    type="button"
                    onClick={() => {
                      handleLinhaChange(sug.linha);
                      setTurno(sug.turno);
                      toast.info(`Alternado para ${sug.linha} • ${sug.turno}º Turno!`);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors shadow-2xs cursor-pointer active:scale-95"
                  >
                    <span>👉 Alternar para {sug.linha} • {sug.turno}º Turno</span>
                    <span className="text-[10px] bg-indigo-200 dark:bg-indigo-800 px-1.5 py-0.2 rounded font-mono font-bold">
                      {sug.total} itens
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500 max-w-md">
              Não há itens cadastrados para este Patan neste setor. Utilize o botão <strong>"+ Inserir Card"</strong> acima para montar uma fila manual ou sincronize a planilha oficial.
            </p>
          )}
        </div>
      )}

      {/* Visualização de Programação: Quadro Kanban vs Tabela vs Linha do Tempo */}
      {modoVisao === "cards" ? (
        <SequenciaBoard
          itensPorPosto={state.itensPorPosto}
          onReordenar={(posto, itens) => dispatch({ type: "REORDENAR", payload: { posto, itens } })}
          onAjustarKanban={(posto, chave, delta) =>
            dispatch({ type: "AJUSTAR_KANBAN", payload: { posto, chave, delta } })
          }
          onDefinirKanban={(posto, chave, kanbans) =>
            dispatch({ type: "DEFINIR_KANBAN", payload: { posto, chave, kanbans } })
          }
          itensCriticosIncluidos={criticosIncluidos}
          exibirEstoque={true}
          limiteLoteCurtoMinutos={limiteLoteCurtoMinutos}
          limiteLoteCurtoSoldaMinutos={limiteLoteCurtoSoldaMinutos}
          onAlternarCriticoIncluido={(itemId, incluido) => {
            if (incluido) {
              setCriticosIncluidos((prev) => new Set(prev).add(itemId));
            } else {
              setCriticosIncluidos((prev) => {
                const next = new Set(prev);
                next.delete(itemId);
                return next;
              });
            }
          }}
          onRemoverItem={(posto, chave) => {
            setItensRemovidos((prev) => new Set(prev).add(chave));
            dispatch({ type: "REMOVER_ITEM", payload: { posto, chave } });
            const itemId = Number(chave);
            if (!Number.isNaN(itemId)) {
              setCriticosIncluidos((prev) => {
                if (!prev.has(itemId)) return prev;
                const next = new Set(prev);
                next.delete(itemId);
                return next;
              });
            }
            toast.info("Card retirado da fila deste lote. Cascata recalculada.");
          }}
          materiaisBloqueados={materiaisBloqueados}
          modoCompacto={modoCompacto}
          modoEdicao={true}
          onSolicitarEditarItem={(item) => setItemParaEditar(item)}
        />
      ) : modoVisao === "tabela" ? (
        <div className="w-full space-y-2.5">
          {/* Barra compacta de busca e filtro por posto na Tabela de Programação */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <input
                type="text"
                value={buscaTabelaProg}
                onChange={(e) => setBuscaTabelaProg(e.target.value)}
                placeholder="Buscar por peça ou posto..."
                className="h-7 min-w-[220px] max-w-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>Posto</span>
                <select
                  value={postoTabelaProg}
                  onChange={(e) => setPostoTabelaProg(e.target.value)}
                  className="h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="TODOS">Todos ({Object.keys(state.itensPorPosto).length})</option>
                  {Object.keys(state.itensPorPosto)
                    .sort()
                    .map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {Object.values(state.itensPorPosto).flat().length} itens no lote
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-2 px-3">Seq</th>
                  <th className="py-2 px-3">Posto</th>
                  <th className="py-2 px-3">Peça / Material</th>
                  <th className="py-2 px-3 text-center">Kanbans</th>
                  <th className="py-2 px-3 text-right">Total Pçs</th>
                  <th className="py-2 px-3 text-right">Saldo Estoque</th>
                  <th className="py-2 px-3">Janela Planejada</th>
                  <th className="py-2 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {Object.entries(state.itensPorPosto)
                  .filter(([posto]) => postoTabelaProg === "TODOS" || posto === postoTabelaProg)
                  .flatMap(([, itens]) => itens)
                  .filter((it) => {
                    const q = buscaTabelaProg.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      (it.material?.toLowerCase().includes(q) ?? false) ||
                      it.posto_trabalho.toLowerCase().includes(q)
                    );
                  })
                  .map((it) => {
                    const chave = String(it.id ?? `novo-${it.sequencia}`);
                    const totalPecas = it.kanbans * it.qtd_por_kanban;
                    const horaIni = it.hora_inicial
                      ? new Date(it.hora_inicial).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--";
                    const horaFim = it.hora_final
                      ? new Date(it.hora_final).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--";
                    return (
                      <tr
                        key={`${it.posto_trabalho}-${chave}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2 px-3 font-mono font-bold text-slate-600 dark:text-slate-400">
                          #{it.sequencia}
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {it.posto_trabalho}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {it.material || "—"}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                dispatch({
                                  type: "AJUSTAR_KANBAN",
                                  payload: { posto: it.posto_trabalho, chave, delta: -1 },
                                })
                              }
                              className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              -
                            </button>
                            <span className="font-mono font-bold min-w-[28px] text-center">
                              {it.kanbans}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                dispatch({
                                  type: "AJUSTAR_KANBAN",
                                  payload: { posto: it.posto_trabalho, chave, delta: 1 },
                                })
                              }
                              className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">
                          {totalPecas.toLocaleString("pt-BR")}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-mono font-semibold ${
                            it.tem_falta_estoque
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {(it.saldo_estoque ?? 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">
                          {horaIni} - {horaFim}
                          {it.almoco_incluso && (
                            <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                              🍽️
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setItemParaEditar(it)}
                              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold cursor-pointer"
                            >
                              ✏️ Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setItensRemovidos((prev) => new Set(prev).add(chave));
                                dispatch({
                                  type: "REMOVER_ITEM",
                                  payload: { posto: it.posto_trabalho, chave },
                                });
                              }}
                              className="px-2 py-1 rounded border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-semibold cursor-pointer"
                            >
                              Retirar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ProgramacaoTimelineView
          itensPorPosto={state.itensPorPosto}
          turno={turno}
          onAjustarKanban={(posto, chave, delta) =>
            dispatch({ type: "AJUSTAR_KANBAN", payload: { posto, chave, delta } })
          }
          onReordenar={(posto, itens) =>
            dispatch({ type: "REORDENAR", payload: { posto, itens } })
          }
          onRemoverItem={(posto, chave) => {
            setItensRemovidos((prev) => new Set(prev).add(chave));
            dispatch({ type: "REMOVER_ITEM", payload: { posto, chave } });
            const itemId = Number(chave);
            if (!Number.isNaN(itemId)) {
              setCriticosIncluidos((prev) => {
                if (!prev.has(itemId)) return prev;
                const next = new Set(prev);
                next.delete(itemId);
                return next;
              });
            }
            toast.info("Card retirado da fila deste lote. Cascata recalculada.");
          }}
          materiaisBloqueados={materiaisBloqueados}
          horariosConfig={horariosConfig}
          onSolicitarEditarItem={(item) => setItemParaEditar(item)}
        />
      )}

      {/* Modal de Edição Direta de Card na Programação com Sincronia em Cadeia */}
      {itemParaEditar && (
        <EditarCardProgramacaoModal
          item={itemParaEditar}
          onClose={() => setItemParaEditar(null)}
          onSalvar={(dados) => {
            dispatch({
              type: "EDITAR_ITEM",
              payload: {
                posto: itemParaEditar.posto_trabalho,
                chave: String(itemParaEditar.id ?? `novo-${itemParaEditar.sequencia}`),
                ...dados,
              },
            });
            toast.success("Card atualizado! Cascata e produção em linha recalculadas em cadeia.");
          }}
          onRemover={(removerTandem) => {
            const chave = String(itemParaEditar.id ?? `novo-${itemParaEditar.sequencia}`);
            setItensRemovidos((prev) => new Set(prev).add(chave));
            dispatch({
              type: "REMOVER_ITEM",
              payload: {
                posto: itemParaEditar.posto_trabalho,
                chave,
                removerTandem,
              },
            });
            const itemId = Number(chave);
            if (!Number.isNaN(itemId)) {
              setCriticosIncluidos((prev) => {
                if (!prev.has(itemId)) return prev;
                const next = new Set(prev);
                next.delete(itemId);
                return next;
              });
            }
            setItemParaEditar(null);
            toast.info("Card retirado da fila deste lote. Cascata recalculada em cadeia.");
          }}
        />
      )}

      {Object.values(state.itensPorPosto)
        .flat()
        .some((it) => it.material && isMaterialBloqueado(it.material, materiaisBloqueados)) && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-300 font-medium">
          <span>⛔</span>
          <span>
            Existem ferramentas com manutenção pendente na <strong>Ferramentaria</strong> presentes neste lote. O envio está bloqueado até a liberação das ferramentas.
          </span>
        </div>
      )}

      {erro && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}
    </div>
  );
}
