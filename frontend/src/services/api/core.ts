export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== "undefined" && window.location?.hostname
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000");

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    let message = "Erro na requisição";
    if (typeof body.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body.detail)) {
      message = body.detail
        .map((e: unknown) => {
          if (typeof e === "string") return e;
          if (e && typeof e === "object" && "msg" in e) {
            const loc = "loc" in e && Array.isArray((e as { loc: unknown[] }).loc)
              ? (e as { loc: unknown[] }).loc.join(".")
              : "";
            return loc ? `${loc}: ${(e as { msg: string }).msg}` : (e as { msg: string }).msg;
          }
          return JSON.stringify(e);
        })
        .join("; ");
    } else if (body.message && typeof body.message === "string") {
      message = body.message;
    } else if (response.statusText) {
      message = response.statusText;
    }
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}
