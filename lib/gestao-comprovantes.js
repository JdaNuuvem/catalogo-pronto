const fs=require('fs'),path=require('path'),crypto=require('crypto'),multer=require('multer');
const {auditar}=require('./gestao-banco');
function montar(app,{db,exigirLogin,exigirAdmin,pastaDados}){
  const pasta=path.join(pastaDados,'comprovantes');
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:3*1024*1024,files:1}});
  app.post('/api/gestao/movimentos/:id/comprovantes',exigirLogin,exigirAdmin,upload.single('arquivo'),(req,res)=>{
    let arquivo;
    try{
      const m=db.prepare('SELECT * FROM movimentos WHERE id=?').get(req.params.id);if(!m)throw new Error('movimento nao encontrado');
      const a=req.file;if(!a)throw new Error('envie um comprovante');const b=a.buffer;
      const tipo=b.subarray(0,5).toString()==='%PDF-'?'.pdf':b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'.png':b[0]===255&&b[1]===216?'.jpg':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'.webp':null;
      if(!tipo)throw new Error('comprovante deve ser PDF, PNG, JPEG ou WebP');
      fs.mkdirSync(pasta,{recursive:true});arquivo=crypto.randomUUID()+tipo;fs.writeFileSync(path.join(pasta,arquivo),b);
      const id=db.transaction(()=>{const r=db.prepare('INSERT INTO comprovantes(movimento_id,arquivo,nome) VALUES(?,?,?)').run(m.id,arquivo,path.basename(a.originalname).slice(0,200));
        auditar(db,req.loja,'comprovante anexado',null,{movimento:m.id});return Number(r.lastInsertRowid);})();res.json({id});
    }catch(e){if(arquivo)fs.unlinkSync(path.join(pasta,arquivo));res.status(400).json({erro:e.message});}
  });
  app.get('/api/gestao/movimentos/:id/comprovantes',exigirLogin,exigirAdmin,(req,res)=>res.json({comprovantes:db.prepare('SELECT id,nome,criado_em FROM comprovantes WHERE movimento_id=? ORDER BY id').all(req.params.id)}));
  app.get('/api/gestao/comprovantes/:id',exigirLogin,exigirAdmin,(req,res)=>{
    const c=db.prepare('SELECT * FROM comprovantes WHERE id=?').get(req.params.id);if(!c)return res.status(404).end();res.download(path.join(pasta,path.basename(c.arquivo)),c.nome);
  });
}
module.exports={montar};
