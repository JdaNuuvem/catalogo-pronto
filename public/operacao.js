'use strict';
const $ = id => document.getElementById(id);
const escapar = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dinheiro = centavos => new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(centavos / 100);
const dataBr = data => data ? data.split('-').reverse().join('/') : 'Sem data definida';
let usuario, carteira = [], atendentes = [], hoje, editando = null;

async function api(caminho, metodo = 'GET', corpo) {
  const r = await fetch(caminho, {method:metodo, headers:{'content-type':'application/json'}, ...(corpo ? {body:JSON.stringify(corpo)} : {})});
  if (r.status === 401) { location.replace('/'); throw new Error('Entre novamente para continuar.'); }
  const dados = await r.json();
  if (!r.ok) throw new Error(dados.erro || 'Não foi possível concluir.');
  return dados;
}
function avisar(texto, bom = false) { $('aviso').textContent = texto; $('aviso').hidden = false; $('aviso').classList.toggle('bom', bom); }
function diasAte(data) { return data ? Math.round((Date.parse(data + 'T12:00:00Z') - Date.parse(hoje + 'T12:00:00Z')) / 86400000) : null; }
function situacao(cliente) {
  const dias = diasAte(cliente.vencimento);
  if (dias === null) return {classe:'', texto:'Definir vencimento'};
  if (dias < 0) return {classe:'passado', texto:'Conferir pagamento'};
  if (!dias) return {classe:'hoje', texto:'Vence hoje'};
  return {classe:dias <= 7 ? 'proximo' : '', texto:`Em ${dias} dia${dias === 1 ? '' : 's'}`};
}
function renderizar() {
  $('total').textContent = carteira.length;
  const emOperacao = carteira.filter(c => c.etapa !== 'pausada');
  $('hoje').textContent = emOperacao.filter(c => c.vencimento === hoje).length;
  $('passados').textContent = emOperacao.filter(c => c.vencimento && c.vencimento < hoje).length;
  $('parte').textContent = dinheiro(carteira.reduce((s,c) => s + c.parte_atendente_centavos, 0));
  const busca = $('busca').value.trim().toLocaleLowerCase('pt-BR');
  const filtro = $('filtroVencimento').value, responsavel = $('filtroAtendente').value;
  const lista = carteira.filter(c => {
    if (busca && !`${c.nome} ${c.email} ${c.whatsapp}`.toLocaleLowerCase('pt-BR').includes(busca)) return false;
    if (usuario.admin && responsavel && (responsavel === 'sem' ? c.atendente_id !== null : String(c.atendente_id) !== responsavel)) return false;
    const dias = diasAte(c.vencimento);
    if (filtro === 'sem') return dias === null;
    if (filtro === 'hoje') return dias === 0 && c.etapa !== 'pausada';
    if (filtro === 'passados') return dias !== null && dias < 0 && c.etapa !== 'pausada';
    if (filtro === 'proximos') return dias !== null && dias >= 0 && dias <= 7 && c.etapa !== 'pausada';
    return true;
  });
  $('clientes').innerHTML = lista.length ? lista.map(c => {
    const status = situacao(c), numero = c.whatsapp.length <= 11 ? '55' + c.whatsapp : c.whatsapp;
    const etapas = {implantacao:'Em implantação', ativa:'Loja ativa', pausada:'Pausada'};
    return `<tr><td><b>${escapar(c.nome)}</b><small>${escapar(c.email)}</small><span class="marca">${etapas[c.etapa]}</span></td>
      <td>${escapar(c.atendente_nome || 'Sem responsável')}</td>
      <td class="data">${dataBr(c.vencimento)}<small><span class="marca ${c.etapa === 'pausada' ? '' : status.classe}">${c.etapa === 'pausada' ? 'Loja pausada' : status.texto}</span></small><small>Plano: ${dinheiro(c.plano_centavos)}</small></td>
      <td>${dinheiro(c.servico_centavos)}<small>${c.produtos_contratados} produtos</small><small>Atendente: ${dinheiro(c.parte_atendente_centavos)}</small></td>
      <td>${dinheiro(c.suporte_centavos)}<small>Atendente: ${dinheiro(c.suporte_atendente_centavos)}</small></td>
      <td><a href="/gestao.html#cliente-${c.id}">Abrir ficha</a>${c.whatsapp ? `<a href="https://wa.me/${numero}" target="_blank" rel="noopener">WhatsApp</a>` : '<small>WhatsApp não informado</small>'}${usuario.admin ? `<button data-editar="${c.id}">Editar</button>` : ''}</td></tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhum cliente encontrado. Os clientes vinculados aparecerão aqui.</td></tr>';
}
async function carregar() {
  const dados = await api('/api/operacao');
  carteira = dados.clientes; atendentes = dados.atendentes; hoje = dados.hoje;
  const filtroAnterior = $('filtroAtendente').value;
  const opcoes = atendentes.map(a => `<option value="${a.id}">${escapar(a.nome)}</option>`).join('');
  $('filtroAtendente').innerHTML = '<option value="">Todos</option><option value="sem">Sem responsável</option>' + opcoes;
  $('filtroAtendente').value = filtroAnterior;
  $('formCliente').elements.atendente_id.innerHTML = '<option value="">Sem responsável</option>' + opcoes;
  $('equipe').innerHTML = atendentes.length ? atendentes.map(a => `<div class="pessoa"><b>${escapar(a.nome)}</b><small>${escapar(a.email)}</small><small>${carteira.filter(c => c.atendente_id === a.id).length} cliente(s)</small></div>`).join('') : '<p class="suave">Cadastre as pessoas da equipe e vincule seus clientes.</p>';
  renderizar();
}
function abrirCliente(cliente) {
  const form = $('formCliente'); form.reset(); form.querySelector('.erro').textContent = '';
  editando = cliente ? cliente.id : null;
  $('tituloCliente').textContent = cliente ? 'Editar cliente' : 'Novo cliente';
  for (const campo of ['nome', 'email']) { form.elements[campo].disabled = !!cliente; form.elements[campo].value = cliente?.[campo] || ''; }
  $('campoSenha').hidden = !!cliente; form.elements.senha.required = !cliente; form.elements.senha.disabled = !!cliente;
  if (cliente) {
    for (const campo of ['whatsapp','vencimento','etapa','produtos_contratados','atendente_id']) form.elements[campo].value = cliente[campo] ?? '';
    for (const campo of ['implantacao','adicional','suporte','plano']) form.elements[campo].value = cliente[campo + '_centavos'] / 100;
  }
  previa(); $('dialogCliente').showModal();
}
function previa() {
  const f = $('formCliente').elements;
  const total = Math.round(Number(f.implantacao.value) * 100) + Math.max(0, Number(f.produtos_contratados.value) - 25) * Math.round(Number(f.adicional.value) * 100);
  const parte = f.atendente_id.value ? Math.floor(total / 2) : 0;
  const suporte = f.atendente_id.value ? Math.floor(Number(f.suporte.value) * 100 / 2) : 0;
  $('previa').textContent = `Estimativa antes dos custos: serviço inicial ${dinheiro(total)} · Atendente ${dinheiro(parte)} · Suporte ${dinheiro(suporte)}. Os valores efetivos serão calculados na gestão financeira.`;
}
async function enviarForm(form, executar) {
  const botao = form.querySelector('[type=submit]'); botao.disabled = true; form.querySelector('.erro').textContent = '';
  try { await executar(); form.closest('dialog').close(); await carregar(); avisar('Cadastro salvo.', true); }
  catch (erro) { form.querySelector('.erro').textContent = erro.message; avisar(erro.message); }
  finally { botao.disabled = false; }
}
$('formAtendente').addEventListener('submit', e => {
  e.preventDefault(); const form = e.currentTarget;
  enviarForm(form, () => api('/api/operacao/atendentes','POST',Object.fromEntries(new FormData(form))));
});
$('formCliente').addEventListener('submit', e => {
  e.preventDefault(); const form = e.currentTarget;
  const campos = Object.fromEntries(new FormData(form));
  campos.atendente_id = campos.atendente_id ? Number(campos.atendente_id) : null;
  campos.vencimento ||= null; campos.produtos_contratados = Number(campos.produtos_contratados);
  for (const campo of ['implantacao','adicional','suporte','plano']) { campos[campo + '_centavos'] = Math.round(Number(campos[campo]) * 100); delete campos[campo]; }
  enviarForm(form, () => api(editando ? `/api/operacao/clientes/${editando}` : '/api/operacao/clientes', editando ? 'PUT' : 'POST', campos));
});
$('formCliente').addEventListener('input', previa);
document.querySelectorAll('[data-fechar]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('novoAtendente').onclick = () => { $('formAtendente').reset(); $('formAtendente').querySelector('.erro').textContent = ''; $('dialogAtendente').showModal(); };
$('novoCliente').onclick = () => abrirCliente(null);
$('clientes').addEventListener('click', e => { const botao = e.target.closest('[data-editar]'); if (botao) abrirCliente(carteira.find(c => c.id === Number(botao.dataset.editar))); });
for (const id of ['busca','filtroAtendente','filtroVencimento']) $(id).addEventListener('input', renderizar);
$('atualizar').onclick = async () => { $('atualizar').disabled = true; try { await carregar(); } catch (e) { avisar(e.message); } finally { $('atualizar').disabled = false; } };
(async () => {
  try {
    usuario = await api('/api/eu');
    document.body.dataset.ajudaAdmin=String(!!usuario.admin);
    document.dispatchEvent(new CustomEvent('catalogo-perfil'));
    if (!usuario.admin && usuario.papel !== 'atendente') { location.replace('/'); return; }
    document.body.classList.toggle('admin',usuario.admin);
    $('tituloPagina').textContent = usuario.admin ? 'Cadastro e equipe' : 'Minha carteira';
    $('identidade').textContent = usuario.admin ? 'Visão de toda a operação: vencimentos e responsáveis' : 'Sua carteira de clientes';
    if (!usuario.admin) { $('tituloCarteira').textContent = 'Meus clientes'; $('rotuloParte').textContent = 'Sua parte na implantação'; }
    await carregar();
    const parametros=new URLSearchParams(location.search);
    if(usuario.admin&&parametros.has('novoCliente'))abrirCliente(null);
    else if(usuario.admin&&parametros.has('editarLoja')){
      const cliente=carteira.find(c=>c.id===Number(parametros.get('editarLoja')));
      if(cliente)abrirCliente(cliente);else avisar('A loja não foi encontrada. Abra sua ficha novamente.');
    }
  } catch (erro) { avisar(erro.message); }
})();
