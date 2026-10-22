/**
 * O que o app desktop mostra de cada loja sem abrir nada: roteiro de lojas
 * novas, ficha de implantacao, plano no Cardapio.ai e a ultima conferencia do
 * catalogo. E os lembretes do dia da carteira de quem esta no app.
 * Nada de senha passa por aqui.
 */
const {validarFicha}=require('./ficha');
const f=require('./financeiro');
const carteira=require('./carteira');
const {calcular}=require('./lembretes');
const {hoje}=require('./operacao');
const {passosDaLoja}=require('./implantacao-rotas');
const ETAPAS_ROTEIRO=11;

function resumoDaLoja(db,loja){
  const feitas=db.prepare('SELECT COUNT(*) AS n FROM onboarding WHERE loja_id=? AND concluido=1').get(loja.id).n;
  const linhaFicha=db.prepare('SELECT dados,enviada_em FROM fichas WHERE loja_id=?').get(loja.id);
  const completo=validarFicha(linhaFicha?JSON.parse(linhaFicha.dados):{}).completo;
  const conferencia=db.prepare('SELECT situacao,criada_em FROM conferencias WHERE loja_id=? ORDER BY id DESC LIMIT 1').get(loja.id)||null;
  return {
    etapa:loja.etapa,
    roteiro:{feitas,total:ETAPAS_ROTEIRO},
    ficha:{completas:Object.values(completo).filter(Boolean).length,total:Object.keys(completo).length,secoes:completo,enviada_em:linhaFicha?.enviada_em||null},
    plano:loja.cdp_plano_lido_em?{plano:loja.cdp_plano,valido_ate:loja.cdp_plano_valido_ate,teste_ate:loja.cdp_plano_teste_ate,situacao:loja.cdp_plano_situacao,lido_em:loja.cdp_plano_lido_em}:null,
    conferencia,
    implantacao:passosDaLoja(db,loja.id),
  };
}

function montar(app,{db,exigirApp}){
  app.get('/api/app/lembretes',exigirApp,(req,res)=>{
    const u=req.loja;
    res.json({lembretes:calcular({cobrancas:f.listar(db,u),clientes:carteira.clientes(db,u),tarefas:carteira.tarefas(db,u),hoje:hoje(),admin:!!u.admin})});
  });
}

module.exports={resumoDaLoja,montar};
