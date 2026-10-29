import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as authModule from "../../auth/AuthContext";
import { PlanItemStatus, type ItemProducao } from "../../types/producao";
import { SequenciaBoard } from "./SequenciaBoard";

// CardFooter (inside SequenciaCard) calls useAuth() and 4 useQuery hooks -
// needs both an AuthContext value and a QueryClient in the tree, same
// pattern already used in Producao.test.tsx. The queries themselves fetch
// against a nonexistent server in this environment and fail harmlessly
// (retry: false) - none of the assertions below wait on them.
function renderBoard(props: Parameters<typeof SequenciaBoard>[0]) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SequenciaBoard {...props} />
    </QueryClientProvider>
  );
}

function item(overrides: Partial<ItemProducao> = {}): ItemProducao {
  return {
    id: 1,
    linha: "L1",
    turno: 1,
    patan: "A",
    posto_trabalho: "posto-1",
    status: PlanItemStatus.Normal,
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

describe("SequenciaBoard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockAuth() {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "op",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });
  }

  it("renders one card per item, grouped under its posto heading", () => {
    mockAuth();
    renderBoard({
      itensPorPosto: { "posto-1": [item({ id: 1 }), item({ id: 2, sequencia: 2 })] },
      onReordenar: vi.fn(),
    });

    expect(screen.getByText("posto-1")).toBeInTheDocument();
    expect(screen.getAllByTestId("sequencia-card")).toHaveLength(2);
  });

  it("shows the exact lunch label only for items with almoco_incluso", () => {
    mockAuth();
    renderBoard({
      itensPorPosto: { "posto-1": [item({ id: 1, almoco_incluso: true })] },
      onReordenar: vi.fn(),
    });

    expect(screen.getByTestId("almoco-label")).toHaveTextContent(
      "HORARIO DE ALMOCO INCLUSO"
    );
  });

  it("shows a falta de estoque marker when the item lacks stock", () => {
    mockAuth();
    renderBoard({
      itensPorPosto: { "posto-1": [item({ id: 1, tem_falta_estoque: true })] },
      onReordenar: vi.fn(),
    });

    expect(screen.getByTestId("falta-estoque")).toBeInTheDocument();
  });

  it("hides falta de estoque marker when requested kanbans are within available stock capacity", () => {
    mockAuth();
    // 20 kanbans x 10 pçs = 200 pçs. Saldo = 200 pçs. Demanda cabe exatamente no estoque -> marcador deve sumir!
    renderBoard({
      itensPorPosto: {
        "posto-1": [
          item({
            id: 1,
            kanbans: 20,
            qtd_por_kanban: 10,
            saldo_estoque: 200,
            tem_falta_estoque: true,
          }),
        ],
      },
      onReordenar: vi.fn(),
    });

    expect(screen.queryByTestId("falta-estoque")).not.toBeInTheDocument();
  });

  it("shows falta de estoque marker and possible capacity when requested kanbans exceed stock", () => {
    mockAuth();
    // 21 kanbans x 10 pçs = 210 pçs. Saldo = 200 pçs (comporta 20 kanbans). Excede estoque!
    renderBoard({
      itensPorPosto: {
        "posto-1": [
          item({
            id: 1,
            kanbans: 21,
            qtd_por_kanban: 10,
            saldo_estoque: 200,
            tem_falta_estoque: false,
          }),
        ],
      },
      onReordenar: vi.fn(),
    });

    expect(screen.getByTestId("falta-estoque")).toBeInTheDocument();
    expect(screen.getByText(/Consegue produzir:/i)).toBeInTheDocument();
    expect(screen.getByText(/20 kanbans/i)).toBeInTheDocument();
  });

  it("hides any falta de estoque marker and capacity suggestion on Produção screen where exibirEstoque is false", () => {
    mockAuth();
    // Na tela de Produção (exibirEstoque = false), o operador apenas executa a ordem:
    // falta de estoque NUNCA deve aparecer na Produção (exclusivo da Programação)
    renderBoard({
      exibirEstoque: false,
      itensPorPosto: {
        "posto-1": [
          item({
            id: 1,
            kanbans: 25,
            qtd_por_kanban: 10,
            saldo_estoque: 200,
            tem_falta_estoque: true,
          }),
        ],
      },
      onReordenar: vi.fn(),
    });

    expect(screen.queryByTestId("falta-estoque")).not.toBeInTheDocument();
    expect(screen.queryByText(/Falta de estoque/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Consegue produzir:/i)).not.toBeInTheDocument();
  });

  it("renders compact lunch icon badge without long text in compact mode", () => {
    mockAuth();
    renderBoard({
      modoCompacto: true,
      itensPorPosto: {
        "posto-1": [item({ id: 1, almoco_incluso: true })],
      },
      onReordenar: vi.fn(),
    });

    // Badge compacto presente no cabeçalho
    expect(screen.getByTestId("almoco-badge-compacto")).toBeInTheDocument();
    expect(screen.getByTestId("almoco-badge-compacto")).toHaveTextContent("🍽️");
    // O texto comprido que colidia com os controles de kanbans NÃO deve estar presente no modo compacto
    expect(screen.queryByText("HORARIO DE ALMOCO INCLUSO")).not.toBeInTheDocument();
  });

  it("identifies Produção em Linha when the same material exists in multiple postos", () => {
    mockAuth();
    renderBoard({
      itensPorPosto: {
        "PR-110": [item({ id: 101, material: "MAT-TANDEM-1", posto_trabalho: "PR-110" })],
        "PR-109": [item({ id: 102, material: "MAT-TANDEM-1", posto_trabalho: "PR-109" })],
      },
      onReordenar: vi.fn(),
    });

    // Banner de Produção em Linha deve estar presente
    expect(screen.getByText(/material\(is\) sincronizados em tandem/i)).toBeInTheDocument();

    // Cards devem exibir a badge 'PRODUÇÃO EM LINHA'
    const badges = screen.getAllByText("PRODUÇÃO EM LINHA");
    expect(badges).toHaveLength(2);

    // Cards devem conter classe de estilo sutil em tons sky
    const cards = screen.getAllByTestId("sequencia-card");
    expect(cards[0].className).toContain("border-sky-300");
    expect(cards[1].className).toContain("border-sky-300");
  });

  it("renders the X remove button in the top-right header without bottom sublayer button in expanded mode", async () => {
    mockAuth();
    const onRemover = vi.fn();
    renderBoard({
      itensPorPosto: {
        "posto-1": [item({ id: 201, material: "MAT-TESTE-X", posto_trabalho: "posto-1" })],
      },
      onReordenar: vi.fn(),
      onRemoverItem: onRemover,
      modoCompacto: false, // Modo expandido / detalhado
    });

    // O botão com X deve existir no topo
    const btnRemover = screen.getByTestId("btn-remover-card");
    expect(btnRemover).toBeInTheDocument();
    expect(btnRemover.textContent).toContain("✕");

    // Não deve existir botão redundante de texto no rodapé ("Retirar da fila")
    expect(screen.queryByText("Retirar da fila")).not.toBeInTheDocument();

    // Clicar no botão aciona onRemoverItem
    fireEvent.click(btnRemover);
    expect(onRemover).toHaveBeenCalledWith("posto-1", "201");
  });

  it("does not render connection lines when idle, but draws them when a material is selected in the banner", () => {
    mockAuth();
    renderBoard({
      itensPorPosto: {
        "PR-110": [item({ id: 101, material: "MAT-TANDEM-1", posto_trabalho: "PR-110" })],
        "PR-109": [item({ id: 102, material: "MAT-TANDEM-1", posto_trabalho: "PR-109" })],
      },
      onReordenar: vi.fn(),
    });

    // 1. Em repouso: nenhuma linha de SVG renderizada (tela despoluída)
    expect(screen.queryByTestId("conexoes-overlay")).not.toBeInTheDocument();

    // 2. Clica no pill do material no banner
    const pill = screen.getByTestId("pill-material-MAT-TANDEM-1");
    fireEvent.click(pill);

    // O pill agora indica seleção
    expect(screen.getByText("📌")).toBeInTheDocument();
    expect(screen.getByText("✕ Limpar seleção")).toBeInTheDocument();
  });

  it("permite clicar em 'Consegue produzir: X kanbans' para definir automaticamente a quantidade suportada pelo estoque", () => {
    mockAuth();
    const onDefinirKanban = vi.fn();

    // 69 kanbans planejados, 10 pçs por kanban. Saldo = 330 pçs -> consegue produzir 33 kanbans
    renderBoard({
      itensPorPosto: {
        "posto-1": [
          item({
            id: 42,
            posto_trabalho: "posto-1",
            kanbans: 69,
            qtd_por_kanban: 10,
            saldo_estoque: 330,
            tem_falta_estoque: true,
          }),
        ],
      },
      onReordenar: vi.fn(),
      exibirEstoque: true,
      onDefinirKanban,
      modoCompacto: false,
    });

    const btnAjustar = screen.getByTestId("btn-ajustar-capacidade-estoque");
    expect(btnAjustar).toBeInTheDocument();
    expect(btnAjustar.textContent).toContain("Consegue produzir: 33 kanbans");

    // Clica no botão de ajuste em 1 clique
    fireEvent.click(btnAjustar);
    expect(onDefinirKanban).toHaveBeenCalledWith("posto-1", "42", 33);
  });

  it("permite clicar em 'Consegue produzir' também no modo compacto", () => {
    mockAuth();
    const onDefinirKanban = vi.fn();

    renderBoard({
      itensPorPosto: {
        "posto-1": [
          item({
            id: 43,
            posto_trabalho: "posto-1",
            kanbans: 50,
            qtd_por_kanban: 10,
            saldo_estoque: 200,
            tem_falta_estoque: true,
          }),
        ],
      },
      onReordenar: vi.fn(),
      exibirEstoque: true,
      onDefinirKanban,
      modoCompacto: true,
    });

    const btnAjustar = screen.getByTestId("btn-ajustar-capacidade-estoque");
    expect(btnAjustar).toBeInTheDocument();
    expect(btnAjustar.textContent).toContain("Consegue produzir: 20 kanbans");

    fireEvent.click(btnAjustar);
    expect(onDefinirKanban).toHaveBeenCalledWith("posto-1", "43", 20);
  });
});

