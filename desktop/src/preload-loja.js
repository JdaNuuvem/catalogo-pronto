// Ponte da moldura de uma janela de loja: trocar de secao, voltar, recarregar e pedir acoes.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loja', {
  secao: (id) => ipcRenderer.send('loja:secao', id),
  voltar: () => ipcRenderer.send('loja:voltar'),
  recarregar: () => ipcRenderer.send('loja:recarregar'),
  acao: (nome) => ipcRenderer.send('loja:acao', nome),
  pronta: () => ipcRenderer.send('loja:pronta'),
  aoMoldura: (fn) => ipcRenderer.on('loja:moldura', (_e, estado) => fn(estado)),
});
