# Fase 3.2 — Calendário (linha do tempo do dia)

## Contexto

Segundo sub-projeto da Fase 3. Visão de linha do tempo de um dia — os 3
turnos como faixas horizontais, itens plotados pelo horário calculado
(`hora_inicial`→`hora_final`). Sem grade de múltiplos dias/semanas: não
existe histórico por data persistido (mesma limitação já registrada no
dashboard — `producao`/Tabela B é sobrescrita a cada reenvio).

## Achado durante a pesquisa: bug pré-existente na Fase 1

`GET /producao/sequencia` (usado tanto por `ProgramacaoPatan.tsx` quanto
por `Producao.tsx`) **sempre lê da Tabela A (staging)**, recalculando a
cascata ao vivo — nunca lê a Tabela B (`producao`) já persistida. Isso
contradiz a própria convenção documentada no `CLAUDE.md` do projeto:
"Tabela B (Kanban oficial) is the immutable, persisted source for
dashboards/history — never write history-facing code against Tabela A."

Na prática: a tela "Produção" (que deveria mostrar o que já foi
efetivamente enviado/persistido) hoje mostra a mesma prévia de staging que
"Programação" mostra — não o estado real e imutável da Tabela B. Se a
staging for limpa após o envio (comportamento documentado da Tabela A),
"Produção" ficaria vazia mesmo com dados reais persistidos.

Calendário precisa ler a Tabela B de verdade (é o "estado atual oficial"
que faz sentido plotar numa linha do tempo) — então a infra que este
sub-projeto cria (rota nova de leitura da Tabela B) também corrige esse
bug em `Producao.tsx`, sem escopo adicional real: é o mesmo endpoint.

## Decisão

Nova rota `GET /producao/tabela-b?linha=&turno=&patan=` — `turno` agora
**opcional** (ausente = todos os 3 turnos daquela linha/patan, necessário
pro calendário mostrar o dia inteiro; presente = só aquele turno, mesmo
padrão de escopo já usado em outros lugares). Lê `ItemProducao` (Tabela B)
direto — sem recomputar cascata (já está salva em `hora_inicial`/
`hora_final` desde o momento do envio). Reaproveita o schema
`ItemProducaoOut` já existente (campos idênticos) — nenhum schema novo.
`tem_falta_estoque` sempre `False` (mesmo placeholder que `submeter_sequencia`
já usa — esse dado só existe na staging).

`Producao.tsx` passa a chamar essa rota nova em vez de `getSequencia`
(que fica exclusivo da Programação/staging, seu uso correto).

Calendário: nova página, chama a rota sem `turno` (pega os 3 de uma vez),
plota cada item como um bloco na faixa do seu turno, posicionado por
`hora_inicial`/`hora_final`. Acesso: todos os 3 papéis, mesmo padrão do
resto do app.

## Fora de escopo

- Múltiplos dias/semanas (sem dado histórico pra isso).
- Testes automatizados e revisão de segurança — mesma política das fases
  anteriores, gate único quando o usuário pedir.

## Related

`docs/superpowers/specs/2026-08-27-fase3-dashboard-metricas-design.md`
(mesma limitação de "sem histórico").
