import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  KeyRound,
  AlertTriangle,
  Users,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  UserPlus,
  Trash2,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import {
  ApiError,
  deleteUser,
  getCargos,
  listUsers,
  registerUser,
  resetarSenhaUsuario,
  resetarSenhasEmMassa,
  updateUserRole,
  type Cargo,
  type UserOut,
} from "../services/api";

const DEFAULT_ROLES = ["admin", "programador", "usuario_comum"] as const;

const SELECT_CLASSES =
  "rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600";
const INPUT_CLASSES =
  "rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600";

export function GerenciamentoUsuarios() {
  const { token, username: currentUsername, logout } = useAuth();
  const [users, setUsers] = useState<UserOut[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoUsername, setNovoUsername] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoRole, setNovoRole] = useState<string>("usuario_comum");

  // Admin Single User Reset Modal
  const [usuarioReset, setUsuarioReset] = useState<UserOut | null>(null);
  const [senhaIndividual, setSenhaIndividual] = useState("");
  const [showSenhaIndividual, setShowSenhaIndividual] = useState(false);
  const [salvandoIndividual, setSalvandoIndividual] = useState(false);

  // Admin Bulk Reset Modal
  const [modalMassaAberto, setModalMassaAberto] = useState(false);
  const [senhaPadraoEmMassa, setSenhaPadraoEmMassa] = useState("Gestamp@2026");
  const [salvandoMassa, setSalvandoMassa] = useState(false);

  function tratarErro(err: unknown, mensagem: string) {
    if (err instanceof ApiError && err.status === 401) {
      logout();
      return;
    }
    toast.error(err instanceof ApiError ? err.message : mensagem);
  }

  async function carregar() {
    if (!token) return;
    setLoading(true);
    try {
      const [usersData, cargosData] = await Promise.all([
        listUsers(token),
        getCargos(token).catch(() => []),
      ]);
      setUsers(usersData);
      if (cargosData.length > 0) {
        setCargos(cargosData);
      }
    } catch (err) {
      tratarErro(err, "Falha ao carregar usuarios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCriar() {
    if (!token) return;
    if (!novoUsername.trim() || !novaSenha.trim()) {
      toast.error("Informe nome de usuário e senha.");
      return;
    }
    try {
      await registerUser(token, { username: novoUsername, password: novaSenha, role: novoRole });
      setNovoUsername("");
      setNovaSenha("");
      toast.success("Usuário criado com sucesso!");
      await carregar();
    } catch (err) {
      tratarErro(err, "Falha ao criar usuario.");
    }
  }

  async function handleAlterarRole(userId: number, role: string) {
    if (!token) return;
    try {
      await updateUserRole(token, userId, role);
      toast.success("Role do usuário alterada com sucesso.");
      await carregar();
    } catch (err) {
      tratarErro(err, "Falha ao atualizar usuario.");
    }
  }

  async function handleRemover(userId: number) {
    if (!token) return;
    try {
      await deleteUser(token, userId);
      toast.success("Usuário removido com sucesso.");
      await carregar();
    } catch (err) {
      tratarErro(err, "Falha ao remover usuario.");
    }
  }

  async function handleResetIndividual(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !usuarioReset) return;

    if (senhaIndividual.length < 4) {
      toast.error("A nova senha deve ter no mínimo 4 caracteres.");
      return;
    }

    setSalvandoIndividual(true);
    try {
      const resp = await resetarSenhaUsuario(token, usuarioReset.id, senhaIndividual);
      toast.success(resp.mensagem || `Senha de ${usuarioReset.username} redefinida!`);
      setUsuarioReset(null);
      setSenhaIndividual("");
      await carregar();
    } catch (err) {
      tratarErro(err, "Falha ao redefinir senha do usuário.");
    } finally {
      setSalvandoIndividual(false);
    }
  }

  async function handleResetEmMassa() {
    if (!token) return;

    if (senhaPadraoEmMassa.length < 4) {
      toast.error("A senha padrão deve ter no mínimo 4 caracteres.");
      return;
    }

    setSalvandoMassa(true);
    try {
      const resp = await resetarSenhasEmMassa(token, senhaPadraoEmMassa);
      toast.success(
        resp.mensagem ||
          `Senhas de ${resp.afetados ?? "todos os"} usuários redefinidas para '${senhaPadraoEmMassa}' com sucesso!`
      );
      setModalMassaAberto(false);
      await carregar();
    } catch (err) {
      tratarErro(err, "Falha ao redefinir senhas em massa.");
    } finally {
      setSalvandoMassa(false);
    }
  }

  if (loading) return <p className="p-6 text-slate-600 dark:text-slate-400">Carregando usuários...</p>;

  const listaCargos = cargos.length > 0 ? cargos.map((c) => c.nome) : Array.from(DEFAULT_ROLES);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            Gerenciamento de Usuários & Senhas
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Cadastre novos operadores, altere funções e redefina credenciais de acesso.
          </p>
        </div>

        {/* Botão de Redefinição em Massa */}
        <button
          type="button"
          onClick={() => setModalMassaAberto(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <KeyRound className="w-4 h-4" />
          Redefinir Senhas em Massa
        </button>
      </div>

      {/* Tabela de Usuários */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs bg-white dark:bg-slate-900">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs text-left">
              <th className="px-4 py-3 font-semibold">Usuário</th>
              <th className="px-4 py-3 font-semibold">Função / Cargo</th>
              <th className="px-4 py-3 font-semibold text-right">Ações de Segurança</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
            {users.map((user) => {
              const isSelf = user.username === currentUsername;
              return (
                <tr key={user.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 font-bold text-[10px] flex items-center justify-center text-slate-700 dark:text-slate-200">
                      {user.username.slice(0, 2).toUpperCase()}
                    </span>
                    <span>{user.username}</span>
                    {isSelf && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Você
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(event) => handleAlterarRole(user.id, event.target.value)}
                      className={SELECT_CLASSES}
                    >
                      {Array.from(new Set([...listaCargos, user.role])).map((roleName) => (
                        <option key={roleName} value={roleName}>
                          {roleName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setUsuarioReset(user);
                          setSenhaIndividual("");
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-purple-300 dark:border-purple-600 px-2.5 py-1 text-xs font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors cursor-pointer"
                        title="Redefinir senha deste usuário"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Redefinir Senha
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemover(user.id)}
                        disabled={isSelf}
                        className="inline-flex items-center gap-1 rounded-md border border-red-300 dark:border-red-500/50 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        title={isSelf ? "Não é possível remover sua própria conta" : "Remover usuário"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Card Novo Usuário */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-5 bg-white dark:bg-slate-900 shadow-xs space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-emerald-600" />
          Cadastrar Novo Usuário
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            placeholder="Nome de usuário"
            value={novoUsername}
            onChange={(event) => setNovoUsername(event.target.value)}
            className={INPUT_CLASSES}
          />
          <input
            placeholder="Senha inicial"
            type="password"
            value={novaSenha}
            onChange={(event) => setNovaSenha(event.target.value)}
            className={INPUT_CLASSES}
          />
          <select
            value={novoRole}
            onChange={(event) => setNovoRole(event.target.value)}
            className={SELECT_CLASSES}
          >
            {listaCargos.map((roleName) => (
              <option key={roleName} value={roleName}>
                {roleName}
              </option>
            ))}
          </select>
          <button
            onClick={handleCriar}
            className="rounded-md bg-slate-900 dark:bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 dark:hover:bg-emerald-500 shadow-xs cursor-pointer"
          >
            Cadastrar Usuário
          </button>
        </div>
      </div>

      {/* Modal Redefinir Senha Individual */}
      {usuarioReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Redefinir Senha de Usuário
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Definindo nova senha para <strong>{usuarioReset.username}</strong>
                </p>
              </div>
            </div>

            <form onSubmit={handleResetIndividual} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nova Senha para {usuarioReset.username} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showSenhaIndividual ? "text" : "password"}
                    value={senhaIndividual}
                    onChange={(e) => setSenhaIndividual(e.target.value)}
                    placeholder="Digite a nova senha (mín. 4 caracteres)"
                    required
                    autoFocus
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 pr-10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-950 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenhaIndividual(!showSenhaIndividual)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showSenhaIndividual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUsuarioReset(null)}
                  disabled={salvandoIndividual}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoIndividual || senhaIndividual.length < 4}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {salvandoIndividual ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Confirmar Senha
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Redefinir Senhas em Massa */}
      {modalMassaAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Redefinição em Massa de Senhas
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Define uma senha padrão para todos os usuários do sistema.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <strong>Atenção:</strong> Sua própria conta (<code>{currentUsername}</code>) permanecerá inalterada para
              manter seu acesso. Todos os demais usuários terão a senha substituída pela senha padrão abaixo.
            </div>

            <div className="space-y-2 pt-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Senha Padrão que será aplicada a todos:
              </label>
              <input
                type="text"
                value={senhaPadraoEmMassa}
                onChange={(e) => setSenhaPadraoEmMassa(e.target.value)}
                placeholder="Ex: Gestamp@2026"
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-950"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModalMassaAberto(false)}
                disabled={salvandoMassa}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetEmMassa}
                disabled={salvandoMassa || senhaPadraoEmMassa.length < 4}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {salvandoMassa ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Confirmar Redefinição em Massa
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
