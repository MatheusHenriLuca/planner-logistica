# Spec: plannerLogistica — Fase 1: Núcleo de Sequenciamento

## Contexto

Substituir o sistema legado (Power Apps + SharePoint + Power Automate + Microsoft
Planner) usado pela área de Melhoria Contínua da Gestamp para sequenciar produção
(Kanban) e logística de abastecimento no setor de Solda. O legado sofre com
throttling de API, timeout em lotes grandes (>170 itens) e falhas de delegação.
Fonte: `requisitosBases/requisitos.md`, `requisitosBases/main.md`.

Visão completa do produto (`requisitosBases/planner_requisitos.md`) é um clone
funcional do Microsoft Planner: quadro, lista, dashboard, calendário, comentário,
checklist, label, anexo, notificação, realtime. Esse escopo completo foi
confirmado pelo usuário como meta ("bem completinho"), mas é grande demais pra
um plano de implementação só — ver **Decomposição em fases** abaixo.

## Decomposição em fases

| Fase | Conteúdo | Status |
|---|---|---|
| **1 (esta spec)** | Scaffold backend+frontend, auth/RBAC, domain layer (Patan/STATUS/escadinha), CRUD de item de produção, quadro Kanban com drag-and-drop, envio em lote pra Tabela B | A especificar → planejar → implementar agora |
| 2 | Colaboração: label, checklist, comentário, anexo, atribuição múltipla | Roadmap, não especificado ainda |
| 3 | Views: Lista/Grid, Dashboard (gráficos), Calendário, export xlsx/csv | Roadmap, não especificado ainda |
| 4 | Realtime (WebSocket), notificação, polish responsivo | Roadmap, não especificado ainda |

Fases 2-4 não são especificadas agora (YAGNI — requisito pode mudar até lá).
Cada fase ganha seu próprio ciclo spec → plano → implementação quando chegar a vez.

## Arquitetura

- **Backend**: Python + FastAPI, SQLAlchemy 2.x + Alembic, PostgreSQL.
- **Frontend**: React SPA (Vite + TypeScript).
- **Deploy**: on-premise, intranet corporativa — sem acesso externo.
- **Auth**: local (usuário/senha próprio, hash bcrypt, JWT) — **sem integração
  AD/SSO nesta fase**, confirmado pelo usuário 2026-08-24.
- **SAP MB52**: fora de escopo do backend web. O legado automatiza a SAP GUI via
  `win32com` (RPA desktop) — não é API, não roda dentro de um serviço headless.
  Fase 1 assume que a Tabela A (staging) já está populada por esse processo
  externo (como é hoje) ou por import manual; o backend só lê a partir dela.
  Ver `.claude/memory/architecture-sap-desktop-automation.md`.

## Modelo de domínio e regras de negócio

Todas confirmadas com o usuário ou extraídas do sistema legado por arqueologia
de código (`.claude/memory/business-rule-*.md`):

- **Patan**: 1 letra, A–H. Programador submete exatamente uma. Não é código de
  8 caracteres (contradição com doc antigo já corrigida).
- **STATUS (item de produção)** — máquina de estado, não flag: `0`=excluído,
  `2`=produção normal (numeração sequencial 1,2,3...), `3`=crítico/quarentena
  (`sequencia=0`, nunca rouba numeração normal), `9`=lote travado pronto pra
  persistir. Cabeçalho de turno: visual, `sequencia=0`, sem hora.
- **STATUS (requisição/intake)**: campo homônimo mas SEM relação — string
  `'1'`/`'2'` (pendente/processado). Modelar como enum separado
  (`RequestStatus`), nunca reaproveitar o enum de item de produção. Fase 1 não
  implementa a tela de requisição — só o enum já nasce isolado pra não colidir
  quando ela existir.
- **Peça crítica (`isCritico`)**: origem real não mapeada no código legado —
  chega como campo de entrada já pronto (boolean) vindo da Tabela A. Fase 1
  trata como opaco, não deriva.
- **Escadinha (cascata de horário)**: turno 1 começa 06:20, turno 2 14:40,
  turno 3 23:00. Item `sequencia==1` assume o horário do turno; os demais,
  `Hora Inicial = Hora Final` do item anterior no mesmo posto de trabalho —
  nunca calculado independente.
- **Pausa de almoço (+40min)**: se a janela de produção do item cruzar o
  horário de almoço do turno, soma 40min uma vez no `Hora Final` daquele item
  (cascata propaga o atraso de graça pros seguintes — não somar de novo).
  Horários placeholder, usuário ajusta depois: turno 1 → 10:20, turno 2 →
  18:40, turno 3 → 03:00.
  Quando aplicado, o card do item mostra `"HORARIO DE ALMOCO INCLUSO"`.
- **Tempo de produção**: `(Kanbans × Qtd_por_Kanban) × Tempo_por_Peca`.
- **Diagnóstico de estoque**: demanda do item cruzada com saldo (campo vindo
  da Tabela A); se demanda > estoque, sinaliza falta e permite reclassificar
  pra STATUS 3. Cálculo no backend ou no mount do componente — nunca recalcula
  a cada reordenação manual do usuário.
- **Staging vs. Produção**: Tabela A (buffer, populada externamente, limpa
  após envio do lote) alimenta o working set do frontend; Tabela B (Kanban
  oficial) é o destino imutável do envio em lote — nunca escrever código
  history-facing contra a Tabela A.
- **Escopo de operação destrutiva/bulk**: todo delete/clear é escopado por
  (Patan, Linha, Turno) — nunca global. Evidência concreta de por que essa
  regra existe: `Script-PowerApps.txt:2827` no legado apaga a lista inteira
  sem escopo, bug real documentado na arqueologia.

## Fluxo de dados (jornada do Programador)

1. Programador seleciona Linha + Turno + Patan na tela de Programação.
2. Backend retorna: itens da combinação exata + peças críticas da linha (fora
   do Patan pedido, mas que precisam ser produzidas).
3. Programador reordena em memória no frontend (drag-and-drop); a cada
   reordenação, o frontend recalcula a cascata (escadinha + almoço)
   inteiramente client-side — sem round-trip ao backend por edição.
4. Programador confirma e envia — **uma única requisição bulk** (`POST`/`PUT`)
   persiste o lote na Tabela B.
5. Itens novos entram no fim da fila da coluna (posto); cards já em produção
   nunca são sobrescritos ou apagados pelo envio.

## Autenticação e RBAC

3 papéis (`main.md`): **Admin** (irrestrito, gerencia usuários), **Programador**
(monta/calcula/envia fila — tela de Programação de Patan), **Usuário Comum**
(só visualiza/move card na tela de Produção). Autorização verificada no
backend via dependency (`require_role`), nunca só na UI — `06-security.md`.

## Componentes (Fase 1)

```
backend/app/
├── main.py
├── core/{config,security,deps}.py       # security.py = hash senha + JWT
├── api/
│   ├── routes_auth.py                   # login → JWT
│   ├── routes_users.py                  # Admin: CRUD usuário/papel
│   └── routes_producao.py               # sequenciamento, envio em lote
├── domain/                              # regra pura, testável sem DB
│   ├── patan.py                         # enum A–H
│   ├── status.py                        # PlanItemStatus + RequestStatus (2 enums)
│   ├── sequenciamento.py                # escadinha + pausa de almoço
│   └── estoque.py                       # diagnóstico demanda x saldo
├── repositories/producao_repository.py  # abstrai Tabela A (staging) x Tabela B
├── models/{producao,user}.py            # SQLAlchemy ORM
├── schemas/{producao,user}.py           # Pydantic
└── db/session.py

frontend/src/
├── components/SequenciaBoard/           # quadro Kanban, drag-and-drop
├── pages/
│   ├── GerenciamentoUsuarios.tsx        # Admin
│   ├── ProgramacaoPatan.tsx             # Programador + Admin
│   └── Producao.tsx                     # todos os papéis
├── routes/AppRouter.tsx                 # guard por papel
├── auth/AuthContext.tsx
├── services/api.ts
├── types/producao.ts
├── state/sequenciaReducer.ts            # edição em memória (useReducer)
└── main.tsx
```

**Bibliotecas — backend**: fastapi, uvicorn, sqlalchemy, alembic,
`psycopg[binary]`, pydantic-settings, `passlib[bcrypt]`,
`python-jose[cryptography]`; dev: pytest, pytest-cov, httpx, ruff.

**Bibliotecas — frontend**: react, react-dom, react-router-dom, `@dnd-kit/core`
+ `@dnd-kit/sortable`, `@tanstack/react-query`; dev: typescript, vite, vitest,
`@testing-library/react`, eslint. Sem axios (fetch nativo), sem Redux/Zustand
(`useReducer` cobre o estado em memória).

## Tratamento de erro

- Validação de entrada nos schemas Pydantic (boundary da API).
- Autorização (papel) verificada em cada endpoint via dependency, nunca só
  no frontend.
- Erros de negócio (ex: Patan inválido, item já travado por outro envio)
  retornam 4xx com mensagem clara; nunca stack trace pro cliente.
- Envio em lote é tudo-ou-nada: se qualquer item falhar validação, nada é
  persistido (evita o bug do legado onde `RemoveIf` rodava mesmo com envio
  parcialmente falho).

## Testes

Conforme `.claude/rules/05-testing.md` — testar o que quebra:

- **Unit, sem DB** (`tests/unit/`): `domain/sequenciamento.py` (cascata +
  pausa de almoço, casos de borda: item cruza o almoço exatamente na virada,
  não cruza, turno 3 vira o dia), `domain/status.py` (transições válidas),
  `domain/estoque.py` (demanda > e < estoque).
  CC ≥ 2 em toda essa camada — cobertura de branch completa.
- **Integration** (`tests/integration/`): endpoints de auth (papel errado →
  403), envio em lote (tudo-ou-nada), escopo de delete/clear por
  (Patan, Linha, Turno) — regressão direta do bug do legado.
- Getter/wrapper/config trivial: sem teste.

## Gaps conhecidos (fora de escopo desta fase)

- Origem real de `isCritico` — não mapeada, tratada como campo opaco.
- Integração SAP MB52 ao vivo — fica em processo externo (Windows/RPA ou,
  futuramente, RFC/BAPI); backend só consome a Tabela A já populada.
- Fases 2–4 completas (`planner_requisitos.md`): colaboração, views
  avançadas, realtime — roadmap, sem spec ainda.

## Referências

- `requisitosBases/requisitos.md`, `main.md`, `planner_requisitos.md`
- `.claude/memory/business-rule-*.md`, `architecture-sap-desktop-automation.md`
- `CLAUDE.md` → seção Conventions
