const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lerPlano } = require('../src/plano');

// Texto visivel do quadro do plano, como aparece numa loja com assinatura paga.
const pago = `PDV+Robô
Mensal
R$ 79,90
Apenas R$ 2,66 por dia
Tudo do PDV + Robô de pedidos, central de alertas no WhatsApp e recuperador de carrinho.
Pedidos e produtos ilimitados
Assinatura válida até 06/11/2026
Pagamento recebido via Pix
Cartão de crédito
Pix
Renove a assinatura de Novembro usando QR Code ou Pix copia e cola.
Gerar código Pix`;

test('le plano, valor, validade e situacao de uma assinatura paga', () => {
  assert.deepEqual(lerPlano({ titulo: 'PDV+Robô', texto: pago }), {
    plano: 'PDV+Robô', periodo: 'mensal', valor_centavos: 7990, valido_ate: '2026-11-06', teste_ate: null,
    situacao: 'Pagamento recebido via Pix', renovacao: 'Novembro', em_teste: false,
  });
});

test('le o periodo de teste gratis', () => {
  const r = lerPlano({ titulo: 'PDV+Robô', texto: 'PDV+Robô\nMensal\nR$ 79,90\nO seu teste GRÁTIS acaba em 3 dias\nVocê tem o teste grátis até o dia 25/10/2026.' });
  assert.equal(r.em_teste, true); assert.equal(r.teste_ate, '2026-10-25'); assert.equal(r.valido_ate, null);
});

test('periodo semestral e anual e situacao pendente', () => {
  const r = lerPlano({ titulo: 'Completo', texto: 'Completo\nAnual\nR$ 799,90\nAssinatura válida até 01/02/2027\nPix - Próxima verificação em 15 minutos' });
  assert.equal(r.periodo, 'anual'); assert.equal(r.valor_centavos, 79990); assert.equal(r.valido_ate, '2027-02-01');
  assert.match(r.situacao, /Próxima verificação/);
});

test('texto sem as informacoes nao inventa nada', () => {
  assert.deepEqual(lerPlano({ titulo: '', texto: 'Carregando…' }), {
    plano: null, periodo: null, valor_centavos: null, valido_ate: null, teste_ate: null, situacao: null, renovacao: null, em_teste: false,
  });
});

test('o titulo real traz periodo e valor junto: fica so o nome do plano', () => {
  assert.equal(lerPlano({ titulo: 'PDV+Robô\n\nMensal\nR$ 79,90', texto: pago }).plano, 'PDV+Robô');
});
