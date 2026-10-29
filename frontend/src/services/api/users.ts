import { API_BASE_URL, ApiError, authHeaders, parseJsonOrThrow } from "./core";

export interface UserOut {
  id: number;
  username: string;
  role: string;
}

export async function listUsers(token: string): Promise<UserOut[]> {
  const response = await fetch(`${API_BASE_URL}/users`, { headers: authHeaders(token) });
  return parseJsonOrThrow<UserOut[]>(response);
}

export async function updateUserRole(
  token: string,
  userId: number,
  role: string
): Promise<UserOut> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ role }),
  });
  return parseJsonOrThrow<UserOut>(response);
}

export async function deleteUser(token: string, userId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new ApiError(response.status, "Falha ao remover usuario.");
  }
}

export async function resetarSenhaUsuario(
  token: string,
  userId: number,
  novaSenha: string
): Promise<{ mensagem: string }> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ nova_senha: novaSenha }),
  });
  return parseJsonOrThrow<{ mensagem: string }>(response);
}

export async function resetarSenhasEmMassa(
  token: string,
  novaSenhaPadrao: string
): Promise<{ mensagem: string; afetados?: number }> {
  const response = await fetch(`${API_BASE_URL}/users/reset-senhas-em-massa`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ nova_senha_padrao: novaSenhaPadrao }),
  });
  return parseJsonOrThrow<{ mensagem: string; afetados?: number }>(response);
}
