/**
 * Atualizacao automatica: o painel serve as versoes novas em /app-desktop/
 * (latest.yml, instalador e .blockmap). O app confere ao abrir e a cada 6 horas,
 * baixa em segundo plano e avisa a janela principal; instalar fica a criterio
 * do atendente (reinicia o app). So vale no app instalado.
 */
const { app } = require('electron');

const INTERVALO = 6 * 60 * 60 * 1000;

function iniciar({ servidor, aoPronta }) {
  if (!app.isPackaged) return { instalar: () => false };
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  let pronta = null;
  autoUpdater.on('update-downloaded', (info) => { pronta = info.version; aoPronta(info.version); });
  autoUpdater.on('error', () => { /* sem internet ou sem versao publicada: tenta de novo depois */ });
  const conferir = () => {
    const url = servidor();
    if (!url) return;
    autoUpdater.setFeedURL({ provider: 'generic', url: `${url}/app-desktop/` });
    autoUpdater.checkForUpdates().catch(() => {});
  };
  setTimeout(conferir, 30000);
  setInterval(conferir, INTERVALO).unref();
  return { instalar: () => { if (!pronta) return false; autoUpdater.quitAndInstall(false, true); return true; } };
}

module.exports = { iniciar };
