import { PlanItemStatus, type ItemProducao } from "../types/producao";

export const SHIFT_START_TIME: Record<number, [number, number]> = {
  1: [6, 20],
  2: [14, 40],
  3: [23, 0],
};

// Placeholder meal times (shift start + 4h) - user will hand-tune later.
// Edit these directly; the cascade logic reads them, it does not derive
// them from SHIFT_START_TIME. Must match backend domain/sequenciamento.py.
export const MEAL_TIME: Record<number, [number, number]> = {
  1: [10, 20],
  2: [18, 40],
  3: [3, 0],
};

export const LUNCH_BREAK_MINUTES = 40;
export const LUNCH_BREAK_LABEL = "HORARIO DE ALMOCO INCLUSO";

export function getHojeLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateBase(dataBaseStr: string): Date {
  if (!dataBaseStr) return new Date();
  if (dataBaseStr.includes("T")) {
    const d = new Date(dataBaseStr);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }
  const parts = dataBaseStr.split("-").map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  const d = new Date(dataBaseStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

// Backend's ItemProducao.hora_inicial/hora_final are timezone-naive columns
// (Python `datetime.combine`, no tzinfo). Serializing with `.toISOString()`
// converts to UTC first, which is wrong here: these Date objects already
// represent the intended local wall-clock time, so we must emit that same
// wall-clock time back out, not its UTC equivalent.
function toNaiveIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toDateTime(base: Date, [hour, minute]: [number, number]): Date {
  const result = new Date(base);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function mealDateTime(turno: number, dataBase: Date): Date {
  const inicio = toDateTime(dataBase, SHIFT_START_TIME[turno]);
  let almoco = toDateTime(dataBase, MEAL_TIME[turno]);
  if (almoco.getTime() <= inicio.getTime()) {
    almoco = new Date(almoco.getTime() + 24 * 60 * 60 * 1000);
  }
  return almoco;
}

export function calcularTempoProducaoMinutos(
  kanbans: number,
  qtdPorKanban: number,
  tempoPorPecaMinutos: number
): number {
  return kanbans * qtdPorKanban * tempoPorPecaMinutos;
}

export function calcularCascata(
  turno: number,
  dataBase: Date,
  itens: ItemProducao[],
  inicioCustomizado?: Date | string | null
): ItemProducao[] {
  const almoco = mealDateTime(turno, dataBase);
  let proximoInicio = toDateTime(dataBase, SHIFT_START_TIME[turno]);
  if (inicioCustomizado) {
    const parsed = typeof inicioCustomizado === "string" ? new Date(inicioCustomizado) : inicioCustomizado;
    if (!isNaN(parsed.getTime())) {
      proximoInicio = parsed;
    }
  }
  const resultado: ItemProducao[] = [];

  for (const item of itens) {
    const horaInicial = new Date(proximoInicio);
    const duracaoMinutos = calcularTempoProducaoMinutos(
      item.kanbans,
      item.qtd_por_kanban,
      item.tempo_por_peca_minutos
    );
    let horaFinal = new Date(horaInicial.getTime() + duracaoMinutos * 60000);
    const almocoIncluso =
      horaInicial.getTime() < almoco.getTime() && almoco.getTime() < horaFinal.getTime();
    if (almocoIncluso) {
      horaFinal = new Date(horaFinal.getTime() + LUNCH_BREAK_MINUTES * 60000);
    }

    resultado.push({
      ...item,
      hora_inicial: toNaiveIso(horaInicial),
      hora_final: toNaiveIso(horaFinal),
      almoco_incluso: almocoIncluso,
    });

    proximoInicio = horaFinal;
  }

  return resultado;
}

export function agruparPorPosto(itens: ItemProducao[]): Record<string, ItemProducao[]> {
  const grupos: Record<string, ItemProducao[]> = {};
  for (const item of itens) {
    grupos[item.posto_trabalho] = grupos[item.posto_trabalho] ?? [];
    grupos[item.posto_trabalho].push(item);
  }
  return grupos;
}

function recalcularGrupo(
  turno: number,
  dataBase: Date,
  itens: ItemProducao[],
  inicioCustomizado?: Date | string | null,
  preservarOrdemArray = false
): ItemProducao[] {
  // Itens normais e itens criticos incluidos no posto participam da serie de producao e da cascata
  let normais = itens.filter(
    (item) => item.status === PlanItemStatus.Normal || item.is_critico || item.sequencia > 0
  );
  if (!preservarOrdemArray) {
    normais = normais.sort((a, b) => {
      const seqA = a.sequencia <= 0 ? Number.MAX_SAFE_INTEGER : a.sequencia;
      const seqB = b.sequencia <= 0 ? Number.MAX_SAFE_INTEGER : b.sequencia;
      return seqA - seqB;
    });
  }
  const resequenciados = normais.map((item, index) => ({
    ...item,
    sequencia: index + 1,
  }));
  const outros = itens.filter(
    (item) => item.status !== PlanItemStatus.Normal && !item.is_critico && item.sequencia <= 0
  );
  return [...calcularCascata(turno, dataBase, resequenciados, inicioCustomizado), ...outros];
}

export function recalcularJanelaItem(
  it: ItemProducao,
  inicio: Date,
  turno: number,
  dataBase: Date
): ItemProducao {
  const duracaoMinutos = calcularTempoProducaoMinutos(
    it.kanbans,
    it.qtd_por_kanban,
    it.tempo_por_peca_minutos
  );
  const almoco = mealDateTime(turno, dataBase);
  let horaFinal = new Date(inicio.getTime() + duracaoMinutos * 60000);
  const almocoIncluso =
    inicio.getTime() < almoco.getTime() && almoco.getTime() < horaFinal.getTime();
  if (almocoIncluso) {
    horaFinal = new Date(horaFinal.getTime() + LUNCH_BREAK_MINUTES * 60000);
  }
  return {
    ...it,
    hora_inicial: toNaiveIso(inicio),
    hora_final: toNaiveIso(horaFinal),
    almoco_incluso: almocoIncluso,
  };
}

export function identificarItemMovido(
  oldList: ItemProducao[],
  newList: ItemProducao[]
): { item: ItemProducao; from: number; to: number } | null {
  if (oldList.length !== newList.length) return null;
  const getKey = (it: ItemProducao) => String(it.id ?? `novo-${it.sequencia}`);
  for (let to = 0; to < newList.length; to++) {
    const it = newList[to];
    const key = getKey(it);
    const from = oldList.findIndex((x) => getKey(x) === key);
    if (from !== -1 && from !== to) {
      const test = [...oldList];
      const [rem] = test.splice(from, 1);
      test.splice(to, 0, rem);
      if (test.every((x, i) => getKey(x) === getKey(newList[i]))) {
        return { item: it, from, to };
      }
    }
  }
  return null;
}

export interface ItemTandemVinculado {
  posto: string;
  chave: string;
  index: number;
  item: ItemProducao;
}

export function encontrarItensTandemVinculados(
  itensPorPosto: Record<string, ItemProducao[]>,
  postoOrigem: string,
  chaveOrigem: string
): ItemTandemVinculado[] {
  const filaOrigem = itensPorPosto[postoOrigem] ?? [];
  const idxOrigem = filaOrigem.findIndex(
    (it) => String(it.id ?? `novo-${it.sequencia}`) === chaveOrigem
  );
  if (idxOrigem < 0) return [];
  const itemOrigem = filaOrigem[idxOrigem];
  const matOrigem = (itemOrigem.material ?? "").trim().toUpperCase();
  if (!matOrigem) {
    return [{ posto: postoOrigem, chave: chaveOrigem, index: idxOrigem, item: itemOrigem }];
  }

  const dRefOrigem = itemOrigem.data_programada
    ? String(itemOrigem.data_programada).slice(0, 10)
    : (itemOrigem.hora_inicial ? String(itemOrigem.hora_inicial).slice(0, 10) : "");

  // Descobre o índice de ocorrência deste material no posto de origem
  let ocorrenciaAlvo = 0;
  for (let i = 0; i < idxOrigem; i++) {
    const it = filaOrigem[i];
    const dRef = it.data_programada
      ? String(it.data_programada).slice(0, 10)
      : (it.hora_inicial ? String(it.hora_inicial).slice(0, 10) : "");
    if (
      it.coluna_extra_id === null &&
      it.status !== PlanItemStatus.Excluido &&
      (it.material ?? "").trim().toUpperCase() === matOrigem &&
      (!dRefOrigem || !dRef || dRef === dRefOrigem)
    ) {
      ocorrenciaAlvo++;
    }
  }

  const vinculados: ItemTandemVinculado[] = [];
  for (const [posto, itens] of Object.entries(itensPorPosto)) {
    let ocorrenciaAtual = 0;
    itens.forEach((it, idx) => {
      const dRef = it.data_programada
        ? String(it.data_programada).slice(0, 10)
        : (it.hora_inicial ? String(it.hora_inicial).slice(0, 10) : "");
      if (
        it.coluna_extra_id === null &&
        it.status !== PlanItemStatus.Excluido &&
        (it.material ?? "").trim().toUpperCase() === matOrigem &&
        (!dRefOrigem || !dRef || dRef === dRefOrigem)
      ) {
        if (ocorrenciaAtual === ocorrenciaAlvo) {
          vinculados.push({
            posto,
            chave: String(it.id ?? `novo-${it.sequencia}`),
            index: idx,
            item: it,
          });
        }
        ocorrenciaAtual++;
      }
    });
  }

  return vinculados.length > 0
    ? vinculados
    : [{ posto: postoOrigem, chave: chaveOrigem, index: idxOrigem, item: itemOrigem }];
}

export function sincronizarTandemCascata(
  itensPorPosto: Record<string, ItemProducao[]>,
  turno: number,
  dataBase: Date
): Record<string, ItemProducao[]> {
  const resultado: Record<string, ItemProducao[]> = {};
  for (const [posto, itens] of Object.entries(itensPorPosto)) {
    resultado[posto] = [...itens];
  }

  // Limite de segurança de deslocamento temporal: não permitir que itens extrapolem a janela do turno/dia
  const turnoOffsetMs = (turno === 3 ? 9 : 8.5) * 60 * 60 * 1000;
  const shiftStartMs = toDateTime(dataBase, SHIFT_START_TIME[turno] || [6, 20]).getTime();
  const maxPermitidoMs = shiftStartMs + turnoOffsetMs;
  const ajustesPorChave: Record<string, number> = {};

  // Iteração de ponto fixo para convergência em cadeia (até 25 iterações)
  for (let iter = 0; iter < 25; iter++) {
    let ajusteHouve = false;

    // Agrupar itens tandem por material e índice de ocorrência
    const materiaisMap: Record<
      string,
      Array<{ posto: string; idx: number }>
    > = {};

    for (const [posto, itens] of Object.entries(resultado)) {
      const occPorMaterial: Record<string, number> = {};
      itens.forEach((it, idx) => {
        if (
          (it.status === PlanItemStatus.Normal || it.is_critico || it.sequencia > 0) &&
          it.coluna_extra_id === null &&
          it.hora_inicial
        ) {
          const mat = (it.material ?? "").trim().toUpperCase();
          if (mat) {
            const dRef = it.data_programada
              ? String(it.data_programada).slice(0, 10)
              : (it.hora_inicial ? String(it.hora_inicial).slice(0, 10) : "sem_data");
            const occChave = `${dRef}__${mat}`;
            const occ = occPorMaterial[occChave] ?? 0;
            occPorMaterial[occChave] = occ + 1;
            const chave = `${dRef}__${mat}__occ_${occ}`;
            if (!materiaisMap[chave]) materiaisMap[chave] = [];
            materiaisMap[chave].push({ posto, idx });
          }
        }
      });
    }

    for (const [chaveGrupo, entradas] of Object.entries(materiaisMap)) {
      if (entradas.length > 1) {
        const postosDistintos = new Set(entradas.map((e) => e.posto));
        if (postosDistintos.size > 1) {
          // Salvaguarda contra ciclo vicioso mútuo entre lotes invertidos
          const vezesAjustado = (ajustesPorChave[chaveGrupo] ?? 0) + 1;
          ajustesPorChave[chaveGrupo] = vezesAjustado;
          if (vezesAjustado > 2) {
            continue; // Interrompe propagação circular deste grupo
          }

          // Descobrir o maior horário inicial entre todos os postos parceiros
          let maxInicioMs = 0;
          for (const e of entradas) {
            const itAtual = resultado[e.posto][e.idx];
            if (itAtual && itAtual.hora_inicial) {
              const ms = new Date(itAtual.hora_inicial).getTime();
              if (ms > maxInicioMs) maxInicioMs = ms;
            }
          }

          // Limita o avanço ao limite do turno (evita invasão do dia seguinte ou 01:00 da manhã)
          if (maxInicioMs > maxPermitidoMs) {
            maxInicioMs = maxPermitidoMs;
          }

          // Se algum posto iniciar antes do maxInicioMs, empurra para maxInicioMs e cascateia downstream
          for (const e of entradas) {
            const itAtual = resultado[e.posto][e.idx];
            if (itAtual && itAtual.hora_inicial) {
              const atualMs = new Date(itAtual.hora_inicial).getTime();
              if (atualMs < maxInicioMs) {
                ajusteHouve = true;
                const fila = resultado[e.posto];
                const novoItem = recalcularJanelaItem(itAtual, new Date(maxInicioMs), turno, dataBase);
                fila[e.idx] = novoItem;

                // Cascateia os próximos itens desta fila (itens de baixo)
                for (let segIdx = e.idx + 1; segIdx < fila.length; segIdx++) {
                  const seg = fila[segIdx];
                  if (
                    (seg.status === PlanItemStatus.Normal ||
                      seg.is_critico ||
                      seg.sequencia > 0) &&
                    seg.coluna_extra_id === null
                  ) {
                    const antFim = fila[segIdx - 1].hora_final;
                    if (antFim) {
                      fila[segIdx] = recalcularJanelaItem(seg, new Date(antFim), turno, dataBase);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (!ajusteHouve) break;
  }

  // Enriquecer metadados de tandem nos itens finais (producao_em_linha e postos_vinculados)
  const gruposTandemFinal: Record<string, Set<string>> = {};
  for (const [posto, itens] of Object.entries(resultado)) {
    const occPorMat: Record<string, number> = {};
    for (const it of itens) {
      if (
        (it.status === PlanItemStatus.Normal || it.is_critico || it.sequencia > 0) &&
        it.coluna_extra_id === null &&
        it.hora_inicial
      ) {
        const mat = (it.material ?? "").trim().toUpperCase();
        if (mat) {
          const dRef = it.data_programada
            ? String(it.data_programada).slice(0, 10)
            : (it.hora_inicial ? String(it.hora_inicial).slice(0, 10) : "sem_data");
          const occChave = `${dRef}__${mat}`;
          const occ = occPorMat[occChave] ?? 0;
          occPorMat[occChave] = occ + 1;
          const chave = `${dRef}__${mat}__occ_${occ}`;
          if (!gruposTandemFinal[chave]) gruposTandemFinal[chave] = new Set();
          gruposTandemFinal[chave].add(posto);
        }
      }
    }
  }

  for (const [posto, itens] of Object.entries(resultado)) {
    const occPorMat: Record<string, number> = {};
    resultado[posto] = itens.map((it) => {
      if (
        it.coluna_extra_id !== null ||
        it.status === PlanItemStatus.Excluido ||
        !it.hora_inicial
      ) {
        return { ...it, producao_em_linha: false, postos_vinculados: [] };
      }
      const mat = (it.material ?? "").trim().toUpperCase();
      if (!mat) {
        return { ...it, producao_em_linha: false, postos_vinculados: [] };
      }
      const dRef = it.data_programada
        ? String(it.data_programada).slice(0, 10)
        : (it.hora_inicial ? String(it.hora_inicial).slice(0, 10) : "sem_data");
      const occChave = `${dRef}__${mat}`;
      const occ = occPorMat[occChave] ?? 0;
      occPorMat[occChave] = occ + 1;
      const chave = `${dRef}__${mat}__occ_${occ}`;
      const postos = gruposTandemFinal[chave] ? Array.from(gruposTandemFinal[chave]).sort() : [];
      const isLinha = postos.length > 1;
      return {
        ...it,
        producao_em_linha: isLinha,
        postos_vinculados: isLinha ? postos : [],
      };
    });
  }

  return resultado;
}

export type ModoDimensionamento = "PATAN_FIXO" | "ESTOQUE_MAXIMO";

export function calcularKanbansPorModo(
  item: ItemProducao,
  modo?: ModoDimensionamento
): number {
  if (modo === "PATAN_FIXO") {
    // Quantidade fixa do Patan (lote padrão do ciclo): demanda dividida pela embalagem
    const lotePatanPecas =
      item.demanda && item.demanda > 0
        ? item.demanda
        : item.kanbans * (item.qtd_por_kanban || 1);
    const qtdPorCx = Math.max(1, item.qtd_por_kanban || 1);
    return Math.max(1, Math.round(lotePatanPecas / qtdPorCx));
  } else if (modo === "ESTOQUE_MAXIMO") {
    // Quantidade até o estoque máximo previsto pelo Carga Máquina
    if (item.kanban_max && item.kanban_max > 0) {
      return item.kanban_max;
    }
    return Math.max(1, item.kanbans);
  }
  return Math.max(1, item.kanbans);
}

export function calcularTemFaltaEstoque(
  kanbans: number,
  qtdPorKanban: number,
  saldoEstoque?: number | null,
  fallbackTemFalta = false
): boolean {
  if (typeof saldoEstoque === "number") {
    const qtdCx = qtdPorKanban > 0 ? qtdPorKanban : 1;
    const demandaTotal = kanbans * qtdCx;
    return demandaTotal > saldoEstoque;
  }
  return fallbackTemFalta;
}

export interface SequenciaState {
  turno: number;
  dataBase: string;
  itensPorPosto: Record<string, ItemProducao[]>;
  modoDimensionamento?: ModoDimensionamento;
  continuarAposProducao?: boolean;
  horariosInicioPorPosto?: Record<string, string>;
}

export type SequenciaAction =
  | {
      type: "CARREGAR";
      payload: {
        turno: number;
        dataBase: string;
        itens: ItemProducao[];
        modoDimensionamento?: ModoDimensionamento;
        continuarAposProducao?: boolean;
        horariosInicioPorPosto?: Record<string, string>;
      };
    }
  | { type: "REORDENAR"; payload: { posto: string; itens: ItemProducao[] } }
  | { type: "AJUSTAR_KANBAN"; payload: { posto: string; chave: string; delta: number } }
  | { type: "DEFINIR_KANBAN"; payload: { posto: string; chave: string; kanbans: number } }
  | {
      type: "EDITAR_ITEM";
      payload: {
        posto: string;
        chave: string;
        kanbans?: number;
        qtd_por_kanban?: number;
        tempo_por_peca_minutos?: number;
        hora_inicial?: string;
        hora_final?: string;
        recalcular_subsequentes?: boolean;
      };
    }
  | { type: "INCLUIR_ITEM"; payload: { item: ItemProducao } }
  | { type: "REMOVER_ITEM"; payload: { posto: string; chave: string; removerTandem?: boolean } }
  | { type: "ALTERNAR_MODO_DIMENSIONAMENTO"; payload: { modo: ModoDimensionamento } }
  | { type: "ALTERAR_DATA_BASE"; payload: { dataBase: string } }
  | {
      type: "CONFIGURAR_CONTINUAR_PRODUCAO";
      payload: {
        continuar: boolean;
        horariosInicioPorPosto?: Record<string, string>;
      };
    };

function obterInicioPosto(state: SequenciaState, posto: string): string | undefined {
  return state.continuarAposProducao ? state.horariosInicioPorPosto?.[posto] : undefined;
}

export function sequenciaReducer(
  state: SequenciaState,
  action: SequenciaAction
): SequenciaState {
  switch (action.type) {
    case "CARREGAR": {
      const dataBase = parseDateBase(action.payload.dataBase);
      const modo = action.payload.modoDimensionamento ?? state.modoDimensionamento;
      const continuar = action.payload.continuarAposProducao ?? state.continuarAposProducao ?? false;
      const horariosInicio = action.payload.horariosInicioPorPosto ?? state.horariosInicioPorPosto ?? {};
      const itensComModo = (
        modo
          ? action.payload.itens.map((it) => ({
              ...it,
              kanbans: calcularKanbansPorModo(it, modo),
            }))
          : action.payload.itens
      ).map((it) => ({
        ...it,
        tem_falta_estoque: calcularTemFaltaEstoque(
          it.kanbans,
          it.qtd_por_kanban,
          it.saldo_estoque,
          it.tem_falta_estoque
        ),
      }));

      const grupos = agruparPorPosto(itensComModo);
      const recalculados: Record<string, ItemProducao[]> = {};
      for (const [posto, itensDoGrupo] of Object.entries(grupos)) {
        const inicioPosto = continuar ? horariosInicio[posto] : undefined;
        recalculados[posto] = recalcularGrupo(action.payload.turno, dataBase, itensDoGrupo, inicioPosto);
      }
      return {
        turno: action.payload.turno,
        dataBase: action.payload.dataBase,
        itensPorPosto: sincronizarTandemCascata(recalculados, action.payload.turno, dataBase),
        modoDimensionamento: modo,
        continuarAposProducao: continuar,
        horariosInicioPorPosto: horariosInicio,
      };
    }
    case "CONFIGURAR_CONTINUAR_PRODUCAO": {
      const dataBase = parseDateBase(state.dataBase);
      const continuar = action.payload.continuar;
      const horariosInicio = action.payload.horariosInicioPorPosto ?? state.horariosInicioPorPosto ?? {};
      const recalculados: Record<string, ItemProducao[]> = {};
      for (const [posto, itensDoGrupo] of Object.entries(state.itensPorPosto)) {
        const inicioPosto = continuar ? horariosInicio[posto] : undefined;
        recalculados[posto] = recalcularGrupo(state.turno, dataBase, itensDoGrupo, inicioPosto);
      }
      return {
        ...state,
        continuarAposProducao: continuar,
        horariosInicioPorPosto: horariosInicio,
        itensPorPosto: sincronizarTandemCascata(recalculados, state.turno, dataBase),
      };
    }
    case "ALTERAR_DATA_BASE": {
      const dataBase = parseDateBase(action.payload.dataBase);
      const recalculados: Record<string, ItemProducao[]> = {};
      for (const [posto, itensDoGrupo] of Object.entries(state.itensPorPosto)) {
        recalculados[posto] = recalcularGrupo(state.turno, dataBase, itensDoGrupo, obterInicioPosto(state, posto));
      }
      return {
        ...state,
        dataBase: action.payload.dataBase,
        itensPorPosto: sincronizarTandemCascata(recalculados, state.turno, dataBase),
      };
    }
    case "REORDENAR": {
      const novaFila = action.payload.itens;
      const dataBase = parseDateBase(state.dataBase);
      const atualizados: Record<string, ItemProducao[]> = { ...state.itensPorPosto };
      const oldFilaOrigem = state.itensPorPosto[action.payload.posto] ?? [];
      const infoMovido = identificarItemMovido(oldFilaOrigem, novaFila);

      // 1. Recalcula o posto de origem com a nova ordem
      atualizados[action.payload.posto] = recalcularGrupo(
        state.turno,
        dataBase,
        novaFila,
        obterInicioPosto(state, action.payload.posto),
        true
      );

      // 2. Reposicionamento ativo inteligente em máquinas parceiras de produção em linha (tandem)
      if (infoMovido) {
        const itemMovido = infoMovido.item;
        const toIdx = infoMovido.to;
        const matMovido = (itemMovido.material ?? "").trim().toUpperCase();

        if (matMovido) {
          // Descobre qual a ocorrência do material movido no posto de origem
          let occAlvo = 0;
          for (let i = 0; i < toIdx; i++) {
            const it = novaFila[i];
            if (
              it.coluna_extra_id === null &&
              it.status !== PlanItemStatus.Excluido &&
              (it.material ?? "").trim().toUpperCase() === matMovido
            ) {
              occAlvo++;
            }
          }

          // Para cada posto parceiro, se possuir esse material na mesma ocorrência, reposiciona-o
          for (const [posto, fila] of Object.entries(atualizados)) {
            if (posto === action.payload.posto) continue;

            const filaParceiro = [...fila];
            let idxParceiro = -1;
            let occCurr = 0;

            for (let i = 0; i < filaParceiro.length; i++) {
              const it = filaParceiro[i];
              if (
                it.coluna_extra_id === null &&
                it.status !== PlanItemStatus.Excluido &&
                (it.material ?? "").trim().toUpperCase() === matMovido
              ) {
                if (occCurr === occAlvo) {
                  idxParceiro = i;
                  break;
                }
                occCurr++;
              }
            }

            if (idxParceiro !== -1) {
              const [itemParceiro] = filaParceiro.splice(idxParceiro, 1);
              let targetParceiroIdx = -1;

              if (toIdx === 0) {
                targetParceiroIdx = 0;
              } else if (toIdx === novaFila.length - 1) {
                targetParceiroIdx = filaParceiro.length;
              } else {
                // Tenta posicionar imediatamente após o vizinho anterior de novaFila que exista no parceiro
                for (let antI = toIdx - 1; antI >= 0; antI--) {
                  const matAnt = (novaFila[antI].material ?? "").trim().toUpperCase();
                  const idxAnt = filaParceiro.findIndex(
                    (x) =>
                      x.coluna_extra_id === null &&
                      x.status !== PlanItemStatus.Excluido &&
                      (x.material ?? "").trim().toUpperCase() === matAnt
                  );
                  if (idxAnt !== -1) {
                    targetParceiroIdx = idxAnt + 1;
                    break;
                  }
                }

                if (targetParceiroIdx === -1) {
                  // Tenta posicionar imediatamente antes do vizinho posterior de novaFila que exista no parceiro
                  for (let postI = toIdx + 1; postI < novaFila.length; postI++) {
                    const matPost = (novaFila[postI].material ?? "").trim().toUpperCase();
                    const idxPost = filaParceiro.findIndex(
                      (x) =>
                        x.coluna_extra_id === null &&
                        x.status !== PlanItemStatus.Excluido &&
                        (x.material ?? "").trim().toUpperCase() === matPost
                    );
                    if (idxPost !== -1) {
                      targetParceiroIdx = idxPost;
                      break;
                    }
                  }
                }
              }

              if (targetParceiroIdx === -1) {
                targetParceiroIdx = Math.min(toIdx, filaParceiro.length);
              }

              filaParceiro.splice(targetParceiroIdx, 0, itemParceiro);
              atualizados[posto] = recalcularGrupo(
                state.turno,
                dataBase,
                filaParceiro,
                obterInicioPosto(state, posto),
                true
              );
            }
          }
        }
      }

      // 3. Mapeia a precedência relativa dos itens em tandem no posto de origem
      const rankOrigem = new Map<string, number>();
      const occPorMatOrigem: Record<string, number> = {};
      novaFila.forEach((it, idx) => {
        if (it.coluna_extra_id === null && it.status !== PlanItemStatus.Excluido) {
          const mat = (it.material ?? "").trim().toUpperCase();
          if (mat) {
            const dRef = it.data_programada
              ? String(it.data_programada).slice(0, 10)
              : (it.hora_inicial ? String(it.hora_inicial).slice(0, 10) : "sem_data");
            const occChave = `${dRef}__${mat}`;
            const occ = (occPorMatOrigem[occChave] ?? 0) + 1;
            occPorMatOrigem[occChave] = occ;
            rankOrigem.set(`${dRef}__${mat}__occ_${occ}`, idx);
          }
        }
      });

      // 4. Para cada máquina parceira, ajusta a ordem relativa dos itens comuns
      for (const [posto, fila] of Object.entries(atualizados)) {
        if (posto === action.payload.posto) continue;

        const filaParceiro = [...fila];
        const occPorMat: Record<string, number> = {};
        const slotsComuns: number[] = [];
        const itensComuns: Array<{ item: ItemProducao; rank: number }> = [];

        filaParceiro.forEach((it, idx) => {
          if (it.coluna_extra_id === null && it.status !== PlanItemStatus.Excluido) {
            const mat = (it.material ?? "").trim().toUpperCase();
            if (mat) {
              const dRef = it.data_programada
                ? String(it.data_programada).slice(0, 10)
                : (it.hora_inicial ? String(it.hora_inicial).slice(0, 10) : "sem_data");
              const occChave = `${dRef}__${mat}`;
              const occ = (occPorMat[occChave] ?? 0) + 1;
              occPorMat[occChave] = occ;
              const chaveTandem = `${dRef}__${mat}__occ_${occ}`;
              if (rankOrigem.has(chaveTandem)) {
                slotsComuns.push(idx);
                itensComuns.push({ item: it, rank: rankOrigem.get(chaveTandem)! });
              }
            }
          }
        });

        if (itensComuns.length > 1) {
          // Ordena os itens comuns de acordo com o rank do posto de origem
          itensComuns.sort((a, b) => a.rank - b.rank);

          // Reatribui aos mesmos slots originais (preservando itens exclusivos do parceiro)
          slotsComuns.forEach((slotIdx, i) => {
            filaParceiro[slotIdx] = itensComuns[i].item;
          });

          atualizados[posto] = recalcularGrupo(
            state.turno,
            dataBase,
            filaParceiro,
            obterInicioPosto(state, posto),
            true
          );
        }
      }

      return {
        ...state,
        itensPorPosto: sincronizarTandemCascata(atualizados, state.turno, dataBase),
      };
    }
    case "AJUSTAR_KANBAN": {
      const dataBase = parseDateBase(state.dataBase);
      const parceiros = encontrarItensTandemVinculados(
        state.itensPorPosto,
        action.payload.posto,
        action.payload.chave
      );
      const itemOrigem =
        parceiros.find(
          (p) => p.posto === action.payload.posto && p.chave === action.payload.chave
        )?.item ??
        (state.itensPorPosto[action.payload.posto] ?? []).find(
          (it) => String(it.id ?? `novo-${it.sequencia}`) === action.payload.chave
        );
      if (!itemOrigem) return state;

      const novosKanbans = Math.max(1, itemOrigem.kanbans + action.payload.delta);
      const chavesPorPosto = new Map<string, Set<string>>();
      for (const p of parceiros) {
        if (!chavesPorPosto.has(p.posto)) chavesPorPosto.set(p.posto, new Set());
        chavesPorPosto.get(p.posto)!.add(p.chave);
      }

      const atualizados: Record<string, ItemProducao[]> = { ...state.itensPorPosto };
      for (const [posto, chavesSet] of chavesPorPosto.entries()) {
        const itensPosto = atualizados[posto] ?? [];
        const ajustados = itensPosto.map((entry) => {
          const ch = String(entry.id ?? `novo-${entry.sequencia}`);
          if (!chavesSet.has(ch)) return entry;
          const temFalta = calcularTemFaltaEstoque(
            novosKanbans,
            entry.qtd_por_kanban,
            entry.saldo_estoque,
            entry.tem_falta_estoque
          );
          return {
            ...entry,
            kanbans: novosKanbans,
            tem_falta_estoque: temFalta,
          };
        });
        atualizados[posto] = recalcularGrupo(
          state.turno,
          dataBase,
          ajustados,
          obterInicioPosto(state, posto),
          true
        );
      }

      return {
        ...state,
        itensPorPosto: sincronizarTandemCascata(atualizados, state.turno, dataBase),
      };
    }
    case "DEFINIR_KANBAN": {
      const dataBase = parseDateBase(state.dataBase);
      const parceiros = encontrarItensTandemVinculados(
        state.itensPorPosto,
        action.payload.posto,
        action.payload.chave
      );
      const itemOrigem =
        parceiros.find(
          (p) => p.posto === action.payload.posto && p.chave === action.payload.chave
        )?.item ??
        (state.itensPorPosto[action.payload.posto] ?? []).find(
          (it) => String(it.id ?? `novo-${it.sequencia}`) === action.payload.chave
        );
      if (!itemOrigem) return state;

      const novosKanbans = Math.max(1, action.payload.kanbans);
      const chavesPorPosto = new Map<string, Set<string>>();
      for (const p of parceiros) {
        if (!chavesPorPosto.has(p.posto)) chavesPorPosto.set(p.posto, new Set());
        chavesPorPosto.get(p.posto)!.add(p.chave);
      }

      const atualizados: Record<string, ItemProducao[]> = { ...state.itensPorPosto };
      for (const [posto, chavesSet] of chavesPorPosto.entries()) {
        const itensPosto = atualizados[posto] ?? [];
        const ajustados = itensPosto.map((entry) => {
          const ch = String(entry.id ?? `novo-${entry.sequencia}`);
          if (!chavesSet.has(ch)) return entry;
          const temFalta = calcularTemFaltaEstoque(
            novosKanbans,
            entry.qtd_por_kanban,
            entry.saldo_estoque,
            entry.tem_falta_estoque
          );
          return {
            ...entry,
            kanbans: novosKanbans,
            tem_falta_estoque: temFalta,
          };
        });
        atualizados[posto] = recalcularGrupo(
          state.turno,
          dataBase,
          ajustados,
          obterInicioPosto(state, posto),
          true
        );
      }

      return {
        ...state,
        itensPorPosto: sincronizarTandemCascata(atualizados, state.turno, dataBase),
      };
    }
    case "EDITAR_ITEM": {
      const dataBase = parseDateBase(state.dataBase);
      const parceiros = encontrarItensTandemVinculados(
        state.itensPorPosto,
        action.payload.posto,
        action.payload.chave
      );
      const itemOrigem =
        parceiros.find(
          (p) => p.posto === action.payload.posto && p.chave === action.payload.chave
        )?.item ??
        (state.itensPorPosto[action.payload.posto] ?? []).find(
          (it) => String(it.id ?? `novo-${it.sequencia}`) === action.payload.chave
        );
      if (!itemOrigem) return state;

      const novosKanbans =
        action.payload.kanbans !== undefined
          ? Math.max(1, action.payload.kanbans)
          : itemOrigem.kanbans;
      const novaQtdPorKanban =
        action.payload.qtd_por_kanban !== undefined
          ? Math.max(1, action.payload.qtd_por_kanban)
          : itemOrigem.qtd_por_kanban;
      const novoTempoPorPeca =
        action.payload.tempo_por_peca_minutos !== undefined
          ? Math.max(0.001, action.payload.tempo_por_peca_minutos)
          : itemOrigem.tempo_por_peca_minutos;

      const chavesPorPosto = new Map<string, Set<string>>();
      for (const p of parceiros) {
        if (!chavesPorPosto.has(p.posto)) chavesPorPosto.set(p.posto, new Set());
        chavesPorPosto.get(p.posto)!.add(p.chave);
      }

      const atualizados: Record<string, ItemProducao[]> = { ...state.itensPorPosto };
      for (const [posto, chavesSet] of chavesPorPosto.entries()) {
        const itensPosto = [...(atualizados[posto] ?? [])];
        const idxAlvo = itensPosto.findIndex((entry) =>
          chavesSet.has(String(entry.id ?? `novo-${entry.sequencia}`))
        );
        if (idxAlvo >= 0) {
          const entry = itensPosto[idxAlvo];
          const temFalta = calcularTemFaltaEstoque(
            novosKanbans,
            novaQtdPorKanban,
            entry.saldo_estoque,
            entry.tem_falta_estoque
          );
          let itemEditado: ItemProducao = {
            ...entry,
            kanbans: novosKanbans,
            qtd_por_kanban: novaQtdPorKanban,
            tempo_por_peca_minutos: novoTempoPorPeca,
            tem_falta_estoque: temFalta,
          };
          if (action.payload.hora_inicial) {
            itemEditado.hora_inicial = action.payload.hora_inicial;
          }
          if (action.payload.hora_final) {
            itemEditado.hora_final = action.payload.hora_final;
          } else if (itemEditado.hora_inicial) {
            itemEditado = recalcularJanelaItem(
              itemEditado,
              new Date(itemEditado.hora_inicial),
              state.turno,
              dataBase
            );
          }
          itensPosto[idxAlvo] = itemEditado;

          if (action.payload.recalcular_subsequentes !== false && itemEditado.hora_final) {
            let cursor = new Date(itemEditado.hora_final);
            for (let segIdx = idxAlvo + 1; segIdx < itensPosto.length; segIdx++) {
              const seg = itensPosto[segIdx];
              if (
                (seg.status === PlanItemStatus.Normal ||
                  seg.is_critico ||
                  seg.sequencia > 0) &&
                seg.coluna_extra_id === null
              ) {
                itensPosto[segIdx] = recalcularJanelaItem(
                  seg,
                  cursor,
                  state.turno,
                  dataBase
                );
                if (itensPosto[segIdx].hora_final) {
                  cursor = new Date(itensPosto[segIdx].hora_final!);
                }
              }
            }
          }
          atualizados[posto] = itensPosto;
        }
      }

      return {
        ...state,
        itensPorPosto: sincronizarTandemCascata(atualizados, state.turno, dataBase),
      };
    }
    case "INCLUIR_ITEM": {
      const posto = action.payload.item.posto_trabalho;
      const itensDoPosto = state.itensPorPosto[posto] ?? [];
      const chaveItem = String(action.payload.item.id ?? `novo-${action.payload.item.sequencia}`);
      const jaExiste = itensDoPosto.some(
        (it) => String(it.id ?? `novo-${it.sequencia}`) === chaveItem
      );
      if (jaExiste) return state;

      const itemParaIncluir: ItemProducao = {
        ...action.payload.item,
        sequencia: 0,
        is_critico: Boolean(action.payload.item.is_critico),
        tem_falta_estoque: calcularTemFaltaEstoque(
          action.payload.item.kanbans,
          action.payload.item.qtd_por_kanban,
          action.payload.item.saldo_estoque,
          action.payload.item.tem_falta_estoque
        ),
      };
      const novosItens = [...itensDoPosto, itemParaIncluir];
      const dataBase = parseDateBase(state.dataBase);
      const recalculado = recalcularGrupo(state.turno, dataBase, novosItens, obterInicioPosto(state, posto));
      const atualizados = { ...state.itensPorPosto, [posto]: recalculado };
      return {
        ...state,
        itensPorPosto: sincronizarTandemCascata(atualizados, state.turno, dataBase),
      };
    }
    case "REMOVER_ITEM": {
      const posto = action.payload.posto;
      const chave = action.payload.chave;
      const dataBase = parseDateBase(state.dataBase);
      const postosAfetados = new Set<string>([posto]);
      const chavesPorPosto: Record<string, Set<string>> = {
        [posto]: new Set([chave]),
      };

      if (action.payload.removerTandem !== false) {
        const parceiros = encontrarItensTandemVinculados(state.itensPorPosto, posto, chave);
        for (const p of parceiros) {
          postosAfetados.add(p.posto);
          (chavesPorPosto[p.posto] ??= new Set()).add(p.chave);
        }
      }

      const atualizados = { ...state.itensPorPosto };
      for (const p of postosAfetados) {
        const itensDoPosto = atualizados[p] ?? [];
        const chavesRemover = chavesPorPosto[p] ?? new Set();
        const filtrados = itensDoPosto.filter(
          (it) => !chavesRemover.has(String(it.id ?? `novo-${it.sequencia}`))
        );
        atualizados[p] = recalcularGrupo(state.turno, dataBase, filtrados, obterInicioPosto(state, p));
      }

      return {
        ...state,
        itensPorPosto: sincronizarTandemCascata(atualizados, state.turno, dataBase),
      };
    }
    case "ALTERNAR_MODO_DIMENSIONAMENTO": {
      const dataBase = parseDateBase(state.dataBase);
      const modo = action.payload.modo;
      const recalculados: Record<string, ItemProducao[]> = {};
      for (const [posto, itensDoGrupo] of Object.entries(state.itensPorPosto)) {
        const itensComNovoModo = itensDoGrupo.map((it) => {
          const novosKanbans = calcularKanbansPorModo(it, modo);
          return {
            ...it,
            kanbans: novosKanbans,
            tem_falta_estoque: calcularTemFaltaEstoque(
              novosKanbans,
              it.qtd_por_kanban,
              it.saldo_estoque,
              it.tem_falta_estoque
            ),
          };
        });
        recalculados[posto] = recalcularGrupo(state.turno, dataBase, itensComNovoModo, obterInicioPosto(state, posto));
      }
      return {
        ...state,
        itensPorPosto: sincronizarTandemCascata(recalculados, state.turno, dataBase),
        modoDimensionamento: modo,
      };
    }
    default:
      return state;
  }
}

export const initialSequenciaState: SequenciaState = {
  turno: 1,
  dataBase: getHojeLocalIso(),
  itensPorPosto: {},
  modoDimensionamento: undefined,
  continuarAposProducao: false,
  horariosInicioPorPosto: {},
};
