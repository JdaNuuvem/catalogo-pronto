// Mostra o resultado da conferencia, agrupado por tipo de problema.
const $ = (id) => document.getElementById(id);
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SITUACAO = { ok: 'Pronta para entregar', atencao: 'Pode entregar, mas vale melhorar', bloqueante: 'Corrija antes de entregar' };
const GRUPOS = {
  'catalogo-vazio': 'Catálogo vazio', faltando: 'Publicados pelo painel, mas não estão na loja', 'preco-diferente': 'Preço diferente do revisado',
  'sem-preco': 'Sem preço', duplicado: 'Produto repetido', 'sem-foto': 'Sem foto', 'sem-descricao': 'Sem descrição', desativado: 'Desativados',
  'categoria-vazia': 'Categorias vazias', 'categoria-desativada': 'Categorias desativadas', 'abaixo-do-contratado': 'Quantidade contratada',
};

window.secao.aoDados(({ loja, conferencia }) => {
  // Sem conferencia feita nesta abertura: mostra a explicacao (e a ultima situacao conhecida, se houver).
  if (!conferencia) {
    $('vazio').classList.remove('escondido'); $('resultado').classList.add('escondido');
    $('ultima').textContent = loja.conferencia ? `Última conferência: ${SITUACAO[loja.conferencia.situacao] || loja.conferencia.situacao}, em ${(loja.conferencia.criada_em || '').slice(0, 10).split('-').reverse().join('/')}.` : '';
    return;
  }
  const r = { ...conferencia, loja: loja.nome };
  $('vazio').classList.add('escondido'); $('resultado').classList.remove('escondido');
  $('loja').textContent = r.loja;
  $('quando').textContent = `Lido agora há pouco · ${new Date(r.quando).toLocaleString('pt-BR')}`;
  $('selo').className = `selo-situacao ${r.situacao}`; $('selo').textContent = SITUACAO[r.situacao];
  $('avisoSalvar').textContent = r.aviso || ''; $('avisoSalvar').classList.toggle('escondido', !r.aviso);
  const t = r.totais;
  $('totais').innerHTML = [['Produtos na loja', t.produtos, t.contratados && t.produtos < t.contratados], ['Categorias', t.categorias], ['Sem preço', t.sem_preco, t.sem_preco],
    ['Sem foto', t.sem_foto, t.sem_foto], ['Sem descrição', t.sem_descricao], ['Faltando', t.faltando, t.faltando]]
    .map(([nome, valor, ruim]) => `<div class="total ${ruim ? 'ruim' : ''}"><span>${nome}</span><strong>${valor ?? 0}</strong></div>`).join('');
  const porTipo = new Map();
  for (const p of r.problemas) { if (!porTipo.has(p.tipo)) porTipo.set(p.tipo, []); porTipo.get(p.tipo).push(p); }
  const ordem = [...porTipo.entries()].sort(([, a], [, b]) => (a[0].nivel === 'bloqueante' ? 0 : 1) - (b[0].nivel === 'bloqueante' ? 0 : 1));
  $('grupos').innerHTML = ordem.length ? ordem.map(([tipo, lista]) => `<section class="grupo vidro ${lista[0].nivel}">
      <h2><span class="nivel">${lista[0].nivel === 'bloqueante' ? 'Corrigir' : 'Atenção'}</span>${GRUPOS[tipo] || tipo} (${lista.length})</h2>
      ${lista[0].produto ? `<ul>${lista.map((p) => `<li>${escapar(p.produto)}${p.tipo === 'preco-diferente' || p.tipo === 'desativado' ? ` — ${escapar(p.detalhe)}` : ''}</li>`).join('')}</ul>` : `<p>${escapar(lista[0].detalhe)}</p>`}
    </section>`).join('')
    : '<p class="tudo-certo vidro">Tudo certo: nenhum problema encontrado no catálogo.</p>';
  window.scrollTo(0, 0);
});
