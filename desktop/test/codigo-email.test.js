const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { dataProton, extrairCodigo, codigoNovo, scriptPreencherCodigo } = require('../src/codigo-email');

// Corpo do e-mail como chega do Cardapio.ai (texto do iframe da mensagem no Proton).
const corpo = `Código de acesso

Use o código abaixo para entrar no painel do Cardapio.ai.

Ele expira em poucos minutos. Se não foi você, ignore este e-mail.

734700

Qualquer dúvida, é só nos chamar no suporte.
©2026 Cardapio.ai — Todos os direitos reservados.`;

test('le a data do cabecalho do Proton (horario local)', () => {
  const d = dataProton('quinta-feira, 22 de outubro de 2026 às 04:05');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 9, 22, 4, 5]);
  assert.equal(dataProton('ontem'), null);
});

test('acha o codigo de 6 digitos sozinho na linha, ignorando o ano do rodape', () => {
  assert.equal(extrairCodigo(corpo), '734700');
  assert.equal(extrairCodigo('Use o código 123456 para entrar'), '123456');
  assert.equal(extrairCodigo('sem codigo aqui ©2026'), null);
});

test('so aceita codigo de mensagem chegada depois do pedido (tolerancia de 1 minuto)', () => {
  const pedido = new Date(2026, 9, 22, 4, 5, 40).getTime();
  const mensagem = (quando) => ({ assunto: 'Código de acesso — Cardapio.ai', quando, texto: corpo });
  assert.equal(codigoNovo(mensagem('quinta-feira, 22 de outubro de 2026 às 04:05'), pedido), '734700');
  assert.equal(codigoNovo(mensagem('quinta-feira, 22 de outubro de 2026 às 04:04'), pedido), '734700');
  assert.equal(codigoNovo(mensagem('quinta-feira, 22 de outubro de 2026 às 03:58'), pedido), null);
  assert.equal(codigoNovo({ ...mensagem('quinta-feira, 22 de outubro de 2026 às 04:06'), assunto: 'Sua mensalidade vence em 3 dias' }, pedido), null);
});

test('preenche o codigo na tela do Cardapio.ai como digitacao e confirma', () => {
  const eventos = [], valores = {};
  const campo = { nome: 'code', dispatchEvent: (e) => eventos.push(e.type) };
  const ctx = { document: { querySelector: (s) => (/code/.test(s) ? campo : { disabled: false, click: () => eventos.push('click') }) },
    HTMLInputElement: { prototype: {} }, Event: class { constructor(t) { this.type = t; } }, setTimeout: (f) => f(), Object };
  Object.defineProperty(ctx.HTMLInputElement.prototype, 'value', { set(v) { valores[this.nome] = v; } });
  assert.equal(vm.runInNewContext(scriptPreencherCodigo('734700'), ctx), 'preenchido');
  assert.equal(valores.code, '734700'); assert.ok(eventos.includes('input') && eventos.includes('click'));
  assert.throws(() => scriptPreencherCodigo('12ab'), /código/);
});
