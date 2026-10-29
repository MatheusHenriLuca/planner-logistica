# Contexto 01 — Tela de Programação (`/programacao`)

## 1. Objetivo da Tela
A tela de **Programação de Patan** (`/programacao`, `/programacao/solda`, `/programacao/estamparia`) é o ambiente de trabalho do Programador PCP.
Nesta tela, opera-se sobre a **Tabela A (Staging)**, montando o sequenciamento antes de liberá-lo oficialmente para o chão de fábrica.

---

## 2. Cockpit de Controle e Operações

### Tier 1 (Ações Principais)
- **Switcher de Setor**: Alterne instantaneamente entre `⚡ Solda` e `🏭 Estamparia`.
- **Menu "Ações e Ferramentas ▾"**:
  - `+ Inserir Card`: Permite adicionar um card manual para a linha/turno/posto.
  - `Montar Padrão`: Recarrega a receita teórica oficial do Patan selecionado, limpando cartões retirados.
  - `Limpar Linha`: Limpa o rascunho de staging daquela linha para recomeçar.
  - `Sincronizar SAP`: Atualiza saldos de estoque e demandas diretamente via integração SAP.
  - `Sincronizar Excel`: Reimporta a matriz de dados do arquivo `AutomacaoPlanner.xlsx`.
- **Botão "Itens Críticos (N)"**: Abre gaveta lateral com os materiais em quarentena ou sem saldo.
- **Botão "Enviar lote"**: Único botão primário destacado. Persiste o lote na Tabela B e notifica a fábrica via WebSocket.

### Tier 2 (Filtros e Modos)
- **Linha**: Seleção da linha fabril associada ao setor ativo.
- **Turno**: 1º Turno (06:20), 2º Turno (14:40) ou 3º Turno (23:00).
- **Patan**: Patans de `A` a `H` (Solda) ou de `A` a `P` com sub-patans numéricos (Estamparia).
- **Data da Programação**: Permite planejar para hoje ou qualquer dia futuro, com controles `◀`, `▶` e `Hoje`.
- **Modos de Dimensionamento**:
  - `🎯 Lote Fixo (Patan)`: Carrega o tamanho de lote padrão estipulado pela receita do produto.
  - `📊 Estoque Máximo (Carga Máquina)`: Ajusta os kanbans para atingir a capacidade máxima (`kanban_max`).
- **Alternadores de Visão**:
  - `🗂️ Cards`: Kanban visual com drag-and-drop por postos de trabalho.
  - `⏱️ Seisan Kanriban`: Linha do tempo simulada com régua horária e visualização de tempos de ciclo.
  - `📐 Modo Compacto` / `📑 Modo Detalhado`: Alterna densidade das informações nos cards.

---

## 3. Regras de Negócio Críticas

1. **Cálculo da Cascata ("Escadinha")**:
   - `hora_inicial[1]` = Horário de início do turno (`SHIFT_START_TIME`).
   - `hora_inicial[n]` = `hora_final[n-1]` no mesmo posto de trabalho.
   - Fórmula: `tempo_producao = Kanbans × Qtd_por_Kanban × Tempo_por_Peca`.
2. **Pausa de Refeição (Almoço)**:
   - Se a janela de produção de um item cruzar o horário configurado de refeição (`hora_refeicao_turno_X`), soma **+40 minutos** (ou duração configurada) no `hora_final` daquele item, uma única vez.
   - O card exibe o selo `HORARIO DE ALMOCO INCLUSO`.
3. **Remoção de Cards**:
   - O botão `✕` no canto superior direito de cada card permite retirá-lo da fila.
   - A cascata dos itens seguintes é recalculada instantaneamente.
4. **Hierarquia e Destaque nos Cards Kanban**:
   - **Material** em maior destaque visual (`text-sm sm:text-base font-black font-mono`).
   - **Duração em Minutos & Alertas Independentes de Lote Curto (Estamparia vs Solda)**: horários com `— X min` e aviso visual `⚠️ LOTE CURTO ESTAMPARIA (< X MIN)` ou `⚠️ LOTE CURTO SOLDA (< X MIN)` na tela de Programação, avaliados de forma 100% independente com base nos parâmetros configurados em `/parametros`:
     - *Estamparia*: `limite_lote_curto_minutos` (padrão 60 min).
     - *Solda*: `limite_lote_curto_solda_minutos` (padrão 60 min).
   - **Total de Caixas e Peças**: exibido como `Total: X K = Y pçs`.
   - **Componentes Estruturados & Matéria-Prima**:
     - *Modo Compacto*: micro-chips diretos `[ESTAMP: cod (qtd)]`, `[VtoV: cod (qtd)]`, `[M.P: cod (kg)]` e dados de embalagem.
     - *Modo Detalhado*: lista estruturada com scroll protegido (`max-h-48`) identificando Estampados vs VtoV, cálculo de consumo e indicação de `⚠️ Falta` caso a demanda supere o estoque físico.
   - **Labels**: Exibição automática das etiquetas de máquina (Prensas e Ponteadeiras `PONTE XX`).
5. **Bloqueio por Ferramenta em Manutenção**:
   - Se qualquer material do lote estiver com manutenção pendente na Ferramentaria (status $\ne$ `disponivel`), o card ganha aviso visual vermelho e o botão **Enviar Lote** é bloqueado com erro 400.
6. **Modelo de Resumo do Lote Customizável (Anotações do Card)**:
   - No modal `ItemDetalhe.tsx`, o botão **"✨ Preencher Resumo do Lote"** gera automaticamente o texto de anotações formatado conforme a configuração salva pelo usuário em `/parametros`.
   - Suporte completo a templates independentes por setor (**Solda** e **Estamparia**), reordenação de blocos com setas `↑` / `↓`, checkboxes de ativação e live preview em tempo real.

---

## 4. Guia Rápido de Suporte (Troubleshooting)

- **Problema: Todos os itens de solda aparecem com mesmo horário inicial (ex: 06:20 -> 06:20).**
  - *Causa*: O arquivo Excel tinha `tempPeca` zerado.
  - *Solução*: O sistema agora calcula automaticamente via `tempoProd / (kanbans * qtd)`. Basta clicar em `Ações e Ferramentas ▾` -> `Montar Padrão` para recalcular.
- **Problema: Enviar Lote falha com aviso de "Ferramenta Bloqueada".**
  - *Causa*: Há uma ferramenta correspondente em manutenção na Ferramentaria.
  - *Solução*: Concluir e liberar a ferramenta em `/ferramentaria` ou retirar o card do lote clicando em `✕ Remover do lote (Ferramenta Bloqueada)`.
