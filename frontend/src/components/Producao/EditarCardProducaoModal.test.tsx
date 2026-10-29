import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as authModule from "../../auth/AuthContext";
import * as api from "../../services/api";
import type { ItemProducao } from "../../types/producao";
import { EditarCardProducaoModal } from "./EditarCardProducaoModal";

const mockItem: ItemProducao = {
  id: 42,
  linha: "L1",
  turno: 1,
  patan: "A",
  posto_trabalho: "PR-82",
  status: 2,
  sequencia: 1,
  hora_inicial: "2026-10-21T06:20:00",
  hora_final: "2026-10-21T07:20:00",
  almoco_incluso: false,
  kanbans: 5,
  qtd_por_kanban: 100,
  tempo_por_peca_minutos: 0.12,
  material: "TESTE-123",
  is_critico: false,
  tem_falta_estoque: false,
  coluna_extra_id: null,
};

describe("EditarCardProducaoModal", () => {
  it("renderiza os campos com valores atuais do card", () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <EditarCardProducaoModal
        item={mockItem}
        onClose={vi.fn()}
        onSucesso={vi.fn()}
      />
    );

    expect(screen.getByText("Editar Card em Produção")).toBeInTheDocument();
    expect(screen.getByText(/TESTE-123/)).toBeInTheDocument();
    expect(screen.getByText(/PR-82/)).toBeInTheDocument();

    const inputKanbans = screen.getByLabelText(/Kanbans/i) as HTMLInputElement;
    expect(inputKanbans.value).toBe("5");

    const inputQtd = screen.getByLabelText(/Peças por Kanban/i) as HTMLInputElement;
    expect(inputQtd.value).toBe("100");
  });

  it("submete alterações e chama editarItemProducao", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });

    const atualizarSpy = vi.spyOn(api, "editarItemProducao").mockResolvedValue({
      ...mockItem,
      kanbans: 8,
    });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <EditarCardProducaoModal
        item={mockItem}
        onClose={onClose}
        onSucesso={onSuccess}
      />
    );

    const inputKanbans = screen.getByLabelText(/Kanbans/i);
    fireEvent.change(inputKanbans, { target: { value: "8" } });

    const btnSalvar = screen.getByRole("button", { name: /Salvar Alterações/i });
    fireEvent.click(btnSalvar);

    await waitFor(() => {
      expect(atualizarSpy).toHaveBeenCalledWith("token123", 42, expect.objectContaining({
        kanbans: 8,
        recalcular_subsequentes: true,
      }));
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("exibe confirmação e chama excluirItemProducao ao excluir card", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });

    const excluirSpy = vi.spyOn(api, "excluirItemProducao").mockResolvedValue({
      mensagem: "removido",
      itens_removidos: 1,
    });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <EditarCardProducaoModal
        item={mockItem}
        onClose={onClose}
        onSucesso={onSuccess}
      />
    );

    // Clica no botão Excluir Card no rodapé
    const btnExcluir = screen.getByRole("button", { name: /Excluir Card/i });
    fireEvent.click(btnExcluir);

    // Confirmação deve aparecer
    expect(screen.getByText(/Tem certeza que deseja excluir/i)).toBeInTheDocument();

    // Clica em Sim, Excluir
    const btnConfirmar = screen.getByRole("button", { name: /Sim, Excluir/i });
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(excluirSpy).toHaveBeenCalledWith("token123", 42, false);
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("permite excluir também irmãos tandem quando item está em linha", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "prog",
      role: "programador",
      login: vi.fn(),
      logout: vi.fn(),
    });

    const excluirSpy = vi.spyOn(api, "excluirItemProducao").mockResolvedValue({
      mensagem: "removidos tandem",
      itens_removidos: 2,
    });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    const tandemItem: ItemProducao = {
      ...mockItem,
      producao_em_linha: true,
      postos_vinculados: ["PR-84"],
    };

    render(
      <EditarCardProducaoModal
        item={tandemItem}
        onClose={onClose}
        onSucesso={onSuccess}
      />
    );

    // Clica em Excluir Card
    const btnExcluir = screen.getByRole("button", { name: /Excluir Card/i });
    fireEvent.click(btnExcluir);

    // Checkbox de tandem deve estar presente e marcada por padrão
    const checkboxTandem = screen.getByRole("checkbox", {
      name: /Excluir também dos postos vinculados em linha/i,
    });
    expect(checkboxTandem).toBeChecked();

    // Confirma exclusão com tandem=true
    const btnConfirmar = screen.getByRole("button", { name: /Sim, Excluir/i });
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(excluirSpy).toHaveBeenCalledWith("token123", 42, true);
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});

