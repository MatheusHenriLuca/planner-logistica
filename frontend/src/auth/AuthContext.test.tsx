import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../services/api";
import { AuthProvider, useAuth } from "./AuthContext";

function LoginProbe() {
  const { token, role, username, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="token">{token ?? "no-token"}</span>
      <span data-testid="role">{role ?? "no-role"}</span>
      <span data-testid="username">{username ?? "no-username"}</span>
      <button onClick={() => login("joana", "s3cret")}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function fakeJwt(sub: string, role: string, exp = 9999999999): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const payload = btoa(JSON.stringify({ sub, role, exp }));
  return `${header}.${payload}.signature`;
}

describe("AuthContext", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("login stores the decoded role and username", async () => {
    vi.spyOn(api, "login").mockResolvedValue(fakeJwt("joana", "admin"));
    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>
    );

    await act(async () => {
      await userEvent.click(screen.getByText("login"));
    });

    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("admin"));
    expect(screen.getByTestId("username").textContent).toBe("joana");
  });

  it("logout clears the stored token", async () => {
    vi.spyOn(api, "login").mockResolvedValue(fakeJwt("joana", "admin"));
    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>
    );

    await act(async () => {
      await userEvent.click(screen.getByText("login"));
    });
    await act(async () => {
      await userEvent.click(screen.getByText("logout"));
    });

    expect(screen.getByTestId("token").textContent).toBe("no-token");
    expect(localStorage.getItem("planner_logistica_token")).toBeNull();
  });

  it("falls back to logged-out state when the stored token is corrupt", () => {
    localStorage.setItem("planner_logistica_token", "not-a-jwt");

    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("token").textContent).toBe("no-token");
    expect(screen.getByTestId("role").textContent).toBe("no-role");
    expect(screen.getByTestId("username").textContent).toBe("no-username");
  });

  it("falls back to logged-out state when the stored token is expired", () => {
    localStorage.setItem("planner_logistica_token", fakeJwt("joana", "admin", 1));

    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("token").textContent).toBe("no-token");
    expect(screen.getByTestId("role").textContent).toBe("no-role");
    expect(screen.getByTestId("username").textContent).toBe("no-username");
    expect(localStorage.getItem("planner_logistica_token")).toBeNull();
  });
});
