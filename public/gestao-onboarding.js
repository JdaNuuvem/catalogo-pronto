import {$,dados,usuario,esc,brl,titulo,api,aviso} from './gestao.js';
const etapas=[
  {id:'cadastro',titulo:'Cadastrar a loja e o responsável',quem:'Atendente e administrador',equipe:true,
    objetivo:'Deixe registrado quem é o cliente, qual loja será montada e quem vai fazer o atendimento.',
    fazer:['Peça nome da loja, nome do responsável, WhatsApp, quantidade de produtos e referências da identidade visual.','O administrador usa Clientes e equipe para cadastrar a loja e vincular o atendente.','Depois do cadastro, selecione essa loja no campo acima para salvar o progresso deste roteiro.'],
    conferir:['Loja cadastrada na carteira.','Contato e atendente responsável conferidos.'],
    acoes:[['Cadastrar uma nova loja','cadastro'],['Conferir cadastro desta loja','cadastro-ficha']]},
  {id:'acordo',titulo:'Confirmar o serviço e a cobrança',quem:'Atendente coleta; administrador registra',equipe:true,
    objetivo:'Combine os valores, a quantidade de produtos, o prazo e o que o cliente vai receber.',
    fazer:['A implantação padrão custa R$ 400 com 25 produtos incluídos. Cada produto acima de 25 custa R$ 3.','Combine o suporte mensal e o valor do plano Cardapio.ai. Eles devem ficar separados do serviço de implantação.','Na ficha da loja, o administrador cria a cobrança da implantação. Quando o cliente pagar, registra o valor em Receber, na tela Cobranças.'],
    conferir:['Quantidade de produtos, orçamento e prazo aceitos pelo cliente.','Cobrança da implantação registrada e situação do pagamento conferida.'],
    acoes:[['Conferir cobranças e recebimentos','cobrancas']]},
  {id:'email',titulo:'Criar o e-mail da loja',quem:'Administrador',
    objetivo:'Prepare o e-mail que será usado para criar a conta da loja no Cardapio.ai.',
    fazer:['Abra o Proton e crie o e-mail combinado para a loja.','Confira se consegue entrar na caixa de entrada e receber mensagens.','Guarde o acesso ao e-mail no seu controle de credenciais. O e-mail do painel e o e-mail da loja podem ser diferentes.'],
    conferir:['E-mail criado e caixa de entrada acessível.','Endereço correto separado para o cadastro no Cardapio.ai.'],
    acoes:[['Abrir Proton','proton']]},
  {id:'conta',titulo:'Criar a conta no Cardapio.ai',quem:'Administrador',
    objetivo:'Use o e-mail da loja para criar e verificar sua conta na plataforma.',
    fazer:['Abra o Cardapio.ai e cadastre a nova loja com o e-mail criado na etapa anterior.','Conclua as verificações solicitadas pela plataforma.','Em Configurações de acessos, informe as credenciais do Cardapio.ai na loja correspondente para conectar a automação.'],
    conferir:['Login na loja do cliente funcionando.','Credenciais vinculadas à loja correta no nosso painel.'],
    acoes:[['Abrir Cardapio.ai','cardapio'],['Configurar os acessos da loja','acessos']]},
  {id:'configuracao',titulo:'Montar a loja e a identidade visual',quem:'Administrador',
    objetivo:'Prepare a apresentação da loja e as configurações necessárias para ela atender os pedidos.',
    fazer:['Receba o logo e as referências do cliente, ou prepare a identidade visual combinada.','Configure no Cardapio.ai nome, apresentação, contato, horários e as opções de atendimento e entrega da loja.','Confira com o cliente as formas de pagamento e os dados que devem aparecer na loja. Guarde os materiais visuais na ficha como Logo / identidade visual.'],
    conferir:['Identidade visual e informações da loja revisadas.','Horários, atendimento, entrega e pagamentos conferidos com o cliente.'],
    acoes:[['Abrir o painel do Cardapio.ai','painel-cardapio']]},
  {id:'materiais',titulo:'Receber fotos e preços organizados',quem:'Atendente e administrador',equipe:true,
    objetivo:'Reúna tudo que é necessário para transformar os produtos reais em fichas do catálogo.',
    fazer:['Peça uma foto legível de cada produto e o preço de venda informado pelo cliente.','Na ficha, envie as imagens com a finalidade Produtos. Use Organizar para informar nome, preço, unidade ou peso, categoria e observações.','Compare a quantidade de fotos com os produtos contratados. Registre o que falta na implantação ou abra uma tarefa aguardando o cliente.'],
    conferir:['Fotos de todos os produtos recebidas e legíveis.','Preços e unidades informados; pendências resolvidas.'],
    acoes:[['Enviar e organizar materiais','ficha']]},
  {id:'revisao',titulo:'Analisar e revisar os produtos',quem:'Administrador',
    objetivo:'Confira os textos e preços antes de enviar qualquer produto à loja do cliente.',
    fazer:['Na ficha, use Analisar foto com IA para gerar uma sugestão de título, descrição e categoria. Revise antes de salvar.','Envie os materiais organizados para revisão e abra o lote desta loja. Também é possível enviar fotos diretamente no painel de produtos.','Confira nome, descrição, categoria e preço positivo de cada ficha. Desmarque produtos que não devem ser publicados.'],
    conferir:['Textos, categorias e preços corretos.','Somente os produtos que devem entrar na loja estão aprovados.'],
    acoes:[['Analisar as fotos na ficha','ficha'],['Abrir a revisão desta loja','produtos']]},
  {id:'publicacao',titulo:'Publicar e conferir a loja',quem:'Administrador',
    objetivo:'Envie os produtos aprovados e confirme que apareceram corretamente no Cardapio.ai.',
    fazer:['Na revisão desta loja, clique em Publicar aprovados e acompanhe o progresso.','Se a plataforma pedir verificação, obtenha o código recebido pelo cliente e informe no painel.','Abra a loja e confira produtos, imagens, categorias e preços. Corrija as falhas e tente novamente o que não foi publicado.'],
    conferir:['Todos os produtos contratados publicados ou pendências resolvidas.','Catálogo conferido na loja do cliente.'],
    acoes:[['Publicar os produtos desta loja','produtos'],['Conferir o catálogo da loja','catalogo']]},
  {id:'entrega',titulo:'Entregar a loja e orientar o cliente',quem:'Atendente e administrador',equipe:true,
    objetivo:'Entregue uma loja conferida e explique ao cliente como ela será usada no dia a dia.',
    fazer:['Envie o link da loja e confirme que o cliente consegue acessá-la.','Oriente sobre recebimento de pedidos, alterações de produtos e como pedir suporte. Configure e teste a impressora, quando fizer parte do serviço.','Registre os detalhes da entrega na ficha e, depois da conferência, atualize a implantação para Entregue.'],
    conferir:['Cliente recebeu o link e as orientações.','Pendências de entrega resolvidas e implantação atualizada.'],
    acoes:[['Registrar a entrega na ficha da loja','ficha']]},
  {id:'mensalidades',titulo:'Organizar o suporte e as renovações',quem:'Administrador',
    objetivo:'Prepare o acompanhamento mensal para a loja continuar funcionando e pagando no vencimento correto.',
    fazer:['Crie um contrato mensal para seu suporte e outro para o plano Cardapio.ai, com os valores e vencimentos combinados.','Use Gerar mensalidades para criar as cobranças até o mês escolhido. A rotina também verifica os contratos a cada hora.','A cada renovação, gere o Pix no Cardapio.ai e envie ao cliente. Registre os valores recebidos em cada cobrança e, depois de pagar a plataforma, registre o pagamento do plano.'],
    conferir:['Contratos de suporte e plano cadastrados, quando aplicáveis.','Primeiro vencimento e forma de acompanhamento mensal definidos.'],
    acoes:[['Cadastrar contratos e mensalidades','cobrancas']]},
  {id:'repasse',titulo:'Fechar os custos e a divisão do serviço',quem:'Administrador',
    objetivo:'Registre os gastos para calcular a parte do atendente e o resultado da implantação.',
    fazer:['Registre na cobrança do serviço os custos de IA, fotos, taxas e terceiros. Despesas gerais precisam ser distribuídas usando Ratear, no Financeiro.','Confira os recebimentos e feche os custos. O sistema libera 50% do valor após custos, proporcional ao que o cliente já pagou.','Depois de pagar o atendente, registre o repasse. O valor recebido para o plano Cardapio.ai continua separado dessa divisão.'],
    conferir:['Custos e recebimentos da implantação conferidos.','Repasse disponível revisado e combinado com o atendente.'],
    acoes:[['Conferir custos e recebimentos','cobrancas'],['Conferir a parte do atendente','repasses']]}
];
let lojaId=0,indice=0,registros=[],salvando=false,carregando=false,requisicao=0;
const destinos={cadastro:'/operacao.html?novoCliente=1',cobrancas:'#cobrancas',tarefas:'#tarefas',implantacoes:'#implantacoes',configuracoes:'#configuracoes',financeiro:'#financeiro',repasses:'#repasses',acessos:'/admin.html',proton:'https://mail.proton.me/',cardapio:'https://cardapio.ai/','painel-cardapio':'https://cardapio.ai/painelweb/listar'};
function destino(tipo,loja){if(tipo==='cadastro-ficha')return `/gestao.html?loja=${lojaId}&orientacao=cadastro#cliente-${lojaId}`;if(tipo==='ficha')return `#cliente-${lojaId}`;if(tipo==='produtos')return `/?produtos=1&loja=${lojaId}`;if(tipo==='catalogo')return loja.cdp_link;return destinos[tipo];}
function permitido(tipo,loja){
  if(!usuario.admin&&['cadastro','acessos','configuracoes','financeiro'].includes(tipo))return false;
  if(tipo==='cadastro')return !loja;
  if(!['proton','cardapio'].includes(tipo)&&!loja)return false;
  if(tipo==='catalogo'){
    try{const url=new URL(loja.cdp_link);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}
  }
  return true;
}
function pronto(passo){return registros.some(r=>r.passo===passo&&r.concluido);}
function desenhar(){
  if((location.hash.slice(1)||'inicio')!=='lojas-novas')return;
  const loja=dados.clientes.find(c=>c.id===lojaId&&c.ativo),etapa=etapas[indice],feitas=etapas.filter(e=>pronto(e.id)).length;
  const registro=registros.find(r=>r.passo===etapa.id),concluida=pronto(etapa.id),podeConferir=usuario.admin||etapa.equipe;
  const acoes=etapa.acoes.filter(([,tipo])=>permitido(tipo,loja));
  $('conteudo').innerHTML=titulo('Passo a passo lojas novas','Siga o roteiro da contratação até a entrega e o acompanhamento mensal.')+
    `<section class="onboarding-intro"><p><b>Como usar:</b> escolha a loja, leia uma etapa por vez e abra os links para executar o trabalho. Marque a etapa como conferida depois de concluir as verificações.</p><p class="suave">O checklist salva o progresso da equipe. Cobranças, pagamentos, publicação e a etapa da implantação são registrados nas suas telas.</p>
    <label for="lojaOnboarding">Loja que vamos montar<select id="lojaOnboarding" ${carregando||salvando?'disabled':''}><option value="0">Escolha uma loja para salvar o progresso</option>${dados.clientes.filter(c=>c.ativo).map(c=>`<option value="${c.id}" ${c.id===lojaId?'selected':''}>${esc(c.nome)}</option>`).join('')}</select></label>
    ${loja?`<div class="onboarding-progresso"><span>${feitas} de ${etapas.length} etapas conferidas · ${esc(loja.atendente||'Sem atendente vinculado')}</span><progress max="${etapas.length}" value="${feitas}" aria-label="Progresso do passo a passo"></progress></div>`:'<p class="suave">Você já pode ler o roteiro. Depois de cadastrar a loja, selecione-a acima para acompanhar as etapas.</p>'}</section>
    <div class="onboarding-layout"><label class="onboarding-seletor" for="passoSelecionado">Etapa do roteiro<select id="passoSelecionado">${etapas.map((e,i)=>`<option value="${i}" ${i===indice?'selected':''}>${i+1}. ${esc(e.titulo)}${pronto(e.id)?' · conferida':''}</option>`).join('')}</select></label><nav class="onboarding-menu" aria-label="Etapas da loja nova">${etapas.map((e,i)=>`<button data-passo="${i}" type="button" ${i===indice?'aria-current="step"':''}><span>${pronto(e.id)?'✓':i+1}</span>${esc(e.titulo)}</button>`).join('')}</nav>
    <article class="onboarding-etapa" aria-labelledby="etapaOnboarding"><span class="sobretitulo">ETAPA ${indice+1} DE ${etapas.length} · ${esc(etapa.quem)}</span><h3 id="etapaOnboarding">${esc(etapa.titulo)}</h3><p>${esc(etapa.objetivo)}</p>
    ${etapa.id==='acordo'&&loja?`<p class="atencao">Orçamento cadastrado da implantação: <b>${brl(loja.implantacao_centavos+Math.max(0,loja.produtos_contratados-25)*loja.adicional_centavos)}</b> para ${loja.produtos_contratados} produtos, antes dos custos.</p>`:''}
    <h4>O que fazer</h4><ol>${etapa.fazer.map(t=>`<li>${esc(t)}</li>`).join('')}</ol><h4>Confira antes de marcar</h4><ul>${etapa.conferir.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
    ${acoes.length?`<div class="acoes-linha">${acoes.map(([label,tipo])=>`<a class="onboarding-link" href="${esc(destino(tipo,loja))}" ${['proton','cardapio','painel-cardapio','catalogo'].includes(tipo)?'target="_blank" rel="noopener"':''}>${esc(label)}</a>`).join('')}</div>`:!loja?'<p class="suave">Selecione uma loja acima para abrir as ações desta etapa.</p>':''}
    ${!podeConferir?'<p class="atencao">Esta etapa é conferida pelo administrador. Você pode consultar as instruções e combinar o andamento com ele.</p>':''}
    <div class="onboarding-confirmacao">${loja&&podeConferir?`<button id="conferirEtapa" class="${concluida?'':'principal'}" ${salvando||carregando?'disabled':''}>${concluida?'Reabrir esta etapa':'Marcar etapa como conferida'}</button>`:'<p class="suave">'+(loja?'A confirmação desta etapa fica com o administrador.':'Selecione uma loja para registrar a conferência.')+'</p>'}
    ${concluida?`<p class="suave">Conferida por ${esc(registro.responsavel)} em ${esc(new Date(registro.atualizado_em.replace(' ','T')+'Z').toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))}.</p>`:''}</div>
    <div class="onboarding-navegacao"><button id="passoAnterior" ${indice===0?'disabled':''}>← Etapa anterior</button><button id="passoSeguinte" ${indice===etapas.length-1?'disabled':''}>Próxima etapa →</button></div>
    ${feitas===etapas.length&&loja?'<p class="onboarding-concluido">Roteiro conferido pela equipe. Acompanhe agora as mensalidades e as solicitações dessa loja.</p>':''}</article></div>`;
  $('lojaOnboarding').onchange=async e=>{
    const novo=Number(e.target.value);lojaId=novo;indice=0;registros=[];
    const url=new URL(location.href);if(novo)url.searchParams.set('loja',String(novo));else url.searchParams.delete('loja');history.replaceState(null,'',url);
    const consulta=buscar();desenhar();
    try{await consulta;desenhar();}catch(e){aviso(e.message);desenhar();}
  };
  document.querySelectorAll('[data-passo]').forEach(b=>b.onclick=()=>{indice=Number(b.dataset.passo);desenhar();});
  $('passoSelecionado').onchange=e=>{indice=Number(e.target.value);desenhar();};
  $('passoAnterior').onclick=()=>{indice=Math.max(0,indice-1);desenhar();};$('passoSeguinte').onclick=()=>{indice=Math.min(etapas.length-1,indice+1);desenhar();};
  if($('conferirEtapa'))$('conferirEtapa').onclick=async()=>{
    if(salvando||carregando)return;salvando=true;desenhar();
    try{const r=await api(`/api/gestao/clientes/${lojaId}/onboarding`,'PUT',{passo:etapa.id,concluido:!concluida});registros=r.etapas;aviso(concluida?'Etapa reaberta.':'Conferência salva para esta loja.',true);}
    catch(e){aviso(e.message);}finally{salvando=false;desenhar();}
  };
}
async function buscar(){const consulta=++requisicao;if(!lojaId){carregando=false;return;}const id=lojaId;carregando=true;
  try{const r=await api(`/api/gestao/clientes/${id}/onboarding`);if(requisicao===consulta&&lojaId===id)registros=r.etapas;}
  finally{if(requisicao===consulta)carregando=false;}
}
export async function onboarding(){
  const id=Number(new URLSearchParams(location.search).get('loja'));
  if(id&&dados.clientes.some(c=>c.id===id&&c.ativo))lojaId=id;
  if(lojaId&&!dados.clientes.some(c=>c.id===lojaId&&c.ativo)){lojaId=0;registros=[];}
  await buscar();desenhar();
}
