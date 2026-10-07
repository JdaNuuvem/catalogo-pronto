const fs=require('fs');const path=require('path');const crypto=require('crypto');
const multer=require('multer');const {auditar}=require('./gestao-banco');
function montar(app,{db,exigirLogin,pastaDados,fila,configIa,lerCategorias}){
  const acesso=(req,res,next)=>{
    const c=db.prepare("SELECT * FROM lojas WHERE id=? AND admin=0 AND papel='cliente' AND ativo=1").get(req.params.id);
    if(!c||(!req.loja.admin&&(req.loja.papel!=='atendente'||c.atendente_id!==req.loja.id)))return res.status(403).json({erro:'cliente fora da sua carteira'});
    req.clienteMaterial=c;next();
  };
  const raiz=path.join(pastaDados,'materiais');
  const upload=multer({storage:multer.diskStorage({destination:(req,file,cb)=>{const p=path.join(raiz,String(req.clienteMaterial.id));fs.mkdirSync(p,{recursive:true});cb(null,p);},
    filename:(req,file,cb)=>cb(null,crypto.randomUUID()+({ 'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[file.mimetype]||''))}),
    limits:{fileSize:3*1024*1024,files:60},fileFilter:(req,file,cb)=>cb(['image/png','image/jpeg','image/webp'].includes(file.mimetype)?null:new Error('envie JPEG, PNG ou WebP'),['image/png','image/jpeg','image/webp'].includes(file.mimetype))});
  app.post('/api/gestao/clientes/:id/materiais',exigirLogin,acesso,upload.array('fotos',60),(req,res)=>{
    const arquivos=req.files||[];
    try{
      if(!arquivos.length)throw new Error('envie ao menos uma foto');
      const finalidade=req.body.finalidade||'produto';if(!['produto','branding'].includes(finalidade))throw new Error('finalidade invalida');
      const ids=db.transaction(()=>arquivos.map(a=>{
        const r=db.prepare('INSERT INTO materiais(loja_id,arquivo,nome,tipo,finalidade,autor_id) VALUES(?,?,?,?,?,?)').run(req.clienteMaterial.id,a.filename,a.originalname.slice(0,250),a.mimetype,finalidade,req.loja.id);
        auditar(db,req.loja,'material recebido',req.clienteMaterial.id,{id:Number(r.lastInsertRowid)});return Number(r.lastInsertRowid);
      }))();res.json({ids});
    }catch(e){for(const a of arquivos)fs.unlinkSync(a.path);res.status(400).json({erro:e.message});}
  });
  app.get('/api/gestao/clientes/:id/materiais/:material/foto',exigirLogin,acesso,(req,res)=>{
    const m=db.prepare('SELECT * FROM materiais WHERE id=? AND loja_id=?').get(req.params.material,req.clienteMaterial.id);
    if(!m)return res.status(404).end();res.type(m.tipo).sendFile(path.resolve(raiz,String(m.loja_id),path.basename(m.arquivo)));
  });
  app.post('/api/gestao/clientes/:id/materiais/:material/analisar',exigirLogin,acesso,async(req,res)=>{
    if(!req.loja.admin)return res.status(403).json({erro:'analise por IA restrita ao administrador'});
    try{const m=db.prepare('SELECT * FROM materiais WHERE id=? AND loja_id=?').get(req.params.material,req.clienteMaterial.id);if(!m)throw new Error('material nao encontrado');
      const itens=await require('./ia').descreverImagens([{nome:m.nome,caminho:path.join(raiz,String(m.loja_id),m.arquivo)}],lerCategorias(),configIa());
      if(!itens[0])throw new Error('a IA nao retornou uma ficha');
      auditar(db,req.loja,'foto analisada por IA',m.loja_id,{id:m.id});res.json({titulo:itens[0].titulo||'',observacoes:itens[0].descricao||'',categoria:itens[0].categoria||''});
    }catch(e){res.status(400).json({erro:e.message});}
  });
  app.put('/api/gestao/clientes/:id/materiais/:material',exigirLogin,acesso,(req,res)=>{
    try{
      const m=db.prepare('SELECT * FROM materiais WHERE id=? AND loja_id=?').get(req.params.material,req.clienteMaterial.id);if(!m)throw new Error('material nao encontrado');
      const b=req.body||{},campos=['titulo','preco','unidade','categoria','observacoes'];
      if(!['produto','branding'].includes(b.finalidade||m.finalidade))throw new Error('finalidade invalida');
      if(m.item_arquivo&&b.finalidade==='branding')throw new Error('material ja importado como produto');
      for(const c of campos)if(typeof b[c]!=='string'||b[c].length>(c==='observacoes'?2000:150))throw new Error('campos invalidos');
      if(b.preco&&!/^\d{1,7}([.,]\d{1,2})?$/.test(b.preco))throw new Error('preco invalido');
      db.transaction(()=>{db.prepare('UPDATE materiais SET titulo=?,preco=?,unidade=?,categoria=?,observacoes=? WHERE id=?').run(...campos.map(c=>b[c]),m.id);
        db.prepare('UPDATE materiais SET finalidade=? WHERE id=?').run(b.finalidade||m.finalidade,m.id);
        if(m.item_arquivo){const banco=require('./banco'),lote=banco.loteAberto(db,m.loja_id);if(lote){if(fila.estaOcupada(m.loja_id))throw new Error('aguarde a publicacao');
          banco.salvarItem(db,lote.id,m.item_arquivo,{titulo:b.titulo,preco:b.preco.replace(',','.'),categoria:b.categoria});}}
        auditar(db,req.loja,'material organizado',m.loja_id,{id:m.id});})();res.json({ok:true});
    }catch(e){res.status(400).json({erro:e.message});}
  });
  app.post('/api/gestao/clientes/:id/materiais/importar',exigirLogin,acesso,(req,res)=>{
    if(!req.loja.admin)return res.status(403).json({erro:'importacao liberada ao administrador'});
    const copiados=[];
    try{
      const cid=req.clienteMaterial.id;if(fila.estaOcupada(cid))throw new Error('aguarde a publicacao');
      const banco=require('./banco'),itens=db.prepare("SELECT * FROM materiais WHERE loja_id=? AND item_arquivo IS NULL AND finalidade='produto'").all(cid);
      if(!itens.length)throw new Error('nenhum material novo para importar');
      if(itens.some(m=>!m.titulo.trim()||!m.preco||Number(m.preco.replace(',','.'))<=0))throw new Error('preencha nome e preco positivo de todos os materiais novos');
      db.transaction(()=>{
        const lote=banco.garantirLote(db,cid),pasta=path.join(pastaDados,'envios',String(cid));fs.mkdirSync(pasta,{recursive:true});
        for(const m of itens){const arquivo=crypto.randomUUID()+path.extname(m.arquivo),destino=path.join(pasta,arquivo);
          fs.copyFileSync(path.join(raiz,String(cid),m.arquivo),destino);copiados.push(destino);
          banco.adicionarItens(db,lote.id,[{arquivo,nome_original:m.nome,titulo:m.titulo,descricao:m.observacoes,categoria:m.categoria,preco:m.preco.replace(',','.'),aprovado:1,erro:null}]);
          db.prepare('UPDATE materiais SET item_arquivo=? WHERE id=?').run(arquivo,m.id);}
        auditar(db,req.loja,'materiais importados para revisao',cid,{total:itens.length});
      })();res.json({total:itens.length});
    }catch(e){for(const p of copiados)fs.unlinkSync(p);res.status(400).json({erro:e.message});}
  });
}
module.exports={montar};
