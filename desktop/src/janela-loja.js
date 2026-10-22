/**
 * Janela de uma loja: duas abas (Cardapio.ai e e-mail da loja) num perfil de
 * navegador so daquela loja. O perfil e permanente (partition "persist:"), entao
 * os cookies ficam e na maior parte das vezes a loja ja abre logada.
 *
 * Quando uma aba cai na tela de login, o login vem do cofre do painel e e
 * preenchido aqui, no processo principal. A pagina da loja nunca recebe a
 * senha por outro caminho, e ela so e preenchida no site do proprio servico.
 */
const { BrowserWindow, WebContentsView, session, ipcMain } = require('electron');
const path = require('path');
const { situacaoDaPagina, scriptDePreenchimento } = require('./login-automatico');
const { SCRIPT_LEITURA, conferir } = require('./catalogo');

const ALTURA_BARRA = 58, TENTATIVAS = 3;
// A aba Conferencia e uma pagina do proprio app (local): nao usa o perfil da loja nem login.
const ABAS = [{ id: 'cardapio', rotulo: 'Cardapio.ai', tem: 'tem_cardapio' }, { id: 'email', rotulo: 'E-mail da loja', tem: 'tem_email' },
  { id: 'conferencia', rotulo: 'Conferência', local: true }];
const abertas = new Map();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function enviarEstado(estado) {
  if (estado.win.isDestroyed()) return;
  estado.win.webContents.send('loja:estado', {
    nome: estado.loja.nome, atual: estado.atual, aviso: estado.aviso, conferindo: !!estado.conferindo, podeConferir: !!estado.loja.tem_cardapio,
    abas: ABAS.map((a) => {
      const wc = estado.abas[a.id]?.view.webContents;
      return { id: a.id, rotulo: a.rotulo, titulo: wc && !wc.isDestroyed() ? wc.getTitle() : '', voltar: !!(wc && !wc.isDestroyed() && wc.navigationHistory.canGoBack()) };
    }),
  });
}
function avisar(estado, texto) { estado.aviso = texto; enviarEstado(estado); }

function posicionar(estado) {
  const [largura, altura] = estado.win.getContentSize();
  for (const { view } of Object.values(estado.abas)) view.setBounds({ x: 0, y: ALTURA_BARRA, width: largura, height: Math.max(0, altura - ALTURA_BARRA) });
}

function mostrar(estado, id) {
  estado.atual = id;
  for (const [aba, { view }] of Object.entries(estado.abas)) view.setVisible(aba === id);
  enviarEstado(estado);
}

function prepararAba(estado, id) {
  const aba = estado.abas[id], wc = aba.view.webContents;
  // Links que abririam janela nova abrem na propria aba, dentro do perfil da loja.
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) wc.loadURL(url); return { action: 'deny' }; });

  const conferir = async () => {
    const credencial = estado.credenciais[id];
    if (!credencial || !aba.inicio || wc.isDestroyed()) return;
    const situacao = situacaoDaPagina(id, wc.getURL(), aba.inicio);
    if (id === 'cardapio' && situacao === 'codigo') {
      avisar(estado, 'O Cardapio.ai pediu o código de verificação. Ele chega no e-mail da loja: veja a aba E-mail.');
      return;
    }
    if (situacao !== 'login') { if (situacao === 'dentro') { aba.tentativas = 0; if (estado.aviso === 'Entrando…') avisar(estado, ''); } return; }
    if (aba.tentativas >= TENTATIVAS) {
      avisar(estado, `O login automático não entrou em ${ABAS.find((a) => a.id === id).rotulo}. Confira os dados da loja em Lojas e acessos.`);
      return;
    }
    aba.tentativas++;
    avisar(estado, 'Entrando…');
    // Em telas montadas por JavaScript os campos aparecem um pouco depois do carregamento.
    for (let i = 0; i < 12 && !wc.isDestroyed(); i++) {
      const r = await wc.executeJavaScript(scriptDePreenchimento(id, credencial)).catch(() => null);
      if (r === 'preenchido') return;
      await espera(700);
    }
  };
  wc.on('did-finish-load', conferir);
  wc.on('did-navigate-in-page', conferir);
  wc.on('page-title-updated', () => enviarEstado(estado));
  wc.on('did-navigate', () => enviarEstado(estado));
}

async function abrir({ loja, api, aoExpirar }) {
  const aberta = abertas.get(loja.id);
  if (aberta && !aberta.win.isDestroyed()) { aberta.win.show(); aberta.win.focus(); return; }

  const win = new BrowserWindow({
    width: 1380, height: 900, minWidth: 900, minHeight: 600,
    title: `${loja.nome} · Catálogo Pronto`, backgroundColor: '#f4efe9',
    webPreferences: { preload: path.join(__dirname, 'preload-loja.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.removeMenu();
  const perfil = session.fromPartition(`persist:loja-${loja.id}`);
  const estado = { win, loja, api, abas: {}, credenciais: {}, atual: 'cardapio', aviso: '', conferindo: false };
  abertas.set(loja.id, estado);
  win.on('closed', () => {
    abertas.delete(loja.id);
    for (const { view } of Object.values(estado.abas)) if (!view.webContents.isDestroyed()) view.webContents.close();
  });

  await win.loadFile(path.join(__dirname, 'telas', 'loja.html'));
  for (const a of ABAS) {
    const view = new WebContentsView({ webPreferences: a.local
      ? { preload: path.join(__dirname, 'preload-conferencia.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
      : { session: perfil, contextIsolation: true, sandbox: true, nodeIntegration: false } });
    view.setBackgroundColor(a.local ? '#f4efe9' : '#ffffff');
    win.contentView.addChildView(view);
    estado.abas[a.id] = { view, tentativas: 0, inicio: null };
    if (a.local) view.webContents.loadFile(path.join(__dirname, 'telas', 'conferencia.html'));
    else prepararAba(estado, a.id);
  }
  posicionar(estado);
  win.on('resize', () => posicionar(estado));
  mostrar(estado, 'cardapio');

  // Um pedido ao cofre por servico a cada abertura; cada um fica no historico da loja.
  for (const a of ABAS.filter((x) => !x.local)) {
    const { view } = estado.abas[a.id];
    if (!loja[a.tem]) { view.webContents.loadFile(path.join(__dirname, 'telas', 'sem-login.html'), { query: { servico: a.rotulo } }); continue; }
    try {
      const acesso = await api.acesso(loja.id, a.id);
      estado.credenciais[a.id] = { usuario: acesso.usuario, senha: acesso.senha };
      estado.abas[a.id].inicio = acesso.url;
      view.webContents.loadURL(acesso.url);
    } catch (e) {
      if (e.sessaoExpirada) { win.close(); aoExpirar(); return; }
      avisar(estado, `Não consegui buscar o login de ${a.rotulo}: ${e.message}`);
    }
  }
}

/**
 * Conferencia do catalogo: abre a listagem de produtos na aba do Cardapio.ai
 * (ja logada), le tudo, compara com o que publicamos e mostra na aba Conferencia.
 * O resultado tambem vai para o painel, para a equipe ver na ficha da loja.
 */
async function conferirCatalogo(estado) {
  const aba = estado.abas.cardapio, wc = aba.view.webContents;
  if (estado.conferindo) return;
  if (!aba.inicio) { avisar(estado, 'Esta loja ainda não tem o login do Cardapio.ai no cofre.'); return; }
  estado.conferindo = true; mostrar(estado, 'cardapio'); avisar(estado, 'Lendo o catálogo no Cardapio.ai…');
  try {
    const listagem = new URL('listar', aba.inicio).toString();
    // Ate 60s para o login automatico terminar, se a sessao tiver caido.
    for (let i = 0; i < 40 && !wc.isDestroyed(); i++) {
      if (situacaoDaPagina('cardapio', wc.getURL(), aba.inicio) === 'dentro' && new URL(wc.getURL()).pathname.endsWith('/listar')) break;
      if (situacaoDaPagina('cardapio', wc.getURL(), aba.inicio) === 'dentro') await wc.loadURL(listagem).catch(() => {});
      else await espera(1500);
    }
    if (wc.isDestroyed() || !new URL(wc.getURL()).pathname.endsWith('/listar')) throw new Error('não consegui abrir a lista de produtos (o login entrou?)');
    // A lista aparece aos poucos: le ate a contagem ficar estavel.
    let lidos = null, anterior = -1;
    for (let i = 0; i < 20; i++) {
      lidos = await wc.executeJavaScript(SCRIPT_LEITURA);
      if (lidos.produtos.length && lidos.produtos.length === anterior) break;
      anterior = lidos.produtos.length; await espera(1000);
    }
    const { contratados, esperados } = await estado.api.esperados(estado.loja.id);
    const resultado = conferir({ lidos, esperados, contratados });
    await estado.api.salvarConferencia(estado.loja.id, resultado).catch((e) => { resultado.aviso = `Não consegui salvar no painel: ${e.message}`; });
    estado.abas.conferencia.view.webContents.send('conferencia:resultado', { loja: estado.loja.nome, quando: new Date().toISOString(), ...resultado });
    mostrar(estado, 'conferencia');
    avisar(estado, '');
  } catch (e) {
    avisar(estado, `Conferência não terminou: ${e.message}`);
  } finally {
    estado.conferindo = false; enviarEstado(estado);
  }
}

/** Canais da barra de cada loja. So valem para a barra da propria janela. */
function registrarCanais() {
  const daBarra = (fn) => (evento, ...args) => {
    const estado = [...abertas.values()].find((e) => !e.win.isDestroyed() && e.win.webContents === evento.sender);
    if (estado) fn(estado, ...args);
  };
  ipcMain.on('loja:aba', daBarra((estado, id) => { if (estado.abas[id]) mostrar(estado, id); }));
  ipcMain.on('loja:voltar', daBarra((estado) => { const wc = estado.abas[estado.atual].view.webContents; if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); }));
  ipcMain.on('loja:recarregar', daBarra((estado) => { if (estado.atual === 'conferencia') return; estado.abas[estado.atual].tentativas = 0; estado.abas[estado.atual].view.webContents.reload(); }));
  ipcMain.on('loja:pronta', daBarra((estado) => enviarEstado(estado)));
  ipcMain.on('loja:conferir', daBarra((estado) => conferirCatalogo(estado)));
}

function fecharTodas() { for (const { win } of abertas.values()) if (!win.isDestroyed()) win.close(); }

module.exports = { abrir, registrarCanais, fecharTodas };
