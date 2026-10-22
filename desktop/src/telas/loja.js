// Moldura da janela de uma loja. O processo principal manda o estado; os botoes so pedem acoes.
const $ = (id) => document.getElementById(id);
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SUBTITULOS = {
  resumo: 'Situação da loja e atalhos', implantacao: 'O que falta para a loja ficar pronta',
  conferencia: 'Catálogo publicado comparado com o que revisamos',
};
const br = (iso) => (iso || '').split('-').reverse().join('/');
const cincoDias = () => new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

window.loja.aoMoldura((e) => {
  $('nome').textContent = e.nome; document.title = `${e.nome} · Catálogo Pronto`;
  $('secoes').innerHTML = e.secoes.map((s) => `<button type="button" data-secao="${s.id}" aria-current="${s.id === e.atual}">
    ${window.icone(s.id)}<span>${escapar(s.rotulo)}</span>${s.alerta ? '<i class="ponto" title="Pede atenção"></i>' : s.falta ? '<span class="falta">sem login</span>' : ''}</button>`).join('');
  const atual = e.secoes.find((s) => s.id === e.atual);
  $('tituloSecao').textContent = atual ? atual.rotulo : '';
  $('subtitulo').textContent = e.navegador ? e.titulo : SUBTITULOS[e.atual] || '';
  $('controlesNavegador').hidden = !e.navegador; $('btnVoltar').disabled = !e.voltar;
  $('palco').hidden = !e.navegador;
  // No Resumo o cartao Catalogo ja tem o botao.
  $('btnConferir').hidden = !['conferencia', 'cardapio'].includes(e.atual);
  $('btnConferir').disabled = e.conferindo || !e.podeConferir;
  $('btnConferir').textContent = e.conferindo ? 'Conferindo…' : 'Conferir catálogo';
  $('aviso').textContent = e.aviso || ''; $('aviso').title = e.aviso || ''; $('aviso').hidden = !e.aviso;
  const p = e.plano;
  $('plano').hidden = !p;
  if (p) {
    const ate = p.valido_ate || p.teste_ate;
    $('plano').classList.toggle('vencendo', !!ate && ate <= cincoDias());
    $('plano').innerHTML = `<b>${escapar(p.plano || 'Plano Cardapio.ai')}</b>${p.teste_ate && !p.valido_ate ? `Teste grátis até ${br(p.teste_ate)}` : ate ? `Válido até ${br(ate)}` : ''}`;
    $('plano').title = p.situacao || '';
  }
});
$('secoes').addEventListener('click', (ev) => { const b = ev.target.closest('[data-secao]'); if (b) window.loja.secao(b.dataset.secao); });
$('btnVoltar').addEventListener('click', () => window.loja.voltar());
$('btnRecarregar').addEventListener('click', () => window.loja.recarregar());
$('btnConferir').addEventListener('click', () => window.loja.acao('conferir'));
window.loja.pronta();
