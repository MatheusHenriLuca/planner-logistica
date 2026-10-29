# Contexto 06 — Telas Dashboard (`/dashboard`) e Calendário (`/calendario`)

## 1. Dashboard Executivo (`/dashboard`)

### Indicadores & KPIs Calculados
- **Endpoint**: `GET /dashboard/metricas`.
- **Métricas Chave**:
  - **Aderência ao Plano (%)**: Proporção entre o volume de peças produzidas apontadas e o volume programado na Tabela B.
  - **Taxa de Críticos (%)**: Percentual de materiais com quarentena/falta em relação ao total da linha.
  - **Lotes Travados (`LOCKED`)**: Lotes firmes persistidos para produção.
  - **Throughput por Posto de Trabalho**: Peças concluídas por hora/posto.
  - **Paradas & Quebras**: Quantidade de ocorrências de quebra de máquina e ferramentas no turno/dia.

---

## 2. Calendário Operacional (`/calendario`)

### Estrutura de Planejamento Mensal
- **Endpoint**: `GET /producao/tabela-b` por data selecionada.
- **Visualização**:
  - Grid mensal com marcação de dias que contêm ordens programadas ou em execução.
  - Filtro por turno e linha.
  - Linha do tempo expandida do dia, detalhando os lotes programados e suas janelas horárias.
