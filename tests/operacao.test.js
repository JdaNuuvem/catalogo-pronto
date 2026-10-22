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
    ['/api/admin/ia','GET'],['/api/admin/leads','GET'],['/api/admin/pix-operacao','GET'],['/api/analisar','POST'],
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

test('gestao isola fichas, produtos, tarefas e movimentos financeiros por permissao',async()=>{
  await chamar('/api/operacao/clientes/'+clienteA,{cookie:cookieAdmin,method:'PUT',body:{atendente_id:atendenteA}});
  assert.equal((await chamar('/api/gestao',{cookie:cookieA})).status,200);
  assert.equal((await chamar('/api/gestao/clientes/'+clienteA,{cookie:cookieB})).status,400);
  assert.equal((await chamar('/api/lojas/'+clienteA+'/lote',{cookie:cookieA})).status,200);
  assert.equal((await chamar('/api/lojas/'+clienteA+'/lote',{cookie:cookieB})).status,403);
  assert.notEqual((await chamar('/api/lojas/'+clienteA+'/publicar',{cookie:cookieA,method:'POST',body:{produtos:[]}})).status,403);
  assert.equal((await chamar('/api/gestao/cobrancas',{cookie:cookieA,method:'POST',body:{}})).status,403);
  const t=await chamar('/api/gestao/tarefas',{cookie:cookieA,method:'POST',body:{loja_id:clienteA,tipo:'suporte',titulo:'Configurar impressora',estado:'pendente',prioridade:'normal',minutos:0}});
  assert.equal(t.status,200);
  assert.equal((await chamar('/api/gestao/tarefas/'+t.dados.id,{cookie:cookieB,method:'PUT',body:{estado:'concluida'}})).status,400);
  const c=await chamar('/api/gestao/cobrancas',{cookie:cookieAdmin,method:'POST',body:{loja_id:clienteA,tipo:'implantacao',descricao:'Implantacao',valor:44500,vencimento:'2026-10-15',pedido:crypto.randomUUID()}});
  assert.equal(c.status,200);
  const m=await chamar('/api/gestao/movimentos',{cookie:cookieAdmin,method:'POST',body:{cobranca_id:c.dados.id,tipo:'recebimento',valor:10000,data:'2026-10-07',descricao:'Entrada',pedido:crypto.randomUUID()}});
  assert.equal(m.status,200);
  const form=new FormData();form.append('arquivo',new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}),'recibo.pdf');
  const upload=await fetch(endereco+`/api/gestao/movimentos/${m.dados.id}/comprovantes`,{method:'POST',headers:{cookie:cookieAdmin},body:form});assert.equal(upload.status,200);
  const comprovante=await upload.json();
  assert.equal((await fetch(endereco+'/api/gestao/comprovantes/'+comprovante.id,{headers:{cookie:cookieA}})).status,403);
  assert.equal((await fetch(endereco+'/api/gestao/comprovantes/'+comprovante.id,{headers:{cookie:cookieAdmin}})).status,200);
  assert.equal((await chamar('/api/admin/lojas/'+clienteA,{cookie:cookieAdmin,method:'DELETE'})).status,409);
  assert.equal((await chamar('/api/gestao/backups',{cookie:cookieA})).status,403);
});

test('onboarding salva por loja, respeita responsabilidades e nao altera recebimentos ou publicacao',async()=>{
  const url='/api/gestao/clientes/'+clienteA+'/onboarding';
  assert.equal((await chamar(url)).status,401);
  assert.equal((await chamar(url,{cookie:cookieA})).status,200);
  assert.equal((await chamar(url,{cookie:cookieB})).status,400);
  const cliente=await login('lojaa@teste.local');assert.equal((await chamar(url,{cookie:cliente})).status,403);
  const antes=(await chamar('/api/gestao',{cookie:cookieAdmin})).dados;
  const primeiro=await chamar(url,{cookie:cookieA,method:'PUT',body:{passo:'materiais',concluido:true}});assert.equal(primeiro.status,200);
  assert.equal(primeiro.dados.etapas.find(e=>e.passo==='materiais').concluido,1);
  assert.equal((await chamar(url,{cookie:cookieB,method:'PUT',body:{passo:'materiais',concluido:true}})).status,400);
  assert.equal((await chamar(url,{cookie:cookieA,method:'PUT',body:{passo:'mensalidades',concluido:true}})).status,403);
  assert.equal((await chamar(url,{cookie:cookieAdmin,method:'PUT',body:{passo:'mensalidades',concluido:true}})).status,200);
  assert.equal((await chamar(url,{cookie:cookieAdmin,method:'PUT',body:{passo:'desconhecido',concluido:true}})).status,400);
  assert.equal((await chamar(url,{cookie:cookieAdmin,method:'PUT',body:{passo:'cadastro',concluido:'sim'}})).status,400);
  const salvo=await chamar(url,{cookie:cookieAdmin});assert.equal(salvo.dados.etapas.filter(e=>e.concluido).length,2);
  const retry=await chamar(url,{cookie:cookieA,method:'PUT',body:{passo:'materiais',concluido:true}});assert.deepEqual(retry.dados.etapas,salvo.dados.etapas);
  await chamar(url,{cookie:cookieA,method:'PUT',body:{passo:'materiais',concluido:false}});
  assert.equal((await chamar(url,{cookie:cookieA})).dados.etapas.find(e=>e.passo==='materiais').concluido,0);
  const depois=(await chamar('/api/gestao',{cookie:cookieAdmin})).dados;
  assert.deepEqual(depois.movimentos,antes.movimentos);assert.deepEqual(depois.cobrancas,antes.cobrancas);
  assert.equal((await chamar('/api/lojas/'+clienteA+'/lote',{cookie:cookieAdmin})).dados.lote,null);
});

test('checklist do onboarding salva cada item, respeita responsabilidades e reabre a etapa ao desmarcar',async()=>{
  const url='/api/gestao/clientes/'+clienteA+'/onboarding';
  const item=(cookie,passo,indice,marcado)=>chamar(url,{cookie,method:'PUT',body:{passo,item:indice,marcado}});
  const etapa=(r,passo)=>r.dados.etapas.find(e=>e.passo===passo);
  const primeiro=await item(cookieA,'entrega',0,true);assert.equal(primeiro.status,200);
  assert.deepEqual(etapa(primeiro,'entrega').itens,[0]);assert.equal(etapa(primeiro,'entrega').concluido,0);
  assert.equal((await item(cookieA,'repasse',0,true)).status,403);
  assert.equal((await item(cookieB,'entrega',1,true)).status,400);
  assert.equal((await item(cookieAdmin,'entrega',2,true)).status,400);
  assert.equal((await item(cookieAdmin,'entrega','1',true)).status,400);
  assert.equal((await item(cookieAdmin,'entrega',1,'sim')).status,400);
  const conferida=await chamar(url,{cookie:cookieA,method:'PUT',body:{passo:'entrega',concluido:true}});
  assert.deepEqual(etapa(conferida,'entrega').itens,[0,1]);assert.equal(etapa(conferida,'entrega').concluido,1);
  const desmarcada=await item(cookieA,'entrega',1,false);
  assert.deepEqual(etapa(desmarcada,'entrega').itens,[0]);assert.equal(etapa(desmarcada,'entrega').concluido,0);
  const carteira=(await chamar('/api/gestao',{cookie:cookieA})).dados.clientes.find(c=>c.id===clienteA);
  assert.deepEqual(carteira.onboarding_feitos,['mensalidades']);
});

test('prazo e pendencia dispensam a etapa manual e a entrega conferida no roteiro ativa a loja',async()=>{
  const nova=await chamar('/api/operacao/clientes',{cookie:cookieAdmin,method:'POST',body:{
    nome:'Loja Roteiro',email:'roteiro@teste.local',senha,atendente_id:atendenteA,produtos_contratados:25}});
  assert.equal(nova.status,201);const id=nova.dados.id;
  const loja=async()=>(await chamar('/api/gestao',{cookie:cookieA})).dados.clientes.find(c=>c.id===id);
  const salvo=await chamar('/api/gestao/implantacoes/'+id,{cookie:cookieA,method:'PUT',body:{prazo:'2026-11-30',pendencia:'Aguardando logo'}});
  assert.equal(salvo.status,200);
  let c=await loja();assert.equal(c.implantacao_prazo,'2026-11-30');assert.equal(c.pendencia,'Aguardando logo');assert.equal(c.etapa,'implantacao');
  assert.equal((await chamar('/api/gestao/implantacoes/'+id,{cookie:cookieA,method:'PUT',body:{etapa:'qualquer',pendencia:''}})).status,400);
  const url='/api/gestao/clientes/'+id+'/onboarding';
  assert.equal((await chamar(url,{cookie:cookieA,method:'PUT',body:{passo:'entrega',concluido:true}})).status,200);
  c=await loja();assert.equal(c.etapa,'ativa');assert.equal(c.implantacao_etapa,'entregue');assert.equal(c.implantacao_prazo,'2026-11-30');
});

test('pix da plataforma so e gerado pelo administrador, para a cobranca do plano de uma loja conectada',async()=>{
  const cobrar=tipo=>chamar('/api/gestao/cobrancas',{cookie:cookieAdmin,method:'POST',body:{loja_id:clienteA,tipo,descricao:tipo,valor:7990,vencimento:'2026-11-10',pedido:crypto.randomUUID()}});
  const plano=(await cobrar('plano')).dados.id,suporte=(await cobrar('suporte')).dados.id;
  const gerar=(id,cookie=cookieAdmin)=>chamar(`/api/gestao/cobrancas/${id}/pix`,{cookie,method:'POST',body:{}});
  assert.equal((await gerar(plano,cookieA)).status,403);
  assert.match((await gerar(suporte)).dados.erro,/plano/);
  assert.equal((await gerar(999999)).status,400);
  // A loja de teste nao tem login do Cardapio.ai: nada de navegador, so o aviso.
  const semLogin=await gerar(plano);assert.equal(semLogin.status,400);assert.match(semLogin.dados.erro,/Cardapio/i);
  const lista=(await chamar('/api/gestao',{cookie:cookieA})).dados.cobrancas.find(c=>c.id===plano);
  assert.equal(lista.pix_codigo,undefined);assert.equal(lista.pix_qr,undefined);
});

test('contrato mensal unico gera suporte e plano juntos e o recebimento quita o plano primeiro',async()=>{
  const nova=await chamar('/api/operacao/clientes',{cookie:cookieAdmin,method:'POST',body:{nome:'Loja Mensal',email:'mensal@teste.local',senha,atendente_id:atendenteA,produtos_contratados:25}});
  const id=nova.dados.id;
  const contratar=corpo=>chamar('/api/gestao/contratos',{cookie:cookieAdmin,method:'POST',body:{loja_id:id,tipo:'mensal',inicio:'2026-11-10',pedido:crypto.randomUUID(),...corpo}});
  assert.equal((await contratar({suporte:0,plano:0})).status,400);
  assert.equal((await contratar({suporte:15000,plano:7990})).status,200);
  assert.match((await contratar({suporte:15000,plano:7990})).dados.erro,/contrato ativo/);
  assert.equal((await chamar('/api/gestao/recorrencias',{cookie:cookieAdmin,method:'POST',body:{competencia:'2026-11'}})).status,200);
  const doMes=async()=>(await chamar('/api/gestao',{cookie:cookieAdmin})).dados.cobrancas.filter(c=>c.loja_id===id&&c.competencia==='2026-11');
  const [a,b]=await doMes();assert.ok(a.grupo);assert.equal(a.grupo,b.grupo);
  const receber=(valor,pedido=crypto.randomUUID())=>chamar('/api/gestao/mensalidades/receber',{cookie:cookieAdmin,method:'POST',
    body:{grupo:a.grupo,competencia:'2026-11',valor,data:'2026-11-10',descricao:'Pix do cliente',pedido}});
  assert.equal((await chamar('/api/gestao/mensalidades/receber',{cookie:cookieA,method:'POST',body:{}})).status,403);
  assert.match((await receber(30000)).dados.erro,/ultrapassa/);
  const pedido=crypto.randomUUID();assert.equal((await receber(10000,pedido)).status,200);assert.equal((await receber(10000,pedido)).status,200);
  const partes=Object.fromEntries((await doMes()).map(c=>[c.tipo,c.recebido]));
  assert.deepEqual(partes,{plano:7990,suporte:2010});
  const contrato=(await chamar('/api/gestao',{cookie:cookieAdmin})).dados.contratos.find(t=>t.loja_id===id);
  assert.equal((await chamar(`/api/gestao/contratos/${contrato.id}/encerrar`,{cookie:cookieAdmin,method:'POST',body:{}})).status,200);
  assert.equal((await chamar('/api/gestao',{cookie:cookieAdmin})).dados.contratos.filter(t=>t.loja_id===id&&t.ativo).length,0);
});

test('chave Pix da operacao e gravada pelo administrador e chega para a equipe com os lembretes',async()=>{
  const url='/api/admin/pix-operacao';
  assert.equal((await chamar(url,{cookie:cookieA,method:'PUT',body:{chave:'x',nome:'y'}})).status,403);
  assert.equal((await chamar(url,{cookie:cookieAdmin,method:'PUT',body:{chave:'',nome:'Operação'}})).status,400);
  assert.equal((await chamar(url,{cookie:cookieAdmin,method:'PUT',body:{chave:'financeiro@exemplo.com',nome:'Catálogo Pronto LTDA'}})).status,200);
  assert.deepEqual((await chamar(url,{cookie:cookieAdmin})).dados,{chave:'financeiro@exemplo.com',nome:'Catálogo Pronto LTDA'});
  const equipe=(await chamar('/api/gestao',{cookie:cookieA})).dados;
  assert.deepEqual(equipe.pix_operacao,{chave:'financeiro@exemplo.com',nome:'Catálogo Pronto LTDA'});
  assert.ok(Array.isArray(equipe.lembretes));
  const contagem=await chamar('/api/gestao/lembretes',{cookie:cookieA});assert.equal(contagem.status,200);assert.equal(typeof contagem.dados.total,'number');
});

test('atendente cadastra e conecta as lojas da propria carteira e publica so nelas',async()=>{
  const lista=async cookie=>(await chamar('/api/admin/lojas',{cookie})).dados.lojas.map(l=>l.id);
  const carteira=async cookie=>(await chamar('/api/operacao',{cookie})).dados.clientes.map(c=>c.id).sort();
  assert.ok((await lista(cookieA)).includes(clienteA));
  assert.deepEqual((await lista(cookieA)).sort(),await carteira(cookieA));
  assert.ok(!(await lista(cookieB)).includes(clienteA));
  const nova=await chamar('/api/admin/lojas',{cookie:cookieA,method:'POST',body:{nome:'Loja da Ana',email:'loja-ana@teste.local',senha,cdpEmail:'cdp@teste.local',cdpSenha:'segredo-cdp'}});
  assert.equal(nova.status,200);
  const doA=(await chamar('/api/operacao',{cookie:cookieA})).dados.clientes.find(c=>c.id===nova.dados.id);
  assert.ok(doA,'a loja nova entra na carteira de quem cadastrou');
  const listada=(await chamar('/api/admin/lojas',{cookie:cookieA})).dados.lojas.find(l=>l.id===nova.dados.id);
  assert.equal(listada.tem_senha,1);assert.equal('cdp_senha' in listada,false);
  assert.equal((await chamar('/api/admin/lojas/'+nova.dados.id,{cookie:cookieB,method:'PUT',body:{cdpEmail:'x@y.z'}})).status,404);
  assert.equal((await chamar('/api/admin/lojas/'+nova.dados.id,{cookie:cookieA,method:'PUT',body:{cdpLink:'https://cardapio.ai/loja-ana'}})).status,200);
  assert.equal((await chamar('/api/admin/lojas/'+nova.dados.id,{cookie:cookieA,method:'DELETE'})).status,403);
  // Publicar: na loja dele o pedido chega na regra de negocio (sem lote aberto); na loja de outro, nem passa.
  assert.notEqual((await chamar('/api/lojas/'+nova.dados.id+'/publicar',{cookie:cookieA,method:'POST',body:{}})).status,403);
  assert.equal((await chamar('/api/lojas/'+nova.dados.id+'/publicar',{cookie:cookieB,method:'POST',body:{}})).status,403);
  assert.equal((await chamar('/api/lojas/'+nova.dados.id+'/mfa',{cookie:cookieB,method:'POST',body:{codigo:'1'}})).status,403);
});

test('cofre guarda o e-mail da loja, mostra senha so a quem foi liberado e entrega login ao app com registro',async()=>{
  const nova=(await chamar('/api/admin/lojas',{cookie:cookieA,method:'POST',body:{nome:'Loja Cofre',email:'cofre@teste.local',senha,cdpEmail:'cdp-cofre@teste.local',cdpSenha:'senha-do-cardapio'}})).dados.id;
  assert.equal((await chamar('/api/admin/lojas/'+nova,{cookie:cookieA,method:'PUT',body:{mailEmail:'loja.cofre@proton.me',mailSenha:'senha-do-proton'}})).status,200);
  const listada=(await chamar('/api/admin/lojas',{cookie:cookieA})).dados.lojas.find(l=>l.id===nova);
  assert.equal(listada.mail_email,'loja.cofre@proton.me');assert.equal(listada.tem_mail_senha,1);assert.equal(JSON.stringify(listada).includes('senha-do-proton'),false);

  const revelar=(cookie,servico='email')=>chamar(`/api/cofre/lojas/${nova}/revelar`,{cookie,method:'POST',body:{servico}});
  assert.equal((await revelar(cookieA)).status,403);
  assert.deepEqual((await revelar(cookieAdmin)).dados,{usuario:'loja.cofre@proton.me',senha:'senha-do-proton'});
  assert.equal((await revelar(cookieAdmin,'cardapio')).dados.senha,'senha-do-cardapio');
  assert.equal((await chamar('/api/gestao/atendentes/'+atendenteA,{cookie:cookieAdmin,method:'PUT',body:{ver_senhas:true}})).status,200);
  assert.equal((await revelar(cookieA)).status,200);
  assert.equal((await revelar(cookieB)).status,403);

  // App desktop: login proprio, token no cabecalho, so a carteira de quem entrou.
  const entrar=(email,s=senha)=>chamar('/api/app/login',{method:'POST',body:{email,senha:s,dispositivo:'PC da recepção'}});
  assert.equal((await entrar('a@teste.local','errada')).status,401);
  assert.equal((await entrar('lojaa@teste.local')).status,403);
  const {token}=(await entrar('a@teste.local')).dados;assert.ok(token&&token.length>=40);
  const app=(url,tk=token,method='GET',body)=>fetch(endereco+url,{method,headers:{authorization:'Bearer '+tk,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await fetch(endereco+'/api/app/lojas',{headers:{cookie:cookieA}})).status,401);
  const lojas=(await (await app('/api/app/lojas')).json()).lojas;
  assert.ok(lojas.some(l=>l.id===nova&&l.tem_email&&l.tem_cardapio));assert.equal(JSON.stringify(lojas).includes('senha-do'),false);
  const acesso=await (await app(`/api/app/lojas/${nova}/acesso`,token,'POST',{servico:'email'})).json();
  assert.equal(acesso.usuario,'loja.cofre@proton.me');assert.equal(acesso.senha,'senha-do-proton');assert.match(acesso.url,/proton/);
  assert.equal((await app(`/api/app/lojas/${nova}/acesso`,token,'POST',{servico:'outro'})).status,400);
  const tokenB=(await entrar('b@teste.local')).dados.token;
  assert.equal((await app(`/api/app/lojas/${nova}/acesso`,tokenB,'POST',{servico:'email'})).status,404);
  const historico=(await chamar('/api/gestao/clientes/'+nova,{cookie:cookieAdmin})).dados.historico.map(h=>h.acao);
  assert.ok(historico.includes('login aberto pelo app'));assert.ok(historico.includes('senha do cofre revelada'));

  // Sair revoga o token; desativar a conta derruba os outros.
  assert.equal((await app('/api/app/sair',tokenB,'POST',{})).status,200);assert.equal((await app('/api/app/lojas',tokenB)).status,401);
  await chamar('/api/gestao/atendentes/'+atendenteA,{cookie:cookieAdmin,method:'PUT',body:{ativo:false}});
  assert.equal((await app('/api/app/lojas')).status,401);
  await chamar('/api/gestao/atendentes/'+atendenteA,{cookie:cookieAdmin,method:'PUT',body:{ativo:true}});
});

test('ficha de implantacao: equipe salva, gera link, cliente completa pelo link, envia logo e devolve',async()=>{
  // O teste do cofre desativa e reativa a atendente A, o que derruba a sessao dela de proposito.
  cookieA=await login('a@teste.local');
  const url='/api/gestao/clientes/'+clienteA+'/ficha';
  const salvar=(corpo,cookie=cookieA)=>chamar(url,{cookie,method:'PUT',body:corpo});
  const r=await salvar({loja:{nome:'Loja A',telefone:'(11) 99999-0000'}});assert.equal(r.status,200);assert.equal(r.dados.completo.loja,true);
  const ruim=await salvar({endereco:{cep:'123'}});assert.equal(ruim.status,400);assert.equal(ruim.dados.erros[0].campo,'endereco.cep');
  assert.equal((await chamar(url,{cookie:cookieB})).status,403);

  const {url:link}=(await chamar(url+'/link',{cookie:cookieA,method:'POST',body:{}})).dados;assert.match(link,/\/ficha\.html#t=/);
  const token=link.split('#t=')[1];
  const publico=(caminho,{method='GET',body,tk=token}={})=>fetch(endereco+'/api/ficha-publica'+caminho,{method,headers:{'x-ficha-token':tk,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await publico('',{tk:'token-que-nao-existe-'+'x'.repeat(20)})).status,401);
  const aberta=await (await publico('')).json();assert.equal(aberta.loja,'Loja A');assert.equal(aberta.ficha.loja.telefone,'11999990000');
  assert.equal((await publico('',{method:'PUT',body:{endereco:{cep:'01310-100',rua:'Av. Paulista',numero:'10',bairro:'Bela Vista',cidade:'São Paulo',uf:'SP'}}})).status,200);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
  const form=new FormData();form.append('imagem',new Blob([png],{type:'image/png'}),'logo.png');
  const enviada=await fetch(endereco+'/api/ficha-publica/imagem?tipo=logo',{method:'POST',headers:{'x-ficha-token':token},body:form});assert.equal(enviada.status,200);
  const imagem=await publico('/imagem/logo');assert.equal(imagem.status,200);assert.equal(imagem.headers.get('content-type'),'image/png');
  assert.equal((await publico('/enviar',{method:'POST',body:{}})).status,200);

  const vista=(await chamar(url,{cookie:cookieA})).dados;
  assert.equal(vista.completo.endereco,true);assert.ok(vista.ficha.marca.logo_material);assert.ok(vista.enviada_em);
  assert.equal(vista.ficha.loja.nome,'Loja A','o que a equipe salvou continua');
  const tarefa=(await chamar('/api/gestao',{cookie:cookieA})).dados.tarefas.find(t=>t.loja_id===clienteA&&/Ficha de implantação/.test(t.titulo));
  assert.ok(tarefa,'o atendente recebe uma tarefa para conferir a ficha');
  // Gerar outro link derruba o anterior.
  await chamar(url+'/link',{cookie:cookieA,method:'POST',body:{}});
  assert.equal((await publico('')).status,401);
  // O app desktop le a ficha para o assistente.
  const {token:tokenApp}=(await chamar('/api/app/login',{method:'POST',body:{email:'a@teste.local',senha,dispositivo:'PC'}})).dados;
  const doApp=await fetch(endereco+`/api/app/lojas/${clienteA}/ficha`,{headers:{authorization:'Bearer '+tokenApp}});
  assert.equal(doApp.status,200);assert.equal((await doApp.json()).ficha.endereco.cep,'01310100');
});

test('conferencia do catalogo: app busca o que publicamos, grava o resultado e a equipe ve na ficha',async()=>{
  cookieA=await login('a@teste.local');
  const {token}=(await chamar('/api/app/login',{method:'POST',body:{email:'a@teste.local',senha,dispositivo:'PC'}})).dados;
  const app=(url,method='GET',body,tk=token)=>fetch(endereco+url,{method,headers:{authorization:'Bearer '+tk,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const esperados=await (await app(`/api/app/lojas/${clienteA}/conferencia/esperados`)).json();
  assert.equal(esperados.contratados,40);assert.ok(Array.isArray(esperados.esperados));
  const resultado={situacao:'bloqueante',totais:{produtos:3,sem_preco:1},problemas:[{tipo:'sem-preco',nivel:'bloqueante',produto:'Mel',detalhe:'Sem preço'}]};
  assert.equal((await app(`/api/app/lojas/${clienteA}/conferencia`,'POST',{situacao:'qualquer',totais:{},problemas:[]})).status,400);
  assert.equal((await app(`/api/app/lojas/${clienteA}/conferencia`,'POST',resultado)).status,200);
  const tokenB=(await chamar('/api/app/login',{method:'POST',body:{email:'b@teste.local',senha,dispositivo:'PC'}})).dados.token;
  assert.equal((await app(`/api/app/lojas/${clienteA}/conferencia`,'POST',resultado,tokenB)).status,403);
  const vista=(await chamar(`/api/gestao/clientes/${clienteA}/conferencia`,{cookie:cookieA})).dados;
  assert.equal(vista.situacao,'bloqueante');assert.equal(vista.totais.sem_preco,1);assert.equal(vista.problemas[0].produto,'Mel');assert.ok(vista.criada_em);
  assert.equal((await chamar(`/api/gestao/clientes/${clienteA}/conferencia`,{cookie:cookieB})).status,403);
});

test('plano lido no Cardapio.ai pelo app vai para a loja e vira lembrete do administrador',async()=>{
  const {token}=(await chamar('/api/app/login',{method:'POST',body:{email:'a@teste.local',senha,dispositivo:'PC'}})).dados;
  const enviar=corpo=>fetch(endereco+`/api/app/lojas/${clienteA}/plano`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(corpo)});
  const daqui2=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
  assert.equal((await enviar({valido_ate:'06/11/2026'})).status,400);
  assert.equal((await enviar({plano:'PDV+Robô',periodo:'mensal',valor_centavos:7990,valido_ate:daqui2,teste_ate:null,situacao:'Pagamento recebido via Pix'})).status,200);
  const admin=(await chamar('/api/gestao',{cookie:cookieAdmin})).dados;
  const loja=admin.clientes.find(c=>c.id===clienteA);
  assert.equal(loja.cdp_plano,'PDV+Robô');assert.equal(loja.cdp_plano_valido_ate,daqui2);assert.equal(loja.cdp_plano_valor,7990);assert.ok(loja.cdp_plano_lido_em);
  assert.ok(admin.lembretes.some(l=>l.tipo==='plano-cardapio'&&l.loja_id===clienteA));
  const atendente=(await chamar('/api/gestao',{cookie:await login('a@teste.local')})).dados;
  assert.equal(atendente.lembretes.some(l=>l.tipo==='plano-cardapio'),false);
});

test('app recebe o resumo de cada loja e os lembretes do dia da carteira',async()=>{
  const {token}=(await chamar('/api/app/login',{method:'POST',body:{email:'a@teste.local',senha,dispositivo:'PC'}})).dados;
  const app=url=>fetch(endereco+url,{headers:{authorization:'Bearer '+token}}).then(r=>r.json());
  const loja=(await app('/api/app/lojas')).lojas.find(l=>l.id===clienteA);
  assert.equal(typeof loja.roteiro.feitas,'number');assert.equal(loja.roteiro.total,11);
  assert.equal(typeof loja.ficha.completas,'number');assert.equal(loja.ficha.total,7);assert.equal(typeof loja.ficha.secoes.endereco,'boolean');
  assert.ok(['implantacao','ativa','pausada'].includes(loja.etapa));
  assert.equal(loja.plano.plano,'PDV+Robô');assert.ok(loja.plano.valido_ate);
  assert.equal(loja.conferencia.situacao,'bloqueante');
  assert.equal(JSON.stringify(loja).includes('senha'),false);
  const {lembretes}=await app('/api/app/lembretes');
  assert.ok(Array.isArray(lembretes));
  assert.equal(lembretes.some(l=>l.tipo==='plano-cardapio'),false,'plano da plataforma e assunto do administrador');
});

test('desativacao e troca de senha revogam sessoes existentes',async()=>{
  const r=await chamar('/api/gestao/atendentes/'+atendenteA,{cookie:cookieAdmin,method:'PUT',body:{ativo:false}});assert.equal(r.status,200);
  assert.equal((await chamar('/api/gestao',{cookie:cookieA})).status,401);
  assert.equal((await chamar('/api/login',{method:'POST',body:{email:'a@teste.local',senha}})).status,401);
  await chamar('/api/gestao/atendentes/'+atendenteA,{cookie:cookieAdmin,method:'PUT',body:{ativo:true}});
  const antigo=await login('a@teste.local');
  assert.equal((await chamar('/api/gestao/senha',{cookie:antigo,method:'PUT',body:{atual:senha,nova:'Nova-senha-teste-2026'}})).status,200);
  assert.equal((await chamar('/api/gestao',{cookie:antigo})).status,401);
  assert.equal((await chamar('/api/login',{method:'POST',body:{email:'a@teste.local',senha:'Nova-senha-teste-2026'}})).status,200);
});
