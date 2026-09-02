#!/usr/bin/env node
/**
 * Painel de cadastro de produtos — versao multi-loja.
 *
 * O cliente entra com o proprio login, envia as fotos dos produtos, a IA le
 * cada embalagem e escreve titulo e descricao, ele revisa e aprova, e o painel
 * cadastra tudo no Cardapio.ai. No fim ele recebe o link da loja para divulgar.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const banco = require('./lib/banco');
const sessao = require('./lib/sessao');
const cardapio = require('./lib/cardapio');
const ia = require('./lib/ia');
const { Fila } = require('./lib/fila');

const RAIZ = __dirname;
// Resolvido para caminho absoluto: res.sendFile recusa caminho relativo, e um
// PASTA_DADOS como "./dados" quebraria o envio das fotos em tempo de execucao.
const PASTA_DADOS = path.resolve(RAIZ, process.env.PASTA_DADOS || 'dados');
const PASTA_ENVIOS = path.join(PASTA_DADOS, 'envios');
const PASTA_PERFIS = path.join(PASTA_DADOS, 'perfis');
const PORTA = process.env.PORT || 3000;

const LOTE_IA = 8;
const TAMANHO_MAXIMO = 3 * 1024 * 1024;
const MAXIMO_FOTOS = 60;

const CONFIG_CARDAPIO = {
  baseUrl: 'https://cardapio.ai/painelweb',
  headless: process.env.HEADLESS !== 'false',
  pausaEntreProdutosMs: Number(process.env.PAUSA_MS || 1200),
};

for (const p of [PASTA_DADOS, PASTA_ENVIOS, PASTA_PERFIS]) fs.mkdirSync(p, { recursive: true });

const db = banco.abrir(path.join(PASTA_DADOS, 'painel.db'));
const fila = new Fila();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(RAIZ, 'public')));

const exigirLogin = sessao.exigirLogin(db);

// ------------------------------------------------------------------ uploads

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const pasta = path.join(PASTA_ENVIOS, String(req.loja.id));
      fs.mkdirSync(pasta, { recursive: true });
      cb(null, pasta);
    },
    filename: (req, file, cb) => {
      const seguro = file.originalname.replace(/[^\w.-]/g, '_').slice(-60);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${seguro}`);
    },
  }),
  limits: { fileSize: TAMANHO_MAXIMO, files: MAXIMO_FOTOS },
  fileFilter: (req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('envie apenas imagens JPEG, PNG ou WebP'), ok);
  },
});

function lerCategorias() {
  const caminho = path.join(RAIZ, 'categorias.txt');
  if (!fs.existsSync(caminho)) return [];
  return fs.readFileSync(caminho, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
}

/** Impede que uma loja alcance o arquivo de outra pelo nome do arquivo. */
function caminhoDaFoto(lojaId, arquivo) {
  const pasta = path.join(PASTA_ENVIOS, String(lojaId));
  const destino = path.join(pasta, path.basename(arquivo));
  if (!destino.startsWith(pasta)) throw new Error('caminho invalido');
  return destino;
}

// -------------------------------------------------------------------- login

app.post('/api/login', (req, res) => {
  const { email, senha } = req.body || {};
  const loja = banco.autenticarLoja(db, email, senha || '');
  if (!loja) return res.status(401).json({ erro: 'e-mail ou senha incorretos' });

  sessao.entrar(res, loja);
  res.json({ nome: loja.nome, admin: !!loja.admin });
});

app.post('/api/sair', (req, res) => {
  sessao.sair(res);
  res.json({ ok: true });
});

app.get('/api/eu', exigirLogin, (req, res) => {
  const trabalho = fila.obter(req.loja.id);
  res.json({
    nome: req.loja.nome,
    admin: !!req.loja.admin,
    linkPublico: req.loja.cdp_link || null,
    temCredenciais: !!(req.loja.cdp_email && req.loja.cdp_senha),
    publicando: !!(trabalho && trabalho.ativo),
    temChaveIa: !!process.env.ANTHROPIC_API_KEY,
    categorias: lerCategorias(),
  });
});

// ------------------------------------------------------------------ analise

app.post('/api/analisar', exigirLogin, upload.array('fotos', MAXIMO_FOTOS), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ erro: 'nenhuma foto recebida' });

  const categorias = lerCategorias();
  const imagens = req.files.map((f) => ({ nome: f.originalname, caminho: f.path }));
  const produtos = [];

  for (let i = 0; i < imagens.length; i += LOTE_IA) {
    const lote = imagens.slice(i, i + LOTE_IA);
    try {
      const itens = await ia.descreverImagens(lote, categorias, process.env.ANTHROPIC_API_KEY);
      itens.forEach((item, j) => produtos.push(montarProduto(req.loja.id, lote[j], item)));
    } catch (erro) {
      lote.forEach((imagem) => produtos.push(montarProduto(req.loja.id, imagem, null, erro.message)));
    }
  }

  res.json({ produtos });
});

function montarProduto(lojaId, imagem, item, erroIa) {
  const arquivo = path.basename(imagem.caminho);
  return {
    id: arquivo,
    arquivo: imagem.nome,
    previewUrl: `/api/foto/${encodeURIComponent(arquivo)}`,
    titulo: item ? (item.titulo || '') : '',
    descricao: item ? (item.descricao || '') : '',
    categoria: item ? (item.categoria || '') : '',
    preco: '0',
    aprovado: !!item,
    revisar: !item,
    erroIa: erroIa || null,
  };
}

app.get('/api/foto/:arquivo', exigirLogin, (req, res) => {
  let caminho;
  try {
    caminho = caminhoDaFoto(req.loja.id, req.params.arquivo);
  } catch {
    return res.status(400).end();
  }
  if (!fs.existsSync(caminho)) return res.status(404).end();
  res.sendFile(caminho);
});

// ----------------------------------------------------------------- publicar

function prepararProdutos(lojaId, lista) {
  return lista.map((p) => ({
    ...p,
    caminhoImagem: p.id ? caminhoDaFoto(lojaId, p.id) : null,
  }));
}

app.post('/api/validar', exigirLogin, (req, res) => {
  const produtos = prepararProdutos(req.loja.id, req.body.produtos || []);
  const erros = produtos.flatMap((p, i) => cardapio.validarProduto(p, i));
  res.json({ ok: erros.length === 0, erros });
});

app.post('/api/publicar', exigirLogin, (req, res) => {
  const loja = req.loja;

  if (fila.estaOcupada(loja.id)) {
    return res.status(409).json({ erro: 'ja existe uma publicacao em andamento' });
  }

  let credenciais;
  try {
    credenciais = banco.credenciaisCardapio(loja);
  } catch (erro) {
    return res.status(400).json({ erro: erro.message });
  }

  let produtos;
  try {
    produtos = prepararProdutos(loja.id, (req.body.produtos || []).filter((p) => p.aprovado));
  } catch {
    return res.status(400).json({ erro: 'foto invalida no lote' });
  }

  if (!produtos.length) return res.status(400).json({ erro: 'nenhum produto aprovado' });

  const erros = produtos.flatMap((p, i) => cardapio.validarProduto(p, i));
  if (erros.length) return res.status(400).json({ erro: 'produtos invalidos', erros });

  fila.iniciar(loja.id, produtos.length, async (trabalho) => {
    const { resultados, linkPublico } = await cardapio.publicar({
      produtos,
      config: { ...CONFIG_CARDAPIO, ...credenciais },
      perfil: path.join(PASTA_PERFIS, String(loja.id)),
      pedirCodigoMfa: trabalho.pedirCodigoMfa,
      aoProgredir: trabalho.emitir,
    });

    if (linkPublico) {
      banco.atualizarCredenciais(db, loja.id, { cdpLink: linkPublico });
    }

    const ok = resultados.filter((r) => r.ok).length;
    return { total: resultados.length, ok, falhas: resultados.length - ok, linkPublico };
  });

  res.json({ iniciado: true, total: produtos.length });
});

app.post('/api/mfa', exigirLogin, (req, res) => {
  const trabalho = fila.obter(req.loja.id);
  if (!trabalho || !trabalho.responderMfa(String(req.body.codigo || '').trim())) {
    return res.status(400).json({ erro: 'nenhum codigo sendo aguardado' });
  }
  res.json({ ok: true });
});

app.get('/api/eventos', exigirLogin, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const trabalho = fila.obter(req.loja.id);
  if (!trabalho) {
    res.write(`data: ${JSON.stringify({ tipo: 'ocioso' })}\n\n`);
    return res.end();
  }

  trabalho.eventos.forEach((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
  if (!trabalho.ativo) return res.end();

  trabalho.ouvintes.push(res);
  req.on('close', () => {
    trabalho.ouvintes = trabalho.ouvintes.filter((o) => o !== res);
  });
});

// ---------------------------------------------------------- leads da landing

// Rota publica: e o formulario da pagina de captacao. Sem sessao, entao tem
// limite por IP para nao virar deposito de spam.
const ULTIMO_LEAD = new Map();
const INTERVALO_LEAD_MS = 20 * 1000;

app.post('/api/lead', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'desconhecido';
  const agora = Date.now();

  if (agora - (ULTIMO_LEAD.get(ip) || 0) < INTERVALO_LEAD_MS) {
    return res.status(429).json({ erro: 'aguarde um instante antes de enviar de novo' });
  }

  const texto = (v, max) => String(v || '').trim().slice(0, max);
  const nome = texto(req.body.nome, 120);
  const whatsapp = texto(req.body.whatsapp, 40);
  const loja = texto(req.body.loja, 160);

  if (!nome || !whatsapp) return res.status(400).json({ erro: 'informe o nome e o WhatsApp' });
  if (whatsapp.replace(/\D/g, '').length < 10) return res.status(400).json({ erro: 'confira o numero do WhatsApp' });

  ULTIMO_LEAD.set(ip, agora);
  db.prepare('INSERT INTO leads (nome, whatsapp, loja, origem) VALUES (?, ?, ?, ?)')
    .run(nome, whatsapp, loja || null, texto(req.headers.referer, 200) || null);

  res.json({ ok: true });
});

app.get('/api/admin/leads', exigirLogin, sessao.exigirAdmin, (req, res) => {
  res.json({ leads: db.prepare('SELECT * FROM leads ORDER BY criado_em DESC LIMIT 500').all() });
});

// --------------------------------------------------------------------- admin

app.get('/api/admin/lojas', exigirLogin, sessao.exigirAdmin, (req, res) => {
  const lojas = db.prepare(`
    SELECT id, nome, email, admin, cdp_email, cdp_link, criada_em,
           (cdp_senha IS NOT NULL) AS tem_senha
    FROM lojas ORDER BY criada_em DESC
  `).all();
  res.json({ lojas: lojas.map((l) => ({ ...l, publicando: fila.estaOcupada(l.id) })) });
});

app.post('/api/admin/lojas', exigirLogin, sessao.exigirAdmin, (req, res) => {
  const { nome, email, senha, cdpEmail, cdpSenha, cdpLink } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'nome, e-mail e senha sao obrigatorios' });
  if (String(senha).length < 8) return res.status(400).json({ erro: 'a senha precisa de ao menos 8 caracteres' });

  try {
    const id = banco.criarLoja(db, { nome, email, senha, cdpEmail, cdpSenha, cdpLink });
    res.json({ id });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

app.put('/api/admin/lojas/:id', exigirLogin, sessao.exigirAdmin, (req, res) => {
  const alvo = db.prepare('SELECT id FROM lojas WHERE id = ?').get(req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'loja nao encontrada' });

  const { cdpEmail, cdpSenha, cdpLink } = req.body || {};
  banco.atualizarCredenciais(db, alvo.id, { cdpEmail, cdpSenha, cdpLink });
  res.json({ ok: true });
});

app.delete('/api/admin/lojas/:id', exigirLogin, sessao.exigirAdmin, (req, res) => {
  if (Number(req.params.id) === req.loja.id) {
    return res.status(400).json({ erro: 'nao da para excluir a propria conta' });
  }
  db.prepare('DELETE FROM lojas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------- erros

app.use((erro, req, res, next) => {
  if (erro && erro.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ erro: 'cada foto precisa ter no maximo 3MB' });
  }
  if (erro && erro.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ erro: `envie no maximo ${MAXIMO_FOTOS} fotos por vez` });
  }
  if (erro) return res.status(400).json({ erro: erro.message });
  next();
});

// -------------------------------------------------------------------- start

function conferirAmbiente() {
  const faltando = ['CHAVE_SESSAO', 'CHAVE_CRIPTO'].filter((v) => !process.env[v] || process.env[v].length < 32);
  if (faltando.length) {
    console.error(`\n  Faltam variaveis de ambiente: ${faltando.join(', ')}`);
    console.error('  Cada uma precisa de pelo menos 32 caracteres. Gere com:');
    console.error('    node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
    process.exit(1);
  }
}

conferirAmbiente();

// Primeira execucao: cria o administrador a partir do ambiente.
const totalLojas = db.prepare('SELECT COUNT(*) AS n FROM lojas').get().n;
if (totalLojas === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_SENHA) {
  banco.criarLoja(db, {
    nome: 'Administrador',
    email: process.env.ADMIN_EMAIL,
    senha: process.env.ADMIN_SENHA,
    admin: 1,
  });
  console.log(`  administrador criado: ${process.env.ADMIN_EMAIL}`);
}

app.listen(PORTA, () => {
  console.log(`\n  Painel de produtos  ->  http://localhost:${PORTA}`);
  console.log(`  dados em ${PASTA_DADOS}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log('  aviso: ANTHROPIC_API_KEY ausente, a leitura das fotos vai falhar');
  if (db.prepare('SELECT COUNT(*) AS n FROM lojas').get().n === 0) {
    console.log('  aviso: nenhuma conta cadastrada. Defina ADMIN_EMAIL e ADMIN_SENHA e reinicie.');
  }
  console.log('');
});
