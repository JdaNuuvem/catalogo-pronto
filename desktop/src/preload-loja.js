// Ponte da barra de uma janela de loja: trocar de aba, voltar e recarregar.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loja', {
  aba: (id) => ipcRenderer.send('loja:aba', id),
  voltar: () => ipcRenderer.send('loja:voltar'),
  recarregar: () => ipcRenderer.send('loja:recarregar'),
  conferir: () => ipcRenderer.send('loja:conferir'),
  pronta: () => ipcRenderer.send('loja:pronta'),
  aoEstado: (fn) => ipcRenderer.on('loja:estado', (_e, estado) => fn(estado)),
});
