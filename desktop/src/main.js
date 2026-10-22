/**
 * Processo principal do app. Guarda a sessao, conversa com o painel e abre
 * as janelas das lojas. As telas (renderer) so falam com ele pelos canais de
 * IPC abaixo; nenhuma senha passa pela tela da lista de lojas.
 */
const { app, BrowserWindow, ipcMain, safeStorage, shell, powerMonitor, Notification } = require('electron');
const os = require('os');
const path = require('path');
const { Api } = require('./api');
const { criarArmazem } = require('./sessao');
const lojasAbertas = require('./janela-loja');
const { novidades, criarMemoria } = require('./avisos');
const atualizacao = require('./atualizacao');

const SERVIDOR_PADRAO = process.env.CATALOGO_SERVIDOR || 'https://l11drbc2qrrvbhdp6s2tkhoo.177.7.45.242.sslip.io';
// Minutos sem mexer no computador ate o app pedir a senha de novo.
const BLOQUEIO_MIN = Number(process.env.CATALOGO_BLOQUEIO_MIN) || 15;
let janela = null, api = null, armazem = null, ultimaLista = [], bloqueado = false, memoriaAvisos = null, atualizador = null, versaoPronta = null;

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
  api = null; bloqueado = false; armazem.limpar(); memoriaAvisos.limpar(); lojasAbertas.fecharTodas();
  if (janela) janela.webContents.send('sessao-expirada');
}

/**
 * Avisos do Windows a cada 5 minutos: lembretes atrasados ou de hoje e fichas recebidas.
 * Bloqueado, nao avisa (o aviso mostraria o nome das lojas na tela).
 */
async function verificarAvisos() {
  if (!api || bloqueado || !Notification.isSupported()) return;
  let leitura;
  try { leitura = { lojas: await api.lojas(), lembretes: await api.lembretes() }; } catch { return; }
  ultimaLista = leitura.lojas;
  const avisos = novidades(leitura, memoriaAvisos.visto);
  memoriaAvisos.gravar();
  const mostrar = avisos.length > 3 ? [...avisos.slice(0, 2), { titulo: 'Catálogo Pronto', corpo: `E mais ${avisos.length - 2} avisos na tela Hoje.`, lojaId: null }] : avisos;
  for (const a of mostrar) {
    const n = new Notification({ title: a.titulo, body: a.corpo });
    n.on('click', () => {
      if (janela) { if (janela.isMinimized()) janela.restore(); janela.show(); janela.focus(); }
      const loja = a.lojaId && ultimaLista.find((l) => l.id === a.lojaId);
      if (loja && !bloqueado && (loja.tem_cardapio || loja.tem_email)) lojasAbertas.abrir({ loja, api, aoExpirar: expirou }).catch(() => {});
    });
    n.show();
  }
}

/** Esconde as lojas e pede a senha. Os logins abertos continuam, so ninguem ve. */
function bloquear() {
  if (!api || bloqueado) return;
  bloqueado = true; lojasAbertas.esconderTodas();
  if (janela) { janela.webContents.send('bloqueado'); janela.show(); }
}

// So a janela principal fala com estes canais. Bloqueado, so desbloquear e sair respondem.
function daJanela(handler, { mesmoBloqueado = false } = {}) {
  return async (evento, ...args) => {
    if (!janela || evento.sender !== janela.webContents) return { erro: 'pedido recusado' };
    if (bloqueado && !mesmoBloqueado) return { erro: 'O app está bloqueado. Digite sua senha.', bloqueado: true };
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
      return { conectado: true, bloqueado, nome: eu.nome, papel: eu.papel, servidor: api.servidor, versao: app.getVersion(), versaoPronta };
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
    setTimeout(verificarAvisos, 20000);
    return { nome: conta.nome, papel: conta.papel };
  }));

  ipcMain.handle('sair', daJanela(async () => {
    lojasAbertas.fecharTodas();
    if (api) await api.sair().catch(() => null);
    api = null; bloqueado = false; armazem.limpar(); memoriaAvisos.limpar();
    return { ok: true };
  }, { mesmoBloqueado: true }));

  ipcMain.handle('desbloquear', daJanela(async (senha) => {
    if (!api) throw Object.assign(new Error('Entre novamente no app.'), { sessaoExpirada: true });
    await api.desbloquear(String(senha || ''));
    bloqueado = false; lojasAbertas.mostrarTodas();
    return { ok: true };
  }, { mesmoBloqueado: true }));

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

  ipcMain.handle('instalar-atualizacao', daJanela(async () => ({ ok: atualizador.instalar() }), { mesmoBloqueado: false }));

  lojasAbertas.registrarCanais();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (janela) { if (janela.isMinimized()) janela.restore(); janela.focus(); } });
  app.whenReady().then(() => {
    // Mesmo id do instalador: sem ele o Windows nao mostra os avisos.
    app.setAppUserModelId('br.com.catalogopronto.desktop');
    armazem = criarArmazem({ arquivo: path.join(app.getPath('userData'), 'sessao.json'), safeStorage });
    memoriaAvisos = criarMemoria(path.join(app.getPath('userData'), 'avisos.json'));
    const guardada = armazem.ler();
    if (guardada.token) api = new Api({ servidor: guardada.servidor, token: guardada.token });
    registrar();
    criarJanela();
    atualizador = atualizacao.iniciar({
      servidor: () => (api ? api.servidor : armazem.ler().servidor || SERVIDOR_PADRAO),
      aoPronta: (versao) => { versaoPronta = versao; if (janela) janela.webContents.send('atualizacao-pronta', versao); },
    });
    // Bloqueio: tela do Windows bloqueada, computador suspenso ou tempo parado.
    powerMonitor.on('lock-screen', bloquear);
    powerMonitor.on('suspend', bloquear);
    setInterval(() => { if (powerMonitor.getSystemIdleTime() >= BLOQUEIO_MIN * 60) bloquear(); }, 30000).unref();
    setTimeout(verificarAvisos, 20000);
    setInterval(verificarAvisos, 5 * 60 * 1000).unref();
  });
  app.on('window-all-closed', () => app.quit());
}
