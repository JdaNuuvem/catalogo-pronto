const crypto = require('crypto');
const {validarData,hoje} = require('./operacao');
const {auditar} = require('./gestao-banco');
const ATIVOS = "NOT EXISTS(SELECT 1 FROM movimentos e WHERE e.estorno_de=m.id) AND m.tipo<>'estorno'";
function dinheiro(v,nome='valor') {
  if (!Number.isSafeInteger(v) || v<1 || v>100000000) throw new Error(`${nome} deve ser um valor positivo em centavos`);
  return v;
}
function texto(v,nome,max=500) {
  if(typeof v!=='string'||!v.trim()||v.length>max) throw new Error(`${nome} invalido`);
  return v.trim();
}
function data(v) { const d=validarData(v);if(!d) throw new Error('informe a data');return d; }
function id(v) {if(!Number.isSafeInteger(v)||v<1) throw new Error('identificador invalido');return v;}
function cliente(db,lojaId) {
  const l=db.prepare("SELECT * FROM lojas WHERE id=? AND admin=0 AND papel='cliente' AND ativo=1").get(id(lojaId));
  if(!l) throw new Error('cliente ativo nao encontrado');return l;
}
function uma(db,cobrancaId) {
  const c=db.prepare(`SELECT c.*,l.nome AS cliente,a.nome AS atendente FROM cobrancas c
    JOIN lojas l ON l.id=c.loja_id LEFT JOIN lojas a ON a.id=c.atendente_id WHERE c.id=?`).get(id(cobrancaId));
  if(!c) throw new Error('cobranca nao encontrada');
  const somas=db.prepare(`SELECT m.tipo,COALESCE(SUM(m.valor),0) AS valor FROM movimentos m WHERE m.cobranca_id=? AND ${ATIVOS} GROUP BY m.tipo`).all(c.id);
  const s=Object.fromEntries(somas.map(m=>[m.tipo,m.valor]));
  const rateio=db.prepare(`SELECT COALESCE(SUM(r.valor),0) AS n FROM rateios r JOIN movimentos m ON m.id=r.movimento_id WHERE r.cobranca_id=? AND ${ATIVOS}`).get(c.id).n;
  const recebido=s.recebimento||0, custos=(s.despesa||0)+rateio, repassado=s.repasse||0;
  const base=Math.max(0,c.valor-(c.custos_fechados?custos:Math.max(custos,c.custo_previsto)));
  const previsao=c.tipo!=='plano'&&c.atendente_id?Math.floor(base/2):0;
  const liberado=c.custos_fechados&&c.tipo!=='plano'&&c.atendente_id
    ? Number(BigInt(base)*BigInt(recebido)/(BigInt(c.valor)*2n)):0;
  return {...c,recebido,custos,repassado,plataforma_paga:s.plataforma||0,
    pendente:c.cancelada?0:Math.max(0,c.valor-recebido),previsao,liberado,
    disponivel:Math.max(0,liberado-repassado),
    reserva:c.tipo==='plano'?Math.max(0,recebido-(s.plataforma||0)):0,
    estado:c.cancelada?'cancelada':recebido===c.valor?'paga':recebido?'parcial':'pendente'};
}
function listar(db,usuario) {
  const ids=db.prepare(`SELECT c.id FROM cobrancas c JOIN lojas l ON l.id=c.loja_id
    WHERE ${usuario.admin?'1=1':'l.atendente_id=? OR c.atendente_id=?'} ORDER BY c.vencimento,c.id`).all(...(usuario.admin?[]:[usuario.id,usuario.id]));
  return ids.map(c=>uma(db,c.id));
}
function criar(db,u,b) {
  const l=cliente(db,b.loja_id);
  if(!['implantacao','produtos','suporte','plano','outro'].includes(b.tipo)) throw new Error('tipo de cobranca invalido');
  const valor=dinheiro(b.valor),previsto=b.custo_previsto||0;
  if(!Number.isSafeInteger(previsto)||previsto<0||previsto>100000000)throw new Error('custo previsto invalido');
  if(b.tipo==='plano'&&previsto)throw new Error('plano da plataforma nao participa da divisao');
  const resultado=db.prepare(`INSERT INTO cobrancas(loja_id,atendente_id,tipo,descricao,valor,vencimento,custo_previsto)
    VALUES(?,?,?,?,?,?,?)`).run(l.id,l.atendente_id,b.tipo,texto(b.descricao,'descricao'),valor,data(b.vencimento),previsto);
  const novo=Number(resultado.lastInsertRowid);auditar(db,u,'cobranca criada',l.id,{id:novo,valor});return {id:novo};
}
function repetir(db,u,chave,corpo,executar) {
  if(typeof chave!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(chave)) throw new Error('identificador da operacao ausente');
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify({usuario:u.id,corpo})).digest('hex');
  return db.transaction(()=>{
    const anterior=db.prepare('SELECT * FROM pedidos_gestao WHERE chave=?').get(chave);
    if(anterior){if(anterior.fingerprint!==fingerprint)throw new Error('identificador ja usado em outra operacao');return JSON.parse(anterior.resultado);}
    const resultado=executar();db.prepare('INSERT INTO pedidos_gestao VALUES(?,?,?)').run(chave,fingerprint,JSON.stringify(resultado));return resultado;
  })();
}
function movimentar(db,u,b,pedido) {
  const valor=dinheiro(b.valor),quando=data(b.data),descricao=texto(b.descricao,'descricao');
  if(!['recebimento','despesa','plataforma','repasse'].includes(b.tipo))throw new Error('tipo de movimento invalido');
  const c=b.cobranca_id?uma(db,id(b.cobranca_id)):null;
  if(!c&&b.tipo!=='despesa')throw new Error('selecione a cobranca');
  if(c?.cancelada)throw new Error('cobranca cancelada');
  if(c&&b.tipo==='recebimento'&&valor>c.pendente)throw new Error('recebimento ultrapassa o saldo da cobranca');
  if(c&&b.tipo==='repasse'&&(c.tipo==='plano'||valor>c.disponivel))throw new Error('repasse ultrapassa o valor liberado; confira os custos');
  if(c&&b.tipo==='despesa'&&(c.tipo==='plano'||c.custos_fechados))throw new Error('reabra os custos do servico antes de lancar despesas');
  if(c&&b.tipo==='plataforma'&&(c.tipo!=='plano'||valor>c.reserva))throw new Error('pagamento ultrapassa a reserva recebida para o Cardapio.ai');
  const r=db.prepare(`INSERT INTO movimentos(cobranca_id,tipo,valor,data,descricao,categoria,atendente_id,autor_id,pedido)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(c?.id||null,b.tipo,valor,quando,descricao,String(b.categoria||'').slice(0,80),b.tipo==='repasse'?c.atendente_id:null,u.id,pedido);
  auditar(db,u,'movimento registrado',c?.loja_id,{id:Number(r.lastInsertRowid),tipo:b.tipo,valor});
  return {id:Number(r.lastInsertRowid)};
}
function estornar(db,u,movimentoId,b,pedido) {
  const m=db.prepare('SELECT * FROM movimentos WHERE id=?').get(id(movimentoId));
  if(!m||m.tipo==='estorno'||db.prepare('SELECT id FROM movimentos WHERE estorno_de=?').get(m.id))throw new Error('movimento nao pode ser estornado');
  const motivo=texto(b.motivo,'motivo');
  const r=db.prepare(`INSERT INTO movimentos(cobranca_id,tipo,valor,data,descricao,categoria,atendente_id,autor_id,estorno_de,pedido)
    VALUES(?,'estorno',?,?,?,?,?,?,?,?)`).run(m.cobranca_id,m.valor,data(b.data),motivo,m.categoria,m.atendente_id,u.id,m.id,pedido);
  const afetadas=m.cobranca_id?[m.cobranca_id]:db.prepare('SELECT cobranca_id FROM rateios WHERE movimento_id=?').all(m.id).map(r=>r.cobranca_id);
  for(const cid of afetadas){const c=uma(db,cid);if(c.repassado>c.liberado||c.plataforma_paga>c.recebido)throw new Error('estorne primeiro os repasses ou pagamentos vinculados');}
  auditar(db,u,'movimento estornado',null,{id:m.id,motivo});return {id:Number(r.lastInsertRowid)};
}
function custos(db,u,cid,fechados) {
  if(typeof fechados!=='boolean')throw new Error('informe se os custos estao fechados');
  const c=uma(db,cid);if(c.tipo==='plano'||c.cancelada)throw new Error('cobranca nao aceita custos');
  if(fechados&&db.prepare(`SELECT m.id FROM movimentos m WHERE m.tipo='despesa' AND m.cobranca_id IS NULL AND ${ATIVOS} AND NOT EXISTS(SELECT 1 FROM rateios r WHERE r.movimento_id=m.id) LIMIT 1`).get())throw new Error('rateie as despesas gerais antes de fechar os custos');
  if(!fechados&&c.repassado)throw new Error('estorne os repasses antes de reabrir os custos');
  db.prepare('UPDATE cobrancas SET custos_fechados=? WHERE id=?').run(fechados?1:0,c.id);
  auditar(db,u,fechados?'custos fechados':'custos reabertos',c.loja_id,{id:c.id});return {ok:true};
}
function ratear(db,u,mid,lista) {
  const m=db.prepare(`SELECT m.* FROM movimentos m WHERE m.id=? AND ${ATIVOS}`).get(id(mid));
  if(!m||m.tipo!=='despesa'||m.cobranca_id)throw new Error('selecione uma despesa geral ativa');
  if(!Array.isArray(lista)||!lista.length||lista.length>100)throw new Error('informe o rateio');
  const anteriores=db.prepare('SELECT cobranca_id FROM rateios WHERE movimento_id=?').all(m.id);
  const ids=new Set();let total=0;
  for(const r of lista){const c=uma(db,id(r.cobranca_id));if(c.custos_fechados||c.cancelada||c.tipo==='plano'||ids.has(c.id))throw new Error('servicos do rateio devem estar abertos e ser unicos');ids.add(c.id);total+=dinheiro(r.valor);}
  if(total!==m.valor)throw new Error('o rateio deve somar exatamente o valor da despesa');
  for(const a of anteriores)if(uma(db,a.cobranca_id).custos_fechados)throw new Error('reabra os custos dos rateios anteriores');
  db.prepare('DELETE FROM rateios WHERE movimento_id=?').run(m.id);
  for(const r of lista)db.prepare('INSERT INTO rateios VALUES(?,?,?)').run(m.id,r.cobranca_id,r.valor);
  auditar(db,u,'despesa rateada',null,{id:m.id,rateio:lista});return {ok:true};
}
function contrato(db,u,b) {
  const l=cliente(db,b.loja_id);if(!['suporte','plano'].includes(b.tipo))throw new Error('tipo de contrato invalido');
  const inicio=data(b.inicio);const dia=Number(inicio.slice(-2));
  const novo=db.prepare('INSERT INTO contratos(loja_id,tipo,valor,inicio,dia) VALUES(?,?,?,?,?)').run(l.id,b.tipo,dinheiro(b.valor),inicio,dia);
  auditar(db,u,'contrato iniciado',l.id,{id:Number(novo.lastInsertRowid)});return {id:Number(novo.lastInsertRowid)};
}
function gerar(db,ate=hoje().slice(0,7)) {
  if(!/^\d{4}-\d{2}$/.test(ate))throw new Error('competencia invalida');data(ate+'-01');
  return db.transaction(()=>{
    let n=0;
    const contratos=db.prepare("SELECT t.*,l.atendente_id FROM contratos t JOIN lojas l ON l.id=t.loja_id WHERE t.ativo=1 AND l.ativo=1 AND l.etapa<>'pausada'").all();
    for(const t of contratos){
      const inicio=new Date(t.inicio.slice(0,7)+'-01T12:00:00Z');
      for(let i=0;i<120;i++){
        const mes=inicio.toISOString().slice(0,7);if(mes>ate)break;
        const ultimo=new Date(Date.UTC(inicio.getUTCFullYear(),inicio.getUTCMonth()+1,0)).getUTCDate();
        const vencimento=mes+'-'+String(Math.min(t.dia,ultimo)).padStart(2,'0');
        n+=db.prepare(`INSERT OR IGNORE INTO cobrancas(loja_id,atendente_id,contrato_id,tipo,descricao,valor,vencimento,competencia)
          VALUES(?,?,?,?,?,?,?,?)`).run(t.loja_id,t.atendente_id,t.id,t.tipo,`${t.tipo==='plano'?'Plano Cardapio.ai':'Suporte'} ${mes}`,t.valor,vencimento,mes).changes;
        inicio.setUTCMonth(inicio.getUTCMonth()+1);
      }
    }return {criadas:n};
  })();
}
function resumo(db,usuario,inicio,fim) {
  data(inicio);data(fim);if(inicio>fim)throw new Error('periodo invalido');
  const cobrancas=listar(db,usuario);
  const movimentos=db.prepare(`SELECT m.*,c.loja_id,c.descricao AS cobranca,l.nome AS cliente,
    (SELECT id FROM movimentos WHERE estorno_de=m.id) AS estornado_por FROM movimentos m
    LEFT JOIN cobrancas c ON c.id=m.cobranca_id LEFT JOIN lojas l ON l.id=c.loja_id
    WHERE ${usuario.admin?'1=1':"(m.tipo='repasse' OR (m.tipo='estorno' AND m.atendente_id IS NOT NULL)) AND m.atendente_id=?"}
    ORDER BY m.data DESC,m.id DESC`).all(...(usuario.admin?[]:[usuario.id]));
  if(!usuario.admin)return {cobrancas:cobrancas.map(c=>({...c,custo_previsto:undefined,custos:undefined})),movimentos,contratos:[],resumo:{disponivel:cobrancas.filter(c=>c.atendente_id===usuario.id).reduce((n,c)=>n+c.disponivel,0)}};
  const periodo=movimentos.filter(m=>m.data>=inicio&&m.data<=fim);
  const porId=new Map(movimentos.map(m=>[m.id,m]));
  const totais={recebido:0,receita_servicos:0,recebido_plano:0,despesas:0,plataforma:0,repasses:0};
  for(const m of periodo){const origem=m.tipo==='estorno'?porId.get(m.estorno_de):m;const sinal=m.tipo==='estorno'?-1:1;
    if(!origem)continue;const v=m.valor*sinal;
    if(origem.tipo==='recebimento'){totais.recebido+=v;const c=cobrancas.find(c=>c.id===origem.cobranca_id);totais[c?.tipo==='plano'?'recebido_plano':'receita_servicos']+=v;}
    if(origem.tipo==='despesa')totais.despesas+=v;if(origem.tipo==='repasse')totais.repasses+=v;if(origem.tipo==='plataforma')totais.plataforma+=v;
  }
  const semRateio=db.prepare(`SELECT COALESCE(SUM(m.valor),0) AS n FROM movimentos m WHERE m.tipo='despesa' AND m.cobranca_id IS NULL AND ${ATIVOS} AND NOT EXISTS(SELECT 1 FROM rateios r WHERE r.movimento_id=m.id)`).get().n;
  const earnedAt=(cutoff)=>{
    let soma=0;
    for(const c of cobrancas){if(c.tipo==='plano'||!c.atendente_id||!c.custos_fechados)continue;
      let recebido=0;for(const m of movimentos){if(m.cobranca_id!==c.id||m.data>cutoff)continue;const orig=m.tipo==='estorno'?porId.get(m.estorno_de):m;if(orig?.tipo==='recebimento')recebido+=m.valor*(m.tipo==='estorno'?-1:1);}
      soma+=Number(BigInt(Math.max(0,c.valor-c.custos))*BigInt(Math.max(0,recebido))/(BigInt(c.valor)*2n));
    }return soma;
  };
  const anterior=new Date(inicio+'T12:00:00Z');anterior.setUTCDate(anterior.getUTCDate()-1);
  const comissao=earnedAt(fim)-earnedAt(anterior.toISOString().slice(0,10));
  return {cobrancas,movimentos,contratos:db.prepare('SELECT t.*,l.nome AS cliente FROM contratos t JOIN lojas l ON l.id=t.loja_id ORDER BY t.id DESC').all(),
    resumo:{...totais,comissao,caixa:totais.recebido-totais.despesas-totais.plataforma-totais.repasses,
      resultado:totais.receita_servicos-totais.despesas-comissao,
      pendente:cobrancas.reduce((n,c)=>n+c.pendente,0),reserva:cobrancas.reduce((n,c)=>n+c.reserva,0),
      disponivel:cobrancas.reduce((n,c)=>n+c.disponivel,0),custos_abertos:cobrancas.filter(c=>c.tipo!=='plano'&&!c.cancelada&&!c.custos_fechados).length,
      despesas_sem_rateio:semRateio}};
}
module.exports={dinheiro,texto,data,id,cliente,uma,listar,criar,repetir,movimentar,estornar,custos,ratear,contrato,gerar,resumo};
