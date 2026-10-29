# Documentação de Requisitos e Arquitetura: Sistema de Sequenciamento Kanban

## Visão Geral do Projeto
*   **Objetivo:** Desenvolver uma aplicação web robusta para orquestrar o sequenciamento de produção e a logística de abastecimento (Kanbans) nas linhas de fábrica, validando estoques em tempo real.
*   **Contexto Corporativo:** Sistema voltado para a área de Melhoria Contínua (LEAN/TPS), desenhado para rodar exclusivamente na intranet corporativa da Gestamp.
*   **Motivação Arquitetural:** Substituir um ecossistema legado e fragmentado (Power Apps + SharePoint + Power Automate + Microsoft Planner) por uma solução proprietária, eliminando gargalos de performance, limites de requisição de rede (Throttling) e falhas de delegação. O novo sistema foca em alta responsividade para o usuário final no chão de fábrica[cite: 1, 2].

## Stack Tecnológica
*   **Backend:** Python (Framework sugerido: FastAPI ou Django, para construção ágil de APIs RESTful).
*   **Frontend:** React (SPA - Single Page Application), garantindo controle total sobre a lógica de interface, gerenciamento de estado em memória e renderização instantânea (Drag and Drop para ordenação).
*   **Banco de Dados:** Banco de dados relacional hospedado na rede local (PostgreSQL ou SQL Server), substituindo as listas do SharePoint.
*   **Integrações Externas:** Scripts Python de automação (SAP GUI) para extração de dados brutos do sistema ERP, como a transação MB52, garantindo a alimentação correta dos saldos de estoque[cite: 1].

## Regras de Negócio (Business Rules)
*   **Identificador Chave (Patan):** O código identificador base da produção possui obrigatoriamente 8 caracteres. Todas as lógicas de roteamento e corte de strings devem respeitar este padrão[cite: 1].
*   **Hierarquia e Máquina de Estados (STATUS):**
    *   `STATUS == 2` (Produção Normal): Itens ativos que entram no sequenciamento cronológico (1, 2, 3...)[cite: 1].
    *   `STATUS == 3` (Itens Críticos): Peças em quarentena ou com falta de componentes. Recebem `sequencia = 0` para não roubarem a numeração da produção normal e não quebrarem o cálculo de horas[cite: 1].
    *   `STATUS == 0`: Itens excluídos/descartados do planejamento[cite: 2].
    *   `STATUS == 9`: Trava temporária/Lote de envio. Indica que o lote foi validado pelo PCP e está pronto para ser persistido como Kanban definitivo na fábrica[cite: 2].
    *   *Cabeçalhos de Turno:* Itens puramente visuais, também recebem `sequencia = 0` e não possuem data/hora de início para evitar quebra de lógicas[cite: 1].
*   **Sequenciamento e Cálculo em Cascata ("Escadinha"):**
    *   O cálculo de tempo de produção é: `(Quantidade de Kanbans * Peças por Kanban) * Tempo Padrão da Peça`[cite: 2].
    *   Os turnos possuem horários de partida fixos: 1º Turno (06:20), 2º Turno (14:40), 3º Turno (23:00)[cite: 2].
    *   O item com `sequencia == 1` assume o horário de início do turno.
    *   Para os itens subsequentes (`sequencia > 1`), a `Hora Inicial` deve ser estritamente igual à `Hora Final` do item imediatamente anterior no mesmo posto de trabalho[cite: 2].
*   **Diagnóstico e Explosão de Materiais (BOM):**
    *   A demanda total da peça deve ser cruzada com o saldo atual do estoque em tempo real[cite: 2].
    *   Se a Demanda > Estoque Disponível, o sistema deve sinalizar visualmente a "Falta de Estoque" e permitir a reclassificação do item para `STATUS 3`[cite: 2].
    *   O cálculo de estoque deve ocorrer preferencialmente no backend ou no carregamento (mount) do componente no frontend, evitando recalcular a BOM inteira a cada reordenação de item pelo usuário[cite: 2].

## Requisitos Não-Funcionais
*   **Hospedagem e Acesso:** Deploy em servidor local (On-Premise). O acesso deve ser restrito via Intranet.
*   **Performance e Gerenciamento de Estado:** A edição de sequências, alteração de prioridades e simulação de cálculos devem ocorrer inteiramente em memória no frontend (React). As requisições de rede (POST/PUT) para o backend só devem ocorrer em lote (Bulk operations) quando o usuário confirmar o envio do planejamento[cite: 2].
*   **Concorrência e Segurança de Dados:** O sistema será utilizado por operadores gerindo diferentes linhas. Operações de exclusão ou limpeza de banco de dados devem ser sempre escopadas usando as chaves primárias (Patan, Linha, Turno) para garantir que a ação de um usuário não apague o planejamento em andamento de outro[cite: 2].

## Estrutura de Dados
O modelo de dados deve respeitar o padrão de "Staging vs. Produção" para isolar o trabalho em rascunho do histórico consolidado.
*   **Tabela A (Buffer / Staging):** Recebe o despejo diário dos scripts de extração do SAP. Utilizada como memória temporária para o frontend organizar o sequenciamento. É limpa/esvaziada ao final do envio do lote.
*   **Tabela B (Produção / Kanban Oficial):** Tabela definitiva onde os cards validados são persistidos. Fonte intocável para dashboards e histórico.
*   **Entidade Principal de Produção (Campos mapeados):**
    *   `ID` (PK)
    *   `Patan` (String, 8 chars)[cite: 1]
    *   `Linha`, `Posto`, `Turno`[cite: 2]
    *   `Material` / `Descricao`[cite: 1]
    *   `Sequencia` (Int)[cite: 1, 2]
    *   `Status` (Int)[cite: 1, 2]
    *   `Kanbans` e `Qtd_por_Kanban` (Int)[cite: 2]
    *   `Tempo_por_Peca` e `Tempo_Prod` (Float/Minutos)[cite: 2]
    *   `Hora_Prod_Inicial` e `Hora_Prod_Final` (Time)[cite: 2]
    *   `Comp_Comb` (String/JSON contendo a BOM e saldo de estoque para explosão em tela)[cite: 2]