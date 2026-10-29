import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as authModule from "../auth/AuthContext";
import { Nav } from "./Nav";

function mockAuth(
  role: authModule.Role | null,
  logout = vi.fn(),
  permissoes?: Partial<authModule.PermissoesUsuario> | null
) {
  vi.spyOn(authModule, "useAuth").mockReturnValue({
    token: role ? "token123" : null,
    username: role ? "joana" : null,
    role,
    permissoes: (permissoes as authModule.PermissoesUsuario) ?? null,
    login: vi.fn(),
    logout,
  });
}

function renderNav() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Nav defaultExpanded={true} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Nav", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when there is no authenticated user", () => {
    mockAuth(null);
    const { container } = renderNav();

    expect(container).toBeEmptyDOMElement();
  });

  it("shows only Producao and Sair for usuario_comum, hiding management views", () => {
    mockAuth("usuario_comum");
    renderNav();

    expect(screen.getByText("Produção — Solda")).toBeInTheDocument();
    expect(screen.getByText("Produção — Estamparia")).toBeInTheDocument();
    expect(screen.queryByText("Programação")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Calendário")).not.toBeInTheDocument();
    expect(screen.queryByText("Seisan Kanriban")).not.toBeInTheDocument();
    expect(screen.queryByText("Visualização do Patan")).not.toBeInTheDocument();
    expect(screen.queryByText("Ferramentaria")).not.toBeInTheDocument();
    expect(screen.queryByText("Documentação")).not.toBeInTheDocument();
    expect(screen.queryByText("Usuários")).not.toBeInTheDocument();
    expect(screen.getByText("Sair")).toBeInTheDocument();
  });

  it("shows only Producao Solda for operador_solda", () => {
    mockAuth("operador_solda");
    renderNav();

    expect(screen.getByText("Produção — Solda")).toBeInTheDocument();
    expect(screen.queryByText("Produção — Estamparia")).not.toBeInTheDocument();
    expect(screen.queryByText("Programação")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Calendário")).not.toBeInTheDocument();
    expect(screen.queryByText("Seisan Kanriban")).not.toBeInTheDocument();
    expect(screen.queryByText("Visualização do Patan")).not.toBeInTheDocument();
    expect(screen.queryByText("Ferramentaria")).not.toBeInTheDocument();
    expect(screen.queryByText("Documentação")).not.toBeInTheDocument();
    expect(screen.queryByText("Usuários")).not.toBeInTheDocument();
  });

  it("shows only Producao Estamparia for operador_estamparia", () => {
    mockAuth("operador_estamparia");
    renderNav();

    expect(screen.getByText("Produção — Estamparia")).toBeInTheDocument();
    expect(screen.queryByText("Produção — Solda")).not.toBeInTheDocument();
    expect(screen.queryByText("Programação")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Calendário")).not.toBeInTheDocument();
    expect(screen.queryByText("Seisan Kanriban")).not.toBeInTheDocument();
    expect(screen.queryByText("Visualização do Patan")).not.toBeInTheDocument();
    expect(screen.queryByText("Ferramentaria")).not.toBeInTheDocument();
    expect(screen.queryByText("Documentação")).not.toBeInTheDocument();
    expect(screen.queryByText("Usuários")).not.toBeInTheDocument();
  });

  it("shows Producao Solda/Estamparia and Programacao, but not Usuarios, for programador", () => {
    mockAuth("programador");
    renderNav();

    expect(screen.getByText("Produção — Solda")).toBeInTheDocument();
    expect(screen.getByText("Produção — Estamparia")).toBeInTheDocument();
    expect(screen.getByText("Programação")).toBeInTheDocument();
    expect(screen.getByText("Programação — Solda")).toBeInTheDocument();
    expect(screen.getByText("Programação — Estamparia")).toBeInTheDocument();
    expect(screen.queryByText("Usuários")).not.toBeInTheDocument();
  });

  it("shows every link for admin", () => {
    mockAuth("admin");
    renderNav();

    expect(screen.getByText("Produção — Solda")).toBeInTheDocument();
    expect(screen.getByText("Produção — Estamparia")).toBeInTheDocument();
    expect(screen.getByText("Programação")).toBeInTheDocument();
    expect(screen.getByText("Programação — Solda")).toBeInTheDocument();
    expect(screen.getByText("Programação — Estamparia")).toBeInTheDocument();
    expect(screen.getByText("Usuários")).toBeInTheDocument();
  });

  it("calls logout when Sair is clicked", async () => {
    const logout = vi.fn();
    mockAuth("admin", logout);
    renderNav();

    await userEvent.click(screen.getByText("Sair"));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
