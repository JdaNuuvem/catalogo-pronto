const bcrypt=require('bcryptjs');
const fs=require('fs');
const path=require('path');
const f=require('./financeiro');
const {auditar}=require('./gestao-banco');
const {hoje}=require('./operacao');
const carteira=require('./carteira');
const {calcular:calcularLembretes}=require('./lembretes');
const {lerConfig}=require('./banco');
// Chave Pix da operacao: e para onde o cliente paga a mensalidade (vai na mensagem de WhatsApp).
const pixOperacao=db=>{try{return JSON.parse(lerConfig(db,'pix_operacao')||'null');}catch{return null;}};
function montar(app,{db,exigirLogin,exigirAdmin,sessao,pastaDados,fila}) {
  const equipe=(req,res,next)=>{if(!req.loja.admin&&req.loja.papel!=='atendente')return res.status(403).json({erro:'acesso restrito a equipe'});next();};
  const tratar=fn=>(req,res)=>{try{res.json(fn(req,res));}catch(e){res.status(400).json({erro:e.message});}};
  const alterar=fn=>tratar(req=>db.transaction(()=>fn(req))());
  const acesso=(u,cid)=>{
    const c=db.prepare("SELECT * FROM lojas WHERE id=? AND admin=0 AND papel='cliente'").get(f.id(cid));
    if(!c||(!u.admin&&c.atendente_id!==u.id))throw new Error('cliente nao encontrado na sua carteira');return c;
  };
  app.get('/api/gestao',exigirLogin,equipe,tratar(req=>{
    const atual=hoje(),inicio=req.query.inicio||atual.slice(0,7)+'-01',fim=req.query.fim||atual;
    const financeiro=f.resumo(db,req.loja,inicio,fim);
    const clientes=carteira.clientes(db,req.loja),tarefas=carteira.tarefas(db,req.loja);
    const atendentes=req.loja.admin?db.prepare("SELECT id,nome,email,ativo,ver_senhas FROM lojas WHERE papel='atendente' AND admin=0 ORDER BY nome").all():[];
    const lembretes=calcularLembretes({cobrancas:financeiro.cobrancas,clientes,tarefas,hoje:atual,admin:!!req.loja.admin});
    return {hoje:atual,inicio,fim,clientes,tarefas,atendentes,lembretes,pix_operacao:pixOperacao(db),respostas:db.prepare('SELECT * FROM respostas ORDER BY titulo').all(),...financeiro};
  }));
  // So o que o menu precisa para mostrar o contador, sem o resto da gestao.
  app.get('/api/gestao/lembretes',exigirLogin,equipe,tratar(req=>{
    const lembretes=calcularLembretes({cobrancas:f.listar(db,req.loja),clientes:carteira.clientes(db,req.loja),tarefas:carteira.tarefas(db,req.loja),hoje:hoje(),admin:!!req.loja.admin});
    return {total:lembretes.length,urgentes:lembretes.filter(l=>l.nivel==='urgente').length};
  }));
  app.get('/api/gestao/clientes/:id',exigirLogin,equipe,tratar(req=>{
    const c=acesso(req.loja,Number(req.params.id));
    return {materiais:db.prepare('SELECT * FROM materiais WHERE loja_id=? ORDER BY id DESC').all(c.id),
      historico:db.prepare('SELECT acao,detalhes,criado_em FROM auditoria WHERE loja_id=? ORDER BY id DESC LIMIT 100').all(c.id)};
  }));
  // Etapa -> quantidade de itens do checklist "confira antes de marcar".
  const passosOnboarding={cadastro:2,acordo:2,email:2,conta:2,configuracao:2,materiais:2,revisao:2,publicacao:2,entrega:2,mensalidades:2,repasse:2};
  // O financeiro do roteiro (mensalidades e repasse) fica com o administrador; o resto a equipe confere.
  const equipeOnboarding=['cadastro','acordo','email','conta','configuracao','materiais','revisao','publicacao','entrega'];
  const listarOnboarding=cid=>db.prepare(`SELECT o.passo,o.concluido,o.itens,o.atualizado_em,l.nome AS responsavel
    FROM onboarding o JOIN lojas l ON l.id=o.atualizado_por WHERE o.loja_id=?`).all(cid).map(e=>({...e,itens:JSON.parse(e.itens)}));
  app.get('/api/gestao/clientes/:id/onboarding',exigirLogin,equipe,tratar(req=>{
    const c=acesso(req.loja,Number(req.params.id));return {etapas:listarOnboarding(c.id)};
  }));
  app.put('/api/gestao/clientes/:id/onboarding',exigirLogin,equipe,(req,res,next)=>{
    if(!req.loja.admin&&!equipeOnboarding.includes(req.body?.passo))return res.status(403).json({erro:'esta etapa deve ser conferida pelo administrador'});
    next();
  },alterar(req=>{
    const c=acesso(req.loja,Number(req.params.id)),b=req.body||{};
    if(!c.ativo)throw new Error('reative a loja antes de atualizar o checklist');
    if(!Object.hasOwn(passosOnboarding,b.passo))throw new Error('etapa ou conclusao invalida');
    const total=passosOnboarding[b.passo],atual=db.prepare('SELECT concluido,itens FROM onboarding WHERE loja_id=? AND passo=?').get(c.id,b.passo);
    const antes={concluido:atual?.concluido||0,itens:JSON.parse(atual?.itens||'[]')};
    let depois;
    if('item' in b){
      // Desmarcar um item de uma etapa conferida reabre a etapa: o checklist deixou de estar completo.
      if(!Number.isInteger(b.item)||b.item<0||b.item>=total||typeof b.marcado!=='boolean')throw new Error('item do checklist invalido');
      const itens=new Set(antes.concluido?[...Array(total).keys()]:antes.itens);if(b.marcado)itens.add(b.item);else itens.delete(b.item);
      depois={concluido:b.marcado?antes.concluido:0,itens:[...itens].sort((x,y)=>x-y)};
    }else{
      if(typeof b.concluido!=='boolean')throw new Error('etapa ou conclusao invalida');
      depois=b.concluido===!!antes.concluido?antes:{concluido:b.concluido?1:0,itens:b.concluido?[...Array(total).keys()]:antes.itens};
    }
    if(depois.concluido!==antes.concluido||JSON.stringify(depois.itens)!==JSON.stringify(antes.itens)){
      db.prepare(`INSERT INTO onboarding(loja_id,passo,concluido,itens,atualizado_por) VALUES(?,?,?,?,?)
        ON CONFLICT(loja_id,passo) DO UPDATE SET concluido=excluded.concluido,itens=excluded.itens,atualizado_por=excluded.atualizado_por,atualizado_em=datetime('now')`)
        .run(c.id,b.passo,depois.concluido,JSON.stringify(depois.itens),req.loja.id);
      if(depois.concluido!==antes.concluido)auditar(db,req.loja,depois.concluido?'etapa do onboarding conferida':'etapa do onboarding reaberta',c.id,{passo:b.passo});
      // Entrega conferida: a implantacao termina e a loja passa a ativa (uma loja pausada continua pausada).
      if(b.passo==='entrega'&&depois.concluido&&!antes.concluido){
        db.prepare(`INSERT INTO implantacoes(loja_id,etapa) VALUES(?,'entregue')
          ON CONFLICT(loja_id) DO UPDATE SET etapa='entregue',atualizada_em=datetime('now')`).run(c.id);
        db.prepare("UPDATE lojas SET etapa='ativa' WHERE id=? AND etapa='implantacao'").run(c.id);
      }
    }
    return {ok:true,etapas:listarOnboarding(c.id)};
  }));
  app.put('/api/gestao/clientes/:id',exigirLogin,equipe,alterar(req=>{
    const c=acesso(req.loja,Number(req.params.id)),b=req.body||{};
    if(typeof b.contato!=='string'||b.contato.length>120||typeof b.observacoes!=='string'||b.observacoes.length>5000)throw new Error('contato ou observacoes invalidos');
    db.prepare('UPDATE lojas SET contato=?,observacoes=? WHERE id=?').run(b.contato.trim(),b.observacoes,c.id);
    if(b.ativo!==undefined){if(!req.loja.admin||typeof b.ativo!=='boolean')throw new Error('somente o administrador pode arquivar');
      if(!b.ativo&&fila.estaOcupada(c.id))throw new Error('aguarde a publicacao em andamento');
      db.prepare('UPDATE lojas SET ativo=? WHERE id=?').run(b.ativo?1:0,c.id);
      if(!b.ativo)db.prepare('UPDATE contratos SET ativo=0 WHERE loja_id=?').run(c.id);
    }
    auditar(db,req.loja,'ficha atualizada',c.id,{contato:b.contato,arquivada:b.ativo===false});return {ok:true};
  }));
  app.post('/api/gestao/cobrancas',exigirLogin,exigirAdmin,tratar(req=>f.repetir(db,req.loja,req.body.pedido,{acao:'cobranca',...req.body},()=>f.criar(db,req.loja,req.body))));
  app.post('/api/gestao/movimentos',exigirLogin,exigirAdmin,tratar(req=>f.repetir(db,req.loja,req.body.pedido,{acao:'movimento',...req.body},()=>f.movimentar(db,req.loja,req.body,req.body.pedido))));
  app.post('/api/gestao/mensalidades/receber',exigirLogin,exigirAdmin,tratar(req=>f.repetir(db,req.loja,req.body.pedido,{acao:'mensalidade',...req.body},
    ()=>f.receberMensalidade(db,req.loja,req.body,req.body.pedido))));
  app.post('/api/gestao/movimentos/:id/estorno',exigirLogin,exigirAdmin,tratar(req=>f.repetir(db,req.loja,req.body.pedido,{acao:'estorno',id:req.params.id,...req.body},()=>f.estornar(db,req.loja,Number(req.params.id),req.body,req.body.pedido))));
  app.put('/api/gestao/movimentos/:id/rateio',exigirLogin,exigirAdmin,alterar(req=>f.ratear(db,req.loja,Number(req.params.id),req.body.rateio)));
  app.put('/api/gestao/cobrancas/:id/custos',exigirLogin,exigirAdmin,alterar(req=>f.custos(db,req.loja,Number(req.params.id),req.body.fechados)));
  app.post('/api/gestao/cobrancas/:id/cancelar',exigirLogin,exigirAdmin,alterar(req=>{
    const c=f.uma(db,Number(req.params.id));if(c.recebido||c.repassado||c.plataforma_paga||c.custos)throw new Error('estorne os movimentos antes de cancelar');
    const motivo=f.texto(req.body.motivo,'motivo');db.prepare('UPDATE cobrancas SET cancelada=1 WHERE id=?').run(c.id);
    auditar(db,req.loja,'cobranca cancelada',c.loja_id,{id:c.id,motivo});return {ok:true};
  }));
  app.post('/api/gestao/cobrancas/:id/enviada',exigirLogin,equipe,alterar(req=>{
    const c=f.uma(db,Number(req.params.id));acesso(req.loja,c.loja_id);
    db.prepare("UPDATE cobrancas SET enviada_em=datetime('now') WHERE id=?").run(c.id);
    auditar(db,req.loja,'mensagem de cobranca enviada',c.loja_id,{id:c.id});return {ok:true};
  }));
  app.post('/api/gestao/contratos',exigirLogin,exigirAdmin,tratar(req=>f.repetir(db,req.loja,req.body.pedido,{acao:'contrato',...req.body},()=>f.contrato(db,req.loja,req.body))));
  app.post('/api/gestao/contratos/:id/encerrar',exigirLogin,exigirAdmin,alterar(req=>{
    const t=db.prepare('SELECT * FROM contratos WHERE id=?').get(Number(req.params.id));if(!t)throw new Error('contrato nao encontrado');
    // No contrato unico, encerrar uma parte encerra a mensalidade inteira.
    if(t.grupo)db.prepare('UPDATE contratos SET ativo=0 WHERE grupo=?').run(t.grupo);else db.prepare('UPDATE contratos SET ativo=0 WHERE id=?').run(t.id);
    auditar(db,req.loja,'contrato encerrado',t.loja_id,{id:t.id,grupo:t.grupo});return {ok:true};
  }));
  app.post('/api/gestao/recorrencias',exigirLogin,exigirAdmin,tratar(req=>{
    const competencia=req.body.competencia||hoje().slice(0,7);
    const max=new Date(hoje().slice(0,7)+'-01T12:00:00Z');max.setUTCMonth(max.getUTCMonth()+1);
    if(competencia>max.toISOString().slice(0,7))throw new Error('gere ate o proximo mes');
    const r=f.gerar(db,competencia);auditar(db,req.loja,'recorrencias geradas',null,{competencia,...r});return r;
  }));
  app.put('/api/gestao/implantacoes/:id',exigirLogin,equipe,alterar(req=>{
    const c=acesso(req.loja,Number(req.params.id)),b={...req.body};
    // A etapa agora vem do roteiro de lojas novas; a tela so envia prazo e pendencia.
    if(b.etapa===undefined)b.etapa=db.prepare('SELECT etapa FROM implantacoes WHERE loja_id=?').get(c.id)?.etapa||'dados';
    if(!['dados','contas','branding','materiais','revisao','publicacao','conferencia','entregue'].includes(b.etapa))throw new Error('etapa invalida');
    if(typeof b.pendencia!=='string'||b.pendencia.length>2000)throw new Error('pendencia invalida');
    const prazo=b.prazo?f.data(b.prazo):null;
    db.prepare(`INSERT INTO implantacoes(loja_id,etapa,prazo,pendencia) VALUES(?,?,?,?)
      ON CONFLICT(loja_id) DO UPDATE SET etapa=excluded.etapa,prazo=excluded.prazo,pendencia=excluded.pendencia,atualizada_em=datetime('now')`).run(c.id,b.etapa,prazo,b.pendencia);
    if(b.etapa==='entregue')db.prepare("UPDATE lojas SET etapa='ativa' WHERE id=?").run(c.id);
    auditar(db,req.loja,'implantacao atualizada',c.id,{etapa:b.etapa,prazo});return {ok:true};
  }));
  const validarTarefa=(b,c,u)=>{
    const responsavel=b.responsavel_id||c.atendente_id||u.id;
    const conta=db.prepare('SELECT id,admin,papel,ativo FROM lojas WHERE id=?').get(f.id(responsavel));
    if(!conta||!conta.ativo||(!conta.admin&&responsavel!==c.atendente_id))throw new Error('responsavel deve ser administrador ou atendente da loja');
    if(!['implantacao','suporte','tarefa'].includes(b.tipo)||!['pendente','andamento','aguardando_cliente','concluida'].includes(b.estado)||!['normal','alta','urgente'].includes(b.prioridade))throw new Error('tipo, estado ou prioridade invalido');
    const minutos=b.minutos||0;if(!Number.isSafeInteger(minutos)||minutos<0||minutos>1000000)throw new Error('tempo invalido');
    const descricao=String(b.descricao||''),solucao=String(b.solucao||'');if(descricao.length>5000||solucao.length>5000)throw new Error('texto muito longo');
    return {titulo:f.texto(b.titulo,'titulo',150),descricao,solucao,responsavel,minutos,prazo:b.prazo?f.data(b.prazo):null};
  };
  app.post('/api/gestao/tarefas',exigirLogin,equipe,alterar(req=>{
    const b=req.body,c=acesso(req.loja,b.loja_id),v=validarTarefa(b,c,req.loja);
    const r=db.prepare(`INSERT INTO tarefas(loja_id,responsavel_id,tipo,titulo,descricao,estado,prioridade,prazo,solucao,minutos)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(c.id,v.responsavel,b.tipo,v.titulo,v.descricao,b.estado,b.prioridade,v.prazo,v.solucao,v.minutos);
    auditar(db,req.loja,'tarefa criada',c.id,{id:Number(r.lastInsertRowid)});return {id:Number(r.lastInsertRowid)};
  }));
  app.put('/api/gestao/tarefas/:id',exigirLogin,equipe,alterar(req=>{
    const t=db.prepare('SELECT * FROM tarefas WHERE id=?').get(Number(req.params.id));if(!t)throw new Error('tarefa nao encontrada');
    const c=acesso(req.loja,t.loja_id),b={...t,...req.body},v=validarTarefa(b,c,req.loja);
    db.prepare("UPDATE tarefas SET responsavel_id=?,tipo=?,titulo=?,descricao=?,estado=?,prioridade=?,prazo=?,solucao=?,minutos=?,atualizada_em=datetime('now') WHERE id=?")
      .run(v.responsavel,b.tipo,v.titulo,v.descricao,b.estado,b.prioridade,v.prazo,v.solucao,v.minutos,t.id);
    auditar(db,req.loja,'tarefa atualizada',c.id,{id:t.id,estado:b.estado});return {ok:true};
  }));
  app.post('/api/gestao/respostas',exigirLogin,exigirAdmin,alterar(req=>{
    const b=req.body,r=db.prepare('INSERT INTO respostas(titulo,texto) VALUES(?,?)').run(f.texto(b.titulo,'titulo',150),f.texto(b.texto,'resposta',5000));
    auditar(db,req.loja,'resposta cadastrada',null,{id:Number(r.lastInsertRowid)});return {id:Number(r.lastInsertRowid)};
  }));
  app.put('/api/gestao/senha',exigirLogin,alterar(req=>{
    const b=req.body||{};if(typeof b.atual!=='string'||!bcrypt.compareSync(b.atual,req.loja.senha_hash))throw new Error('senha atual incorreta');
    if(typeof b.nova!=='string'||b.nova.length<8||b.nova.length>200)throw new Error('nova senha deve ter de 8 a 200 caracteres');
    db.prepare('UPDATE lojas SET senha_hash=?,sessao_versao=sessao_versao+1 WHERE id=?').run(bcrypt.hashSync(b.nova,10),req.loja.id);
    auditar(db,req.loja,'senha alterada',null);return {ok:true};
  }));
  app.put('/api/gestao/atendentes/:id',exigirLogin,exigirAdmin,alterar(req=>{
    const a=db.prepare("SELECT * FROM lojas WHERE id=? AND papel='atendente' AND admin=0").get(Number(req.params.id));if(!a)throw new Error('atendente nao encontrado');
    const b=req.body||{};
    if(b.ativo!==undefined){if(typeof b.ativo!=='boolean')throw new Error('situacao invalida');db.prepare('UPDATE lojas SET ativo=?,sessao_versao=sessao_versao+1 WHERE id=?').run(b.ativo?1:0,a.id);}
    if(b.ver_senhas!==undefined){if(typeof b.ver_senhas!=='boolean')throw new Error('permissao invalida');db.prepare('UPDATE lojas SET ver_senhas=? WHERE id=?').run(b.ver_senhas?1:0,a.id);}
    if(b.senha!==undefined){if(typeof b.senha!=='string'||b.senha.length<8||b.senha.length>200)throw new Error('senha invalida');db.prepare('UPDATE lojas SET senha_hash=?,sessao_versao=sessao_versao+1 WHERE id=?').run(bcrypt.hashSync(b.senha,10),a.id);}
    auditar(db,req.loja,'conta da equipe atualizada',null,{id:a.id});return {ok:true};
  }));
  const pastaBackups=path.join(pastaDados,'backups');
  app.get('/api/gestao/backups',exigirLogin,exigirAdmin,tratar(()=>({backups:fs.existsSync(pastaBackups)?fs.readdirSync(pastaBackups).filter(n=>/^painel-[\w-]+\.(db|tar\.gz)$/.test(n)).sort().reverse().map(nome=>({nome,tamanho:fs.statSync(path.join(pastaBackups,nome)).size})):[]})));
  app.post('/api/gestao/backups',exigirLogin,exigirAdmin,async(req,res)=>{
    try{const nome=await require('./gestao-backup').criar(db,pastaDados);auditar(db,req.loja,'backup criado',null,{nome});res.json({nome});}catch(e){res.status(400).json({erro:e.message});}
  });
  app.get('/api/gestao/backups/:nome',exigirLogin,exigirAdmin,(req,res)=>{
    if(!/^painel-[\w-]+\.(db|tar\.gz)$/.test(req.params.nome))return res.status(400).end();
    const p=path.join(pastaBackups,req.params.nome);if(!fs.existsSync(p))return res.status(404).end();res.download(p);
  });
}
module.exports={montar};
