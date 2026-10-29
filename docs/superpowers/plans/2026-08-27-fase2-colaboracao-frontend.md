### Task 10: Tailwind CSS setup

**Files:**
- Create: `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/src/index.css`
- Modify: `frontend/package.json`, `frontend/src/main.tsx`

**Depends-on:** none

**Interfaces:**
- Consumes: none.
- Produces: the Tailwind processing pipeline (`src/index.css` → `postcss.config.js` → `tailwind.config.js` → Vite's PostCSS integration); 4 custom color tokens in `tailwind.config.js`'s `theme.extend.colors` — `status-normal`, `status-critico`, `status-excluido`, `status-travado` — usable by any later task as `bg-status-*` / `text-status-*` / `border-status-*` utility classes (with optional `/<opacity>` suffix, e.g. `bg-status-critico/10`). Consumed directly by Task 16 (status-linked card coloring); consumed implicitly (generic Tailwind utilities, not the custom tokens) by Tasks 12-15 and 17.

Registry check performed before pinning versions: `npm view tailwindcss@3 version` → latest 3.x is `3.4.19` (Tailwind v4, the overall latest tag, changes the config format entirely — no `tailwind.config.js` by default, `@import "tailwindcss"` instead of the 3 `@tailwind` directives, `@tailwindcss/postcss` instead of `tailwindcss` as the PostCSS plugin name, autoprefixer folded in — which would break the exact file layout this task requires; v3 is the correct major for this setup). `npm view postcss version` → `8.5.26`. `npm view autoprefixer version` → `10.5.4`.

- [ ] **Step 1: Add the three devDependencies and install**
  Edit `frontend/package.json`'s `devDependencies` block to (alphabetical, matching the existing ordering):
  ```json
  "devDependencies": {
    "@eslint/js": "^9.8.0",
    "@testing-library/dom": "^10.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.5.4",
    "eslint": "^9.8.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.4.9",
    "jsdom": "^24.1.0",
    "postcss": "^8.5.26",
    "tailwindcss": "^3.4.19",
    "typescript": "^5.5.0",
    "typescript-eslint": "^8.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
  ```
  Then install:
  ```bash
  cd frontend && npm install
  ```

- [ ] **Step 2: Create `tailwind.config.js`**
  Repo's `package.json` has `"type": "module"`, so this must be an ES module (matches `vite.config.ts`'s `export default`), not `module.exports`:
  ```js
  /** @type {import('tailwindcss').Config} */
  export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
      extend: {
        colors: {
          "status-normal": "#64748b",
          "status-critico": "#ef4444",
          "status-excluido": "#9ca3af",
          "status-travado": "#3b82f6",
        },
      },
    },
    plugins: [],
  };
  ```

- [ ] **Step 3: Create `postcss.config.js`**
  ```js
  export default {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  };
  ```

- [ ] **Step 4: Create `src/index.css`**
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  ```

- [ ] **Step 5: Import the stylesheet in `main.tsx`**
  Replace the full contents of `frontend/src/main.tsx` with:
  ```tsx
  import React from "react";
  import ReactDOM from "react-dom/client";

  import "./index.css";
  import App from "./App";

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  ```

- [ ] **Step 6: Verify types/lint and that Tailwind is actually processing (not just present in package.json)**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/main.tsx
  npx vite build
  grep -q "box-sizing" dist/assets/*.css && echo "OK - tailwind preflight compiled into the bundle"
  ```
  The `box-sizing` check targets Tailwind's Preflight base-reset layer (`@tailwind base`), which is always emitted regardless of which utility classes exist in source yet — a bootstrap-safe check at this point in the plan, since no component references the 4 custom `status-*` tokens yet (that only happens starting Task 16, whose own verify step re-checks the build specifically for those). Optionally, `npm run dev` and inspect any element's computed style in devtools for a second manual confirmation.

- [ ] **Step 7: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run
  ```

- [ ] **Step 8: Commit**
  ```bash
  cd frontend
  git add package.json package-lock.json tailwind.config.js postcss.config.js src/index.css src/main.tsx
  git commit -m "$(cat <<'EOF'
  feat: add tailwind css with status-linked color tokens
  EOF
  )"
  ```

---

### Task 11: API client functions + types for the 4 collaboration features

**Files:**
- Create: `frontend/src/types/colaboracao.ts`
- Modify: `frontend/src/services/api.ts`

**Depends-on:** none

**Interfaces:**
- Consumes: none from earlier tasks; reuses the existing `authHeaders`, `parseJsonOrThrow`, `ApiError`, `API_BASE_URL` already defined in `frontend/src/services/api.ts`.
- Produces (all in `frontend/src/types/colaboracao.ts` unless noted):
  - `ChecklistItemOut { id: number; item_producao_id: number; texto: string; concluido: boolean; ordem: number }`
  - `LabelOut { id: number; nome: string; cor: string }`
  - `ComentarioOut { id: number; texto: string; autor_id: number; autor_username: string; criado_em: string }`
  - `AnexoOut { id: number; titulo: string; url: string; enviado_por: number; enviado_por_username: string; criado_em: string }`
  - `CriarChecklistItemRequest { texto: string; ordem: number }`
  - `AtualizarChecklistItemRequest { texto?: string; concluido?: boolean }`
  - `SubstituirLabelsRequest { label_ids: number[] }`
  - `CriarComentarioRequest { texto: string }`
  - `CriarAnexoRequest { titulo: string; url: string }`
  - In `frontend/src/services/api.ts`: `listarChecklist(token: string, itemId: number): Promise<ChecklistItemOut[]>`, `criarChecklistItem(token: string, itemId: number, payload: CriarChecklistItemRequest): Promise<ChecklistItemOut>`, `atualizarChecklistItem(token: string, itemId: number, checklistItemId: number, payload: AtualizarChecklistItemRequest): Promise<ChecklistItemOut>`, `removerChecklistItem(token: string, itemId: number, checklistItemId: number): Promise<void>`, `listarCatalogoLabels(token: string): Promise<LabelOut[]>`, `listarLabelsDoItem(token: string, itemId: number): Promise<LabelOut[]>`, `substituirLabelsDoItem(token: string, itemId: number, labelIds: number[]): Promise<LabelOut[]>`, `listarComentarios(token: string, itemId: number): Promise<ComentarioOut[]>`, `criarComentario(token: string, itemId: number, payload: CriarComentarioRequest): Promise<ComentarioOut>`, `listarAnexos(token: string, itemId: number): Promise<AnexoOut[]>`, `criarAnexo(token: string, itemId: number, payload: CriarAnexoRequest): Promise<AnexoOut>`, `removerAnexo(token: string, itemId: number, anexoId: number): Promise<void>`.
  - Consumed by Task 16 (`listarChecklist`, `listarLabelsDoItem`, `listarComentarios`, `listarAnexos` + the 4 `*Out` types) and Task 17 (all 12 functions + all types).

Note on `ChecklistItemOut`: the backend's actual Pydantic schema (`docs/superpowers/plans/2026-08-27-fase2-colaboracao-backend.md` Task 2) returns `item_producao_id` in addition to `id`/`texto`/`concluido`/`ordem`. Included here for type accuracy even though no frontend call site needs to read it (the item id is already known from the parent `ItemProducao` in every call site).

- [ ] **Step 1: Create `frontend/src/types/colaboracao.ts`**
  ```ts
  export interface ChecklistItemOut {
    id: number;
    item_producao_id: number;
    texto: string;
    concluido: boolean;
    ordem: number;
  }

  export interface LabelOut {
    id: number;
    nome: string;
    cor: string;
  }

  export interface ComentarioOut {
    id: number;
    texto: string;
    autor_id: number;
    autor_username: string;
    criado_em: string;
  }

  export interface AnexoOut {
    id: number;
    titulo: string;
    url: string;
    enviado_por: number;
    enviado_por_username: string;
    criado_em: string;
  }

  export interface CriarChecklistItemRequest {
    texto: string;
    ordem: number;
  }

  export interface AtualizarChecklistItemRequest {
    texto?: string;
    concluido?: boolean;
  }

  export interface SubstituirLabelsRequest {
    label_ids: number[];
  }

  export interface CriarComentarioRequest {
    texto: string;
  }

  export interface CriarAnexoRequest {
    titulo: string;
    url: string;
  }
  ```

- [ ] **Step 2: Extend the import at the top of `frontend/src/services/api.ts`**
  Replace:
  ```ts
  import type { BulkSubmitRequest, ItemProducao, SequenciaResponse } from "../types/producao";
  ```
  With:
  ```ts
  import type {
    AnexoOut,
    AtualizarChecklistItemRequest,
    ChecklistItemOut,
    ComentarioOut,
    CriarAnexoRequest,
    CriarChecklistItemRequest,
    CriarComentarioRequest,
    LabelOut,
  } from "../types/colaboracao";
  import type { BulkSubmitRequest, ItemProducao, SequenciaResponse } from "../types/producao";
  ```

- [ ] **Step 3: Append the 12 client functions at the end of `frontend/src/services/api.ts`**
  (after the existing `registerUser` function, following the exact same `authHeaders`/`parseJsonOrThrow`/`ApiError` pattern used by every function already in the file):
  ```ts
  export async function listarChecklist(token: string, itemId: number): Promise<ChecklistItemOut[]> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/checklist`, {
      headers: authHeaders(token),
    });
    return parseJsonOrThrow<ChecklistItemOut[]>(response);
  }

  export async function criarChecklistItem(
    token: string,
    itemId: number,
    payload: CriarChecklistItemRequest
  ): Promise<ChecklistItemOut> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow<ChecklistItemOut>(response);
  }

  export async function atualizarChecklistItem(
    token: string,
    itemId: number,
    checklistItemId: number,
    payload: AtualizarChecklistItemRequest
  ): Promise<ChecklistItemOut> {
    const response = await fetch(
      `${API_BASE_URL}/producao/itens/${itemId}/checklist/${checklistItemId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify(payload),
      }
    );
    return parseJsonOrThrow<ChecklistItemOut>(response);
  }

  export async function removerChecklistItem(
    token: string,
    itemId: number,
    checklistItemId: number
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/producao/itens/${itemId}/checklist/${checklistItemId}`,
      { method: "DELETE", headers: authHeaders(token) }
    );
    if (!response.ok) {
      throw new ApiError(response.status, "Falha ao remover item do checklist.");
    }
  }

  export async function listarCatalogoLabels(token: string): Promise<LabelOut[]> {
    const response = await fetch(`${API_BASE_URL}/labels`, { headers: authHeaders(token) });
    return parseJsonOrThrow<LabelOut[]>(response);
  }

  export async function listarLabelsDoItem(token: string, itemId: number): Promise<LabelOut[]> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/labels`, {
      headers: authHeaders(token),
    });
    return parseJsonOrThrow<LabelOut[]>(response);
  }

  export async function substituirLabelsDoItem(
    token: string,
    itemId: number,
    labelIds: number[]
  ): Promise<LabelOut[]> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/labels`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ label_ids: labelIds }),
    });
    return parseJsonOrThrow<LabelOut[]>(response);
  }

  export async function listarComentarios(token: string, itemId: number): Promise<ComentarioOut[]> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/comentarios`, {
      headers: authHeaders(token),
    });
    return parseJsonOrThrow<ComentarioOut[]>(response);
  }

  export async function criarComentario(
    token: string,
    itemId: number,
    payload: CriarComentarioRequest
  ): Promise<ComentarioOut> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/comentarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow<ComentarioOut>(response);
  }

  export async function listarAnexos(token: string, itemId: number): Promise<AnexoOut[]> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/anexos`, {
      headers: authHeaders(token),
    });
    return parseJsonOrThrow<AnexoOut[]>(response);
  }

  export async function criarAnexo(
    token: string,
    itemId: number,
    payload: CriarAnexoRequest
  ): Promise<AnexoOut> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/anexos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow<AnexoOut>(response);
  }

  export async function removerAnexo(token: string, itemId: number, anexoId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/anexos/${anexoId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    if (!response.ok) {
      throw new ApiError(response.status, "Falha ao remover anexo.");
    }
  }
  ```

- [ ] **Step 4: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/services/api.ts src/types/colaboracao.ts
  ```

- [ ] **Step 5: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run src/services/api.test.ts
  ```

- [ ] **Step 6: Commit**
  ```bash
  cd frontend
  git add src/types/colaboracao.ts src/services/api.ts
  git commit -m "$(cat <<'EOF'
  feat: add colaboracao api client (checklist, labels, comentarios, anexos)
  EOF
  )"
  ```

---

### Task 12: Nav/shell visual redesign

**Files:**
- Modify: `frontend/src/routes/Nav.tsx`

**Depends-on:** 10

**Interfaces:**
- Consumes: none (pure visual restyle; Tailwind's utility-class pipeline from Task 10, no imported symbols beyond what the file already imports).
- Produces: none (the component's export signature, `PROGRAMACAO_ROLES`/`USUARIOS_ROLES` exports, and all conditional logic are unchanged).

The current file is small — token-gated links plus a logout button, no styling at all today. The restyle below only adds `className` props and wrapper `<div>`s; the `if (!token) return null` guard, the `PROGRAMACAO_ROLES`/`USUARIOS_ROLES` arrays, the role-gating conditionals, and every visible text string (`"Producao"`, `"Programacao"`, `"Usuarios"`, `"Sair"`) stay byte-identical, since `Nav.test.tsx` asserts on that exact text.

- [ ] **Step 1: Replace the full contents of `frontend/src/routes/Nav.tsx`**
  ```tsx
  import { Link } from "react-router-dom";

  import { useAuth, type Role } from "../auth/AuthContext";

  export const PROGRAMACAO_ROLES: Role[] = ["admin", "programador"];
  export const USUARIOS_ROLES: Role[] = ["admin"];

  export function Nav() {
    const { token, role, logout } = useAuth();

    if (!token) return null;

    return (
      <nav className="flex items-center justify-between gap-4 bg-slate-900 px-6 py-3 text-slate-100 shadow-md">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold tracking-tight text-white">plannerLogistica</span>
          <div className="flex items-center gap-4 text-sm">
            <Link
              to="/"
              className="rounded px-2 py-1 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
            >
              Producao
            </Link>
            {role && PROGRAMACAO_ROLES.includes(role) && (
              <Link
                to="/programacao"
                className="rounded px-2 py-1 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Programacao
              </Link>
            )}
            {role && USUARIOS_ROLES.includes(role) && (
              <Link
                to="/usuarios"
                className="rounded px-2 py-1 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Usuarios
              </Link>
            )}
          </div>
        </div>
        <button
          onClick={logout}
          className="rounded border border-red-400/40 px-3 py-1 text-sm font-medium text-red-300 transition-colors hover:bg-red-400/10 hover:text-red-200"
        >
          Sair
        </button>
      </nav>
    );
  }
  ```

- [ ] **Step 2: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/routes/Nav.tsx
  ```

- [ ] **Step 3: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run src/routes/Nav.test.tsx
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd frontend
  git add src/routes/Nav.tsx
  git commit -m "$(cat <<'EOF'
  feat: redesign nav bar with tailwind
  EOF
  )"
  ```

---

### Task 13: Login/Register visual redesign

**Files:**
- Modify: `frontend/src/routes/AppRouter.tsx`

**Depends-on:** 10

**Interfaces:**
- Consumes: none (pure visual restyle; Tailwind's utility-class pipeline from Task 10).
- Produces: none (submit handlers, `useAuth()` calls, the `if (token) return <Navigate .../>` guards, and the `registerUser(null, { username, password, role: "admin" })` call are unchanged; `AppRouter`'s route table is unchanged).

`LoginPage` and `RegisterPage` are both plain unstyled `<form>` elements today. Restyled below into centered card-style auth forms — page wrapper centers content, form has padding/shadow/rounded corners/max-width, inputs share consistent border/padding/focus styles, the primary button is styled solid, the error `<p role="alert">` becomes a visible red banner, and the secondary link is styled as normal link text. Deliberately no page heading was added inside either form: `App.test.tsx` calls `screen.getByText("Entrar")`, which throws on multiple matches — a heading reading "Entrar" next to a button reading "Entrar" would break that assertion (the same risk applies symmetrically to `RegisterPage`'s "Criar administrador" button), so both forms stay heading-less. Every other string (placeholders `"usuario"`/`"senha"`, button labels, the exact error text `"Usuario ou senha invalidos."`, the link copy) is unchanged.

- [ ] **Step 1: Replace the full contents of `frontend/src/routes/AppRouter.tsx`**
  ```tsx
  import { useState } from "react";
  import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";

  import { useAuth } from "../auth/AuthContext";
  import { GerenciamentoUsuarios } from "../pages/GerenciamentoUsuarios";
  import { Producao } from "../pages/Producao";
  import { ProgramacaoPatan } from "../pages/ProgramacaoPatan";
  import { ApiError, registerUser } from "../services/api";
  import { Nav, PROGRAMACAO_ROLES, USUARIOS_ROLES } from "./Nav";
  import { RequireRole } from "./RequireRole";

  const AUTH_INPUT_CLASSES =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300";

  function LoginPage() {
    const { login, token } = useAuth();
    const [erro, setErro] = useState<string | null>(null);

    if (token) return <Navigate to="/" replace />;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <form
          className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await login(String(form.get("username")), String(form.get("password")));
            } catch {
              setErro("Usuario ou senha invalidos.");
            }
          }}
        >
          <div className="flex flex-col gap-3">
            <input name="username" placeholder="usuario" className={AUTH_INPUT_CLASSES} />
            <input
              name="password"
              type="password"
              placeholder="senha"
              className={AUTH_INPUT_CLASSES}
            />
            <button
              type="submit"
              className="mt-2 rounded-md bg-slate-900 px-4 py-2 font-medium text-white transition-colors hover:bg-slate-700"
            >
              Entrar
            </button>
          </div>
          {erro && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </p>
          )}
          <p className="mt-6 text-sm text-slate-600">
            Primeiro acesso?{" "}
            <Link to="/register" className="font-medium text-slate-900 underline">
              Criar administrador
            </Link>
          </p>
        </form>
      </div>
    );
  }

  function RegisterPage() {
    const { login, token } = useAuth();
    const [erro, setErro] = useState<string | null>(null);

    if (token) return <Navigate to="/" replace />;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <form
          className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const username = String(form.get("username"));
            const password = String(form.get("password"));
            try {
              await registerUser(null, { username, password, role: "admin" });
              await login(username, password);
            } catch (err) {
              setErro(
                err instanceof ApiError
                  ? err.message
                  : "Falha ao criar administrador."
              );
            }
          }}
        >
          <div className="flex flex-col gap-3">
            <input name="username" placeholder="usuario" className={AUTH_INPUT_CLASSES} />
            <input
              name="password"
              type="password"
              placeholder="senha"
              className={AUTH_INPUT_CLASSES}
            />
            <button
              type="submit"
              className="mt-2 rounded-md bg-slate-900 px-4 py-2 font-medium text-white transition-colors hover:bg-slate-700"
            >
              Criar administrador
            </button>
          </div>
          {erro && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </p>
          )}
          <p className="mt-6 text-sm text-slate-600">
            Ja tem conta?{" "}
            <Link to="/login" className="font-medium text-slate-900 underline">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    );
  }

  export function AppRouter() {
    return (
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/usuarios"
            element={
              <RequireRole allowed={USUARIOS_ROLES}>
                <GerenciamentoUsuarios />
              </RequireRole>
            }
          />
          <Route
            path="/programacao"
            element={
              <RequireRole allowed={PROGRAMACAO_ROLES}>
                <ProgramacaoPatan />
              </RequireRole>
            }
          />
          <Route
            path="/"
            element={
              <RequireRole allowed={["admin", "programador", "usuario_comum"]}>
                <Producao />
              </RequireRole>
            }
          />
        </Routes>
      </BrowserRouter>
    );
  }
  ```

- [ ] **Step 2: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/routes/AppRouter.tsx
  ```

- [ ] **Step 3: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run src/App.test.tsx
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd frontend
  git add src/routes/AppRouter.tsx
  git commit -m "$(cat <<'EOF'
  feat: redesign login/register forms with tailwind
  EOF
  )"
  ```

---

### Task 14: GerenciamentoUsuarios visual redesign

**Files:**
- Modify: `frontend/src/pages/GerenciamentoUsuarios.tsx`

**Depends-on:** 10

**Interfaces:**
- Consumes: none (pure visual restyle; Tailwind's utility-class pipeline from Task 10).
- Produces: none (`handleCriar`/`handleAlterarRole`/`handleRemover`/`tratarErro`/`carregar` and the fetch-on-mount `useEffect` are unchanged).

The current file is a plain `<table>` plus a "novo usuario" form below it, no styling. Restyled below: table with zebra-striped rows, styled role `<select>` and "Remover" button, the "Novo usuario" section visually separated into a bordered card. DOM order is preserved exactly (table rows first, "novo usuario" section after) — `GerenciamentoUsuarios.test.tsx` picks the row's role `<select>` via `screen.getAllByRole("combobox")[0]`, which only holds if the table's select still precedes the "novo usuario" select in document order.

- [ ] **Step 1: Replace the full contents of `frontend/src/pages/GerenciamentoUsuarios.tsx`**
  ```tsx
  import { useEffect, useState } from "react";

  import { useAuth } from "../auth/AuthContext";
  import {
    ApiError,
    deleteUser,
    listUsers,
    registerUser,
    updateUserRole,
    type UserOut,
  } from "../services/api";

  const ROLES = ["admin", "programador", "usuario_comum"] as const;

  const SELECT_CLASSES =
    "rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300";
  const INPUT_CLASSES =
    "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300";

  export function GerenciamentoUsuarios() {
    const { token, logout } = useAuth();
    const [users, setUsers] = useState<UserOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [novoUsername, setNovoUsername] = useState("");
    const [novaSenha, setNovaSenha] = useState("");
    const [novoRole, setNovoRole] = useState<(typeof ROLES)[number]>("usuario_comum");

    // Sessao expirada (401): desloga em vez de mostrar um erro generico -
    // RequireRole redireciona para /login assim que o token cai.
    function tratarErro(err: unknown, mensagem: string) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setErro(mensagem);
    }

    async function carregar() {
      if (!token) return;
      setLoading(true);
      try {
        setUsers(await listUsers(token));
        setErro(null);
      } catch (err) {
        tratarErro(err, "Falha ao carregar usuarios.");
      } finally {
        setLoading(false);
      }
    }

    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount: carregar's setLoading(true) is synchronous, but deps is [token] only (none of the states carregar sets), so there's no loop or stale-closure risk; same suppression pattern as exhaustive-deps below.
      carregar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    async function handleCriar() {
      if (!token) return;
      try {
        await registerUser(token, { username: novoUsername, password: novaSenha, role: novoRole });
        setNovoUsername("");
        setNovaSenha("");
        await carregar();
      } catch (err) {
        tratarErro(err, "Falha ao criar usuario.");
      }
    }

    async function handleAlterarRole(userId: number, role: string) {
      if (!token) return;
      try {
        await updateUserRole(token, userId, role);
        await carregar();
      } catch (err) {
        tratarErro(err, "Falha ao atualizar usuario.");
      }
    }

    async function handleRemover(userId: number) {
      if (!token) return;
      try {
        await deleteUser(token, userId);
        await carregar();
      } catch (err) {
        tratarErro(err, "Falha ao remover usuario.");
      }
    }

    if (loading) return <p className="p-6 text-slate-600">Carregando usuarios...</p>;

    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Gerenciamento de Usuarios</h1>
        {erro && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        )}

        <table className="w-full table-auto border-collapse overflow-hidden rounded-lg shadow-sm">
          <tbody>
            {users.map((user, index) => (
              <tr key={user.id} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className="px-4 py-2 text-sm text-slate-900">{user.username}</td>
                <td className="px-4 py-2">
                  <select
                    value={user.role}
                    onChange={(event) => handleAlterarRole(user.id, event.target.value)}
                    className={SELECT_CLASSES}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleRemover(user.id)}
                    className="rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 rounded-lg border border-slate-200 p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Novo usuario</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              placeholder="usuario"
              value={novoUsername}
              onChange={(event) => setNovoUsername(event.target.value)}
              className={INPUT_CLASSES}
            />
            <input
              placeholder="senha"
              type="password"
              value={novaSenha}
              onChange={(event) => setNovaSenha(event.target.value)}
              className={INPUT_CLASSES}
            />
            <select
              value={novoRole}
              onChange={(event) => setNovoRole(event.target.value as (typeof ROLES)[number])}
              className={SELECT_CLASSES}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              onClick={handleCriar}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              Criar usuario
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/pages/GerenciamentoUsuarios.tsx
  ```

- [ ] **Step 3: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run src/pages/GerenciamentoUsuarios.test.tsx
  ```

- [ ] **Step 4: Commit**
  ```bash
  cd frontend
  git add src/pages/GerenciamentoUsuarios.tsx
  git commit -m "$(cat <<'EOF'
  feat: redesign gerenciamento de usuarios with tailwind
  EOF
  )"
  ```

---

### Task 15: Producao/ProgramacaoPatan pages — visual redesign + staging checklist preview

**Files:**
- Modify: `frontend/src/pages/Producao.tsx`, `frontend/src/pages/ProgramacaoPatan.tsx`

**Depends-on:** 10

**Interfaces:**
- Consumes: none (pure visual restyle + one static string; Tailwind's utility-class pipeline from Task 10).
- Produces: none (data-fetching logic, the `CARREGAR` dispatch/`useEffect`, `staleTime`/`refetchOnWindowFocus` query options, and 401-handling are unchanged in both files).

Restyled: page container/heading, loading state as a small spinner instead of raw text, error state as a styled alert banner instead of a raw `<p>`, consistent spacing around `<SequenciaBoard>`. Both files keep every string the existing tests assert on (`"Carregando producao..."`, `"Erro ao carregar a producao."`, `"Carregando sequencia..."`, `"Erro ao carregar a sequencia."`, `"Enviar lote"`/`"Enviando..."`, `"Falha ao enviar o lote. Nada foi salvo."`) — adding a `role="alert"`/wrapper markup around a text node does not change what `getByText` matches.

**Deviation from the brief, flagged explicitly:** the brief describes the "5 passos padrao serao criados" marker as appearing "on each staging card." In the actual codebase neither `Producao.tsx` nor `ProgramacaoPatan.tsx` renders individual item cards — that happens inside `SequenciaCard.tsx`, which belongs exclusively to Tasks 16/17 under the parallel-wave file-disjointness rule (this task's `Files:` is `Producao.tsx`/`ProgramacaoPatan.tsx` only, with `Depends-on: 10`, so it runs in the same wave as Task 16 — touching `SequenciaCard.tsx` here would silently create a same-file collision with no declared dependency edge). Since every card would show the exact same unconditional text, a single page-level note carries identical information with less repetition. Resolution: render the note once, as a small pill above `<SequenciaBoard>`, in `ProgramacaoPatan.tsx` only (not `Producao.tsx` — the design spec scopes this preview to the Programação/staging screen specifically, since `Producao.tsx` shows already-persisted items, not pre-submit ones). Exact text is unchanged (`"5 passos padrao serao criados"`).

- [ ] **Step 1: Replace the full contents of `frontend/src/pages/Producao.tsx`**
  ```tsx
  import { useQuery } from "@tanstack/react-query";
  import { useEffect, useReducer, useState } from "react";

  import { useAuth } from "../auth/AuthContext";
  import { SequenciaBoard } from "../components/SequenciaBoard/SequenciaBoard";
  import { ApiError, getSequencia } from "../services/api";
  import { initialSequenciaState, sequenciaReducer } from "../state/sequenciaReducer";
  import type { Patan } from "../types/producao";

  const FIELD_LABEL_CLASSES = "flex flex-col gap-1 text-sm font-medium text-slate-700";
  const FIELD_INPUT_CLASSES =
    "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300";

  export function Producao() {
    const { token, role, logout } = useAuth();
    const [linha, setLinha] = useState("L1");
    const [turno, setTurno] = useState(1);
    const [patan, setPatan] = useState<Patan>("A");
    const [state, dispatch] = useReducer(sequenciaReducer, initialSequenciaState);

    const { data, isLoading, isError, error } = useQuery({
      queryKey: ["sequencia-producao", linha, turno, patan],
      queryFn: async () => {
        if (!token) throw new Error("Nao autenticado.");
        return getSequencia(token, { linha, turno, patan });
      },
      enabled: Boolean(token),
      retry: false,
      // Ver ProgramacaoPatan.tsx: refetch em segundo plano nao pode
      // sobrescrever silenciosamente o estado local.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    });

    useEffect(() => {
      if (!data) return;
      dispatch({
        type: "CARREGAR",
        payload: { turno, dataBase: new Date().toISOString(), itens: data.itens },
      });
    }, [data, turno]);

    useEffect(() => {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      }
    }, [error, logout]);

    if (isLoading) {
      return (
        <div className="flex items-center gap-3 p-6 text-slate-600">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          <p>Carregando producao...</p>
        </div>
      );
    }
    if (isError) {
      return (
        <p role="alert" className="m-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Erro ao carregar a producao.
        </p>
      );
    }

    const somenteLeitura = role === "usuario_comum";

    return (
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Producao</h1>
        <div className="mb-6 flex flex-wrap gap-4">
          <label className={FIELD_LABEL_CLASSES}>
            Linha
            <input
              value={linha}
              onChange={(event) => setLinha(event.target.value)}
              className={FIELD_INPUT_CLASSES}
            />
          </label>
          <label className={FIELD_LABEL_CLASSES}>
            Turno
            <select
              value={turno}
              onChange={(event) => setTurno(Number(event.target.value))}
              className={FIELD_INPUT_CLASSES}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className={FIELD_LABEL_CLASSES}>
            Patan
            <select
              value={patan}
              onChange={(event) => setPatan(event.target.value as Patan)}
              className={FIELD_INPUT_CLASSES}
            >
              {["A", "B", "C", "D", "E", "F", "G", "H"].map((letra) => (
                <option key={letra} value={letra}>
                  {letra}
                </option>
              ))}
            </select>
          </label>
        </div>

        <SequenciaBoard
          itensPorPosto={state.itensPorPosto}
          onReordenar={(posto, itens) => dispatch({ type: "REORDENAR", payload: { posto, itens } })}
          somenteLeitura={somenteLeitura}
        />
      </div>
    );
  }
  ```

- [ ] **Step 2: Replace the full contents of `frontend/src/pages/ProgramacaoPatan.tsx`**
  ```tsx
  import { useQuery } from "@tanstack/react-query";
  import { useEffect, useReducer, useState } from "react";

  import { useAuth } from "../auth/AuthContext";
  import { SequenciaBoard } from "../components/SequenciaBoard/SequenciaBoard";
  import { ApiError, getSequencia, submitBulkSequencia } from "../services/api";
  import { initialSequenciaState, sequenciaReducer } from "../state/sequenciaReducer";
  import type { BulkSubmitRequest, Patan } from "../types/producao";

  const FIELD_LABEL_CLASSES = "flex flex-col gap-1 text-sm font-medium text-slate-700";
  const FIELD_INPUT_CLASSES =
    "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300";

  export function ProgramacaoPatan() {
    const { token, logout } = useAuth();
    const [linha, setLinha] = useState("L1");
    const [turno, setTurno] = useState(1);
    const [patan, setPatan] = useState<Patan>("A");
    const [state, dispatch] = useReducer(sequenciaReducer, initialSequenciaState);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const { data, isLoading, isError, error } = useQuery({
      queryKey: ["sequencia", linha, turno, patan],
      queryFn: async () => {
        if (!token) throw new Error("Nao autenticado.");
        return getSequencia(token, { linha, turno, patan });
      },
      enabled: Boolean(token),
      retry: false,
      // Sequenciamento e editado em memoria pelo operador; um refetch em
      // segundo plano (foco de janela, reconexao) nao pode sobrescrever
      // silenciosamente uma reordenacao ainda nao enviada.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    });

    // So carrega no reducer quando a query realmente traz um dado novo
    // (troca de linha/turno/patan), nao a cada re-render.
    useEffect(() => {
      if (!data) return;
      dispatch({
        type: "CARREGAR",
        payload: { turno, dataBase: new Date().toISOString(), itens: data.itens },
      });
    }, [data, turno]);

    useEffect(() => {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      }
    }, [error, logout]);

    async function handleEnviar() {
      if (!token) return;
      setEnviando(true);
      setErro(null);
      try {
        const itens = Object.values(state.itensPorPosto).flat();
        const payload: BulkSubmitRequest = { linha, turno, patan, itens };
        await submitBulkSequencia(token, payload);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logout();
        } else {
          setErro("Falha ao enviar o lote. Nada foi salvo.");
        }
      } finally {
        setEnviando(false);
      }
    }

    if (isLoading) {
      return (
        <div className="flex items-center gap-3 p-6 text-slate-600">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          <p>Carregando sequencia...</p>
        </div>
      );
    }
    if (isError) {
      return (
        <p role="alert" className="m-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Erro ao carregar a sequencia.
        </p>
      );
    }

    return (
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Programacao de Patan</h1>
        <div className="mb-6 flex flex-wrap gap-4">
          <label className={FIELD_LABEL_CLASSES}>
            Linha
            <input
              value={linha}
              onChange={(event) => setLinha(event.target.value)}
              className={FIELD_INPUT_CLASSES}
            />
          </label>
          <label className={FIELD_LABEL_CLASSES}>
            Turno
            <select
              value={turno}
              onChange={(event) => setTurno(Number(event.target.value))}
              className={FIELD_INPUT_CLASSES}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className={FIELD_LABEL_CLASSES}>
            Patan
            <select
              value={patan}
              onChange={(event) => setPatan(event.target.value as Patan)}
              className={FIELD_INPUT_CLASSES}
            >
              {["A", "B", "C", "D", "E", "F", "G", "H"].map((letra) => (
                <option key={letra} value={letra}>
                  {letra}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mb-4 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          5 passos padrao serao criados
        </p>

        <SequenciaBoard
          itensPorPosto={state.itensPorPosto}
          onReordenar={(posto, itens) => dispatch({ type: "REORDENAR", payload: { posto, itens } })}
        />

        {erro && (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </p>
        )}
        <button
          onClick={handleEnviar}
          disabled={enviando}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {enviando ? "Enviando..." : "Enviar lote"}
        </button>
      </div>
    );
  }
  ```

- [ ] **Step 3: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/pages/Producao.tsx src/pages/ProgramacaoPatan.tsx
  ```

- [ ] **Step 4: Run the existing test suite (regression check)**
  ```bash
  cd frontend && npx vitest run src/pages/Producao.test.tsx src/pages/ProgramacaoPatan.test.tsx
  ```

- [ ] **Step 5: Commit**
  ```bash
  cd frontend
  git add src/pages/Producao.tsx src/pages/ProgramacaoPatan.tsx
  git commit -m "$(cat <<'EOF'
  feat: redesign producao/programacao pages, add staging checklist preview note
  EOF
  )"
  ```

---

### Task 16: SequenciaCard/SequenciaBoard visual redesign + collaboration footer

**Files:**
- Modify: `frontend/src/components/SequenciaBoard/SequenciaBoard.tsx`, `frontend/src/components/SequenciaBoard/SequenciaCard.tsx`

**Depends-on:** 10, 11

**Interfaces:**
- Consumes: `listarChecklist(token: string, itemId: number): Promise<ChecklistItemOut[]>`, `listarLabelsDoItem(token: string, itemId: number): Promise<LabelOut[]>`, `listarComentarios(token: string, itemId: number): Promise<ComentarioOut[]>`, `listarAnexos(token: string, itemId: number): Promise<AnexoOut[]>` (Task 11, `frontend/src/services/api.ts`); `ChecklistItemOut`, `LabelOut`, `ComentarioOut`, `AnexoOut` (Task 11, `frontend/src/types/colaboracao.ts`); the `status-normal`/`status-critico`/`status-excluido`/`status-travado` Tailwind color tokens (Task 10, `tailwind.config.js`); pre-existing `useAuth` (`frontend/src/auth/AuthContext.tsx`).
- Produces: `SequenciaCard({ item }: SequenciaCardProps): JSX.Element` (same external signature as before) with an internal (non-exported) `STATUS_CARD_CLASSES` lookup and `CardFooter` helper — Task 17 further edits this same file and must preserve both. `SequenciaBoard`'s props/signature are unchanged.

Both files today implement drag-and-drop via `@dnd-kit` — none of that logic changes (`onDragEnd`, `arrayMove`, the sequence recompute, `useSortable`). Restyled: board columns get headers/background/shadow; cards get shadow/rounded corners/hover-lift, a distinct look while `isDragging` (from `useSortable`'s own return value), and a status-linked border/background color looked up from `item.status` (`PlanItemStatus` from `frontend/src/types/producao.ts`). Each card also gains a compact read-only footer — checklist progress ("x/y"), label chips (background = each label's own `cor`), a comment count, an attachment count — fetched with one `useQuery` per data kind per card (this scales fine at this board's size; no batching needed).

Tailwind class names are used as complete literal strings everywhere below (e.g. `"border-status-critico bg-status-critico/10"`), never built via string interpolation — Tailwind's content scanner only picks up classes that appear as literal substrings in scanned files, so a template-interpolated class name would silently fail to compile.

Since `SequenciaBoard.test.tsx` renders `<SequenciaBoard>` directly with no `QueryClientProvider` in the tree, and `CardFooter`'s new `useQuery` calls require one, every test in that file is expected to fail after this change (`useQuery` throws synchronously without a provider — this is not scoped to just the footer's own assertions, the whole render throws). This is expected collateral, not a task failure: test-writing/mocking for the new footer is deferred to the project's end-of-phase testing gate, per the design spec's explicit "Fora de escopo" section. Note it in your report; do not add test mocking to work around it.

- [ ] **Step 1: Replace the full contents of `frontend/src/components/SequenciaBoard/SequenciaBoard.tsx`**
  ```tsx
  import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
  import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";

  import { PlanItemStatus, type ItemProducao } from "../../types/producao";
  import { SequenciaCard } from "./SequenciaCard";

  interface SequenciaBoardProps {
    itensPorPosto: Record<string, ItemProducao[]>;
    onReordenar: (posto: string, itens: ItemProducao[]) => void;
    somenteLeitura?: boolean;
  }

  export function SequenciaBoard({
    itensPorPosto,
    onReordenar,
    somenteLeitura = false,
  }: SequenciaBoardProps) {
    return (
      <div className="sequencia-board flex flex-wrap gap-4">
        {Object.entries(itensPorPosto).map(([posto, itens]) => (
          <div
            key={posto}
            className="sequencia-board__coluna w-72 rounded-lg bg-slate-50 p-3 shadow-sm"
          >
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
              {posto}
            </h3>
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={(event: DragEndEvent) => {
                if (somenteLeitura) return;
                const { active, over } = event;
                if (!over || active.id === over.id) return;

                const ids = itens.map((entry) => String(entry.id ?? `novo-${entry.sequencia}`));
                const oldIndex = ids.indexOf(String(active.id));
                const newIndex = ids.indexOf(String(over.id));
                if (oldIndex === -1 || newIndex === -1) return;

                const reordenado = arrayMove(itens, oldIndex, newIndex).map((entry, index) => ({
                  ...entry,
                  sequencia: entry.status === PlanItemStatus.Normal ? index + 1 : entry.sequencia,
                }));
                onReordenar(posto, reordenado);
              }}
            >
              <SortableContext
                items={itens.map((entry) => String(entry.id ?? `novo-${entry.sequencia}`))}
                strategy={verticalListSortingStrategy}
              >
                {itens.map((entry) => (
                  <SequenciaCard key={entry.id ?? `novo-${entry.sequencia}`} item={entry} />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        ))}
      </div>
    );
  }
  ```

- [ ] **Step 2: Replace the full contents of `frontend/src/components/SequenciaBoard/SequenciaCard.tsx`**
  ```tsx
  import { useSortable } from "@dnd-kit/sortable";
  import { CSS } from "@dnd-kit/utilities";
  import { useQuery } from "@tanstack/react-query";

  import { useAuth } from "../../auth/AuthContext";
  import {
    listarAnexos,
    listarChecklist,
    listarComentarios,
    listarLabelsDoItem,
  } from "../../services/api";
  import { PlanItemStatus, type ItemProducao } from "../../types/producao";

  interface SequenciaCardProps {
    item: ItemProducao;
  }

  const STATUS_CARD_CLASSES: Record<PlanItemStatus, string> = {
    [PlanItemStatus.Normal]: "border-status-normal bg-white",
    [PlanItemStatus.Critico]: "border-status-critico bg-status-critico/10",
    [PlanItemStatus.Excluido]: "border-status-excluido bg-status-excluido/10 opacity-60",
    [PlanItemStatus.Locked]: "border-status-travado bg-status-travado/10",
  };

  function CardFooter({ itemId }: { itemId: number }) {
    const { token } = useAuth();

    const checklistQuery = useQuery({
      queryKey: ["item-checklist", itemId],
      queryFn: () => listarChecklist(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const labelsQuery = useQuery({
      queryKey: ["item-labels", itemId],
      queryFn: () => listarLabelsDoItem(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const comentariosQuery = useQuery({
      queryKey: ["item-comentarios", itemId],
      queryFn: () => listarComentarios(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const anexosQuery = useQuery({
      queryKey: ["item-anexos", itemId],
      queryFn: () => listarAnexos(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });

    const checklist = checklistQuery.data ?? [];
    const concluidos = checklist.filter((passo) => passo.concluido).length;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
        <span>
          {concluidos}/{checklist.length}
        </span>
        {(labelsQuery.data ?? []).map((label) => (
          <span
            key={label.id}
            className="rounded-full px-2 py-0.5 text-white"
            style={{ backgroundColor: label.cor }}
          >
            {label.nome}
          </span>
        ))}
        <span>{(comentariosQuery.data ?? []).length} comentario(s)</span>
        <span>{(anexosQuery.data ?? []).length} anexo(s)</span>
      </div>
    );
  }

  export function SequenciaCard({ item }: SequenciaCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: String(item.id ?? `novo-${item.sequencia}`),
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        data-testid="sequencia-card"
        className={[
          "sequencia-card",
          item.is_critico ? "sequencia-card--critico" : "",
          "mb-2 rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md",
          STATUS_CARD_CLASSES[item.status],
          isDragging ? "rotate-1 shadow-lg" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <strong>
          {item.linha} - {item.posto_trabalho}
        </strong>
        <div>{item.kanbans} kanban(s)</div>
        {item.hora_inicial && item.hora_final && (
          <div>
            {item.hora_inicial.slice(11, 16)} - {item.hora_final.slice(11, 16)}
          </div>
        )}
        {item.almoco_incluso && <div data-testid="almoco-label">HORARIO DE ALMOCO INCLUSO</div>}
        {item.tem_falta_estoque && <div data-testid="falta-estoque">Falta de estoque</div>}
        {item.id !== null && <CardFooter itemId={item.id} />}
      </div>
    );
  }
  ```

- [ ] **Step 3: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/components/SequenciaBoard/SequenciaBoard.tsx src/components/SequenciaBoard/SequenciaCard.tsx
  ```

- [ ] **Step 4: Verify the status-linked Tailwind tokens actually compile**
  ```bash
  cd frontend
  npx vite build
  grep -c "border-status-critico" dist/assets/*.css
  ```
  Expect a non-zero count in at least one built CSS file — confirms Tailwind picked up the custom `status-critico` token now that real source (`SequenciaCard.tsx`) references it as a literal class name (Task 10's own build check couldn't verify this yet, since nothing referenced the token at that point).

- [ ] **Step 5: Run the existing test suite (regression check — failures here are expected, see note above)**
  ```bash
  cd frontend && npx vitest run src/components/SequenciaBoard/SequenciaBoard.test.tsx
  ```
  If every test in this file now fails with a "No QueryClient set" error, that is the expected collateral described above — report it, do not attempt to fix it by adding test mocking.

- [ ] **Step 6: Commit**
  ```bash
  cd frontend
  git add src/components/SequenciaBoard/SequenciaBoard.tsx src/components/SequenciaBoard/SequenciaCard.tsx
  git commit -m "$(cat <<'EOF'
  feat: redesign sequencia board/card with tailwind, add collaboration footer
  EOF
  )"
  ```

---

### Task 17: ItemDetalhe panel (full checklist/label/comment/attachment interaction) + wire click-to-open

**Files:**
- Create: `frontend/src/components/ItemDetalhe/ItemDetalhe.tsx`
- Modify: `frontend/src/components/SequenciaBoard/SequenciaCard.tsx`

**Depends-on:** 11, 16

**Interfaces:**
- Consumes: `atualizarChecklistItem, criarAnexo, criarChecklistItem, criarComentario, listarAnexos, listarCatalogoLabels, listarChecklist, listarComentarios, listarLabelsDoItem, removerAnexo, removerChecklistItem, substituirLabelsDoItem` (Task 11, `frontend/src/services/api.ts`, exact signatures in Task 11's Interfaces section); `ChecklistItemOut, LabelOut, ComentarioOut, AnexoOut` (Task 11, `frontend/src/types/colaboracao.ts`); the Task 16 version of `SequenciaCard.tsx` (this task replaces its content, preserving `STATUS_CARD_CLASSES` and `CardFooter` verbatim and adding click-to-open on top).
- Produces: `ItemDetalhe({ item, onClose }: ItemDetalheProps): JSX.Element`.

Mechanism chosen for "which item is open": local `useState` inside `SequenciaCard` itself (not lifted to `SequenciaBoard` or the page components, which are out of this task's `Files:` scope). Clicking a card sets `detalheAberto = true` and renders `<ItemDetalhe>` as a sibling overlay (not nested inside the draggable `<div>`, so none of its internal buttons/inputs interact with `@dnd-kit`'s drag listeners). No routing/URL-state involved, per the brief. Write operations reuse this codebase's one existing write pattern (`GerenciamentoUsuarios.tsx`'s manual-refetch-after-write idiom) rather than introducing `useMutation`, which nothing in this codebase uses today.

- [ ] **Step 1: Create `frontend/src/components/ItemDetalhe/ItemDetalhe.tsx`**
  ```tsx
  import { useQuery } from "@tanstack/react-query";
  import { useState } from "react";

  import { useAuth } from "../../auth/AuthContext";
  import {
    atualizarChecklistItem,
    criarAnexo,
    criarChecklistItem,
    criarComentario,
    listarAnexos,
    listarCatalogoLabels,
    listarChecklist,
    listarComentarios,
    listarLabelsDoItem,
    removerAnexo,
    removerChecklistItem,
    substituirLabelsDoItem,
  } from "../../services/api";
  import type { ItemProducao } from "../../types/producao";

  interface ItemDetalheProps {
    item: ItemProducao;
    onClose: () => void;
  }

  export function ItemDetalhe({ item, onClose }: ItemDetalheProps) {
    const { token } = useAuth();
    const itemId = item.id as number;

    const [novoPasso, setNovoPasso] = useState("");
    const [novoComentario, setNovoComentario] = useState("");
    const [novoAnexoTitulo, setNovoAnexoTitulo] = useState("");
    const [novoAnexoUrl, setNovoAnexoUrl] = useState("");

    const checklistQuery = useQuery({
      queryKey: ["item-checklist", itemId],
      queryFn: () => listarChecklist(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const catalogoLabelsQuery = useQuery({
      queryKey: ["catalogo-labels"],
      queryFn: () => listarCatalogoLabels(token as string),
      enabled: Boolean(token),
      retry: false,
    });
    const labelsDoItemQuery = useQuery({
      queryKey: ["item-labels", itemId],
      queryFn: () => listarLabelsDoItem(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const comentariosQuery = useQuery({
      queryKey: ["item-comentarios", itemId],
      queryFn: () => listarComentarios(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const anexosQuery = useQuery({
      queryKey: ["item-anexos", itemId],
      queryFn: () => listarAnexos(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });

    async function handleToggleChecklistItem(checklistItemId: number, concluido: boolean) {
      if (!token) return;
      await atualizarChecklistItem(token, itemId, checklistItemId, { concluido });
      await checklistQuery.refetch();
    }

    async function handleRenomearChecklistItem(checklistItemId: number, texto: string) {
      if (!token) return;
      await atualizarChecklistItem(token, itemId, checklistItemId, { texto });
      await checklistQuery.refetch();
    }

    async function handleAdicionarPasso() {
      if (!token || !novoPasso.trim()) return;
      const ordem = (checklistQuery.data?.length ?? 0) + 1;
      await criarChecklistItem(token, itemId, { texto: novoPasso, ordem });
      setNovoPasso("");
      await checklistQuery.refetch();
    }

    async function handleRemoverPasso(checklistItemId: number) {
      if (!token) return;
      await removerChecklistItem(token, itemId, checklistItemId);
      await checklistQuery.refetch();
    }

    async function handleAlternarLabel(labelId: number) {
      if (!token) return;
      const atuais = labelsDoItemQuery.data ?? [];
      const jaSelecionada = atuais.some((label) => label.id === labelId);
      const novoConjunto = jaSelecionada
        ? atuais.filter((label) => label.id !== labelId).map((label) => label.id)
        : [...atuais.map((label) => label.id), labelId];
      await substituirLabelsDoItem(token, itemId, novoConjunto);
      await labelsDoItemQuery.refetch();
    }

    async function handleEnviarComentario() {
      if (!token || !novoComentario.trim()) return;
      await criarComentario(token, itemId, { texto: novoComentario });
      setNovoComentario("");
      await comentariosQuery.refetch();
    }

    async function handleAdicionarAnexo() {
      if (!token || !novoAnexoTitulo.trim() || !novoAnexoUrl.trim()) return;
      await criarAnexo(token, itemId, { titulo: novoAnexoTitulo, url: novoAnexoUrl });
      setNovoAnexoTitulo("");
      setNovoAnexoUrl("");
      await anexosQuery.refetch();
    }

    async function handleRemoverAnexo(anexoId: number) {
      if (!token) return;
      await removerAnexo(token, itemId, anexoId);
      await anexosQuery.refetch();
    }

    const checklist = checklistQuery.data ?? [];
    const catalogoLabels = catalogoLabelsQuery.data ?? [];
    const labelsDoItem = labelsDoItemQuery.data ?? [];
    const comentarios = comentariosQuery.data ?? [];
    const anexos = anexosQuery.data ?? [];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {item.linha} - {item.posto_trabalho}
            </h2>
            <button
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              Fechar
            </button>
          </div>

          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Checklist
            </h3>
            <ul className="flex flex-col gap-2">
              {checklist.map((passo) => (
                <li key={passo.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={passo.concluido}
                    onChange={(event) => handleToggleChecklistItem(passo.id, event.target.checked)}
                  />
                  <input
                    value={passo.texto}
                    onChange={(event) => handleRenomearChecklistItem(passo.id, event.target.value)}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => handleRemoverPasso(passo.id)}
                    className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                placeholder="novo passo"
                value={novoPasso}
                onChange={(event) => setNovoPasso(event.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                onClick={handleAdicionarPasso}
                className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700"
              >
                Adicionar
              </button>
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Labels
            </h3>
            <div className="flex flex-wrap gap-2">
              {catalogoLabels.map((label) => {
                const selecionada = labelsDoItem.some((atual) => atual.id === label.id);
                return (
                  <button
                    key={label.id}
                    onClick={() => handleAlternarLabel(label.id)}
                    className="rounded-full px-3 py-1 text-xs font-medium text-white"
                    style={{
                      backgroundColor: label.cor,
                      opacity: selecionada ? 1 : 0.35,
                    }}
                  >
                    {label.nome}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Comentarios
            </h3>
            <ul className="mb-2 flex flex-col gap-2">
              {comentarios.map((comentario) => (
                <li key={comentario.id} className="rounded-md bg-slate-50 p-2 text-sm">
                  <div className="font-medium text-slate-800">{comentario.autor_username}</div>
                  <div className="text-slate-600">{comentario.texto}</div>
                  <div className="text-xs text-slate-400">{comentario.criado_em}</div>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <textarea
                value={novoComentario}
                onChange={(event) => setNovoComentario(event.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                onClick={handleEnviarComentario}
                className="self-end rounded-md bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700"
              >
                Comentar
              </button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Anexos
            </h3>
            <ul className="mb-2 flex flex-col gap-2">
              {anexos.map((anexo) => (
                <li key={anexo.id} className="flex items-center justify-between text-sm">
                  <a
                    href={anexo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-slate-900 underline"
                  >
                    {anexo.titulo}
                  </a>
                  <span className="text-xs text-slate-500">{anexo.enviado_por_username}</span>
                  <button
                    onClick={() => handleRemoverAnexo(anexo.id)}
                    className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                placeholder="titulo"
                value={novoAnexoTitulo}
                onChange={(event) => setNovoAnexoTitulo(event.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <input
                placeholder="url"
                value={novoAnexoUrl}
                onChange={(event) => setNovoAnexoUrl(event.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                onClick={handleAdicionarAnexo}
                className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700"
              >
                Anexar
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Replace the full contents of `frontend/src/components/SequenciaBoard/SequenciaCard.tsx`**
  (builds on Task 16's version — adds `useState` for the open/closed panel, an `onClick` on the card, and the `<ItemDetalhe>` render; `STATUS_CARD_CLASSES` and `CardFooter` are otherwise unchanged from Task 16):
  ```tsx
  import { useSortable } from "@dnd-kit/sortable";
  import { CSS } from "@dnd-kit/utilities";
  import { useQuery } from "@tanstack/react-query";
  import { useState } from "react";

  import { useAuth } from "../../auth/AuthContext";
  import {
    listarAnexos,
    listarChecklist,
    listarComentarios,
    listarLabelsDoItem,
  } from "../../services/api";
  import { PlanItemStatus, type ItemProducao } from "../../types/producao";
  import { ItemDetalhe } from "../ItemDetalhe/ItemDetalhe";

  interface SequenciaCardProps {
    item: ItemProducao;
  }

  const STATUS_CARD_CLASSES: Record<PlanItemStatus, string> = {
    [PlanItemStatus.Normal]: "border-status-normal bg-white",
    [PlanItemStatus.Critico]: "border-status-critico bg-status-critico/10",
    [PlanItemStatus.Excluido]: "border-status-excluido bg-status-excluido/10 opacity-60",
    [PlanItemStatus.Locked]: "border-status-travado bg-status-travado/10",
  };

  function CardFooter({ itemId }: { itemId: number }) {
    const { token } = useAuth();

    const checklistQuery = useQuery({
      queryKey: ["item-checklist", itemId],
      queryFn: () => listarChecklist(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const labelsQuery = useQuery({
      queryKey: ["item-labels", itemId],
      queryFn: () => listarLabelsDoItem(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const comentariosQuery = useQuery({
      queryKey: ["item-comentarios", itemId],
      queryFn: () => listarComentarios(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });
    const anexosQuery = useQuery({
      queryKey: ["item-anexos", itemId],
      queryFn: () => listarAnexos(token as string, itemId),
      enabled: Boolean(token),
      retry: false,
    });

    const checklist = checklistQuery.data ?? [];
    const concluidos = checklist.filter((passo) => passo.concluido).length;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
        <span>
          {concluidos}/{checklist.length}
        </span>
        {(labelsQuery.data ?? []).map((label) => (
          <span
            key={label.id}
            className="rounded-full px-2 py-0.5 text-white"
            style={{ backgroundColor: label.cor }}
          >
            {label.nome}
          </span>
        ))}
        <span>{(comentariosQuery.data ?? []).length} comentario(s)</span>
        <span>{(anexosQuery.data ?? []).length} anexo(s)</span>
      </div>
    );
  }

  export function SequenciaCard({ item }: SequenciaCardProps) {
    const [detalheAberto, setDetalheAberto] = useState(false);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: String(item.id ?? `novo-${item.sequencia}`),
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={() => {
            if (item.id !== null) setDetalheAberto(true);
          }}
          data-testid="sequencia-card"
          className={[
            "sequencia-card",
            item.is_critico ? "sequencia-card--critico" : "",
            "mb-2 rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md",
            STATUS_CARD_CLASSES[item.status],
            isDragging ? "rotate-1 shadow-lg" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <strong>
            {item.linha} - {item.posto_trabalho}
          </strong>
          <div>{item.kanbans} kanban(s)</div>
          {item.hora_inicial && item.hora_final && (
            <div>
              {item.hora_inicial.slice(11, 16)} - {item.hora_final.slice(11, 16)}
            </div>
          )}
          {item.almoco_incluso && <div data-testid="almoco-label">HORARIO DE ALMOCO INCLUSO</div>}
          {item.tem_falta_estoque && <div data-testid="falta-estoque">Falta de estoque</div>}
          {item.id !== null && <CardFooter itemId={item.id} />}
        </div>
        {detalheAberto && item.id !== null && (
          <ItemDetalhe item={item} onClose={() => setDetalheAberto(false)} />
        )}
      </>
    );
  }
  ```

- [ ] **Step 3: Verify types/lint**
  ```bash
  cd frontend
  npx tsc -b
  npx eslint src/components/ItemDetalhe/ItemDetalhe.tsx src/components/SequenciaBoard/SequenciaCard.tsx
  ```

- [ ] **Step 4: Run the FULL existing test suite (final regression gate for the whole frontend plan)**
  ```bash
  cd frontend && npx vitest run
  ```
  `SequenciaBoard.test.tsx` failures carried over from Task 16 (missing `QueryClientProvider`) are still expected here — confirm no *other* file regressed.

- [ ] **Step 5: Commit**
  ```bash
  cd frontend
  git add src/components/ItemDetalhe/ItemDetalhe.tsx src/components/SequenciaBoard/SequenciaCard.tsx
  git commit -m "$(cat <<'EOF'
  feat: add item detalhe panel with click-to-open
  EOF
  )"
  ```
