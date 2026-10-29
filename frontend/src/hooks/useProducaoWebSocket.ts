import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useAuth } from "../auth/AuthContext";
import { API_BASE_URL } from "../services/api/core";

const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

const QUERY_KEY_PREFIXES = [
  "tabela-b-producao",
  "dashboard-metricas",
  "calendario",
  "materiais-bloqueados",
  "ferramentaria-manutencoes",
  "ferramentaria-catalogo",
  "producao-ativa-tabela-b",
  "colunas-extras",
];

/**
 * Conexão WebSocket única para toda a aplicação montada na raiz das rotas.
 * A cada mensagem transmitida pelo backend, invalida as consultas ativas para que
 * Produção, Programação, Ferramentaria e Métricas atualizem automaticamente em tempo real.
 */
export function useProducaoWebSocket(): void {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return undefined;

    // Token vai como primeira mensagem apos conectar, nao na query string
    // da URL - URLs (WS incluido) podem parar em log de proxy/servidor.
    const ws = new WebSocket(`${WS_BASE_URL}/ws/producao`);
    ws.onopen = () => ws.send(token);
    ws.onmessage = (event) => {
      try {
        if (event.data) {
          const payload = JSON.parse(event.data);
          if (payload.tipo === "ferramentaria_atualizada") {
            queryClient.invalidateQueries({ queryKey: ["materiais-bloqueados"] });
            queryClient.invalidateQueries({ queryKey: ["ferramentaria-manutencoes"] });
            queryClient.invalidateQueries({ queryKey: ["ferramentaria-catalogo"] });
          }
        }
      } catch {
        // Formato não JSON, segue fluxo normal
      }

      for (const prefix of QUERY_KEY_PREFIXES) {
        queryClient.invalidateQueries({ queryKey: [prefix] });
      }
    };

    return () => ws.close();
  }, [token, queryClient]);
}
