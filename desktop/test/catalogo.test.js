const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conferir, centavos, chaveDoNome } = require('../src/catalogo');

const produto = (o) => ({ cod: '1', nome: 'Queijo Coalho', descricao: 'Firme, ótimo para grelhar.', preco: '80,00', categoria: '🧀 Queijos', ativo: true, tem_foto: true, ...o });
const leitura = (produtos, categorias = [{ ref: 'queijos', nome: '🧀 Queijos', ativa: true, produtos: produtos.length }]) => ({ produtos, categorias });

test('le precos como o Cardapio.ai mostra e compara nomes sem acento e maiusculas', () => {
  assert.equal(centavos('R$ 1.234,56'), 123456); assert.equal(centavos('80,00'), 8000);
  assert.equal(centavos('19.99'), 1999); assert.equal(centavos(''), null); assert.equal(centavos('abc'), null);
  assert.equal(chaveDoNome('  Pão de  Queijo '), chaveDoNome('PAO DE QUEIJO'));
});

test('catalogo em ordem nao tem problema bloqueante', () => {
  const r = conferir({ lidos: leitura([produto({})]), esperados: [{ titulo: 'queijo coalho', preco: '80.00' }], contratados: 1 });
  assert.equal(r.situacao, 'ok');
  assert.deepEqual(r.problemas, []);
  assert.equal(r.totais.produtos, 1); assert.equal(r.totais.categorias, 1); assert.equal(r.totais.publicados_por_nos, 1);
});

test('aponta o que falta e o que esta errado, separando bloqueante de atencao', () => {
  const r = conferir({
    lidos: leitura([
      produto({ cod: '1' }),
      produto({ cod: '2', nome: 'Mel 220g', preco: '0,00', tem_foto: false, descricao: '' }),
      produto({ cod: '3', nome: 'Doce de Leite', preco: '15,00', ativo: false }),
      produto({ cod: '4', nome: 'Doce de leite' }),
    ], [{ ref: 'queijos', nome: '🧀 Queijos', ativa: true, produtos: 4 }, { ref: 'vazia', nome: 'Bebidas', ativa: false, produtos: 0 }]),
    esperados: [{ titulo: 'Queijo Coalho', preco: '75,00' }, { titulo: 'Goiabada Cascão', preco: '12,00' }],
    contratados: 10,
  });
  assert.equal(r.situacao, 'bloqueante');
  const tipos = r.problemas.map((p) => p.tipo).sort();
  assert.deepEqual(tipos, ['abaixo-do-contratado', 'categoria-desativada', 'categoria-vazia', 'desativado', 'duplicado', 'faltando', 'preco-diferente', 'sem-descricao', 'sem-foto', 'sem-preco']);
  const faltando = r.problemas.find((p) => p.tipo === 'faltando');
  assert.equal(faltando.nivel, 'bloqueante'); assert.equal(faltando.produto, 'Goiabada Cascão');
  assert.equal(r.problemas.find((p) => p.tipo === 'sem-descricao').nivel, 'atencao');
  assert.match(r.problemas.find((p) => p.tipo === 'preco-diferente').detalhe, /R\$\s?80,00.*R\$\s?75,00/);
  assert.match(r.problemas.find((p) => p.tipo === 'abaixo-do-contratado').detalhe, /4 de 10/);
});

test('so avisos de atencao deixam a situacao em atencao', () => {
  const r = conferir({ lidos: leitura([produto({ descricao: '' })]), esperados: [], contratados: 0 });
  assert.equal(r.situacao, 'atencao');
});

test('loja sem nenhum produto lido e bloqueante', () => {
  const r = conferir({ lidos: { produtos: [], categorias: [] }, esperados: [], contratados: 25 });
  assert.equal(r.situacao, 'bloqueante');
  assert.ok(r.problemas.some((p) => p.tipo === 'catalogo-vazio'));
});
