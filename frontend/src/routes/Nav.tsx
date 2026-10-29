import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import {
  Kanban,
  SlidersHorizontal,
  BarChart3,
  CalendarDays,
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  History,
  Settings,
  Wrench,
  Zap,
  Factory,
  Layers,
  BookOpen,
  User,
} from "lucide-react";

import { useAuth, type Role } from "../auth/AuthContext";
import { GestampLogo } from "../components/GestampLogo";
import { listarLinhas } from "../services/api";
import { LINHAS_SOLDA_PADRAO, LINHAS_ESTAMPARIA_PADRAO } from "../types/producao";
import { isOperador } from "./RequireRole";

export const PROGRAMACAO_ROLES: Role[] = ["admin", "programador"];
export const USUARIOS_ROLES: Role[] = ["admin"];

export interface NavProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  defaultExpanded?: boolean;
}

export function Nav({
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
  defaultExpanded = false,
}: NavProps = {}) {
  const { token, role, username, logout, permissoes } = useAuth();
  const location = useLocation();

  const operador = isOperador(role);

  const podeVerSolda =
    role === "admin" ||
    role === "programador" ||
    (permissoes ? permissoes.pode_ver_solda : true);

  const podeVerEstamparia =
    role === "admin" ||
    role === "programador" ||
    (permissoes ? permissoes.pode_ver_estamparia : true);

  const [producaoExpandida, setProducaoExpandida] = useState(() => defaultExpanded || operador);
  const [soldaExpandida, setSoldaExpandida] = useState(() => defaultExpanded || (operador && podeVerSolda));
  const [estampariaExpandida, setEstampariaExpandida] = useState(() => defaultExpanded || (operador && podeVerEstamparia));

  useEffect(() => {
    if (operador) {
      setProducaoExpandida(true);
      if (podeVerSolda) setSoldaExpandida(true);
      if (podeVerEstamparia) setEstampariaExpandida(true);
    }
  }, [operador, podeVerSolda, podeVerEstamparia]);

  const [programacaoExpandida, setProgramacaoExpandida] = useState(defaultExpanded);
  const [progSoldaExpandida, setProgSoldaExpandida] = useState(defaultExpanded);
  const [progEstampariaExpandida, setProgEstampariaExpandida] = useState(defaultExpanded);

  const { data: linhasApi } = useQuery({
    queryKey: ["linhas-producao"],
    queryFn: () => (token ? listarLinhas(token) : Promise.resolve([])),
    enabled: Boolean(token),
    staleTime: 60000,
  });

  const linhasSolda =
    linhasApi && linhasApi.length > 0
      ? linhasApi.filter((l) => l.setor === "solda").map((l) => ({ valor: l.nome, label: l.nome }))
      : LINHAS_SOLDA_PADRAO;

  const linhasEstamparia =
    linhasApi && linhasApi.length > 0
      ? linhasApi.filter((l) => l.setor === "estamparia").map((l) => ({ valor: l.nome, label: l.nome }))
      : LINHAS_ESTAMPARIA_PADRAO;

  const searchParams = new URLSearchParams(location.search);
  const currentLinhaParam = searchParams.get("linha");

  if (!token) return null;

  const pathname = location.pathname;

  const ROLE_LABELS: Record<string, { label: string; badgeClass: string }> = {
    admin: {
      label: "Admin",
      badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
    },
    programador: {
      label: "Programador",
      badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    },
    usuario_comum: {
      label: "Operador",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    },
    operador_solda: {
      label: "Operador Solda",
      badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    },
    operador_estamparia: {
      label: "Operador Estamparia",
      badgeClass: "bg-indigo-100 text-indigo-700 border-indigo-200",
    },
    programador_ferramentaria: {
      label: "Ferramentaria",
      badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    },
  };

  const currentRoleInfo = role
    ? ROLE_LABELS[role] ?? (isOperador(role) ? { label: "Operador", badgeClass: "bg-slate-100 text-slate-700 border-slate-200" } : null)
    : null;
  const userInitials = (username || "U").slice(0, 2).toUpperCase();

  const navContent = (isMobile = false) => {
    const isCollapsed = !isMobile && collapsed;

    return (
      <div className="flex flex-col h-full justify-between">
        {/* Top Header / Logo */}
        <div>
          <div className="h-14 border-b border-slate-200/90 dark:border-slate-800/90 flex items-center justify-between px-4">
            <Link
              to="/"
              onClick={() => isMobile && onCloseMobile?.()}
              className="flex items-center gap-3 group focus:outline-none"
            >
              {isCollapsed ? (
                <GestampLogo variant="symbol" tamanho="md" />
              ) : (
                <GestampLogo variant="full" subtitulo="Planner Logística" tamanho="md" />
              )}
            </Link>

            {isMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fechar menu lateral"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-5">
            {/* Group 1: Planner / Visões */}
            <div>
              {!isCollapsed && (
                <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Visões do Planner
                </div>
              )}
              <div className="space-y-1">
                {/* Menu Produção Expansível com Submenu Solda e Estamparia */}
                <div>
                  {isCollapsed ? (
                    <Link
                      to={!podeVerSolda && podeVerEstamparia ? "/producao/estamparia" : "/producao/solda"}
                      title="Produção"
                      className={`group flex items-center justify-center p-2 rounded-lg text-sm transition-all duration-150 ${
                        pathname.startsWith("/producao") || pathname === "/"
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80"
                      }`}
                    >
                      <Kanban className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setProducaoExpandida((prev) => !prev)}
                      className={`w-full group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer ${
                        pathname.startsWith("/producao") || pathname === "/"
                          ? "bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 font-semibold"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Kanban
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            pathname.startsWith("/producao") || pathname === "/"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                          }`}
                        />
                        <span className="truncate">Produção</span>
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                          producaoExpandida ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  )}

                  {/* Submenus expandidos (quando não colapsado e producaoExpandida) */}
                  {!isCollapsed && producaoExpandida && (
                    <div className="mt-1 space-y-2 pl-3">
                      {/* Sub-item: Produção Solda */}
                      {podeVerSolda && (
                        <div className="border-l-2 border-emerald-200 dark:border-emerald-800/60 pl-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <Link
                              to="/producao/solda"
                              onClick={() => isMobile && onCloseMobile?.()}
                              className={`flex items-center gap-2 py-1 text-xs font-semibold rounded-md transition-colors ${
                                (pathname === "/producao/solda" || pathname === "/") && !currentLinhaParam
                                  ? "text-emerald-800 dark:text-emerald-300 font-bold"
                                  : "text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400"
                              }`}
                            >
                              <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="truncate">Produção — Solda</span>
                            </Link>
                            <button
                              type="button"
                              onClick={() => setSoldaExpandida((prev) => !prev)}
                              className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              title="Expandir/recolher linhas de Solda"
                            >
                              <ChevronDown
                                className={`w-3 h-3 transition-transform ${
                                  soldaExpandida ? "rotate-0" : "-rotate-90"
                                }`}
                              />
                            </button>
                          </div>

                          {/* Linhas de Solda */}
                          {soldaExpandida && (
                            <div className="pl-5 space-y-0.5">
                              {linhasSolda.map((l) => {
                                const isAtivo =
                                  (pathname === "/producao/solda" || pathname === "/") &&
                                  (currentLinhaParam === l.valor || (!currentLinhaParam && l.valor === "LINHA 1"));
                                return (
                                  <Link
                                    key={l.valor}
                                    to={`/producao/solda?linha=${encodeURIComponent(l.valor)}`}
                                    onClick={() => isMobile && onCloseMobile?.()}
                                    className={`flex items-center justify-between px-2 py-1 rounded text-xs transition-colors ${
                                      isAtivo
                                        ? "bg-emerald-100/80 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 font-bold shadow-2xs"
                                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                                    }`}
                                  >
                                    <span>{l.label}</span>
                                    {isAtivo && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                                    )}
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sub-item: Produção Estamparia */}
                      {podeVerEstamparia && (
                        <div className="border-l-2 border-indigo-200 dark:border-indigo-800/60 pl-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <Link
                              to="/producao/estamparia"
                              onClick={() => isMobile && onCloseMobile?.()}
                              className={`flex items-center gap-2 py-1 text-xs font-semibold rounded-md transition-colors ${
                                pathname === "/producao/estamparia" && !currentLinhaParam
                                  ? "text-indigo-800 dark:text-indigo-300 font-bold"
                                  : "text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400"
                              }`}
                            >
                              <Factory className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span className="truncate">Produção — Estamparia</span>
                            </Link>
                            <button
                              type="button"
                              onClick={() => setEstampariaExpandida((prev) => !prev)}
                              className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              title="Expandir/recolher linhas de Estamparia"
                            >
                              <ChevronDown
                                className={`w-3 h-3 transition-transform ${
                                  estampariaExpandida ? "rotate-0" : "-rotate-90"
                                }`}
                              />
                            </button>
                          </div>

                          {/* Linhas de Estamparia */}
                          {estampariaExpandida && (
                            <div className="pl-5 space-y-0.5">
                              {linhasEstamparia.map((l) => {
                                const isAtivo =
                                  pathname === "/producao/estamparia" &&
                                  (currentLinhaParam === l.valor || (!currentLinhaParam && l.valor === "LINHA 1"));
                                return (
                                  <Link
                                    key={l.valor}
                                    to={`/producao/estamparia?linha=${encodeURIComponent(l.valor)}`}
                                    onClick={() => isMobile && onCloseMobile?.()}
                                    className={`flex items-center justify-between px-2 py-1 rounded text-xs transition-colors ${
                                      isAtivo
                                        ? "bg-indigo-100/80 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-200 font-bold shadow-2xs"
                                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                                    }`}
                                  >
                                    <span>{l.label}</span>
                                    {isAtivo && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                                    )}
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Programação Expansível por Setor (Restricted) */}
                {role && PROGRAMACAO_ROLES.includes(role) && (
                  <div>
                    {isCollapsed ? (
                      <Link
                        to={podeVerSolda ? "/programacao/solda" : "/programacao/estamparia"}
                        title="Programação"
                        className={`group flex items-center justify-center p-2 rounded-lg text-sm transition-all duration-150 ${
                          pathname.startsWith("/programacao")
                            ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80"
                        }`}
                      >
                        <SlidersHorizontal className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setProgramacaoExpandida((prev) => !prev)}
                        className={`w-full group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer ${
                          pathname.startsWith("/programacao")
                            ? "bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 font-medium"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <SlidersHorizontal
                            className={`w-4 h-4 shrink-0 transition-colors ${
                              pathname.startsWith("/programacao")
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                            }`}
                          />
                          <span className="truncate">Programação</span>
                        </div>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                            programacaoExpandida ? "rotate-0" : "-rotate-90"
                          }`}
                        />
                      </button>
                    )}

                    {/* Submenus expandidos de Programação */}
                    {!isCollapsed && programacaoExpandida && (
                      <div className="mt-1 space-y-2 pl-3">
                        {/* Sub-item: Programação Solda */}
                        {podeVerSolda && (
                          <div className="border-l-2 border-emerald-200 dark:border-emerald-800/60 pl-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <Link
                                to="/programacao/solda"
                                onClick={() => isMobile && onCloseMobile?.()}
                                className={`flex items-center gap-2 py-1 text-xs font-semibold rounded-md transition-colors ${
                                  pathname === "/programacao/solda" && !currentLinhaParam
                                    ? "text-emerald-800 dark:text-emerald-300 font-bold"
                                    : "text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400"
                                }`}
                              >
                                <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span className="truncate">Programação — Solda</span>
                              </Link>
                              <button
                                type="button"
                                onClick={() => setProgSoldaExpandida((prev) => !prev)}
                                className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                title="Expandir/recolher linhas de Solda na Programação"
                              >
                                <ChevronDown
                                  className={`w-3 h-3 transition-transform ${
                                    progSoldaExpandida ? "rotate-0" : "-rotate-90"
                                  }`}
                                />
                              </button>
                            </div>

                            {/* Linhas de Solda na Programação */}
                            {progSoldaExpandida && (
                              <div className="pl-5 space-y-0.5">
                                {linhasSolda.map((l) => {
                                  const isAtivo =
                                    pathname === "/programacao/solda" &&
                                    (currentLinhaParam === l.valor || (!currentLinhaParam && l.valor === "LINHA 1"));
                                  return (
                                    <Link
                                      key={l.valor}
                                      to={`/programacao/solda?linha=${encodeURIComponent(l.valor)}`}
                                      onClick={() => isMobile && onCloseMobile?.()}
                                      className={`flex items-center justify-between px-2 py-1 rounded text-xs transition-colors ${
                                        isAtivo
                                          ? "bg-emerald-100/80 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 font-bold shadow-2xs"
                                          : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                                      }`}
                                    >
                                      <span>{l.label}</span>
                                      {isAtivo && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                                      )}
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Sub-item: Programação Estamparia */}
                        {podeVerEstamparia && (
                          <div className="border-l-2 border-indigo-200 dark:border-indigo-800/60 pl-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <Link
                                to="/programacao/estamparia"
                                onClick={() => isMobile && onCloseMobile?.()}
                                className={`flex items-center gap-2 py-1 text-xs font-semibold rounded-md transition-colors ${
                                  pathname === "/programacao/estamparia" && !currentLinhaParam
                                    ? "text-indigo-800 dark:text-indigo-300 font-bold"
                                    : "text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400"
                                }`}
                              >
                                <Factory className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                <span className="truncate">Programação — Estamparia</span>
                              </Link>
                              <button
                                type="button"
                                onClick={() => setProgEstampariaExpandida((prev) => !prev)}
                                className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                title="Expandir/recolher linhas de Estamparia na Programação"
                              >
                                <ChevronDown
                                  className={`w-3 h-3 transition-transform ${
                                    progEstampariaExpandida ? "rotate-0" : "-rotate-90"
                                  }`}
                                />
                              </button>
                            </div>

                            {/* Linhas de Estamparia na Programação */}
                            {progEstampariaExpandida && (
                              <div className="pl-5 space-y-0.5">
                                {linhasEstamparia.map((l) => {
                                  const isAtivo =
                                    pathname === "/programacao/estamparia" &&
                                    (currentLinhaParam === l.valor || (!currentLinhaParam && l.valor === "LINHA 1"));
                                  return (
                                    <Link
                                      key={l.valor}
                                      to={`/programacao/estamparia?linha=${encodeURIComponent(l.valor)}`}
                                      onClick={() => isMobile && onCloseMobile?.()}
                                      className={`flex items-center justify-between px-2 py-1 rounded text-xs transition-colors ${
                                        isAtivo
                                          ? "bg-indigo-100/80 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-200 font-bold shadow-2xs"
                                          : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                                      }`}
                                    >
                                      <span>{l.label}</span>
                                      {isAtivo && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                                      )}
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Visões Analíticas e de Gestão (Ocultas para Operadores) */}
                {!operador && (
                  <>
                    {/* Dashboard */}
                    <Link
                      to="/dashboard"
                      onClick={() => isMobile && onCloseMobile?.()}
                      title={isCollapsed ? "Dashboard" : undefined}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative ${
                        pathname === "/dashboard"
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-medium"
                      }`}
                    >
                      {pathname === "/dashboard" && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-600 rounded-r" />
                      )}
                      <BarChart3
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          pathname === "/dashboard"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                        }`}
                      />
                      {!isCollapsed && (
                        <div className="flex items-center justify-between flex-1 min-w-0">
                          <span className="truncate">Dashboard</span>
                          <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400">
                            KPIs
                          </span>
                        </div>
                      )}
                    </Link>

                    {/* Calendario */}
                    <Link
                      to="/calendario"
                      onClick={() => isMobile && onCloseMobile?.()}
                      title={isCollapsed ? "Calendário" : undefined}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative ${
                        pathname === "/calendario"
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-medium"
                      }`}
                    >
                      {pathname === "/calendario" && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-600 rounded-r" />
                      )}
                      <CalendarDays
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          pathname === "/calendario"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                        }`}
                      />
                      {!isCollapsed && (
                        <div className="flex items-center justify-between flex-1 min-w-0">
                          <span className="truncate">Calendário</span>
                          <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400">
                            Turnos
                          </span>
                        </div>
                      )}
                    </Link>

                    {/* Seisan Kanriban */}
                    <Link
                      to="/seisan-kanriban"
                      onClick={() => isMobile && onCloseMobile?.()}
                      title={isCollapsed ? "Seisan Kanriban" : undefined}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative ${
                        pathname === "/seisan-kanriban" || pathname === "/seisan-kaniban"
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-medium"
                      }`}
                    >
                      {(pathname === "/seisan-kanriban" || pathname === "/seisan-kaniban") && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-600 rounded-r" />
                      )}
                      <Kanban
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          pathname === "/seisan-kanriban" || pathname === "/seisan-kaniban"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                        }`}
                      />
                      {!isCollapsed && (
                        <div className="flex items-center justify-between flex-1 min-w-0">
                          <span className="truncate">Seisan Kanriban</span>
                          <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400">
                            Gantt 3F
                          </span>
                        </div>
                      )}
                    </Link>

                    {/* Visualização do Patan (Teórico) */}
                    <Link
                      to="/visualizacao-patan"
                      onClick={() => isMobile && onCloseMobile?.()}
                      title={isCollapsed ? "Visualização do Patan" : undefined}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative ${
                        pathname === "/visualizacao-patan"
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-medium"
                      }`}
                    >
                      {pathname === "/visualizacao-patan" && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-600 rounded-r" />
                      )}
                      <Layers
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          pathname === "/visualizacao-patan"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                        }`}
                      />
                      {!isCollapsed && (
                        <div className="flex items-center justify-between flex-1 min-w-0">
                          <span className="truncate">Visualização do Patan</span>
                          <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400">
                            Teórico
                          </span>
                        </div>
                      )}
                    </Link>

                    {/* Ferramentaria */}
                    <Link
                      to="/ferramentaria"
                      onClick={() => isMobile && onCloseMobile?.()}
                      title={isCollapsed ? "Ferramentaria" : undefined}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative ${
                        pathname === "/ferramentaria"
                          ? "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 font-semibold shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-medium"
                      }`}
                    >
                      {pathname === "/ferramentaria" && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-amber-600 rounded-r" />
                      )}
                      <Wrench
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          pathname === "/ferramentaria"
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                        }`}
                      />
                      {!isCollapsed && (
                        <div className="flex items-center justify-between flex-1 min-w-0">
                          <span className="truncate">Ferramentaria</span>
                          <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400">
                            Manutenção
                          </span>
                        </div>
                      )}
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Group 2: Administration */}
            {role && USUARIOS_ROLES.includes(role) && (
              <div>
                {!isCollapsed && (
                  <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Administração
                  </div>
                )}
                <div className="space-y-1">
                  {/* Usuarios */}
                  <Link
                    to="/usuarios"
                    onClick={() => isMobile && onCloseMobile?.()}
                    title={isCollapsed ? "Usuários" : undefined}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative ${
                      pathname === "/usuarios"
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-medium"
                    }`}
                  >
                    {pathname === "/usuarios" && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-600 rounded-r" />
                    )}
                    <Users
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        pathname === "/usuarios"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                      }`}
                    />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between flex-1 min-w-0">
                        <span className="truncate">Usuários</span>
                        <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400">
                          Acessos
                        </span>
                      </div>
                    )}
                  </Link>

                  {/* Historico */}
                  <Link
                    to="/historico"
                    onClick={() => isMobile && onCloseMobile?.()}
                    title={isCollapsed ? "Historico" : undefined}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative ${
                      pathname === "/historico"
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-medium"
                    }`}
                  >
                    {pathname === "/historico" && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-600 rounded-r" />
                    )}
                    <History
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        pathname === "/historico"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                      }`}
                    />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between flex-1 min-w-0">
                        <span className="truncate">Historico</span>
                        <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400">
                          Auditoria
                        </span>
                      </div>
                    )}
                  </Link>

                  {/* Parâmetros */}
                  <Link
                    to="/parametros"
                    onClick={() => isMobile && onCloseMobile?.()}
                    title={isCollapsed ? "Parâmetros" : undefined}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative ${
                      pathname === "/parametros"
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-medium"
                    }`}
                  >
                    {pathname === "/parametros" && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-600 rounded-r" />
                    )}
                    <Settings
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        pathname === "/parametros"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                      }`}
                    />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between flex-1 min-w-0">
                        <span className="truncate">Parâmetros</span>
                        <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400">
                          Cargos & Regras
                        </span>
                      </div>
                    )}
                  </Link>
                </div>
              </div>
            )}

            {/* Group 3: Suporte & Documentação (Oculto para Operadores) */}
            {!operador && (
              <div>
                {!isCollapsed && (
                  <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Suporte & Guias
                  </div>
                )}
                <div className="space-y-1">
                  <Link
                    to="/documentacao"
                    onClick={() => isMobile && onCloseMobile?.()}
                    title={isCollapsed ? "Documentação" : undefined}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative ${
                      pathname === "/documentacao" || pathname === "/docs"
                        ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 font-semibold shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-medium"
                    }`}
                  >
                    {(pathname === "/documentacao" || pathname === "/docs") && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-indigo-600 rounded-r" />
                    )}
                    <BookOpen
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        pathname === "/documentacao" || pathname === "/docs"
                          ? "text-indigo-700 dark:text-indigo-400"
                          : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                      }`}
                    />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between flex-1 min-w-0">
                        <span className="truncate">Documentação</span>
                        <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400">
                          Swagger & Docs
                        </span>
                      </div>
                    )}
                  </Link>
                </div>
              </div>
            )}

            {/* Group: Conta & Perfil (Acesso para todos os usuários) */}
            <div>
              {!isCollapsed && (
                <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Conta & Acesso
                </div>
              )}
              <div className="space-y-1">
                <Link
                  to="/perfil"
                  onClick={() => isMobile && onCloseMobile?.()}
                  title={isCollapsed ? "Meu Perfil" : undefined}
                  className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative ${
                    pathname === "/perfil"
                      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-medium"
                  }`}
                >
                  {pathname === "/perfil" && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-600 rounded-r" />
                  )}
                  <User
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      pathname === "/perfil"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                    }`}
                  />
                  {!isCollapsed && (
                    <div className="flex items-center justify-between flex-1 min-w-0">
                      <span className="truncate">Meu Perfil</span>
                      <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400">
                        Senha & Info
                      </span>
                    </div>
                  )}
                </Link>
              </div>
            </div>
          </nav>
        </div>

        {/* User profile & Logout Footer */}
        <div className="p-3 border-t border-slate-200/90 dark:border-slate-800/90 bg-slate-50/50 dark:bg-slate-900/50">
          <Link
            to="/perfil"
            onClick={() => isMobile && onCloseMobile?.()}
            title="Acessar meu perfil e configurações"
            className="group flex items-center gap-3 p-1.5 -m-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition-colors"
          >
            <div
              title={username ?? undefined}
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-700 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs ring-2 ring-white group-hover:ring-emerald-400 transition-all"
            >
              {userInitials}
            </div>

            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                  {username || "Usuário"}
                </p>
                {currentRoleInfo && (
                  <span
                    className={`inline-block text-[10px] font-medium px-1.5 py-0.2 rounded border mt-0.5 ${currentRoleInfo.badgeClass}`}
                  >
                    {currentRoleInfo.label}
                  </span>
                )}
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={logout}
            title="Sair do sistema"
            className={`mt-3 w-full flex items-center justify-center gap-2 py-1.5 px-2 rounded-lg text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200/60 transition-colors ${
              isCollapsed ? "px-1" : ""
            }`}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>Sair</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200/90 dark:border-slate-800/90 shadow-xs z-20 shrink-0 transition-all duration-200 select-none ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {navContent(false)}
      </aside>

      {/* Mobile drawer with backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative flex flex-col w-72 max-w-[85vw] h-full bg-white dark:bg-slate-950 shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {navContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
