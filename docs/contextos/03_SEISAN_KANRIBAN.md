# Contexto 03 — Tela Seisan Kanriban (`/seisan-kanriban`)

## 1. Objetivo da Tela
O **Seisan Kanriban** (生産管理板 — Quadro de Controle da Produção) é a ferramenta de controle visual Lean TPS mais avançada do sistema.
Ele renderiza um **Gantt Triplo por posto de trabalho**, alinhando lado a lado:
1. O que deveria ser produzido segundo o ciclo (Teórico).
2. O que foi planejado com os ajustes do PCP (Programado).
3. O que o chão de fábrica efetivamente produziu com tempos reais (Realizado).

---

## 2. As Três Faixas do Gantt Triplo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Posto: PR-110                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Faixa 1 (Teórico):    [ Lote A (Padrão) ]  [ Lote B (Padrão) ] [Almoço]     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Faixa 2 (Programado): [ Lote A (Ajustado) ] [ Lote B ]         [Almoço]     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Faixa 3 (Realizado):  [ Concluído (OK) ] [ Ao Vivo ▶ ] [ GAP Quebra ⚠️ ]     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Eixo X (Régua):       06:00    07:00    08:00    09:00    10:00   11:00     │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Faixa 1 — Patan Teórico (Baseline Lean)**:
  - Base imutável do ciclo de produção.
  - Exibe a receita mestre de materiais e durações teóricas.
- **Faixa 2 — Programado (Tabela B)**:
  - Mostra as janelas de tempo acordadas após os ajustes de lote do programador.
  - Lotes que absorveram a pausa de almoço exibem o selo `🍽️ Almoço`.
- **Faixa 3 — Realizado (Execução Real)**:
  - **Verde**: Lote concluído de `inicio_real` até `fim_real` com peças apontadas.
  - **Azul Pulsante**: Lote em produção agora, calculando minutos decorridos dinamicamente.
  - **Vermelho + GAP**: Parada por quebra de ferramenta. Exibe a barra vermelha até o momento da falha e um **GAP visual livre** até o final planejado (tempo disponível para reprogramação).

---

## 3. Recursos de Interface e Usabilidade

1. **Quadrante Temporal Contínuo & Eixo X na Base**:
   - Linhas verticais cruzam as 3 faixas simultaneamente até a régua horária na base, permitindo medição milimétrica.
2. **Coluna Lateral Fixa (`sticky left-0`)**:
   - Rótulos dos postos e das faixas permanecem visíveis durante toda a rolagem horizontal.
3. **Barra de Ferramentas (`SeisanKanibanToolbar`)**:
   - **Densidade**: Compacta (46px), Padrão (58px) e Espaçosa (74px).
   - **Toggles de Faixa**: Ligue ou desligue Faixa 1, Faixa 2 ou Faixa 3 individualmente.
   - **Zoom Temporal**: 9 níveis (de 6 em 6 horas até 1 em 1 minuto), com suporte nativo a `Ctrl + Scroll`.
4. **Layout Anti-Colisão para Lotes Rápidos**:
   - Lotes concluídos em rápida sucessão (ex: segundos) recebem largura mínima de 48px e são posicionados com espaçamento seguro de 3px, impedindo sobreposição.
   - Lotes com duração $< 120s$ recebem o selo `⚡ Xs`.
