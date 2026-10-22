// Ficha de implantacao pela tela: a equipe comeca, o cliente completa pelo link num celular e envia.
const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const net=require('node:net');const crypto=require('node:crypto');const {spawn}=require('node:child_process');
const {chromium}=require('../../automacao/node_modules/playwright');
(async()=>{
  const raiz=fs.mkdtempSync(path.join(os.tmpdir(),'ficha-e2e-'));let processo,browser;
  try{
    const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const porta=s.address().port;await new Promise(r=>s.close(r));
    const base=`http://127.0.0.1:${porta}`,senha='Senha-teste-2026';
    processo=spawn(process.execPath,['servidor.js'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(porta),PASTA_DADOS:raiz,
      ADMIN_EMAIL:'admin@teste.local',ADMIN_SENHA:senha,CHAVE_CRIPTO:crypto.randomBytes(32).toString('hex'),CHAVE_SESSAO:crypto.randomBytes(32).toString('hex')}});
    await new Promise((resolve,reject)=>{let saida='';const t=setTimeout(()=>reject(new Error(saida)),15000);
      processo.stdout.on('data',b=>{saida+=b;if(saida.includes('Painel de produtos')){clearTimeout(t);resolve();}});processo.stderr.on('data',b=>saida+=b);});
    browser=await chromium.launch({channel:'msedge'});
    const equipe=await browser.newPage({viewport:{width:1440,height:1000}});const erros=[];equipe.on('pageerror',e=>erros.push(e.message));
    await equipe.goto(base);await equipe.fill('#email','admin@teste.local');await equipe.fill('#senha',senha);
    await equipe.getByRole('button',{name:'Entrar',exact:true}).click();await equipe.waitForURL('**/gestao.html');
    const api=async(m,url,data)=>{const r=await equipe.request.fetch(base+url,{method:m,data});assert.ok(r.ok(),url+' '+await r.text());return r.json();};
    const {id}=await api('POST','/api/operacao/clientes',{nome:'Mercado da Roça',email:'mercado@teste.local',senha,produtos_contratados:25,whatsapp:'11999990000'});

    // Equipe comeca a ficha.
    await equipe.goto(base+`/ficha.html?loja=${id}`);await equipe.locator('#avisoEquipe').waitFor();
    await equipe.fill('[name="loja.nome"]','Mercado da Roça');await equipe.fill('[name="loja.telefone"]','(11) 99999-0000');
    await equipe.click('#salvar');await equipe.locator('#progresso li.ok',{hasText:'Loja'}).waitFor();
    // Na ficha do cliente na gestao aparece o cartao da ficha.
    await equipe.goto(base+`/gestao.html#cliente-${id}`);await equipe.locator('#linkFicha').waitFor();
    assert.match(await equipe.locator('article',{hasText:'Ficha de implantação'}).innerText(),/1 de 7 seções/);
    const {url}=await api('POST',`/api/gestao/clientes/${id}/ficha/link`,{});

    // Cliente, no celular, pelo link.
    const cliente=await (await browser.newContext({viewport:{width:390,height:844}})).newPage();cliente.on('pageerror',e=>erros.push(e.message));
    await cliente.goto(url.replace(/^https?:\/\/[^/]+/,base));await cliente.locator('#nomeLoja').filter({hasText:'Mercado da Roça'}).waitFor();
    assert.equal(await cliente.inputValue('[name="loja.telefone"]'),'11999990000');
    await cliente.fill('[name="endereco.cep"]','123');await cliente.click('#salvar');
    await cliente.locator('.mensagem-erro',{hasText:'8 números'}).waitFor();
    await cliente.fill('[name="endereco.cep"]','01310-100');
    for(const [nome,valor] of [['endereco.rua','Av. Paulista'],['endereco.numero','1000'],['endereco.bairro','Bela Vista'],['endereco.cidade','São Paulo'],['endereco.uf','SP']])await cliente.fill(`[name="${nome}"]`,valor);
    const seg=cliente.locator('.ficha-dia[data-dia=seg]');await seg.locator('[data-aberto]').check();
    await seg.locator('[data-abre="0"]').fill('09:00');await seg.locator('[data-fecha="0"]').fill('18:00');
    await cliente.check('[name="entrega.faz_entrega"]');
    for(const [nome,valor] of [['entrega.raio_base_km','3'],['entrega.taxa_base','5,00'],['entrega.taxa_km','1,50'],['entrega.distancia_maxima_km','10']])await cliente.fill(`[name="${nome}"]`,valor);
    await cliente.check('[name="pagamento.pix"]');await cliente.selectOption('[name="pagamento.pix_tipo"]','email');await cliente.fill('[name="pagamento.pix_chave"]','Financeiro@Mercado.com');
    await cliente.check('[name="produtos.origem"][value=link]');await cliente.fill('[name="produtos.link_cardapio"]','https://www.ifood.com.br/delivery/sao-paulo-sp/mercado');
    const logo=path.join(raiz,'logo.png');fs.writeFileSync(logo,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));
    await cliente.setInputFiles('#arquivoLogo',logo);await cliente.locator('#previewLogo:not([hidden])').waitFor();
    await cliente.click('#enviar');await cliente.locator('#aviso',{hasText:'Ficha enviada'}).waitFor();
    assert.equal(await cliente.locator('#progresso li.ok').count(),7);
    assert.equal(await cliente.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);

    const salva=await api('GET',`/api/gestao/clientes/${id}/ficha`);
    assert.equal(salva.ficha.pagamento.pix_chave,'financeiro@mercado.com');assert.equal(salva.ficha.entrega.taxa_km,150);assert.ok(salva.enviada_em);
    assert.ok((await api('GET','/api/gestao')).tarefas.some(t=>t.loja_id===id&&t.titulo==='Ficha de implantação recebida'));
    // A equipe reabre e ve tudo preenchido, inclusive a logo.
    await equipe.goto(base+`/ficha.html?loja=${id}`);await equipe.locator('#previewLogo:not([hidden])').waitFor();
    assert.equal(await equipe.inputValue('[name="entrega.taxa_base"]'),'5,00');
    assert.deepEqual(erros,[]);
    console.log('ficha.browser: ok');
  }finally{if(browser)await browser.close();if(processo)processo.kill();}
})().catch(e=>{console.error(e);process.exit(1);});
