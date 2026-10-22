const path=require('path');
const {auditar}=require('./gestao-banco');

/**
 * Pix do plano da plataforma. O cliente paga suporte + plano para a operacao;
 * a operacao paga o plano ao Cardapio.ai. Aqui o painel entra na conta da loja,
 * gera o Pix de renovacao e o guarda na cobranca do plano ate ser pago.
 *
 * A automacao usa a mesma fila da publicacao: um so navegador por loja, e o
 * andamento e o codigo de verificacao passam por /api/lojas/:id/eventos e /mfa.
 */
function montar(app,{db,exigirLogin,exigirAdmin,fila,cardapio,banco,configCardapio,pastaPerfis}){
  // Chave Pix da operacao: onde o cliente paga a mensalidade. Vai pronta na mensagem de WhatsApp.
  app.get('/api/admin/pix-operacao',exigirLogin,exigirAdmin,(req,res)=>{
    try{res.json(JSON.parse(banco.lerConfig(db,'pix_operacao')||'{}'));}catch{res.json({});}
  });
  app.put('/api/admin/pix-operacao',exigirLogin,exigirAdmin,(req,res)=>{
    const chave=String(req.body?.chave||'').trim(),nome=String(req.body?.nome||'').trim();
    if(!chave||chave.length>140||nome.length>120)return res.status(400).json({erro:'informe a chave Pix e o nome de quem recebe'});
    banco.gravarConfig(db,'pix_operacao',JSON.stringify({chave,nome}));
    auditar(db,req.loja,'chave pix da operacao atualizada',null,{});res.json({chave,nome});
  });

  app.post('/api/gestao/cobrancas/:id/pix',exigirLogin,exigirAdmin,(req,res)=>{
    const c=db.prepare('SELECT * FROM cobrancas WHERE id=?').get(Number(req.params.id));
    if(!c)return res.status(400).json({erro:'cobranca nao encontrada'});
    if(c.tipo!=='plano'||c.cancelada)return res.status(400).json({erro:'o Pix da plataforma so vale para a cobranca do plano'});
    const loja=db.prepare("SELECT * FROM lojas WHERE id=? AND admin=0 AND papel='cliente' AND ativo=1").get(c.loja_id);
    if(!loja)return res.status(400).json({erro:'a loja desta cobranca nao esta ativa'});
    let credenciais;
    try{credenciais=banco.credenciaisCardapio(loja);}catch(e){return res.status(400).json({erro:e.message});}
    if(fila.estaOcupada(loja.id))return res.status(409).json({erro:'esta loja ja tem uma automacao em andamento; tente em instantes'});
    const autor=req.loja;
    fila.iniciar(loja.id,1,async trabalho=>{
      trabalho.tipo='pix';
      const pix=await cardapio.gerarPixPlano({config:{...configCardapio,...credenciais},perfil:path.join(pastaPerfis,String(loja.id)),
        pedirCodigoMfa:trabalho.pedirCodigoMfa,aoProgredir:trabalho.emitir});
      db.prepare(`UPDATE cobrancas SET pix_codigo=?,pix_qr=?,pix_valor=?,pix_competencia=?,pix_gerado_em=datetime('now') WHERE id=?`)
        .run(pix.codigo,pix.qr,pix.valor_centavos,pix.competencia,c.id);
      auditar(db,autor,'pix da plataforma gerado',loja.id,{cobranca:c.id,valor:pix.valor_centavos,competencia:pix.competencia});
      return {pix:true,cobranca:c.id,valor:pix.valor_centavos,competencia:pix.competencia,
        diferente:pix.valor_centavos!==null&&pix.valor_centavos!==c.valor};
    });
    res.status(202).json({iniciado:true,loja_id:loja.id});
  });
}

module.exports={montar};
