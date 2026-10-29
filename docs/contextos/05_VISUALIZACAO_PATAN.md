# Contexto 05 — Tela Visualização do Patan (`/visualizacao-patan`)

## 1. Objetivo da Tela
A tela de **Visualização do Patan** (`/visualizacao-patan`) é a fonte canônica da receita Lean (plano mestre / baseline) dos setores fabris.
Ela exibe o sequenciamento teórico puro de peças, kanbans e tempos de ciclo sem influência de alterações da Tabela B ou estoque.

---

## 2. Diferenças entre os Ciclos Setoriais

### Setor Solda (`solda`)
- **Ciclo Padrão**: 8 dias de produção com letras únicas de `A` a `H`.
- **Rotatividade**: Cada Patan consome 1 dia de operação padrão.
- **Lista Oficial**: `['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']`.

### Setor Estamparia (`estamparia`)
- **Ciclo Completo**: 64 dias de produção, cobrindo 56 patans oficiais com sub-patans numéricos.
- **Lista Oficial**:
  `['A', 'B', 'C', 'C1', 'C2', 'C3', 'C4', 'D', 'D1', 'D2', 'E', 'E1', 'E2', 'E3', 'E4', 'F', 'F1', 'F2', 'F3', 'F4', 'G', 'G1', 'G2', 'H', 'H1', 'H2', 'H3', 'H4', 'I', 'J', 'J1', 'J2', 'K', 'K1', 'K2', 'K3', 'K4', 'L', 'L1', 'L2', 'L3', 'L4', 'M', 'M1', 'M2', 'N', 'N1', 'N2', 'O', 'O1', 'O2', 'O3', 'O4', 'P', 'P1', 'P2']`.
- **PatanStr**: Objeto tipado no backend (`backend/app/domain/patan.py`) com persistência em `String(10)` e propriedade `.value`, garantindo paridade completa entre strings simples e código legado.

---

## 3. Utilidade Operacional e Suporte

1. **Validação de Receita Mestre**:
   - Quando um operador ou gestor questionar *"Quantas peças deveriam rodar neste dia?"*, esta tela fornece o baseline padrão da Engenharia de Processos.
2. **Auditoria de Missão / Importação**:
   - Permite conferir se a planilha de importação (`AutomacaoPlanner.xlsx` ou matrizes da Estamparia) foi carregada com os tempos corretos de ciclo.
