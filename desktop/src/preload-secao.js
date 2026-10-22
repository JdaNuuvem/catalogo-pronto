// Ponte das paginas do app dentro da janela da loja (Resumo, Implantacao, Conferencia):
// recebem os dados da loja e pedem acoes ao processo principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('secao', {
  aoDados: (fn) => ipcRenderer.on('secao:dados', (_e, dados) => fn(dados)),
  acao: (nome) => ipcRenderer.send('loja:acao', nome),
  // So a pagina de Implantacao e atendida nestes canais (o processo principal confere).
  implantacao: (nome, ...args) => ipcRenderer.invoke(`implantacao:${nome}`, ...args),
  aoProgresso: (fn) => ipcRenderer.on('implantacao:progresso', (_e, dados) => fn(dados)),
  aoEvento: (fn) => ipcRenderer.on('implantacao:evento', (_e, dados) => fn(dados)),
});
