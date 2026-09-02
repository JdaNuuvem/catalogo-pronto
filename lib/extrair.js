/**
 * Leitura do catalogo direto da pagina /listar do painel.
 *
 * Separado de cardapio.js porque so depende da estrutura do HTML da listagem —
 * se o painel mudar o layout, o conserto e aqui e em mais lugar nenhum.
 */

const SELETORES = {
  categoria: '.category-section-area',
  categoriaTitulo: '.category-section-title .title-text',
  produto: '.see-products-product',
  titulo: '.product-details .title',
  descricao: '.product-details .sub-title',
  medida: '.measure-area',
  preco: 'input.value-obj',
  promocao: 'input.promotion-obj',
  imagem: 'img.image-obj',
  status: '.chip-prod-status',
  etiquetas: '.product-tags',
};

/**
 * Le todos os produtos da pagina de listagem ja aberta.
 * Roda dentro do navegador, entao nao pode usar nada do Node aqui.
 */
async function extrairCatalogo(page, baseUrl) {
  return page.evaluate((s) => {
    const texto = (raiz, seletor) => {
      const el = raiz.querySelector(seletor);
      return el ? el.textContent.trim() : '';
    };

    const categorias = [...document.querySelectorAll(s.categoria)];

    return categorias.map((secao) => {
      const nome = texto(secao, s.categoriaTitulo);
      const produtos = [...secao.querySelectorAll(s.produto)].map((item, ordem) => {
        const precoEl = item.querySelector(s.preco);
        const promoEl = item.querySelector(s.promocao);
        const imgEl = item.querySelector(s.imagem);
        const statusEl = item.querySelector(s.status);
        const etiquetas = [...item.querySelectorAll(`${s.etiquetas} *`)]
          .map((e) => e.textContent.trim())
          .filter(Boolean);

        // A URL da imagem vem com sufixos de cache (?v=...) que mudam a cada
        // salvamento; guardamos a versao limpa para o nome do arquivo ficar estavel.
        const src = imgEl && imgEl.src ? imgEl.src : '';
        const semCache = src ? src.split('?')[0] : '';

        return {
          codigo: item.getAttribute('cod') || '',
          ordem,
          titulo: texto(item, s.titulo),
          descricao: texto(item, s.descricao),
          medida: texto(item, s.medida),
          preco: precoEl ? precoEl.value : '',
          promocao: promoEl && promoEl.value !== '0,00' ? promoEl.value : '',
          disponivel: statusEl ? statusEl.className.includes('ativo') : null,
          etiquetas,
          imagemUrl: src,
          imagemUrlLimpa: semCache,
        };
      });

      return { categoria: nome, ref: secao.getAttribute('ref') || '', produtos };
    });
  }, SELETORES);
}

module.exports = { extrairCatalogo, SELETORES };
