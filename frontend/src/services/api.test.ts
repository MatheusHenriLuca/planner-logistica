import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, deleteUser, getSequencia, login } from "./api";

describe("api service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("login posts form-encoded credentials and returns the access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "abc123", token_type: "bearer" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await login("joana", "s3cret");

    expect(token).toBe("abc123");
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(String(requestInit.body)).toContain("username=joana");
  });

  it("getSequencia sends the bearer token and query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ linha: "L1", turno: 1, patan: "A", itens: [] }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSequencia("token123", { linha: "L1", turno: 1, patan: "A" });

    expect(result.linha).toBe("L1");
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/producao/sequencia?linha=L1&turno=1&patan=A");
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer token123"
    );
  });

  it("throws ApiError with the backend detail message on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Usuario ou senha invalidos." }), { status: 401 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(login("joana", "wrong")).rejects.toThrow(ApiError);
  });

  it("deleteUser throws ApiError with the response status on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteUser("token123", 7)).rejects.toThrow(ApiError);
    await expect(deleteUser("token123", 7)).rejects.toMatchObject({ status: 403 });
  });
});
