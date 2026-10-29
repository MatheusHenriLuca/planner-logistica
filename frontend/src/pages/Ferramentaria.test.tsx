import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as authModule from "../auth/AuthContext";
import * as ferrApi from "../services/api/ferramentaria";
import type { ManutencaoFerramenta } from "../types/ferramentaria";
import { Ferramentaria } from "./Ferramentaria";

function mockManutencao(overrides: Partial<ManutencaoFerramenta> = {}): ManutencaoFerramenta {
  return {
    id: 1,
    material: "FERR-001",
    descricao: "Matriz de Estamparia",
    linha: "LINHA 1",
    posto_trabalho: "PRENSA 01",
    status: "em_manutencao",
    motivo_quebra: "Desgaste da punção",
    pecas_produzidas: 50,
    observacoes: "Manutenção na bancada",
    tipo_manutencao: "corretiva",
    data_quebra: "2026-10-20T08:00:00Z",
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <Ferramentaria />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("Ferramentaria - Aguardando Tryout & Fluxo de Programador", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza todas as 6 colunas do Kanban incluindo 'Aguardando Tryout'", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "admin",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(ferrApi, "getManutencoes").mockResolvedValue([]);
    vi.spyOn(ferrApi, "getCatalogo").mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText(/Painel da Ferramentaria/i)).toBeInTheDocument();
    expect(await screen.findByText(/Aguardando Tryout/i)).toBeInTheDocument();
    expect(screen.getByText(/Aguardando Manutenção \(Corretiva\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Aguardando Manutenção \(Preventiva\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Em Manutenção/i)).toBeInTheDocument();
    expect(screen.getByText(/Tryout \/ Testes/i)).toBeInTheDocument();
    expect(screen.getByText(/Liberadas \(OK \/ Disponível\)/i)).toBeInTheDocument();
  });

  it("permite ao ferramenteiro em 'Em Manutenção' enviar para 'Aguardando Tryout' ou 'Liberar Direto'", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "ferramenteiro1",
      role: "programador_ferramentaria",
      login: vi.fn(),
      logout: vi.fn(),
    });

    const itemManut = mockManutencao({ id: 10, status: "em_manutencao" });
    vi.spyOn(ferrApi, "getManutencoes").mockResolvedValue([itemManut]);
    vi.spyOn(ferrApi, "getCatalogo").mockResolvedValue([]);
    const spyAtualizar = vi.spyOn(ferrApi, "atualizarStatusManutencao").mockResolvedValue({
      ...itemManut,
      status: "aguardando_tryout",
    });

    renderPage();

    expect(await screen.findByText("FERR-001")).toBeInTheDocument();
    const btnAguardando = screen.getByRole("button", { name: /🕒 Enviar p\/ Aguardando Tryout/i });
    const btnLiberarDireto = screen.getByRole("button", { name: /✅ Liberar Direto \(OK\)/i });

    expect(btnAguardando).toBeInTheDocument();
    expect(btnLiberarDireto).toBeInTheDocument();

    fireEvent.click(btnAguardando);
    await waitFor(() => {
      expect(spyAtualizar).toHaveBeenCalledWith(
        "token123",
        10,
        expect.objectContaining({ status: "aguardando_tryout" })
      );
    });
  });

  it("permite ao Programador da Ferramentaria abrir o modal e agendar Tryout com prensa e horários", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog_ferr",
      role: "programador_ferramentaria",
      login: vi.fn(),
      logout: vi.fn(),
    });

    const itemAguardando = mockManutencao({
      id: 20,
      material: "EST-MAT-99",
      posto_trabalho: "PR-108",
      status: "aguardando_tryout",
    });
    vi.spyOn(ferrApi, "getManutencoes").mockResolvedValue([itemAguardando]);
    vi.spyOn(ferrApi, "getCatalogo").mockResolvedValue([]);
    const spyAtualizar = vi.spyOn(ferrApi, "atualizarStatusManutencao").mockResolvedValue({
      ...itemAguardando,
      status: "tryout",
      tryout_prensa: "PR-108",
      tryout_inicio: "2026-10-20T10:00:00Z",
      tryout_fim: "2026-10-20T12:00:00Z",
    });

    renderPage();

    expect(await screen.findByText("EST-MAT-99")).toBeInTheDocument();
    const btnAgendar = screen.getByRole("button", { name: /⚙️ Agendar e Enviar p\/ Tryout/i });
    fireEvent.click(btnAgendar);

    // Modal deve abrir
    expect(await screen.findByText(/Agendar Tryout em Máquina \/ Prensa/i)).toBeInTheDocument();

    // Confirma envio
    const btnConfirmar = screen.getByRole("button", { name: /Confirmar e Enviar para Tryout/i });
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(spyAtualizar).toHaveBeenCalledWith(
        "token123",
        20,
        expect.objectContaining({
          status: "tryout",
          tryout_prensa: "PR-108",
          tryout_ferramenta: "EST-MAT-99",
        })
      );
    });
  });

  it("exibe aviso de bloqueio quando um usuário sem perfil de programador visualiza card em 'Aguardando Tryout'", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "operador",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });

    const itemAguardando = mockManutencao({
      id: 30,
      material: "SOL-DISP-01",
      status: "aguardando_tryout",
    });
    vi.spyOn(ferrApi, "getManutencoes").mockResolvedValue([itemAguardando]);
    vi.spyOn(ferrApi, "getCatalogo").mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("SOL-DISP-01")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /⚙️ Agendar e Enviar p\/ Tryout/i })).not.toBeInTheDocument();
  });
});
