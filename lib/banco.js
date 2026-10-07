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

    -- Configuracoes gerais do painel (provedor de IA, modelo, chaves).
    -- "cifrado" marca os valores que passam por AES-256-GCM: as chaves de API
    -- ficam aqui, entao o banco sozinho nao entrega nada sem a CHAVE_CRIPTO.
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave        TEXT PRIMARY KEY,
      valor        TEXT,
      cifrado      INTEGER NOT NULL DEFAULT 0,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_lotes_loja ON lotes(loja_id);
    CREATE INDEX IF NOT EXISTS idx_itens_lote ON itens(lote_id);
    CREATE INDEX IF NOT EXISTS idx_leads_data ON leads(criado_em);

    -- O nome do arquivo ja e unico por loja (tem timestamp e sufixo aleatorio),
    -- mas o indice garante que reenviar a mesma foto no mesmo lote atualize a
    -- ficha em vez de criar uma duplicata.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_itens_arquivo ON itens(lote_id, arquivo);
  `);

  // Colunas acrescentadas depois do primeiro deploy. SQLite nao tem
  // "ADD COLUMN IF NOT EXISTS", entao a gente olha o que ja existe.
  const colunas = db.prepare('PRAGMA table_info(lotes)').all().map((c) => c.name);
  if (!colunas.includes('tentativas')) {
    db.exec('ALTER TABLE lotes ADD COLUMN tentativas INTEGER NOT NULL DEFAULT 0');
  }
  if (!colunas.includes('motivo')) {
    db.exec('ALTER TABLE lotes ADD COLUMN motivo TEXT');
  }

  require('./operacao').migrar(db);

  return db;
}

// --------------------------------------------------------- lotes e itens

/**
 * O lote e o trabalho em andamento de uma loja: as fotos enviadas, as fichas
 * revisadas e o que ja foi publicado. Vive no banco, e nao na aba do
 * navegador, para que fechar a pagina ou reiniciar o servidor no meio de 50
 * produtos nao jogue o trabalho fora.
 *
 * Estados do lote:  rascunho -> publicando -> concluido
 * Estados do item:  pendente -> enviando -> enviado | falhou
 */

/** Lote em aberto da loja, ou null. So existe um por vez. */
function loteAberto(db, lojaId) {
  return db.prepare(`
    SELECT * FROM lotes
    WHERE loja_id = ? AND estado IN ('rascunho', 'publicando', 'interrompido')
    ORDER BY id DESC LIMIT 1
  `).get(lojaId) || null;
}

/** Devolve o lote aberto ou cria um novo. */
function garantirLote(db, lojaId) {
  const atual = loteAberto(db, lojaId);
  if (atual) return atual;
  const id = db.prepare("INSERT INTO lotes (loja_id, estado) VALUES (?, 'rascunho')")
    .run(lojaId).lastInsertRowid;
  return db.prepare('SELECT * FROM lotes WHERE id = ?').get(id);
}

function itensDoLote(db, loteId) {
  return db.prepare('SELECT * FROM itens WHERE lote_id = ? ORDER BY id').all(loteId);
}

/** Grava as fichas recem-lidas pela IA. Reenvio da mesma foto atualiza. */
function adicionarItens(db, loteId, itens) {
  const inserir = db.prepare(`
    INSERT INTO itens (lote_id, arquivo, nome_original, titulo, descricao, categoria, preco, aprovado, estado, erro)
    VALUES (@lote_id, @arquivo, @nome_original, @titulo, @descricao, @categoria, @preco, @aprovado, 'pendente', @erro)
    ON CONFLICT(lote_id, arquivo) DO UPDATE SET
      titulo = excluded.titulo, descricao = excluded.descricao,
      categoria = excluded.categoria, aprovado = excluded.aprovado, erro = excluded.erro
  `);
  const gravarTodos = db.transaction((lista) => {
    lista.forEach((i) => inserir.run({ ...i, lote_id: loteId }));
  });
  gravarTodos(itens);
}

/**
 * Salva a revisao de uma ficha. So os campos enviados mudam, e um item ja
 * publicado nao aceita edicao: o que esta no ar nao volta atras por aqui.
 */
function salvarItem(db, loteId, arquivo, campos) {
  const permitidos = ['titulo', 'descricao', 'categoria', 'preco', 'aprovado'];
  const mudar = permitidos.filter((c) => campos[c] !== undefined);
  if (!mudar.length) return false;

  const sql = `UPDATE itens SET ${mudar.map((c) => `${c} = ?`).join(', ')}
               WHERE lote_id = ? AND arquivo = ? AND estado <> 'enviado'`;
  const valores = mudar.map((c) => (c === 'aprovado' ? (campos[c] ? 1 : 0) : String(campos[c])));
  return db.prepare(sql).run(...valores, loteId, arquivo).changes > 0;
}

function marcarItem(db, loteId, arquivo, estado, erro) {
  db.prepare('UPDATE itens SET estado = ?, erro = ? WHERE lote_id = ? AND arquivo = ?')
    .run(estado, erro || null, loteId, arquivo);
}

function estadoLote(db, loteId, estado) {
  db.prepare('UPDATE lotes SET estado = ? WHERE id = ?').run(estado, loteId);
}

/**
 * Fecha o lote se nao sobrou nada aprovado por publicar. Enquanto houver
 * pendencia ele volta para rascunho, para o dono retentar so o que faltou.
 */
function fecharSeTerminou(db, loteId) {
  const faltam = db.prepare(`
    SELECT COUNT(*) AS n FROM itens
    WHERE lote_id = ? AND aprovado = 1 AND estado <> 'enviado'
  `).get(loteId).n;
  estadoLote(db, loteId, faltam ? 'rascunho' : 'concluido');
  return faltam === 0;
}

/**
 * Chamado na subida do servidor. Um lote que ficou "publicando" e um trabalho
 * que morreu junto com o processo.
 *
 * O item que estava em transito na hora da queda e o caso delicado: ele pode
 * ter sido salvo na loja um instante antes de tudo morrer, ou nao. Marcamos
 * como "incerto" em vez de chutar — quem decide e a retomada, conferindo a
 * listagem real da loja antes de reenviar qualquer coisa.
 *
 * Devolve os lotes para o servidor decidir se retoma sozinho.
 */
function recuperarLotesInterrompidos(db) {
  const emVoo = db.prepare("SELECT * FROM lotes WHERE estado = 'publicando'").all();
  if (!emVoo.length) return [];

  db.transaction(() => {
    for (const lote of emVoo) {
      db.prepare(`UPDATE itens SET estado = 'incerto',
                  erro = 'o servidor reiniciou durante o envio deste produto'
                  WHERE lote_id = ? AND estado = 'enviando'`).run(lote.id);
      db.prepare('UPDATE lotes SET estado = ?, tentativas = tentativas + 1 WHERE id = ?')
        .run('interrompido', lote.id);
    }
  })();

  return db.prepare("SELECT * FROM lotes WHERE estado = 'interrompido'").all();
}

/** Desiste da retomada automatica e devolve o lote para revisao manual. */
function devolverParaRevisao(db, loteId, motivo) {
  db.transaction(() => {
    db.prepare(`UPDATE itens SET estado = 'pendente' WHERE lote_id = ? AND estado IN ('enviando', 'incerto')`)
      .run(loteId);
    db.prepare('UPDATE lotes SET estado = ?, motivo = ? WHERE id = ?').run('rascunho', motivo || null, loteId);
  })();
}

/** Itens cujo destino ficou em duvida apos uma queda no meio do envio. */
function itensIncertos(db, loteId) {
  return db.prepare("SELECT * FROM itens WHERE lote_id = ? AND estado = 'incerto'").all(loteId);
}

function descartarLote(db, lojaId) {
  const lote = loteAberto(db, lojaId);
  if (!lote) return null;
  // Guarda o que ja foi publicado: descartar o rascunho nao pode apagar o
  // historico do que esta no ar.
  const publicados = db.prepare("SELECT COUNT(*) AS n FROM itens WHERE lote_id = ? AND estado = 'enviado'").get(lote.id).n;
  if (publicados) {
    db.prepare("DELETE FROM itens WHERE lote_id = ? AND estado <> 'enviado'").run(lote.id);
    estadoLote(db, lote.id, 'concluido');
  } else {
    db.prepare('DELETE FROM lotes WHERE id = ?').run(lote.id);
  }
  return lote.id;
}

/** Lotes ja encerrados, com a contagem do que subiu e do que falhou. */
function historico(db, lojaId, limite = 20) {
  return db.prepare(`
    SELECT l.id, l.criado_em, l.estado,
           COUNT(i.id)                                        AS total,
           SUM(CASE WHEN i.estado = 'enviado' THEN 1 ELSE 0 END) AS publicados,
           SUM(CASE WHEN i.estado = 'falhou'  THEN 1 ELSE 0 END) AS falhas
    FROM lotes l
    LEFT JOIN itens i ON i.lote_id = l.id
    WHERE l.loja_id = ? AND l.estado = 'concluido'
    GROUP BY l.id
    ORDER BY l.id DESC
    LIMIT ?
  `).all(lojaId, limite);
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

// ------------------------------------------------------------ configuracoes

function lerConfig(db, chave) {
  const linha = db.prepare('SELECT valor, cifrado FROM configuracoes WHERE chave = ?').get(chave);
  if (!linha || linha.valor === null || linha.valor === '') return null;
  return linha.cifrado ? decifrar(linha.valor) : linha.valor;
}

/** Grava; valor vazio ou nulo apaga a entrada em vez de guardar string vazia. */
function gravarConfig(db, chave, valor, { cifrado = false } = {}) {
  if (valor === null || valor === undefined || valor === '') {
    db.prepare('DELETE FROM configuracoes WHERE chave = ?').run(chave);
    return;
  }
  db.prepare(`
    INSERT INTO configuracoes (chave, valor, cifrado, atualizado_em)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(chave) DO UPDATE SET
      valor = excluded.valor, cifrado = excluded.cifrado, atualizado_em = excluded.atualizado_em
  `).run(chave, cifrado ? cifrar(valor) : valor, cifrado ? 1 : 0);
}

function quandoAtualizado(db, chave) {
  const linha = db.prepare('SELECT atualizado_em FROM configuracoes WHERE chave = ?').get(chave);
  return linha ? linha.atualizado_em : null;
}

module.exports = {
  abrir,
  cifrar,
  decifrar,
  criarLoja,
  autenticarLoja,
  credenciaisCardapio,
  atualizarCredenciais,
  lerConfig,
  gravarConfig,
  quandoAtualizado,
  loteAberto,
  garantirLote,
  itensDoLote,
  adicionarItens,
  salvarItem,
  marcarItem,
  estadoLote,
  fecharSeTerminou,
  recuperarLotesInterrompidos,
  devolverParaRevisao,
  itensIncertos,
  descartarLote,
  historico,
};
