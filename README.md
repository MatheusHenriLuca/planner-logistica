# plannerLogistica

Sistema web de sequenciamento de produção Kanban para a fábrica da **Gestamp**. Substitui um
fluxo legado baseado em Power Apps + SharePoint + Power Automate + Microsoft Planner (que sofria
com throttling de API e limites de delegação) por uma aplicação própria: backend + frontend +
banco relacional rodando na intranet da empresa.

Projeto da área de Melhoria Contínua (LEAN/TPS). Requisitos originais em
[`requisitosBases/requisitos.md`](requisitosBases/requisitos.md).

## O que o sistema faz

1. **Staging (Tabela A)** recebe o dump diário de estoque/demanda vindo do SAP (hoje via
   automação desktop legada — veja [`AGENTS.md`](AGENTS.md)).
2. Na tela **Programação**, o programador (papel `admin` ou `programador`) organiza a sequência
   de cada posto de trabalho, ajusta kanbans e simula os horários — tudo isso acontece **em
   memória no frontend**, sem gravar nada no banco.
3. Ao confirmar o envio, o lote é persistido na **Tabela B** (`producao`), o Kanban oficial e
   imutável — os horários calculados nesse momento (`hora_inicial`/`hora_final`) nunca mais são
   recalculados.
4. As telas **Produção**, **Dashboard** e **Calendário** leem exclusivamente a Tabela B, sempre
   atualizadas em tempo real via WebSocket quando alguém envia um novo lote, reordena um item ou
   move um item para uma coluna extra.
5. Cada item tem um cartão com **checklist, labels, comentários e anexos** (estilo Microsoft
   Planner), e pode ser organizado em **colunas extras** definidas pelo admin/programador (ex:
   "Quebra de Ferramenta", "Concluídas"), além das colunas fixas por posto de trabalho.

As regras de negócio completas (Patan, máquina de estados STATUS, cascata "escadinha", pausa de
almoço, Tabela A vs. Tabela B) estão documentadas em detalhe no [`AGENTS.md`](AGENTS.md) — leitura
obrigatória antes de alterar qualquer lógica de sequenciamento.

## 🚀 Execução Rápida no Servidor da Empresa (Docker / 1 Clique)

Para rodar todo o sistema (Banco pré-populado, Backend FastAPI e Frontend Nginx) no servidor corporativo com **1 duplo-clique**:

1. **No Windows / Servidor Windows**: dê duplo-clique em:
   ```bat
   iniciar_servidor.bat
   ```
2. **No Linux / Servidor Ubuntu**: execute:
   ```bash
   ./iniciar_servidor.sh
   ```

- **Acesso Web (Navegador ou TV Fabril)**: `http://<IP_DO_SERVIDOR>/` ou `http://localhost` (porta 80)
- **Documentação da API**: `http://<IP_DO_SERVIDOR>:8000/docs`
- **Guia Completo de Instalação e Migração Offline**: consulte [`docs/GUIA_DEPLOY_SERVIDOR.md`](docs/GUIA_DEPLOY_SERVIDOR.md).

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL via driver `psycopg` v3
  (não `psycopg2`), autenticação JWT (`python-jose`) + `passlib`/`bcrypt`, WebSocket nativo do
  FastAPI.
- **Frontend:** React 18 + Vite 5 + TypeScript, Tailwind CSS, `@tanstack/react-query` (cache/
  fetch), `@dnd-kit` (drag-and-drop do board Kanban), `react-router-dom`.
- **Testes:** `pytest` (backend), `vitest` + Testing Library (frontend).
- **Lint:** `ruff` (backend), `eslint` (frontend).

## Estrutura do repositório

```
plannerLogistica/
├── backend/                  # API FastAPI (Python 3.12)
│   ├── app/
│   │   ├── api/               # Routers HTTP, um arquivo por domínio (routes_*.py)
│   │   ├── core/               # Settings (env vars), JWT/hash, deps de auth (RBAC), WS manager
│   │   ├── db/                  # Engine/Session SQLAlchemy (lazy init)
│   │   ├── domain/               # Regras de negócio puras, sem DB/framework (sequenciamento,
│   │   │                         # status, patan, estoque)
│   │   ├── models/                # Modelos ORM (SQLAlchemy)
│   │   ├── repositories/           # Acesso a dados (Repository pattern)
│   │   └── schemas/                 # Schemas Pydantic (request/response)
│   ├── alembic/versions/      # Migrations (4 atualmente)
│   └── tests/                 # pytest: unit/ (11 arquivos) + integration/ (9 arquivos)
├── frontend/
│   └── src/
│       ├── auth/               # AuthContext (JWT)
│       ├── components/          # SequenciaBoard (board Kanban com DnD), ItemDetalhe
│       ├── hooks/                 # useProducaoWebSocket (tempo real)
│       ├── pages/                  # Producao, ProgramacaoPatan, Dashboard, Calendario,
│       │                           # GerenciamentoUsuarios
│       ├── routes/                  # AppRouter, Nav, RequireRole (guarda de rota por papel)
│       ├── services/api/             # Cliente HTTP, um arquivo por domínio
│       ├── state/                     # sequenciaReducer (cascata calculada no cliente)
│       └── types/
├── docs/
│   ├── ADMINISTRACAO.md        # Guia de administração/operação (este README complementa)
│   └── superpowers/            # Specs e planos de implementação de cada fase (histórico)
├── requisitosBases/            # Requisitos originais do negócio + scripts legados de SAP
│                                # (referência — veja o aviso no AGENTS.md)
├── AGENTS.md                    # Guia de continuação para IA/desenvolvedor
└── .claude/                     # Config específica do Claude Code — seguro ignorar, veja abaixo
```

## Pré-requisitos

- **Python 3.12** (o `.venv` deste ambiente local foi criado com `python3.12`, mas é
  git-ignorado — não vem do clone; o `pyproject.toml` aceita `>=3.11`).
- **PostgreSQL** 16 (usado neste ambiente via Homebrew; qualquer Postgres compatível com
  SQLAlchemy 2.x serve).
- **Node.js 18+** e npm (exigência do Vite 5 / Vitest 2; testado neste ambiente com Node
  v24.14.0 / npm 11.9.0).

## Configuração do zero

### 1. PostgreSQL local

Se ainda não existir localmente o banco e o usuário usados pelo projeto:

```bash
brew install postgresql@16
brew services start postgresql@16
createuser planner
createdb -O planner planner_logistica
```

Por padrão, o Postgres do Homebrew usa autenticação `trust` para conexões locais (sem senha) —
confirmado funcionando neste ambiente tanto por socket Unix quanto por TCP
(`psql -h 127.0.0.1 -U planner -d planner_logistica`). Isso é uma conveniência **de
desenvolvimento local**; em outro ambiente (ex: servidor da empresa) espere usuário/senha reais —
veja "Variáveis de ambiente" abaixo e [`docs/ADMINISTRACAO.md`](docs/ADMINISTRACAO.md).

### 2. Backend

```bash
cd backend
python3.12 -m venv .venv          # .venv é git-ignorado, não vem do clone
source .venv/bin/activate
pip install -e ".[dev]"
```

Variáveis de ambiente obrigatórias (o backend falha ao subir sem elas — `app/core/config.py`,
classe `Settings`, via `pydantic-settings`):

| Variável | Obrigatória | Default | Formato/exemplo |
|---|---|---|---|
| `DATABASE_URL` | Sim | — | `postgresql+psycopg://planner@localhost:5432/planner_logistica` (o prefixo `+psycopg` é obrigatório — o driver é psycopg **3**, não psycopg2) |
| `JWT_SECRET_KEY` | Sim | — | qualquer string em dev; gere uma com `python3 -c "import secrets; print(secrets.token_hex(32))"` |

Opcionais (`JWT_ALGORITHM`, `JWT_EXPIRE_MINUTES`, `CORS_ORIGINS`) e a lista completa com
explicação de cada uma estão em [`docs/ADMINISTRACAO.md`](docs/ADMINISTRACAO.md). Você pode
exportá-las no shell ou criar `backend/.env` (git-ignorado, lido automaticamente por
`pydantic-settings`):

```
DATABASE_URL=postgresql+psycopg://planner@localhost:5432/planner_logistica
JWT_SECRET_KEY=troque-por-um-valor-gerado
```

Rodar as migrations (4 hoje: `0001_initial`, `0002_producao_unique_sequencia`,
`0003_colaboracao_tables`, `0004_coluna_extra`):

```bash
alembic upgrade head
```

Subir o backend (porta 8000, com reload):

```bash
uvicorn app.main:app --reload --port 8000
```

Verifique em `http://localhost:8000/health` (`{"status": "ok"}`). A documentação interativa da
API (Swagger, gerada automaticamente pelo FastAPI) fica em `http://localhost:8000/docs`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre em `http://localhost:5173`. Se o backend não estiver em `localhost:8000`, crie
`frontend/.env.local` com `VITE_API_BASE_URL=http://host:porta` (usado tanto para as chamadas
REST quanto para derivar a URL do WebSocket).

### 4. Primeiro acesso (bootstrap do admin)

Não existe usuário padrão. Acesse `http://localhost:5173/register` — essa tela pública só
funciona **antes de existir qualquer usuário**: o primeiro `POST /auth/register` vira `admin`
automaticamente. A partir daí, novos usuários só podem ser criados por um `admin` autenticado
(tela "Usuários", em `/usuarios`) — veja [`docs/ADMINISTRACAO.md`](docs/ADMINISTRACAO.md).

### 5. Popular dados de teste (opcional)

Não existe um comando `seed` oficial. O jeito manual, direto pela sessão SQLAlchemy, está
detalhado em [`docs/ADMINISTRACAO.md`](docs/ADMINISTRACAO.md#popular-dados-de-teste-manualmente).

## Testes e lint

```bash
# Backend (não precisa do Postgres local rodando — tests/conftest.py cai para
# sqlite:///:memory: se DATABASE_URL não estiver setada)
cd backend && source .venv/bin/activate
python -m pytest -q        # baseline no momento desta doc: 100 passed
ruff check .                # baseline: limpo

# Frontend
cd frontend
npx vitest run              # baseline: 53 passed (equivalente a `npm test`)
npx tsc -b                  # type-check, sem emitir arquivos
npx eslint .                 # baseline: 0 erros, 3 warnings pré-existentes
                              # (react-refresh/only-export-components em
                              # AuthContext.tsx e Nav.tsx — não são bugs, podem ser ignorados)
```

## Documentação adicional

- [`docs/ADMINISTRACAO.md`](docs/ADMINISTRACAO.md) — gestão de usuários/RBAC, variáveis de
  ambiente completas, backup/restore do banco, popular dados de teste, troubleshooting, deploy.
- [`AGENTS.md`](AGENTS.md) — regras de negócio do domínio, decisões de arquitetura, convenções de
  código, estado atual e débito técnico conhecido. **Leitura obrigatória antes de qualquer
  mudança no sequenciamento.**
- [`docs/superpowers/`](docs/superpowers/) — specs e planos de implementação escritos durante o
  desenvolvimento de cada fase (histórico de design, não é preciso ler para rodar o projeto).
- [`requisitosBases/`](requisitosBases/) — requisitos de negócio originais e scripts legados de
  automação SAP (referência; veja o aviso sobre esse diretório em [`AGENTS.md`](AGENTS.md)).

## Sobre a pasta `.claude/`

O repositório contém uma pasta `.claude/` com configuração específica do **Claude Code**
(hooks, agentes, regras, memória de sessão) usada durante o desenvolvimento assistido por IA
deste projeto. Ela **não afeta o funcionamento da aplicação** e não precisa ser lida, entendida
ou replicada para continuar o projeto com qualquer outra ferramenta (incluindo Antigravity ou
qualquer IDE/agente de IA). É seguro ignorar essa pasta inteira.
