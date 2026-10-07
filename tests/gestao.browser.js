const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const net=require('node:net');const crypto=require('node:crypto');const {spawn}=require('node:child_process');
const {chromium}=require('../../automacao/node_modules/playwright');
(async()=>{
  const raiz=fs.mkdtempSync(path.join(os.tmpdir(),'gestao-e2e-'));let processo,browser;
  try{
    const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const porta=s.address().port;await new Promise(r=>s.close(r));
    const base=`http://127.0.0.1:${porta}`,senha='Senha-teste-2026';
    processo=spawn(process.execPath,['servidor.js'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(porta),PASTA_DADOS:raiz,ADMIN_EMAIL:'admin@teste.local',ADMIN_SENHA:senha,CHAVE_CRIPTO:crypto.randomBytes(32).toString('hex'),CHAVE_SESSAO:crypto.randomBytes(32).toString('hex')}});
    await new Promise((resolve,reject)=>{let saida='';const timer=setTimeout(()=>reject(new Error(saida)),15000);
      processo.stdout.on('data',b=>{saida+=b;if(saida.includes('Painel de produtos')){clearTimeout(timer);resolve();}});processo.stderr.on('data',b=>saida+=b);processo.once('error',reject);});
    browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const erros=[];page.on('pageerror',e=>erros.push(e.message));
    page.on('response',r=>{if(r.status()>=400&&!(r.status()===401&&r.url().endsWith('/api/eu'))&&!r.url().endsWith('/favicon.ico'))erros.push(`${r.status()} ${r.url()}`);});
    await page.goto(base);await page.locator('#email').fill('admin@teste.local');await page.locator('#senha').fill(senha);await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.waitForURL('**/gestao.html');await page.getByRole('heading',{name:'Seu dia na operação'}).waitFor();
    for(const tela of ['inicio','clientes','implantacoes','cobrancas','financeiro','repasses','tarefas','configuracoes']){
      await page.goto(base+'/gestao.html#'+tela);
      await page.locator(`[data-guia="${tela}"]`).waitFor();
      assert.equal(await page.locator('#periodo').isVisible(),['inicio','financeiro'].includes(tela));
      await page.locator('[data-guia] summary').click();
      assert.equal(await page.locator('[data-guia] dl').isVisible(),true);
      if(tela==='financeiro'){
        assert.equal(await page.locator('.indicadores article').count(),8);
        assert.equal(await page.locator('.indicador-descricao').count(),8);
        await page.locator('.indicador-ajuda summary').first().click();
        assert.equal(await page.locator('.indicador-ajuda p').first().isVisible(),true);
      }
    }
    const api=async(url,body,method='POST')=>{const r=await page.request.fetch(base+url,{method,data:body});const d=await r.json();assert.equal(r.status(),200,JSON.stringify(d));return d;};
    const a=await page.request.post(base+'/api/operacao/atendentes',{data:{nome:'Ana',email:'ana@teste.local',senha}});assert.equal(a.status(),201);const atendente=(await a.json()).id;
    const cl=await page.request.post(base+'/api/operacao/clientes',{data:{nome:'Mercado da Roça',email:'mercado@teste.local',senha,atendente_id:atendente,produtos_contratados:40,whatsapp:'11999990000'}});assert.equal(cl.status(),201);const cid=(await cl.json()).id;
    await page.reload();await page.goto(base+'/gestao.html#cliente-'+cid);await page.getByRole('heading',{name:'Mercado da Roça',exact:true}).waitFor();
    await page.locator('[data-guia="ficha"]').waitFor();
    await page.locator('#cobrarCliente').click();let form=page.locator('#formDinamico');await form.locator('[name=custo_previsto]').fill('45');
    await form.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('#formDialog').waitFor({state:'hidden'});
    await page.goto(base+'/gestao.html#cobrancas');await page.getByRole('heading',{name:'Cobranças',exact:true}).waitFor();
    await page.locator('[data-receber]').click();await form.locator('[name=valor]').fill('222.50');await form.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('#formDialog').waitFor({state:'hidden'});
    await page.locator('[data-custo]').click();await form.locator('[name=valor]').fill('45');await form.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('#formDialog').waitFor({state:'hidden'});
    await page.locator('[data-fechar]').click();await page.locator('#sim').click();await page.locator('[data-repasse]').waitFor();
    assert.match(await page.locator('#listaCobrancas').innerText(),/100,00/);
    await page.locator('[data-repasse]').click();await form.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('#formDialog').waitFor({state:'hidden'});
    await page.goto(base+'/gestao.html#financeiro');await page.getByRole('heading',{name:'Financeiro',exact:true}).waitFor();assert.match(await page.locator('#conteudo').innerText(),/77,50/);
    if(process.env.PREVIEW_AJUDA)await page.screenshot({path:process.env.PREVIEW_AJUDA,fullPage:true});
    await page.goto(base+'/gestao.html#cliente-'+cid);await page.locator('#etapaCliente').click();await form.locator('[name=etapa]').selectOption('materiais');
    await form.locator('[name=pendencia]').fill('Aguardando preços');await form.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('#formDialog').waitFor({state:'hidden'});
    await page.locator('#tarefaCliente').click();await form.locator('[name=titulo]').fill('Configurar impressora');await form.locator('[name=minutos]').fill('20');
    await form.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('#formDialog').waitFor({state:'hidden'});await page.getByText('Configurar impressora',{exact:true}).waitFor();
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1sAAAAASUVORK5CYII=','base64');
    await page.locator('#fotos').setInputFiles({name:'produto.png',mimeType:'image/png',buffer:png});await page.locator('#enviarFotos').click();await page.locator('[data-material]').waitFor();
    await page.locator('[data-material]').click();await form.locator('[name=titulo]').fill('Queijo artesanal');await form.locator('[name=preco]').fill('20.50');
    await form.locator('[name=unidade]').fill('500g');await form.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('#formDialog').waitFor({state:'hidden'});
    await page.locator('#importar').click();await page.locator('#sim').click();await page.getByText('Enviado para revisão',{exact:true}).waitFor();
    await page.goto(base+`/?produtos=1&loja=${cid}`);await page.locator('input[value="Queijo artesanal"]').waitFor();
    await page.locator('[data-guia="produtos"]').waitFor();
    assert.equal(await page.locator('.cartao img').first().evaluate(img=>img.complete&&img.naturalWidth>0),true);
    const precoSalvo=page.waitForResponse(r=>r.url().endsWith('/lote/item')&&r.request().method()==='PUT');
    await page.locator('[data-campo=preco]').fill('25,90');await precoSalvo;
    const lote=await page.request.get(base+`/api/lojas/${cid}/lote`);assert.equal((await lote.json()).produtos[0].preco,'25.90');
    await page.goto(base+'/gestao.html#configuracoes');await page.locator('#backup').waitFor();
    const copia=page.waitForResponse(r=>r.url().endsWith('/api/gestao/backups')&&r.request().method()==='POST');
    await page.locator('#backup').click();await copia;
    const backups=await page.request.get(base+'/api/gestao/backups');const lista=(await backups.json()).backups;assert.ok(lista.length);
    const snapshot=lista.find(b=>b.nome.endsWith('.db'));assert.ok(lista.some(b=>b.nome.endsWith('.tar.gz')));
    const download=await page.request.get(base+'/api/gestao/backups/'+snapshot.nome);const arquivo=path.join(raiz,'restaurado.db');fs.writeFileSync(arquivo,await download.body());
    const D=require('better-sqlite3'),restaurado=new D(arquivo,{readonly:true});assert.ok(restaurado.prepare('SELECT COUNT(*) AS n FROM lojas').get().n>=3);restaurado.close();
    await page.locator('#sair').click();await page.waitForURL(base+'/');await page.locator('#email').fill('ana@teste.local');await page.locator('#senha').fill(senha);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/gestao.html');
    await page.goto(base+'/gestao.html#repasses');await page.getByRole('heading',{name:'Repasses',exact:true}).waitFor();assert.equal(await page.locator('[data-pagar]').count(),0);
    await page.goto(base+`/?produtos=1&loja=${cid}`);await page.locator('#app').waitFor();assert.equal(await page.locator('#btnPublicar').isVisible(),false);
    assert.match(await page.locator('.ajuda-passos').innerText(),/avise o administrador/);
    await page.goto(base+'/gestao.html#clientes');await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(erros,[]);console.log('Gestão validada: cobrança, pagamento parcial, custo, repasse, financeiro, implantação, suporte, fotos, lote por cliente, backup restaurável e acesso da equipe no celular.');
  }finally{if(browser)await browser.close();if(processo&&processo.exitCode===null){const fim=new Promise(r=>processo.once('exit',r));processo.kill();await fim;}fs.rmSync(raiz,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
