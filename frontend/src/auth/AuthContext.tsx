import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getAuthMe, login as apiLogin, type PermissoesUsuario } from "../services/api";
export type { PermissoesUsuario };

export type Role =
  | "admin"
  | "programador"
  | "usuario_comum"
  | "operador_solda"
  | "operador_estamparia"
  | "programador_ferramentaria"
  | string;

interface DecodedToken {
  sub: string;
  role: Role;
  exp: number;
}

interface AuthState {
  token: string | null;
  username: string | null;
  role: Role | null;
  permissoes?: PermissoesUsuario | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = "planner_logistica_token";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeToken(token: string): DecodedToken {
  const payload = token.split(".")[1];
  return JSON.parse(atob(payload)) as DecodedToken;
}

function readInitialState(): AuthState {
  const token = localStorage.getItem(STORAGE_KEY);
  if (!token) {
    return { token: null, username: null, role: null, permissoes: null };
  }
  try {
    const decoded = decodeToken(token);
    if (decoded.exp * 1000 <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return { token: null, username: null, role: null, permissoes: null };
    }
    return { token, username: decoded.sub, role: decoded.role, permissoes: null };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return { token: null, username: null, role: null, permissoes: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(readInitialState);

  const fetchPermissoes = useCallback(async (token: string) => {
    try {
      const me = await getAuthMe(token);
      setState((prev) =>
        prev.token === token
          ? { ...prev, permissoes: me.permissoes, role: (me.role as Role) || prev.role }
          : prev
      );
    } catch {
      // Falha silenciosa se backend ainda não respondeu ou token expirou
    }
  }, []);

  useEffect(() => {
    if (state.token) {
      void fetchPermissoes(state.token);
    }
  }, [state.token, fetchPermissoes]);

  const login = useCallback(async (username: string, password: string) => {
    const token = await apiLogin(username, password);
    const decoded = decodeToken(token);
    localStorage.setItem(STORAGE_KEY, token);
    setState({ token, username: decoded.sub, role: decoded.role, permissoes: null });
    try {
      const me = await getAuthMe(token);
      setState({
        token,
        username: decoded.sub,
        role: (me.role as Role) || decoded.role,
        permissoes: me.permissoes,
      });
    } catch {
      // Ignora erro
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ token: null, username: null, role: null, permissoes: null });
  }, []);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
