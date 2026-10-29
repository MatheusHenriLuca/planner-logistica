import { useState } from "react";
import {
  BookOpen,
  SlidersHorizontal,
  Kanban,
  Clock,
  Wrench,
  Layers,
  BarChart3,
  Settings,
  Code2,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Factory,
  Radio,
  FileSpreadsheet,
  PlusCircle,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { API_BASE_URL } from "../services/api/core";

interface ContextoDoc {
  id: string;
  numero: string;
  titulo: string;
  subtitulo: string;
  categoria: string;
  icone: React.ComponentType<{ className?: string }>;
}

const CONTEXTOS: ContextoDoc[] = [
  {
    id: "visao-geral",
    numero: "00",
    titulo: "Visão Geral & Arquitetura",
    subtitulo: "Conceito Lean TPS, Máquinas de Estado e Comunicação em Tempo Real",
    categoria: "Arquitetura",
    icone: BookOpen,
  },
  {
    id: "programacao",
    numero: "01",
    titulo: "Programação de Patan",
    subtitulo: "Tabela A (Staging), Lote Fixo vs Carga Máquina, Cascata e Envio",
    categoria: "Operação PCP",
    icone: SlidersHorizontal,
  },
  {
    id: "producao",
    numero: "02",
    titulo: "Produção & Chão de Fábrica",
    subtitulo: "Tabela B, Regra do Card 0, Apontamento de Peças e Quebras",
    categoria: "Chão de Fábrica",
    icone: Kanban,
  },
  {
    id: "seisan-kanriban",
    numero: "03",
    titulo: "Seisan Kanriban",
    subtitulo: "Gantt Triplo (Teórico vs Programado vs Realizado) e Régua Eixo X",
    categoria: "Controle Visual",
    icone: Clock,
  },
  {
    id: "ferramentaria",
    numero: "04",
    titulo: "Ferramentaria & Preventivas",
    subtitulo: "Kanban Operacional de 5 Estágios, Semáforo de Preventivas e Tryout",
    categoria: "Manutenção",
    icone: Wrench,
  },
  {
    id: "visualizacao-patan",
    numero: "05",
    titulo: "Visualização do Patan",
    subtitulo: "Receita Mestre Teórica: Ciclo de 8 Dias (Solda) e 64 Dias (Estamparia)",
    categoria: "Padrão Industrial",
    icone: Layers,
  },
  {
    id: "dashboard-calendario",
    numero: "06",
    titulo: "Dashboard & Calendário",
    subtitulo: "KPIs de Aderência ao Plano, Throughput por Posto e Visão Mensal",
    categoria: "Gestão & Métricas",
    icone: BarChart3,
  },
  {
    id: "parametros-usuarios",
    numero: "07",
    titulo: "Parâmetros & Usuários",
    subtitulo: "Configuração de Turnos e Almoço, Matriz RBAC e Gestão de Linhas",
    categoria: "Administração",
    icone: Settings,
  },
  {
    id: "api-swagger",
    numero: "08",
    titulo: "Referência de APIs (Swagger)",
    subtitulo: "Endpoints REST, Payloads de Exemplo, Protocolo WebSocket e OpenAPI",
    categoria: "Integrações & TI",
    icone: Code2,
  },
];

interface ApiEndpoint {
  metodo: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  caminho: string;
  descricao: string;
  acesso: string;
  payloadExemplo?: string;
  respostaExemplo?: string;
}

const ENDPOINTS_API: ApiEndpoint[] = [
  {
    metodo: "GET",
    caminho: "/producao/tabela-b",
    descricao: "Retorna o sequenciamento oficial de produção da Tabela B para uma linha e data específica.",
    acesso: "Autenticado (Todos os perfis)",
    respostaExemplo: `[
  {
    "id": 101,
    "linha": "LINHA 1",
    "turno": 1,
    "patan": "A",
    "posto_trabalho": "SB6A",
    "material": "PEC-5510",
    "sequencia": 1,
    "hora_inicial": "2026-10-20T06:20:00",
    "hora_final": "2026-10-20T07:15:00",
    "kanbans": 2,
    "qtd_por_kanban": 40,
    "em_producao": false
  }
]`,
  },
  {
    metodo: "POST",
    caminho: "/producao/sequencia/enviar",
    descricao: "Persiste o lote de itens da Tabela A (Staging) na Tabela B e dispara evento WebSocket para a fábrica.",
    acesso: "admin, programador",
    payloadExemplo: `[
  {
    "linha": "LINHA 1",
    "turno": 1,
    "patan": "A",
    "posto_trabalho": "SB6A",
    "material": "PEC-5510",
    "sequencia": 1,
    "kanbans": 2,
    "qtd_por_kanban": 40,
    "tempo_por_peca_minutos": 0.12,
    "status": 2
  }
]`,
  },
  {
    metodo: "PATCH",
    caminho: "/producao/itens/{id}/iniciar-producao",
    descricao: "Marca o item como em produção ativa (em_producao = true). Válido apenas para o topo da fila (índice 0).",
    acesso: "Autenticado (Operador, Programador, Admin)",
  },
  {
    metodo: "PATCH",
    caminho: "/producao/itens/{id}/concluir-producao",
    descricao: "Registra o apontamento de conclusão com quantidade de peças produzidas e move para 'Concluídas'.",
    acesso: "Autenticado",
    payloadExemplo: `{
  "quantidade_produzida": 80,
  "observacoes": "Lote finalizado dentro do tempo padrão."
}`,
  },
  {
    metodo: "PATCH",
    caminho: "/producao/itens/{id}/quebra-ferramenta",
    descricao: "Aponta parada por quebra/avaria, move o item para 'Quebra' e abre automaticamente O.S. na Ferramentaria.",
    acesso: "Autenticado",
    payloadExemplo: `{
  "quantidade_produzida": 32,
  "motivo": "Trinca na matriz superior durante estampagem do op 20."
}`,
  },
  {
    metodo: "POST",
    caminho: "/producao/inserir-card",
    descricao: "Injeta ordem de emergência na Tabela B e empurra cronologicamente em cascata os lotes seguintes.",
    acesso: "admin, programador",
    payloadExemplo: `{
  "linha": "LINHA 1",
  "turno": 1,
  "patan": "A",
  "posto_trabalho": "SB6A",
  "material": "URG-9000",
  "hora_inicial": "2026-10-20T09:00:00",
  "kanbans": 1,
  "qtd_por_kanban": 20,
  "tempo_por_peca_minutos": 0.15
}`,
  },
  {
    metodo: "GET",
    caminho: "/ferramentaria/catalogo",
    descricao: "Lista o catálogo completo de moldes e matrizes com status de preventiva calculado em tempo real.",
    acesso: "Autenticado",
  },
  {
    metodo: "POST",
    caminho: "/ferramentaria/catalogo/{id}/abrir-preventiva",
    descricao: "Abre manutenção preventiva para a ferramenta, gerando a O.S. e bloqueando o material no Patan.",
    acesso: "admin, programador_ferramentaria",
  },
  {
    metodo: "DELETE",
    caminho: "/producao/limpar-producao",
    descricao: "Limpa as ordens da linha/turno da Tabela B para facilitar testes e redefinições de ambiente.",
    acesso: "Exclusivo Admin",
  },
];

export function Documentacao() {
  const [contextoAtivo, setContextoAtivo] = useState<string>("visao-geral");
  const [termoBusca, setTermoBusca] = useState<string>("");
  const [filtroMetodo, setFiltroMetodo] = useState<string>("TODOS");

  const contextoSelecionado =
    CONTEXTOS.find((c) => c.id === contextoAtivo) ?? CONTEXTOS[0];

  const endpointsFiltrados = ENDPOINTS_API.filter((ep) => {
    const matchMetodo = filtroMetodo === "TODOS" || ep.metodo === filtroMetodo;
    const matchTexto =
      !termoBusca ||
      ep.caminho.toLowerCase().includes(termoBusca.toLowerCase()) ||
      ep.descricao.toLowerCase().includes(termoBusca.toLowerCase());
    return matchMetodo && matchTexto;
  });

  const getMetodoBadgeClass = (metodo: string) => {
    switch (metodo) {
      case "GET":
        return "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
      case "POST":
        return "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
      case "PATCH":
        return "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
      case "DELETE":
        return "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800";
      default:
        return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200";
    }
  };

  return (
    <div className="w-full px-4 sm:px-6 py-6 min-h-[calc(100vh-4rem)] max-w-7xl mx-auto">
      {/* Header Executivo da Documentação */}
      <div className="mb-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl border shadow-2xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800">
              <BookOpen className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Central de Documentação & Suporte Técnico
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Contextos Modulares
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Guia operacional Lean TPS, referência de telas, regras de negócio e catálogo de APIs REST / WebSockets.
              </p>
            </div>
          </div>

          {/* Links Externos Rápidos */}
          <div className="flex items-center gap-2.5">
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
            >
              <Code2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Swagger UI (FastAPI)</span>
              <ExternalLink className="w-3 h-3 opacity-60 ml-0.5" />
            </a>
            <a
              href="http://localhost:8000/redoc"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
            >
              <span>ReDoc</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
          </div>
        </div>
      </div>

      {/* Grid de 2 Colunas: Sidebar de Contextos + Painel Principal de Leitura */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Navegador de Contextos (4/12) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <div className="mb-3 px-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Contextos por Tela
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              9 módulos
            </span>
          </div>

          <div className="space-y-1.5">
            {CONTEXTOS.map((ctx) => {
              const Icone = ctx.icone;
              const isAtivo = ctx.id === contextoAtivo;
              return (
                <button
                  key={ctx.id}
                  type="button"
                  onClick={() => setContextoAtivo(ctx.id)}
                  className={`w-full text-left rounded-xl p-3 transition-all flex items-start gap-3 cursor-pointer ${
                    isAtivo
                      ? "bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 shadow-2xs"
                      : "border border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                      isAtivo
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <Icone className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-xs font-bold truncate ${
                          isAtivo
                            ? "text-indigo-900 dark:text-indigo-200"
                            : "text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {ctx.numero}. {ctx.titulo}
                      </span>
                      <span className="text-[9px] uppercase font-semibold text-slate-400 dark:text-slate-500 shrink-0">
                        {ctx.categoria}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                      {ctx.subtitulo}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Coluna Direita: Conteúdo do Contexto Selecionado (8/12) */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
          {/* Topo do Contexto Ativo */}
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4 mb-6">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1">
              <span>MÓDULO {contextoSelecionado.numero}</span>
              <span>•</span>
              <span className="uppercase">{contextoSelecionado.categoria}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {contextoSelecionado.titulo}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {contextoSelecionado.subtitulo}
            </p>
          </div>

          {/* Renderização Condicional por Contexto */}
          {contextoAtivo === "visao-geral" && (
            <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>1. Filosofia Lean TPS e Segregação Setorial</span>
                </h3>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  O sistema gerencia o fluxo de valor contínuo da fábrica com base na demanda puxada (Kanban), operando de forma totalmente independente entre dois setores industriais:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5">
                    <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300 text-xs">
                      <Zap className="w-4 h-4 text-emerald-600" />
                      <span>Setor Solda (solda)</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-normal">
                      Ciclo padrão de 8 dias com Patans de <strong>A a H</strong>. Células de solda automatizadas (ex: SB6A) com sequenciamento contínuo em cascata.
                    </p>
                  </div>
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-3.5">
                    <div className="flex items-center gap-2 font-bold text-indigo-800 dark:text-indigo-300 text-xs">
                      <Factory className="w-4 h-4 text-indigo-600" />
                      <span>Setor Estamparia (estamparia)</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-normal">
                      Ciclo de 64 dias com 56 patans oficiais de <strong>A a P</strong> com sub-patans numéricos. Prensas pesadas em tandem e coluna integrada de Tryout.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                  <span>2. As Duas Tabelas Fundamentais (Staging vs Produção)</span>
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="p-3 border-b border-slate-200 dark:border-slate-700 font-bold">Conceito</th>
                        <th className="p-3 border-b border-slate-200 dark:border-slate-700 font-bold">Tabela A (producao_staging)</th>
                        <th className="p-3 border-b border-slate-200 dark:border-slate-700 font-bold">Tabela B (producao)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-400">
                      <tr>
                        <td className="p-3 font-semibold text-slate-900 dark:text-slate-200">Tela / Ambiente</td>
                        <td className="p-3">Programação (/programacao)</td>
                        <td className="p-3">Produção (/) e Seisan Kanriban</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-slate-900 dark:text-slate-200">Natureza</td>
                        <td className="p-3">Rascunho de simulação, flexível</td>
                        <td className="p-3">Oficial, persistida, imutável pós-envio</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-slate-900 dark:text-slate-200">Usuário Típico</td>
                        <td className="p-3">Programador PCP / Admin</td>
                        <td className="p-3">Operadores e Líderes de Linha</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-slate-900 dark:text-slate-200">Exceção de Edição</td>
                        <td className="p-3">Edição livre de kanbans, remoção</td>
                        <td className="p-3">Apenas Ordem de Emergência (em cascata)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
                  <span>3. Sincronização em Tempo Real (WebSocket)</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  O endpoint <code>/ws/producao</code> conecta todos os operadores de chão de fábrica e computadores do PCP simultaneamente. Ao enviar um novo lote, apontar peças ou registrar quebra, o servidor dispara broadcast em tempo real, atualizando a interface instantaneamente sem reload.
                </p>
              </div>
            </div>
          )}

          {contextoAtivo === "programacao" && (
            <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
                  <span>1. Operação do Cockpit de Programação</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  O cockpit superior organiza as operações em 2 níveis para evitar poluição visual:
                </p>
                <ul className="list-disc pl-5 text-xs space-y-1.5 mt-2 text-slate-600 dark:text-slate-400">
                  <li><strong>Ações Primárias</strong>: Botão único oficial <code>Enviar lote</code> (esmeralda), contador pulsante de <code>Itens Críticos</code> e menu colapsável <code>Ações e Ferramentas ▾</code>.</li>
                  <li><strong>Ações Secundárias Colapsadas</strong>: <code>+ Inserir Card</code>, <code>Montar Padrão</code> (recarga do teórico), <code>Limpar Linha</code>, <code>Sincronizar SAP</code> e <code>Sincronizar Excel</code>.</li>
                  <li><strong>Dimensionamento de Lote</strong>: Alternador entre <strong>Lote Fixo</strong> (Patan padrão) e <strong>Estoque Máximo</strong> (Carga Máquina).</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>2. Regras de Ouro da Cascata de Horários</span>
                </h3>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                  <p>• <strong>Início Fixo de Turno</strong>: 1º Turno às <code>06:20</code>, 2º Turno às <code>14:40</code> e 3º Turno às <code>23:00</code>.</p>
                  <p>• <strong>Continuidade Contínua</strong>: O item com <code>sequencia == 1</code> começa no início do turno; todo item seguinte herda exatamente o horário de término do anterior: <code>hora_inicial[n] = hora_final[n-1]</code>.</p>
                  <p>• <strong>Pausa de Refeição (+40m)</strong>: Se a janela de produção de um lote cruzar o horário configurado de almoço, soma +40 minutos ao seu término uma única vez e exibe o selo <code>HORARIO DE ALMOCO INCLUSO</code>.</p>
                  <p>• <strong>Remoção Flexível de Cards</strong>: Clicar no <code>✕</code> retira o card da fila daquele lote e recalcula a cascata dos itens seguintes automaticamente.</p>
                </div>
              </div>

              <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/20 p-4 text-xs">
                <div className="flex items-center gap-2 font-bold text-red-800 dark:text-red-300 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span>Trava de Segurança: Ferramentas em Manutenção</span>
                </div>
                <p className="text-red-700 dark:text-red-400">
                  Se qualquer peça do lote exigir uma matriz que esteja com O.S. aberta na Ferramentaria (status $\ne$ `disponivel`), o card exibe tarja vermelha e o envio do lote é estritamente bloqueado (HTTP 400).
                </p>
              </div>
            </div>
          )}

          {contextoAtivo === "producao" && (
            <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <Kanban className="w-4 h-4 text-emerald-500" />
                  <span>1. Regra da Posição 0 (Topo da Fila)</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Para garantir a disciplina operacional Lean, o botão <strong>`▶ Iniciar Produção`</strong> só é habilitado para o <strong>primeiro card (índice 0)</strong> de cada posto. Se o operador precisar produzir um lote adiantado, é obrigado a arrastá-lo para o topo da coluna.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                  <span>2. Apontamentos Chão de Fábrica</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20">
                    <strong className="text-emerald-900 dark:text-emerald-300 block mb-1">✓ Concluir Lote</strong>
                    <p className="text-slate-600 dark:text-slate-400 leading-normal">
                      Exige preenchimento obrigatório da quantidade de peças produzidas (&gt; 0). Move automaticamente o lote para a coluna extra &quot;Concluídas&quot;.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20">
                    <strong className="text-amber-900 dark:text-amber-300 block mb-1">⚠️ Apontar Quebra</strong>
                    <p className="text-slate-600 dark:text-slate-400 leading-normal">
                      Registra as peças produzidas até a falha, move para a coluna &quot;Quebra de Máquina&quot; e <strong>abre automaticamente uma O.S. corretiva na Ferramentaria</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-blue-500" />
                  <span>3. Inserção de Ordem de Emergência</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  A Tabela B é imutável após enviada, com uma única exceção: <strong>Ordem de Emergência</strong> (restrita a Programador e Admin). O sistema injeta o lote urgente no horário programado e <strong>empurra automaticamente todos os lotes regulares posteriores em cascata</strong>, recalculando os términos com pausas de refeição respeitadas.
                </p>
              </div>
            </div>
          )}

          {contextoAtivo === "seisan-kanriban" && (
            <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  <span>1. As Três Faixas do Gantt Triplo</span>
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                    <strong className="text-slate-900 dark:text-slate-100">Faixa 1 — Patan Teórico (Baseline):</strong> Receita mestre do ciclo com produtos e tempos de ciclo padrão imutáveis.
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                    <strong className="text-slate-900 dark:text-slate-100">Faixa 2 — Programado (Tabela B):</strong> O planejamento acordado pelo PCP com ajustes de kanban e janelas horárias.
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                    <strong className="text-slate-900 dark:text-slate-100">Faixa 3 — Realizado (Chão de Fábrica):</strong> Barras verdes para lotes concluídos, azul pulsante para produção ao vivo, e vermelho encurtado para quebras com <strong>GAP visual livre</strong> até o final planejado.
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>2. Recursos Visuais & Layout Anti-Colisão</span>
                </h3>
                <ul className="list-disc pl-5 text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
                  <li><strong>Régua Temporal Unificada no Eixo X</strong>: Linhas verticais cruzam as 3 faixas com rolagem contínua.</li>
                  <li><strong>Coluna Lateral Congelada (sticky left-0)</strong>: Mantém a identificação das faixas e do posto sempre visível em zooms detalhados.</li>
                  <li><strong>Layout Anti-Colisão</strong>: Lotes concluídos em rápida sucessão recebem largura mínima de 48px e não se sobrepõem. Lotes curtos (&lt; 120s) exibem o selo <code>⚡ Xs</code>.</li>
                  <li><strong>Zoom Interativo</strong>: De 6h até 1 min com suporte a <code>Ctrl + Scroll</code> no mouse.</li>
                </ul>
              </div>
            </div>
          )}

          {contextoAtivo === "ferramentaria" && (
            <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-500" />
                  <span>1. Ciclo de Vida do Kanban de Manutenção</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30">
                    <span className="block font-bold text-red-800 dark:text-red-300">1. Corretiva</span>
                    <span className="text-[10px] text-slate-500">Quebras</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
                    <span className="block font-bold text-amber-800 dark:text-amber-300">2. Preventiva</span>
                    <span className="text-[10px] text-slate-500">Agendada</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30">
                    <span className="block font-bold text-yellow-800 dark:text-yellow-300">3. Em Bancada</span>
                    <span className="text-[10px] text-slate-500">Em reparo</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30">
                    <span className="block font-bold text-blue-800 dark:text-blue-300">4. Tryout</span>
                    <span className="text-[10px] text-slate-500">Testes Prensa</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30">
                    <span className="block font-bold text-emerald-800 dark:text-emerald-300">5. Disponível</span>
                    <span className="text-[10px] text-slate-500">Liberada</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>2. Catálogo & Semáforo de Preventivas</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Cada molde possui periodicidade em dias e data da última intervenção. O semáforo indica:
                </p>
                <div className="flex flex-wrap gap-2 text-xs mt-2">
                  <span className="px-2.5 py-1 rounded-md bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 font-bold">
                    🔴 Vencida (≤ 0 dias)
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold">
                    🟡 Próxima (1 a 7 dias)
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                    🟢 Em dia (&gt; 7 dias)
                  </span>
                </div>
              </div>
            </div>
          )}

          {contextoAtivo === "visualizacao-patan" && (
            <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span>1. Baseline Lean Imutável</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  A tela de Visualização do Patan exibe a receita mestre e a composição teórica dos produtos. Serve como fonte da verdade para auditorias de processo e conferência de tempos padrão de ciclo.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
                <p>• <strong>Setor Solda</strong>: Ciclo de 8 dias (letras A até H). 1 dia por Patan.</p>
                <p>• <strong>Setor Estamparia</strong>: Ciclo de 64 dias (56 patans oficiais, de A até P com sub-patans numéricos). Suporte a strings de até 10 caracteres no banco de dados.</p>
              </div>
            </div>
          )}

          {contextoAtivo === "dashboard-calendario" && (
            <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500" />
                  <span>1. Métricas do Dashboard (/dashboard)</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  O dashboard consolida em tempo real:
                </p>
                <ul className="list-disc pl-5 text-xs space-y-1.5 mt-2 text-slate-600 dark:text-slate-400">
                  <li><strong>Aderência ao Plano (%)</strong>: Volume produzido vs volume planejado na Tabela B.</li>
                  <li><strong>Taxa de Itens Críticos (%)</strong>: Percentual de materiais em quarentena na linha.</li>
                  <li><strong>Throughput por Posto</strong>: Ritmo de peças entregues por posto de trabalho.</li>
                  <li><strong>Paradas & Quebras</strong>: Quantidade de ordens de serviço geradas por quebra de máquina.</li>
                </ul>
              </div>
            </div>
          )}

          {contextoAtivo === "parametros-usuarios" && (
            <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-indigo-500" />
                  <span>1. Parâmetros Operacionais Configuráveis</span>
                </h3>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/60 text-xs space-y-2">
                  <p>• <strong>Inícios de Turno</strong>: 1º Turno (06:20), 2º Turno (14:40) e 3º Turno (23:00).</p>
                  <p>• <strong>Refeições</strong>: 1º Turno (10:20), 2º Turno (18:40), 3º Turno (03:00) com duração configurável (padrão: 40 min).</p>
                  <p>• <strong>Linhas por Setor</strong>: Permite cadastrar e associar linhas diretamente a Solda ou Estamparia.</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>2. Matriz RBAC e Permissões Granulares</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Cargos disponíveis: <code>admin</code>, <code>programador</code>, <code>programador_ferramentaria</code> e <code>usuario_comum</code> (Operador). Permissões dinâmicas: <code>pode_ver_solda</code>, <code>pode_ver_estamparia</code>, <code>pode_gerenciar_linhas</code>, <code>pode_gerenciar_ferramentaria</code>.
                </p>
              </div>
            </div>
          )}

          {contextoAtivo === "api-swagger" && (
            <div className="space-y-6">
              {/* Banner de Acesso Direto ao Swagger UI Interativo */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-indigo-500/10 to-purple-500/10 border border-indigo-200/80 dark:border-indigo-900/50 shadow-xs">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Swagger UI & OpenAPI Oficial da API</span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Documentação interativa com execução de requisições ao vivo, schemas Pydantic e especificação OpenAPI 3.0.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`${API_BASE_URL}/docs`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer hover:shadow-md"
                  >
                    <span>Abrir Swagger UI (/docs)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={`${API_BASE_URL}/redoc`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <span>ReDoc</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Controles de Busca e Filtro de Método */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={termoBusca}
                    onChange={(e) => setTermoBusca(e.target.value)}
                    placeholder="Filtrar endpoints por caminho ou descrição..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {["TODOS", "GET", "POST", "PATCH", "DELETE"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFiltroMetodo(m)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        filtroMetodo === m
                          ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista de Endpoints Estilo Swagger */}
              <div className="space-y-3">
                {endpointsFiltrados.map((ep, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 shadow-2xs space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 font-mono text-xs">
                        <span
                          className={`px-2.5 py-0.5 rounded-md font-bold uppercase border text-[11px] ${getMetodoBadgeClass(
                            ep.metodo
                          )}`}
                        >
                          {ep.metodo}
                        </span>
                        <strong className="text-slate-900 dark:text-slate-100">
                          {ep.caminho}
                        </strong>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        {ep.acesso}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {ep.descricao}
                    </p>

                    {ep.payloadExemplo && (
                      <div className="mt-2">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                          Payload de Exemplo (JSON):
                        </span>
                        <pre className="rounded-lg bg-slate-950 p-2.5 text-[11px] font-mono text-emerald-400 overflow-x-auto">
                          {ep.payloadExemplo}
                        </pre>
                      </div>
                    )}

                    {ep.respostaExemplo && (
                      <div className="mt-2">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                          Resposta de Sucesso (JSON):
                        </span>
                        <pre className="rounded-lg bg-slate-950 p-2.5 text-[11px] font-mono text-blue-400 overflow-x-auto">
                          {ep.respostaExemplo}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
