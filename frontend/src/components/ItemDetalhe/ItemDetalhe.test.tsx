import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as authModule from "../../auth/AuthContext";
import * as apiModule from "../../services/api";
import { PlanItemStatus, type ItemProducao } from "../../types/producao";
import { ItemDetalhe } from "./ItemDetalhe";

const mockItem: ItemProducao = {
  id: 10,
  linha: "LINHA 1",
  turno: 1,
  patan: "A",
  posto_trabalho: "Ponteadeira 43",
  material: "50381395",
  status: PlanItemStatus.Normal,
  sequencia: 1,
  hora_inicial: "2026-10-20T06:20:00",
  hora_final: "2026-10-20T07:15:00",
  almoco_incluso: false,
  kanbans: 5,
  qtd_por_kanban: 30,
  tempo_por_peca_minutos: 0.35,
  is_critico: false,
  tem_falta_estoque: false,
  coluna_extra_id: null,
  anotacoes: "Ordem prioritária - Linha 1",
  mostrar_anotacoes_quadro: true,
};

function renderComponent(item: ItemProducao = mockItem, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ItemDetalhe item={item} onClose={onClose} />
    </QueryClientProvider>
  );
}

describe("ItemDetalhe", () => {
  beforeEach(() => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "mock-token",
      username: "programador1",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(apiModule, "listarCatalogoLabels").mockResolvedValue([]);
    vi.spyOn(apiModule, "listarLabelsDoItem").mockResolvedValue([]);
    vi.spyOn(apiModule, "listarChecklist").mockResolvedValue([]);
    vi.spyOn(apiModule, "listarComentarios").mockResolvedValue([]);
    vi.spyOn(apiModule, "obterAnotacoesItem").mockResolvedValue({
      item_id: 10,
      anotacoes: "Ordem prioritária - Linha 1",
      mostrar_anotacoes_quadro: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("não deve renderizar campo nem seção de anexos", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.queryByText(/anexo/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/adicionar anexo/i)).not.toBeInTheDocument();
    });
  });

  it("renderiza a seção de anotações do programador com checkbox de visualização no quadro", async () => {
    renderComponent();

    expect(screen.getByRole("heading", { name: "Anotações" })).toBeInTheDocument();
    expect(
      screen.getByLabelText(/mostrar no quadro/i)
    ).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(
      /insira detalhes da ordem/i
    ) as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe("Ordem prioritária - Linha 1");

    expect(screen.getByRole("button", { name: /salvar anotações/i })).toBeInTheDocument();
  });

  it("permite salvar anotações atualizadas pelo programador", async () => {
    const atualizarSpy = vi
      .spyOn(apiModule, "atualizarAnotacoesItem")
      .mockResolvedValue({
        ...mockItem,
        anotacoes: "Anotação revisada para o 1º turno",
        mostrar_anotacoes_quadro: false,
      });

    renderComponent();

    const textarea = screen.getByPlaceholderText(
      /insira detalhes da ordem/i
    );
    fireEvent.change(textarea, {
      target: { value: "Anotação revisada para o 1º turno" },
    });

    const checkbox = screen.getByLabelText(/mostrar no quadro/i);
    fireEvent.click(checkbox);

    const btnSalvar = screen.getByRole("button", { name: /salvar anotações/i });
    fireEvent.click(btnSalvar);

    await waitFor(() => {
      expect(atualizarSpy).toHaveBeenCalledWith("mock-token", 10, {
        anotacoes: "Anotação revisada para o 1º turno",
        mostrar_anotacoes_quadro: false,
      });
    });
  });

  it("renderiza modo somente leitura para usuário comum", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "mock-token",
      username: "operador1",
      role: "usuario_comum",
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderComponent();

    expect(
      screen.queryByPlaceholderText(
        /insira detalhes da ordem/i
      )
    ).not.toBeInTheDocument();
    expect(screen.getByText(/somente leitura/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copiar anotações/i })).toBeInTheDocument();
  });
});
