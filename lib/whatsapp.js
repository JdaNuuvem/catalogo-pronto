/**
 * Envio de WhatsApp pela Evolution API (v2), do numero da operacao.
 * Ligado por EVOLUTION_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCIA no ambiente;
 * sem elas o app abre o WhatsApp do computador com a mensagem pronta.
 * Cada mensagem enviada fica no historico da loja (so o comeco do texto).
 */
const {auditar}=require('./gestao-banco');

function configuracao(env=process.env){
  const url=String(env.EVOLUTION_URL||'').replace(/\/+$/,''),chave=env.EVOLUTION_API_KEY||'',instancia=env.EVOLUTION_INSTANCIA||'';
  return url&&chave&&instancia?{url,chave,instancia}:null;
}

/** Numero brasileiro so com digitos e o 55 na frente (10 ou 11 digitos com DDD). */
function numero(telefone){
  const d=String(telefone||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
  return /^\d{10,11}$/.test(d)?`55${d}`:null;
}

async function enviarTexto(cfg,para,texto,buscar=fetch){
  const r=await buscar(`${cfg.url}/message/sendText/${encodeURIComponent(cfg.instancia)}`,{method:'POST',
    headers:{'content-type':'application/json',apikey:cfg.chave},body:JSON.stringify({number:para,text:texto})});
  if(!r.ok)throw new Error(`a Evolution API respondeu ${r.status}: ${(await r.text()).slice(0,200)}`);
  return r.json().catch(()=>({}));
}

function montar(app,{db,exigirApp,buscar}){
  const naCarteira=(req,res,next)=>{
    const u=req.loja,c=db.prepare("SELECT * FROM lojas WHERE id=? AND admin=0 AND papel='cliente'").get(Number(req.params.id));
    if(!c||(!u.admin&&(u.papel!=='atendente'||c.atendente_id!==u.id)))return res.status(403).json({erro:'cliente fora da sua carteira'});
    req.cliente=c;next();
  };
  app.get('/api/app/whatsapp',exigirApp,(req,res)=>res.json({configurado:!!configuracao()}));
  // Manda para o WhatsApp da ficha da loja; o atendente revisou o texto na tela antes.
  app.post('/api/app/lojas/:id/whatsapp',exigirApp,naCarteira,async(req,res)=>{
    const cfg=configuracao();
    if(!cfg)return res.status(409).json({erro:'o WhatsApp da operacao nao esta configurado no servidor'});
    const texto=String(req.body?.texto||'').trim().slice(0,4000);
    if(!texto)return res.status(400).json({erro:'escreva a mensagem'});
    const ficha=db.prepare('SELECT dados FROM fichas WHERE loja_id=?').get(req.cliente.id);
    const para=numero(ficha?JSON.parse(ficha.dados).loja?.telefone:null);
    if(!para)return res.status(400).json({erro:'a ficha ainda nao tem o WhatsApp do cliente'});
    try{await enviarTexto(cfg,para,texto,buscar);}catch(e){return res.status(502).json({erro:e.message});}
    auditar(db,req.loja,'whatsapp enviado pelo app',req.cliente.id,{para:para.slice(0,6)+'…',inicio:texto.slice(0,60)});
    res.json({ok:true});
  });
}

module.exports={montar,configuracao,numero,enviarTexto};
