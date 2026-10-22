const { test } = require('node:test');
const assert = require('node:assert/strict');
const importar = require('../lib/importar');
const ia = require('../lib/ia');

const cfg = { provedor: 'anthropic', chaves: { anthropic: 'k' } };
const respostaIa = (lista) => async () => ({ ok: true, json: async () => ({ content: [{ text: JSON.stringify(lista) }] }) });
const resposta = ({ status = 200, tipo = 'image/png', corpo = Buffer.from('png'), tamanho } = {}) => ({
  ok: status < 400, status, arrayBuffer: async () => corpo,
  headers: { get: (h) => (h === 'content-type' ? tipo : h === 'content-length' ? (tamanho ?? String(corpo.length)) : null) },
});

test('reconhece enderecos internos de rede', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.equal(importar.ipInterno(ip), true, ip);
  for (const ip of ['8.8.8.8', '177.7.45.242', '2606:4700::1111']) assert.equal(importar.ipInterno(ip), false, ip);
});

test('baixa foto so por https, de endereco publico, ate 3MB e se for imagem', async () => {
  const publico = async () => [{ address: '151.101.1.1' }];
  const ok = await importar.baixarImagem('https://cdn.exemplo/a.png', { resolver: publico, buscar: async () => resposta() });
  assert.equal(ok.tipo, 'image/png');
  await assert.rejects(importar.baixarImagem('http://cdn.exemplo/a.png', { resolver: publico, buscar: async () => resposta() }), /https/);
  await assert.rejects(importar.baixarImagem('https://interno/a.png', { resolver: async () => [{ address: '10.0.0.5' }], buscar: async () => resposta() }), /não permitido/);
  await assert.rejects(importar.baixarImagem('https://169.254.169.254/latest', { buscar: async () => resposta() }), /não permitido/);
  await assert.rejects(importar.baixarImagem('https://cdn.exemplo/a', { resolver: publico, buscar: async () => resposta({ tipo: 'text/html' }) }), /não é uma foto/);
  await assert.rejects(importar.baixarImagem('https://cdn.exemplo/a', { resolver: publico, buscar: async () => resposta({ tamanho: String(5 * 1024 * 1024) }) }), /3MB/);
  await assert.rejects(importar.baixarImagem('https://cdn.exemplo/a', { resolver: publico, buscar: async () => resposta({ status: 404 }) }), /404/);
});

test('produto importado: com preco ja entra pronto; sem foto ganha nome proprio', () => {
  const nome = importar.nomeSemFoto();
  assert.equal(importar.semFoto(nome), true); assert.equal(importar.semFoto('123-queijo.png'), false);
  assert.deepEqual(importar.paraLinha({ titulo: 'X-Burguer', descricao: 'Pão e carne', categoria: '🍔 Lanches', preco: 2990 }, nome, 'importado de link'),
    { arquivo: nome, nome_original: 'importado de link', titulo: 'X-Burguer', descricao: 'Pão e carne', categoria: '🍔 Lanches', preco: '29.90', aprovado: 1, erro: null });
  assert.equal(importar.paraLinha({ titulo: 'Sem preço', preco: null }, nome, 'x').aprovado, 0);
});

test('baixa ate 4 fotos por vez e a que falha deixa o produto sem foto', async () => {
  let aoMesmoTempo = 0, pico = 0;
  const baixar = async (src) => { aoMesmoTempo++; pico = Math.max(pico, aoMesmoTempo); await new Promise((r) => setTimeout(r, 5)); aoMesmoTempo--; if (src === 'ruim') throw new Error('x'); return src; };
  const r = await importar.baixarTodas(['a', null, 'ruim', 'b', 'c', 'd', 'e', 'f'], baixar);
  assert.deepEqual(r, ['a', null, null, 'b', 'c', 'd', 'e', 'f']); assert.ok(pico <= 4);
});

test('IA le cardapio impresso: preco em centavos, sem inventar o que nao tem', async () => {
  const lidos = await ia.lerCardapioImpresso([], cfg, respostaIa([
    { titulo: 'Pizza Calabresa G', descricao: 'Calabresa e cebola', categoria: '🍕 Pizzas', preco: 54.9 },
    { titulo: 'Refrigerante lata', categoria: '🥤 Bebidas', preco: '6,00' }, { titulo: 'Sem preço', preco: null }, { titulo: '' }]));
  assert.deepEqual(lidos.map((p) => [p.titulo, p.preco]), [['Pizza Calabresa G', 5490], ['Refrigerante lata', 600], ['Sem preço', null]]);
});

test('IA importa pagina: liga cada produto a uma imagem que existe e tira repetidos', async () => {
  const pedidos = [];
  const buscar = async (url, op) => { pedidos.push(JSON.parse(op.body)); return respostaIa([
    { titulo: 'Açaí 500ml', preco: 22, categoria: '🍧 Açaí', imagem: 2 }, { titulo: 'Açaí 500ml', preco: 22, imagem: 2 },
    { titulo: 'Água', preco: 4, imagem: 99 }])(); };
  const lidos = await ia.extrairCardapio({ texto: 'Açaí 500ml R$ 22,00\nÁgua R$ 4,00\n'.repeat(3), imagens: [{ i: 2, alt: 'Açaí 500ml', perto: 'R$ 22' }] }, cfg, buscar);
  assert.deepEqual(lidos.map((p) => [p.titulo, p.preco, p.imagem]), [['Açaí 500ml', 2200, 2], ['Água', 400, null]]);
  assert.match(pedidos[0].messages[0].content, /#2: Açaí 500ml \| perto: R\$ 22/);
  // Pagina enorme vai em partes.
  await ia.extrairCardapio({ texto: ('Produto qualquer R$ 10,00\n').repeat(3000), imagens: [] }, cfg, buscar);
  assert.ok(pedidos.length >= 3);
});
