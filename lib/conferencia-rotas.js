const {auditar}=require('./gestao-banco');

/**
 * Leituras que o app desktop faz no Cardapio.ai e manda para o painel.
 *
 * Conferencia do catalogo: ele le a loja no Cardapio.ai,
 * compara com o que publicamos e manda o resultado para ca. A equipe ve a
 * ultima conferencia na ficha da loja.
 */
const SITUACOES=['ok','atencao','bloqueante'];
const MAX_PROBLEMAS=500;

function montar(app,{db,exigirLogin,exigirApp}){
  db.exec(`CREATE TABLE IF NOT EXISTS conferencias (
    id INTEGER PRIMARY KEY, loja_id INTEGER NOT NULL REFERENCES lojas(id), autor_id INTEGER REFERENCES lojas(id),
    situacao TEXT NOT NULL, totais TEXT NOT NULL, problemas TEXT NOT NULL, criada_em TEXT NOT NULL DEFAULT (datetime('now')))`);
  const naCarteira=(req,res,next)=>{
    const u=req.loja,c=db.prepare("SELECT * FROM lojas WHERE id=? AND admin=0 AND papel='cliente'").get(Number(req.params.id));
    if(!c||(!u.admin&&(u.papel!=='atendente'||c.atendente_id!==u.id)))return res.status(403).json({erro:'cliente fora da sua carteira'});
    req.cliente=c;next();
  };
  const ultima=lojaId=>{
    const r=db.prepare('SELECT c.*,l.nome AS autor FROM conferencias c LEFT JOIN lojas l ON l.id=c.autor_id WHERE c.loja_id=? ORDER BY c.id DESC LIMIT 1').get(lojaId);
    return r?{situacao:r.situacao,totais:JSON.parse(r.totais),problemas:JSON.parse(r.problemas),criada_em:r.criada_em,autor:r.autor}:null;
  };

  // O que publicamos pelo painel nesta loja: e contra isso que a loja e conferida.
  app.get('/api/app/lojas/:id/conferencia/esperados',exigirApp,naCarteira,(req,res)=>{
    const esperados=db.prepare(`SELECT i.titulo,i.preco,i.categoria FROM itens i JOIN lotes l ON l.id=i.lote_id
      WHERE l.loja_id=? AND i.estado='enviado' AND i.titulo<>'' ORDER BY i.id`).all(req.cliente.id);
    res.json({contratados:req.cliente.produtos_contratados||0,esperados});
  });
  app.post('/api/app/lojas/:id/conferencia',exigirApp,naCarteira,(req,res)=>{
    const b=req.body||{};
    if(!SITUACOES.includes(b.situacao)||typeof b.totais!=='object'||!Array.isArray(b.problemas))return res.status(400).json({erro:'resultado de conferencia invalido'});
    const problemas=b.problemas.slice(0,MAX_PROBLEMAS).map(p=>({tipo:String(p?.tipo||'').slice(0,40),nivel:p?.nivel==='bloqueante'?'bloqueante':'atencao',
      produto:p?.produto?String(p.produto).slice(0,160):null,detalhe:String(p?.detalhe||'').slice(0,240)}));
    const totais=Object.fromEntries(Object.entries(b.totais).filter(([,v])=>Number.isSafeInteger(v)).slice(0,20));
    db.prepare('INSERT INTO conferencias(loja_id,autor_id,situacao,totais,problemas) VALUES(?,?,?,?,?)')
      .run(req.cliente.id,req.loja.id,b.situacao,JSON.stringify(totais),JSON.stringify(problemas));
    auditar(db,req.loja,'catalogo conferido pelo app',req.cliente.id,{situacao:b.situacao,problemas:problemas.length});
    res.json(ultima(req.cliente.id));
  });
  app.get('/api/gestao/clientes/:id/conferencia',exigirLogin,naCarteira,(req,res)=>res.json(ultima(req.cliente.id)||{}));

  // Plano da loja no Cardapio.ai: o app le a tela de plano e manda para ca (alimenta os lembretes).
  const dataIso=v=>v===null||v===undefined||v===''?null:/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))?v:undefined;
  app.post('/api/app/lojas/:id/plano',exigirApp,naCarteira,(req,res)=>{
    const b=req.body||{},valido=dataIso(b.valido_ate),teste=dataIso(b.teste_ate);
    if(valido===undefined||teste===undefined||(b.valor_centavos!=null&&!Number.isSafeInteger(b.valor_centavos)))return res.status(400).json({erro:'plano invalido'});
    const texto=(v,max)=>v?String(v).slice(0,max):null;
    db.prepare(`UPDATE lojas SET cdp_plano=?,cdp_plano_periodo=?,cdp_plano_valor=?,cdp_plano_valido_ate=?,cdp_plano_teste_ate=?,cdp_plano_situacao=?,cdp_plano_lido_em=datetime('now') WHERE id=?`)
      .run(texto(b.plano,60),texto(b.periodo,20),b.valor_centavos??null,valido,teste,texto(b.situacao,120),req.cliente.id);
    res.json({ok:true});
  });
}

module.exports={montar};
