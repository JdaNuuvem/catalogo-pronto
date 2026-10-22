// Barra da janela de uma loja. O processo principal manda o estado; os botoes so pedem acoes.
const $ = (id) => document.getElementById(id);
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let atual = null, abas = [];

window.loja.aoEstado((estado) => {
  atual = estado.atual; abas = estado.abas;
  $('nome').textContent = estado.nome;
  document.title = `${estado.nome} · Catálogo Pronto`;
  $('abas').innerHTML = abas.map((a) => `<button type="button" data-aba="${a.id}" aria-current="${a.id === atual}" title="${escapar(a.titulo)}">${escapar(a.rotulo)}</button>`).join('');
  $('btnVoltar').disabled = !abas.find((a) => a.id === atual)?.voltar;
  $('aviso').textContent = estado.aviso || '';
  $('btnConferir').disabled = estado.conferindo || !estado.podeConferir;
  $('btnConferir').textContent = estado.conferindo ? 'Conferindo…' : 'Conferir catálogo';
});
$('abas').addEventListener('click', (e) => { const b = e.target.closest('[data-aba]'); if (b) window.loja.aba(b.dataset.aba); });
$('btnVoltar').addEventListener('click', () => window.loja.voltar());
$('btnRecarregar').addEventListener('click', () => window.loja.recarregar());
$('btnConferir').addEventListener('click', () => window.loja.conferir());
window.loja.pronta();
