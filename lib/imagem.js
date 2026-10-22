/**
 * Tratamento das fotos dos produtos antes de publicar.
 *
 * 1. Tira o fundo (Photoroom, so com PHOTOROOM_API_KEY no ambiente).
 * 2. Padroniza: quadrado de 1000x1000, fundo branco, produto centralizado com
 *    respiro, brilho e cor levemente realçados, arquivo no formato da extensao.
 *
 * Sem a chave, so padroniza: o fundo original continua e o resultado avisa.
 * A foto original fica guardada ao lado (<arquivo>.original) para desfazer.
 */
const fs = require('fs');
const path = require('path');

const LADO = 1000;
const RESPIRO = 0.08;
const URL_PHOTOROOM = 'https://image-api.photoroom.com/v2/edit';
const FORMATOS = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' };

const caminhoOriginal = (caminho) => `${caminho}.original`;

/** Devolve a foto sem fundo, em PNG com fundo branco, ou lanca erro com a resposta do servico. */
async function removerFundo(buffer, nome, { chave, fetch: buscar = fetch } = {}) {
  const form = new FormData();
  form.append('imageFile', new Blob([buffer]), nome);
  form.append('removeBackground', 'true');
  form.append('background.color', 'FFFFFF');
  form.append('padding', String(RESPIRO));
  form.append('outputSize', `${LADO}x${LADO}`);
  form.append('export.format', 'png');
  const r = await buscar(URL_PHOTOROOM, { method: 'POST', headers: { 'x-api-key': chave }, body: form });
  if (!r.ok) throw new Error(`remoção de fundo respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Quadrado branco com o produto centralizado; luz e contraste normalizados de leve. */
async function padronizar(buffer, formato, sharp = require('sharp')) {
  const interno = Math.round(LADO * (1 - 2 * RESPIRO));
  const produto = await sharp(buffer).rotate()
    .flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 12 }).toBuffer()
    .catch(() => sharp(buffer).rotate().flatten({ background: '#ffffff' }).toBuffer());
  const ajustado = await sharp(produto)
    .resize(interno, interno, { fit: 'contain', background: '#ffffff' })
    // Ajuste leve: normalizar o contraste com o fundo branco escurece demais o produto.
    .modulate({ brightness: 1.03, saturation: 1.06 })
    .sharpen({ sigma: 0.6 })
    .toBuffer();
  const saida = sharp({ create: { width: LADO, height: LADO, channels: 3, background: '#ffffff' } })
    .composite([{ input: ajustado, gravity: 'center' }]);
  if (formato === 'png') return saida.png({ compressionLevel: 9 }).toBuffer();
  if (formato === 'webp') return saida.webp({ quality: 90 }).toBuffer();
  return saida.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/**
 * Trata a foto no lugar. Sempre parte do original guardado, entao tratar de novo
 * nao acumula perda. Devolve { fundoRemovido, aviso }.
 */
async function tratar(caminho, { chave = process.env.PHOTOROOM_API_KEY, fetch: buscar, sharp } = {}) {
  const original = caminhoOriginal(caminho);
  if (!fs.existsSync(original)) fs.copyFileSync(caminho, original);
  const bruto = fs.readFileSync(original);
  const formato = FORMATOS[path.extname(caminho).toLowerCase()] || 'jpeg';
  let base = bruto, fundoRemovido = false, aviso = null;
  if (chave) {
    try { base = await removerFundo(bruto, path.basename(caminho), { chave, fetch: buscar }); fundoRemovido = true; }
    catch (e) { aviso = `Fundo mantido: ${e.message}`; }
  } else aviso = 'Fundo mantido: a remoção de fundo não está configurada no servidor.';
  fs.writeFileSync(caminho, await padronizar(base, formato, sharp));
  return { fundoRemovido, aviso };
}

/** Volta a foto original e apaga a copia guardada. */
function desfazer(caminho) {
  const original = caminhoOriginal(caminho);
  if (!fs.existsSync(original)) return false;
  fs.copyFileSync(original, caminho); fs.unlinkSync(original);
  return true;
}

const foiTratada = (caminho) => fs.existsSync(caminhoOriginal(caminho));

const LIMITE_CARDAPIO = 2 * 1024 * 1024; // o Cardapio.ai recusa logo e capa acima de 2MB

/** Logo: bordas sobrando cortadas, quadrado 800x800 com respiro, PNG (mantem transparencia). */
async function tratarLogo(buffer, sharp = require('sharp')) {
  const base = await sharp(buffer).rotate().trim({ threshold: 10 }).toBuffer().catch(() => sharp(buffer).rotate().toBuffer());
  const meta = await sharp(base).metadata();
  const fundo = meta.hasAlpha ? { r: 255, g: 255, b: 255, alpha: 0 } : '#ffffff';
  const interno = await sharp(base).resize(704, 704, { fit: 'contain', background: fundo }).png().toBuffer();
  return sharp({ create: { width: 800, height: 800, channels: 4, background: fundo } }).composite([{ input: interno, gravity: 'center' }]).png({ compressionLevel: 9 }).toBuffer();
}

/** Capa: no maximo 1920px de largura, JPEG abaixo de 2MB (baixa a qualidade se precisar). */
async function tratarCapa(buffer, sharp = require('sharp')) {
  const base = sharp(buffer).rotate().flatten({ background: '#ffffff' }).resize({ width: 1920, withoutEnlargement: true });
  for (const qualidade of [86, 78, 70, 60]) {
    const saida = await base.clone().jpeg({ quality: qualidade, mozjpeg: true }).toBuffer();
    if (saida.length <= LIMITE_CARDAPIO) return saida;
  }
  return base.clone().resize({ width: 1400 }).jpeg({ quality: 60, mozjpeg: true }).toBuffer();
}

module.exports = { tratar, desfazer, foiTratada, removerFundo, padronizar, tratarLogo, tratarCapa, caminhoOriginal, LADO };
