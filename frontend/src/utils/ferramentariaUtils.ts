/**
 * Utilitários de verificação e normalização de ferramentas e materiais da Ferramentaria.
 */

/**
 * Divide uma string de material composto (ex: "L34002EB6A / L34003EB6A") em seus códigos individuais,
 * removendo espaços em branco e convertendo para maiúsculo.
 */
export function extrairCodigosMaterial(material: string | null | undefined): string[] {
  if (!material || typeof material !== "string") return [];
  const limpo = material.trim().toUpperCase();
  if (!limpo) return [];

  // Divide por barras, ponto-e-vírgula ou vírgula caso haja peças duplas
  const partes = limpo
    .split(/[\/;,\+]/)
    .map((p) => p.trim())
    .filter(Boolean);

  const resultado = new Set<string>();
  resultado.add(limpo);
  for (const parte of partes) {
    resultado.add(parte);
  }

  return Array.from(resultado);
}

/**
 * Verifica se um material está bloqueado pela Ferramentaria (em manutenção, aguardando ou tryout).
 * Suporta correspondência exata e decomposição de peças duplas/espelho (ex: "MAT1 / MAT2").
 */
export function isMaterialBloqueado(
  material: string | null | undefined,
  materiaisBloqueados: string[] = []
): boolean {
  if (!material || !materiaisBloqueados || materiaisBloqueados.length === 0) {
    return false;
  }

  const codigosDoItem = extrairCodigosMaterial(material);
  if (codigosDoItem.length === 0) return false;

  // Monta conjunto expandido de códigos bloqueados
  const conjuntoBloqueados = new Set<string>();
  for (const bloq of materiaisBloqueados) {
    const codigosBloq = extrairCodigosMaterial(bloq);
    for (const c of codigosBloq) {
      conjuntoBloqueados.add(c);
    }
  }

  for (const cod of codigosDoItem) {
    if (conjuntoBloqueados.has(cod)) {
      return true;
    }
  }

  return false;
}
