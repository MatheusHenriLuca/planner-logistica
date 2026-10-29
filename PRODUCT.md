# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Programadores de Produção (PCP / Logística)**: No escritório de planejamento ou bancada técnica, preparam o sequenciamento fabril por linha, turno e Patan na Tabela A (staging). Simulam a cascata cronológica, balanceiam kanbans com base no saldo de estoque do SAP (MB52) e realizam o envio em lote seguro para o chão de fábrica.
- **Líderes e Operadores de Chão de Fábrica (Solda e Estamparia)**: No ambiente fabril, acompanham o Kanban da Tabela B em telas industriais e painéis de linha. Iniciam ordens estritamente pelo topo da fila (Regra da Posição 0), realizam apontamentos em tempo real de conclusão (peças produzidas) ou paradas por quebra/avaria (abertura imediata de O.S.), e monitoram o ritmo no Seisan Kanriban.
- **Programadores e Mantenedores da Ferramentaria**: Gerenciam a integridade e disponibilidade de matrizes e moldes através do Kanban de manutenção (corretivas, preventivas, tryout e liberação), bloqueando preventivamente a programação de materiais cujas ferramentas estejam em reparo.
- **Gestores, Supervisores e Administradores**: Monitoram aderência ao plano mestre, indicadores de paradas, gerenciam linhas fabris, turnos, horários de refeição e permissões de acesso RBAC.

## Product Purpose

- Sistema integrado de sequenciamento e controle de produção puxada (Lean / TPS — Toyota Production System) para plantas industriais de estampagem e solda.
- Substitui planilhas manuais e buffers desconectados por um fluxo digital sincronizado de ponta a ponta: do cálculo matemático estrito da cascata de tempos à execução visual no chão de fábrica em tempo real via WebSockets.
- Sucesso significa zero paradas por descontinuidade de lote, sincronismo milimétrico de prensas em linha (tandem), visibilidade instantânea de atrasos/GAPs e aderência confiável entre o plano mestre (Patan) e a execução real.

## Positioning

- Ao contrário de ERPs genéricos (SAP) ou ferramentas genéricas de quadros (Trello, Jira), o Planner Logística implementa a lógica física e matemática real do Lean TPS automotivo:
  - Cascata contínua com herança cronológica entre lotes e cálculo automático de tempos de ciclo ($kanbans \times qtd\_por\_kanban \times tempo\_por\_peça$).
  - Ciclos de Patan específicos por setor produtivo (Solda com ciclo de 8 dias; Estamparia com ciclo de 64 dias cobrindo 56 patans oficiais).
  - Sincronização de prensas em tandem (produção em linha) com enlace visual não poluente e acionamento síncrono.
  - Gestão visual comparativa Gantt triplo (Seisan Kanriban: Faixa 1 Teórico vs Faixa 2 Programado vs Faixa 3 Realizado) com alinhamento milimétrico ao Eixo X de tempo.
  - Integração nativa e extração automatizada de saldos SAP (MB52).

## Operating Context

- **Ambiente Fabril e Escritório**: Uso intensivo em telas industriais de alta densidade, painéis de linha suspensos, computadores de escritório e estações de controle ao longo de 3 turnos produtivos ininterruptos (1º: 06:20–14:40, 2º: 14:40–23:00, 3º: 23:00–06:20).
- **Ritual Operacional**: Leitura instantânea e decisões rápidas em ambiente fabril barulhento e iluminado, exigindo alta densidade de dados, excelente ergonomia visual, tipografia limpa, badges semafóricas objetivas e baixa fadiga ocular.
- **Sincronização em Tempo Real**: Conexão reativa via WebSockets (`/ws/producao`, `/ws/ferramentaria`) para sincronizar instantaneamente movimentações, apontamentos e status entre operadores em postos distintos e a equipe de planejamento.

## Capabilities and Constraints

- **Tabela A (Staging) vs Tabela B (Persistido)**:
  - Tabela A: Buffer temporário isolado por programador (`usuario_id`) para simulação client-side pura (`sequenciaReducer.ts`) antes do envio.
  - Tabela B: Kanban oficial da fábrica, congelado e tratado como imutável pós-envio. Reordenações em produção alteram exclusivamente a sequência, preservando a referência cronológica.
- **Máquina de Estados de Planejamento**: `0` (Excluído), `2` (Normal), `3` (Crítico / Quarentena — sequência fixa em 0 por linha), `9` (Locked).
- **Regra da Posição 0 (Topo da Fila)**: Botão de iniciar produção restrito exclusivamente ao primeiro card da coluna (`index === 0`).
- **Pausa de Refeição Parametrizável**: Adiciona automaticamente +40 min no término do lote que cruza a janela de refeição configurada, herdado pelos itens posteriores da cascata.
- **Diagnóstico de Estoque Imediato**: Cálculo em tempo real da capacidade produtiva com o saldo atual do SAP (`Math.floor(saldo / qtd_por_kanban)`).
- **Produção em Linha (Tandem)**: Detecção automática de mesmo material em múltiplos postos ativos, enlace visual sutil e acionamento coordenado.
- **Módulo da Ferramentaria**: 5 estágios de ciclo de vida com catálogo de ferramentas, preventivas periódicas e bloqueio de programação.

## Brand Commitments

- **Nome Oficial**: Planner Logística.
- **Linguagem Visual**: Industrial, limpa, densa e ergonômica. Evita paletas saturadas ou cansativas, priorizando tons neutros Slate com acentos funcionais Sky/Indigo para informação técnica e semáforos Lean (verde para OK/concluído, âmbar para atenção/almoço, vermelho para quebra/crítico).
- **Terminologias Oficiais TPS**: *Kanban*, *Patan*, *Seisan Kanriban*, *Tandem*, *Staging*, *Carga Máquina*, *Tempo de Ciclo*, *Dupla Batida*, *Tryout*, *MB52*.

## Evidence on Hand

- Planilhas oficiais de produção e sequenciamento padrão: `Missão 1.xlsx`, `03- PATAN ESTAMPARIA - LINHA 3 (REEDUCANDO) - (OUT-26 até ABR-27).xlsx`.
- Automação e extração de dados reais do SAP: scripts em `backend/scripts/sap/` e endpoint `/producao/importar-excel`.
- Base de testes automatizados completa: 95 testes no frontend (`vitest`) e 151 testes no backend (`pytest`).
- Documentação técnica e arquitetural viva em [AGENTS.md](AGENTS.md) e [docs/contextos/](docs/contextos/).

## Product Principles

1. **A Fábrica e o Plano Devem Falar a Mesma Verdade**: Nenhuma tela deve deixar dúvida sobre o que está rodando, o que está na fila e onde existem gargalos ou paradas.
2. **Ergonomia e Densidade para Decisões em 2 Segundos**: O operador ou programador deve absorver o estado da linha sem rolagem excessiva, com contraste balanceado e clareza imediata.
3. **Imutabilidade e Disciplina Operacional**: O que foi planejado para a fábrica é rigorosamente respeitado; inserções de emergência e quebras seguem regras claras de cascata sem mascarar a rastreabilidade.
4. **Lean TPS Real, Não Apenas Cosmético**: O comportamento do software deriva da física industrial real (tempos de ciclo, setups, pausas, capacidade de estoque e ritmo de produção).

## Accessibility & Inclusion

- Suporte completo a tema Claro / Escuro com persistência local.
- Acessibilidade W3C: modais renderizados via React Portal na raiz com backdrop blur, foco e fechamento por tecla `Escape`.
- Tipografia escalável e contrastes calibrados para painéis industriais sob luz ambiente variável.
