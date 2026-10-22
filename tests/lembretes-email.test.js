const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
process.env.CHAVE_CRIPTO=crypto.randomBytes(32).toString('hex');
const banco=require('../lib/banco');const f=require('../lib/financeiro');const {enviarResumos,enviarPorResend}=require('../lib/lembretes-email');

function fixture(t){
  const db=banco.abrir(':memory:');t.after(()=>db.close());
  const admin={id:Number(banco.criarLoja(db,{nome:'Admin',email:'admin@teste.local',senha:'Senha-teste',admin:1})),admin:1};
  const conta=nome=>{const id=Number(banco.criarLoja(db,{nome,email:`${nome.toLowerCase()}@teste.local`,senha:'Senha-teste'}));db.prepare("UPDATE lojas SET papel='atendente' WHERE id=?").run(id);return id;};
  const ana=conta('Ana'),bia=conta('Bia');
  const loja=Number(banco.criarLoja(db,{nome:'Mercado',email:'mercado@teste.local',senha:'Senha-teste'}));db.prepare('UPDATE lojas SET atendente_id=? WHERE id=?').run(ana,loja);
  const cobrar=(tipo,vencimento)=>db.transaction(()=>f.criar(db,admin,{loja_id:loja,tipo,valor:7990,descricao:tipo,vencimento}))().id;
  return {db,admin,ana,bia,loja,cobrar};
}
// 22/10/2026 as 9h em Brasilia (12h UTC).
const agora=new Date('2026-10-22T12:00:00Z');

test('manda um resumo por pessoa com os lembretes da carteira dela, uma vez por dia',async t=>{
  const {db,cobrar}=fixture(t);const plano=cobrar('plano','2026-10-20');cobrar('suporte','2026-10-24');
  const pedido=crypto.randomUUID(),b={cobranca_id:plano,tipo:'recebimento',valor:7990,data:'2026-10-21',descricao:'Pix'};
  f.repetir(db,{id:1,admin:1},pedido,b,()=>f.movimentar(db,{id:1,admin:1},b,pedido));
  const enviados=[];const enviar=async m=>{enviados.push(m);};
  const r=await enviarResumos({db,agora,enviar,painelUrl:'https://painel.exemplo'});
  assert.equal(r.enviados,2);
  const para=Object.fromEntries(enviados.map(m=>[m.para,m]));
  assert.deepEqual(Object.keys(para).sort(),['admin@teste.local','ana@teste.local']);
  assert.match(para['admin@teste.local'].html,/Pagar|Gerar e pagar/);
  assert.doesNotMatch(para['ana@teste.local'].html,/Cardapio\.ai de Mercado/);
  assert.match(para['ana@teste.local'].assunto,/1 lembrete/);
  assert.match(para['ana@teste.local'].html,/https:\/\/painel\.exemplo\/gestao\.html/);
  assert.equal((await enviarResumos({db,agora,enviar})).enviados,0);assert.equal(enviados.length,2);
});

test('espera as 8h de Brasilia e continua os outros envios quando um falha',async t=>{
  const {db,cobrar}=fixture(t);cobrar('suporte','2026-10-22');
  assert.equal((await enviarResumos({db,agora:new Date('2026-10-22T10:00:00Z'),enviar:async()=>{throw new Error('nao devia enviar');}})).enviados,0);
  const tentativas=[];
  const r=await enviarResumos({db,agora,enviar:async m=>{tentativas.push(m.para);if(m.para==='admin@teste.local')throw new Error('caixa cheia');}});
  assert.equal(r.enviados,1);assert.equal(r.falhas,1);assert.equal(tentativas.length,2);
});

test('envia pelo Resend com a chave e o remetente configurados',async()=>{
  const chamadas=[];const fetch=async(url,opcoes)=>{chamadas.push({url,opcoes});return {ok:true,json:async()=>({id:'1'})};};
  await enviarPorResend({apiKey:'re_teste',de:'Painel <avisos@exemplo.com>',fetch})({para:'a@b.c',assunto:'Oi',html:'<p>x</p>',texto:'x'});
  assert.equal(chamadas[0].url,'https://api.resend.com/emails');
  assert.equal(chamadas[0].opcoes.headers.authorization,'Bearer re_teste');
  assert.deepEqual(JSON.parse(chamadas[0].opcoes.body),{from:'Painel <avisos@exemplo.com>',to:['a@b.c'],subject:'Oi',html:'<p>x</p>',text:'x'});
  const falha=enviarPorResend({apiKey:'k',de:'d',fetch:async()=>({ok:false,status:422,json:async()=>({message:'dominio nao verificado'})})});
  await assert.rejects(falha({para:'a',assunto:'b',html:'c',texto:'d'}),/dominio nao verificado/);
});
