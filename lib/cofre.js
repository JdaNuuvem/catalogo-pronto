const crypto=require('crypto');
const {auditar}=require('./gestao-banco');

/**
 * Cofre de logins das lojas: e-mail da loja (Proton) e Cardapio.ai.
 *
 * As senhas so saem cifradas do banco por dois caminhos, ambos registrados no
 * historico da loja:
 *  - pelo app desktop, que abre a loja ja logada (o funcionario nao ve a senha);
 *  - por "Mostrar senha" no site, so para o administrador e quem ele liberou.
 *
 * O app tem login proprio, com token no cabecalho Authorization. Do token o
 * servidor guarda so o hash; ele cai ao sair, ao trocar a senha da conta ou
 * ao desativa-la (mesma versao de sessao do cookie).
 */
const SERVICOS={
  cardapio:{coluna:['cdp_email','cdp_senha'],url:base=>`${base}/listar`},
  // EMAIL_LOJA_URL so existe para testes apontarem para uma copia local.
  email:{coluna:['mail_email','mail_senha'],url:()=>process.env.EMAIL_LOJA_URL||'https://account.proton.me/mail'},
};
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');

function montar(app,{db,banco,exigirLogin,configCardapio}){
  const naCarteira=(u,id)=>u.admin
    ?db.prepare("SELECT * FROM lojas WHERE id=? AND admin=0 AND papel='cliente'").get(id)
    :db.prepare("SELECT * FROM lojas WHERE id=? AND admin=0 AND papel='cliente' AND atendente_id=?").get(id,u.id);
  const credencial=(loja,servico)=>{
    const [usuario,senha]=SERVICOS[servico].coluna;
    return {usuario:loja[usuario]||'',senha:loja[senha]?banco.decifrar(loja[senha]):''};
  };

  // ------------------------------------------------------------- site
  app.post('/api/cofre/lojas/:id/revelar',exigirLogin,(req,res)=>{
    const u=req.loja;
    if(!u.admin&&!(u.papel==='atendente'&&u.ver_senhas))return res.status(403).json({erro:'mostrar senha e liberado pelo administrador'});
    const servico=req.body?.servico;if(!SERVICOS[servico])return res.status(400).json({erro:'servico invalido'});
    const loja=naCarteira(u,Number(req.params.id));if(!loja)return res.status(404).json({erro:'loja nao encontrada'});
    auditar(db,u,'senha do cofre revelada',loja.id,{servico});
    res.json(credencial(loja,servico));
  });

  // -------------------------------------------------------------- app
  app.post('/api/app/login',(req,res)=>{
    const {email,senha,dispositivo}=req.body||{};
    const conta=banco.autenticarLoja(db,email,senha||'');
    if(!conta)return res.status(401).json({erro:'e-mail ou senha incorretos'});
    if(!conta.admin&&conta.papel!=='atendente')return res.status(403).json({erro:'o app e para a equipe; clientes usam o site'});
    const token=crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessoes_app(conta_id,token_hash,dispositivo,versao) VALUES(?,?,?,?)')
      .run(conta.id,hash(token),String(dispositivo||'').slice(0,120),conta.sessao_versao||0);
    auditar(db,conta,'app desktop conectado',null,{dispositivo:String(dispositivo||'').slice(0,120)});
    res.json({token,nome:conta.nome,papel:conta.admin?'admin':conta.papel});
  });

  const exigirApp=(req,res,next)=>{
    const m=/^Bearer (\S+)$/.exec(req.headers.authorization||'');
    if(!m)return res.status(401).json({erro:'entre pelo app para continuar'});
    const s=db.prepare('SELECT s.*,l.ativo,l.sessao_versao FROM sessoes_app s JOIN lojas l ON l.id=s.conta_id WHERE s.token_hash=? AND s.revogado=0').get(hash(m[1]));
    if(!s||!s.ativo||s.versao!==s.sessao_versao)return res.status(401).json({erro:'entre novamente no app'});
    db.prepare("UPDATE sessoes_app SET usado_em=datetime('now') WHERE id=?").run(s.id);
    req.sessaoApp=s;req.loja=db.prepare('SELECT * FROM lojas WHERE id=?').get(s.conta_id);next();
  };

  app.get('/api/app/eu',exigirApp,(req,res)=>res.json({nome:req.loja.nome,papel:req.loja.admin?'admin':req.loja.papel}));

  app.get('/api/app/lojas',exigirApp,(req,res)=>{
    const u=req.loja;
    const lojas=db.prepare(`SELECT id,nome,cdp_email,cdp_link,mail_email,(cdp_senha IS NOT NULL) AS tem_cdp_senha,(mail_senha IS NOT NULL) AS tem_mail_senha
      FROM lojas WHERE admin=0 AND papel='cliente' AND ativo=1 ${u.admin?'':'AND atendente_id=?'} ORDER BY nome`).all(...(u.admin?[]:[u.id]));
    res.json({lojas:lojas.map(l=>({id:l.id,nome:l.nome,link:l.cdp_link,cardapio_email:l.cdp_email,email:l.mail_email,
      tem_cardapio:!!(l.cdp_email&&l.tem_cdp_senha),tem_email:!!(l.mail_email&&l.tem_mail_senha)}))});
  });

  app.post('/api/app/lojas/:id/acesso',exigirApp,(req,res)=>{
    const servico=req.body?.servico;if(!SERVICOS[servico])return res.status(400).json({erro:'servico invalido'});
    const loja=naCarteira(req.loja,Number(req.params.id));if(!loja||!loja.ativo)return res.status(404).json({erro:'loja nao encontrada'});
    auditar(db,req.loja,'login aberto pelo app',loja.id,{servico,dispositivo:req.sessaoApp.dispositivo});
    res.json({...credencial(loja,servico),url:SERVICOS[servico].url(configCardapio.baseUrl)});
  });

  app.post('/api/app/sair',exigirApp,(req,res)=>{
    db.prepare('UPDATE sessoes_app SET revogado=1 WHERE id=?').run(req.sessaoApp.id);res.json({ok:true});
  });
  return {exigirApp};
}

module.exports={montar};
