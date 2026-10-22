// Ponte entre a tela inicial e o processo principal: so estas funcoes existem na pagina.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('catalogo', {
  sessao: () => ipcRenderer.invoke('sessao'),
  entrar: (dados) => ipcRenderer.invoke('entrar', dados),
  sair: () => ipcRenderer.invoke('sair'),
  lojas: () => ipcRenderer.invoke('lojas'),
  lembretes: () => ipcRenderer.invoke('lembretes'),
  abrirLoja: (id) => ipcRenderer.invoke('abrir-loja', id),
  abrirPainel: () => ipcRenderer.invoke('abrir-painel'),
  aoExpirar: (fn) => ipcRenderer.on('sessao-expirada', () => fn()),
  desbloquear: (senha) => ipcRenderer.invoke('desbloquear', senha),
  aoBloquear: (fn) => ipcRenderer.on('bloqueado', () => fn()),
  instalarAtualizacao: () => ipcRenderer.invoke('instalar-atualizacao'),
  aoAtualizacao: (fn) => ipcRenderer.on('atualizacao-pronta', (_e, versao) => fn(versao)),
});
