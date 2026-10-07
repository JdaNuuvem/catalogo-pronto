const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const banco=require('../lib/banco');const f=require('../lib/financeiro');
process.env.CHAVE_CRIPTO=crypto.randomBytes(32).toString('hex');
function fixture(t){
  const db=banco.abrir(':memory:');t.after(()=>db.close());
  const usuario={id:Number(banco.criarLoja(db,{nome:'Admin',email:'admin@teste.local',senha:'Senha-teste',admin:1})),admin:1};
  const atendente=Number(banco.criarLoja(db,{nome:'Equipe',email:'equipe@teste.local',senha:'Senha-teste'}));
  db.prepare("UPDATE lojas SET papel='atendente' WHERE id=?").run(atendente);
  const loja=Number(banco.criarLoja(db,{nome:'Loja',email:'loja@teste.local',senha:'Senha-teste'}));db.prepare('UPDATE lojas SET atendente_id=? WHERE id=?').run(atendente,loja);
  const criar=(tipo='implantacao',valor=44500)=>db.transaction(()=>f.criar(db,usuario,{loja_id:loja,tipo,valor,descricao:tipo,vencimento:'2026-10-15',custo_previsto:tipo==='plano'?0:4500}))().id;
  const mov=(cid,tipo,valor,data='2026-10-07')=>{const pedido=crypto.randomUUID(),b={cobranca_id:cid,tipo,valor,data,descricao:tipo};return f.repetir(db,usuario,pedido,b,()=>f.movimentar(db,usuario,b,pedido)).id;};
  const estornar=mid=>{const pedido=crypto.randomUUID(),b={motivo:'Correcao',data:'2026-10-08'};return f.repetir(db,usuario,pedido,{mid,...b},()=>f.estornar(db,usuario,mid,b,pedido));};
  return {db,usuario,atendente,loja,criar,mov,estornar};
}
test('desconta custos e libera metade proporcional aos pagamentos parciais',t=>{
  const {db,usuario,criar,mov}=fixture(t),c=criar();mov(c,'recebimento',22250);
  assert.equal(f.uma(db,c).disponivel,0);assert.equal(f.uma(db,c).previsao,20000);
  mov(c,'despesa',4500);f.custos(db,usuario,c,true);
  assert.equal(f.uma(db,c).disponivel,10000);mov(c,'repasse',10000);assert.equal(f.uma(db,c).disponivel,0);
  mov(c,'recebimento',22250);assert.equal(f.uma(db,c).disponivel,10000);
  const r=f.resumo(db,usuario,'2026-10-01','2026-10-31').resumo;
  assert.equal(r.receita_servicos,44500);assert.equal(r.comissao,20000);assert.equal(r.resultado,20000);assert.equal(r.caixa,30000);
});
test('plano recebido fica reservado, sem custos ou comissoes e sem pagar alem da reserva',t=>{
  const {db,criar,mov}=fixture(t),c=criar('plano',9990);
  mov(c,'recebimento',5000);assert.equal(f.uma(db,c).reserva,5000);assert.equal(f.uma(db,c).previsao,0);
  assert.throws(()=>mov(c,'plataforma',6000),/reserva/);assert.throws(()=>mov(c,'repasse',1),/repasse/);
  mov(c,'plataforma',5000);assert.equal(f.uma(db,c).reserva,0);assert.equal(f.uma(db,c).plataforma_paga,5000);
});
test('retries nao duplicam movimentos e nao aceitam reutilizar a chave com outro valor',t=>{
  const {db,usuario,criar}=fixture(t),c=criar(),pedido=crypto.randomUUID(),b={cobranca_id:c,tipo:'recebimento',valor:1000,data:'2026-10-07',descricao:'Parcial'};
  const rodar=()=>f.repetir(db,usuario,pedido,b,()=>f.movimentar(db,usuario,b,pedido));assert.deepEqual(rodar(),rodar());
  assert.equal(f.uma(db,c).recebido,1000);
  assert.throws(()=>f.repetir(db,usuario,pedido,{...b,valor:2000},()=>({})),/outra operacao/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM movimentos').get().n,1);
});
test('estorno exige desfazer o repasse primeiro, preserva historico e transacao falha sem efeitos',t=>{
  const {db,usuario,criar,mov,estornar}=fixture(t),c=criar(),recebimento=mov(c,'recebimento',44500);
  mov(c,'despesa',4500);f.custos(db,usuario,c,true);const repasse=mov(c,'repasse',20000);
  assert.throws(()=>estornar(recebimento),/primeiro/);assert.equal(f.uma(db,c).recebido,44500);
  estornar(repasse);estornar(recebimento);assert.equal(f.uma(db,c).recebido,0);assert.equal(f.uma(db,c).repassado,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM movimentos WHERE tipo='estorno'").get().n,2);
  assert.throws(()=>estornar(recebimento),/nao pode/);
});
test('rateia despesas gerais exatamente, bloqueia fechamento indevido e elimina dupla contagem',t=>{
  const {db,usuario,criar,mov}=fixture(t),a=criar(),b=criar(),despesa=mov(null,'despesa',5000);
  assert.throws(()=>f.ratear(db,usuario,despesa,[{cobranca_id:a,valor:4000}]),/somar exatamente/);
  f.ratear(db,usuario,despesa,[{cobranca_id:a,valor:3000},{cobranca_id:b,valor:2000}]);
  assert.equal(f.uma(db,a).custos,3000);assert.equal(f.uma(db,b).custos,2000);
  f.custos(db,usuario,a,true);assert.throws(()=>f.ratear(db,usuario,despesa,[{cobranca_id:a,valor:5000}]),/abertos/);
  assert.equal(f.resumo(db,usuario,'2026-10-01','2026-10-31').resumo.despesas,5000);
});
test('custos fechados impedem novos gastos e repasse maior que saldo; transferencias preservam beneficiario',t=>{
  const {db,usuario,loja,atendente,criar,mov}=fixture(t),c=criar();mov(c,'recebimento',44500);mov(c,'despesa',4500);f.custos(db,usuario,c,true);
  assert.throws(()=>mov(c,'despesa',100),/reabra/);assert.throws(()=>mov(c,'repasse',20001),/ultrapassa/);
  db.prepare('UPDATE lojas SET atendente_id=NULL WHERE id=?').run(loja);assert.equal(f.uma(db,c).atendente_id,atendente);
  mov(c,'repasse',20000);assert.throws(()=>f.custos(db,usuario,c,false),/estorne/);
});
test('recorrencias preservam o dia 31, sao unicas e respeitam pausa e encerramento',t=>{
  const {db,usuario,loja}=fixture(t);
  const contrato=f.contrato(db,usuario,{loja_id:loja,tipo:'suporte',valor:18000,inicio:'2026-01-31'}).id;
  assert.equal(f.gerar(db,'2026-03').criadas,3);assert.equal(f.gerar(db,'2026-03').criadas,0);
  assert.deepEqual(db.prepare('SELECT vencimento FROM cobrancas ORDER BY vencimento').all().map(c=>c.vencimento),['2026-01-31','2026-02-28','2026-03-31']);
  db.prepare("UPDATE lojas SET etapa='pausada' WHERE id=?").run(loja);assert.equal(f.gerar(db,'2026-04').criadas,0);
  db.prepare("UPDATE lojas SET etapa='ativa' WHERE id=?").run(loja);db.prepare('UPDATE contratos SET ativo=0 WHERE id=?').run(contrato);
  assert.equal(f.gerar(db,'2026-04').criadas,0);
});
test('relatorios respeitam periodo e estornos realizados em outro mes',t=>{
  const {db,usuario,criar,mov}=fixture(t),c=criar('plano',5000);mov(c,'recebimento',5000,'2026-09-30');
  const recebido=db.prepare("SELECT id FROM movimentos WHERE tipo='recebimento'").get().id;
  const pedido=crypto.randomUUID(),b={motivo:'Devolucao',data:'2026-10-01'};
  f.repetir(db,usuario,pedido,b,()=>f.estornar(db,usuario,recebido,b,pedido));
  assert.equal(f.resumo(db,usuario,'2026-09-01','2026-09-30').resumo.recebido,5000);
  assert.equal(f.resumo(db,usuario,'2026-10-01','2026-10-31').resumo.recebido,-5000);
});
test('centavos impares nunca liberam mais que metade e dinheiro invalido e rejeitado',t=>{
  const {db,usuario,criar,mov}=fixture(t),c=criar('outro',101);f.custos(db,usuario,c,true);
  mov(c,'recebimento',50);assert.equal(f.uma(db,c).liberado,25);mov(c,'recebimento',51);assert.equal(f.uma(db,c).liberado,50);
  for(const v of [0,-1,1.5,NaN,Infinity,'100'])assert.throws(()=>f.dinheiro(v));
  assert.throws(()=>mov(c,'recebimento',1),/ultrapassa/);
});
