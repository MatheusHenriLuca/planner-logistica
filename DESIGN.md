---
name: Planner Logística
description: Sistema integrado de sequenciamento e controle de produção puxada Lean TPS automotivo
colors:
  primary: "#059669"
  primary-hover: "#047857"
  primary-surface: "#ecfdf5"
  secondary: "#4f46e5"
  secondary-surface: "#eef2ff"
  accent-tandem: "#0284c7"
  accent-tandem-surface: "#f0f9ff"
  status-normal: "#64748b"
  status-critico: "#dc2626"
  status-critico-surface: "#fef2f2"
  status-aviso: "#d97706"
  status-aviso-surface: "#fffbeb"
  neutral-bg: "#f8fafc"
  neutral-surface: "#ffffff"
  neutral-border: "#e2e8f0"
  neutral-text: "#0f172a"
  neutral-text-muted: "#64748b"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.025em"
  mono-code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.01em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  button-danger:
    backgroundColor: "{colors.status-critico}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  card-kanban:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.lg}"
    padding: "12px"
  input-field:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.lg}"
    padding: "6px 10px"
---

# Design System: Planner Logística

## Overview

**Creative North Star: "O Cockpit Tático Lean"**

O design system do Planner Logística foi projetado para ambientes de alta responsabilidade operacional e ritmo acelerado, atendendo tanto a bancada de engenharia e planejamento de logística (PCP) quanto o piso fabril da Gestamp (estampagem pesada e estações de solda robotizada). Cada tela opera como um cockpit tático que consolida a física real da fábrica: tempos de ciclo milimétricos, escadinha cronológica ininterrupta, pausas de refeição e sincronismo de prensas em linha contínua.

A filosofia estética recusa categoricamente o "SaaS genérico de consumo" (espaços em branco inflados, fontes gigantescas com pouca informação útil e cartões desnecessariamente espaçados) e também recusa a "poluição confusa de sistemas legados de chão de fábrica" (telas acinzentadas estilo DOS/Excel sem hierarquia visual, sem contraste e sem legibilidade a distância). O sistema adota alta densidade informacional, ergonomia visual para turnos ininterruptos de 24 horas (prevenindo fadiga ocular) e legibilidade imediata em painéis industriais suspensos.

**Key Characteristics:**
- **Controle Visual Imediato**: O operador ou líder de produção compreende o status da linha (produzindo, fila, parada ou quebra) em menos de 2 segundos.
- **Tipografia Híbrida Balanceada**: Texto proporcional de alta clareza (Inter) combinado com numerais e códigos técnicos rigorosamente monoespaçados (font-mono) para Kanbans, peças, horários e ordens.
- **Camadas Tonais Sóbrias**: Paleta baseada na família neutra Slate com acentos funcionais semafóricos de alto contraste, sem cores decorativas vazias.
- **Sincronismo Interativo Não-Poluente**: Conexões complexas (como prensas em tandem) mantêm-se discretas em repouso e ganham destaque nítido on-demand através de linhas SVG celestiais.

## Colors

A paleta de cores é rigorosamente semafórica e funcional, onde cada matiz carrega um significado industrial inequívoco.

### Primary
- **Verde Esmeralda Operação** (`#059669` / hover `#047857` / superfície `#ecfdf5`): Cor da ação positiva e da produção em andamento. Usada no botão de iniciar ordens, apontamentos de peças concluídas, status normal OK e confirmação de lotes.

### Secondary
- **Índigo Prensas & Estamparia** (`#4f46e5` / hover `#4338ca` / superfície `#eef2ff`): Cor de precisão estrutural. Usada para identificar o setor de Estamparia, métricas de capacidade de caixas (`1 Kanban = X pçs/cx`) e destaques analíticos.

### Tertiary
- **Azul Celestial Tandem** (`#0284c7` / hover `#0369a1` / superfície `#f0f9ff`): Cor de sincronismo em linha contínua. Usada com sutileza em banners de produção em linha, bordas de cards sincronizados e conexões de enlace SVG entre postos irmãos.

### Neutral
- **Ardósia Fundo Claro** (`#f8fafc`): Fundo geral da aplicação no modo claro.
- **Ardósia Fundo Escuro** (`#020617`): Fundo base industrial no modo escuro.
- **Superfície Branca / Escura** (`#ffffff` / `#0f172a`): Superfície de cards Kanban, cockpits e modais.
- **Borda Estrutural** (`#e2e8f0` / escuro `#1e293b`): Linhas de demarcação de 1px entre colunas, cabeçalhos e painéis.
- **Texto Principal** (`#0f172a` / escuro `#f8fafc`): Tipografia de alto contraste para leitura sem esforço.
- **Texto Secundário / Técnico** (`#64748b` / escuro `#94a3b8`): Informações auxiliares, títulos de colunas e unidades de medida.

### Status & Semáforo Industrial
- **Rubi Parada & Quebra** (`#dc2626` / superfície `#fef2f2`): Paradas de máquina, abertura de O.S. na ferramentaria, quarentena e itens críticos (Status 3).
- **Âmbar Intervalo & Almoço** (`#d97706` / superfície `#fffbeb`): Pausa de refeição inclusa no lote, ferramentas próximas do vencimento e alerta de falta de estoque viável.
- **Cinza Excluído & Inativo** (`#9ca3af` / `#64748b`): Lotes fora do sequenciamento (Status 0).

### Named Rules
**The Two-Second Semaphoric Rule.** Nenhuma cor quente (vermelho, âmbar ou verde vivo) pode ser aplicada como adorno estético; elas são reservadas estritamente para estado de máquina, conformidade e fluxo de processo.
**The No-Neon Rule.** Cores saturadas elétricas ou fluorescentes são proibidas na interface para garantir conforto visual em turnos noturnos e sob lâmpadas de fábrica.
**The Tandem Subtlety Rule.** Cards que operam em tandem utilizam tons suaves de céu e ardósia (`bg-sky-50/40`, `border-sky-300`), nunca azul elétrico saturado em repouso.

## Typography

**Display Font:** Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif
**Body Font:** Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif
**Label/Mono Font:** ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace

**Character:** Tipografia técnica moderna de traço limpo e neutro com kerning otimizado para telas digitais. Todos os números de peças, contadores, Kanbans, horários e códigos de material utilizam fonte monoespaçada com alinhamento tabular natural.

### Hierarchy
- **Display** (Bold 700, `1.5rem` / `24px`, line-height `1.2`, letter-spacing `-0.02em`): Cabeçalhos de dashboards executivos e grandes contadores de KPI de linha.
- **Headline** (Bold 700, `1.25rem` / `20px`, line-height `1.25`, letter-spacing `-0.015em`): Título do Cockpit principal da página (ex: "Produção — Estamparia").
- **Title** (Semibold 600, `1rem` / `16px`, line-height `1.35`, letter-spacing `-0.01em`): Nomes dos postos de trabalho e cabeçalhos de colunas do Kanban.
- **Body** (Regular 400 ou Medium 500, `0.875rem` / `14px`, line-height `1.45`): Textos explicativos, linhas de tabelas densas e modais de diálogo.
- **Label / Tag** (Semibold 600 ou Bold 700, `0.75rem` / `12px`, letter-spacing `0.025em`, uppercase quando badge): Indicadores de turno (`1º T`), status de ferramentaria e filtros.
- **Mono Data** (Bold 700 / Medium 500, `0.75rem` / `12px` e `0.6875rem` / `11px`, font-mono): Peças produzidas (`100 pçs`), kanbans (`5k`), horários (`06:20 - 06:50`) e códigos SAP de materiais.

### Named Rules
**The Monospace Precision Rule.** Todo dado numérico que envolva quantidade, horário, sequência, código de peça ou duração temporal deve obrigatoriamente usar `font-mono`.
**The Badge Density Rule.** Badges informativas nunca excedem `text-xs` (12px) e preferem `text-[10px]` ou `text-[11px]` com padding ultracompacto para manter a densidade visual dos cards.

## Layout

O layout do Planner Logística é construído sobre uma grade fluida orientada a painéis e trilhas contínuas com rolagem horizontal sincronizada:

- **Estrutura Base**: Sidebar de navegação recolhível (`w-64` expandida, `w-16` compacta) e cabeçalho superior fixo com indicadores de conexão WebSocket e seletor rápido de tema.
- **Cockpit em 2 Níveis**: Cada página principal abre com um cockpit agrupado em 2 camadas funcionais:
  - Nível 1: Identificador do setor ativo, alternador rápido Solda/Estamparia e botões de ação primária (Inserir Ordem, Exportar, Limpar).
  - Nível 2: Escopo de filtros (Linha, Turno, Data com navegação dia a dia) e alternador trimodal de visualização (Quadro, Tabela, Linha do Tempo).
- **Coluna Congelada (`sticky left-0`)**: No Seisan Kanriban e na visão Linha do Tempo, a coluna lateral esquerda permanece permanentemente congelada com fundo translúcido (`backdrop-blur-md z-20`), permitindo navegar pela régua temporal ao longo das 24 horas do dia sem perder o identificador do posto.
- **Grade Contínua Alinhada ao Eixo X**: Todas as 3 faixas do Seisan Kanriban (Teórico, Programado e Realizado) compartilham o mesmo quadrante gráfico e cortam verticalmente até a régua horária na base, mantendo precisão milimétrica.

### Named Rules
**The Aligned-Axis Rule.** Nenhuma trilha temporal pode renderizar eixos de tempo dissociados; a linha vertical de tempo ("AGORA") e as linhas de grade devem cortar todas as faixas simultaneamente.
**The No-Scrollbars-Obstructing Rule.** Barras de rolagem utilizam estilo customizado minimalista e semitransparente de 8px para nunca encobrir dados da base das colunas.

## Elevation & Depth

A profundidade é expressa predominantemente através de **camadas tonais de fundo e bordas estruturais de 1px**, e não por sombras difusas pesadas. O sistema prioriza superfícies limpas e confiáveis:

### Shadow Vocabulary
- **Nenhum / Flat em Repouso**: Cards e painéis repousam em `border border-slate-200 dark:border-slate-800` sem sombra intrusiva.
- **Micro Sombra (`shadow-2xs` / `shadow-xs`)**: `0 1px 2px 0 rgb(0 0 0 / 0.05)`. Aplicada em botões e badges para discreto relevo tátil.
- **Sombra de Card Ativo (`shadow-sm` / hover `shadow-md`)**: `0 4px 6px -1px rgb(0 0 0 / 0.1)`. Surge quando o operador passa o mouse ou interage com um card do Kanban.
- **Sombra de Arraste (`shadow-lg` com rotação de 1deg)**: Ativada pelo `@dnd-kit` enquanto o card é movido na tela.
- **Elevação Máxima (`shadow-2xl` com `backdrop-blur-xs`)**: Exclusiva para janelas de diálogo e modais renderizados via React Portal na raiz do documento com `z-[9999]`.

### Named Rules
**The Flat-at-Rest Rule.** Todos os cards e blocos de dados permanecem planos em estado de repouso; sombras existem apenas como feedback de interação ou elevação modal.
**The Portal Isolation Rule.** Qualquer modal, popover ou tela de detalhe deve ser renderizado diretamente no `document.body` via `createPortal`, impedindo que transformações CSS de elementos pai prendam o componente em subníveis.

## Shapes

A linguagem formal combina retângulos técnicos industriais com cantos amigáveis que amenizam o impacto visual da densidade fabril:

- **Raio Pequeno (`rounded-md`, 6px)**: Botões secundários compactos, seletores de incremento de kanban (`+` / `-`) e pills de subnível.
- **Raio Médio Padrão (`rounded-lg`, 8px)**: Cards de lote do Kanban, botões primários, campos de entrada e blocos de execução do Seisan.
- **Raio Estrutural (`rounded-xl` / `rounded-2xl`, 12px a 16px)**: Envoltório do Cockpit de ferramentas, quadrante gráfico do Seisan e modais de apontamento.
- **Raio Total (`rounded-full`, 9999px)**: Selos de turno, pílulas de contadores e botões flutuantes.

## Components

### Buttons
- **Shape:** Cantos de 8px (`rounded-lg`), tipografia `text-xs font-bold`.
- **Primary Action (Iniciar / Concluir / Salvar):** Fundo Verde Esmeralda (`bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs px-3.5 py-2`).
- **Secondary Action (Exportar / Filtrar):** Fundo branco ou escuro com borda estrutural (`bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50`).
- **Danger Action (Quebra / Parada / Limpar):** Fundo Rubi (`bg-rose-600 hover:bg-rose-700 text-white`).
- **Micro Incrementos (`+` / `-`):** Botões táteis de 16x16px para ajuste rápido de lotes de kanban sem abrir formulários.

### Cards Kanban (`SequenciaCard`)
- **Corner Style:** 8px (`rounded-lg`), borda de 1px com transição suave.
- **Background por Turno:**
  - 1º Turno: `bg-slate-50/90 dark:bg-slate-800/90 border-slate-300 dark:border-slate-700`
  - 2º Turno: `bg-blue-50/40 dark:bg-blue-950/20 border-blue-200/90 dark:border-blue-800/60`
  - 3º Turno: `bg-purple-50/40 dark:bg-purple-950/20 border-purple-200/90 dark:border-purple-800/60`
  - Produção em Linha (Tandem): `bg-sky-50/40 dark:bg-sky-950/20 border-sky-300/80`
  - Crítico / Quarentena: `border-red-500 bg-red-50/20 dark:bg-red-950/20`
- **Em Produção:** Anel pulsante ao vivo (`ring-2 ring-emerald-500 shadow-md animate-pulse`).

### Inputs e Campos de Filtro
- **Style:** Fundo neutro com borda de 1px (`bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs px-3 py-1.5`).
- **Focus:** Anel suave de foco funcional (`focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none`).

### Modais e Portais (`ItemDetalhe`, `SeisanItemModal`)
- **Backdrop:** Cobertura total da viewport (`fixed inset-0 z-[9999] bg-black/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4`).
- **Container:** `rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-w-lg w-full`.
- **Comportamento:** Fechamento via clique externo e tecla `Escape`.

### Signature Component: Seisan Kanriban Gantt Triplo
- **Trilha 1 (Teórico):** Barras azuis/cinza de referência imutável do ciclo Patan com hachuras de almoço.
- **Trilha 2 (Programado):** Barras com os ajustes de lote da Tabela B e selo destacado `🍽️ Almoço`.
- **Trilha 3 (Realizado):** Verde sólido para lotes concluídos com peças reais, gradiente pulsante para lote ativo e vermelho encurtado com `⚡ GAP LIVRE` hachurado para paradas por quebra.

### Signature Component: Overlay de Conexão Tandem SVG
- Camada dinâmica vetorial não poluente que traça curvas de Bézier em `#0284c7` e `#7dd3fc` unindo postos que rodam a mesma peça, visível sob demanda no hover ou seleção do material.

## Do's and Don'ts

### Do:
- **Do** utilizar fonte monoespaçada (`font-mono`) em todos os números de peças, tempos, kanbans e identificadores técnicos.
- **Do** restringir a ação de iniciar produção estritamente à posição 0 da fila para preservar a disciplina da fábrica.
- **Do** renderizar qualquer modal, gaveta ou popover através de `createPortal` no `document.body` para escapar de restrições de stacking context do drag & drop.
- **Do** exibir em tempo real a capacidade viável de caixas (`Consegue produzir: X kanbans`) sempre que houver falta de estoque apontada pelo SAP (MB52).
- **Do** manter sincronizada a cascata matemática client-side com as regras de início de turno e acréscimo de refeição (+40 min).
- **Do** utilizar tons sutis `sky`/`slate` para produção em linha para evitar poluição visual em turnos longos.

### Don't:
- **Don't** inflar espaçamentos verticais e margens no estilo landing page/SaaS de consumo em telas de controle de chão de fábrica.
- **Don't** aplicar cores saturadas ou vibrantes como elemento meramente decorativo; cores são ferramentas de sinalização semafórica.
- **Don't** criar animações de transição lentas (> 200ms) que atrasem o apontamento de operadores de linha.
- **Don't** recalcular horários automaticamente na reordenação da Tabela B persistida (a Tabela B preserva a referência cronológica original).
- **Don't** omitir a indicação exata de refeição (`HORARIO DE ALMOCO INCLUSO` ou `🍽️ Almoço`) em cartões ou barras que absorveram o intervalo.
