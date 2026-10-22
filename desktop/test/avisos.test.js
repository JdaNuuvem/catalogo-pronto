const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { novidades, criarMemoria } = require('../src/avisos');

const lembrete = (extra) => ({ tipo: 'vencida', nivel: 'urgente', loja_id: 3, data: '2026-10-20', titulo: 'Mensalidade de Padaria venceu', ...extra });

test('avisa cada lembrete atrasado ou de hoje uma vez so', () => {
  const { visto } = criarMemoria(path.join(os.tmpdir(), 'nao-existe-' + Date.now()));
  const leitura = { lembretes: [lembrete(), lembrete({ nivel: 'breve', tipo: 'vencendo' }), lembrete({ nivel: 'hoje', tipo: 'prazo-loja', titulo: 'Entrega hoje' })], lojas: [] };
  assert.deepEqual(novidades(leitura, visto).map((a) => [a.titulo, a.corpo, a.lojaId]),
    [['Atrasado', 'Mensalidade de Padaria venceu', 3], ['Para hoje', 'Entrega hoje', 3]]);
  assert.deepEqual(novidades(leitura, visto), []);
  // Outra data e outro assunto: avisa de novo.
  assert.equal(novidades({ lembretes: [lembrete({ data: '2026-11-20' })], lojas: [] }, visto).length, 1);
});

test('ficha enviada avisa so quando muda depois da primeira leitura', () => {
  const { visto } = criarMemoria(path.join(os.tmpdir(), 'nao-existe-' + Date.now()));
  const loja = (enviada) => ({ id: 5, nome: 'Mercado', ficha: { enviada_em: enviada } });
  assert.deepEqual(novidades({ lembretes: [], lojas: [loja('2026-10-01 10:00:00')] }, visto), []);
  assert.deepEqual(novidades({ lembretes: [], lojas: [loja('2026-10-01 10:00:00')] }, visto), []);
  assert.deepEqual(novidades({ lembretes: [], lojas: [loja('2026-10-22 09:00:00')] }, visto).map((a) => a.titulo), ['Ficha recebida']);
});

test('o que ja foi avisado sobrevive a reabrir o app', () => {
  const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'avisos-')), 'avisos.json');
  const primeira = criarMemoria(arquivo);
  novidades({ lembretes: [lembrete()], lojas: [] }, primeira.visto); primeira.gravar();
  const segunda = criarMemoria(arquivo);
  assert.deepEqual(novidades({ lembretes: [lembrete()], lojas: [] }, segunda.visto), []);
  segunda.limpar();
  assert.equal(novidades({ lembretes: [lembrete()], lojas: [] }, criarMemoria(arquivo).visto).length, 1);
});
