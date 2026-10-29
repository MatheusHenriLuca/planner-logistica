# Contexto 08 — Referência de APIs (Estilo Swagger) & WebSockets

## 1. Swagger UI Nativo do Backend
O backend FastAPI expõe a interface interativa do Swagger OpenAPI diretamente em:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc UI**: `http://localhost:8000/redoc`
- **OpenAPI Schema (JSON)**: `http://localhost:8000/openapi.json`

---

## 2. Catálogo Resumido dos Endpoints REST

### Autenticação & Usuários (`/auth`, `/users`)
- `POST /auth/login`: Autenticação via formulário OAuth2 (`username`, `password`) -> Retorna `{ access_token, token_type }`.
- `POST /auth/register`: Registro de usuário (aberto para primeiro admin, restrito a admin após isso).
- `GET /users/me`: Retorna perfil do usuário logado, cargo e permissões granulares.
- `GET /users`: Lista todos os usuários (Admin).
- `PATCH /users/{id}`: Atualiza cargo ou permissões do usuário.
- `DELETE /users/{id}`: Remove usuário.

### Programação & Sequenciamento (Staging) (`/producao/sequencia`)
- `GET /producao/sequencia`: Retorna os itens de staging com diagnóstico de estoque ao vivo (`linha`, `turno`, `patan`, `setor`).
- `POST /producao/sequencia/enviar`: Persiste o lote na Tabela B e emite notificação WebSocket.
- `POST /producao/sequencia/reordenar`: Atualiza a ordenação das peças de um posto em duas fases.
- `POST /producao/sequencia/remover`: Remove um item do lote antes do envio.
- `POST /producao/sequencia/sincronizar`: Executa sincronização de dados a partir da planilha Excel.
- `POST /producao/sequencia/sincronizar-sap`: Sincroniza demandas e saldos de estoque via SAP.

### Produção Oficial (Tabela B) (`/producao`)
- `GET /producao/tabela-b`: Retorna os lotes oficiais persistidos (`linha`, `turno`, `setor`, `data`).
- `PATCH /producao/itens/{id}/iniciar-producao`: Marca `em_producao = true` no primeiro card da coluna.
- `PATCH /producao/itens/{id}/concluir-producao`: Aponta peças produzidas e move para concluídas.
- `PATCH /producao/itens/{id}/quebra-ferramenta`: Registra parada por avaria e abre O.S. na Ferramentaria.
- `PATCH /producao/itens/{id}/pausar-producao`: Pausa lote em andamento (Admin).
- `POST /producao/inserir-card`: Injeta ordem de emergência e empurra subsequentes em cascata.
- `DELETE /producao/limpar-producao`: Limpa itens em produção para testes (Admin).
- `GET /producao/exportar`: Exporta CSV sanitizado da Tabela B.

### Ferramentaria & Catálogo (`/ferramentaria`)
- `GET /ferramentaria/manutencoes`: Lista todas as ordens de serviço ativas no Kanban.
- `POST /ferramentaria/manutencoes`: Abre uma nova manutenção corretiva ou preventiva.
- `PATCH /ferramentaria/manutencoes/{id}/status`: Avança o status (`aguardando_manutencao` -> `em_manutencao` -> `tryout` -> `disponivel`).
- `GET /ferramentaria/catalogo`: Lista matrizes cadastradas com semáforo de preventiva.
- `POST /ferramentaria/catalogo`: Cadastra nova ferramenta no catálogo.
- `POST /ferramentaria/catalogo/{id}/abrir-preventiva`: Gera ordem no Kanban e bloqueia material no Patan.

### Parâmetros & Linhas (`/parametros`, `/linhas`)
- `GET /parametros`: Lista horários de turno e durações configuradas.
- `PUT /parametros`: Atualiza parâmetros operacionais.
- `GET /linhas`: Lista linhas cadastradas por setor (`solda` ou `estamparia`).
- `POST /linhas`: Cria nova linha de produção.

---

## 3. Protocolo WebSocket (`/ws/producao`)

- **Conexão**: `ws://localhost:8000/ws/producao`
- **Handshake de Autenticação**:
  Após conectar, o cliente envia imediatamente:
  ```json
  { "type": "auth", "token": "<JWT_TOKEN>" }
  ```
  Se o token for válido, o servidor responde:
  ```json
  { "type": "auth_ok", "username": "usuario" }
  ```
- **Transmissão de Eventos**:
  Quando ocorrem alterações na fábrica, o servidor faz broadcast para todos os clientes conectados:
  ```json
  { "type": "producao_atualizada", "motivo": "envio_lote", "setor": "solda", "linha": "LINHA 1" }
  ```
