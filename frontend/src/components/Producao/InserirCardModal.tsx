import React, { useEffect, useMemo, useState } from "react";
import { PlusCircle, Clock, AlertTriangle, Layers, X, ShieldAlert } from "lucide-react";
import { inserirCardProducao } from "../../services/api";
import { useAuth } from "../../auth/AuthContext";
import { PATANS_SOLDA, PATANS_ESTAMPARIA, type Patan } from "../../types/producao";
import { obterPostoSap, calcularDataProgramada } from "../../utils/postos";

export interface DadosIniciaisCard {
  material?: string;
  posto_trabalho?: string;
  kanbans?: number;
  qtd_por_kanban?: number;
  anotacoes?: string;
  tituloModal?: string;
}

interface InserirCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSucesso: (mensagem: string) => void;
  linha: string;
  setor: "solda" | "estamparia";
  turnoInicial: number;
  postosDisponiveis: string[];
  dadosIniciais?: DadosIniciaisCard | null;
}

function obterHorarioAtualFormatado(): string {
  const agora = new Date();
  agora.setSeconds(0, 0);
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  const horas = String(agora.getHours()).padStart(2, "0");
  const minutos = String(agora.getMinutes()).padStart(2, "0");
  return `${ano}-${mes}-${dia}T${horas}:${minutos}`;
}

export function InserirCardModal({
  isOpen,
  onClose,
  onSucesso,
  linha,
  setor,
  turnoInicial,
  postosDisponiveis,
  dadosIniciais,
}: InserirCardModalProps) {
  const { token } = useAuth();

  const patansDisponiveis = useMemo(
    () => (setor === "estamparia" ? PATANS_ESTAMPARIA : PATANS_SOLDA),
    [setor]
  );

  const [codigoMaterial, setCodigoMaterial] = useState<string>("");
  const [postoTrabalho, setPostoTrabalho] = useState<string>(() => postosDisponiveis[0] ?? "");
  const [turno, setTurno] = useState<number>(turnoInicial > 0 ? turnoInicial : 1);
  const [patan, setPatan] = useState<Patan>("A");

  useEffect(() => {
    if (isOpen) {
      if (dadosIniciais) {
        if (dadosIniciais.material) setCodigoMaterial(dadosIniciais.material);
        if (dadosIniciais.posto_trabalho) setPostoTrabalho(dadosIniciais.posto_trabalho);
        if (dadosIniciais.kanbans) setKanbans(dadosIniciais.kanbans);
        if (dadosIniciais.qtd_por_kanban) setQtdPorKanban(dadosIniciais.qtd_por_kanban);
      } else {
        setCodigoMaterial("");
        setPostoTrabalho(postosDisponiveis[0] ?? "");
        setKanbans(1);
        setQtdPorKanban(10);
      }
      setHoraInicial(obterHorarioAtualFormatado());
      setErroValidacao(null);
    }
  }, [isOpen, dadosIniciais, postosDisponiveis]);

  useEffect(() => {
    if (!(patansDisponiveis as readonly string[]).includes(patan)) {
      setPatan(patansDisponiveis[0]);
    }
  }, [patansDisponiveis, patan]);
  const [horaInicial, setHoraInicial] = useState<string>(obterHorarioAtualFormatado);
  const [kanbans, setKanbans] = useState<number>(1);
  const [qtdPorKanban, setQtdPorKanban] = useState<number>(10);
  const [tempoPorPecaMinutos, setTempoPorPecaMinutos] = useState<number>(1.0);
  const [isCritico, setIsCritico] = useState<boolean>(false);
  const [demanda, setDemanda] = useState<number>(0);
  const [saldoEstoque, setSaldoEstoque] = useState<number>(0);

  const [submetendo, setSubmetendo] = useState<boolean>(false);
  const [erroValidacao, setErroValidacao] = useState<string | null>(null);

  // Cálculos Lean TPS em tempo real
  const totalPecas = useMemo(() => kanbans * qtdPorKanban, [kanbans, qtdPorKanban]);
  const duracaoEstimadaMinutos = useMemo(
    () => Math.round(kanbans * qtdPorKanban * tempoPorPecaMinutos),
    [kanbans, qtdPorKanban, tempoPorPecaMinutos]
  );

  const previsaoFim = useMemo(() => {
    if (!horaInicial) return null;
    try {
      const dataInicio = new Date(horaInicial);
      if (isNaN(dataInicio.getTime())) return null;
      const dataFim = new Date(dataInicio.getTime() + duracaoEstimadaMinutos * 60000);
      const horas = String(dataFim.getHours()).padStart(2, "0");
      const minutos = String(dataFim.getMinutes()).padStart(2, "0");
      return `${horas}:${minutos}`;
    } catch {
      return null;
    }
  }, [horaInicial, duracaoEstimadaMinutos]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErroValidacao(null);

    const materialLimpo = codigoMaterial.trim().toUpperCase();
    const postoLimpo = postoTrabalho.trim().toUpperCase();

    if (!materialLimpo) {
      setErroValidacao("Informe o código do material ou peça.");
      return;
    }
    if (!postoLimpo) {
      setErroValidacao("Informe ou selecione o posto de trabalho.");
      return;
    }
    if (!horaInicial) {
      setErroValidacao("Informe o horário planejado de início.");
      return;
    }
    if (kanbans <= 0) {
      setErroValidacao("A quantidade de kanbans deve ser maior que zero.");
      return;
    }
    if (qtdPorKanban <= 0) {
      setErroValidacao("A quantidade de peças por kanban deve ser maior que zero.");
      return;
    }
    if (tempoPorPecaMinutos <= 0) {
      setErroValidacao("O tempo por peça deve ser maior que zero minutos.");
      return;
    }

    try {
      setSubmetendo(true);
      const resposta = await inserirCardProducao(token as string, {
        setor,
        linha,
        turno,
        patan,
        posto_trabalho: postoLimpo,
        material: materialLimpo,
        kanbans,
        qtd_por_kanban: qtdPorKanban,
        tempo_por_peca_minutos: tempoPorPecaMinutos,
        hora_inicial: horaInicial,
        is_critico: isCritico,
        demanda,
        saldo_estoque: saldoEstoque,
        posto_sap: obterPostoSap(postoLimpo, setor),
        data_programada: calcularDataProgramada(horaInicial, turno),
      });

      onSucesso(
        resposta.mensagem ||
          `Lote ${materialLimpo} inserido no posto ${postoLimpo}. Horários subsequentes reorganizados.`
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao inserir ordem de emergência na produção.";
      setErroValidacao(msg);
    } finally {
      setSubmetendo(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400">
              <PlusCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">
                {dadosIniciais?.tituloModal || "Inserir Ordem de Emergência"}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {setor === "estamparia" ? "Estamparia" : "Solda"} • {linha} {dadosIniciais?.tituloModal ? "(Tryout de Matriz)" : "(Ordem Urgente)"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submetendo}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro de Validação */}
        {erroValidacao && (
          <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
            <span>{erroValidacao}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Linha 1: Material e Posto */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Material / Peça <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={codigoMaterial}
                onChange={(e) => setCodigoMaterial(e.target.value)}
                placeholder="Ex: 53210-BR01"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold uppercase text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Posto de Trabalho <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  list="lista-postos-trabalho"
                  value={postoTrabalho}
                  onChange={(e) => setPostoTrabalho(e.target.value)}
                  placeholder="Ex: SB6A"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold uppercase text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <datalist id="lista-postos-trabalho">
                  {postosDisponiveis.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* Linha 2: Turno, Patan e Horário de Início */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Turno
              </label>
              <select
                value={turno}
                onChange={(e) => setTurno(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value={1}>1º Turno</option>
                <option value={2}>2º Turno</option>
                <option value={3}>3º Turno</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Patan
              </label>
              <select
                value={patan}
                onChange={(e) => setPatan(e.target.value as Patan)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {patansDisponiveis.map((p) => (
                  <option key={p} value={p}>
                    Patan {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Horário de Início <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={horaInicial}
                onChange={(e) => setHoraInicial(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Linha 3: Kanbans, Qtd por Kanban e Tempo por Peça */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kanbans <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={kanbans}
                onChange={(e) => setKanbans(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Peças por Kanban <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={qtdPorKanban}
                onChange={(e) => setQtdPorKanban(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tempo / Peça (min) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={tempoPorPecaMinutos}
                onChange={(e) =>
                  setTempoPorPecaMinutos(Math.max(0.01, parseFloat(e.target.value) || 0.01))
                }
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Linha 4: Checkbox Item Crítico e Estoque Opcional */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={isCritico}
                onChange={(e) => setIsCritico(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
              />
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                Marcar como Item Crítico (Prioridade Alta)
              </span>
            </label>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Demanda:</span>
              <input
                type="number"
                min="0"
                value={demanda}
                onChange={(e) => setDemanda(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-16 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-1.5 py-0.5 text-xs text-slate-900 dark:text-slate-100"
              />
              <span className="text-slate-500 dark:text-slate-400 ml-1">Saldo:</span>
              <input
                type="number"
                min="0"
                value={saldoEstoque}
                onChange={(e) => setSaldoEstoque(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-16 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-1.5 py-0.5 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Painel Informativo Lean TPS & Reordenação de Horários */}
          <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-900 dark:text-emerald-300">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Total Planejado: {totalPecas} peças
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Duração: {duracaoEstimadaMinutos} min
                {previsaoFim ? ` (Término est.: ~${previsaoFim})` : ""}
              </span>
            </div>

            <p className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-300/90 flex items-start gap-1.5 font-normal">
              <span className="font-bold shrink-0">⚠️ Reprogramação Automática:</span>
              <span>
                Ao inserir este card com horário definido, todos os lotes normais deste mesmo posto de trabalho que
                iniciarem após esse horário terão suas horas inicial e final empurradas em cascata para acomodar este lote.
              </span>
            </p>
          </div>

          {/* Ações do Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submetendo}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submetendo}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submetendo ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Inserindo e Reordenando...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  <span>Inserir Ordem Urgente</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
