const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarFicha, SECOES } = require('../lib/ficha');

const completa = () => ({
  loja: { nome: 'Mercado da Roça', documento: '11.222.333/0001-81', telefone: '(11) 99999-0000', pedido_minimo: '20,00' },
  endereco: { cep: '01310-100', rua: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'sp', exibicao: 'completo' },
  marca: { cor: '#1F5170', logo_material: 7, capa_material: null },
  horarios: { agendamento: 'sem', dias: { seg: [{ abre: '09:00', fecha: '18:00' }], sab: [{ abre: '9:00', fecha: '13:00' }] } },
  entrega: { faz_entrega: true, retirada: true, modo: 'raio', raio_base_km: '3', taxa_base: '5,00', taxa_km: '1,50', distancia_maxima_km: '10', frete_gratis_km: '', tempo_preparo_min: '30' },
  pagamento: { pix: true, pix_tipo: 'email', pix_chave: 'Financeiro@Mercado.com', dinheiro: true, credito: true, debito: false, vale: false },
  produtos: { origem: 'link', link_cardapio: 'https://www.ifood.com.br/delivery/sao-paulo-sp/mercado' },
});

test('normaliza os formatos para o que o Cardapio.ai espera', () => {
  const { ficha, erros, completo } = validarFicha(completa());
  assert.deepEqual(erros, []);
  assert.equal(ficha.loja.documento, '11222333000181');
  assert.equal(ficha.loja.telefone, '11999990000');
  assert.equal(ficha.loja.pedido_minimo, 2000);
  assert.equal(ficha.endereco.cep, '01310100'); assert.equal(ficha.endereco.uf, 'SP');
  assert.equal(ficha.marca.cor, '#1f5170');
  assert.deepEqual(ficha.horarios.dias.sab, [{ abre: '09:00', fecha: '13:00' }]);
  assert.deepEqual(ficha.horarios.dias.dom, []);
  assert.equal(ficha.entrega.taxa_base, 500); assert.equal(ficha.entrega.taxa_km, 150); assert.equal(ficha.entrega.frete_gratis_km, null);
  assert.equal(ficha.pagamento.pix_chave, 'financeiro@mercado.com');
  assert.deepEqual(Object.values(completo).every(Boolean), true);
  assert.deepEqual(Object.keys(completo), SECOES);
});

test('aceita ficha pela metade (rascunho) e diz o que falta em cada secao', () => {
  const { erros, completo } = validarFicha({ loja: { nome: 'Padaria Sol' } });
  assert.deepEqual(erros, []);
  assert.equal(completo.loja, false);
  assert.equal(completo.endereco, false);
  assert.equal(completo.pagamento, false);
});

test('aponta o campo com problema em vez de recusar a ficha toda', () => {
  const f = completa();
  f.endereco.cep = '123'; f.marca.cor = 'azul'; f.horarios.dias.seg = [{ abre: '25:00', fecha: '18:00' }];
  f.pagamento.pix_tipo = 'cpf'; f.pagamento.pix_chave = '123';
  f.produtos.link_cardapio = 'javascript:alert(1)';
  const campos = validarFicha(f).erros.map((e) => e.campo).sort();
  assert.deepEqual(campos, ['endereco.cep', 'horarios.dias.seg', 'marca.cor', 'pagamento.pix_chave', 'produtos.link_cardapio']);
});

test('horario que fecha antes de abrir e periodo vazio sao recusados', () => {
  const f = completa(); f.horarios.dias.seg = [{ abre: '18:00', fecha: '09:00' }];
  assert.deepEqual(validarFicha(f).erros.map((e) => e.campo), ['horarios.dias.seg']);
});

test('valida a chave Pix conforme o tipo', () => {
  const pix = (pix_tipo, pix_chave) => validarFicha({ pagamento: { pix: true, pix_tipo, pix_chave } });
  assert.equal(pix('cpf', '123.456.789-09').ficha.pagamento.pix_chave, '12345678909');
  assert.equal(pix('celular', '(11) 98888-7777').ficha.pagamento.pix_chave, '+5511988887777');
  assert.equal(pix('aleatoria', '123E4567-E89B-12D3-A456-426614174000').ficha.pagamento.pix_chave, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(pix('email', 'nao-e-email').erros[0].campo, 'pagamento.pix_chave');
  assert.equal(pix('tipo-estranho', 'x').erros[0].campo, 'pagamento.pix_tipo');
});

test('entrega por bairros exige nome e taxa de cada bairro; sem entrega basta ter retirada', () => {
  const bairros = validarFicha({ entrega: { faz_entrega: true, modo: 'bairros', bairros: [{ nome: 'Centro', taxa: '4' }, { nome: '', taxa: '1' }] } });
  assert.deepEqual(bairros.erros.map((e) => e.campo), ['entrega.bairros']);
  assert.equal(validarFicha({ entrega: { faz_entrega: false, retirada: true } }).completo.entrega, true);
  assert.equal(validarFicha({ entrega: { faz_entrega: false, retirada: false } }).completo.entrega, false);
});

test('ignora campos que nao existem na ficha e textos grandes demais', () => {
  const { ficha, erros } = validarFicha({ intruso: { x: 1 }, loja: { nome: 'x'.repeat(500), hack: '<script>' } });
  assert.equal('intruso' in ficha, false); assert.equal('hack' in ficha.loja, false);
  assert.deepEqual(erros.map((e) => e.campo), ['loja.nome']);
});

test('validar de novo uma ficha ja gravada nao muda nada (valores em centavos ficam em centavos)', () => {
  const uma = validarFicha(completa()).ficha;
  const duas = validarFicha(uma);
  assert.deepEqual(duas.erros, []);
  assert.deepEqual(duas.ficha, uma);
  assert.equal(duas.ficha.entrega.taxa_km, 150);
});
