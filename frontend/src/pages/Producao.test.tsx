import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as authModule from "../auth/AuthContext";
import * as api from "../services/api";
import type { ItemProducao } from "../types/producao";
import { Producao } from "./Producao";

function item(overrides: Partial<ItemProducao> = {}): ItemProducao {
  return {
    id: 1,
    linha: "L1",
    turno: 1,
    patan: "A",
    posto_trabalho: "posto-1",
    status: 2,
    sequencia: 1,
    hora_inicial: "2026-08-24T06:20:00",
    hora_final: "2026-08-24T06:50:00",
    almoco_incluso: false,
    kanbans: 1,
    qtd_por_kanban: 1,
    tempo_por_peca_minutos: 30,
    is_critico: false,
    tem_falta_estoque: false,
    coluna_extra_id: null,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <Producao />
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { ...utils, queryClient };
}

describe("Producao", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the board without a submit button for usuario_comum", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "op",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listarTabelaB").mockResolvedValue([
      {
        id: 1,
        linha: "L1",
        turno: 1,
        patan: "A",
        posto_trabalho: "posto-1",
        status: 2,
        sequencia: 1,
        hora_inicial: "2026-08-24T06:20:00",
        hora_final: "2026-08-24T06:50:00",
        almoco_incluso: false,
        kanbans: 1,
        qtd_por_kanban: 1,
        tempo_por_peca_minutos: 30,
        is_critico: false,
        tem_falta_estoque: false,
        coluna_extra_id: null,
      },
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("posto-1")).toBeInTheDocument());
    expect(screen.queryByText("Enviar lote")).not.toBeInTheDocument();
  });

  it("shows an error message when the sequence fails to load", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "op",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listarTabelaB").mockRejectedValue(new Error("network"));

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Erro ao carregar a producao.")).toBeInTheDocument()
    );
  });

  it("shows hora_inicial/hora_final exactly as returned by the API, without recalculating them", async () => {
    // Tabela B ja vem com os horarios definitivos (calculados no submit
    // original). Producao nao pode rodar cascata client-side de novo - se
    // rodasse, um hora_inicial "esquisito" feito de proposito, bem fora do
    // que a cascata calcularia pro turno/data de hoje, seria sobrescrito.
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "op",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listarTabelaB").mockResolvedValue([
      item({ hora_inicial: "2020-01-01T09:00:00", hora_final: "2020-01-01T09:30:00" }),
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("09:00 - 09:30")).toBeInTheDocument());
  });

  it("logs the user out when the sequence fails to load with a 401", async () => {
    const logout = vi.fn();
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "op",
      role: "usuario_comum",
      login: vi.fn(),
      logout,
    });
    vi.spyOn(api, "listarTabelaB").mockRejectedValue(new api.ApiError(401, "Sessao expirada."));

    renderPage();

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it("does not render a Patan filter and calls listarTabelaB without patan", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "op",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });
    const listarSpy = vi.spyOn(api, "listarTabelaB").mockResolvedValue([]);

    renderPage();

    await waitFor(() =>
      expect(listarSpy).toHaveBeenCalledWith("token123", {
        linha: "LINHA 1",
        turno: undefined,
        setor: "solda",
        data: expect.any(String),
      })
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Produção/i })).toBeInTheDocument()
    );
    expect(screen.queryByLabelText(/patan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Patan [A-H]/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/linha/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/turno/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data da produção/i)).toBeInTheDocument();
  });

  it("permite alterar a data da produção ou selecionar Todas as datas", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "op",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });
    const listarSpy = vi.spyOn(api, "listarTabelaB").mockResolvedValue([]);

    renderPage();

    await waitFor(() =>
      expect(listarSpy).toHaveBeenCalledWith("token123", expect.objectContaining({
        linha: "LINHA 1",
        setor: "solda",
        data: expect.any(String),
      }))
    );

    // Aguarda carregar o header
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Produção/i })).toBeInTheDocument()
    );

    // Clica no botão 'Todas'
    const botaoTodas = screen.getByRole("button", { name: /^Todas$/i });
    fireEvent.click(botaoTodas);

    await waitFor(() =>
      expect(listarSpy).toHaveBeenCalledWith("token123", {
        linha: "LINHA 1",
        turno: undefined,
        setor: "solda",
        data: undefined,
      })
    );
  });

  it("alterna entre o modo Quadro (Kanban) e a Visão Tabela", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "op",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listarTabelaB").mockResolvedValue([
      item({ id: 1, material: "PEC-001", posto_trabalho: "SB6A" }),
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("SB6A")).toBeInTheDocument());

    // Botão de alternar para Tabela
    const botaoTabela = screen.getByRole("button", { name: /Tabela/i });
    expect(botaoTabela).toBeInTheDocument();
    botaoTabela.click();

    // Deve renderizar a tabela com cabeçalhos tabulares
    await waitFor(() => {
      expect(screen.getByText("Peça / Material")).toBeInTheDocument();
      expect(screen.getByText("Ações Chão de Fábrica")).toBeInTheDocument();
    });
  });

  it("exibe o botão + Ordem de Emergência para programador e admin, mas oculta para usuario_comum", async () => {
    // 1. usuario_comum: não exibe
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "op",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listarTabelaB").mockResolvedValue([]);
    const { unmount } = renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: /Produção/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Ordem de Emergência/i })).not.toBeInTheDocument();
    unmount();

    // 2. programador: exibe
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    const { unmount: unmountProg } = renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /Ordem de Emergência/i })).toBeInTheDocument());
    unmountProg();

    // 3. admin: exibe
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "admin_user",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /Ordem de Emergência/i })).toBeInTheDocument());
  });

  it("exibe botão de desfazer início acidental e permite reverter produção dentro de 60s para qualquer operador", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "operador_linha",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });

    const desfazerSpy = vi.spyOn(api, "desfazerInicioProducao").mockResolvedValue(
      item({ id: 10, material: "PEC-ATIVA", posto_trabalho: "SB6A", em_producao: false, inicio_real: null })
    );

    // Item em produção iniciado há 10 segundos
    const inicioRecente = new Date(Date.now() - 10000).toISOString();
    vi.spyOn(api, "listarTabelaB").mockResolvedValue([
      item({ id: 10, material: "PEC-ATIVA", posto_trabalho: "SB6A", em_producao: true, inicio_real: inicioRecente }),
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("PEC-ATIVA")).toBeInTheDocument());

    const btnDesfazer = screen.getByTestId("btn-desfazer-inicio");
    expect(btnDesfazer).toBeInTheDocument();
    expect(btnDesfazer).toHaveTextContent(/Desfazer/);

    fireEvent.click(btnDesfazer);

    await waitFor(() => {
      expect(desfazerSpy).toHaveBeenCalledWith("token123", 10);
    });
  });

  it("abre o modal de ordem de emergência via atalho de teclado Ctrl+I para programador", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listarTabelaB").mockResolvedValue([]);

    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: /Produção/i })).toBeInTheDocument());

    // Dispara atalho de teclado Ctrl+I
    fireEvent.keyDown(window, { key: "i", ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByText("Inserir Ordem de Emergência")).toBeInTheDocument();
    });
  });

  it("permite a programador ativar o modo de edição em produção e exibir o banner", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listarTabelaB").mockResolvedValue([
      item({ id: 101, posto_trabalho: "PR-82", material: "PECA-TESTE-101", kanbans: 4 }),
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText("PECA-TESTE-101")).toBeInTheDocument());

    const btnEditarProducao = screen.getByTestId("btn-toggle-modo-edicao-producao");
    expect(btnEditarProducao).toBeInTheDocument();
    expect(btnEditarProducao).toHaveTextContent("Editar em Produção");

    // Ativa o modo de edição
    fireEvent.click(btnEditarProducao);

    expect(screen.getByTestId("banner-modo-edicao-producao")).toBeInTheDocument();
    expect(screen.getByText(/Modo Edição em Produção Ativo/)).toBeInTheDocument();

    // Card exibe botão Editar
    const btnEditarCard = screen.getByTestId("btn-editar-card-101");
    expect(btnEditarCard).toBeInTheDocument();

    // Clica para abrir modal de edição
    fireEvent.click(btnEditarCard);
    expect(screen.getByText("Editar Card em Produção")).toBeInTheDocument();
  });
});



