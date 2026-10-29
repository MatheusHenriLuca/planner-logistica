# Contexto 02 — Tela de Produção (`/producao`)

## 1. Objetivo da Tela
A tela de **Produção** (`/`, `/producao/solda`, `/producao/estamparia`) é a interface oficial do chão de fábrica (Tabela B).
É aqui que operadores e líderes de linha acompanham o sequenciamento firme, realizam apontamentos e registram ocorrências em tempo real.

---

## 2. Cockpit de Controle e Operações

### Tier 1 (Ações Principais)
- **Identificação do Setor**: Badge de setor e switcher rápido (`⚡ Solda` / `🏭 Estamparia`).
- **`+ Ordem de Emergência`** (Visível apenas para Programador e Admin):
  - Permite injetar um card urgente diretamente na produção persistida.
  - O sistema empurra todos os lotes subsequentes daquele posto em cascata cronológica.
- **`Exportar CSV`**: Exporta o relatório completo da Tabela B com sanitização de fórmulas.
- **`Limpar Produção`** (Exclusivo Admin):
  - Ferramenta para testes e reset de ordens em produção sem acesso manual ao banco.

### Tier 2 (Filtros de Escopo e Modos Visuais)
- **Linha**: Filtra os postos de trabalho da linha ativa.
- **Turno**: Padrão "Todos os Turnos" (`turno=0`), permitindo acompanhar a fábrica de ponta a ponta sem cortes.
- **Data da Produção**: Seletor com botões rápidos `◀`, `▶`, `Hoje` e `Todas`.
- **Alternador Trimodal**:
  - `Quadro`: Kanban visual por colunas de postos de trabalho e buckets extras.
  - `Tabela`: Visão densa com busca instantânea e 100% de paridade de ações.
  - `Linha do Tempo`: Foco exclusivo na produção real com tracks horizontais contínuas por posto e régua sincronizada.
- **Alternador de Densidade dos Cards (`📐 Modo Compacto` vs `📑 Modo Detalhado`)**:
  - Permite escolher entre cards compactos e enxutos ou visão detalhada expandida diretamente no chão de fábrica.

---

## 3. Regras de Chão de Fábrica

### Regra da Posição 0 (Topo da Fila)
- O botão **`▶ Iniciar Produção`** é habilitado **estritamente para o primeiro card (índice 0)** da coluna do posto.
- Itens posteriores não exibem o botão. Se o operador precisar produzir fora de ordem, deve **arrastar o card para o topo**.

### Apontamentos em Produção Ativa (`em_producao == true`)
1. **`✓ Concluir`** (`PATCH /producao/itens/{id}/concluir-producao`):
   - Abre modal obrigando o apontamento da **Quantidade de peças produzidas** ($> 0$).
   - O item é movido automaticamente para a coluna extra "Concluídas".
2. **`⚠️ Quebra`** (`PATCH /producao/itens/{id}/quebra-ferramenta`):
   - Abre modal exigindo a **Quantidade produzida até a quebra** e o **Motivo da quebra**.
   - O item é movido para "Quebra de Máquina" e **abre automaticamente uma O.S. na Ferramentaria** como `aguardando_manutencao`.
3. **`⏸ Pausar`**:
   - **Exclusivo para Administrador**. Operadores não podem pausar lotes em aberto; o lote deve ser concluído com peças ou apontado como quebra/avaria.
4. **`↩ Desfazer ({60 - s}s)`**:
   - Salvaguarda contra início acidental disponível para qualquer operador nos primeiros 60 segundos após o início.

### Isolamento de Estoque e Ausência de Alertas Analíticos
- **Sem Falta de Estoque**: A tela de Produção é estritamente operacional. Alertas de falta de saldo, badges de carência de insumos e botões de dimensionamento de capacidade **NÃO existem na tela de Produção**. O operador não deve se preocupar com análise de estoque, pois o sequenciamento foi previamente validado e liberado pelo PCP.
- **Sem Alerta de Lote Curto**: Avisos de lote curto (`< 60 min`) são ferramentas analíticas exclusivas da tela de Programação (`/programacao`) e não são renderizados no chão de fábrica.

### Visualização Sucinta de Matéria-Prima, Componentes e VtoV
- **Otimização para Telas de TV**: Colunas largas (`w-80 md:w-[330px] xl:w-[350px]`) e tipografia de alta visibilidade (`font-black`) no código do material, facilitando o acompanhamento à distância.
- **Modo Compacto (Chips Neutros e Concisos)**:
  - *Solda*: Micro-chips em estética neutra: `[EST: código (qtd pç)]` e `[VtoV: código (qtd pç)]`, acompanhados de código da embalagem `Emb: EMB`.
  - *Estamparia*: Código real da peça estampada, com paletização `[📦 XP (Y cx)]` e matéria-prima `[MP: código]` quando especificada. Sem strings fictícias de bobina.
- **Modo Detalhado**:
  - Painel com lista completa de insumos consumidos protegido contra quebras de layout (`max-h-48 overflow-y-auto` com cabeçalho fixo).

### Nomenclatura dos Postos da Solda (Ponteadeiras: PONTE XX) & Etiquetas
- **Solda**: Postos com código SAP `B6420xx` são convertidos para o nome conciso oficial da máquina: **`PONTE XX`** (ex: `PONTE 43`, `PONTE 36`, `PONTE 23`).
- **Estamparia**: Mantém as nomenclaturas de prensas (ex: `PR-82`, `PR-108`, `PR-114`).
- **Etiquetas por Máquina**: Toda ordem criada recebe automaticamente a etiqueta de cor correspondente à sua prensa ou ponteadeira.

### Anotações da Programação vs Comentários
- **Anotações (`anotacoes`)**: Notas fixas do programador no modal do card. Apenas administradores e programadores podem editar. Operadores visualizam em modo somente leitura com botão de copiar. Se a opção "Mostrar no quadro" estiver marcada, o bloco de notas é renderizado diretamente no card do Kanban.
- **Comentários**: Aberto a todos os usuários para histórico operacional e recados de chão de fábrica.
- **Anexos**: Removidos da interface por simplificação operacional.

---

## 4. Guia Rápido de Suporte (Troubleshooting)

- **Problema: Operador não vê o botão "▶ Iniciar Produção".**
  - *Causa*: O card não está no topo da fila (índice 0) ou já existe outro lote ativo no posto.
  - *Solução*: Concluir o lote que está em produção ativa ou arrastar o card desejado para a primeira posição.
- **Problema: Horários da produção mudaram repentinamente.**
  - *Causa*: Um programador ou admin utilizou a função `+ Ordem de Emergência`, que intencionalmente reprograma os lotes seguintes para abrir espaço ao lote urgente.
