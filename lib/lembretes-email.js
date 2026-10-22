/**
 * Resumo diario dos lembretes por e-mail, para o administrador e cada atendente.
 *
 * Sai uma vez por dia, a partir das 8h de Brasilia, so para quem tem lembrete.
 * O envio e pelo Resend; sem RESEND_API_KEY e LEMBRETES_EMAIL_DE no ambiente
 * o resumo fica desligado e os lembretes continuam no painel.
 */
const f=require('./financeiro');
const carteira=require('./carteira');
const {calcular}=require('./lembretes');
const {lerConfig,gravarConfig}=require('./banco');

const HORA_ENVIO=8;
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((v||0)/100);
const escapar=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ROTULO={urgente:'Atrasado',hoje:'Hoje',breve:'Nos próximos dias'};

/** Data e hora em Brasilia, independente do fuso do servidor. */
function emBrasilia(agora){
  const partes=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'})
    .formatToParts(agora).map(p=>[p.type,p.value]));
  return {dia:`${partes.year}-${partes.month}-${partes.day}`,hora:Number(partes.hour)};
}

function montar(pessoa,lembretes,painelUrl){
  const n=lembretes.length,link=`${painelUrl||''}/gestao.html`;
  const blocos=['urgente','hoje','breve'].map(nivel=>{const doNivel=lembretes.filter(l=>l.nivel===nivel);if(!doNivel.length)return '';
    return `<h3 style="margin:18px 0 6px;font-size:14px">${ROTULO[nivel]}</h3><ul style="margin:0;padding-left:18px">${doNivel.map(l=>`<li style="margin-bottom:4px">${escapar(l.titulo)}${l.valor?` · ${brl(l.valor)}`:''}</li>`).join('')}</ul>`;}).join('');
  return {
    assunto:`${n} lembrete${n===1?'':'s'} para hoje no Catálogo Pronto`,
    html:`<div style="font-family:Segoe UI,Arial,sans-serif;color:#23201c"><p>Olá, ${escapar(pessoa.nome)}! Estes são os lembretes de hoje:</p>${blocos}
      <p style="margin-top:20px"><a href="${escapar(link)}" style="color:#a8442a">Abrir o painel</a></p></div>`,
    texto:`Olá, ${pessoa.nome}! Lembretes de hoje:\n${lembretes.map(l=>`- ${l.titulo}${l.valor?` (${brl(l.valor)})`:''}`).join('\n')}\n\n${link}`,
  };
}

async function enviarResumos({db,agora=new Date(),enviar,painelUrl}){
  const {dia,hora}=emBrasilia(agora);
  if(hora<HORA_ENVIO)return {enviados:0,falhas:0,motivo:'antes das 8h'};
  if(lerConfig(db,'lembretes_email_dia')===dia)return {enviados:0,falhas:0,motivo:'ja enviado hoje'};
  // Marca antes de enviar: se o processo cair no meio, ninguem recebe o resumo duas vezes.
  gravarConfig(db,'lembretes_email_dia',dia);
  const equipe=db.prepare("SELECT id,nome,email,admin FROM lojas WHERE ativo=1 AND (admin=1 OR papel='atendente') AND email<>''").all();
  let enviados=0,falhas=0;
  for(const pessoa of equipe){
    const u={id:pessoa.id,admin:!!pessoa.admin};
    const lembretes=calcular({cobrancas:f.listar(db,u),clientes:carteira.clientes(db,u),tarefas:carteira.tarefas(db,u),hoje:dia,admin:u.admin});
    if(!lembretes.length)continue;
    try{await enviar({para:pessoa.email,...montar(pessoa,lembretes,painelUrl)});enviados++;}
    catch(e){falhas++;console.error(`lembretes por e-mail: falhou para ${pessoa.email}: ${e.message}`);}
  }
  return {enviados,falhas};
}

function enviarPorResend({apiKey,de,fetch=globalThis.fetch}){
  return async({para,assunto,html,texto})=>{
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
      body:JSON.stringify({from:de,to:[para],subject:assunto,html,text:texto})});
    if(!r.ok){const corpo=await r.json().catch(()=>({}));throw new Error(corpo.message||`Resend respondeu ${r.status}`);}
  };
}

/** Confere a cada hora; o envio do dia acontece na primeira volta depois das 8h. */
function iniciar(db){
  const apiKey=process.env.RESEND_API_KEY,de=process.env.LEMBRETES_EMAIL_DE;
  if(!apiKey||!de){console.log('  lembretes por e-mail desligados: defina RESEND_API_KEY e LEMBRETES_EMAIL_DE');return;}
  const enviar=enviarPorResend({apiKey,de}),painelUrl=process.env.DOMINIO?`https://${process.env.DOMINIO}`:'';
  const executar=()=>enviarResumos({db,enviar,painelUrl}).catch(e=>console.error('lembretes por e-mail:',e.message));
  executar();const timer=setInterval(executar,60*60*1000);timer.unref();
}

module.exports={enviarResumos,enviarPorResend,iniciar,emBrasilia};
