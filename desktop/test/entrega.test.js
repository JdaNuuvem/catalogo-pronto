const { test } = require('node:test');
const assert = require('node:assert/strict');
const { qrCode, cartazHtml, mensagemDeEntrega } = require('../src/entrega');

test('QR Code do link sai como imagem PNG', async () => {
  const qr = await qrCode('https://cardapio.ai/mercado-da-roca');
  assert.match(qr, /^data:image\/png;base64,/);
  assert.ok(Buffer.from(qr.split(',')[1], 'base64').length > 500);
});

test('cartaz escapa o nome da loja e ignora cor que nao e #rrggbb', () => {
  const html = cartazHtml({ nome: 'Bar <do> Zé', link: 'https://x.ai/a?b=1&c=2', qr: 'data:image/png;base64,AA', cor: 'red;} body{display:none' });
  assert.match(html, /Bar &lt;do&gt; Zé/); assert.match(html, /a\?b=1&amp;c=2/);
  assert.match(html, /background:#a8442a/); assert.doesNotMatch(html, /display:none/);
  assert.doesNotMatch(cartazHtml({ nome: 'X', link: 'l', qr: 'q' }), /class="logo"/);
});

test('mensagem de entrega traz o link ou explica quando ainda nao existe', () => {
  assert.match(mensagemDeEntrega({ nome: 'Mercado', link: 'https://cardapio.ai/m', atendente: 'Ana' }), /Link para os clientes: https:\/\/cardapio\.ai\/m[\s\S]*\(Ana\)/);
  assert.match(mensagemDeEntrega({ nome: 'Mercado', link: '' }), /depois da primeira publicação/);
});
