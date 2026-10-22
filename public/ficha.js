'use strict';
/* ---------------------------------------------------------------------
   Ficha da loja. Funciona de dois jeitos:
   - cliente, pelo link (/ficha.html#t=TOKEN): o token vai no cabecalho;
   - equipe, logada (/ficha.html?loja=ID): usa as rotas da gestao.
   --------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.hash.slice(1)).get('t');
const lojaId = Number(new URLSearchParams(location.search).get('loja')) || null;
const equipe = !token && !!lojaId;
const base = equipe ? `/api/gestao/clientes/${lojaId}/ficha` : '/api/ficha-publica';
const DIAS = [['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'], ['qui', 'Quinta'], ['sex', 'Sexta'], ['sab', 'Sábado'], ['dom', 'Domingo']];
const SECOES = { loja: 'Loja', endereco: 'Endereço', marca: 'Marca', horarios: 'Horários', entrega: 'Entrega', pagamento: 'Pagamento', produtos: 'Produtos', adicionais: 'Adicionais' };
const form = $('formFicha');

async function pedir(caminho = '', { metodo = 'GET', corpo, arquivo } = {}) {
  const cabecalhos = token ? { 'x-ficha-token': token } : {};
  let body;
  if (arquivo) { body = new FormData(); body.append('imagem', arquivo); }
  else if (corpo) { body = JSON.stringify(corpo); cabecalhos['content-type'] = 'application/json'; }
  const r = await fetch(base + caminho, { method: metodo, headers: cabecalhos, body });
  if (r.status === 401 && equipe) { location.replace('/'); throw new Error('Entre novamente.'); }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(dados.erro || 'Não foi possível salvar agora.'), { erros: dados.erros });
  return dados;
}
function avisar(texto, ruim = false) { $('aviso').textContent = texto; $('aviso').hidden = !texto; $('aviso').classList.toggle('ruim', ruim); if (texto) $('aviso').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
const centavosParaTexto = (c) => (c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','));
const campo = (nome) => form.elements[nome];

// ------------------------------------------------------------ horarios e bairros
function desenharDias() {
  $('dias').innerHTML = DIAS.map(([id, nome]) => `<div class="ficha-dia" data-dia="${id}">
    <label class="checagem dia"><input type="checkbox" data-aberto> ${nome}</label>
    <input type="time" data-abre="0" aria-label="${nome}: abre"><input type="time" data-fecha="0" aria-label="${nome}: fecha">
    <input type="time" data-abre="1" aria-label="${nome}: abre de novo (opcional)"><input type="time" data-fecha="1" aria-label="${nome}: fecha de novo (opcional)"></div>`).join('');
}
function lerDias() {
  const dias = {};
  for (const linha of document.querySelectorAll('.ficha-dia')) {
    const id = linha.dataset.dia, periodos = [];
    if (linha.querySelector('[data-aberto]').checked) for (const i of [0, 1]) {
      const abre = linha.querySelector(`[data-abre="${i}"]`).value, fecha = linha.querySelector(`[data-fecha="${i}"]`).value;
      if (abre || fecha) periodos.push({ abre, fecha });
    }
    dias[id] = periodos;
  }
  return dias;
}
function preencherDias(dias = {}) {
  for (const linha of document.querySelectorAll('.ficha-dia')) {
    const periodos = dias[linha.dataset.dia] || [];
    linha.querySelector('[data-aberto]').checked = periodos.length > 0;
    for (const i of [0, 1]) {
      linha.querySelector(`[data-abre="${i}"]`).value = periodos[i]?.abre || '';
      linha.querySelector(`[data-fecha="${i}"]`).value = periodos[i]?.fecha || '';
    }
  }
}
function novoBairro(b = {}) {
  const div = document.createElement('div'); div.className = 'ficha-bairro';
  div.innerHTML = `<input data-bairro-nome placeholder="Bairro" maxlength="80"><input data-bairro-taxa inputmode="decimal" placeholder="Taxa R$"><button type="button" aria-label="Remover bairro">×</button>`;
  div.querySelector('[data-bairro-nome]').value = b.nome || '';
  div.querySelector('[data-bairro-taxa]').value = centavosParaTexto(b.taxa ?? null);
  div.querySelector('button').onclick = () => div.remove();
  $('bairros').append(div);
}

// ------------------------------------------------------------ ler e preencher o formulario
function lerFormulario() {
  const dados = { loja: {}, endereco: {}, marca: {}, horarios: {}, entrega: {}, pagamento: {}, produtos: {}, adicionais: {} };
  for (const el of form.elements) {
    if (!el.name || !el.name.includes('.')) continue;
    const [secao, chave] = el.name.split('.');
    if (el.type === 'checkbox') dados[secao][chave] = el.checked;
    else if (el.type === 'radio') { if (el.checked) dados[secao][chave] = el.value; }
    else dados[secao][chave] = el.value;
  }
  if (!campo('marca.cor').dataset.escolhida) delete dados.marca.cor;
  dados.horarios.dias = lerDias();
  dados.entrega.bairros = [...document.querySelectorAll('.ficha-bairro')]
    .map((b) => ({ nome: b.querySelector('[data-bairro-nome]').value, taxa: b.querySelector('[data-bairro-taxa]').value }))
    .filter((b) => b.nome || b.taxa);
  dados.observacoes = form.elements.observacoes.value;
  return dados;
}
const MONETARIOS = ['loja.pedido_minimo', 'entrega.taxa_base', 'entrega.taxa_km'];
function preencher({ ficha, completo }) {
  for (const el of form.elements) {
    if (!el.name || !el.name.includes('.')) continue;
    const [secao, chave] = el.name.split('.'), valor = ficha[secao]?.[chave];
    if (el.type === 'checkbox') el.checked = !!valor;
    else if (el.type === 'radio') el.checked = el.value === valor;
    else if (el.type === 'color') { if (valor) { el.value = valor; el.dataset.escolhida = '1'; } }
    else el.value = MONETARIOS.includes(el.name) ? centavosParaTexto(valor) : (valor ?? '');
  }
  form.elements.observacoes.value = ficha.observacoes || '';
  preencherDias(ficha.horarios?.dias);
  $('bairros').innerHTML = ''; (ficha.entrega?.bairros || []).forEach(novoBairro);
  // Grupos montados pela equipe no app: so leitura aqui.
  const grupos = ficha.adicionais?.grupos || [];
  $('gruposAdicionais').hidden = !grupos.length;
  $('gruposAdicionais').replaceChildren(...grupos.map((g) => {
    const div = document.createElement('div'); div.className = 'ficha-grupo';
    const b = document.createElement('b'); b.textContent = g.nome;
    const p = document.createElement('p');
    p.textContent = g.itens.map((i) => `${i.nome}${i.preco === null ? '' : ` (R$ ${centavosParaTexto(i.preco)})`}`).join(' · ');
    div.append(b, p); return div;
  }));
  atualizarResumo({ ficha, completo });
  atualizarVisibilidade();
}
/** Progresso e imagens, sem tocar no que esta sendo digitado (usado depois de enviar uma imagem). */
function atualizarResumo({ ficha, completo }) {
  for (const tipo of ['logo', 'capa']) {
    const img = $(tipo === 'logo' ? 'previewLogo' : 'previewCapa');
    if (ficha.marca?.[`${tipo}_material`]) { carregarImagem(tipo, img); } else img.hidden = true;
  }
  $('progresso').innerHTML = Object.entries(SECOES).map(([id, nome]) => `<li class="${completo[id] ? 'ok' : ''}">${completo[id] ? '✓ ' : ''}${nome}</li>`).join('');
}
// Imagens passam pelo token no cabecalho, entao chegam por fetch e viram blob.
async function carregarImagem(tipo, img) {
  const r = await fetch(`${base}/imagem/${tipo}`, { headers: token ? { 'x-ficha-token': token } : {} });
  if (!r.ok) return;
  img.src = URL.createObjectURL(await r.blob()); img.hidden = false;
}
function atualizarVisibilidade() {
  const entrega = campo('entrega.faz_entrega').checked, bairros = campo('entrega.modo').value === 'bairros';
  $('blocoEntrega').hidden = !entrega; $('porRaio').hidden = bairros; $('porBairro').hidden = !bairros;
  $('blocoPix').hidden = !campo('pagamento.pix').checked;
  $('blocoLink').hidden = !form.querySelector('[name="produtos.origem"][value=link]').checked;
  $('blocoAdicionais').hidden = campo('adicionais.nao_tem').checked;
}
function marcarErros(erros = []) {
  form.querySelectorAll('.campo-erro').forEach((el) => el.classList.remove('campo-erro'));
  form.querySelectorAll('.mensagem-erro').forEach((el) => el.remove());
  for (const { campo: nome, mensagem } of erros) {
    const [secao, chave, dia] = nome.split('.');
    const alvo = chave === 'dias' ? document.querySelector(`.ficha-dia[data-dia="${dia}"]`)
      : chave === 'bairros' ? $('bairros') : form.elements[`${secao}.${chave}`] || form.elements[nome];
    const el = alvo instanceof RadioNodeList ? alvo[0] : alvo;
    if (!el) continue;
    el.classList.add('campo-erro');
    const msg = document.createElement('span'); msg.className = 'mensagem-erro'; msg.textContent = mensagem;
    (el.closest('label') || el).append(msg);
  }
}

// ------------------------------------------------------------ acoes
async function salvar() {
  marcarErros();
  try { const r = await pedir('', { metodo: 'PUT', corpo: lerFormulario() }); preencher(r); return r; }
  catch (e) { marcarErros(e.erros); avisar(e.message, true); throw e; }
}
form.addEventListener('submit', async (e) => {
  e.preventDefault(); $('salvar').disabled = true;
  try { await salvar(); avisar(equipe ? 'Ficha salva.' : 'Salvo! Quando terminar, toque em Enviar para a equipe.'); } catch { /* erros ja mostrados */ }
  finally { $('salvar').disabled = false; }
});
$('enviar').addEventListener('click', async () => {
  $('enviar').disabled = true;
  try { await salvar(); await pedir('/enviar', { metodo: 'POST', corpo: {} }); avisar('Ficha enviada! Seu atendente vai conferir e montar sua loja.'); } catch { /* ja avisado */ }
  finally { $('enviar').disabled = false; }
});
for (const [id, tipo] of [['arquivoLogo', 'logo'], ['arquivoCapa', 'capa']]) {
  $(id).addEventListener('change', async () => {
    const arquivo = $(id).files[0]; if (!arquivo) return;
    try { atualizarResumo(await pedir(`/imagem?tipo=${tipo}`, { metodo: 'POST', arquivo })); avisar(tipo === 'logo' ? 'Logo enviado.' : 'Capa enviada.'); }
    catch (e) { avisar(e.message, true); } finally { $(id).value = ''; }
  });
}
campo('marca.cor').addEventListener('input', (e) => { e.target.dataset.escolhida = '1'; });
form.addEventListener('change', atualizarVisibilidade);
$('maisBairro').addEventListener('click', () => novoBairro());
// O CEP completa rua, bairro, cidade e UF (ViaCEP), sem apagar o que ja foi digitado.
campo('endereco.cep').addEventListener('blur', async (e) => {
  const cep = e.target.value.replace(/\D/g, ''); if (cep.length !== 8) return;
  try {
    const d = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json(); if (d.erro) return;
    for (const [nome, valor] of [['endereco.rua', d.logradouro], ['endereco.bairro', d.bairro], ['endereco.cidade', d.localidade], ['endereco.uf', d.uf]])
      if (valor && !campo(nome).value) campo(nome).value = valor;
  } catch { /* sem internet ou ViaCEP fora: segue manual */ }
});
$('gerarLink').addEventListener('click', async () => {
  try {
    const { url } = await (await fetch(`${base}/link`, { method: 'POST' })).json();
    await navigator.clipboard.writeText(url).catch(() => {});
    avisar(`Link copiado. Mande para o cliente pelo WhatsApp: ${url}`);
  } catch { avisar('Não consegui gerar o link agora.', true); }
});

(async () => {
  desenharDias();
  if (!token && !lojaId) { avisar('Este link está incompleto. Peça um novo ao seu atendente.', true); form.hidden = true; return; }
  try {
    const r = await pedir();
    if (equipe) {
      $('avisoEquipe').hidden = false; $('voltarLoja').href = `/gestao.html#cliente-${lojaId}`;
      $('explicacao').textContent = 'Você está editando a ficha pela equipe. O cliente também pode preencher pelo link.';
    } else {
      $('nomeLoja').textContent = r.loja ? `· ${r.loja}` : ''; $('enviar').hidden = false;
      if (r.enviada_em) avisar('Você já enviou esta ficha. Se mudar algo, salve e envie de novo.');
    }
    preencher(r);
  } catch (e) { avisar(e.message, true); form.hidden = true; }
})();
