# Contexto 00 — Arquitetura e Visão Geral

## 1. Visão Geral do Sistema
O **Planner Logística** é um sistema de sequenciamento de produção, controle visual e chão de fábrica baseado nos princípios do **Toyota Production System (TPS)** e **Lean Manufacturing**.

O sistema opera sobre dois mundos industriais independentes e complementares:
1. **Solda (`solda`)**: Ciclo de Patans de 8 dias (`A` a `H`), postos de solda robotizada/manual (ex: `SB6A`) e sincronização de fluxo contínuo.
2. **Estamparia (`estamparia`)**: Ciclo de 64 dias com 56 patans oficiais (`A` a `P` com sub-patans numéricos), prensas de estampagem pesada (`PR-110`, `PR-109`, `PR-92`, etc.), sincronização em tandem (produção em linha) e coluna integrada de Tryout.

---

## 2. As Duas Tabelas Fundamentais: Staging (A) vs Produção (B)

| Característica | Tabela A (`producao_staging`) | Tabela B (`producao`) |
|---|---|---|
| **Ambiente** | Tela de Programação (`/programacao`) | Tela de Produção (`/producao`) e Seisan Kanriban |
| **Natureza** | Simulação, rascunho, mutável | Firme, oficial, persistida, imutável pós-envio |
| **Responsável** | Programador PCP / Administrador | Chão de fábrica (Operadores, Líderes de Linha) |
| **Ciclo de Vida** | Montada a partir do Patan Teórico -> Ajustada -> Enviada | Executada lote a lote -> Concluída ou Apontada Quebra |
| **Regra de Mutabilidade** | Livre adição, reordenação e remoção | **Imutável**, exceto por Inserção de Ordem de Emergência |

---

## 3. Máquina de Estados de um Item (`PlanItemStatus`)

Localização no código: `backend/app/domain/status.py`.

```
                  ┌───────────────┐
                  │ 0: EXCLUIDO   │ (Fora do lote / cancelado)
                  └───────────────┘
                          ▲
                          │
 ┌────────────────────────┼────────────────────────┐
 │                        │                        │
 ▼                        │                        ▼
┌───────────────┐         │               ┌───────────────┐
│ 2: NORMAL     │─────────┴──────────────>│ 3: CRITICO    │ (Falta de estoque / Quarentena)
│ (Sequenciado) │                         │ (Sequencia=0) │
└───────────────┘                         └───────────────┘
        │                                         │
        ▼                                         ▼
┌──────────────────────────────────────────────────────────┐
│ 9: LOCKED (Lote travado e persistido na Tabela B)        │
└──────────────────────────────────────────────────────────┘
```

- **`0 (EXCLUIDO)`**: Item removido do lote. Não é enviado para produção.
- **`2 (NORMAL)`**: Produção sequenciada regular. Participa da numeração de cascata (`sequencia: 1, 2, 3...`).
- **`3 (CRITICO)`**: Componente com quarentena ou falta de estoque detectada. Sua `sequencia` é **sempre 0**. Não avança horários de produção regular até que o programador decida incluí-lo ativamente.
- **`9 (LOCKED)`**: Item confirmado pelo envio de lote, travado para execução na Tabela B.

---

## 4. Comunicação em Tempo Real (WebSocket)

- **Endpoint**: `/ws/producao`.
- **Autenticação**: O token JWT é enviado na **primeira mensagem JSON** após a abertura da conexão, garantindo que o token não trafegue exposto na URL.
- **Eventos Notificados**:
  - `producao_atualizada`: Disparado sempre que um lote é enviado, um card é reordenado, produção é iniciada/concluída, quebra é reportada ou ordem de emergência é injetada.
  - **Efeito no Frontend**: Hook `useProducaoWebSocket` invalida as queries do TanStack Query (`["tabela-b"]`, `["metricas-dashboard"]`, etc.), atualizando a interface instantaneamente sem necessidade de F5.

---

## 5. Matriz de Perfis (RBAC)

1. **`admin`**: Acesso irrestrito a todas as páginas, parâmetros, limpeza de base, exclusão e auditoria.
2. **`programador`**: Acesso à Programação, Produção, Seisan Kanriban, Dashboard e Ferramentaria. Pode enviar lotes e inserir ordens de emergência.
3. **`programador_ferramentaria`**: Acesso especializado ao Kanban da Ferramentaria (`/ferramentaria`), catálogo de moldes e emissão de laudos de liberação.
4. **`usuario_comum` (Operador/Líder de Fábrica)**: Acesso restrito à tela de Produção e Seisan Kanriban para visualização e apontamentos de início/conclusão/quebra. Não tem permissão para pausar nem reprogramar lotes.
