# FlowOps Next — Comercial e Agenda (Design)

## Objetivo

Migrar o módulo **Comercial** (Clientes, Leads, Orçamentos, Conversas, Portal do cliente)
e a **Agenda** para o design FlowOps Next, preservando todos os contratos operacionais
existentes: dados reais por organização, permissões, realtime, isolamento multiempresa
(RLS), rastreamento público e operação offline. É a etapa 5 do rollout incremental
(após Shell, Encomendas, Biblioteca, Produção e Logística).

## Estratégia

Substituição apenas da camada de apresentação sobre os mesmos serviços e estruturas de
dados. O protótipo/telas de referência definem a composição; **nenhum dado demonstrativo
entra em produção**. Cada tela deve poder ser revertida isoladamente. Segue o padrão já
validado nas fases anteriores: helpers de apresentação puros → renderers consomem o model →
mutações continuam pelos handlers/Supabase atuais.

## Fontes de dados e contratos preservados

- **Clientes/Leads:** `state.leads` (tabela `crm_leads`) e `state.leadFiles` (`lead_files`,
  bucket `lead-files`); realtime de `crm_leads`. Escrita continua em `saveLead`
  (upsert `crm_leads` + insert `lead_files`).
- **Orçamentos:** derivados de `state.data.orders[].quoteStage` (Solicitado → Em análise →
  Orçamento enviado → Aguardando cliente → Aprovado → Recusado → Convertido). Sem tabela nova.
- **Conversas:** superfície WhatsApp atual (`renderWhatsappInLeads`) — hoje placeholder de
  integração; permanece sem backend inventado.
- **Portal do cliente:** contrato público existente de rastreamento (`tracking.html`, token,
  Edge Function). A tela interna apenas configura/pré-visualiza esse link; não altera o contrato.
- **Agenda:** `calendar_events` via `calendar-persistence.js`; realtime de `calendar_events`;
  init no boot (`js/app.js`) via `bindCalendarEvents/attachCalendarEventListeners`.
- `js/data/remote.js` continua responsável pelo carregamento por organização e realtime.
- IDs de elementos, IDs de formulário e valores `data-action` existentes permanecem estáveis,
  salvo quando o handler e os testes correspondentes forem atualizados juntos.
- `data-view` existentes (`leads`, `calendar`) permanecem; novas views (`quotes`, `conversas`,
  `portal`) são **aditivas** ao roteador (allowlist + título + `case` no `render()`), sem
  remover nada.

## Arquitetura

Adicionar helpers de apresentação puros que transformam o `state` em modelos prontos para
exibição, sem mutar `state`, leads, orders ou eventos. Informação ausente vira estado vazio
explícito (`Sem responsável`, `Sem previsão`, `Sem contato`), nunca valor inventado.

- `js/features/commercial-presentation.js` (novo, puro):
  - `buildCustomersModel(leads, orders, filters)` → `{ summary, list, selected }`.
  - `buildLeadsPipeline(leads, { now })` → `{ columns: [{stage, count, cards[]}], summary }`.
  - `buildQuotesModel(orders, filters)` → `{ summary, rows }` (só orders com `quoteStage`).
  - `buildConversationsModel(source)` → `{ inbox, active }` (vazio se sem dados).
  - `buildPortalPreview(order)` → `{ etapaAtual, pagamento, progresso, linkConfig }`.
- `js/features/calendar-presentation.js` (novo, puro):
  - `buildCalendarModel(events, { year, month, now })` → `{ weeks, upcoming, summary }`
    (obrigatório injetar `now`; `TypeError` se inválido — mesmo padrão de produção/logística).
- Os `render*` existentes (`renderLeadsTab`, `renderCalendarWithEvents`, etc.) passam a
  consumir esses models; novos renderers (`renderQuotes`, `renderConversations`,
  `renderClientPortal`) seguem o mesmo desenho (build puro + render que toca DOM/`state`).

CSS escopado em novos fontes, anexados **verbatim** a `css/flowops.css` sob header
`/* ===== SOURCE: NN-....css ===== */` (não há build; concat manual, como nas fases anteriores):
- `css/23-flowops-next-commercial.css` (prefixos `commercial-next-*`, `leads-next-*`,
  `quotes-next-*`, `conversas-next-*`, `portal-next-*`).
- `css/24-flowops-next-calendar.css` (prefixo `calendar-next-*`) — **substitui os estilos
  inline hard-coded** de `#calendarView` por tokens `--next-*`.
- Bump do `?v=` de `css/flowops.css` em `index.html` no release.

## Experiência por tela

### Clientes
Reskin da aba "Contatos" da view `leads`. Resumo horizontal com contagens reais
(clientes ativos, leads em aberto, orçamentos em aberto, recorrência). Lista de clientes/leads
+ painel de detalhe (contato, origem, total comprado, último contato, linha do tempo,
pedidos vinculados via `getLeadOrders`). Ações `select-lead`, `edit-lead`, `open-lead-order`
preservadas.

### Leads
Nova composição **pipeline** (kanban) por status do lead (ex.: Novo, Contato feito, Orçamento,
Negociação, Ganho/Perdido) a partir de `state.leads`, mais abas Lista e Follow-ups
(`renderFollowUps`). O board é aditivo — reusa `crm_leads`, filtros e `saveLead` atuais.
Board com rolagem contida; página sem overflow horizontal.

### Orçamentos
Nova view `quotes` (aditiva) derivada de `state.data.orders` com `quoteStage` definido:
resumo (em aberto, aguardando cliente, aprovados %, prazo médio) + tabela
(orçamento, cliente, versão, validade, valor, status). Abrir um item reusa o fluxo de
encomenda existente (`open-order-drawer`/edição). Sem tabela nova, sem dado fabricado.

### Conversas
Nova view `conversas` (aditiva): inbox + thread, centralizando WhatsApp/e-mail vinculados ao
cliente. Enquanto a integração for placeholder, exibir o **shell do inbox com estado vazio**
e os dados reais que existirem — **nunca** mensagens fictícias. Envio/registro só quando o
backend correspondente existir.

### Portal do cliente
Nova view `portal` (aditiva, interna): configura e pré-visualiza o acompanhamento público de
um pedido (permitir aprovação, permitir pagamento, exibir produção; validade do link) e mostra
a prévia (etapa atual, progresso, pagamento). "Copiar link" usa o contrato/token de
`tracking.html` existente. Não altera a página pública nem o contrato de rastreamento.

### Agenda
Reskin da view `calendar` para tokens `--next-*` (hoje usa estilos inline). Mantém
`renderCalendarWithEvents`, `attachCalendarEventListeners`, `updateCalendarStats`, a fonte
`calendar_events`, o realtime e o init no boot. Visões Mês/Semana/Lista, painel do dia e
resumos (vendas, entregas, logística, caixa) a partir dos dados reais. **Atenção:** adicionar
`case "calendar"` no `render()` só se necessário para re-render sob navegação; preservar o
init atual no boot.

## Estados de erro e vazio

- Falha de carregamento mostra erro recuperável (retry) e nunca troca dado real por amostra.
- Cliente/lead/orçamento/conversa/evento ausentes usam rótulos explícitos.
- Sem permissão de edição: inspeciona, mas não recebe controles de mutação
  (`#newLeadBtn`/`leadForm` já gateados por `permissions.js`).

## Responsividade

- Desktop, tablet e 390 px sem overflow horizontal de página.
- Pipelines/kanban e tabelas: rolagem contida no board; tabelas viram listas empilhadas no mobile.
- Drawers/painéis usam a altura do viewport e mantêm ações principais acessíveis.

## Testes e evidências de release

- Unitários dos helpers puros (`commercial-presentation`, `calendar-presentation`): formato do
  model, contagens de summary, imutabilidade da entrada (structuredClone) e `TypeError` para
  `now` inválido.
- Contratos de UI/estrutura (`*-next.test.js` + `ui-contracts.test.js`): novos IDs/classes
  estáveis, preservação de `data-action`/IDs, `data-view` novos no roteador, tokens/CSS.
- Playwright desktop e 390 px para as telas e ausência de overflow; autenticados marcados com
  tags de release (pulados sem credenciais de QA).
- Regressão: login, troca de organização, RLS, realtime de `crm_leads`/`calendar_events`,
  criação/edição de lead, vínculo lead→pedido, rastreamento público intacto.
- `sw.js`: bump de `CACHE_NAME` (e do teste `release-version.test.js`) só quando o release
  completo for aprovado; `/css/flowops.css` permanece 1x em `STATIC_ASSETS` (fontes 23/24 não
  entram no cache).
- Gate fail-closed (`release:gate`) permanece exigindo as credenciais/fixtures de QA antes de
  qualquer publicação; deploy só no ambiente credenciado.

## Ordem de implantação (sub-fases revertíveis)

1. Helpers puros (`commercial-presentation.js`, `calendar-presentation.js`) + testes unitários.
2. Clientes + Leads (reskin `leads` view + pipeline) + CSS `23`.
3. Orçamentos (view `quotes` derivada de orders).
4. Conversas (view `conversas`, shell + estados vazios).
5. Portal do cliente (view `portal`, config + preview do link público).
6. Agenda (reskin `calendar` para tokens) + CSS `24`.
7. Regressão completa + evidências (sem bump de cache/deploy sem aprovação).

## Critérios de aceite

- Totais e registros exibidos antes e depois permanecem equivalentes para a mesma organização.
- Leads/clientes existentes continuam editáveis e atualizados em realtime.
- Orçamentos refletem exatamente os `quoteStage` reais das encomendas; abrir um item reusa o
  fluxo atual.
- Conversas e Portal aparecem sem dado fabricado (estado vazio quando não há backend/dado).
- Rastreamento público continua funcionando sem autenticação.
- Todas as telas usáveis a 390 px sem overflow horizontal de página.
- Nenhum contrato de marketplace, logística, rastreio, RLS ou offline enfraquecido.
- Nenhum dado de uma organização aparece em outra.
