const fs=require('fs');const path=require('path');const crypto=require('crypto');
const execFile=require('util').promisify(require('child_process').execFile);
let emAndamento=false;
async function criar(db,pastaDados) {
  if(emAndamento)throw new Error('backup em andamento');emAndamento=true;
  try{const pasta=path.join(pastaDados,'backups');fs.mkdirSync(pasta,{recursive:true});
    const nome='painel-'+new Date().toISOString().replace(/[^\d]/g,'')+'-'+crypto.randomBytes(3).toString('hex')+'.db';
    await db.backup(path.join(pasta,nome));
    const arquivo=nome.replace(/\.db$/,'.tar.gz');
    const diretorios=['envios','materiais','perfis','comprovantes'].filter(d=>fs.existsSync(path.join(pastaDados,d)));
    await execFile('tar',['-czf',path.join(pasta,arquivo),'-C',pasta,nome,...(diretorios.length?['-C',pastaDados,...diretorios]:[])],{windowsHide:true});
    return arquivo;
  }finally{emAndamento=false;}
}
function iniciar(db,pastaDados) {
  const executar=async()=>{try{require('./financeiro').gerar(db);const pasta=path.join(pastaDados,'backups');
    const hoje=new Date().toISOString().slice(0,10).replace(/-/g,'');
    if(!fs.existsSync(pasta)||!fs.readdirSync(pasta).some(n=>n.startsWith('painel-'+hoje)&&n.endsWith('.tar.gz')))await criar(db,pastaDados);
  }catch(e){console.error('rotina da gestao:',e.message);}};
  executar();const timer=setInterval(executar,60*60*1000);timer.unref();
}
module.exports={criar,iniciar};
