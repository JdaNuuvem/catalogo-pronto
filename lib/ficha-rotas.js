const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const multer=require('multer');
const {auditar}=require('./gestao-banco');
const {validarFicha}=require('./ficha');

/**
 * Ficha de implantacao de cada loja.
 *
 * - A equipe (admin ou atendente da carteira) le, salva e gera o link do cliente.
 * - O cliente abre o link sem login: o token vai no "#" do endereco e chega aqui
 *   no cabecalho x-ficha-token. Do token o banco guarda so o hash; gerar outro
 *   link derruba o anterior, e ele vence em 30 dias.
 * - Logo e capa sao imagens guardadas como materiais da loja.
 * - O app desktop le a ficha para o assistente de implantacao.
 */
const VALIDADE_LINK_DIAS=30;
const TIPOS_IMAGEM={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'};
const hash=t=>crypto.createHash('sha256').update(String(t)).digest('hex');

function montar(app,{db,exigirLogin,exigirApp,pastaDados}){
  db.exec(`CREATE TABLE IF NOT EXISTS fichas (
    loja_id INTEGER PRIMARY KEY REFERENCES lojas(id), dados TEXT NOT NULL DEFAULT '{}',
    link_hash TEXT UNIQUE, link_expira TEXT, enviada_em TEXT,
    atualizado_por INTEGER REFERENCES lojas(id), atualizado_em TEXT NOT NULL DEFAULT (datetime('now')))`);
  const raiz=path.join(pastaDados,'materiais');

  const ler=lojaId=>{const r=db.prepare('SELECT * FROM fichas WHERE loja_id=?').get(lojaId);return {linha:r,dados:r?JSON.parse(r.dados):{}};};
  const vista=lojaId=>{
    const {linha,dados}=ler(lojaId),{ficha,completo}=validarFicha(dados);
    return {ficha,completo,enviada_em:linha?.enviada_em||null,atualizado_em:linha?.atualizado_em||null,
      link_ativo:!!(linha?.link_hash&&linha.link_expira>new Date().toISOString())};
  };
  /** Junta as secoes recebidas na ficha gravada. Logo e capa so mudam pelo envio de imagem. */
  function salvar(lojaId,corpo,autorId){
    const {dados}=ler(lojaId),novo={...dados};
    for(const [secao,valor] of Object.entries(corpo||{}))if(valor&&typeof valor==='object'||secao==='observacoes')novo[secao]=valor;
    if(corpo?.marca)novo.marca={...corpo.marca,logo_material:dados.marca?.logo_material??null,capa_material:dados.marca?.capa_material??null};
    const {ficha,erros}=validarFicha(novo);
    if(erros.length)return {erros};
    db.prepare(`INSERT INTO fichas(loja_id,dados,atualizado_por) VALUES(?,?,?)
      ON CONFLICT(loja_id) DO UPDATE SET dados=excluded.dados,atualizado_por=excluded.atualizado_por,atualizado_em=datetime('now')`).run(lojaId,JSON.stringify(ficha),autorId);
    return {ok:true};
  }
  const responder=(res,lojaId,r)=>r.erros?res.status(400).json({erro:'confira os campos marcados',erros:r.erros}):res.json(vista(lojaId));

  // Loja da carteira de quem pediu (admin: qualquer cliente).
  const naCarteira=(req,res,next)=>{
    const u=req.loja,c=db.prepare("SELECT * FROM lojas WHERE id=? AND admin=0 AND papel='cliente'").get(Number(req.params.id));
    if(!c||(!u.admin&&(u.papel!=='atendente'||c.atendente_id!==u.id)))return res.status(403).json({erro:'cliente fora da sua carteira'});
    req.cliente=c;next();
  };
  const pelaLink=(req,res,next)=>{
    const t=String(req.get('x-ficha-token')||'');
    const linha=t.length>=30&&db.prepare("SELECT f.loja_id FROM fichas f JOIN lojas l ON l.id=f.loja_id WHERE f.link_hash=? AND f.link_expira>? AND l.ativo=1").get(hash(t),new Date().toISOString());
    if(!linha)return res.status(401).json({erro:'este link expirou ou foi trocado; peça um novo ao seu atendente'});
    req.cliente=db.prepare('SELECT * FROM lojas WHERE id=?').get(linha.loja_id);next();
  };

  const upload=multer({storage:multer.diskStorage({
    destination:(req,file,cb)=>{const p=path.join(raiz,String(req.cliente.id));fs.mkdirSync(p,{recursive:true});cb(null,p);},
    filename:(req,file,cb)=>cb(null,crypto.randomUUID()+(TIPOS_IMAGEM[file.mimetype]||''))}),
    limits:{fileSize:3*1024*1024,files:1},
    fileFilter:(req,file,cb)=>cb(TIPOS_IMAGEM[file.mimetype]?null:new Error('envie JPEG, PNG ou WebP'),!!TIPOS_IMAGEM[file.mimetype])});
  function guardarImagem(req,res,autorId){
    const tipo=req.query.tipo;
    if(!['logo','capa'].includes(tipo)||!req.file){if(req.file)fs.unlinkSync(req.file.path);return res.status(400).json({erro:'envie a imagem do logo ou da capa'});}
    const lojaId=req.cliente.id;
    const id=Number(db.prepare('INSERT INTO materiais(loja_id,arquivo,nome,tipo,finalidade,autor_id) VALUES(?,?,?,?,?,?)')
      .run(lojaId,req.file.filename,req.file.originalname.slice(0,250),req.file.mimetype,tipo,autorId).lastInsertRowid);
    const {dados}=ler(lojaId),marca={...(dados.marca||{}),[`${tipo}_material`]:id};
    db.prepare(`INSERT INTO fichas(loja_id,dados,atualizado_por) VALUES(?,?,?)
      ON CONFLICT(loja_id) DO UPDATE SET dados=excluded.dados,atualizado_por=excluded.atualizado_por,atualizado_em=datetime('now')`)
      .run(lojaId,JSON.stringify({...dados,marca}),autorId);
    auditar(db,{id:autorId},`${tipo} recebido pela ficha`,lojaId,{material:id});
    res.json(vista(lojaId));
  }
  function enviarImagem(req,res){
    const {dados}=ler(req.cliente.id),id=dados.marca?.[`${req.params.tipo}_material`];
    const m=id&&db.prepare('SELECT * FROM materiais WHERE id=? AND loja_id=?').get(id,req.cliente.id);
    if(!m)return res.status(404).json({erro:'imagem ainda nao enviada'});
    res.type(m.tipo).sendFile(path.resolve(raiz,String(m.loja_id),path.basename(m.arquivo)));
  }
  const comUpload=(fn)=>(req,res)=>upload.single('imagem')(req,res,e=>e?res.status(400).json({erro:e.code==='LIMIT_FILE_SIZE'?'a imagem pode ter até 3MB':e.message}):fn(req,res));

  // --------------------------------------------------------------- equipe
  app.get('/api/gestao/clientes/:id/ficha',exigirLogin,naCarteira,(req,res)=>res.json(vista(req.cliente.id)));
  app.put('/api/gestao/clientes/:id/ficha',exigirLogin,naCarteira,(req,res)=>{
    const r=salvar(req.cliente.id,req.body,req.loja.id);
    if(r.ok)auditar(db,req.loja,'ficha de implantacao atualizada',req.cliente.id,{});
    responder(res,req.cliente.id,r);
  });
  app.post('/api/gestao/clientes/:id/ficha/imagem',exigirLogin,naCarteira,comUpload((req,res)=>guardarImagem(req,res,req.loja.id)));
  app.get('/api/gestao/clientes/:id/ficha/imagem/:tipo',exigirLogin,naCarteira,enviarImagem);
  app.post('/api/gestao/clientes/:id/ficha/link',exigirLogin,naCarteira,(req,res)=>{
    const token=crypto.randomBytes(24).toString('base64url'),expira=new Date(Date.now()+VALIDADE_LINK_DIAS*86400000).toISOString();
    db.prepare(`INSERT INTO fichas(loja_id,link_hash,link_expira,atualizado_por) VALUES(?,?,?,?)
      ON CONFLICT(loja_id) DO UPDATE SET link_hash=excluded.link_hash,link_expira=excluded.link_expira`).run(req.cliente.id,hash(token),expira,req.loja.id);
    auditar(db,req.loja,'link da ficha gerado',req.cliente.id,{expira});
    const origem=process.env.DOMINIO?`https://${process.env.DOMINIO}`:`${req.get('x-forwarded-proto')||req.protocol}://${req.get('host')}`;
    res.json({url:`${origem}/ficha.html#t=${token}`,expira});
  });

  // --------------------------------------------------------------- cliente
  app.get('/api/ficha-publica',pelaLink,(req,res)=>res.json({loja:req.cliente.nome,...vista(req.cliente.id)}));
  app.put('/api/ficha-publica',pelaLink,(req,res)=>responder(res,req.cliente.id,salvar(req.cliente.id,req.body,req.cliente.id)));
  app.post('/api/ficha-publica/imagem',pelaLink,comUpload((req,res)=>guardarImagem(req,res,req.cliente.id)));
  app.get('/api/ficha-publica/imagem/:tipo',pelaLink,enviarImagem);
  // O cliente avisa que terminou: o responsavel pela loja ganha uma tarefa para conferir.
  app.post('/api/ficha-publica/enviar',pelaLink,(req,res)=>{
    const c=req.cliente;
    db.transaction(()=>{
      db.prepare("UPDATE fichas SET enviada_em=datetime('now') WHERE loja_id=?").run(c.id);
      const aberta=db.prepare("SELECT 1 FROM tarefas WHERE loja_id=? AND titulo LIKE 'Ficha de implantação%' AND estado<>'concluida'").get(c.id);
      if(!aberta)db.prepare(`INSERT INTO tarefas(loja_id,responsavel_id,tipo,titulo,descricao,prioridade,prazo) VALUES(?,?,'implantacao',?,?,'alta',date('now'))`)
        .run(c.id,c.atendente_id,'Ficha de implantação recebida','O cliente enviou a ficha pelo link. Confira os dados e rode o assistente de implantação no app.');
      auditar(db,{id:c.id},'ficha enviada pelo cliente',c.id,{});
    })();
    res.json(vista(c.id));
  });

  // --------------------------------------------------------------- app desktop
  app.get('/api/app/lojas/:id/ficha',exigirApp,naCarteira,(req,res)=>res.json(vista(req.cliente.id)));
  app.get('/api/app/lojas/:id/ficha/imagem/:tipo',exigirApp,naCarteira,enviarImagem);
}

module.exports={montar};
