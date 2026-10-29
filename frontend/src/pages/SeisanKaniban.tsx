import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useRef, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, listarTabelaB, getParametros } from "../services/api";
import { LINHAS_DISPONIVEIS, type ItemProducao, type Linha } from "../types/producao";
import {
  criarJanelaTemporal,
  type GranularidadeZoom,
  type HorariosTurnosConfig,
  ESCALAS_ZOOM_CONFIG,
  LISTA_ESCALAS_ZOOM,
} from "../utils/seisanTimeUtils";
import { SeisanKanibanHeader } from "../components/SeisanKaniban/SeisanKanibanHeader";
import { SeisanKanibanKpis } from "../components/SeisanKaniban/SeisanKanibanKpis";
import { SeisanPostoTrack } from "../components/SeisanKaniban/SeisanPostoTrack";
import { SeisanItemModal } from "../components/SeisanKaniban/SeisanItemModal";
import {
  SeisanKanibanToolbar,
  type AlturaFaixa,
  type FiltroStatusRealizado,
} from "../components/SeisanKaniban/SeisanKanibanToolbar";

export function SeisanKanriban() {
  const { token, role, logout, permissoes } = useAuth();

  const podeVerSolda =
    role === "admin" ||
    role === "programador" ||
    (permissoes ? permissoes.pode_ver_solda : true);

  const podeVerEstamparia =
    role === "admin" ||
    role === "programador" ||
    (permissoes ? permissoes.pode_ver_estamparia : true);

  const setorPadrao = podeVerSolda ? "solda" : podeVerEstamparia ? "estamparia" : "solda";

  const [setor, setSetor] = useState<string>(setorPadrao);
  const [linha, setLinha] = useState<Linha>(LINHAS_DISPONIVEIS[0].valor);
  const [turno, setTurno] = useState<number>(0); // 0 = todos (24h)
  const [dataSelecionada, setDataSelecionada] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [dataAlteradaManualmente, setDataAlteradaManualmente] = useState(false);
  const [busca, setBusca] = useState<string>("");

  // Novos Controles Solicitados pelo Usuário
  const [granularidadeZoom, setGranularidadeZoom] = useState<GranularidadeZoom>("hora_1h");
  const [alturaFaixa, setAlturaFaixa] = useState<AlturaFaixa>("normal");
  const [exibirFaixaTeorico, setExibirFaixaTeorico] = useState(true);
  const [exibirFaixaProgramado, setExibirFaixaProgramado] = useState(true);
  const [exibirFaixaRealizado, setExibirFaixaRealizado] = useState(true);
  const [filtroRealizado, setFiltroRealizado] = useState<FiltroStatusRealizado>("todos");

  // Referência para o container com suporte a Ctrl + Wheel zoom
  const ganttContainerRef = useRef<HTMLDivElement>(null);

  // Estado do Modal de Detalhes
  const [itemSelecionado, setItemSelecionado] = useState<ItemProducao | null>(null);
  const [tipoSelecionado, setTipoSelecionado] = useState<
    "programado" | "realizado" | "gap" | "teorico" | null
  >(null);

  // Buscar parâmetros configurados do sistema (horários de início de turno, refeições e pausas)
  const parametrosQuery = useQuery({
    queryKey: ["parametros-sistema"],
    queryFn: () => getParametros(token as string),
    enabled: Boolean(token),
  });

  const horariosConfig = useMemo<HorariosTurnosConfig>(() => {
    const params = parametrosQuery.data ?? [];
    const t1Inicio = params.find((p) => p.chave === "hora_inicio_turno_1")?.valor;
    const t2Inicio = params.find((p) => p.chave === "hora_inicio_turno_2")?.valor;
    const t3Inicio = params.find((p) => p.chave === "hora_inicio_turno_3")?.valor;
    const t1AlmocoInicio = params.find((p) => p.chave === "hora_refeicao_turno_1")?.valor;
    const t2AlmocoInicio = params.find((p) => p.chave === "hora_refeicao_turno_2")?.valor;
    const t3AlmocoInicio = params.find((p) => p.chave === "hora_refeicao_turno_3")?.valor;
    const duracaoStr = params.find((p) => p.chave === "duracao_refeicao_minutos")?.valor;
    const duracaoRefeicaoMin = duracaoStr ? Number(duracaoStr) : undefined;

    return {
      t1Inicio,
      t2Inicio,
      t3Inicio,
      t1AlmocoInicio,
      t2AlmocoInicio,
      t3AlmocoInicio,
      duracaoRefeicaoMin,
    };
  }, [parametrosQuery.data]);

  // Buscar itens da Tabela B (linha inteira independente de Patan)
  const query = useQuery({
    queryKey: ["tabela-b-seisan", setor, linha, turno],
    queryFn: async () => {
      if (!token) throw new Error("Não autenticado");
      try {
        return await listarTabelaB(token, {
          setor,
          linha,
          turno: turno === 0 ? undefined : turno,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logout();
        }
        throw err;
      }
    },
    enabled: Boolean(token),
    retry: false,
  });

  const todosItens = query.data ?? [];

  // Extrai datas disponíveis com contagem de lotes programados e realizados
  const datasDisponiveis = useMemo(() => {
    const mapa = new Map<string, { programados: number; realizados: number }>();
    for (const item of todosItens) {
      if (item.hora_inicial) {
        const d = String(item.hora_inicial).slice(0, 10);
        const atual = mapa.get(d) ?? { programados: 0, realizados: 0 };
        atual.programados++;
        mapa.set(d, atual);
      }
      if (item.inicio_real) {
        const d = String(item.inicio_real).slice(0, 10);
        const atual = mapa.get(d) ?? { programados: 0, realizados: 0 };
        atual.realizados++;
        mapa.set(d, atual);
      }
    }
    return Array.from(mapa.entries())
      .map(([data, counts]) => ({ data, ...counts }))
      .sort((a, b) => b.data.localeCompare(a.data)); // mais recentes primeiro
  }, [todosItens]);

  // Se o dia atual não tiver nenhum lote programado/realizado, mas houver outra data com lotes,
  // auto-seleciona a data com ordens mais recente para a tela não abrir sem as faixas
  useEffect(() => {
    if (dataAlteradaManualmente || datasDisponiveis.length === 0) return;
    const temNaDataAtual = datasDisponiveis.some(
      (d) => d.data === dataSelecionada && (d.programados > 0 || d.realizados > 0)
    );
    if (!temNaDataAtual) {
      const dataComProgramados = datasDisponiveis.find((d) => d.programados > 0);
      setDataSelecionada(dataComProgramados ? dataComProgramados.data : datasDisponiveis[0].data);
    }
  }, [datasDisponiveis, dataSelecionada, dataAlteradaManualmente]);

  function handleDataChange(novaData: string) {
    setDataAlteradaManualmente(true);
    setDataSelecionada(novaData);
  }

  function handleNavegarDia(offsetDias: number) {
    setDataAlteradaManualmente(true);
    const [ano, mes, dia] = dataSelecionada.split("-").map(Number);
    const d = new Date(ano, mes - 1, dia + offsetDias);
    const pad = (n: number) => String(n).padStart(2, "0");
    setDataSelecionada(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }

  function handleIrParaHoje() {
    setDataAlteradaManualmente(true);
    setDataSelecionada(new Date().toISOString().slice(0, 10));
  }

  // Data base para cálculo da régua temporal
  const dataBase = useMemo(() => {
    if (!dataSelecionada) return new Date();
    const [ano, mes, dia] = dataSelecionada.split("-").map(Number);
    return new Date(ano, mes - 1, dia);
  }, [dataSelecionada]);

  // Cria a janela temporal de visualização
  const janela = useMemo(() => {
    return criarJanelaTemporal(dataBase, turno === 0 ? undefined : turno);
  }, [dataBase, turno]);

  // Contadores para os filtros de status do Realizado
  const contadoresRealizado = useMemo(() => {
    let concluidos = 0;
    let quebras = 0;
    let produzindo = 0;
    let pendentes = 0;

    for (const item of todosItens) {
      const isQuebra =
        item.motivo_interrupcao === "quebra" ||
        (item.fim_real &&
          (item.quantidade_produzida_real ?? 0) < item.kanbans * item.qtd_por_kanban &&
          item.motivo_interrupcao);

      if (isQuebra) quebras++;
      else if (item.fim_real) concluidos++;
      else if (item.em_producao) produzindo++;
      else pendentes++;
    }

    return {
      total: todosItens.length,
      concluidos,
      quebras,
      produzindo,
      pendentes,
    };
  }, [todosItens]);

  // Suporte a Ctrl + Roda do Mouse (Wheel) para aproximar e afastar o tempo
  useEffect(() => {
    const el = ganttContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setGranularidadeZoom((prev) => {
          const idx = LISTA_ESCALAS_ZOOM.indexOf(prev);
          if (e.deltaY < 0) {
            // Zoom In (aproxima escala temporal)
            return idx < LISTA_ESCALAS_ZOOM.length - 1 ? LISTA_ESCALAS_ZOOM[idx + 1] : prev;
          } else {
            // Zoom Out (afasta escala temporal)
            return idx > 0 ? LISTA_ESCALAS_ZOOM[idx - 1] : prev;
          }
        });
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Filtragem e Agrupamento por Posto de Trabalho
  const postosAgrupados = useMemo(() => {
    const mapa = new Map<string, ItemProducao[]>();
    const termo = busca.trim().toLowerCase();

    for (const item of todosItens) {
      // Filtro de busca textual
      if (termo) {
        const atendePosto = item.posto_trabalho.toLowerCase().includes(termo);
        const atendeMaterial = item.material?.toLowerCase().includes(termo) ?? false;
        if (!atendePosto && !atendeMaterial) continue;
      }

      const lista = mapa.get(item.posto_trabalho) ?? [];
      lista.push(item);
      mapa.set(item.posto_trabalho, lista);
    }

    // Ordenar itens dentro de cada posto por hora_inicial ou sequencia
    const resultado: { posto: string; itens: ItemProducao[] }[] = [];
    for (const [posto, lista] of mapa.entries()) {
      lista.sort((a, b) => {
        if (a.hora_inicial && b.hora_inicial) {
          return new Date(a.hora_inicial).getTime() - new Date(b.hora_inicial).getTime();
        }
        return a.sequencia - b.sequencia;
      });
      resultado.push({ posto, itens: lista });
    }

    // Ordenar postos alfabeticamente
    resultado.sort((a, b) => a.posto.localeCompare(b.posto));
    return resultado;
  }, [todosItens, busca]);

  const larguraMinimaPx = ESCALAS_ZOOM_CONFIG[granularidadeZoom].larguraMinimaPx;

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Header com Identidade TPS e Tabs de Setor */}
      <SeisanKanibanHeader
        setor={setor}
        onSetorChange={setSetor}
        podeVerSolda={podeVerSolda}
        podeVerEstamparia={podeVerEstamparia}
        onRefresh={() => query.refetch()}
        isFetching={query.isFetching}
      />

      {/* KPIs de Produção */}
      <SeisanKanibanKpis itens={todosItens} />

      {/* BARRA ÚNICA DE CONTROLE E FILTROS LEAN TPS */}
      <SeisanKanibanToolbar
        linha={linha}
        onLinhaChange={setLinha}
        turno={turno}
        onTurnoChange={setTurno}
        dataSelecionada={dataSelecionada}
        onDataChange={handleDataChange}
        datasDisponiveis={datasDisponiveis}
        onNavegarDia={handleNavegarDia}
        onIrParaHoje={handleIrParaHoje}
        busca={busca}
        onBuscaChange={setBusca}
        granularidadeZoom={granularidadeZoom}
        onGranularidadeZoomChange={setGranularidadeZoom}
        exibirFaixaTeorico={exibirFaixaTeorico}
        onToggleFaixaTeorico={() => setExibirFaixaTeorico((prev) => !prev)}
        exibirFaixaProgramado={exibirFaixaProgramado}
        onToggleFaixaProgramado={() => setExibirFaixaProgramado((prev) => !prev)}
        exibirFaixaRealizado={exibirFaixaRealizado}
        onToggleFaixaRealizado={() => setExibirFaixaRealizado((prev) => !prev)}
        onMostrarTodasFaixas={() => {
          setExibirFaixaTeorico(true);
          setExibirFaixaProgramado(true);
          setExibirFaixaRealizado(true);
        }}
        filtroRealizado={filtroRealizado}
        onFiltroRealizadoChange={setFiltroRealizado}
        alturaFaixa={alturaFaixa}
        onAlturaFaixaChange={setAlturaFaixa}
        contadores={contadoresRealizado}
      />

      {/* Banner de Sugestão de Data com Lotes Programados */}
      {datasDisponiveis.length > 0 &&
        !datasDisponiveis.some((d) => d.data === dataSelecionada && d.programados > 0) && (
          <div className="mx-4 mb-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between flex-wrap gap-2 shadow-2xs animate-in fade-in">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base">💡</span>
              <span>
                Nenhum lote programado na data{" "}
                <strong>{dataSelecionada.split("-").reverse().join("/")}</strong>. Encontramos ordens
                programadas nas datas:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {datasDisponiveis
                  .filter((d) => d.programados > 0)
                  .slice(0, 3)
                  .map((d) => (
                    <button
                      key={d.data}
                      type="button"
                      onClick={() => handleDataChange(d.data)}
                      className="px-2 py-0.5 rounded font-bold bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 transition-colors cursor-pointer"
                    >
                      {d.data.split("-").reverse().join("/")} ({d.programados} ordens)
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}

      {/* Conteúdo Principal do Gantt Seisan Kaniban */}
      <div ref={ganttContainerRef} className="flex-1 p-4">
        {query.isLoading && (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
              <span className="text-xs font-semibold">Carregando Seisan Kanriban...</span>
            </div>
          </div>
        )}

        {query.isError && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
            Erro ao carregar os dados de produção do Seisan Kanriban.
          </div>
        )}

        {query.data && postosAgrupados.length === 0 && (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-xs">
            <span className="text-4xl">📊</span>
            <h3 className="mt-2 text-base font-bold text-slate-800 dark:text-slate-100">
              Nenhuma ordem programada para este filtro
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Não encontramos lotes na Tabela B para o setor {setor.toUpperCase()}, {linha} e filtros
              selecionados. Acesse a tela Programação para enviar novos lotes.
            </p>
          </div>
        )}

        {query.data && postosAgrupados.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            {/* Trilhas de Postos de Trabalho com régua horária individual integrada */}
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {postosAgrupados.map(({ posto, itens }) => (
                <SeisanPostoTrack
                  key={posto}
                  posto={posto}
                  itens={itens}
                  janela={janela}
                  larguraMinimaPx={larguraMinimaPx}
                  granularidade={granularidadeZoom}
                  alturaFaixa={alturaFaixa}
                  exibirFaixaTeorico={exibirFaixaTeorico}
                  exibirFaixaProgramado={exibirFaixaProgramado}
                  exibirFaixaRealizado={exibirFaixaRealizado}
                  filtroRealizado={filtroRealizado}
                  horariosConfig={horariosConfig}
                  onSelectItem={(item, tipo) => {
                    setItemSelecionado(item);
                    setTipoSelecionado(tipo);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de Detalhes ao Clicar */}
      {itemSelecionado && (
        <SeisanItemModal
          item={itemSelecionado}
          tipo={tipoSelecionado}
          onClose={() => {
            setItemSelecionado(null);
            setTipoSelecionado(null);
          }}
        />
      )}
    </div>
  );
}

export const SeisanKaniban = SeisanKanriban;
