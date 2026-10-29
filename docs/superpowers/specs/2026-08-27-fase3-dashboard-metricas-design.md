# Fase 3.1 — Dashboard de Métricas

## Contexto

Primeiro sub-projeto da Fase 3 (as demais: calendário, exportação,
notificações, tempo real — cada uma com seu próprio spec/plano depois desta).
Painel de estado atual (sem histórico — `producao`/Tabela B é apagada e
recriada a cada reenvio de lote, não existe série temporal a consultar).

## Decisões (brainstorming)

- Métricas: throughput por posto/turno, % itens críticos, itens travados
  (STATUS `9`), taxa de conclusão de checklist, comparação entre
  linhas/turnos.
- **"% falta de estoque" removida do escopo** — dependia de
  `saldo_estoque`/`demanda`, que só existem em `producao_staging` (Tabela A,
  limpa após cada envio). Substituída por "% itens críticos" (`is_critico`,
  campo que de fato persiste em `producao`/Tabela B).
- Estado atual apenas (lê `producao`/Tabela B ao vivo) — sem tabela de
  histórico nova.
- Duas visões: geral (agrega tudo) e filtrada (por linha/turno/patan,
  parâmetros opcionais na mesma rota).
- Acesso: todos os 3 papéis (admin, programador, usuario_comum) — mesmo
  padrão de RBAC página-a-página já usado no resto do app.

## Definição das métricas

- `total_itens`: `COUNT(*)` no escopo.
- `pct_itens_criticos`: `COUNT(is_critico=true) / COUNT(*) * 100`.
- `itens_travados`: `COUNT(status=9)`.
- `taxa_conclusao_checklist`: `COUNT(checklist_item.concluido=true) /
  COUNT(checklist_item.*) * 100`, join com `checklist_item` pelos itens no
  escopo.
- `throughput_por_posto`: `SUM(kanbans * qtd_por_kanban)` agrupado por
  `posto_trabalho, turno` — proxy de "quanto está planejado agora" (sem
  série temporal, não é uma taxa por hora).
- `por_linha_turno`: `COUNT(*)` e `pct_itens_criticos` agrupado por
  `linha, turno` — só é útil na visão geral (na filtrada colapsa pra 1
  linha), mas a forma da resposta não muda entre os dois modos.

## API

```
GET /dashboard/metricas?linha=&turno=&patan=   (todos os params opcionais)
```
Sem parâmetro = visão geral (todo o `producao`). Com os 3 = visão filtrada
(mesmo padrão de escopo já usado em `GET /producao/sequencia`). Qualquer
usuário autenticado (`admin`, `programador`, `usuario_comum`) — sem
checagem de role extra.

```python
class DashboardMetricasOut(BaseModel):
    total_itens: int
    pct_itens_criticos: float
    itens_travados: int
    taxa_conclusao_checklist: float
    throughput_por_posto: list[ThroughputPostoOut]
    por_linha_turno: list[LinhaTurnoOut]

class ThroughputPostoOut(BaseModel):
    posto_trabalho: str
    turno: int
    total_pecas: int

class LinhaTurnoOut(BaseModel):
    linha: str
    turno: int
    total_itens: int
    pct_itens_criticos: float
```

## Frontend

Página nova `/dashboard`, link no `Nav` visível pra qualquer usuário
logado (sem gate de role, igual o link "Producao"). Filtros opcionais
(linha/turno/patan, "todos" por padrão = visão geral) acima de cards com os
4 números escalares + duas tabelas (throughput por posto, comparação
linha/turno). Sem biblioteca de gráfico nova — números/tabelas estilizadas
com Tailwind, consistente com o resto do app; escala pequena (ferramenta
interna) não justifica uma dependência de charting agora.

## Fora de escopo

- Histórico/tendência ao longo do tempo (exigiria tabela de auditoria nova
  — decisão maior, não faz parte deste sub-projeto).
- Gráficos (biblioteca de charting) — números/tabelas por ora.
- Testes automatizados e revisão de segurança — mesma política da Fase 2:
  adiados a pedido do usuário, gate único quando ele pedir.

## Related

Ver `docs/superpowers/specs/2026-08-27-fase2-colaboracao-e-redesign-design.md`
para o modelo de dados sobre o qual este dashboard lê (`ItemProducao`,
`ChecklistItem`).
