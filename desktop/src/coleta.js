/**
 * Coleta de um cardapio em outro site (iFood, Anota Ai, Goomer...): abre o link numa
 * janela escondida, sem login e sem os perfis das lojas, rola ate o fim para a
 * pagina carregar tudo e devolve o texto e as imagens que parecem de produto.
 * Quem entende o texto e monta os produtos e a IA, no servidor.
 */
const { BrowserWindow, session } = require('electron');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Roda na pagina: imagens grandes o bastante para ser foto de produto, com o texto do cartao em volta.
const SCRIPT_COLETA = `(() => {
  const vistos = new Set(), imagens = [];
  for (const img of document.images) {
    const src = img.currentSrc || img.src || '';
    if (!/^https?:/.test(src) || vistos.has(src) || img.naturalWidth < 80 || img.naturalHeight < 80) continue;
    vistos.add(src);
    let perto = '', el = img.parentElement;
    for (let n = 0; n < 5 && el; n++, el = el.parentElement) { const t = (el.innerText || '').trim(); if (t.length >= 8) { perto = t.slice(0, 300); break; } }
    imagens.push({ i: imagens.length, src, alt: (img.alt || '').slice(0, 120), perto });
    if (imagens.length >= 400) break;
  }
  return { texto: (document.body.innerText || '').slice(0, 300000), imagens, titulo: document.title };
})()`;

async function coletarPagina(url, { tempoMaximo = 90000 } = {}) {
  let endereco;
  try { endereco = new URL(String(url || '').trim()); } catch { throw new Error('Cole o endereço completo do cardápio (começando com https://).'); }
  if (!['http:', 'https:'].includes(endereco.protocol)) throw new Error('Cole o endereço completo do cardápio (começando com https://).');
  const oculta = new BrowserWindow({ show: false, width: 1280, height: 1600,
    webPreferences: { session: session.fromPartition('coleta-cardapio'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  oculta.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  oculta.webContents.setAudioMuted(true);
  const limite = Date.now() + tempoMaximo;
  try {
    await oculta.loadURL(endereco.toString()).catch(() => {});
    await espera(3000);
    // Rola ate a altura parar de crescer (cardapios carregam as secoes aos poucos).
    let altura = 0, paradas = 0;
    while (paradas < 3 && Date.now() < limite) {
      const nova = await oculta.webContents.executeJavaScript('window.scrollBy(0, 1400); document.documentElement.scrollHeight').catch(() => altura);
      paradas = nova === altura ? paradas + 1 : 0; altura = nova;
      await espera(700);
    }
    await oculta.webContents.executeJavaScript('window.scrollTo(0, 0)').catch(() => {});
    await espera(500);
    const pagina = await oculta.webContents.executeJavaScript(SCRIPT_COLETA);
    if (!pagina.texto || pagina.texto.length < 40) throw new Error('A página abriu vazia. Confira o link ou tente de novo.');
    return pagina;
  } finally { if (!oculta.isDestroyed()) oculta.destroy(); }
}

module.exports = { coletarPagina, SCRIPT_COLETA };
