import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import * as authModule from "../auth/AuthContext";
import { RequireRole } from "./RequireRole";

function renderWithRole(role: authModule.Role | null) {
  vi.spyOn(authModule, "useAuth").mockReturnValue({
    token: role ? "token" : null,
    username: role ? "joana" : null,
    role,
    login: vi.fn(),
    logout: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <RequireRole allowed={["admin"]}>
              <div>conteudo protegido</div>
            </RequireRole>
          }
        />
        <Route path="/login" element={<div>tela de login</div>} />
        <Route path="/" element={<div>pagina inicial</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireRole", () => {
  it("renders children when the role is allowed", () => {
    renderWithRole("admin");
    expect(screen.getByText("conteudo protegido")).toBeInTheDocument();
  });

  it("redirects to /login when there is no authenticated user", () => {
    renderWithRole(null);
    expect(screen.getByText("tela de login")).toBeInTheDocument();
  });

  it("redirects to / when the role is not allowed", () => {
    renderWithRole("usuario_comum");
    expect(screen.getByText("pagina inicial")).toBeInTheDocument();
  });
});
