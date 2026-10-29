import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import {
  listarChecklist,
  listarComentarios,
  listarLabelsDoItem,
} from "../../services/api";
import { PlanItemStatus, type ColunaExtra, type ItemProducao } from "../../types/producao";
import { parseCardDadosProducao } from "../../utils/cardComponents";
import { obterPostoSap } from "../../utils/postos";
import { ItemDetalhe } from "../ItemDetalhe/ItemDetalhe";

interface SequenciaCardProps {
  item: ItemProducao;
  colunasExtras?: ColunaExtra[];
  onMoverParaColunaExtra?: (itemId: number, colunaExtraId: number | null) => void;
  onAjustarKanban?: (delta: number) => void;
  onDefinirKanban?: (kanbans: number) => void;
  criticoIncluido?: boolean;
  onAlternarCriticoIncluido?: (incluido: boolean) => void;
  onRemoverDoBoard?: () => void;
  exibirEstoque?: boolean;
  limiteLoteCurtoMinutos?: number;
  limiteLoteCurtoSoldaMinutos?: number;
  onIniciarProducao?: (itemId: number) => void;
  onPausarProducao?: (itemId: number) => void;
  onDesfazerInicio?: (itemId: number) => void;
  onConcluirProducao?: (itemId: number) => void;
  onSolicitarConcluir?: (item: ItemProducao) => void;
  onSolicitarQuebra?: (item: ItemProducao) => void;
  podeIniciar?: boolean;
  bloqueioTandem?: string | null;
  isBloqueadoFerramentaria?: boolean;
  corDestaque?: "emerald" | "blue";
  modoCompacto?: boolean;
  isProducaoEmLinha?: boolean;
  postosVinculados?: string[];
  isMaterialDestacado?: boolean;
  onHoverMaterial?: (material: string | null) => void;
  modoEdicao?: boolean;
  onSolicitarEditarItem?: (item: ItemProducao) => void;
}

const TURNO_THEME: Record<
  number,
  {
    cardClasses: string;
    badgeClasses: string;
    label: string;
  }
> = {
  1: {
    cardClasses:
      "bg-slate-50/90 dark:bg-slate-800/90 border-slate-300 dark:border-slate-700 hover:border-slate-400",
    badgeClasses:
      "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 border-slate-300/80 dark:border-slate-600",
    label: "1º Turno",
  },
  2: {
    cardClasses:
      "bg-blue-50/40 dark:bg-blue-950/20 border-blue-200/90 dark:border-blue-800/60 hover:border-blue-400",
    badgeClasses:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border-blue-200 dark:border-blue-700",
    label: "2º Turno",
  },
  3: {
    cardClasses:
      "bg-purple-50/40 dark:bg-purple-950/20 border-purple-200/90 dark:border-purple-800/60 hover:border-purple-400",
    badgeClasses:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border-purple-200 dark:border-purple-700",
    label: "3º Turno",
  },
};

const STATUS_CARD_CLASSES: Record<PlanItemStatus, string> = {
  [PlanItemStatus.Normal]: "",
  [PlanItemStatus.Critico]: "border-status-critico bg-status-critico/10 dark:bg-status-critico/20",
  [PlanItemStatus.Excluido]: "border-status-excluido bg-status-excluido/10 dark:bg-status-excluido/20 opacity-60",
  [PlanItemStatus.Locked]: "border-status-travado bg-status-travado/10 dark:bg-status-travado/20",
};


function CardFooter({
  itemId,
  temAnotacoes,
  postoTrabalho,
  setor,
}: {
  itemId?: number | null;
  temAnotacoes?: boolean;
  postoTrabalho?: string;
  setor?: string;
}) {
  const { token } = useAuth();

  const checklistQuery = useQuery({
    queryKey: ["item-checklist", itemId],
    queryFn: () => (itemId ? listarChecklist(token as string, itemId) : Promise.resolve([])),
    enabled: Boolean(token && itemId),
    retry: false,
  });
  const labelsQuery = useQuery({
    queryKey: ["item-labels", itemId],
    queryFn: () => (itemId ? listarLabelsDoItem(token as string, itemId) : Promise.resolve([])),
    enabled: Boolean(token && itemId),
    retry: false,
  });
  const comentariosQuery = useQuery({
    queryKey: ["item-comentarios", itemId],
    queryFn: () => (itemId ? listarComentarios(token as string, itemId) : Promise.resolve([])),
    enabled: Boolean(token && itemId),
    retry: false,
  });

  const checklist = checklistQuery.data ?? [];
  const concluidos = checklist.filter((passo) => passo.concluido).length;
  const labels = labelsQuery.data ?? [];

  // Se o item não tem labels persistidas ainda (ex: na tela de programação ou recém criado),
  // exibe automaticamente a etiqueta correspondente à máquina (prensa ou ponteadeira oficial)
  const isEstamparia =
    setor === "estamparia" ||
    postoTrabalho?.toUpperCase().startsWith("PR-") ||
    postoTrabalho?.toUpperCase().startsWith("PRENSA");
  const isMaquinaOficial = Boolean(
    postoTrabalho &&
      (postoTrabalho.startsWith("PR-") ||
        postoTrabalho.startsWith("PRENSA") ||
        postoTrabalho.startsWith("PONTE") ||
        postoTrabalho.startsWith("Ponteadeira"))
  );
  const nomeExibicaoMaquina = postoTrabalho?.startsWith("Ponteadeira ")
    ? postoTrabalho.replace("Ponteadeira ", "PONTE ")
    : postoTrabalho;
  const corPadraoMaquina = isEstamparia ? "#2563eb" : "#d97706";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-200 dark:border-slate-700/80 pt-2 text-xs text-slate-600 dark:text-slate-400">
      {itemId !== null && itemId !== undefined && checklist.length > 0 && (
        <span className="font-semibold text-slate-700 dark:text-slate-300">
          {concluidos}/{checklist.length}
        </span>
      )}
      {labels.length > 0 ? (
        labels.map((label) => (
          <span
            key={label.id}
            className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-2xs"
            style={{ backgroundColor: label.cor }}
          >
            {label.nome}
          </span>
        ))
      ) : isMaquinaOficial && postoTrabalho ? (
        <span
          data-testid="label-maquina"
          className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-2xs"
          style={{ backgroundColor: corPadraoMaquina }}
          title={`Máquina: ${nomeExibicaoMaquina}`}
        >
          {nomeExibicaoMaquina}
        </span>
      ) : null}

      {itemId !== null && itemId !== undefined && (comentariosQuery.data ?? []).length > 0 && (
        <span>{(comentariosQuery.data ?? []).length} comentario(s)</span>
      )}
      {temAnotacoes && (
        <span
          data-testid="badge-tem-anotacoes"
          title="Possui anotações fixas da programação"
          className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200/80 dark:border-amber-800/60 text-[10px]"
        >
          <span>📝</span>
          <span>Anotações</span>
        </span>
      )}
    </div>
  );
}

export function SequenciaCard({
  item,
  colunasExtras,
  onMoverParaColunaExtra,
  onAjustarKanban,
  onDefinirKanban,
  criticoIncluido,
  onAlternarCriticoIncluido,
  onRemoverDoBoard,
  exibirEstoque = true,
  limiteLoteCurtoMinutos,
  limiteLoteCurtoSoldaMinutos,
  onIniciarProducao,
  onPausarProducao,
  onDesfazerInicio,
  onConcluirProducao,
  onSolicitarConcluir,
  onSolicitarQuebra,
  podeIniciar = true,
  bloqueioTandem,
  isBloqueadoFerramentaria = false,
  corDestaque = "emerald",
  modoCompacto = false,
  isProducaoEmLinha = false,
  postosVinculados,
  isMaterialDestacado = false,
  onHoverMaterial,
  modoEdicao = false,
  onSolicitarEditarItem,
}: SequenciaCardProps) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [detalheAberto, setDetalheAberto] = useState(false);
  const [expandidoLocal, setExpandidoLocal] = useState<boolean | null>(null);
  const [componentesExpandidos, setComponentesExpandidos] = useState<boolean>(false);

  // Timer em tempo real para itens em produção ativa e salvaguarda de 60s para desfazer início acidental
  const [segundosDecorridos, setSegundosDecorridos] = useState<number>(() => {
    if (!item.em_producao || !item.inicio_real) return 0;
    const t = new Date(item.inicio_real).getTime();
    return isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 1000));
  });

  useEffect(() => {
    if (!item.em_producao || !item.inicio_real) return;
    const t = new Date(item.inicio_real).getTime();
    if (isNaN(t)) return;
    setSegundosDecorridos(Math.max(0, Math.floor((Date.now() - t) / 1000)));

    const interval = setInterval(() => {
      setSegundosDecorridos(Math.max(0, Math.floor((Date.now() - t) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [item.em_producao, item.inicio_real]);

  const podeDesfazerInicio = item.em_producao && segundosDecorridos < 60;
  const segundosRestantesDesfazer = Math.max(0, 60 - segundosDecorridos);

  useEffect(() => {
    setExpandidoLocal(null);
  }, [modoCompacto]);

  const isCompacto = expandidoLocal !== null ? !expandidoLocal : Boolean(modoCompacto);

  const colunaAtual = useMemo(() => {
    if (!item.coluna_extra_id || !colunasExtras) return null;
    return colunasExtras.find((c) => c.id === item.coluna_extra_id) ?? null;
  }, [item.coluna_extra_id, colunasExtras]);

  const nomeColunaLower = (colunaAtual?.nome ?? "").toLowerCase();
  const isColunaConcluida =
    nomeColunaLower.includes("concluid") || Boolean(item.fim_real && item.motivo_interrupcao !== "quebra");
  const isColunaQuebra =
    nomeColunaLower.includes("quebra") || item.motivo_interrupcao === "quebra";
  const isItemFinalizado = isColunaConcluida || isColunaQuebra;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(item.id ?? `novo-${item.sequencia}`),
    disabled: isItemFinalizado,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const totalPecas = item.kanbans * item.qtd_por_kanban;
  const isProgramacao = Boolean(exibirEstoque);
  const postoSap = item.posto_sap || obterPostoSap(item.posto_trabalho, item.setor);
  const dadosProd = useMemo(
    () =>
      parseCardDadosProducao(item, {
        isProgramacao,
        limiteLoteCurtoMinutos,
        limiteLoteCurtoSoldaMinutos,
      }),
    [item, isProgramacao, limiteLoteCurtoMinutos, limiteLoteCurtoSoldaMinutos]
  );


  const componentesComFalta = useMemo(
    () => dadosProd.componentesSolda.filter((c) => c.temFalta),
    [dadosProd.componentesSolda]
  );
  const temFaltaComponente = isProgramacao && dadosProd.isSolda && componentesComFalta.length > 0;
  const temFaltaMateriaPrima = isProgramacao && dadosProd.isEstamparia && Boolean(dadosProd.dadosEstamparia.materiaPrimaTemFalta);

  const kanbansPossiveis = useMemo(() => {
    // Se for Estamparia com consumo de MP mapeado:
    if (dadosProd.isEstamparia && dadosProd.dadosEstamparia.consumoUnitarioKg && dadosProd.dadosEstamparia.consumoUnitarioKg > 0) {
      const kgPorKanban = (item.qtd_por_kanban || 1) * dadosProd.dadosEstamparia.consumoUnitarioKg;
      if (kgPorKanban > 0 && typeof dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque === "number") {
        const saldoMp = Math.max(0, dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque);
        return Math.floor(saldoMp / kgPorKanban);
      }
    }
    if (!item.qtd_por_kanban || item.qtd_por_kanban <= 0) return 0;
    const saldo = typeof item.saldo_estoque === "number" ? Math.max(0, item.saldo_estoque) : 0;
    return Math.floor(saldo / item.qtd_por_kanban);
  }, [
    dadosProd.isEstamparia,
    dadosProd.dadosEstamparia.consumoUnitarioKg,
    dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque,
    item.saldo_estoque,
    item.qtd_por_kanban,
  ]);

  const temFaltaEstoque = useMemo(() => {
    if (!isProgramacao) return false;
    // Na Estamparia, a falta de estoque para produção é regida pela Matéria-Prima física
    if (dadosProd.isEstamparia) {
      return Boolean(dadosProd.dadosEstamparia.materiaPrimaTemFalta);
    }
    if (typeof item.saldo_estoque === "number") {
      const demandaAtual = item.kanbans * (item.qtd_por_kanban || 1);
      return demandaAtual > item.saldo_estoque;
    }
    return Boolean(item.tem_falta_estoque);
  }, [
    isProgramacao,
    dadosProd.isEstamparia,
    dadosProd.dadosEstamparia.materiaPrimaTemFalta,
    item.saldo_estoque,
    item.kanbans,
    item.qtd_por_kanban,
    item.tem_falta_estoque,
  ]);

  const isConclusaoParcial =
    isColunaConcluida &&
    item.quantidade_produzida_real !== null &&
    item.quantidade_produzida_real !== undefined &&
    item.quantidade_produzida_real < totalPecas;
  const isConclusaoTotal = isColunaConcluida && !isConclusaoParcial;

  const isTandemEmLinha = Boolean((isProducaoEmLinha || item.producao_em_linha) && item.coluna_extra_id === null);
  const postosTandem = postosVinculados ?? item.postos_vinculados ?? [];

  const destaqueClasses = item.em_producao
    ? corDestaque === "blue" || isTandemEmLinha
      ? "ring-2 ring-sky-500/80 border-sky-400 shadow-md shadow-sky-500/15 bg-sky-50/30 dark:bg-sky-950/20"
      : "ring-2 ring-emerald-500 border-emerald-500 shadow-md shadow-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20"
    : isMaterialDestacado
    ? "ring-2 ring-sky-400 border-sky-400 shadow-md shadow-sky-400/20 scale-[1.01]"
    : "";

  const turnoConfig = TURNO_THEME[item.turno] ?? TURNO_THEME[1];

  const cardTemaClasses =
    isConclusaoParcial
      ? "bg-amber-50/60 dark:bg-amber-950/25 border-amber-400 dark:border-amber-600 shadow-2xs hover:border-amber-500"
      : isConclusaoTotal
      ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700 shadow-2xs hover:border-emerald-400"
      : isTandemEmLinha && !item.is_critico && item.status === PlanItemStatus.Normal
      ? "bg-sky-50/40 dark:bg-sky-950/20 border-sky-300/80 dark:border-sky-700/60 shadow-2xs hover:border-sky-400 dark:hover:border-sky-500"
      : !item.is_critico && item.status === PlanItemStatus.Normal
      ? turnoConfig.cardClasses
      : STATUS_CARD_CLASSES[item.status];

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => {
          if (item.id !== null) setDetalheAberto(true);
        }}
        onMouseEnter={() => {
          if (item.material && isTandemEmLinha) onHoverMaterial?.(item.material);
        }}
        onMouseLeave={() => {
          if (isTandemEmLinha) onHoverMaterial?.(null);
        }}
        data-testid="sequencia-card"
        data-material={item.material || ""}
        data-item-id={String(item.id ?? `novo-${item.sequencia}`)}
        className={[
          "sequencia-card relative z-20 isolate",
          item.is_critico ? "sequencia-card--critico border-status-critico bg-status-critico/10 dark:bg-status-critico/20" : "",
          cardTemaClasses,
          isCompacto
            ? "mb-2 rounded-lg border p-2.5 shadow-xs transition-all hover:shadow-md cursor-pointer min-h-[190px] flex flex-col justify-between"
            : "mb-2 rounded-lg border p-3 shadow-sm transition-all hover:shadow-md min-h-[290px] flex flex-col justify-between",
          destaqueClasses,
          modoEdicao ? "ring-2 ring-amber-400/80 border-amber-400 dark:border-amber-500/80" : "",
          isDragging ? "rotate-1 shadow-lg" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Botão de Remover Card sempre fixo no Canto Superior Direito com z-30 para nunca ficar sob sublayer */}
        {onRemoverDoBoard && (
          <button
            type="button"
            data-testid="btn-remover-card"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemoverDoBoard();
            }}
            title={
              isBloqueadoFerramentaria
                ? "Remover do lote (Ferramenta Bloqueada)"
                : "Remover este item da fila da programação"
            }
            aria-label={`Retirar ${item.material || "item"} da fila`}
            className={`absolute top-2 right-2 z-30 flex h-5 w-5 items-center justify-center rounded font-bold text-xs transition-colors shadow-2xs cursor-pointer ${
              isBloqueadoFerramentaria
                ? "bg-red-200/90 dark:bg-red-900/90 text-red-800 dark:text-red-100 hover:bg-red-300 dark:hover:bg-red-800"
                : "bg-slate-200/80 dark:bg-slate-700/80 text-slate-500 dark:text-slate-300 hover:bg-red-500 hover:text-white dark:hover:bg-red-600"
            }`}
          >
            ✕
          </button>
        )}

        {isColunaConcluida && isConclusaoParcial && (
          <div
            className="mb-2 flex items-center justify-between gap-1.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80 px-2.5 py-1 pr-8 text-xs font-bold shadow-xs"
            title={`Concluído parcialmente: ${item.quantidade_produzida_real} peças produzidas de ${totalPecas} programadas`}
          >
            <span className="flex items-center gap-1.5">
              <span>⚠️</span>
              <span className="tracking-wide uppercase">CONCLUÍDA PARCIAL</span>
            </span>
            <span className="text-[10px] font-mono font-black bg-amber-200/90 dark:bg-amber-900/80 px-1.5 py-0.5 rounded text-amber-950 dark:text-amber-100">
              {item.quantidade_produzida_real} / {totalPecas} pçs
            </span>
          </div>
        )}
        {isColunaConcluida && isConclusaoTotal && (
          <div
            className="mb-2 flex items-center justify-between gap-1.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700/80 px-2.5 py-1 pr-8 text-xs font-bold shadow-xs"
            title={`Produção concluída: ${item.quantidade_produzida_real ?? totalPecas} peças produzidas`}
          >
            <span className="flex items-center gap-1.5">
              <span>✓</span>
              <span className="tracking-wide uppercase">CONCLUÍDA</span>
            </span>
            <span className="text-[10px] font-mono font-black bg-emerald-200/90 dark:bg-emerald-900/80 px-1.5 py-0.5 rounded text-emerald-950 dark:text-emerald-100">
              {item.quantidade_produzida_real ?? totalPecas} pçs
            </span>
          </div>
        )}

        {isBloqueadoFerramentaria && (
          <div className="mb-2 flex items-center justify-between gap-1.5 rounded bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 px-2.5 py-1 pr-8 text-xs font-bold shadow-xs">
            <span className="flex items-center gap-1.5">
              <span>⛔</span>
              <span>FERRAMENTA NA FERRAMENTARIA</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider bg-red-200 dark:bg-red-900/80 px-1.5 py-0.5 rounded text-red-800 dark:text-red-200">
              Bloqueado
            </span>
          </div>
        )}
        {isTandemEmLinha && (
          <div
            className="mb-2 flex items-center justify-between gap-1.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/60 px-2.5 py-1 pr-8 text-xs font-semibold shadow-2xs"
            title={`Material em produção contínua em linha nos postos: ${postosTandem.join(" ↔ ")}`}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-sky-500 dark:text-sky-400 text-xs">🔗</span>
              <span className="truncate font-semibold tracking-wide">PRODUÇÃO EM LINHA</span>
            </span>
            <span className="text-[10px] uppercase font-mono tracking-wider bg-sky-100/90 dark:bg-sky-900/50 px-1.5 py-0.5 rounded text-sky-900 dark:text-sky-200 border border-sky-200/70 dark:border-sky-800/40 shrink-0 font-medium">
              {postosTandem.length} postos
            </span>
          </div>
        )}
        {item.em_producao && (
          <div
            className={`mb-2 flex items-center justify-between gap-1.5 rounded px-2 py-1 pr-8 text-xs font-bold ${
              corDestaque === "blue" || isTandemEmLinha
                ? "bg-sky-50/90 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
                : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    corDestaque === "blue" || isTandemEmLinha ? "bg-sky-400" : "bg-emerald-500"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    corDestaque === "blue" || isTandemEmLinha ? "bg-sky-500" : "bg-emerald-600"
                  }`}
                />
              </span>
              <span>EM PRODUÇÃO</span>
            </div>
            <span className="text-[10px] uppercase font-mono font-medium opacity-90">
              {segundosDecorridos > 0
                ? `${Math.floor(segundosDecorridos / 60)}m ${String(segundosDecorridos % 60).padStart(2, "0")}s`
                : "Linha Ativa"}
            </span>
          </div>
        )}

        {isCompacto ? (
          /* Modo Compacto: Foco na informação essencial de programação com alta densidade visual */
          <div className="space-y-1.5">
            {/* Linha 1: Material (Título em destaque principal), Badges e Expandir */}
            <div className="flex items-center justify-between gap-1.5 pr-6">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <h4
                  className="text-sm sm:text-base font-black font-mono tracking-wide text-slate-900 dark:text-slate-100"
                  title={item.material || "Material"}
                >
                  {item.material?.includes(" / ") ? (
                    <span className="inline-flex items-center gap-1 flex-wrap font-mono">
                      <span>{item.material.split(" / ")[0]}</span>
                      <span className="text-amber-500 dark:text-amber-400 font-bold">/</span>
                      <span>{item.material.split(" / ")[1]}</span>
                      <span
                        title="Peça Dupla (Direito / Esquerdo estampados juntos)"
                        className="px-1 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-wide bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 shadow-2xs"
                      >
                        Dupla
                      </span>
                    </span>
                  ) : (
                    <span className="truncate">{item.material || "Sem código"}</span>
                  )}
                </h4>
                {isTandemEmLinha && (
                  <span
                    className="rounded bg-sky-100/90 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200 border border-sky-200/80 dark:border-sky-800/60 px-1.5 py-0.2 text-[9px] font-semibold tracking-wide uppercase shadow-2xs shrink-0"
                    title={`Produção em Linha (${postosTandem.join(" ↔ ")})`}
                  >
                    🔗 Linha
                  </span>
                )}
                {item.sequencia > 0 && (
                  <span className="rounded bg-slate-200/80 dark:bg-slate-700 px-1 py-0.2 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    Seq #{item.sequencia}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.almoco_incluso && (
                  <span
                    data-testid="almoco-badge-compacto"
                    title="Horário de Almoço Incluso (+40 min)"
                    className="flex items-center gap-0.5 rounded bg-amber-100/90 dark:bg-amber-950/70 border border-amber-300/80 dark:border-amber-700/60 px-1 py-0.2 text-[10px] font-bold text-amber-800 dark:text-amber-300 shadow-2xs shrink-0"
                    aria-label="Horário de Almoço Incluso"
                  >
                    <span>🍽️</span>
                  </span>
                )}
                <span
                  className={`rounded border px-1.5 py-0.2 text-[9px] font-bold tracking-wide uppercase ${turnoConfig.badgeClasses}`}
                >
                  {turnoConfig.label.slice(0, 2)}T
                </span>
                <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                  {item.patan}
                </span>
                {modoEdicao && onSolicitarEditarItem && !isItemFinalizado && (
                  <button
                    type="button"
                    data-testid={`btn-editar-card-${item.id}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSolicitarEditarItem(item);
                    }}
                    className="flex items-center gap-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-1.5 py-0.2 text-[9px] shadow-xs cursor-pointer transition-all shrink-0"
                    title="Editar horários e parâmetros deste lote em produção"
                  >
                    <span>✏️</span>
                    <span>Editar</span>
                  </button>
                )}
                {/* Botão de Expandir Individual */}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandidoLocal(true);
                  }}
                  title="Expandir detalhes deste card (Estoque MB52, parâmetros)"
                  aria-label="Expandir card"
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Linha 2: Linha • Posto de Trabalho (subtítulo discreto) e Horário Agendado com Duração */}
            <div className="flex items-center justify-between gap-1 text-xs text-slate-500 dark:text-slate-400">
              <span
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate"
                title={postoSap ? `Centro de Trabalho SAP: ${postoSap}` : undefined}
              >
                {item.linha} • {item.posto_trabalho?.replace("Ponteadeira ", "PONTE ")}
                {postoSap && (
                  <span className="ml-1 text-[10px] font-mono text-slate-400 dark:text-slate-500">
                    ({postoSap})
                  </span>
                )}
              </span>
              {item.hora_inicial && (
                <span
                  data-testid={
                    dadosProd.isLoteCurto
                      ? dadosProd.isEstamparia
                        ? "alerta-lote-curto-estamparia"
                        : "alerta-lote-curto-solda"
                      : undefined
                  }
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 transition-colors ${
                    dadosProd.isLoteCurto
                      ? "bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 animate-pulse"
                      : "bg-white/90 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/60"
                  }`}
                  title={
                    dadosProd.isLoteCurto
                      ? `Atenção: Tempo de produção inferior ao limite planejado na ${dadosProd.isEstamparia ? "estamparia" : "solda"} (${dadosProd.duracaoMinutos} min < ${dadosProd.limiteLoteCurtoAplicavel} min)!`
                      : `Janela: ${dadosProd.duracaoMinutos} min`
                  }
                >
                  <span className="opacity-80 mr-0.5">⏱️</span>
                  <span>
                    {item.hora_inicial.slice(11, 16)}
                    {item.hora_final ? ` - ${item.hora_final.slice(11, 16)}` : ""}
                  </span>
                  {dadosProd.duracaoMinutos > 0 && <span> — {dadosProd.duracaoMinutos} min</span>}
                </span>
              )}
            </div>

            {/* Linha 3: Total de Caixas, Peças, Embalagem e Sequência com Ajustador */}
            <div className="flex items-center justify-between gap-1.5 rounded-md bg-slate-100/70 dark:bg-slate-800/60 px-2.5 py-1.5 border border-slate-200/50 dark:border-slate-700/50 shadow-2xs">
              <div className="flex items-center gap-1.5 font-mono text-xs flex-wrap">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {item.kanbans} kanban(s)
                </span>
                <span className="text-slate-300 dark:text-slate-600 font-sans">•</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {totalPecas.toLocaleString("pt-BR")} pçs
                </span>
                {dadosProd.embalagem && (
                  <>
                    <span className="text-slate-400 dark:text-slate-500 font-sans">-</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200" title={`Código da Embalagem: ${dadosProd.embalagem}`}>
                      Embalagem: {dadosProd.embalagem}
                    </span>
                  </>
                )}
                {item.sequencia > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600 font-sans">•</span>
                    <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400">
                      Seq #{item.sequencia}
                    </span>
                  </>
                )}
              </div>
              {onAjustarKanban && (
                <span className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAjustarKanban(-1);
                    }}
                    aria-label="Diminuir kanban"
                    title="Diminuir 1 kanban"
                    className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 active:scale-95 transition-all leading-none shadow-2xs"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAjustarKanban(1);
                    }}
                    aria-label="Aumentar kanban"
                    title="Aumentar 1 kanban"
                    className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 active:scale-95 transition-all leading-none shadow-2xs"
                  >
                    +
                  </button>
                </span>
              )}
            </div>

            {/* Linha 4: Componentes (Solda: EST vs VtoV) ou Matéria-Prima / Paletes (Estamparia) */}
            {dadosProd.componentesSolda.length > 0 ? (
              <div className="pt-0.5">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                    {(componentesExpandidos
                      ? dadosProd.componentesSolda
                      : dadosProd.componentesSolda.slice(0, 1)
                    ).map((comp, idx) => {
                      const statusOk = !comp.temFalta;
                      return (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[10px] font-medium shadow-2xs transition-colors ${
                            !isProgramacao
                              ? "border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200"
                              : statusOk
                              ? "border-emerald-300 dark:border-emerald-700/80 bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200"
                              : "border-rose-300 dark:border-rose-700/80 bg-rose-50/95 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200"
                          }`}
                          title={`${comp.tipo}: ${comp.codigo} — Estoque: ${comp.saldoLivre.toLocaleString("pt-BR")} pçs / Necessário: ${comp.qtdNecessaria.toLocaleString("pt-BR")} pçs${
                            isProgramacao && comp.temFalta ? " (FALTA DE COMPONENTE)" : ""
                          }`}
                        >
                          <span
                            className={`font-bold text-[9px] uppercase tracking-wider ${
                              !isProgramacao
                                ? "text-slate-500 dark:text-slate-400"
                                : statusOk
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-rose-700 dark:text-rose-400"
                            }`}
                          >
                            {comp.tipo}:
                          </span>
                          <span className="truncate max-w-[95px] font-semibold">{comp.codigo}</span>
                          {isProgramacao ? (
                            <span
                              className={`px-1 py-0.2 rounded font-sans text-[9px] font-bold ${
                                statusOk
                                  ? "bg-emerald-100/90 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200"
                                  : "bg-rose-100 dark:bg-rose-900/70 text-rose-800 dark:text-rose-100"
                              }`}
                            >
                              Est: {comp.saldoLivre.toLocaleString("pt-BR")} / Nec: {comp.qtdNecessaria.toLocaleString("pt-BR")}
                              {!statusOk && " ⚠️"}
                            </span>
                          ) : (
                            <span className="font-sans text-slate-500 dark:text-slate-400 text-[9px]">
                              ({comp.qtdNecessaria}pç)
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {dadosProd.componentesSolda.length > 1 && (
                    <button
                      type="button"
                      data-testid={`btn-toggle-componentes-${item.id}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setComponentesExpandidos((prev) => !prev);
                      }}
                      className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] font-semibold transition-colors cursor-pointer shadow-2xs ml-auto"
                      title={
                        componentesExpandidos
                          ? "Minimizar componentes (apenas 1ª linha)"
                          : `Ver todos os ${dadosProd.componentesSolda.length} componentes`
                      }
                    >
                      {!componentesExpandidos && (
                        <span className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold">
                          +{dadosProd.componentesSolda.length - 1}
                        </span>
                      )}
                      {componentesExpandidos ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  {dadosProd.embalagem && !componentesExpandidos && (
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      Emb: {dadosProd.embalagem}
                    </span>
                  )}
                </div>
              </div>
            ) : dadosProd.isEstamparia ? (
              <div className="flex items-center gap-1.5 flex-wrap overflow-hidden pt-0.5">
                {dadosProd.dadosEstamparia.materiaPrimaCodigo && (
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[10px] font-medium shadow-2xs ${
                      !isProgramacao || dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque == null
                        ? "border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200"
                        : !dadosProd.dadosEstamparia.materiaPrimaTemFalta
                        ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200"
                        : "border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200"
                    }`}
                    title={`Matéria-Prima: ${dadosProd.dadosEstamparia.materiaPrimaCodigo}${
                      dadosProd.dadosEstamparia.materiaPrimaKg != null
                        ? ` — Nec: ${dadosProd.dadosEstamparia.materiaPrimaKg.toLocaleString("pt-BR")} kg`
                        : ""
                    }${
                      dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque != null
                        ? ` — Est: ${dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque.toLocaleString("pt-BR")} kg`
                        : ""
                    }`}
                  >
                    <span className="font-bold text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">MP:</span>
                    <span className="truncate max-w-[110px] font-semibold">{dadosProd.dadosEstamparia.materiaPrimaCodigo}</span>
                    {isProgramacao && dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque != null ? (
                      <span
                        className={`px-1 py-0.2 rounded font-sans text-[9px] font-bold ${
                          !dadosProd.dadosEstamparia.materiaPrimaTemFalta
                            ? "bg-emerald-100/90 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200"
                            : "bg-rose-100 dark:bg-rose-900/70 text-rose-800 dark:text-rose-100"
                        }`}
                      >
                        Est: {dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg / Nec: {(dadosProd.dadosEstamparia.materiaPrimaKg || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                        {dadosProd.dadosEstamparia.materiaPrimaTemFalta ? " ⚠️" : " ✓"}
                      </span>
                    ) : (
                      dadosProd.dadosEstamparia.materiaPrimaKg != null && (
                        <span className="font-sans text-slate-500 dark:text-slate-400 text-[9px]">
                          ({dadosProd.dadosEstamparia.materiaPrimaKg.toLocaleString("pt-BR")} kg)
                        </span>
                      )
                    )}
                  </span>
                )}
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-mono text-[10px] font-medium"
                  title={`Paletização: ${dadosProd.dadosEstamparia.paletesCompletos}P (${dadosProd.dadosEstamparia.cxsCompletas} cxs)`}
                >
                  <span className="opacity-80">📦</span>
                  <span>{dadosProd.dadosEstamparia.paletesCompletos}P ({dadosProd.dadosEstamparia.cxsCompletas} cx)</span>
                </span>
                {dadosProd.dadosEstamparia.embalagem && (
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 ml-auto truncate">
                    Emb: {dadosProd.dadosEstamparia.embalagem}
                  </span>
                )}
              </div>
            ) : null}

            {isProgramacao && temFaltaMateriaPrima && (
              <div
                data-testid="falta-materia-prima"
                className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-1 flex-wrap px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 shadow-2xs"
              >
                <span>⚠️ Falta de matéria-prima:</span>
                <span className="font-mono font-bold">
                  {dadosProd.dadosEstamparia.materiaPrimaCodigo} (falta {Math.max(0, (dadosProd.dadosEstamparia.materiaPrimaKg || 0) - (dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque || 0)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg)
                </span>
                {exibirEstoque && (
                  <>
                    <span className="text-slate-400 dark:text-slate-500 font-normal">—</span>
                    {onDefinirKanban ? (
                      <button
                        type="button"
                        data-testid="btn-ajustar-capacidade-mp"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDefinirKanban(kanbansPossiveis);
                        }}
                        title={`Clique para ajustar automaticamente para ${kanbansPossiveis} ${kanbansPossiveis === 1 ? "kanban" : "kanbans"} suportados pelo estoque de matéria-prima`}
                        className="text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 active:scale-95 px-1 py-0.2 rounded border border-amber-300/80 dark:border-amber-700/60 transition-all cursor-pointer underline decoration-dotted underline-offset-2"
                      >
                        Consegue produzir: {kanbansPossiveis} {kanbansPossiveis === 1 ? "kanban" : "kanbans"}
                      </button>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/40 px-1 py-0.2 rounded border border-amber-200/60 dark:border-amber-800/40">
                        Consegue produzir: {kanbansPossiveis} {kanbansPossiveis === 1 ? "kanban" : "kanbans"}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            {isProgramacao && temFaltaComponente && (
              <div
                data-testid="falta-componente"
                className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-1 flex-wrap px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 shadow-2xs"
              >
                <span>⚠️ Falta de componente:</span>
                <span className="font-mono font-bold">
                  {componentesComFalta
                    .map(
                      (c) =>
                        `${c.codigo} (falta ${(c.qtdNecessaria - c.saldoLivre).toLocaleString("pt-BR")} pçs)`
                    )
                    .join(", ")}
                </span>
              </div>
            )}

            {isProgramacao && !dadosProd.isEstamparia && temFaltaEstoque && (
              <div
                data-testid="falta-estoque"
                className="text-[10px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1 flex-wrap"
              >
                <span>Falta de estoque</span>
                {exibirEstoque && (
                  <>
                    <span className="text-slate-400 dark:text-slate-500 font-normal">—</span>
                    {onDefinirKanban ? (
                      <button
                        type="button"
                        data-testid="btn-ajustar-capacidade-estoque"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDefinirKanban(kanbansPossiveis);
                        }}
                        title={`Clique para ajustar automaticamente para ${kanbansPossiveis} ${kanbansPossiveis === 1 ? "kanban" : "kanbans"} suportados pelo estoque`}
                        className="text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 active:scale-95 px-1 py-0.2 rounded border border-amber-300/80 dark:border-amber-700/60 transition-all cursor-pointer underline decoration-dotted underline-offset-2"
                      >
                        Consegue produzir: {kanbansPossiveis} {kanbansPossiveis === 1 ? "kanban" : "kanbans"}
                      </button>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/40 px-1 py-0.2 rounded border border-amber-200/60 dark:border-amber-800/40">
                        Consegue produzir: {kanbansPossiveis} {kanbansPossiveis === 1 ? "kanban" : "kanbans"}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
            {(item.status === PlanItemStatus.Critico || item.is_critico) && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-500/20 px-1.5 py-0.5 rounded">
                <span>🔴 CRÍTICO</span>
                <span className="font-normal">(Patan {item.patan})</span>
              </div>
            )}
            {item.mostrar_anotacoes_quadro && item.anotacoes?.trim() && (
              <div
                data-testid="card-anotacoes-preview"
                className="mt-1 rounded bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 p-1.5 text-[10px] text-amber-950 dark:text-amber-100 font-mono whitespace-pre-wrap leading-tight select-text"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1 font-sans font-semibold text-[9px] uppercase tracking-wider text-amber-800 dark:text-amber-400 mb-0.5">
                  <span>📝</span>
                  <span>Anotações</span>
                </div>
                {item.anotacoes.trim()}
              </div>
            )}
          </div>
        ) : (
          /* Modo Detalhado: Exibe métricas de estoque completas (MB52, Máx, Mín, Almoço, Footer) */
          <>
            {/* Cabeçalho Invertido: Material em destaque principal, Linha/Máquina como subtítulo */}
            <div className="mb-1 flex items-center justify-between gap-1.5 min-w-0 pr-6">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <h4
                  className="text-base sm:text-lg font-black tracking-wide text-slate-900 dark:text-slate-100 font-mono"
                  title={item.material || "Material"}
                >
                  {item.material?.includes(" / ") ? (
                    <span className="inline-flex items-center gap-1.5 flex-wrap font-mono">
                      <span>{item.material.split(" / ")[0]}</span>
                      <span className="text-amber-500 dark:text-amber-400 font-bold">/</span>
                      <span>{item.material.split(" / ")[1]}</span>
                      <span
                        title="Peça Dupla (Direito / Esquerdo estampados juntos)"
                        className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 shadow-2xs"
                      >
                        Peça Dupla
                      </span>
                    </span>
                  ) : (
                    <span className="truncate">{item.material || "MATERIAL NÃO ESPECIFICADO"}</span>
                  )}
                </h4>
                {isTandemEmLinha && (
                  <span
                    className="rounded bg-sky-100/90 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200 border border-sky-200/80 dark:border-sky-800/60 px-1.5 py-0.2 text-[9px] font-semibold tracking-wide uppercase shadow-2xs shrink-0"
                    title={`Produção em Linha (${postosTandem.join(" ↔ ")})`}
                  >
                    🔗 Linha
                  </span>
                )}
                {item.sequencia > 0 && (
                  <span className="rounded bg-slate-200/80 dark:bg-slate-700 px-1 py-0.2 text-[10px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                    Seq #{item.sequencia}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-auto">
                <span
                  className={`rounded border px-1.5 py-0.2 text-[9px] font-bold tracking-wide uppercase ${turnoConfig.badgeClasses}`}
                >
                  {turnoConfig.label.slice(0, 2)}T
                </span>
                <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                  {item.patan}
                </span>
                {modoEdicao && onSolicitarEditarItem && !isItemFinalizado && (
                  <button
                    type="button"
                    data-testid={`btn-editar-card-${item.id}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSolicitarEditarItem(item);
                    }}
                    className="flex items-center gap-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-1.5 py-0.2 text-[9px] shadow-xs cursor-pointer transition-all shrink-0"
                    title="Editar horários e parâmetros deste lote em produção"
                  >
                    <span>✏️</span>
                    <span>Editar</span>
                  </button>
                )}
                {/* Botão de Compactar Individual */}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandidoLocal(false);
                  }}
                  title="Compactar card (visão minimalista)"
                  aria-label="Compactar card"
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Subtítulo: Linha e Posto de Trabalho */}
            <div
              className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1"
              title={postoSap ? `Centro de Trabalho SAP: ${postoSap}` : undefined}
            >
              {item.linha} • {item.posto_trabalho?.replace("Ponteadeira ", "PONTE ")}
              {postoSap && (
                <span className="ml-1 text-[10px] font-mono text-slate-400 dark:text-slate-500">
                  ({postoSap})
                </span>
              )}
            </div>

            {(item.status === PlanItemStatus.Critico || item.is_critico) && (
              <div className="mb-1.5 flex items-center gap-1.5 rounded bg-red-100 dark:bg-red-500/20 px-2 py-1 text-xs font-bold text-red-700 dark:text-red-400">
                <span>🔴 CRÍTICO</span>
                <span className="font-normal text-red-600 dark:text-red-500">(Patan {item.patan})</span>
              </div>
            )}

            {/* Total de Caixas e Peças com Ajustador */}
            <div className="flex items-center justify-between gap-1.5 rounded-md bg-slate-100/70 dark:bg-slate-800/60 px-2.5 py-1.5 border border-slate-200/50 dark:border-slate-700/50 shadow-2xs mt-1.5">
              <div className="flex items-center gap-1.5 font-mono text-xs flex-wrap">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {item.kanbans} kanban(s)
                </span>
                <span className="text-slate-300 dark:text-slate-600 font-sans">•</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {totalPecas.toLocaleString("pt-BR")} pçs
                </span>
                {dadosProd.embalagem && (
                  <>
                    <span className="text-slate-400 dark:text-slate-500 font-sans">-</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200" title={`Código da Embalagem: ${dadosProd.embalagem}`}>
                      Embalagem: {dadosProd.embalagem}
                    </span>
                  </>
                )}
                {item.sequencia > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600 font-sans">•</span>
                    <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400">
                      Seq #{item.sequencia}
                    </span>
                  </>
                )}
              </div>
              {onAjustarKanban && (
                <span className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAjustarKanban(-1);
                    }}
                    aria-label="Diminuir kanban"
                    title="Diminuir 1 kanban"
                    className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 active:scale-95 transition-all leading-none shadow-2xs"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAjustarKanban(1);
                    }}
                    aria-label="Aumentar kanban"
                    title="Aumentar 1 kanban"
                    className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 active:scale-95 transition-all leading-none shadow-2xs"
                  >
                    +
                  </button>
                </span>
              )}
            </div>

            {/* Bloco de Componentes (Solda) ou Paletização/M.P (Estamparia) */}
            {dadosProd.componentesSolda.length > 0 ? (
              <div className="mt-2 space-y-1 rounded-md bg-slate-50/90 dark:bg-slate-800/60 p-2 text-[11px] border border-slate-200/70 dark:border-slate-700/60 font-mono">
                <div className="text-[9px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 font-sans flex items-center justify-between pb-1 border-b border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center gap-1.5">
                    <span>Componentes ({dadosProd.componentesSolda.length})</span>
                    {!componentesExpandidos && dadosProd.componentesSolda.length > 1 && (
                      <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 lowercase">
                        (1ª linha)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {dadosProd.embalagem && (
                      <span className="text-slate-600 dark:text-slate-300 font-mono font-medium">
                        Emb: {dadosProd.embalagem}
                      </span>
                    )}
                    {dadosProd.componentesSolda.length > 1 && (
                      <button
                        type="button"
                        data-testid={`btn-toggle-componentes-detalhado-${item.id}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setComponentesExpandidos((prev) => !prev);
                        }}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer border border-indigo-200 dark:border-indigo-800/60 shadow-2xs"
                        title={
                          componentesExpandidos
                            ? "Minimizar para a 1ª linha"
                            : `Expandir todos os ${dadosProd.componentesSolda.length} componentes`
                        }
                      >
                        <span>
                          {componentesExpandidos
                            ? "Minimizar"
                            : `+${dadosProd.componentesSolda.length - 1} ver todos`}
                        </span>
                        {componentesExpandidos ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {(componentesExpandidos
                  ? dadosProd.componentesSolda
                  : dadosProd.componentesSolda.slice(0, 1)
                ).map((comp, idx) => {
                  const statusOk = !comp.temFalta;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between gap-1 py-1 px-1.5 rounded my-0.5 border ${
                        !isProgramacao
                          ? "border-transparent border-b border-b-slate-200/50 dark:border-b-slate-700/50"
                          : statusOk
                          ? "border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20"
                          : "border-rose-200/90 dark:border-rose-800/70 bg-rose-50/60 dark:bg-rose-950/30"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate min-w-0">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded border font-sans shrink-0 uppercase tracking-wide ${
                            !isProgramacao
                              ? "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                              : statusOk
                              ? "border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200"
                              : "border-rose-300 dark:border-rose-700 bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200"
                          }`}
                        >
                          {comp.tipo}
                        </span>
                        <strong className="text-slate-900 dark:text-slate-100 truncate text-xs">
                          {comp.codigo}
                        </strong>
                      </span>

                      {isProgramacao ? (
                        <div className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono">
                          <span className="text-slate-600 dark:text-slate-300">
                            Estoque:{" "}
                            <strong
                              className={
                                statusOk
                                  ? "text-emerald-700 dark:text-emerald-400 font-bold"
                                  : "text-rose-700 dark:text-rose-400 font-bold"
                              }
                            >
                              {comp.saldoLivre.toLocaleString("pt-BR")}
                            </strong>
                          </span>
                          <span className="text-slate-400 dark:text-slate-500">|</span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              statusOk
                                ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300/80 dark:border-emerald-700/60"
                                : "bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border border-rose-300/80 dark:border-rose-700/60"
                            }`}
                          >
                            Nec: {comp.qtdNecessaria.toLocaleString("pt-BR")} pçs
                            {statusOk ? " ✓" : " ⚠️ Falta"}
                          </span>
                        </div>
                      ) : (
                        <span className="shrink-0 flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                          <span>{comp.qtdNecessaria.toLocaleString("pt-BR")} pçs</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : dadosProd.isEstamparia ? (
              <div className="mt-2 space-y-1 rounded-md bg-slate-50/90 dark:bg-slate-800/60 p-2 text-[11px] border border-slate-200/70 dark:border-slate-700/60 font-mono">
                <div className="text-[9px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 font-sans flex items-center justify-between">
                  <span>Paletização & MP</span>
                  {dadosProd.dadosEstamparia.embalagem && (
                    <span className="text-slate-600 dark:text-slate-300 font-mono font-medium">
                      Emb: {dadosProd.dadosEstamparia.embalagem}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                  <span>Palete Completo:</span>
                  <strong>
                    {dadosProd.dadosEstamparia.paletesCompletos}P — {dadosProd.dadosEstamparia.cxsCompletas} cxs
                  </strong>
                </div>
                {dadosProd.dadosEstamparia.paletesQuebra > 0 && (
                  <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
                    <span>Palete Quebra:</span>
                    <strong>1P — {dadosProd.dadosEstamparia.cxsQuebra} cxs</strong>
                  </div>
                )}
                {dadosProd.dadosEstamparia.materiaPrimaCodigo && (
                  <div className="flex items-center justify-between border-t border-slate-200/50 dark:border-slate-700/50 pt-1 text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-slate-500 dark:text-slate-400 font-sans font-semibold text-[10px]">MP:</span>
                      <span className="font-bold text-xs truncate">{dadosProd.dadosEstamparia.materiaPrimaCodigo}</span>
                      {dadosProd.dadosEstamparia.consumoUnitarioKg && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                          ({dadosProd.dadosEstamparia.consumoUnitarioKg} kg/pç)
                        </span>
                      )}
                    </div>
                    {isProgramacao && dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque != null ? (
                      <div className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono">
                        <span className="text-slate-600 dark:text-slate-300">
                          Estoque:{" "}
                          <strong
                            className={
                              !dadosProd.dadosEstamparia.materiaPrimaTemFalta
                                ? "text-emerald-700 dark:text-emerald-400 font-bold"
                                : "text-rose-700 dark:text-rose-400 font-bold"
                            }
                          >
                            {dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                          </strong>
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">|</span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            !dadosProd.dadosEstamparia.materiaPrimaTemFalta
                              ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300/80 dark:border-emerald-700/60"
                              : "bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border border-rose-300/80 dark:border-rose-700/60"
                          }`}
                        >
                          Nec: {(dadosProd.dadosEstamparia.materiaPrimaKg || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                          {!dadosProd.dadosEstamparia.materiaPrimaTemFalta ? " ✓ OK" : " ⚠️ Falta"}
                        </span>
                      </div>
                    ) : (
                      <strong>
                        {dadosProd.dadosEstamparia.materiaPrimaKg != null
                          ? `${dadosProd.dadosEstamparia.materiaPrimaKg.toLocaleString("pt-BR")} KG`
                          : "—"}
                      </strong>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {/* Informações de Estoque, Caixa e Métricas */}
            {exibirEstoque && (
              <div className="mt-2 space-y-1 rounded bg-slate-50 dark:bg-slate-800/50 p-2 text-xs text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Estoque (MB52):</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {item.saldo_estoque != null ? `${item.saldo_estoque.toLocaleString("pt-BR")} pçs` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">1 Kanban =</span>
                  <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                    {item.qtd_por_kanban} pçs/cx
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200/60 dark:border-slate-700/60 pt-1">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Lote Total:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {totalPecas.toLocaleString("pt-BR")} pçs
                  </span>
                </div>

                {((item.kanban_max != null && item.kanban_max > 0) ||
                  (item.kanban_min != null && item.kanban_min > 0)) && (
                  <div className="mt-1 space-y-0.5 border-t border-slate-200/60 dark:border-slate-700/60 pt-1 text-[11px]">
                    {item.demanda != null && item.demanda > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Patan Padrão:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {Math.max(1, Math.round(item.demanda / Math.max(1, item.qtd_por_kanban)))} cx ({item.demanda.toLocaleString("pt-BR")} pçs)
                        </span>
                      </div>
                    )}
                    {item.kanban_max != null && item.kanban_max > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Estoque Máximo:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {item.kanban_max} cx ({item.kanban_max * item.qtd_por_kanban} pçs)
                        </span>
                      </div>
                    )}
                    {item.kanban_max != null && item.kanban_max > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Falta p/ Máx:</span>
                        <span
                          className={`font-semibold ${
                            item.kanban_max - item.kanbans <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-500"
                          }`}
                        >
                          {Math.max(0, item.kanban_max - item.kanbans)} cx
                        </span>
                      </div>
                    )}
                    {item.kanban_min != null && item.kanban_min > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Estoque Segurança:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {item.kanban_min} cx ({item.kanban_min * item.qtd_por_kanban} pçs)
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {item.hora_inicial && (
              <div
                className={`mt-1.5 flex items-center justify-between gap-1 text-xs font-medium px-2 py-1 rounded border transition-colors ${
                  dadosProd.isLoteCurto
                    ? "bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold"
                    : "bg-white/80 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/60"
                }`}
                title={
                  dadosProd.isLoteCurto
                    ? `Atenção: Tempo de produção inferior ao limite planejado na ${dadosProd.isEstamparia ? "estamparia" : "solda"} (${dadosProd.duracaoMinutos} min < ${dadosProd.limiteLoteCurtoAplicavel} min)!`
                    : undefined
                }
              >
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  <span>📅</span>
                  <span>
                    {new Date(item.hora_inicial).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                </span>
                {item.hora_final && (
                  <div className="flex items-center gap-1 font-mono font-bold">
                    <span>
                      {item.hora_inicial.slice(11, 16)} - {item.hora_final.slice(11, 16)}
                    </span>
                    {dadosProd.duracaoMinutos > 0 && (
                      <span className="font-semibold opacity-90">
                        — {dadosProd.duracaoMinutos} min
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {dadosProd.isLoteCurto && (
              <div
                data-testid={
                  dadosProd.isEstamparia
                    ? "alerta-lote-curto-estamparia"
                    : "alerta-lote-curto-solda"
                }
                className="mt-1 rounded bg-rose-100 dark:bg-rose-900/40 border border-rose-300 dark:border-rose-800 px-2 py-0.5 text-[11px] font-bold text-rose-800 dark:text-rose-200 flex items-center justify-between"
              >
                <span className="flex items-center gap-1">
                  <span>⚠️</span>
                  <span>
                    LOTE CURTO {dadosProd.isEstamparia ? "ESTAMPARIA" : "SOLDA"} (&lt; {dadosProd.limiteLoteCurtoAplicavel} MIN)
                  </span>
                </span>
                <span>{dadosProd.duracaoMinutos} min</span>
              </div>
            )}

            {item.almoco_incluso && (
              <div
                data-testid="almoco-label"
                className="mt-1 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5"
              >
                <span>🍽️</span>
                <span>HORARIO DE ALMOCO INCLUSO</span>
              </div>
            )}
            {isProgramacao && temFaltaMateriaPrima && (
              <div
                data-testid="falta-materia-prima"
                className="text-xs text-rose-700 dark:text-rose-300 font-semibold mt-1 flex items-center gap-1.5 flex-wrap px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 shadow-2xs"
              >
                <span>⚠️ Falta de matéria-prima:</span>
                <span className="font-mono font-bold">
                  {dadosProd.dadosEstamparia.materiaPrimaCodigo} (falta {Math.max(0, (dadosProd.dadosEstamparia.materiaPrimaKg || 0) - (dadosProd.dadosEstamparia.materiaPrimaSaldoEstoque || 0)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg)
                </span>
                {exibirEstoque && (
                  <>
                    <span className="text-slate-400 dark:text-slate-500 font-normal">—</span>
                    {onDefinirKanban ? (
                      <button
                        type="button"
                        data-testid="btn-ajustar-capacidade-mp-detalhado"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDefinirKanban(kanbansPossiveis);
                        }}
                        title={`Clique para ajustar automaticamente para ${kanbansPossiveis} ${kanbansPossiveis === 1 ? "kanban" : "kanbans"} suportados pelo estoque de matéria-prima`}
                        className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 active:scale-95 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[11px] font-bold border border-amber-300/80 dark:border-amber-700/60 shadow-2xs transition-all cursor-pointer group"
                      >
                        <span>Consegue produzir:</span>{" "}
                        <strong className="underline underline-offset-2 group-hover:text-amber-800 dark:group-hover:text-amber-200">
                          {kanbansPossiveis} {kanbansPossiveis === 1 ? "kanban" : "kanbans"}
                        </strong>
                        <span className="text-[10px] ml-0.5 text-amber-600 dark:text-amber-400">⚡</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[11px] font-bold border border-amber-200/80 dark:border-amber-800/60 shadow-2xs">
                        <span>Consegue produzir:</span>{" "}
                        <strong className="underline underline-offset-2">
                          {kanbansPossiveis} {kanbansPossiveis === 1 ? "kanban" : "kanbans"}
                        </strong>
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            {isProgramacao && temFaltaComponente && (
              <div
                data-testid="falta-componente"
                className="text-xs text-rose-700 dark:text-rose-300 font-semibold mt-1 flex items-center gap-1.5 flex-wrap px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 shadow-2xs"
              >
                <span>⚠️ Falta de componente:</span>
                <span className="font-mono font-bold">
                  {componentesComFalta
                    .map(
                      (c) =>
                        `${c.codigo} (falta ${(c.qtdNecessaria - c.saldoLivre).toLocaleString("pt-BR")} pçs)`
                    )
                    .join(", ")}
                </span>
              </div>
            )}

            {isProgramacao && !dadosProd.isEstamparia && temFaltaEstoque && (
              <div
                data-testid="falta-estoque"
                className="text-xs text-red-600 dark:text-red-400 font-semibold mt-1 flex items-center gap-1.5 flex-wrap"
              >
                <span>Falta de estoque</span>
                {exibirEstoque && (
                  <>
                    <span className="text-slate-400 dark:text-slate-500 font-normal">—</span>
                    {onDefinirKanban ? (
                      <button
                        type="button"
                        data-testid="btn-ajustar-capacidade-estoque"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDefinirKanban(kanbansPossiveis);
                        }}
                        title={`Clique para ajustar automaticamente para ${kanbansPossiveis} ${kanbansPossiveis === 1 ? "kanban" : "kanbans"} suportados pelo estoque`}
                        className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 active:scale-95 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[11px] font-bold border border-amber-300/80 dark:border-amber-700/60 shadow-2xs transition-all cursor-pointer group"
                      >
                        <span>Consegue produzir:</span>{" "}
                        <strong className="underline underline-offset-2 group-hover:text-amber-800 dark:group-hover:text-amber-200">
                          {kanbansPossiveis} {kanbansPossiveis === 1 ? "kanban" : "kanbans"}
                        </strong>
                        {kanbansPossiveis > 0 && (
                          <span className="font-normal opacity-90 text-[10px]">
                            ({(kanbansPossiveis * item.qtd_por_kanban).toLocaleString("pt-BR")} pçs)
                          </span>
                        )}
                        <span className="text-[10px] ml-0.5 text-amber-600 dark:text-amber-400">⚡</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[11px] font-bold border border-amber-200/80 dark:border-amber-800/60 shadow-2xs">
                        <span>Consegue produzir:</span>{" "}
                        <strong className="underline underline-offset-2">
                          {kanbansPossiveis} {kanbansPossiveis === 1 ? "kanban" : "kanbans"}
                        </strong>
                        {kanbansPossiveis > 0 && (
                          <span className="font-normal opacity-90 text-[10px]">
                            ({(kanbansPossiveis * item.qtd_por_kanban).toLocaleString("pt-BR")} pçs)
                          </span>
                        )}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            {item.status === PlanItemStatus.Critico && onAlternarCriticoIncluido && (
              <label className="mt-2 flex items-center gap-2 rounded border border-red-200 dark:border-red-500/30 bg-red-50/80 dark:bg-red-500/10 p-1.5 text-xs font-medium text-red-800 dark:text-red-300">
                <input
                  type="checkbox"
                  checked={criticoIncluido ?? false}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => onAlternarCriticoIncluido(event.target.checked)}
                  className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500 dark:bg-slate-800 dark:border-red-700"
                />
                Incluir neste envio
              </label>
            )}

            {item.mostrar_anotacoes_quadro && item.anotacoes?.trim() && (
              <div
                data-testid="card-anotacoes-preview"
                className="mt-2 rounded-md bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 p-2 text-[11px] text-amber-950 dark:text-amber-100 font-mono whitespace-pre-wrap leading-relaxed shadow-2xs select-text"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1 font-sans font-semibold text-[10px] uppercase tracking-wider text-amber-800 dark:text-amber-400 mb-1 border-b border-amber-200/60 dark:border-amber-800/40 pb-0.5">
                  <span>📝</span>
                  <span>Anotações da Programação</span>
                </div>
                {item.anotacoes.trim()}
              </div>
            )}
          </>
        )}
        {/* Controles de Produção (Iniciar / Concluir / Quebra de Máquina / Pausar) */}
        {item.id !== null &&
          (onIniciarProducao ||
            onSolicitarConcluir ||
            onSolicitarQuebra ||
            onConcluirProducao ||
            onPausarProducao) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-1">
              {item.em_producao ? (
                <>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSolicitarConcluir) {
                        onSolicitarConcluir(item);
                      } else {
                        onConcluirProducao?.(item.id as number);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                    title="Concluir produção e informar peças produzidas"
                  >
                    ✓ Concluir
                  </button>
                  {onSolicitarQuebra && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSolicitarQuebra(item);
                      }}
                      className="flex items-center justify-center gap-1 rounded bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                      title="Registrar quebra de máquina/ferramenta e mover para ferramentaria"
                    >
                      ⚠️ Quebra
                    </button>
                  )}
                  {podeDesfazerInicio && onDesfazerInicio && (
                    <button
                      type="button"
                      data-testid="btn-desfazer-inicio"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDesfazerInicio(item.id as number);
                      }}
                      className="flex items-center justify-center gap-1 rounded border border-amber-300 dark:border-amber-700/80 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 px-2 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                      title="Desfazer início acidental (disponível nos primeiros 60 segundos após o início)"
                    >
                      <span>↩ Desfazer ({segundosRestantesDesfazer}s)</span>
                    </button>
                  )}
                  {isAdmin && onPausarProducao && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPausarProducao(item.id as number);
                      }}
                      className="flex items-center justify-center gap-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                      title="Pausar item"
                    >
                      ⏸ Pausar
                    </button>
                  )}
                </>
              ) : item.coluna_extra_id === null && onIniciarProducao && podeIniciar ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onIniciarProducao(item.id as number);
                  }}
                  className={`w-full flex items-center justify-center gap-1.5 rounded py-1.5 px-3 text-xs font-semibold text-white shadow-sm transition-all cursor-pointer ${
                    corDestaque === "blue"
                      ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                      : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800"
                  }`}
                  title="Iniciar produção do primeiro item da fila"
                >
                  ▶ Iniciar Produção
                </button>
              ) : item.coluna_extra_id === null && onIniciarProducao && bloqueioTandem ? (
                <div
                  className="w-full flex items-center justify-center gap-1.5 rounded py-1.5 px-2.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200 bg-amber-100/90 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 shadow-2xs text-center"
                  title={`Produção em Linha aguardando sincronismo: ${bloqueioTandem}`}
                >
                  <span>⏳</span>
                  <span className="truncate">{bloqueioTandem}</span>
                </div>
              ) : null}
              {modoEdicao && onSolicitarEditarItem && !isItemFinalizado && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSolicitarEditarItem(item);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded py-1.5 px-3 text-xs font-black bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 shadow-xs transition-all cursor-pointer"
                  title="Editar horários e parâmetros deste lote em produção"
                >
                  <span>✏️</span>
                  <span>Editar Lote / Horários</span>
                </button>
              )}
            </div>
          )}

        <CardFooter
          itemId={item.id}
          temAnotacoes={Boolean(item.anotacoes?.trim())}
          postoTrabalho={item.posto_trabalho}
          setor={item.setor}
        />
        {!isItemFinalizado && colunasExtras && onMoverParaColunaExtra && item.id !== null && (
          <select
            value={item.coluna_extra_id ?? ""}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              const itemId = item.id as number;
              const valor = event.target.value ? Number(event.target.value) : null;
              onMoverParaColunaExtra(itemId, valor);
            }}
            className="mt-2 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-1 py-0.5 text-xs text-slate-700 dark:text-slate-300"
          >
            <option value="">Coluna extra...</option>
            {colunasExtras.map((coluna) => (
              <option key={coluna.id} value={coluna.id}>
                {coluna.nome}
              </option>
            ))}
          </select>
        )}
      </div>
      {detalheAberto && item.id !== null && (
        <ItemDetalhe
          item={item}
          onClose={() => setDetalheAberto(false)}
          onSolicitarEditarItem={(it) => {
            setDetalheAberto(false);
            onSolicitarEditarItem?.(it);
          }}
        />
      )}
    </>
  );
}
