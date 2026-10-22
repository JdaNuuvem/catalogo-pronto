/**
 * O que cada pessoa da equipe enxerga: o administrador, toda a operacao; o
 * atendente, so as lojas vinculadas a ele. Usado pela tela de gestao e pelos
 * lembretes, para os dois mostrarem exatamente as mesmas lojas.
 */
const filtro=u=>u.admin?['1=1',[]]:['l.atendente_id=?',[u.id]];

function clientes(db,u){
  const [onde,valores]=filtro(u);
  return db.prepare(`SELECT l.id,l.nome,l.email,l.contato,l.whatsapp,l.observacoes,l.etapa,l.ativo,l.atendente_id,a.nome AS atendente,
      l.produtos_contratados,l.implantacao_centavos,l.adicional_centavos,l.suporte_centavos,l.plano_centavos,l.vencimento,l.cdp_link,
      l.cdp_plano,l.cdp_plano_periodo,l.cdp_plano_valor,l.cdp_plano_valido_ate,l.cdp_plano_teste_ate,l.cdp_plano_situacao,l.cdp_plano_lido_em,
      i.etapa AS implantacao_etapa,i.prazo AS implantacao_prazo,i.pendencia,
      (SELECT group_concat(o.passo) FROM onboarding o WHERE o.loja_id=l.id AND o.concluido=1) AS onboarding_feitos
      FROM lojas l LEFT JOIN lojas a ON a.id=l.atendente_id LEFT JOIN implantacoes i ON i.loja_id=l.id
      WHERE l.admin=0 AND l.papel='cliente' AND ${onde} ORDER BY l.ativo DESC,l.nome`).all(...valores)
    .map(c=>({...c,onboarding_feitos:c.onboarding_feitos?c.onboarding_feitos.split(','):[]}));
}

function tarefas(db,u){
  const [onde,valores]=filtro(u);
  return db.prepare(`SELECT t.*,l.nome AS cliente,a.nome AS responsavel FROM tarefas t JOIN lojas l ON l.id=t.loja_id
      LEFT JOIN lojas a ON a.id=t.responsavel_id WHERE ${onde} ORDER BY t.estado='concluida',t.prazo IS NULL,t.prazo,t.id DESC`).all(...valores);
}

module.exports={clientes,tarefas};
