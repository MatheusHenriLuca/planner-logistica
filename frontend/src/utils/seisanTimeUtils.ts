/**
 * Utilitários de tempo e cálculo geométrico para o SEISAN KANRIBAN (Toyota Production System - 生産管理板).
 *
 * Mapeia timestamps de produção (hora_inicial, hora_final, inicio_real, fim_real)
 * para coordenadas temporais relativas em minutos e percentuais de uma janela de visualização.
 */

import type { ItemProducao } from "../types/producao";

export interface JanelaTemporal {
  inicioDate: Date;
  fimDate: Date;
  duracaoMinutos: number;
}

export interface FaixaTurnoTeorica {
  turno: number;
  label: string;
  inicioHora: string; // "06:20"
  fimHora: string; // "14:40"
  inicioMinutos: number; // minutos a partir do inicio da janela
  fimMinutos: number;
  almocoInicioHora: string; // "10:20"
  almocoFimHora: string; // "11:00"
  almocoInicioMinutos: number;
  almocoFimMinutos: number;
}

export const TURNOS_CONFIG = [
  {
    turno: 1,
    label: "1º Turno",
    inicioHora: "06:20",
    fimHora: "14:40",
    almocoInicioHora: "10:20",
    almocoFimHora: "11:00",
  },
  {
    turno: 2,
    label: "2º Turno",
    inicioHora: "14:40",
    fimHora: "23:00",
    almocoInicioHora: "18:40",
    almocoFimHora: "19:20",
  },
  {
    turno: 3,
    label: "3º Turno",
    inicioHora: "23:00",
    fimHora: "06:20", // próximo dia
    almocoInicioHora: "03:00", // próximo dia
    almocoFimHora: "03:40",
  },
] as const;

/**
 * Cria a janela temporal de visualização a partir de uma data de referência (ex: hoje).
 * Se turno = undefined ou 0, cria uma janela completa de 24 horas: das 06:00 do dia até 06:00 do dia seguinte.
 * Se turno for 1, 2 ou 3, foca na janela daquele turno (com margem de 20 min antes e depois).
 */
export function criarJanelaTemporal(dataRef: Date, turno?: number): JanelaTemporal {
  const ano = dataRef.getFullYear();
  const mes = dataRef.getMonth();
  const dia = dataRef.getDate();

  if (turno === 1) {
    // 06:00 até 15:00 (9 horas = 540 min)
    const inicio = new Date(ano, mes, dia, 6, 0, 0);
    const fim = new Date(ano, mes, dia, 15, 0, 0);
    return {
      inicioDate: inicio,
      fimDate: fim,
      duracaoMinutos: 9 * 60,
    };
  }

  if (turno === 2) {
    // 14:20 até 23:20 (9 horas = 540 min)
    const inicio = new Date(ano, mes, dia, 14, 20, 0);
    const fim = new Date(ano, mes, dia, 23, 20, 0);
    return {
      inicioDate: inicio,
      fimDate: fim,
      duracaoMinutos: 9 * 60,
    };
  }

  if (turno === 3) {
    // 22:40 até 06:40 do dia seguinte (8 horas = 480 min)
    const inicio = new Date(ano, mes, dia, 22, 40, 0);
    const fim = new Date(ano, mes, dia + 1, 6, 40, 0);
    return {
      inicioDate: inicio,
      fimDate: fim,
      duracaoMinutos: 8 * 60,
    };
  }

  // Padrão 24 horas completas (3 turnos do ciclo diário): das 06:00 de hoje até 06:00 de amanhã
  const inicio = new Date(ano, mes, dia, 6, 0, 0);
  const fim = new Date(ano, mes, dia + 1, 6, 0, 0);
  return {
    inicioDate: inicio,
    fimDate: fim,
    duracaoMinutos: 24 * 60, // 1440 min
  };
}

/**
 * Converte uma data qualquer para a posição em minutos decorridos desde o início da janela.
 */
export function minutosNaJanela(data: Date, janela: JanelaTemporal): number {
  const diffMs = data.getTime() - janela.inicioDate.getTime();
  return diffMs / (60 * 1000);
}

/**
 * Converte data para porcentagem horizontal (0% a 100%) na régua temporal.
 */
export function posicaoPercentual(data: Date, janela: JanelaTemporal): number {
  const min = minutosNaJanela(data, janela);
  return Math.max(0, Math.min(100, (min / janela.duracaoMinutos) * 100));
}

/**
 * Calcula a posição e largura percentual de um intervalo [inicio, fim] dentro da janela.
 */
export function calcularPosicaoBloco(
  inicioIso: string | Date,
  fimIso: string | Date,
  janela: JanelaTemporal
): { left: number; width: number; visivel: boolean } {
  const inicio = typeof inicioIso === "string" ? new Date(inicioIso) : inicioIso;
  const fim = typeof fimIso === "string" ? new Date(fimIso) : fimIso;

  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
    return { left: 0, width: 0, visivel: false };
  }

  const inicioMin = minutosNaJanela(inicio, janela);
  const fimMin = minutosNaJanela(fim, janela);

  // Se o bloco termina antes do início da janela ou começa depois do fim da janela
  if (fimMin <= 0 || inicioMin >= janela.duracaoMinutos) {
    return { left: 0, width: 0, visivel: false };
  }

  const clampedInicio = Math.max(0, inicioMin);
  const clampedFim = Math.min(janela.duracaoMinutos, fimMin);

  const left = (clampedInicio / janela.duracaoMinutos) * 100;
  const width = Math.max(0.4, ((clampedFim - clampedInicio) / janela.duracaoMinutos) * 100);

  return { left, width, visivel: true };
}

/**
 * Formata um horário ISO ou Date para HH:MM.
 */
export function formatarHoraHHMM(isoOuDate: string | Date | null | undefined): string {
  if (!isoOuDate) return "--:--";
  const d = typeof isoOuDate === "string" ? new Date(isoOuDate) : isoOuDate;
  if (isNaN(d.getTime())) return "--:--";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Formata uma data para DD/MM.
 */
export function formatarDataDDMM(isoOuDate: string | Date | null | undefined): string {
  if (!isoOuDate) return "--/--";
  const d = typeof isoOuDate === "string" ? new Date(isoOuDate) : isoOuDate;
  if (isNaN(d.getTime())) return "--/--";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/**
 * Formata um horário ISO ou Date com precisão de segundos para HH:MM:SS.
 */
export function formatarHoraHHMMSS(isoOuDate: string | Date | null | undefined): string {
  if (!isoOuDate) return "--:--:--";
  const d = typeof isoOuDate === "string" ? new Date(isoOuDate) : isoOuDate;
  if (isNaN(d.getTime())) return "--:--:--";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Formata duração em segundos para notação legível (ex: "3s", "45s", "1m 15s", "1h 26m").
 */
export function formatarDuracaoSegundos(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) {
    return `${s}s`;
  }
  const minutos = Math.floor(s / 60);
  const restoSeg = s % 60;
  if (minutos < 60) {
    return restoSeg > 0 ? `${minutos}m ${restoSeg}s` : `${minutos}m`;
  }
  const horas = Math.floor(minutos / 60);
  const restoMin = minutos % 60;
  return restoMin > 0 ? `${horas}h ${restoMin}m` : `${horas}h`;
}

export interface HorariosTurnosConfig {
  t1Inicio?: string;
  t1Fim?: string;
  t1AlmocoInicio?: string;
  t2Inicio?: string;
  t2Fim?: string;
  t2AlmocoInicio?: string;
  t3Inicio?: string;
  t3Fim?: string;
  t3AlmocoInicio?: string;
  duracaoRefeicaoMin?: number;
}

export function parseHoraMinuto(
  horaStr: string | undefined,
  fallbackH: number,
  fallbackM: number
): [number, number] {
  if (!horaStr || !horaStr.includes(":")) return [fallbackH, fallbackM];
  const [h, m] = horaStr.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return [fallbackH, fallbackM];
  return [h, m];
}

export interface ZonaAlmoco {
  inicio: Date;
  fim: Date;
  label: string;
}

export function obterZonasAlmoco(
  janela: JanelaTemporal,
  config?: HorariosTurnosConfig
): ZonaAlmoco[] {
  const ano = janela.inicioDate.getFullYear();
  const mes = janela.inicioDate.getMonth();
  const dia = janela.inicioDate.getDate();
  const duracao = config?.duracaoRefeicaoMin ?? 40;

  const [t1H, t1M] = parseHoraMinuto(config?.t1AlmocoInicio ?? "10:20", 10, 20);
  const t1Inicio = new Date(ano, mes, dia, t1H, t1M, 0);
  const t1Fim = new Date(t1Inicio.getTime() + duracao * 60000);

  const [t2H, t2M] = parseHoraMinuto(config?.t2AlmocoInicio ?? "18:40", 18, 40);
  const t2Inicio = new Date(ano, mes, dia, t2H, t2M, 0);
  const t2Fim = new Date(t2Inicio.getTime() + duracao * 60000);

  const [t3H, t3M] = parseHoraMinuto(config?.t3AlmocoInicio ?? "03:00", 3, 0);
  const t3Inicio = new Date(ano, mes, dia + 1, t3H, t3M, 0);
  const t3Fim = new Date(t3Inicio.getTime() + duracao * 60000);

  return [
    { inicio: t1Inicio, fim: t1Fim, label: "1ºT Almoço" },
    { inicio: t2Inicio, fim: t2Fim, label: "2ºT Almoço" },
    { inicio: t3Inicio, fim: t3Fim, label: "3ºT Refeição" },
  ];
}

/**
 * Calcula as faixas teóricas dos turnos para posicionamento na Faixa 1 (Patan Teórico).
 */
export function calcularFaixasTurnosTeoricas(
  janela: JanelaTemporal,
  config?: HorariosTurnosConfig
): FaixaTurnoTeorica[] {
  const ano = janela.inicioDate.getFullYear();
  const mes = janela.inicioDate.getMonth();
  const dia = janela.inicioDate.getDate();
  const duracaoRefeicao = config?.duracaoRefeicaoMin ?? 40;

  const faixas: FaixaTurnoTeorica[] = [];

  // Turno 1: padrão 06:20 às 14:40
  const [t1IniH, t1IniM] = parseHoraMinuto(config?.t1Inicio ?? "06:20", 6, 20);
  const [t1FimH, t1FimM] = parseHoraMinuto(config?.t1Fim ?? "14:40", 14, 40);
  const [t1AlmH, t1AlmM] = parseHoraMinuto(config?.t1AlmocoInicio ?? "10:20", 10, 20);

  const t1Inicio = new Date(ano, mes, dia, t1IniH, t1IniM, 0);
  const t1Fim = new Date(ano, mes, dia, t1FimH, t1FimM, 0);
  const t1AlmocoInicio = new Date(ano, mes, dia, t1AlmH, t1AlmM, 0);
  const t1AlmocoFim = new Date(t1AlmocoInicio.getTime() + duracaoRefeicao * 60000);

  faixas.push({
    turno: 1,
    label: `1º Turno (${formatarHoraHHMM(t1Inicio)} - ${formatarHoraHHMM(t1Fim)})`,
    inicioHora: formatarHoraHHMM(t1Inicio),
    fimHora: formatarHoraHHMM(t1Fim),
    inicioMinutos: minutosNaJanela(t1Inicio, janela),
    fimMinutos: minutosNaJanela(t1Fim, janela),
    almocoInicioHora: formatarHoraHHMM(t1AlmocoInicio),
    almocoFimHora: formatarHoraHHMM(t1AlmocoFim),
    almocoInicioMinutos: minutosNaJanela(t1AlmocoInicio, janela),
    almocoFimMinutos: minutosNaJanela(t1AlmocoFim, janela),
  });

  // Turno 2: padrão 14:40 às 23:00
  const [t2IniH, t2IniM] = parseHoraMinuto(config?.t2Inicio ?? "14:40", 14, 40);
  const [t2FimH, t2FimM] = parseHoraMinuto(config?.t2Fim ?? "23:00", 23, 0);
  const [t2AlmH, t2AlmM] = parseHoraMinuto(config?.t2AlmocoInicio ?? "18:40", 18, 40);

  const t2Inicio = new Date(ano, mes, dia, t2IniH, t2IniM, 0);
  const t2Fim = new Date(ano, mes, dia, t2FimH, t2FimM, 0);
  const t2AlmocoInicio = new Date(ano, mes, dia, t2AlmH, t2AlmM, 0);
  const t2AlmocoFim = new Date(t2AlmocoInicio.getTime() + duracaoRefeicao * 60000);

  faixas.push({
    turno: 2,
    label: `2º Turno (${formatarHoraHHMM(t2Inicio)} - ${formatarHoraHHMM(t2Fim)})`,
    inicioHora: formatarHoraHHMM(t2Inicio),
    fimHora: formatarHoraHHMM(t2Fim),
    inicioMinutos: minutosNaJanela(t2Inicio, janela),
    fimMinutos: minutosNaJanela(t2Fim, janela),
    almocoInicioHora: formatarHoraHHMM(t2AlmocoInicio),
    almocoFimHora: formatarHoraHHMM(t2AlmocoFim),
    almocoInicioMinutos: minutosNaJanela(t2AlmocoInicio, janela),
    almocoFimMinutos: minutosNaJanela(t2AlmocoFim, janela),
  });

  // Turno 3: padrão 23:00 às 06:20 do dia seguinte
  const [t3IniH, t3IniM] = parseHoraMinuto(config?.t3Inicio ?? "23:00", 23, 0);
  const [t3FimH, t3FimM] = parseHoraMinuto(config?.t3Fim ?? "06:20", 6, 20);
  const [t3AlmH, t3AlmM] = parseHoraMinuto(config?.t3AlmocoInicio ?? "03:00", 3, 0);

  const t3Inicio = new Date(ano, mes, dia, t3IniH, t3IniM, 0);
  const t3Fim = new Date(ano, mes, dia + 1, t3FimH, t3FimM, 0);
  const t3AlmocoInicio = new Date(ano, mes, dia + 1, t3AlmH, t3AlmM, 0);
  const t3AlmocoFim = new Date(t3AlmocoInicio.getTime() + duracaoRefeicao * 60000);

  faixas.push({
    turno: 3,
    label: `3º Turno (${formatarHoraHHMM(t3Inicio)} - ${formatarHoraHHMM(t3Fim)})`,
    inicioHora: formatarHoraHHMM(t3Inicio),
    fimHora: formatarHoraHHMM(t3Fim),
    inicioMinutos: minutosNaJanela(t3Inicio, janela),
    fimMinutos: minutosNaJanela(t3Fim, janela),
    almocoInicioHora: formatarHoraHHMM(t3AlmocoInicio),
    almocoFimHora: formatarHoraHHMM(t3AlmocoFim),
    almocoInicioMinutos: minutosNaJanela(t3AlmocoInicio, janela),
    almocoFimMinutos: minutosNaJanela(t3AlmocoFim, janela),
  });

  return faixas;
}

export type GranularidadeZoom =
  | "macro_6h" // 6 em 6 horas (360 min)
  | "macro_4h" // 4 em 4 horas (240 min)
  | "macro_2h" // 2 em 2 horas (120 min)
  | "hora_1h" // 1 em 1 hora (60 min) - Padrão
  | "min_30m" // 30 em 30 min (30 min)
  | "min_15m" // 15 em 15 min (15 min)
  | "min_10m" // 10 em 10 min (10 min)
  | "min_5m" // 5 em 5 min (5 min)
  | "min_1m"; // Minuto a minuto (1 min)

export interface MarcadorTempo {
  hora: string; // "06:00", "06:15", "06:30"
  percentual: number;
  isHoraCheia: boolean;
  minuto: number;
}

export interface ConfigEscalaZoom {
  id: GranularidadeZoom;
  label: string;
  intervaloMinutos: number;
  larguraMinimaPx: number;
  descricao: string;
}

export const ESCALAS_ZOOM_CONFIG: Record<GranularidadeZoom, ConfigEscalaZoom> = {
  macro_6h: {
    id: "macro_6h",
    label: "6 em 6 horas",
    intervaloMinutos: 360,
    larguraMinimaPx: 1100,
    descricao: "Visão Panorâmica (6h)",
  },
  macro_4h: {
    id: "macro_4h",
    label: "4 em 4 horas",
    intervaloMinutos: 240,
    larguraMinimaPx: 1300,
    descricao: "Visão Geral (4h)",
  },
  macro_2h: {
    id: "macro_2h",
    label: "2 em 2 horas",
    intervaloMinutos: 120,
    larguraMinimaPx: 1550,
    descricao: "Visão Ampla (2h)",
  },
  hora_1h: {
    id: "hora_1h",
    label: "1 em 1 hora",
    intervaloMinutos: 60,
    larguraMinimaPx: 1900,
    descricao: "Padrão Horário (1h)",
  },
  min_30m: {
    id: "min_30m",
    label: "30 em 30 min",
    intervaloMinutos: 30,
    larguraMinimaPx: 2800,
    descricao: "Meia Hora (30m)",
  },
  min_15m: {
    id: "min_15m",
    label: "15 em 15 min",
    intervaloMinutos: 15,
    larguraMinimaPx: 4400,
    descricao: "Detalhado (15m)",
  },
  min_10m: {
    id: "min_10m",
    label: "10 em 10 min",
    intervaloMinutos: 10,
    larguraMinimaPx: 6400,
    descricao: "Alta Precisão (10m)",
  },
  min_5m: {
    id: "min_5m",
    label: "5 em 5 min",
    intervaloMinutos: 5,
    larguraMinimaPx: 10000,
    descricao: "Precisão Fina (5m)",
  },
  min_1m: {
    id: "min_1m",
    label: "Minuto a Minuto",
    intervaloMinutos: 1,
    larguraMinimaPx: 19000,
    descricao: "Micro Minuto (1m)",
  },
};

export const LISTA_ESCALAS_ZOOM: GranularidadeZoom[] = [
  "macro_6h",
  "macro_4h",
  "macro_2h",
  "hora_1h",
  "min_30m",
  "min_15m",
  "min_10m",
  "min_5m",
  "min_1m",
];

/**
 * Gera os marcadores de tempo da régua horizontal com base na granularidade escolhida.
 */
export function gerarMarcadoresTempo(
  janela: JanelaTemporal,
  granularidade: GranularidadeZoom = "hora_1h"
): MarcadorTempo[] {
  const config = ESCALAS_ZOOM_CONFIG[granularidade] || ESCALAS_ZOOM_CONFIG.hora_1h;
  const marcadores: MarcadorTempo[] = [];
  const cur = new Date(janela.inicioDate);

  const minInterval = config.intervaloMinutos;
  if (minInterval >= 60) {
    const horasIntervalo = Math.floor(minInterval / 60);
    cur.setMinutes(0, 0, 0);
    const resto = cur.getHours() % horasIntervalo;
    if (resto !== 0) {
      cur.setHours(cur.getHours() + (horasIntervalo - resto));
    }
  } else {
    const resto = cur.getMinutes() % minInterval;
    if (resto !== 0) {
      cur.setMinutes(cur.getMinutes() + (minInterval - resto), 0, 0);
    } else {
      cur.setSeconds(0, 0);
    }
  }

  if (cur < janela.inicioDate) {
    cur.setTime(cur.getTime() + minInterval * 60 * 1000);
  }

  while (cur <= janela.fimDate) {
    const pct = posicaoPercentual(cur, janela);
    const hh = String(cur.getHours()).padStart(2, "0");
    const mm = String(cur.getMinutes()).padStart(2, "0");
    const isHoraCheia = cur.getMinutes() === 0;

    marcadores.push({
      hora: `${hh}:${mm}`,
      percentual: pct,
      isHoraCheia,
      minuto: cur.getMinutes(),
    });

    cur.setTime(cur.getTime() + minInterval * 60 * 1000);
  }

  return marcadores;
}

/**
 * Gera os marcadores de hora da régua horizontal (ex: 06:00, 07:00, ..., 06:00).
 */
export function gerarMarcadoresHoras(janela: JanelaTemporal): { hora: string; percentual: number }[] {
  return gerarMarcadoresTempo(janela, "hora_1h").map((m) => ({
    hora: m.hora,
    percentual: m.percentual,
  }));
}

export interface BlocoFaixaRealizado {
  item: ItemProducao;
  tipo: "concluido" | "quebra" | "produzindo" | "pendente";
  inicio: Date;
  fim: Date;
  duracaoSegundos: number;
  isRapido: boolean;
  leftPercent: number;
  widthPercent: number;
  visivel: boolean;
  gap?: {
    fimPlanejado: Date;
    leftPercent: number;
    widthPercent: number;
    visivel: boolean;
  };
}

/**
 * Calcula a geometria e disposição anti-sobreposição dos blocos na Faixa 3 (Realizado).
 *
 * Evita que lotes concluídos em rápida sucessão (mesmo minuto ou segundos de diferença)
 * fiquem sobrepostos ou cobertos por lotes subsequentes maiores.
 *
 * Garante uma largura mínima visível (minBlocoPx) para cada card com espaçamento seguro (gapPx),
 * enquanto preserva a posição cronológica natural dos lotes agendados mais adiante.
 */
export function calcularLayoutFaixaRealizado(
  itens: ItemProducao[],
  janela: JanelaTemporal,
  larguraMinimaPx: number,
  filtroRealizado: string = "todos",
  agora: Date = new Date(),
  minBlocoPx: number = 46,
  gapPx: number = 3
): BlocoFaixaRealizado[] {
  interface Candidato {
    item: ItemProducao;
    tipo: "concluido" | "quebra" | "produzindo" | "pendente";
    inicio: Date;
    fim: Date;
    gapFim?: Date;
  }

  const candidatos: Candidato[] = [];

  for (const item of itens) {
    const isQuebra =
      item.motivo_interrupcao === "quebra" ||
      Boolean(
        item.fim_real &&
          (item.quantidade_produzida_real ?? 0) < item.kanbans * item.qtd_por_kanban &&
          item.motivo_interrupcao
      );

    let tipo: "concluido" | "quebra" | "produzindo" | "pendente" | null = null;
    if (isQuebra) {
      tipo = "quebra";
    } else if (item.fim_real) {
      tipo = "concluido";
    } else if (item.em_producao) {
      tipo = "produzindo";
    } else if (item.hora_inicial && item.hora_final) {
      tipo = "pendente";
    }

    if (!tipo) continue;

    // Filtro de status do realizado
    if (filtroRealizado === "concluidos" && tipo !== "concluido") continue;
    if (filtroRealizado === "quebras" && tipo !== "quebra") continue;
    if (filtroRealizado === "produzindo" && tipo !== "produzindo") continue;
    if (filtroRealizado === "pendentes" && tipo !== "pendente") continue;

    let inicio: Date;
    let fim: Date;
    let gapFim: Date | undefined;

    if (tipo === "quebra") {
      const dtIni = item.inicio_real || item.hora_inicial || item.fim_real;
      if (!dtIni || !item.fim_real) continue;
      inicio = new Date(dtIni);
      fim = new Date(item.fim_real);
      gapFim = item.hora_final
        ? new Date(item.hora_final)
        : new Date(fim.getTime() + 60 * 60 * 1000);
    } else if (tipo === "concluido") {
      const dtIni = item.inicio_real || item.hora_inicial || item.fim_real;
      if (!dtIni || !item.fim_real) continue;
      inicio = new Date(dtIni);
      fim = new Date(item.fim_real);
    } else if (tipo === "produzindo") {
      const dtIni = item.inicio_real || item.hora_inicial;
      if (!dtIni) continue;
      inicio = new Date(dtIni);
      fim = agora;
    } else {
      // pendente
      if (!item.hora_inicial || !item.hora_final) continue;
      inicio = new Date(item.hora_inicial);
      fim = new Date(item.hora_final);
    }

    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) continue;
    if (fim.getTime() < inicio.getTime()) {
      fim = new Date(inicio.getTime());
    }

    candidatos.push({ item, tipo, inicio, fim, gapFim });
  }

  // Ordenação cronológica por início, depois por fim, depois por ID
  candidatos.sort((a, b) => {
    const diffIni = a.inicio.getTime() - b.inicio.getTime();
    if (diffIni !== 0) return diffIni;
    const diffFim = a.fim.getTime() - b.fim.getTime();
    if (diffFim !== 0) return diffFim;
    return (a.item.id ?? 0) - (b.item.id ?? 0);
  });

  const larguraEfetiva = Math.max(800, larguraMinimaPx);
  const minBlocoPct = (minBlocoPx / larguraEfetiva) * 100;
  const gapPct = (gapPx / larguraEfetiva) * 100;

  const blocos: BlocoFaixaRealizado[] = [];
  let ultimoFimPct = -1;

  for (const cand of candidatos) {
    const duracaoSegundos = Math.max(
      0,
      Math.round((cand.fim.getTime() - cand.inicio.getTime()) / 1000)
    );
    const isRapido =
      duracaoSegundos < 120 ||
      (cand.inicio.getHours() === cand.fim.getHours() &&
        cand.inicio.getMinutes() === cand.fim.getMinutes());

    const posNatural = calcularPosicaoBloco(cand.inicio, cand.fim, janela);
    if (!posNatural.visivel) continue;

    // Aplicação de anti-colisão se sobrepor ao bloco imediatamente anterior
    let leftPct = posNatural.left;
    if (ultimoFimPct >= 0 && leftPct < ultimoFimPct + gapPct) {
      leftPct = ultimoFimPct + gapPct;
    }

    if (leftPct >= 100) continue;

    const naturalRight = posNatural.left + posNatural.width;
    let widthPct = Math.max(minBlocoPct, naturalRight - leftPct);

    if (leftPct + widthPct > 100) {
      widthPct = Math.max(minBlocoPct, 100 - leftPct);
    }

    ultimoFimPct = leftPct + widthPct;

    let gapInfo: BlocoFaixaRealizado["gap"] = undefined;
    if (cand.tipo === "quebra" && cand.gapFim) {
      const posGapNatural = calcularPosicaoBloco(cand.fim, cand.gapFim, janela);
      if (posGapNatural.visivel) {
        let gapLeftPct = Math.max(posGapNatural.left, ultimoFimPct + gapPct);
        const gapNaturalRight = posGapNatural.left + posGapNatural.width;
        let gapWidthPct = Math.max(minBlocoPct, gapNaturalRight - gapLeftPct);
        if (gapLeftPct + gapWidthPct > 100) {
          gapWidthPct = Math.max(minBlocoPct, 100 - gapLeftPct);
        }
        ultimoFimPct = gapLeftPct + gapWidthPct;
        gapInfo = {
          fimPlanejado: cand.gapFim,
          leftPercent: gapLeftPct,
          widthPercent: gapWidthPct,
          visivel: true,
        };
      }
    }

    blocos.push({
      item: cand.item,
      tipo: cand.tipo,
      inicio: cand.inicio,
      fim: cand.fim,
      duracaoSegundos,
      isRapido,
      leftPercent: leftPct,
      widthPercent: widthPct,
      visivel: true,
      gap: gapInfo,
    });
  }

  return blocos;
}

export interface BlocoFaixaSemSobreposicao<T> {
  item: T;
  leftPercent: number;
  widthPercent: number;
  inicio: Date;
  fim: Date;
  isUltimoDoPosto: boolean;
}

/**
 * Calcula a posição horizontal (left% e width%) de itens ordenados em uma trilha de máquina,
 * garantindo matematicamente ZERO sobreposição entre itens consecutivos (ficam estritamente lado a lado).
 */
export function calcularLayoutFaixaSemSobreposicao<T>(
  itens: T[],
  getInicio: (it: T) => string | Date | null | undefined,
  getFim: (it: T) => string | Date | null | undefined,
  janela: JanelaTemporal,
  larguraMinimaPx: number = 1600,
  gapPx: number = 2
): BlocoFaixaSemSobreposicao<T>[] {
  const larguraEfetiva = Math.max(800, larguraMinimaPx);
  const gapPct = (gapPx / larguraEfetiva) * 100;

  // 1. Filtra itens com datas válidas e visíveis na janela
  const candidatos: Array<{
    item: T;
    inicio: Date;
    fim: Date;
    posNatural: { left: number; width: number; visivel: boolean };
  }> = [];

  for (const it of itens) {
    const rawIni = getInicio(it);
    const rawFim = getFim(it);
    if (!rawIni || !rawFim) continue;

    const inicio = typeof rawIni === "string" ? new Date(rawIni) : rawIni;
    let fim = typeof rawFim === "string" ? new Date(rawFim) : rawFim;
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) continue;

    if (fim.getTime() < inicio.getTime()) {
      fim = new Date(inicio.getTime());
    }

    const posNatural = calcularPosicaoBloco(inicio, fim, janela);
    if (!posNatural.visivel) continue;

    candidatos.push({ item: it, inicio, fim, posNatural });
  }

  // 2. Ordena cronologicamente por horário de início
  candidatos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  const resultado: BlocoFaixaSemSobreposicao<T>[] = [];
  let ultimoFimPct = -1;

  for (let i = 0; i < candidatos.length; i++) {
    const cand = candidatos[i];
    const prox = i + 1 < candidatos.length ? candidatos[i + 1] : null;

    // left do bloco: nunca menor que o término do bloco anterior + gap
    let leftPct = cand.posNatural.left;
    if (ultimoFimPct >= 0 && leftPct < ultimoFimPct + gapPct) {
      leftPct = ultimoFimPct + gapPct;
    }

    if (leftPct >= 100) continue;

    // Determina a largura máxima permitida antes do próximo item
    let widthPct = cand.posNatural.width;

    if (prox) {
      const proxLeftNatural = prox.posNatural.left;
      if (proxLeftNatural > leftPct) {
        const espacoDisponivel = proxLeftNatural - leftPct;
        widthPct = Math.min(widthPct, espacoDisponivel);
      }
    }

    // Subtrai o gap para haver separação visual clara "lado a lado"
    const finalWidthPct = Math.max(0.1, widthPct - gapPct);

    // Garante que não ultrapassa 100% da janela
    const clampedWidthPct = Math.min(finalWidthPct, Math.max(0.1, 100 - leftPct));

    ultimoFimPct = leftPct + clampedWidthPct;

    resultado.push({
      item: cand.item,
      leftPercent: leftPct,
      widthPercent: clampedWidthPct,
      inicio: cand.inicio,
      fim: cand.fim,
      isUltimoDoPosto: prox === null,
    });
  }

  return resultado;
}

