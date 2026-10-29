# Fase 3.3 — Exportação

## Contexto

Terceiro sub-projeto da Fase 3. Exportar o estado atual persistido (Tabela
B) pra CSV — mesma limitação de "sem histórico" das duas anteriores: só dá
pra exportar o que existe agora, não um recorte de uma data passada.

## Decisão

CSV (stdlib `csv` do Python, zero dependência nova) — não Excel/PDF, que
exigiriam biblioteca nova sem necessidade real pra uma ferramenta interna.
Reaproveita `listar_persistidos` (já existe, criado pro Calendário) — rota
nova só serializa o mesmo resultado pra CSV em vez de JSON.

Botão "Exportar CSV" na tela de Produção, usando os mesmos filtros
linha/turno/patan já existentes ali. Download via fetch autenticado +
blob (link `<a href>` puro não carrega o header de Authorization).

## API

```
GET /producao/exportar?linha=&turno=&patan=
```
Mesma assinatura de `/producao/tabela-b`. Resposta `text/csv` com
`Content-Disposition: attachment`. Qualquer usuário autenticado.

## Fora de escopo

- Excel/PDF.
- Exportação agendada/automática.
- Testes automatizados e revisão de segurança — mesma política das fases
  anteriores.
