import {$,dados,brl,dia,api,carregar,aviso} from './gestao.js';

/* ---------------------------------------------------------------------
   Pix do plano da plataforma.

   O servidor entra no Cardapio.ai da loja e gera o Pix de renovacao. Aqui a
   tela acompanha o andamento pelo mesmo canal da publicacao de produtos e,
   se o Cardapio.ai pedir codigo de verificacao, pede para quem esta na tela.
   --------------------------------------------------------------------- */
let fonte=null,interrompido=false,cancelarAtual=null,ligado=false;

function etapa(texto,classe=''){const li=document.createElement('li');li.textContent=texto;if(classe)li.className=classe;$('pixEtapas').append(li);}
function limpar(){
  $('pixEtapas').innerHTML='';$('pixErro').textContent='';$('pixMfa').hidden=true;$('pixResultado').hidden=true;$('pixAviso').hidden=true;$('pixResumo').innerHTML='';
}
function abrir(titulo,subtitulo){
  ligar();$('pixTitulo').textContent=titulo;$('pixSubtitulo').textContent=subtitulo;
  if(!$('pixDialog').open){interrompido=false;$('pixDialog').showModal();}
}
const descrever=c=>`${c.cliente} · ${c.descricao} · vence ${dia(c.vencimento)}`;

function mostrar(c){
  $('pixResultado').hidden=!c?.pix_codigo;if(!c?.pix_codigo)return;
  $('pixQr').src=c.pix_qr||'';$('pixQr').hidden=!c.pix_qr;
  $('pixValor').textContent=`${c.pix_valor?brl(c.pix_valor):'Valor livre'}${c.pix_competencia?` · renovação de ${c.pix_competencia}`:''}`;
  $('pixGerado').textContent=c.pix_gerado_em?`Gerado em ${new Date(c.pix_gerado_em.replace(' ','T')+'Z').toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`:'';
  $('pixCopia').value=c.pix_codigo;
  const diferente=c.pix_valor&&c.pix_valor!==c.valor;
  $('pixAviso').hidden=!diferente;
  if(diferente)$('pixAviso').textContent=`O Pix do Cardapio.ai é de ${brl(c.pix_valor)}, mas o plano cadastrado é ${brl(c.valor)}. Confira antes de pagar.`;
}

export function verPix(c){limpar();abrir('Pix da plataforma',descrever(c));mostrar(c);}

/** Gera o Pix de uma cobranca de plano. Resolve com true quando o codigo foi guardado. */
export async function gerarPix(c,{lote=false}={}){
  if(!lote)limpar();
  abrir(lote?$('pixTitulo').textContent:'Gerando o Pix no Cardapio.ai',descrever(c));
  let lojaId;
  try{lojaId=(await api(`/api/gestao/cobrancas/${c.id}/pix`,'POST',{})).loja_id;}
  catch(e){$('pixErro').textContent=e.message;return false;}
  const ok=await acompanhar(lojaId);
  await carregar();
  if(ok&&!lote){$('pixTitulo').textContent='Pix da plataforma';mostrar(dados.cobrancas.find(x=>x.id===c.id));}
  return ok;
}

function acompanhar(lojaId){
  return new Promise(resolve=>{
    fonte=new EventSource(`/api/lojas/${lojaId}/eventos`);
    const fim=(ok,erro)=>{if(fonte){fonte.close();fonte=null;}cancelarAtual=null;$('pixMfa').hidden=true;if(erro)$('pixErro').textContent=erro;resolve(ok);};
    // Fechar a janela para de acompanhar; a automacao termina sozinha no servidor.
    cancelarAtual=()=>fim(false,'Janela fechada antes do fim.');
    $('pixMfa').onsubmit=async e=>{
      e.preventDefault();const codigo=$('pixCodigoMfa').value.trim();if(!codigo)return;
      try{await api(`/api/lojas/${lojaId}/mfa`,'POST',{codigo});$('pixCodigoMfa').value='';$('pixMfa').hidden=true;etapa('código enviado, continuando');}
      catch(err){$('pixErro').textContent=err.message;}
    };
    fonte.onmessage=m=>{
      const ev=JSON.parse(m.data);
      if(ev.tipo==='etapa')etapa(ev.texto);
      if(ev.tipo==='mfa'){etapa('o Cardapio.ai pediu o código de verificação da loja','alerta');$('pixMfa').hidden=false;$('pixCodigoMfa').focus();}
      if(ev.tipo==='fim')fim(!!ev.pix,ev.pix?'':'A automação terminou sem devolver o Pix.');
      if(ev.tipo==='fatal')fim(false,`Não deu certo: ${ev.erro}`);
      if(ev.tipo==='ocioso')fim(false,'A automação não está mais rodando. Confira a cobrança e tente de novo.');
    };
    fonte.onerror=()=>fim(false,'A conexão com o andamento caiu. Feche e confira a cobrança.');
  });
}

/** Cobrancas de plano que ainda precisam de Pix: a mais antiga em aberto de cada loja. */
export function pendentesDePix(){
  const porLoja=new Map();
  for(const c of dados.cobrancas.filter(c=>c.tipo==='plano'&&!c.cancelada&&!c.pix_codigo&&c.plataforma_paga<c.valor).sort((a,b)=>a.vencimento.localeCompare(b.vencimento)))
    if(!porLoja.has(c.loja_id))porLoja.set(c.loja_id,c);
  return [...porLoja.values()];
}

/** Gera o Pix de varias lojas, uma de cada vez, na mesma janela. */
export async function gerarPixEmLote(lista){
  if(!lista.length){aviso('Nenhuma cobrança de plano precisa de Pix agora.',true);return;}
  limpar();const resultado=[];
  for(const [i,c] of lista.entries()){
    if(interrompido)break;
    abrir(`Gerando Pix da plataforma (${i+1} de ${lista.length})`,descrever(c));
    $('pixEtapas').innerHTML='';$('pixErro').textContent='';
    const ok=await gerarPix(c,{lote:true});
    resultado.push({c,ok,erro:$('pixErro').textContent});
    $('pixResumo').innerHTML=resultado.map(r=>`<li class="${r.ok?'ok':'erro'}">${r.ok?'✓':'✗'} ${r.c.cliente}${r.ok?'':` — ${r.erro}`}</li>`).join('');
  }
  if(!$('pixDialog').open)return;
  const ok=resultado.filter(r=>r.ok).length;
  $('pixTitulo').textContent=`Pix da plataforma: ${ok} de ${lista.length} gerados`;$('pixSubtitulo').textContent='Abra cada cobrança de plano em Ver Pix para pagar.';
  $('pixEtapas').innerHTML='';$('pixErro').textContent='';
}

// Ligado na primeira abertura: este modulo e carregado antes de gestao.js terminar de iniciar.
function ligar(){
  if(ligado)return;ligado=true;
  $('pixFechar').onclick=()=>$('pixDialog').close();
  $('pixDialog').onclose=()=>{interrompido=true;if(cancelarAtual)cancelarAtual();};
  $('pixCopiar').onclick=async()=>{
    try{await navigator.clipboard.writeText($('pixCopia').value);}catch{$('pixCopia').select();}
    $('pixCopiar').textContent='Copiado';setTimeout(()=>{$('pixCopiar').textContent='Copiar código';},1800);
  };
}
