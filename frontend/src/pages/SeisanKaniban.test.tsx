import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as authModule from "../auth/AuthContext";
import * as api from "../services/api";
import type { ItemProducao } from "../types/producao";
import { SeisanKaniban } from "./SeisanKaniban";

const HOJE_ISO = new Date().toISOString().slice(0, 10);

function criarItem(overrides: Partial<ItemProducao> = {}): ItemProducao {
  return {
    id: 1,
    linha: "LINHA 1",
    turno: 1,
    patan: "A",
    posto_trabalho: "SB6A",
    status: 2,
    sequencia: 1,
    hora_inicial: `${HOJE_ISO}T06:20:00`,
    hora_final: `${HOJE_ISO}T08:00:00`,
    almoco_incluso: false,
    kanbans: 2,
    qtd_por_kanban: 50,
    tempo_por_peca_minutos: 1.0,
    is_critico: false,
    tem_falta_estoque: false,
    coluna_extra_id: null,
    material: "PECA-TESTE-100",
    ...overrides,
  };
}

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SeisanKaniban />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("SeisanKaniban Page", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza o cabeçalho do Seisan Kaniban com KPIs e filtros", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "mock-token",
      username: "planejador",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
      permissoes: null,
    });

    vi.spyOn(api, "listarTabelaB").mockResolvedValue([
      criarItem(),
      criarItem({
        id: 2,
        sequencia: 2,
        posto_trabalho: "SB6B",
        material: "PECA-TESTE-200",
        hora_inicial: "2026-10-06T08:00:00",
        hora_final: "2026-10-06T09:30:00",
      }),
    ]);

    renderComponent();

    // Título e identificadores TPS
    expect(screen.getByText("Seisan Kanriban")).toBeInTheDocument();
    expect(screen.getByText(/LEAN TPS • GANTT TRIPLO/i)).toBeInTheDocument();

    // Esperar carregar dados dos postos
    await waitFor(() => {
      expect(screen.getByText("SB6A")).toBeInTheDocument();
      expect(screen.getByText("SB6B")).toBeInTheDocument();
    });

    // Abas de setor limpas (sem SB6A ou Prensas)
    expect(screen.getByText("⚡ Solda")).toBeInTheDocument();
    expect(screen.getByText("🏭 Estamparia")).toBeInTheDocument();

    // Faixas do posto e Eixo X presentes dentro do mesmo quadrante
    expect(screen.getAllByText("Eixo X").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Linha do Tempo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Patan Teórico").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Programado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Realizado").length).toBeGreaterThan(0);
  });

  it("renderiza quebra de máquina com encurtamento e GAP livre de parada", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "mock-token",
      username: "planejador",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
      permissoes: null,
    });

    const itemQuebrado = criarItem({
      id: 5,
      material: "PECA-AVARIADA",
      inicio_real: `${HOJE_ISO}T06:20:00`,
      fim_real: `${HOJE_ISO}T07:00:00`,
      quantidade_produzida_real: 35,
      motivo_interrupcao: "quebra",
    });

    vi.spyOn(api, "listarTabelaB").mockResolvedValue([itemQuebrado]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/QUEBRA: PECA-AVARIADA/i)).toBeInTheDocument();
      expect(screen.getByText(/GAP LIVRE \/ PARADA/i)).toBeInTheDocument();
    });
  });

  it("abre modal comparativo detalhado ao clicar no bloco programado", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "mock-token",
      username: "planejador",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
      permissoes: null,
    });

    const item = criarItem({
      id: 9,
      material: "PECA-MODAL-TESTE",
      kanbans: 3,
      qtd_por_kanban: 10,
    });

    vi.spyOn(api, "listarTabelaB").mockResolvedValue([item]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText(/PECA-MODAL-TESTE/i).length).toBeGreaterThan(0);
    });

    // Clicar no bloco
    const botoes = screen.getAllByText(/PECA-MODAL-TESTE/i);
    fireEvent.click(botoes[0]);

    // Modal aberto
    await waitFor(() => {
      expect(screen.getByText("Desempenho Operacional Lean")).toBeInTheDocument();
      expect(screen.getByText(/Programado \(Tabela B\)/i)).toBeInTheDocument();
    });

    // Fechar modal
    const botaoFechar = screen.getByText("Fechar");
    fireEvent.click(botaoFechar);

    await waitFor(() => {
      expect(screen.queryByText("Desempenho Operacional Lean")).not.toBeInTheDocument();
    });
  });
});
