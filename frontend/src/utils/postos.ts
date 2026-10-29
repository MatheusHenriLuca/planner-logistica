/**
 * Utilitários para mapeamento de Centros de Trabalho / Postos SAP e cálculo de Datas Programadas.
 * Conforme especificação em AGENTS.md.
 */

const POSTOS_SAP_ESPECIAIS: Record<string, string> = {
  "FURAR 1": "B629020",
  "FURAR 2": "B629010",
  "MONTAGEM": "B661000",
  "SOLDA": "B642000",
  "GABARITO": "B642000",
};

/**
 * Retorna o código oficial do Centro de Trabalho no SAP (ex: B624093, B642047, etc).
 */
export function obterPostoSap(posto: string, setor?: string): string {
  if (!posto) return "";
  const normalizado = posto.trim().toUpperCase();

  if (POSTOS_SAP_ESPECIAIS[normalizado]) {
    return POSTOS_SAP_ESPECIAIS[normalizado];
  }

  // Solda / Ponteadeiras (ex: PONTE 47 -> B642047, PONTE 23 -> B642023)
  const ponteMatch = normalizado.match(/^PONTE\s*(\d+)$/);
  if (ponteMatch) {
    const num = ponteMatch[1].padStart(3, "0");
    return `B642${num}`;
  }

  // Prensas da Estamparia (ex: PR-93, PR 82, PR-113)
  const prMatch = normalizado.match(/^PR[- ]*(\d+)$/);
  if (prMatch) {
    const num = parseInt(prMatch[1], 10);
    const numStr = prMatch[1].padStart(3, "0");
    // Linha 2 e Linha 3 usam B623: 83, 84, 94..99, 109, 110, 112
    const isLinha2ou3 = [83, 84, 94, 95, 96, 97, 98, 99, 109, 110, 112].includes(num);
    const prefixo = isLinha2ou3 ? "B623" : "B624";
    return `${prefixo}${numStr}`;
  }

  // Caso seja informado apenas o número ou outro formato
  if (/^\d+$/.test(normalizado)) {
    if (setor === "solda") {
      return `B642${normalizado.padStart(3, "0")}`;
    }
    return `B624${normalizado.padStart(3, "0")}`;
  }

  return normalizado;
}

/**
 * Calcula a data programada (YYYY-MM-DD) do lote.
 * Regra do 3º Turno: se o turno iniciou às 23:00 e o horário do lote
 * cruza para a madrugada (00:00 até ~07:00), a data programada
 * refere-se ao dia em que o turno começou (D-1 em relação à madrugada).
 */
export function calcularDataProgramada(
  horaInicial?: string | null,
  turno?: number,
  dataBase?: string
): string {
  const agora = dataBase ? new Date(dataBase) : new Date();

  if (horaInicial && turno === 3) {
    try {
      // Se horaInicial for ISO completa ou HH:MM
      let horas = -1;
      if (horaInicial.includes("T")) {
        const d = new Date(horaInicial);
        horas = d.getHours();
      } else if (horaInicial.includes(":")) {
        horas = parseInt(horaInicial.split(":")[0], 10);
      }

      // Se está na madrugada (0h às 7h) do 3º turno, o dia programado é o dia anterior
      if (horas >= 0 && horas < 8) {
        agora.setDate(agora.getDate() - 1);
      }
    } catch {
      // Mantém a data base
    }
  }

  const yyyy = agora.getFullYear();
  const mm = String(agora.getMonth() + 1).padStart(2, "0");
  const dd = String(agora.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
