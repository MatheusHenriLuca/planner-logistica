import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Activity, Search, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { getAuditLogs } from "../services/api";

const ACAO_LABELS: Record<string, string> = {
  enviar_lote: "Lote Enviado",
  reordenar_producao: "Reordenação de Lotes",
  iniciar_producao: "Início de Produção",
  concluir_producao: "Produção Concluída",
  desfazer_inicio_acidental: "Início Desfeito",
  desfazer_conclusao_acidental: "Conclusão Desfeita",
  apontar_quebra_ferramenta: "Quebra de Ferramenta",
  mover_coluna_extra: "Item Movido",
  criar_coluna_extra: "Coluna Criada",
  remover_coluna_extra: "Coluna Removida",
  renomear_coluna_extra: "Coluna Renomeada",
  importar_excel: "Importação SAP",
  atualizar_anotacoes: "Anotações Atualizadas",
  atualizar_parametro: "Parâmetro Atualizado",
  troca_senha_propria: "Troca de Senha Própria",
  admin_reset_senha_usuario: "Reset de Senha (Admin)",
  admin_reset_senhas_em_massa: "Reset de Senhas em Massa",
  criar_linha: "Linha Criada",
  remover_linha: "Linha Removida",
};

function formatarDataHora(val: string | undefined | null): string {
  if (!val) return "—";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return format(d, "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
  } catch {
    return String(val);
  }
}

export function Historico() {
  const { token } = useAuth();
  const [skip, setSkip] = useState(0);
  const limit = 50;
  
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["auditoria", skip, limit],
    queryFn: () => getAuditLogs(token!, skip, limit),
    enabled: !!token,
  });

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-900 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Histórico de Auditoria</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Rastreabilidade de ações críticas no sistema.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-2 rounded-md bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Activity className="h-8 w-8 animate-pulse text-slate-300 dark:text-slate-600" />
          </div>
        ) : data?.items.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-500 dark:text-slate-400">
            <Search className="mb-2 h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p>Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900/50 text-xs uppercase text-slate-500 dark:text-slate-400 shadow-[0_1px_0_0_#e2e8f0] dark:shadow-[0_1px_0_0_#334155]">
                <tr>
                  <th className="px-6 py-4 font-medium">Data/Hora</th>
                  <th className="px-6 py-4 font-medium">Usuário</th>
                  <th className="px-6 py-4 font-medium">Ação</th>
                  <th className="px-6 py-4 font-medium">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {data?.items.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="whitespace-nowrap px-6 py-4">
                      {formatarDataHora(log.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900 dark:text-slate-200">
                      {log.usuario_nome}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-800 dark:text-slate-300">
                        {ACAO_LABELS[log.acao] || log.acao}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {log.detalhes && (
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 dark:bg-slate-900/50 p-2 text-[11px] text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
                          {JSON.stringify(log.detalhes, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Paginação simples */}
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <div>
          Mostrando {data?.items.length || 0} de {data?.total || 0} registros
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSkip(Math.max(0, skip - limit))}
            disabled={skip === 0}
            className="rounded px-3 py-1 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            onClick={() => setSkip(skip + limit)}
            disabled={!data || skip + limit >= data.total}
            className="rounded px-3 py-1 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
