import { useEffect, useMemo, useRef, useState } from "react";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import { PlanItemStatus, type ColunaExtra, type ItemProducao } from "../../types/producao";
import { AdicionarColunaForm } from "./AdicionarColunaForm";
import { BucketColuna } from "./BucketColuna";
import { construirIndiceContainers, resolverAcaoDrop } from "./dragEndHandler";
import { PostoColuna } from "./PostoColuna";

interface SequenciaBoardProps {
  itensPorPosto: Record<string, ItemProducao[]>;
  onReordenar: (posto: string, itens: ItemProducao[]) => void;
  somenteLeitura?: boolean;
  colunasExtras?: ColunaExtra[];
  itensPorColunaExtra?: Record<number, ItemProducao[]>;
  podeGerenciarColunasExtras?: boolean;
  onCriarColunaExtra?: (nome: string) => void;
  onApagarColunaExtra?: (id: number) => void;
  onRenomearColunaExtra?: (id: number, novoNome: string) => void;
  onMoverParaColunaExtra?: (itemId: number, colunaExtraId: number | null) => void;
  onAjustarKanban?: (posto: string, chave: string, delta: number) => void;
  onDefinirKanban?: (posto: string, chave: string, kanbans: number) => void;
  itensCriticosIncluidos?: Set<number>;
  onAlternarCriticoIncluido?: (itemId: number, incluido: boolean) => void;
  onRemoverItem?: (posto: string, chave: string) => void;
  exibirEstoque?: boolean;
  onIniciarProducao?: (itemId: number) => void;
  onPausarProducao?: (itemId: number) => void;
  onDesfazerInicio?: (itemId: number) => void;
  onConcluirProducao?: (itemId: number) => void;
  onSolicitarConcluir?: (item: ItemProducao) => void;
  onSolicitarQuebra?: (item: ItemProducao) => void;
  materiaisBloqueados?: string[];
  corDestaque?: "emerald" | "blue";
  modoCompacto?: boolean;
  limiteLoteCurtoMinutos?: number;
  limiteLoteCurtoSoldaMinutos?: number;
  modoEdicao?: boolean;
  onSolicitarEditarItem?: (item: ItemProducao) => void;
}

interface LinhaConexao {
  id: string;
  material: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isHovered: boolean;
}

export function SequenciaBoard({
  itensPorPosto,
  onReordenar,
  somenteLeitura = false,
  colunasExtras,
  itensPorColunaExtra,
  podeGerenciarColunasExtras = false,
  onCriarColunaExtra,
  onApagarColunaExtra,
  onRenomearColunaExtra,
  onMoverParaColunaExtra,
  onAjustarKanban,
  onDefinirKanban,
  itensCriticosIncluidos,
  onAlternarCriticoIncluido,
  onRemoverItem,
  exibirEstoque = true,
  onIniciarProducao,
  onPausarProducao,
  onDesfazerInicio,
  onConcluirProducao,
  onSolicitarConcluir,
  onSolicitarQuebra,
  materiaisBloqueados,
  corDestaque,
  modoCompacto,
  limiteLoteCurtoMinutos,
  limiteLoteCurtoSoldaMinutos,
  modoEdicao,
  onSolicitarEditarItem,
}: SequenciaBoardProps) {
  const [menuAbertoId, setMenuAbertoId] = useState<number | null>(null);
  const [renomeandoId, setRenomeandoId] = useState<number | null>(null);
  const [materialSelecionado, setMaterialSelecionado] = useState<string | null>(null);
  const [materialHover, setMaterialHover] = useState<string | null>(null);
  const [mostrarConexoesLinha, setMostrarConexoesLinha] = useState<boolean>(true);
  const [conexoes, setConexoes] = useState<LinhaConexao[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);

  // Material atualmente em foco (seleção fixa ou hover ativo em card/banner)
  const materialFoco = materialSelecionado ?? materialHover;

  // Mapeia materiais presentes em mais de um posto da linha (Produção em Linha contínua / tandem)
  // Itens em colunas extras (Concluídas, Quebra) são estritamente excluídos da contagem tandem.
  // Mapeia materiais presentes em mais de um posto da linha (Produção em Linha contínua / tandem)
  // Itens em colunas extras (Concluídas, Quebra) são estritamente excluídos da contagem tandem.
  // Agrupamento estritamente fechado por data de referência: itens de dias diferentes nunca sincronizam.
  const postosPorMaterial = useMemo(() => {
    const mapa: Record<string, Set<string>> = {};
    for (const [posto, itens] of Object.entries(itensPorPosto)) {
      for (const item of itens) {
        if (item.coluna_extra_id !== null || item.status === PlanItemStatus.Excluido) continue;
        const mat = (item.material ?? "").trim().toUpperCase();
        if (mat) {
          const dataRef = item.data_programada
            ? String(item.data_programada).slice(0, 10)
            : (item.hora_inicial ? String(item.hora_inicial).slice(0, 10) : "sem_data");
          const chave = `${mat}__${dataRef}`;
          if (!mapa[chave]) mapa[chave] = new Set();
          mapa[chave].add(posto);
        }
      }
    }
    const res: Record<string, string[]> = {};
    for (const [chave, postos] of Object.entries(mapa)) {
      if (postos.size > 1) {
        res[chave] = Array.from(postos).sort();
        const [mat, dataRef] = chave.split("__");
        if (dataRef === "sem_data" && !res[mat]) {
          res[mat] = Array.from(postos).sort();
        }
      }
    }
    return res;
  }, [itensPorPosto]);

  // Lista única de materiais em linha para o banner de pills
  const materiaisEmLinhaLista = useMemo(() => {
    const visto = new Set<string>();
    const lista: Array<{ mat: string; postos: string[] }> = [];
    for (const [chave, postos] of Object.entries(postosPorMaterial)) {
      if (chave.includes("__")) {
        const [mat] = chave.split("__");
        if (!visto.has(mat)) {
          visto.add(mat);
          lista.push({ mat, postos });
        }
      }
    }
    return lista;
  }, [postosPorMaterial]);

  const qtdMateriaisEmLinha = materiaisEmLinhaLista.length;

  // Desenha as linhas de conexão SOMENTE quando um material estiver em foco (hover ou seleção)
  // para evitar poluir a tela quando em repouso.
  useEffect(() => {
    if (!boardRef.current || !mostrarConexoesLinha || qtdMateriaisEmLinha === 0 || !materialFoco) {
      setConexoes([]);
      return;
    }

    const boardEl = boardRef.current;
    const atualizarConexoes = () => {
      const boardRect = boardEl.getBoundingClientRect();
      const scrollLeft = boardEl.scrollLeft;
      const scrollTop = boardEl.scrollTop;

      // Busca cards correspondentes exclusivamente ao material em foco
      const cardEls = boardEl.querySelectorAll<HTMLElement>(`[data-material="${CSS.escape(materialFoco)}"]`);
      if (cardEls.length < 2) {
        setConexoes([]);
        return;
      }

      const lista = Array.from(cardEls).map((el) => ({
        el,
        rect: el.getBoundingClientRect(),
      }));

      // Ordena da esquerda para a direita pela posição X da coluna
      lista.sort((a, b) => a.rect.left - b.rect.left);

      const novasLinhas: LinhaConexao[] = [];

      for (let i = 0; i < lista.length - 1; i++) {
        const a = lista[i].rect;
        const b = lista[i + 1].rect;

        // Liga cards entre colunas distintas (evita ligar cards dentro da mesma coluna)
        if (Math.abs(a.left - b.left) > 30) {
          const x1 = a.right - boardRect.left + scrollLeft;
          const y1 = a.top + 28 - boardRect.top + scrollTop; // Ponto de ancoragem na altura do badge
          const x2 = b.left - boardRect.left + scrollLeft;
          const y2 = b.top + 28 - boardRect.top + scrollTop;

          novasLinhas.push({
            id: `${materialFoco}-${i}-${i + 1}`,
            material: materialFoco,
            x1,
            y1,
            x2,
            y2,
            isHovered: true,
          });
        }
      }

      setConexoes(novasLinhas);
    };

    const timer = setTimeout(atualizarConexoes, 40);
    boardEl.addEventListener("scroll", atualizarConexoes, { passive: true });
    window.addEventListener("resize", atualizarConexoes);

    return () => {
      clearTimeout(timer);
      boardEl.removeEventListener("scroll", atualizarConexoes);
      window.removeEventListener("resize", atualizarConexoes);
    };
  }, [itensPorPosto, postosPorMaterial, qtdMateriaisEmLinha, materialFoco, mostrarConexoesLinha]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const containerPorItemId = construirIndiceContainers(
    itensPorPosto,
    colunasExtras,
    itensPorColunaExtra
  );

  function handleDragEnd(event: DragEndEvent) {
    const acao = resolverAcaoDrop(
      event,
      containerPorItemId,
      itensPorPosto,
      somenteLeitura,
      colunasExtras
    );
    if (acao.tipo === "reordenar") onReordenar(acao.posto, acao.itens);
    else if (acao.tipo === "mover-bucket") onMoverParaColunaExtra?.(acao.itemId, acao.colunaExtraId);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="sequencia-board-wrapper flex flex-col gap-2">
        {/* Banner de Produção em Linha com atalhos de filtro e destaque */}
        {qtdMateriaisEmLinha > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50/90 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800/80 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 shadow-2xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 font-bold text-xs">
                🔗
              </span>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                  Produção em Linha ({qtdMateriaisEmLinha} material(is) sincronizados em tandem):
                </strong>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden md:inline">
                  (Passe o mouse ou clique no material para visualizar as linhas de conexão)
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap ml-1">
                {materiaisEmLinhaLista.map(({ mat, postos }) => {
                  const isSelecionado = materialSelecionado === mat;
                  const isHovered = materialHover === mat;
                  return (
                    <button
                      key={mat}
                      type="button"
                      data-testid={`pill-material-${mat}`}
                      onClick={() => setMaterialSelecionado((prev) => (prev === mat ? null : mat))}
                      onMouseEnter={() => setMaterialHover(mat)}
                      onMouseLeave={() => setMaterialHover(null)}
                      className={`rounded px-2.5 py-1 font-mono text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelecionado
                          ? "bg-sky-600 text-white shadow-xs scale-105 ring-2 ring-sky-300"
                          : isHovered
                          ? "bg-sky-500 text-white shadow-xs scale-102 ring-1 ring-sky-300"
                          : "bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border border-sky-200/70 dark:border-sky-800/50 hover:bg-sky-100 dark:hover:bg-sky-900/50"
                      }`}
                      title={
                        isSelecionado
                          ? `Material ${mat} selecionado. Clique para desmarcar.`
                          : `Clique para fixar as linhas de conexão ou passe o mouse. Roda nos postos: ${postos.join(" ↔ ")}`
                      }
                    >
                      {isSelecionado && <span>📌</span>}
                      <span>{mat}</span>
                      <span className="text-[10px] opacity-80 font-normal">({postos.length} postos)</span>
                    </button>
                  );
                })}
                {materialSelecionado && (
                  <button
                    type="button"
                    onClick={() => setMaterialSelecionado(null)}
                    className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 hover:underline px-1 cursor-pointer"
                    title="Desmarcar seleção de material"
                  >
                    ✕ Limpar seleção
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setMostrarConexoesLinha((prev) => !prev);
                if (mostrarConexoesLinha) {
                  setMaterialSelecionado(null);
                  setMaterialHover(null);
                }
              }}
              className="text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:underline cursor-pointer shrink-0 ml-auto"
            >
              {mostrarConexoesLinha ? "Desativar Linhas" : "Ativar Linhas"}
            </button>
          </div>
        )}

        {/* Quadro com as Colunas e Camada SVG de Conexão */}
        <div ref={boardRef} className="sequencia-board relative flex gap-4 overflow-x-auto pb-4 items-start min-w-full">
          {/* Overlay SVG com linhas conectando os cards de produção em linha */}
          {conexoes.length > 0 && mostrarConexoesLinha && (
            <svg
              data-testid="conexoes-overlay"
              className="pointer-events-none absolute inset-0 z-0 overflow-visible"
              style={{
                width: boardRef.current ? Math.max(boardRef.current.scrollWidth, 1000) : "100%",
                height: boardRef.current ? Math.max(boardRef.current.scrollHeight, 600) : "100%",
              }}
            >
              {conexoes.map((c) => {
                const dx = Math.max(25, (c.x2 - c.x1) / 2);
                const pathD = `M ${c.x1} ${c.y1} C ${c.x1 + dx} ${c.y1}, ${c.x2 - dx} ${c.y2}, ${c.x2} ${c.y2}`;
                return (
                  <g key={c.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={c.isHovered ? "#0284c7" : "#7dd3fc"}
                      strokeWidth={c.isHovered ? 3 : 1.75}
                      strokeDasharray={c.isHovered ? "6 3" : "4 4"}
                      opacity={materialFoco ? (c.isHovered ? 1 : 0.25) : 0.75}
                      className={c.isHovered ? "animate-pulse" : ""}
                    />
                    <circle
                      cx={c.x1}
                      cy={c.y1}
                      r={c.isHovered ? 4.5 : 3}
                      fill={c.isHovered ? "#0369a1" : "#38bdf8"}
                      opacity={materialFoco && !c.isHovered ? 0.3 : 1}
                    />
                    <circle
                      cx={c.x2}
                      cy={c.y2}
                      r={c.isHovered ? 4.5 : 3}
                      fill={c.isHovered ? "#0369a1" : "#38bdf8"}
                      opacity={materialFoco && !c.isHovered ? 0.3 : 1}
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {Object.entries(itensPorPosto).map(([posto, itens]) => (
            <PostoColuna
              key={posto}
              posto={posto}
              itens={itens}
              itensPorPosto={itensPorPosto}
              colunasExtras={colunasExtras}
              onMoverParaColunaExtra={onMoverParaColunaExtra}
              onAjustarKanban={
                onAjustarKanban ? (chave, delta) => onAjustarKanban(posto, chave, delta) : undefined
              }
              onDefinirKanban={
                onDefinirKanban
                  ? (chave, kanbans) => onDefinirKanban(posto, chave, kanbans)
                  : undefined
              }
              itensCriticosIncluidos={itensCriticosIncluidos}
              onAlternarCriticoIncluido={onAlternarCriticoIncluido}
              onRemoverItem={
                onRemoverItem ? (chave) => onRemoverItem(posto, chave) : undefined
              }
              exibirEstoque={exibirEstoque}
              onIniciarProducao={onIniciarProducao}
              onPausarProducao={onPausarProducao}
              onDesfazerInicio={onDesfazerInicio}
              onConcluirProducao={onConcluirProducao}
              onSolicitarConcluir={onSolicitarConcluir}
              onSolicitarQuebra={onSolicitarQuebra}
              materiaisBloqueados={materiaisBloqueados}
              corDestaque={corDestaque}
              modoCompacto={modoCompacto}
              postosPorMaterial={postosPorMaterial}
              materialDestacado={materialFoco}
              onHoverMaterial={setMaterialHover}
              limiteLoteCurtoMinutos={limiteLoteCurtoMinutos}
              limiteLoteCurtoSoldaMinutos={limiteLoteCurtoSoldaMinutos}
              modoEdicao={modoEdicao}
              onSolicitarEditarItem={onSolicitarEditarItem}
            />
          ))}

          {colunasExtras?.map((coluna) => (
            <BucketColuna
              key={coluna.id}
              coluna={coluna}
              itens={itensPorColunaExtra?.[coluna.id] ?? []}
              colunasExtras={colunasExtras}
              podeGerenciar={podeGerenciarColunasExtras}
              menuAberto={menuAbertoId === coluna.id}
              onToggleMenu={() => setMenuAbertoId(menuAbertoId === coluna.id ? null : coluna.id)}
              renomeando={renomeandoId === coluna.id}
              onIniciarRenomear={() => {
                setMenuAbertoId(null);
                setRenomeandoId(coluna.id);
              }}
              onConfirmarRenomear={(novoNome) => {
                if (novoNome.trim()) onRenomearColunaExtra?.(coluna.id, novoNome.trim());
                setRenomeandoId(null);
              }}
              onCancelarRenomear={() => setRenomeandoId(null)}
              onApagar={() => {
                setMenuAbertoId(null);
                onApagarColunaExtra?.(coluna.id);
              }}
              onMoverParaColunaExtra={onMoverParaColunaExtra}
              onDefinirKanban={
                onDefinirKanban
                  ? (chave, kanbans) => onDefinirKanban(coluna.nome, chave, kanbans)
                  : undefined
              }
              exibirEstoque={exibirEstoque}
              onIniciarProducao={onIniciarProducao}
              onPausarProducao={onPausarProducao}
              onDesfazerInicio={onDesfazerInicio}
              onConcluirProducao={onConcluirProducao}
              onSolicitarConcluir={onSolicitarConcluir}
              onSolicitarQuebra={onSolicitarQuebra}
              materiaisBloqueados={materiaisBloqueados}
              corDestaque={corDestaque}
              modoCompacto={modoCompacto}
              onSolicitarEditarItem={onSolicitarEditarItem}
            />
          ))}

          {podeGerenciarColunasExtras && (
            <AdicionarColunaForm onCriar={(nome) => onCriarColunaExtra?.(nome)} />
          )}
        </div>
      </div>
    </DndContext>
  );
}
