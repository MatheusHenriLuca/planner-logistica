import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Sparkles,
  Save,
  CheckSquare,
  MessageSquare,
  Tag,
  Clock,
  Package,
  Boxes,
  Layers,
  X,
  Edit3,
} from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import {
  atualizarAnotacoesItem,
  atualizarChecklistItem,
  criarChecklistItem,
  criarComentario,
  getParametros,
  listarCatalogoLabels,
  listarChecklist,
  listarComentarios,
  listarLabelsDoItem,
  removerChecklistItem,
  substituirLabelsDoItem,
} from "../../services/api";
import type { ItemProducao } from "../../types/producao";
import { parseCardDadosProducao } from "../../utils/cardComponents";
import { parseTemplateConfig, gerarTextoResumoLote } from "../../utils/resumoTemplate";
import { obterPostoSap, calcularDataProgramada } from "../../utils/postos";

interface ItemDetalheProps {
  item: ItemProducao;
  onClose: () => void;
  onSolicitarEditarItem?: (item: ItemProducao) => void;
}

export function ItemDetalhe({ item, onClose, onSolicitarEditarItem }: ItemDetalheProps) {
  const { token, role } = useAuth();
  const queryClient = useQueryClient();
  const itemId = item.id as number;

  const podeEditarAnotacoes = role === "admin" || role === "programador";
  const isFinalizado = Boolean(item.fim_real || item.motivo_interrupcao === "quebra");

  // Estados locais
  const [anotacoes, setAnotacoes] = useState(item.anotacoes ?? "");
  const [mostrarNoQuadro, setMostrarNoQuadro] = useState(Boolean(item.mostrar_anotacoes_quadro));
  const [salvandoAnotacoes, setSalvandoAnotacoes] = useState(false);
  const [anotacoesExpandidas, setAnotacoesExpandidas] = useState(true);

  const [novoPasso, setNovoPasso] = useState("");
  const [novoComentario, setNovoComentario] = useState("");

  const dadosProd = parseCardDadosProducao(item);
  const totalPecas = (item.kanbans || 0) * (item.qtd_por_kanban || 0);

  const postoSap = item.posto_sap || obterPostoSap(item.posto_trabalho, item.setor);
  const dataProgIso = item.data_programada || calcularDataProgramada(item.hora_inicial, item.turno);
  const dataProgFmt = dataProgIso
    ? new Date(`${dataProgIso}T12:00:00`).toLocaleDateString("pt-BR")
    : "—";

  const checklistQuery = useQuery({
    queryKey: ["item-checklist", itemId],
    queryFn: () => listarChecklist(token as string, itemId),
    enabled: Boolean(token),
    retry: false,
  });

  const catalogoLabelsQuery = useQuery({
    queryKey: ["catalogo-labels"],
    queryFn: () => listarCatalogoLabels(token as string),
    enabled: Boolean(token),
    retry: false,
  });

  const labelsDoItemQuery = useQuery({
    queryKey: ["item-labels", itemId],
    queryFn: () => listarLabelsDoItem(token as string, itemId),
    enabled: Boolean(token),
    retry: false,
  });

  const comentariosQuery = useQuery({
    queryKey: ["item-comentarios", itemId],
    queryFn: () => listarComentarios(token as string, itemId),
    enabled: Boolean(token),
    retry: false,
  });

  const parametrosQuery = useQuery({
    queryKey: ["parametros-sistema"],
    queryFn: () => getParametros(token as string),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });

  // Atualiza estado local se o item mudar externamente
  useEffect(() => {
    setAnotacoes(item.anotacoes ?? "");
    setMostrarNoQuadro(Boolean(item.mostrar_anotacoes_quadro));
  }, [item.anotacoes, item.mostrar_anotacoes_quadro]);

  async function handleToggleChecklistItem(checklistItemId: number, concluido: boolean) {
    if (!token) return;
    await atualizarChecklistItem(token, itemId, checklistItemId, { concluido });
    await checklistQuery.refetch();
  }

  async function handleRenomearChecklistItem(checklistItemId: number, texto: string) {
    if (!token) return;
    await atualizarChecklistItem(token, itemId, checklistItemId, { texto });
    await checklistQuery.refetch();
  }

  async function handleAdicionarPasso() {
    if (!token || !novoPasso.trim()) return;
    const ordem = (checklistQuery.data?.length ?? 0) + 1;
    await criarChecklistItem(token, itemId, { texto: novoPasso, ordem });
    setNovoPasso("");
    await checklistQuery.refetch();
  }

  async function handleRemoverPasso(checklistItemId: number) {
    if (!token) return;
    await removerChecklistItem(token, itemId, checklistItemId);
    await checklistQuery.refetch();
  }

  async function handleAlternarLabel(labelId: number) {
    if (!token) return;
    const atuais = labelsDoItemQuery.data ?? [];
    const jaSelecionada = atuais.some((label) => label.id === labelId);
    const novoConjunto = jaSelecionada
      ? atuais.filter((label) => label.id !== labelId).map((label) => label.id)
      : [...atuais.map((label) => label.id), labelId];
    await substituirLabelsDoItem(token, itemId, novoConjunto);
    await labelsDoItemQuery.refetch();
    queryClient.invalidateQueries({ queryKey: ["tabela-b"] });
    queryClient.invalidateQueries({ queryKey: ["sequencia"] });
  }

  async function handleSalvarAnotacoes() {
    if (!token) return;
    setSalvandoAnotacoes(true);
    try {
      await atualizarAnotacoesItem(token, itemId, {
        anotacoes,
        mostrar_anotacoes_quadro: mostrarNoQuadro,
      });
      item.anotacoes = anotacoes;
      item.mostrar_anotacoes_quadro = mostrarNoQuadro;
      toast.success("Anotações salvas com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["tabela-b"] });
      queryClient.invalidateQueries({ queryKey: ["sequencia"] });
    } catch {
      toast.error("Erro ao salvar anotações.");
    } finally {
      setSalvandoAnotacoes(false);
    }
  }

  function handleGerarResumoLote() {
    const setorItem: "solda" | "estamparia" = dadosProd.isEstamparia ? "estamparia" : "solda";
    const parametros = parametrosQuery.data ?? [];
    const chave = setorItem === "estamparia" ? "template_resumo_estamparia" : "template_resumo_solda";
    const templateJson = parametros.find((p) => p.chave === chave)?.valor;

    const config = parseTemplateConfig(templateJson, setorItem);
    const resumo = gerarTextoResumoLote(item, config);

    setAnotacoes((prev) => (prev.trim() ? `${prev}\n\n${resumo}` : resumo));
    toast.info(`Resumo da ordem gerado com base no modelo de ${setorItem === "estamparia" ? "Estamparia" : "Solda"}!`);
  }

  async function handleEnviarComentario() {
    if (!token || !novoComentario.trim()) return;
    await criarComentario(token, itemId, { texto: novoComentario });
    setNovoComentario("");
    await comentariosQuery.refetch();
  }

  const checklist = checklistQuery.data ?? [];
  const catalogoLabels = catalogoLabelsQuery.data ?? [];
  const labelsDoItem = labelsDoItemQuery.data ?? [];
  const comentarios = comentariosQuery.data ?? [];

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-xs p-3 md:p-6 overflow-hidden"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${
          anotacoesExpandidas ? "max-w-5xl" : "max-w-2xl"
        } max-h-[92vh] flex flex-col md:flex-row overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 transition-all duration-300 animate-in fade-in zoom-in-95`}
      >
        {/* ============================================================== */}
        {/* PAINEL ESQUERDO: ANOTAÇÕES DO LOTE (DESTAQUE & EXPANSÍVEL)     */}
        {/* ============================================================== */}
        {anotacoesExpandidas ? (
          <aside className="w-full md:w-[420px] lg:w-[460px] shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/60 p-5 flex flex-col justify-between overflow-y-auto">
            <div>
              {/* Topo do painel de anotações */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Anotações
                    </h3>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      {podeEditarAnotacoes ? "Edição permitida (programador/admin)" : "Orientação oficial (somente leitura)"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAnotacoesExpandidas(false)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Minimizar anotações para o lado"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Minimizar</span>
                </button>
              </div>

              {/* Área do texto */}
              {podeEditarAnotacoes ? (
                <div className="space-y-3">
                  <textarea
                    value={anotacoes}
                    onChange={(e) => setAnotacoes(e.target.value)}
                    rows={16}
                    placeholder="Insira detalhes da ordem, códigos de VtoV/estampado, matéria-prima, embalagem ou notas da programação..."
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 font-mono text-xs leading-relaxed text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none shadow-inner resize-none min-h-[380px] md:min-h-[440px]"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {anotacoes.trim() ? (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap min-h-[380px] md:min-h-[440px] overflow-y-auto">
                      {anotacoes}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-xs text-slate-400 italic min-h-[280px] flex items-center justify-center">
                      Nenhuma anotação registrada pelo programador para este lote.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Rodapé de Ações do Painel de Anotações */}
            <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2.5">
              {podeEditarAnotacoes ? (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleGerarResumoLote}
                      className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      title="Regenera o resumo completo do lote"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Preencher Resumo</span>
                    </button>

                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={mostrarNoQuadro}
                        onChange={(e) => setMostrarNoQuadro(e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Mostrar no quadro</span>
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {anotacoes.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(anotacoes);
                          toast.success("Anotações copiadas para a área de transferência!");
                        }}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={salvandoAnotacoes}
                      onClick={handleSalvarAnotacoes}
                      className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{salvandoAnotacoes ? "Salvando..." : "Salvar Anotações"}</span>
                    </button>
                  </div>
                </>
              ) : (
                anotacoes.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(anotacoes);
                      toast.success("Anotações copiadas para a área de transferência!");
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Anotações</span>
                  </button>
                )
              )}
            </div>
          </aside>
        ) : (
          /* Barra recolhida / minimizada */
          <aside
            onClick={() => setAnotacoesExpandidas(true)}
            className="hidden md:flex flex-col items-center justify-between py-4 px-2 w-12 shrink-0 bg-slate-100/90 dark:bg-slate-800/80 border-r border-slate-200 dark:border-slate-700 select-none cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
            title="Clique para expandir o painel de anotações"
          >
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAnotacoesExpandidas(true);
                }}
                className="p-1.5 rounded-lg bg-white dark:bg-slate-700 shadow-2xs text-indigo-600 dark:text-indigo-400 hover:scale-105 transition-transform"
                title="Expandir anotações"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <FileText className="w-4 h-4 text-slate-400 mt-2" />
            </div>

            <div className="writing-vertical -rotate-90 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Anotações do Lote
            </div>

            <div className="w-2 h-2 rounded-full bg-indigo-500" />
          </aside>
        )}

        {/* ============================================================== */}
        {/* PAINEL DIREITO: CARD CENTRAL & DETALHES GERAIS DA ORDEM       */}
        {/* ============================================================== */}
        <main className="flex-1 p-6 overflow-y-auto max-h-[92vh] flex flex-col gap-5">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {item.linha}
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {item.posto_trabalho} {postoSap ? `(${postoSap})` : ""}
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {item.turno}º Turno • Patan {item.patan}
                </span>
              </div>
              <h2 className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-2 flex-wrap">
                {item.material?.includes(" / ") ? (
                  <>
                    <span>{item.material.split(" / ")[0]}</span>
                    <span className="text-amber-500 dark:text-amber-400 font-bold">/</span>
                    <span>{item.material.split(" / ")[1]}</span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 shadow-2xs">
                      ♊ Peça Dupla (Espelho)
                    </span>
                  </>
                ) : (
                  item.material || "Item Sem Código"
                )}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {!anotacoesExpandidas && (
                <button
                  type="button"
                  onClick={() => setAnotacoesExpandidas(true)}
                  className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors shadow-2xs cursor-pointer"
                  title="Expandir painel de anotações à esquerda"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Anotações</span>
                </button>
              )}

              {!isFinalizado && podeEditarAnotacoes && onSolicitarEditarItem && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSolicitarEditarItem(item);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 px-2.5 py-1.5 text-xs font-black shadow-xs transition-all cursor-pointer"
                  title="Editar horários e parâmetros deste lote em produção"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar em Produção</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Fechar (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Card Central com Métricas Oficiais da Ordem */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 shadow-2xs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 font-sans block mb-1">
                  ⏱️ Horário Planejado
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {item.hora_inicial ? item.hora_inicial.slice(11, 16) : "--:--"}
                  {item.hora_final ? ` - ${item.hora_final.slice(11, 16)}` : ""}
                </span>
                {dadosProd.duracaoMinutos > 0 && (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    {dadosProd.duracaoMinutos} min {item.almoco_incluso ? "🍽️" : ""}
                  </span>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 font-sans block mb-1">
                  📦 Volume do Lote
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {item.kanbans} kanbans
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5">
                  {totalPecas.toLocaleString("pt-BR")} pçs ({item.qtd_por_kanban} pçs/cx)
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 font-sans block mb-1">
                  🏷️ Embalagem Oficial
                </span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 block truncate" title={dadosProd.embalagem || "Não informada"}>
                  {dadosProd.embalagem ? dadosProd.embalagem : "—"}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
                  {dadosProd.embalagem ? "Abastecimento" : "Sem código"}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 font-sans block mb-1">
                  🔢 Sequência Fila
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {item.sequencia > 0 ? `Seq #${item.sequencia}` : "Seq #0 (Crítico)"}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  {item.is_critico ? "🔴 Quarentena" : "🟢 Produção Regular"}
                </span>
              </div>
            </div>

            {/* Posto SAP (Real) e Data Programada */}
            <div className="mt-2.5 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 font-mono text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-slate-500 dark:text-slate-400 font-sans font-bold">🏢 Posto SAP:</span>
                <span className="font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200/80 dark:border-slate-700">
                  {postoSap || "—"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-slate-500 dark:text-slate-400 font-sans font-bold">📅 Data Programada:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200/80 dark:border-slate-700">
                  {dataProgFmt}
                </span>
              </div>
            </div>

            {dadosProd.isEstamparia && dadosProd.dadosEstamparia.materiaPrimaCodigo && (
              <div
                className={`mt-2.5 p-3 rounded-lg border font-mono text-xs transition-colors ${
                  dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque == null
                    ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200/70 dark:border-indigo-800/60"
                    : !dadosProd.dadosEstamparia.materiaPrimaTemFalta
                    ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60"
                    : "bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/60"
                }`}
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-700 dark:text-indigo-300">⚖️ Matéria-Prima:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{dadosProd.dadosEstamparia.materiaPrimaCodigo}</span>
                    {dadosProd.dadosEstamparia.consumoUnitarioKg && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                        ({dadosProd.dadosEstamparia.consumoUnitarioKg} kg/pç)
                      </span>
                    )}
                  </div>
                  {dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque != null ? (
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                        !dadosProd.dadosEstamparia.materiaPrimaTemFalta
                          ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300/80 dark:border-emerald-700/60"
                          : "bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border border-rose-300/80 dark:border-rose-700/60"
                      }`}
                    >
                      {!dadosProd.dadosEstamparia.materiaPrimaTemFalta ? "✓ Estoque Suficiente" : "⚠️ Falta de Matéria-Prima"}
                    </span>
                  ) : (
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">
                      {dadosProd.dadosEstamparia.materiaPrimaKg != null ? `${dadosProd.dadosEstamparia.materiaPrimaKg.toLocaleString("pt-BR")} KG` : "—"}
                    </span>
                  )}
                </div>

                {dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque != null && (
                  <div className="flex items-center justify-between pt-2 text-xs">
                    <span className="text-slate-600 dark:text-slate-300">
                      Disponível em Estoque:{" "}
                      <strong
                        className={
                          !dadosProd.dadosEstamparia.materiaPrimaTemFalta
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-rose-700 dark:text-rose-400"
                        }
                      >
                        {dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                      </strong>
                    </span>
                    <span className="text-slate-700 dark:text-slate-200">
                      Necessário para o Lote:{" "}
                      <strong>
                        {(dadosProd.dadosEstamparia.materiaPrimaKg || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            {dadosProd.isSolda && dadosProd.componentesSolda.length > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 p-3">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <span>📦</span>
                      <span>Componentes da Montagem (BOM / Insumos)</span>
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    {dadosProd.componentesSolda.length} componente(s)
                  </span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {dadosProd.componentesSolda.map((comp, idx) => {
                    const statusOk = !comp.temFalta;
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs font-mono transition-all ${
                          statusOk
                            ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200"
                            : "bg-rose-50/70 dark:bg-rose-950/30 border-rose-200/90 dark:border-rose-800/70 text-rose-900 dark:text-rose-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                              comp.tipo === "EST"
                                ? "bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                                : comp.tipo === "MP"
                                ? "bg-indigo-100 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300"
                                : "bg-sky-100 dark:bg-sky-950/60 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-300"
                            }`}
                          >
                            {comp.tipo}
                          </span>
                          <div className="truncate">
                            <span className="font-bold text-slate-900 dark:text-slate-100 block truncate">
                              {comp.codigo}
                            </span>
                            {comp.descricao && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans block truncate max-w-[200px]">
                                {comp.descricao}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 text-right">
                          <div>
                            <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block font-sans">
                              Em Estoque
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {comp.saldoLivre.toLocaleString("pt-BR")} pçs
                            </span>
                          </div>

                          <div
                            className={`px-2 py-1 rounded-md border font-bold text-[11px] ${
                              statusOk
                                ? "bg-emerald-100 dark:bg-emerald-900/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200"
                                : "bg-rose-100 dark:bg-rose-900/60 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200"
                            }`}
                          >
                            <span className="text-[9px] uppercase font-bold block font-sans opacity-80">
                              Necessário
                            </span>
                            <span>
                              {comp.qtdNecessaria.toLocaleString("pt-BR")} pçs
                              {statusOk ? " ✓" : " ⚠️ Falta"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>


          {/* Seção 1: Labels / Etiquetas */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                <span>Etiquetas / Máquinas</span>
              </h3>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                {labelsDoItem.length} selecionada(s)
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
              {catalogoLabels.length === 0 ? (
                <span className="text-xs text-slate-400 italic p-1">Nenhuma etiqueta cadastrada.</span>
              ) : (
                catalogoLabels.map((label) => {
                  const selecionada = labelsDoItem.some((atual) => atual.id === label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => handleAlternarLabel(label.id)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold text-white transition-all cursor-pointer shadow-2xs flex items-center gap-1 ${
                        selecionada
                          ? "ring-2 ring-offset-1 ring-slate-700 dark:ring-white scale-100 opacity-100"
                          : "opacity-40 hover:opacity-80 scale-95"
                      }`}
                      style={{ backgroundColor: label.cor }}
                      title={selecionada ? "Clique para remover" : "Clique para atribuir"}
                    >
                      <span>{label.nome}</span>
                      {selecionada && <span className="text-[10px]">✓</span>}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Seção 2: Checklist Oficial */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                <span>Lista de Verificação (Checklist)</span>
              </h3>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                {checklist.filter((p) => p.concluido).length}/{checklist.length} concluído(s)
              </span>
            </div>

            <ul className="flex flex-col gap-1.5">
              {checklist.map((passo) => (
                <li
                  key={passo.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/80 px-2.5 py-1.5 shadow-2xs"
                >
                  <input
                    type="checkbox"
                    checked={passo.concluido}
                    onChange={(event) => handleToggleChecklistItem(passo.id, event.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                  />
                  <input
                    value={passo.texto}
                    onChange={(event) => handleRenomearChecklistItem(passo.id, event.target.value)}
                    className={`flex-1 bg-transparent text-xs font-medium focus:outline-none ${
                      passo.concluido
                        ? "line-through text-slate-400 dark:text-slate-500"
                        : "text-slate-800 dark:text-slate-200"
                    }`}
                  />
                  <button
                    onClick={() => handleRemoverPasso(passo.id)}
                    className="rounded p-1 text-xs text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer transition-colors"
                    title="Remover passo"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-2 flex gap-2">
              <input
                placeholder="Adicionar item à lista de verificação..."
                value={novoPasso}
                onChange={(event) => setNovoPasso(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdicionarPasso();
                  }
                }}
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={handleAdicionarPasso}
                className="rounded-lg bg-slate-900 dark:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors cursor-pointer"
              >
                Adicionar
              </button>
            </div>
          </section>

          {/* Seção 3: Comentários & Histórico do Chão de Fábrica */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                <span>Comentários & Histórico do Chão de Fábrica</span>
              </h3>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                {comentarios.length} comentário(s)
              </span>
            </div>

            <ul className="mb-3 flex flex-col gap-2 max-h-48 overflow-y-auto">
              {comentarios.length === 0 ? (
                <li className="text-xs text-slate-400 italic p-3 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  Nenhum comentário registrado ainda.
                </li>
              ) : (
                comentarios.map((comentario) => (
                  <li
                    key={comentario.id}
                    className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {comentario.autor_username}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {new Date(comentario.criado_em).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans">
                      {comentario.texto}
                    </div>
                  </li>
                ))
              )}
            </ul>

            <div className="flex gap-2">
              <textarea
                rows={2}
                value={novoComentario}
                placeholder="Escreva um comentário ou ocorrência..."
                onChange={(event) => setNovoComentario(event.target.value)}
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={handleEnviarComentario}
                className="self-end rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 px-3.5 py-2 text-xs font-bold text-white transition-all cursor-pointer shadow-sm"
              >
                Comentar
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>,
    document.body
  );
}
