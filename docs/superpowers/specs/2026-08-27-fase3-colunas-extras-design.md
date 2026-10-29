# Fase 3.5a — Colunas Extras (outcome tracking)

## Contexto

Revelado durante o brainstorming de "Tempo Real": além dos postos (colunas
fixas = máquinas físicas), o programador precisa classificar um item já
publicado em categorias de resultado/exceção — ex. "Quebra de Ferramenta",
"Concluídas". Isso é **novo**, independente do STATUS (0/2/3/9) existente —
confirmado pelo usuário que não precisa mexer nesse enum.

## Decisões

- **Tela: Produção** (Tabela B), não Programação. Quebra de ferramenta,
  conclusão etc. são resultado de execução real — só fazem sentido depois
  que o item já foi publicado, não durante o planejamento pré-envio.
- Colunas **globais** (não por linha) — mesmo conjunto disponível em
  qualquer linha. Sem pedido explícito de escopo por linha nas colunas em
  si (só os itens já são escopados por linha, como sempre foram).
- CRUD das colunas: **só admin/programador** cria e apaga (confirmado).
  Qualquer usuário autenticado pode mover um item pra uma coluna existente
  (mesmo nível de permissão que o resto da edição de item).
- **Sem STATUS novo** — campo novo e independente (`coluna_extra_id`,
  nullable) em `ItemProducao`. `NULL` = fluxo normal (não classificado).
- Apagar uma coluna com itens dentro: os itens voltam pra
  `coluna_extra_id = NULL` (`ON DELETE SET NULL`) — não bloqueia a
  exclusão, não apaga os itens.
- **Simplificação deliberada pra V1**: seletor (dropdown) no card em vez de
  arrastar de verdade entre posto e coluna extra. Hoje cada posto tem seu
  próprio `DndContext` isolado (por isso não dá pra arrastar entre
  postos, comportamento já existente) — replicar isso pra colunas extras
  exigiria engenharia de cross-context bem maior, sem ganho real sobre um
  dropdown pro mesmo resultado. Arrastar de verdade pode virar pedido
  futuro se o dropdown não for suficiente na prática.

## API

```
GET    /colunas-extras                                  qualquer autenticado
POST   /colunas-extras          {nome}                   admin/programador
DELETE /colunas-extras/{id}                              admin/programador
PATCH  /producao/itens/{item_id}/coluna-extra  {coluna_extra_id: int|null}   qualquer autenticado
```

## Fora de escopo (nesta rodada)

- Arrastar de verdade entre posto e coluna extra (dropdown resolve por
  ora).
- Colunas por linha (são globais).
- Testes automatizados e revisão de segurança — mesma política das fases
  anteriores.

## Related

Prepara o terreno pro sub-projeto seguinte (Tempo Real): quando pronto,
mudanças de coluna extra também vão entrar na transmissão via WebSocket.
