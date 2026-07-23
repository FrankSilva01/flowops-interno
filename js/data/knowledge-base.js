// FlowOps Knowledge Base v2 — FAQ + Data Queries + Marketplace Docs
export const KNOWLEDGE=[
{k:["criar","nova","encomenda","pedido","cadastrar"],a:"Vá em **Encomendas** → **Nova encomenda**. Preencha produto, material, quantidade, valor e cliente.",v:"orders"},
{k:["editar","alterar","modificar","pedido"],a:"Clique no pedido na lista → painel abre à direita → **Editar**.",v:"orders"},
{k:["sla","prazo","atraso","atrasado"],a:"**SLA** mede se o pedido está no prazo. Verde=ok, vermelho=atrasado. Calculado pela data de entrega."},
{k:["entregar","entregue","concluir","finalizar"],a:"Mude status para **Entregue**. Atualiza histórico, calendário e logística.",v:"orders"},
{k:["prioridade","urgente","alta","baixa"],a:"Urgente > Alta > Normal > Baixa. Pedidos urgentes aparecem primeiro no kanban."},
{k:["orçamento","cotação","proposta"],a:"Status **Orçamento** fica separado — não entra na produção até ser aprovado."},
{k:["kanban","produção","board","etapas","colunas"],a:"Kanban mostra pedidos por etapa. Arraste cards entre colunas. Etapas personalizáveis em **Produção → Etapas**.",v:"production"},
{k:["personalizar","etapas","customizar","configurar etapas"],a:"Na Produção → **Etapas** (canto superior direito). Adicione, remova, renomeie e reordene. Min 1, max 10.",v:"production"},
{k:["rastrear","rastreio","tracking","código rastreio"],a:"Em **Logística**, cada pedido mostra timeline de rastreio. ML atualiza automaticamente.",v:"logistics"},
{k:["etiqueta","envio","declaração","postagem"],a:"Na Logística → pedido → **Gerar etiqueta**. ML: baixa direto. Vendas diretas: preencha destinatário → PDF.",v:"logistics"},
{k:["devolver","devolução","troca","reembolso"],a:"No pedido entregue → **Registrar devolução**. Informe motivo e fotos. Reembolso gera saída no caixa.",v:"logistics"},
{k:["margem","líquida","lucro percentual","rentabilidade"],a:"**Margem** = (Lucro ÷ Preço) × 100. Prejuízo (<0%), Crítico (0-10%), Atenção (10-20%), Saudável (20-35%), Excelente (>35%)."},
{k:["lançar","entrada","saída","caixa","registrar"],a:"Em **Fluxo de Caixa** → preencha data, tipo, categoria e valor.",v:"cash"},
{k:["das","mei","imposto","guia","pgmei"],a:"No **Fiscal** ou **Calendário**, cadastre DAS mensal. Alerta 7 dias antes. Cole Pix no FlowOps. Pagar gera saída no caixa.",v:"fiscal"},
{k:["nota","fiscal","nfe","danfe","xml"],a:"No **Fiscal → Notas de venda**, cadastre/importe NF-e. Vincule ao pedido. Anexe XML e DANFE.",v:"fiscal"},
{k:["conectar","mercado livre","integrar","marketplace"],a:"**Marketplace → Integrações → Conectar Mercado Livre**. Autorize o FlowOps.",v:"marketplace"},
{k:["clássico","premium","tipo anúncio","gold"],a:"**Premium**: +exposição, comissão ~16.5%. **Clássico**: normal, ~11-13%. Premium vende mais mas custa mais."},
{k:["exportar","shopee","planilha","amazon","tiktok"],a:"Na aba **Anúncios → Exportar**. Escolha marketplace destino e formato CSV/XLSX.",v:"marketplace"},
{k:["frete","zerado","zero","grátis","subsídio"],a:"**Frete grátis ≠ custo zero pro vendedor.** ML cobre ~50% (reputação verde). Informe o peso pra estimativa."},
{k:["reputação","mercadolíder","verde","reclamação"],a:"Reputação ML: reclamações <2%, envio no prazo, poucos cancelamentos. Verde = MercadoLíder."},
{k:["handling","prazo despacho"],a:"Handling time: prazo do ML pra despachar (1-2 dias úteis). Atrasar derruba reputação."},
{k:["shopee","taxa shopee"],a:"Shopee: comissão ~12-20% + taxa serviço ~2%. Total ~14-22%."},
{k:["amazon","taxa amazon","fba","fbm"],a:"Amazon: comissão ~8-15%. FBA (+armazenamento). FBM (você envia, sem taxa extra)."},
{k:["tiktok","tiktok shop"],a:"TikTok Shop: comissão ~5-8%. Nova no Brasil, menor concorrência."},
{k:["custo","cadastrar custo"],a:"Em **Inteligência → Cadastrar em lote** pra informar custos. Com custo, calcula lucro e sugestões.",v:"marketplace"},
{k:["sku","código produto"],a:"SKU automático: PREFIXO-CODIGO-SEQ (ex: ACT-DEAD-0001). Configure prefixos nas Configurações."},
{k:["simulador","calcular preço","calculadora"],a:"Na **Inteligência → Calculadora**. Informe custo, tipo, frete → preço mínimo/recomendado/premium.",v:"marketplace"},
{k:["calendário","evento","vencimento"],a:"O **Calendário** mostra entregas, vendas, DAS, contas. Clique num evento pra navegar.",v:"calendar"},
{k:["usuário","acesso","equipe","colaborador"],a:"**Gestão de Usuários** → e-mail, senha, permissão → Criar acesso.",v:"approvals"},
{k:["plano","assinatura","upgrade"],a:"**Minha Assinatura** → compare e altere planos.",v:"subscription"},
{k:["backup","restaurar"],a:"**Marketplace → Backup → Executar agora**. Baixar sistema ou banco completo."},
{k:["precificar","quanto cobrar","markup"],a:"**Preço = Custo ÷ (1 - Margem)**. Ex: custo R$20, margem 30% → R$28,57. Use a Calculadora."},
{k:["vender mais","aumentar vendas","dicas"],a:"1) Premium nos com margem. 2) Frete grátis embutido. 3) Responda perguntas <1h. 4) Reputação verde. 5) Use a Inteligência."},
{k:["escalar","crescer","expandir"],a:"1) Automatize tudo. 2) Expanda pra Shopee/Amazon. 3) Delegue no kanban. 4) Corte sem margem."},
{k:["concorrência","competitivo","preço médio"],a:"A Inteligência compara seu preço com a média do ML. Acima: revise. Abaixo com boa conversão: suba."},
{k:["ticket médio"],a:"**Ticket médio** = Receita ÷ Vendas. Acompanhe em Relatórios."},
{k:["romaneio","imprimir lista","produção do dia"],a:"Na Produção → **Romaneio do dia**. Gera PDF com o que produzir e despachar hoje, pronto pra imprimir."},
{k:["whatsapp","mensagem","template mensagem"],a:"No pedido → **WhatsApp**. Escolha template, placeholders preenchem automaticamente. Copie ou abra wa.me."},
{k:["relatório","exportar relatório","pdf","excel"],a:"Em **Relatórios** → escolha aba → **Exportar CSV/Excel/PDF**.",v:"reports"},
{k:["busca","buscar","procurar","encontrar"],a:"Use **Ctrl+K** pra busca global. Pesquisa em pedidos, clientes, materiais e anúncios de uma vez."},
{k:["tema","escuro","claro","dark"],a:"Clique no ícone lua/sol no header pra alternar tema."},
];

export const DATA_QUERIES=[
{p:["lucro","ganhei","ganho","resultado","saldo"],period:true,fn:(s,p)=>{const c=fp(s.data.cash,p);const i=c.reduce((a,x)=>a+N(x.income),0);const e=c.reduce((a,x)=>a+N(x.expense),0);return{t:`**Resultado ${pl(p)}:**\n\nEntradas: R$ ${f(i)}\nSaídas: R$ ${f(e)}\n**Lucro: R$ ${f(i-e)}**\nMargem: ${i?((i-e)/i*100).toFixed(1):'0'}%`,v:"cash"}}},
{p:["faturamento","receita","vendas total","quanto vendi","vendas"],period:true,fn:(s,p)=>{const o=fop(s.data.orders,p);const t=o.reduce((a,x)=>a+N(x.charged),0);const r=o.reduce((a,x)=>a+N(x.received),0);return{t:`**Vendas ${pl(p)}:** ${o.length} pedido(s)\nTotal: R$ ${f(t)}\nRecebido: R$ ${f(r)}\nA receber: R$ ${f(t-r)}`,v:"reports"}}},
{p:["ticket médio","média por pedido"],period:true,fn:(s,p)=>{const o=fop(s.data.orders,p);const t=o.reduce((a,x)=>a+N(x.charged),0);return{t:`**Ticket médio ${pl(p)}:** R$ ${f(o.length?t/o.length:0)} (${o.length} pedidos)`,v:"reports"}}},
{p:["receber","a receber","pendentes valor","falta receber","devem"],fn:(s)=>{const r=s.data.orders.filter(o=>N(o.charged)>0&&N(o.received)===0);const t=r.reduce((a,o)=>a+N(o.charged),0);if(!r.length)return{t:"Nenhum valor pendente. ✅"};return{t:`**R$ ${f(t)} a receber** (${r.length} pedidos)\n\n${r.slice(0,8).map(o=>`• **${o.description}** — R$ ${f(N(o.charged))}`).join('\n')}`,v:"cash"}}},
{p:["entregar hoje","entrega hoje","despachar hoje","pedidos hoje"],fn:(s)=>{const td=new Date().toISOString().split('T')[0];const o=s.data.orders.filter(x=>(x.deliveryDate||'').startsWith(td));if(!o.length)return{t:"Nenhum pedido pra hoje. 🎉"};return{t:`**${o.length} pra hoje:**\n\n${o.map(x=>`• **${x.description}** (${x.orderCode||'?'}) — R$ ${f(N(x.charged))}`).join('\n')}`,v:"orders"}}},
{p:["pendente","em aberto","a preparar","falta entregar","produção pendente"],fn:(s)=>{const p=s.data.orders.filter(o=>!["Entregue","Despachado"].includes(o.status));if(!p.length)return{t:"Tudo entregue! 🎉"};const t=p.reduce((a,o)=>a+N(o.charged),0);const by={};p.forEach(o=>{const st=o.status||'A preparar';by[st]=(by[st]||0)+1});return{t:`**${p.length} pendente(s)** (R$ ${f(t)})\n\n${Object.entries(by).map(([k,v])=>`• ${k}: ${v}`).join('\n')}`,v:"orders"}}},
{p:["atrasado","atraso","vencido","prazo vencido"],fn:(s)=>{const td=new Date().toISOString().split('T')[0];const l=s.data.orders.filter(o=>o.deliveryDate&&o.deliveryDate<td&&!["Entregue","Despachado"].includes(o.status));if(!l.length)return{t:"Nenhum atrasado. ✅"};return{t:`⚠️ **${l.length} atrasado(s):**\n\n${l.map(o=>`• **${o.description}** — era ${o.deliveryDate}`).join('\n')}`,v:"orders"}}},
{p:["mais vendido","top produto","vende mais","campeão","ranking produto"],fn:(s)=>{const c={};s.data.orders.forEach(o=>{const n=o.description||'?';c[n]=(c[n]||0)+1});const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,10);if(!sorted.length)return{t:"Sem vendas ainda."};return{t:`**Top 10:**\n\n${sorted.map(([n,q],i)=>`${i+1}. **${n}** — ${q}x`).join('\n')}`,v:"reports"}}},
{p:["quantos pedidos","total pedidos"],period:true,fn:(s,p)=>{const o=fop(s.data.orders,p);const e=o.filter(x=>x.status==='Entregue').length;return{t:`**Pedidos ${pl(p)}:** ${o.length}\nEntregues: ${e} | Pendentes: ${o.length-e}`,v:"reports"}}},
{p:["quantos clientes","total clientes"],fn:(s)=>{const t=(s.data.leads||[]).length;const a=s.data.leads.filter(l=>l.status==='Cliente').length;return{t:`**${t} contato(s):** ${a} ativos, ${t-a} leads`,v:"leads"}}},
{p:["melhor cliente","quem mais compra","top cliente"],fn:(s)=>{const c={};s.data.orders.forEach(o=>{const n=o.client||'?';c[n]=(c[n]||0)+N(o.charged)});const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,5);return{t:`**Top clientes:**\n\n${sorted.map(([n,v],i)=>`${i+1}. **${n}** — R$ ${f(v)}`).join('\n')}`,v:"leads"}}},
{p:["estoque","material","acabando","crítico","repor"],fn:(s)=>{const items=(s.inventoryItems||[]).filter(i=>N(i.current_quantity)<=N(i.min_quantity));if(!items.length)return{t:"Estoque OK. 👍"};return{t:`⚠️ **${items.length} crítico(s):**\n\n${items.map(i=>`• **${i.name}** — ${i.current_quantity||0}/${i.min_quantity||0} un.`).join('\n')}`,v:"materials"}}},
{p:["anúncios","quantos anúncios"],fn:(s)=>{const l=(s.data.marketplaceListings||[]);return{t:`**${l.length} anúncio(s)** (${l.filter(x=>x.status==='active').length} ativos)`,v:"marketplace"}}},
{p:["qual marketplace","melhor canal","onde vendo"],fn:(s)=>{const c={};s.data.orders.forEach(o=>{const ch=o.source||'manual';c[ch]=(c[ch]||0)+N(o.charged)});const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]);return{t:`**Vendas por canal:**\n\n${sorted.map(([k,v])=>`• **${k}**: R$ ${f(v)}`).join('\n')}`,v:"reports"}}},
{p:["resumo","visão geral","como está","situação","status"],fn:(s)=>{const o=s.data.orders||[];const c=s.data.cash||[];const now=new Date();const m=c.filter(x=>x.date&&new Date(x.date).getMonth()===now.getMonth());const i=m.reduce((a,x)=>a+N(x.income),0);const e=m.reduce((a,x)=>a+N(x.expense),0);const td=now.toISOString().split('T')[0];const pend=o.filter(x=>!["Entregue","Despachado"].includes(x.status)).length;const late=o.filter(x=>x.deliveryDate&&x.deliveryDate<td&&!["Entregue"].includes(x.status)).length;const inv=(s.inventoryItems||[]).filter(x=>N(x.current_quantity)<=N(x.min_quantity)).length;return{t:`📊 **Resumo:**\n\n💰 Mês: R$ ${f(i)} entrada, R$ ${f(e)} saída, **R$ ${f(i-e)} lucro**\n📦 ${pend} pendentes, ${late} atrasados\n🔴 ${inv} estoque crítico\n📋 ${o.length} pedidos, 👥 ${(s.data.leads||[]).length} clientes`,v:"dashboard"}}},
{p:["gastos material","custo material","compras"],period:true,fn:(s,p)=>{const m=fp(s.data.materials||[],p,'date');const t=m.reduce((a,x)=>a+N(x.total),0);return{t:`**Gastos materiais ${pl(p)}:** R$ ${f(t)} (${m.length} compras)`,v:"materials"}}},
];

function N(v){return Number(v||0)}
function f(n){return N(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
function pl(p){return p==='today'?'de hoje':p==='week'?'desta semana':p==='year'?'deste ano':'deste mês'}
function detectPeriod(t){if(/hoje/.test(t))return'today';if(/semana/.test(t))return'week';if(/ano|anual/.test(t))return'year';return'month'}
function fp(arr,period,df='date'){const now=new Date();return arr.filter(c=>{if(!c[df])return false;const d=new Date(c[df]);if(period==='today')return d.toDateString()===now.toDateString();if(period==='week'){const w=new Date(now);w.setDate(w.getDate()-7);return d>=w}if(period==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();if(period==='year')return d.getFullYear()===now.getFullYear();return true})}
function fop(o,p){const now=new Date();return o.filter(x=>{const d=new Date(x.createdAt||x.created_at||'');if(isNaN(d))return false;if(p==='today')return d.toDateString()===now.toDateString();if(p==='week'){const w=new Date(now);w.setDate(w.getDate()-7);return d>=w}if(p==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();if(p==='year')return d.getFullYear()===now.getFullYear();return true})}

export function normalize(t){return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').trim()}

export function searchKnowledge(query){const q=normalize(query),tokens=q.split(/\s+/).filter(t=>t.length>2);if(!tokens.length)return null;let best=null,bs=0;for(const e of KNOWLEDGE){let sc=0;const kws=e.k.map(normalize);for(const t of tokens)for(const kw of kws){if(kw===t)sc+=4;else if(kw.includes(t)||t.includes(kw))sc+=2;else if(kw.startsWith(t.slice(0,3)))sc+=1}if(sc>bs){bs=sc;best=e}}if(bs>=3)return{type:'faq',text:best.a,action:best.v?{view:best.v}:null,confidence:Math.min(100,bs*12)};return null}

export function searchDataQuery(query,stateRef){const q=normalize(query);for(const dq of DATA_QUERIES){if(dq.p.some(p=>q.includes(normalize(p)))){try{const period=dq.period?detectPeriod(q):null;const r=dq.fn(stateRef,period);return{type:'data',text:r.t,action:r.v?{view:r.v}:null}}catch(e){return{type:'error',text:'Erro ao acessar dados.'}}}}return null}

export function getContextualSuggestions(view){const s={dashboard:["Como está meu negócio?","Lucro do mês?","Atrasados?","Estoque crítico?"],orders:["Entregar hoje?","Pendentes?","Como criar encomenda?"],production:["Personalizar etapas?","Pendentes?"],logistics:["Como rastrear?","Atrasados?"],leads:["Quantos clientes?","Top cliente?"],cash:["Lucro do mês?","A receber?"],materials:["Estoque crítico?"],reports:["Mais vendido?","Vendas do mês?"],marketplace:["Taxas do ML?","Como exportar?","Como precificar?"],calendar:["Vencimentos?","DAS?"],fiscal:["DAS MEI?","Nota fiscal?"]};return s[view]||s.dashboard}

export function generateBusinessContext(s){const o=s.data?.orders||[],c=s.data?.cash||[],now=new Date();const m=c.filter(x=>x.date&&new Date(x.date).getMonth()===now.getMonth());const i=m.reduce((a,x)=>a+N(x.income),0),e=m.reduce((a,x)=>a+N(x.expense),0);const pend=o.filter(x=>!["Entregue","Despachado"].includes(x.status)).length;return`Empresa: ${s.companyName||'FlowOps'}. Mês atual: R$${f(i)} entrada, R$${f(e)} saída, R$${f(i-e)} lucro. ${o.length} pedidos (${pend} pendentes). ${(s.data?.leads||[]).length} clientes. ${(s.data?.marketplaceListings||[]).length} anúncios.`}
