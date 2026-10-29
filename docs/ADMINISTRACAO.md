# Administração e Operação

Guia para quem administra a instância do plannerLogistica: gestão de usuários/papéis, variáveis
de ambiente, backup/restore, dados de teste, troubleshooting e o que muda ao ir para produção.
Para setup inicial de desenvolvimento, veja o [`README.md`](../README.md). Para regras de negócio
e arquitetura, veja o [`AGENTS.md`](../AGENTS.md).

## Gestão de usuários e papéis (RBAC)

Três papéis, definidos em `backend/app/models/user.py` (`Role` enum): **`admin`**,
**`programador`**, **`usuario_comum`**. O papel de cada usuário fica gravado na tabela `users`
(coluna `role`) e vai dentro do JWT (`payload.role`) — o backend confere o papel a cada requisição
via as dependências `get_current_user`/`require_role` (`backend/app/core/deps.py`), nunca confia
apenas no que o frontend mostra ou esconde.

### Bootstrap do primeiro admin

Não existe usuário padrão nem seed de usuários. O **primeiro** `POST /auth/register` da vida do
banco vira `admin` automaticamente, sem precisar de autenticação prévia (`is_first_user` em
`backend/app/api/routes_auth.py`). Na prática: acesse `/register` no frontend antes de qualquer
outro cadastro.

### Criar, editar e remover usuários (depois do bootstrap)

A partir do segundo usuário, `POST /auth/register` **exige um token de `admin` autenticado no
header `Authorization`** — verificado explicitamente contra o papel `admin` (não aceita
`programador`). Isso é feito pela tela **Usuários** (`/usuarios`, acessível só a `admin` no
frontend) em `frontend/src/pages/GerenciamentoUsuarios.tsx`, que:

- Lista usuários (`GET /users`).
- Cria um novo usuário com usuário/senha/papel escolhido (`POST /auth/register` com o token do
  admin logado).
- Troca o papel de um usuário existente (`PATCH /users/{id}/role`).
- Remove um usuário (`DELETE /users/{id}`).

Um admin **não pode alterar o próprio papel nem remover a própria conta** (bloqueado no backend
com HTTP 400, para evitar lockout — `backend/app/api/routes_users.py`).

Sem interface, pela API diretamente (substitua `<TOKEN_ADMIN>`):

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"username": "operador1", "password": "senha-forte", "role": "usuario_comum"}'
```

### O que cada papel pode fazer

Verificado diretamente no código (dependências de rota no backend + guardas de rota/UI no
frontend), não apenas descrito:

| Capacidade | `admin` | `programador` | `usuario_comum` |
|---|:---:|:---:|:---:|
| Login e navegação geral | sim | sim | sim |
| Ver Produção (Tabela B), Dashboard, Calendário | sim | sim | sim |
| Reordenar itens em Produção (drag-and-drop) | sim | sim | não (board somente leitura) |
| Acessar Programação (Tabela A) e enviar lote pra Tabela B | sim | sim | não (rota `/programacao` bloqueada) |
| Checklist, labels, comentários, anexos em qualquer item | sim | sim | sim |
| Mover item para uma coluna extra | sim | sim | sim |
| Criar/renomear/apagar coluna extra | sim | sim | não |
| Gerenciar usuários (criar, trocar papel, remover) | sim | não | não |

## Variáveis de ambiente

Lidas em `backend/app/core/config.py` (classe `Settings`, `pydantic-settings`). Podem ser
exportadas no shell ou colocadas em `backend/.env` (git-ignorado, carregado automaticamente).

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `DATABASE_URL` | **Sim** | — | String de conexão SQLAlchemy: `postgresql+psycopg://usuario:senha@host:porta/banco`. O prefixo `+psycopg` é obrigatório — o driver instalado é `psycopg` (v3), não `psycopg2`. |
| `JWT_SECRET_KEY` | **Sim** | — | Segredo para assinar/verificar tokens JWT (`python-jose`). Qualquer string em dev; em produção precisa ser um valor aleatório real, fora do controle de versão. Gerar com `python3 -c "import secrets; print(secrets.token_hex(32))"`. |
| `JWT_ALGORITHM` | Não | `HS256` | Algoritmo de assinatura JWT. |
| `JWT_EXPIRE_MINUTES` | Não | `60` | Validade do token de acesso, em minutos. Expirado, o frontend desloga o usuário no primeiro 401 (`GerenciamentoUsuarios.tsx` e outras telas tratam isso explicitamente). |
| `CORS_ORIGINS` | Não | `http://localhost:5173` | Origens permitidas pelo CORS, separadas por vírgula (ex: `https://planner.empresa.local,https://outro.dominio`). |

Frontend (`frontend/src/services/api/core.ts`, exposta automaticamente pelo Vite por ter o
prefixo `VITE_`), opcional em
`frontend/.env.local` (git-ignorado):

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `VITE_API_BASE_URL` | Não | `http://localhost:8000` | URL base da API. Usada para as chamadas REST e para derivar a URL do WebSocket (troca `http`→`ws` — `frontend/src/hooks/useProducaoWebSocket.ts`). |

## Backup e restore do banco

Comandos assumem o setup local confirmado (banco `planner_logistica`, role `planner`, host
`127.0.0.1`); ajuste host/usuário conforme o ambiente (em produção normalmente será necessário
`-W` ou `PGPASSWORD`/`.pgpass`, já que não haverá autenticação `trust`).

```bash
# Backup — formato custom (comprimido, permite restore seletivo)
pg_dump -h 127.0.0.1 -U planner -Fc planner_logistica > backup_$(date +%Y%m%d_%H%M).dump

# Backup — SQL puro (texto, mais fácil de inspecionar/versionar)
pg_dump -h 127.0.0.1 -U planner planner_logistica > backup_$(date +%Y%m%d_%H%M).sql
```

```bash
# Restore do formato custom, em um banco novo/vazio
createdb -h 127.0.0.1 -U planner planner_logistica_restaurado
pg_restore -h 127.0.0.1 -U planner -d planner_logistica_restaurado backup_20260101_1200.dump

# Restore do SQL puro
psql -h 127.0.0.1 -U planner -d planner_logistica_restaurado -f backup_20260101_1200.sql
```

Depois de restaurar, rode `alembic upgrade head` se o backup for mais antigo que a última
migration aplicada.

## Popular dados de teste manualmente

Não existe um comando `seed` oficial neste projeto. Popule a Tabela A (`producao_staging`) direto
pela sessão SQLAlchemy — é o que o dump do SAP faria na prática:

```bash
cd backend
source .venv/bin/activate
DATABASE_URL="postgresql+psycopg://planner@localhost:5432/planner_logistica" python3
```

```python
from app.db.session import SessionLocal
from app.models.producao import ItemProducaoStaging

db = SessionLocal()
db.add(ItemProducaoStaging(
    linha="L01",
    turno=1,                    # 1, 2 ou 3
    patan="A",                  # letra única A-H
    posto_trabalho="POSTO 1",
    status=2,                   # PlanItemStatus.NORMAL — veja app/domain/status.py
    sequencia=1,
    kanbans=5,
    qtd_por_kanban=20,
    tempo_por_peca_minutos=0.5,
    demanda=100,
    saldo_estoque=80,
    is_critico=False,
))
db.commit()
db.close()
```

O item aparece na tela **Programação** para a combinação (linha=`L01`, turno=`1`, patan=`A`)
assim que um usuário `admin`/`programador` logado acessar `GET /producao/sequencia` com esses
parâmetros. Para um item crítico (`STATUS=3`), lembre que ele é carregado por **linha inteira**
(`get_pecas_criticas_by_linha`), sem filtrar por turno/patan — não precisa (e não deve) fixar
`sequencia` além de `0`.

## Troubleshooting comum

| Sintoma | Causa provável | Solução |
|---|---|---|
| Backend não sobe: `pydantic_core.ValidationError` sobre `database_url`/`jwt_secret_key` | `DATABASE_URL` ou `JWT_SECRET_KEY` não setadas no ambiente/`.env` | Exportar as duas variáveis obrigatórias antes de rodar `uvicorn` |
| `psycopg.OperationalError: connection failed` | Postgres não está rodando, ou host/porta/banco errados em `DATABASE_URL` | `brew services list` (macOS) para conferir o serviço; conferir a string de conexão |
| Erro `relation "producao" does not exist` (ou similar) | Migrations não aplicadas | `cd backend && alembic upgrade head` |
| CORS bloqueado no console do navegador | Origem do frontend não está em `CORS_ORIGINS` | Incluir a origem exata (protocolo+host+porta) na variável, separada por vírgula se houver mais de uma |
| Usuários caem para a tela de login com frequência | `JWT_EXPIRE_MINUTES` baixo, ou `JWT_SECRET_KEY` mudou entre deploys (invalida todos os tokens já emitidos) | Ajustar `JWT_EXPIRE_MINUTES`; nunca trocar `JWT_SECRET_KEY` em produção sem avisar que todos vão precisar logar de novo |
| Erro tipo `AttributeError: module 'bcrypt' has no attribute '__about__'` | `bcrypt` foi atualizado além do teto fixado (`pyproject.toml` prende `bcrypt>=4.0,<4.1` porque `passlib` 1.7.4 quebra com `bcrypt>=4.1`) | Reinstalar respeitando o pin: `pip install -e ".[dev]"` de novo (não fazer `pip install -U bcrypt` isolado) |
| Porta 8000 ou 5173 já em uso | Outro processo na porta | `uvicorn app.main:app --reload --port 8001` / `npm run dev -- --port 5174`, ajustando `VITE_API_BASE_URL`/CORS de acordo |
| Dashboard/Produção/Calendário não atualizam sozinhos quando outro usuário envia um lote | WebSocket não conectou (token inválido/expirado, ou `VITE_API_BASE_URL` apontando para host errado) | Conferir no DevTools se `ws://<host>/ws/producao` conectou; o backend fecha a conexão com código `4401` se o primeiro texto recebido não for um JWT válido |
| Rodar `pytest` falha tentando conectar em Postgres real | Você exportou `DATABASE_URL` real no mesmo shell antes de rodar os testes | `tests/conftest.py` só usa `sqlite:///:memory:` como fallback (`os.environ.setdefault`) — se `DATABASE_URL` já estiver setada no ambiente, os testes tentam usar exatamente esse banco. Rode os testes em um shell sem `DATABASE_URL` exportada, ou aponte para um banco de teste descartável |

## Deploy em produção — o que muda

Nada disso está configurado no repositório hoje (sem CI/CD, sem infraestrutura definida — veja
"Débito técnico conhecido" em [`AGENTS.md`](../AGENTS.md)). O que precisa ser decidido/ajustado
ao sair do ambiente de desenvolvimento local:

- **`JWT_SECRET_KEY` real**: um segredo gerado de verdade (não o valor de dev), armazenado fora
  do controle de versão (variável de ambiente do servidor, secret manager, etc.).
- **`DATABASE_URL` com credenciais reais**: o Postgres de produção não deve usar autenticação
  `trust` — usuário e senha reais na string de conexão, e essa string nunca deve ser commitada.
- **`CORS_ORIGINS` restrito**: apontar exatamente para o(s) domínio(s) real(is) do frontend em
  produção — nunca deixar o default `http://localhost:5173` valendo fora de desenvolvimento.
- **Build do frontend**: `npm run build` gera `frontend/dist/` (estático) — precisa de algum
  servidor web/proxy para servir esses arquivos; nenhum está configurado no repositório.
- **Servidor de aplicação**: `uvicorn --reload` é só para desenvolvimento. Em produção, considerar
  múltiplos workers atrás de um reverse proxy — decisão de infraestrutura ainda em aberto, nada
  disso está implementado ou decidido no código atual.
- **HTTPS**: o FastAPI/uvicorn não fazem terminação TLS — normalmente fica a cargo de um proxy
  reverso na frente; não há nada configurado a esse respeito no repositório.
- **Hospedagem**: os requisitos originais (`requisitosBases/requisitos.md`) apontam para
  on-premise/intranet da empresa — a escolha exata de servidor/rede é uma decisão de infra da
  empresa, não deste repositório.
