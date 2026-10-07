// Verificacao local da interface com o Playwright ja instalado na automacao.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { chromium } = require('../../automacao/node_modules/playwright');

(async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(),'painel-browser-test-'));
  let processo, navegador;
  try {
    const s = net.createServer();
    await new Promise(r => s.listen(0,'127.0.0.1',r));
    const porta = s.address().port;
    await new Promise(r => s.close(r));
    processo = spawn(process.execPath,['servidor.js'],{
      cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:['ignore','pipe','pipe'],
      env:{...process.env,PORT:String(porta),PASTA_DADOS:raiz,
        CHAVE_SESSAO:crypto.randomBytes(32).toString('hex'),CHAVE_CRIPTO:crypto.randomBytes(32).toString('hex'),
        ADMIN_EMAIL:'admin@teste.local',ADMIN_SENHA:'Senha-teste-2026'},
    });
    await new Promise((resolve,reject) => {
      let saida = '';
      const tempo = setTimeout(() => reject(new Error(saida)),15000);
      processo.stdout.on('data',b => {saida += b;if(saida.includes('Painel de produtos')){clearTimeout(tempo);resolve();}});
      processo.stderr.on('data',b => {saida += b;});
      processo.once('error',e => {clearTimeout(tempo);reject(e);});
    });
    navegador = await chromium.launch({headless:true,channel:'msedge'});
    const page = await navegador.newPage({viewport:{width:1440,height:1000}});
    const erros = [];
    page.on('pageerror',e => erros.push(e.message));
    await page.goto(`http://127.0.0.1:${porta}`);
    await page.locator('#email').fill('admin@teste.local');
    await page.locator('#senha').fill('Senha-teste-2026');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.waitForURL('**/gestao.html');
    await page.goto(`http://127.0.0.1:${porta}/operacao.html`);
    await page.getByText('Visão de toda a operação',{exact:false}).waitFor();
    await page.locator('#novoAtendente').click();
    const atendente = page.locator('#formAtendente');
    await atendente.locator('[name=nome]').fill('Ana Atendimento');
    await atendente.locator('[name=email]').fill('ana@teste.local');
    await atendente.locator('[name=senha]').fill('Senha-teste-2026');
    await atendente.getByRole('button',{name:'Criar conta'}).click();
    await page.locator('#equipe').getByText('Ana Atendimento',{exact:true}).waitFor();
    await page.locator('#novoCliente').click();
    const cliente = page.locator('#formCliente');
    await cliente.locator('[name=nome]').fill('Mercado da Roça');
    await cliente.locator('[name=email]').fill('mercado@teste.local');
    await cliente.locator('[name=senha]').fill('Senha-teste-2026');
    await cliente.locator('[name=atendente_id]').selectOption({label:'Ana Atendimento'});
    await cliente.locator('[name=whatsapp]').fill('11999990000');
    await cliente.locator('[name=vencimento]').fill('2026-10-20');
    await cliente.locator('[name=produtos_contratados]').fill('40');
    await cliente.locator('[name=suporte]').fill('180');
    await cliente.locator('[name=plano]').fill('99.90');
    assert.match(await page.locator('#previa').innerText(),/222,50/);
    await cliente.getByRole('button',{name:'Salvar cliente'}).click();
    await page.locator('#clientes').getByText('Mercado da Roça',{exact:true}).waitFor();
    assert.match(await page.locator('#clientes').innerText(),/20\/10\/2026/);
    assert.match(await page.locator('#clientes').innerText(),/90,00/);
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    await cliente.locator('[name=vencimento]').fill('2026-11-20');
    await cliente.getByRole('button',{name:'Salvar cliente'}).click();
    await page.locator('#clientes td.data').filter({hasText:'20/11/2026'}).waitFor();
    await page.locator('#busca').fill('inexistente');
    await page.getByText('Nenhum cliente encontrado.',{exact:false}).waitFor();
    await page.locator('#busca').fill('');
    await page.locator('#sair').click();
    await page.waitForURL(`http://127.0.0.1:${porta}/`);
    await page.locator('#email').fill('ana@teste.local');
    await page.locator('#senha').fill('Senha-teste-2026');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.waitForURL('**/gestao.html');
    await page.goto(`http://127.0.0.1:${porta}/operacao.html`);
    await page.getByText('Mercado da Roça',{exact:true}).waitFor();
    assert.equal(await page.locator('#novoCliente').isVisible(),false);
    assert.equal(await page.locator('#novoAtendente').isVisible(),false);
    assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).count(),0);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    assert.deepEqual(erros,[]);
    console.log('Interface validada: login admin e atendente, cadastro, vinculo, divisao, edicao, busca e tela de celular.');
  } finally {
    if(navegador) await navegador.close();
    if(processo && processo.exitCode === null) {const fim = new Promise(r => processo.once('exit',r));processo.kill();await fim;}
    fs.rmSync(raiz,{recursive:true,force:true});
  }
})().catch(e => {console.error(e);process.exitCode=1;});
