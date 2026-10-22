// Gera o Pix do plano numa copia local da tela do Cardapio.ai (account?plans).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const cardapio = require('../lib/cardapio');
const { crc16 } = require('../lib/pix');

const campos = [['00', '01'], ['01', '12'], ['26', '0014br.gov.bcb.pix2524qrcodes.exemplo.com.br/x'], ['52', '0000'],
  ['53', '986'], ['54', '79.90'], ['58', 'BR'], ['59', 'TESTE'], ['60', 'Recife']];
const corpo = campos.map(([id, v]) => id + String(v.length).padStart(2, '0') + v).join('') + '6304';
const codigo = corpo + crc16(corpo);
const qr = 'data:image/png;base64,iVBORw0KGgo=';

const pagina = (conteudo) => `<!doctype html><html><body>${conteudo}</body></html>`;
const plano = (comPix) => pagina(comPix ? `
  <div class="payment-types-item" type="pix"><div>Pix</div>
    <p>Renove a assinatura de <b>Novembro</b> usando QR Code ou Pix copia e cola.</p>
    <button>Gerar código Pix</button></div>
  <div id="destino"></div>
  <script>
    document.querySelector('.payment-types-item button').onclick = () => setTimeout(() => {
      document.getElementById('destino').innerHTML = '<div class="payment-qr-details"><div class="payment-qr-code">'
        + '<img src="${qr}"><button link="${codigo}"><div>Copiar código Pix</div></button></div>'
        + '<p class="payment-qr-value">R$&nbsp;79,90</p><p class="payment-qr-account">Teste LTDA</p></div>';
    }, 400);
  </script>` : '<p>Seu plano está em dia.</p>');

(async () => {
  const servidor = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (req.url.endsWith('/listar')) return res.end(pagina('<h1>Produtos</h1>'));
    if (req.url.includes('/account?plans')) return res.end(plano(!req.url.startsWith('/sem-pix')));
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'pix-perfil-'));
  const etapas = [];
  try {
    const pix = await cardapio.gerarPixPlano({
      config: { baseUrl: `${base}/painelweb`, email: 'loja@teste.local', senha: 'x', headless: true },
      perfil, aoProgredir: (e) => etapas.push(e.texto),
    });
    assert.equal(pix.codigo, codigo);
    assert.equal(pix.valor_centavos, 7990);
    assert.equal(pix.competencia, 'Novembro');
    assert.equal(pix.qr, qr);
    assert.equal(pix.recebedor, 'TESTE');
    assert.ok(etapas.some((t) => /plano/.test(t)));

    await assert.rejects(cardapio.gerarPixPlano({
      config: { baseUrl: `${base}/sem-pix/painelweb`, email: 'x', senha: 'x', headless: true, esperaPix: 2000 }, perfil,
    }), /Pix/);
    console.log('pix.browser: ok');
  } finally {
    servidor.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
