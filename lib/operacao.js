/** Carteira da equipe, vencimentos e previsao de divisao do servico. */
function migrar(db) {
  const colunas = db.prepare('PRAGMA table_info(lojas)').all().map(c => c.name);
  const novas = {
    papel: "TEXT NOT NULL DEFAULT 'cliente'",
    atendente_id: 'INTEGER REFERENCES lojas(id) ON DELETE SET NULL',
    whatsapp: "TEXT NOT NULL DEFAULT ''",
    vencimento: 'TEXT',
    produtos_contratados: 'INTEGER NOT NULL DEFAULT 25',
    implantacao_centavos: 'INTEGER NOT NULL DEFAULT 40000',
    adicional_centavos: 'INTEGER NOT NULL DEFAULT 300',
    suporte_centavos: 'INTEGER NOT NULL DEFAULT 0',
    plano_centavos: 'INTEGER NOT NULL DEFAULT 0',
    etapa: "TEXT NOT NULL DEFAULT 'implantacao'",
  };
  db.transaction(() => {
    for (const [nome, tipo] of Object.entries(novas)) {
      if (!colunas.includes(nome)) db.exec(`ALTER TABLE lojas ADD COLUMN ${nome} ${tipo}`);
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_lojas_atendente ON lojas(atendente_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_lojas_vencimento ON lojas(vencimento)');
  })();
}

function hoje() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const valor = tipo => partes.find(p => p.type === tipo).value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

function validarData(valor) {
  if (valor === null || valor === '') return null;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error('informe uma data de vencimento valida');
  const data = new Date(`${valor}T12:00:00Z`);
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor || Number(valor.slice(0, 4)) < 2000) {
    throw new Error('informe uma data de vencimento valida');
  }
  return valor;
}

function validar(db, entrada) {
  const saida = {};
  if (entrada.atendente_id !== undefined) {
    const id = entrada.atendente_id;
    if (id === null || id === '') saida.atendente_id = null;
    else {
      if (!Number.isSafeInteger(id) || id < 1 || !db.prepare("SELECT id FROM lojas WHERE id = ? AND papel = 'atendente' AND admin = 0 AND ativo=1").get(id)) {
        throw new Error('selecione um atendente valido');
      }
      saida.atendente_id = id;
    }
  }
  if (entrada.whatsapp !== undefined) {
    if (typeof entrada.whatsapp !== 'string') throw new Error('WhatsApp invalido');
    const numero = entrada.whatsapp.replace(/\D/g, '');
    if (numero && (numero.length < 10 || numero.length > 15)) throw new Error('WhatsApp invalido');
    saida.whatsapp = numero;
  }
  if (entrada.vencimento !== undefined) saida.vencimento = validarData(entrada.vencimento);
  if (entrada.etapa !== undefined) {
    if (!['implantacao', 'ativa', 'pausada'].includes(entrada.etapa)) throw new Error('etapa invalida');
    saida.etapa = entrada.etapa;
  }
  for (const campo of ['produtos_contratados', 'implantacao_centavos', 'adicional_centavos', 'suporte_centavos', 'plano_centavos']) {
    if (entrada[campo] === undefined) continue;
    const maximo = campo === 'produtos_contratados' ? 100000 : 100000000;
    if (!Number.isSafeInteger(entrada[campo]) || entrada[campo] < 0 || entrada[campo] > maximo) throw new Error(`valor invalido: ${campo}`);
    saida[campo] = entrada[campo];
  }
  return saida;
}

function salvar(db, id, campos) {
  const chaves = Object.keys(campos);
  if (chaves.length) db.prepare(`UPDATE lojas SET ${chaves.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
    .run(...chaves.map(c => campos[c]), id);
  if(campos.etapa==='pausada')db.prepare('UPDATE contratos SET ativo=0 WHERE loja_id=?').run(id);
}

function listar(db, usuario) {
  const clientes = db.prepare(`
    SELECT l.id, l.nome, l.email, l.whatsapp, l.cdp_link, l.atendente_id,
      a.nome AS atendente_nome, l.vencimento, l.etapa, l.produtos_contratados,
      l.implantacao_centavos, l.adicional_centavos, l.suporte_centavos, l.plano_centavos
    FROM lojas l LEFT JOIN lojas a ON a.id = l.atendente_id
    WHERE l.admin = 0 AND l.papel = 'cliente' AND l.ativo=1 ${usuario.admin ? '' : 'AND l.atendente_id = ?'}
    ORDER BY l.vencimento IS NULL, l.vencimento, l.nome
  `).all(...(usuario.admin ? [] : [usuario.id]));
  return clientes.map(c => {
    const servico = c.implantacao_centavos + Math.max(0, c.produtos_contratados - 25) * c.adicional_centavos;
    return { ...c, servico_centavos: servico,
      parte_atendente_centavos: c.atendente_id ? Math.floor(servico / 2) : 0,
      suporte_atendente_centavos: c.atendente_id ? Math.floor(c.suporte_centavos / 2) : 0 };
  });
}

function montarRotas(app, { db, banco, exigirLogin, exigirAdmin }) {
  const equipe = (req, res, next) => {
    if (!req.loja.admin && req.loja.papel !== 'atendente') return res.status(403).json({ erro: 'acesso restrito a equipe' });
    next();
  };
  app.get('/api/operacao', exigirLogin, equipe, (req, res) => {
    res.json({ hoje: hoje(), clientes: listar(db, req.loja), atendentes: req.loja.admin
      ? db.prepare("SELECT id, nome, email FROM lojas WHERE papel = 'atendente' AND admin = 0 ORDER BY nome").all() : [] });
  });
  app.post('/api/operacao/atendentes', exigirLogin, exigirAdmin, (req, res) => {
    const { nome, email, senha } = req.body || {};
    if (typeof nome !== 'string' || !nome.trim() || nome.length > 120 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof senha !== 'string' || senha.length < 8 || senha.length > 200) {
      return res.status(400).json({ erro: 'informe nome, e-mail valido e senha de 8 a 200 caracteres' });
    }
    try {
      const id = db.transaction(() => {
        const novo = banco.criarLoja(db, { nome: nome.trim(), email: email.trim(), senha });
        db.prepare("UPDATE lojas SET papel = 'atendente' WHERE id = ?").run(novo);
        return novo;
      })();
      res.status(201).json({ id });
    } catch (erro) { res.status(400).json({ erro: erro.message }); }
  });
  app.post('/api/operacao/clientes', exigirLogin, exigirAdmin, (req, res) => {
    const { nome, email, senha } = req.body || {};
    if (typeof nome !== 'string' || !nome.trim() || nome.length > 120 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof senha !== 'string' || senha.length < 8 || senha.length > 200) {
      return res.status(400).json({ erro: 'informe nome, e-mail valido e senha de 8 a 200 caracteres' });
    }
    try {
      const campos = validar(db, req.body);
      const id = db.transaction(() => {
        const novo = banco.criarLoja(db, { nome: nome.trim(), email: email.trim(), senha });
        salvar(db, novo, campos);
        return novo;
      })();
      res.status(201).json({ id });
    } catch (erro) { res.status(400).json({ erro: erro.message }); }
  });
  app.put('/api/operacao/clientes/:id', exigirLogin, exigirAdmin, (req, res) => {
    const alvo = db.prepare("SELECT id FROM lojas WHERE id = ? AND admin = 0 AND papel = 'cliente'").get(req.params.id);
    if (!alvo) return res.status(404).json({ erro: 'cliente nao encontrado' });
    try { salvar(db, alvo.id, validar(db, req.body || {})); res.json({ ok: true }); }
    catch (erro) { res.status(400).json({ erro: erro.message }); }
  });
}

module.exports = { migrar, hoje, validarData, validar, salvar, listar, montarRotas };
