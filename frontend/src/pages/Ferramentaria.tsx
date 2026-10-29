import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Wrench,
  CalendarCheck,
  AlertTriangle,
  Clock,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import {
  abrirPreventivaCatalogo,
  atualizarFerramentaCatalogo,
  atualizarStatusManutencao,
  criarFerramentaCatalogo,
  criarManutencao,
  getCatalogo,
  getManutencoes,
  removerFerramentaCatalogo,
} from "../services/api/ferramentaria";
import type {
  CatalogoFerramenta,
  CatalogoFerramentaCreate,
  ManutencaoCreate,
  ManutencaoFerramenta,
  ManutencaoUpdateStatus,
  StatusFerramenta,
} from "../types/ferramentaria";
import { LINHAS_DISPONIVEIS } from "../types/producao";

const STATUS_COLUNAS: {
  id: StatusFerramenta;
  titulo: string;
  badgeCor: string;
  bordaCor: string;
  bgHeader: string;
  icone: string;
}[] = [
  {
    id: "aguardando_manutencao",
    titulo: "Aguardando Manutenção (Corretiva)",
    badgeCor: "bg-red-500/20 text-red-700 dark:text-red-400 border border-red-500/30",
    bordaCor: "border-red-200 dark:border-red-900/40",
    bgHeader: "bg-red-50/80 dark:bg-red-950/20",
    icone: "🔴",
  },
  {
    id: "aguardando_preventiva",
    titulo: "Aguardando Manutenção (Preventiva)",
    badgeCor: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30",
    bordaCor: "border-amber-200 dark:border-amber-900/40",
    bgHeader: "bg-amber-50/80 dark:bg-amber-950/20",
    icone: "🟠",
  },
  {
    id: "em_manutencao",
    titulo: "Em Manutenção",
    badgeCor: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30",
    bordaCor: "border-yellow-200 dark:border-yellow-900/40",
    bgHeader: "bg-yellow-50/80 dark:bg-yellow-950/20",
    icone: "🟡",
  },
  {
    id: "aguardando_tryout",
    titulo: "Aguardando Tryout",
    badgeCor: "bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-500/30",
    bordaCor: "border-purple-200 dark:border-purple-900/40",
    bgHeader: "bg-purple-50/80 dark:bg-purple-950/20",
    icone: "🟣",
  },
  {
    id: "tryout",
    titulo: "Tryout / Testes",
    badgeCor: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-500/30",
    bordaCor: "border-blue-200 dark:border-blue-900/40",
    bgHeader: "bg-blue-50/80 dark:bg-blue-950/20",
    icone: "🔵",
  },
  {
    id: "disponivel",
    titulo: "Liberadas (OK / Disponível)",
    badgeCor: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30",
    bordaCor: "border-emerald-200 dark:border-emerald-900/40",
    bgHeader: "bg-emerald-50/80 dark:bg-emerald-950/20",
    icone: "🟢",
  },
];

export function Ferramentaria() {
  const { token, role } = useAuth();
  const queryClient = useQueryClient();

  const [abaAtiva, setAbaAtiva] = useState<"kanban" | "catalogo">("kanban");
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroLinha, setFiltroLinha] = useState("TODAS");
  const [filtroStatusPreventiva, setFiltroStatusPreventiva] = useState("TODOS");
  const [filtroSetor, setFiltroSetor] = useState("TODOS");

  // Modais do Kanban
  const [modalNovaOrdemAberta, setModalNovaOrdemAberta] = useState(false);
  const [modalLiberarItem, setModalLiberarItem] = useState<ManutencaoFerramenta | null>(null);
  const [obsLiberacao, setObsLiberacao] = useState("");

  // Modal de Agendamento de Tryout (Exclusivo Programador Ferramentaria / Admin)
  const [modalAgendarTryoutItem, setModalAgendarTryoutItem] = useState<ManutencaoFerramenta | null>(null);
  const [tryoutSetor, setTryoutSetor] = useState<"estamparia" | "solda">("estamparia");
  const [tryoutPrensa, setTryoutPrensa] = useState("");
  const [tryoutFerramenta, setTryoutFerramenta] = useState("");
  const [tryoutInicio, setTryoutInicio] = useState("");
  const [tryoutFim, setTryoutFim] = useState("");
  const [tryoutObs, setTryoutObs] = useState("");

  // Formulário de Nova Ordem
  const [formMaterial, setFormMaterial] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formLinha, setFormLinha] = useState<string>(LINHAS_DISPONIVEIS[0].valor);
  const [formPosto, setFormPosto] = useState("");
  const [formTipoOrdem, setFormTipoOrdem] = useState<"corretiva" | "preventiva">("corretiva");
  const [formMotivo, setFormMotivo] = useState("");
  const [formPecas, setFormPecas] = useState(0);
  const [formObs, setFormObs] = useState("");

  // Modais do Catálogo
  const [modalNovaFerramentaAberta, setModalNovaFerramentaAberta] = useState(false);
  const [ferramentaEmEdicao, setFerramentaEmEdicao] = useState<CatalogoFerramenta | null>(null);
  const [catCodigo, setCatCodigo] = useState("");
  const [catDescricao, setCatDescricao] = useState("");
  const [catSetor, setCatSetor] = useState("estamparia");
  const [catLinha, setCatLinha] = useState<string>(LINHAS_DISPONIVEIS[0].valor);
  const [catPosto, setCatPosto] = useState("");
  const [catPeriodicidade, setCatPeriodicidade] = useState(30);
  const [catUltimaManutencao, setCatUltimaManutencao] = useState("");
  const [catObservacoes, setCatObservacoes] = useState("");

  const podeGerenciar =
    role === "admin" ||
    role === "programador_ferramentaria" ||
    role === "programador";

  const isProgramadorFerramentaria =
    role === "admin" || role === "programador_ferramentaria";

  // Queries
  const { data: manutençoes = [], isLoading: isLoadingKanban } = useQuery({
    queryKey: ["ferramentaria-manutencoes"],
    queryFn: () => getManutencoes(token as string),
    enabled: Boolean(token),
  });

  const { data: catalogo = [], isLoading: isLoadingCatalogo } = useQuery({
    queryKey: ["ferramentaria-catalogo"],
    queryFn: () => getCatalogo(token as string),
    enabled: Boolean(token),
  });

  // Mutations
  const statusMutation = useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: number;
    } & ManutencaoUpdateStatus) => atualizarStatusManutencao(token as string, id, payload),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ["ferramentaria-manutencoes"] });
      queryClient.invalidateQueries({ queryKey: ["ferramentaria-catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["materiais-bloqueados"] });
      queryClient.invalidateQueries({ queryKey: ["tabela-b-producao"] });
      if (item.status === "disponivel") {
        toast.success(`Ferramenta ${item.material} liberada com sucesso! Desbloqueada no Patan.`);
      } else if (item.status === "tryout") {
        toast.success(`Ferramenta ${item.material} enviada para Tryout na prensa ${item.tryout_prensa || "definida"}!`);
      } else if (item.status === "aguardando_tryout") {
        toast.success(`Ferramenta ${item.material} movida para Aguardando Tryout!`);
      } else {
        toast.success(`Status da ferramenta atualizado para: ${item.status}`);
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || "Falha ao atualizar status da ferramenta.");
    },
  });

  const criarMutation = useMutation({
    mutationFn: (payload: ManutencaoCreate) => criarManutencao(token as string, payload),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ["ferramentaria-manutencoes"] });
      queryClient.invalidateQueries({ queryKey: ["materiais-bloqueados"] });
      toast.success(`Ordem de manutenção aberta para ${item.material}!`);
      setModalNovaOrdemAberta(false);
      limparFormOrdem();
    },
    onError: () => {
      toast.error("Falha ao cadastrar ordem de manutenção.");
    },
  });

  const abrirPreventivaMutation = useMutation({
    mutationFn: (id: number) => abrirPreventivaCatalogo(token as string, id),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ["ferramentaria-manutencoes"] });
      queryClient.invalidateQueries({ queryKey: ["ferramentaria-catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["materiais-bloqueados"] });
      toast.success(`Manutenção preventiva aberta para a ferramenta ${item.material}!`);
    },
    onError: () => {
      toast.error("Falha ao abrir manutenção preventiva.");
    },
  });

  const salvarFerramentaMutation = useMutation({
    mutationFn: (payload: CatalogoFerramentaCreate) =>
      ferramentaEmEdicao
        ? atualizarFerramentaCatalogo(token as string, ferramentaEmEdicao.id, payload)
        : criarFerramentaCatalogo(token as string, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ferramentaria-catalogo"] });
      toast.success(
        ferramentaEmEdicao
          ? "Ferramenta atualizada com sucesso!"
          : "Nova ferramenta cadastrada no catálogo!"
      );
      setModalNovaFerramentaAberta(false);
      setFerramentaEmEdicao(null);
      limparFormCatalogo();
    },
    onError: () => {
      toast.error("Falha ao salvar ferramenta no catálogo.");
    },
  });

  const removerFerramentaMutation = useMutation({
    mutationFn: (id: number) => removerFerramentaCatalogo(token as string, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ferramentaria-catalogo"] });
      toast.success("Ferramenta removida do catálogo.");
    },
    onError: () => {
      toast.error("Falha ao remover ferramenta do catálogo.");
    },
  });

  function limparFormOrdem() {
    setFormMaterial("");
    setFormDescricao("");
    setFormLinha(LINHAS_DISPONIVEIS[0].valor);
    setFormPosto("");
    setFormTipoOrdem("corretiva");
    setFormMotivo("");
    setFormPecas(0);
    setFormObs("");
  }

  function limparFormCatalogo() {
    setCatCodigo("");
    setCatDescricao("");
    setCatSetor("estamparia");
    setCatLinha(LINHAS_DISPONIVEIS[0].valor);
    setCatPosto("");
    setCatPeriodicidade(30);
    setCatUltimaManutencao("");
    setCatObservacoes("");
  }

  function handleCriarOrdem(e: React.FormEvent) {
    e.preventDefault();
    if (!formMaterial.trim()) {
      toast.error("Informe o código do material ou da ferramenta.");
      return;
    }
    if (!formMotivo.trim()) {
      toast.error("Informe o motivo da manutenção.");
      return;
    }

    criarMutation.mutate({
      material: formMaterial.trim().toUpperCase(),
      descricao: formDescricao.trim(),
      linha: formLinha,
      posto_trabalho: formPosto.trim().toUpperCase(),
      motivo_quebra: formMotivo.trim(),
      pecas_produzidas: Number(formPecas) || 0,
      observacoes: formObs.trim(),
      tipo_manutencao: formTipoOrdem,
    });
  }

  function handleSalvarFerramentaCatalogo(e: React.FormEvent) {
    e.preventDefault();
    if (!catCodigo.trim()) {
      toast.error("Informe o código da ferramenta.");
      return;
    }
    if (!catDescricao.trim()) {
      toast.error("Informe a descrição da ferramenta.");
      return;
    }

    salvarFerramentaMutation.mutate({
      codigo: catCodigo.trim().toUpperCase(),
      descricao: catDescricao.trim(),
      setor: catSetor,
      linha: catLinha,
      posto_trabalho: catPosto.trim().toUpperCase(),
      periodicidade_dias: Number(catPeriodicidade) || 30,
      ultima_manutencao: catUltimaManutencao ? new Date(catUltimaManutencao).toISOString() : undefined,
      observacoes: catObservacoes.trim() || undefined,
    });
  }

  function handleAbrirEdicaoFerramenta(ferramenta: CatalogoFerramenta) {
    setFerramentaEmEdicao(ferramenta);
    setCatCodigo(ferramenta.codigo);
    setCatDescricao(ferramenta.descricao);
    setCatSetor(ferramenta.setor || "estamparia");
    setCatLinha(ferramenta.linha || LINHAS_DISPONIVEIS[0].valor);
    setCatPosto(ferramenta.posto_trabalho || "");
    setCatPeriodicidade(ferramenta.periodicidade_dias);
    setCatUltimaManutencao(
      ferramenta.ultima_manutencao ? ferramenta.ultima_manutencao.slice(0, 10) : ""
    );
    setCatObservacoes(ferramenta.observacoes || "");
    setModalNovaFerramentaAberta(true);
  }

  function handleConfirmarLiberacao() {
    if (!modalLiberarItem) return;
    statusMutation.mutate({
      id: modalLiberarItem.id,
      status: "disponivel",
      observacoes: obsLiberacao.trim() || "Liberado com sucesso pela Ferramentaria.",
    });
    setModalLiberarItem(null);
    setObsLiberacao("");
  }

  function handleAbrirModalTryout(item: ManutencaoFerramenta) {
    setModalAgendarTryoutItem(item);
    const isEstamp =
      item.material.toUpperCase().startsWith("EST") ||
      item.linha.toUpperCase().includes("ESTAMPARIA") ||
      item.posto_trabalho.toUpperCase().startsWith("PR");
    setTryoutSetor(isEstamp ? "estamparia" : "solda");
    setTryoutPrensa(item.tryout_prensa || item.posto_trabalho || (isEstamp ? "PR-108" : "SB6A"));
    setTryoutFerramenta(item.tryout_ferramenta || item.material);

    const agora = new Date();
    agora.setMinutes(Math.ceil(agora.getMinutes() / 15) * 15, 0, 0);
    const fim = new Date(agora.getTime() + 2 * 60 * 60 * 1000);
    const toLocalISO = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setTryoutInicio(toLocalISO(agora));
    setTryoutFim(toLocalISO(fim));
    setTryoutObs(item.observacoes || "");
  }

  function handleConfirmarTryout(e: React.FormEvent) {
    e.preventDefault();
    if (!modalAgendarTryoutItem) return;

    if (!tryoutPrensa.trim()) {
      toast.error("Informe a prensa ou máquina do tryout.");
      return;
    }
    if (!tryoutInicio || !tryoutFim) {
      toast.error("Informe os horários de início e término do tryout.");
      return;
    }
    if (new Date(tryoutFim) <= new Date(tryoutInicio)) {
      toast.error("O horário de término do tryout deve ser posterior ao horário de início.");
      return;
    }

    statusMutation.mutate({
      id: modalAgendarTryoutItem.id,
      status: "tryout",
      tryout_setor: tryoutSetor,
      tryout_prensa: tryoutPrensa.trim().toUpperCase(),
      tryout_ferramenta: tryoutFerramenta.trim().toUpperCase() || modalAgendarTryoutItem.material,
      tryout_inicio: new Date(tryoutInicio).toISOString(),
      tryout_fim: new Date(tryoutFim).toISOString(),
      observacoes: tryoutObs.trim() || undefined,
    });
    setModalAgendarTryoutItem(null);
  }

  // Filtros Kanban
  const ordensFiltradas = useMemo(() => {
    return manutençoes.filter((it) => {
      const matchBusca =
        !filtroBusca.trim() ||
        it.material.toLowerCase().includes(filtroBusca.toLowerCase()) ||
        it.descricao.toLowerCase().includes(filtroBusca.toLowerCase()) ||
        it.motivo_quebra.toLowerCase().includes(filtroBusca.toLowerCase());
      const matchLinha = filtroLinha === "TODAS" || it.linha === filtroLinha;
      return matchBusca && matchLinha;
    });
  }, [manutençoes, filtroBusca, filtroLinha]);

  const itensPorStatus = useMemo(() => {
    const record: Record<StatusFerramenta, ManutencaoFerramenta[]> = {
      aguardando_manutencao: [],
      aguardando_preventiva: [],
      em_manutencao: [],
      aguardando_tryout: [],
      tryout: [],
      disponivel: [],
    };
    for (const it of ordensFiltradas) {
      if (record[it.status]) {
        record[it.status].push(it);
      }
    }
    return record;
  }, [ordensFiltradas]);

  // Filtros Catálogo
  const catalogoFiltrado = useMemo(() => {
    return catalogo.filter((ferr) => {
      const matchBusca =
        !filtroBusca.trim() ||
        ferr.codigo.toLowerCase().includes(filtroBusca.toLowerCase()) ||
        ferr.descricao.toLowerCase().includes(filtroBusca.toLowerCase()) ||
        ferr.posto_trabalho.toLowerCase().includes(filtroBusca.toLowerCase());
      const matchLinha = filtroLinha === "TODAS" || ferr.linha === filtroLinha;
      const matchStatus =
        filtroStatusPreventiva === "TODOS" || ferr.status_preventiva === filtroStatusPreventiva;
      const matchSetor = filtroSetor === "TODOS" || ferr.setor === filtroSetor;
      return matchBusca && matchLinha && matchStatus && matchSetor;
    });
  }, [catalogo, filtroBusca, filtroLinha, filtroStatusPreventiva, filtroSetor]);

  // KPIs de Preventivas
  const kpis = useMemo(() => {
    const vencidas = catalogo.filter((f) => f.status_preventiva === "vencida").length;
    const proximas = catalogo.filter((f) => f.status_preventiva === "proxima").length;
    const emDia = catalogo.filter((f) => f.status_preventiva === "em_dia").length;
    const emManut = manutençoes.filter((m) => m.status !== "disponivel").length;
    return { vencidas, proximas, emDia, emManut };
  }, [catalogo, manutençoes]);

  return (
    <div className="w-full px-6 py-6 min-h-[calc(100vh-4rem)]">
      {/* Cabeçalho */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-xl border border-amber-500/20">
              🛠️
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Painel da Ferramentaria
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gestão operacional de quebras, tryouts, preventivas periódicas e liberação de matrizes.
              </p>
            </div>
          </div>
        </div>

        {/* Abas e Ações */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            <button
              onClick={() => setAbaAtiva("kanban")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
                abaAtiva === "kanban"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              Kanban Operacional
            </button>
            <button
              onClick={() => setAbaAtiva("catalogo")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
                abaAtiva === "catalogo"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <CalendarCheck className="h-3.5 w-3.5" />
              Catálogo & Preventivas ({catalogo.length})
              {kpis.vencidas > 0 && (
                <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                  {kpis.vencidas}
                </span>
              )}
            </button>
          </div>

          {podeGerenciar && (
            abaAtiva === "kanban" ? (
              <button
                type="button"
                onClick={() => setModalNovaOrdemAberta(true)}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Nova Ordem de Manutenção</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setFerramentaEmEdicao(null);
                  limparFormCatalogo();
                  setModalNovaFerramentaAberta(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Cadastrar Ferramenta</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* KPI Cards (Resumo) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-700 dark:text-red-300">Preventivas Vencidas</span>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <div className="mt-1 text-2xl font-bold text-red-800 dark:text-red-200">{kpis.vencidas}</div>
        </div>

        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Próximas (≤ 7 dias)</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">{kpis.proximas}</div>
        </div>

        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Em Dia</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-200">{kpis.emDia}</div>
        </div>

        <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Ordens Ativas</span>
            <Wrench className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-1 text-2xl font-bold text-blue-800 dark:text-blue-200">{kpis.emManut}</div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={filtroBusca}
            onChange={(e) => setFiltroBusca(e.target.value)}
            placeholder="Buscar por código de ferramenta, matriz, posto ou motivo..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Linha:</label>
          <select
            value={filtroLinha}
            onChange={(e) => setFiltroLinha(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none"
          >
            <option value="TODAS">Todas as Linhas</option>
            {LINHAS_DISPONIVEIS.map((l) => (
              <option key={l.valor} value={l.valor}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {abaAtiva === "catalogo" && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Setor:</label>
              <select
                value={filtroSetor}
                onChange={(e) => setFiltroSetor(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="TODOS">Todos os Setores</option>
                <option value="estamparia">Estamparia</option>
                <option value="solda">Solda</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Preventiva:</label>
              <select
                value={filtroStatusPreventiva}
                onChange={(e) => setFiltroStatusPreventiva(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="vencida">🔴 Vencida</option>
                <option value="proxima">🟡 Próxima (≤ 7 dias)</option>
                <option value="em_dia">🟢 Em dia</option>
              </select>
            </div>
          </>
        )}

        {(filtroBusca ||
          filtroLinha !== "TODAS" ||
          filtroStatusPreventiva !== "TODOS" ||
          filtroSetor !== "TODOS") && (
          <button
            type="button"
            onClick={() => {
              setFiltroBusca("");
              setFiltroLinha("TODAS");
              setFiltroStatusPreventiva("TODOS");
              setFiltroSetor("TODOS");
            }}
            className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 font-semibold px-2 py-1"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Conteúdo Aba 1: Kanban Operacional */}
      {abaAtiva === "kanban" && (
        isLoadingKanban ? (
          <div className="flex items-center gap-3 p-12 text-slate-500 dark:text-slate-400">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-700 border-t-amber-500" />
            <p className="text-sm font-medium">Carregando quadro da ferramentaria...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-start">
            {STATUS_COLUNAS.map((col) => {
              const itensColuna = itensPorStatus[col.id] || [];
              return (
                <div
                  key={col.id}
                  className={`flex flex-col rounded-xl border ${col.bordaCor} bg-slate-50/50 dark:bg-slate-900/60 shadow-2xs min-h-[500px] overflow-hidden`}
                >
                  {/* Header da Coluna */}
                  <div className={`border-b ${col.bordaCor} ${col.bgHeader} px-3 py-2.5 flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm shrink-0">{col.icone}</span>
                      <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 truncate" title={col.titulo}>
                        {col.titulo}
                      </h2>
                    </div>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                      {itensColuna.length}
                    </span>
                  </div>

                  {/* Lista de Itens */}
                  <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto max-h-[calc(100vh-18rem)]">
                    {itensColuna.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
                        Nenhuma ferramenta neste estágio
                      </div>
                    ) : (
                      itensColuna.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-3 shadow-2xs hover:shadow-md transition-shadow relative"
                        >
                          {/* Material & Badge */}
                          <div className="flex items-start justify-between gap-1.5 mb-1.5">
                            <h3 className="font-bold text-xs text-slate-900 dark:text-slate-100 font-mono tracking-tight">
                              {item.material}
                            </h3>
                            <span
                              className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                item.tipo_manutencao === "preventiva"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300"
                                  : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-300"
                              }`}
                            >
                              {item.tipo_manutencao === "preventiva" ? "Preventiva" : "Corretiva"}
                            </span>
                          </div>

                          {item.descricao && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mb-1.5 line-clamp-2">
                              {item.descricao}
                            </p>
                          )}

                          {/* Metadados */}
                          <div className="space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mb-2 border-t border-slate-100 dark:border-slate-700/60 pt-1.5">
                            <div className="flex justify-between">
                              <span>Linha / Posto:</span>
                              <strong className="text-slate-700 dark:text-slate-200">
                                {item.linha || "N/A"} {item.posto_trabalho ? `(${item.posto_trabalho})` : ""}
                              </strong>
                            </div>

                            {item.pecas_produzidas > 0 && (
                              <div className="flex justify-between">
                                <span>Peças produzidas:</span>
                                <strong className="text-slate-700 dark:text-slate-200">
                                  {item.pecas_produzidas} peças
                                </strong>
                              </div>
                            )}

                            <div className="flex justify-between">
                              <span>Abertura:</span>
                              <span>{new Date(item.data_quebra).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>

                            {item.data_liberacao && (
                              <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                                <span>Liberada em:</span>
                                <span>{new Date(item.data_liberacao).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                            )}
                          </div>

                          {/* Motivo */}
                          <div className="mb-2 rounded bg-amber-50/60 dark:bg-amber-950/20 p-1.5 text-[11px] border border-amber-200/50 dark:border-amber-900/30">
                            <span className="block font-semibold text-amber-900 dark:text-amber-300 text-[10px] mb-0.5">
                              {item.tipo_manutencao === "preventiva" ? "Plano Preventivo:" : "Avaria / Motivo:"}
                            </span>
                            <p className="text-slate-700 dark:text-slate-300 italic line-clamp-3">
                              {item.motivo_quebra}
                            </p>
                          </div>

                          {/* Informações de Tryout Agendado */}
                          {(item.tryout_prensa || item.tryout_inicio) && (
                            <div className="mb-2 rounded bg-blue-50/80 dark:bg-blue-950/30 p-2 text-[11px] border border-blue-200/80 dark:border-blue-900/50 space-y-1">
                              <div className="flex items-center justify-between text-blue-900 dark:text-blue-200 font-semibold text-[10px]">
                                <span className="flex items-center gap-1 font-bold">⚙️ Tryout Agendado:</span>
                                <span className="uppercase text-[9px] px-1.5 py-0.5 rounded font-bold bg-blue-200/70 dark:bg-blue-800/70 text-blue-800 dark:text-blue-200">
                                  {item.tryout_setor || "estamparia"}
                                </span>
                              </div>
                              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                                <span>Prensa / Posto:</span>
                                <strong className="font-mono text-blue-700 dark:text-blue-300">{item.tryout_prensa}</strong>
                              </div>
                              {item.tryout_ferramenta && item.tryout_ferramenta !== item.material && (
                                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                                  <span>Matriz/Ferramenta:</span>
                                  <strong className="font-mono text-slate-800 dark:text-slate-200">{item.tryout_ferramenta}</strong>
                                </div>
                              )}
                              {item.tryout_inicio && item.tryout_fim && (
                                <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[10px] border-t border-blue-200/40 dark:border-blue-900/40 pt-1">
                                  <span>Janela:</span>
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {new Date(item.tryout_inicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} {new Date(item.tryout_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} às {new Date(item.tryout_fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {item.observacoes && (
                            <div className="mb-2 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 p-1.5 rounded whitespace-pre-line">
                              {item.observacoes}
                            </div>
                          )}

                          {/* Botões de Ação de Fluxo */}
                          {podeGerenciar && (
                            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-1.5">
                              {(item.status === "aguardando_manutencao" ||
                                item.status === "aguardando_preventiva") && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    statusMutation.mutate({
                                      id: item.id,
                                      status: "em_manutencao",
                                      observacoes: "Manutenção iniciada na bancada.",
                                    })
                                  }
                                  disabled={statusMutation.isPending}
                                  className="w-full flex items-center justify-center gap-1 rounded bg-amber-600 hover:bg-amber-700 text-white py-1 text-xs font-semibold shadow-2xs cursor-pointer"
                                >
                                  🔧 Iniciar Manutenção
                                </button>
                              )}

                              {item.status === "em_manutencao" && (
                                <div className="space-y-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      statusMutation.mutate({
                                        id: item.id,
                                        status: "aguardando_tryout",
                                        observacoes: "Manutenção de bancada concluída. Aguardando agendamento de tryout.",
                                      })
                                    }
                                    disabled={statusMutation.isPending}
                                    className="w-full flex items-center justify-center gap-1 rounded bg-purple-600 hover:bg-purple-700 text-white py-1 text-xs font-semibold shadow-2xs cursor-pointer"
                                    title="Enviar para fila de agendamento de tryout"
                                  >
                                    🕒 Enviar p/ Aguardando Tryout
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setModalLiberarItem(item)}
                                    disabled={statusMutation.isPending}
                                    className="w-full flex items-center justify-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white py-1 text-[11px] font-semibold shadow-2xs cursor-pointer"
                                    title="Liberar ferramenta diretamente sem tryout"
                                  >
                                    ✅ Liberar Direto (OK)
                                  </button>
                                </div>
                              )}

                              {item.status === "aguardando_tryout" && (
                                <div className="space-y-1">
                                  {isProgramadorFerramentaria ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleAbrirModalTryout(item)}
                                        disabled={statusMutation.isPending}
                                        className="w-full flex items-center justify-center gap-1 rounded bg-blue-600 hover:bg-blue-700 text-white py-1 text-xs font-semibold shadow-2xs cursor-pointer"
                                        title="Definir prensa, ferramenta e horários de teste"
                                      >
                                        ⚙️ Agendar e Enviar p/ Tryout
                                      </button>
                                      <div className="flex gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            statusMutation.mutate({
                                              id: item.id,
                                              status: "em_manutencao",
                                              observacoes: "Retornado para manutenção na bancada.",
                                            })
                                          }
                                          disabled={statusMutation.isPending}
                                          className="flex-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                                        >
                                          ↩ Bancada
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setModalLiberarItem(item)}
                                          disabled={statusMutation.isPending}
                                          className="flex-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white py-0.5 text-[10px] font-semibold shadow-2xs cursor-pointer"
                                        >
                                          ✅ Liberar OK
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="rounded bg-purple-50/80 dark:bg-purple-950/30 p-1.5 text-center text-[10px] text-purple-700 dark:text-purple-300 font-medium border border-purple-200 dark:border-purple-800/50">
                                        🔒 Aguardando o Programador agendar Prensa e Horário
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          statusMutation.mutate({
                                            id: item.id,
                                            status: "em_manutencao",
                                            observacoes: "Retornado para manutenção na bancada.",
                                          })
                                        }
                                        disabled={statusMutation.isPending}
                                        className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                                      >
                                        ↩ Retornar para Bancada
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}

                              {item.status === "tryout" && (
                                <div className="w-full flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      statusMutation.mutate({
                                        id: item.id,
                                        status: "em_manutencao",
                                        observacoes: "Tryout reprovado. Retornou para ajuste.",
                                      })
                                    }
                                    disabled={statusMutation.isPending}
                                    className="flex-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                                    title="Retornar para manutenção"
                                  >
                                    ↩ Retrabalho
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setModalLiberarItem(item)}
                                    disabled={statusMutation.isPending}
                                    className="flex-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white py-1 text-[11px] font-semibold shadow-2xs cursor-pointer"
                                    title="Aprovar e liberar ferramenta"
                                  >
                                    ✅ Liberar (OK)
                                  </button>
                                </div>
                              )}

                              {item.status === "disponivel" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    statusMutation.mutate({
                                      id: item.id,
                                      status: "aguardando_manutencao",
                                      observacoes: "Reabertura de manutenção.",
                                    })
                                  }
                                  disabled={statusMutation.isPending}
                                  className="w-full text-center text-[10px] text-slate-500 hover:text-red-500 py-0.5 font-medium cursor-pointer"
                                >
                                  ⚠️ Reabrir Manutenção
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Conteúdo Aba 2: Catálogo de Ferramentas & Preventivas */}
      {abaAtiva === "catalogo" && (
        isLoadingCatalogo ? (
          <div className="flex items-center gap-3 p-12 text-slate-500 dark:text-slate-400">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-700 border-t-amber-500" />
            <p className="text-sm font-medium">Carregando catálogo de ferramentas...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalogoFiltrado.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-400 dark:text-slate-500">
                Nenhuma ferramenta encontrada com os filtros selecionados.
              </div>
            ) : (
              catalogoFiltrado.map((ferr) => {
                const statusBadge =
                  ferr.status_preventiva === "vencida"
                    ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 border-red-300"
                    : ferr.status_preventiva === "proxima"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300";

                const statusLabel =
                  ferr.status_preventiva === "vencida"
                    ? "🔴 Preventiva Vencida"
                    : ferr.status_preventiva === "proxima"
                    ? "🟡 Próxima (≤ 7 dias)"
                    : "🟢 Em Dia";

                return (
                  <div
                    key={ferr.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Topo do Card */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                            {ferr.setor.toUpperCase()} • {ferr.linha}
                          </span>
                          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                            {ferr.codigo}
                          </h3>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge}`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
                        {ferr.descricao}
                      </p>

                      {/* Métricas do Plano */}
                      <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 mb-3">
                        <div className="flex justify-between">
                          <span>Posto de Trabalho:</span>
                          <strong className="text-slate-900 dark:text-slate-100">
                            {ferr.posto_trabalho || "N/A"}
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Periodicidade:</span>
                          <strong className="text-slate-900 dark:text-slate-100">
                            A cada {ferr.periodicidade_dias} dias
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Última Manutenção:</span>
                          <span>
                            {ferr.ultima_manutencao
                              ? new Date(ferr.ultima_manutencao).toLocaleDateString("pt-BR")
                              : "Nunca realizada"}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-slate-200/60 dark:border-slate-700/60 pt-1">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Próxima Preventiva:
                          </span>
                          <strong
                            className={
                              ferr.status_preventiva === "vencida"
                                ? "text-red-600 dark:text-red-400 font-bold"
                                : ferr.status_preventiva === "proxima"
                                ? "text-amber-600 dark:text-amber-400 font-bold"
                                : "text-emerald-600 dark:text-emerald-400 font-bold"
                            }
                          >
                            {ferr.proxima_manutencao
                              ? new Date(ferr.proxima_manutencao).toLocaleDateString("pt-BR")
                              : "N/A"}
                            {ferr.dias_ate_preventiva != null && (
                              <span className="text-[11px] font-normal ml-1">
                                ({ferr.dias_ate_preventiva < 0
                                  ? `${Math.abs(ferr.dias_ate_preventiva)}d atrasada`
                                  : `${ferr.dias_ate_preventiva}d restantes`})
                              </span>
                            )}
                          </strong>
                        </div>
                      </div>

                      {ferr.observacoes && (
                        <p className="text-[11px] text-slate-500 italic mb-3">
                          {ferr.observacoes}
                        </p>
                      )}
                    </div>

                    {/* Ações */}
                    {podeGerenciar && (
                      <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => abrirPreventivaMutation.mutate(ferr.id)}
                          disabled={abrirPreventivaMutation.isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                          title="Abrir Ordem de Serviço Preventiva no Kanban"
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          <span>Abrir Preventiva</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAbrirEdicaoFerramenta(ferr)}
                          className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                          title="Editar Ferramenta"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Remover ferramenta ${ferr.codigo} do catálogo?`)) {
                              removerFerramentaMutation.mutate(ferr.id);
                            }
                          }}
                          className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 cursor-pointer"
                          title="Excluir Ferramenta"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )
      )}

      {/* Modal de Nova Ordem de Manutenção */}
      {modalNovaOrdemAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 p-6 shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>🛠️</span>
                Nova Ordem de Manutenção de Ferramenta
              </h3>
              <button
                type="button"
                onClick={() => setModalNovaOrdemAberta(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCriarOrdem} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Código da Matriz / Ferramenta <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formMaterial}
                    onChange={(e) => setFormMaterial(e.target.value)}
                    placeholder="Ex: EST-101 ou CÓDIGO SAP"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-mono"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Manutenção
                  </label>
                  <select
                    value={formTipoOrdem}
                    onChange={(e) => setFormTipoOrdem(e.target.value as "corretiva" | "preventiva")}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    <option value="corretiva">🔴 Corretiva (Quebra / Avaria)</option>
                    <option value="preventiva">🟠 Preventiva (Revisão Periódica)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição do Molde / Estampo
                </label>
                <input
                  type="text"
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  placeholder="Ex: Matriz de Corte e Dobra Lateral"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Linha
                  </label>
                  <select
                    value={formLinha}
                    onChange={(e) => setFormLinha(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    {LINHAS_DISPONIVEIS.map((l) => (
                      <option key={l.valor} value={l.valor}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Posto de Trabalho
                  </label>
                  <input
                    type="text"
                    value={formPosto}
                    onChange={(e) => setFormPosto(e.target.value)}
                    placeholder="Ex: PRENSA 01"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Peças Produzidas
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formPecas}
                    onChange={(e) => setFormPecas(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo da Parada / Manutenção <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={formMotivo}
                  onChange={(e) => setFormMotivo(e.target.value)}
                  placeholder="Ex: Desgaste nas navalhas, quebra do pino guia, necessidade de retífica..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Observações Técnicas / Plano de Reparo
                </label>
                <textarea
                  rows={2}
                  value={formObs}
                  onChange={(e) => setFormObs(e.target.value)}
                  placeholder="Instruções para a equipe de ferramentaria..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalNovaOrdemAberta(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={criarMutation.isPending}
                  className="rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-semibold text-white shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {criarMutation.isPending ? "Salvando..." : "Abrir Ordem"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Cadastrar/Editar Ferramenta no Catálogo */}
      {modalNovaFerramentaAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 p-6 shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>🔧</span>
                {ferramentaEmEdicao ? "Editar Ferramenta no Catálogo" : "Cadastrar Nova Ferramenta no Catálogo"}
              </h3>
              <button
                type="button"
                onClick={() => setModalNovaFerramentaAberta(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSalvarFerramentaCatalogo} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Código / Matriz <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={catCodigo}
                    onChange={(e) => setCatCodigo(e.target.value)}
                    placeholder="Ex: EST-104"
                    disabled={Boolean(ferramentaEmEdicao)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono disabled:opacity-60"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Setor Produtivo
                  </label>
                  <select
                    value={catSetor}
                    onChange={(e) => setCatSetor(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="estamparia">Estamparia (Prensas / Matrizes)</option>
                    <option value="solda">Solda (Gabaris / Postos)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição da Matriz / Ferramenta <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={catDescricao}
                  onChange={(e) => setCatDescricao(e.target.value)}
                  placeholder="Ex: Estampo de Conformação Lateral Traseira"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Linha
                  </label>
                  <select
                    value={catLinha}
                    onChange={(e) => setCatLinha(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {LINHAS_DISPONIVEIS.map((l) => (
                      <option key={l.valor} value={l.valor}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Posto de Trabalho
                  </label>
                  <input
                    type="text"
                    value={catPosto}
                    onChange={(e) => setCatPosto(e.target.value)}
                    placeholder="Ex: PRENSA 01"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Periodicidade (dias) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={catPeriodicidade}
                    onChange={(e) => setCatPeriodicidade(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Data da Última Manutenção Preventiva Realizada
                </label>
                <input
                  type="date"
                  value={catUltimaManutencao}
                  onChange={(e) => setCatUltimaManutencao(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Observações / Histórico
                </label>
                <textarea
                  rows={2}
                  value={catObservacoes}
                  onChange={(e) => setCatObservacoes(e.target.value)}
                  placeholder="Informações adicionais, notas sobre afiação..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalNovaFerramentaAberta(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvarFerramentaMutation.isPending}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {salvarFerramentaMutation.isPending ? "Salvando..." : "Salvar no Catálogo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Liberação (OK) */}
      {modalLiberarItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-800 p-6 shadow-2xl border border-emerald-200 dark:border-emerald-900/50 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400">
                ✓
              </span>
              Liberar Ferramenta para Produção
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              A ferramenta <strong className="text-slate-800 dark:text-slate-200 font-mono">{modalLiberarItem.material}</strong> será marcada como <strong>Disponível (OK)</strong> e desbloqueada para programação no Patan. O ciclo de preventiva no catálogo será atualizado automaticamente.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Parecer / Observações da Liberação (opcional)
                </label>
                <textarea
                  rows={3}
                  value={obsLiberacao}
                  onChange={(e) => setObsLiberacao(e.target.value)}
                  placeholder="Ex: Peça testada em tryout na prensa, afiação aprovada com laudo."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalLiberarItem(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarLiberacao}
                  disabled={statusMutation.isPending}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {statusMutation.isPending ? "Liberando..." : "Confirmar Liberação (OK)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Agendamento de Tryout (Exclusivo Programador Ferramentaria) */}
      {modalAgendarTryoutItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 p-6 shadow-2xl border border-blue-200 dark:border-blue-900/50 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-sm">
                    ⚙️
                  </span>
                  Agendar Tryout em Máquina / Prensa
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Defina a máquina e o intervalo de tempo para a realização do teste prático na fábrica.
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmarTryout} className="mt-4 space-y-3.5">
              {/* Setor */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Setor Fabril <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTryoutSetor("estamparia");
                      if (!tryoutPrensa || tryoutPrensa.startsWith("SB") || tryoutPrensa.startsWith("SOL")) {
                        setTryoutPrensa("PR-108");
                      }
                    }}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-2 text-xs font-bold transition-all ${
                      tryoutSetor === "estamparia"
                        ? "border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-2xs"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <span>🏭 Estamparia (Prensas)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTryoutSetor("solda");
                      if (!tryoutPrensa || tryoutPrensa.startsWith("PR")) {
                        setTryoutPrensa("SB6A");
                      }
                    }}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-2 text-xs font-bold transition-all ${
                      tryoutSetor === "solda"
                        ? "border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-2xs"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <span>⚡ Solda (Células)</span>
                  </button>
                </div>
              </div>

              {/* Ferramenta & Prensa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ferramenta / Matriz <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={tryoutFerramenta}
                    onChange={(e) => setTryoutFerramenta(e.target.value)}
                    placeholder="Ex: EST-MAT-001"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Prensa / Máquina <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    list="lista-prensas-tryout"
                    value={tryoutPrensa}
                    onChange={(e) => setTryoutPrensa(e.target.value)}
                    placeholder={tryoutSetor === "estamparia" ? "Ex: PR-108" : "Ex: SB6A"}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <datalist id="lista-prensas-tryout">
                    {tryoutSetor === "estamparia" ? (
                      <>
                        <option value="PR-108" />
                        <option value="PR-109" />
                        <option value="PR-110" />
                        <option value="PR-111" />
                        <option value="PR-112" />
                        <option value="PR-113" />
                        <option value="PR-114" />
                        <option value="PRENSA 01" />
                        <option value="PRENSA 02" />
                        <option value="PRENSA 03" />
                      </>
                    ) : (
                      <>
                        <option value="SB6A" />
                        <option value="SB6B" />
                        <option value="SOLDA 01" />
                        <option value="SOLDA 02" />
                        <option value="SOLDA 03" />
                      </>
                    )}
                  </datalist>
                </div>
              </div>

              {/* Horários: Início e Fim */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Horário de Início do Tryout <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={tryoutInicio}
                    onChange={(e) => setTryoutInicio(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Horário de Término Estimado <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={tryoutFim}
                    onChange={(e) => setTryoutFim(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Observações / Orientações para a Fábrica */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Orientações do Tryout / Observações (opcional)
                </label>
                <textarea
                  rows={2}
                  value={tryoutObs}
                  onChange={(e) => setTryoutObs(e.target.value)}
                  placeholder="Ex: Executar 15 batidas com chapa 0.8mm e medir rebarba da borda."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Botões do Modal */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalAgendarTryoutItem(null)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={statusMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <span>{statusMutation.isPending ? "Agendando..." : "Confirmar e Enviar para Tryout"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
