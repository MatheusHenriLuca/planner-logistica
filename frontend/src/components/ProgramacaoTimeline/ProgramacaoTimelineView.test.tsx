import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ItemProducao } from "../../types/producao";
import { ProgramacaoTimelineView } from "./ProgramacaoTimelineView";

function item(overrides: Partial<ItemProducao> = {}): ItemProducao {
  return {
    id: 1,
    linha: "LINHA 1",
    turno: 1,
    sequencia: 1,
    posto_trabalho: "PR-92",
    material: "PECA-1",
    kanbans: 5,
    qtd_por_kanban: 100,
    tempo_por_peca_minutos: 0.0166,
    hora_inicial: "2026-10-20T06:20:00",
    hora_final: "2026-10-20T06:28:20",
    almoco_incluso: false,
    saldo_estoque: 1000,
    tem_falta_estoque: false,
    status: 2,
    is_critico: false,
    em_producao: false,
    patan: "A",
    coluna_extra_id: null,
    producao_em_linha: false,
    postos_vinculados: [],
    ...overrides,
  };
}

describe("ProgramacaoTimelineView", () => {
  it("renders timeline with work posts and scheduled blocks", () => {
    const itens = [
      item({ id: 1, material: "PECA-A", sequencia: 1 }),
      item({ id: 2, material: "PECA-B", sequencia: 2 }),
    ];

    render(
      <ProgramacaoTimelineView
        itensPorPosto={{ "PR-92": itens }}
        turno={1}
        onAjustarKanban={vi.fn()}
        onRemoverItem={vi.fn()}
        onReordenar={vi.fn()}
      />
    );

    expect(screen.getByText("PR-92")).toBeInTheDocument();
    expect(screen.getByText("PECA-A")).toBeInTheDocument();
    expect(screen.getByText("PECA-B")).toBeInTheDocument();
  });

  it("allows reordering cards forward and backward via arrow buttons", () => {
    const onReordenar = vi.fn();
    const itens = [
      item({ id: 101, material: "LOTE-1", sequencia: 1 }),
      item({ id: 102, material: "LOTE-2", sequencia: 2 }),
    ];

    render(
      <ProgramacaoTimelineView
        itensPorPosto={{ "PR-92": itens }}
        turno={1}
        onAjustarKanban={vi.fn()}
        onRemoverItem={vi.fn()}
        onReordenar={onReordenar}
      />
    );

    // Deve ter botões ◀ e ▶ para cada card
    const botoesAvancar = screen.getAllByLabelText("Mover lote para frente");
    expect(botoesAvancar).toHaveLength(2);

    // O primeiro botão ▶ está habilitado (move o primeiro lote para frente)
    expect(botoesAvancar[0]).not.toBeDisabled();
    fireEvent.click(botoesAvancar[0]);

    // onReordenar deve ter sido chamado com a lista invertida
    expect(onReordenar).toHaveBeenCalledTimes(1);
    expect(onReordenar).toHaveBeenCalledWith("PR-92", [itens[1], itens[0]]);
  });

  it("allows moving a card backward with ◀ button", () => {
    const onReordenar = vi.fn();
    const itens = [
      item({ id: 101, material: "LOTE-1", sequencia: 1 }),
      item({ id: 102, material: "LOTE-2", sequencia: 2 }),
    ];

    render(
      <ProgramacaoTimelineView
        itensPorPosto={{ "PR-92": itens }}
        turno={1}
        onAjustarKanban={vi.fn()}
        onRemoverItem={vi.fn()}
        onReordenar={onReordenar}
      />
    );

    const botoesVoltar = screen.getAllByLabelText("Mover lote para trás");
    expect(botoesVoltar).toHaveLength(2);

    // O primeiro botão ◀ deve estar desabilitado (já é o primeiro)
    expect(botoesVoltar[0]).toBeDisabled();

    // O segundo botão ◀ move LOTE-2 para trás (para o início)
    expect(botoesVoltar[1]).not.toBeDisabled();
    fireEvent.click(botoesVoltar[1]);

    expect(onReordenar).toHaveBeenCalledTimes(1);
    expect(onReordenar).toHaveBeenCalledWith("PR-92", [itens[1], itens[0]]);
  });

  it("allows reordering cards via drag and drop", () => {
    const onReordenar = vi.fn();
    const itens = [
      item({ id: 101, material: "LOTE-1", sequencia: 1 }),
      item({ id: 102, material: "LOTE-2", sequencia: 2 }),
    ];

    render(
      <ProgramacaoTimelineView
        itensPorPosto={{ "PR-92": itens }}
        turno={1}
        onAjustarKanban={vi.fn()}
        onRemoverItem={vi.fn()}
        onReordenar={onReordenar}
      />
    );

    const card1 = screen.getByText("LOTE-1").closest("div[draggable='true']");
    const card2 = screen.getByText("LOTE-2").closest("div[draggable='true']");

    expect(card1).not.toBeNull();
    expect(card2).not.toBeNull();

    fireEvent.dragStart(card1!, {
      dataTransfer: {
        setData: vi.fn(),
        getData: vi.fn().mockReturnValue(JSON.stringify({ posto: "PR-92", index: 0 })),
      },
    });

    fireEvent.drop(card2!, {
      dataTransfer: {
        getData: vi.fn().mockReturnValue(JSON.stringify({ posto: "PR-92", index: 0 })),
      },
    });

    expect(onReordenar).toHaveBeenCalledTimes(1);
    expect(onReordenar).toHaveBeenCalledWith("PR-92", [itens[1], itens[0]]);
  });
});
