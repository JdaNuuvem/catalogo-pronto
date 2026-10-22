const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { situacaoDaPagina, scriptDePreenchimento } = require('../src/login-automatico');

test('reconhece login e codigo de verificacao do Cardapio.ai pela origem do painel', () => {
  const painel = 'https://cardapio.ai/painelweb/listar';
  assert.equal(situacaoDaPagina('cardapio', 'https://cardapio.ai/admin/login?next=x', painel), 'login');
  assert.equal(situacaoDaPagina('cardapio', 'https://cardapio.ai/admin/mfa', painel), 'codigo');
  assert.equal(situacaoDaPagina('cardapio', 'https://cardapio.ai/painelweb/listar', painel), 'dentro');
  assert.equal(situacaoDaPagina('cardapio', 'https://outro.site/admin/login', painel), 'fora');
});

test('usa os enderecos reais do Cardapio.ai (gravados no percurso do Pix)', () => {
  const painel = 'https://cardapio.ai/painelweb/listar';
  assert.equal(situacaoDaPagina('cardapio', 'https://cardapio.ai/painelweb/admin/login', painel), 'login');
  assert.equal(situacaoDaPagina('cardapio', 'https://cardapio.ai/painelweb/admin/mfa?login', painel), 'codigo');
  assert.equal(situacaoDaPagina('cardapio', 'https://cardapio.ai/painelweb/account?plans', painel), 'dentro');
});

test('reconhece a tela de login do Proton', () => {
  const caixa = 'https://account.proton.me/mail';
  assert.equal(situacaoDaPagina('email', 'https://account.proton.me/login', caixa), 'login');
  assert.equal(situacaoDaPagina('email', 'https://mail.proton.me/u/0/inbox', caixa), 'dentro');
  assert.equal(situacaoDaPagina('email', 'https://phishing.example/login', caixa), 'fora');
});

// Executa o script num "documento" de mentira para conferir o que ele faz na pagina.
function rodar(script, { campos = true } = {}) {
  const eventos = [], valores = {};
  const campo = (nome) => ({ nome, dispatchEvent: (e) => eventos.push(`${nome}:${e.type}`), form: { requestSubmit: () => eventos.push('submit') } });
  const el = { usuario: campo('usuario'), senha: campo('senha'), botao: { disabled: false, click: () => eventos.push('click') } };
  const contexto = {
    document: { querySelector: (s) => (!campos ? null : /email|username/.test(s) ? el.usuario : /senha|password/.test(s) ? el.senha : el.botao) },
    HTMLInputElement: { prototype: {} }, Event: class { constructor(type) { this.type = type; } },
    setTimeout: (fn) => fn(), Object,
  };
  Object.defineProperty(contexto.HTMLInputElement.prototype, 'value', { set(v) { valores[this.nome] = v; }, configurable: true });
  return { resultado: vm.runInNewContext(script, contexto), eventos, valores };
}

test('preenche usuario e senha como digitacao e envia', () => {
  const { resultado, eventos, valores } = rodar(scriptDePreenchimento('cardapio', { usuario: 'loja@x.com', senha: 's3nha' }));
  assert.equal(resultado, 'preenchido');
  assert.deepEqual(valores, { usuario: 'loja@x.com', senha: 's3nha' });
  assert.ok(eventos.includes('usuario:input') && eventos.includes('senha:change') && eventos.includes('click'));
});

test('senha com aspas e tags nao quebra nem injeta codigo no script', () => {
  const senha = `a"b'c</script>\${x}\\n`;
  const { valores } = rodar(scriptDePreenchimento('email', { usuario: 'u', senha }));
  assert.equal(valores.senha, senha);
});

test('sem os campos na tela ainda, avisa para tentar de novo', () => {
  assert.equal(rodar(scriptDePreenchimento('email', { usuario: 'u', senha: 's' }), { campos: false }).resultado, 'sem-campos');
});

test('servico desconhecido nao gera script', () => {
  assert.throws(() => scriptDePreenchimento('banco', { usuario: 'u', senha: 's' }), /serviço/);
});
