# Guia Completo de Deploy no Servidor Corporativo — Planner Logística

Este guia orienta a transferência e execução do sistema **Planner Logística** deste computador cliente para o **servidor corporativo da empresa**, garantindo que todas as dependências, banco de dados pré-populado, backend e interface web funcionem de forma 100% autônoma e em 1 único clique.

---

## 1. Visão Geral da Arquitetura em Containers

O sistema é composto por 3 serviços orquestrados via **Docker Compose**:

| Serviço | Container | Imagem | Porta Host | Descrição |
|---|---|---|---|---|
| **Banco de Dados** | `planner_postgres` | `postgres:16-alpine` | `5432` | PostgreSQL 16 com persistência em volume e script de inicialização automática (`01_init.sql`) contendo todos os 56 patans, usuários e parâmetros. |
| **Backend** | `planner_backend` | `plannerlogistica-backend:latest` | `8000` | API FastAPI + Uvicorn + migrações Alembic automáticas. |
| **Frontend / Proxy** | `planner_frontend` | `plannerlogistica-frontend:latest` | `80` e `5173` | Nginx servindo o bundle React compilado e atuando como proxy reverso para `/api/`, `/ws/` e `/docs`. |

---

## 2. Pré-requisitos no Servidor da Empresa

No servidor de destino, basta ter instalado:
- **Docker** e **Docker Compose** (Docker Desktop no Windows Server ou Docker Engine no Linux / Ubuntu Server).

---

## 3. Passo a Passo de Migração

### Cenário A: Servidor com Acesso à Internet (Recomendado / Mais Fácil)

1. **Copie a pasta inteira do projeto** `plannerLogistica` para o servidor (via rede, pendrive ou Git).
2. No servidor, abra a pasta e dê **duplo-clique em**:
   ```bat
   iniciar_servidor.bat
   ```
   *(No Linux: execute `./iniciar_servidor.sh`)*
3. O script irá:
   - Baixar e inicializar o PostgreSQL;
   - Subir o banco de dados carregando automaticamente todos os dados reais em `docker/initdb/01_init.sql`;
   - Iniciar o Backend e Frontend;
   - Informar no terminal o endereço IP da máquina para acesso na rede.

---

### Cenário B: Servidor Offline / Rede Fechada (Air-Gapped / Sem Internet)

Caso o servidor da empresa não possua acesso livre à internet externa:

1. **Neste computador atual** (onde o Docker já construiu as imagens):
   - Dê duplo-clique em:
     ```bat
     exportar_imagens_docker.bat
     ```
   - Isso irá gerar o arquivo **`planner_imagens.tar`** contendo as 3 imagens completas do sistema (Postgres, Backend e Frontend).
2. **Copie a pasta do projeto junto com o arquivo `planner_imagens.tar`** para o servidor de destino (via pendrive ou rede corporativa).
3. **No servidor de destino**:
   - Dê duplo-clique em:
     ```bat
     importar_imagens_docker.bat
     ```
   - Quando terminar, dê duplo-clique em:
     ```bat
     iniciar_servidor.bat
     ```
   - O sistema subirá instantaneamente sem precisar baixar absolutamente nada da internet!

---

## 4. Como Acessar o Sistema na Empresa

### A partir do próprio Servidor:
- **Interface Web**: [http://localhost](http://localhost) (porta padrão 80) ou [http://localhost:5173](http://localhost:5173)
- **Documentação da API (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

### A partir de Qualquer Outro PC ou TV na Rede Corporativa:
Basta abrir o navegador e digitar o endereço IP do servidor:
```
http://<IP_DO_SERVIDOR>
```
*(Exemplo: `http://192.168.1.150` ou `http://10.0.0.45`)*

> [!TIP]
> O script `iniciar_servidor.bat` já lista automaticamente os IPs detectados na máquina para facilitar a cópia do link.

---

## 5. Usuários e Acessos Padrão

O banco de dados pré-populado já vem com o usuário administrador principal ativo:

| Perfil | Usuário | Senha Padrão | Acesso / Permissões |
|---|---|---|---|
| **Administrador** | `admin` | `admin` | Acesso total: cadastro de novos usuários, parametrizações horárias, pausas, reaberturas. |
| **Outros Usuários** | `mat`, `gus` | *(senhas originais)* | Usuários existentes preservados do banco local. |

> [!TIP]
> Assim que acessar como `admin`, você pode cadastrar novos operadores, ferramenteiros ou alterar senhas a qualquer momento pelo menu **Usuários** (`/usuarios`).

---

## 6. Comandos e Scripts de Manutenção

- **Parar o Servidor**:
  - Windows: Dê duplo-clique em `parar_servidor.bat`
  - Linux: `./parar_servidor.sh`
- **Acompanhar Logs em Tempo Real**:
  ```bash
  docker compose logs -f
  ```
- **Acompanhar Logs de um serviço específico**:
  ```bash
  docker compose logs -f backend
  docker compose logs -f frontend
  docker compose logs -f postgres
  ```
- **Fazer Backup do Banco de Dados**:
  ```bash
  docker compose exec postgres pg_dump -U postgres planner_logistica > backup_$(date +%Y%m%d).sql
  ```
