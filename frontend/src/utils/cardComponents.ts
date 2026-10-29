import type { ItemProducao } from "../types/producao";
import { obterEmbalagem, obterEmbalagemSolda } from "./catalogoEmbalagens";
import { obterEmbalagemEstamparia, obterMateriaPrimaEstamparia } from "./catalogoEstamparia";

export interface ComponenteSolda {
  tipo: "VtoV" | "EST" | "MP";
  codigo: string;
  fator: number;
  descricao: string;
  qtdNecessaria: number;
  saldoLivre: number;
  temFalta: boolean;
}

export interface DetalhesEstamparia {
  paletesCompletos: number;
  cxsCompletas: number;
  paletesQuebra: number;
  cxsQuebra: number;
  materiaPrimaCodigo?: string;
  materiaPrimaKg?: number;
  materiaPrimaSaldoEstoque?: number;
  materiaPrimaTemFalta?: boolean;
  consumoUnitarioKg?: number;
  ferramenta?: string;
  embalagem?: string;
}

export interface CardDadosProducao {
  isEstamparia: boolean;
  isSolda: boolean;
  totalPecas: number;
  duracaoMinutos: number;
  isAlertaCurtoEstamparia: boolean; // Menos do limite configurado na estamparia
  isAlertaCurtoSolda: boolean; // Menos do limite configurado na solda
  isLoteCurto: boolean; // Lote curto aplicável ao setor
  limiteLoteCurtoAplicavel: number;
  componentesSolda: ComponenteSolda[];
  dadosEstamparia: DetalhesEstamparia;
  embalagem?: string;
}

export interface ParseCardOptions {
  limiteLoteCurtoMinutos?: number; // Limite da Estamparia (padrão 60)
  limiteLoteCurtoSoldaMinutos?: number; // Limite da Solda (padrão 60)
  isProgramacao?: boolean;
}

export function parseCardDadosProducao(
  item: ItemProducao,
  options?: ParseCardOptions
): CardDadosProducao {
  const isEstamparia = Boolean(
    item.setor === "estamparia" ||
      item.posto_trabalho?.toUpperCase().startsWith("PR-") ||
      item.posto_trabalho?.toUpperCase().startsWith("PRENSA")
  );
  const isSolda = !isEstamparia;

  const isProgramacao = options?.isProgramacao ?? true;
  const limiteLoteCurtoEstamparia = options?.limiteLoteCurtoMinutos ?? 60;
  const limiteLoteCurtoSolda = options?.limiteLoteCurtoSoldaMinutos ?? 60;
  const limiteLoteCurtoAplicavel = isEstamparia ? limiteLoteCurtoEstamparia : limiteLoteCurtoSolda;

  const totalPecas = (item.kanbans || 0) * (item.qtd_por_kanban || 0);

  // Cálculo da duração total em minutos
  let duracaoMinutos = 0;
  if (item.hora_inicial && item.hora_final) {
    const tIni = new Date(item.hora_inicial).getTime();
    const tFim = new Date(item.hora_final).getTime();
    if (!isNaN(tIni) && !isNaN(tFim) && tFim >= tIni) {
      duracaoMinutos = Math.round((tFim - tIni) / 60000);
    }
  }
  if (duracaoMinutos <= 0) {
    duracaoMinutos = Math.round(
      totalPecas * (item.tempo_por_peca_minutos || 0) + (item.almoco_incluso ? 40 : 0)
    );
  }

  // Alerta de lote curto: APENAS na tela de Programação
  const isAlertaCurtoEstamparia =
    Boolean(isProgramacao) && isEstamparia && duracaoMinutos > 0 && duracaoMinutos < limiteLoteCurtoEstamparia;

  const isAlertaCurtoSolda =
    Boolean(isProgramacao) && isSolda && duracaoMinutos > 0 && duracaoMinutos < limiteLoteCurtoSolda;

  const isLoteCurto = isAlertaCurtoEstamparia || isAlertaCurtoSolda;

  // Extração de componentes da Solda (BOM: VtoV, EST, MP)
  const componentesSolda: ComponenteSolda[] = [];
  let embalagem: string | undefined;

  // 1. A partir de comp_comb (separador $$$$ e |) - exclusivo Solda
  if (isSolda && item.comp_comb && item.comp_comb.trim()) {
    const entries = item.comp_comb.split("$$$$");
    for (const entry of entries) {
      const parts = entry.split("|").map((p) => p.trim());
      if (parts.length >= 1 && parts[0]) {
        const codigo = parts[0];
        const fator = parts.length > 1 && !isNaN(parseFloat(parts[1])) ? parseFloat(parts[1]) : 1;
        const descricao = parts.length > 2 ? parts[2] : "";
        const saldoLivre = parts.length > 3 && !isNaN(parseFloat(parts[3])) ? parseFloat(parts[3]) : 0;
        const qtdNecessaria = Math.round(totalPecas * fator);
        const temFalta = saldoLivre < qtdNecessaria;

        // Regra do domínio:
        // - Matéria-Prima: 'MP' (código contendo MP ou descrição com MATERIA / BOBINA)
        // - Estampado: 'EST' (códigos com EB ou E ou descrição com ESTAMP)
        // - Demais componentes: 'VtoV' (peças prontas/compradas)
        let tipo: "VtoV" | "EST" | "MP" = "VtoV";
        const codUpper = codigo.toUpperCase();
        const descUpper = descricao.toUpperCase();

        if (codUpper.startsWith("MP") || descUpper.includes("MATERIA") || descUpper.includes("BOBINA")) {
          tipo = "MP";
        } else if (codUpper.includes("EB") || codUpper.includes("E") || descUpper.includes("ESTAMP")) {
          tipo = "EST";
        }

        componentesSolda.push({
          tipo,
          codigo,
          fator,
          descricao,
          qtdNecessaria,
          saldoLivre,
          temFalta,
        });
      }
    }
  }

  // 2. Se comp_comb não forneceu componentes mas há nas anotações (apenas Solda)
  if (isSolda && componentesSolda.length === 0 && item.anotacoes) {
    const linhas = item.anotacoes.split("\n");
    for (const linha of linhas) {
      const trimmed = linha.trim();
      const matchVtoV = trimmed.match(/\(VtoV\):\s*([^\s-]+)(?:\s*-\s*(\d+))?/i);
      if (matchVtoV) {
        componentesSolda.push({
          tipo: "VtoV",
          codigo: matchVtoV[1],
          fator: 1,
          descricao: "",
          qtdNecessaria: matchVtoV[2] ? parseInt(matchVtoV[2], 10) : totalPecas,
          saldoLivre: 999999,
          temFalta: false,
        });
      }
      const matchEstampado =
        trimmed.match(/\((?:ESTAMPADO|EST)\):\s*([^\s-]+)(?:\s*-\s*(\d+))?/i);
      if (matchEstampado) {
        componentesSolda.push({
          tipo: "EST",
          codigo: matchEstampado[1],
          fator: 1,
          descricao: "",
          qtdNecessaria: matchEstampado[2] ? parseInt(matchEstampado[2], 10) : totalPecas,
          saldoLivre: 999999,
          temFalta: false,
        });
      }
      const matchMp = trimmed.match(/\((?:MP|MATERIA-PRIMA)\):\s*([^\s-]+)(?:\s*-\s*(\d+))?/i);
      if (matchMp) {
        componentesSolda.push({
          tipo: "MP",
          codigo: matchMp[1],
          fator: 1,
          descricao: "",
          qtdNecessaria: matchMp[2] ? parseInt(matchMp[2], 10) : totalPecas,
          saldoLivre: 999999,
          temFalta: false,
        });
      }
      const matchEmb =
        trimmed.match(/\(EMBALAGEM\):\s*(.+)/i) || trimmed.match(/EMBALAGEM\s*-\s*(.+)/i);
      if (matchEmb && !embalagem) {
        embalagem = matchEmb[1].trim();
      }
    }
  }

  // Se houver anotação de embalagem e ainda não pegamos
  if (!embalagem && item.anotacoes) {
    const matchEmb =
      item.anotacoes.match(/\(EMBALAGEM\):\s*([^\n\r]+)/i) ||
      item.anotacoes.match(/EMBALAGEM\s*-\s*([^\n\r/]+)/i);
    if (matchEmb) {
      embalagem = matchEmb[1].trim();
    }
  }

  // 3. Catálogo Oficial de Embalagem (Solda ou Estamparia)
  if (!embalagem && item.material) {
    embalagem = isEstamparia
      ? (obterEmbalagemEstamparia(item.material) || obterEmbalagemSolda(item.material))
      : (obterEmbalagemSolda(item.material) || obterEmbalagemEstamparia(item.material));
  }

  // Dados para Estamparia (Paletes, MP, Ferramenta)
  // Regra padrão da estamparia: 20 caixas por palete
  const cxsPorPalete = 20;
  const paletesCompletos = Math.floor((item.kanbans || 0) / cxsPorPalete);
  const cxsCompletas = paletesCompletos * cxsPorPalete;
  const cxsQuebra = (item.kanbans || 0) % cxsPorPalete;
  const paletesQuebra = cxsQuebra > 0 ? 1 : 0;

  let materiaPrimaCodigo: string | undefined;
  let materiaPrimaKg: number | undefined;
  let materiaPrimaSaldoEstoque: number | undefined;
  let consumoUnitarioKg: number | undefined;

  // 1. Extração prioritária a partir de comp_comb na Estamparia (formato: mp_cod|consumo|MATERIA-PRIMA|saldo_mb52)
  if (isEstamparia && item.comp_comb && item.comp_comb.trim()) {
    const firstComp = item.comp_comb.split("$$$$")[0];
    if (firstComp && !firstComp.toUpperCase().includes("BOB-A")) {
      const parts = firstComp.split("|").map((p) => p.trim());
      if (parts[0]) {
        materiaPrimaCodigo = parts[0];
        if (parts.length > 1 && !isNaN(parseFloat(parts[1]))) {
          consumoUnitarioKg = parseFloat(parts[1]);
        }
        if (parts.length > 3 && !isNaN(parseFloat(parts[3]))) {
          materiaPrimaSaldoEstoque = parseFloat(parts[3]);
        }
      }
    }
  }

  // 2. Catálogo Oficial da Estamparia (baseMP.XLSX): Fonte primária caso não tenha vindo em comp_comb
  if (isEstamparia && item.material) {
    const mpInfo = obterMateriaPrimaEstamparia(item.material);
    if (mpInfo) {
      if (!materiaPrimaCodigo) materiaPrimaCodigo = mpInfo.mp;
      if (consumoUnitarioKg == null && mpInfo.consumo > 0) {
        consumoUnitarioKg = mpInfo.consumo;
      }
    }
  }

  // 3. Extrair das anotações se não resolvido pelo catálogo ou para complementar
  if (item.anotacoes) {
    // Regex flexível compatível com '-', '–', '—', ':' e espaços (ex: 'MATÉRIA-PRIMA: COD — 21 KG' ou 'MP: COD (21 kg)')
    const matchMp = item.anotacoes.match(
      /(?:M\.?P|MP|MAT[EÉ]RIA[- ]PRIMA)(?:\s*[-–—:]\s*|\s+)([A-Za-z0-9]+)(?:[^\d\n\r]*([\d.,]+)\s*KG)?/i
    );
    if (matchMp) {
      if (!materiaPrimaCodigo) {
        materiaPrimaCodigo = matchMp[1].trim();
      }
      if (materiaPrimaKg == null && matchMp[2]) {
        materiaPrimaKg = parseFloat(matchMp[2].replace(",", "."));
      }
    }
  }

  // 4. Cálculo dinâmico do consumo total de MP em KG para o lote planejado
  if (consumoUnitarioKg != null && consumoUnitarioKg > 0 && totalPecas > 0) {
    materiaPrimaKg = Number((totalPecas * consumoUnitarioKg).toFixed(1));
  } else if (materiaPrimaKg == null && isEstamparia && item.material && totalPecas > 0) {
    const mpInfo = obterMateriaPrimaEstamparia(item.material);
    if (mpInfo && mpInfo.consumo > 0) {
      if (!materiaPrimaCodigo) materiaPrimaCodigo = mpInfo.mp;
      consumoUnitarioKg = mpInfo.consumo;
      materiaPrimaKg = Number((totalPecas * mpInfo.consumo).toFixed(1));
    }
  }

  // 5. Diagnóstico de Falta de Matéria-Prima:
  // Disparado estritamente na Programação quando há saldo físico conhecido no estoque MB52
  // e a quantidade necessária para o lote ultrapassa o saldo disponível.
  const materiaPrimaTemFalta = Boolean(
    isProgramacao &&
      materiaPrimaSaldoEstoque != null &&
      materiaPrimaKg != null &&
      materiaPrimaSaldoEstoque < materiaPrimaKg
  );

  const ferramenta = item.material ? `FERR. - ${item.material}` : undefined;

  return {
    isEstamparia,
    isSolda,
    totalPecas,
    duracaoMinutos,
    isAlertaCurtoEstamparia,
    isAlertaCurtoSolda,
    isLoteCurto,
    limiteLoteCurtoAplicavel,
    componentesSolda,
    dadosEstamparia: {
      paletesCompletos,
      cxsCompletas,
      paletesQuebra,
      cxsQuebra,
      materiaPrimaCodigo,
      materiaPrimaKg,
      materiaPrimaSaldoEstoque,
      materiaPrimaTemFalta,
      consumoUnitarioKg,
      ferramenta,
      embalagem,
    },
    embalagem,
  };
}
