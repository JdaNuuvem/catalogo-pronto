import {financeiro,cobrancas,repasses,configuracoes} from './gestao-financeiro.js';
import {clientes,implantacoes,tarefas,ficha} from './gestao-operacional.js';
import {guia,explicacaoIndicador} from './gestao-ajuda.js';
import {onboarding} from './gestao-onboarding.js';
export const $=id=>document.getElementById(id);
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((v||0)/100);
export const dia=v=>v?v.split('-').reverse().join('/'):'Sem data';
export let usuario,dados;
export const moeda=v=>Math.round(Number(String(v).replace(',','.'))*100);
export const chave=()=>crypto.randomUUID();
export function aviso(texto,bom=false){$('aviso').textContent=texto;$('aviso').hidden=false;$('aviso').classList.toggle('bom',bom);}
export async function api(url,method='GET',body){
  const r=await fetch(url,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(r.status===401){location.replace('/');throw new Error('Entre novamente.');}
  const d=await r.json();if(!r.ok)throw new Error(d.erro||'Não foi possível concluir.');return d;
}
export function tabela(cabecalhos,linhas){return `<div class="tabela"><table><thead><tr>${cabecalhos.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.length?linhas.join(''):`<tr><td colspan="${cabecalhos.length}" class="vazio">Nenhum registro neste momento.</td></tr>`}</tbody></table></div>`;}
export function indicadores(itens){return `<div class="indicadores">${itens.map(([nome,valor,dica])=>{const [explicacao,calculo]=explicacaoIndicador(nome);return `<article><span>${esc(nome)}</span><strong>${esc(valor)}</strong>${dica?`<small>${esc(dica)}</small>`:''}${explicacao?`<p class="indicador-descricao">${esc(explicacao)}</p>`:''}${calculo?`<details class="indicador-ajuda"><summary>Entenda o cálculo</summary><p>${esc(calculo)}</p></details>`:''}</article>`;}).join('')}</div>`;}
export function titulo(nome,descricao,acoes=''){return `<div class="titulo"><div><h2>${esc(nome)}</h2><p class="suave">${esc(descricao)}</p></div><div class="acoes-linha">${acoes}</div></div>`;}
export const opcoesClientes=()=>dados.clientes.filter(c=>c.ativo).map(c=>[c.id,c.nome]);
export function campo(nome,label,tipo='text',valor='',extra={}){return {nome,label,tipo,valor,...extra};}
export function dialogo(nome,campos,executar,dica=''){
  const form=$('formDinamico');form.reset();$('formTitulo').textContent=nome;$('formDica').textContent=dica;$('formErro').textContent='';
  $('formCampos').innerHTML=campos.map(c=>{
    const attrs=`name="${esc(c.nome)}" ${c.required===false?'':'required'} ${c.disabled?'disabled':''}`;
    let input=c.tipo==='select'?`<select ${attrs}>${(c.opcoes||[]).map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(c.valor)?'selected':''}>${esc(l)}</option>`).join('')}</select>`
      :c.tipo==='textarea'?`<textarea ${attrs} maxlength="5000">${esc(c.valor)}</textarea>`
      :`<input ${attrs} type="${esc(c.tipo)}" value="${esc(c.valor)}" ${c.tipo==='number'?'min="0" max="1000000" step="0.01"':''} ${c.tipo==='password'?'minlength="8" maxlength="200" autocomplete="new-password"':''}>`;
    return `<label class="${c.tipo==='textarea'?'largura':''}">${esc(c.label)}${input}</label>`;
  }).join('');
  form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;
    try{await executar(Object.fromEntries(new FormData(form)));$('formDialog').close();await carregar();aviso('Registro salvo.',true);}
    catch(e){$('formErro').textContent=e.message;}finally{b.disabled=false;}};
  $('formDialog').showModal();
}
export function confirmar(texto){return new Promise(resolve=>{
  $('confirmTexto').textContent=texto;$('confirmDialog').showModal();
  const fim=v=>{$('confirmDialog').close();resolve(v);};$('sim').onclick=()=>fim(true);$('nao').onclick=()=>fim(false);$('confirmDialog').oncancel=()=>resolve(false);
});}
export function conectar(acoes){for(const [selector,fn] of Object.entries(acoes))document.querySelectorAll(selector).forEach(el=>el.onclick=async()=>{
  el.disabled=true;try{await fn(el);}catch(e){aviso(e.message);}finally{el.disabled=false;}
});}
async function inicio(){
  const hoje=dados.hoje,pendentes=dados.tarefas.filter(t=>t.estado!=='concluida'),vencidas=dados.cobrancas.filter(c=>c.pendente&&c.vencimento<=hoje);
  $('conteudo').innerHTML=titulo('Seu dia na operação','Pendências da equipe, cobranças e entregas.','<a href="#lojas-novas">Montar uma loja nova passo a passo</a>')+indicadores([
    ['Clientes ativos',dados.clientes.filter(c=>c.ativo).length],['Tarefas em aberto',pendentes.length],['Cobranças a conferir',vencidas.length],
    ['Tarefas atrasadas',pendentes.filter(t=>t.prazo&&t.prazo<hoje).length],
    [usuario.admin?'Recebido no período':'Seu repasse disponível',brl(usuario.admin?dados.resumo.recebido:dados.resumo.disponivel)]
    ,...(usuario.admin?[['Suporte mensal contratado',brl(dados.contratos.filter(c=>c.ativo&&c.tipo==='suporte').reduce((s,c)=>s+c.valor,0))]]:[])
  ])+`<div class="cartao"><h2>Próximas ações</h2>${tabela(['Cliente','Tarefa','Prazo'],pendentes.slice(0,10).map(t=>`<tr><td><a href="#cliente-${t.loja_id}">${esc(t.cliente)}</a></td><td>${esc(t.titulo)}</td><td>${dia(t.prazo)}</td></tr>`))}</div>
  <div class="cartao"><h2>Cobranças vencidas ou de hoje</h2>${tabela(['Cliente','Componente','Falta receber'],vencidas.slice(0,10).map(c=>`<tr><td>${esc(c.cliente)}</td><td><a href="#cobrancas">${esc(c.descricao)}</a></td><td>${brl(c.pendente)}</td></tr>`))}</div>`;
}
export async function renderizar(){
  const aba=location.hash.slice(1)||'inicio';document.querySelectorAll('aside a').forEach(a=>a.classList.toggle('ativo',a.hash==='#'+aba));
  const fichaAberta=aba.startsWith('cliente-');
  const telas={inicio,clientes,implantacoes,cobrancas,financeiro,repasses,tarefas,configuracoes,'lojas-novas':onboarding};
  if(!usuario.admin&&['financeiro','configuracoes'].includes(aba)){location.hash='inicio';return;}
  $('periodo').hidden=!['inicio','financeiro'].includes(aba);
  $('ajudaPeriodo').hidden=$('periodo').hidden;
  await (fichaAberta?ficha(Number(aba.slice(8))):(telas[aba]||inicio)());
  if((location.hash.slice(1)||'inicio')===aba&&!$('conteudo').querySelector('[data-guia]'))$('conteudo').insertAdjacentHTML('afterbegin',guia(fichaAberta?'ficha':aba,usuario.admin));
}
export async function carregar(){dados=await api(`/api/gestao?inicio=${$('inicio').value}&fim=${$('fim').value}`);await renderizar();}
$('cancelar').onclick=()=>$('formDialog').close();
$('atualizar').onclick=async()=>{try{await carregar();}catch(e){aviso(e.message);}};
$('senha').onclick=()=>dialogo('Alterar minha senha',[campo('atual','Senha atual','password'),campo('nova','Nova senha','password')],async b=>{await api('/api/gestao/senha','PUT',b);location.replace('/');},'Após salvar, entre novamente com a nova senha.');
$('sair').onclick=async()=>{try{await api('/api/sair','POST');location.replace('/');}catch(e){aviso(e.message);}};
window.addEventListener('hashchange',()=>renderizar().catch(e=>aviso(e.message)));
(async()=>{try{
  usuario=await api('/api/eu');if(!usuario.admin&&usuario.papel!=='atendente'){location.replace('/');return;}
  document.body.classList.toggle('admin',usuario.admin);$('identidade').textContent=`${usuario.nome} · ${usuario.admin?'Toda a operação':'Sua carteira'}`;
  dados=await api('/api/gestao');$('inicio').value=dados.inicio;$('fim').value=dados.fim;await renderizar();
}catch(e){aviso(e.message);}})();
