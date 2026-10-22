/**
 * Leitura do "Pix copia e cola" (BR Code, formato EMV).
 *
 * O codigo vem da tela de plano do Cardapio.ai. Antes de guardar e mostrar
 * para alguem pagar, ele e conferido: estrutura dos campos e CRC. Um codigo
 * cortado ou alterado no caminho nunca chega a virar cobranca.
 */

/** CRC16-CCITT (polinomio 0x1021, inicio 0xFFFF), como pede o BR Code. */
function crc16(texto) {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Campos de primeiro nivel: cada um e id (2 digitos) + tamanho (2 digitos) + valor. */
function campos(texto) {
  const lidos = new Map();
  for (let i = 0; i < texto.length;) {
    const id = texto.slice(i, i + 2), tamanho = texto.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(tamanho) || i + 4 + Number(tamanho) > texto.length) {
      throw new Error('codigo Pix malformado');
    }
    lidos.set(id, texto.slice(i + 4, i + 4 + Number(tamanho)));
    i += 4 + Number(tamanho);
  }
  return lidos;
}

function lerPix(codigo) {
  if (typeof codigo !== 'string') throw new Error('codigo Pix ausente');
  const texto = codigo.trim();
  if (texto.length < 30 || texto.length > 512) throw new Error('codigo Pix com tamanho invalido');
  const c = campos(texto);
  if (c.get('00') !== '01') throw new Error('codigo Pix sem o cabecalho do BR Code');
  const crc = c.get('63');
  if (!crc || crc.length !== 4 || !texto.endsWith('6304' + crc)) throw new Error('codigo Pix sem CRC no final');
  if (crc16(texto.slice(0, -4)) !== crc.toUpperCase()) throw new Error('codigo Pix com CRC invalido');
  const valor = c.has('54') ? Math.round(Number(c.get('54')) * 100) : null;
  if (valor !== null && !(valor > 0)) throw new Error('codigo Pix com valor invalido');
  return { codigo: texto, valor_centavos: valor, recebedor: c.get('59') || '', cidade: c.get('60') || '' };
}

module.exports = { lerPix, crc16 };
