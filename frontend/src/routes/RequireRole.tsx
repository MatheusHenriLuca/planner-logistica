import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth, type Role } from "../auth/AuthContext";

export const OPERADOR_ROLES: Role[] = [
  "usuario_comum",
  "operador_solda",
  "operador_estamparia",
];

export const ALL_AUTHENTICATED_ROLES: Role[] = [
  "admin",
  "programador",
  "programador_ferramentaria",
  "usuario_comum",
  "operador_solda",
  "operador_estamparia",
];

export function isOperador(role?: Role | null): boolean {
  if (!role) return false;
  return OPERADOR_ROLES.includes(role) || role.startsWith("operador");
}

interface RequireRoleProps {
  allowed: Role[];
  children: ReactNode;
}

export function RequireRole({ allowed, children }: RequireRoleProps) {
  const { role, permissoes } = useAuth();

  if (role === null) {
    return <Navigate to="/login" replace />;
  }

  const isOperatorAllowed =
    allowed.some((r) => OPERADOR_ROLES.includes(r)) && isOperador(role);
  const rolePermitido = allowed.includes(role) || isOperatorAllowed;
  const permissaoProgramar = allowed.includes("programador") && Boolean(permissoes?.pode_programar);

  if (!rolePermitido && !permissaoProgramar) {
    if (permissoes?.pode_ver_estamparia && !permissoes?.pode_ver_solda) {
      return <Navigate to="/producao/estamparia" replace />;
    }
    return <Navigate to="/producao/solda" replace />;
  }

  return <>{children}</>;
}
