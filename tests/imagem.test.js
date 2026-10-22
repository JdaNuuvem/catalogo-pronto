const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const imagem = require('../lib/imagem');
const ia = require('../lib/ia');

const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'imagem-test-'));
// Foto de produto: fundo cinza com um retangulo vermelho fora do centro.
const fotoDeProduto = () => sharp({ create: { width: 800, height: 500, channels: 3, background: '#9a9a9a' } })
  .composite([{ input: { create: { width: 200, height: 300, channels: 3, background: '#c03020' } }, left: 80, top: 100 }]).jpeg().toBuffer();

test('sem chave so padroniza: quadrado 1000x1000 no formato da extensao e original guardado', async () => {
  const caminho = path.join(pasta(), 'produto.jpg');
  fs.writeFileSync(caminho, await fotoDeProduto());
  const r = await imagem.tratar(caminho, { chave: '' });
  assert.equal(r.fundoRemovido, false); assert.match(r.aviso, /não está configurada/);
  const meta = await sharp(caminho).metadata();
  assert.deepEqual([meta.width, meta.height, meta.format], [1000, 1000, 'jpeg']);
  assert.ok(imagem.foiTratada(caminho));
  assert.equal(imagem.desfazer(caminho), true); assert.equal((await sharp(caminho).metadata()).width, 800);
  assert.equal(imagem.foiTratada(caminho), false); assert.equal(imagem.desfazer(caminho), false);
});

test('com chave manda a foto original ao servico de fundo e centraliza o recorte no branco', async () => {
  const caminho = path.join(pasta(), 'produto.png');
  fs.writeFileSync(caminho, await fotoDeProduto());
  const pedidos = [];
  // O servico devolve o produto sobre fundo branco, ainda fora do centro.
  const recorte = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: 200, height: 300, channels: 3, background: '#c03020' } }, left: 80, top: 100 }]).png().toBuffer();
  const fetch = async (url, opcoes) => { pedidos.push({ url, chave: opcoes.headers['x-api-key'], campos: [...opcoes.body.keys()] }); return { ok: true, arrayBuffer: async () => recorte }; };
  await imagem.tratar(caminho, { chave: 'k-teste', fetch });
  // Tratar de novo parte do original, nao da foto ja tratada.
  await imagem.tratar(caminho, { chave: 'k-teste', fetch });
  assert.equal(pedidos.length, 2); assert.equal(pedidos[0].chave, 'k-teste');
  assert.ok(pedidos[0].campos.includes('imageFile') && pedidos[0].campos.includes('removeBackground'));
  const { data, info } = await sharp(caminho).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  assert.deepEqual([info.width, info.height], [1000, 1000]);
  assert.deepEqual(px(5, 5), [255, 255, 255]);
  const centro = px(500, 500); assert.ok(centro[0] > 150 && centro[1] < 90, `centro devia ser o produto, veio ${centro}`);
});

test('servico de fundo fora do ar: padroniza assim mesmo e avisa', async () => {
  const caminho = path.join(pasta(), 'produto.webp');
  fs.writeFileSync(caminho, await fotoDeProduto());
  const r = await imagem.tratar(caminho, { chave: 'k', fetch: async () => ({ ok: false, status: 402, text: async () => 'sem credito' }) });
  assert.equal(r.fundoRemovido, false); assert.match(r.aviso, /402: sem credito/);
  assert.equal((await sharp(caminho).metadata()).format, 'webp');
});

test('IA sugere adicionais: limpa a resposta, nao inventa preco e so usa categorias da loja', async () => {
  let pedido;
  const resposta = [
    { nome: 'Turbine seu lanche', minimo: 5, maximo: 2, categorias: ['🍔 Lanches', 'Inventada'], itens: [{ nome: 'Bacon extra', preco: 4 }, { nome: 'Cheddar', preco: null }, { nome: '' }] },
    { nome: 'Grupo vazio', itens: [] },
  ];
  const fetch = async (url, opcoes) => { pedido = JSON.parse(opcoes.body); return { ok: true, json: async () => ({ content: [{ text: '```json\n' + JSON.stringify(resposta) + '\n```' }] }) }; };
  const grupos = await ia.sugerirAdicionais({ produtos: [{ titulo: 'X-Burguer', categoria: '🍔 Lanches' }], doCliente: 'bacon extra 4 reais', fetch },
    { provedor: 'anthropic', chaves: { anthropic: 'k' } });
  assert.deepEqual(grupos, [{ nome: 'Turbine seu lanche', minimo: 2, maximo: 2, categorias: ['🍔 Lanches'], itens: [{ nome: 'Bacon extra', preco: 400 }, { nome: 'Cheddar', preco: null }] }]);
  assert.match(pedido.messages[0].content, /bacon extra 4 reais/); assert.match(pedido.messages[0].content, /X-Burguer \[🍔 Lanches\]/);
});
