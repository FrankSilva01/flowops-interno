// FlowOps Knowledge Base v3 — motor NLP local (sem IA externa)
// Camadas: sinônimos + stemming pt-BR + fuzzy (Levenshtein) + scoring por cobertura.

// ============================== NLP CORE ==============================

export function normalize(t){return String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}

// Sinônimos pt-BR → forma canônica (aplicado ANTES do stemming)
const SYN={
ganhei:'lucro',ganho:'lucro',ganhos:'lucro',lucrei:'lucro',lucratividade:'lucro',rendimento:'lucro',rendeu:'lucro',sobrou:'lucro',
faturei:'faturamento',fatura:'faturamento',receita:'faturamento',arrecadei:'faturamento',
grana:'dinheiro',bufunfa:'dinheiro',
pedido:'encomenda',pedidos:'encomendas',venda:'encomenda',ordem:'encomenda',
comprador:'cliente',compradores:'clientes',freguesia:'clientes',freques:'cliente',contato:'cliente',
mercadolivre:'ml',meli:'ml',
correio:'frete',correios:'frete',envio:'frete',postagem:'frete',
etiquetas:'etiqueta',
grafico:'relatorio',graficos:'relatorio',
filamento:'material',filamentos:'materiais',insumo:'material',insumos:'materiais',
mensalidade:'assinatura',
guia:'das',boleto:'das',
nota:'nfe',notas:'nfe',danfe:'nfe',
funcionario:'usuario',funcionarios:'usuarios',colaborador:'usuario',colaboradores:'usuarios',equipe:'usuarios',
senha:'acesso',login:'acesso',
loja:'vitrine',lojinha:'vitrine',
demorado:'atrasado',atrasou:'atrasado',vencido:'atrasado',
deletar:'excluir',apagar:'excluir',remover:'excluir',
cadastrar:'criar',adicionar:'criar',registrar:'criar',incluir:'criar',
modificar:'editar',alterar:'editar',mudar:'editar',trocar:'editar',
valor:'preco',valores:'precos',custa:'preco',cobrar:'preco',
};

// Stopwords que não carregam intenção
const STOP=new Set(['de','da','do','das','dos','o','a','os','as','um','uma','uns','umas','em','no','na','nos','nas','por','para','pra','pro','com','sem','que','qual','quais','como','onde','quando','quem','meu','minha','meus','minhas','seu','sua','e','ou','se','ja','la','ao','aos','ate','tem','ter','esta','estao','ser','sao','foi','vou','quero','queria','pode','posso','me','mostra','mostre','ver','veja','fala','diga','das']);

// Sufixos pt-BR (ordenados por tamanho, maior primeiro)
const SUFFIXES=['amentos','imentos','amento','imento','issimo','issima','amente','emente','adores','adoras','acoes','ances','encia','ancia','ador','adora','acao','coes','cao','oes','ando','endo','indo','aram','eram','iram','avam','arem','erem','irem','asse','esse','isse','ados','adas','idos','idas','ado','ada','ido','ida','ar','er','ir','ns','s'];
export function stem(w){
  if(w.length<=3)return w;
  for(const s of SUFFIXES){if(s.length<w.length-2&&w.endsWith(s))return w.slice(0,w.length-s.length)}
  return w;
}

function canonToken(w){const c=SYN[w]||w;return stem(c)}

export function tokenize(q){
  return normalize(q).split(' ').filter(w=>w.length>1&&!STOP.has(w)).map(canonToken).filter(Boolean);
}

// Damerau-Levenshtein (OSA) com teto — transposição ("lucor"→"lucro") conta 1
export function lev(a,b,max=2){
  if(Math.abs(a.length-b.length)>max)return max+1;
  let prev2=null;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];let rowMin=i;
    for(let j=1;j<=b.length;j++){
      let c=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      if(prev2&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])c=Math.min(c,prev2[j-2]+1);
      cur[j]=c;
      if(c<rowMin)rowMin=c;
    }
    if(rowMin>max)return max+1;
    prev2=prev;prev=cur;
  }
  return prev[b.length];
}

// Similaridade entre dois tokens já canonizados: 0..1
export function tokenSim(a,b){
  if(a===b)return 1;
  if(a.length>=4&&b.length>=4){
    if(a.includes(b)||b.includes(a))return .75;
    const d=lev(a,b,2);
    if(d===1)return .8;
    if(d===2&&Math.min(a.length,b.length)>=6)return .55;
  }else if(a.length>=3&&b.length>=3&&(a.startsWith(b)||b.startsWith(a))){
    return .6;
  }
  return 0;
}

// Cobertura: fração dos tokens de `need` encontrados (fuzzy) em `have`
export function coverage(need,have){
  if(!need.length)return 0;
  let sum=0;
  for(const n of need){let m=0;for(const h of have){const s=tokenSim(n,h);if(s>m)m=s}sum+=m}
  return sum/need.length;
}

// ============================== FAQ / KB ==============================

export const KNOWLEDGE=[
{k:['criar','nova','encomenda','pedido'],a:'Vá em **Encomendas** → **Nova encomenda**. Preencha produto, material, quantidade, valor e cliente.',v:'orders'},
{k:['editar','alterar','modificar','pedido'],a:'Clique no pedido na lista → painel abre à direita → **Editar**.',v:'orders'},
{k:['sla','prazo','atraso','atrasado'],a:'**SLA** mede se o pedido está no prazo. Verde=ok, vermelho=atrasado. Calculado pela data de entrega.'},
{k:['entregar','entregue','concluir','finalizar'],a:'Mude status para **Entregue**. Atualiza histórico, calendário e logística.',v:'orders'},
{k:['prioridade','urgente','alta','baixa'],a:'Urgente > Alta > Normal > Baixa. Pedidos urgentes aparecem primeiro no kanban.'},
{k:['orcamento','cotacao','proposta'],a:'Status **Orçamento** fica separado — não entra na produção até ser aprovado.'},
{k:['kanban','producao','board','etapas','colunas'],a:'Kanban mostra pedidos por etapa. Arraste cards entre colunas. Etapas personalizáveis em **Produção → Etapas**.',v:'production'},
{k:['personalizar','etapas','customizar','configurar etapas'],a:'Na Produção → **Etapas** (canto superior direito). Adicione, remova, renomeie e reordene. Min 1, max 10.',v:'production'},
{k:['rastrear','rastreio','tracking','codigo rastreio'],a:'Em **Logística**, cada pedido mostra timeline de rastreio. ML atualiza automaticamente.',v:'logistics'},
{k:['etiqueta','envio','declaracao','postagem'],a:'Na Logística → pedido → **Gerar etiqueta**. ML: baixa direto. Vendas diretas: preencha destinatário → PDF.',v:'logistics'},
{k:['devolver','devolucao','troca','reembolso'],a:'No pedido entregue → **Registrar devolução**. Informe motivo e fotos. Reembolso gera saída no caixa.',v:'logistics'},
{k:['margem','liquida','lucro percentual','rentabilidade'],a:'**Margem** = (Lucro ÷ Preço) × 100. Prejuízo (<0%), Crítico (0-10%), Atenção (10-20%), Saudável (20-35%), Excelente (>35%).'},
{k:['lancar','entrada','saida','caixa','registrar movimento'],a:'Em **Fluxo de Caixa** → preencha data, tipo, categoria e valor.',v:'cash'},
{k:['das','mei','imposto','pgmei'],a:'No **Fiscal** ou **Calendário**, cadastre DAS mensal. Alerta 7 dias antes. Cole Pix no FlowOps. Pagar gera saída no caixa.',v:'fiscal'},
{k:['nfe','nota fiscal','xml'],a:'No **Fiscal → Notas de venda**, cadastre/importe NF-e. Vincule ao pedido. Anexe XML e DANFE.',v:'fiscal'},
{k:['conectar','ml','integrar','marketplace'],a:'**Marketplace → Integrações → Conectar Mercado Livre**. Autorize o FlowOps.',v:'marketplace'},
{k:['classico','premium','tipo anuncio','gold'],a:'**Premium**: +exposição, comissão ~16.5%. **Clássico**: normal, ~11-13%. Premium vende mais mas custa mais.'},
{k:['exportar','shopee','planilha','amazon','tiktok'],a:'Na aba **Anúncios → Exportar**. Escolha marketplace destino e formato CSV/XLSX.',v:'marketplace'},
{k:['frete','zerado','zero','gratis','subsidio'],a:'**Frete grátis ≠ custo zero pro vendedor.** ML cobre ~50% (reputação verde). Informe o peso pra estimativa.'},
{k:['reputacao','mercadolider','verde','reclamacao'],a:'Reputação ML: reclamações <2%, envio no prazo, poucos cancelamentos. Verde = MercadoLíder.'},
{k:['handling','prazo despacho'],a:'Handling time: prazo do ML pra despachar (1-2 dias úteis). Atrasar derruba reputação.'},
{k:['shopee','taxa shopee'],a:'Shopee: comissão ~12-20% + taxa serviço ~2%. Total ~14-22%.'},
{k:['amazon','taxa amazon','fba','fbm'],a:'Amazon: comissão ~8-15%. FBA (+armazenamento). FBM (você envia, sem taxa extra).'},
{k:['tiktok','tiktok shop'],a:'TikTok Shop: comissão ~5-8%. Nova no Brasil, menor concorrência.'},
{k:['custo','cadastrar custo'],a:'Em **Inteligência → Cadastrar em lote** pra informar custos. Com custo, calcula lucro e sugestões.',v:'marketplace'},
{k:['sku','codigo produto'],a:'SKU automático: PREFIXO-CODIGO-SEQ (ex: ACT-DEAD-0001). Configure prefixos nas Configurações.'},
{k:['simulador','calcular preco','calculadora'],a:'Na **Inteligência → Calculadora**. Informe custo, tipo, frete → preço mínimo/recomendado/premium.',v:'marketplace'},
{k:['calendario','evento','vencimento'],a:'O **Calendário** mostra entregas, vendas, DAS, contas. Clique num evento pra navegar.',v:'calendar'},
{k:['usuario','acesso','colaborador','permissao'],a:'**Gestão de Usuários** → e-mail, senha, permissão → Criar acesso. Papéis: Administrador, Supervisor, Operador, Somente leitura.',v:'approvals'},
{k:['plano','assinatura','upgrade'],a:'**Minha Assinatura** → compare e altere planos.',v:'subscription'},
{k:['backup','restaurar'],a:'**Marketplace → Backup → Executar agora**. Baixar sistema ou banco completo.'},
{k:['precificar','quanto cobrar','markup'],a:'**Preço = Custo ÷ (1 - Margem)**. Ex: custo R$20, margem 30% → R$28,57. Use a Calculadora.'},
{k:['vender mais','aumentar vendas','dicas'],a:'1) Premium nos com margem. 2) Frete grátis embutido. 3) Responda perguntas <1h. 4) Reputação verde. 5) Use a Inteligência.'},
{k:['escalar','crescer','expandir'],a:'1) Automatize tudo. 2) Expanda pra Shopee/Amazon. 3) Delegue no kanban. 4) Corte sem margem.'},
{k:['concorrencia','competitivo','preco medio'],a:'A Inteligência compara seu preço com a média do ML. Acima: revise. Abaixo com boa conversão: suba. Você também pode me perguntar: "preço médio de [produto]" que eu pesquiso no Mercado Livre.'},
{k:['ticket medio'],a:'**Ticket médio** = Receita ÷ Vendas. Acompanhe em Relatórios.'},
{k:['romaneio','imprimir lista','producao do dia'],a:'Na Produção → **Romaneio do dia**. Gera PDF com o que produzir e despachar hoje, pronto pra imprimir.'},
{k:['whatsapp','mensagem','template mensagem'],a:'No pedido → **WhatsApp**. Escolha template, placeholders preenchem automaticamente. Copie ou abra wa.me.'},
{k:['relatorio','exportar relatorio','pdf','excel'],a:'Em **Relatórios** → escolha aba → **Exportar CSV/Excel/PDF**.',v:'reports'},
{k:['busca','buscar','procurar','encontrar'],a:'Use **Ctrl+K** pra busca global. Pesquisa em pedidos, clientes, materiais e anúncios de uma vez.'},
{k:['tema','escuro','claro','dark'],a:'Clique no ícone lua/sol no header pra alternar tema.'},
{k:['widget','dashboard','personalizar dashboard','arrastar'],a:'No **Dashboard**, use o modo de edição pra arrastar, ocultar e reordenar os widgets do jeito que preferir.',v:'dashboard'},
{k:['tag','etiquetar','marcador','categoria pedido'],a:'Pedidos aceitam **tags personalizadas** — crie e aplique na edição do pedido pra filtrar e organizar.',v:'orders'},
{k:['portal','cliente rastrear','link rastreio publico'],a:'Cada pedido tem um **link público de rastreio** (tracking) que você envia ao cliente — ele acompanha sem login.',v:'logistics'},
{k:['instalar','aplicativo','celular','pwa','app'],a:'O FlowOps é um **PWA**: no navegador do celular use "Adicionar à tela inicial" pra instalar como app.'},
{k:['atalho','teclado','ctrl'],a:'Atalhos: **Ctrl+K** busca global · **Alt+A** abre o assistente · **Esc** fecha painéis.'},
{k:['vitrine','loja publica','divulgar'],a:'A **Vitrine** (store) é sua loja pública. Configure em Marketplace → Vitrine e compartilhe o link.',v:'marketplace'},
{k:['importar','planilha importar','migrar dados'],a:'Use o **Importar** (planilha CSV/XLSX) pra trazer pedidos e anúncios em lote. No Marketplace há importação de arquivos de vendas.'},
{k:['historico','auditoria','quem alterou','log'],a:'O **Histórico** registra toda alteração: quem, quando e o que mudou. Útil pra auditoria da equipe.'},
{k:['suporte','ajuda','falar','atendimento'],a:'Em **Suporte** você abre chamados e vê novidades do sistema.',v:'support'},
{k:['notificacao','alerta','aviso'],a:'O sino no header mostra **notificações**: estoque crítico, DAS, atrasos e novidades.'},
{k:['ensinar','treinar','assistente','aprender'],a:'Você pode **me ensinar**! Quando eu não souber responder, clique em "Ensinar resposta" (ou digite /ensinar). Também aprendo com os votos 👍/👎.'},
{k:['estoque','minimo','alerta estoque'],a:'Em **Materiais**, defina quantidade mínima por item. Abaixo dela, o item entra em alerta de reposição.',v:'materials'},
{k:['lead','funil','prospecto','crm'],a:'Em **Clientes**, leads têm status (Lead → Cliente). Registre contatos e histórico de cada um.',v:'leads'},
];

// ============================== DATA QUERIES ==============================

export const DATA_QUERIES=[
{p:['lucro','ganhei','resultado','saldo'],period:true,fn:(s,p)=>{const c=fp(s.data.cash,p);const i=c.reduce((a,x)=>a+N(x.income),0);const e=c.reduce((a,x)=>a+N(x.expense),0);return{t:`**Resultado ${pl(p)}:**\n\nEntradas: R$ ${f(i)}\nSaídas: R$ ${f(e)}\n**Lucro: R$ ${f(i-e)}**\nMargem: ${i?((i-e)/i*100).toFixed(1):'0'}%`,v:'cash'}}},
{p:['faturamento','receita','vendas total','quanto vendi','vendas'],period:true,fn:(s,p)=>{const o=fop(s.data.orders,p);const t=o.reduce((a,x)=>a+N(x.charged),0);const r=o.reduce((a,x)=>a+N(x.received),0);return{t:`**Vendas ${pl(p)}:** ${o.length} pedido(s)\nTotal: R$ ${f(t)}\nRecebido: R$ ${f(r)}\nA receber: R$ ${f(t-r)}`,v:'reports'}}},
{p:['despesas','gastos','saidas','quanto gastei'],period:true,fn:(s,p)=>{const c=fp(s.data.cash,p).filter(x=>N(x.expense)>0);const t=c.reduce((a,x)=>a+N(x.expense),0);const by={};c.forEach(x=>{const k=x.category||'Outros';by[k]=(by[k]||0)+N(x.expense)});const top=Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,6);return{t:`**Despesas ${pl(p)}: R$ ${f(t)}** (${c.length} lançamentos)\n\n${top.map(([k,v])=>`• ${k}: R$ ${f(v)}`).join('\n')||'Nenhuma despesa.'}`,v:'cash'}}},
{p:['ticket medio','media por pedido'],period:true,fn:(s,p)=>{const o=fop(s.data.orders,p);const t=o.reduce((a,x)=>a+N(x.charged),0);return{t:`**Ticket médio ${pl(p)}:** R$ ${f(o.length?t/o.length:0)} (${o.length} pedidos)`,v:'reports'}}},
{p:['receber','a receber','pendentes valor','falta receber','devem'],fn:(s)=>{const r=s.data.orders.filter(o=>N(o.charged)>0&&N(o.received)===0);const t=r.reduce((a,o)=>a+N(o.charged),0);if(!r.length)return{t:'Nenhum valor pendente. ✅'};return{t:`**R$ ${f(t)} a receber** (${r.length} pedidos)\n\n${r.slice(0,8).map(o=>`• **${o.description}** — R$ ${f(N(o.charged))}`).join('\n')}`,v:'cash'}}},
{p:['entregar hoje','entrega hoje','despachar hoje','pedidos hoje'],fn:(s)=>{const td=new Date().toISOString().split('T')[0];const o=s.data.orders.filter(x=>(x.deliveryDate||'').startsWith(td));if(!o.length)return{t:'Nenhum pedido pra hoje. 🎉'};return{t:`**${o.length} pra hoje:**\n\n${o.map(x=>`• **${x.description}** (${x.orderCode||'?'}) — R$ ${f(N(x.charged))}`).join('\n')}`,v:'orders'}}},
{p:['pendente','em aberto','a preparar','falta entregar','producao pendente'],fn:(s)=>{const p=s.data.orders.filter(o=>!['Entregue','Despachado'].includes(o.status));if(!p.length)return{t:'Tudo entregue! 🎉'};const t=p.reduce((a,o)=>a+N(o.charged),0);const by={};p.forEach(o=>{const st=o.status||'A preparar';by[st]=(by[st]||0)+1});return{t:`**${p.length} pendente(s)** (R$ ${f(t)})\n\n${Object.entries(by).map(([k,v])=>`• ${k}: ${v}`).join('\n')}`,v:'orders'}}},
{p:['atrasado','atraso','prazo vencido'],fn:(s)=>{const td=new Date().toISOString().split('T')[0];const l=s.data.orders.filter(o=>o.deliveryDate&&o.deliveryDate<td&&!['Entregue','Despachado'].includes(o.status));if(!l.length)return{t:'Nenhum atrasado. ✅'};return{t:`⚠️ **${l.length} atrasado(s):**\n\n${l.map(o=>`• **${o.description}** — era ${o.deliveryDate}`).join('\n')}`,v:'orders'}}},
{p:['mais vendido','top produto','vende mais','campeao','ranking produto'],fn:(s)=>{const c={};s.data.orders.forEach(o=>{const n=o.description||'?';c[n]=(c[n]||0)+1});const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,10);if(!sorted.length)return{t:'Sem vendas ainda.'};return{t:`**Top 10:**\n\n${sorted.map(([n,q],i)=>`${i+1}. **${n}** — ${q}x`).join('\n')}`,v:'reports'}}},
{p:['quantos pedidos','total pedidos'],period:true,fn:(s,p)=>{const o=fop(s.data.orders,p);const e=o.filter(x=>x.status==='Entregue').length;return{t:`**Pedidos ${pl(p)}:** ${o.length}\nEntregues: ${e} | Pendentes: ${o.length-e}`,v:'reports'}}},
{p:['quantos clientes','total clientes'],fn:(s)=>{const t=(s.data.leads||[]).length;const a=(s.data.leads||[]).filter(l=>l.status==='Cliente').length;return{t:`**${t} contato(s):** ${a} ativos, ${t-a} leads`,v:'leads'}}},
{p:['melhor cliente','quem mais compra','top cliente'],fn:(s)=>{const c={};s.data.orders.forEach(o=>{const n=o.client||'?';c[n]=(c[n]||0)+N(o.charged)});const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,5);return{t:`**Top clientes:**\n\n${sorted.map(([n,v],i)=>`${i+1}. **${n}** — R$ ${f(v)}`).join('\n')}`,v:'leads'}}},
{p:['estoque','material acabando','critico','repor'],fn:(s)=>{const items=(s.inventoryItems||[]).filter(i=>N(i.current_quantity)<=N(i.min_quantity));if(!items.length)return{t:'Estoque OK. 👍'};return{t:`⚠️ **${items.length} crítico(s):**\n\n${items.map(i=>`• **${i.name}** — ${i.current_quantity||0}/${i.min_quantity||0} un.`).join('\n')}`,v:'materials'}}},
{p:['anuncios','quantos anuncios'],fn:(s)=>{const l=(s.data.marketplaceListings||[]);return{t:`**${l.length} anúncio(s)** (${l.filter(x=>x.status==='active').length} ativos)`,v:'marketplace'}}},
{p:['qual marketplace','melhor canal','onde vendo'],fn:(s)=>{const c={};s.data.orders.forEach(o=>{const ch=o.source||'manual';c[ch]=(c[ch]||0)+N(o.charged)});const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]);return{t:`**Vendas por canal:**\n\n${sorted.map(([k,v])=>`• **${k}**: R$ ${f(v)}`).join('\n')}`,v:'reports'}}},
{p:['resumo','visao geral','como esta','situacao','meu negocio'],fn:(s)=>{const o=s.data.orders||[];const c=s.data.cash||[];const now=new Date();const m=c.filter(x=>x.date&&new Date(x.date).getMonth()===now.getMonth());const i=m.reduce((a,x)=>a+N(x.income),0);const e=m.reduce((a,x)=>a+N(x.expense),0);const td=now.toISOString().split('T')[0];const pend=o.filter(x=>!['Entregue','Despachado'].includes(x.status)).length;const late=o.filter(x=>x.deliveryDate&&x.deliveryDate<td&&!['Entregue'].includes(x.status)).length;const inv=(s.inventoryItems||[]).filter(x=>N(x.current_quantity)<=N(x.min_quantity)).length;return{t:`📊 **Resumo:**\n\n💰 Mês: R$ ${f(i)} entrada, R$ ${f(e)} saída, **R$ ${f(i-e)} lucro**\n📦 ${pend} pendentes, ${late} atrasados\n🔴 ${inv} estoque crítico\n📋 ${o.length} pedidos, 👥 ${(s.data.leads||[]).length} clientes`,v:'dashboard'}}},
{p:['gastos material','custo material','compras material'],period:true,fn:(s,p)=>{const m=fp(s.data.materials||[],p,'date');const t=m.reduce((a,x)=>a+N(x.total),0);return{t:`**Gastos materiais ${pl(p)}:** R$ ${f(t)} (${m.length} compras)`,v:'materials'}}},
];

function N(v){return Number(v||0)}
function f(n){return N(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
function pl(p){return p==='today'?'de hoje':p==='yesterday'?'de ontem':p==='week'?'desta semana':p==='year'?'deste ano':'deste mês'}
export function detectPeriod(t){const q=normalize(t);if(/\bhoje\b/.test(q))return'today';if(/\bontem\b/.test(q))return'yesterday';if(/semana/.test(q))return'week';if(/\bano\b|anual/.test(q))return'year';return'month'}
function sameDay(d,ref){return d.toDateString()===ref.toDateString()}
function inPeriod(d,period){const now=new Date();if(isNaN(d))return false;if(period==='today')return sameDay(d,now);if(period==='yesterday'){const y=new Date(now);y.setDate(y.getDate()-1);return sameDay(d,y)}if(period==='week'){const w=new Date(now);w.setDate(w.getDate()-7);return d>=w}if(period==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();if(period==='year')return d.getFullYear()===now.getFullYear();return true}
function fp(arr,period,df='date'){return (arr||[]).filter(c=>c[df]&&inPeriod(new Date(c[df]),period))}
function fop(o,p){return (o||[]).filter(x=>inPeriod(new Date(x.createdAt||x.created_at||''),p))}

// Pergunta que é SÓ um período? ("e hoje?", "essa semana", "e no ano?") → follow-up
export function isPeriodOnly(query){
  const toks=normalize(query).split(' ').filter(Boolean);
  if(!toks.length||toks.length>4)return false;
  const PERIOD=new Set(['hoje','ontem','semana','mes','ano','anual','mensal','semanal','agora']);
  const FILLER=new Set(['e','de','da','do','desta','deste','essa','esse','nessa','nesse','no','na','em']);
  return toks.some(t=>PERIOD.has(t))&&toks.every(t=>PERIOD.has(t)||FILLER.has(t));
}

// ============================== BUSCAS ==============================

let KB_INDEX=null;
function kbIndex(){
  if(!KB_INDEX)KB_INDEX=KNOWLEDGE.map(e=>({e,toks:[...new Set(e.k.flatMap(p=>tokenize(p)))]}));
  return KB_INDEX;
}

export function searchKnowledge(query){
  const qt=tokenize(query);
  if(!qt.length)return null;
  let best=null,bs=0,second=null,ss=0;
  for(const{e,toks}of kbIndex()){
    let sc=0,hits=0;
    for(const t of qt){let m=0;for(const kt of toks){const s=tokenSim(t,kt);if(s>m)m=s}if(m>0){sc+=m;hits++}}
    if(!hits)continue;
    sc=sc*(hits/qt.length+.3);
    if(sc>bs){second=best;ss=bs;best=e;bs=sc}
    else if(sc>ss){second=e;ss=sc}
  }
  if(!best)return null;
  const confidence=Math.round(Math.min(100,(bs/Math.max(1,Math.min(qt.length,4)))*80));
  if(confidence<25)return null;
  return{type:'faq',text:best.a,action:best.v?{view:best.v}:null,confidence,related:(second&&ss>bs*.72&&second!==best)?second:null};
}

export function searchDataQuery(query,stateRef,forcedPeriod=null){
  const qt=tokenize(query),qn=normalize(query);
  if(!qt.length)return null;
  let best=null,bs=0;
  for(const dq of DATA_QUERIES){
    let s=0;
    for(const p of dq.p){
      const pn=normalize(p);
      if(qn.includes(pn)){s=Math.max(s,2+pn.length/12);continue}
      const pt=tokenize(p);
      // Padrão multi-token: cobertura fuzzy. Padrão de 1 token: exige match
      // forte do token canonizado (senão qualquer menção casaria).
      if(pt.length>=2)s=Math.max(s,coverage(pt,qt)*1.6);
      else if(pt.length===1){let m=0;for(const q of qt){const x=tokenSim(pt[0],q);if(x>m)m=x}if(m>=.75)s=Math.max(s,m*1.5)}
    }
    if(s>bs){bs=s;best=dq}
  }
  if(!best||bs<1.15)return null;
  return runDataQuery(best,stateRef,forcedPeriod||(best.period?detectPeriod(qn):null));
}

export function runDataQuery(dq,stateRef,period){
  try{
    const r=dq.fn(stateRef,dq.period?(period||'month'):null);
    return{type:'data',text:r.t,action:r.v?{view:r.v}:null,dq,period:dq.period?(period||'month'):null};
  }catch(e){
    return{type:'error',text:'Não consegui ler os dados agora. Tente novamente.'};
  }
}

// Consulta por entidade: "pedidos do <cliente>", "vendas do <produto>"
export function searchEntityQuery(query,s){
  const qn=normalize(query);
  const orders=s.data?.orders||[];
  if(!orders.length||!/pedid|encomend|vend|compr|gastou|historic|quant/.test(qn))return null;
  // cliente
  const names=new Set();
  orders.forEach(o=>{if(o.client)names.add(o.client)});
  (s.data?.leads||[]).forEach(l=>{if(l.name)names.add(l.name)});
  let hit=null;
  for(const n of names){const nn=normalize(n);if(nn.length>=3&&qn.includes(nn)&&(!hit||nn.length>normalize(hit).length))hit=n}
  if(hit){
    const os=orders.filter(o=>normalize(o.client||'')===normalize(hit));
    if(os.length){
      const total=os.reduce((a,o)=>a+N(o.charged),0);
      return{type:'data',text:`**${hit}** — ${os.length} pedido(s), total R$ ${f(total)}\n\n${os.slice(0,8).map(o=>`• ${o.description||'?'} — R$ ${f(N(o.charged))} (${o.status||'?'})`).join('\n')}`,action:{view:'orders'}};
    }
  }
  // produto
  const descs=[...new Set(orders.map(o=>o.description).filter(Boolean))];
  let ph=null;
  for(const d of descs){const dn=normalize(d);if(dn.length>=4&&qn.includes(dn)&&(!ph||dn.length>normalize(ph).length))ph=d}
  if(ph){
    const os=orders.filter(o=>o.description===ph);
    const total=os.reduce((a,o)=>a+N(o.charged),0);
    const last=os.map(o=>o.createdAt||o.created_at).filter(Boolean).sort().pop();
    return{type:'data',text:`**${ph}** — ${os.length} venda(s), R$ ${f(total)} no total${last?`\nÚltima venda: ${String(last).split('T')[0]}`:''}`,action:{view:'reports'}};
  }
  return null;
}

// ============================== CONTEXTO/UI ==============================

export function getContextualSuggestions(view){
  const s={dashboard:['Como está meu negócio?','Lucro do mês?','Atrasados?','Estoque crítico?'],orders:['Entregar hoje?','Pendentes?','Como criar encomenda?'],production:['Personalizar etapas?','Pendentes?'],logistics:['Como rastrear?','Atrasados?'],leads:['Quantos clientes?','Top cliente?'],cash:['Lucro do mês?','A receber?','Despesas do mês?'],materials:['Estoque crítico?'],reports:['Mais vendido?','Vendas do mês?'],marketplace:['Taxas do ML?','Como exportar?','Preço médio de um produto?'],calendar:['Vencimentos?','DAS?'],fiscal:['DAS MEI?','Nota fiscal?']};
  return s[view]||s.dashboard;
}

export function generateBusinessContext(s){
  const o=s.data?.orders||[],c=s.data?.cash||[],now=new Date();
  const m=c.filter(x=>x.date&&new Date(x.date).getMonth()===now.getMonth());
  const i=m.reduce((a,x)=>a+N(x.income),0),e=m.reduce((a,x)=>a+N(x.expense),0);
  const pend=o.filter(x=>!['Entregue','Despachado'].includes(x.status)).length;
  return`Empresa: ${s.companyName||'FlowOps'}. Mês atual: R$${f(i)} entrada, R$${f(e)} saída, R$${f(i-e)} lucro. ${o.length} pedidos (${pend} pendentes). ${(s.data?.leads||[]).length} clientes. ${(s.data?.marketplaceListings||[]).length} anúncios.`;
}
