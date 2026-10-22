// Implantacao em passos: a trilha mostra onde a loja esta; cada passo traz os dados
// da ficha, o atalho para a tela certa do Cardapio.ai e o que o app faz sozinho.
const $ = (id) => document.getElementById(id);
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reais = (c) => (c === null || c === undefined ? '' : `R$ ${(c / 100).toFixed(2).replace('.', ',')}`);
const paraCentavos = (t) => { const s = String(t ?? '').trim(); if (!s) return null; const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN; };
const pedir = (nome, ...args) => window.secao.implantacao(nome, ...args);

const FASES = [
  { titulo: 'Preparar', passos: ['ficha'] },
  { titulo: 'Loja no Cardapio.ai', passos: ['endereco', 'marca', 'horarios', 'entrega', 'pagamento'] },
  { titulo: 'Cardápio', passos: ['produtos', 'adicionais'] },
  { titulo: 'Entregar', passos: ['conferencia', 'entrega_cliente'] },
];
const PASSOS = {
  ficha: { titulo: 'Ficha da loja', texto: 'Confira o que o cliente mandou. Falta algo? Mande o link da ficha ou preencha junto com ele.' },
  endereco: { titulo: 'Endereço', secao: 'endereco', onde: 'account', ondeRotulo: 'Minha loja', texto: 'Cadastre o endereço da loja em Minha loja.' },
  marca: { titulo: 'Logo, capa e cor', secao: 'marca', onde: 'account?personalization=theme', ondeRotulo: 'Personalização', texto: 'Suba o logo e a capa e escolha a cor da loja.' },
  horarios: { titulo: 'Horários', secao: 'horarios', onde: 'account?hours', ondeRotulo: 'Horários', texto: 'Cadastre os dias e horários de funcionamento.' },
  entrega: { titulo: 'Entrega e retirada', secao: 'entrega', onde: 'account?delivery', ondeRotulo: 'Entrega', texto: 'Configure a área de entrega, as taxas e a retirada no local.' },
  pagamento: { titulo: 'Pagamento', secao: 'pagamento', onde: 'account?payment=presencial', ondeRotulo: 'Pagamento', texto: 'Ative as formas de pagamento e a chave Pix.' },
  produtos: { titulo: 'Produtos', secao: 'produtos', onde: 'listar', ondeRotulo: 'Produtos', texto: 'Escolha as fotos: a IA escreve título, descrição e categoria, o fundo sai e a foto fica padronizada. Revise os preços e publique.' },
  adicionais: { titulo: 'Adicionais', secao: 'adicionais', onde: 'adicionais', ondeRotulo: 'Adicionais', texto: 'Monte os grupos de adicionais com o que o cliente escreveu e a sugestão da IA.' },
  conferencia: { titulo: 'Conferência', texto: 'Compare o catálogo publicado com o que revisamos antes de entregar.' },
  entrega_cliente: { titulo: 'Entregar ao cliente', texto: 'Mostre a loja pronta ao cliente, envie o link e combine o suporte.' },
};
const ORDEM = FASES.flatMap((f) => f.passos);
const DIAS = [['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'], ['qui', 'Quinta'], ['sex', 'Sexta'], ['sab', 'Sábado'], ['dom', 'Domingo']];

let loja = null, passos = {}, vista = null, lote = { lote: null, produtos: [] }, atual = null, carregado = false;
let publicando = false, registro = [], grupos = null;
const fotos = new Map();

function avisar(texto, ruim = false) {
  $('aviso').textContent = texto || ''; $('aviso').hidden = !texto; $('aviso').classList.toggle('ruim', ruim);
  clearTimeout(avisar.t); if (texto) avisar.t = setTimeout(() => { $('aviso').hidden = true; }, 6000);
}
function larguras() { document.querySelectorAll('[data-pct]').forEach((i) => { i.style.width = `${i.dataset.pct}%`; }); }

// ------------------------------------------------------------------ situacao de cada passo
function situacao(id) {
  const s = passos[id]?.estado;
  if (s === 'feito') return ['feito', 'Feito'];
  if (s === 'pulado') return ['pulado', 'Pulado'];
  const completo = vista?.completo || {};
  if (id === 'ficha') { const n = Object.values(completo).filter(Boolean).length, t = Object.keys(completo).length; return [n === t ? 'pronto' : 'falta', `${n} de ${t} seções`]; }
  if (id === 'produtos') { const n = lote.produtos.length; return n ? ['pronto', `${n} no lote`] : [completo.produtos ? 'pronto' : 'falta', completo.produtos ? 'Dados prontos' : 'Sem fotos ainda']; }
  if (id === 'conferencia') return loja?.conferencia ? [loja.conferencia.situacao === 'bloqueante' ? 'falta' : 'pronto', loja.conferencia.situacao === 'bloqueante' ? 'Corrigir' : 'Conferido'] : ['', 'A fazer'];
  const secao = PASSOS[id].secao;
  if (secao) return completo[secao] ? ['pronto', 'Dados prontos'] : ['falta', 'Falta na ficha'];
  return ['', 'A fazer'];
}

function desenharTrilha() {
  const feitos = ORDEM.filter((id) => ['feito', 'pulado'].includes(passos[id]?.estado)).length;
  $('contagem').textContent = `${feitos} de ${ORDEM.length} passos`;
  $('barraGeral').dataset.pct = Math.round((feitos / ORDEM.length) * 100);
  let n = 0;
  $('trilha').innerHTML = FASES.map((f) => `<div class="fase">${f.titulo}</div>${f.passos.map((id) => {
    n++; const [classe, texto] = situacao(id);
    return `<button type="button" data-passo="${id}" class="${classe}" aria-current="${id === atual}">
      <span class="num">${classe === 'feito' ? '✓' : n}</span><span class="rotulo"><b>${PASSOS[id].titulo}</b><small>${texto}</small></span></button>`;
  }).join('')}`).join('');
  larguras();
}

// ------------------------------------------------------------------ dados da ficha
function dados(linhas) {
  return `<dl class="dados">${linhas.map(([rotulo, valor, copiavel = true]) => {
    const vazio = valor === '' || valor === null || valor === undefined;
    return `<dt>${rotulo}</dt><dd class="${vazio ? 'vazio-dado' : ''}">${vazio ? 'não informado' : escapar(valor)}</dd>${!vazio && copiavel ? `<button type="button" class="copiar" data-copiar="${escapar(valor)}">Copiar</button>` : '<span></span>'}`;
  }).join('')}</dl>`;
}
const cep = (c) => (c ? `${c.slice(0, 5)}-${c.slice(5)}` : '');
const telefone = (t) => (t ? `(${t.slice(0, 2)}) ${t.slice(2, -4)}-${t.slice(-4)}` : '');
const simNao = (v) => (v ? 'Sim' : 'Não');

function conteudoDaFicha(id) {
  const f = vista.ficha;
  if (id === 'ficha') {
    const l = f.loja;
    return `<section class="bloco vidro"><h2>Loja</h2>${dados([['Nome', l.nome], ['CPF ou CNPJ', l.documento], ['WhatsApp', telefone(l.telefone)], ['Pedido mínimo', reais(l.pedido_minimo)], ['Recado na loja', l.recado]])}</section>
      <section class="bloco vidro"><h2>Seções da ficha</h2>${dados(Object.entries(vista.completo).map(([s, ok]) => [PASSOS[s]?.titulo || 'Loja', ok ? '✓ completa' : 'falta preencher', false]))}
      <p class="dica">${vista.enviada_em ? `Enviada pelo cliente em ${vista.enviada_em.slice(0, 10).split('-').reverse().join('/')}.` : 'O cliente ainda não enviou a ficha.'}</p>
      <div class="acoes-passo"><button type="button" data-acao-loja="abrir-ficha">Abrir a ficha no painel</button></div></section>
      ${f.observacoes ? `<section class="bloco vidro"><h2>Observações</h2><p class="texto-cliente">${escapar(f.observacoes)}</p></section>` : ''}`;
  }
  if (id === 'endereco') {
    const e = f.endereco;
    return `<section class="bloco vidro"><h2>Dados da ficha</h2>${dados([['CEP', cep(e.cep)], ['Rua', e.rua], ['Número', e.numero], ['Complemento', e.complemento], ['Bairro', e.bairro], ['Cidade', e.cidade], ['UF', e.uf],
      ['Mostrar na loja', { oculto: 'Não mostrar', cidade: 'Só a cidade', completo: 'Endereço completo' }[e.exibicao], false]])}</section>`;
  }
  if (id === 'marca') {
    const m = f.marca;
    return `<section class="bloco vidro"><h2>Dados da ficha</h2>${dados([['Cor', m.cor]])}
      <div class="imagens-marca">${['logo', 'capa'].map((t) => `<figure>${m[`${t}_material`] ? `<img data-imagem="${t}" alt="">` : '<span class="vazio-dado">não enviada</span>'}<figcaption>${t === 'logo' ? 'Logo' : 'Capa'}</figcaption></figure>`).join('')}</div></section>`;
  }
  if (id === 'horarios') {
    const h = f.horarios;
    return `<section class="bloco vidro"><h2>Dados da ficha</h2>${dados([...DIAS.map(([d, nome]) => [nome, h.dias[d]?.length ? h.dias[d].map((p) => `${p.abre} às ${p.fecha}`).join(' e ') : 'Fechado']),
      ['Agendamento', { sem: 'Não aceita', hora_e_agendado: 'Na hora e agendado', somente_agendado: 'Só agendado' }[h.agendamento], false]])}</section>`;
  }
  if (id === 'entrega') {
    const e = f.entrega;
    const linhas = [['Faz entrega', simNao(e.faz_entrega), false], ['Retirada no local', simNao(e.retirada), false], ['Tempo de preparo', e.tempo_preparo_min !== null ? `${e.tempo_preparo_min} min` : '']];
    if (e.faz_entrega && e.modo === 'raio') linhas.push(['Raio da taxa base', e.raio_base_km !== null ? `${e.raio_base_km} km` : ''], ['Taxa base', reais(e.taxa_base)], ['Taxa por km a mais', reais(e.taxa_km)],
      ['Distância máxima', e.distancia_maxima_km !== null ? `${e.distancia_maxima_km} km` : ''], ['Frete grátis até', e.frete_gratis_km !== null ? `${e.frete_gratis_km} km` : '']);
    if (e.faz_entrega && e.modo === 'bairros') linhas.push(...e.bairros.map((b) => [b.nome, reais(b.taxa)]));
    return `<section class="bloco vidro"><h2>Dados da ficha${e.faz_entrega ? ` · ${e.modo === 'bairros' ? 'taxa por bairro' : 'taxa por distância'}` : ''}</h2>${dados(linhas)}</section>`;
  }
  if (id === 'pagamento') {
    const p = f.pagamento;
    return `<section class="bloco vidro"><h2>Dados da ficha</h2>${dados([['Pix', p.pix ? `Sim (${({ cnpj: 'CNPJ', cpf: 'CPF', celular: 'Celular', email: 'E-mail', aleatoria: 'Aleatória' })[p.pix_tipo] || 'tipo não informado'})` : 'Não', false],
      ['Chave Pix', p.pix ? p.pix_chave : null], ['Dinheiro', simNao(p.dinheiro), false], ['Cartão de crédito', simNao(p.credito), false], ['Cartão de débito', simNao(p.debito), false], ['Vale-refeição', simNao(p.vale), false]])}</section>`;
  }
  return '';
}

// ------------------------------------------------------------------ produtos
function produtosHtml() {
  const ps = lote.produtos, aprovados = ps.filter((p) => p.aprovado && p.estado !== 'enviado').length;
  const origem = vista.ficha.produtos;
  return `<section class="bloco vidro"><h2>Fotos dos produtos</h2>
      ${origem.origem ? `<p class="dica">Na ficha: ${origem.origem === 'link' ? `o cliente já vende em <b>${escapar(origem.link_cardapio)}</b>` : origem.origem === 'fotos' ? 'o cliente vai mandar fotos e preços' : 'começar com produtos de exemplo do ramo'}.</p>` : ''}
      <div class="ferramentas">
        <button type="button" class="principal" id="btnFotos" ${publicando ? 'disabled' : ''}>Adicionar fotos</button>
        <label><input type="checkbox" id="tratarAuto" checked> Tirar o fundo e padronizar</label>
        <span class="espaco"></span>
        ${ps.length ? `<button type="button" id="btnDescartar" ${publicando ? 'disabled' : ''}>Descartar lote</button>` : ''}
      </div>
      <div id="envio" class="progresso-envio" hidden><span id="envioTexto"></span><div class="barra"><i id="envioBarra" data-pct="0"></i></div></div>
    </section>
    ${ps.length ? `<section class="bloco vidro"><h2>Revisar e publicar</h2>
      <div class="numeros-lote" id="numerosLote">${numerosLote()}</div>
      <div class="acoes-passo"><button type="button" class="principal" id="btnPublicar" ${publicando || !aprovados ? 'disabled' : ''}>${publicando ? 'Publicando…' : `Publicar ${aprovados} no Cardapio.ai`}</button>
        <span class="dica">${publicando ? 'O servidor está publicando. O código de acesso é lido no e-mail da loja.' : 'Só sobem os produtos marcados como prontos e com preço.'}</span></div>
      <ul class="registro" id="registro">${registro.map(linhaRegistro).join('')}</ul>
      <div id="codigoManual" class="codigo-manual" hidden><span>Não achei o código no e-mail. Digite:</span><input id="codigo" inputmode="numeric" maxlength="8"><button type="button" id="btnCodigo">Enviar código</button></div>
    </section>
    <div class="grade-produtos">${ps.map(cartaoProduto).join('')}</div>` : ''}`;
}
function numerosLote() {
  const ps = lote.produtos, semPreco = ps.filter((p) => !p.preco || Number(String(p.preco).replace(',', '.')) <= 0).length;
  return `<span><b>${ps.length}</b> no lote</span><span><b>${ps.filter((p) => p.aprovado && p.estado !== 'enviado').length}</b> prontos para publicar</span>
    <span><b>${ps.filter((p) => p.estado === 'enviado').length}</b> já publicados</span><span><b>${semPreco}</b> sem preço</span>`;
}
function cartaoProduto(p) {
  const enviado = p.estado === 'enviado';
  const etiqueta = enviado ? '<span class="etiqueta ok">Publicado</span>' : p.erroEnvio ? `<span class="etiqueta ruim" title="${escapar(p.erroEnvio)}">Falhou ao publicar</span>`
    : p.erroIa ? `<span class="etiqueta atencao" title="${escapar(p.erroIa)}">IA não leu</span>` : '';
  const dis = enviado || publicando ? 'disabled' : '';
  return `<article class="produto vidro ${enviado ? 'enviado' : ''}" data-item="${escapar(p.id)}">
    <div class="foto"><img data-foto="${escapar(p.previewUrl)}" alt="">
      <button type="button" data-tratar="${p.tratada ? 'desfazer' : 'tratar'}" ${dis}>${p.tratada ? 'Usar original' : 'Tirar fundo'}</button></div>
    <div class="campos">
      <input data-campo="titulo" value="${escapar(p.titulo)}" placeholder="Título" maxlength="120" ${dis}>
      <textarea data-campo="descricao" placeholder="Descrição" maxlength="400" ${dis}>${escapar(p.descricao)}</textarea>
      <div class="linha"><input data-campo="categoria" value="${escapar(p.categoria)}" placeholder="Categoria" list="categorias" ${dis}>
        <input data-campo="preco" value="${escapar(p.preco && p.preco !== '0' ? String(p.preco).replace('.', ',') : '')}" placeholder="Preço" inputmode="decimal" ${dis}></div>
      <div class="marcas"><label><input type="checkbox" data-campo="aprovado" ${p.aprovado ? 'checked' : ''} ${dis}> Pronto</label>${p.tratada ? '<span class="etiqueta ok">Fundo tratado</span>' : ''}${etiqueta}</div>
    </div></article>`;
}
const linhaRegistro = (ev) => {
  if (ev.tipo === 'ok') return `<li class="ok">✓ ${escapar(ev.titulo)}${ev.jaEstava ? ' (já estava na loja)' : ''}</li>`;
  if (ev.tipo === 'erro') return `<li class="ruim">✗ ${escapar(ev.titulo)}: ${escapar(ev.erro)}</li>`;
  if (ev.tipo === 'fatal') return `<li class="ruim">Parou: ${escapar(ev.erro)}</li>`;
  if (ev.tipo === 'fim') return `<li class="${ev.falhas ? 'ruim' : 'ok'}">Fim: ${ev.ok} publicado(s)${ev.falhas ? `, ${ev.falhas} com erro` : ''}.</li>`;
  if (ev.tipo === 'etapa') return `<li>${escapar(ev.texto)}</li>`;
  if (ev.tipo === 'inicio') return `<li>Enviando ${escapar(ev.titulo)}…</li>`;
  return '';
};
async function carregarFotos() {
  const imgs = [...document.querySelectorAll('img[data-foto]')];
  for (const img of imgs) {
    const url = img.dataset.foto;
    if (!fotos.has(url)) { const r = await pedir('foto', url); if (r.url) fotos.set(url, r.url); }
    if (fotos.has(url) && img.isConnected) img.src = fotos.get(url);
  }
}
function categoriasDatalist() {
  const nomes = [...new Set(lote.produtos.map((p) => p.categoria).filter(Boolean))];
  return `<datalist id="categorias">${nomes.map((c) => `<option value="${escapar(c)}">`).join('')}</datalist>`;
}

// ------------------------------------------------------------------ adicionais
function adicionaisHtml() {
  const a = vista.ficha.adicionais;
  grupos = grupos || structuredClone(a.grupos);
  return `<section class="bloco vidro"><h2>O que o cliente escreveu</h2>
      ${a.nao_tem ? '<p class="dica">O cliente marcou que a loja não tem adicionais.</p>' : a.texto ? `<p class="texto-cliente">${escapar(a.texto)}</p>` : '<p class="dica">O cliente ainda não escreveu nada sobre adicionais na ficha.</p>'}
      <div class="acoes-passo"><button type="button" class="principal" id="btnSugerir">Sugerir grupos com a IA</button>
        <span class="dica">A IA usa o texto acima e os produtos do lote. Preço que o cliente não deu fica em branco.</span></div></section>
    <section class="bloco vidro"><h2>Grupos de adicionais</h2>
      <div class="grupos" id="grupos">${grupos.map(grupoHtml).join('') || '<p class="dica">Nenhum grupo ainda.</p>'}</div>
      <div class="acoes-passo"><button type="button" id="btnNovoGrupo">Novo grupo</button><span class="espaco"></span>
        <button type="button" id="btnSemAdicionais">A loja não tem adicionais</button>
        <button type="button" class="principal" id="btnSalvarGrupos">Salvar grupos</button></div></section>`;
}
function grupoHtml(g, i) {
  return `<article class="grupo vidro" data-grupo="${i}">
    <div class="linha-grupo"><label>Nome do grupo<input data-g="nome" value="${escapar(g.nome)}" maxlength="60" placeholder="Ex.: Turbine seu lanche"></label>
      <label>Mínimo<input data-g="minimo" value="${g.minimo ?? 0}" inputmode="numeric"></label>
      <label>Máximo<input data-g="maximo" value="${g.maximo ?? 1}" inputmode="numeric"></label>
      <button type="button" class="remover" data-remover-grupo="${i}">Remover grupo</button></div>
    <label class="categorias">Aparece nas categorias (separe por vírgula)<input data-g="categorias" value="${escapar((g.categorias || []).join(', '))}"></label>
    <div class="itens">${(g.itens || []).map((it, j) => `<div class="item"><input data-item-nome="${j}" value="${escapar(it.nome)}" placeholder="Item" maxlength="60">
      <input data-item-preco="${j}" value="${it.preco === null || it.preco === undefined ? '' : (it.preco / 100).toFixed(2).replace('.', ',')}" placeholder="Preço R$" inputmode="decimal">
      <button type="button" class="remover" data-remover-item="${j}">×</button></div>`).join('')}</div>
    <div><button type="button" class="remover" data-novo-item="${i}">+ Item</button></div></article>`;
}
/** Le os grupos da tela; preco vazio fica null e e apontado ao salvar. */
function lerGrupos() {
  return [...document.querySelectorAll('[data-grupo]')].map((el) => ({
    nome: el.querySelector('[data-g=nome]').value.trim(),
    minimo: Number.parseInt(el.querySelector('[data-g=minimo]').value, 10) || 0,
    maximo: Number.parseInt(el.querySelector('[data-g=maximo]').value, 10) || 1,
    categorias: el.querySelector('[data-g=categorias]').value.split(',').map((c) => c.trim()).filter(Boolean),
    itens: [...el.querySelectorAll('.item')].map((it) => ({ nome: it.querySelector('[data-item-nome]').value.trim(), preco: paraCentavos(it.querySelector('[data-item-preco]').value) })),
  }));
}

// ------------------------------------------------------------------ passo aberto
function desenharPasso() {
  const p = PASSOS[atual], [classe, texto] = situacao(atual), feito = passos[atual]?.estado === 'feito';
  const fase = FASES.find((f) => f.passos.includes(atual)).titulo;
  let corpo = '';
  if (PASSOS[atual].secao && !['produtos', 'adicionais'].includes(atual)) corpo = conteudoDaFicha(atual);
  if (atual === 'ficha') corpo = conteudoDaFicha('ficha');
  if (atual === 'produtos') corpo = produtosHtml() + categoriasDatalist();
  if (atual === 'adicionais') corpo = adicionaisHtml();
  if (atual === 'conferencia') corpo = `<section class="bloco vidro"><h2>Catálogo</h2><p class="dica">${loja.conferencia ? `Última conferência: ${{ ok: 'pronto para entregar', atencao: 'pode entregar, vale melhorar', bloqueante: 'corrigir antes de entregar' }[loja.conferencia.situacao]}.` : 'Ainda não conferido.'}</p>
    <div class="acoes-passo"><button type="button" class="principal" data-acao-loja="conferir">Conferir catálogo agora</button>${loja.conferencia ? '<button type="button" data-acao-loja="abrir-conferencia">Ver relatório</button>' : ''}</div></section>`;
  if (atual === 'entrega_cliente') corpo = `<section class="bloco vidro"><h2>Combinar com o cliente</h2>${dados([['Link da loja', loja.link || ''], ['WhatsApp do cliente', telefone(vista.ficha.loja.telefone)]])}
    <p class="dica">Mostre os pedidos de teste, como abrir e fechar a loja e como mudar preço. Depois marque a entrega no roteiro do painel.</p>
    <div class="acoes-passo"><button type="button" data-acao-loja="abrir-roteiro">Abrir roteiro no painel</button>${loja.link ? '<button type="button" data-acao-loja="abrir-cardapio-publico">Ver a loja como o cliente</button>' : ''}</div></section>`;

  $('passo').innerHTML = `<header class="cabeca-passo"><div><small>${fase} · passo ${ORDEM.indexOf(atual) + 1} de ${ORDEM.length}</small><h1>${p.titulo}</h1><p>${p.texto}</p></div>
      <span class="estado ${classe}">${texto}</span></header>
    ${corpo}
    <section class="bloco vidro"><div class="acoes-passo">
      ${p.onde ? `<button type="button" data-abrir="${p.onde}">Abrir ${p.ondeRotulo} no Cardapio.ai</button>` : ''}
      <span class="espaco"></span>
      ${feito ? '<button type="button" data-marcar="pendente">Desmarcar</button>' : `<button type="button" data-marcar="pulado">Pular</button><button type="button" class="principal" data-marcar="feito">Marcar como feito</button>`}
      ${ORDEM.indexOf(atual) < ORDEM.length - 1 ? '<button type="button" data-proximo>Próximo passo →</button>' : ''}
    </div></section>`;
  document.querySelectorAll('img[data-imagem]').forEach(async (img) => { const r = await pedir('imagemFicha', img.dataset.imagem); if (r.url) img.src = r.url; });
  const corCampo = document.querySelector('[data-copiar^="#"]');
  if (corCampo) { const s = document.createElement('span'); s.className = 'cor'; s.style.background = corCampo.dataset.copiar; corCampo.previousElementSibling.prepend(s); }
  larguras();
  if (atual === 'produtos') carregarFotos();
}
function abrir(id) { atual = id; desenharTrilha(); desenharPasso(); $('passo').scrollTop = 0; }

async function recarregar() {
  const r = await pedir('carregar');
  if (r.erro) { avisar(r.erro, true); return; }
  passos = r.passos; vista = r.ficha; lote = r.lote; publicando = r.publicando; carregado = true;
  if (!atual) atual = ORDEM.find((id) => !['feito', 'pulado'].includes(passos[id]?.estado)) || ORDEM[0];
  desenharTrilha(); desenharPasso();
}

// ------------------------------------------------------------------ eventos
window.secao.aoDados((d) => {
  const primeira = !loja; loja = d.loja;
  if (primeira) recarregar(); else if (carregado) { desenharTrilha(); if (!['produtos', 'adicionais'].includes(atual)) desenharPasso(); }
});
window.secao.aoProgresso((p) => {
  if (!$('envio')) return;
  $('envio').hidden = !p; if (!p) return;
  $('envioTexto').textContent = `${p.etapa}… ${p.feitas} de ${p.total}`;
  $('envioBarra').dataset.pct = Math.round((p.feitas / p.total) * 100); larguras();
});
window.secao.aoEvento(async (ev) => {
  if (ev.tipo === 'encerrado') { publicando = false; const r = await pedir('carregar'); if (!r.erro) { lote = r.lote; passos = r.passos; } desenharTrilha(); if (atual === 'produtos') desenharPasso(); return; }
  if (ev.tipo === 'codigo-manual') { const c = $('codigoManual'); if (c) c.hidden = false; return; }
  if (ev.tipo === 'ocioso' || ev.tipo === 'mfa') return;
  registro.push(ev);
  const lista = $('registro'); if (lista) { lista.insertAdjacentHTML('beforeend', linhaRegistro(ev)); lista.scrollTop = lista.scrollHeight; }
  if (ev.tipo === 'fim' && !ev.falhas) {
    passos = (await pedir('passo', 'produtos', 'feito')).passos || passos;
    avisar(`${ev.ok} produto(s) publicados no Cardapio.ai.`);
  }
});

document.addEventListener('click', async (e) => {
  const alvo = e.target.closest('button');
  if (!alvo) return;
  if (alvo.dataset.passo) return abrir(alvo.dataset.passo);
  if (alvo.dataset.copiar !== undefined) { await navigator.clipboard.writeText(alvo.dataset.copiar).catch(() => {}); alvo.textContent = 'Copiado'; setTimeout(() => { alvo.textContent = 'Copiar'; }, 1500); return; }
  if (alvo.dataset.abrir) return pedir('abrir', alvo.dataset.abrir);
  if (alvo.dataset.acaoLoja) return window.secao.acao(alvo.dataset.acaoLoja);
  if (alvo.dataset.marcar) {
    const r = await pedir('passo', atual, alvo.dataset.marcar);
    if (r.erro) return avisar(r.erro, true);
    passos = r.passos;
    if (alvo.dataset.marcar !== 'pendente') atual = ORDEM.find((id, i) => i > ORDEM.indexOf(atual) && !['feito', 'pulado'].includes(passos[id]?.estado)) || atual;
    return abrir(atual);
  }
  if (alvo.dataset.proximo !== undefined) return abrir(ORDEM[ORDEM.indexOf(atual) + 1]);

  // produtos
  if (alvo.id === 'btnFotos') {
    alvo.disabled = true;
    const r = await pedir('escolherFotos', { tratar: $('tratarAuto').checked });
    alvo.disabled = false;
    if (r.erro) return avisar(r.erro, true);
    if (r.cancelado) return;
    lote = r.lote; desenharTrilha(); desenharPasso();
    if (r.avisos?.length) avisar(r.avisos.join(' · '));
    return;
  }
  if (alvo.dataset.tratar) {
    const item = alvo.closest('[data-item]').dataset.item;
    alvo.disabled = true; alvo.textContent = alvo.dataset.tratar === 'tratar' ? 'Tratando…' : 'Voltando…';
    const r = await pedir(alvo.dataset.tratar, item);
    if (r.erro) avisar(r.erro, true); else if (r.aviso) avisar(r.aviso);
    const n = await pedir('carregar'); if (!n.erro) lote = n.lote;
    return desenharPasso();
  }
  if (alvo.id === 'btnDescartar') {
    if (!confirm('Descartar o lote? As fotos e textos que ainda não foram publicados saem da lista.')) return;
    const r = await pedir('descartar'); if (r.erro) return avisar(r.erro, true);
    lote = { lote: null, produtos: [] }; registro = []; desenharTrilha(); return desenharPasso();
  }
  if (alvo.id === 'btnPublicar') {
    alvo.disabled = true;
    const r = await pedir('publicar');
    if (r.erro) { alvo.disabled = false; return avisar(r.erro, true); }
    publicando = true; registro = [{ tipo: 'etapa', texto: `publicação iniciada: ${r.total} produto(s)` }]; return desenharPasso();
  }
  if (alvo.id === 'btnCodigo') {
    const r = await pedir('codigo', $('codigo').value);
    if (r.erro) return avisar(r.erro, true);
    $('codigoManual').hidden = true; return;
  }

  // adicionais
  if (alvo.id === 'btnSugerir') {
    alvo.disabled = true; alvo.textContent = 'Pensando…';
    const r = await pedir('sugerirAdicionais', lote.produtos.map((p) => ({ titulo: p.titulo, categoria: p.categoria })));
    alvo.disabled = false; alvo.textContent = 'Sugerir grupos com a IA';
    if (r.erro) return avisar(r.erro, true);
    if (!r.grupos.length) return avisar('A IA não viu adicionais que façam sentido para estes produtos.');
    grupos = [...lerGrupos(), ...r.grupos]; avisar(`${r.grupos.length} grupo(s) sugeridos. Confira nomes e preços antes de salvar.`);
    return desenharPasso();
  }
  if (alvo.id === 'btnNovoGrupo') { grupos = [...lerGrupos(), { nome: '', minimo: 0, maximo: 1, categorias: [], itens: [{ nome: '', preco: null }] }]; return desenharPasso(); }
  if (alvo.dataset.removerGrupo !== undefined) { grupos = lerGrupos().filter((_, i) => i !== Number(alvo.dataset.removerGrupo)); return desenharPasso(); }
  if (alvo.dataset.novoItem !== undefined) { grupos = lerGrupos(); grupos[Number(alvo.dataset.novoItem)].itens.push({ nome: '', preco: null }); return desenharPasso(); }
  if (alvo.dataset.removerItem !== undefined) {
    const gi = Number(alvo.closest('[data-grupo]').dataset.grupo); grupos = lerGrupos();
    grupos[gi].itens.splice(Number(alvo.dataset.removerItem), 1); return desenharPasso();
  }
  if (alvo.id === 'btnSalvarGrupos' || alvo.id === 'btnSemAdicionais') {
    const semAdicionais = alvo.id === 'btnSemAdicionais';
    const lidos = semAdicionais ? [] : lerGrupos();
    if (lidos.some((g) => g.itens.some((it) => Number.isNaN(it.preco)))) return avisar('Confira os preços: use números como 4,50.', true);
    const r = await pedir('salvarAdicionais', { grupos: lidos, nao_tem: semAdicionais });
    if (r.erro) return avisar(r.erro, true);
    vista = r; grupos = structuredClone(r.ficha.adicionais.grupos);
    const semPreco = grupos.some((g) => g.itens.some((it) => it.preco === null));
    avisar(semAdicionais ? 'Anotado: a loja não tem adicionais.' : semPreco ? 'Grupos salvos. Ainda há itens sem preço.' : 'Grupos salvos na ficha.');
    if (r.completo.adicionais) passos = (await pedir('passo', 'adicionais', 'feito')).passos || passos;
    desenharTrilha(); return desenharPasso();
  }
});

// Revisao dos produtos: cada campo salva ao sair dele.
document.addEventListener('change', async (e) => {
  const el = e.target, card = el.closest('[data-item]');
  if (!card || !el.dataset.campo) return;
  const campo = el.dataset.campo;
  let valor = el.type === 'checkbox' ? el.checked : el.value.trim();
  if (campo === 'preco') {
    const c = paraCentavos(valor);
    if (Number.isNaN(c)) return avisar('Preço inválido: use números como 12,90.', true);
    valor = c === null ? '0' : (c / 100).toFixed(2);
  }
  const r = await pedir('salvarItem', { id: card.dataset.item, [campo]: valor });
  if (r.erro) return avisar(r.erro, true);
  const p = lote.produtos.find((x) => x.id === card.dataset.item);
  if (p) p[campo] = valor;
  if ($('numerosLote')) $('numerosLote').innerHTML = numerosLote();
  if (['aprovado', 'preco'].includes(campo)) {
    const aprovados = lote.produtos.filter((x) => x.aprovado && x.estado !== 'enviado').length, btn = $('btnPublicar');
    if (btn && !publicando) { btn.disabled = !aprovados; btn.textContent = `Publicar ${aprovados} no Cardapio.ai`; }
  }
});
