/**
 * Processo principal do app. Guarda a sessao, conversa com o painel e abre
 * as janelas das lojas. As telas (renderer) so falam com ele pelos canais de
 * IPC abaixo; nenhuma senha passa pela tela da lista de lojas.
 */
const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const os = require('os');
const path = require('path');
const { Api } = require('./api');
const { criarArmazem } = require('./sessao');
const lojasAbertas = require('./janela-loja');

const SERVIDOR_PADRAO = process.env.CATALOGO_SERVIDOR || 'https://l11drbc2qrrvbhdp6s2tkhoo.177.7.45.242.sslip.io';
let janela = null, api = null, armazem = null, ultimaLista = [];

function criarJanela() {
  janela = new BrowserWindow({
    width: 1180, height: 780, minWidth: 900, minHeight: 600, show: false,
    title: 'Catálogo Pronto', backgroundColor: '#f4efe9',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  janela.removeMenu();
  janela.loadFile(path.join(__dirname, 'telas', 'inicio.html'));
  janela.once('ready-to-show', () => janela.show());
  janela.on('closed', () => { janela = null; });
}

/** Sessao vencida (senha trocada, conta desativada, saiu em outro lugar): volta ao login. */
function expirou() {
  api = null; armazem.limpar(); lojasAbertas.fecharTodas();
  if (janela) janela.webContents.send('sessao-expirada');
}

// So a janela principal fala com estes canais.
function daJanela(handler) {
  return async (evento, ...args) => {
    if (!janela || evento.sender !== janela.webContents) return { erro: 'pedido recusado' };
    try { return await handler(...args); } catch (e) {
      if (e.sessaoExpirada) { expirou(); return { erro: e.message, expirou: true }; }
      return { erro: e.message };
    }
  };
}

function registrar() {
  ipcMain.handle('sessao', daJanela(async () => {
    const guardada = armazem.ler();
    if (!api || !api.token) return { conectado: false, servidor: guardada.servidor || SERVIDOR_PADRAO };
    try {
      const eu = await api.eu();
      return { conectado: true, nome: eu.nome, papel: eu.papel, servidor: api.servidor };
    } catch (e) {
      if (e.sessaoExpirada) { expirou(); return { conectado: false, servidor: guardada.servidor, aviso: 'Sua sessão terminou. Entre novamente.' }; }
      return { conectado: true, offline: true, nome: guardada.nome, papel: guardada.papel, servidor: api.servidor, aviso: e.message };
    }
  }));

  ipcMain.handle('entrar', daJanela(async ({ servidor, email, senha }) => {
    const nova = new Api({ servidor });
    const conta = await nova.entrar(String(email || '').trim(), String(senha || ''), `${os.hostname()} (${os.userInfo().username})`);
    api = nova;
    armazem.gravar({ servidor: nova.servidor, token: nova.token, nome: conta.nome, papel: conta.papel });
    return { nome: conta.nome, papel: conta.papel };
  }));

  ipcMain.handle('sair', daJanela(async () => {
    lojasAbertas.fecharTodas();
    if (api) await api.sair().catch(() => null);
    api = null; armazem.limpar();
    return { ok: true };
  }));

  ipcMain.handle('lojas', daJanela(async () => {
    if (!api) throw Object.assign(new Error('Entre novamente no app.'), { sessaoExpirada: true });
    ultimaLista = await api.lojas();
    return { lojas: ultimaLista };
  }));

  ipcMain.handle('lembretes', daJanela(async () => {
    if (!api) throw Object.assign(new Error('Entre novamente no app.'), { sessaoExpirada: true });
    return { lembretes: await api.lembretes() };
  }));

  ipcMain.handle('abrir-loja', daJanela(async (id) => {
    const loja = ultimaLista.find((l) => l.id === Number(id));
    if (!loja || !api) return { erro: 'Loja não encontrada. Atualize a lista.' };
    await lojasAbertas.abrir({ loja, api, aoExpirar: expirou });
    return { ok: true };
  }));

  ipcMain.handle('abrir-painel', daJanela(async () => {
    await shell.openExternal(`${api ? api.servidor : SERVIDOR_PADRAO}/gestao.html`);
    return { ok: true };
  }));

  lojasAbertas.registrarCanais();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (janela) { if (janela.isMinimized()) janela.restore(); janela.focus(); } });
  app.whenReady().then(() => {
    armazem = criarArmazem({ arquivo: path.join(app.getPath('userData'), 'sessao.json'), safeStorage });
    const guardada = armazem.ler();
    if (guardada.token) api = new Api({ servidor: guardada.servidor, token: guardada.token });
    registrar();
    criarJanela();
  });
  app.on('window-all-closed', () => app.quit());
}
