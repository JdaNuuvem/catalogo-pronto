import {guia} from './gestao-ajuda.js';
const codigo=document.body.dataset.ajudaTela;
const main=codigo==='produtos'?document.querySelector('#app main'):document.querySelector('main');
function atualizar(){if(!main||!codigo)return;
  const admin=codigo==='produtos'?document.body.dataset.ajudaPapel!=='atendente':document.body.dataset.ajudaAdmin!=='false';
  const anterior=main.querySelector('[data-guia]');
  if(anterior)anterior.outerHTML=guia(codigo,admin);else main.insertAdjacentHTML('afterbegin',guia(codigo,admin));
}
atualizar();document.addEventListener('catalogo-perfil',atualizar);
