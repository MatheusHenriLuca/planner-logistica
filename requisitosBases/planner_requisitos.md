# PRD (Product Requirements Document): Aplicativo de Gestão de Tarefas (Clone do Microsoft Planner)

Este documento foi estruturado especificamente para servir como contexto e roteiro (prompt base) para o desenvolvimento do sistema por uma IA. Ele detalha a arquitetura lógica, funcionalidades e requisitos não funcionais.

## 1. Entidades Principais (Modelo de Dados)
- **Planos/Projetos (Boards):** O contêiner principal para um grupo de tarefas.
- **Buckets (Colunas/Categorias):** Subdivisões personalizáveis dentro de um plano para organizar tarefas (ex: "Backlog", "Em Análise", "Concluído").
- **Tarefas (Tasks):** A unidade básica de trabalho contida dentro de um Bucket.
- **Usuários (Users/Members):** Pessoas autenticadas que podem ser atribuídas aos planos e tarefas.

## 2. Funcionalidades da Tarefa (Task Level)
- **Atributos Básicos:** Título, Descrição rica, Data de Início e Data de Conclusão (Due Date).
- **Status de Progresso:** Não Iniciado (Not Started), Em Andamento (In Progress) e Concluído (Completed).
- **Prioridade:** Urgente, Importante, Média, Baixa.
- **Atribuição Múltipla:** Capacidade de atribuir a mesma tarefa a um ou mais membros do plano.
- **Checklists (Subtarefas):** Lista de itens de verificação dentro da tarefa, com cálculo automático de progresso (ex: 2/5 concluídos) exibido no cartão principal.
- **Anexos e Links:** Upload de arquivos diretos na tarefa ou inclusão de links de referência.
- **Rótulos (Labels):** Tags coloridas personalizáveis pelo usuário (nome e cor) para categorização transversal.
- **Comentários/Histórico:** Feed de atividades e comentários para comunicação direta no contexto da tarefa.

## 3. Visualizações do Plano (Views)
- **Quadro (Board/Kanban):** Interface principal. Visualização em cartões. Suporte obrigatório a *drag-and-drop* (arrastar e soltar) para mover tarefas entre Buckets ou reordená-las.
- **Lista (Grid):** Visualização em formato de tabela/planilha, permitindo edição rápida em lote e visualização densa dos dados.
- **Gráficos (Dashboard):** Painel gerencial nativo mostrando métricas consolidadas: 
  - Status geral das tarefas (pizza/donut).
  - Tarefas por bucket (barras).
  - Carga de trabalho por membro (para identificar gargalos).
- **Cronograma (Calendar):** Visualização das tarefas distribuídas em um calendário mensal/semanal com base em suas datas.

## 4. Agrupamento e Filtros Dinâmicos
- **Agrupamento bidimensional:** O usuário deve poder alternar a visualização do Quadro (colunas) não apenas por Buckets, mas agrupar dinamicamente por: Atribuído a, Progresso, Data de Conclusão, Rótulos ou Prioridade.
- **Filtros avançados:** Filtragem combinada (ex: mostrar apenas tarefas com rótulo "Bug", atribuídas a "João", que estão "Atrasadas").

## 5. Requisitos de Sistema, Integração e Exportação
- **Exportação de Dados:** Funcionalidade crucial para baixar a base de dados do plano em formato **.xlsx (Excel)** ou CSV. Os dados exportados devem ser limpos e tabulares, facilitando análises de melhoria contínua e a conexão com ferramentas externas de BI (como Power BI).
- **Notificações:** Sistema de alertas (in-app ou e-mail) acionado quando um usuário é atribuído a uma tarefa, quando uma tarefa acompanhada é comentada, ou quando prazos estão expirando.
- **Gestão de Acesso (RBAC):** Diferenciação entre Proprietários do Plano (podem excluir o plano e gerenciar membros) e Membros (podem interagir com as tarefas).

## 6. Requisitos Não Funcionais e Técnicos
- **Atualização em Tempo Real:** Uso de WebSockets ou Server-Sent Events (SSE) para que alterações feitas por um usuário reflitam instantaneamente na tela dos demais.
- **Responsividade:** Interface perfeitamente adaptável para uso em desktops (foco em produtividade) e dispositivos móveis (foco em acompanhamento).
- **Segurança:** Autenticação forte e validação de permissões no backend (um usuário não pode acessar via API tarefas de um plano ao qual não pertence).
