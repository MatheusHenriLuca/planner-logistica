import { Link, useLocation } from "react-router-dom";
import { Kanban, SlidersHorizontal, BarChart3, CalendarDays, History, User } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { PROGRAMACAO_ROLES } from "./Nav";
import { isOperador } from "./RequireRole";

export function BottomNav() {
  const { token, role } = useAuth();
  const location = useLocation();

  if (!token) return null;

  const pathname = location.pathname;

  const operador = isOperador(role);
  const { permissoes } = useAuth();
  const prodLink = permissoes?.pode_ver_estamparia && !permissoes?.pode_ver_solda ? "/producao/estamparia" : "/producao/solda";

  const items = [
    {
      to: prodLink,
      label: "Prod",
      icon: Kanban,
      always: true,
    },
    {
      to: "/programacao",
      label: "Prog",
      icon: SlidersHorizontal,
      restricted: true,
    },
    {
      to: "/dashboard",
      label: "Painel",
      icon: BarChart3,
      hideForOperador: true,
    },
    {
      to: "/calendario",
      label: "Cal",
      icon: CalendarDays,
      hideForOperador: true,
    },
    {
      to: "/historico",
      label: "Hist",
      icon: History,
      adminOnly: true,
    },
    {
      to: "/perfil",
      label: "Perfil",
      icon: User,
      always: true,
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-40 flex items-center justify-around px-2 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.1)] dark:shadow-none pb-safe">
      {items.map((item) => {
        if (item.hideForOperador && operador) return null;
        if (item.restricted && (!role || !PROGRAMACAO_ROLES.includes(role))) return null;
        if (item.adminOnly && role !== "admin") return null;
        const isActive = pathname === item.to;
        const Icon = item.icon;

        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
              isActive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? "fill-emerald-600/20" : ""}`} />
            <span className={`text-[10px] font-medium ${isActive ? "font-bold" : ""}`}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
