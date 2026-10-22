/**
 * Passos da implantacao no app desktop: o que a equipe ja montou no Cardapio.ai
 * para cada loja. A ficha diz se os dados existem; aqui fica se o passo foi feito.
 */
const {auditar}=require('./gestao-banco');

const PASSOS=['ficha','endereco','marca','horarios','entrega','pagamento','produtos','adicionais','conferencia','entrega_cliente'];
const ESTADOS=['pendente','feito','pulado'];

function passosDaLoja(db,lojaId){
  const linhas=db.prepare('SELECT passo,estado,atualizado_em FROM implantacao_passos WHERE loja_id=?').all(lojaId);
  const porPasso=Object.fromEntries(linhas.map(l=>[l.passo,{estado:l.estado,atualizado_em:l.atualizado_em}]));
  return Object.fromEntries(PASSOS.map(p=>[p,porPasso[p]||{estado:'pendente',atualizado_em:null}]));
}

function montar(app,{db,exigirApp}){
  db.exec(`CREATE TABLE IF NOT EXISTS implantacao_passos (
    loja_id INTEGER NOT NULL REFERENCES lojas(id), passo TEXT NOT NULL, estado TEXT NOT NULL,
    autor_id INTEGER REFERENCES lojas(id), atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (loja_id,passo))`);

  const naCarteira=(req,res,next)=>{
    const u=req.loja,c=db.prepare("SELECT * FROM lojas WHERE id=? AND admin=0 AND papel='cliente'").get(Number(req.params.id));
    if(!c||(!u.admin&&(u.papel!=='atendente'||c.atendente_id!==u.id)))return res.status(403).json({erro:'cliente fora da sua carteira'});
    req.cliente=c;next();
  };

  app.get('/api/app/lojas/:id/implantacao',exigirApp,naCarteira,(req,res)=>res.json({passos:passosDaLoja(db,req.cliente.id)}));
  app.put('/api/app/lojas/:id/implantacao/:passo',exigirApp,naCarteira,(req,res)=>{
    const {passo}=req.params,estado=req.body?.estado;
    if(!PASSOS.includes(passo)||!ESTADOS.includes(estado))return res.status(400).json({erro:'passo ou estado invalido'});
    db.prepare(`INSERT INTO implantacao_passos(loja_id,passo,estado,autor_id) VALUES(?,?,?,?)
      ON CONFLICT(loja_id,passo) DO UPDATE SET estado=excluded.estado,autor_id=excluded.autor_id,atualizado_em=datetime('now')`).run(req.cliente.id,passo,estado,req.loja.id);
    auditar(db,req.loja,`passo da implantacao: ${passo} ${estado}`,req.cliente.id,{});
    res.json({passos:passosDaLoja(db,req.cliente.id)});
  });
}

module.exports={montar,passosDaLoja,PASSOS};
