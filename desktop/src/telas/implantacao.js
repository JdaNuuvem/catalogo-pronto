// Implantacao: roteiro e ficha da loja, e os passos de montagem no Cardapio.ai.
// O preenchimento automatico de cada passo e ligado conforme a gravacao da loja de teste;
// ate la o passo mostra se a ficha ja tem os dados e leva ao Cardapio.ai para fazer a mao.
const $ = (id) => document.getElementById(id);
const PASSOS = [
  { secao: 'endereco', titulo: 'Endereço', onde: 'Minha loja › Endereço' },
  { secao: 'marca', titulo: 'Logo, capa e cor', onde: 'Primeiros passos › Personalize com sua marca' },
  { secao: 'horarios', titulo: 'Horários de funcionamento', onde: 'Horários' },
  { secao: 'entrega', titulo: 'Entrega e retirada', onde: 'Entrega' },
  { secao: 'pagamento', titulo: 'Formas de pagamento e Pix', onde: 'Pagamento › Presencial' },
  { secao: 'produtos', titulo: 'Produtos', onde: 'Produtos › Importar cardápio, ou publicação pelas fotos' },
];

window.secao.aoDados(({ loja }) => {
  const secoes = loja.ficha.secoes || {};
  const prontos = PASSOS.filter((p) => secoes[p.secao]).length;
  $('topo').innerHTML = `
    <section class="cartao vidro"><h2>Roteiro</h2><span class="valor">${loja.roteiro.feitas} de ${loja.roteiro.total}</span><div class="barra"><i data-pct="${Math.round(loja.roteiro.feitas / loja.roteiro.total * 100)}"></i></div>
      <div class="acoes"><button type="button" data-acao="abrir-roteiro">Abrir roteiro no painel</button></div></section>
    <section class="cartao vidro"><h2>Ficha de implantação</h2><span class="valor">${loja.ficha.completas} de ${loja.ficha.total}</span><div class="barra"><i data-pct="${Math.round(loja.ficha.completas / loja.ficha.total * 100)}"></i></div>
      <p class="detalhe">${loja.ficha.enviada_em ? 'Enviada pelo cliente.' : 'seções completas'} · ${prontos} de ${PASSOS.length} passos com dados prontos</p>
      <div class="acoes"><button type="button" data-acao="abrir-ficha">Abrir ficha</button></div></section>`;
  $('passos').innerHTML = PASSOS.map((p, i) => `<article class="passo vidro ${secoes[p.secao] ? 'pronto' : ''}">
      <span class="num">${secoes[p.secao] ? '✓' : i + 1}</span>
      <div><b>${p.titulo}</b><small>${secoes[p.secao] ? 'Dados prontos na ficha' : 'Falta preencher na ficha'} · no Cardapio.ai: ${p.onde}</small></div>
      <button type="button" data-acao="abrir-cardapio">Abrir no Cardapio.ai</button></article>`).join('');
  document.querySelectorAll('[data-pct]').forEach((el) => { el.style.width = `${el.dataset.pct}%`; });
});
document.addEventListener('click', (e) => { const b = e.target.closest('[data-acao]'); if (b) window.secao.acao(b.dataset.acao); });
