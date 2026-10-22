// Ponte da aba Conferencia: so recebe o resultado que o processo principal calculou.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('conferencia', {
  aoResultado: (fn) => ipcRenderer.on('conferencia:resultado', (_e, resultado) => fn(resultado)),
});
