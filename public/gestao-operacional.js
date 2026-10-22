import {$,dados,usuario,esc,brl,dia,tabela,titulo,campo,dialogo,conectar,api,carregar,confirmar,opcoesClientes,aviso} from './gestao.js';
import {novaCobranca,novoContrato} from './gestao-financeiro.js';
import {roteiroResumo} from './gestao-onboarding.js';
const estados={pendente:'Pendente',andamento:'Em andamento',aguardando_cliente:'Aguardando cliente',concluida:'Concluída'};
export async function clientes(){
  $('conteudo').innerHTML=titulo('Clientes','Abra a ficha para acompanhar o trabalho da loja.',usuario.admin?'<a href="/operacao.html">Cadastrar cliente</a>':'')+
    '<div class="filtros"><label>Buscar<input id="buscaCliente" placeholder="Nome, responsável ou contato"></label><label>Situação<select id="filtroCliente"><option value="ativo">Ativos</option><option value="todos">Todos</option><option value="arquivo">Arquivados</option></select></label></div><div id="listaClientes"></div>';
  const listar=()=>{const busca=$('buscaCliente').value.toLowerCase(),filtro=$('filtroCliente').value;
    $('listaClientes').innerHTML=tabela(['Loja','Contato','Responsável','Passo a passo','Ações'],dados.clientes.filter(c=>(filtro==='todos'||(filtro==='ativo'?c.ativo:!c.ativo))&&`${c.nome} ${c.contato} ${c.atendente}`.toLowerCase().includes(busca)).map(c=>`<tr><td><a href="#cliente-${c.id}">${esc(c.nome)}</a><small>${esc(c.email)}</small>${c.ativo?'':'<small>Arquivado</small>'}</td><td>${esc(c.contato)}<small>${esc(c.whatsapp)}</small></td><td>${esc(c.atendente||'Sem responsável')}</td><td>${roteiroResumo(c)}</td><td><a href="#cliente-${c.id}">Abrir ficha</a></td></tr>`));};
  listar();$('buscaCliente').oninput=listar;$('filtroCliente').onchange=listar;
}
/** Prazo de entrega e o que falta para a loja. A fase vem do roteiro de lojas novas. */
export function editarPrazo(c){dialogo('Prazo e pendência',[
  campo('prazo','Prazo de entrega','date',c.implantacao_prazo||'',{required:false}),
  campo('pendencia','O que falta / motivo da espera','textarea',c.pendencia||'',{required:false})
],b=>api(`/api/gestao/implantacoes/${c.id}`,'PUT',b),'Registre o que falta, como fotos, preços, aprovação ou configuração.');}
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
  const [d,fi,co]=await Promise.all([api(`/api/gestao/clientes/${cid}`),api(`/api/gestao/clientes/${cid}/ficha`),api(`/api/gestao/clientes/${cid}/conferencia`)]),cs=dados.cobrancas.filter(b=>b.loja_id===cid);
  const situacaoConferencia={ok:'Pronta para entregar',atencao:'Pode entregar, vale melhorar',bloqueante:'Corrigir antes de entregar'};
  const secoesProntas=Object.values(fi.completo).filter(Boolean).length,totalSecoes=Object.keys(fi.completo).length;
  if(location.hash!==rota)return;
  const params=new URLSearchParams(location.search),cadastroGuiado=params.get('orientacao')==='cadastro'&&Number(params.get('loja'))===cid;
  const orientacao=cadastroGuiado?`<section class="ficha-cadastro-guiado" data-guia="ficha" aria-labelledby="cadastroGuiadoTitulo"><span class="sobretitulo">PASSO 1 · CONFERIR O CADASTRO</span><h2 id="cadastroGuiadoTitulo">Confira estes dados antes de continuar</h2><p>Você está na ficha de <b>${esc(c.nome)}</b>. Nesta etapa, confira quem é o contato do cliente e quem da sua equipe vai atender essa loja.</p>
    <dl><div><dt>Loja cadastrada</dt><dd>${esc(c.nome)}</dd></div><div><dt>Pessoa de contato do cliente</dt><dd>${esc(c.contato||'Ainda não informado')}</dd></div><div><dt>WhatsApp do cliente</dt><dd>${esc(c.whatsapp||'Ainda não informado')}</dd></div><div><dt>Atendente da sua equipe</dt><dd>${esc(c.atendente||'Ainda não vinculado')}</dd></div></dl>
    <ol><li><b>Confira a pessoa de contato.</b> Clique no botão abaixo para informar ou corrigir o nome de quem fala com você pelo cliente e as observações do atendimento.</li>
    <li><b>Confira o WhatsApp e o atendente.</b> ${usuario.admin?'Em Cadastro e equipe, use Editar na loja para ajustar esses dois campos.':'Se esses dados precisarem de ajuste, peça ao administrador para atualizar o cadastro.'}</li>
    <li><b>Volte ao passo a passo.</b> Depois da conferência, marque a primeira etapa como conferida e siga para o acordo comercial.</li></ol>
    <div class="acoes-linha"><button id="editarCadastroGuiado" class="principal">Editar a pessoa de contato</button>${usuario.admin?`<a class="onboarding-link" href="/operacao.html?editarLoja=${c.id}">Ajustar WhatsApp e atendente</a>`:''}<a class="onboarding-link" href="/gestao.html?loja=${c.id}#lojas-novas">Voltar ao passo a passo desta loja</a></div></section>`:'';
  $('conteudo').innerHTML=orientacao+titulo(c.nome,`${c.atendente||'Sem responsável'} · ${c.email}`,`<a href="#clientes">Voltar à carteira</a>${c.ativo?`<a href="/gestao.html?loja=${c.id}#lojas-novas">Passo a passo desta loja</a>`:''}<button id="editarFicha">Editar contato</button>${usuario.admin&&c.ativo?'<button id="cobrarCliente">Nova cobrança</button><button id="contratoCliente">Contrato mensal</button>':''}`)+
    `<div class="quadro"><article><h3>Contato</h3><p>${esc(c.contato||'Contato não informado')}<br>${esc(c.whatsapp)}</p><p class="respostas">${esc(c.observacoes)}</p>${usuario.admin?`<button id="arquivar">${c.ativo?'Arquivar cliente':'Reativar cliente'}</button>`:''}</article>
    ${c.ativo?`<article><h3>Passo a passo</h3>${roteiroResumo(c)}<p>Prazo: ${dia(c.implantacao_prazo)}<br>${esc(c.pendencia||'Sem pendência registrada')}</p><div class="acoes-linha"><button id="prazoCliente">Prazo e pendência</button><a href="/gestao.html?loja=${c.id}#lojas-novas">Abrir o roteiro</a></div></article>`:''}
    ${c.ativo?`<article><h3>Ficha de implantação</h3><p>${secoesProntas} de ${totalSecoes} seções completas${fi.enviada_em?'<br>Enviada pelo cliente':''}</p>
      <div class="acoes-linha"><a href="/ficha.html?loja=${c.id}">Abrir ficha</a><button id="linkFicha">Mandar link no WhatsApp</button></div></article>`:''}
    ${c.ativo?`<article><h3>Conferência do catálogo</h3>${co.situacao?`<p><b>${situacaoConferencia[co.situacao]}</b><br>${co.totais.produtos??0} produtos na loja · ${co.problemas.length} ponto(s) a ver</p><p class="suave">Conferido pelo app em ${esc(new Date(co.criada_em.replace(' ','T')+'Z').toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))}${co.autor?` por ${esc(co.autor)}`:''}.</p>`:'<p class="suave">Ainda não conferido. No app desktop, abra a loja e clique em Conferir catálogo.</p>'}</article>`:''}
    <article><h3>Produtos</h3><p>${c.produtos_contratados} contratados · 25 incluídos<br>Excedente: ${brl(c.adicional_centavos)} por produto</p>${c.ativo?`<a href="/?produtos=1&loja=${c.id}">Abrir revisão de produtos</a>`:''}<p class="suave">A publicação fica disponível ao administrador.</p></article>
</div>
    <div class="cartao espaco"><h2>Cobranças da loja</h2>${tabela(['Serviço','Vencimento','Valor','Recebido','Situação'],cs.map(b=>`<tr><td><a href="#cobrancas">${esc(b.descricao)}</a></td><td>${dia(b.vencimento)}</td><td>${brl(b.valor)}</td><td>${brl(b.recebido)}</td><td>${esc(b.estado)}</td></tr>`))}</div>
    <div class="cartao"><div class="titulo"><h2>Materiais e fotos</h2>${usuario.admin&&c.ativo?'<button id="importar">Enviar materiais organizados para revisão</button>':''}</div>
    ${c.ativo?'<div class="linha-upload"><label>Finalidade<select id="finalidadeFoto"><option value="produto">Produtos</option><option value="branding">Logo / identidade visual</option></select></label><label class="arquivo">Fotos JPEG, PNG ou WebP<input id="fotos" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><button id="enviarFotos">Enviar fotos</button></div>':''}
    ${tabela(['Foto','Arquivo / produto','Preço / unidade','Observações','Ações'],d.materiais.map(m=>`<tr><td><img class="foto-material" src="/api/gestao/clientes/${cid}/materiais/${m.id}/foto" alt="${esc(m.nome)}"></td><td>${esc(m.titulo||m.nome)}<small>${esc(m.categoria)}</small>${m.item_arquivo?'<small>Enviado para revisão</small>':''}</td><td>${esc(m.preco||'Falta preço')}<small>${esc(m.unidade)}</small></td><td>${esc(m.observacoes)}</td><td>${c.ativo?`<button data-material="${m.id}">Organizar</button>${usuario.admin?`<button data-analisar="${m.id}">Analisar foto com IA</button>`:''}`:''}</td></tr>`))}</div>
    <div class="cartao"><div class="titulo"><h2>Suporte e tarefas</h2>${c.ativo?'<button id="tarefaCliente">Nova solicitação</button>':''}</div>${tabela(['Solicitação','Situação','Prazo','Ações'],dados.tarefas.filter(t=>t.loja_id===cid).map(t=>`<tr><td>${esc(t.titulo)}</td><td>${estados[t.estado]}</td><td>${dia(t.prazo)}</td><td><button data-tarefa="${t.id}">Atualizar</button></td></tr>`))}</div>
    <div class="cartao"><h2>Histórico da loja</h2>${d.historico.map(h=>`<div class="auditoria">${esc(h.criado_em)} · ${esc(h.acao)}</div>`).join('')||'<p class="suave">As próximas ações aparecerão aqui.</p>'}</div>`;
  $('editarFicha').onclick=()=>dialogo('Contato e observações',[campo('contato','Nome da pessoa de contato do cliente','text',c.contato,{required:false}),campo('observacoes','Observações do atendimento','textarea',c.observacoes,{required:false})],b=>api(`/api/gestao/clientes/${cid}`,'PUT',b),'Informe a pessoa com quem você fala pelo cliente. O nome da loja aparece separado no cadastro.');
  if($('editarCadastroGuiado'))$('editarCadastroGuiado').onclick=$('editarFicha').onclick;
  if($('prazoCliente'))$('prazoCliente').onclick=()=>editarPrazo(c);
  // O link vai pronto numa mensagem; o cliente preenche pelo celular, sem login.
  if($('linkFicha'))$('linkFicha').onclick=async()=>{
    const {url}=await api(`/api/gestao/clientes/${c.id}/ficha/link`,'POST',{});
    const nome=(c.contato||'').trim().split(/\s+/)[0];
    const texto=`Olá${nome?`, ${nome}`:''}! Para montarmos a loja ${c.nome} no Cardapio.ai, preencha esta ficha pelo celular (dá para salvar e voltar depois):
${url}`;
    const numero=c.whatsapp?(c.whatsapp.length<=11?'55'+c.whatsapp:c.whatsapp):'';
    await navigator.clipboard?.writeText(texto).catch(()=>{});
    if(numero)window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,'_blank','noopener');
    aviso(numero?'Link gerado e conversa aberta no WhatsApp. O texto também foi copiado.':'Link gerado e copiado. Esta loja não tem WhatsApp cadastrado.',true);
  };
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
