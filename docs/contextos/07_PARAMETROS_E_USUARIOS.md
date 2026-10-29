# Contexto 07 — Telas Parâmetros (`/parametros`) e Usuários (`/usuarios`)

## 1. Tela de Parâmetros Operacionais (`/parametros`)

Localização no código: `backend/app/repositories/parametro_repository.py`.

### Parâmetros Configuráveis pelo Usuário
- **Horários de Início de Turno**:
  - `hora_inicio_turno_1` (Padrão: `06:20`)
  - `hora_inicio_turno_2` (Padrão: `14:40`)
  - `hora_inicio_turno_3` (Padrão: `23:00`)
- **Horários e Duração de Refeição (Almoço)**:
  - `hora_refeicao_turno_1` (Padrão: `10:20`)
  - `hora_refeicao_turno_2` (Padrão: `18:40`)
  - `hora_refeicao_turno_3` (Padrão: `03:00`)
  - `duracao_refeicao_minutos` (Padrão: `40`)
- **Gestão de Linhas de Produção por Setor**:
  - Permite criar, renomear e arquivar linhas associadas a `solda` ou `estamparia`.
  - Requer permissão `pode_gerenciar_linhas` ou perfil `admin`.

---

## 2. Gestão de Usuários & Matriz RBAC (`/usuarios`)

### Permissões Granulares por Usuário
Além do perfil base (`role`: `admin`, `programador`, `programador_ferramentaria`, `usuario_comum`), o sistema suporta permissões finas:
- `pode_ver_solda`: Permite visualizar a produção e programação da Solda.
- `pode_ver_estamparia`: Permite visualizar a produção e programação da Estamparia.
- `pode_gerenciar_linhas`: Permite cadastrar e alterar linhas no menu Parâmetros.
- `pode_gerenciar_ferramentaria`: Permite gerenciar ordens de manutenção, preventivas e emitir laudos na Ferramentaria.
- `pode_gerenciar_colunas_extras`: Permite criar e excluir buckets no Kanban da Produção.
