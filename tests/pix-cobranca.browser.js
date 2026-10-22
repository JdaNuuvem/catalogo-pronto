// Fluxo completo do Pix da plataforma: tela de cobrancas -> servidor -> navegador -> copia local do Cardapio.ai
// (com login e codigo de verificacao) -> QR e copia e cola de volta na tela.
const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const net=require('node:net');const http=require('node:http');const crypto=require('node:crypto');const {spawn}=require('node:child_process');
const {chromium}=require('../../automacao/node_modules/playwright');
const {crc16}=require('../lib/pix');

const campos=[['00','01'],['01','12'],['26','0014br.gov.bcb.pix2524qrcodes.exemplo.com.br/x'],['52','0000'],['53','986'],['54','79.90'],['58','BR'],['59','TESTE'],['60','Recife']];
const corpo=campos.map(([id,v])=>id+String(v.length).padStart(2,'0')+v).join('')+'6304',codigo=corpo+crc16(corpo);
const pagina=c=>`<!doctype html><html><body>${c}</body></html>`;
function cardapioFalso(){
  return http.createServer((req,res)=>{
    const logado=(req.headers.cookie||'').includes('sessao=1');
    const ir=(url,cookie)=>{res.statusCode=302;if(cookie)res.setHeader('set-cookie',cookie+'; Path=/');res.setHeader('location',url);res.end();};
    res.setHeader('content-type','text/html; charset=utf-8');
    if(req.url.startsWith('/painelweb/')&&!logado)return ir('/admin/login');
    if(req.url==='/admin/login'&&req.method==='GET')return res.end(pagina('<form method="post"><input name="email"><input name="senha" type="password"><button class="form-button" type="submit">Entrar</button></form>'));
    if(req.url==='/admin/login')return ir('/admin/mfa');
    if(req.url==='/admin/mfa'&&req.method==='GET')return res.end(pagina('<form method="post"><input type="tel" name="codigo"><button type="submit">Confirmar</button></form>'));
    if(req.url==='/admin/mfa'){let b='';req.on('data',d=>b+=d);req.on('end',()=>b.includes('123456')?ir('/painelweb/listar','sessao=1'):ir('/admin/mfa'));return;}
    if(req.url==='/painelweb/listar')return res.end(pagina('<h1>Produtos</h1>'));
    if(req.url==='/painelweb/account?plans')return res.end(pagina(`<div class="payment-types-item" type="pix"><p>Renove a assinatura de <b>Novembro</b>.</p><button>Gerar código Pix</button></div><div id="d"></div>
      <script>document.querySelector('button').onclick=()=>setTimeout(()=>{document.getElementById('d').innerHTML='<div class="payment-qr-details"><img src="data:image/png;base64,iVBORw0KGgo="><button link="${codigo}">Copiar código Pix</button><p class="payment-qr-value">R$ 79,90</p></div>';},300);</script>`));
    res.statusCode=404;res.end();
  });
}
const porta=async()=>{const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};

(async()=>{
  const raiz=fs.mkdtempSync(path.join(os.tmpdir(),'pix-e2e-'));let processo,browser;const falso=cardapioFalso();
  try{
    await new Promise(r=>falso.listen(0,'127.0.0.1',r));
    const p=await porta(),base=`http://127.0.0.1:${p}`,senha='Senha-teste-2026';
    processo=spawn(process.execPath,['servidor.js'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(p),PASTA_DADOS:raiz,
      ADMIN_EMAIL:'admin@teste.local',ADMIN_SENHA:senha,CHAVE_CRIPTO:crypto.randomBytes(32).toString('hex'),CHAVE_SESSAO:crypto.randomBytes(32).toString('hex'),
      CARDAPIO_BASE_URL:`http://127.0.0.1:${falso.address().port}/painelweb`,HEADLESS:'true'}});
    await new Promise((resolve,reject)=>{let saida='';const t=setTimeout(()=>reject(new Error(saida)),15000);
      processo.stdout.on('data',b=>{saida+=b;if(saida.includes('Painel de produtos')){clearTimeout(t);resolve();}});processo.stderr.on('data',b=>saida+=b);});
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const erros=[];page.on('pageerror',e=>erros.push(e.message));
    await page.goto(base);await page.fill('#email','admin@teste.local');await page.fill('#senha',senha);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/gestao.html');
    const api=async(metodo,url,data)=>{const r=await page.request.fetch(base+url,{method:metodo,data});assert.ok(r.ok(),url+' '+await r.text());return r.json();};
    const loja=async(nome,email)=>{const {id}=await api('POST','/api/operacao/clientes',{nome,email,senha,produtos_contratados:25,whatsapp:'11999990000'});
      await api('PUT','/api/admin/lojas/'+id,{cdpEmail:'cdp-'+email,cdpSenha:'senha-cardapio'});
      await api('POST','/api/gestao/cobrancas',{loja_id:id,tipo:'plano',descricao:'Plano Cardapio.ai',valor:7990,vencimento:'2026-11-10',pedido:crypto.randomUUID()});return id;};
    await loja('Mercado da Roça','mercado@teste.local');

    await page.goto(base+'/gestao.html#cobrancas');await page.reload();await page.locator('[data-gerar-pix]').click();
    await page.locator('#pixMfa').waitFor({state:'visible',timeout:60000});
    await page.fill('#pixCodigoMfa','123456');await page.locator('#pixMfa button[type=submit]').click();
    await page.locator('#pixResultado').waitFor({state:'visible',timeout:60000});
    assert.equal(await page.locator('#pixCopia').inputValue(),codigo);
    assert.match(await page.locator('#pixValor').innerText(),/79,90.*Novembro/);
    assert.equal(await page.locator('#pixAviso').isVisible(),false);
    await page.locator('#pixFechar').click();
    await page.locator('[data-ver-pix]').click();assert.equal(await page.locator('#pixCopia').inputValue(),codigo);await page.locator('#pixFechar').click();

    // Lote: so a loja que ainda nao tem Pix entra, e o codigo de verificacao e pedido de novo (perfil proprio).
    await loja('Padaria Sol','padaria@teste.local');await page.reload();
    await page.locator('#pixLote').click();await page.locator('#pixMfa').waitFor({state:'visible',timeout:60000});
    assert.match(await page.locator('#pixTitulo').innerText(),/1 de 1/);
    await page.fill('#pixCodigoMfa','123456');await page.locator('#pixMfa button[type=submit]').click();
    await page.locator('#pixTitulo').filter({hasText:'1 de 1 gerados'}).waitFor({timeout:60000});
    assert.match(await page.locator('#pixResumo').innerText(),/Padaria Sol/);
    const semPix=(await api('GET','/api/gestao')).cobrancas.filter(c=>c.tipo==='plano'&&!c.pix_codigo);assert.equal(semPix.length,0);
    await page.locator('#pixFechar').click();

    // Contrato mensal unico pela tela: uma mensalidade, Pix gerado junto e recebimento quitando o plano primeiro.
    const {id:doceria}=await api('POST','/api/operacao/clientes',{nome:'Doceria Mel',email:'doceria@teste.local',senha,produtos_contratados:25});
    await api('PUT','/api/admin/lojas/'+doceria,{cdpEmail:'cdp-doceria',cdpSenha:'senha-cardapio'});
    await page.reload();const form=page.locator('#formDinamico');
    await page.locator('#novoContrato').click();await form.locator('[name=loja_id]').selectOption(String(doceria));
    await form.locator('[name=suporte]').fill('150');await form.locator('[name=plano]').fill('79.90');await form.locator('[name=inicio]').fill('2026-11-10');
    await form.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('#formDialog').waitFor({state:'hidden'});
    await page.locator('#recorrencias').click();await form.locator('[name=competencia]').fill('2026-11');
    await form.getByRole('button',{name:'Salvar',exact:true}).click();
    await page.locator('#pixMfa').waitFor({state:'visible',timeout:60000});await page.fill('#pixCodigoMfa','123456');await page.locator('#pixMfa button[type=submit]').click();
    await page.locator('#pixTitulo').filter({hasText:'1 de 1 gerados'}).waitFor({timeout:60000});await page.locator('#pixFechar').click();
    const linha=page.locator('tr.mensalidade').filter({hasText:'Doceria Mel'});
    assert.match(await linha.innerText(),/Mensalidade 2026-11/);assert.match(await linha.innerText(),/229,90/);
    await linha.locator('[data-receber-mensal]').click();await form.locator('[name=valor]').fill('100');
    await form.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('#formDialog').waitFor({state:'hidden'});
    const partes=Object.fromEntries((await api('GET','/api/gestao')).cobrancas.filter(c=>c.loja_id===doceria).map(c=>[c.tipo,c.recebido]));
    assert.deepEqual(partes,{plano:7990,suporte:2010});
    assert.match(await page.locator('tr.mensalidade').filter({hasText:'Doceria Mel'}).innerText(),/parcial/);

    // Lembretes: pagar a plataforma (reserva do plano ja recebida) e mensagem de cobranca com a chave Pix da operacao.
    await api('PUT','/api/admin/pix-operacao',{chave:'financeiro@exemplo.com',nome:'Catálogo Pronto LTDA'});
    const {clientes}=await api('GET','/api/gestao');const mercado=clientes.find(c=>c.nome==='Mercado da Roça');
    await api('PUT','/api/gestao/clientes/'+mercado.id,{contato:'Maria Souza',observacoes:''});
    const daqui2=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
    await api('POST','/api/gestao/cobrancas',{loja_id:mercado.id,tipo:'outro',descricao:'Fotos extras',valor:5000,vencimento:daqui2,pedido:crypto.randomUUID()});
    await page.goto(base+'/operacao.html');await page.goto(base+'/gestao.html#inicio');
    await page.locator('.casca-menu .casca-contador').waitFor();assert.equal(await page.locator('.casca-menu .casca-contador').innerText(),'2');
    const plataforma=page.locator('.lembrete').filter({hasText:'Pagar o Pix do Cardapio.ai de Doceria Mel'});
    await plataforma.locator('[data-lembrete-pix]').click();assert.equal(await page.locator('#pixCopia').inputValue(),codigo);await page.locator('#pixFechar').click();
    await page.locator('.lembrete').filter({hasText:'Fotos extras'}).locator('[data-lembrete-whats]').click();
    const texto=await page.locator('#formCampos textarea').inputValue();
    assert.match(texto,/Olá, Maria!/);assert.match(texto,/R\$\s50,00/);assert.match(texto,/financeiro@exemplo\.com \(Catálogo Pronto LTDA\)/);
    assert.match(await page.locator('#formDica a.whatsapp').getAttribute('href'),/^https:\/\/wa\.me\/5511999990000\?text=/);
    await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('#formDialog').waitFor({state:'hidden'});
    assert.ok((await api('GET','/api/gestao')).cobrancas.find(c=>c.descricao==='Fotos extras').enviada_em);
    assert.deepEqual(erros,[]);
    console.log('pix-cobranca.browser: ok');
  }finally{if(browser)await browser.close();if(processo)processo.kill();falso.close();}
})().catch(e=>{console.error(e);process.exit(1);});
