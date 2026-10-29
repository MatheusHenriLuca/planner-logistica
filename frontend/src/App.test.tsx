import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as authModule from "./auth/AuthContext";
import * as api from "./services/api";
import App from "./App";

function fakeJwt(sub: string, role: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const payload = btoa(JSON.stringify({ sub, role, exp: 9999999999 }));
  return `${header}.${payload}.signature`;
}

describe("App", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("redirects an unauthenticated user to the login screen", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: null,
      username: null,
      role: null,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<App />);

    await waitFor(() => expect(screen.getByPlaceholderText("usuario")).toBeInTheDocument());
  });

  it("shows an error message when login fails", async () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      token: null,
      username: null,
      role: null,
      login: vi.fn().mockRejectedValue(new Error("Credenciais invalidas")),
      logout: vi.fn(),
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText("Entrar")).toBeInTheDocument());

    await act(async () => {
      await userEvent.click(screen.getByText("Entrar"));
    });

    expect(screen.getByText("Usuario ou senha invalidos.")).toBeInTheDocument();
  });

  it("navigates away from the login form after a successful login", async () => {
    vi.spyOn(api, "login").mockResolvedValue(fakeJwt("joana", "admin"));
    vi.spyOn(api, "getSequencia").mockRejectedValue(new Error("network"));

    render(<App />);

    await waitFor(() => expect(screen.getByPlaceholderText("usuario")).toBeInTheDocument());

    await act(async () => {
      await userEvent.click(screen.getByText("Entrar"));
    });

    await waitFor(() =>
      expect(screen.queryByPlaceholderText("usuario")).not.toBeInTheDocument()
    );
  });
});
