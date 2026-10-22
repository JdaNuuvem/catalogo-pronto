/**
 * Conferencia do catalogo publicado no Cardapio.ai.
 *
 * SCRIPT_LEITURA roda na pagina de produtos da loja (/painelweb/listar) e le
 * categorias e produtos como o painel deles mostra (estrutura gravada na
 * exploracao: .category-section-area > .see-products-product).
 *
 * conferir compara essa leitura com o que revisamos e publicamos pelo painel
 * e separa o que impede entregar a loja (bloqueante) do que vale melhorar (atencao).
 */
const SCRIPT_LEITURA = `(() => {
  const texto = (el) => (el ? el.textContent.replace(/\\s+/g, ' ').trim() : '');
  const categorias = [], produtos = [];
  for (const cat of document.querySelectorAll('.category-section-area')) {
    const nome = texto(cat.querySelector('.category-section-title .title-text'));
    const ativa = !/desativad/i.test(texto(cat.querySelector('.category-section-title .title-disponibility')));
    const itens = cat.querySelectorAll('.see-products-product');
    categorias.push({ ref: cat.getAttribute('ref') || '', nome, ativa, produtos: itens.length });
    for (const p of itens) {
      const chip = p.querySelector('.chip-prod-status');
      produtos.push({
        cod: p.getAttribute('cod') || '',
        nome: texto(p.querySelector('.product-details .title')),
        descricao: texto(p.querySelector('.product-details .sub-title')),
        preco: (p.querySelector('input.value-obj') || {}).value || texto(p.querySelector('.product-value-mobile-price')),
        categoria: nome,
        ativo: !!chip && chip.classList.contains('ativo'),
        situacao: texto(chip && chip.querySelector('.product-option-tooltip')),
        // A pagina tira a classe "change" da area da foto quando a imagem nao carrega.
        tem_foto: !!p.querySelector('.image.change img.image-obj[src]'),
      });
    }
  }
  return { categorias, produtos, url: location.href };
})()`;

/** "R$ 1.234,56", "80,00" ou "19.99" em centavos; null quando nao da para ler. */
function centavos(v) {
  const t = String(v ?? '').replace(/[^\d,.]/g, '');
  if (!t) return null;
  const decimal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(decimal);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
const reais = (c) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;
const chaveDoNome = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function conferir({ lidos, esperados = [], contratados = 0 }) {
  const problemas = [];
  const anotar = (tipo, nivel, produto, detalhe) => problemas.push({ tipo, nivel, produto, detalhe });
  const { produtos = [], categorias = [] } = lidos || {};

  if (!produtos.length) anotar('catalogo-vazio', 'bloqueante', null, 'Nenhum produto encontrado na loja.');
  const porNome = new Map();
  for (const p of produtos) {
    const chave = chaveDoNome(p.nome);
    if (porNome.has(chave)) anotar('duplicado', 'bloqueante', p.nome, 'Aparece mais de uma vez no cardápio.');
    else porNome.set(chave, p);
    const preco = centavos(p.preco);
    if (!preco) anotar('sem-preco', 'bloqueante', p.nome, 'Sem preço ou com preço zero.');
    if (!p.tem_foto) anotar('sem-foto', 'atencao', p.nome, 'Sem foto: produto com foto vende mais.');
    if (!p.descricao) anotar('sem-descricao', 'atencao', p.nome, 'Sem descrição.');
    if (!p.ativo) anotar('desativado', 'atencao', p.nome, `Não aparece para o cliente (${p.situacao || 'desativado'}).`);
  }
  for (const c of categorias) {
    if (!c.produtos) anotar('categoria-vazia', 'atencao', c.nome, 'Categoria sem produtos.');
    if (!c.ativa) anotar('categoria-desativada', 'atencao', c.nome, 'Categoria desativada: os produtos dela não aparecem.');
  }
  for (const e of esperados) {
    const achado = porNome.get(chaveDoNome(e.titulo));
    if (!achado) { anotar('faltando', 'bloqueante', e.titulo, 'Publicado pelo painel, mas não está na loja.'); continue; }
    const esperado = centavos(e.preco), atual = centavos(achado.preco);
    if (esperado && atual && esperado !== atual) anotar('preco-diferente', 'bloqueante', e.titulo, `Na loja está ${reais(atual)}; revisado por ${reais(esperado)}.`);
  }
  if (contratados && produtos.length < contratados) {
    anotar('abaixo-do-contratado', 'atencao', null, `A loja tem ${produtos.length} de ${contratados} produtos contratados.`);
  }

  const situacao = problemas.some((p) => p.nivel === 'bloqueante') ? 'bloqueante' : problemas.length ? 'atencao' : 'ok';
  const conta = (tipo) => problemas.filter((p) => p.tipo === tipo).length;
  return {
    situacao, problemas,
    totais: { produtos: produtos.length, categorias: categorias.length, publicados_por_nos: esperados.length, contratados,
      sem_foto: conta('sem-foto'), sem_preco: conta('sem-preco'), sem_descricao: conta('sem-descricao'), desativados: conta('desativado'), faltando: conta('faltando') },
  };
}

module.exports = { SCRIPT_LEITURA, conferir, centavos, chaveDoNome };
