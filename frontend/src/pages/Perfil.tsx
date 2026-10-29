import { useState } from "react";
import { User, Shield, KeyRound, CheckCircle2, AlertCircle, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthContext";
import { trocarSenha } from "../services/api/auth";

export function Perfil() {
  const { username, role, permissoes, token, logout } = useAuth();

  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  const handleTrocarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!senhaAtual || !novaSenha) {
      toast.error("Preencha todos os campos de senha.");
      return;
    }

    if (novaSenha.length < 4) {
      toast.error("A nova senha deve ter pelo menos 4 caracteres.");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      toast.error("A nova senha e a confirmação não coincidem.");
      return;
    }

    try {
      setCarregando(true);
      const res = await trocarSenha(token, {
        senha_atual: senhaAtual,
        nova_senha: novaSenha,
      });
      toast.success(res.mensagem || "Senha alterada com sucesso!");
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao alterar senha. Verifique a senha atual.");
    } finally {
      setCarregando(false);
    }
  };

  const getRoleBadge = (r: string | null) => {
    switch (r) {
      case "admin":
        return { label: "Administrador Geral", color: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800" };
      case "programador":
        return { label: "Programador de PCP", color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800" };
      case "operador_solda":
        return { label: "Operador de Solda", color: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800" };
      case "operador_estamparia":
        return { label: "Operador de Estamparia", color: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800" };
      case "programador_ferramentaria":
        return { label: "Ferramentaria", color: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800" };
      default:
        return { label: r || "Usuário", color: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" };
    }
  };

  const badge = getRoleBadge(role);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 shadow-inner">
            <User className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {username || "Usuário"}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.color}`}>
                <Shield className="w-3 h-3 mr-1" />
                {badge.label}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:border-rose-900 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Encerrar Sessão
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Card de Permissões */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Suas Permissões Ativas
            </h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Recursos e módulos habilitados para a sua conta no sistema:
          </p>
          <div className="space-y-2.5 text-sm">
            <PermissaoItem label="Visualizar Solda" ativo={Boolean(permissoes?.pode_ver_solda)} />
            <PermissaoItem label="Visualizar Estamparia" ativo={Boolean(permissoes?.pode_ver_estamparia)} />
            <PermissaoItem label="Sequenciar e Programar Patan" ativo={Boolean(permissoes?.pode_programar)} />
            <PermissaoItem label="Iniciar e Apontar Produção" ativo={Boolean(permissoes?.pode_iniciar_producao)} />
            <PermissaoItem label="Reordenar Board de Produção" ativo={Boolean(permissoes?.pode_reordenar_producao)} />
            <PermissaoItem label="Mover para Buckets / Colunas Extras" ativo={Boolean(permissoes?.pode_mover_colunas)} />
            <PermissaoItem label="Gerenciar Colunas Extras" ativo={Boolean(permissoes?.pode_gerenciar_colunas)} />
            <PermissaoItem label="Importar Base SAP / Excel" ativo={Boolean(permissoes?.pode_importar_sap)} />
            <PermissaoItem label="Configurar Parâmetros Fabris" ativo={Boolean(permissoes?.pode_configurar_parametros)} />
            <PermissaoItem label="Gerenciamento de Ferramentaria" ativo={Boolean(permissoes?.pode_gerenciar_ferramentaria)} />
            <PermissaoItem label="Administração de Usuários" ativo={Boolean(permissoes?.pode_gerenciar_usuarios)} />
          </div>
        </div>

        {/* Card de Alteração de Senha */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Alterar Senha
            </h2>
          </div>
          <form onSubmit={handleTrocarSenha} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Senha Atual
              </label>
              <input
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                placeholder="Digite sua senha atual"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nova Senha
              </label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Mínimo de 4 caracteres"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Confirmar Nova Senha
              </label>
              <input
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={carregando}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50 mt-2"
            >
              {carregando ? "Alterando..." : "Salvar Nova Senha"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function PermissaoItem({ label, ativo }: { label: string; ativo: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-700/60 last:border-none">
      <span className="text-slate-700 dark:text-slate-300">{label}</span>
      {ativo ? (
        <span className="inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4 mr-1" />
          Permitido
        </span>
      ) : (
        <span className="inline-flex items-center text-xs text-slate-400 dark:text-slate-500">
          <AlertCircle className="w-3.5 h-3.5 mr-1" />
          Não habilitado
        </span>
      )}
    </div>
  );
}
