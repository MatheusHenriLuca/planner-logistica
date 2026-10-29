# Documento de Visão Geral: Sistema `planner_logistica`

## 1. Introdução
O **`planner_logistica`** é um aplicativo web voltado para o sequenciamento e gestão da produção. A interface principal será baseada em um modelo *Kanban* (semelhante ao Microsoft Planner), utilizando o sistema de colunas, movimentação de cards ("arrastar e soltar") e funcionalidades internas nos cards (cujos detalhes técnicos constarão no documento complementar `planner_requisitos.md`).

## 2. Conceitos de Negócio
* **Patan (Sequência de Produção):** O "Patan" é a regra de negócio central. Ele define uma sequência de produção diária. 
* **Escopo Inicial:** O foco primário será o setor de **Solda**. O Patan deste setor é dividido em 8 sequências (identificadas pelas letras de A a H).
* **Posto de Produção:** Cada coluna no sistema Kanban representará um posto de produção específico.

## 3. Perfis de Usuários (Controle de Acesso)
O sistema contará com três níveis hierárquicos de acesso:
1. **Administrador (`Admin`):** Possui acesso irrestrito ao sistema. Pode criar painéis, gerenciar usuários, visualizar e programar o Patan.
2. **Programador:** Possui acesso às funcionalidades do usuário comum e acesso exclusivo à "Tela de Programação de Patan". É o responsável por montar, calcular e enviar a fila de produção.
3. **Usuário Comum (`User`):** Tem acesso apenas à área de visualização e operação da produção (interface estilo Planner). Pode interagir com os cards, mas não tem permissão para gerar novas programações.

## 4. Telas Principais
Inicialmente, o sistema deve ser estruturado com 3 telas principais:

* **Tela de Gerenciamento de Usuários:** Interface para criação, edição e exclusão de usuários, bem como atribuição de seus respectivos perfis (Admin, Programador, User).
* **Tela de Programação de Patan:** Ambiente restrito a Programadores e Admins. É o painel de controle onde as ordens de produção são requisitadas, ajustadas e calculadas.
* **Tela de Produção (Visualização de Cards):** Interface Kanban (estilo Planner) dividida por áreas/linhas de produção (ex: *Linha 1 - Solda*, *Linha 2 - Solda*). Administradores devem ter a capacidade de criar e gerenciar essas divisões de linhas de forma dinâmica.

## 5. Fluxo de Trabalho (Jornada do Programador)
O fluxo principal de utilização segue as seguintes etapas:

1. **Requisição:** O Programador acessa a Tela de Programação e seleciona três parâmetros: **Linha**, **Turno** e **Patan**.
2. **Processamento Backend:** O sistema envia a requisição para o backend em Python.
3. **Retorno de Dados:** O Python processa e devolve para a interface:
   * As peças pertencentes à solicitação exata.
   * As **peças críticas** daquela linha (que precisam ser produzidas, mesmo não fazendo parte do Patan solicitado).
4. **Análise e Ajuste:** O Programador visualiza todas as peças e tem a liberdade de reordenar a sequência de produção.
5. **Recálculo Automático:** **[Regra Crítica]** Se o Programador alterar a sequência das peças, o sistema deve obrigatoriamente recalcular o tempo de produção de todas as peças daquela mesma coluna (Posto de Produção).
6. **Validação e Liberação:** Após validar os tempos e a sequência, o Programador envia a programação finalizada para a "Produção".
   * **[Regra de Inserção na Produção]:** Ao enviar os cards para a tela de Produção, os novos itens devem ser enfileirados de baixo para cima (adicionados no final da fila da respectiva coluna). O sistema **não pode sobrescrever, apagar ou alterar** os cards que já estão em andamento na produção.
7. **Execução:** A programação é disponibilizada na Tela de Produção, onde os Usuários Comuns (operadores) poderão visualizar e movimentar os cards de acordo com o andamento do trabalho.

*** 

> **Nota:** Este documento serve como um *Briefing* arquitetural. Funcionalidades detalhadas dos cards e componentes de UI estarão mapeadas no arquivo `planner_requisitos.md`.