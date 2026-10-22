const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calcular } = require('../lib/lembretes');

const hoje = '2026-10-22';
const cobranca = (o) => ({ id: 1, loja_id: 7, cliente: 'Mercado', tipo: 'outro', descricao: 'Serviço', valor: 10000, pendente: 10000,
  reserva: 0, plataforma_paga: 0, cancelada: 0, vencimento: '2026-10-24', grupo: null, competencia: null, pix_codigo: null, ...o });
const base = { cobrancas: [], clientes: [], tarefas: [], hoje, admin: true };
const tipos = (l) => l.map((x) => x.tipo);

test('avisa a cobranca que vence nos proximos 3 dias e a que ja venceu', () => {
  const l = calcular({ ...base, cobrancas: [cobranca({ id: 1 }), cobranca({ id: 2, vencimento: '2026-10-20' }),
    cobranca({ id: 3, vencimento: '2026-10-30' }), cobranca({ id: 4, pendente: 0 }), cobranca({ id: 5, cancelada: 1, vencimento: '2026-10-01' })] });
  assert.deepEqual(tipos(l), ['vencida', 'vencendo']);
  assert.equal(l[0].nivel, 'urgente');
  assert.match(l[0].titulo, /venceu há 2 dias/);
  assert.match(l[1].titulo, /vence em 2 dias/);
  assert.deepEqual(l[1].cobrancas, [1]);
});

test('suporte e plano da mesma mensalidade viram um lembrete so, com o valor somado', () => {
  const l = calcular({ ...base, cobrancas: [
    cobranca({ id: 10, tipo: 'plano', valor: 7990, pendente: 7990, grupo: 'g1', competencia: '2026-10', vencimento: hoje }),
    cobranca({ id: 11, tipo: 'suporte', valor: 15000, pendente: 15000, grupo: 'g1', competencia: '2026-10', vencimento: hoje })] });
  assert.equal(l.length, 1);
  assert.match(l[0].titulo, /Mensalidade 2026-10 de Mercado vence hoje/);
  assert.equal(l[0].valor, 22990);
  assert.deepEqual(l[0].cobrancas, [10, 11]);
});

test('lembra de pagar a plataforma quando ha reserva do plano, so para o administrador', () => {
  const plano = cobranca({ id: 20, tipo: 'plano', valor: 7990, pendente: 0, reserva: 7990, vencimento: '2026-11-10', pix_codigo: '000201' });
  const admin = calcular({ ...base, cobrancas: [plano] });
  assert.deepEqual(tipos(admin), ['plataforma']);
  assert.match(admin[0].titulo, /Pagar o Pix do Cardapio.ai/);
  assert.match(calcular({ ...base, cobrancas: [{ ...plano, pix_codigo: null }] })[0].titulo, /Gerar e pagar/);
  assert.deepEqual(calcular({ ...base, admin: false, cobrancas: [plano] }), []);
  assert.deepEqual(calcular({ ...base, cobrancas: [{ ...plano, plataforma_paga: 7990, reserva: 0 }] }), []);
});

test('prazos de lojas novas e de tarefas que estao chegando ou atrasados', () => {
  const l = calcular({ ...base,
    clientes: [{ id: 7, nome: 'Mercado', ativo: 1, implantacao_prazo: '2026-10-21', onboarding_feitos: ['cadastro'] },
      { id: 8, nome: 'Padaria', ativo: 1, implantacao_prazo: '2026-10-23', onboarding_feitos: [] },
      { id: 9, nome: 'Doceria', ativo: 1, implantacao_prazo: '2026-10-21', onboarding_feitos: Array(11).fill('x') },
      { id: 10, nome: 'Longe', ativo: 1, implantacao_prazo: '2026-12-01', onboarding_feitos: [] }],
    tarefas: [{ id: 1, loja_id: 7, cliente: 'Mercado', titulo: 'Configurar impressora', estado: 'pendente', prazo: '2026-10-22' },
      { id: 2, loja_id: 7, cliente: 'Mercado', titulo: 'Feita', estado: 'concluida', prazo: '2026-10-01' }] });
  assert.deepEqual(tipos(l), ['prazo-loja', 'prazo-tarefa', 'prazo-loja']);
  assert.match(l[0].titulo, /Mercado.*atrasad/);
  assert.match(l[1].titulo, /Configurar impressora/);
});

test('plano do Cardapio.ai vencendo ou teste gratis acabando avisa o administrador', () => {
  const lojas = [
    { id: 7, nome: 'Mercado', ativo: 1, cdp_plano_valido_ate: '2026-10-25', onboarding_feitos: Array(11).fill('x') },
    { id: 8, nome: 'Padaria', ativo: 1, cdp_plano_teste_ate: '2026-10-20', onboarding_feitos: Array(11).fill('x') },
    { id: 9, nome: 'Longe', ativo: 1, cdp_plano_valido_ate: '2026-12-30', onboarding_feitos: Array(11).fill('x') },
  ];
  const l = calcular({ ...base, clientes: lojas });
  assert.deepEqual(l.map((x) => [x.tipo, x.nivel, x.loja_id]), [['plano-cardapio', 'urgente', 8], ['plano-cardapio', 'breve', 7]]);
  assert.match(l[0].titulo, /Teste grátis do Cardapio\.ai de Padaria acabou há 2 dias/);
  assert.match(l[1].titulo, /Plano Cardapio\.ai de Mercado vence em 3 dias/);
  assert.deepEqual(calcular({ ...base, admin: false, clientes: lojas }), []);
});
