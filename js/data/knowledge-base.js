// FlowOps Knowledge Base v3 — motor NLP local (sem IA externa)
// Camadas: sinônimos + stemming pt-BR + fuzzy (Levenshtein) + scoring por cobertura.
import { CALENDAR_HOLIDAYS } from "../features/calendar-holidays.js";

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
{p:['lucro','ganhei','resultado','saldo'],period:true,fn:(s,p)=>{const c=fp(s.data.cash,p);const i=c.reduce((a,x)=>a+N(x.income),0);const e=c.reduce((a,x)=>a+N(x.expense),0);return{t:`**Resultado ${pl(p)}:**\n\nEntradas: R$ ${f(i)}\nSaídas: R$ ${f(e)}\n**Lucro: R$ ${f(i-e)}**\nMargem: ${i?((i-e)/i*100).toFixed(1):'0'}%`,v:'cash'}},ins:(s,p)=>{const lines=[];const cur=fp(s.data.cash,p);const prev=fpPrev(s.data.cash,p);const c=cur.reduce((a,x)=>a+N(x.income)-N(x.expense),0);const pv=prev.reduce((a,x)=>a+N(x.income)-N(x.expense),0);const dl=deltaLine(c,pv,p);if(dl)lines.push(dl);const inc=cur.reduce((a,x)=>a+N(x.income),0);if(inc>0){const m=c/inc*100;if(m<0)lines.push('🚨 **Prejuízo no período.** Vale revisar os maiores gastos — pergunte "despesas" que eu abro por categoria.');else if(m<10)lines.push('💡 Margem apertada (<10%). Revise preços na **Calculadora da Inteligência** ou negocie custos de material.');else if(m>30)lines.push('💡 Margem saudável (>30%)! Bom momento pra investir em anúncios Premium ou reforçar estoque.')}return lines},next:['E essa semana?','Despesas do mês','A receber'],explain:'Peguei todos os lançamentos do **Fluxo de Caixa** no período e somei: **Lucro = Entradas − Saídas**. A margem é Lucro ÷ Entradas × 100. A comparação usa o período anterior equivalente (ex.: mês passado inteiro).'},
{p:['faturamento','receita','vendas total','quanto vendi','vendas'],period:true,fn:(s,p)=>{const o=fop(s.data.orders,p);const t=o.reduce((a,x)=>a+N(x.charged),0);const r=o.reduce((a,x)=>a+N(x.received),0);return{t:`**Vendas ${pl(p)}:** ${o.length} pedido(s)\nTotal: R$ ${f(t)}\nRecebido: R$ ${f(r)}\nA receber: R$ ${f(t-r)}`,v:'reports'}},ins:(s,p)=>{const lines=[];const cur=fop(s.data.orders,p);const prev=fopPrev(s.data.orders,p);const t=cur.reduce((a,x)=>a+N(x.charged),0);const pv=prev.reduce((a,x)=>a+N(x.charged),0);const dl=deltaLine(t,pv,p);if(dl)lines.push(dl);const pend=cur.reduce((a,x)=>a+N(x.charged)-N(x.received),0);if(t>0&&pend/t>0.4)lines.push(`💡 ${(pend/t*100).toFixed(0)}% ainda não foi recebido. Pergunte **"a receber"** que eu listo quem falta pagar.`);if(cur.length&&prev.length&&cur.length<prev.length)lines.push(`📊 Volume caiu de ${prev.length} pra ${cur.length} pedidos — pode ser sazonal, mas vale checar os anúncios.`);return lines},next:['Mais vendido','Vendas por canal','Ticket médio'],explain:'Somei o **valor cobrado** de todos os pedidos criados no período (aba Encomendas). "Recebido" é a soma do que já foi pago; "A receber" é a diferença.'},
{p:['despesas','gastos','saidas','quanto gastei'],period:true,fn:(s,p)=>{const c=fp(s.data.cash,p).filter(x=>N(x.expense)>0);const t=c.reduce((a,x)=>a+N(x.expense),0);const by={};c.forEach(x=>{const k=x.category||'Outros';by[k]=(by[k]||0)+N(x.expense)});const top=Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,6);return{t:`**Despesas ${pl(p)}: R$ ${f(t)}** (${c.length} lançamentos)\n\n${top.map(([k,v])=>`• ${k}: R$ ${f(v)}`).join('\n')||'Nenhuma despesa.'}`,v:'cash'}}},
{p:['ticket medio','media por pedido'],period:true,fn:(s,p)=>{const o=fop(s.data.orders,p);const t=o.reduce((a,x)=>a+N(x.charged),0);return{t:`**Ticket médio ${pl(p)}:** R$ ${f(o.length?t/o.length:0)} (${o.length} pedidos)`,v:'reports'}},ins:(s,p)=>{const cur=fop(s.data.orders,p);const prev=fopPrev(s.data.orders,p);if(!cur.length||!prev.length)return[];const tc=cur.reduce((a,x)=>a+N(x.charged),0)/cur.length;const tp=prev.reduce((a,x)=>a+N(x.charged),0)/prev.length;const dl=deltaLine(tc,tp,p);const lines=dl?[dl]:[];if(tp>0&&tc<tp*0.9)lines.push('💡 Ticket caindo: experimente **kits/combos** (2+ peças juntas) ou frete grátis acima de um valor mínimo.');return lines},next:['Vendas do mês','Mais vendido','Melhor cliente'],explain:'**Ticket médio = Faturamento ÷ nº de pedidos** do período. Fonte: valor cobrado dos pedidos na aba Encomendas.'},
{p:['receber','a receber','pendentes valor','falta receber','devem'],fn:(s)=>{const r=s.data.orders.filter(o=>N(o.charged)>0&&N(o.received)===0);const t=r.reduce((a,o)=>a+N(o.charged),0);if(!r.length)return{t:'Nenhum valor pendente. ✅ Caixa em dia!'};return{t:`**R$ ${f(t)} a receber** (${r.length} pedidos)\n\n${r.slice(0,8).map(o=>`• **${o.description}** — R$ ${f(N(o.charged))}`).join('\n')}`,v:'cash'}},ins:(s)=>{const r=s.data.orders.filter(o=>N(o.charged)>0&&N(o.received)===0);if(!r.length)return[];const t=r.reduce((a,o)=>a+N(o.charged),0);const top=[...r].sort((a,b)=>N(b.charged)-N(a.charged))[0];const lines=[];if(top&&N(top.charged)/t>0.4)lines.push(`💡 Só **${top.description}** concentra ${(N(top.charged)/t*100).toFixed(0)}% do valor. Cobre esse primeiro — no pedido tem o botão **WhatsApp** com template de cobrança pronto.`);else lines.push('💡 Dica: use o botão **WhatsApp** no pedido — tem template de cobrança que preenche sozinho.');return lines},next:['Lucro do mês','Pendentes','Entregar hoje?'],explain:'Filtrei os pedidos com **valor cobrado maior que zero e nada recebido ainda**. Fonte: campos "cobrado" e "recebido" da aba Encomendas.'},
{p:['entregar hoje','entrega hoje','despachar hoje','pedidos hoje'],fn:(s)=>{const td=new Date().toISOString().split('T')[0];const o=s.data.orders.filter(x=>(x.deliveryDate||'').startsWith(td));if(!o.length)return{t:'Nenhum pedido pra hoje. 🎉'};return{t:`**${o.length} pra hoje:**\n\n${o.map(x=>`• **${x.description}** (${x.orderCode||'?'}) — R$ ${f(N(x.charged))}`).join('\n')}`,v:'orders'}}},
{p:['pendente','em aberto','a preparar','falta entregar','producao pendente'],fn:(s)=>{const p=s.data.orders.filter(o=>!['Entregue','Despachado'].includes(o.status));if(!p.length)return{t:'Tudo entregue! 🎉'};const t=p.reduce((a,o)=>a+N(o.charged),0);const by={};p.forEach(o=>{const st=o.status||'A preparar';by[st]=(by[st]||0)+1});return{t:`**${p.length} pendente(s)** (R$ ${f(t)})\n\n${Object.entries(by).map(([k,v])=>`• ${k}: ${v}`).join('\n')}`,v:'orders'}}},
{p:['atrasado','atraso','prazo vencido'],fn:(s)=>{const td=new Date().toISOString().split('T')[0];const l=s.data.orders.filter(o=>o.deliveryDate&&o.deliveryDate<td&&!['Entregue','Despachado'].includes(o.status));if(!l.length)return{t:'Nenhum atrasado. ✅ Produção em dia!'};return{t:`⚠️ **${l.length} atrasado(s):**\n\n${l.map(o=>`• **${o.description}** — era ${o.deliveryDate}`).join('\n')}`,v:'orders'}},ins:(s)=>{const td=new Date().toISOString().split('T')[0];const l=s.data.orders.filter(o=>o.deliveryDate&&o.deliveryDate<td&&!['Entregue','Despachado'].includes(o.status));if(!l.length)return[];const oldest=[...l].sort((a,b)=>String(a.deliveryDate).localeCompare(String(b.deliveryDate)))[0];const days=Math.floor((Date.now()-new Date(`${oldest.deliveryDate}T00:00:00`).getTime())/86400000);const lines=[`💡 O mais antigo (**${oldest.description}**) está ${days} dia(s) atrasado. Avise o cliente pelo **WhatsApp** antes que ele cobre — transparência segura a reputação.`];if(l.length>=3)lines.push('📊 3+ atrasos costumam indicar gargalo. Veja o kanban da **Produção**: alguma etapa acumulando?');return lines},next:['Pendentes','Entregar hoje?','Como funciona o kanban?'],explain:'Considero atrasado todo pedido com **data de entrega anterior a hoje** e status diferente de Entregue/Despachado.'},
{p:['mais vendido','top produto','vende mais','campeao','ranking produto'],fn:(s)=>{const c={};s.data.orders.forEach(o=>{const n=o.description||'?';c[n]=(c[n]||0)+1});const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,10);if(!sorted.length)return{t:'Sem vendas ainda.'};return{t:`**Top 10:**\n\n${sorted.map(([n,q],i)=>`${i+1}. **${n}** — ${q}x`).join('\n')}`,v:'reports'}}},
{p:['quantos pedidos','total pedidos'],period:true,fn:(s,p)=>{const o=fop(s.data.orders,p);const e=o.filter(x=>x.status==='Entregue').length;return{t:`**Pedidos ${pl(p)}:** ${o.length}\nEntregues: ${e} | Pendentes: ${o.length-e}`,v:'reports'}}},
{p:['quantos clientes','total clientes'],fn:(s)=>{const t=(s.data.leads||[]).length;const a=(s.data.leads||[]).filter(l=>l.status==='Cliente').length;return{t:`**${t} contato(s):** ${a} ativos, ${t-a} leads`,v:'leads'}}},
{p:['melhor cliente','quem mais compra','top cliente'],fn:(s)=>{const c={};s.data.orders.forEach(o=>{const n=o.client||'?';c[n]=(c[n]||0)+N(o.charged)});const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,5);return{t:`**Top clientes:**\n\n${sorted.map(([n,v],i)=>`${i+1}. **${n}** — R$ ${f(v)}`).join('\n')}`,v:'leads'}}},
{p:['estoque','material acabando','critico','repor'],fn:(s)=>{const items=lowStock(s);if(!items.length)return{t:'Estoque OK. 👍 Nada abaixo do mínimo.'};return{t:`⚠️ **${items.length} crítico(s):**\n\n${items.map(i=>`• **${i.name}** — ${i.quantity||0}/${i.minimum_quantity||0} ${i.unit||'un.'}`).join('\n')}`,v:'materials'}},ins:(s)=>{const items=lowStock(s);if(!items.length)return[];const lines=['💡 Antes de comprar, pergunte **"previsão de demanda"** — eu calculo quanto você vai usar nas próximas 4 semanas e sugiro a quantidade certa.'];return lines},next:['Previsão de demanda','Gastos com material','Mais vendido']},
{p:['entregar amanha','entrega amanha','despachar amanha'],fn:(s)=>{const tm=new Date();tm.setDate(tm.getDate()+1);const td=tm.toISOString().split('T')[0];const o=s.data.orders.filter(x=>(x.deliveryDate||'').startsWith(td)&&x.status!=='Entregue');if(!o.length)return{t:'Nenhum pedido pra amanhã. 🎉'};return{t:`**${o.length} pra amanhã:**\n\n${o.map(x=>`• **${x.description}** (${x.orderCode||'?'}) — R$ ${f(N(x.charged))}`).join('\n')}`,v:'orders'}}},
{p:['previsao','demanda','o que comprar','sugestao de compra','quanto vou vender','projecao','comprar material'],fn:(s)=>{const fc=demandForecast(s);if(!fc.rows.length)return{t:'Ainda não tenho vendas suficientes nas últimas 8 semanas pra projetar demanda.'};const prods=fc.rows.slice(0,6).map(r=>`• **${r.name}** — ~${r.perWeek.toFixed(1)}/sem${r.trend===null?'':r.trend>=0?` (▲${r.trend.toFixed(0)}%)`:` (▼${Math.abs(r.trend).toFixed(0)}%)`} → ~${r.next4} em 4 sem`).join('\n');const mats=Object.entries(fc.materials).slice(0,5).map(([m,need])=>{const inv=(s.inventoryItems||[]).find(i=>normalize(i.name||'').includes(normalize(m))||normalize(m).includes(normalize(i.name||'')));const stock=inv?N(inv.quantity):null;const flag=stock!==null&&stock<need?` ⚠️ estoque ${stock} — **compre ~${Math.ceil(need-stock)}**`:stock!==null?` (estoque ${stock} ok)`:'';return`• **${m}**: uso projetado ~${Math.ceil(need)} em 4 sem${flag}`}).join('\n');return{t:`📈 **Previsão (média móvel 4 sem, tendência vs 4 sem anteriores):**\n\n${prods}${mats?`\n\n**Materiais:**\n${mats}`:''}\n\n_Estatística pura sobre seus pedidos — sem IA externa._`,v:'materials'}},next:['Estoque crítico','Mais vendido','Como melhorar?'],explain:'**Média móvel**: somei as vendas de cada produto nas últimas 4 semanas e dividi por 4 (ritmo semanal). A **tendência** compara com as 4 semanas anteriores. A projeção de material multiplica o ritmo × 4 semanas e desconta o estoque atual.'},
{p:['anuncios','quantos anuncios'],fn:(s)=>{const l=(s.data.marketplaceListings||[]);return{t:`**${l.length} anúncio(s)** (${l.filter(x=>x.status==='active').length} ativos)`,v:'marketplace'}}},
{p:['qual marketplace','melhor canal','onde vendo'],fn:(s)=>{const c={};s.data.orders.forEach(o=>{const ch=o.source||'manual';c[ch]=(c[ch]||0)+N(o.charged)});const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]);return{t:`**Vendas por canal:**\n\n${sorted.map(([k,v])=>`• **${k}**: R$ ${f(v)}`).join('\n')}`,v:'reports'}}},
{p:['resumo','visao geral','como esta','situacao','meu negocio'],fn:(s)=>{const o=s.data.orders||[];const c=s.data.cash||[];const now=new Date();const m=c.filter(x=>x.date&&new Date(x.date).getMonth()===now.getMonth());const i=m.reduce((a,x)=>a+N(x.income),0);const e=m.reduce((a,x)=>a+N(x.expense),0);const td=now.toISOString().split('T')[0];const pend=o.filter(x=>!['Entregue','Despachado'].includes(x.status)).length;const late=o.filter(x=>x.deliveryDate&&x.deliveryDate<td&&!['Entregue'].includes(x.status)).length;const inv=lowStock(s).length;return{t:`📊 **Resumo:**\n\n💰 Mês: R$ ${f(i)} entrada, R$ ${f(e)} saída, **R$ ${f(i-e)} lucro**\n📦 ${pend} pendentes, ${late} atrasados\n🔴 ${inv} estoque crítico\n📋 ${o.length} pedidos, 👥 ${(s.data.leads||[]).length} clientes`,v:'dashboard'}}},
{p:['gastos material','custo material','compras material'],period:true,fn:(s,p)=>{const m=fp(s.data.materials||[],p,'date');const t=m.reduce((a,x)=>a+N(x.total),0);return{t:`**Gastos materiais ${pl(p)}:** R$ ${f(t)} (${m.length} compras)`,v:'materials'}}},
{p:['dicas','como melhorar','melhorar meu negocio','conselho','sugestoes','o que posso melhorar','onde melhorar','me ajuda a crescer'],fn:(s)=>({t:businessTips(s),v:'dashboard'}),next:['Previsão de demanda','Lucro do mês','A receber']},
{p:['proximo feriado','feriado','feriados','emenda'],fn:()=>{const td=new Date().toISOString().split('T')[0];const next=Object.entries(CALENDAR_HOLIDAYS).filter(([d])=>d>=td).sort(([a],[b])=>a.localeCompare(b)).slice(0,3);if(!next.length)return{t:'Não tenho feriados cadastrados pra frente.'};const fmt=d=>{const[y,m,dd]=d.split('-');return`${dd}/${m}/${y}`};const days=Math.ceil((new Date(`${next[0][0]}T00:00:00`)-new Date(`${td}T00:00:00`))/86400000);return{t:`📅 **Próximos feriados:**\n\n${next.map(([d,n])=>`• ${fmt(d)} — ${n}`).join('\n')}\n\n${days<=7?`⚠️ O primeiro é em **${days} dia(s)** — Correios e ML não coletam no feriado, despache antes!`:'💡 Feriado não tem coleta dos Correios/ML — planeje o despacho com antecedência.'}`,v:'calendar'}},next:['Entregar hoje?','Entregar amanhã?']},
];

// Série semanal de vendas (pro gráfico inline do assistente)
export function weeklySales(s,weeks=8){
  const orders=s.data?.orders||[];
  const now=new Date();now.setHours(23,59,59,999);
  const out=[];
  for(let w=weeks-1;w>=0;w--){
    const end=new Date(now);end.setDate(end.getDate()-w*7);
    const start=new Date(end);start.setDate(start.getDate()-7);
    const rows=orders.filter(o=>{const d=new Date(o.createdAt||o.created_at||'');return !isNaN(d)&&d>start&&d<=end});
    out.push({label:w===0?'agora':`${w}sem`,total:rows.reduce((a,o)=>a+N(o.charged),0),count:rows.length});
  }
  return out;
}

// Candidatos "você quis dizer?" pra quando nada respondeu (miss)
export function knowledgeCandidates(query,n=3){
  const qt=tokenize(query);
  if(!qt.length)return[];
  const scored=[];
  for(const{e,toks}of kbIndex()){
    let sc=0,hits=0;
    for(const t of qt){let m=0;for(const kt of toks){const s=tokenSim(t,kt);if(s>m)m=s}if(m>0){sc+=m;hits++}}
    if(hits)scored.push({e,sc:sc*(hits/qt.length+.3)});
  }
  return scored.sort((a,b)=>b.sc-a.sc).slice(0,n).filter(x=>x.sc>=.35).map(x=>x.e.k[0]);
}

function N(v){return Number(v||0)}
function f(n){return N(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
function pl(p){return p==='today'?'de hoje':p==='yesterday'?'de ontem':p==='week'?'desta semana':p==='year'?'deste ano':'deste mês'}
export function detectPeriod(t){const q=normalize(t);if(/\bhoje\b/.test(q))return'today';if(/\bontem\b/.test(q))return'yesterday';if(/semana/.test(q))return'week';if(/\bano\b|anual/.test(q))return'year';return'month'}
function sameDay(d,ref){return d.toDateString()===ref.toDateString()}
function inPeriod(d,period){const now=new Date();if(isNaN(d))return false;if(period==='today')return sameDay(d,now);if(period==='yesterday'){const y=new Date(now);y.setDate(y.getDate()-1);return sameDay(d,y)}if(period==='week'){const w=new Date(now);w.setDate(w.getDate()-7);return d>=w}if(period==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();if(period==='year')return d.getFullYear()===now.getFullYear();return true}
function fp(arr,period,df='date'){return (arr||[]).filter(c=>c[df]&&inPeriod(new Date(c[df]),period))}
function fop(o,p){return (o||[]).filter(x=>inPeriod(new Date(x.createdAt||x.created_at||''),p))}

// Período ANTERIOR equivalente (pra comparação "vs mês passado" nos insights)
function inPrevPeriod(d,period){const now=new Date();if(isNaN(d))return false;
  if(period==='today'){const y=new Date(now);y.setDate(y.getDate()-1);return sameDay(d,y)}
  if(period==='yesterday'){const y=new Date(now);y.setDate(y.getDate()-2);return sameDay(d,y)}
  if(period==='week'){const a=new Date(now);a.setDate(a.getDate()-14);const b=new Date(now);b.setDate(b.getDate()-7);return d>=a&&d<b}
  if(period==='year')return d.getFullYear()===now.getFullYear()-1;
  const pm=new Date(now.getFullYear(),now.getMonth()-1,1);return d.getMonth()===pm.getMonth()&&d.getFullYear()===pm.getFullYear()}
function fpPrev(arr,period,df='date'){return (arr||[]).filter(c=>c[df]&&inPrevPeriod(new Date(c[df]),period))}
function fopPrev(o,p){return (o||[]).filter(x=>inPrevPeriod(new Date(x.createdAt||x.created_at||''),p))}
function plPrev(p){return p==='today'?'ontem':p==='yesterday'?'anteontem':p==='week'?'a semana anterior':p==='year'?'o ano passado':'o mês passado'}
export function pick(arr){return arr[Math.floor(Math.random()*arr.length)]}
function deltaLine(cur,prev,p){if(!(Math.abs(prev)>0.005))return null;const d=(cur-prev)/Math.abs(prev)*100;if(Math.abs(d)<1)return `➡️ Estável comparado com ${plPrev(p)}.`;return d>0?`📈 **${d.toFixed(0)}% acima** comparado com ${plPrev(p)} (era R$ ${f(prev)}). Bom sinal!`:`📉 **${Math.abs(d).toFixed(0)}% abaixo** comparado com ${plPrev(p)} (era R$ ${f(prev)}).`}

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
      return{type:'data',text:`**${hit}** — ${os.length} pedido(s), total R$ ${f(total)}\n\n${os.slice(0,8).map(o=>`• ${o.description||'?'} — R$ ${f(N(o.charged))} (${o.status||'?'})`).join('\n')}`,action:{view:'orders'},entityName:hit};
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
    return{type:'data',text:`**${ph}** — ${os.length} venda(s), R$ ${f(total)} no total${last?`\nÚltima venda: ${String(last).split('T')[0]}`:''}`,action:{view:'reports'},entityName:ph};
  }
  return null;
}

// Pergunta composta: "lucro e atrasados", "vendas, estoque e a receber".
// Divide em partes e responde cada uma; só vale se >= 2 partes resolverem
// pra consultas DISTINTAS (senão deixa o fluxo normal responder).
export function searchComposite(query,stateRef){
  const parts=String(query).split(/\s+e\s+|[,;]+/).map(p=>p.trim()).filter(p=>p.length>=3);
  if(parts.length<2||parts.length>4)return null;
  const seen=new Set();const out=[];
  for(const p of parts){
    const r=searchDataQuery(p,stateRef)||searchEntityQuery(p,stateRef);
    if(!r||r.type!=='data')continue;
    const key=r.dq?DATA_QUERIES.indexOf(r.dq):`ent:${r.entityName||r.text.slice(0,24)}`;
    if(seen.has(key))continue;
    seen.add(key);
    out.push(r);
  }
  if(out.length<2)return null;
  return{type:'data',text:out.map(r=>r.text).join('\n\n———\n\n'),action:out[0].action,parts:out};
}

// ============================== CONTEXTO/UI ==============================

export function getContextualSuggestions(view){
  const s={dashboard:['Como está meu negócio?','Lucro do mês?','Atrasados?','Estoque crítico?'],orders:['Entregar hoje?','Pendentes?','Como criar encomenda?'],production:['Personalizar etapas?','Pendentes?'],logistics:['Como rastrear?','Atrasados?'],leads:['Quantos clientes?','Top cliente?'],cash:['Lucro do mês?','A receber?','Despesas do mês?'],materials:['Estoque crítico?'],reports:['Mais vendido?','Vendas do mês?'],marketplace:['Taxas do ML?','Como exportar?','Preço médio de um produto?'],calendar:['Vencimentos?','DAS?'],fiscal:['DAS MEI?','Nota fiscal?']};
  return s[view]||s.dashboard;
}

// Itens de estoque abaixo do mínimo (campos reais do schema: quantity/minimum_quantity)
export function lowStock(s){
  return (s.inventoryItems||[]).filter(i=>N(i.quantity)<=N(i.minimum_quantity));
}

// ============================== SMALL TALK ==============================
// Conversa natural: saudações, agradecimento, despedida, identidade.

export function searchSmallTalk(query){
  const q=normalize(query);
  const words=q.split(' ').filter(Boolean);
  if(/^(oi+|ola|eai|e ai|opa|hey|salve|bom dia|boa tarde|boa noite|tudo bem|td bem|como vai)\b/.test(q)&&words.length<=4){
    const h=new Date().getHours();
    const sauda=h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
    return pick([
      `${sauda}! 😊 Como posso ajudar? Se quiser um panorama rápido, pergunte **"como está meu negócio?"**.`,
      `${sauda}! Tudo certo por aqui. Quer ver o **resumo do dia** ou consultar algo específico?`,
      `Oi! ${sauda}! 👋 Posso puxar seus números, explicar o sistema ou dar dicas — o que precisa?`,
    ]);
  }
  if(/\b(obrigad\w*|valeu|vlw|brigad\w*|agradec\w*)\b/.test(q)&&words.length<=5){
    return pick([
      'Por nada! 😊 Qualquer coisa é só chamar — e se a resposta ajudou, o 👍 me faz aprender.',
      'Tamo junto! 🚀 Se quiser, posso dar umas **dicas pro negócio** — é só pedir.',
      'De nada! Estou aqui sempre que precisar.',
    ]);
  }
  if(/\b(tchau|ate mais|ate logo|falou|flw|fui)\b/.test(q)&&words.length<=3){
    return pick(['Até mais! 👋 Boa produção!','Falou! Qualquer coisa estou por aqui — **Alt+A** me chama.']);
  }
  if(/\b(quem e voce|o que voce faz|voce e uma ia|qual seu nome|o que voce sabe)\b/.test(q)){
    return 'Sou o **assistente do FlowOps** 🤖 — rodo 100% dentro do sistema, sem mandar seus dados pra nenhuma IA externa.\n\nSei consultar seus números, explicar funcionalidades, pesquisar preços no Mercado Livre, prever demanda e dar dicas pro negócio. E aprendo: cada 👍/👎 seu me deixa melhor.\n\nDigite **/ajuda** pra ver tudo.';
  }
  return null;
}

// ============================== COACH DE NEGÓCIO ==============================
// Dicas priorizadas por regras sobre os dados reais — sem IA externa.

export function businessTips(s){
  const tips=[];
  const orders=s.data?.orders||[];
  const cash=s.data?.cash||[];
  const td=new Date().toISOString().split('T')[0];
  // 1. Prejuízo/margem do mês
  const m=fp(cash,'month');
  const inc=m.reduce((a,x)=>a+N(x.income),0),exp=m.reduce((a,x)=>a+N(x.expense),0);
  if(inc>0&&inc-exp<0)tips.push({pr:1,t:`🚨 **Mês no prejuízo** (R$ ${f(inc-exp)}). Abra "despesas do mês" e corte as 2 maiores categorias que não geram venda.`});
  else if(inc>0&&(inc-exp)/inc<0.1)tips.push({pr:2,t:`⚠️ **Margem do mês abaixo de 10%.** Use a Calculadora da Inteligência pra reprecificar os produtos que mais vendem.`});
  // 2. Atrasados
  const late=orders.filter(o=>o.deliveryDate&&o.deliveryDate<td&&!['Entregue','Despachado'].includes(o.status));
  if(late.length)tips.push({pr:2,t:`⏰ **${late.length} pedido(s) atrasado(s).** Avise os clientes via WhatsApp hoje — atraso comunicado desgasta bem menos que atraso silencioso.`});
  // 3. A receber concentrado/alto
  const rec=orders.filter(o=>N(o.charged)>0&&N(o.received)===0);
  const recT=rec.reduce((a,o)=>a+N(o.charged),0);
  if(recT>0&&inc>0&&recT>inc*0.5)tips.push({pr:2,t:`💰 **R$ ${f(recT)} parados em cobranças** (mais da metade do que entrou no mês). Reserve 30 min hoje pra cobrar os maiores.`});
  // 4. Estoque
  const low=lowStock(s);
  if(low.length)tips.push({pr:3,t:`📦 **${low.length} materiais abaixo do mínimo.** Pergunte "previsão de demanda" antes de comprar — evita capital parado em excesso.`});
  // 5. Clientes inativos com histórico
  const byClient={};
  orders.forEach(o=>{const c=o.client;if(!c)return;const d=o.createdAt||o.created_at;const e=byClient[c]=byClient[c]||{count:0,last:''};e.count++;if(d&&d>e.last)e.last=d});
  const cutoff=new Date(Date.now()-60*86400000).toISOString();
  const inactive=Object.entries(byClient).filter(([,v])=>v.count>=2&&v.last&&v.last<cutoff);
  if(inactive.length)tips.push({pr:4,t:`👥 **${inactive.length} cliente(s) recorrentes sumidos há 60+ dias** (ex.: ${inactive.slice(0,2).map(([n])=>n).join(', ')}). Uma mensagem "novidade + cupom" costuma reativar.`});
  // 6. Tendência de queda no top produto
  const fc=demandForecast(s);
  const falling=fc.rows.find(r=>r.trend!==null&&r.trend<-30);
  if(falling)tips.push({pr:4,t:`📉 **${falling.name}** caiu ${Math.abs(falling.trend).toFixed(0)}% vs as 4 semanas anteriores. Confira preço vs concorrência: "preço médio de ${falling.name}".`});
  // 7. Caixa sem lançamentos recentes
  const lastCash=cash.map(c=>c.date).filter(Boolean).sort().pop();
  if(cash.length&&lastCash&&lastCash<new Date(Date.now()-7*86400000).toISOString().split('T')[0])tips.push({pr:5,t:`📝 Nenhum lançamento no caixa há mais de 7 dias. Caixa desatualizado = decisão no escuro.`});
  // 8. Sem dicas críticas → reforço positivo
  if(!tips.length)return '✅ **Analisei seus dados e está tudo saudável!**\n\nSem atrasos, margem ok, estoque em dia. Pra crescer a partir daqui:\n\n• Suba anúncios pra **Premium** nos produtos com margem >30%\n• Expanda o campeão de vendas pra **Shopee** (exportação pronta no Marketplace)\n• Crie **kits/combos** pra subir o ticket médio';
  tips.sort((a,b)=>a.pr-b.pr);
  return `🎯 **Analisei seus dados. Prioridades:**\n\n${tips.slice(0,5).map((x,i)=>`${i+1}. ${x.t}`).join('\n\n')}`;
}

// ============================== PREVISÃO DE DEMANDA ==============================
// Média móvel semanal (últimas 4 semanas) + tendência vs as 4 anteriores.
// Estatística pura sobre os pedidos — sem IA.

export function demandForecast(s){
  const orders=s.data?.orders||[];
  const now=Date.now();
  const byProd={};
  orders.forEach(o=>{
    const d=new Date(o.createdAt||o.created_at||'');
    if(isNaN(d))return;
    const weeks=(now-d.getTime())/(7*86400000);
    if(weeks>8)return;
    const k=o.description||'?';
    const e=byProd[k]=byProd[k]||{recent:0,prev:0,material:o.material||null};
    const qty=Math.max(1,N(o.quantity)||1);
    if(weeks<=4)e.recent+=qty;else e.prev+=qty;
  });
  const rows=Object.entries(byProd)
    .map(([name,v])=>({name,material:v.material,perWeek:v.recent/4,trend:v.prev>0?((v.recent-v.prev)/v.prev*100):null,next4:Math.ceil(v.recent||0)}))
    .filter(r=>r.perWeek>0)
    .sort((a,b)=>b.perWeek-a.perWeek);
  const materials={};
  rows.forEach(r=>{if(r.material)materials[r.material]=(materials[r.material]||0)+r.perWeek*4});
  return{rows,materials};
}

// ============================== RESUMO PROATIVO DO DIA ==============================
// Retorna null quando não há nada acionável (o assistente não incomoda à toa).

export function buildDailyDigest(s){
  const orders=s.data?.orders||[];
  if(!orders.length&&!(s.inventoryItems||[]).length)return null;
  const td=new Date().toISOString().split('T')[0];
  const tm=new Date();tm.setDate(tm.getDate()+1);
  const tdT=tm.toISOString().split('T')[0];
  const open=o=>!['Entregue','Despachado'].includes(o.status);
  const today=orders.filter(o=>(o.deliveryDate||'')===td&&open(o));
  const tomorrow=orders.filter(o=>(o.deliveryDate||'')===tdT&&open(o));
  const late=orders.filter(o=>o.deliveryDate&&o.deliveryDate<td&&open(o));
  const stock=lowStock(s);
  const receivable=orders.filter(o=>N(o.charged)>0&&N(o.received)===0);
  const recTotal=receivable.reduce((a,o)=>a+N(o.charged),0);
  const lines=[];
  if(late.length)lines.push(`⚠️ **${late.length} pedido(s) atrasado(s)** — priorize hoje`);
  if(today.length)lines.push(`📦 **${today.length} entrega(s) pra hoje**`);
  if(tomorrow.length)lines.push(`🗓️ ${tomorrow.length} entrega(s) amanhã`);
  if(stock.length)lines.push(`🔴 ${stock.length} item(ns) de estoque abaixo do mínimo`);
  if(receivable.length)lines.push(`💰 R$ ${f(recTotal)} a receber (${receivable.length} pedidos)`);
  try{
    const fc=demandForecast(s);
    const worst=Object.entries(fc.materials).map(([m,need])=>{const inv=(s.inventoryItems||[]).find(i=>normalize(i.name||'').includes(normalize(m))||normalize(m).includes(normalize(i.name||'')));return inv&&N(inv.quantity)<need?{m,falta:Math.ceil(need-N(inv.quantity))}:null}).filter(Boolean).sort((a,b)=>b.falta-a.falta)[0];
    if(worst)lines.push(`🛒 Previsão: **${worst.m}** deve faltar (~${worst.falta} un. em 4 semanas)`);
  }catch(e){/* previsão nunca derruba o digest */}
  // Segunda-feira: convite pra análise semanal do coach
  if(new Date().getDay()===1)lines.push('🎯 Segunda! Bora começar bem: pergunte **"como melhorar?"** que eu analiso o negócio e listo as prioridades da semana.');
  if(!lines.length)return null;
  return`☀️ **Resumo de hoje:**\n\n${lines.join('\n')}\n\n_Pergunte "atrasados", "entregar hoje" ou "previsão de demanda" pra detalhar._`;
}

export function generateBusinessContext(s){
  const o=s.data?.orders||[],c=s.data?.cash||[],now=new Date();
  const m=c.filter(x=>x.date&&new Date(x.date).getMonth()===now.getMonth());
  const i=m.reduce((a,x)=>a+N(x.income),0),e=m.reduce((a,x)=>a+N(x.expense),0);
  const pend=o.filter(x=>!['Entregue','Despachado'].includes(x.status)).length;
  return`Empresa: ${s.companyName||'FlowOps'}. Mês atual: R$${f(i)} entrada, R$${f(e)} saída, R$${f(i-e)} lucro. ${o.length} pedidos (${pend} pendentes). ${(s.data?.leads||[]).length} clientes. ${(s.data?.marketplaceListings||[]).length} anúncios.`;
}
