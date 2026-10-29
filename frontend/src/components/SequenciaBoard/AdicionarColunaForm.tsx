import { useState } from "react";

interface AdicionarColunaFormProps {
  onCriar: (nome: string) => void;
}

export function AdicionarColunaForm({ onCriar }: AdicionarColunaFormProps) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");

  return (
    <div className="w-72 flex-shrink-0">
      {criando ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/50">
          <input
            autoFocus
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="Nome da coluna"
            className="mb-2 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (nome.trim()) {
                  onCriar(nome.trim());
                  setNome("");
                  setCriando(false);
                }
              }}
              className="rounded bg-slate-900 dark:bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-slate-700 dark:hover:bg-indigo-500"
            >
              Criar
            </button>
            <button
              onClick={() => {
                setCriando(false);
                setNome("");
              }}
              className="rounded px-3 py-1 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCriando(true)}
          className="flex h-12 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          + Adicionar coluna
        </button>
      )}
    </div>
  );
}
