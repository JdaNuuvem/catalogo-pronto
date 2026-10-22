import {$,dados,usuario,esc,brl,dia,titulo,api,aviso} from './gestao.js';
import {editarPrazo} from './gestao-operacional.js';
const etapas=[
  {id:'cadastro',titulo:'Cadastrar a loja e o responsável',quem:'Atendente e administrador',equipe:true,
    objetivo:'Deixe registrado quem é o cliente, qual loja será montada e quem vai fazer o atendimento.',
    fazer:['Peça nome da loja, nome do responsável, WhatsApp, quantidade de produtos e referências da identidade visual.','O atendente cadastra a loja em Lojas e acessos (ela entra na carteira dele). O administrador também pode usar Cadastro e equipe, onde registra os valores.','Depois do cadastro, selecione essa loja no campo acima para salvar o progresso deste roteiro.'],
    conferir:['Loja cadastrada na carteira.','Contato e atendente responsável conferidos.'],
    acoes:[['Cadastrar uma nova loja','cadastro'],['Conferir cadastro desta loja','cadastro-ficha']]},
  {id:'acordo',titulo:'Confirmar o serviço e a cobrança',quem:'Atendente coleta; administrador registra',equipe:true,
    objetivo:'Combine os valores, a quantidade de produtos, o prazo e o que o cliente vai receber.',
    fazer:['A implantação padrão custa R$ 400 com 25 produtos incluídos. Cada produto acima de 25 custa R$ 3.','Combine o suporte mensal e o valor do plano Cardapio.ai. Eles devem ficar separados do serviço de implantação.','Na ficha da loja, o administrador cria a cobrança da implantação. Quando o cliente pagar, registra o valor em Receber, na tela Cobranças.'],
    conferir:['Quantidade de produtos, orçamento e prazo aceitos pelo cliente.','Cobrança da implantação registrada e situação do pagamento conferida.'],
    acoes:[['Conferir cobranças e recebimentos','cobrancas']]},
  {id:'email',titulo:'Criar o e-mail da loja',quem:'Atendente e administrador',equipe:true,
    objetivo:'Prepare o e-mail que será usado para criar a conta da loja no Cardapio.ai.',
    fazer:['Abra o Proton e crie o e-mail combinado para a loja.','Confira se consegue entrar na caixa de entrada e receber mensagens.','Guarde o acesso ao e-mail no seu controle de credenciais. O e-mail do painel e o e-mail da loja podem ser diferentes.'],
    conferir:['E-mail criado e caixa de entrada acessível.','Endereço correto separado para o cadastro no Cardapio.ai.'],
    acoes:[['Abrir Proton','proton']]},
  {id:'conta',titulo:'Criar a conta no Cardapio.ai',quem:'Atendente e administrador',equipe:true,
    objetivo:'Use o e-mail da loja para criar e verificar sua conta na plataforma.',
    fazer:['Abra o Cardapio.ai e cadastre a nova loja com o e-mail criado na etapa anterior.','Conclua as verificações solicitadas pela plataforma.','Em Lojas e IA, informe as credenciais do Cardapio.ai na loja correspondente para conectar a automação.'],
    conferir:['Login na loja do cliente funcionando.','Credenciais vinculadas à loja correta no nosso painel.'],
    acoes:[['Abrir Cardapio.ai','cardapio'],['Configurar os acessos da loja','acessos']]},
  {id:'configuracao',titulo:'Montar a loja e a identidade visual',quem:'Atendente e administrador',equipe:true,
    objetivo:'Prepare a apresentação da loja e as configurações necessárias para ela atender os pedidos.',
    fazer:['Receba o logo e as referências do cliente, ou prepare a identidade visual combinada.','Configure no Cardapio.ai nome, apresentação, contato, horários e as opções de atendimento e entrega da loja.','Confira com o cliente as formas de pagamento e os dados que devem aparecer na loja. Guarde os materiais visuais na ficha como Logo / identidade visual.'],
    conferir:['Identidade visual e informações da loja revisadas.','Horários, atendimento, entrega e pagamentos conferidos com o cliente.'],
    acoes:[['Abrir a ficha de implantação','ficha-implantacao'],['Abrir o painel do Cardapio.ai','painel-cardapio']]},
  {id:'materiais',titulo:'Receber fotos e preços organizados',quem:'Atendente e administrador',equipe:true,
    objetivo:'Reúna tudo que é necessário para transformar os produtos reais em fichas do catálogo.',
    fazer:['Peça uma foto legível de cada produto e o preço de venda informado pelo cliente.','Na ficha, envie as imagens com a finalidade Produtos. Use Organizar para informar nome, preço, unidade ou peso, categoria e observações.','Compare a quantidade de fotos com os produtos contratados. Registre o que falta em Prazo e pendência, no quadro de Lojas novas, ou abra uma tarefa aguardando o cliente.'],
    conferir:['Fotos de todos os produtos recebidas e legíveis.','Preços e unidades informados; pendências resolvidas.'],
    acoes:[['Enviar e organizar materiais','ficha']]},
  {id:'revisao',titulo:'Analisar e revisar os produtos',quem:'Atendente e administrador',equipe:true,
    objetivo:'Confira os textos e preços antes de enviar qualquer produto à loja do cliente.',
    fazer:['Na ficha, use Analisar foto com IA para gerar uma sugestão de título, descrição e categoria. Revise antes de salvar.','Envie os materiais organizados para revisão e abra o lote desta loja. Também é possível enviar fotos diretamente no painel de produtos.','Confira nome, descrição, categoria e preço positivo de cada ficha. Desmarque produtos que não devem ser publicados.'],
    conferir:['Textos, categorias e preços corretos.','Somente os produtos que devem entrar na loja estão aprovados.'],
    acoes:[['Analisar as fotos na ficha','ficha'],['Abrir a revisão desta loja','produtos']]},
  {id:'publicacao',titulo:'Publicar e conferir a loja',quem:'Atendente e administrador',equipe:true,
    objetivo:'Envie os produtos aprovados e confirme que apareceram corretamente no Cardapio.ai.',
    fazer:['Na revisão desta loja, clique em Publicar aprovados e acompanhe o progresso.','Se a plataforma pedir verificação, obtenha o código recebido pelo cliente e informe no painel.','Abra a loja e confira produtos, imagens, categorias e preços. Corrija as falhas e tente novamente o que não foi publicado.'],
    conferir:['Todos os produtos contratados publicados ou pendências resolvidas.','Catálogo conferido na loja do cliente.'],
    acoes:[['Publicar os produtos desta loja','produtos'],['Conferir o catálogo da loja','catalogo']]},
  {id:'entrega',titulo:'Entregar a loja e orientar o cliente',quem:'Atendente e administrador',equipe:true,
    objetivo:'Entregue uma loja conferida e explique ao cliente como ela será usada no dia a dia.',
    fazer:['Envie o link da loja e confirme que o cliente consegue acessá-la.','Oriente sobre recebimento de pedidos, alterações de produtos e como pedir suporte. Configure e teste a impressora, quando fizer parte do serviço.','Registre os detalhes da entrega na ficha. Ao conferir esta etapa, a loja passa de Em implantação para Loja ativa.'],
    conferir:['Cliente recebeu o link e as orientações.','Pendências de entrega resolvidas e implantação atualizada.'],
    acoes:[['Registrar a entrega na ficha da loja','ficha']]},
  {id:'mensalidades',titulo:'Organizar o suporte e as renovações',quem:'Administrador',
    objetivo:'Prepare o acompanhamento mensal para a loja continuar funcionando e pagando no vencimento correto.',
    fazer:['Crie o contrato mensal da loja com o valor do seu suporte e do plano Cardapio.ai. Os dois vencem juntos e viram uma mensalidade só.','Use Gerar mensalidades: o painel cria a mensalidade do mês e gera o Pix do plano no Cardapio.ai de cada loja. A rotina também verifica os contratos a cada hora.','Quando o cliente pagar, use Receber mensalidade: o valor quita primeiro o plano. Depois pague o Pix da plataforma (Ver Pix) e registre em Pagar plano.'],
    conferir:['Contratos de suporte e plano cadastrados, quando aplicáveis.','Primeiro vencimento e forma de acompanhamento mensal definidos.'],
    acoes:[['Cadastrar contratos e mensalidades','cobrancas']]},
  {id:'repasse',titulo:'Fechar os custos e a divisão do serviço',quem:'Administrador',
    objetivo:'Registre os gastos para calcular a parte do atendente e o resultado da implantação.',
    fazer:['Registre na cobrança do serviço os custos de IA, fotos, taxas e terceiros. Despesas gerais precisam ser distribuídas usando Ratear, no Financeiro.','Confira os recebimentos e feche os custos. O sistema libera 50% do valor após custos, proporcional ao que o cliente já pagou.','Depois de pagar o atendente, registre o repasse. O valor recebido para o plano Cardapio.ai continua separado dessa divisão.'],
    conferir:['Custos e recebimentos da implantação conferidos.','Repasse disponível revisado e combinado com o atendente.'],
    acoes:[['Conferir custos e recebimentos','cobrancas'],['Conferir a parte do atendente','repasses']]}
];
// As 11 etapas em quatro fases: a equipe enxerga em que momento da contratacao a loja esta.
const fases=[
  {titulo:'Contratação',passos:['cadastro','acordo']},
  {titulo:'Contas e acessos',passos:['email','conta']},
  {titulo:'Montagem e produtos',passos:['configuracao','materiais','revisao','publicacao']},
  {titulo:'Entrega e pós-venda',passos:['entrega','mensalidades','repasse']}
];
const faseDe=id=>fases.findIndex(f=>f.passos.includes(id));
let lojaId=0,indice=0,registros=[],salvando=false,carregando=false,requisicao=0,posicionada=0;
const destinos={cadastro:'/operacao.html?novoCliente=1',cobrancas:'#cobrancas',tarefas:'#tarefas',configuracoes:'#configuracoes',financeiro:'#financeiro',repasses:'#repasses',acessos:'/admin.html',proton:'https://mail.proton.me/',cardapio:'https://cardapio.ai/','painel-cardapio':'https://cardapio.ai/painelweb/listar'};
function destino(tipo,loja){if(tipo==='ficha-implantacao')return `/ficha.html?loja=${lojaId}`;if(tipo==='cadastro'&&!usuario.admin)return '/admin.html';if(tipo==='cadastro-ficha')return `/gestao.html?loja=${lojaId}&orientacao=cadastro#cliente-${lojaId}`;if(tipo==='ficha')return `#cliente-${lojaId}`;if(tipo==='produtos')return `/?produtos=1&loja=${lojaId}`;if(tipo==='catalogo')return loja.cdp_link;return destinos[tipo];}
function permitido(tipo,loja){
  if(!usuario.admin&&['configuracoes','financeiro'].includes(tipo))return false;
  if(tipo==='cadastro')return !loja;
  if(!['proton','cardapio'].includes(tipo)&&!loja)return false;
  if(tipo==='catalogo'){
    try{const url=new URL(loja.cdp_link);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}
  }
  return true;
}
function pronto(passo){return registros.some(r=>r.passo===passo&&r.concluido);}
function marcado(passo,item){const r=registros.find(r=>r.passo===passo);return !!r&&(!!r.concluido||r.itens.includes(item));}
/** Primeira etapa ainda nao conferida a partir de `de`, dando a volta no roteiro. */
function proxima(de=0){for(let k=0;k<etapas.length;k++){const i=(de+k)%etapas.length;if(!pronto(etapas[i].id))return i;}return null;}

/** Progresso do roteiro de uma loja a partir do resumo que vem em /api/gestao. */
export function progressoLoja(c){
  const feitos=new Set(c.onboarding_feitos||[]),feitas=etapas.filter(e=>feitos.has(e.id)).length,i=etapas.findIndex(e=>!feitos.has(e.id));
  return {feitas,total:etapas.length,proxima:i<0?null:etapas[i]};
}
/** Barra curta do passo a passo para listas, quadros e fichas. */
export function roteiroResumo(c){
  if(!c.ativo)return '';
  const {feitas,total,proxima:p}=progressoLoja(c),link=`/gestao.html?loja=${c.id}#lojas-novas`;
  return `<div class="roteiro-mini"><div class="roteiro-barra" role="img" aria-label="${feitas} de ${total} etapas conferidas"><i style="width:${Math.round(feitas/total*100)}%"></i></div>
    <span>${feitas}/${total}${p?` · <a href="${link}">Próxima: ${esc(p.titulo)}</a>`:' · roteiro concluído'}</span></div>`;
}

/** Quadro de todas as lojas ativas pela fase em que o roteiro de cada uma esta. */
function andamento(){
  const ativas=dados.clientes.filter(c=>c.ativo);
  if(!ativas.length)return `<section class="andamento"><p class="suave">Nenhuma loja cadastrada ainda.${usuario.admin?' Use Cadastrar loja para começar.':''}</p></section>`;
  const colunas=[...fases.map(f=>f.titulo),'Concluídas'].map(t=>({titulo:t,lojas:[]}));
  for(const c of ativas){const p=progressoLoja(c).proxima;colunas[p?faseDe(p.id):fases.length].lojas.push(c);}
  const hoje=dados.hoje;
  return `<section class="andamento" aria-label="Andamento das lojas">${colunas.map((col,i)=>`<div class="andamento-coluna"><h3>${i<fases.length?`${i+1}. `:''}${esc(col.titulo)}<span>${col.lojas.length}</span></h3>
    ${col.lojas.map(c=>{const {feitas,total}=progressoLoja(c),atrasada=c.implantacao_prazo&&c.implantacao_prazo<hoje&&i<fases.length;
      return `<article class="andamento-loja ${c.id===lojaId?'selecionada':''}"><button type="button" class="andamento-abrir" data-abrir-loja="${c.id}"><b>${esc(c.nome)}</b><span>${esc(c.atendente||'Sem atendente')}</span></button>
        <div class="roteiro-barra" role="img" aria-label="${feitas} de ${total} etapas conferidas"><i style="width:${Math.round(feitas/total*100)}%"></i></div>
        <p class="andamento-info"><span>${feitas}/${total}</span>${c.implantacao_prazo?`<span class="${atrasada?'negativo':''}">Prazo ${dia(c.implantacao_prazo)}</span>`:''}</p>
        ${c.pendencia?`<p class="andamento-falta">${esc(c.pendencia)}</p>`:''}
        <button type="button" class="mini" data-prazo="${c.id}">Prazo e pendência</button></article>`;}).join('')||'<p class="suave">Nenhuma loja aqui.</p>'}</div>`).join('')}</section>`;
}
/** Abre o roteiro de uma loja (pelo seletor ou pelo cartao do quadro). */
async function abrirLoja(novo){
  lojaId=novo;indice=0;registros=[];posicionada=0;
  const url=new URL(location.href);if(novo)url.searchParams.set('loja',String(novo));else url.searchParams.delete('loja');history.replaceState(null,'',url);
  const consulta=buscar();desenhar();
  try{await consulta;posicionar();desenhar();}catch(e){aviso(e.message);desenhar();}
}

function desenhar(){
  if((location.hash.slice(1)||'inicio')!=='lojas-novas')return;
  const loja=dados.clientes.find(c=>c.id===lojaId&&c.ativo),etapa=etapas[indice],feitas=etapas.filter(e=>pronto(e.id)).length;
  const registro=registros.find(r=>r.passo===etapa.id),concluida=pronto(etapa.id),podeConferir=usuario.admin||etapa.equipe;
  const acoes=etapa.acoes.filter(([,tipo])=>permitido(tipo,loja)),fase=faseDe(etapa.id);
  const podeMarcar=!!loja&&podeConferir&&!salvando&&!carregando,completos=etapa.conferir.every((_,i)=>marcado(etapa.id,i));
  const resumoFases=fases.map((f,i)=>{const n=f.passos.filter(pronto).length;
    return `<li class="${n===f.passos.length?'feita':''} ${i===fase?'atual':''}"><b>${i+1}. ${esc(f.titulo)}</b><span>${n}/${f.passos.length}</span><div class="roteiro-barra"><i style="width:${Math.round(n/f.passos.length*100)}%"></i></div></li>`;}).join('');
  const menu=fases.map((f,fi)=>`<div class="onboarding-fase"><span class="onboarding-fase-titulo">${fi+1} · ${esc(f.titulo)}</span>${f.passos.map(id=>{const i=etapas.findIndex(e=>e.id===id),e=etapas[i];
    return `<button data-passo="${i}" type="button" ${i===indice?'aria-current="step"':''} class="${pronto(e.id)?'feita':''}"><span>${pronto(e.id)?'✓':i+1}</span>${esc(e.titulo)}</button>`;}).join('')}</div>`).join('');
  $('conteudo').innerHTML=titulo('Lojas novas','Andamento de cada loja e o roteiro da contratação até a entrega.',usuario.admin?'<a href="/operacao.html?novoCliente=1">Cadastrar loja</a>':'')+andamento()+
    `<section class="onboarding-intro" id="roteiroLoja"><div class="onboarding-loja"><label for="lojaOnboarding">Loja que vamos montar<select id="lojaOnboarding" ${carregando||salvando?'disabled':''}><option value="0">Escolha uma loja para salvar o progresso</option>${dados.clientes.filter(c=>c.ativo).map(c=>`<option value="${c.id}" ${c.id===lojaId?'selected':''}>${esc(c.nome)}</option>`).join('')}</select></label>
    ${loja?`<div class="onboarding-total"><strong>${feitas}<small>/${etapas.length}</small></strong><span>etapas conferidas<br>${esc(loja.atendente||'Sem atendente vinculado')}</span></div>`:''}</div>
    ${loja?`<ol class="onboarding-fases" aria-label="Progresso por fase">${resumoFases}</ol>`:'<p class="suave">Você já pode ler o roteiro. Depois de cadastrar a loja, escolha-a acima: o progresso é salvo e o roteiro abre sempre na próxima etapa pendente.</p>'}</section>
    <div class="onboarding-layout"><label class="onboarding-seletor" for="passoSelecionado">Etapa do roteiro<select id="passoSelecionado">${etapas.map((e,i)=>`<option value="${i}" ${i===indice?'selected':''}>${i+1}. ${esc(e.titulo)}${pronto(e.id)?' · conferida':''}</option>`).join('')}</select></label><nav class="onboarding-menu" aria-label="Etapas da loja nova">${menu}</nav>
    <article class="onboarding-etapa" aria-labelledby="etapaOnboarding"><span class="sobretitulo">FASE ${fase+1} · ${esc(fases[fase].titulo.toUpperCase())} · ETAPA ${indice+1} DE ${etapas.length}</span><h3 id="etapaOnboarding">${esc(etapa.titulo)}</h3><p class="onboarding-quem">${esc(etapa.quem)}</p><p>${esc(etapa.objetivo)}</p>
    ${etapa.id==='acordo'&&loja?`<p class="atencao">Orçamento cadastrado da implantação: <b>${brl(loja.implantacao_centavos+Math.max(0,loja.produtos_contratados-25)*loja.adicional_centavos)}</b> para ${loja.produtos_contratados} produtos, antes dos custos.</p>`:''}
    <h4>O que fazer</h4><ol>${etapa.fazer.map(t=>`<li>${esc(t)}</li>`).join('')}</ol>
    ${acoes.length?`<div class="acoes-linha">${acoes.map(([label,tipo])=>`<a class="onboarding-link" href="${esc(destino(tipo,loja))}" ${['proton','cardapio','painel-cardapio','catalogo'].includes(tipo)?'target="_blank" rel="noopener"':''}>${esc(label)}</a>`).join('')}</div>`:!loja?'<p class="suave">Escolha uma loja acima para abrir as ações desta etapa.</p>':''}
    <h4>Confira antes de marcar</h4><ul class="onboarding-checklist">${etapa.conferir.map((t,i)=>`<li><label class="${marcado(etapa.id,i)?'marcado':''}"><input type="checkbox" data-item="${i}" ${marcado(etapa.id,i)?'checked':''} ${podeMarcar?'':'disabled'}><span>${esc(t)}</span></label></li>`).join('')}</ul>
    ${!podeConferir?'<p class="atencao">Esta etapa é conferida pelo administrador. Você pode consultar as instruções e combinar o andamento com ele.</p>':''}
    <div class="onboarding-confirmacao">${loja&&podeConferir?`<button id="conferirEtapa" class="${concluida?'':'principal'}" ${salvando||carregando||(!concluida&&!completos)?'disabled':''}>${concluida?'Reabrir esta etapa':'Marcar etapa como conferida'}</button>
      ${!concluida&&!completos?'<span class="suave">Marque os itens acima para conferir a etapa.</span>':''}`:'<p class="suave">'+(loja?'A confirmação desta etapa fica com o administrador.':'Escolha uma loja para registrar a conferência.')+'</p>'}
    ${concluida?`<p class="suave">Conferida por ${esc(registro.responsavel)} em ${esc(new Date(registro.atualizado_em.replace(' ','T')+'Z').toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))}.</p>`:''}</div>
    <div class="onboarding-navegacao"><button id="passoAnterior" ${indice===0?'disabled':''}>← Etapa anterior</button><button id="passoSeguinte" ${indice===etapas.length-1?'disabled':''}>Próxima etapa →</button></div>
    ${feitas===etapas.length&&loja?'<p class="onboarding-concluido">Roteiro conferido pela equipe. Acompanhe agora as mensalidades e as solicitações dessa loja.</p>':''}</article></div>`;
  $('lojaOnboarding').onchange=e=>abrirLoja(Number(e.target.value));
  document.querySelectorAll('[data-abrir-loja]').forEach(b=>b.onclick=async()=>{
    await abrirLoja(Number(b.dataset.abrirLoja));$('roteiroLoja').scrollIntoView({behavior:'smooth',block:'start'});
  });
  document.querySelectorAll('[data-prazo]').forEach(b=>b.onclick=()=>editarPrazo(dados.clientes.find(c=>c.id===Number(b.dataset.prazo))));
  document.querySelectorAll('[data-passo]').forEach(b=>b.onclick=()=>{indice=Number(b.dataset.passo);desenhar();});
  $('passoSelecionado').onchange=e=>{indice=Number(e.target.value);desenhar();};
  $('passoAnterior').onclick=()=>{indice=Math.max(0,indice-1);desenhar();};$('passoSeguinte').onclick=()=>{indice=Math.min(etapas.length-1,indice+1);desenhar();};
  document.querySelectorAll('.onboarding-checklist [data-item]').forEach(c=>c.onchange=()=>{
    const item=Number(c.dataset.item);let r=registros.find(r=>r.passo===etapa.id);
    if(!r){r={passo:etapa.id,concluido:0,itens:[]};registros.push(r);}
    // A marca aparece na hora; se o servidor recusar, salvar() recarrega o que esta gravado.
    const base=r.concluido?etapa.conferir.map((_,i)=>i):r.itens;
    r.itens=c.checked?[...new Set([...base,item])]:base.filter(i=>i!==item);if(!c.checked)r.concluido=0;
    salvar({passo:etapa.id,item,marcado:c.checked});
  });
  if($('conferirEtapa'))$('conferirEtapa').onclick=async()=>{
    if(!await salvar({passo:etapa.id,concluido:!concluida}))return;
    if(concluida){aviso('Etapa reaberta.',true);return;}
    // Conferida a etapa, o roteiro segue para a proxima que ainda falta.
    const seguinte=proxima(indice+1);
    if(seguinte===null)aviso('Roteiro completo para esta loja.',true);
    else{indice=seguinte;aviso(`Conferência salva. Próxima etapa: ${etapas[seguinte].titulo}.`,true);desenhar();}
  };
}
async function salvar(corpo){
  if(salvando||carregando)return false;salvando=true;desenhar();
  try{
    const r=await api(`/api/gestao/clientes/${lojaId}/onboarding`,'PUT',corpo);registros=r.etapas;
    const loja=dados.clientes.find(c=>c.id===lojaId);if(loja)loja.onboarding_feitos=registros.filter(e=>e.concluido).map(e=>e.passo);
    return true;
  }catch(e){aviso(e.message);await buscar().catch(()=>{});return false;}
  finally{salvando=false;desenhar();}
}
/** Ao abrir uma loja, o roteiro comeca na primeira etapa que ainda nao foi conferida. */
function posicionar(){if(lojaId&&posicionada!==lojaId){indice=proxima()??0;posicionada=lojaId;}}
async function buscar(){const consulta=++requisicao;if(!lojaId){carregando=false;return;}const id=lojaId;carregando=true;
  try{const r=await api(`/api/gestao/clientes/${id}/onboarding`);if(requisicao===consulta&&lojaId===id)registros=r.etapas;}
  finally{if(requisicao===consulta)carregando=false;}
}
export async function onboarding(){
  const id=Number(new URLSearchParams(location.search).get('loja'));
  if(id&&dados.clientes.some(c=>c.id===id&&c.ativo))lojaId=id;
  if(lojaId&&!dados.clientes.some(c=>c.id===lojaId&&c.ativo)){lojaId=0;registros=[];}
  await buscar();posicionar();desenhar();
}
