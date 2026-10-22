function migrar(db) {
  const colunas = db.prepare('PRAGMA table_info(lojas)').all().map(c => c.name);
  for (const [nome,tipo] of Object.entries({ativo:'INTEGER NOT NULL DEFAULT 1',sessao_versao:'INTEGER NOT NULL DEFAULT 0',contato:"TEXT NOT NULL DEFAULT ''",observacoes:"TEXT NOT NULL DEFAULT ''"})) {
    if (!colunas.includes(nome)) db.exec(`ALTER TABLE lojas ADD COLUMN ${nome} ${tipo}`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS contratos (
      id INTEGER PRIMARY KEY, loja_id INTEGER NOT NULL REFERENCES lojas(id),
      tipo TEXT NOT NULL CHECK(tipo IN ('suporte','plano')), valor INTEGER NOT NULL CHECK(valor>0),
      inicio TEXT NOT NULL, dia INTEGER NOT NULL CHECK(dia BETWEEN 1 AND 31), ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS contrato_ativo ON contratos(loja_id,tipo) WHERE ativo=1;
    CREATE TABLE IF NOT EXISTS cobrancas (
      id INTEGER PRIMARY KEY, loja_id INTEGER NOT NULL REFERENCES lojas(id),
      atendente_id INTEGER REFERENCES lojas(id), contrato_id INTEGER REFERENCES contratos(id),
      tipo TEXT NOT NULL CHECK(tipo IN ('implantacao','produtos','suporte','plano','outro')),
      descricao TEXT NOT NULL, valor INTEGER NOT NULL CHECK(valor>0), vencimento TEXT NOT NULL,
      competencia TEXT, custo_previsto INTEGER NOT NULL DEFAULT 0 CHECK(custo_previsto>=0),
      custos_fechados INTEGER NOT NULL DEFAULT 0, cancelada INTEGER NOT NULL DEFAULT 0,
      enviada_em TEXT, criada_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(contrato_id,competencia)
    );
    CREATE TABLE IF NOT EXISTS movimentos (
      id INTEGER PRIMARY KEY, cobranca_id INTEGER REFERENCES cobrancas(id),
      tipo TEXT NOT NULL CHECK(tipo IN ('recebimento','despesa','plataforma','repasse','estorno')),
      valor INTEGER NOT NULL CHECK(valor>0), data TEXT NOT NULL, descricao TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT '', atendente_id INTEGER REFERENCES lojas(id),
      autor_id INTEGER NOT NULL REFERENCES lojas(id), estorno_de INTEGER UNIQUE REFERENCES movimentos(id),
      pedido TEXT NOT NULL UNIQUE, criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS rateios (
      movimento_id INTEGER NOT NULL REFERENCES movimentos(id), cobranca_id INTEGER NOT NULL REFERENCES cobrancas(id),
      valor INTEGER NOT NULL CHECK(valor>0), PRIMARY KEY(movimento_id,cobranca_id)
    );
    CREATE TABLE IF NOT EXISTS comprovantes (
      id INTEGER PRIMARY KEY, movimento_id INTEGER NOT NULL REFERENCES movimentos(id), arquivo TEXT NOT NULL,
      nome TEXT NOT NULL, criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tarefas (
      id INTEGER PRIMARY KEY, loja_id INTEGER NOT NULL REFERENCES lojas(id), responsavel_id INTEGER REFERENCES lojas(id),
      tipo TEXT NOT NULL CHECK(tipo IN ('implantacao','suporte','tarefa')), titulo TEXT NOT NULL,
      descricao TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'pendente', prioridade TEXT NOT NULL DEFAULT 'normal',
      prazo TEXT, solucao TEXT NOT NULL DEFAULT '', minutos INTEGER NOT NULL DEFAULT 0,
      criada_em TEXT NOT NULL DEFAULT (datetime('now')), atualizada_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS implantacoes (
      loja_id INTEGER PRIMARY KEY REFERENCES lojas(id), etapa TEXT NOT NULL DEFAULT 'dados',
      prazo TEXT, pendencia TEXT NOT NULL DEFAULT '', atualizada_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS onboarding (
      loja_id INTEGER NOT NULL REFERENCES lojas(id), passo TEXT NOT NULL,
      concluido INTEGER NOT NULL DEFAULT 0 CHECK(concluido IN (0,1)),
      atualizado_por INTEGER NOT NULL REFERENCES lojas(id),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(loja_id,passo)
    );
    CREATE TABLE IF NOT EXISTS materiais (
      id INTEGER PRIMARY KEY, loja_id INTEGER NOT NULL REFERENCES lojas(id), arquivo TEXT NOT NULL,
      nome TEXT NOT NULL, tipo TEXT NOT NULL, finalidade TEXT NOT NULL DEFAULT 'produto', titulo TEXT NOT NULL DEFAULT '', preco TEXT NOT NULL DEFAULT '',
      unidade TEXT NOT NULL DEFAULT '', categoria TEXT NOT NULL DEFAULT '', observacoes TEXT NOT NULL DEFAULT '',
      item_arquivo TEXT, autor_id INTEGER NOT NULL REFERENCES lojas(id), criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS respostas (
      id INTEGER PRIMARY KEY, titulo TEXT NOT NULL, texto TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY, autor_id INTEGER REFERENCES lojas(id), acao TEXT NOT NULL,
      loja_id INTEGER REFERENCES lojas(id), detalhes TEXT NOT NULL DEFAULT '{}', criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pedidos_gestao (
      chave TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, resultado TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cobrancas_loja ON cobrancas(loja_id,vencimento);
    CREATE INDEX IF NOT EXISTS movimentos_cobranca ON movimentos(cobranca_id,data);
    CREATE INDEX IF NOT EXISTS tarefas_loja ON tarefas(loja_id,estado);
    CREATE INDEX IF NOT EXISTS materiais_loja ON materiais(loja_id);
  `);
  if(!db.prepare('PRAGMA table_info(materiais)').all().some(c=>c.name==='finalidade'))db.exec("ALTER TABLE materiais ADD COLUMN finalidade TEXT NOT NULL DEFAULT 'produto'");
  // Itens do "confira antes de marcar" de cada etapa, guardados como lista JSON de indices.
  // Cofre de logins: e-mail da loja (Proton) com senha cifrada, e quem da equipe pode ver senhas.
  const colunasLoja=db.prepare('PRAGMA table_info(lojas)').all().map(c=>c.name);
  for(const [nome,tipo] of [['mail_email','TEXT'],['mail_senha','TEXT'],['ver_senhas','INTEGER NOT NULL DEFAULT 0']])
    if(!colunasLoja.includes(nome))db.exec(`ALTER TABLE lojas ADD COLUMN ${nome} ${tipo}`);
  // Sessoes do app desktop: so o hash do token fica no banco.
  db.exec(`CREATE TABLE IF NOT EXISTS sessoes_app (
    id INTEGER PRIMARY KEY, conta_id INTEGER NOT NULL REFERENCES lojas(id), token_hash TEXT NOT NULL UNIQUE,
    dispositivo TEXT NOT NULL DEFAULT '', versao INTEGER NOT NULL DEFAULT 0, revogado INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')), usado_em TEXT)`);
  // Suporte e plano criados juntos num contrato mensal unico compartilham o mesmo grupo.
  if(!db.prepare('PRAGMA table_info(contratos)').all().some(c=>c.name==='grupo'))db.exec('ALTER TABLE contratos ADD COLUMN grupo TEXT');
  // Pix de renovacao do plano gerado no Cardapio.ai, guardado na cobranca do plano ate ser pago.
  const colunasCobranca=db.prepare('PRAGMA table_info(cobrancas)').all().map(c=>c.name);
  for(const [nome,tipo] of [['pix_codigo','TEXT'],['pix_qr','TEXT'],['pix_valor','INTEGER'],['pix_competencia','TEXT'],['pix_gerado_em','TEXT']])
    if(!colunasCobranca.includes(nome))db.exec(`ALTER TABLE cobrancas ADD COLUMN ${nome} ${tipo}`);
  if(!db.prepare('PRAGMA table_info(onboarding)').all().some(c=>c.name==='itens'))db.exec("ALTER TABLE onboarding ADD COLUMN itens TEXT NOT NULL DEFAULT '[]'");
}

function auditar(db,usuario,acao,lojaId,detalhes={}) {
  db.prepare('INSERT INTO auditoria(autor_id,acao,loja_id,detalhes) VALUES(?,?,?,?)')
    .run(usuario?.id || null,acao,lojaId || null,JSON.stringify(detalhes));
}

module.exports = { migrar,auditar };
