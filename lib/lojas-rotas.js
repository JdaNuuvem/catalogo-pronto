/**
 * Lojas conectadas ao Cardapio.ai (tela Lojas e IA).
 *
 * O administrador ve e cuida de todas. O atendente cadastra lojas novas, que
 * ja nascem na carteira dele, e conecta o login do Cardapio.ai apenas das lojas
 * que sao dele. Excluir continua so com o administrador.
 */
function montar(app,{db,banco,fila,exigirLogin,exigirAdmin}){
  const equipe=(req,res,next)=>req.loja.admin||req.loja.papel==='atendente'?next():res.status(403).json({erro:'acesso restrito a equipe'});
  // Loja que a pessoa pode mexer: qualquer uma para o admin, so as da carteira para o atendente.
  const alcance=(u,id)=>u.admin
    ?db.prepare('SELECT id FROM lojas WHERE id=?').get(id)
    :db.prepare("SELECT id FROM lojas WHERE id=? AND papel='cliente' AND admin=0 AND atendente_id=?").get(id,u.id);

  app.get('/api/admin/lojas',exigirLogin,equipe,(req,res)=>{
    const lojas=db.prepare(`
      SELECT id, nome, email, admin, cdp_email, cdp_link, criada_em, mail_email,
             (cdp_senha IS NOT NULL) AS tem_senha, (mail_senha IS NOT NULL) AS tem_mail_senha
      FROM lojas WHERE ${req.loja.admin?"papel = 'cliente' OR admin = 1":"papel = 'cliente' AND admin = 0 AND atendente_id = ?"} ORDER BY criada_em DESC
    `).all(...(req.loja.admin?[]:[req.loja.id]));
    res.json({lojas:lojas.map(l=>({...l,publicando:fila.estaOcupada(l.id)}))});
  });

  app.post('/api/admin/lojas',exigirLogin,equipe,(req,res)=>{
    const {nome,email,senha,cdpEmail,cdpSenha,cdpLink,mailEmail,mailSenha}=req.body||{};
    if(!nome||!email||!senha)return res.status(400).json({erro:'nome, e-mail e senha sao obrigatorios'});
    if(String(senha).length<8)return res.status(400).json({erro:'a senha precisa de ao menos 8 caracteres'});
    try{
      const id=db.transaction(()=>{
        const nova=banco.criarLoja(db,{nome,email,senha,cdpEmail,cdpSenha,cdpLink});
        if(!req.loja.admin)db.prepare('UPDATE lojas SET atendente_id=? WHERE id=?').run(req.loja.id,nova);
        if(mailEmail)db.prepare('UPDATE lojas SET mail_email=? WHERE id=?').run(String(mailEmail).trim().toLowerCase().slice(0,254),nova);
        if(mailSenha)db.prepare('UPDATE lojas SET mail_senha=? WHERE id=?').run(banco.cifrar(String(mailSenha)),nova);
        return nova;
      })();
      res.json({id});
    }catch(erro){res.status(400).json({erro:erro.message});}
  });

  app.put('/api/admin/lojas/:id',exigirLogin,equipe,(req,res)=>{
    const alvo=alcance(req.loja,Number(req.params.id));
    if(!alvo)return res.status(404).json({erro:'loja nao encontrada'});
    const {cdpEmail,cdpSenha,cdpLink,mailEmail,mailSenha}=req.body||{};
    if(mailEmail!==undefined&&(typeof mailEmail!=='string'||mailEmail.length>254))return res.status(400).json({erro:'e-mail da loja invalido'});
    db.transaction(()=>{
      banco.atualizarCredenciais(db,alvo.id,{cdpEmail,cdpSenha,cdpLink});
      // Senha em branco mantem a atual, como no Cardapio.ai.
      if(mailEmail!==undefined)db.prepare('UPDATE lojas SET mail_email=? WHERE id=?').run(mailEmail.trim().toLowerCase()||null,alvo.id);
      if(mailSenha)db.prepare('UPDATE lojas SET mail_senha=? WHERE id=?').run(banco.cifrar(String(mailSenha)),alvo.id);
    })();
    res.json({ok:true});
  });

  app.delete('/api/admin/lojas/:id',exigirLogin,exigirAdmin,(req,res)=>{
    const temHistorico=db.prepare(`SELECT id FROM cobrancas WHERE loja_id=? OR atendente_id=?
      UNION SELECT id FROM tarefas WHERE loja_id=? OR responsavel_id=?
      UNION SELECT id FROM materiais WHERE loja_id=? UNION SELECT id FROM auditoria WHERE loja_id=? OR autor_id=?`).get(...Array(7).fill(req.params.id));
    if(temHistorico)return res.status(409).json({erro:'conta possui historico; arquive pela ficha do cliente ou desative o atendente'});
    if(Number(req.params.id)===req.loja.id)return res.status(400).json({erro:'nao da para excluir a propria conta'});
    db.prepare('DELETE FROM lojas WHERE id = ?').run(req.params.id);
    res.json({ok:true});
  });
}

module.exports={montar};
