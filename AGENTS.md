# AGENTS.md — guia de continuação

Este arquivo existe para qualquer pessoa ou agente de IA que precise continuar o
desenvolvimento do plannerLogistica **sem ter participado das sessões anteriores**. Ele não
assume nenhuma ferramenta específica — nada de memória de sessão, skills ou configuração de um
harness em particular. Tudo que importa para entender o domínio e a arquitetura está escrito
aqui, com referência exata a arquivo/linha do código-fonte atual. Onde este documento e o código
divergirem no futuro, **o código é a fonte da verdade** — mas se isso acontecer, é sinal de que
este arquivo precisa ser atualizado na mesma mudança.

Para setup local, veja [`README.md`](README.md). Para operação/RBAC/deploy, veja
[`docs/ADMINISTRACAO.md`](docs/ADMINISTRACAO.md). Este arquivo cobre **regras de negócio,
arquitetura, convenções e o estado atual do projeto**.

## Regras de negócio do domínio

Estas regras vieram de confirmação direta com o usuário/dono do produto — não são só o que o
código faz hoje, são o que o código **deve** fazer. Qualquer mudança de comportamento aqui exige
confirmar com o dono do produto antes, não apenas inferir do código existente.

### Patan

A especificação do Patan depende do **setor produtivo** (`backend/app/domain/patan.py`):
1. **Solda (`solda`)**: Ciclo padrão de 8 dias com letras únicas de `A` a `H` (`PATANS_SOLDA`).
2. **Estamparia (`estamparia`)**: Ciclo de **64 dias** cobrindo 56 patans oficiais (`PATANS_ESTAMPARIA`) de `A` a `P` com sub-patans numéricos:
   `['A', 'B', 'C', 'C1', 'C2', 'C3', 'C4', 'D', 'D1', 'D2', 'E', 'E1', 'E2', 'E3', 'E4', 'F', 'F1', 'F2', 'F3', 'F4', 'G', 'G1', 'G2', 'H', 'H1', 'H2', 'H3', 'H4', 'I', 'J', 'J1', 'J2', 'K', 'K1', 'K2', 'K3', 'K4', 'L', 'L1', 'L2', 'L3', 'L4', 'M', 'M1', 'M2', 'N', 'N1', 'N2', 'O', 'O1', 'O2', 'O3', 'O4', 'P', 'P1', 'P2']`.
- **Compatibilidade Arquitetural (`PatanStr`)**: Tanto no backend (`PatanStr`) quanto no frontend (`type Patan = string`), o campo suporta strings de até 10 caracteres (`String(10)` no banco) e expõe `@property def value(self) -> str` no backend, mantendo 100% de compatibilidade tanto com código que espera string pura quanto código legado que acessa `.value`.
- **Telas de Programação e Produção**: A interface renderiza dinamicamente as opções de Patan com base no setor ativo (`setor === "estamparia" ? PATANS_ESTAMPARIA : PATANS_SOLDA`), ajustando filtros e modais de inserção de ordens.
- **Base Mestre Completa e Sugestões Inteligentes de Turno/Linha**:
  - A planilha mestre oficial (`AutomacaoPlanner.xlsx`) contém todos os 8 Patans da Solda (`A` a `H`) com ~950 itens cada, totalizando ~7.600 ordens na Tabela A (`ItemProducaoStaging`), garantindo disponibilidade plena para todos os programadores e operadores.
  - Na Estamparia, as letras puras (`A` a `P`) concentram a programação no **1º Turno**, enquanto os sub-patans com numeração (`C1-C4`, `D1-D2`, `E1-E4`, `L1`, `O1`, etc.) estão planejados no **2º Turno** (`LINHA 1`) ou **3º Turno** (`LINHA 4`).
  - **Alternância Automática e Resumo Dinâmico (`GET /producao/resumo-patans`)**: O backend disponibiliza o mapeamento de ocorrências de cada Patan por setor. Na interface (`ProgramacaoPatan` e `VisualizacaoPatan`), os seletores de Patan exibem em tempo real o turno e a contagem de itens (ex: `Patan O1 (2ºT • 25 it.)`). Ao selecionar qualquer Patan que pertença a outro turno/linha, a tela **alterna instantaneamente e de forma automática** para o turno e linha corretos onde o Patan está programado, eliminando completamente telas vazias e facilitando a navegação direta do programador. Se mesmo assim a combinação atual não possuir itens, a API (`GET /producao/sequencia`) retorna `sugestoes_outros_turnos` com botões amigáveis de alternância em 1 clique.
- **Atenção**: **Não é um código de 8 caracteres** — o documento de requisitos original em `requisitosBases/requisitos.md` descrevia isso incorretamente; a regra oficial é a divisão setorial descrita acima.

### STATUS — máquina de estados (não é uma flag)

`PlanItemStatus` (`backend/app/domain/status.py`), inteiro:

| Valor | Nome | Significado |
|---|---|---|
| `0` | `EXCLUIDO` | Fora do planejamento |
| `2` | `NORMAL` | Produção normal — entra na numeração sequencial da cascata |
| `3` | `CRITICO` | Quarentena/falta de componente — `sequencia` **sempre** fixa em `0`, nunca ocupa numeração da produção normal. Carregado por **linha inteira**, independente de turno/patan (`get_pecas_criticas_by_linha` em `backend/app/repositories/producao_repository.py`) |
| `9` | `LOCKED` | Lote travado/pronto para persistir |

Existe um **segundo** enum, `RequestStatus` (mesmo arquivo), com valores string `"1"`/`"2"`, usado
numa lista de intake completamente diferente. O próprio código documenta isso na docstring
("Never merge with RequestStatus") — são dois campos `STATUS` sem relação, em domínios
diferentes. Nunca tratar um como o outro.

### Cascata de sequenciamento ("escadinha")

Lógica pura em `backend/app/domain/sequenciamento.py` (`calcular_cascata`), **replicada** no
frontend em `frontend/src/state/sequenciaReducer.ts` (`calcularCascata`) para simulação client-
side antes do envio. As constantes têm que ficar sincronizadas manualmente entre os dois arquivos
— o frontend tem um comentário lembrando disso, mas não há nenhum mecanismo automático de
sincronia:

- Horários fixos de início de turno (`SHIFT_START_TIME`): 1º turno `06:20`, 2º turno `14:40`, 3º
  turno `23:00`.
- O item com `sequencia == 1` de cada posto de trabalho começa no horário fixo do turno.
- Todo item seguinte no **mesmo posto de trabalho** começa exatamente onde o anterior terminou:
  `hora_inicial[n] = hora_final[n-1]`. Nunca é calculado de forma independente.
- A função é pura e imutável: recebe uma lista de itens e retorna uma lista **nova**
  (`dataclasses.replace` no backend, spread no frontend) — nunca muta os itens recebidos.

### Pausa de almoço

Se a janela de produção de um item cruza o horário de almoço do turno, soma **+40 minutos**
(`LUNCH_BREAK_MINUTES`, configurável) no `hora_final` desse item, **uma única vez**. Itens seguintes herdam o
atraso de graça através da própria cascata — nunca somar de novo.

Os horários de refeição (`MEAL_TIME`: 1º turno `10:20`, 2º turno `18:40`, 3º turno `03:00`), bem como a duração da pausa
e os horários de início de turno, são **configuráveis pelo usuário na tela de Parâmetros (`/parametros`)**, através
das chaves `hora_refeicao_turno_1`, `hora_refeicao_turno_2`, `hora_refeicao_turno_3` e `duracao_refeicao_minutos`.
O backend (`calcular_cascata`) e as telas de visualização (Produção e Seisan Kanriban) utilizam esses parâmetros
dinamicamente, mantendo os valores originais como fallback seguro caso o banco ainda não possua o registro.

Quando o acréscimo de refeição é aplicado, o card do item exibe a indicação de almoço conforme a densidade:
- **Modo Detalhado**: exibe o banner com o texto exato `HORARIO DE ALMOCO INCLUSO` (constante `LUNCH_BREAK_LABEL`, sem acentos).
- **Modo Compacto**: para evitar que o texto longo colida ou atravesse as informações e botões de kanban, o card exibe no cabeçalho um badge sutil e amarelado com o ícone `🍽️` (`data-testid="almoco-badge-compacto"`), mantendo a linha de kanbans limpa e legível. No Seisan Kanriban exibe o selo `🍽️ Almoço`.

### Fórmula de tempo de produção

```
tempo_producao_minutos = Kanbans × Qtd_por_Kanban × Tempo_por_Peca
```

(`calcular_tempo_producao_minutos`, mesmo arquivo de domínio; espelhada em
`calcularTempoProducaoMinutos` no frontend).

### Diagnóstico de estoque e Capacidade Produtiva em Falta

`diagnosticar_estoque(demanda, saldo)` (`backend/app/domain/estoque.py`) — `tem_falta = demanda >
saldo`. Simples e puro; calculado **ao vivo** em `GET /producao/sequencia` (não é persistido). Um
item com falta de estoque pode ser reclassificado para `STATUS 3` (crítico) pelo usuário.
- **Cálculo de Capacidade com Saldo Atual (Produto Acabado)**: No frontend (`SequenciaCard`), o card calcula instantaneamente o número de caixas viáveis com o estoque remanescente da própria peça:
  `kanbansPossiveis = Math.floor(Math.max(0, item.saldo_estoque) / item.qtd_por_kanban)` quando `qtd_por_kanban > 0`.
- **Exibição Dinâmica & Supressão do Alerta de Falta**:
  - O alerta de **Falta de estoque** é estritamente baseado na demanda atualmente planejada no card (`item.kanbans * item.qtd_por_kanban`) vs o saldo disponível (`item.saldo_estoque`).
  - Quando o programador reduz a quantidade para um valor viável suportado pelo estoque físico (`item.kanbans <= kanbansPossiveis`), **o aviso de falta de estoque some imediatamente**, pois o lote pretendido pode ser produzido sem escassez.
  - O aviso de falta de estoque só aparece (ou reaparece) se o usuário tentar programar uma quantidade superior à suportada pelo saldo (ex: saldo comporta exatamente 20 kanbans; ao tentar produzir 21 kanbans, o aviso e o badge reaparecem na hora).
  - Ambos o reducer (`sequenciaReducer.ts` com `calcularTemFaltaEstoque`) e o card reativo (`SequenciaCard.tsx` via `temFaltaEstoque`) mantêm sincronia perfeita em tempo real.
- **Estoque de Componentes da Solda (BOM / comp_comb) vs Produto Acabado**:
  - **Distinção Fundamental de Domínio**: Na Solda, o item no card é um conjunto soldado (produto acabado em processo). Ter saldo 0 do produto acabado não impede a produção (pelo contrário, justifica a produção). O verdadeiro gargalo físico de chão de fábrica é a **Falta de Componentes** (estampados `EST`, comprados `VtoV` e matéria-prima `MP` contidos na BOM oficial `comp_comb`).
  - **Exibição Lado a Lado (Estoque vs Necessidade)**: No card e no modal `ItemDetalhe`, cada componente exibe a quantidade disponível no almoxarifado (`saldoLivre`) e a necessidade total calculada para o lote (`qtdNecessaria = totalPecas * fator`).
  - **Destaque Visual Dinâmico (Verde / Vermelho)**:
    - 🟢 **VERDE (`saldoLivre >= qtdNecessaria`)**: O estoque cobre integralmente o lote. Exibe fundo esmeralda suave com badge `Est: X / Nec: Y` (ou `✓ OK`).
    - 🔴 **VERMELHO (`saldoLivre < qtdNecessaria`)**: Falta de insumo físico para a montagem. Exibe destaque em vermelho/rose com badge `Est: X / Nec: Y ⚠️ Falta`.
  - **Alerta de Nível Superior no Card**: Se qualquer componente tiver falta (`componentesComFalta.length > 0`), o card renderiza o banner `⚠️ Falta de componente: {codigo} (falta X pçs)`.
  - **Modal de Detalhes (`ItemDetalhe.tsx`)**: Exibe a tabela completa de "Componentes da Montagem (BOM / Insumos)" com tipo, código, descrição, estoque físico, quantidade necessária e indicador de disponibilidade.
- **Diferenciação Produção vs Programação (`exibirEstoque`)**:
  - **Na tela de Programação (`exibirEstoque = true`)**: ferramenta analítica exclusiva para o Programador, exibindo comparativos de estoque, badges de componentes (verde/vermelho) e alertas de falta para apoiar o sequenciamento e ajuste de lotes.
  - **Ajuste de Capacidade em 1 Clique (`btn-ajustar-capacidade-estoque`)**: na tela de Programação, a indicação `Consegue produzir: X kanbans` funciona como um botão interativo de ação imediata. Ao ser clicado, despacha a action `DEFINIR_KANBAN` para o reducer com `kanbans = kanbansPossiveis`, definindo diretamente a quantidade exata viável suportada pelo estoque, recalculando a cascata horária do posto e eliminando o alerta de falta na hora, sem exigir múltiplos cliques manuais no botão `-`.
  - **Na tela de Produção (`exibirEstoque = false`)**: **TERMINANTEMENTE PROIBIDO EXIBIR FALTA DE ESTOQUE OU FALTA DE COMPONENTES**. O operador na fábrica apenas executa a ordem sequenciada já persistida. Os alertas de falta de estoque, falta de insumos, sugestões de capacidade e os destaques coloridos de componentes são **omitidos sob qualquer hipótese** fora da tela de programação (exibindo apenas os componentes com contagem neutra).

### Regra de Posição 0 (Topo da Fila), Exclusividade Monomáquina e Travamento de Produção em Linha (Tandem)

Na tela **Produção** (`/`), o botão **`▶ Iniciar Produção`** é restrito **exclusivamente ao primeiro card**
(índice 0 da fila / ordem sequencial imediata) de cada coluna de Posto de Trabalho (`podeIniciar = index === 0`).
- Itens em posições inferiores não exibem o botão. Se o operador/líder de chão de fábrica desejar produzir
  um lote fora da ordem original, é **obrigado a arrastar o item para o topo da coluna**.
- Cards localizados em colunas de buckets/extras nunca podem iniciar produção (`podeIniciar = false`).
- **Exclusividade Monomáquina de Chão de Fábrica (Single-Machine Production Exclusivity)**:
  - Uma máquina/prensa **NUNCA** pode ter mais de um lote ativo em produção ao mesmo tempo (`em_producao == true`).
  - No frontend (`PostoColuna.tsx`), se houver qualquer item ativo na coluna (`itens.some(it => it.id !== entry.id && it.em_producao && it.coluna_extra_id === null)`), o botão de iniciar é **bloqueado em todos os outros cards**.
  - No backend (`iniciar_producao_item`), valida-se se `item.posto_trabalho` já possui outro lote ativo não finalizado. Caso possua, rejeita imediatamente com HTTP 400: *"O posto {posto} já possui o lote '{material}' em produção ativa."*
- **Postos OBRIGATORIAMENTE Distintos e Isolamento Estrito de Data em Tandem**:
  - Uma máquina **NUNCA** é parceira tandem de si mesma (`ItemProducao.posto_trabalho != item.posto_trabalho`).
  - Múltiplos lotes do mesmo material na mesma máquina (ex: `PR-93` com sequência 1 e sequência 2) são ordens consecutivas independentes, **jamais irmãs tandem**. Iniciar ou concluir o lote 1 **NUNCA** inicia ou conclui o lote 2!
  - Vínculos tandem exigem estritamente a **mesma data de referência** (`data_programada` ou data de `hora_inicial` / `inicio_real`). Itens com o mesmo material planejados em **dias diferentes NUNCA são vinculados em tandem**.
  - A busca e resolução de irmãos em linha em todas as operações de fábrica (`iniciar`, `pausar`, `desfazer`, `concluir`, `quebra-ferramenta`, `editar` e `excluir`) é centralizada via `buscar_irmaos_tandem`, garantindo isolamento total por dia e por máquina distinta.
- **Guarda de Início para Produção em Linha (Tandem Start Guard)**:
  - Quando um lote é produzido em linha através de múltiplos postos vinculados (ex: conjunto soldado em `PONTE 47`, `PONTE 48`, `PONTE 51`), **nenhum dos postos pode iniciar o lote** a menos que **TODOS os postos vinculados tenham esse lote exatamente no topo da sua fila de trabalho ativa (`index === 0`)**.
  - Se um dos postos irmãos (ex: `PONTE 49`) ainda estiver processando um item anterior (`index > 0`), o botão `▶ Iniciar Produção` é desabilitado em todos os postos do grupo, exibindo o selo de aviso: **`⏳ Aguardando {posto} (concluir {material})`**.
  - No backend (`iniciar_producao_item` em `backend/app/api/routes_tabela_b.py`), valida-se estritamente se há algum item anterior não finalizado (`coluna_extra_id is None` e `sequencia < sequencia_do_item`) em qualquer posto parceiro. Caso haja, a requisição é rejeitada com HTTP 400: *"Não é possível iniciar a Produção em Linha: o posto {posto} ainda precisa concluir o item '{material}' antes deste lote."*
  - Ao iniciar com sucesso no topo de todos os postos irmãos, todos os itens vinculados entram em produção simultaneamente (`em_producao = True`, `inicio_real = now()`).
- **Desassociação Automática de Itens Concluídos**:
  - Quando um item é concluído ou movido para qualquer coluna extra (`coluna_extra_id is not None`), `producao_em_linha` é forçado para `False` e `postos_vinculados` para `[]` (`to_item_producao_out` em `backend/app/schemas/producao.py` e nos componentes React).
  - Um item concluído ou quebrado nunca mantém vínculo tandem com itens ainda ativos na fila e não bloqueia nem altera a visualização das ordens seguintes.
- **Agrupamento Fechado e Alinhamento de Cascata Tandem (Tandem Cascade Sync)**:
  - Vínculos tandem só são formados entre itens pertencentes ao mesmo lote planejado: **mesma linha, mesmo turno e mesmo material** agrupados por data de referência e ocorrência ativa (`${dataRef}__${material}__occ_${ocorrencia}`). Esse mecanismo é imune a variações de data base causadas por virada de meia-noite (ex: turno 3 que inicia às 23:00 e cruza para o dia seguinte).
  - Sincronização de início (`sincronizar_tandem_cascata` no backend e `sincronizarTandemCascata` no frontend): o horário de início planejado dos postos parceiros é alinhado para o maior início entre eles (`max(hora_inicial)`), e as peças subsequentes de cada posto têm seus horários empurrados em cascata a partir do término do lote sincronizado.
- **Sincronização Automática de Kanbans e Reordenação em Tandem na Programação (`AJUSTAR_KANBAN`, `DEFINIR_KANBAN`, `EDITAR_ITEM`, `REORDENAR`)**:
  - Quando o programador altera o kanban de um item em linha na tela de programação (seja clicando em `+` / `-`, usando o botão rápido de capacidade `Consegue produzir: X kanbans` ou editando pelo modal), o sistema localiza automaticamente todos os itens parceiros nas outras máquinas vinculadas (`encontrarItensTandemVinculados`) e atualiza simultaneamente seus `kanbans`, `qtd_por_kanban` e `tempo_por_peca_minutos`.
  - **Reordenação Sincronizada Multimáquinas Inteligente (`REORDENAR`)**: Ao arrastar ou mover a posição de um item tandem em qualquer máquina da linha:
    - O sistema identifica exatamente qual item e ocorrência foi movido (`identificarItemMovido`).
    - Reposiciona ativamente o item parceiro em todas as outras máquinas vinculadas: se movido para o topo (`to === 0`), vai imediatamente para o índice 0 de todas as máquinas parceiras; se para o final, vai para o fim da fila; se intermediário, posiciona-se após o vizinho predecessor comum mais próximo (ou antes do sucessor).
    - Preserva o rank relativo de itens comuns e executa `sincronizarTandemCascata`. Isso elimina completamente o bug em que itens tandem ficavam estagnados em slots distantes (ex: índice 22 às 14:50) nas máquinas irmãs enquanto a máquina de origem os colocava no índice 0, o que antes causava acréscimo fantasma de mais de 8 horas e janelas vazias de ociosidade matutina.
    - No backend (`routes_producao.py`), o agrupamento tandem mapeia estritamente por ocorrência `(mat, occ_num)` por posto, impedindo que lotes com múltiplos cartões tomem o horário inicial do último cartão.
  - Isso garante que todas as máquinas da linha produzam exatamente o mesmo volume planejado e na mesma ordem sem exigir ajustes manuais máquina por máquina.
- **Recálculo Multimáquinas em Cadeia ("Em Cadeia" / Fixed-Point Convergence) & Proteção Anti-Deriva (Bug da 01:00 AM)**:
  - Ao alterar o horário ou a quantidade de um lote em linha, o atraso ou avanço gerado empurra os itens seguintes da máquina.
  - Se algum dos itens empurrados abaixo **também pertencer a outro lote tandem** casado com outros postos de trabalho, a propagação horária não para: o algoritmo `sincronizarTandemCascata` executa um loop de convergência de ponto fixo (até 25 iterações) que reavalia dinamicamente o estado atualizado de cada posto (`resultado[posto][idx]`).
  - **Salvaguarda de Convergência Cíclica e Janela de Turno**: Para prevenir deadlocks circulares entre máquinas com dependências cruzadas (que no passado empurravam repetidamente os horários em +40min a cada iteração, fazendo itens matutinos das 06:20 pularem para 01:00 AM / 02:00 AM do dia seguinte), tanto o frontend (`sincronizarTandemCascata`) quanto o backend (`recalcular_cascata_e_tandem_persistidos`) contam com:
    1. Limite estrito de no máximo 3 ajustes por grupo tandem por ciclo (`ajustesPorChave > 3`).
    2. Teto horário delimitado à janela máxima do turno planejado (`maxPermitidoMs`), garantindo estabilidade e impedindo transbordamento para dias subsequentes.
  - Dessa forma, o recálculo se propaga **em cadeia** por toda a linha de produção de forma matematicamente estável, alinhada e sem derivas infinitas.
- **Edição Direta de Cards na Tela de Programação (`EditarCardProgramacaoModal`)**:
  - Na tela `/programacao`, todos os cards são itens de minuta/planejamento da Tabela A. Por isso, os cards exibem **diretamente o botão de edição `[✏️]`** em cada cartão, eliminando a necessidade de qualquer botão de alternância redundante na barra de ferramentas.
  - O modal permite ajustar kanbans, peças por kanban, tempo de ciclo, horário inicial e horário final (com cálculo automático de kanbans correspondentes à duração), exibindo destaque visual de postos tandem vinculados quando o item for produzido em linha.
- **Paridade no Backend para Ordens Persistidas (`editar_item_persistido`)**:
  - Em `backend/app/repositories/producao_repository.py`, o método `editar_item_persistido` espelha o comportamento do frontend: ao editar um item persistido que possui irmãos tandem ativos, sincroniza os kanbans e horários dos irmãos e recalcula a cascata horária de todos os postos afetados.


### Exibição de Embalagem no Card, Anotações Pré-preenchidas e Modal de Detalhes (`ItemDetalhe`)

1. **Exibição do Código de Embalagem e Sequenciamento no Card (`SequenciaCard.tsx`)**:
   - Tanto na tela de **Programação** quanto na tela de **Produção**:
     - No container de kanbans e total de peças (tanto no **modo compacto** quanto no **modo detalhado**), o card renderiza:
       `{kanbans} kanban(s) • {totalPecas} pçs{embalagem ? ` - Embalagem: ${embalagem}` : ""}{sequencia > 0 ? ` • Seq #${sequencia}` : ""}`.
     - O mini container conta com espaçamento confortável (`px-2.5 py-1.5 gap-1.5 flex-wrap`) para comportar a identificação da embalagem e a sequência da fila com clareza sem quebras bruscas.
   - **Resolução de Embalagem Unificada (Solda e Estamparia)**:
     - **Solda (Coluna BD)**: Na planilha oficial de Carga Horária (`01- Revisão de Carga Horária - SOLDA.xlsx`, aba `DADOS`), o código da embalagem está na coluna `BD` (`CÓD. EMBAL.`, ex: `24 35 703`, `CAIXA P`, `LW 004`, `KLT 4314`, `RM 48`, etc.). Catálogo consolidado de 1.539 entradas (`CATALOGO_EMBALAGENS_SOLDA`).
     - **Estamparia (Coluna AY)**: Na planilha oficial de Carga Horária (`01- Revisão de Carga Horária - ESTAMPARIA .xlsx`, aba `DADOS`), o código da embalagem está na coluna `AY` (`CÓD. EMBAL.`, ex: `24 35 703`, `24 35 704`, etc.). Catálogo consolidado de 2.855 entradas (`CATALOGO_EMBALAGENS_ESTAMPARIA` em `catalogoEstamparia.ts` e `catalogo_estamparia.py`).
     - A função unificada `obterEmbalagem(material, setor)` / `obter_embalagem(material, setor)` resolve automaticamente a embalagem de acordo com o setor da ordem fabril com casamento direto e por prefixo.
   - **Matéria-Prima da Estamparia e Cálculo Automático de Consumo em KG (baseMP.XLSX)**:
     - Na Estamparia não há múltiplos subconjuntos como na Solda; há uma única **Matéria-Prima (MP)** associada ao produto.
     - Extraída da base oficial mestre em `backend/data/baseMP.XLSX` (aba `mp`, com 1.251 matérias-primas e embalagens integradas):
       - **Coluna A** (`CÓD.SAP`): código do produto acabado estampado (ex: `H03161EB6A`, `H0316EB6`, `I25006EB6C`).
       - **Coluna J** (`CÓDIGO MP`): código da matéria-prima (ex: `H000688B6A`, `I060548B6A`).
       - **Coluna I** (`MP NECESSÁRIA (Kg / Peça)`): consumo unitário de matéria-prima em KG por peça (ex: `0.021`, `0.526`).
       - **Coluna L** (`EMBALAGEM`): código oficial da embalagem de expedição/abastecimento (ex: `24 35 703`, `24 35 704`), complementando a planilha de Carga Horária.
     - Catálogo compilado em `backend/app/domain/catalogo_estamparia.py` e `frontend/src/utils/catalogoEstamparia.ts` (1.251 matérias-primas e 2.899 embalagens).
     - **Cálculo de Consumo de MP do Lote**: $\text{materiaPrimaKg} = \text{totalPecas} \times \text{consumoUnitario}$ (exemplo oficial: $1.000\text{ pçs} \times 0.021\text{ kg/pç} = 21\text{ kg}$).
     - **Integração com Estoque MB52 e Diagnóstico de Falta de Matéria-Prima**:
       - O saldo de estoque em KG de cada código de matéria-prima é importado do SAP MB52 (`estoque.xlsx`) e vinculado ao lote via `comp_comb` (`{mp_cod}|{consumo_kg}|MATERIA-PRIMA|{saldo_mb52}`).
       - **Na tela de Programação (`isProgramacao = true`)**:
         - Quando a quantidade necessária para o lote supera o saldo disponível em estoque da matéria-prima (`materiaPrimaSaldoEstoque < materiaPrimaKg`), o card renderiza o alerta em destaque:
           `⚠️ Falta de matéria-prima: {codigo} (falta X kg) — Consegue produzir: Y kanbans`.
         - O selo da MP no cabeçalho adota fundo vermelho/rose com indicador `Est: X kg / Nec: Y kg ⚠️`. Quando há saldo suficiente, exibe esmeralda suave com `Est: X kg / Nec: Y kg ✓`.
         - **Botão de Ajuste Rápido de Capacidade (`btn-ajustar-capacidade-mp`)**: Ao clicar em `Consegue produzir: Y kanbans`, o sistema ajusta imediatamente o lote para o número exato de caixas viáveis com o estoque físico da MP, recalculando a duração e removendo o alerta na hora.
       - **Na tela de Produção (`isProgramacao = false`)**: **TERMINANTEMENTE PROIBIDO EXIBIR FALTA DE ESTOQUE OU FALTA DE MATÉRIA-PRIMA**. O operador de chão de fábrica apenas visualiza o código e o consumo neutro de MP, sem alertas de escassez ou botões de ajuste de estoque.
     - **Renderização Visual Padronizada**:
       - **Modo Compacto**: badge elegante `MP: {codigo} ({peso_total} kg)` (ou com comparativo de estoque na Programação).
       - **Modo Detalhado**: linha `MP: {codigo}` com total alinhado à direita `{peso_total} KG` e status de estoque/necessidade.
       - **Modal `ItemDetalhe`**: banner TPS em destaque `⚖️ Matéria-Prima: {codigo}` com disponibilidade física, necessidade total e selo de suficiência/falta.
       - **Anotações Automáticas do Lote (`resumoTemplate.ts`)**: `MATÉRIA-PRIMA: {codigo} — {peso_total} KG`.
       - Não é necessário especificar bobina/blank/fita — exibição padronizada sempre como matéria-prima.

2. **Anotações Pré-preenchidas na Criação e Envio para Produção**:
   - Todos os cards criados ou enviados para a produção já vêm com o campo de anotações preenchido com a ficha técnica e resumo de abastecimento do lote (`gerarTextoResumoLote` em `resumoTemplate.ts`).
   - Para ordens de Estamparia, o resumo inclui automaticamente paletização (ex: `2P (40 cx) + 1P (5 cx quebra)`), matéria-prima com peso em KG e ferramenta associada.
   - **Quadro Kanban Despoluído**: o resumo fica gravado internamente no card, mas com `mostrar_anotacoes_quadro = false`, impedindo que os cards no quadro fiquem poluídos com blocos textuais extensos.
   - **Salvaguarda no Backend (`bulk_persist` e `inserir_item_producao_direto`)**: se uma ordem for persistida com anotações em branco ou nulas, o backend preenche automaticamente a anotação padrão com horários, postos, kanbans, total de peças, código da embalagem e dados de MP/paletização.

3. **Tratamento de Fuso Horário de Brasília (America/Sao_Paulo / UTC-3)**:
   - Para eliminar discrepâncias de +3 horas em servidores/containers Docker com relógio de sistema em UTC (`datetime.now()`), foi implementado o helper oficial `agora_brasilia()` em `backend/app/core/datetime_utils.py`.
   - Todas as operações de chão de fábrica (`inicio_real`, `fim_real`, apontamento de quebra `data_quebra` e logs de auditoria) utilizam exclusivamente `agora_brasilia()`, garantindo que os horários registrados correspondam exatamente à hora local fabril (UTC-3).
   - O arquivo `docker-compose.yml` e o `backend/Dockerfile` contam com `TZ: America/Sao_Paulo` e pacote `tzdata` instalado.
   - **Histórico e Logs de Auditoria (`AuditLog.created_at`)**: O modelo `AuditLog` e a função `create_audit_log` utilizam explicitamente `default=agora_brasilia`, eliminando o fallback legado `datetime.utcnow()` no momento da inserção (que causava o deslocamento indesejado de +3 horas ao registrar ações como `enviar_lote` no histórico). Na tela de histórico (`Historico.tsx`), a função `formatarDataHora` renderiza as strings ISO locais sem distorção.

4. **Modal de Detalhes (`ItemDetalhe.tsx`) com Painel de Anotações à Esquerda e Card Central**:
   - O popup acionado ao clicar em qualquer card do quadro adota um layout split horizontal moderno em duas colunas:
     - **Painel Esquerdo (Anotações do Lote)**:
       - Focado em legibilidade e consulta operacional imediata pelo programador ou líder.
       - Área de texto ou leitura ampla (`min-h-[380px] md:min-h-[440px]`) com tipografia mono clara e controles integrados (botão `✨ Preencher Resumo`, checkbox `Mostrar no quadro`, botão `Salvar Anotações` e botão `Copiar`).
       - **Botão Minimizar (`[◀ Minimizar]`)**: permite recolher o painel para a lateral esquerda, transformando-o em uma elegante aba vertical compacta `[▶ Anotações]`. Clicar na aba recolhida expande instantaneamente o painel de volta.
     - **Painel Direito (Card Central e Informações Gerais)**:
       - Exibe o cabeçalho com botões de fechar e `[✏️ Editar em Produção]`.
       - **Card Central TPS**: grade visual destacando horários planejados (com indicador de almoço), volume do lote (kanbans e peças), código da embalagem oficial de abastecimento e sequência da fila.
       - Seções complementares: Etiquetas/Labels de máquinas, Lista de Verificação (Checklist oficial) e Histórico de Comentários e ocorrências.
   - O modal redimensiona-se suavemente (`max-w-5xl` quando o painel de anotações está aberto e `max-w-2xl` quando minimizado).

5. **Peças Duplas da Estamparia (Direito e Esquerdo / Peças Espelho)**:
   - Na Estamparia, diversas operações estampam simultaneamente peças em par (dupla batida / direito e esquerdo / peças espelho, ex: `L34002EB6A / L34003EB6A`, `B03000AB6A / B03100AB6A`, `I25700AB6A / I25800AB6A`).
   - **Preservação de Ambos os Códigos**: O conversor oficial (`estamparia_converter.py`) preserva integralmente ambos os materiais separados por `" / "` na coluna `Material` de `AutomacaoPlanner_Estamparia.xlsx`, no staging e nas ordens persistidas, eliminando o comportamento legado que descartava a segunda peça.
   - **Renderização Visual**:
     - No **Quadro Kanban** (`SequenciaCard.tsx`), tanto no modo compacto quanto no modo detalhado, os dois códigos são renderizados com destaque monospaçado e acompanhados de um badge elegante `Dupla` ou `Peça Dupla`.
     - No **Modal de Detalhes** (`ItemDetalhe.tsx`), o título principal exibe `CÓDIGO_ESQ / CÓDIGO_DIR` com o selo `♊ Peça Dupla (Espelho)`.
     - Na **Visualização do Patan Teórico** (`VisualizacaoPatan.tsx`), os cards exibem ambos os materiais com o selo `Dupla`.
   - **Resolução de Matéria-Prima e Embalagem**: Os módulos de consulta (`obter_mp_estamparia` e `obter_embalagem_estamparia`) suportam strings compostas com `" / "`, avaliando os códigos que compõem o par para associar com exatidão o peso de MP em KG (`baseMP.XLSX`) e o código da embalagem.

6. **Posto SAP Real (`posto_sap`) e Data Programada (`data_programada`)**:
   - **Posto SAP / Centro de Trabalho (`posto_sap`)**:
     - Mapeamento direto de todos os postos de trabalho para os códigos oficiais do SAP iniciados em `B6...`:
       - Prensas de Linha 1 e Linha 4 usam prefixo `B624` (ex: `PR-82` -> `B624082`, `PR-92` -> `B624092`, `PR-93` -> `B624093`, `PR-113` -> `B624113`, `PR-114` -> `B624114`, `PR-115` -> `B624115`, `PR-116` -> `B624116`).
       - Prensas de Linha 2 e Linha 3 usam prefixo `B623` (ex: `PR-94` -> `B623094`, `PR-95` -> `B623095`, `PR-96` -> `B623096`, `PR-97` -> `B623097`, `PR-98` -> `B623098`, `PR-99` -> `B623099`, `PR-109` -> `B623109`, `PR-110` -> `B623110`, `PR-112` -> `B623112`, `PR-83` -> `B623083`, `PR-84` -> `B623084`).
       - Solda (Ponteadeiras): `PONTE 23` a `PONTE 73` mapeadas como `B6420xx` (ex: `PONTE 47` -> `B642047`, `PONTE 23` -> `B642023`).
       - Processos especiais de montagem/furação: `FURAR 1` (`B629020`), `FURAR 2` (`B629010`), `MONTAGEM` (`B661000`), etc.
     - Coluna persistida em `producao` e `producao_staging` (`String(50)`).
     - Exibido nos cards (`SequenciaCard.tsx`) junto ao posto e no modal de detalhes (`ItemDetalhe.tsx`).
   - **Data Programada (`data_programada`)**:
     - Atributo de data (`Date` / `YYYY-MM-DD`) que representa o dia calendário do planejamento daquele lote.
     - **Regra do 3º Turno (Cruza a Meia-Noite)**:
       - No 3º Turno (iniciado às 23:00): ordens cuja produção começa na madrugada (00:00 até ~07:00 da manhã seguinte) continuam com os horários exibidos reais (`hora_inicial` e `hora_final` intactos no dia seguinte), mas sua `data_programada` mantém o dia calendário do turno (o dia em que o turno começou, recuando 1 dia para a madrugada).
       - Ao persistir a programação pelo botão "Enviar para Produção" em `ProgramacaoPatan.tsx`, a data programada selecionada no cabeçalho (`dataProgramacao`) é gravada diretamente em todos os itens do lote.
     - Persistido nas tabelas `producao` e `producao_staging` e exibido no modal de especificações da ordem (`ItemDetalhe.tsx`).



### Apontamento de Conclusão, Quebra e Restrição de Pausa

No card em produção (`item.em_producao == True`), as ações disponíveis são padronizadas conforme o perfil:
1. **`✓ Concluir`** (`PATCH /producao/itens/{id}/concluir-producao`):
   - Abre modal exigindo o preenchimento de **Quantidade de peças produzidas** (campo obrigatório $> 0$,
     com sugestão automática de $kanbans \times qtd\_por\_kanban$) e **Observações** (opcional).
   - Ao confirmar, o backend registra o apontamento no log de auditoria, adiciona o comentário no card e
     move o item automaticamente para a coluna extra "Concluídas".
2. **`⚠️ Quebra`** (`PATCH /producao/itens/{id}/quebra-ferramenta`):
   - Abre modal exigindo a **Quantidade de peças produzidas até a quebra** (obrigatório $\ge 0$) e o
     **Motivo da quebra / Descrição da avaria** (obrigatório).
   - Ao submeter, o backend desativa `item.em_producao = False`, move o item para a coluna "Quebra de Máquina",
     registra log e comentário, e **abre automaticamente uma Ordem de Serviço na Ferramentaria**
     (tabela `ferramentaria_manutencoes`) com status `"aguardando_manutencao"`.
3. **`⏸ Pausar`**:
   - **Restrito estritamente a administradores (`role === 'admin'`)**. Para operadores e usuários comuns,
     o botão de pausa **NÃO EXISTE**: uma ordem iniciada na fábrica deve ser concluída com peças produzidas
     ou encaminhada para reparo por quebra/avaria.
- **Saída Imediata da Coluna do Posto**:
  - Quando um item é movido para qualquer coluna extra (como "Quebra de Máquina" ou "Concluídas"), ele sai imediatamente da coluna do Posto de Trabalho (`itensPorPostoFiltrado`) e passa a figurar exclusivamente na coluna extra correspondente (`itensPorColunaExtra`).
  - O próximo item da fila da máquina assume instantaneamente o topo (`index === 0`), habilitando o botão **`▶ Iniciar Produção`** para o operador dar sequência aos trabalhos sem bloqueios.
- **Apontamento em Produção em Linha (Tandem)**:
  - **Conclusão em Linha Sincronizada**: Quando um lote em tandem é concluído (`/concluir-producao`), todos os cartões parceiros do grupo (mesmo setor, linha, turno, data e material em produção simultânea) são concluídos automaticamente juntos, sendo movidos para a coluna "Concluídas" com a quantidade apontada e comentários de auditoria.
  - **Quebra em Linha Sincronizada**: Se ocorrer quebra de ferramenta/máquina em um posto do grupo tandem (`/quebra-ferramenta`), **apenas a máquina avariada** é enviada para conserto na Ferramentaria (coluna "Quebra de Máquina" com abertura automática de O.S.), enquanto os postos parceiros do tandem são direcionados para "Concluídas" com as peças produzidas até o momento da quebra.
- **Selo de Concluída Parcial e Alerta Visual Amarelo**:
  - Se um lote concluído produzir uma quantidade de peças inferior à meta programada (`quantidade_produzida_real < kanbans * qtd_por_kanban`), o sistema não exibe o selo verde padrão.
  - Em vez disso, o card recebe o selo de destaque **`⚠️ Concluída Parcial ({produzido} / {programado} pçs)`** com estética amarelo/âmbar (`bg-amber-100 border-amber-300 text-amber-950`).
  - **Na Visão Tabela (`ProducaoTabelaView`)**: O status é renderizado como badge âmbar indicando o volume parcial.
  - **No Seisan Kanriban (`SeisanPostoTrack` e `SeisanItemModal`)**: Na Faixa 3 (Realizado), o bloco concluído parcial troca a cor verde-esmeralda pela cor **amarela/âmbar** (`bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-600`) com ícone `AlertTriangle`, destacando visualmente para a gestão que o volume planejado não foi integralmente atingido.
- **Tryout de Matrizes Minimizável em Widget Flutuante (Estamparia) & Encaixe Direto em Produção**:
  - Para não ocupar permanentemente uma coluna fixa de 288px no quadro Kanban da Estamparia quando não há tryouts (ou quando o usuário deseja mais espaço para as prensas), o painel de Tryout de Matrizes conta com o botão **`— Minimizar`**.
  - Quando minimizado, transforma-se em um widget flutuante moderno no canto inferior direito (`fixed bottom-6 right-6 z-40`): **`⚙️ Tryout de Matrizes • Bancada de Prensas [{count}]`**, com badge numérico e indicador pulsante caso haja matrizes aguardando teste.
  - **Encaixe Direto em Produção (`[✏️ Encaixar em Produção]`)**: Cada cartão de tryout exibe o botão para encaixe. Ao clicar, o sistema abre diretamente o modal `InserirCardModal` pré-populado com a prensa de destino (ex: `PR-109`), código da ferramenta/material, 1 kanban de lote piloto (com as peças de amostra de tryout) e observação de liberação da Ferramentaria. O modal permite inserir a ordem imediatamente na prensa, **mesmo que a prensa esteja com a fila completamente vazia** naquele turno ou já possua ordens ativas (recalculando a cascata horária automaticamente).
- **Edição Direta de Horários e Rebalanceamento em Cascata na Produção**:
  - Acessível diretamente pelo modal `ItemDetalhe` através do botão **`[✏️ Editar em Produção]`** ou pelo botão de edição na fila (`modoEdicao`).
  - Permite aos programadores e administradores ajustar manualmente o horário inicial e o horário de término (`hora_final`, ex: término às 06:50).
  - Com o checkbox **`⚡ Rebalancear cascata horária dos próximos lotes deste posto`** ativado por padrão, ao definir que um lote termina às `HH:mm`, o backend e o frontend calculam e propagam o início do próximo lote da fila daquela máquina exatamente para `HH:mm`, empurrando e recalculando sequencialmente todos os cartões subsequentes da fila.
- **Exclusão de Card e Fechamento Automático de Brecha em Cascata (Produção e Programação)**:
  - **Na tela de Produção (`EditarCardProducaoModal`)**:
    - Programadores e Administradores dispõem do botão **`🗑️ Excluir Card`** no rodapé do modal de edição.
    - Ao clicar, exibe bloco de confirmação imediata alertando que a exclusão adiantará os horários dos próximos lotes da máquina para fechar a brecha deixada.
    - **Opção para Lotes em Linha (Tandem)**: Quando o lote é produzido em linha com máquinas vinculadas (`producao_em_linha == True`), exibe o checkbox **`[x] Excluir também dos postos vinculados em linha`** (marcado por padrão), permitindo ao usuário escolher entre remover o lote de todas as máquinas vinculadas simultaneamente ou apenas do posto atual.
    - **Endpoint Backend (`DELETE /producao/itens/{id}`)**: Restrito a `ADMIN` e `PROGRAMADOR`. Exclui atomicamente a ordem (e seus parceiros tandem caso solicitado), registrando ação de auditoria (`excluir_item_producao`) e disparando notificação WebSocket `producao_atualizada`.
    - **Fechamento de Brecha e Recálculo em Cadeia (`recalcular_cascata_e_tandem_persistidos`)**: Imediatamente após a remoção no banco, o backend puxa o próximo item da fila da máquina para o horário liberado (início de turno se tornou-se o primeiro, ou `hora_final` do item anterior), recalculando sequencialmente toda a esteira do posto e propagando o avanço iterativamente para quaisquer lotes tandem casados em cadeia com outras máquinas.
  - **Na tela de Programação (`EditarCardProgramacaoModal` & `sequenciaReducer`)**:
    - O modal `EditarCardProgramacaoModal` conta com o botão **`🗑️ Excluir Card`** e a mesma confirmação com suporte a lotes tandem.
    - A action `REMOVER_ITEM` do reducer recebe `removerTandem?: boolean`: quando verdadeiro, remove o lote de todas as máquinas vinculadas e reexecuta o loop de convergência tandem em cadeia (`sincronizarTandemCascata`), eliminando a brecha e mantendo paridade matemática perfeita entre frontend e backend.
- **Imutabilidade Estrita de Ordens Finalizadas ("Concluídas" e "Quebra de Máquina")**:
  - Uma vez que uma ordem de produção entra na coluna **"Concluídas"** ou **"Quebra de Máquina"** (ou tem seu término registrado via `fim_real` / `motivo_interrupcao == "quebra"`), ela atinge um estado **terminal e imutável**:
    1. **Bloqueio de Retorno à Produção e Troca de Coluna**: É terminantemente proibido mover o item de volta para a fila ativa de produção (`coluna_extra_id: null`) ou transferi-lo para outra coluna extra. Qualquer tentativa via API (`PATCH /producao/itens/{id}/coluna-extra`) é rejeitada com HTTP 400 Bad Request (*"Ordens concluídas ou registradas em quebra de máquina não podem retornar para a fila de produção ou mudar de coluna"*).
    2. **Ocultação do Dropdown `<select>`**: Tanto nos cards do Quadro Kanban (`SequenciaCard.tsx`) quanto nas linhas da Visão em Tabela (`ProducaoTabelaView.tsx`), o seletor de coluna extra deixa de existir para itens finalizados. No lugar, a interface exibe apenas o selo/badge permanente de conclusão ou quebra.
    3. **Desativação de Drag-and-Drop**: Cards em colunas finalizadas possuem `useSortable({ disabled: true })` e `resolverAcaoDrop` bloqueia qualquer tentativa de arrasto cuja origem seja um bucket de conclusão ou quebra, impedindo que o operador solte o item de volta em um posto.
    4. **Bloqueio de Edição**: Botões de edição (`[✏️ Editar]`, `[✏️ Editar em Produção]`) são suprimidos em cartões finalizados, e o backend rejeita alterações em `PATCH /producao/itens/{id}` com HTTP 400.
    5. **Criação de Novo Card**: Caso seja necessário produzir peças complementares ou recuperar quebras, deve ser criado um novo card de produção diretamente na máquina via modal de inserção de ordens.
    6. **Proteção das Colunas do Sistema**: As colunas nativas "Concluídas" e "Quebra de Máquina" não podem ser apagadas nem renomeadas (menu `⋯` ocultado na interface e validação no backend em `DELETE/PATCH /colunas-extras/{id}`).

### Bloqueio e Liberação de Ferramentas da Ferramentaria & Sincronização em Tempo Real

- **Abertura Automática e Bloqueio Preventivo/Corretivo**:
  - Quando um item sofre parada por avaria na fábrica (`/quebra-ferramenta`), uma O.S. é aberta automaticamente na Ferramentaria com status `aguardando_manutencao`.
  - Qualquer ferramenta em manutenção (`status != 'disponivel'`, como `aguardando_manutencao`, `em_manutencao`, `aguardando_tryout`, `tryout`) bloqueia imediatamente a programação de novos lotes com aquele material.
- **Decomposição e Correspondência de Códigos Compostos / Peças Duplas (`isMaterialBloqueado`)**:
  - Tanto no backend (`listar_materiais_bloqueados` e `submeter_sequencia`) quanto no frontend (`isMaterialBloqueado` em `ferramentariaUtils.ts`), a verificação não é estritamente literal `===`: ela decompõe peças duplas/espelho separadas por `" / "`, `"/"`, `";"` ou `","` (ex: `"L34002EB6A / L34003EB6A"`).
  - Se qualquer submódulo da ferramenta estiver em manutenção, ou se uma O.S. foi aberta com o código composto e o programador tenta enviar um código individual (ou vice-versa), o bloqueio é ativado com precisão cirúrgica.
- **Sincronização Bidirecional em Tempo Real via WebSocket (`useProducaoWebSocket`)**:
  - A conexão WebSocket global em `useProducaoWebSocket.ts` escuta eventos do backend (como `ferramentaria_atualizada`).
  - Ao alterar o status de qualquer ferramenta para `disponivel` (ou abrir nova O.S.) na tela de Ferramentaria, todos os clientes conectados (incluindo abas de `/programacao` e `/`) têm as chaves `["materiais-bloqueados"]`, `["ferramentaria-manutencoes"]` e `["tabela-b-producao"]` invalidadas instantaneamente.
  - Na tela de Programação (`ProgramacaoPatan.tsx`), a query possui `staleTime: 5000`, e antes de despachar o envio do lote (`handleEnviar`), é executado um `refetch()` forçado no servidor. Isso garante que qualquer liberação feita recentemente seja reconhecida na hora, eliminando falso-positivos de bloqueio causados por cache local desatualizado.


- Quando um operador ou líder clica por engano no botão `▶ Iniciar Produção`, o card entra em produção (`item.em_producao = true` e `inicio_real = now()`).
- Para evitar que o operador precise chamar um Administrador para pausar ou registrar uma falsa quebra com abertura indevida de O.S. na Ferramentaria, o card em produção exibe um botão sutil e temporizado **`↩ Desfazer ({60 - s}s)`** durante os primeiros 60 segundos após o início.
- Esse botão fica disponível para **qualquer operador/usuário autenticado** (não requer perfil admin).
- Ao ser acionado (`PATCH /producao/itens/{id}/desfazer-inicio`), o backend redefine `em_producao = False` e `inicio_real = None` (sincronizando também os itens irmãos em caso de postos tandem/casados), registra o log de auditoria `desfazer_inicio_acidental` e emite o broadcast WebSocket `producao_atualizada` para todos os clientes conectados.
- Após 60 segundos de produção decorridos, o botão de desfazer desaparece automaticamente e a ordem só pode ser concluída normalmente, pausada (se admin) ou encaminhada para quebra/reparo.

### Nomenclatura Oficial dos Postos de Solda (Ponteadeiras: PONTE XX) & Normalização SAP

- **Regra de Conversão & Apelido Conciso**: No setor de Solda, os postos de trabalho legados cadastrados com prefixo SAP `B6420` seguido de dois dígitos identificam diretamente a **Ponteadeira** física da fábrica. Para manter consistência com as prensas da estamparia (ex: `PR-82` a `PR-116`), adota-se o prefixo conciso **`PONTE XX`** (ex: `B642043` $\rightarrow$ `PONTE 43`, `B642036` $\rightarrow$ `PONTE 36`, `B642023` $\rightarrow$ `PONTE 23`, etc.).
- **Função de Domínio Pura (`normalizar_posto_trabalho`)**: Localizada em `backend/app/domain/postos.py`, é aplicada automaticamente na importação de planilhas Excel (`excel_import.py`), na persistência de lotes e na injeção direta de ordens de emergência. Postos da Estamparia (ex: `PR-82`, `PR-108`, `PR-114`) são preservados na íntegra.
- **Banco de Dados**: Registros existentes nas tabelas `producao`, `producao_staging` e catálogo de etiquetas foram migrados para `PONTE XX`.

### Catálogo de Etiquetas (Labels) por Prensa e Ponteadeira & Auto-Atribuição

- **Catálogo Padrão de Etiquetas**: Na inicialização e migração, o sistema popula o catálogo oficial de etiquetas (`Label`) categorizado por máquinas (`colaboracao_repository.py`):
  - **Prensas da Estamparia (16 máquinas)**: `PR-82`, `PR-84`, `PR-86`, `PR-88`, `PR-90`, `PR-92`, `PR-94`, `PR-96`, `PR-98`, `PR-108`, `PR-110`, `PR-112`, `PR-114`, `PR-116`, `PRENSA 01`, `PRENSA 02` com paleta de cores azuis/índigo.
  - **Ponteadeiras da Solda (18 máquinas)**: `PONTE 23`, `PONTE 24`, `PONTE 25`, `PONTE 26`, `PONTE 28`, `PONTE 29`, `PONTE 31`, `PONTE 33`, `PONTE 34`, `PONTE 36`, `PONTE 40`, `PONTE 43`, `PONTE 44`, `PONTE 51`, `PONTE 54`, `PONTE 57`, `PONTE 63`, `PONTE 68` com paleta de cores âmbar/laranja.
- **Auto-Atribuição ao Criar Ordens**: Toda nova ordem persistida em `bulk_persist` ou injetada diretamente em `inserir_item_producao_direto` recebe automaticamente a etiqueta da prensa ou ponteadeira correspondente via `seed_labels_padrao`. No modal `ItemDetalhe`, operadores e programadores podem adicionar ou alternar etiquetas secundárias conforme a necessidade.

### Anotações Fixas do Programador vs Comentários Colaborativos (Sem Anexos)

- **Anotações da Programação (`anotacoes`)**:
  - Campo de texto multi-linha armazenado em `ItemProducao.anotacoes` e `ItemProducaoStaging.anotacoes`.
  - **Permissão Restrita de Edição**: Apenas **`admin` e `programador`** podem editar e salvar anotações (`PATCH /producao/itens/{id}/anotacoes`). Operadores e usuários comuns têm acesso em modo **somente leitura**, com botão dedicado para copiar o texto com um clique.
  - **Botão Template "✨ Preencher Resumo do Lote"**: No modal `ItemDetalhe`, o programador pode clicar para gerar instantaneamente o modelo consolidado do lote. O conteúdo e a ordenação são determinados dinamicamente pelo template configurado para o setor da ordem (`solda` ou `estamparia`).
  - **Configurador Dinâmico de Resumo do Lote (`/parametros`)**:
    - Parâmetros persistidos no sistema: `template_resumo_solda` e `template_resumo_estamparia` (armazenados como JSON em `parametros_sistema`).
    - Na tela `/parametros`, o usuário conta com abas dedicadas (**⚡ Solda** e **🏭 Estamparia**), permitindo:
      1. Ativar ou desativar blocos individuais com checkboxes (`ativo: true/false`).
      2. Reordenar os blocos com botões `↑` (subir) e `↓` (descer).
      3. Pré-visualização em tempo real (Preview ao Vivo) do texto gerado antes de salvar.
      4. Botões para "Salvar Template" e "Restaurar Padrão".
    - Blocos suportados: Horários Planejados, Duração da Produção, Totais de Peças e Kanbans, Código do Material, Dados Operacionais do Lote, Componentes e Insumos da Solda (`[EST]`, `[VtoV]`, `[MP]`), Matéria-Prima da Estamparia, Paletização, Ferramenta e Observações.
  - **Checkbox "Mostrar na visualização de quadro" (`mostrar_anotacoes_quadro`)**: Quando ativado pelo programador, o card no quadro Kanban renderiza diretamente o bloco de anotações formatado em fonte mono com quebra de linha. Se desativado, o card exibe no rodapé um badge discreto `📝 Anotações` sinalizando a existência de orientações.
- **Comentários do Chão de Fábrica**: Mantidos abertos e irrestritos para todos os perfis (líderes, operadores, manutenção) para registro de ocorrências operacionais.
- **Remoção de Anexos**: Conforme validação de requisitos, o campo e fluxo de anexos de arquivos no card foi considerado desnecessário e removido da interface para simplificar a operação.

### Hierarquia Visual dos Cards, Alerta de Lote Curto & Padronização AutomacaoPlanner

- **Inversão da Hierarquia de Cabeçalho & Otimização para TV Fabril**:
  - O **Material** (`item.material`) é a informação primária procurada na fábrica e assume destaque tipográfico máximo (`text-sm sm:text-base font-black font-mono tracking-wide` no compacto e `text-base sm:text-lg font-black` no detalhado).
  - A **Linha e Posto/Máquina** (`item.linha • PONTE 43`) figura como subtítulo discreto e conciso (`text-[11px] font-semibold text-slate-500`).
  - **Dimensões e Preenchimento para TVs**:
    - Colunas do Kanban aumentadas de `w-72` (288px) para `w-80 md:w-[330px] xl:w-[350px]`, preenchendo painéis e telas grandes de chão de fábrica.
    - Cabeçalho das colunas exibe contador de lotes (`N lotes`), facilitando a contagem de fila à distância.
    - **Padronização de Altura dos Cards**: Os cards utilizam altura mínima uniforme (`min-h-[195px]` no modo compacto e `min-h-[295px]` no detalhado) com layout `flex flex-col justify-between`, eliminando desalinhamentos e "dentes de serra" entre postos vizinhos.
- **Parametrização & Separação Setorial do Alerta de Lote Curto (Estamparia vs Solda)**:
  - **Exclusividade da Programação**: O alerta de lote curto é uma ferramenta analítica de apoio ao PCP e existe **exclusivamente na tela de Programação** (`isProgramacao / exibirEstoque = true`). Na tela de **Produção** (`/producao`), o alerta **NÃO é exibido sob nenhuma hipótese**, evitando ruído operacional no chão de fábrica.
  - **Dois Parâmetros Independentes em `/parametros`**:
    - **Estamparia (`limite_lote_curto_minutos`)**: Configura o tempo mínimo para prensas (padrão oficial: 60 minutos, com atalhos de 30m, 45m, 60m, 90m).
    - **Solda (`limite_lote_curto_solda_minutos`)**: Configura o tempo mínimo para ponteadeiras e células da Solda (padrão oficial: 60 minutos, com atalhos de 30m, 45m, 60m, 90m), permitindo edição e calibração 100% separadas.
  - Quando a duração planejada de uma ordem for inferior ao limite do seu respectivo setor, a tela de Programação exibe o banner `⚠️ LOTE CURTO ESTAMPARIA (< X MIN)` ou `⚠️ LOTE CURTO SOLDA (< X MIN)` com pulso suave no modo compacto e detalhado.
- **Design Limpo e sem Redundâncias (`SequenciaCard`)**:
  - A linha de kanbans e peças adota layout unificado e elegante: `{item.kanbans} kanban(s) • {totalPecas} pçs`, eliminando textos repetitivos e acomodando os botões de ajuste `+ / -` de maneira integrada.
- **Padronização da Planilha `AutomacaoPlanner.xlsx` (Solda)**:
  - O arquivo `backend/data/AutomacaoPlanner.xlsx` foi migrado para a arquitetura idêntica à da Estamparia: **uma única coluna oficial `sequencia`**, eliminando as colunas separadas e esparsas `seqA`, `seqB`, `seqC` e `seqD`. O importador (`excel_import.py`) lê diretamente a coluna `sequencia` com fallback retrocompatível para versões antigas.
- **Total de Caixas e Peças**:
  - Exibição explícita no card: `Total: {item.kanbans} K = {totalPecas} pçs` (mantendo `{item.kanbans} kanban(s)` para compatibilidade).
- **Componentes e Matéria-Prima Estruturados (`comp_comb`)**:
  - **Esquema e Persistência**: Campo `comp_comb: str | None` suportado em `ItemProducaoBulkIn` e replicado na Tabela B (`producao`) durante o `bulk_persist`, mantendo dados legítimos e oficiais.
  - **Modo Compacto vs Detalhado em Todas as Telas**:
    - O seletor de densidade visual (`📐 Modo Compacto` vs `📑 Modo Detalhado`) está disponível tanto na tela de **Programação** quanto na tela de **Produção**, permitindo ao usuário e à equipe na TV escolher cards minimalistas ou detalhados.
  - **Modo Compacto (Chips Sucintos e Diretos em Paleta Neutra Sutil)**:
    - *Tags Limpas e Concisas*: Adotadas as siglas diretas **`EST`** (Estampado), **`MP`** (Matéria-Prima), **`VtoV`** (Vidro-a-vidro/comprado) e **`📦`** (Paletização).
    - *Paleta Sutil*: Cores saturadas foram eliminadas dos chips em favor de uma estética monocromática/slate neutra (`bg-slate-100 dark:bg-slate-800`), reservando o destaque de cores para as Etiquetas oficiais (Labels de Prensa e Ponteadeira).
    - *Solda*: Chips micro-formatados: `[EST: código (qtd pç)]` e `[VtoV: código (qtd pç)]`, com contador `+N` e embalagem.
    - *Estamparia*: Utiliza estritamente dados reais de código de material da peça e insumos legítimos (sem strings fictícias de "bobina de aço"), com paletização padrão `[📦 XP (Y cx)]`.
  - **Modo Detalhado (Painel Protegido sem Extrapolamento)**:
    - Lista estruturada de insumos com altura máxima controlada (`max-h-48 overflow-y-auto`) e cabeçalho fixo (`sticky top-0`), garantindo que listas longas de componentes não estourem o layout do card na TV.
    - *Solda*: Identificação automática de `EST` (contém `EB` ou `E`) e `VtoV`. Alerta `⚠️ Falta` condicionado estritamente à tela de programação (`isProgramacao && temFalta`).
    - *Estamparia*: Paletização automática (20 caixas por palete), Matéria-Prima se cadastrada, Ferramenta (`FERR. - {material}`) e Embalagem.
- **Etiquetas de Máquinas na Tela de Programação e Produção**:
  - Cards exibem automaticamente as etiquetas oficiais de Prensas (`PR-82` a `116` em azul) e Ponteadeiras (`PONTE 23` a `68` em âmbar).

### Linha do Tempo e Acesso à Documentação / Swagger

- **Linha do Tempo (Visão Timeline & Seisan Kaniban)**:
  - **Aproveitamento de 100% da Largura da Tela & Modo Full-Width**: Nas telas de Programação (`/programacao`) e Produção (`/producao`), alternar para as visões **Linha do Tempo (Seisan Kanriban)** ou **Tabela Detalhada** reconfigura o espaçamento do contêiner para `px-2 sm:px-3 py-3` (em vez de `px-6 py-6`). Isso elimina margens ociosas nas bordas da tela e faz com que a grade temporal e a tabela se estendam por toda a largura visível do monitor.
  - **Ampliação da Visão Seisan Kanriban na Programação (`ProgramacaoTimelineView`)**:
    - O cálculo de largura da grade mede o contêiner em tempo real com piso mínimo de 1600px (`Math.max(1600, containerLargura || 1600)`), garantindo que os blocos de produção se expandam suavemente e não fiquem espremidos.
    - Altura das faixas por posto ampliada de `h-24` (96px) para **`h-28` (112px)**.
    - Coluna fixa de postos de trabalho aumentada de `w-48` para **`w-52`**.
    - Tipografia e detalhes aprimorados nos blocos: horários em destaque (`⏱️ 06:20 ➜ 08:35` em `font-mono font-bold text-xs`), total de peças do lote (`X.XXX pçs`), botões de kanbans (+ e -) ampliados para `w-5.5 h-5.5` com sombra suave e microinterações ativas.
  - **Crescimento da Régua Horária (+3px)**: O componente compartilhado `SeisanTimeRuler` teve sua altura aumentada de 32px (`h-8`) para **35px (`h-[35px]`)** (+3px conforme solicitado), com marcadores de horas cheias estendidos de `h-2.5` para `h-3.5` e fonte das horas em `font-bold text-[10px]`. Os rodapés dos eixos correspondentes em `SeisanPostoTrack`, `ProgramacaoTimelineView` e `ProducaoTimelineView` foram alinhados exatamente com essa altura.
  - **Ampliação da Visão Tabela (`ProducaoTabelaView`)**:
    - As linhas e cabeçalhos da tabela foram ampliados para `py-3.5 px-4`, com tipografia em destaque para códigos de peças (`text-sm font-mono font-bold`), badges de sequência maiores (`h-7 text-xs font-bold`) e botões de ação ergonômicos para chão de fábrica.
  - **Reset de Zoom**: O botão de restauração de zoom (`RotateCcw`) foi reposicionado para a **esquerda** dos seletores, evitando cliques acidentais ao aproximar o zoom no botão `+`.
  - **Calibração de Zoom Inicial**: A visão abre calibrada para focar confortavelmente em **1 turno de produção (8 horas)**.
- **Acesso ao Swagger UI e Documentação**:
  - O fallback SPA do FastAPI em `backend/app/main.py` foi configurado para não interceptar `/docs`, `/redoc` e `/openapi.json`.
  - O servidor de desenvolvimento Vite (`frontend/vite.config.ts`) possui proxy reverso direcionando `/docs`, `/redoc` e `/openapi.json` diretamente para o backend na porta 8000.
  - A página `/documentacao` inclui atalhos diretos e amigáveis para abrir o Swagger UI e o ReDoc.

### Atalhos Globais de Teclado no PCP e Produção

- **Cockpit do PCP (Programação Patan - `/programacao`)**:
  - `Ctrl + Enter`: Envia o lote planejado para a produção persistida (`handleEnviar`).
  - `Ctrl + I`: Abre o modal de inserção de card/peça manual na fila (`+ Inserir Card`).
  - `Ctrl + K`: Abre ou alterna a gaveta lateral de peças críticas e quarentena (`Itens Críticos`).
  - `Escape`: Fecha imediatamente quaisquer modais ou gavetas abertas (modal de inserção, menu de ações secundárias e gaveta de críticos).
  - Badges visuais discretos `<kbd>` foram inseridos nos respectivos botões do cabeçalho para acelerar a curva de aprendizado dos operadores de PCP sem sobrecarregar a interface.
- **Tela de Produção (`/producao`)**:
  - `Ctrl + I`: Abre o modal de injeção de ordem de emergência (`+ Inserir Card / Emergência`), restrito a perfis autorizados (`admin` e `programador`).
  - `Escape`: Fecha os modais de inserção de emergência, conclusão de produção e apontamento de quebra.
- **Cockpit Responsivo em 2 Clusters no PCP**:
  - A barra secundária do PCP foi dividida em dois blocos lógicos autônomos para manter clareza visual e evitar quebras de layout em resoluções intermediárias (1024px a 1440px):
    - *Cluster 1 — Escopo de Lote*: Linha, Turno, Patan e Seletor de Data.
    - *Cluster 2 — Visualização & Cálculo*: Alternador de Modo de Dimensionamento (`🎯 Lote Fixo (Patan)` vs `📊 Estoque Máximo (Carga Máq.)`), Alternador de Visão (`🗂️ Cards` vs `⏱️ Seisan Kanriban`) e Alternador de Densidade (`Compacto` / `Detalhado`).

### Seisan Kanriban (トヨタ生産管理板) — Janela Temporal, Navegação de Datas e Sincronização

A tela `/seisan-kanriban` implementa o Quadro de Gestão Visual da Toyota (TPS) em tempo real:
- **Janela Temporal de 24 Horas**: A régua visual mapeia a produção das **06:00 do dia selecionado até as 06:00 do dia seguinte** (ou janelas de turno: 1ºT 06:00-15:00, 2ºT 14:20-23:20, 3ºT 22:40-06:40).
- **As 3 Faixas TPS**:
  1. **Faixa 1 (Patan Teórico)**: Posicionada por `hora_inicial` e `hora_final` teóricos do lote planejado.
  2. **Faixa 2 (Programado)**: Tabela B oficial persistida com a duração planejada ($kanbans \times qtd\_por\_kanban \times tempo\_peca$).
  3. **Faixa 3 (Realizado)**: Apontamentos reais do chão de fábrica (`inicio_real`, `fim_real`, quebras e em produção ao vivo).
- **Sincronização Inteligente de Datas e Auto-Seleção**:
  - Como a janela temporal é restrita à data selecionada (24h), ordens com `hora_inicial` planejada em uma data diferente não são renderizadas nas faixas 1 e 2 se o usuário estiver com outro dia selecionado.
  - Para evitar que a tela abra vazia ou "desapareça" o Patan/Programado (caso a data de hoje ainda não tenha ordens ou a programação tenha sido feita para outro dia), o Seisan Kanriban extrai as datas disponíveis na Tabela B e **auto-seleciona a data com ordens programadas**, além de exibir banner informativo com atalhos em 1 clique para as datas com produção.
  - **Navegação Rápida na Barra de Ferramentas (`SeisanKanibanToolbar`)**: Inclui botões `◀` (dia anterior), `▶` (próximo dia), `Hoje` e pílulas clicáveis das datas que possuem lotes cadastrados (`[DD/MM (N)]`).
  - **Fallback Defensivo (`to_item_producao_out`)**: Se `item.hora_inicial` for nulo no banco, utiliza `item.inicio_real` como fallback para que Faixa 1 e 2 permaneçam alinhadas com a execução.

### Módulo da Ferramentaria, Preventivas & Catálogo de Ferramentas

- **Quadro da Ferramentaria** (`/ferramentaria`): Kanban operacional com **6 estágios de ciclo de vida**:
  1. 🔴 `Aguardando Manutenção (Corretiva)` (`aguardando_manutencao`)
  2. 🟠 `Aguardando Manutenção (Preventiva)` (`aguardando_preventiva`)
  3. 🟡 `Em Manutenção` (`em_manutencao`)
  4. 🟣 `Aguardando Tryout` (`aguardando_tryout`) — *Novo estágio intermediário!*
  5. 🔵 `Tryout / Testes` (`tryout`)
  6. 🟢 `Liberadas (OK / Disponível)` (`disponivel`)
- **Regras Operacionais de Bancada e Tryout**:
  - **Ações do Ferramenteiro (`em_manutencao`)**: Ao trabalhar na matriz ou dispositivo, o ferramenteiro pode:
    - *Opção A*: Enviar para `Aguardando Tryout` (`aguardando_tryout`) ao concluir o reparo na bancada.
    - *Opção B*: **Liberar a ferramenta diretamente** (`disponivel`) com parecer/laudo, sem necessidade de tryout.
  - **Exclusividade do Programador da Ferramentaria (`aguardando_tryout` $\rightarrow$ `tryout`)**:
    - O avanço para a coluna `Tryout / Testes` é **restrito exclusivamente ao `programador_ferramentaria` (ou `admin`)**.
    - Ao enviar para tryout, abre-se obrigatoriamente um modal de agendamento exigindo:
      1. **Setor Fabril**: Estamparia (prensas) ou Solda (células).
      2. **Máquina / Prensa**: código da máquina de teste (ex: `PR-108` a `PR-114`, `SB6A`, etc.).
      3. **Ferramenta / Matriz**: confirmação da ferramenta sob teste.
      4. **Janela Temporal**: horários de **Início** e **Término** do tryout (validação: término > início).
      5. **Instruções e Observações**: orientações para o operador da prensa/linha.
    - Usuários sem perfil de programador visualizam o card em `Aguardando Tryout` com aviso de bloqueio aguardando agendamento, podendo apenas retornar o item para bancada caso necessário.
  - **Visibilidade Integrada na Produção da Estamparia (`/producao/estamparia`)**:
    - Os cards na coluna de Tryout da Estamparia exibem a prensa alvo agendada, ferramenta e a janela de horários programada.
- **Catálogo de Ferramentas & Preventivas** (tabela `ferramentaria_catalogo`):
  - Cadastro de matrizes e moldes com código, setor (`estamparia` ou `solda`), linha, posto, periodicidade em dias,
    data da última manutenção e cálculo automático da próxima preventiva.
  - Indicadores semafóricos inteligentes: 🔴 Vencida ($\le 0$ dias), 🟡 Próxima ($\le 7$ dias), 🟢 Em dia.
  - Abertura de preventiva em 1 clique (`POST /ferramentaria/catalogo/{id}/abrir-preventiva`): gera a O.S. no Kanban
    com status `aguardando_preventiva` e bloqueia o material no Patan.
  - Ao liberar a ferramenta como `disponivel`, o sistema atualiza automaticamente a data de última manutenção e
    recalcula a próxima preventiva no catálogo.
- **Cargo `programador_ferramentaria`**: Perfil com a permissão granular `pode_gerenciar_ferramentaria`,
  permitindo gerenciar ordens, avançar status, cadastrar ferramentas no catálogo, agendar tryouts e emitir laudo de liberação.
- **Bloqueio de Programação**: Enquanto qualquer ferramenta estiver com status $\ne$ `"disponivel"` na Ferramentaria
  (incluindo `em_manutencao` e `aguardando_tryout`), itens correspondentes são visualmente bloqueados e o envio do lote é rejeitado com `HTTP 400` no backend.

### Separação entre Setores: Produção SOLDA vs Produção ESTAMPARIA

Dois mundos fabris que coexistem de forma independente:
1. **Produção — Solda** (`/producao/solda`):
   - Postos de solda (ex: `SB6A`), operando sob o ciclo de Patans regulares (`A` a `H`) de 8 dias.
2. **Produção — Estamparia** (`/producao/estamparia`):
   - Prensas de corte e conformação de matrizes.
   - **Coluna Tryout Integrada**: exibe em tempo real as ferramentas/matrizes que a Ferramentaria enviou para
     o estágio `tryout`, permitindo aos operadores de estamparia realizarem testes práticos em prensa antes
     da liberação definitiva.
- **Isolamento de Dados**: campo `setor` (`"solda"` ou `"estamparia"`) nas tabelas `producao`, `producao_staging`
  e `coluna_extra`, com índices e constraints compostos por setor para garantir sequenciamento sem colisões.
- **Controle Granular de Acesso por Setor**: permissões dinâmicas `pode_ver_solda` e `pode_ver_estamparia`,
  permitindo restringir operadores ao seu setor de atuação.
- **Listas de Verificação (Checklists) Oficiais por Setor**:
  Cada card/tarefa de produção é criado com seu checklist padronizado conforme o setor de origem (`colaboracao_repository.py`), todos inicialmente não concluídos:
  - **Programação Estamparia (`CHECKLIST_ESTAMPARIA` — 8 itens oficiais)**:
    1. `(FERRAMENTARIA) FERRAMENTA DISPONÍVEL`
    2. `(RECEBIMENTO) MATÉRIA PRIMA`
    3. `(PRODUÇÃO) PRÉ-SETUP`
    4. `(PRODUÇÃO) FECHAMENTO`
    5. `(QUALIDADE) LIBERAÇÃO FIM DE PRODUÇÃO`
    6. `(FERRAMENTARIA) FERRAMENTA LIBERADA`
    7. `(SAP) LIMPEZA CABECEIRA`
    8. `(SAP) LIMPEZA WIP1`
  - **Programação Solda (`CHECKLIST_SOLDA` — 5 itens oficiais)**:
    1. `1 - (ABASTECIMENTO) ESTAMPADO ABASTECIDO`
    2. `2 - (ABASTECIMENTO) EMBALAGEM E VTOV ABASTECIDOS`
    3. `3 - (PRODUÇÃO) PRÉ-SETUP`
    4. `4 - (PRODUÇÃO) FECHAMENTO`
    5. `5 - LIMPEZA WIP2 OU DTR3`

### Linhas de Produção por Setor & Submenus de Navegação

- **Segregação das Linhas Fabris**: As linhas de produção são associadas a um setor específico (`solda` ou `estamparia`)
  na tabela `linhas_producao` (modelo `LinhaProducao`).
  - **Solda (padrão inicial)**: `LINHA 1`, `LINHA 2`, `LINHA 3`.
  - **Estamparia (padrão inicial)**: `LINHA 1`, `LINHA 3`, `LINHA 4`.
- **Criação e Gestão de Linhas**: Restrita por padrão ao `admin` ou a usuários com a permissão granular
  `pode_gerenciar_linhas` configurada na tela de **Parâmetros** (`/parametros`).
- **Navegação em Cascata (Menu / Submenu)**:
  - Menu principal **Produção** expande para os submenus **⚡ Produção — Solda** e **🏭 Produção — Estamparia**.
  - Cada submenu lista diretamente as linhas ativas do setor com links que navegam para a rota com query param
    correspondente (ex: `/producao/solda?linha=LINHA 1` ou `/producao/estamparia?linha=LINHA 3`).
  - A tela de Produção sincroniza a linha selecionada na URL via `useSearchParams`, atualizando o Kanban imediatamente.

### Limpeza da Tabela de Produção (Exclusivo Administrador)

- Na tela de **Produção** (`/producao/solda` e `/producao/estamparia`), um botão **`Limpar Produção`** é exibido
  **exclusivamente para o Administrador (`role === 'admin'`)**.
- Utilidade: recurso para agilizar testes e resetar ordens em produção sem intervenção manual no banco de dados.
- Endpoint seguro: `DELETE /producao/limpar-producao?linha=...&setor=...&turno=...` (restrito estritamente a `Role.ADMIN`).
- Confirmação com modal defensivo, permitindo ao administrador limpar apenas o turno em foco ou todos os turnos da linha.
  Dispara evento WebSocket `producao_atualizada`, limpando o board em tempo real.

### Inserção Direta de Card na Produção & Reprogramação em Cascata (Ordem de Emergência)

- Na tela de **Produção** (`/producao/solda` e `/producao/estamparia`), um botão **`+ Inserir Card`** é exibido
  **exclusivamente para o Programador e Administrador (`role in ['admin', 'programador']`)**.
- **Cenário de Uso**: Atende à necessidade de ordens urgentes ou lotes que surgiram de última hora e precisam ser
  injetados imediatamente no fluxo fabril persistido (Tabela B).
- **Regra de Ouro da Cascata**:
  - O programador estipula o horário planejado que o lote deve iniciar (`hora_inicial`), a peça, o posto, kanbans e tempos.
  - A Tabela B é tratada como imutável após persistida, **com a única exceção de inserção de ordem de emergência**.
  - Ao inserir o card com o horário agendado, todos os lotes regulares daquele mesmo posto de trabalho que iniciam após
    aquele horário têm seus horários (`hora_inicial` e `hora_final`) **empurrados cronologicamente em cascata** para abrir
    espaço para a nova ordem, respeitando a pausa de refeição se cruzarem o intervalo do turno e recalculando a `sequencia`
    em duas fases para evitar violação do índice único.
  - Cards em produção ativa (`em_producao == true`) ou em colunas extras/buckets concluídos não são alterados.
- **Endpoint**: `POST /producao/inserir-card` (`InserirItemProducaoRequest`), registrando auditoria (`inserir_card_producao`)
  e disparando evento WebSocket `producao_atualizada` para sincronização instantânea de todos os operadores da linha.

### Visualização de Produção: Três Modos (Quadro Kanban, Visão Tabela e Linha do Tempo / Seisan)

Na tela de **Produção** (`/producao/solda` e `/producao/estamparia`):
- **Turno Padrão "Todos os Turnos"**: Por padrão inicial, o filtro de turno carrega como `0` ("Todos os Turnos",
  enviando `turno=undefined` para `GET /producao/tabela-b`), permitindo aos líderes e operadores acompanhar o fluxo
  contínuo da fábrica ao longo de todos os turnos sem filtros fragmentados.
- **Cards Empilhados em Ordem Cronológica Estrita**: Dentro de cada coluna de Posto de Trabalho, os cards vêm ordenados
  cronologicamente por data e horário de início (`hora_inicial`), desempatando por `turno` e `sequencia`. Itens com
  `em_producao == true` mantêm-se no topo da coluna (`index === 0`) para permitir apontamentos imediatos.
- **Alternador de Visualização Trimodal (`modoVisualizacao`)**:
  1. **Modo Quadro (Cards / Kanban)**: O visual padrão por colunas de postos de trabalho e buckets extras com drag & drop.
  2. **Modo Tabela (`ProducaoTabelaView`)**: Visão tabular densa com busca instantânea, filtros por posto/status e 100% de paridade de ações (`Iniciar`, `Concluir`, `Quebra`, etc.).
  3. **Modo Linha do Tempo / Seisan (`ProducaoTimelineView`)**:
     - Foco exclusivo no que está acontecendo na fábrica em tempo real (produção real).
     - Coluna lateral esquerda congelada (`sticky left-0`) listando os postos de trabalho com seus respectivos badges contadores.
     - Trilhas horizontais contínuas por posto exibindo barras de execução real: verde para concluídos com peças apontadas, azul/esmeralda pulsante para o lote em produção ativa com minutos decorridos, vermelho para paradas/quebras, e cinza pontilhado para a fila programada.
     - Régua temporal na base inferior (`SeisanTimeRuler`) sincronizada verticalmente cortando todo o grid, com zonas de refeição sombreadas e marcador do horário atual ("AGORA").
     - Ferramentas de zoom temporal de 75% a 250% e suporte a `Ctrl + Scroll`.


### Módulo Seisan Kanriban (`/seisan-kanriban`) — Gantt Triplo Lean TPS

Visualização cronológica e controle visual comparativo da produção por posto de trabalho:
- **Quadrante Gráfico Integrado & Eixo X na Base**: Cada posto de trabalho opera dentro de um **único quadrante
  temporal contínuo**, onde as linhas de grade verticais cortam verticalmente a Faixa 1, Faixa 2 e Faixa 3 até
  o **Eixo X** (régua horária na base inferior). Isso alinha com precisão milimétrica o tempo entre o que foi
  planejado e o que foi realizado, sem sobreposições e com rolagem horizontal unificada.
- **Faixa 1 — Patan Teórico (Baseline Padrão)**: O plano mestre de referência fixo do ciclo do Patan, contendo
  a receita sequencial dos produtos (`material`, kanbans e tempos de ciclo padrão). Exibe as caixinhas de cada
  peça como baseline teórico imutável. As pausas de refeição são marcadas como zonas de fundo hachuradas transparentes.
- **Faixa 2 — Programado (Tabela B com Ajustes)**: A programação efetiva da Tabela B onde o programador realizou
  os ajustes de lote (aumentou, diminuiu ou manteve os kanbans do Patan padrão, com `hora_inicial` e `hora_final`).
- **Faixa 3 — Realizado (Chão de Fábrica & GAPs)**: O que o chão de fábrica está executando:
  - **Concluído**: Barra verde sólida de `inicio_real` até `fim_real` com peças apontadas.
  - **Em Produção**: Barra azul/esmeralda com gradiente pulsante ao vivo e tempo decorrido em minutos.
  - **Quebra / Avaria**: Barra encurtada em vermelho até a parada (`fim_real`) e **GAP visual livre** hachurado
    (tempo livre disponível para remanejamento de programação até o final planejado).
  - **Pendente**: Barra pontilhada/projetada na fila.
- **Sem Filtro de Patan**: Acompanhamento contínuo da linha inteira independente de Patan (idêntico à tela Produção).
- **Abas Diretas de Setor**: "⚡ Solda" e "🏭 Estamparia".
- **Marcador Linha do Tempo ("AGORA")**: Linha vertical em tempo real cortando todo o quadrante dinamicamente.
- **KPIs Superiores**: Aderência ao Plano %, Volume de Peças Real vs Programado, Lotes Concluídos/Ao Vivo/Fila, Paradas & Quebras.
- **Barra de Controles & Visualização (`SeisanKanibanToolbar`)**:
  - **Espaçamento e Respiração das Faixas**: as 3 faixas operam com trilhas visuais separadas e ventiladas, com controle de densidade/altura vertical (Compacta: 46px, Padrão: 58px, Espaçosa: 74px).
  - **Habilitar / Desabilitar Faixas**: toggles independentes para ligar/desligar a Faixa 1 (Teórico), Faixa 2 (Programado) e Faixa 3 (Realizado), permitindo focar em comparações específicas ou exibir todas juntas.
  - **Filtro de Status do Realizado**: botões tipo pill com contadores em tempo real para filtrar a Faixa 3 por `Todos`, `✓ Concluídos`, `⚠️ Quebras / Paradas`, `▶ Ao Vivo` ou `⏳ Fila / Pendentes` sem alterar a referência do teórico e programado.
  - **Sistema de Zoom Temporal (Minutos a Horas)**: controle da escala da régua e largura do gráfico através de botões, slider e seletor com 9 níveis de granularidade:
    - *Macro*: 6 em 6 horas (dia aberto), 4 em 4 horas, 2 em 2 horas.
    - *Padrão*: 1 em 1 hora.
    - *Detalhado / Micro*: 30m, 15m, 10m, 5m e minuto a minuto (1 min).
  - **Atalho Interativo de Zoom**: suporte nativo a `Ctrl + Roda do Mouse (Wheel)` no gráfico para aproximar ou afastar a escala de tempo dinamicamente.
- **Layout Anti-Colisão & Lotes de Conclusão Rápida na Faixa 3 (`calcularLayoutFaixaRealizado`)**:
  - Resolve o problema de lotes concluídos em rápida sucessão (mesmo minuto ou segundos de diferença) seguidos por lotes longos:
  - **Garantia de Largura Mínima Visível**: cada card concluído recebe largura mínima garantida (48px) para nunca colapsar em linha invisível.
  - **Anti-Colisão Sequencial**: cards que começam no mesmo minuto ou antes do término visual do card anterior são posicionados lado a lado sequencialmente com gap seguro de 3px, impedindo que lotes maiores sobreponham ou cubram os anteriores.
  - **Destaque para Lotes Rápidos**: lotes concluídos com duração $< 120s$ recebem badge `⚡ Xs` (ex: `⚡ 3s`) no card.
  - **Contadores no Cabeçalho do Posto**: o cabeçalho de cada posto exibe pills dinâmicos com contadores ao vivo (`✓ X concluídos`, `▶ X em produção`, `⚠️ X quebras`, `⏳ X na fila`).
  - **Precisão de Segundos**: tooltips e modal de detalhes exibem timestamps exatos (`HH:MM:SS`) e durações formatadas com segundos quando aplicável.
- **Coluna Lateral Fixa / Congelada (`sticky left-0`)**: A primeira coluna lateral (que rotula a Faixa 1 - Teórico,
  Faixa 2 - Programado, Faixa 3 - Realizado e o Eixo X - Régua de Tempo) possui posicionamento `sticky left-0 z-20`
  com fundo fosco/translúcido (`bg-white/95 dark:bg-slate-900/95 backdrop-blur-md`) e elevação/sombra sutil.
  Isso garante que ao rolar horizontalmente a linha do tempo ou usar zoom detalhado (5 em 5 minutos ou minuto a minuto),
  o operador sempre mantenha a identificação de cada faixa à vista sem perder a referência visual do posto.
- **Zonas de Refeição Dinâmicas & Selo `🍽️ Almoço`**:
  - As hachuras de fundo transparentes que marcam as pausas de refeição são geradas a partir dos horários configurados
    no sistema (`hora_refeicao_turno_1..3` e `duracao_refeicao_minutos`).
  - Blocos/cards da Faixa 2 (Programado) e Faixa 3 (Realizado) que receberam a pausa de almoço (`almoco_incluso: true`)
    exibem um selo visual destacado `🍽️ Almoço` em âmbar, facilitando a identificação imediata de qual lote absorveu o intervalo.
- **Modal Comparativo Detalhado**: Clicar em qualquer bloco exibe dados lado a lado de planejado vs realizado, variação de minutos/segundos e histórico.

### Estilização dos Cards por Turno e Data de Produção

Nos cards do SequenciaBoard (telas de Produção e Programação):
- **Cores por Turno**: 1º Turno (cinza slate refinado), 2º Turno (âmbar suave), 3º Turno (índigo/roxo noturno), mantendo o anel pulsante quando `em_producao` e destaque vermelho quando `is_critico`.
- **Badge de Turno**: Cabeçalho do card exibe `1º Turno`, `2º Turno` ou `3º Turno`.
- **Dia de Produção**: Exibição da data planejada (`📅 DD/MM`), essencial para lotes que viram a noite ou operações contínuas.

### Módulo de Programação: Remoção de Cards e "Montar Padrão" (Patan Teórico)

Na tela de **Programação** (`/programacao` — modelo Tabela A / Staging):
- **Remoção Flexível de Cards da Fila**:
  - O programador tem total liberdade para retirar qualquer card normal ou crítico do lote daquela linha/turno/posto (ex: caso decida não produzir aquele item ou se o material estiver temporariamente bloqueado na Ferramentaria).
  - Cada card conta com o botão rápido **`✕`** no canto superior direito e a ação explícita **`✕ Retirar da fila`** no rodapé do card.
  - Para ferramentas com manutenção aberta, o botão exibe destaque vermelho: **`✕ Remover do lote (Ferramenta Bloqueada)`**, facilitando a limpeza visual antes do envio do lote.
  - Ao retirar o item, o `sequenciaReducer` recalcula imediatamente a cascata sequencial e a numeração do posto, e o ID do item entra em `itensRemovidos`, impedindo que re-renders ou sincronizações o tragam de volta antes do envio.
- **Botão "Montar Padrão" (Patan Teórico / Reload)**:
  - Botão com ícone de recarga na barra superior que restaura instantaneamente a receita-base do Patan teórico selecionado.
  - Limpa os cartões removidos (`itensRemovidos`), retira temporariamente itens críticos manuais e re-executa a carga padrão dos itens normais daquele Patan com seus kanbans e tempos de ciclo de fábrica originais.
- **Cockpit Minimalista e Unificado (2 Tiers) & Eliminação de Duplicidades**:
  - **Eliminação de Duplicidades**: Removido o botão redundante `Enviar lote` que existia isolado no rodapé da página `ProgramacaoPatan.tsx`. A ação agora reside exclusivamente no cockpit superior como botão primário oficial (`data-testid="btn-enviar-lote"`).
  - **Estrutura em 2 Tiers Harmonizada (Programação e Produção)**:
    - *Tier 1 (Superior)*: Ícone do setor, título simplificado com switcher rápido tipo pill (`⚡ Solda` / `🏭 Estamparia`), breve descrição do setor e ações primárias destacadas (`+ Inserir Card`, menu colapsável `Ações e Ferramentas ▾` para operações secundárias, e `Enviar lote` na Programação; `+ Ordem de Emergência`, `Exportar CSV` e `Limpar Produção` na Produção).
    - *Tier 2 (Inferior / Escopo e Modos)*: Controles organizados e alinhados para seleção de Linha, Turno, Patan/Data com navegação rápida de dias (`◀`, `Hoje`, `▶`, `Todas`), alternador de dimensionamento de lote (`🎯 Lote Fixo` vs `📊 Estoque Máximo`), e alternador de visualizações (`Quadro` / `Tabela` / `Linha do Tempo`).
  - **Layout Limpo e Fluido**: Elimina controles amontoados em quebras de linha irregulares, garantindo espaçamento consistente e estética moderna (clean) em qualquer resolução de tela.

### Correção de Dados & Ciclos: Solda e Estamparia

- **Solda (`excel_import.py`)**:
  - A planilha `AutomacaoPlanner.xlsx` armazena o tempo total do lote na coluna `tempoProd` (em minutos), enquanto `tempPeca` vinha zerado/vazio.
  - Corrigido o cálculo de fallback em `excel_import.py`: quando `tempPeca <= 0`, calcula automaticamente `tempo_por_peca_minutos = tempoProd / (kanbans * pcs/embalagem)`.
  - Com isso, cada lote de solda calcula durações reais de ciclo (ex: ~5 a 9 segundos por peça), gerando a cascata sequencial perfeita com horários contínuos ao invés de todos os itens travados no horário inicial `06:20 -> 06:20`.
- **Estamparia (`estamparia_converter.py`)**:
  - Anteriormente, a leitura da aba `DADOS` da Carga Horária importava centenas de ferramentas inativas sem Patan, acumulando itens espúrios no Patan A com horários desregulados (2h da manhã e 16h da tarde).
  - Atualizado para priorizar o sequenciamento oficial de `Missão 1.xlsx` (`SEQUENCIA_PADRAO`), com lotes realistas e consolidação por `(linha, turno, patan, posto, material)`.
  - Na Linha 1 Turno 1 Patan A, a fábrica agora opera com exatamente 16 itens oficiais (4 peças por prensa: `PR-92`, `PR-93`, `PR-82`, `PR-113`), iniciando às `06:20` e finalizando às `~14:10` com pausas de refeição respeitadas, eliminando qualquer anomalia de horários fora do turno.
  - **Linha 3 Completa com Prensas em Tandem**: No `Missão 1.xlsx`, a Linha 3 havia sido condensada sob um único posto fictício `L-3`. A extração agora detecta e incorpora diretamente a base oficial de `03- PATAN ESTAMPARIA - LINHA 3 (REEDUCANDO) - (OUT-26 até ABR-27).xlsx`, distribuindo os itens com precisão pelas 5 prensas reais da linha: `PR-110`, `PR-109`, `PR-99`, `PR-98`, `PR-97`.

### Produção em Linha (Sincronização em Tandem & Destaque Visual Sutil Sky/Slate)

- **Conceito Fabril**: Em linhas contínuas de estamparia (prensas em tandem) ou estações de solda interligadas, o mesmo componente/material passa sequencialmente por múltiplas prensas/postos simultaneamente (ex: PR-110 Op 20 -> PR-109 Op 30 -> PR-99 Op 40 -> PR-98 Op 50 -> PR-97 Op 60).
  - **Regra de Ouro**: Não é possível rodar o item em apenas uma prensa isolada; a linha inteira precisa operar em sincronia ao mesmo tempo.
- **Detecção Automática**:
  - Tanto no backend (`enriquecer_itens_producao_em_linha` em `routes_tabela_b.py` e `routes_producao.py`) quanto no frontend (`postosPorMaterial` em `SequenciaBoard.tsx`), qualquer material que figure em mais de 1 posto de trabalho ativo na mesma linha/turno é categorizado como `producao_em_linha = true` com lista de `postos_vinculados`.
- **Identidade Visual Sutil e Ergonômica nos Cards (Programação e Produção)**:
  - Todo card de produção em linha recebe cores temáticas suaves em tons `sky`/`slate` (substituindo azuis saturados e cansativos): fundo sutil `bg-sky-50/40 dark:bg-sky-950/20`, borda refinada `border-sky-300/80 dark:border-sky-700/60` e selo de topo discreto `🔗 Produção em Linha` indicando a quantidade de postos sincronizados (em modo compacto, badge sutil `🔗 Linha`).
  - O banner superior no Kanban adota tons neutros de slate (`bg-slate-50/90 dark:bg-slate-900/60 border-slate-200`) com pills em `sky-50`/`sky-600` e atalhos rápidos.
- **Linhas Linkando os Itens (Camada SVG Interativa e Não-Poluente On-Demand)**:
  - O `SequenciaBoard` renderiza uma camada SVG dinâmica que traça curvas conectando os cards do mesmo produto através das diferentes colunas do quadro em tons azul celestial (`#0284c7` e `#7dd3fc`).
  - **Comportamento Não-Poluente**: Para não sobrecarregar visualmente a tela em repouso, as linhas de conexão **NÃO ficam visíveis a todo momento** (em repouso, 0 linhas no DOM). Elas aparecem instantaneamente **apenas quando o operador passa o mouse sobre o card de um material que opera em linha ou clica na pílula do material no banner superior**.
  - Ao passar o cursor (`hover`) em qualquer card ou no botão da barra superior, todas as prensas/postos daquela linha tandem acendem com anel luminoso pulsante (`ring-2 ring-sky-500 scale-[1.01]`), tornando a conexão da linha evidente de ponta a ponta sem poluir o quadro.
- **Sincronização de Início de Produção**:
  - Ao acionar **`▶ Iniciar Produção`** em um card de produção em linha na tela de Produção, o backend (`PATCH /producao/itens/{id}/iniciar-producao`) inicia automaticamente todos os itens irmãos daquele material na linha (`em_producao = True` e `inicio_real = now`), sincronizando o status de toda a fábrica em tempo real via WebSocket.

### Modal de Detalhes do Card (`ItemDetalhe`) & React Portal

- **Problema de Stacking Context**: O `@dnd-kit` injeta transformações CSS (`transform`) nos cartões ordenáveis (`useSortable`). Segundo a especificação CSS W3C, qualquer elemento com `transform` atua como um novo *stacking context* e ponto de referência (*containing block*) para elementos com `position: fixed`. Por esse motivo, modais filhos renderizados dentro do card ficavam confinados à coluna do card e eram desenhados **por baixo** dos cards das colunas à direita.
- **Solução Arquitetural Definitiva**: O componente `ItemDetalhe` renderiza via `createPortal(..., document.body)`.
  - Escapa inteiramente da hierarquia de containers e transformações da coluna.
  - Backdrop blur translúcido cobrindo 100% da viewport com `z-[9999]`.
  - Fechamento intuitivo com tecla `Escape` e clique fora do conteúdo (overlay).
  - Garante visibilidade e foco total sobre todas as colunas e elementos da tela.

### Seleção de Data na Programação e na Produção

1. **Escolha da Data na Programação (`/programacao/solda`, `/programacao/estamparia`)**:
   - O cockpit de programação permite ao programador definir em qual dia a programação deve ser gerada, através de seletor `<input type="date" />`, botões rápidos de navegação `◀` (dia anterior), `▶` (próximo dia) e atalho `Hoje`.
   - Inicializa sempre no dia atual em fuso horário local (`getHojeLocalIso()`).
   - Ao alterar o dia, dispara a ação `ALTERAR_DATA_BASE` no `sequenciaReducer.ts`, recalculando imediatamente toda a cascata (`hora_inicial`, `hora_final`) e mantendo coerência com os turnos e pausas de almoço para o dia escolhido. O envio do lote persiste os horários exatos dessa data.
2. **Escolha da Data na Produção (`/producao/solda`, `/producao/estamparia`)**:
   - A barra de ferramentas da tela de Produção conta com seletor de data (`◀`, `▶`, `<input type="date" />`, `Hoje` e `Todas`), permitindo ao operador ou gestor inspecionar os lotes e o fluxo produtivo de qualquer dia histórico ou futuro.
   - **Padrão Oficial "Todas"**: A tela de Produção inicializa por padrão com a data em `"todas"` (`dataProducao = "todas"`), permitindo que o operador e o chão de fábrica visualizem imediatamente todas as ordens ativas da fábrica sem precisar clicar no botão manualmente.
   - Todos os 3 modos de visualização (Quadro Kanban, Visão Tabela e Linha do Tempo) respondem ao filtro. No modo Linha do Tempo (`ProducaoTimelineView`), a régua temporal centra-se dinamicamente na data selecionada.

3. **Sequenciamento Contínuo Selecionável (`⚡ Continuar após produção ativa`) na Programação**:
   - Opção em checkbox no Cluster 1 de filtros na tela de Programação (`ProgramacaoPatan.tsx`).
   - Quando ativada pelo programador, a cascata de horários consulta as ordens ativas da linha na fábrica (Tabela B) e alinha o início do lote (`hora_inicial`) de cada posto com o horário de término (`hora_final`) do último item em execução naquele posto de trabalho, ao invés de forçar o início rígido do turno (`SHIFT_START_TIME`, ex: 06:20).
   - Se o posto não possuir ordens em execução ativa, a cascata parte suavemente do início padrão do turno, sem quebras.
   - A opção é estritamente selecionável (toggle), mantendo o comportamento padrão tradicional de início de turno caso o usuário desmarque a opção.

4. **Modo Compacto de Componentes com Setinha Interativa (Programação e Produção)**:
   - No `SequenciaCard.tsx` (utilizado tanto em `/programacao` quanto em `/producao`), cartões com múltiplos componentes de solda (`[EST]`, `[VtoV]`) agora exibem por padrão apenas a **primeira linha de componentes**.
   - No canto direito do bloco, é renderizado um botão discreto com indicador numérico `+N` e setinha (`<ChevronDown />` / `<ChevronUp />`).
   - Ao clicar na setinha, o bloco expande instantaneamente todos os componentes do card e, ao clicar novamente, minimiza para a primeira linha, reduzindo o espaço vertical ocupado no quadro e mantendo as colunas limpas e alinhadas.
5. **Posicionamento e Camada do Botão Remover Card (`✕`)**:
   - O botão para retirar um item da fila de programação (`data-testid="btn-remover-card"`) é posicionado de forma absoluta no canto superior direito do card (`absolute top-2 right-2 z-30`).
   - A camada `z-30` garante que ele permaneça acessível e nunca fique sob banners internos ("Ferramenta Bloqueada", "Produção em Linha" ou "Em Produção") ou sublayers, tanto no modo compacto quanto no modo detalhado/expandido.

### Central de Documentação, Suporte e Referência Swagger (`/documentacao`)

- **Contextos Modulares e Isolados (`docs/contextos/`)**:
  - Para evitar consumo desnecessário de tokens em prompts de manutenção e facilitar o suporte técnico pontual, a documentação do sistema foi dividida em 9 arquivos autocontidos:
    1. `00_ARQUITETURA_E_VISAO_GERAL.md`: Princípios TPS, Tabela A vs B, máquina de estados e WebSockets.
    2. `01_PROGRAMACAO.md`: Operação de staging, Lote Fixo vs Carga Máquina, cascata e pausas de refeição.
    3. `02_PRODUCAO.md`: Regra da posição 0, apontamentos de peças/quebras e ordens de emergência.
    4. `03_SEISAN_KANRIBAN.md`: Gantt triplo (Teórico vs Programado vs Realizado), layout anti-colisão e eixo X.
    5. `04_FERRAMENTARIA.md`: Kanban de 5 estágios, catálogo de moldes, semáforo de preventivas e tryout.
    6. `05_VISUALIZACAO_PATAN.md`: Baseline teórico de 8 dias (Solda) e 64 dias (Estamparia).
    7. `06_DASHBOARD_E_CALENDARIO.md`: KPIs de aderência e throughput, visão mensal.
    8. `07_PARAMETROS_E_USUARIOS.md`: Matriz RBAC, parâmetros de turno/almoço e cadastro de linhas.
    9. `08_API_SWAGGER_REFERENCIA.md`: Catálogo completo de endpoints REST, payloads e Swagger UI.
- **Página In-App de Suporte & Swagger Explorer (`Documentacao.tsx` em `/documentacao` e `/docs`)**:
  - Interface rica com seleção rápida de contextos, busca instantânea de endpoints, filtros por método HTTP (`GET`, `POST`, `PATCH`, `DELETE`), payloads de exemplo em JSON e links diretos para o Swagger UI nativo do FastAPI (`http://localhost:8000/docs`) e ReDoc (`http://localhost:8000/redoc`).
  - Acessível a todos os usuários autenticados via barra de navegação lateral (`Nav.tsx`) sob o grupo *Suporte & Guias*.

### Integração e Automação SAP (Rotina MB52 & Estoque)

- **Desacoplamento do Script Global**:
  - Anteriormente, o backend apontava por engano para `MAIN_SAP.bat` / `001. Auto SAP\main\main.py`, que executa 33 rotinas fabris amplas (controladoria, custos, contabilidade, sucatas) em loop contínuo, reabrindo o SAP repetidamente caso fechado.
  - O Planner Logística necessita exclusivamente da rotina de estoque da transação **MB52**.
- **Script Local Dedicado (`backend/scripts/sap/mb52.py`)**:
  - Script autônomo e direto, baseado no fluxo original `014. Planner Project Modularizado`.
  - Executa login no SAP GUI com usuário `SORIP002` (lendo as credenciais atualizadas de `\\sb2-fs\...\SECUNDARIO\pwd\sap_pd.xlsx`).
  - Acessa a transação `MB52`, seleciona estoque especial, aplica o layout `sorpcp` e executa a consulta (`F8`).
  - Exporta `estoque.xlsx` diretamente para a pasta de rede de produção:
    `\\sb2-fs\4_GESTAO_DA_QUALIDADE$\00_KPI_&_GSD\Melhoria Contínua\APPs\Automação Planner\Estoque\estoque.xlsx`.
  - Encerra de forma limpa os processos do `saplogon.exe` e `excel.exe`, finalizando a rotina em menos de 30 segundos.
- **Orquestração pelo `sap_service.py`**:
  - `resolver_comando_sap`: prioriza `backend/scripts/sap/mb52.py` como comando padrão local (ou o script da rede `014. Planner Project Modularizado\main-m\mb52.py` como fallback). Também respeita o parâmetro customizável `comando_atualizacao_sap` na tabela de parâmetros (`/parametros`).
  - Ao concluir a execução ou ao sincronizar da rede, copia o `AutomacaoPlanner.xlsx` e o `estoque.xlsx` para a pasta local `backend/data/`.

### Módulo Visualização do Patan (`/visualizacao-patan`) — Receita Mestre Teórica Lean

- **Finalidade**:
  - Exibe a receita mestre e o sequenciamento padrão estipulado no ciclo do Patan (`A` a `H`), permitindo comparar o plano mestre com a realidade fabril.
  - Endpoint: `GET /producao/patan-teorico?setor=...&linha=...&turno=...&patan=...`.
  - Para a Estamparia, baseia-se na consolidação de prensas de `Missão 1.xlsx` e na tabela de dados da revisão horária.
- **Visualização Cronológica por Prensas/Máquinas Empilhadas**:
  - Apresenta as máquinas/postos empilhados verticalmente em trilhas horizontais contínuas.
  - Blocos com largura proporcional à duração do lote em minutos, calculando horários em cascata contínua a partir do início do turno.
  - Indicadores visuais claros para itens com **Dupla Batida**, operação (`OP-10`, `OP-20`, etc.), ritmo de peças/hora e tempos de ciclo.
  - Modal de inspeção detalhada ao clicar em qualquer bloco, revelando especificação de kanban, batidas e tempos de prensa.
  - Zoom temporal horizontal e cards informativos com KPIs da receita do Patan.


## Arquitetura: Tabela A vs. Tabela B

A divisão mais importante do sistema. Duas tabelas, dois papéis bem distintos:

- **Tabela A** (`producao_staging`, modelo `ItemProducaoStaging`) — buffer mestre e catálogo de receitas. Recebe o dump do SAP
  via arquivo Excel (`AutomacaoPlanner.xlsx` para Solda e `AutomacaoPlanner_Estamparia.xlsx` para Estamparia).
  - **Acesso Compartilhado e Fallback de Usuário**: Quando um novo usuário recebe o perfil de programador, ele acessa
    automaticamente a base mestre de staging sincronizada (`get_staging_itens` e `get_pecas_criticas_by_linha`), sem
    precisar de sincronização manual duplicada. Caso o banco esteja vazio, a API executa auto-import transparente a partir do arquivo Excel.
  - **Preservação de Itens Normais como Modelo do Patan**: O Patan é uma receita/ciclo recorrente da fábrica. Ao submeter
    um lote (`POST /producao/sequencia`), **os itens normais permanecem preservados na Tabela A**, permitindo que o
    programador sequencie e envie o mesmo Patan para dias futuros ou diferentes turnos sem que a receita seja apagada.
    Apenas itens críticos resolvidos (`ids_criticos_incluidos`) são retirados da quarentena da staging.
  - Toda simulação de cálculo (cascata, ajuste de kanban) acontece **100% no cliente** via `sequenciaReducer.ts` — nada
    é gravado até o envio.

- **Tabela B** (`producao`, modelo `ItemProducao`) — o Kanban oficial, persistido, lido por
  Produção, Dashboard, Calendário e Exportação. **Tratada como imutável depois de persistida.**
  `hora_inicial`/`hora_final`/`almoco_incluso` são calculados uma vez, no momento do envio
  (`POST /producao/sequencia` → `bulk_persist`), e congelados a partir daí.
  - **Escopo por Data (`bulk_persist`)**: Ao enviar uma programação, a persistência substitui apenas as ordens
    daquela data planejada específica (`date(hora_inicial)`), preservando intactos os lotes já programados para outros
    dias (passados ou futuros).
  - A leitura da Tabela B (`GET /producao/tabela-b`), a reordenação (`PATCH /producao/reordenar`) e
  a exportação CSV (`GET /producao/exportar`) aceitam `patan` como parâmetro opcional: na tela
  **Produção**, o líder/operador acompanha e reordena os itens de uma linha inteira por turno de
  forma contínua, sem filtro de Patan (ao contrário da tela **Programação**, onde o programador
  filtra obrigatoriamente por Patan para preparar o envio do seu lote).

> **Decisão arquitetural intencional — não reverter:** reordenar itens na tela Produção
> (`PATCH /producao/reordenar` → `reordenar_persistidos` em
> `backend/app/repositories/producao_repository.py`) muda **apenas** o campo `sequencia`. Nunca
> recalcula `hora_inicial`/`hora_final`. Isso corrigiu um bug real desta sessão: a tela Produção
> antes rodava a cascata (`sequenciaReducer`) a cada carregamento, usando a data de **hoje** em
> vez da data do envio original — corrompendo o horário mesmo sem o usuário reordenar nada. A
> correção foi a tela Produção parar de rodar a cascata e passar a ler a Tabela B direto
> (`GET /producao/tabela-b`, sem recomputar nada). Um agente futuro que veja "reordenar não
> recalcula o horário" e pense que isso é uma lacuna a corrigir vai **reintroduzir o bug**. A
> cascata client-side (`sequenciaReducer.ts`) continua existindo e é usada — só que exclusivamente
> na tela **Programação** (Tabela A, pré-envio), que é onde simulação faz sentido.

`reordenar_persistidos` também tem uma proteção não-óbvia: o update de `sequencia` é feito em
**duas fases**, usando valores negativos como estágio intermediário, porque a tabela tem uma
`UniqueConstraint` em `(linha, turno, patan, posto_trabalho, sequencia)` — um swap direto de dois
itens colidiria com essa constraint no meio do `flush()`. `sequencia` negativa nunca ocorre em
nenhum outro lugar do domínio, então é um valor de estágio seguro. Se `patan` for omitido na
reordenação da Produção, todos os itens do posto daquela linha e turno são ordenados e
renumerados com segurança.

### Consequência conhecida: reenviar um lote apaga a colaboração dos itens reenviados

`bulk_persist` deleta e reinsere fisicamente cada linha não-`em_producao` do escopo a cada envio
(mesmo comportamento desde a Fase 1). Checklist/labels/comentários/anexos referenciam
`producao.id` com `ondelete="CASCADE"` (`backend/app/models/colaboracao.py`) — então reordenar e
reenviar um lote apaga o checklist/labels/comentários/anexos dos itens reenviados, porque cada um
vira uma linha física nova. Isso está documentado na própria docstring do módulo de modelos como
uma consequência aceita do desenho atual do `bulk_persist`, não corrigida "por estar fora de
escopo" de quando foi escrita. Não é considerado um bug em aberto — mas qualquer mudança em
`bulk_persist` precisa ter isso em mente.

### Escopo de operações em massa

Todo delete/update em massa no banco é escopado por `(Patan, Linha, Turno)`. Um delete sem esse
escopo pode apagar o plano de outro operador em andamento — `bulk_persist` sempre filtra por
`linha == ... AND turno == ... AND patan == ...` antes de qualquer `delete()`.

## RBAC — resumo (tabela completa em docs/ADMINISTRACAO.md)

Três papéis (`backend/app/models/user.py`, enum `Role`): `admin`, `programador`,
`usuario_comum`. Primeiro usuário registrado vira `admin` automaticamente; os demais só podem ser
criados por um `admin` autenticado (não `programador` — verificado em
`_authenticated_admin_or_none`, `backend/app/api/routes_auth.py`). Só `admin` gerencia usuários;
`admin`+`programador` enviam lotes, reordenam e gerenciam colunas extras; qualquer usuário
autenticado lê Produção/Dashboard/Calendário e interage com checklist/labels/comentários/anexos/
colunas extras de um item. Ver `backend/app/core/deps.py` (`require_role`, `get_current_user`).

## Mapa de rotas por domínio

Todas exigem autenticação (`get_current_user`) salvo `/auth/login`, `/auth/register` (primeiro
usuário) e `/health`. "Restrita" abaixo = `require_role(ADMIN, PROGRAMADOR)` ou `require_role(ADMIN)`
conforme indicado; documentação interativa completa (todo método/path/schema) sempre disponível
ao vivo em `/docs` com o backend rodando.

| Router (`backend/app/api/`) | Prefixo | Conteúdo |
|---|---|---|
| `routes_auth.py` | `/auth` | login, register, `GET /auth/me` (retorna dados e permissões dinâmicas por cargo) |
| `routes_users.py` | `/users` | CRUD de usuários — **restrita a `admin`** |
| `routes_producao.py` | `/producao` | `GET /sequencia` (staging recomputada, tela Programação); `POST /sequencia` (envio de lote com bloqueio por ferramenta em manutenção — **restrita**) |
| `routes_import.py` | `/producao` | `POST /importar-excel` (sincroniza Excel para a staging do programador — **restrita**) |
| `routes_tabela_b.py` | `/producao` | `GET /tabela-b` (leitura direta por setor e linha); `PATCH /reordenar` (**restrita**); `PATCH /itens/{id}/concluir-producao` (com peças obrigatórias); `PATCH /itens/{id}/quebra-ferramenta` (apontamento de quebra e O.S.); `DELETE /limpar-producao` (limpeza de testes — **restrita estritamente a admin**) |
| `routes_linhas.py` | `/linhas` | `GET /linhas` (filtro por setor); `POST /linhas` (cadastro com permissão `pode_gerenciar_linhas`); `DELETE /linhas/{id}` |
| `routes_exportacao.py` | `/producao` | `GET /exportar` (CSV da Tabela B filtrado por setor, com guarda anti-injeção de fórmula) |
| `routes_colunas_extras.py` | `/producao` | CRUD de colunas extras por setor (**restrito**) + mover item (qualquer usuário) |
| `routes_checklist.py`, `routes_labels.py`, `routes_comentarios.py`, `routes_anexos.py` | `/checklist`, `/labels` \| `/producao/itens/{id}/labels`, `/comentarios`, `/anexos` | Colaboração por item — qualquer usuário autenticado |
| `routes_dashboard.py` | `/dashboard` | `GET /metricas` (snapshot da Tabela B — sem série histórica, pois `bulk_persist` substitui, não acumula) |
| `routes_ferramentaria.py` | `/ferramentaria` | `GET /manutencoes`, `GET /materiais-bloqueados`, `POST /manutencoes`, `PATCH /manutencoes/{id}/status`, `GET/POST /catalogo`, `PUT/DELETE /catalogo/{id}`, `POST /catalogo/{id}/abrir-preventiva` — **restrita a `pode_gerenciar_ferramentaria`** |
| `routes_ws.py` | — | `WS /ws/producao` (tempo real) |

### Tempo real (WebSocket)

`/ws/producao` (`backend/app/core/ws_manager.py`, `backend/app/api/routes_ws.py`): a conexão é
aceita primeiro, e o **token JWT vai como primeira mensagem de texto** depois de conectar — não
na query string da URL (corrigido explicitamente nesta sessão: URLs podem parar em log de
proxy/servidor; o payload de uma mensagem, não). Token inválido/ausente → fecha com código
`4401`. Rotas que mudam a Tabela B fazem `broadcast({"tipo": "producao_atualizada", linha, turno,
patan})` depois do commit: envio de lote, reordenação, mover item para coluna extra. No frontend,
`useProducaoWebSocket` (montado uma vez na raiz do `AppRouter`) invalida as chaves de cache do
react-query `tabela-b-producao`, `dashboard-metricas`, `calendario` a cada mensagem recebida —
por isso Produção/Dashboard/Calendário se atualizam sozinhos; a tela Programação (Tabela A) não
está conectada a isso de propósito, porque staging não é afetada por esses eventos.

## Convenções de código observadas

- **Nomenclatura em português, de ponta a ponta, sem camada de tradução**: os mesmos nomes
  (`linha`, `turno`, `patan`, `posto_trabalho`, `sequencia`, `hora_inicial`, `hora_final`,
  `almoco_incluso`, `kanbans`, `qtd_por_kanban`, `tempo_por_peca_minutos`, `is_critico`) aparecem
  idênticos na coluna do banco, no modelo SQLAlchemy, no schema Pydantic, no tipo TypeScript e no
  cliente HTTP. Manter esse padrão em qualquer campo novo.
- **DDD pragmático**: `app/domain/` contém só funções puras e dataclasses — sem import de
  SQLAlchemy, FastAPI ou banco, testável isoladamente. `app/repositories/` é a única camada que
  faz query (funções soltas recebendo `db: Session` como primeiro parâmetro, não classes — ver
  `producao_repository.py`, `colaboracao_repository.py`, `dashboard_repository.py`). Rotas em
  `app/api/routes_*.py` ficam finas: validam via schema, chamam repository/domain, montam a
  resposta — regra de negócio não mora na rota.
- **Mapeamento ORM→DTO explícito**: `to_item_producao_out()` (`backend/app/schemas/producao.py`)
  centraliza a conversão `ItemProducao` → `ItemProducaoOut` para não duplicar isso em cada rota
  (era duplicado em 4 rotas antes de ser centralizado).
  Schemas de saída usam `model_config = ConfigDict(from_attributes=True)`.
- **Testes**: `pytest` no backend, dividido em `tests/unit/` (domínio puro, schemas, models) e
  `tests/integration/` (rotas e repository contra uma sessão de banco real — SQLite em memória
  nos testes, ver `tests/conftest.py`). `vitest` + Testing Library no frontend, arquivo de teste
  ao lado do arquivo testado (`Componente.test.tsx`).
- **Lint**: `ruff` no backend (`pyproject.toml`: `line-length = 100`, `target-version = "py311"`).
  `eslint` flat-config + `typescript-eslint` no frontend.
- **Arquivos grandes são divididos por responsabilidade, não por tipo técnico** — histórico
  recente disso: `routes_producao.py` (352 linhas) virou 4 arquivos por sub-domínio;
  `SequenciaBoard.tsx` foi dividido em subcomponentes + `dragEndHandler.ts` (lógica pura de
  drag-and-drop, testável sem React); `services/api.ts` virou um barrel reexportando de
  `services/api/{core,auth,users,producao,colunasExtras,colaboracao,dashboard}.ts`.

## Estado atual

### Pronto

- Sequenciamento completo: cascata, pausa de almoço, Patan, máquina de estados STATUS, fórmula de
  tempo de produção, diagnóstico de estoque.
- Fluxo Tabela A → Tabela B: staging editável/simulável no cliente, envio em lote (all-or-nothing,
  escopado), Tabela B imutável pós-persistência, reordenação sem recálculo de horário.
- Colaboração por item: checklist (com item padrão semeado automaticamente), labels, comentários,
  anexos (link, sem upload de arquivo real).
- Colunas extras estilo Microsoft Planner: CRUD, drag-and-drop real entre postos e buckets
  (bloqueando troca de posto↔posto).
- Dashboard de métricas, Calendário (timeline por turno), exportação CSV com proteção contra
  injeção de fórmula.
- Tempo real via WebSocket (Produção/Dashboard/Calendário).
- Auth JWT com RBAC de 3 papéis, bootstrap automático do primeiro admin.
- Importação do Excel (`AutomacaoPlanner.xlsx`) com staging isolada por programador (`usuario_id`) e suporte a `material`.
- Seleção de Linha padronizada via `<select>` (`LINHA 1`, `LINHA 2`, `LINHA 3`) em todas as telas; tela Produção simplificada sem filtro de Patan (acompanhamento contínuo da linha inteira por turno).
- Gestão de itens críticos isolada no Drawer de Críticos da tela de Programação: itens críticos não poluem o board Kanban abaixo dos postos na carga inicial; entram no lote apenas por inclusão explícita.
- Drawer de Críticos com filtro por Posto de Trabalho, busca rápida e ordenação ("Order By") inteligente baseada no ciclo regular de 8 dias do Patan da solda (`A` a `H`) e no deficit de estoque (MB52 vs Mínimo). Peças com maior período até a próxima produção regular (ex: Patan anterior recém-passado = 7 dias) recebem prioridade máxima e badges semafóricos (vermelho/amarelo/verde).
- Exibição de Estoque Máximo (`kanban_max`) e Mínimo de Segurança (`kanban_min`) nos cards da tela de Programação; e ocultação completa de métricas de estoque na tela de Produção (`exibirEstoque={false}`).
- Gestão dinâmica de Cargos & Permissões (RBAC Dinâmico): tela de Parâmetros (`/parametros`) permitindo ao Administrador criar novos cargos customizados (ex: supervisor, líder de linha, programador de ferramentaria) com matriz de permissões granulares (`pode_programar`, `pode_iniciar_producao`, `pode_reordenar_producao`, `pode_mover_colunas`, `pode_gerenciar_colunas`, `pode_ver_historico`, `pode_gerenciar_usuarios`, `pode_importar_sap`, `pode_configurar_parametros`, `pode_gerenciar_ferramentaria`).
- Parâmetros do Sistema: tela de parametrização permitindo configurar bloqueio de drag-and-drop na tela de Produção (`bloquear_arraste_producao`) e cor de destaque do card em produção (`cor_destaque_producao`: esmeralda/azul).
- Controle de Produção no Kanban (Card de Produção): fluxo formal conectado via endpoints `PATCH /producao/itens/{id}/iniciar-producao`, `pausar-producao`, `concluir-producao` e `quebra-ferramenta`. Destaque visual pulsante no card em produção.
- Regra de Posição 0 (Topo da Fila): apenas o primeiro item de cada posto de trabalho exibe o botão `▶ Iniciar Produção`; itens abaixo só podem ser iniciados se o operador arrastá-los para o topo da coluna.
- Apontamento Obrigatório de Produção: modal de conclusão exige preenchimento de peças produzidas ($> 0$), gerando comentário e histórico de auditoria com envio automático para "Concluídas".
- Apontamento de Quebra de Máquina / Ferramenta: modal exige peças produzidas ($\ge 0$) e motivo da quebra; move o item para a coluna "Quebra de Máquina" e abre O.S. na Ferramentaria com status `aguardando_manutencao`.
- Módulo da Ferramentaria (`/ferramentaria`): quadro Kanban operacional com 5 colunas (`Aguardando Manutenção - Corretiva`, `Aguardando Manutenção - Preventiva`, `Em Manutenção`, `Tryout / Testes`, `Liberadas (OK / Disponível)`), gestão de status, laudos, Catálogo de Ferramentas & Preventivas com cálculo de periodicidade, alerta semafórico e abertura de preventiva em 1 clique.
- Programação por Setor (`/programacao`): seletor de Setor (`Produção — Solda` e `Produção — Estamparia`) alinhado com Linha, Turno e Patan, respeitando as permissões do usuário (`pode_ver_solda` e `pode_ver_estamparia`). Consultas de staging, inclusão e envio são 100% isoladas por setor.
- Importação Excel por Setor: sincronização independente (`POST /producao/importar-excel?setor=...`). Solda sincroniza a partir de `backend/data/AutomacaoPlanner.xlsx`; Estamparia a partir de `backend/data/AutomacaoPlanner_Estamparia.xlsx` (com fallback inicial para AutomacaoPlanner se ainda não houver arquivo tratado). Cada sincronização substitui exclusivamente a staging do setor correspondente do programador.
- Inclusão de Itens Críticos na Série de Produção: ao incluir um item crítico no posto (via Drawer de Críticos), ele passa a integrar formalmente a fila de produção do posto como o último item da série (ex: se o posto tinha 5 itens, ele vira o 6º item). Participa da cascata de cálculo de horário (`hora_inicial = item_anterior.hora_final`), recebendo seu tempo final e exibindo horário e `Seq #6` com badge `🔴 CRÍTICO`. Pode ser retirado da fila a qualquer momento pelo card (`✕ Retirar da fila`) ou pelo drawer. Ao enviar o lote, é persistido na Tabela B com sequência positiva e horários congelados, sendo automaticamente removido da staging de críticos.
- Separação e Coexistência de Setores (Solda vs Estamparia): telas dedicadas `Produção — Solda` (`/producao/solda`) e `Produção — Estamparia` (`/producao/estamparia`), com isolamento por `setor`, permissões dinâmicas de acesso e coluna integrada de Tryout de Matrizes na Estamparia.
- Seisan Kanriban Unificado: barra de ferramentas consolidada em uma única faixa integrada (eliminando poluição visual de múltiplas linhas de filtros), agrupando filtros (Linha, Turno, Data, Busca), pills de status do Realizado com contadores ao vivo, toggles de faixas (1 Teórico, 2 Programado, 3 Realizado), altura/densidade vertical e régua de zoom temporal (9 granularidades de 6h até 1min com suporte a atalho Ctrl+Wheel). A primeira coluna lateral de identificação das faixas possui fixação `sticky left-0 z-40` com fundo 100% sólido opaco (`bg-white dark:bg-slate-900`), garantindo que a linha dinâmica do marcador "AGORA" (`z-20`) e os cards temporais deslizem estritamente por baixo dela durante o scroll horizontal, desaparecendo naturalmente sem vazar por transparência.
- Programação Segregada por Setor (`/programacao/solda` e `/programacao/estamparia`): isolamento visual e de acesso para programadores de Solda e Estamparia, com navegação em submenu no `Nav.tsx`, sincronização de `?linha=...` via URL, checagem defensiva de permissões granulares (`pode_ver_solda` e `pode_ver_estamparia`) e redirecionamento dinâmico na rota base `/programacao`.
- Enriquecimento dos Parâmetros Operacionais Lean TPS (`/parametros`): cadastro e persistência de parâmetros avançados (`hora_inicio_turno_1`, `hora_inicio_turno_2`, `hora_inicio_turno_3`, `duracao_refeicao_minutos`, `tolerancia_atraso_seisan_min`, `bloquear_envio_ferramenta_manutencao`, `exigir_motivo_quebra`, `dias_alerta_preventiva`, `tempo_padrao_setup_minutos`, `limite_max_kanbans_emergencia`, `margem_seguranca_estoque_pct`, `intervalo_refresh_automatico_seg`, `exibir_segundos_cronometro`, `notificar_parada_maquina_lideranca`, `tolerancia_tryout_horas`, `habilitar_sons_apontamento`) organizados em 6 painéis operacionais temáticos e botão de restauração rápida para os padrões Lean TPS de fábrica.
- Identidade Visual & Branding Gestamp: integração do logotipo oficial da Gestamp (`GestampLogo.tsx`) na barra lateral de navegação (expandida e recolhida), cabeçalho institucional, Favicon corporativo nos formatos SVG, ICO e PNG no `index.html`, com suporte completo e transição fluida para Dark Mode (`dark:brightness-0 dark:invert`).
- Harmonização do Layout e Menu de Navegação: eliminação da redundância de botões entre a Sidebar e o Header (controle de alternância unificado exclusivamente no Header com `PanelLeft`), e abertura da aplicação com submenus da sidebar recolhidos por padrão (`defaultExpanded: false`), proporcionando navegação minimalista e limpa.
- Dashboard Executivo Estilo Power BI (`/dashboard`): painel analítico com filtros dinâmicos / slicers no topo (Setor com pills Solda/Estamparia, Linha, Turno, Patan e auto-refresh de 30s), KPIs executivos industriais (Volume de Peças Produzidas vs Planejadas com barra de aderência %, Lotes Ativos/Concluídos/Fila/Quebras, OEE Operacional Estimado Lean TPS e Conformidade de Checklist), gráfico interativo de throughput e capacidade por posto de trabalho com busca instantânea, gráfico Donut SVG de distribuição percentual de lotes e matriz comparativa de carga por linha e turno.
- Experiência Operacional Exclusiva para Operadores (`operador_solda`, `operador_estamparia`, `usuario_comum`):
  - Resolução dos papéis de operadores (`Role.OPERADOR_SOLDA`, `Role.OPERADOR_ESTAMPARIA` e compatibilidade com `Role.USUARIO_COMUM` em `backend/app/core/deps.py`, `backend/app/models/user.py` e `frontend/src/routes/RequireRole.tsx`), eliminando loops de redirecionamento ou bloqueios de tela na produção.
  - Limpeza total dos menus para perfis operacionais: Dashboard, Calendário, Seisan Kanriban, Visualização do Patan, Ferramentaria e Documentação ficam 100% ocultos em `Nav.tsx` e `BottomNav.tsx`, e suas rotas são restritas a cargos de gestão em `AppRouter.tsx`. Operadores visualizam única e exclusivamente o módulo 'Produção' (com submenu Solda e/ou Estamparia conforme `pode_ver_solda` e `pode_ver_estamparia`).
  - Redirecionamento inteligente de setor: na rota raiz `/` ou em `/producao`, se o operador possuir acesso exclusivo à Estamparia (`pode_ver_estamparia && !pode_ver_solda`), o sistema redireciona instantaneamente para `/producao/estamparia` (e vice-versa para Solda), eliminando telas em branco e abrindo direto o posto de trabalho.
  - Chão de fábrica focado: tela em modo somente leitura de sequenciamento (`isOperador(role)`), sem alertas analíticos de estoque (`exibirEstoque = false`), mantendo botões de apontamento e operação rápida.
- Calendário Mensal com Resumo Diário (`/calendario`): visualização completa em grade mensal (`os dias em quadradinho`), com navegação por mês/ano e atalho "Hoje", contadores diários de lotes e peças, pills semafóricos de status por dia (concluídos, ao vivo, quebras, fila), e painel interativo de **Resumo Operacional do Dia** com tabela detalhada de ordens, horários de ciclo, postos e apontamentos com busca rápida por peça.
- Dois Modos de Programação de Lote no Patan (`/programacao`): seletor de critério de lote integrado no topo do board permitindo alternar instantaneamente entre **🎯 Lote Fixo do Patan** (receita padrão imutável do ciclo, dividindo a demanda de ciclo pela embalagem da peça) e **📊 Estoque Máximo** (dimensionamento pelo teto de reposição do Carga Máquina, `kanban_max`). Válido de forma unificada tanto para **Solda** quanto para **Estamparia**, recalculando a cascata sequencial automaticamente.
- Inserção Manual de Cards na Programação (Tabela A): botão `+ Inserir Card` permitindo adicionar peças manuais ou lotes avulsos à fila de programação antes do envio, com validação de posto, kanbans, embalagem e tempo de ciclo.
- Atualização e Integração SAP no Backend (`sap_service.py`): serviço robusto de sincronização direta do SAP no PC do servidor backend, com resolução de comando via banco (`comando_atualizacao_sap` em `parametros_sistema`), arquivo de configuração local (`MAIN_SAP.bat`), ou fallback em rede corporativa (`\\sb2-fs\...\main.py`).
- Cockpit Unificado de Programação (Eliminação de Redundâncias Visuais): remoção de títulos, badges e textos repetidos na tela de Programação (`ProgramacaoPatan.tsx`). O topo consolida todos os controles em um cockpit unificado e elegante com filtros (Setor com pills Solda/Estamparia, Linha, Turno, Patan e Modo de Dimensionamento do Lote), ações da fila (`Montar Padrão`, `+ Inserir Card`, `Atualizar SAP`, `Sincronizar Excel`, `Enviar Produção`) e alternadores de visualização em um único nível sem desperdício de espaço vertical.
- Alternador de Visualização: Modo Cards vs Seisan Kanriban Timeline (`ProgramacaoTimelineView`): suporte à alternância entre **🗂️ Modo Cards (Kanban)** e **⏱️ Seisan Kanriban (Linha do Tempo por Posto/Prensa)** na tela de Programação. No modo Timeline, cada prensa/posto é renderizado com sua trilha horizontal cronológica alinhada com a régua horária Lean TPS, pausas de refeição hachuradas e zoom temporal, **preservando 100% da interatividade**:
  - Reordenação completa e troca de lugar entre cards diretamente na timeline, tanto via arrastar e soltar (HTML5 Drag & Drop) quanto através de botões rápidos de avanço e recuo de sequência (`◀` e `▶`), recalculando a cascata sequencial (`REORDENAR`) em tempo real.
  - Ajustes de kanban (`+` e `-`) e remoção da fila (`✕`) com recálculo automático da cascata client-side (`sequenciaReducer`).
- Posicionamento Unificado do Botão `✕` no Canto Superior Direito e Eliminação de Sublayer:
  - O botão de remoção (`✕`, `btn-remover-card`) foi padronizado no canto superior direito em **ambos os modos** (compacto e detalhado/expandido), alinhado ao lado dos badges e botão de recolher/expandir (`shrink-0 ml-auto`).
  - Remoção do botão de rodapé redundante que criava uma barra/sublayer visual no fim do card expandido.
  - Isolamento de camadas (`relative z-20 isolate` no card, `relative z-10` na coluna e SVG de conexões em `z-0`), impedindo qualquer sobreposição ou conflito de stacking context.
- Validação e Diagnóstico do Excel de Automação Planner (`AutomacaoPlanner_Estamparia.xlsx` e fontes `01`, `02`, `03`, `04`):
  - **Linha 3 (Tandem Reeducando)**: 43 materiais rodam em tandem contínuo por 2, 3, 4 ou 5 prensas (`PR-110`, `PR-109`, `PR-99`, `PR-98`, `PR-97`), enquanto exatamente **8 materiais** aparecem em um só posto (`PR-97` com Op 0025/0020 e `PR-98` com Op 0020). Essa divisão foi validada diretamente na planilha oficial de engenharia `03- PATAN ESTAMPARIA - LINHA 3`, confirmando que essas 8 peças são estampagens avulsas / suportes que não passam pelas outras estações.
  - **Linhas 1 e 4 (Prensas Progressivas Independentes)**: operam sob matrizes progressivas com bobina direta em cada prensa (`PR-92`, `PR-93`, `PR-82`, `PR-113` na Linha 1 e `PR-114`, `PR-115`, `PR-116` na Linha 4), onde cada prensa processa seu próprio portfólio de peças concluídas na Op 0020 em paralelo.
- Escala Temporal Unificada & Layout sem Sobreposição nos Timelines (`SeisanZoomControl` e `calcularLayoutFaixaSemSobreposicao`):
  - Componente de zoom TPS extraído e reutilizado de forma idêntica em `SeisanKanibanToolbar`, `ProducaoTimelineView` e `ProgramacaoTimelineView`.
  - Suporte a 9 granularidades (de Macro 6h a Micro 1min), com sincronização perfeita entre a régua de rodapé (`SeisanTimeRuler`) e as linhas de grade verticais das trilhas.
  - O algoritmo `calcularLayoutFaixaSemSobreposicao` elimina qualquer sobreposição visual entre lotes consecutivos na linha do tempo, garantindo posicionamento estritamente lado a lado com espaçamento nítido (`gapPx: 2`) e aproveitamento de 100% da largura da tela (`containerLargura` dinâmico).
- 170 testes no backend (unit + integration), 88 testes no frontend; 100% aprovados, lint e build limpos dos dois lados.

### Padrão de Nomes e Vocabulário Operacional (Reformulação Oficial)

O sistema adota padronização estrita em duas camadas complementares:

#### 1. Padrão de Código (Arquitetura & Desenvolvimento)
- **Backend Python**: Nomenclatura em `snake_case` estrito para todas as funções, métodos, atributos de modelos e endpoints (`sincronizar_dados_sap`, `inserir_card_producao`, `calcular_cascata`, `posto_trabalho`).
- **Frontend TypeScript/React**: Nomenclatura em `camelCase` estrito para variáveis, estados do React, props e funções internas (`handleAtualizarSap`, `modalInserirCardAberto`, `duracaoEstimadaMinutos`, `codigoMaterial`).
- **Componentes e Tipos**: `PascalCase` para componentes React (`SequenciaBoard`, `InserirCardModal`, `ProducaoTabelaView`) e interfaces/tipos (`ItemProducao`, `ColunaExtra`).
- **Classes CSS / Estilização**: Apenas classes utilitárias nativas do Tailwind CSS, sem criar classes híbridas ou nomes arbitrários (evitar termos genéricos como `flex-board-green`).
- **Contrato de Dados de Domínio**: Colunas do banco, modelos SQLAlchemy, schemas Pydantic e interfaces TypeScript mantêm nomes idênticos em português sem camada de tradução (`setor`, `linha`, `turno`, `patan`, `posto_trabalho`, `sequencia`, `hora_inicial`, `hora_final`, `almoco_incluso`, `kanbans`, `qtd_por_kanban`, `tempo_por_peca_minutos`, `is_critico`).

#### 2. Padrão Visual e de Negócio (Interfaces & Fábrica)
- **Títulos e Subtítulos de Rotas (`Header.tsx` e `Nav.tsx`)**:
  - `⚡ Produção — Solda` / `🏭 Produção — Estamparia`
  - `⚡ Programação — Solda` / `🏭 Programação — Estamparia` (sem abreviações incompletas como `Prog.`)
  - `Seisan Kanriban` (com sub-badges `LEAN TPS • GANTT TRIPLO` e `生産管理板`)
  - `Ferramentaria & Preventivas`
  - `Dashboard Executivo`
  - `Calendário Operacional` (com acento gráfico)
  - `Gestão de Usuários`
  - `Parâmetros & Permissões`
  - `Histórico & Auditoria`
- **Ações de Chão de Fábrica Padronizadas**:
  - `+ Ordem de Emergência` (substituindo o termo informal `Inserir Card`)
  - `▶ Iniciar Produção` (estritamente no topo da fila / índice 0)
  - `✓ Concluir` (com modal obrigatório de peças apontadas $> 0$)
  - `⚠️ Quebra / Avaria` (com peças apontadas e abertura automática de O.S. na Ferramentaria)
  - `⏸ Pausar` (exclusivo para Administrador)
  - `Montar Padrão` / `Atualizar SAP` / `Sincronizar Excel`
- **Rótulos e Badges de Turno**: `1º Turno`, `2º Turno`, `3º Turno` e `Todos os Turnos`.

### Débito técnico conhecido / próximos passos

1. **Sem script de seed oficial.** Dados de teste foram inseridos manualmente via sessão
   SQLAlchemy ad-hoc quando necessário (procedimento documentado em
   `docs/ADMINISTRACAO.md#popular-dados-de-teste-manualmente`).
2. **Revisão formal de segurança/pentest ainda não rodou.** Decisão consciente do dono do
   produto — sessões de desenvolvimento até agora focaram 100% em construção de features; a
   revisão formal fica para uma gate futura e separada, disparada quando o dono do produto
   decidir. Não é um esquecimento.
3. **Integração real com SAP é automação desktop, não API.** A implementação original/legada
   (win32com contra a GUI do SAP rodando) está em
   `requisitosBases/014. Planner Project Modularizado/` (`main-m/`, `src/AutoSap/`, etc.) — **é
   material de referência para o futuro, não código morto para apagar.** Esse diretório tem seu
   próprio histórico git (`github.com/KaikeFonseca/G-PlannerProjects`) e está **excluído deste
   repositório via `.gitignore`** — ele existe no disco local desta sessão, mas não vem junto num
   clone novo deste repositório. Ainda não há nenhuma integração entre esses scripts e o backend
   web atual.
5. **Sem pipeline de CI/CD.** Nenhum GitHub Actions, nenhum deploy automatizado configurado —
   tudo rodado localmente até agora.

## Changelog resumido (por fase)

Histórico completo em `git log`. Specs e planos de implementação de cada fase estão em
`docs/superpowers/{specs,plans}/`.

- **Fase 1 — Núcleo de sequenciamento**: scaffold do backend (FastAPI) e frontend (Vite+React+
  TS); enums de domínio (Patan, PlanItemStatus/RequestStatus); cascata + pausa de almoço +
  fórmula de tempo de produção; diagnóstico de estoque; auth JWT com RBAC; repository/rotas de
  produção (staging + envio em lote); board Kanban com drag-and-drop; telas de login, registro,
  gerenciamento de usuários, programação e produção (versão inicial).
- **Fase 2 — Colaboração + redesign**: checklist/labels/comentários/anexos por item (com FK
  `ondelete=CASCADE` para `producao.id`); checklist padrão semeado na criação do item; redesign
  de todas as telas com Tailwind CSS; painel `ItemDetalhe`.
- **Fase 3.1 — Dashboard de métricas**: `GET /dashboard/metricas` (snapshot: total de itens, %
  críticos, itens travados, taxa de conclusão de checklist, throughput por posto, resumo por
  linha/turno).
- **Fase 3.2 — Calendário**: `GET /producao/tabela-b` (leitura direta da Tabela B) + timeline do
  dia por turno; corrigiu de quebra a tela Produção, que até então lia a staging recomputada em
  vez da Tabela B real.
- **Fase 3.3 — Exportação**: `GET /producao/exportar` (CSV da Tabela B) com proteção contra
  CSV-formula-injection (CWE-1236).
- **Fase 3.5a — Colunas extras**: modelo `ColunaExtra` + CRUD (admin/programador); board com
  colunas extras como buckets reais ao lado dos postos, drag-and-drop posto↔bucket e
  bucket↔bucket (bloqueando posto↔posto).
- **Fase 3.5c — Tempo real**: WebSocket `/ws/producao` (token na primeira mensagem, não na URL,
  por segurança); broadcast em envio/reordenação/movimentação; hook de invalidação de cache no
  frontend.
- **Refatorações de tamanho de arquivo** (sem mudança de comportamento, verificadas por suite de
  testes completa antes/depois): `routes_producao.py` dividido em 4 routers por sub-domínio;
  `SequenciaBoard.tsx` dividido em subcomponentes + `dragEndHandler.ts`; `services/api.ts` virou
  barrel por domínio.
- **Lote final de correções** (encontradas em teste manual do usuário): staging não zerava depois
  do envio; item crítico de outro turno/patan quebrava o envio inteiro com 422 silencioso; faltava
  ajuste de kanban na tela Programação; Produção recalculava a cascata a cada carregamento usando
  a data de hoje em vez da data do envio original (corrompendo o horário mesmo sem reordenar —
  ver o callout de arquitetura acima); bug de constraint UNIQUE ao reordenar (resolvido com update
  em duas fases via `sequencia` negativa); `.gitignore` endurecido para não versionar
  `.venv/`/`node_modules/`/bytecode/o repositório git legado aninhado.

## Pastas auxiliares — o que ignorar, o que ler

- **`.claude/`** — configuração específica do Claude Code (hooks, agentes, regras, memória de
  sessão) usada durante o desenvolvimento assistido por IA deste projeto. Está versionada no
  repositório, mas **não afeta o funcionamento da aplicação** e não é necessária para continuar o
  projeto com nenhuma outra ferramenta. Seguro ignorar inteiramente.
- **`.superpowers/`** (diretório oculto na raiz) — estado de trabalho de um plugin do Claude Code
  usado durante a implementação (ledger de tarefas). **Não está versionado no git** (não vem num
  clone novo) — nada a ler aqui.
- **`docs/superpowers/`** — este, sim, está versionado: specs de design e planos de implementação
  de cada fase, em Markdown puro, sem dependência de ferramenta nenhuma. Boa leitura complementar
  para entender o raciocínio por trás de cada fase, mas não é necessária para rodar o projeto.
- **`docs/harness/`** — documentação sobre o próprio harness do Claude Code usado neste projeto.
  Mesma observação do `.claude/`: irrelevante para continuar o projeto com outra ferramenta.
- **`requisitosBases/`** — requisitos de negócio originais (`requisitos.md` e outros `.md`/`.txt`
  na raiz da pasta, esses sim versionados) mais o subdiretório
  `014. Planner Project Modularizado/`, que é a automação SAP legada com histórico git próprio,
  **excluído deste repositório via `.gitignore`** (não vem num clone novo — veja o item 4 do
  débito técnico acima). Trate `requisitos.md` como contexto histórico do "porquê", não como
  especificação atual — várias regras evoluíram desde então (RBAC, colaboração, dashboard,
  calendário, tempo real, colunas extras não existiam no documento original) e pelo menos um
  detalhe dele está confirmado errado (Patan — ver acima).

## Containerização Docker e Deploy em Servidor Corporativo

O sistema está 100% containerizado e pronto para migração e execução autônoma em qualquer servidor Windows ou Linux:
1. **Arquitetura Multi-Container (`docker-compose.yml`)**:
   - `postgres:16-alpine`: PostgreSQL na porta `5432` com volume persistente `postgres_data` e inicialização pré-populada via `docker/initdb/01_init.sql` (contendo todas as tabelas, usuários, parâmetros e os 56 patans com 8.300+ registros de staging).
   - `backend`: FastAPI Python 3.12-slim na porta `8000`, executando migrações automáticas do Alembic (`alembic upgrade head`) e Uvicorn.
   - `frontend`: Build multi-stage (Node 20 Alpine -> Nginx Alpine) servindo nas portas `80` e `5173`, com proxy reverso configurado para `/api/`, `/ws/` e Swagger UI.
2. **Scripts de 1 Clique**:
   - `iniciar_servidor.bat` / `iniciar_servidor.sh`: Inicia todos os serviços via Docker Compose em background e exibe os links e IP da máquina na rede da empresa.
   - `iniciar_local_sem_docker.bat`: Inicia o Backend e Frontend nativamente no Windows sem precisar de Docker, conectando ao PostgreSQL local na máquina.
   - `parar_servidor.bat` / `parar_servidor.sh`: Finaliza os containers graciosamente preservando todos os dados.
   - `exportar_imagens_docker.bat` / `exportar_imagens.sh`: Salva o pacote completo de imagens em `planner_imagens.tar` para instalação offline em servidores sem internet.
   - `importar_imagens_docker.bat` / `importar_imagens.sh`: Carrega o pacote `planner_imagens.tar` no Docker do servidor de destino.
3. **Guia Detalhado de Operação**:
   - Documentado com passo a passo em [`docs/GUIA_DEPLOY_SERVIDOR.md`](docs/GUIA_DEPLOY_SERVIDOR.md).

## Configurador do Modelo de Resumo do Lote (Anotações do Card)

Permite aos programadores e administradores configurar detalhadamente a estrutura, ordem e conteúdo gerados pelo botão **"✨ Preencher Resumo do Lote"** no modal de detalhes do card (`ItemDetalhe.tsx`):
1. **Configuração Setorial Independente**:
   - **Solda (`template_resumo_solda`)**: template focado em componentes de montagem (`[EST]`, `[VTOV]`, `[MP]`), materiais, tempos de produção, total de caixas e postos/máquinas ponteadeiras (`PONTE XX`).
   - **Estamparia (`template_resumo_estamparia`)**: template customizado para prensas (`PR-XX`), com paletização de caixas por palete (`XP (Y cx)`), matéria-prima com peso em KG e ferramenta de estampagem (`FERR. - {material}`).
2. **Interface Visual em Parâmetros (`/parametros`)**:
   - Abas setoriais interativas (`⚡ Solda` e `🏭 Estamparia`).
   - Checkboxes para ativar ou desativar qualquer bloco individualmente.
   - Botões de reordenação direta (`↑` e `↓`) para determinar a sequência exata de cada bloco no texto final.
   - Botão para adicionar blocos ausentes e botão para restaurar o padrão de fábrica do setor.
   - **Painel de Preview ao Vivo**: simula um card com dados reais daquele setor e atualiza instantaneamente o texto pré-visualizado em fonte mono a cada mudança na configuração.
3. **Módulo Utilitário Puro (`frontend/src/utils/resumoTemplate.ts`)**:
   - Funções puras e tipadas: `gerarTextoResumoLote(item, configBlocos)` e `parseTemplateConfig(jsonStr, setor)`.
   - Cobertura completa de testes unitários em `resumoTemplate.test.ts`.

## Gestão de Perfil, Troca de Senhas e Redefinição Administrativa (`/perfil`)

Permite a todos os operadores, programadores e administradores gerenciar suas próprias credenciais com segurança, além de fornecer ao administrador ferramentas de redefinição de senhas em lote:
1. **Acesso Universal a Todos os Usuários Autenticados (`ALL_AUTHENTICATED_ROLES`)**:
   - Tela `/perfil` liberada para qualquer usuário logado independentemente do cargo (`admin`, `programador`, `programador_ferramentaria`, `operador_solda`, `operador_estamparia`, `usuario_comum`).
   - Links diretos adicionados no rodapé da barra lateral (`Nav.tsx`), no cabeçalho superior (`Header.tsx`), no menu de navegação e na barra móvel (`BottomNav.tsx`).
2. **Alteração de Senha Própria com Validação de Senha Atual**:
   - Para trocar a própria senha, é **obrigatório digitar a senha atual** (`senha_atual`), além da nova senha e confirmação.
   - Validações: verificação criptográfica da senha atual (`verify_password`), mínimo de 4 caracteres, nova senha diferente da atual e confirmação exata.
   - Endpoints backend: `POST /auth/trocar-senha` e `PATCH /auth/trocar-senha` (`routes_auth.py`).
   - Auditoria: toda troca gera log de auditoria automático (`acao="troca_senha_propria"`).
3. **Painel de Redefinição Administrativa de Senhas (Admin Only)**:
   - **Redefinição em Massa com Senha Padrão Customizável**:
     - O administrador pode definir qualquer senha padrão (ex: `Gestamp@2026`) e aplicá-la em 1 clique a todos os demais usuários cadastrados.
     - Salvaguarda: a conta do próprio administrador executante é excluída (`current_user.id`), garantindo que ele não perca o acesso.
     - Endpoint backend: `POST /users/reset-senhas-em-massa` (`ResetarSenhasEmMassa`, `routes_users.py`).
     - Auditoria: registra `acao="admin_reset_senhas_em_massa"` contendo o número de usuários redefinidos.
   - **Redefinição Individual por Usuário**:
     - Modal direto permitindo ao administrador redefinir a senha de um operador ou programador específico sem necessidade de saber a senha antiga.
     - Endpoints backend: `POST /users/{user_id}/reset-password` e `PATCH /users/{user_id}/senha` (`ResetarSenhaUsuario`, `routes_users.py`).
     - Disponível tanto na aba de administração de `/perfil` quanto na tela de Gestão de Usuários (`/usuarios`).
     - Auditoria: registra `acao="admin_reset_senha_usuario"` com o ID e nome do usuário afetado.

