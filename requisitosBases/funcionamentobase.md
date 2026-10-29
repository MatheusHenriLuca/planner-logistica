# Fluxo Operacional Detalhado: Integração Python & Power Apps (Kanban PCP)

Este documento descreve o fluxo de trabalho completo ("Caminho Feliz") do sistema de programação de fábrica, contemplando desde a extração de dados no servidor até a interação do usuário no chão de fábrica e a consolidação no SharePoint. O fluxo já prevê a arquitetura otimizada de duas listas (Staging e Produção).

---

## FASE 1: Extração e Tratamento no Backend (Python)
Esta fase ocorre de forma sistêmica e automatizada no servidor ou máquina local, preparando a carga de trabalho do dia.

1. **Extração de Saldo em Tempo Real (SAP):**
   * O módulo `mb52.py` é acionado para extrair os dados atuais de estoque diretamente do SAP[cite: 3].
   * Este saldo é fundamental para garantir que o sequenciamento não envie para a linha peças sem matéria-prima.

2. **Leitura e Higienização da Demanda (Excel):**
   * Os dados de entrada são lidos de planilhas Excel, que obrigatoriamente devem estar formatadas como Tabela[cite: 1].
   * O script `montar_patan_logic.py` processa a chave de identificação do lote, o "Patan", garantindo que ele obedeça à regra estrita de 8 caracteres[cite: 1, 3].

3. **Motor de Sequenciamento (`planner_logic.py`):**
   * Utilizando a biblioteca Pandas, o script agrupa a demanda por posto de trabalho[cite: 1].
   * **Regra de Isolamento:** Cabeçalhos de Turno e Itens Críticos (Status 3) têm sua `sequencia` forçada para `0`[cite: 1]. Isso evita que roubem a numeração das peças reais e destruam a cronologia da linha[cite: 1].
   * **Regra de Produção:** Apenas as peças válidas (`STATUS == 2`) recebem a numeração ordinal em cascata (1, 2, 3, 4...)[cite: 1].

4. **Transmissão para o SharePoint (Staging):**
   * O módulo `sharepoint_utils.py` assume o controle. O MSAL (`ConfidentialClientApplication`) é invocado globalmente para autenticar e gerar o token nativamente via Entra ID[cite: 1].
   * O script transforma o DataFrame em JSON e empacota os itens em lotes de 20 (JSON Batching) para respeitar os limites da Graph API (`/$batch`)[cite: 1].
   * Tratamento de Throttling: Se a API retornar Erro 429, o script pausa a execução, aguarda a liberação e reenvia o pacote, garantindo zero perda de dados[cite: 1].
   * Os dados são gravados na **Lista A (Buffer/Staging)**, aguardando a intervenção humana.

---

## FASE 2: Carga e Processamento em Memória (Power Apps)
Nesta etapa, o programador do PCP assume a operação visual através do aplicativo.

1. **Autenticação e Roteamento Inicial:**
   * O usuário acessa o app e passa pela tela de verificação de ID (`Verificaçao usuário`)[cite: 2]. O app cruza o e-mail logado com a base de ativos e define seu nível de acesso (`varperfil`)[cite: 2].

2. **Sincronização de Dados (`icoRefreshMainScreen`):**
   * Na tela principal (`mainScreenPlanner`), o usuário clica em atualizar[cite: 2].
   * O Power Apps busca os dados da **Lista A (Staging)** no SharePoint e os transfere integralmente para a memória do dispositivo usando `ClearCollect(coll_automacao_planner; list_automacaoPlanner_py)`[cite: 2].
   * Variáveis de contexto (`varpatan`, `varturno`, `varlinha`) são definidas baseadas no lote carregado[cite: 2].

3. **O Motor Matemático Oculto (`btn_obs`):**
   * Um botão invisível processa os dados locais da coleção para gerar o planejamento[cite: 2]:
   * **Cálculo de Volume:** Multiplica a quantidade de Kanbans pelas peças por Kanban para gerar o total de peças[cite: 2]. Multiplica o total de peças pelo `tempo_por_peca` para gerar o `tempo_prod` total[cite: 2].
   * **Cascata de Horários (Escadinha):** Identifica o item `sequencia = 1` e fixa a hora de partida baseada no turno selecionado (ex: 06:20, 14:40 ou 23:00)[cite: 2]. Um loop `ForAll` programa as peças subsequentes (2, 3, 4...) para iniciarem no exato minuto em que a peça anterior termina (`horaInicialCorreta`)[cite: 2].
   * **Explosão da BOM e Validação de Estoque:** A string `comp_comb` é quebrada (`Split`), calculando a demanda exata de cada componente do lote[cite: 2]. Se a demanda total for maior que o estoque do SAP, o status passa para "Falta Estoque", ativando alertas visuais (amarelo/vermelho) no card[cite: 2].

---

## FASE 3: Interação e Ajuste Fino (Power Apps)
Com a matemática processada, o usuário molda a produção de acordo com a realidade da fábrica.

1. **Reordenação (Seta Cima / Seta Baixo):**
   * O usuário altera a prioridade de uma peça[cite: 2]. O app executa um `Patch` local que inverte a `sequencia` do item clicado com a do seu vizinho[cite: 2].
   * Imediatamente, o motor matemático (`btn_obs`) é reativado para reajustar todos os horários afetados pela nova ordem[cite: 2].

2. **Ajuste de Volume (+ e -):**
   * O operador adiciona ou remove Kanbans (`icoAddKanban` / `icoRemoveKanban`)[cite: 2]. O app refaz a matemática de tempo de máquina e impacto no estoque[cite: 2].

3. **Tratamento de Exceções (Lixeira):**
   * Se uma peça for inviável (ex: material reprovado), o usuário clica na lixeira e envia o item para "Peças Críticas"[cite: 2]. O sistema faz um `Patch` alterando para `STATUS: 3` (Quarentena) e isola o item da contagem principal[cite: 2]. Caso o usuário escolha excluir de vez, o status vira `0`[cite: 2].

---

## FASE 4: Disparo e Limpeza (Integração Final)
O planejamento foi 100% validado e os horários e materiais conferem.

1. **Ação de Envio (`icoAddPlanner_1`):**
   * O usuário clica no botão "Enviar itens ao planner" (ícone de envio)[cite: 2].
   * A tela exibe um aviso de carregamento (`varcarregando: true`)[cite: 2].

2. **Transferência Bulk (Em Lote):**
   * Em vez de salvar na lista original, o Power Apps coleta todos os itens da memória que estão aptos para produção e realiza um `Patch` de alta performance diretamente para a **Lista B (Kanban Definitivo / Produção)**.

3. **Limpeza da Staging (Buffer):**
   * Confirmado que o envio foi um sucesso (`IfError` = false)[cite: 2], o aplicativo volta as atenções para a **Lista A (Staging)** no SharePoint.
   * Utilizando a função `RemoveIf`, ele apaga todos os registros brutos referentes ao *Patan*, *Linha* e *Turno* que acabaram de ser processados[cite: 2].

4. **Reset da Interface:**
   * As coleções de memória (`coll_automacao_planner` e `colToUpload`) são limpas com `Clear()`[cite: 2].
   * O usuário recebe a notificação "Programação enviada ao quadro com sucesso!"[cite: 2].
   * A tela fica limpa e pronta para que o Python do servidor envie a demanda do próximo turno ou Patan.