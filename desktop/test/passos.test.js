const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// passos.js roda na pagina e se pendura em window: aqui ganha um window de mentira.
const contexto = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/telas/passos.js'), 'utf8'), contexto);
const proximoPasso = contexto.window.proximoPasso;
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const loja = (extra = {}) => ({
  tem_cardapio: true, tem_email: true, etapa: 'implantacao', plano: null, conferencia: null,
  ficha: { completas: 7, total: 7 }, roteiro: { feitas: 11, total: 11 }, ...extra,
});

test('proximo passo segue a ordem da implantacao', () => {
  assert.equal(proximoPasso(loja({ tem_cardapio: false, tem_email: false })).titulo, 'Cadastrar o login do Cardapio.ai');
  assert.equal(proximoPasso(loja({ tem_email: false })).titulo, 'Cadastrar o e-mail da loja');
  assert.equal(proximoPasso(loja({ ficha: { completas: 2, total: 7 } })).titulo, 'Completar a ficha (2 de 7)');
  assert.equal(proximoPasso(loja({ roteiro: { feitas: 4, total: 11 } })).acao, 'abrir-roteiro');
  assert.deepEqual([proximoPasso(loja()).acao, proximoPasso(loja()).tom], ['conferir', 'atencao']);
  assert.equal(proximoPasso(loja({ conferencia: { situacao: 'ok', criada_em: '2026-10-20' } })).titulo, 'Pronta para entregar');
});

test('plano vencendo e catalogo a corrigir passam na frente da ficha', () => {
  const vencendo = proximoPasso(loja({ ficha: { completas: 0, total: 7 }, plano: { valido_ate: dia(3) } }));
  assert.equal(vencendo.tom, 'ruim'); assert.match(vencendo.titulo, /^Plano vence em \d{2}\/\d{2}\/\d{4}$/);
  assert.match(proximoPasso(loja({ plano: { teste_ate: dia(1) } })).titulo, /^Teste grátis acaba/);
  assert.equal(proximoPasso(loja({ plano: { valido_ate: dia(30) }, conferencia: { situacao: 'bloqueante' } })).acao, 'abrir-conferencia');
  // O plano lido agora na janela vale mais que o da lista.
  assert.equal(proximoPasso(loja({ plano: { valido_ate: dia(30) } }), { valido_ate: dia(2) }).tom, 'ruim');
});

test('loja ativa sem pendencia fica em dia', () => {
  const p = proximoPasso(loja({ etapa: 'ativa', ficha: { completas: 1, total: 7 }, conferencia: { situacao: 'ok', criada_em: '2026-10-20 10:00:00' } }));
  assert.deepEqual([p.tom, p.titulo, p.detalhe], ['ok', 'Tudo em dia', 'Catálogo conferido em 20/10/2026.']);
});
