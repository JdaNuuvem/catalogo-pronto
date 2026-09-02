/**
 * Sessoes por cookie assinado.
 *
 * Nao usamos sessao em memoria porque ela morreria a cada reinicio do
 * container; o cookie assinado sobrevive ao deploy enquanto a CHAVE_SESSAO
 * nao mudar.
 */

const crypto = require('crypto');

const NOME_COOKIE = 'sessao';
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

function segredo() {
  const s = process.env.CHAVE_SESSAO;
  if (!s || s.length < 32) throw new Error('CHAVE_SESSAO ausente ou curta demais (minimo 32 caracteres)');
  return s;
}

function assinar(dados) {
  const corpo = Buffer.from(JSON.stringify(dados)).toString('base64url');
  const mac = crypto.createHmac('sha256', segredo()).update(corpo).digest('base64url');
  return `${corpo}.${mac}`;
}

function verificar(cookie) {
  if (!cookie || !cookie.includes('.')) return null;
  const [corpo, mac] = cookie.split('.');

  const esperado = crypto.createHmac('sha256', segredo()).update(corpo).digest('base64url');
  const a = Buffer.from(mac || '');
  const b = Buffer.from(esperado);
  // timingSafeEqual explode se os tamanhos diferem, entao compara antes.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    if (!dados.exp || dados.exp < Date.now()) return null;
    return dados;
  } catch {
    return null;
  }
}

function lerCookies(req) {
  const bruto = req.headers.cookie || '';
  const mapa = {};
  bruto.split(';').forEach((par) => {
    const i = par.indexOf('=');
    if (i > 0) mapa[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  });
  return mapa;
}

function entrar(res, loja) {
  const cookie = assinar({ id: loja.id, admin: !!loja.admin, exp: Date.now() + VALIDADE_MS });
  const seguro = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader('Set-Cookie',
    `${NOME_COOKIE}=${cookie}; HttpOnly;${seguro} SameSite=Lax; Path=/; Max-Age=${VALIDADE_MS / 1000}`);
}

function sair(res) {
  res.setHeader('Set-Cookie', `${NOME_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

/** Middleware: exige sessao valida e carrega a loja em req.loja. */
function exigirLogin(db) {
  return (req, res, next) => {
    const dados = verificar(lerCookies(req)[NOME_COOKIE]);
    if (!dados) return res.status(401).json({ erro: 'faca login para continuar' });

    const loja = db.prepare('SELECT * FROM lojas WHERE id = ?').get(dados.id);
    if (!loja) return res.status(401).json({ erro: 'conta nao encontrada' });

    req.loja = loja;
    next();
  };
}

function exigirAdmin(req, res, next) {
  if (!req.loja || !req.loja.admin) return res.status(403).json({ erro: 'area restrita ao administrador' });
  next();
}

module.exports = { entrar, sair, verificar, lerCookies, exigirLogin, exigirAdmin, NOME_COOKIE };
