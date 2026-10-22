import {$,dados,esc,brl,dia,dialogo,campo,conectar,api} from './gestao.js';
import {gerarPix,verPix} from './gestao-pix.js';

/* ---------------------------------------------------------------------
   Lembretes do dia (calculados no servidor) e a mensagem de cobranca pronta
   para o WhatsApp, ja com a chave Pix da operacao.
   --------------------------------------------------------------------- */
const ROTULO={urgente:'Atrasado',hoje:'Hoje',breve:'Em breve'};
const cobranca=id=>dados.cobrancas.find(c=>c.id===id);
const mesPorExtenso=competencia=>new Date(competencia+'-15T12:00:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});

function acoes(l,i){
  if(l.tipo==='vencendo'||l.tipo==='vencida')return `<button class="mini principal" data-lembrete-whats="${i}">Mensagem no WhatsApp</button><a class="mini-link" href="#cobrancas">Cobranças</a>`;
  if(l.tipo==='plataforma')return cobranca(l.cobrancas[0])?.pix_codigo?`<button class="mini principal" data-lembrete-pix="${i}">Ver Pix para pagar</button>`:`<button class="mini principal" data-lembrete-gerar="${i}">Gerar Pix</button>`;
  if(l.tipo==='prazo-loja')return `<a class="mini-link" href="/gestao.html?loja=${l.loja_id}#lojas-novas">Abrir roteiro</a>`;
  if(l.tipo==='prazo-tarefa')return '<a class="mini-link" href="#tarefas">Abrir tarefas</a>';
  return '';
}

export function painelLembretes(){
  const lista=dados.lembretes||[];
  if(!lista.length)return `<div class="cartao lembretes"><h2>Lembretes de hoje</h2><p class="suave">Nada pendente. Cobranças vencendo, prazos e o pagamento da plataforma aparecem aqui quando pedirem atenção.</p></div>`;
  return `<div class="cartao lembretes"><h2>Lembretes de hoje <span class="contador">${lista.length}</span></h2><ul class="lista-lembretes">${lista.map((l,i)=>
    `<li class="lembrete ${l.nivel}"><span class="selo-nivel">${ROTULO[l.nivel]}</span><div class="lembrete-texto"><b>${esc(l.titulo)}</b>${l.valor?`<small>${brl(l.valor)}</small>`:''}</div><div class="acoes-linha">${acoes(l,i)}</div></li>`).join('')}</ul></div>`;
}

export function ligarLembretes(){
  const lembrete=b=>dados.lembretes[Number(b.dataset.lembreteWhats??b.dataset.lembretePix??b.dataset.lembreteGerar)];
  conectar({'[data-lembrete-whats]':b=>abrirMensagem(lembrete(b)),'[data-lembrete-pix]':b=>verPix(cobranca(lembrete(b).cobrancas[0])),
    '[data-lembrete-gerar]':b=>gerarPix(cobranca(lembrete(b).cobrancas[0]))});
}

/** Texto da cobranca para o cliente: o que vence, quanto e para onde pagar. */
export function textoCobranca({cobrancas,valor}){
  const partes=cobrancas.map(cobranca).filter(Boolean),c=partes[0],cliente=dados.clientes.find(l=>l.id===c.loja_id),pix=dados.pix_operacao;
  const oque=c.grupo&&c.competencia?`a mensalidade de ${mesPorExtenso(c.competencia)} (suporte + plano Cardapio.ai)`:`a cobrança de ${c.descricao}`;
  const prazo=c.vencimento<dados.hoje?`venceu em ${dia(c.vencimento)}`:c.vencimento===dados.hoje?'vence hoje':`vence em ${dia(c.vencimento)}`;
  const nome=(cliente?.contato||'').trim().split(/\s+/)[0];
  return [`Olá${nome?`, ${nome}`:''}! Tudo bem?`,`Passando para lembrar que ${oque} da loja ${c.cliente} ${prazo}. Valor: ${brl(valor??partes.reduce((n,p)=>n+p.pendente,0))}.`,
    pix?.chave?`Pix para pagamento: ${pix.chave}${pix.nome?` (${pix.nome})`:''}`:'','Assim que pagar, me envie o comprovante por aqui, por favor. Obrigado!'].filter(Boolean).join('\n\n');
}

/** Mostra a mensagem, abre a conversa no WhatsApp e, ao salvar, marca a cobranca como enviada. */
export function abrirMensagem({cobrancas,valor}){
  const c=cobranca(cobrancas[0]),cliente=dados.clientes.find(l=>l.id===c.loja_id),texto=textoCobranca({cobrancas,valor});
  dialogo('Mensagem de cobrança',[campo('mensagem','Texto da mensagem','textarea',texto)],
    async()=>{for(const id of cobrancas)await api(`/api/gestao/cobrancas/${id}/enviada`,'POST',{});},
    'Depois de mandar, clique em Salvar para marcar a cobrança como enviada.');
  const dicas=[];
  if(cliente?.whatsapp){const numero=cliente.whatsapp.length<=11?'55'+cliente.whatsapp:cliente.whatsapp;
    dicas.push(`<a class="whatsapp" href="https://wa.me/${numero}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Abrir conversa no WhatsApp</a>`);}
  else dicas.push('Esta loja não tem WhatsApp cadastrado. Copie o texto e envie pelo canal de costume.');
  if(!dados.pix_operacao?.chave)dicas.push('A chave Pix da operação ainda não foi cadastrada (Lojas e IA › Recebimento das mensalidades).');
  dicas.push('Depois de mandar, clique em Salvar para marcar a cobrança como enviada.');
  $('formDica').innerHTML=dicas.map(d=>`<span>${d}</span>`).join('<br>');
  // Se o texto for ajustado antes de enviar, o link do WhatsApp leva a versao ajustada.
  const area=$('formCampos').querySelector('textarea'),link=$('formDica').querySelector('a.whatsapp');
  if(area)area.style.minHeight='230px';
  if(area&&link)area.oninput=()=>{link.href=link.href.replace(/text=.*$/,'text='+encodeURIComponent(area.value));};
}
