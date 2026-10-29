import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as authModule from "../auth/AuthContext";
import * as api from "../services/api";
import * as reducerModule from "../state/sequenciaReducer";
import type { ItemProducao } from "../types/producao";
import { ProgramacaoPatan } from "./ProgramacaoPatan";

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
  const queryClient = new QueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ProgramacaoPatan />
    </QueryClientProvider>
  );
  return { ...utils, queryClient };
}

describe("ProgramacaoPatan", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state, then the board once the sequence loads", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "L1",
      turno: 1,
      patan: "A",
      itens: [
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
      ],
    });

    renderPage();

    expect(screen.getByText("Carregando sequencia...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("posto-1")).toBeInTheDocument());
    expect(screen.getByText("Enviar lote")).toBeInTheDocument();
  });

  it("shows an error message when the sequence fails to load", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockRejectedValue(new Error("network"));

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Erro ao carregar a sequencia.")).toBeInTheDocument()
    );
  });

  it("submits every held item across all postos as one bulk call when Enviar lote is clicked", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "L1",
      turno: 1,
      patan: "A",
      itens: [
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
      ],
    });
    const submitSpy = vi.spyOn(api, "submitBulkSequencia").mockResolvedValue([]);

    renderPage();
    await waitFor(() => expect(screen.getByText("posto-1")).toBeInTheDocument());

    await userEvent.click(screen.getByText("Enviar lote"));

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    const [calledToken, calledPayload] = submitSpy.mock.calls[0];
    expect(calledToken).toBe("token123");
    expect(calledPayload).toMatchObject({ linha: "LINHA 1", turno: 1, patan: "A" });
    expect(calledPayload.itens).toHaveLength(1);
    expect(calledPayload.itens[0]).toMatchObject({ id: 1, posto_trabalho: "posto-1" });
  });

  it("does not re-dispatch CARREGAR when a refetch of the same query resolves to unchanged data", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      itens: [item()],
    });
    const reducerSpy = vi.spyOn(reducerModule, "sequenciaReducer");

    const { queryClient } = renderPage();
    await waitFor(() => expect(screen.getByText("posto-1")).toBeInTheDocument());

    const carregarAntes = reducerSpy.mock.calls.filter(
      ([, action]) => action.type === "CARREGAR"
    ).length;
    expect(carregarAntes).toBe(1);

    // Force a refetch of the exact same query key (e.g. what react-query's
    // background refetching does) - since the resolved data is unchanged,
    // structural sharing keeps the `data` reference stable, so the effect
    // driving CARREGAR must not fire again.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["sequencia", "LINHA 1", 1, "A"] });
    });

    const carregarDepois = reducerSpy.mock.calls.filter(
      ([, action]) => action.type === "CARREGAR"
    ).length;
    expect(carregarDepois).toBe(1);
  });

  it("logs the user out when the sequence fails to load with a 401", async () => {
    const logout = vi.fn();
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout,
    });
    vi.spyOn(api, "getSequencia").mockRejectedValue(new api.ApiError(401, "Sessao expirada."));

    renderPage();

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it("logs the user out instead of showing the generic error when Enviar lote gets a 401", async () => {
    const logout = vi.fn();
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout,
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "L1",
      turno: 1,
      patan: "A",
      itens: [item()],
    });
    vi.spyOn(api, "submitBulkSequencia").mockRejectedValue(
      new api.ApiError(401, "Sessao expirada.")
    );

    renderPage();
    await waitFor(() => expect(screen.getByText("posto-1")).toBeInTheDocument());

    await userEvent.click(screen.getByText("Enviar lote"));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Falha ao enviar o lote. Nada foi salvo.")).not.toBeInTheDocument();
  });

  it("does not include an unchecked critical item in the submit payload", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "L1",
      turno: 1,
      patan: "A",
      itens: [item(), item({ id: 2, posto_trabalho: "posto-1", status: 3, sequencia: 0 })],
    });
    const submitSpy = vi.spyOn(api, "submitBulkSequencia").mockResolvedValue([]);

    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "posto-1" })).toBeInTheDocument()
    );

    await userEvent.click(screen.getByText("Enviar lote"));

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    const [, calledPayload] = submitSpy.mock.calls[0];
    expect(calledPayload.itens.map((i) => i.id)).toEqual([1]);
  });

  it("includes a critical item in the submit payload once included from drawer", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      itens: [item({ id: 2, status: 3, sequencia: 0 })],
    });
    const submitSpy = vi.spyOn(api, "submitBulkSequencia").mockResolvedValue([]);

    renderPage();

    // Aguarda carregar e abre o drawer de itens críticos
    const btnDrawer = await screen.findByRole("button", { name: /Itens Críticos/i });
    await userEvent.click(btnDrawer);

    // Clica no checkbox para incluir no lote
    const chk = await screen.findByRole("checkbox", { name: /Incluir/i });
    await userEvent.click(chk);

    // O posto agora deve aparecer no board
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "posto-1" })).toBeInTheDocument()
    );

    await userEvent.click(screen.getByText("Enviar lote"));

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    const [, calledPayload] = submitSpy.mock.calls[0];
    expect(calledPayload.itens.map((i) => i.id)).toEqual([2]);
  });

  it("increases the displayed kanban count when the + button is clicked", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "L1",
      turno: 1,
      patan: "A",
      itens: [item({ kanbans: 2 })],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("2 kanban(s)")).toBeInTheDocument());

    await userEvent.click(screen.getByLabelText("Aumentar kanban"));

    await waitFor(() => expect(screen.getByText("3 kanban(s)")).toBeInTheDocument());
  });

  it("refetches the sequence after a successful submit, so sent items disappear", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    const getSequenciaSpy = vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "L1",
      turno: 1,
      patan: "A",
      itens: [item()],
    });
    vi.spyOn(api, "submitBulkSequencia").mockResolvedValue([]);

    renderPage();
    await waitFor(() => expect(screen.getByText("posto-1")).toBeInTheDocument());
    expect(getSequenciaSpy).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByText("Enviar lote"));

    await waitFor(() => expect(getSequenciaSpy).toHaveBeenCalledTimes(2));
  });

  it("allows opening the critical items drawer, clicking + to include and submitting", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      itens: [
        item({ id: 1, posto_trabalho: "posto-1", status: 2 }),
        item({
          id: 55,
          posto_trabalho: "posto-1",
          status: 3,
          is_critico: true,
          sequencia: 0,
          saldo_estoque: 1200,
          qtd_por_kanban: 50,
        }),
      ],
    });
    const submitSpy = vi.spyOn(api, "submitBulkSequencia").mockResolvedValue([]);

    renderPage();
    await waitFor(() => expect(screen.getByText("posto-1")).toBeInTheDocument());

    // Abre o drawer retrátil
    await userEvent.click(screen.getByRole("button", { name: /Itens Críticos/i }));

    // Clica no botão com maiszinho para incluir no posto
    const btnIncluir = screen.getByRole("button", { name: /\+.*Incluir no Posto posto-1/i });
    await userEvent.click(btnIncluir);

    // Envia o lote
    await userEvent.click(screen.getByText("Enviar lote"));

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    const [, calledPayload] = submitSpy.mock.calls[0];
    expect(calledPayload.itens.map((i) => i.id)).toEqual([1, 55]);
  });

  it("allows removing a regular card from queue and submitting without it", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      itens: [
        item({ id: 101, posto_trabalho: "posto-1", material: "PECA-A", sequencia: 1 }),
        item({ id: 102, posto_trabalho: "posto-1", material: "PECA-B", sequencia: 2 }),
      ],
    });
    const submitSpy = vi.spyOn(api, "submitBulkSequencia").mockResolvedValue([]);

    renderPage();
    await waitFor(() => expect(screen.getByText("PECA-A")).toBeInTheDocument());
    expect(screen.getByText("PECA-B")).toBeInTheDocument();

    // Clica no botão 'Retirar da fila' do segundo card
    const botoesRetirar = screen.getAllByTestId("btn-remover-card");
    expect(botoesRetirar).toHaveLength(2);
    await userEvent.click(botoesRetirar[1]);

    // PECA-B agora não está mais no board
    await waitFor(() => expect(screen.queryByText("PECA-B")).not.toBeInTheDocument());
    expect(screen.getByText("PECA-A")).toBeInTheDocument();

    // Enviar lote e confirmar que apenas PECA-A foi submetida
    await userEvent.click(screen.getByRole("button", { name: /enviar lote/i }));

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    const [, calledPayload] = submitSpy.mock.calls[0];
    expect(calledPayload.itens.map((i) => i.id)).toEqual([101]);
  });

  it("allows clicking Montar Padrão to restore removed cards", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      itens: [
        item({ id: 201, posto_trabalho: "posto-1", material: "PECA-X", sequencia: 1 }),
        item({ id: 202, posto_trabalho: "posto-1", material: "PECA-Y", sequencia: 2 }),
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("PECA-X")).toBeInTheDocument());
    expect(screen.getByText("PECA-Y")).toBeInTheDocument();

    // Remove PECA-Y
    const botoesRetirar = screen.getAllByTestId("btn-remover-card");
    await userEvent.click(botoesRetirar[1]);

    await waitFor(() => expect(screen.queryByText("PECA-Y")).not.toBeInTheDocument());

    // Abre 'Mais Ações' e clica em 'Montar Padrão'
    const btnMaisAcoes = screen.getByRole("button", { name: /Mais Ações/i });
    await userEvent.click(btnMaisAcoes);

    const btnMontar = screen.getByRole("button", { name: /Montar Padrão/i });
    await userEvent.click(btnMontar);

    // PECA-Y é restaurada e volta a aparecer no board!
    await waitFor(() => expect(screen.getByText("PECA-Y")).toBeInTheDocument());
  });

  it("renders 'Atualizar SAP' button in Mais Ações and calls atualizarSap on click", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      itens: [item({ id: 101, posto_trabalho: "posto-1", material: "PECA-1", sequencia: 1 })],
    });
    const atualizarSapMock = vi.spyOn(api, "atualizarSap").mockResolvedValue({
      sucesso: true,
      mensagem: "OK",
      total_importados: 5,
      total_ignorados: 0,
      resumo_por_linha: { "LINHA 1": 5 },
      origem: "rede_compartilhada",
      data_arquivo: "09/10/2026 às 08:30:00",
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("PECA-1")).toBeInTheDocument());

    const btnMaisAcoes = screen.getByRole("button", { name: /Mais Ações/i });
    await userEvent.click(btnMaisAcoes);

    const btnAtualizarSap = screen.getByRole("button", { name: /Atualizar SAP/i });
    expect(btnAtualizarSap).toBeInTheDocument();

    await userEvent.click(btnAtualizarSap);
    expect(atualizarSapMock).toHaveBeenCalledWith("token123", "solda");
  });

  it("switches between 'Lote Fixo (Patan)' and 'Estoque Máximo (Carga Máq.)' dimensioning modes", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      itens: [
        item({
          id: 201,
          posto_trabalho: "SB6A",
          material: "PECA-MODO",
          kanbans: 5,
          qtd_por_kanban: 80,
          demanda: 400, // 400 / 80 = 5 caixas
          kanban_max: 12, // Estoque máximo = 12 caixas
        }),
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("PECA-MODO")).toBeInTheDocument());

    const btnLoteFixo = screen.getByRole("button", { name: /Lote Fixo \(Patan\)/i });
    const btnEstoqueMax = screen.getByRole("button", { name: /Estoque Máximo \(Carga Máq\.\)/i });

    expect(btnLoteFixo).toBeInTheDocument();
    expect(btnEstoqueMax).toBeInTheDocument();

    // Inicia no modo Lote Fixo (5 kanbans)
    expect(screen.getByText("5 kanban(s)")).toBeInTheDocument();

    // Alterna para Estoque Máximo
    await userEvent.click(btnEstoqueMax);

    // O cartão agora exibe 12 kanbans!
    await waitFor(() => expect(screen.getByText("12 kanban(s)")).toBeInTheDocument());

    // Volta para Lote Fixo
    await userEvent.click(btnLoteFixo);
    await waitFor(() => expect(screen.getByText("5 kanban(s)")).toBeInTheDocument());
  });

  it("allows opening '+ Inserir Card' modal and adding a card manually to the board", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      itens: [item({ id: 301, posto_trabalho: "SB6A", material: "PECA-EXISTENTE" })],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("PECA-EXISTENTE")).toBeInTheDocument());

    const btnInserir = screen.getByRole("button", { name: /\+ Inserir Card/i });
    expect(btnInserir).toBeInTheDocument();
    await userEvent.click(btnInserir);

    expect(screen.getByText("Inserir Card na Programação")).toBeInTheDocument();

    const inputMaterial = screen.getByPlaceholderText(/5X0803701/i);
    await userEvent.type(inputMaterial, "PECA-NOVA-MANUAL");

    const btnSubmit = screen.getByRole("button", { name: /Adicionar à Fila/i });
    await userEvent.click(btnSubmit);

    // O novo card aparece no board
    await waitFor(() => expect(screen.getByText("PECA-NOVA-MANUAL")).toBeInTheDocument());
  });

  it("permite selecionar e alterar a data da programação chamando getSequencia com data_base", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
    const seqSpy = vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      itens: [item({ id: 401, posto_trabalho: "SB6A", material: "PECA-DATA" })],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("PECA-DATA")).toBeInTheDocument());

    // Verifica que getSequencia foi chamado inicialmente com data_base (hoje local)
    expect(seqSpy).toHaveBeenCalledWith("token123", expect.objectContaining({
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      data_base: expect.any(String),
    }));

    // Clica no botão de próximo dia '▶'
    const btnProxDia = screen.getByRole("button", { name: "▶" });
    await userEvent.click(btnProxDia);

    await waitFor(() =>
      expect(seqSpy).toHaveBeenCalledWith("token123", expect.objectContaining({
        linha: "LINHA 1",
        turno: 1,
        patan: "A",
        data_base: expect.any(String),
      }))
    );
  });

  it("aciona envio do lote com Ctrl+Enter e abre modal de inserção com Ctrl+I", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });

    const submitSpy = vi.spyOn(api, "submitBulkSequencia").mockResolvedValue([]);

    vi.spyOn(api, "getSequencia").mockResolvedValue({
      linha: "LINHA 1",
      turno: 1,
      patan: "A",
      itens: [item({ id: 501, posto_trabalho: "SB6A", material: "PECA-ATALHO" })],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("PECA-ATALHO")).toBeInTheDocument());

    // 1. Testa atalho Ctrl+I para abrir modal de Inserir Card
    fireEvent.keyDown(window, { key: "i", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Inserir Card/i })).toBeInTheDocument();
    });

    // Fecha o modal via Escape
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Inserir Card/i })).not.toBeInTheDocument();
    });

    // 2. Testa atalho Ctrl+Enter para enviar lote
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith("token123", expect.objectContaining({
        linha: "LINHA 1",
        turno: 1,
        patan: "A",
      }));
    });
  });
});

