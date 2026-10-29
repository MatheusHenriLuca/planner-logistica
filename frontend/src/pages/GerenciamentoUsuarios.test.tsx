import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import * as authModule from "../auth/AuthContext";
import * as api from "../services/api";
import { GerenciamentoUsuarios } from "./GerenciamentoUsuarios";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("GerenciamentoUsuarios", () => {
  it("lists users once loaded", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "admin",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listUsers").mockResolvedValue([
      { id: 1, username: "joana", role: "admin" },
      { id: 2, username: "pedro", role: "programador" },
    ]);

    render(<GerenciamentoUsuarios />);

    expect(screen.getByText("Carregando usuários...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("joana")).toBeInTheDocument());
    expect(screen.getByText("pedro")).toBeInTheDocument();
  });

  it("shows an error message when the user list fails to load", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "admin",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listUsers").mockRejectedValue(new Error("network"));

    render(<GerenciamentoUsuarios />);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Falha ao carregar usuarios.")
    );
  });

  it("logs the user out instead of showing a generic error when a call returns 401", async () => {
    const logout = vi.fn();
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "admin",
      role: "admin",
      login: vi.fn(),
      logout,
    });
    vi.spyOn(api, "listUsers").mockRejectedValue(new api.ApiError(401, "Sessao expirada."));

    render(<GerenciamentoUsuarios />);

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Falha ao carregar usuarios.")).not.toBeInTheDocument();
  });

  it("removes a user when Remover is clicked", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "admin",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listUsers").mockResolvedValue([{ id: 1, username: "joana", role: "admin" }]);
    const deleteSpy = vi.spyOn(api, "deleteUser").mockResolvedValue();

    render(<GerenciamentoUsuarios />);
    await waitFor(() => expect(screen.getByText("joana")).toBeInTheDocument());

    await userEvent.click(screen.getByText("Remover"));

    expect(deleteSpy).toHaveBeenCalledWith("token123", 1);
  });

  it("updates a user's role when a new role is selected", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: "token123",
      username: "admin",
      role: "admin",
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(api, "listUsers").mockResolvedValue([{ id: 1, username: "joana", role: "admin" }]);
    const updateSpy = vi
      .spyOn(api, "updateUserRole")
      .mockResolvedValue({ id: 1, username: "joana", role: "programador" });

    render(<GerenciamentoUsuarios />);
    await waitFor(() => expect(screen.getByText("joana")).toBeInTheDocument());

    const [roleSelect] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(roleSelect, "programador");

    expect(updateSpy).toHaveBeenCalledWith("token123", 1, "programador");
  });
});
