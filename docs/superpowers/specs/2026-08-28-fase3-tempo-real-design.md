# Fase 3.5c — Tempo Real (WebSocket)

## Contexto

Último item da Fase 3. Resolvido por conversa: **não** é live-drag-cursor
(ver alguém segurando o card) — é sincronizar depois que uma ação
**completa** acontece. Refinando com o que foi confirmado:

- "Depois que o programador enviar, os cards ficarão embaixo dos já
  publicados" — isso já é o comportamento existente de `bulk_persist`/
  `em_producao` (Fase 1), não precisa de lógica nova, só não pode ser
  atropelado pela sincronia.
- "Só depois de alguém realizar a movimentação completa" — não por drag
  individual, e sim quando a ação vira escrita real no backend.

**Insight ao desenhar:** o único write real em Tabela B é `bulk_persist`
(via `submeter_sequencia`) — Programação (staging/Tabela A) nunca é escrita
por um envio de outra pessoa, então **Programação não precisa escutar a
sincronia** (nada nela muda quando alguém envia). Quem precisa: **Produção**,
**Dashboard**, **Calendário** — os três leem Tabela B.

## Decisão

- WebSocket puro do FastAPI (`@router.websocket`), sem lib nova.
- Gatilhos de broadcast: sucesso de `submeter_sequencia` (envio de lote) e
  de `mover_item_coluna_extra` (mudança de bucket) — os dois únicos writes
  reais em Tabela B fora de criação inicial.
- Mensagem é um **sinal leve** (`{linha, turno, patan}`), não o payload
  completo — quem recebe só invalida o cache do React Query e deixa os
  `useQuery` existentes buscarem de novo. Zero lógica de fetch duplicada.
- Autenticação via token na query string da conexão WS (API nativa de
  WebSocket do navegador não permite header `Authorization` customizado).
- Um hook único, montado uma vez em `AppRouter.tsx` (sempre ativo enquanto
  logado) — invalida os 3 prefixos de query key (`tabela-b-producao`,
  `dashboard-metricas`, `calendario`) a cada mensagem, incondicionalmente.
  `invalidateQueries` com prefixo sem query ativa correspondente é
  no-op — não precisa filtrar por relevância no cliente.
- Gerenciador de conexões em memória (lista simples) — escala suficiente
  pra ferramenta interna pequena, sem Redis/pub-sub.
- Broadcast disparado de dentro de um route handler síncrono via
  `anyio.from_thread.run(...)` (não `asyncio.run()` — WebSockets vivem no
  event loop principal; `asyncio.run()` criaria um loop novo na thread do
  worker e chamaria `send_json` de fora do loop dono da conexão, um bug de
  concorrência real, só raramente visível sob carga baixa). `anyio` já é
  dependência transitiva do FastAPI/Starlette, nenhuma dependência nova.

## Fora de escopo

- Live-drag-cursor sync (recusado explicitamente).
- Sincronia em Programação (não precisa, staging não muda por envio
  alheio).
- Redis/pub-sub multi-processo (um processo só, sem necessidade real
  agora).
- Testes automatizados e revisão de segurança — mesma política das fases
  anteriores.
