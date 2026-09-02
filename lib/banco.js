/**
 * Banco de dados (SQLite) e criptografia das credenciais das lojas.
 *
 * Guardamos a senha do Cardapio.ai de cada loja porque a automacao precisa
 * fazer login como o dono. Isso e um risco real: quem obtiver o arquivo do
 * banco E a chave consegue entrar nas lojas. Por isso a senha vai cifrada com
 * AES-256-GCM e a chave fica fora do banco, em variavel de ambiente.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const ALGORITMO = 'aes-256-gcm';

function chaveDeCripto() {
  const bruta = process.env.CHAVE_CRIPTO;
  if (!bruta || bruta.length < 32) {
    throw new Error('CHAVE_CRIPTO ausente ou curta demais (minimo 32 caracteres)');
  }
  return crypto.createHash('sha256').update(bruta).digest();
}

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv(ALGORITMO, chaveDeCripto(), iv);
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  const tag = cifra.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), dados.toString('base64')].join('.');
}

function decifrar(guardado) {
  const [iv, tag, dados] = guardado.split('.');
  const decifra = crypto.createDecipheriv(ALGORITMO, chaveDeCripto(), Buffer.from(iv, 'base64'));
  decifra.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decifra.update(Buffer.from(dados, 'base64')), decifra.final()]).toString('utf8');
}

// ------------------------------------------------------------------ esquema

function abrir(caminho) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS lojas (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nome          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      senha_hash    TEXT    NOT NULL,
      admin         INTEGER NOT NULL DEFAULT 0,
      cdp_email     TEXT,
      cdp_senha     TEXT,
      cdp_link      TEXT,
      criada_em     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lotes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      loja_id    INTEGER NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
      estado     TEXT    NOT NULL DEFAULT 'rascunho',
      criado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS itens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      lote_id     INTEGER NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
      arquivo        TEXT NOT NULL,
      nome_original  TEXT,
      titulo      TEXT    NOT NULL DEFAULT '',
      descricao   TEXT    NOT NULL DEFAULT '',
      categoria   TEXT    NOT NULL DEFAULT '',
      preco       TEXT    NOT NULL DEFAULT '0',
      aprovado    INTEGER NOT NULL DEFAULT 1,
      estado      TEXT    NOT NULL DEFAULT 'pendente',
      erro        TEXT
    );

    CREATE TABLE IF NOT EXISTS leads (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nome       TEXT NOT NULL,
      whatsapp   TEXT NOT NULL,
      loja       TEXT,
      origem     TEXT,
      criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_lotes_loja ON lotes(loja_id);
    CREATE INDEX IF NOT EXISTS idx_itens_lote ON itens(lote_id);
    CREATE INDEX IF NOT EXISTS idx_leads_data ON leads(criado_em);
  `);

  return db;
}

// -------------------------------------------------------------------- lojas

function criarLoja(db, { nome, email, senha, admin = 0, cdpEmail, cdpSenha, cdpLink }) {
  const existe = db.prepare('SELECT id FROM lojas WHERE email = ?').get(email.toLowerCase());
  if (existe) throw new Error('ja existe uma conta com esse e-mail');

  return db.prepare(`
    INSERT INTO lojas (nome, email, senha_hash, admin, cdp_email, cdp_senha, cdp_link)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    nome,
    email.toLowerCase(),
    bcrypt.hashSync(senha, 10),
    admin ? 1 : 0,
    cdpEmail || null,
    cdpSenha ? cifrar(cdpSenha) : null,
    cdpLink || null,
  ).lastInsertRowid;
}

function autenticarLoja(db, email, senha) {
  const loja = db.prepare('SELECT * FROM lojas WHERE email = ?').get(String(email || '').toLowerCase());
  if (!loja) return null;
  return bcrypt.compareSync(senha, loja.senha_hash) ? loja : null;
}

function credenciaisCardapio(loja) {
  if (!loja.cdp_email || !loja.cdp_senha) {
    throw new Error('a loja ainda nao tem as credenciais do Cardapio.ai configuradas');
  }
  return { email: loja.cdp_email, senha: decifrar(loja.cdp_senha) };
}

function atualizarCredenciais(db, lojaId, { cdpEmail, cdpSenha, cdpLink }) {
  const atual = db.prepare('SELECT * FROM lojas WHERE id = ?').get(lojaId);
  db.prepare('UPDATE lojas SET cdp_email = ?, cdp_senha = ?, cdp_link = ? WHERE id = ?').run(
    cdpEmail !== undefined ? cdpEmail : atual.cdp_email,
    cdpSenha ? cifrar(cdpSenha) : atual.cdp_senha,
    cdpLink !== undefined ? cdpLink : atual.cdp_link,
    lojaId,
  );
}

module.exports = {
  abrir,
  cifrar,
  decifrar,
  criarLoja,
  autenticarLoja,
  credenciaisCardapio,
  atualizarCredenciais,
};
