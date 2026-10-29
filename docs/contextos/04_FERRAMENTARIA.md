# Contexto 04 — Tela Ferramentaria & Preventivas (`/ferramentaria`)

## 1. Objetivo da Tela
A tela de **Ferramentaria & Preventivas** (`/ferramentaria`) gerencia a integridade das matrizes, moldes e ferramentas de estampagem/solda.
Ela integra diretamente a manutenção corretiva e preventiva com o planejamento de produção (Patan).

---

## 2. O Kanban Operacional da Ferramentaria (5 Estágios)

1. 🔴 **Aguardando Manutenção (Corretiva)** (`aguardando_manutencao`):
   - Criada automaticamente quando o operador clica em `⚠️ Quebra` na tela de Produção, ou aberta manualmente.
2. 🟠 **Aguardando Manutenção (Preventiva)** (`aguardando_preventiva`):
   - Aberta via 1 clique no Catálogo de Ferramentas quando o semáforo de preventiva atinge o prazo.
3. 🟡 **Em Manutenção** (`em_manutencao`):
   - Ordem puxada para a bancada pelo ferramenteiro para execução dos reparos.
4. 🔵 **Tryout / Testes** (`tryout`):
   - Ferramenta enviada para testes práticos em prensa antes de ser liberada.
   - **Na Estamparia**: Aparece automaticamente na coluna especial "Tryout" da tela de Produção.
5. 🟢 **Liberadas (OK / Disponível)** (`disponivel`):
   - Ferramenta inspecionada, liberada e pronta para rodar na produção.
   - Atualiza automaticamente a data de última manutenção no Catálogo e desbloqueia a programação do Patan.

---

## 3. Catálogo de Ferramentas & Semáforo de Preventivas

Localização: tabela `ferramentaria_catalogo` (modelo `FerramentaCatalogo`).

- **Cálculo da Próxima Preventiva**:
  $$\text{data\_proxima\_preventiva} = \text{data\_ultima\_manutencao} + \text{periodicidade\_dias}$$
- **Indicadores Visuais (Semáforo)**:
  - 🔴 **Vencida**: Dias restantes $\le 0$. Abertura de preventiva urgente recomendada.
  - 🟡 **Próxima**: Dias restantes entre $1$ e $7$.
  - 🟢 **Em dia**: Mais de $7$ dias para a próxima preventiva.
- **Botão "Abrir Preventiva"**:
  - Endpoint: `POST /ferramentaria/catalogo/{id}/abrir-preventiva`.
  - Gera a O.S. no Kanban com status `aguardando_preventiva` e bloqueia o material na Programação.

---

## 4. Regra de Bloqueio da Programação (Fail-Safe)

- Enquanto uma ferramenta estiver em qualquer status diferente de `disponivel`, o sistema protege a fábrica:
  1. Na tela de Programação, o card exibe o aviso: `⛔ Ferramenta em Manutenção`.
  2. O envio do lote é rejeitado com `HTTP 400`: *"Existem ferramentas com manutenção pendente na Ferramentaria"*.
  3. Evita que o PCP programe lotes com matrizes danificadas ou indisponíveis.
