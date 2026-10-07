import {$,dados,usuario,esc,brl,dia,tabela,titulo,campo,dialogo,conectar,api,carregar,confirmar,opcoesClientes,aviso} from './gestao.js';
import {novaCobranca,novoContrato} from './gestao-financeiro.js';
const etapas={dados:'Dados da loja',contas:'Contas criadas',branding:'Identidade visual',materiais:'Fotos e preços',revisao:'Revisão dos produtos',publicacao:'Publicação',conferencia:'Conferência',entregue:'Entregue'};
const estados={pendente:'Pendente',andamento:'Em andamento',aguardando_cliente:'Aguardando cliente',concluida:'Concluída'};
export async function clientes(){
  $('conteudo').innerHTML=titulo('Clientes','Abra a ficha para acompanhar o trabalho da loja.',usuario.admin?'<a href="/operacao.html">Cadastrar cliente</a>':'')+
    '<div class="filtros"><label>Buscar<input id="buscaCliente" placeholder="Nome, responsável ou contato"></label><label>Situação<select id="filtroCliente"><option value="ativo">Ativos</option><option value="todos">Todos</option><option value="arquivo">Arquivados</option></select></label></div><div id="listaClientes"></div>';
  const listar=()=>{const busca=$('buscaCliente').value.toLowerCase(),filtro=$('filtroCliente').value;
    $('listaClientes').innerHTML=tabela(['Loja','Contato','Responsável','Implantação','Ações'],dados.clientes.filter(c=>(filtro==='todos'||(filtro==='ativo'?c.ativo:!c.ativo))&&`${c.nome} ${c.contato} ${c.atendente}`.toLowerCase().includes(busca)).map(c=>`<tr><td><a href="#cliente-${c.id}">${esc(c.nome)}</a><small>${esc(c.email)}</small></td><td>${esc(c.contato)}<small>${esc(c.whatsapp)}</small></td><td>${esc(c.atendente||'Sem responsável')}</td><td>${etapas[c.implantacao_etapa||'dados']}<small>${c.ativo?'':'Arquivado'}</small></td><td><a href="#cliente-${c.id}">Abrir ficha</a></td></tr>`));};
  listar();$('buscaCliente').oninput=listar;$('filtroCliente').onchange=listar;
}
function editarImplantacao(c){dialogo('Etapa da implantação',[
  campo('etapa','Etapa','select',c.implantacao_etapa||'dados',{opcoes:Object.entries(etapas)}),campo('prazo','Prazo de entrega','date',c.implantacao_prazo||'',{required:false}),
  campo('pendencia','O que falta / motivo da espera','textarea',c.pendencia||'',{required:false})
],b=>api(`/api/gestao/implantacoes/${c.id}`,'PUT',b),'Registre pendências de fotos, preços, aprovação e configuração.');}
export async function implantacoes(){
  $('conteudo').innerHTML=titulo('Implantações','Etapas, responsáveis e pendências de cada entrega.')+
    `<div class="quadro">${Object.entries(etapas).map(([e,nome])=>`<article><h3>${nome}</h3>${dados.clientes.filter(c=>c.ativo&&(c.implantacao_etapa||'dados')===e).map(c=>`<div class="cartao"><a href="#cliente-${c.id}"><b>${esc(c.nome)}</b></a><p>${esc(c.atendente||'Sem responsável')}<br>Prazo: ${dia(c.implantacao_prazo)}</p>${c.pendencia?`<p class="atencao">${esc(c.pendencia)}</p>`:''}<button data-etapa="${c.id}">Atualizar etapa</button></div>`).join('')||'<p class="suave">Nenhuma loja nesta etapa.</p>'}</article>`).join('')}</div>`;
  conectar({'[data-etapa]':b=>editarImplantacao(dados.clientes.find(c=>c.id===Number(b.dataset.etapa)))});
}
function editarTarefa(t,cid){
  const v=t||{},cliente=dados.clientes.find(c=>c.id===(cid||t?.loja_id));
  const campos=[...(!t?[campo('loja_id','Cliente','select',cid||'',{opcoes:opcoesClientes()})]:[]),
    campo('tipo','Tipo','select',v.tipo||'suporte',{opcoes:[['suporte','Suporte'],['implantacao','Implantação'],['tarefa','Tarefa']]}),campo('titulo','Título','text',v.titulo||''),
    campo('descricao','Descrição','textarea',v.descricao||'',{required:false}),campo('estado','Situação','select',v.estado||'pendente',{opcoes:Object.entries(estados)}),
    campo('prioridade','Prioridade','select',v.prioridade||'normal',{opcoes:[['normal','Normal'],['alta','Alta'],['urgente','Urgente']]}),campo('prazo','Prazo','date',v.prazo||'',{required:false}),
    campo('minutos','Tempo gasto (minutos)','number',v.minutos||0),campo('solucao','Solução / instruções','textarea',v.solucao||'',{required:false})];
  if(usuario.admin)campos.push(campo('responsavel_id','Responsável','select',v.responsavel_id||cliente?.atendente_id||'',{opcoes:[['','Atendente da loja ou administrador'],...dados.atendentes.filter(a=>a.ativo).map(a=>[a.id,a.nome])],required:false}));
  dialogo(t?'Atualizar solicitação':'Nova solicitação',campos,b=>api(t?`/api/gestao/tarefas/${t.id}`:'/api/gestao/tarefas',t?'PUT':'POST',{
    ...b,loja_id:Number(b.loja_id)||t?.loja_id,minutos:Number(b.minutos),...(b.responsavel_id?{responsavel_id:Number(b.responsavel_id)}:{})
  }),'O responsável deve ser o atendente da loja ou um administrador.');
}
export async function tarefas(){
  $('conteudo').innerHTML=titulo('Suporte e tarefas','Solicitações, pendências e soluções por cliente.','<button id="novaTarefa" class="principal">Nova solicitação</button>')+
    '<div class="filtros"><label>Situação<select id="filtroTarefa"><option value="abertas">Em aberto</option><option value="todas">Todas</option><option value="concluida">Concluídas</option></select></label></div><div id="listaTarefas"></div>'+
    `<div class="cartao espaco"><div class="titulo"><h2>Respostas e instruções reutilizáveis</h2>${usuario.admin?'<button id="novaResposta">Cadastrar resposta</button>':''}</div>${dados.respostas.map(r=>`<details><summary>${esc(r.titulo)}</summary><p class="respostas">${esc(r.texto)}</p></details>`).join('')||'<p class="suave">Registre soluções recorrentes para agilizar o atendimento.</p>'}</div>`;
  const listar=()=>{const filtro=$('filtroTarefa').value;
    $('listaTarefas').innerHTML=tabela(['Cliente','Solicitação','Responsável','Prazo','Situação','Tempo','Ações'],dados.tarefas.filter(t=>filtro==='todas'||(filtro==='abertas'?t.estado!=='concluida':t.estado==='concluida')).map(t=>`<tr><td><a href="#cliente-${t.loja_id}">${esc(t.cliente)}</a></td><td>${esc(t.titulo)}<small>${esc(t.prioridade)}</small></td><td>${esc(t.responsavel||'Sem responsável')}</td><td>${dia(t.prazo)}</td><td>${estados[t.estado]}</td><td>${t.minutos} min</td><td><button data-tarefa="${t.id}">Atualizar</button></td></tr>`));
    conectar({'[data-tarefa]':b=>editarTarefa(dados.tarefas.find(t=>t.id===Number(b.dataset.tarefa)))});};
  listar();$('filtroTarefa').onchange=listar;$('novaTarefa').onclick=()=>editarTarefa(null);
  if(usuario.admin)$('novaResposta').onclick=()=>dialogo('Nova resposta',[campo('titulo','Título'),campo('texto','Instruções','textarea')],b=>api('/api/gestao/respostas','POST',b));
}
export async function ficha(cid){
  const rota=location.hash;
  const c=dados.clientes.find(c=>c.id===cid);if(!c){$('conteudo').innerHTML='<p>Cliente fora da sua carteira.</p>';return;}
  const d=await api(`/api/gestao/clientes/${cid}`),cs=dados.cobrancas.filter(b=>b.loja_id===cid);
  if(location.hash!==rota)return;
  $('conteudo').innerHTML=titulo(c.nome,`${c.atendente||'Sem responsável'} · ${c.email}`,`<a href="#clientes">Voltar à carteira</a>${c.ativo?`<a href="/gestao.html?loja=${c.id}#lojas-novas">Passo a passo desta loja</a>`:''}<button id="editarFicha">Editar contato</button>${usuario.admin&&c.ativo?'<button id="cobrarCliente">Nova cobrança</button><button id="contratoCliente">Contrato mensal</button>':''}`)+
    `<div class="quadro"><article><h3>Contato</h3><p>${esc(c.contato||'Contato não informado')}<br>${esc(c.whatsapp)}</p><p class="respostas">${esc(c.observacoes)}</p>${usuario.admin?`<button id="arquivar">${c.ativo?'Arquivar cliente':'Reativar cliente'}</button>`:''}</article>
    <article><h3>Implantação</h3><p>${etapas[c.implantacao_etapa||'dados']}<br>Prazo: ${dia(c.implantacao_prazo)}</p><p>${esc(c.pendencia||'Sem pendência registrada')}</p><button id="etapaCliente">Atualizar etapa</button></article>
    <article><h3>Produtos</h3><p>${c.produtos_contratados} contratados · 25 incluídos<br>Excedente: ${brl(c.adicional_centavos)} por produto</p>${c.ativo?`<a href="/?produtos=1&loja=${c.id}">Abrir revisão de produtos</a>`:''}<p class="suave">A publicação fica disponível ao administrador.</p></article></div>
    <div class="cartao espaco"><h2>Cobranças da loja</h2>${tabela(['Serviço','Vencimento','Valor','Recebido','Situação'],cs.map(b=>`<tr><td><a href="#cobrancas">${esc(b.descricao)}</a></td><td>${dia(b.vencimento)}</td><td>${brl(b.valor)}</td><td>${brl(b.recebido)}</td><td>${esc(b.estado)}</td></tr>`))}</div>
    <div class="cartao"><div class="titulo"><h2>Materiais e fotos</h2>${usuario.admin&&c.ativo?'<button id="importar">Enviar materiais organizados para revisão</button>':''}</div>
    ${c.ativo?'<div class="linha-upload"><label>Finalidade<select id="finalidadeFoto"><option value="produto">Produtos</option><option value="branding">Logo / identidade visual</option></select></label><label class="arquivo">Fotos JPEG, PNG ou WebP<input id="fotos" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><button id="enviarFotos">Enviar fotos</button></div>':''}
    ${tabela(['Foto','Arquivo / produto','Preço / unidade','Observações','Ações'],d.materiais.map(m=>`<tr><td><img class="foto-material" src="/api/gestao/clientes/${cid}/materiais/${m.id}/foto" alt="${esc(m.nome)}"></td><td>${esc(m.titulo||m.nome)}<small>${esc(m.categoria)}</small>${m.item_arquivo?'<small>Enviado para revisão</small>':''}</td><td>${esc(m.preco||'Falta preço')}<small>${esc(m.unidade)}</small></td><td>${esc(m.observacoes)}</td><td>${c.ativo?`<button data-material="${m.id}">Organizar</button>${usuario.admin?`<button data-analisar="${m.id}">Analisar foto com IA</button>`:''}`:''}</td></tr>`))}</div>
    <div class="cartao"><div class="titulo"><h2>Suporte e tarefas</h2>${c.ativo?'<button id="tarefaCliente">Nova solicitação</button>':''}</div>${tabela(['Solicitação','Situação','Prazo','Ações'],dados.tarefas.filter(t=>t.loja_id===cid).map(t=>`<tr><td>${esc(t.titulo)}</td><td>${estados[t.estado]}</td><td>${dia(t.prazo)}</td><td><button data-tarefa="${t.id}">Atualizar</button></td></tr>`))}</div>
    <div class="cartao"><h2>Histórico da loja</h2>${d.historico.map(h=>`<div class="auditoria">${esc(h.criado_em)} · ${esc(h.acao)}</div>`).join('')||'<p class="suave">As próximas ações aparecerão aqui.</p>'}</div>`;
  $('editarFicha').onclick=()=>dialogo('Contato e observações',[campo('contato','Nome do contato','text',c.contato,{required:false}),campo('observacoes','Observações','textarea',c.observacoes,{required:false})],b=>api(`/api/gestao/clientes/${cid}`,'PUT',b));
  $('etapaCliente').onclick=()=>editarImplantacao(c);
  if(c.ativo){$('tarefaCliente').onclick=()=>editarTarefa(null,cid);
    $('enviarFotos').onclick=async()=>{const btn=$('enviarFotos'),arquivos=$('fotos').files;if(!arquivos.length)return aviso('Selecione as fotos.');
      btn.disabled=true;try{const form=new FormData();form.append('finalidade',$('finalidadeFoto').value);for(const a of arquivos)form.append('fotos',a);const r=await fetch(`/api/gestao/clientes/${cid}/materiais`,{method:'POST',body:form});const b=await r.json();if(!r.ok)throw new Error(b.erro);await carregar();aviso('Materiais recebidos.',true);}catch(e){aviso(e.message);}finally{btn.disabled=false;}};
  }
  if(usuario.admin){$('arquivar').onclick=async()=>{if(await confirmar(c.ativo?'Arquivar cliente e encerrar seus contratos mensais? O histórico será preservado.':'Reativar cliente? Contratos encerrados precisam ser cadastrados novamente.')){await api(`/api/gestao/clientes/${cid}`,'PUT',{contato:c.contato,observacoes:c.observacoes,ativo:!c.ativo});await carregar();}};
    if(c.ativo){$('cobrarCliente').onclick=()=>novaCobranca(cid);$('contratoCliente').onclick=()=>novoContrato(cid);
      $('importar').onclick=async()=>{if(await confirmar('Importar os materiais novos com nome e preço preenchidos para o lote de revisão?')){await api(`/api/gestao/clientes/${cid}/materiais/importar`,'POST',{});await carregar();}};}
  }
  const organizar=m=>dialogo('Organizar produto',[
      campo('finalidade','Finalidade','select',m.finalidade,{opcoes:[['produto','Produto'],['branding','Logo / identidade visual']]}),
      campo('titulo','Nome do produto / material','text',m.titulo),campo('preco','Preço do produto (R$)','text',m.preco,{required:false}),campo('unidade','Unidade / peso','text',m.unidade,{required:false}),
      campo('categoria','Categoria','text',m.categoria,{required:false}),campo('observacoes','Descrição e observações','textarea',m.observacoes,{required:false})
    ],v=>api(`/api/gestao/clientes/${cid}/materiais/${m.id}`,'PUT',v),'Revise os textos antes de salvar. O preço precisa ser informado por vocês.');
  conectar({'[data-tarefa]':b=>editarTarefa(dados.tarefas.find(t=>t.id===Number(b.dataset.tarefa))),
    '[data-material]':b=>organizar(d.materiais.find(m=>m.id===Number(b.dataset.material))),
    '[data-analisar]':async b=>{const m=d.materiais.find(m=>m.id===Number(b.dataset.analisar));
      const sugestao=await api(`/api/gestao/clientes/${cid}/materiais/${m.id}/analisar`,'POST',{});
      organizar({...m,...sugestao});}});
}
