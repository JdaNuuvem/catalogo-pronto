const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lerPix, crc16 } = require('../lib/pix');

// Monta um BR Code sintetico: campos EMV (id, tamanho, valor) e o CRC no fim.
function montar(campos) {
  const corpo = campos.map(([id, v]) => id + String(v.length).padStart(2, '0') + v).join('') + '6304';
  return corpo + crc16(corpo);
}
const conta = '0014br.gov.bcb.pix2547qrcodes.exemplo.com.br/qr-pix/v2/abcdefghijklmnop';
const valido = (valor = '79.90') => montar([['00', '01'], ['01', '12'], ['26', conta], ['52', '0000'], ['53', '986'],
  ['54', valor], ['58', 'BR'], ['59', 'NO MERCADO REPRESENTACOE'], ['60', 'Recife'], ['62', '0503***']]);

test('le valor, recebedor e cidade de um Pix copia e cola valido', () => {
  const pix = lerPix(valido());
  assert.equal(pix.valor_centavos, 7990);
  assert.equal(pix.recebedor, 'NO MERCADO REPRESENTACOE');
  assert.equal(pix.cidade, 'Recife');
  assert.equal(pix.codigo, valido());
});

test('aceita espacos em volta e valores sem centavos', () => {
  assert.equal(lerPix(`  ${valido('80')}\n`).valor_centavos, 8000);
});

test('recusa codigo alterado, truncado ou que nao e BR Code', () => {
  const codigo = valido();
  assert.throws(() => lerPix(codigo.replace('79.90', '19.90')), /CRC/);
  assert.throws(() => lerPix(codigo.slice(0, -10)), /Pix/);
  assert.throws(() => lerPix('nao e um pix'), /Pix/);
  assert.throws(() => lerPix(montar([['00', '02'], ['26', conta], ['54', '1.00']])), /BR Code/);
  assert.throws(() => lerPix(null), /Pix/);
});

test('codigo sem valor fixo devolve valor nulo', () => {
  assert.equal(lerPix(montar([['00', '01'], ['26', conta], ['53', '986'], ['58', 'BR']])).valor_centavos, null);
});
