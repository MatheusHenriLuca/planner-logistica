# Fase 2 — Funcionalidades de Colaboração + Redesign UI/UX

## Contexto

Fase 1 (núcleo de sequenciamento) está completa, testada e revisada. Este spec
cobre a Fase 2: as funcionalidades de colaboração do `planner_requisitos.md`
(o PRD genérico de clone do Microsoft Planner) traduzidas para o domínio real
já confirmado — `ItemProducao` / Tabela B — mais um redesign visual completo
do site, hoje sem nenhum CSS (formulários e tabelas em HTML puro).

Decisões já resolvidas em brainstorming anterior (nesta mesma sessão, antes de
uma compactação de contexto):

1. Checklist e label vêm com valor padrão ao abrir/criar o card, mas são
   editáveis — igual ao Microsoft Planner.
2. Conteúdo padrão pode ser genérico (usuário ajusta depois no código/UI).
3. Ancoragem das entidades: `ItemProducao` (Tabela B), não uma entidade
   genérica "Task".
4. Sem atribuição múltipla de usuário — fora de escopo.
5. RBAC destas features é por página, não por feature: qualquer papel que
   acesse uma tela pode interagir com tudo nela (Admin/Programador/Usuário
   Comum têm o mesmo nível de interação dentro de uma tela já permitida).

Arqueologia do sistema legado (`md-ligacao_python_ao_powerapps.txt:170-220`)
confirmou: só cards de "Peça" (não cabeçalho de turno) recebiam checklist +
label; o checklist era um template fixo de "5 passos padrão"; a label vinha
de uma expressão (`Compor-Tags`) nunca totalmente mapeada — não há uma regra
de negócio recuperável para "qual label por padrão", só para "quantos passos
o checklist tem por padrão".

## Decisão de reconciliação (nova, deste spec)

O usuário pediu "quando vier cards da tela de Programação já venha o valor
padrão" — mas a tela de Programação (`ProgramacaoPatan.tsx`) manipula
`ItemProducaoStaging` (Tabela A, buffer efêmero, pré-submit), enquanto a
Convenção 3 (acima) ancora checklist/label em `ItemProducao` (Tabela B,
persistente). Resolução: o checklist/label **padrão é calculado e mostrado
como preview já na tela de Programação** (client-side, sem persistir nada),
mas só vira registro real em banco quando o item é efetivamente submetido
(`POST /producao/sequencia`) e passa a existir como `ItemProducao`. Isso casa
as duas coisas sem contradição — mas é uma decisão nova, não estava
explicitamente resolvida antes. Sinalizado para o usuário revisar.

## Modelo de dados (novas tabelas, todas FK para `item_producao.id`)

```
checklist_item
  id            PK
  item_producao_id  FK -> item_producao.id
  texto         str
  concluido     bool, default False
  ordem         int

label
  id    PK
  nome  str
  cor   str  (nome de cor ou hex, para o chip)

item_producao_label   (tabela de junção, N:N)
  item_producao_id  FK -> item_producao.id
  label_id          FK -> label.id

comentario
  id                PK
  item_producao_id  FK -> item_producao.id
  autor_id          FK -> user.id
  texto             str
  criado_em         datetime

anexo
  id                PK
  item_producao_id  FK -> item_producao.id
  titulo            str
  url               str
  enviado_por       FK -> user.id
  criado_em         datetime
```

**Assunção — anexo é link, não upload de arquivo.** Não há evidência no
legado de upload real de arquivo (só a menção genérica de "anexos" no PRD
genérico do Planner) e implementar armazenamento de arquivo é infraestrutura
extra não pedida agora. V1 = título + URL. Upload real fica de fora do
escopo, pode virar pedido futuro.

**Default do checklist:** 5 passos genéricos fixos (`"Passo 1"` .. `"Passo
5"`, mesmo número do legado), criados junto com o `ItemProducao` no momento
do bulk-submit. Editável depois (adicionar/remover/renomear/marcar concluído).

**Default de label:** nenhum. Não existe regra de negócio recuperável para
"qual label por padrão" (a expressão `Compor-Tags` do legado nunca foi
totalmente mapeada) — carteira de labels genéricas pré-cadastradas (~6, nome
+ cor placeholder), usuário escolhe manualmente quais aplicar a cada item.

## API (novas rotas, backend)

```
GET    /producao/itens/{item_id}/checklist
POST   /producao/itens/{item_id}/checklist
PATCH  /producao/itens/{item_id}/checklist/{checklist_item_id}
DELETE /producao/itens/{item_id}/checklist/{checklist_item_id}

GET    /producao/itens/{item_id}/labels
PUT    /producao/itens/{item_id}/labels        (substitui o conjunto inteiro — catálogo é pequeno, mais simples que add/remove incremental)
GET    /labels                                  (catálogo completo, para o seletor)

GET    /producao/itens/{item_id}/comentarios
POST   /producao/itens/{item_id}/comentarios

GET    /producao/itens/{item_id}/anexos
POST   /producao/itens/{item_id}/anexos
DELETE /producao/itens/{item_id}/anexos/{anexo_id}
```

RBAC: qualquer role autenticado (`admin`, `programador`, `usuario_comum`) usa
todas essas rotas — sem checagem de role adicional além de "estar
autenticado", pois a Convenção 5 já resolveu que a diferença é por página
(essas rotas só são batidas a partir de telas às quais o usuário já tem
acesso).

`bulk_persist` (em `producao_repository.py`) ganha um passo extra: ao criar
cada `ItemProducao` novo, também insere os 5 `checklist_item` padrão.

## Frontend

- `SequenciaCard` ganha um rodapé compacto: progresso do checklist ("2/5"),
  chips de label, contador de comentários, contador de anexos (ícones, estilo
  Trello/Planner).
- Clique no card abre um painel de detalhe (`ItemDetalhe`, modal ou painel
  lateral): checklist completo (toggle + adicionar/remover/renomear passo),
  seletor de labels (chips multi-select do catálogo), thread de comentários
  (lista + caixa de texto), lista de anexos (lista + form "título + URL").
- Na tela de Programação (staging, pré-submit): card mostra só o preview do
  checklist padrão (read-only, "5 passos padrão serão criados"), sem
  comentário/anexo/label — não existe `ItemProducao` ainda para ancorar isso.

## Redesign UI/UX

Hoje não existe CSS em nenhuma tela (`LoginPage`, `RegisterPage`, `Producao`,
`ProgramacaoPatan`, `GerenciamentoUsuarios`, `Nav`) — tudo é HTML cru
(`<form>`, `<input>`, `<table>`).

**Decisão: adotar Tailwind CSS** (nova dev dependency — `npm install -D
tailwindcss` + plugin do Vite). Justificativa: pedido explícito de "bonito e
usável" para o site inteiro, zero infraestrutura de estilo hoje, Tailwind dá
consistência rápida (spacing/cor/tipografia via tokens) sem criar biblioteca
de componentes própria.

Escopo do redesign:
- Shell consistente: barra de navegação (`Nav`) com identidade visual,
  espaçamento e tipografia padronizados em todas as páginas.
- Paleta de cores ligada ao STATUS (regra de negócio já existente): `2`
  normal (cor neutra), `3` crítico/quarentena (vermelho/âmbar, chamativo),
  `0` excluído (cinza, opacidade reduzida), `9` travado (cor distinta,
  ex. azul).
- Board de sequenciamento (`SequenciaBoard`, `@dnd-kit`) com tratamento visual
  real: colunas por posto de trabalho, cards com sombra/hover, feedback de
  arraste (já funcional, só falta estilo).
- Formulários, botões, tabelas: estilizados, consistentes entre as 6 telas.
- Estados de loading/erro: componentes visuais (spinner, alerta), não texto
  cru.

## Fora de escopo

- Atribuição múltipla de usuário (já decidido antes).
- Upload real de arquivo para anexo (v1 = link).
- Testes automatizados (unitário/integração/E2E) e revisão de segurança —
  **adiado a pedido explícito do usuário para um gate único ao final de toda
  a Fase 2**, não por tarefa.

## Testes e segurança — adiados

Cada tarefa de implementação ainda roda o próprio código (garante que
compila/builda/roda), e passa por `code-reviewer` normal (qualidade/bugs) —
isso não é "teste" nem "segurança" no sentido que o usuário pediu para
adiar. O que fica para o gate final: suíte de testes automatizados
(unitário/integração/componente) e `security-reviewer`/`penetration-tester`
formal. Ao final de toda a Fase 2, o usuário será consultado explicitamente
sobre isso antes de considerar a fase encerrada.

## Related

Ver `docs/superpowers/specs/2026-08-24-nucleo-sequenciamento-design.md`
(Fase 1) para o modelo de domínio base (`ItemProducao`, `STATUS`, Patan,
escadinha) sobre o qual esta fase constrói.
