import { Link, useLocation } from "react-router-dom";
import {
  Kanban,
  SlidersHorizontal,
  BarChart3,
  CalendarDays,
  Users,
  PanelLeft,
  Menu,
  Radio,
  Moon,
  Sun,
  Zap,
  Factory,
  Wrench,
  Settings,
  History,
  Layers,
  BookOpen,
  User,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeContext";

interface HeaderProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenMobile?: () => void;
}

const ROUTE_INFO: Record<
  string,
  { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "/": {
    title: "Produção — Solda",
    subtitle: "Quadro Kanban Oficial (Tabela B)",
    icon: Zap,
  },
  "/producao/solda": {
    title: "Produção — Solda",
    subtitle: "Quadro Kanban Oficial • Linha Contínua (Tabela B)",
    icon: Zap,
  },
  "/producao/estamparia": {
    title: "Produção — Estamparia",
    subtitle: "Quadro Kanban Oficial • Prensas & Tryout (Tabela B)",
    icon: Factory,
  },
  "/programacao": {
    title: "Programação de Patan",
    subtitle: "Sequenciamento e Simulação (Tabela A / Staging)",
    icon: SlidersHorizontal,
  },
  "/programacao/solda": {
    title: "Programação — Solda",
    subtitle: "Sequenciamento e Simulação de Lotes (Tabela A)",
    icon: Zap,
  },
  "/programacao/estamparia": {
    title: "Programação — Estamparia",
    subtitle: "Sequenciamento e Simulação de Prensas (Tabela A)",
    icon: Factory,
  },
  "/seisan-kanriban": {
    title: "Seisan Kanriban",
    subtitle: "Controle Visual Lean TPS • Gantt Triplo por Posto",
    icon: Kanban,
  },
  "/seisan-kaniban": {
    title: "Seisan Kanriban",
    subtitle: "Controle Visual Lean TPS • Gantt Triplo por Posto",
    icon: Kanban,
  },
  "/visualizacao-patan": {
    title: "Visualização do Patan",
    subtitle: "Receita Mestre & Padrão Teórico Lean TPS",
    icon: Layers,
  },
  "/ferramentaria": {
    title: "Ferramentaria & Preventivas",
    subtitle: "Quadro Operacional de Manutenções & Catálogo de Ferramentas",
    icon: Wrench,
  },
  "/dashboard": {
    title: "Dashboard Executivo",
    subtitle: "Indicadores de Aderência, OEE e Desempenho Operacional",
    icon: BarChart3,
  },
  "/calendario": {
    title: "Calendário Operacional",
    subtitle: "Visão Mensal de Planejamento e Programação por Turnos",
    icon: CalendarDays,
  },
  "/perfil": {
    title: "Meu Perfil",
    subtitle: "Credenciais de Acesso & Gestão de Senhas",
    icon: User,
  },
  "/usuarios": {
    title: "Gestão de Usuários",
    subtitle: "Controle de Acessos e Operadores da Fábrica",
    icon: Users,
  },
  "/parametros": {
    title: "Parâmetros & Permissões",
    subtitle: "Configurações Operacionais Lean e Matriz RBAC",
    icon: Settings,
  },
  "/historico": {
    title: "Histórico & Auditoria",
    subtitle: "Rastreabilidade de Apontamentos e Ações de Chão de Fábrica",
    icon: History,
  },
  "/documentacao": {
    title: "Documentação & Suporte",
    subtitle: "Contextos Modulares, Guias Operacionais e APIs Swagger",
    icon: BookOpen,
  },
  "/docs": {
    title: "Documentação & Suporte",
    subtitle: "Contextos Modulares, Guias Operacionais e APIs Swagger",
    icon: BookOpen,
  },
};

export function Header({ collapsed = false, onToggleCollapse, onOpenMobile }: HeaderProps) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { username } = useAuth();
  
  const info = ROUTE_INFO[location.pathname] ?? {
    title: "Planner Logística",
    subtitle: "Sistema de Sequenciamento de Produção",
    icon: Kanban,
  };
  const Icon = info.icon;

  const hoje = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());

  return (
    <header className="h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200/90 dark:border-slate-800/90 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-xs z-10 transition-colors">
      <div className="flex items-center gap-3">
        {/* Mobile toggle */}
        <button
          type="button"
          onClick={onOpenMobile}
          aria-label="Abrir menu lateral"
          className="md:hidden p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Desktop collapse toggle - controle unificado do menu lateral */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          title={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          className="hidden md:flex p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden md:block" />

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center justify-center w-7 h-7 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-500/20">
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
              {info.title}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block leading-none">
              {info.subtitle}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Alternar Tema"
        >
          {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>

        {/* Real-time status pill */}
        <div
          title="Conexão em tempo real ativa"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-medium"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="hidden sm:inline">Tempo Real</span>
          <Radio className="w-3 h-3 sm:hidden" />
        </div>

        {/* Date */}
        <div className="hidden md:block text-xs font-medium text-slate-500 dark:text-slate-400 capitalize bg-slate-100/80 dark:bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-200/60 dark:border-slate-700/60">
          {hoje}
        </div>

        {/* Profile Link Button */}
        {username && (
          <Link
            to="/perfil"
            title={`Meu Perfil (${username})`}
            className="flex items-center gap-1.5 p-1 sm:px-2 sm:py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-700 text-white font-bold text-[10px] flex items-center justify-center shadow-xs ring-1 ring-emerald-500/30">
              {(username || "U").slice(0, 2).toUpperCase()}
            </div>
            <span className="hidden xl:inline text-xs font-medium max-w-[90px] truncate">
              {username}
            </span>
          </Link>
        )}

        {/* Gestamp Brand Badge */}
        <div className="hidden sm:flex items-center gap-1.5 pl-2.5 border-l border-slate-200 dark:border-slate-800">
          <img
            src="/gestamp-simbolo.png"
            alt="Gestamp"
            className="w-5 h-5 object-contain dark:brightness-0 dark:invert transition-all"
          />
          <span className="text-xs font-bold tracking-tight text-slate-800 dark:text-slate-200">
            Gestamp
          </span>
        </div>
      </div>
    </header>
  );
}
