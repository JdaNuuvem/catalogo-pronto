// Ponte das paginas do app dentro da janela da loja (Resumo, Implantacao, Conferencia):
// recebem os dados da loja e pedem acoes ao processo principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('secao', {
  aoDados: (fn) => ipcRenderer.on('secao:dados', (_e, dados) => fn(dados)),
  acao: (nome) => ipcRenderer.send('loja:acao', nome),
});
