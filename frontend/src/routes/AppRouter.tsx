import { useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { toast } from "sonner";

import { useAuth, type Role } from "../auth/AuthContext";
import { useProducaoWebSocket } from "../hooks/useProducaoWebSocket";
import { Calendario } from "../pages/Calendario";
import { Dashboard } from "../pages/Dashboard";
import { GerenciamentoUsuarios } from "../pages/GerenciamentoUsuarios";
import { Historico } from "../pages/Historico";
import { Parametros } from "../pages/Parametros";
import { Ferramentaria } from "../pages/Ferramentaria";
import { Producao } from "../pages/Producao";
import { ProgramacaoPatan } from "../pages/ProgramacaoPatan";
import { SeisanKaniban } from "../pages/SeisanKaniban";
import { VisualizacaoPatan } from "../pages/VisualizacaoPatan";
import { Documentacao } from "../pages/Documentacao";
import { Perfil } from "../pages/Perfil";
import { ApiError, registerUser } from "../services/api";
import { BottomNav } from "./BottomNav";
import { Header } from "./Header";
import { Nav, PROGRAMACAO_ROLES, USUARIOS_ROLES } from "./Nav";
import { RequireRole, ALL_AUTHENTICATED_ROLES } from "./RequireRole";

const AUTH_INPUT_CLASSES =
  "w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-500 dark:focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 transition-colors";

function LoginPage() {
  const { login, token } = useAuth();

  if (token) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-900 px-4 transition-colors">
      <form
        className="w-full max-w-sm rounded-lg bg-white dark:bg-slate-800 p-8 shadow-md"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await login(String(form.get("username")), String(form.get("password")));
          } catch (err) {
            if (
              err instanceof TypeError ||
              (err instanceof Error && err.message.toLowerCase().includes("fetch"))
            ) {
              toast.error(
                "Não foi possível conectar ao backend (porta 8000). Verifique se o servidor está rodando."
              );
            } else {
              toast.error("Usuario ou senha invalidos.");
            }
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
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">
          Primeiro acesso?{" "}
          <Link to="/register" className="font-medium text-slate-900 dark:text-slate-100 underline">
            Criar administrador
          </Link>
        </p>
      </form>
    </div>
  );
}

function RegisterPage() {
  const { login, token } = useAuth();

  if (token) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-900 px-4 transition-colors">
      <form
        className="w-full max-w-sm rounded-lg bg-white dark:bg-slate-800 p-8 shadow-md"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const username = String(form.get("username"));
          const password = String(form.get("password"));
          try {
            await registerUser(null, { username, password, role: "admin" });
            await login(username, password);
            toast.success("Administrador criado com sucesso!");
          } catch (err) {
            if (
              err instanceof TypeError ||
              (err instanceof Error && err.message.toLowerCase().includes("fetch"))
            ) {
              toast.error(
                "Não foi possível conectar ao backend (porta 8000). Verifique se o servidor está rodando."
              );
            } else {
              toast.error(
                err instanceof ApiError
                  ? err.message
                  : "Falha ao criar administrador."
              );
            }
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
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">
          Ja tem conta?{" "}
          <Link to="/login" className="font-medium text-slate-900 dark:text-slate-100 underline">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}

function ProgramacaoRedirect() {
  const { permissoes } = useAuth();
  if (permissoes?.pode_ver_estamparia && !permissoes?.pode_ver_solda) {
    return <Navigate to="/programacao/estamparia" replace />;
  }
  return <Navigate to="/programacao/solda" replace />;
}

function ProducaoRedirect() {
  const { permissoes } = useAuth();
  if (permissoes?.pode_ver_estamparia && !permissoes?.pode_ver_solda) {
    return <Navigate to="/producao/estamparia" replace />;
  }
  return <Navigate to="/producao/solda" replace />;
}

const OPERADOR_ROLES: Role[] = ["usuario_comum", "operador_solda", "operador_estamparia"];
const PRODUCAO_ROLES: Role[] = ["admin", "programador", "programador_ferramentaria", ...OPERADOR_ROLES];
const GESTAO_E_ANALISES_ROLES: Role[] = ["admin", "programador", "programador_ferramentaria"];

function MainLayout({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (!token) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Nav
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <Header
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

export function AppRouter() {
  useProducaoWebSocket();

  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/perfil"
            element={
              <RequireRole allowed={ALL_AUTHENTICATED_ROLES}>
                <Perfil />
              </RequireRole>
            }
          />
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
                <ProgramacaoRedirect />
              </RequireRole>
            }
          />
          <Route
            path="/programacao/solda"
            element={
              <RequireRole allowed={PROGRAMACAO_ROLES}>
                <ProgramacaoPatan setor="solda" />
              </RequireRole>
            }
          />
          <Route
            path="/programacao/estamparia"
            element={
              <RequireRole allowed={PROGRAMACAO_ROLES}>
                <ProgramacaoPatan setor="estamparia" />
              </RequireRole>
            }
          />
          <Route
            path="/"
            element={
              <RequireRole allowed={PRODUCAO_ROLES}>
                <ProducaoRedirect />
              </RequireRole>
            }
          />
          <Route
            path="/producao/solda"
            element={
              <RequireRole allowed={PRODUCAO_ROLES}>
                <Producao setor="solda" />
              </RequireRole>
            }
          />
          <Route
            path="/producao/estamparia"
            element={
              <RequireRole allowed={PRODUCAO_ROLES}>
                <Producao setor="estamparia" />
              </RequireRole>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireRole allowed={GESTAO_E_ANALISES_ROLES}>
                <Dashboard />
              </RequireRole>
            }
          />
          <Route
            path="/calendario"
            element={
              <RequireRole allowed={GESTAO_E_ANALISES_ROLES}>
                <Calendario />
              </RequireRole>
            }
          />
          <Route
            path="/seisan-kanriban"
            element={
              <RequireRole allowed={GESTAO_E_ANALISES_ROLES}>
                <SeisanKaniban />
              </RequireRole>
            }
          />
          <Route
            path="/seisan-kaniban"
            element={
              <RequireRole allowed={GESTAO_E_ANALISES_ROLES}>
                <SeisanKaniban />
              </RequireRole>
            }
          />
          <Route
            path="/visualizacao-patan"
            element={
              <RequireRole allowed={GESTAO_E_ANALISES_ROLES}>
                <VisualizacaoPatan />
              </RequireRole>
            }
          />
          <Route
            path="/ferramentaria"
            element={
              <RequireRole allowed={["admin", "programador", "programador_ferramentaria"]}>
                <Ferramentaria />
              </RequireRole>
            }
          />
          <Route
            path="/historico"
            element={
              <RequireRole allowed={["admin"]}>
                <Historico />
              </RequireRole>
            }
          />
          <Route
            path="/parametros"
            element={
              <RequireRole allowed={["admin"]}>
                <Parametros />
              </RequireRole>
            }
          />
          <Route
            path="/documentacao"
            element={
              <RequireRole allowed={GESTAO_E_ANALISES_ROLES}>
                <Documentacao />
              </RequireRole>
            }
          />
          <Route
            path="/docs"
            element={<Navigate to="/documentacao" replace />}
          />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}

