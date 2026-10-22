import {$,dados,usuario,esc,brl,dia,tabela,indicadores,titulo,campo,dialogo,conectar,api,carregar,confirmar,moeda,chave,opcoesClientes,aviso} from './gestao.js';
import {gerarPix,verPix,gerarPixEmLote,pendentesDePix} from './gestao-pix.js';
import {abrirMensagem} from './gestao-lembretes.js';
const tipos={implantacao:'Implantação',produtos:'Produtos adicionais',suporte:'Suporte',plano:'Plano Cardapio.ai',outro:'Outro serviço'};
const nomeMov={recebimento:'Recebimento',despesa:'Despesa',plataforma:'Pagamento Cardapio.ai',repasse:'Repasse',estorno:'Estorno'};
const hoje=()=>dados.hoje;
const opcoesCobrancas=()=>dados.cobrancas.filter(c=>!c.cancelada).map(c=>[c.id,`${c.cliente} · ${c.descricao}`]);
export function novaCobranca(clienteId){
  const cliente=dados.clientes.find(c=>c.id===clienteId);
  const pedido=chave();
  dialogo('Nova cobrança',[
    campo('loja_id','Cliente','select',clienteId||'',{opcoes:opcoesClientes()}),campo('tipo','Componente','select','implantacao',{opcoes:Object.entries(tipos)}),
    campo('descricao','Descrição','text','Implantação da loja'),campo('valor','Valor (R$)','number',cliente?(cliente.implantacao_centavos+Math.max(0,cliente.produtos_contratados-25)*cliente.adicional_centavos)/100:'400'),
    campo('vencimento','Vencimento','date',cliente?.vencimento||hoje()),campo('custo_previsto','Custo previsto (R$)','number','0')
  ],b=>api('/api/gestao/cobrancas','POST',{...b,loja_id:Number(b.loja_id),valor:moeda(b.valor),custo_previsto:moeda(b.custo_previsto),pedido}),
  'Cada componente tem sua cobrança. O plano Cardapio.ai fica reservado e não participa da divisão.');
}
export function movimento(tipo,cid){
  const c=dados.cobrancas.find(c=>c.id===cid),pedido=chave();
  const sugestao=c?{recebimento:c.pendente,repasse:c.disponivel,plataforma:c.reserva,despesa:0}[tipo]:0;
  dialogo(nomeMov[tipo],[campo('cobranca_id','Cobrança / serviço','select',cid||'',{opcoes:tipo==='despesa'?[[0,'Despesa geral para ratear'],...opcoesCobrancas().filter(([id])=>dados.cobrancas.find(c=>c.id===id).tipo!=='plano')]:opcoesCobrancas()}),
    campo('valor','Valor (R$)','number',sugestao/100),campo('data','Data','date',hoje()),campo('descricao','Descrição','text',nomeMov[tipo]),
    ...(tipo==='despesa'?[campo('categoria','Categoria','select','IA',{opcoes:['IA','Fotos','Ferramentas','Servidor','Taxas','Terceiros','Outros'].map(v=>[v,v])})]:[])
  ],b=>api('/api/gestao/movimentos','POST',{...b,tipo,cobranca_id:Number(b.cobranca_id)||null,valor:moeda(b.valor),pedido}),
    tipo==='repasse'?'O valor disponível considera custos fechados e pagamentos recebidos.':tipo==='recebimento'?'Registre apenas a parte deste componente. Um Pix com suporte e plano deve ser distribuído entre as duas cobranças.':'Informe o valor efetivamente pago.');
}
export async function cobrancas(){
  $('conteudo').innerHTML=titulo('Cobranças','Serviços avulsos e mensalidades (suporte + plano) de cada loja.',usuario.admin?'<button id="novaCobranca" class="principal">Nova cobrança</button><button id="novoContrato">Novo contrato mensal</button><button id="recorrencias">Gerar mensalidades</button><button id="pixLote">Gerar Pix da plataforma</button>':'')+
    `<div class="filtros"><label>Buscar<input id="buscaCobranca" placeholder="Cliente ou descrição"></label><label>Situação<select id="estadoCobranca"><option value="">Todas</option><option value="pendente">Pendentes</option><option value="parcial">Parciais</option><option value="paga">Pagas</option><option value="cancelada">Canceladas</option></select></label></div><div id="listaCobrancas"></div>`;
  const divisao=c=>c.tipo==='plano'?`Reserva: ${brl(c.reserva)}<small>Pago à plataforma: ${brl(c.plataforma_paga)}</small>${c.pix_codigo?`<small>Pix ${esc(c.pix_competencia||'')} pronto para pagar</small>`:''}`
    :`${usuario.admin?`Custos: ${brl(c.custos)}<small>${c.custos_fechados?'Custos fechados':'Custos em aberto'}</small>`:''}<small>Previsão de repasse: ${brl(c.previsao)}</small><small>Disponível: ${brl(c.disponivel)}</small>`;
  // Acoes de um componente. Na mensalidade unica o Receber e da mensalidade inteira, entao sai daqui.
  const acoes=(c,receber=true)=>usuario.admin&&!c.cancelada?`${receber&&c.pendente?`<button data-receber="${c.id}" class="mini">Receber</button>`:''}${c.tipo==='plano'?(c.reserva?`<button data-plano="${c.id}" class="mini">Pagar plano</button>`:'')+(c.plataforma_paga<c.valor?(c.pix_codigo?`<button data-ver-pix="${c.id}" class="mini">Ver Pix</button><button data-gerar-pix="${c.id}" class="mini">Gerar novo Pix</button>`:`<button data-gerar-pix="${c.id}" class="mini">Gerar Pix da plataforma</button>`):''):`<button data-custo="${c.id}" class="mini">Despesa</button><button data-fechar="${c.id}" class="mini">${c.custos_fechados?'Reabrir custos':'Fechar custos'}</button>${c.disponivel?`<button data-repasse="${c.id}" class="mini">Repassar</button>`:''}`}<button data-cancelar="${c.id}" class="mini">Cancelar</button>`:'';
  const situacao=partes=>partes.every(c=>c.cancelada)?'cancelada':partes.every(c=>c.cancelada||c.estado==='paga')?'paga':partes.some(c=>c.recebido)?'parcial':'pendente';
  function simples(c){return `<tr>
      <td><a href="#cliente-${c.loja_id}">${esc(c.cliente)}</a><small>${esc(c.descricao)}</small><span class="marca">${esc(c.estado)}</span>${c.enviada_em?'<small>Cobrança enviada</small>':''}</td>
      <td>${dia(c.vencimento)}</td><td>${brl(c.valor)}<small>Recebido: ${brl(c.recebido)}</small><small>Falta: ${brl(c.pendente)}</small></td>
      <td>${divisao(c)}</td><td>${acoes(c)}
      ${c.pendente&&!c.cancelada?`<button data-mensagem="${c.id}" class="mini">Preparar mensagem</button><button data-enviada="${c.id}" class="mini">Marcar enviada</button>`:''}</td></tr>`;}
  // Suporte + plano do mesmo contrato e do mesmo mes aparecem como uma mensalidade so.
  function mensalidade(partes){
    const c=partes[0],soma=k=>partes.reduce((n,p)=>n+p[k],0),falta=soma('pendente'),chaveMensal=`${c.grupo}|${c.competencia}`;
    return `<tr class="mensalidade">
      <td><a href="#cliente-${c.loja_id}">${esc(c.cliente)}</a><small>Mensalidade ${esc(c.competencia)} · suporte + plano</small><span class="marca">${situacao(partes)}</span>${partes.some(p=>p.enviada_em)?'<small>Cobrança enviada</small>':''}</td>
      <td>${dia(c.vencimento)}</td><td>${brl(soma('valor'))}<small>Recebido: ${brl(soma('recebido'))}</small><small>Falta: ${brl(falta)}</small></td>
      <td>${partes.map(p=>`<div class="parte"><b>${tipos[p.tipo]} · ${brl(p.valor)}</b>${divisao(p)}</div>`).join('')}</td>
      <td>${usuario.admin&&falta?`<button data-receber-mensal="${esc(chaveMensal)}" class="mini principal">Receber mensalidade</button>`:''}
        ${falta?`<button data-mensagem-mensal="${esc(chaveMensal)}" class="mini">Preparar mensagem</button><button data-enviada="${partes.map(p=>p.id).join(',')}" class="mini">Marcar enviada</button>`:''}
        ${partes.map(p=>acoes(p,false)?`<div class="parte"><small>${tipos[p.tipo]}</small>${acoes(p,false)}</div>`:'').join('')}</td></tr>`;
  }
  const partesDe=chaveMensal=>dados.cobrancas.filter(c=>c.grupo&&`${c.grupo}|${c.competencia}`===chaveMensal&&!c.cancelada);
  function listar(){const busca=$('buscaCobranca').value.toLowerCase(),estado=$('estadoCobranca').value;
    const vistas=new Set(),linhas=[];
    for(const c of dados.cobrancas.filter(c=>`${c.cliente} ${c.descricao}`.toLowerCase().includes(busca))){
      if(c.grupo&&c.competencia){
        const chaveMensal=`${c.grupo}|${c.competencia}`;if(vistas.has(chaveMensal))continue;vistas.add(chaveMensal);
        const partes=dados.cobrancas.filter(p=>p.grupo===c.grupo&&p.competencia===c.competencia);
        if(!estado||situacao(partes)===estado)linhas.push(mensalidade(partes));
      }else if(!estado||c.estado===estado)linhas.push(simples(c));
    }
    $('listaCobrancas').innerHTML=tabela(['Cliente / serviço','Vencimento','Valor / recebido','Custos / divisão','Ações'],linhas);
    const cobranca=id=>dados.cobrancas.find(c=>c.id===Number(id));
    conectar({'[data-gerar-pix]':b=>gerarPix(cobranca(b.dataset.gerarPix)),'[data-ver-pix]':b=>verPix(cobranca(b.dataset.verPix)),
      '[data-receber-mensal]':b=>receberMensalidade(partesDe(b.dataset.receberMensal)),
      '[data-mensagem-mensal]':b=>abrirMensagem({cobrancas:partesDe(b.dataset.mensagemMensal).map(p=>p.id)}),
      '[data-receber]':b=>movimento('recebimento',Number(b.dataset.receber)),'[data-plano]':b=>movimento('plataforma',Number(b.dataset.plano)),
      '[data-custo]':b=>movimento('despesa',Number(b.dataset.custo)),'[data-repasse]':b=>movimento('repasse',Number(b.dataset.repasse)),
      '[data-fechar]':async b=>{const c=dados.cobrancas.find(c=>c.id===Number(b.dataset.fechar));
        if(await confirmar(c.custos_fechados?'Reabrir os custos? Repasses existentes precisam ser estornados antes.':`Fechar os custos em ${brl(c.custos)}? A divisão será calculada após descontar esse valor.`)){await api(`/api/gestao/cobrancas/${c.id}/custos`,'PUT',{fechados:!c.custos_fechados});await carregar();}},
      '[data-cancelar]':b=>{const pedido=chave();dialogo('Cancelar cobrança',[campo('motivo','Motivo','textarea')],v=>api(`/api/gestao/cobrancas/${b.dataset.cancelar}/cancelar`,'POST',{...v,pedido}));},
      '[data-enviada]':async b=>{for(const id of b.dataset.enviada.split(','))await api(`/api/gestao/cobrancas/${id}/enviada`,'POST',{});await carregar();},
      '[data-mensagem]':b=>abrirMensagem({cobrancas:[Number(b.dataset.mensagem)]})});
  }
  listar();$('buscaCobranca').oninput=listar;$('estadoCobranca').onchange=listar;
  if(usuario.admin){$('novaCobranca').onclick=()=>novaCobranca();$('novoContrato').onclick=()=>novoContrato();
    $('pixLote').onclick=()=>gerarPixEmLote(pendentesDePix());
    $('recorrencias').onclick=()=>dialogo('Gerar mensalidades',[campo('competencia','Até o mês','month',hoje().slice(0,7)),
      campo('pix','Pix da plataforma','select','sim',{opcoes:[['sim','Gerar agora no Cardapio.ai de cada loja'],['nao','Gerar depois']]})],
      async b=>{await api('/api/gestao/recorrencias','POST',{competencia:b.competencia});
        // O Pix sai do Cardapio.ai de cada loja, uma de cada vez, numa janela propria.
        if(b.pix==='sim'){await carregar();gerarPixEmLote(pendentesDePix());}},
      'Cobranças existentes são preservadas; não serão duplicadas. O Pix só é gerado para o plano de lojas com login do Cardapio.ai.');}
}
/** Contratos do mesmo grupo (suporte + plano criados juntos) viram uma linha. */
function agruparContratos(lista){
  const vistos=new Set(),grupos=[];
  for(const t of lista){if(!t.grupo){grupos.push([t]);continue;}if(vistos.has(t.grupo))continue;vistos.add(t.grupo);grupos.push(lista.filter(x=>x.grupo===t.grupo));}
  return grupos;
}
export function novoContrato(cid){const c=dados.clientes.find(c=>c.id===cid),pedido=chave();
  dialogo('Contrato mensal',[campo('loja_id','Cliente','select',cid||'',{opcoes:opcoesClientes()}),
    campo('suporte','Seu suporte por mês (R$)','number',(c?.suporte_centavos||0)/100),campo('plano','Plano Cardapio.ai por mês (R$)','number',(c?.plano_centavos||0)/100),
    campo('inicio','Primeiro vencimento','date',c?.vencimento||hoje())
  ],b=>api('/api/gestao/contratos','POST',{loja_id:Number(b.loja_id),tipo:'mensal',suporte:moeda(b.suporte||0),plano:moeda(b.plano||0),inicio:b.inicio,pedido}),
    'Um contrato por loja: suporte e plano vencem juntos e viram uma mensalidade só. O plano fica reservado para pagar o Cardapio.ai; o suporte entra na divisão com o atendente. Para mudar valores, encerre o contrato e crie outro.');
}
/** Um recebimento para a mensalidade inteira: o servidor quita o plano primeiro e manda o resto para o suporte. */
function receberMensalidade(partes){
  const c=partes[0],plano=partes.find(p=>p.tipo==='plano'),falta=partes.reduce((n,p)=>n+p.pendente,0),pedido=chave();
  dialogo('Receber mensalidade',[campo('valor','Valor recebido (R$)','number',falta/100),campo('data','Data','date',hoje()),campo('descricao','Descrição','text','Pix do cliente')],
    b=>api('/api/gestao/mensalidades/receber','POST',{...b,grupo:c.grupo,competencia:c.competencia,valor:moeda(b.valor),pedido}),
    `O valor quita primeiro o plano${plano?.pendente?` (falta ${brl(plano.pendente)})`:''} e o restante vai para o suporte.`);
}
function exportar(){
  const coluna=v=>{let s=String(v??'');if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const linhas=[['Data','Tipo','Cliente','Descrição','Valor (R$)','Estorno de'],...dados.movimentos.filter(m=>m.data>=dados.inicio&&m.data<=dados.fim).map(m=>[m.data,nomeMov[m.tipo],m.cliente,m.descricao,(m.valor/100).toFixed(2),m.estorno_de])];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+linhas.map(l=>l.map(coluna).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`financeiro-${dados.inicio}-${dados.fim}.csv`;a.click();URL.revokeObjectURL(url);
}
export async function financeiro(){
  const r=dados.resumo;
  const porId=new Map(dados.movimentos.map(m=>[m.id,m])),meses=new Map();
  for(const m of dados.movimentos.filter(m=>m.data>=dados.inicio&&m.data<=dados.fim)){
    const origem=m.tipo==='estorno'?porId.get(m.estorno_de):m,sinal=m.tipo==='estorno'?-1:1;if(!origem)continue;
    const mes=m.data.slice(0,7),valores=meses.get(mes)||{receita:0,custos:0};
    if(origem.tipo==='recebimento'&&dados.cobrancas.find(c=>c.id===origem.cobranca_id)?.tipo!=='plano')valores.receita+=m.valor*sinal;
    if(origem.tipo==='despesa')valores.custos+=m.valor*sinal;meses.set(mes,valores);
  }
  const maximo=Math.max(1,...[...meses.values()].flatMap(m=>[Math.abs(m.receita),Math.abs(m.custos)]));
  const grafico=`<div class="cartao"><h2>Receita de serviços e despesas por mês</h2><div class="barras">${[...meses.entries()].sort().map(([mes,v])=>`<div class="barra-dado"><span>${esc(mes)} · receita</span><meter min="0" max="${maximo}" value="${Math.max(0,v.receita)}">${brl(v.receita)}</meter><span>${brl(v.receita)}</span></div><div class="barra-dado"><span>${esc(mes)} · despesas</span><meter min="0" max="${maximo}" value="${Math.max(0,v.custos)}">${brl(v.custos)}</meter><span>${brl(v.custos)}</span></div>`).join('')||'<p class="suave">Selecione um período com movimentos.</p>'}</div></div>`;
  $('conteudo').innerHTML=titulo('Financeiro','Recebimentos e pagamentos no período selecionado.','<button id="despesaGeral">Lançar despesa</button><button id="csv">Exportar CSV</button>')+
    (!dados.movimentos.some(m=>m.data>=dados.inicio&&m.data<=dados.fim)?'<p class="atencao">Ainda não há movimentos neste período. Em <a href="#cobrancas">Cobranças</a>, registre o dinheiro que o cliente já pagou. Se os registros forem de outra data, ajuste De e Até acima. Cadastrar a loja ou criar a cobrança não registra um recebimento.</p>':'')+
    indicadores([['Recebido',brl(r.recebido)],['Receita de serviços',brl(r.receita_servicos)],['Despesas pagas',brl(r.despesas)],['Comissões geradas',brl(r.comissao)],['Movimento de caixa',brl(r.caixa)],['Resultado operacional',brl(r.resultado)],['Reserva do Cardapio.ai',brl(r.reserva),'Saldo acumulado'],['Repasses disponíveis',brl(r.disponivel),'Saldo acumulado']])+
    (r.custos_abertos?`<p class="atencao">${r.custos_abertos} serviço(s) com custos em aberto. O resultado ainda pode mudar após o fechamento.</p>`:'')+
    (r.despesas_sem_rateio?`<p class="atencao">${brl(r.despesas_sem_rateio)} em despesas gerais sem rateio. Distribua entre os serviços para descontar esses custos antes da divisão.</p>`:'')+
    grafico+`<div class="cartao"><h2>Carteira financeira por cliente · acumulado</h2>${tabela(['Cliente','Serviços recebidos','Custos atribuídos','Parte da equipe','Parte da operação','Tempo registrado','Resultado por hora'],dados.clientes.map(l=>{
      const cs=dados.cobrancas.filter(c=>c.loja_id===l.id&&c.tipo!=='plano'&&!c.cancelada),recebido=cs.reduce((n,c)=>n+c.recebido,0),custos=cs.reduce((n,c)=>n+c.custos,0),parte=cs.reduce((n,c)=>n+c.liberado,0);
      const minutos=dados.tarefas.filter(t=>t.loja_id===l.id).reduce((s,t)=>s+t.minutos,0),resultado=recebido-custos-parte;
      return `<tr><td><a href="#cliente-${l.id}">${esc(l.nome)}</a></td><td>${brl(recebido)}</td><td>${brl(custos)}</td><td>${brl(parte)}</td><td>${brl(resultado)}</td><td>${minutos} min</td><td>${minutos?brl(Math.round(resultado*60/minutos)):'Sem tempo registrado'}</td></tr>`;
    }))}<p class="suave">A parte da operação ainda não desconta despesas gerais sem rateio. Valores com custos abertos são provisórios.</p></div>
    <div class="cartao"><h2>Histórico de movimentos</h2>${tabela(['Data','Tipo','Cliente / descrição','Valor','Ações'],dados.movimentos.filter(m=>m.data>=dados.inicio&&m.data<=dados.fim).map(m=>`<tr>
      <td>${dia(m.data)}</td><td>${nomeMov[m.tipo]}${m.estornado_por?'<small>Estornado</small>':''}</td><td>${esc(m.cliente||'Operação')}<small>${esc(m.descricao)}</small></td><td>${brl(m.valor)}</td>
      <td><button data-comprovante="${m.id}" class="mini">Anexar comprovante</button><button data-ver-comprovante="${m.id}" class="mini">Ver anexos</button>${m.tipo!=='estorno'&&!m.estornado_por?`<button data-estorno="${m.id}" class="mini">Estornar</button>${m.tipo==='despesa'&&!m.cobranca_id?`<button data-rateio="${m.id}" class="mini">Ratear</button>`:''}`:''}</td></tr>`))}</div>`;
  $('despesaGeral').onclick=()=>movimento('despesa');$('csv').onclick=exportar;
  conectar({'[data-comprovante]':b=>{const input=document.createElement('input');input.type='file';input.accept='application/pdf,image/png,image/jpeg,image/webp';
      input.onchange=async()=>{try{const form=new FormData();form.append('arquivo',input.files[0]);const r=await fetch(`/api/gestao/movimentos/${b.dataset.comprovante}/comprovantes`,{method:'POST',body:form}),d=await r.json();if(!r.ok)throw new Error(d.erro);aviso('Comprovante anexado.',true);}catch(e){aviso(e.message);}};input.click();},
    '[data-ver-comprovante]':async b=>{const d=await api(`/api/gestao/movimentos/${b.dataset.verComprovante}/comprovantes`);dialogo('Comprovantes',[],async()=>{});$('formDica').innerHTML=d.comprovantes.map(c=>`<a href="/api/gestao/comprovantes/${c.id}">${esc(c.nome)}</a>`).join('<br>')||'Nenhum comprovante anexado.';},
    '[data-estorno]':b=>{const pedido=chave();dialogo('Estornar movimento',[campo('motivo','Motivo','textarea'),campo('data','Data do estorno','date',hoje())],v=>api(`/api/gestao/movimentos/${b.dataset.estorno}/estorno`,'POST',{...v,pedido}),'O lançamento original ficará no histórico.');},
    '[data-rateio]':b=>{const m=dados.movimentos.find(m=>m.id===Number(b.dataset.rateio)),cs=dados.cobrancas.filter(c=>c.tipo!=='plano'&&!c.cancelada&&!c.custos_fechados);
      if(!cs.length)return aviso('Não há serviços com custos abertos para ratear.');
      dialogo(`Ratear ${brl(m.valor)}`,cs.map(c=>campo('c'+c.id,`${c.cliente} · ${c.descricao} (R$)`,'number','0')),
        v=>api(`/api/gestao/movimentos/${m.id}/rateio`,'PUT',{rateio:cs.map(c=>({cobranca_id:c.id,valor:moeda(v['c'+c.id])})).filter(r=>r.valor>0)}),
        'Distribua o custo conforme o uso dos serviços. A soma deve ser exatamente o valor da despesa.');}});
}
export async function repasses(){
  const cs=dados.cobrancas.filter(c=>c.atendente_id&&(usuario.admin||c.atendente_id===usuario.id));
  $('conteudo').innerHTML=titulo('Repasses','Metade do serviço após custos, liberada conforme os recebimentos.')+
    indicadores([['Previsão após custos',brl(cs.reduce((n,c)=>n+c.previsao,0))],['Liberado',brl(cs.reduce((n,c)=>n+c.liberado,0))],['Já repassado',brl(cs.reduce((n,c)=>n+c.repassado,0))],['Disponível',brl(cs.reduce((n,c)=>n+c.disponivel,0))]])+
    tabela(['Atendente','Cliente / serviço','Previsão','Disponível','Já pago','Ações'],cs.map(c=>`<tr><td>${esc(c.atendente)}</td><td>${esc(c.cliente)}<small>${esc(c.descricao)}</small></td><td>${brl(c.previsao)}</td><td>${brl(c.disponivel)}<small>${c.custos_fechados?'Custos fechados':'Aguardando custos'}</small></td><td>${brl(c.repassado)}</td><td>${usuario.admin&&c.disponivel?`<button data-pagar="${c.id}">Registrar repasse</button>`:''}</td></tr>`));
  conectar({'[data-pagar]':b=>movimento('repasse',Number(b.dataset.pagar))});
}
export async function configuracoes(){
  const rota=location.hash;
  const backups=await api('/api/gestao/backups');
  if(location.hash!==rota)return;
  $('conteudo').innerHTML=titulo('Equipe e manutenção','Contas, contratos e cópias do banco.','<a href="/operacao.html">Cadastrar atendente</a><a href="/admin.html">IA e acessos das lojas</a>')+
    `<div class="cartao"><h2>Equipe</h2>${tabela(['Nome','E-mail','Situação','Ações'],dados.atendentes.map(a=>`<tr><td>${esc(a.nome)}</td><td>${esc(a.email)}</td><td>${a.ativo?'Ativo':'Desativado'}<small>${a.ver_senhas?'Pode ver senhas do cofre':'Não vê senhas do cofre'}</small></td><td><button data-ativo="${a.id}">${a.ativo?'Desativar':'Ativar'}</button><button data-senha="${a.id}">Redefinir senha</button><button data-ver-senhas="${a.id}">${a.ver_senhas?'Bloquear ver senhas':'Liberar ver senhas'}</button></td></tr>`))}</div>
    <div class="cartao"><h2>Contratos mensais</h2>${tabela(['Cliente','Componente','Valor','Primeiro vencimento','Situação','Ações'],agruparContratos(dados.contratos).map(partes=>{const t=partes[0];
      return `<tr><td>${esc(t.cliente)}</td><td>${partes.map(p=>tipos[p.tipo]).join(' + ')}</td><td>${partes.length>1?`${brl(partes.reduce((n,p)=>n+p.valor,0))}<small>${partes.map(p=>`${tipos[p.tipo]}: ${brl(p.valor)}`).join(' · ')}</small>`:brl(t.valor)}</td><td>${dia(t.inicio)}</td><td>${t.ativo?'Ativo':'Encerrado'}</td><td>${t.ativo?`<button data-encerrar="${t.id}">Encerrar</button>`:''}</td></tr>`;}))}</div>
    <div class="cartao"><div class="titulo"><h2>Backups da operação</h2><button id="backup">Criar backup agora</button></div><p class="suave">Cópia diária automática do banco, fotos e perfis de navegador. Baixe o arquivo .tar.gz para guardar fora do servidor. Guarde também a chave de criptografia em local seguro.</p>
    ${tabela(['Arquivo','Tamanho','Download'],backups.backups.map(b=>`<tr><td>${esc(b.nome)}</td><td>${Math.round(b.tamanho/1024)} KB</td><td><a href="/api/gestao/backups/${encodeURIComponent(b.nome)}">Baixar</a></td></tr>`))}</div>`;
  $('backup').onclick=async()=>{try{await api('/api/gestao/backups','POST',{});await carregar();}catch(e){aviso(e.message);}};
  conectar({'[data-ativo]':async b=>{const a=dados.atendentes.find(a=>a.id===Number(b.dataset.ativo));if(await confirmar(`${a.ativo?'Desativar':'Ativar'} a conta de ${a.nome}?`)){await api(`/api/gestao/atendentes/${a.id}`,'PUT',{ativo:!a.ativo});await carregar();}},
    '[data-ver-senhas]':async b=>{const a=dados.atendentes.find(x=>x.id===Number(b.dataset.verSenhas));
      if(await confirmar(a.ver_senhas?`Bloquear ${a.nome} de ver as senhas do cofre? O app continua abrindo as lojas logadas.`:`Liberar ${a.nome} para ver as senhas do cofre das lojas dele? Cada visualização fica registrada.`)){await api(`/api/gestao/atendentes/${a.id}`,'PUT',{ver_senhas:!a.ver_senhas});await carregar();}},
    '[data-senha]':b=>dialogo('Redefinir senha do atendente',[campo('senha','Nova senha','password')],v=>api(`/api/gestao/atendentes/${b.dataset.senha}`,'PUT',v)),
    '[data-encerrar]':async b=>{if(await confirmar('Encerrar o contrato? As cobranças já geradas continuarão no histórico.')){await api(`/api/gestao/contratos/${b.dataset.encerrar}/encerrar`,'POST',{});await carregar();}}});
}
