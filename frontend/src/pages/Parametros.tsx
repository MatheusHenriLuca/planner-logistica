import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sliders,
  ShieldCheck,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Lock,
  Palette,
  Layers,
  Factory,
  Zap,
  GitBranch,
  Clock,
  AlertTriangle,
  Wrench,
  RotateCcw,
  Sparkles,
  Boxes,
  RefreshCw,
  Bell,
  Volume2,
  ArrowUp,
  ArrowDown,
  Eye,
  FileText,
  ListOrdered,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import {
  getCargos,
  createCargo,
  updateCargo,
  deleteCargo,
  getParametros,
  updateParametro,
  listarLinhas,
  criarLinha,
  removerLinha,
} from "../services/api";
import type { Cargo, CargoCreate } from "../types/parametros";
import {
  BLOCOS_DISPONIVEIS_RESUMO,
  TEMPLATE_PADRAO_SOLDA,
  TEMPLATE_PADRAO_ESTAMPARIA,
  SAMPLE_ITEM_SOLDA,
  SAMPLE_ITEM_ESTAMPARIA,
  gerarTextoResumoLote,
  parseTemplateConfig,
  obterBlocosDisponiveisParaSetor,
  type ItemConfigBloco,
  type ItemBlocoResumoId,
} from "../utils/resumoTemplate";

const PERMISSOES_INFO: { chave: keyof Omit<Cargo, "id" | "nome" | "descricao" | "is_sistema">; label: string; desc: string }[] = [
  {
    chave: "pode_programar",
    label: "Programar Sequenciamento",
    desc: "Acesso total à tela de Programação, simulação de cascata e envio de lotes",
  },
  {
    chave: "pode_iniciar_producao",
    label: "Controle de Produção no Kanban",
    desc: "Iniciar, pausar e concluir ordens de produção nos cards",
  },
  {
    chave: "pode_reordenar_producao",
    label: "Reordenar Sequência",
    desc: "Arrastar e alterar ordem dos cards dentro das colunas de produção",
  },
  {
    chave: "pode_mover_colunas",
    label: "Mover Itens Entre Colunas",
    desc: "Transferir itens para colunas adicionais de processo",
  },
  {
    chave: "pode_gerenciar_colunas",
    label: "Gerenciar Colunas Extras",
    desc: "Criar, renomear e excluir novas colunas (buckets) no Kanban",
  },
  {
    chave: "pode_ver_historico",
    label: "Visualizar Auditoria / Histórico",
    desc: "Acessar trilha completa de auditoria de alterações do sistema",
  },
  {
    chave: "pode_gerenciar_usuarios",
    label: "Gerenciar Usuários",
    desc: "Cadastrar novos operadores, trocar senhas e definir cargos",
  },
  {
    chave: "pode_importar_sap",
    label: "Importação SAP (Excel)",
    desc: "Sincronizar base de dados a partir da planilha AutomacaoPlanner",
  },
  {
    chave: "pode_configurar_parametros",
    label: "Configurar Parâmetros & Cargos",
    desc: "Acessar e modificar parâmetros globais do sistema e regras de negócio",
  },
  {
    chave: "pode_gerenciar_ferramentaria",
    label: "Gerenciar Ferramentaria",
    desc: "Gestão operacional de quebras, manutenção, tryouts e liberação de ferramentas",
  },
  {
    chave: "pode_gerenciar_linhas",
    label: "Gerenciar Linhas de Produção",
    desc: "Cadastrar, associar a setores (Solda/Estamparia) e desativar linhas fabris",
  },
  {
    chave: "pode_ver_solda",
    label: "Acesso à Produção — Solda",
    desc: "Visualizar e operar postos de solda (SB6A) e sequenciamento de lotes",
  },
  {
    chave: "pode_ver_estamparia",
    label: "Acesso à Produção — Estamparia",
    desc: "Visualizar e operar prensas de estamparia e coluna de Tryout de ferramentas",
  },
];

export function Parametros() {
  const { token, role, permissoes } = useAuth();
  const podeGerenciarLinhas = role === "admin" || Boolean(permissoes?.pode_gerenciar_linhas);
  const [abaAtiva, setAbaAtiva] = useState<"cargos" | "linhas" | "parametros">("cargos");

  // Query de Parâmetros
  const parametrosQuery = useQuery({
    queryKey: ["parametros-sistema"],
    queryFn: () => getParametros(token as string),
    enabled: Boolean(token),
  });

  // Query de Cargos
  const cargosQuery = useQuery({
    queryKey: ["cargos-sistema"],
    queryFn: () => getCargos(token as string),
    enabled: Boolean(token),
  });

  // Query de Linhas
  const linhasQuery = useQuery({
    queryKey: ["linhas-sistema"],
    queryFn: () => listarLinhas(token as string),
    enabled: Boolean(token),
  });

  const [cargoSelecionado, setCargoSelecionado] = useState<Cargo | null>(null);
  const [modoNovoCargo, setModoNovoCargo] = useState(false);

  // Form State para Novo Cargo
  const [novoCargoNome, setNovoCargoNome] = useState("");
  const [novoCargoDesc, setNovoCargoDesc] = useState("");
  const [novoCargoPermissoes, setNovoCargoPermissoes] = useState<Record<string, boolean>>({
    pode_programar: false,
    pode_iniciar_producao: true,
    pode_reordenar_producao: false,
    pode_mover_colunas: true,
    pode_gerenciar_colunas: false,
    pode_ver_historico: false,
    pode_gerenciar_usuarios: false,
    pode_importar_sap: false,
    pode_configurar_parametros: false,
    pode_gerenciar_ferramentaria: false,
    pode_gerenciar_linhas: false,
    pode_ver_solda: true,
    pode_ver_estamparia: true,
  });

  // Form State para Nova Linha
  const [novaLinhaNome, setNovaLinhaNome] = useState("");
  const [novaLinhaSetor, setNovaLinhaSetor] = useState<"solda" | "estamparia">("solda");
  const [novaLinhaDesc, setNovaLinhaDesc] = useState("");
  const [salvandoLinha, setSalvandoLinha] = useState(false);
  const [filtroSetorLinha, setFiltroSetorLinha] = useState<string>("todos");

  const parametros = parametrosQuery.data ?? [];
  const cargos = cargosQuery.data ?? [];

  const paramBloquearArraste = parametros.find((p) => p.chave === "bloquear_arraste_producao")?.valor === "true";
  const paramCorDestaque = parametros.find((p) => p.chave === "cor_destaque_producao")?.valor ?? "emerald";
  const paramHoraTurno1 = parametros.find((p) => p.chave === "hora_inicio_turno_1")?.valor ?? "06:20";
  const paramHoraTurno2 = parametros.find((p) => p.chave === "hora_inicio_turno_2")?.valor ?? "14:40";
  const paramHoraTurno3 = parametros.find((p) => p.chave === "hora_inicio_turno_3")?.valor ?? "23:00";
  const paramHoraRefeicaoT1 = parametros.find((p) => p.chave === "hora_refeicao_turno_1")?.valor ?? "10:20";
  const paramHoraRefeicaoT2 = parametros.find((p) => p.chave === "hora_refeicao_turno_2")?.valor ?? "18:40";
  const paramHoraRefeicaoT3 = parametros.find((p) => p.chave === "hora_refeicao_turno_3")?.valor ?? "03:00";
  const paramDuracaoRefeicao = parametros.find((p) => p.chave === "duracao_refeicao_minutos")?.valor ?? "40";
  const paramToleranciaSeisan = parametros.find((p) => p.chave === "tolerancia_atraso_seisan_min")?.valor ?? "15";
  const paramBloquearFerramenta = parametros.find((p) => p.chave === "bloquear_envio_ferramenta_manutencao")?.valor !== "false";
  const paramExigirQuebra = parametros.find((p) => p.chave === "exigir_motivo_quebra")?.valor !== "false";
  const paramDiasPreventiva = parametros.find((p) => p.chave === "dias_alerta_preventiva")?.valor ?? "7";
  const paramTempoSetup = parametros.find((p) => p.chave === "tempo_padrao_setup_minutos")?.valor ?? "10";
  const paramMaxKanbansEmergencia = parametros.find((p) => p.chave === "limite_max_kanbans_emergencia")?.valor ?? "50";
  const paramLimiteLoteCurto = parametros.find((p) => p.chave === "limite_lote_curto_minutos")?.valor ?? "60";
  const paramLimiteLoteCurtoSolda = parametros.find((p) => p.chave === "limite_lote_curto_solda_minutos")?.valor ?? "60";
  const paramMargemEstoque = parametros.find((p) => p.chave === "margem_seguranca_estoque_pct")?.valor ?? "15";
  const paramIntervaloRefresh = parametros.find((p) => p.chave === "intervalo_refresh_automatico_seg")?.valor ?? "30";
  const paramExibirSegundos = parametros.find((p) => p.chave === "exibir_segundos_cronometro")?.valor !== "false";
  const paramNotificarParada = parametros.find((p) => p.chave === "notificar_parada_maquina_lideranca")?.valor !== "false";
  const paramToleranciaTryout = parametros.find((p) => p.chave === "tolerancia_tryout_horas")?.valor ?? "4";
  const paramHabilitarSons = parametros.find((p) => p.chave === "habilitar_sons_apontamento")?.valor !== "false";
  const paramTemplateSolda = parametros.find((p) => p.chave === "template_resumo_solda")?.valor;
  const paramTemplateEstamparia = parametros.find((p) => p.chave === "template_resumo_estamparia")?.valor;

  // Estados locais para inputs
  const [localHoraT1, setLocalHoraT1] = useState<string | null>(null);
  const [localHoraT2, setLocalHoraT2] = useState<string | null>(null);
  const [localHoraT3, setLocalHoraT3] = useState<string | null>(null);
  const [localHoraRefeicaoT1, setLocalHoraRefeicaoT1] = useState<string | null>(null);
  const [localHoraRefeicaoT2, setLocalHoraRefeicaoT2] = useState<string | null>(null);
  const [localHoraRefeicaoT3, setLocalHoraRefeicaoT3] = useState<string | null>(null);
  const [localRefeicao, setLocalRefeicao] = useState<string | null>(null);
  const [localToleranciaSeisan, setLocalToleranciaSeisan] = useState<string | null>(null);
  const [localDiasPreventiva, setLocalDiasPreventiva] = useState<string | null>(null);
  const [localTempoSetup, setLocalTempoSetup] = useState<string | null>(null);
  const [localMaxKanbansEmergencia, setLocalMaxKanbansEmergencia] = useState<string | null>(null);
  const [localLimiteLoteCurto, setLocalLimiteLoteCurto] = useState<string | null>(null);
  const [localLimiteLoteCurtoSolda, setLocalLimiteLoteCurtoSolda] = useState<string | null>(null);
  const [localMargemEstoque, setLocalMargemEstoque] = useState<string | null>(null);
  const [localIntervaloRefresh, setLocalIntervaloRefresh] = useState<string | null>(null);
  const [localToleranciaTryout, setLocalToleranciaTryout] = useState<string | null>(null);

  // Estados do Configurador de Resumo do Lote
  const [setorResumoAtivo, setSetorResumoAtivo] = useState<"solda" | "estamparia">("solda");
  const [localTemplateSolda, setLocalTemplateSolda] = useState<ItemConfigBloco[] | null>(null);
  const [localTemplateEstamparia, setLocalTemplateEstamparia] = useState<ItemConfigBloco[] | null>(null);
  const [salvandoTemplateResumo, setSalvandoTemplateResumo] = useState(false);

  const valorHoraT1 = localHoraT1 ?? paramHoraTurno1;
  const valorHoraT2 = localHoraT2 ?? paramHoraTurno2;
  const valorHoraT3 = localHoraT3 ?? paramHoraTurno3;
  const valorHoraRefeicaoT1 = localHoraRefeicaoT1 ?? paramHoraRefeicaoT1;
  const valorHoraRefeicaoT2 = localHoraRefeicaoT2 ?? paramHoraRefeicaoT2;
  const valorHoraRefeicaoT3 = localHoraRefeicaoT3 ?? paramHoraRefeicaoT3;
  const valorRefeicao = localRefeicao ?? paramDuracaoRefeicao;
  const valorToleranciaSeisan = localToleranciaSeisan ?? paramToleranciaSeisan;
  const valorDiasPreventiva = localDiasPreventiva ?? paramDiasPreventiva;
  const valorTempoSetup = localTempoSetup ?? paramTempoSetup;
  const valorMaxKanbansEmergencia = localMaxKanbansEmergencia ?? paramMaxKanbansEmergencia;
  const valorLimiteLoteCurto = localLimiteLoteCurto ?? paramLimiteLoteCurto;
  const valorLimiteLoteCurtoSolda = localLimiteLoteCurtoSolda ?? paramLimiteLoteCurtoSolda;
  const valorMargemEstoque = localMargemEstoque ?? paramMargemEstoque;
  const valorIntervaloRefresh = localIntervaloRefresh ?? paramIntervaloRefresh;
  const valorToleranciaTryout = localToleranciaTryout ?? paramToleranciaTryout;

  const configSolda = localTemplateSolda ?? parseTemplateConfig(paramTemplateSolda, "solda");
  const configEstamparia = localTemplateEstamparia ?? parseTemplateConfig(paramTemplateEstamparia, "estamparia");
  const configResumoAtiva = setorResumoAtivo === "solda" ? configSolda : configEstamparia;

  const mapBlocosDisponiveis = new Map(BLOCOS_DISPONIVEIS_RESUMO.map((b) => [b.id, b]));
  const blocosDoSetor = obterBlocosDisponiveisParaSetor(setorResumoAtivo);
  const idsConfigurados = new Set(configResumoAtiva.map((c) => c.id));
  const blocosAusentes = blocosDoSetor.filter((b) => !idsConfigurados.has(b.id));
  const blocosAtivosCount = configResumoAtiva.filter((b) => b.ativo).length;

  const itemExemplo = setorResumoAtivo === "solda" ? SAMPLE_ITEM_SOLDA : SAMPLE_ITEM_ESTAMPARIA;
  const textoPreview = gerarTextoResumoLote(itemExemplo, configResumoAtiva);

  function setConfigResumoAtiva(novaLista: ItemConfigBloco[]) {
    if (setorResumoAtivo === "solda") {
      setLocalTemplateSolda(novaLista);
    } else {
      setLocalTemplateEstamparia(novaLista);
    }
  }

  function handleToggleBlocoResumo(id: ItemBlocoResumoId) {
    const novaLista = configResumoAtiva.map((b) =>
      b.id === id ? { ...b, ativo: !b.ativo } : b
    );
    setConfigResumoAtiva(novaLista);
  }

  function handleMoverBlocoResumo(index: number, direcao: "cima" | "baixo") {
    const targetIndex = direcao === "cima" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= configResumoAtiva.length) return;
    const novaLista = [...configResumoAtiva];
    const temp = novaLista[index];
    novaLista[index] = novaLista[targetIndex];
    novaLista[targetIndex] = temp;
    setConfigResumoAtiva(novaLista);
  }

  function handleRestaurarPadraoResumo() {
    const padrao = setorResumoAtivo === "solda" ? TEMPLATE_PADRAO_SOLDA : TEMPLATE_PADRAO_ESTAMPARIA;
    setConfigResumoAtiva([...padrao]);
    toast.info(`Template padrão de ${setorResumoAtivo === "solda" ? "Solda" : "Estamparia"} restaurado.`);
  }

  async function handleSalvarTemplateResumo() {
    if (!token) return;
    setSalvandoTemplateResumo(true);
    try {
      const chave = setorResumoAtivo === "solda" ? "template_resumo_solda" : "template_resumo_estamparia";
      const valorJson = JSON.stringify(configResumoAtiva);
      await updateParametro(token, chave, valorJson);
      await parametrosQuery.refetch();
      if (setorResumoAtivo === "solda") setLocalTemplateSolda(null);
      else setLocalTemplateEstamparia(null);
      toast.success(
        `Template de resumo da ${setorResumoAtivo === "solda" ? "Solda" : "Estamparia"} salvo com sucesso!`
      );
    } catch {
      toast.error("Falha ao salvar template de resumo.");
    } finally {
      setSalvandoTemplateResumo(false);
    }
  }

  function handleAdicionarBlocoAusente(id: ItemBlocoResumoId) {
    setConfigResumoAtiva([...configResumoAtiva, { id, ativo: true }]);
  }


  async function handleToggleParametro(chave: string, valorAtual: boolean, msgAtivado: string, msgDesativado: string) {
    if (!token) return;
    const novoValor = (!valorAtual).toString();
    try {
      await updateParametro(token, chave, novoValor);
      await parametrosQuery.refetch();
      toast.success(!valorAtual ? msgAtivado : msgDesativado);
    } catch {
      toast.error(`Falha ao alterar ${chave}.`);
    }
  }

  async function handleToggleBloquearArraste(ativo: boolean) {
    if (!token) return;
    try {
      await updateParametro(token, "bloquear_arraste_producao", ativo ? "true" : "false");
      await parametrosQuery.refetch();
      toast.success(ativo ? "Arraste bloqueado para operadores na Produção." : "Arraste liberado na Produção.");
    } catch {
      toast.error("Falha ao salvar parâmetro.");
    }
  }

  async function handleSelectCorDestaque(cor: string) {
    if (!token) return;
    try {
      await updateParametro(token, "cor_destaque_producao", cor);
      await parametrosQuery.refetch();
      toast.success(`Cor de destaque alterada para ${cor === "blue" ? "Azul" : "Verde"}.`);
    } catch {
      toast.error("Falha ao salvar cor.");
    }
  }

  async function handleSalvarHorariosTurnos() {
    if (!token) return;
    try {
      await updateParametro(token, "hora_inicio_turno_1", valorHoraT1);
      await updateParametro(token, "hora_inicio_turno_2", valorHoraT2);
      await updateParametro(token, "hora_inicio_turno_3", valorHoraT3);
      await updateParametro(token, "hora_refeicao_turno_1", valorHoraRefeicaoT1);
      await updateParametro(token, "hora_refeicao_turno_2", valorHoraRefeicaoT2);
      await updateParametro(token, "hora_refeicao_turno_3", valorHoraRefeicaoT3);
      await updateParametro(token, "duracao_refeicao_minutos", valorRefeicao);
      await parametrosQuery.refetch();
      setLocalHoraT1(null);
      setLocalHoraT2(null);
      setLocalHoraT3(null);
      setLocalHoraRefeicaoT1(null);
      setLocalHoraRefeicaoT2(null);
      setLocalHoraRefeicaoT3(null);
      setLocalRefeicao(null);
      toast.success("Horários de turnos, refeições e pausas salvos com sucesso!");
    } catch {
      toast.error("Erro ao salvar horários dos turnos.");
    }
  }

  async function handleSalvarToleranciaSeisan() {
    if (!token) return;
    try {
      await updateParametro(token, "tolerancia_atraso_seisan_min", valorToleranciaSeisan);
      await parametrosQuery.refetch();
      setLocalToleranciaSeisan(null);
      toast.success(`Tolerância do Seisan Kanriban definida para ${valorToleranciaSeisan} minutos.`);
    } catch {
      toast.error("Falha ao salvar tolerância.");
    }
  }

  async function handleSalvarDiasPreventiva() {
    if (!token) return;
    try {
      await updateParametro(token, "dias_alerta_preventiva", valorDiasPreventiva);
      await parametrosQuery.refetch();
      setLocalDiasPreventiva(null);
      toast.success(`Alerta de preventiva ajustado para ${valorDiasPreventiva} dias.`);
    } catch {
      toast.error("Falha ao salvar dias de preventiva.");
    }
  }

  async function handleSalvarParametroSimples(chave: string, valor: string, mensagem: string) {
    if (!token) return;
    try {
      await updateParametro(token, chave, valor);
      await parametrosQuery.refetch();
      toast.success(mensagem);
    } catch {
      toast.error(`Falha ao salvar parâmetro ${chave}.`);
    }
  }

  async function handleResetarPadroesLean() {
    if (!token) return;
    if (!confirm("Deseja restaurar todos os horários e parâmetros para os padrões Lean TPS recomendados?")) return;
    try {
      await updateParametro(token, "hora_inicio_turno_1", "06:20");
      await updateParametro(token, "hora_inicio_turno_2", "14:40");
      await updateParametro(token, "hora_inicio_turno_3", "23:00");
      await updateParametro(token, "hora_refeicao_turno_1", "10:20");
      await updateParametro(token, "hora_refeicao_turno_2", "18:40");
      await updateParametro(token, "hora_refeicao_turno_3", "03:00");
      await updateParametro(token, "duracao_refeicao_minutos", "40");
      await updateParametro(token, "tolerancia_atraso_seisan_min", "15");
      await updateParametro(token, "bloquear_envio_ferramenta_manutencao", "true");
      await updateParametro(token, "exigir_motivo_quebra", "true");
      await updateParametro(token, "dias_alerta_preventiva", "7");
      await parametrosQuery.refetch();
      setLocalHoraT1(null);
      setLocalHoraT2(null);
      setLocalHoraT3(null);
      setLocalHoraRefeicaoT1(null);
      setLocalHoraRefeicaoT2(null);
      setLocalHoraRefeicaoT3(null);
      setLocalRefeicao(null);
      setLocalToleranciaSeisan(null);
      setLocalDiasPreventiva(null);
      toast.success("Padrões Lean TPS restaurados com sucesso!");
    } catch {
      toast.error("Falha ao restaurar padrões.");
    }
  }

  async function handleSalvarCargoExistente() {
    if (!token || !cargoSelecionado) return;
    try {
      await updateCargo(token, cargoSelecionado.id, {
        descricao: cargoSelecionado.descricao,
        pode_programar: cargoSelecionado.pode_programar,
        pode_iniciar_producao: cargoSelecionado.pode_iniciar_producao,
        pode_reordenar_producao: cargoSelecionado.pode_reordenar_producao,
        pode_mover_colunas: cargoSelecionado.pode_mover_colunas,
        pode_gerenciar_colunas: cargoSelecionado.pode_gerenciar_colunas,
        pode_ver_historico: cargoSelecionado.pode_ver_historico,
        pode_gerenciar_usuarios: cargoSelecionado.pode_gerenciar_usuarios,
        pode_importar_sap: cargoSelecionado.pode_importar_sap,
        pode_configurar_parametros: cargoSelecionado.pode_configurar_parametros,
        pode_gerenciar_ferramentaria: cargoSelecionado.pode_gerenciar_ferramentaria,
        pode_gerenciar_linhas: cargoSelecionado.pode_gerenciar_linhas,
        pode_ver_solda: cargoSelecionado.pode_ver_solda,
        pode_ver_estamparia: cargoSelecionado.pode_ver_estamparia,
      });
      await cargosQuery.refetch();
      toast.success("Permissões do cargo atualizadas com sucesso!");
    } catch {
      toast.error("Falha ao atualizar cargo.");
    }
  }

  async function handleCriarNovoCargo() {
    if (!token) return;
    const nomeLimpo = novoCargoNome.trim().toLowerCase().replace(/\s+/g, "_");
    if (!nomeLimpo) {
      toast.error("Informe um identificador para o cargo.");
      return;
    }

    const payload: CargoCreate = {
      nome: nomeLimpo,
      descricao: novoCargoDesc.trim(),
      pode_programar: Boolean(novoCargoPermissoes.pode_programar),
      pode_iniciar_producao: Boolean(novoCargoPermissoes.pode_iniciar_producao),
      pode_reordenar_producao: Boolean(novoCargoPermissoes.pode_reordenar_producao),
      pode_mover_colunas: Boolean(novoCargoPermissoes.pode_mover_colunas),
      pode_gerenciar_colunas: Boolean(novoCargoPermissoes.pode_gerenciar_colunas),
      pode_ver_historico: Boolean(novoCargoPermissoes.pode_ver_historico),
      pode_gerenciar_usuarios: Boolean(novoCargoPermissoes.pode_gerenciar_usuarios),
      pode_importar_sap: Boolean(novoCargoPermissoes.pode_importar_sap),
      pode_configurar_parametros: Boolean(novoCargoPermissoes.pode_configurar_parametros),
      pode_gerenciar_ferramentaria: Boolean(novoCargoPermissoes.pode_gerenciar_ferramentaria),
      pode_gerenciar_linhas: Boolean(novoCargoPermissoes.pode_gerenciar_linhas),
      pode_ver_solda: Boolean(novoCargoPermissoes.pode_ver_solda),
      pode_ver_estamparia: Boolean(novoCargoPermissoes.pode_ver_estamparia),
    };

    try {
      const criado = await createCargo(token, payload);
      await cargosQuery.refetch();
      setModoNovoCargo(false);
      setCargoSelecionado(criado);
      setNovoCargoNome("");
      setNovoCargoDesc("");
      toast.success(`Cargo '${criado.nome}' criado com sucesso!`);
    } catch {
      toast.error("Falha ao criar novo cargo. Verifique se o nome já existe.");
    }
  }

  async function handleExcluirCargo(id: number, nome: string) {
    if (!token) return;
    if (!confirm(`Tem certeza que deseja excluir o cargo '${nome}'? Usuários vinculados perderão este perfil.`)) {
      return;
    }
    try {
      await deleteCargo(token, id);
      await cargosQuery.refetch();
      setCargoSelecionado(null);
      toast.success(`Cargo '${nome}' excluído.`);
    } catch {
      toast.error("Falha ao excluir cargo.");
    }
  }

  async function handleCriarLinha(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const nomeLimpo = novaLinhaNome.trim().toUpperCase();
    if (!nomeLimpo) {
      toast.error("Informe o nome da linha (ex: LINHA 5).");
      return;
    }
    setSalvandoLinha(true);
    try {
      await criarLinha(token, {
        nome: nomeLimpo,
        setor: novaLinhaSetor,
        descricao: novaLinhaDesc.trim() || undefined,
      });
      await linhasQuery.refetch();
      setNovaLinhaNome("");
      setNovaLinhaDesc("");
      toast.success(`Linha '${nomeLimpo}' cadastrada para o setor ${novaLinhaSetor === "solda" ? "Solda" : "Estamparia"}!`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Falha ao cadastrar linha. Verifique se o nome já existe no setor.");
    } finally {
      setSalvandoLinha(false);
    }
  }

  async function handleRemoverLinha(id: number, nome: string, setor: string) {
    if (!token) return;
    if (!confirm(`Tem certeza que deseja remover a linha '${nome}' do setor ${setor}?`)) {
      return;
    }
    try {
      await removerLinha(token, id);
      await linhasQuery.refetch();
      toast.success(`Linha '${nome}' removida com sucesso.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Falha ao remover linha.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sliders className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Parâmetros & Controle de Acesso
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure regras operacionais do Kanban e gerencie cargos com controle granular de permissões.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          <button
            onClick={() => setAbaAtiva("cargos")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              abaAtiva === "cargos"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            Cargos & Permissões
          </button>
          <button
            onClick={() => setAbaAtiva("linhas")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              abaAtiva === "linhas"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <GitBranch className="h-4 w-4" />
            Linhas de Produção
          </button>
          <button
            onClick={() => setAbaAtiva("parametros")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              abaAtiva === "parametros"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Layers className="h-4 w-4" />
            Regras da Produção
          </button>
        </div>
      </div>

      {/* Conteúdo Aba: Parâmetros */}
      {abaAtiva === "parametros" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Horários de Turnos & Cascata Lean */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60 mb-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    Horários dos Turnos & Cascata Lean TPS
                  </h3>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                    Cascata Automática
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  Define o ponto de partida do sequenciamento (card com <code>sequência = 1</code>) em cada posto. Se a execução cruzar a pausa de refeição, os minutos configurados são somados com o selo <strong>HORARIO DE ALMOCO INCLUSO</strong>.
                </p>

                {/* Início dos Turnos */}
                <div className="mb-4">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block mb-2">
                    Horário de Início de Cada Turno
                  </span>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        1º Turno (Início)
                      </label>
                      <input
                        type="time"
                        value={valorHoraT1}
                        onChange={(e) => setLocalHoraT1(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        2º Turno (Início)
                      </label>
                      <input
                        type="time"
                        value={valorHoraT2}
                        onChange={(e) => setLocalHoraT2(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        3º Turno (Início)
                      </label>
                      <input
                        type="time"
                        value={valorHoraT3}
                        onChange={(e) => setLocalHoraT3(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Início dos Horários de Refeição (Almoço / Jantar / Ceia) */}
                <div className="mb-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Início da Janela de Refeição (Almoço / Jantar / Ceia)
                    </span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                      Seisan Kanriban & Cascata
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                    A partir deste horário de cada turno, a cascata insere a pausa e o Seisan Kanriban desenha a hachura de almoço.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        1º Turno (Almoço)
                      </label>
                      <input
                        type="time"
                        value={valorHoraRefeicaoT1}
                        onChange={(e) => setLocalHoraRefeicaoT1(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        2º Turno (Jantar)
                      </label>
                      <input
                        type="time"
                        value={valorHoraRefeicaoT2}
                        onChange={(e) => setLocalHoraRefeicaoT2(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        3º Turno (Ceia / Madrugada)
                      </label>
                      <input
                        type="time"
                        value={valorHoraRefeicaoT3}
                        onChange={(e) => setLocalHoraRefeicaoT3(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Duração da Pausa de Refeição
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      Minutos somados uma única vez na transição de almoço/jantar.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={10}
                      max={120}
                      value={valorRefeicao}
                      onChange={(e) => setLocalRefeicao(e.target.value)}
                      className="w-16 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-center font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-slate-500">min</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex justify-end">
                <button
                  onClick={handleSalvarHorariosTurnos}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors"
                >
                  <Save className="h-3.5 w-3.5" />
                  Salvar Horários da Cascata
                </button>
              </div>
            </div>

            {/* Card 2: Seisan Kanriban & Controle Visual */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60 mb-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Layers className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    Seisan Kanriban & Controle Visual
                  </h3>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                    Gantt Triplo
                  </span>
                </div>

                {/* Tolerância de Atraso */}
                <div className="mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                        Tolerância de Atraso no Realizado
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        Margem para sinalizar desvio entre o Programado (Faixa 2) e o Realizado (Faixa 3).
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={valorToleranciaSeisan}
                        onChange={(e) => setLocalToleranciaSeisan(e.target.value)}
                        className="w-16 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-center font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-slate-500">min</span>
                      <button
                        onClick={handleSalvarToleranciaSeisan}
                        className="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 p-1.5 text-slate-700 dark:text-slate-200 transition-colors"
                        title="Salvar tolerância"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-slate-400">Atalhos rápidos:</span>
                    {["5", "10", "15", "30"].map((min) => (
                      <button
                        key={min}
                        onClick={async () => {
                          setLocalToleranciaSeisan(min);
                          if (token) {
                            try {
                              await updateParametro(token, "tolerancia_atraso_seisan_min", min);
                              await parametrosQuery.refetch();
                              setLocalToleranciaSeisan(null);
                              toast.success(`Tolerância ajustada para ${min} min.`);
                            } catch {
                              toast.error("Falha ao salvar tolerância.");
                            }
                          }
                        }}
                        className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors ${
                          valorToleranciaSeisan === min
                            ? "bg-emerald-600 text-white font-bold"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                        }`}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cor de Destaque */}
                <div className="border-t border-slate-100 dark:border-slate-700/60 pt-3">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block mb-1">
                    Cor de Destaque do Card Ativo na Fábrica
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleSelectCorDestaque("emerald")}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-lg border p-2 text-xs font-medium transition-all ${
                        paramCorDestaque === "emerald"
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500"
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      }`}
                    >
                      <span className="h-3 w-3 rounded-full bg-emerald-500" />
                      Verde Esmeralda
                    </button>
                    <button
                      onClick={() => handleSelectCorDestaque("blue")}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-lg border p-2 text-xs font-medium transition-all ${
                        paramCorDestaque === "blue"
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500"
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      }`}
                    >
                      <span className="h-3 w-3 rounded-full bg-blue-600" />
                      Azul Royal
                    </button>
                  </div>
                </div>
              </div>

              {/* Preview do Card */}
              <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-2.5 border border-slate-100 dark:border-slate-800">
                <div
                  className={`rounded-lg border p-2.5 shadow-sm ${
                    paramCorDestaque === "blue"
                      ? "ring-1 ring-blue-500 border-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
                      : "ring-1 ring-emerald-500 border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20"
                  }`}
                >
                  <div
                    className={`flex items-center justify-between rounded px-2 py-0.5 text-[11px] font-bold ${
                      paramCorDestaque === "blue"
                        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300"
                        : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full animate-ping ${
                          paramCorDestaque === "blue" ? "bg-blue-500" : "bg-emerald-500"
                        }`}
                      />
                      <span>EM PRODUÇÃO</span>
                    </div>
                    <span className="text-[10px] opacity-80">Posto Ativo</span>
                  </div>
                  <div className="text-xs font-semibold mt-1">PEÇA EX-9412</div>
                </div>
              </div>
            </div>

            {/* Card 3: Chão de Fábrica & Restrições Operacionais */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60 mb-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Lock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    Chão de Fábrica & Restrições
                  </h3>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    Operação Segura
                  </span>
                </div>

                {/* Bloqueio de Arraste */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700/60">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Bloqueio de Reordenação por Arraste
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 max-w-sm">
                      Quando ativado, operadores não podem arrastar cards na Produção; o fluxo segue a fila estrita.
                    </span>
                  </div>
                  <button
                    onClick={() => handleToggleBloquearArraste(!paramBloquearArraste)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      paramBloquearArraste ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        paramBloquearArraste ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Exigir Motivo de Quebra */}
                <div className="flex items-center justify-between pt-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Exigir Justificativa e Peças na Quebra
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 max-w-sm">
                      Obriga o operador a registrar o motivo e a contagem de peças produzidas ao apontar parada por avaria.
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      handleToggleParametro(
                        "exigir_motivo_quebra",
                        paramExigirQuebra,
                        "Obrigatoriedade de motivo de quebra ativada.",
                        "Obrigatoriedade de motivo de quebra desativada."
                      )
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      paramExigirQuebra ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        paramExigirQuebra ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-2.5 flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  O botão de <strong>Pausa</strong> permanece restrito estritamente a administradores do sistema.
                </span>
              </div>
            </div>

            {/* Card 4: Ferramentaria & Proteção de Qualidade */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60 mb-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    Ferramentaria & Proteção de Qualidade
                  </h3>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                    Prevenção
                  </span>
                </div>

                {/* Bloqueio por Ferramenta em Manutenção */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700/60">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Bloquear Programação com Matriz em Reparo
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 max-w-sm">
                      Impede visualmente e rejeita no backend o envio de lotes de peças cuja ferramenta esteja em manutenção ou tryout.
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      handleToggleParametro(
                        "bloquear_envio_ferramenta_manutencao",
                        paramBloquearFerramenta,
                        "Bloqueio de programação por ferramenta ativado.",
                        "Bloqueio de programação por ferramenta desativado."
                      )
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      paramBloquearFerramenta ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        paramBloquearFerramenta ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Dias de Alerta de Preventiva */}
                <div className="flex items-center justify-between pt-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Alerta de Manutenção Preventiva
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 max-w-sm">
                      Dias de antecedência para destacar ferramentas com preventiva próxima (sinal amarelo no catálogo).
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={valorDiasPreventiva}
                      onChange={(e) => setLocalDiasPreventiva(e.target.value)}
                      className="w-16 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-center font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-slate-500">dias</span>
                    <button
                      onClick={handleSalvarDiasPreventiva}
                      className="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 p-1.5 text-slate-700 dark:text-slate-200 transition-colors"
                      title="Salvar dias de preventiva"
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 p-2.5 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                <span>Status da Proteção:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Garantia de Qualidade Ativa
                </span>
              </div>
            </div>

            {/* Card 5: Tempos de Troca (SMED), Lotes de Emergência & Estoque */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60 mb-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Boxes className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    Setup (SMED), Emergência & Estoque
                  </h3>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                    Lean Manufacturing
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  Configurações de tempos de troca de ferramentas (SMED), travas quantitativas de ordens de emergência e margens preventivas de estoque.
                </p>

                {/* Tempo Padrão de Setup */}
                <div className="pb-4 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                        Tempo Padrão de Troca / Setup (SMED)
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        Tempo estimado em minutos para troca de matriz/posto entre ordens.
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={valorTempoSetup}
                        onChange={(e) => setLocalTempoSetup(e.target.value)}
                        className="w-16 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-center font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-slate-500">min</span>
                      <button
                        onClick={() =>
                          handleSalvarParametroSimples(
                            "tempo_padrao_setup_minutos",
                            valorTempoSetup,
                            `Tempo de setup definido para ${valorTempoSetup} min.`
                          )
                        }
                        className="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 p-1.5 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                        title="Salvar tempo de setup"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-slate-400">Atalhos:</span>
                    {["5", "10", "15", "20"].map((min) => (
                      <button
                        key={min}
                        onClick={() => {
                          setLocalTempoSetup(min);
                          handleSalvarParametroSimples(
                            "tempo_padrao_setup_minutos",
                            min,
                            `Tempo de setup ajustado para ${min} min.`
                          );
                        }}
                        className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors cursor-pointer ${
                          valorTempoSetup === min
                            ? "bg-emerald-600 text-white font-bold"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                        }`}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Limite Máximo de Kanbans Emergência */}
                <div className="py-4 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                        Limite Máx. de Kanbans em Ordem de Emergência
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        Teto máximo para evitar sobrecarga manual da esteira fabril.
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={valorMaxKanbansEmergencia}
                        onChange={(e) => setLocalMaxKanbansEmergencia(e.target.value)}
                        className="w-16 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-center font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        onClick={() =>
                          handleSalvarParametroSimples(
                            "limite_max_kanbans_emergencia",
                            valorMaxKanbansEmergencia,
                            `Limite de emergência definido para ${valorMaxKanbansEmergencia} kanbans.`
                          )
                        }
                        className="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 p-1.5 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                        title="Salvar limite de kanbans"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-slate-400">Atalhos:</span>
                    {["20", "50", "100"].map((k) => (
                      <button
                        key={k}
                        onClick={() => {
                          setLocalMaxKanbansEmergencia(k);
                          handleSalvarParametroSimples(
                            "limite_max_kanbans_emergencia",
                            k,
                            `Limite de emergência ajustado para ${k} kanbans.`
                          );
                        }}
                        className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors cursor-pointer ${
                          valorMaxKanbansEmergencia === k
                            ? "bg-emerald-600 text-white font-bold"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Margem de Segurança de Estoque */}
                <div className="py-4 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Margem Preventiva de Estoque (%)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      Margem de segurança para destacar alerta amarelo antes do desabastecimento crítico.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={valorMargemEstoque}
                      onChange={(e) => setLocalMargemEstoque(e.target.value)}
                      className="w-16 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-center font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-slate-500">%</span>
                    <button
                      onClick={() =>
                        handleSalvarParametroSimples(
                          "margem_seguranca_estoque_pct",
                          valorMargemEstoque,
                          `Margem de estoque ajustada para ${valorMargemEstoque}%.`
                        )
                      }
                      className="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 p-1.5 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      title="Salvar margem de estoque"
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Alerta de Lote Curto (Estamparia - Programação) */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                        Alerta de Lote Curto — Estamparia (minutos)
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        Tempo mínimo para prensas da Estamparia. Lotes menores disparam alerta visual ⚠️ LOTE CURTO na Programação.
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={10}
                        max={300}
                        value={valorLimiteLoteCurto}
                        onChange={(e) => setLocalLimiteLoteCurto(e.target.value)}
                        className="w-16 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-center font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-slate-500">min</span>
                      <button
                        onClick={() =>
                          handleSalvarParametroSimples(
                            "limite_lote_curto_minutos",
                            valorLimiteLoteCurto,
                            `Limite de lote curto da Estamparia ajustado para ${valorLimiteLoteCurto} min.`
                          )
                        }
                        className="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 p-1.5 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                        title="Salvar limite de lote curto da Estamparia"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-slate-400">Atalhos:</span>
                    {["30", "45", "60", "90"].map((min) => (
                      <button
                        key={min}
                        onClick={() => {
                          setLocalLimiteLoteCurto(min);
                          handleSalvarParametroSimples(
                            "limite_lote_curto_minutos",
                            min,
                            `Limite de lote curto da Estamparia ajustado para ${min} min.`
                          );
                        }}
                        className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors cursor-pointer ${
                          valorLimiteLoteCurto === min
                            ? "bg-emerald-600 text-white font-bold"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                        }`}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Alerta de Lote Curto (Solda - Programação) */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                        Alerta de Lote Curto — Solda (minutos)
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        Tempo mínimo para ponteadeiras e células da Solda. Lotes menores disparam alerta visual ⚠️ LOTE CURTO na Programação.
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={10}
                        max={300}
                        value={valorLimiteLoteCurtoSolda}
                        onChange={(e) => setLocalLimiteLoteCurtoSolda(e.target.value)}
                        className="w-16 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-center font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-slate-500">min</span>
                      <button
                        onClick={() =>
                          handleSalvarParametroSimples(
                            "limite_lote_curto_solda_minutos",
                            valorLimiteLoteCurtoSolda,
                            `Limite de lote curto da Solda ajustado para ${valorLimiteLoteCurtoSolda} min.`
                          )
                        }
                        className="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 p-1.5 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                        title="Salvar limite de lote curto da Solda"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-slate-400">Atalhos:</span>
                    {["30", "45", "60", "90"].map((min) => (
                      <button
                        key={min}
                        onClick={() => {
                          setLocalLimiteLoteCurtoSolda(min);
                          handleSalvarParametroSimples(
                            "limite_lote_curto_solda_minutos",
                            min,
                            `Limite de lote curto da Solda ajustado para ${min} min.`
                          );
                        }}
                        className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors cursor-pointer ${
                          valorLimiteLoteCurtoSolda === min
                            ? "bg-emerald-600 text-white font-bold"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                        }`}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>


              <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 p-2.5 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                <span>Controle de Estoque:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Alerta Preventivo Ativo
                </span>
              </div>
            </div>

            {/* Card 6: Monitoramento Ao Vivo, Supervisão & Automação de Fábrica */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60 mb-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    Monitoramento Ao Vivo & Automação
                  </h3>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                    Tempo Real & UX
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  Controle da taxa de atualização do painel, precisão de cronômetros em segundos, avisos sonoros e alertas da supervisão.
                </p>

                {/* Intervalo de Refresh Automático */}
                <div className="pb-3 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                        Intervalo de Atualização em Segundo Plano
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        Frequência de recarga automática do quadro (segundos).
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={5}
                        max={300}
                        value={valorIntervaloRefresh}
                        onChange={(e) => setLocalIntervaloRefresh(e.target.value)}
                        className="w-16 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs text-center font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-slate-500">seg</span>
                      <button
                        onClick={() =>
                          handleSalvarParametroSimples(
                            "intervalo_refresh_automatico_seg",
                            valorIntervaloRefresh,
                            `Atualização em segundo plano definida para ${valorIntervaloRefresh}s.`
                          )
                        }
                        className="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 p-1.5 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                        title="Salvar intervalo de refresh"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-slate-400">Atalhos:</span>
                    {["15", "30", "60"].map((seg) => (
                      <button
                        key={seg}
                        onClick={() => {
                          setLocalIntervaloRefresh(seg);
                          handleSalvarParametroSimples(
                            "intervalo_refresh_automatico_seg",
                            seg,
                            `Atualização definida para ${seg} segundos.`
                          );
                        }}
                        className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors cursor-pointer ${
                          valorIntervaloRefresh === seg
                            ? "bg-indigo-600 text-white font-bold"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                        }`}
                      >
                        {seg}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* Exibir Segundos no Cronômetro */}
                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700/60">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Precisão com Segundos nos Cronômetros
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      Exibe HH:MM:SS nos lotes em produção e medições de tempos de ciclo.
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      handleToggleParametro(
                        "exibir_segundos_cronometro",
                        paramExibirSegundos,
                        "Cronômetro com segundos ativado.",
                        "Cronômetro com segundos desativado."
                      )
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      paramExibirSegundos ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        paramExibirSegundos ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Notificar Parada para Liderança */}
                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700/60">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Alerta Imediato à Liderança em Paradas / Quebras
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      Destaca com tarja de atenção no topo de todas as telas ao ocorrer quebra.
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      handleToggleParametro(
                        "notificar_parada_maquina_lideranca",
                        paramNotificarParada,
                        "Notificação à liderança ativada.",
                        "Notificação à liderança desativada."
                      )
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      paramNotificarParada ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        paramNotificarParada ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Alertas Sonoros de Fábrica */}
                <div className="flex items-center justify-between pt-3">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Alertas Sonoros de Apontamento & Eventos
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      Feedback sonoro de confirmação ao iniciar, concluir ou registrar paradas.
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      handleToggleParametro(
                        "habilitar_sons_apontamento",
                        paramHabilitarSons,
                        "Feedback sonoro ativado.",
                        "Feedback sonoro desativado."
                      )
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      paramHabilitarSons ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        paramHabilitarSons ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 p-2.5 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                <span>Transmissão em Tempo Real:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  WebSocket Broadcast Ativo
                </span>
              </div>
            </div>
          </div>

          {/* Seção Especial: Configurador do Modelo de Resumo do Lote (Anotações do Card) */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700/60 mb-6 gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  Configurador do Modelo de Resumo do Lote (Anotações do Card)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
                  Personalize os blocos de texto, campos e a ordem em que aparecem ao clicar no botão{" "}
                  <strong className="text-slate-700 dark:text-slate-300">"✨ Preencher Resumo do Lote"</strong> no modal de detalhes do card.
                  A configuração é independente para a <strong className="text-amber-600 dark:text-amber-400">Solda</strong> e para a{" "}
                  <strong className="text-blue-600 dark:text-blue-400">Estamparia</strong>.
                </p>
              </div>

              {/* Seletor de Setor Fabril (Pílulas / Abas) */}
              <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setSetorResumoAtivo("solda")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    setorResumoAtivo === "solda"
                      ? "bg-amber-500 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" />
                  ⚡ Solda
                </button>
                <button
                  type="button"
                  onClick={() => setSetorResumoAtivo("estamparia")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    setorResumoAtivo === "estamparia"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <Factory className="h-3.5 w-3.5" />
                  🏭 Estamparia
                </button>
              </div>
            </div>

            {/* Grid 2 Colunas: Configuração à Esquerda, Live Preview à Direita */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Coluna 1: Lista Ordenável com Checkboxes (7 cols) */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <ListOrdered className="h-4 w-4 text-slate-400" />
                      Blocos de Informações ({blocosAtivosCount} de {configResumoAtiva.length} ativos)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Use as setas ↑ ↓ para reordenar a sequência
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                    {configResumoAtiva.map((config, index) => {
                      const blocoDef = mapBlocosDisponiveis.get(config.id);
                      if (!blocoDef) return null;
                      const isPrimeiro = index === 0;
                      const isUltimo = index === configResumoAtiva.length - 1;

                      return (
                        <div
                          key={config.id}
                          className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-all ${
                            config.ativo
                              ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-2xs"
                              : "bg-slate-50 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              id={`bloco-${setorResumoAtivo}-${config.id}`}
                              checked={config.ativo}
                              onChange={() => handleToggleBlocoResumo(config.id)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="text-lg shrink-0" aria-hidden="true">
                              {blocoDef.icone}
                            </span>
                            <div className="min-w-0">
                              <label
                                htmlFor={`bloco-${setorResumoAtivo}-${config.id}`}
                                className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate cursor-pointer"
                              >
                                {blocoDef.label}
                              </label>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                                {blocoDef.descricao}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                blocoDef.aplicavel === "solda"
                                  ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                                  : blocoDef.aplicavel === "estamparia"
                                  ? "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                              }`}
                            >
                              {blocoDef.aplicavel === "solda"
                                ? "Solda"
                                : blocoDef.aplicavel === "estamparia"
                                ? "Estamparia"
                                : "Ambos"}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleMoverBlocoResumo(index, "cima")}
                              disabled={isPrimeiro}
                              title="Mover para cima"
                              className={`p-1 rounded transition-colors ${
                                isPrimeiro
                                  ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                              }`}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoverBlocoResumo(index, "baixo")}
                              disabled={isUltimo}
                              title="Mover para baixo"
                              className={`p-1 rounded transition-colors ${
                                isUltimo
                                  ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                              }`}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Blocos ausentes para adicionar */}
                  {blocosAusentes.length > 0 && (
                    <div className="mt-3 p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
                      <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 block mb-1.5">
                        + Blocos disponíveis para incluir no setor:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {blocosAusentes.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => handleAdicionarBlocoAusente(b.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors cursor-pointer"
                          >
                            <span>{b.icone}</span>
                            <span>{b.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Rodapé com botões de ação */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleRestaurarPadraoResumo}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                    Restaurar Padrão {setorResumoAtivo === "solda" ? "da Solda" : "da Estamparia"}
                  </button>

                  <button
                    type="button"
                    disabled={salvandoTemplateResumo}
                    onClick={handleSalvarTemplateResumo}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-1.5 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {salvandoTemplateResumo ? "Salvando..." : `Salvar Template (${setorResumoAtivo === "solda" ? "Solda" : "Estamparia"})`}
                  </button>
                </div>
              </div>

              {/* Coluna 2: Live Preview em Tempo Real (5 cols) */}
              <div className="lg:col-span-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Eye className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Preview ao Vivo (Resultado no Card)
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                      {setorResumoAtivo === "solda" ? "Exemplo Solda (51834291-EB)" : "Exemplo Estamparia (52048119)"}
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 shadow-inner relative group">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-[10px] text-slate-400 font-mono">
                      <span>TEXTO GERADO NAS ANOTAÇÕES</span>
                      <span>FONTE MONO</span>
                    </div>
                    <pre className="font-mono text-[11px] text-emerald-400 whitespace-pre-wrap break-all leading-relaxed max-h-[380px] overflow-y-auto pr-1">
                      {textoPreview || "(Nenhum bloco ativo selecionado)"}
                    </pre>
                  </div>
                </div>

                <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 p-2.5 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                  <span>Atualização do Texto:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Reativo em Tempo Real
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Rodapé: Padrões Lean TPS & Restauração Rápida */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-emerald-50/30 dark:from-slate-800/60 dark:to-emerald-950/20 p-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 dark:bg-emerald-950/60 p-2 text-emerald-700 dark:text-emerald-300 shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Diretrizes Lean TPS & Boas Práticas Fabris
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Os parâmetros padrão seguem a metodologia de sequenciamento Toyota Production System (TPS): 1ºT 06:20, 2ºT 14:40, 3ºT 23:00 e pausa de 40min.
                </p>
              </div>
            </div>

            <button
              onClick={handleResetarPadroesLean}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 text-xs font-semibold shadow-sm transition-colors shrink-0"
            >
              <RotateCcw className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Restaurar Padrões Lean TPS
            </button>
          </div>
        </div>
      )}

      {/* Conteúdo Aba: Linhas de Produção */}
      {abaAtiva === "linhas" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1: Formulário de Nova Linha */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-6 shadow-sm h-fit">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
              <Plus className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Cadastrar Nova Linha
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Associe a linha fabril ao setor adequado. Ela ficará visível nos menus e no Kanban de produção.
            </p>

            {!podeGerenciarLinhas ? (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-4 text-xs text-amber-800 dark:text-amber-300">
                <Lock className="h-4 w-4 inline mr-1 text-amber-600" />
                Apenas administradores ou usuários com permissão podem cadastrar novas linhas.
              </div>
            ) : (
              <form onSubmit={handleCriarLinha} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    Nome da Linha *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ex: LINHA 5"
                    value={novaLinhaNome}
                    onChange={(e) => setNovaLinhaNome(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                    Setor Fabril *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNovaLinhaSetor("solda")}
                      className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-semibold transition-all ${
                        novaLinhaSetor === "solda"
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500"
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      Solda
                    </button>
                    <button
                      type="button"
                      onClick={() => setNovaLinhaSetor("estamparia")}
                      className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-semibold transition-all ${
                        novaLinhaSetor === "estamparia"
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500"
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <Factory className="h-3.5 w-3.5 text-blue-500" />
                      Estamparia
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    Descrição / Célula (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ex: Célula de soldagem robotizada"
                    value={novaLinhaDesc}
                    onChange={(e) => setNovaLinhaDesc(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={salvandoLinha || !novaLinhaNome.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors mt-2"
                >
                  <Plus className="h-4 w-4" />
                  {salvandoLinha ? "Salvando..." : "Cadastrar Linha"}
                </button>
              </form>
            )}
          </div>

          {/* Coluna 2 e 3: Listagem de Linhas */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-700/60">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Linhas Cadastradas ({linhasQuery.data?.length ?? 0})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Visualização segregada por setor com ordenação operacional.
                </p>
              </div>

              {/* Filtro por Setor */}
              <div className="flex rounded-lg bg-slate-100 dark:bg-slate-700/60 p-1 text-xs font-semibold">
                <button
                  onClick={() => setFiltroSetorLinha("todos")}
                  className={`rounded-md px-3 py-1.5 transition-all ${
                    filtroSetorLinha === "todos"
                      ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFiltroSetorLinha("solda")}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 transition-all ${
                    filtroSetorLinha === "solda"
                      ? "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  <Zap className="h-3 w-3 text-amber-500" />
                  Solda
                </button>
                <button
                  onClick={() => setFiltroSetorLinha("estamparia")}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 transition-all ${
                    filtroSetorLinha === "estamparia"
                      ? "bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  <Factory className="h-3 w-3 text-blue-500" />
                  Estamparia
                </button>
              </div>
            </div>

            {linhasQuery.isLoading ? (
              <div className="py-12 text-center text-sm text-slate-500 animate-pulse">
                Carregando linhas cadastradas...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {(linhasQuery.data ?? [])
                  .filter((l) => filtroSetorLinha === "todos" || l.setor === filtroSetorLinha)
                  .map((linha) => {
                    const isSolda = linha.setor === "solda";
                    return (
                      <div
                        key={linha.id}
                        className="group flex items-start justify-between rounded-xl border border-slate-200 dark:border-slate-700/70 bg-slate-50/50 dark:bg-slate-900/30 p-4 transition-all hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 rounded-lg p-2 ${
                              isSolda
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400"
                            }`}
                          >
                            {isSolda ? <Zap className="h-4 w-4" /> : <Factory className="h-4 w-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                {linha.nome}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  isSolda
                                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40"
                                    : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40"
                                }`}
                              >
                                {isSolda ? "Solda" : "Estamparia"}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {linha.descricao || "Sem descrição informada"}
                            </p>
                          </div>
                        </div>

                        {podeGerenciarLinhas && (
                          <button
                            onClick={() => handleRemoverLinha(linha.id, linha.nome, linha.setor)}
                            title="Remover linha"
                            className="rounded-lg p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors opacity-80 group-hover:opacity-100"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                {(linhasQuery.data ?? []).filter((l) => filtroSetorLinha === "todos" || l.setor === filtroSetorLinha).length === 0 && (
                  <div className="col-span-2 py-12 text-center text-sm text-slate-400">
                    Nenhuma linha encontrada para o filtro selecionado.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo Aba: Cargos e Permissões */}
      {abaAtiva === "cargos" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1: Lista de Cargos */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-4 shadow-sm flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Cargos ({cargos.length})
              </h2>
              <button
                onClick={() => {
                  setModoNovoCargo(true);
                  setCargoSelecionado(null);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo Cargo
              </button>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto">
              {cargos.map((c) => {
                const isSelected = !modoNovoCargo && cargoSelecionado?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setModoNovoCargo(false);
                      setCargoSelecionado({ ...c });
                    }}
                    className={`cursor-pointer rounded-lg border p-3 transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm"
                        : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {c.nome}
                      </span>
                      {c.is_sistema ? (
                        <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                          Sistema
                        </span>
                      ) : (
                        <span className="rounded bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                          Custom
                        </span>
                      )}
                    </div>
                    {c.descricao && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                        {c.descricao}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coluna 2 e 3: Matriz de Permissões e Edição */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-6 shadow-sm">
            {modoNovoCargo ? (
              /* Formulário de Criação */
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Plus className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      Criar Novo Cargo
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Defina o identificador do cargo e selecione as permissões de acesso.
                    </p>
                  </div>
                  <button
                    onClick={handleCriarNovoCargo}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors"
                  >
                    <Save className="h-4 w-4" />
                    Salvar Cargo
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                      Identificador / Nome (ex: supervisor, lider)
                    </label>
                    <input
                      type="text"
                      placeholder="ex: supervisor_solda"
                      value={novoCargoNome}
                      onChange={(e) => setNovoCargoNome(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                      Descrição Amigável
                    </label>
                    <input
                      type="text"
                      placeholder="ex: Supervisor de Produção Linha 1"
                      value={novoCargoDesc}
                      onChange={(e) => setNovoCargoDesc(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  Permissões de Acesso
                </h3>
                <div className="space-y-3">
                  {PERMISSOES_INFO.map((perm) => (
                    <label
                      key={perm.chave}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-700/60 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(novoCargoPermissoes[perm.chave])}
                        onChange={(e) =>
                          setNovoCargoPermissoes((prev) => ({
                            ...prev,
                            [perm.chave]: e.target.checked,
                          }))
                        }
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 block">
                          {perm.label}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                          {perm.desc}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ) : cargoSelecionado ? (
              /* Edição de Cargo Selecionado */
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      Cargo: {cargoSelecionado.nome}
                      {cargoSelecionado.is_sistema && (
                        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                          (Cargo padrão do sistema)
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {cargoSelecionado.nome === "admin"
                        ? "O cargo de Administrador possui todas as permissões liberadas permanentemente."
                        : "Configure as opções de acesso para este perfil."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!cargoSelecionado.is_sistema && (
                      <button
                        onClick={() => handleExcluirCargo(cargoSelecionado.id, cargoSelecionado.nome)}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 px-3 py-1.5 text-xs font-semibold transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    )}
                    <button
                      onClick={handleSalvarCargoExistente}
                      disabled={cargoSelecionado.nome === "admin"}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors"
                    >
                      <Save className="h-4 w-4" />
                      Salvar Alterações
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    Descrição
                  </label>
                  <input
                    type="text"
                    value={cargoSelecionado.descricao ?? ""}
                    onChange={(e) =>
                      setCargoSelecionado({ ...cargoSelecionado, descricao: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  Permissões do Cargo
                </h3>
                <div className="space-y-3">
                  {PERMISSOES_INFO.map((perm) => {
                    const isDisabled = cargoSelecionado.nome === "admin";
                    const isChecked = cargoSelecionado.nome === "admin" || Boolean(cargoSelecionado[perm.chave]);

                    return (
                      <label
                        key={perm.chave}
                        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                          isDisabled ? "opacity-75 cursor-not-allowed bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer border-slate-200 dark:border-slate-700/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isDisabled}
                          checked={isChecked}
                          onChange={(e) =>
                            setCargoSelecionado({
                              ...cargoSelecionado,
                              [perm.chave]: e.target.checked,
                            })
                          }
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            {perm.label}
                            {isChecked && (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            )}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                            {perm.desc}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 dark:text-slate-400">
                <ShieldCheck className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                  Nenhum cargo selecionado
                </p>
                <p className="text-xs max-w-sm mt-1">
                  Selecione um cargo na lista ao lado para inspecionar e editar permissões, ou clique em <strong>Novo Cargo</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
