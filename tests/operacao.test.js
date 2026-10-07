const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const banco = require('../lib/banco');
const operacao = require('../lib/operacao');

let processo, raiz, endereco, cookieAdmin, cookieA, cookieB, atendenteA, clienteA;
const senha = 'Senha-teste-2026';
async function chamar(url, { cookie, method = 'GET', body } = {}) {
  const r = await fetch(endereco + url, { method, headers: {
    'content-type': 'application/json', ...(cookie ? {cookie} : {}),
  }, ...(body ? {body:JSON.stringify(body)} : {}) });
  return { status:r.status, dados:await r.json(), cookie:r.headers.get('set-cookie')?.split(';')[0] };
}
async function login(email) {
  const r = await chamar('/api/login', {method:'POST', body:{email,senha}});
  assert.equal(r.status, 200); return r.cookie;
}

before(async () => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-operacao-test-'));
  const servidorPorta = net.createServer();
  await new Promise(resolve => servidorPorta.listen(0,'127.0.0.1',resolve));
  const porta = servidorPorta.address().port;
  await new Promise(resolve => servidorPorta.close(resolve));
  endereco = `http://127.0.0.1:${porta}`;
  processo = spawn(process.execPath, ['servidor.js'], {
    cwd:path.resolve(__dirname,'..'), windowsHide:true,
    env:{...process.env, PORT:String(porta), PASTA_DADOS:raiz,
      CHAVE_SESSAO:crypto.randomBytes(32).toString('hex'), CHAVE_CRIPTO:crypto.randomBytes(32).toString('hex'),
      ADMIN_EMAIL:'admin@teste.local', ADMIN_SENHA:senha}, stdio:['ignore','pipe','pipe'],
  });
  await new Promise((resolve,reject) => {
    let saida = '';
    const tempo = setTimeout(() => reject(new Error('Servidor não iniciou: ' + saida)),15000);
    processo.stdout.on('data', b => { saida += b; if (saida.includes('Painel de produtos')) {clearTimeout(tempo);resolve();} });
    processo.stderr.on('data', b => {saida += b;});
    processo.once('error',e => {clearTimeout(tempo);reject(e);});
    processo.once('exit',code => {if (code) {clearTimeout(tempo);reject(new Error(saida));}});
  });
  cookieAdmin = await login('admin@teste.local');
  for (const [nome,email] of [['Atendente A','a@teste.local'],['Atendente B','b@teste.local']]) {
    const r = await chamar('/api/operacao/atendentes', {cookie:cookieAdmin,method:'POST',body:{nome,email,senha}});
    assert.equal(r.status,201);
    if (nome.endsWith('A')) atendenteA = r.dados.id;
  }
  cookieA = await login('a@teste.local'); cookieB = await login('b@teste.local');
});

after(async () => {
  if (processo && processo.exitCode === null) {
    const fim = new Promise(resolve => processo.once('exit', resolve));
    processo.kill(); await fim;
  }
  if (raiz) fs.rmSync(raiz,{recursive:true,force:true});
});

test('migra banco existente e preserva contas, credenciais e vinculos', () => {
  const arquivo = path.join(raiz,'migracao.db');
  const Database = require('better-sqlite3');
  const antigo = new Database(arquivo);
  antigo.exec(`CREATE TABLE lojas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE, senha_hash TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0,
    cdp_email TEXT, cdp_senha TEXT, cdp_link TEXT, criada_em TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO lojas(nome,email,senha_hash,cdp_email,cdp_senha) VALUES('Antiga','antiga@teste.local','hash','cdp@teste.local','cifrado');`);
  antigo.close();
  const db = banco.abrir(arquivo);
  const loja = db.prepare('SELECT * FROM lojas').get();
  assert.equal(loja.nome,'Antiga'); assert.equal(loja.cdp_senha,'cifrado'); assert.equal(loja.papel,'cliente');
  assert.equal(loja.atendente_id,null); assert.equal(loja.produtos_contratados,25);
  operacao.migrar(db); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lojas').get().n,1);
  db.close();
});

test('administrador cadastra cliente e calcula metade sem incluir plano da plataforma', async () => {
  const r = await chamar('/api/operacao/clientes',{cookie:cookieAdmin,method:'POST',body:{
    nome:'Loja A',email:'lojaa@teste.local',senha,atendente_id:atendenteA,whatsapp:'(11) 99999-0000',
    vencimento:'2026-10-15',produtos_contratados:40,suporte_centavos:18000,plano_centavos:9990,
  }});
  assert.equal(r.status,201); clienteA = r.dados.id;
  const lista = await chamar('/api/operacao',{cookie:cookieAdmin});
  const loja = lista.dados.clientes.find(c => c.id === clienteA);
  assert.equal(loja.servico_centavos,44500); assert.equal(loja.parte_atendente_centavos,22250);
  assert.equal(loja.suporte_atendente_centavos,9000); assert.equal(loja.plano_centavos,9990);
  assert.equal(loja.whatsapp,'11999990000');
});

test('atendente ve somente sua carteira, sem senhas ou configuracoes', async () => {
  const a = await chamar('/api/operacao',{cookie:cookieA});
  const b = await chamar('/api/operacao',{cookie:cookieB});
  assert.equal(a.status,200); assert.equal(a.dados.clientes.length,1);
  assert.equal(a.dados.clientes[0].id,clienteA); assert.equal(b.dados.clientes.length,0);
  assert.deepEqual(a.dados.atendentes,[]);
  for (const campo of ['senha_hash','cdp_email','cdp_senha']) assert.equal(campo in a.dados.clientes[0],false);
  assert.equal((await chamar('/api/eu',{cookie:cookieA})).dados.papel,'atendente');
});

test('bloqueia alteracoes e acesso a produtos ou admin pelo atendente', async () => {
  for (const [url,method,body] of [
    ['/api/operacao/clientes/' + clienteA,'PUT',{vencimento:'2026-12-01'}],
    ['/api/operacao/atendentes','POST',{nome:'Intruso',email:'intruso@teste.local',senha}],
    ['/api/operacao/clientes','POST',{nome:'Intruso',email:'intruso@teste.local',senha}],
    ['/api/admin/lojas','GET'],['/api/admin/ia','GET'],['/api/analisar','POST'],
    ['/api/lote','GET'],['/api/publicar','POST'],['/api/foto/qualquer.png','GET'],
  ]) assert.equal((await chamar(url,{cookie:cookieA,method,body})).status,403,url);
  assert.equal((await chamar('/api/operacao')).status,401);
  const cliente = await login('lojaa@teste.local');
  assert.equal((await chamar('/api/operacao',{cookie:cliente})).status,403);
  assert.equal((await chamar('/api/lote',{cookie:cliente})).status,200);
});

test('rejeita datas impossiveis, valores invalidos e responsaveis indevidos', async () => {
  for (const body of [{vencimento:'2026-02-30'},{vencimento:'15/10/2026'},
    {atendente_id:clienteA},{atendente_id:999999},{atendente_id:'1'},
    {suporte_centavos:-1},{plano_centavos:1.5},{produtos_contratados:'40'},
    {whatsapp:'123'},{etapa:'qualquer'}]) {
    assert.equal((await chamar('/api/operacao/clientes/' + clienteA,{cookie:cookieAdmin,method:'PUT',body})).status,400);
  }
  assert.equal((await chamar('/api/operacao/clientes/' + clienteA,{cookie:cookieAdmin,method:'PUT',body:{vencimento:'2028-02-29'}})).status,200);
});

test('transferencia atualiza acesso imediatamente e desvinculacao zera previsao', async () => {
  const lista = await chamar('/api/operacao',{cookie:cookieAdmin});
  const outro = lista.dados.atendentes.find(a => a.id !== atendenteA).id;
  await chamar('/api/operacao/clientes/' + clienteA,{cookie:cookieAdmin,method:'PUT',body:{atendente_id:outro}});
  assert.equal((await chamar('/api/operacao',{cookie:cookieA})).dados.clientes.length,0);
  assert.equal((await chamar('/api/operacao',{cookie:cookieB})).dados.clientes.length,1);
  await chamar('/api/operacao/clientes/' + clienteA,{cookie:cookieAdmin,method:'PUT',body:{atendente_id:null,vencimento:null}});
  const cliente = (await chamar('/api/operacao',{cookie:cookieAdmin})).dados.clientes[0];
  assert.equal(cliente.parte_atendente_centavos,0); assert.equal(cliente.suporte_atendente_centavos,0); assert.equal(cliente.vencimento,null);
  const sair = await chamar('/api/sair',{cookie:cookieA,method:'POST'}); assert.equal(sair.status,200);
});
