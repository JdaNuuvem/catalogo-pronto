/**
 * Kit de entrega da loja: QR Code do link, cartaz em PDF para imprimir e a
 * mensagem de entrega para o cliente. Tudo gerado no computador, sem servico externo.
 */
const QRCode = require('qrcode');

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function qrCode(link) {
  return QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: 640, color: { dark: '#23201c', light: '#ffffff' } });
}

/** Cartaz A4 para o balcao: nome, logo (se houver), QR Code e o link. */
function cartazHtml({ nome, link, qr, logo, cor = '#a8442a' }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:0}*{box-sizing:border-box}
    body{margin:0;width:210mm;height:297mm;font-family:"Segoe UI",system-ui,sans-serif;color:#23201c;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10mm;text-align:center}
    .faixa{position:absolute;top:0;left:0;right:0;height:18mm;background:${/^#[0-9a-f]{6}$/i.test(cor) ? cor : '#a8442a'}}
    img.logo{max-width:60mm;max-height:40mm;object-fit:contain}
    h1{margin:0;font-size:34pt;letter-spacing:-.5pt;max-width:170mm}
    p{margin:0;font-size:18pt;color:#4a443d}
    img.qr{width:120mm;height:120mm}
    .link{font-size:13pt;color:#6b655c;word-break:break-all;max-width:170mm}
  </style></head><body><div class="faixa"></div>
    ${logo ? `<img class="logo" src="${logo}" alt="">` : ''}
    <h1>${escapar(nome)}</h1><p>Aponte a câmera e faça seu pedido pelo cardápio digital</p>
    <img class="qr" src="${qr}" alt=""><div class="link">${escapar(link)}</div>
  </body></html>`;
}

/** Mensagem de entrega: o atendente revisa na tela antes de mandar. */
function mensagemDeEntrega({ nome, link, atendente }) {
  return [
    `Olá! A loja ${nome} está pronta no Cardapio.ai 🎉`,
    '',
    `Link para os clientes: ${link || '(o link aparece depois da primeira publicação)'}`,
    '',
    'Para começar:',
    '1. Abra o painel do Cardapio.ai e deixe a loja como "Aberta" no horário de funcionamento.',
    '2. Compartilhe o link no WhatsApp, no Instagram e imprima o cartaz com o QR Code para o balcão.',
    '3. Cada pedido chega no painel e no celular. Confirme, prepare e marque como saiu para entrega.',
    '4. Para mudar preço ou pausar um produto, use Produtos no painel.',
    '',
    `Qualquer dúvida, é só chamar${atendente ? ` (${atendente})` : ''}.`,
  ].join('\n');
}

module.exports = { qrCode, cartazHtml, mensagemDeEntrega };
