/**
 * Produtos que chegam sem passar pela leitura de fotos: cardapio impresso lido pela
 * IA e cardapio importado de outro site (iFood, Anota Ai...).
 *
 * Item sem foto ganha um nome "sem-foto-..." no lote; a foto pode entrar depois.
 * Fotos de sites so sao baixadas por https, de enderecos publicos, ate 3MB e se
 * forem mesmo imagem (o servidor nao vira ponte para a rede interna).
 */
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const path = require('path');

const PREFIXO_SEM_FOTO = 'sem-foto-';
const TAMANHO_MAXIMO = 3 * 1024 * 1024;
const EXTENSOES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const semFoto = (arquivo) => String(arquivo || '').startsWith(PREFIXO_SEM_FOTO);
const nomeSemFoto = () => `${PREFIXO_SEM_FOTO}${crypto.randomUUID()}`;

/** Endereco de rede interna, local ou reservado (IPv4 e IPv6). */
function ipInterno(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return ipInterno(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

/**
 * Baixa a foto de um produto. Devolve { dados, tipo } ou lanca erro.
 * @param {object} [op] { permitirLocal } so para testes; { buscar, resolver } para trocar rede e DNS.
 */
async function baixarImagem(endereco, { permitirLocal = false, buscar = fetch, resolver = (h) => dns.lookup(h, { all: true }) } = {}) {
  let url;
  try { url = new URL(endereco); } catch { throw new Error('endereço inválido'); }
  if (url.protocol !== 'https:' && !(permitirLocal && url.protocol === 'http:')) throw new Error('só baixo fotos por https');
  if (!permitirLocal) {
    const ips = net.isIP(url.hostname) ? [{ address: url.hostname }] : await resolver(url.hostname);
    if (!ips.length || ips.some((r) => ipInterno(r.address))) throw new Error('endereço não permitido');
  }
  const controle = new AbortController(), tempo = setTimeout(() => controle.abort(), 15000);
  try {
    const r = await buscar(url, { redirect: 'error', signal: controle.signal, headers: { accept: 'image/*' } });
    if (!r.ok) throw new Error(`o site respondeu ${r.status}`);
    const tipo = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!EXTENSOES[tipo]) throw new Error('não é uma foto JPEG, PNG ou WebP');
    if (Number(r.headers.get('content-length') || 0) > TAMANHO_MAXIMO) throw new Error('foto acima de 3MB');
    const dados = Buffer.from(await r.arrayBuffer());
    if (dados.length > TAMANHO_MAXIMO) throw new Error('foto acima de 3MB');
    return { dados, tipo };
  } finally { clearTimeout(tempo); }
}

/** Grava a foto baixada na pasta da loja com um nome novo; devolve o nome do arquivo. */
function guardarFoto(pasta, { dados, tipo }, nomeBase = 'foto') {
  fs.mkdirSync(pasta, { recursive: true });
  const seguro = String(nomeBase).normalize('NFD').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'foto';
  const arquivo = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${seguro}${EXTENSOES[tipo]}`;
  fs.writeFileSync(path.join(pasta, arquivo), dados);
  return arquivo;
}

/** Produto lido (preco em centavos) -> linha do lote. Com preco, ja entra como pronto. */
function paraLinha(p, arquivo, origem) {
  return {
    arquivo, nome_original: origem, titulo: p.titulo, descricao: p.descricao || '', categoria: p.categoria || '',
    preco: p.preco ? (p.preco / 100).toFixed(2) : '0', aprovado: p.preco ? 1 : 0, erro: null,
  };
}

/** Baixa ate 4 fotos por vez; a que falhar deixa o produto sem foto. */
async function baixarTodas(lista, baixar) {
  const resultado = new Array(lista.length).fill(null);
  let proxima = 0;
  const trabalhar = async () => {
    while (proxima < lista.length) {
      const i = proxima++;
      if (!lista[i]) continue;
      resultado[i] = await baixar(lista[i]).catch(() => null);
    }
  };
  await Promise.all([1, 2, 3, 4].map(trabalhar));
  return resultado;
}

module.exports = { semFoto, nomeSemFoto, ipInterno, baixarImagem, guardarFoto, paraLinha, baixarTodas, PREFIXO_SEM_FOTO };
