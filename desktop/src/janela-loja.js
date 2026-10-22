/**
 * Janela de uma loja.
 *
 * A esquerda, as secoes da loja (Resumo, Cardapio.ai, E-mail, Implantacao,
 * Conferencia); em cima, o titulo da secao, os controles dela e os avisos.
 * Cardapio.ai e E-mail sao navegadores num perfil so daquela loja (partition
 * "persist:"), entao a loja quase sempre ja abre logada. As outras secoes sao
 * paginas do proprio app, que recebem os dados da loja pelo processo principal.
 *
 * Quando um navegador cai na tela de login, o login vem do cofre do painel e e
 * preenchido aqui, no processo principal, so no site do proprio servico.
 */
const { BrowserWindow, WebContentsView, session, ipcMain, shell } = require('electron');
const path = require('path');
const { situacaoDaPagina, scriptDePreenchimento } = require('./login-automatico');
const { SCRIPT_LEITURA, conferir } = require('./catalogo');
const { SCRIPT_PLANO, lerPlano } = require('./plano');
const { SCRIPT_ABRIR_CONVERSA, SCRIPT_LER_MENSAGEM, codigoNovo, scriptPreencherCodigo } = require('./codigo-email');

const LARGURA_MENU = 224, ALTURA_TOPO = 64, MARGEM_SITE = 12, TENTATIVAS = 3;
const SECOES = [
  { id: 'resumo', rotulo: 'Resumo', pagina: 'resumo.html' },
  { id: 'cardapio', rotulo: 'Cardapio.ai', web: true, tem: 'tem_cardapio' },
  { id: 'email', rotulo: 'E-mail', web: true, tem: 'tem_email' },
  { id: 'implantacao', rotulo: 'Implantação', pagina: 'implantacao.html' },
  { id: 'conferencia', rotulo: 'Conferência', pagina: 'conferencia.html' },
];
const abertas = new Map();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const vivo = (wc) => wc && !wc.isDestroyed();

// ------------------------------------------------------------------ estado na tela

/** Menu lateral e barra do topo (pagina loja.html, a "moldura" da janela). */
function enviarMoldura(estado) {
  if (estado.win.isDestroyed()) return;
  const atual = SECOES.find((s) => s.id === estado.atual), wc = estado.secoes[estado.atual]?.view.webContents;
  estado.win.webContents.send('loja:moldura', {
    nome: estado.loja.nome, atual: estado.atual, aviso: estado.aviso, plano: estado.plano || estado.loja.plano || null,
    secoes: SECOES.map((s) => ({ id: s.id, rotulo: s.rotulo, falta: !!(s.web && !estado.loja[s.tem]), alerta: alertaDaSecao(estado, s.id) })),
    navegador: !!atual?.web, voltar: !!(atual?.web && vivo(wc) && wc.navigationHistory.canGoBack()), titulo: atual?.web && vivo(wc) ? wc.getTitle() : '',
    conferindo: !!estado.conferindo, podeConferir: !!estado.loja.tem_cardapio,
  });
}
function alertaDaSecao(estado, id) {
  if (id === 'conferencia') return (estado.conferencia?.situacao || estado.loja.conferencia?.situacao) === 'bloqueante';
  if (id === 'cardapio') return !!estado.codigoPendente;
  return false;
}
/** Dados para as paginas do app (Resumo, Implantacao, Conferencia). */
function enviarDados(estado) {
  const dados = { loja: estado.loja, plano: estado.plano || estado.loja.plano || null, conferencia: estado.conferencia || null, conferindo: !!estado.conferindo };
  for (const s of SECOES.filter((x) => x.pagina)) { const wc = estado.secoes[s.id]?.view.webContents; if (vivo(wc)) wc.send('secao:dados', dados); }
}
function atualizar(estado) { enviarMoldura(estado); enviarDados(estado); }
function avisar(estado, texto) { estado.aviso = texto; enviarMoldura(estado); }

/** Os sites (Cardapio.ai, e-mail) ficam num painel com margem e cantos arredondados; as paginas do app ocupam a area toda. */
function posicionar(estado) {
  const [largura, altura] = estado.win.getContentSize();
  for (const [id, { view }] of Object.entries(estado.secoes)) {
    const m = SECOES.find((s) => s.id === id).web ? MARGEM_SITE : 0;
    view.setBounds({ x: LARGURA_MENU + m, y: ALTURA_TOPO + m, width: Math.max(0, largura - LARGURA_MENU - 2 * m), height: Math.max(0, altura - ALTURA_TOPO - 2 * m) });
  }
}
function mostrar(estado, id) {
  if (!estado.secoes[id]) return;
  estado.atual = id;
  for (const [secao, { view }] of Object.entries(estado.secoes)) view.setVisible(secao === id);
  atualizar(estado);
}

// ------------------------------------------------------------------ login automatico

function prepararNavegador(estado, id) {
  const secao = estado.secoes[id], wc = secao.view.webContents;
  // Links que abririam janela nova abrem na propria secao, dentro do perfil da loja.
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) wc.loadURL(url); return { action: 'deny' }; });
  const conferirPagina = async () => {
    const credencial = estado.credenciais[id];
    if (!credencial || !secao.inicio || !vivo(wc)) return;
    const situacao = situacaoDaPagina(id, wc.getURL(), secao.inicio);
    if (id === 'cardapio' && situacao === 'codigo') {
      estado.codigoPendente = true; enviarMoldura(estado);
      if (estado.credenciais.email) buscarCodigo(estado);
      else avisar(estado, 'O Cardapio.ai pediu o código de verificação. Cadastre o e-mail da loja no cofre para o app ler sozinho, ou digite à mão.');
      return;
    }
    if (id === 'cardapio') estado.codigoPendente = false;
    if (situacao !== 'login') {
      if (situacao === 'dentro') {
        secao.tentativas = 0;
        if (/^Entrando|^Código lido/.test(estado.aviso)) avisar(estado, '');
        if (id === 'cardapio' && !estado.planoPedido) lerPlanoEscondido(estado);
      }
      enviarMoldura(estado);
      return;
    }
    if (secao.tentativas >= TENTATIVAS) {
      avisar(estado, `O login automático não entrou em ${SECOES.find((s) => s.id === id).rotulo}. Confira os dados da loja em Lojas e acessos, no painel.`);
      return;
    }
    secao.tentativas++;
    avisar(estado, 'Entrando…');
    // Em telas montadas por JavaScript os campos aparecem um pouco depois do carregamento.
    for (let i = 0; i < 12 && vivo(wc); i++) {
      if (await wc.executeJavaScript(scriptDePreenchimento(id, credencial)).catch(() => null) === 'preenchido') return;
      await espera(700);
    }
  };
  wc.on('did-finish-load', conferirPagina);
  wc.on('did-navigate-in-page', conferirPagina);
  wc.on('page-title-updated', () => enviarMoldura(estado));
  wc.on('did-navigate', () => enviarMoldura(estado));
}

/**
 * Codigo de verificacao: o Cardapio.ai pediu, entao o app procura no e-mail da
 * loja a mensagem "Codigo de acesso" chegada depois do pedido e preenche.
 * Para se alguem digitar antes ou se a tela mudar.
 */
async function buscarCodigo(estado) {
  if (estado.buscandoCodigo) return;
  estado.buscandoCodigo = true;
  const pedidoEm = Date.now(), cdp = estado.secoes.cardapio, mail = estado.secoes.email;
  const naTelaDoCodigo = () => vivo(cdp.view.webContents) && situacaoDaPagina('cardapio', cdp.view.webContents.getURL(), cdp.inicio) === 'codigo';
  avisar(estado, 'O Cardapio.ai pediu o código. Procurando no e-mail da loja…');
  try {
    for (let tentativa = 0; tentativa < 40 && naTelaDoCodigo(); tentativa++) {
      const wc = mail.view.webContents;
      if (!vivo(wc)) return;
      // Enquanto o e-mail ainda esta entrando (login automatico), so espera.
      if (situacaoDaPagina('email', wc.getURL(), mail.inicio) !== 'dentro') { await espera(3000); continue; }
      // De tempos em tempos volta a caixa de entrada, para a conversa trazer a mensagem nova.
      if (tentativa % 4 === 0) {
        const conta = /\/u\/(\d+)\//.exec(new URL(wc.getURL()).pathname);
        await wc.loadURL(conta ? `${new URL(wc.getURL()).origin}/u/${conta[1]}/inbox` : mail.inicio).catch(() => {});
        await espera(3000);
      }
      await wc.executeJavaScript(SCRIPT_ABRIR_CONVERSA).catch(() => false);
      await espera(2500);
      const codigo = codigoNovo(await wc.executeJavaScript(SCRIPT_LER_MENSAGEM).catch(() => ({})), pedidoEm);
      if (codigo && naTelaDoCodigo()) {
        await cdp.view.webContents.executeJavaScript(scriptPreencherCodigo(codigo));
        avisar(estado, 'Código lido no e-mail da loja e preenchido.');
        return;
      }
      await espera(2000);
    }
    if (naTelaDoCodigo()) avisar(estado, 'Não achei o código novo no e-mail. Abra a seção E-mail da loja e digite à mão.');
  } finally {
    estado.buscandoCodigo = false;
  }
}

/** Le o plano numa janela escondida do mesmo perfil (ja logado), sem tirar ninguem da pagina. */
async function lerPlanoEscondido(estado) {
  estado.planoPedido = true;
  const oculta = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { session: estado.perfil, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  try {
    await oculta.loadURL(new URL('account?plans', estado.secoes.cardapio.inicio).toString());
    // O quadro do plano e montado pelo JavaScript da pagina depois do carregamento.
    let plano = null;
    for (let i = 0; i < 10 && !oculta.isDestroyed(); i++) {
      await espera(1000);
      plano = lerPlano(await oculta.webContents.executeJavaScript(SCRIPT_PLANO));
      if (plano.valido_ate || plano.teste_ate || plano.situacao) break;
    }
    if (!plano || !(plano.valido_ate || plano.teste_ate || plano.plano)) return;
    estado.plano = plano; atualizar(estado);
    await estado.api.salvarPlano(estado.loja.id, plano).catch(() => {});
  } catch { /* plano e informativo: sem leitura, a loja continua funcionando */ }
  finally { if (!oculta.isDestroyed()) oculta.destroy(); }
}

/**
 * Conferencia do catalogo: abre a listagem de produtos no Cardapio.ai (ja logado),
 * le tudo, compara com o que publicamos e mostra na secao Conferencia.
 * O resultado tambem vai para o painel, para a equipe ver na ficha da loja.
 */
async function conferirCatalogo(estado) {
  const secao = estado.secoes.cardapio, wc = secao.view.webContents;
  if (estado.conferindo) return;
  if (!secao.inicio) { avisar(estado, 'Esta loja ainda não tem o login do Cardapio.ai no cofre.'); return; }
  estado.conferindo = true; mostrar(estado, 'cardapio'); avisar(estado, 'Lendo o catálogo no Cardapio.ai…');
  try {
    const listagem = new URL('listar', secao.inicio).toString();
    // Ate 60s para o login automatico (e o codigo) terminarem, se a sessao tiver caido.
    for (let i = 0; i < 40 && vivo(wc); i++) {
      const situacao = situacaoDaPagina('cardapio', wc.getURL(), secao.inicio);
      if (situacao === 'dentro' && new URL(wc.getURL()).pathname.endsWith('/listar')) break;
      if (situacao === 'dentro') await wc.loadURL(listagem).catch(() => {});
      else await espera(1500);
    }
    if (!vivo(wc) || !new URL(wc.getURL()).pathname.endsWith('/listar')) throw new Error('não consegui abrir a lista de produtos (o login entrou?)');
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
    estado.conferencia = { ...resultado, quando: new Date().toISOString() };
    estado.loja.conferencia = { situacao: resultado.situacao, criada_em: estado.conferencia.quando };
    avisar(estado, '');
    mostrar(estado, 'conferencia');
  } catch (e) {
    avisar(estado, `Conferência não terminou: ${e.message}`);
  } finally {
    estado.conferindo = false; atualizar(estado);
  }
}

// ------------------------------------------------------------------ janela

async function abrir({ loja, api, aoExpirar }) {
  const aberta = abertas.get(loja.id);
  if (aberta && !aberta.win.isDestroyed()) { aberta.win.show(); aberta.win.focus(); return; }

  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1000, minHeight: 640,
    title: `${loja.nome} · Catálogo Pronto`, backgroundColor: '#f4efe9',
    webPreferences: { preload: path.join(__dirname, 'preload-loja.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.removeMenu();
  const perfil = session.fromPartition(`persist:loja-${loja.id}`);
  const estado = { win, loja, api, perfil, secoes: {}, credenciais: {}, atual: 'resumo', aviso: '', conferindo: false };
  abertas.set(loja.id, estado);
  win.on('closed', () => {
    abertas.delete(loja.id);
    for (const { view } of Object.values(estado.secoes)) if (vivo(view.webContents)) view.webContents.close();
  });

  await win.loadFile(path.join(__dirname, 'telas', 'loja.html'));
  for (const s of SECOES) {
    const view = new WebContentsView({ webPreferences: s.web
      ? { session: perfil, contextIsolation: true, sandbox: true, nodeIntegration: false }
      : { preload: path.join(__dirname, 'preload-secao.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    view.setBackgroundColor(s.web ? '#ffffff' : '#f4efe9');
    if (s.web) view.setBorderRadius(14);
    win.contentView.addChildView(view);
    estado.secoes[s.id] = { view, tentativas: 0, inicio: null };
    if (s.web) prepararNavegador(estado, s.id);
    else {
      view.webContents.on('did-finish-load', () => enviarDados(estado));
      view.webContents.loadFile(path.join(__dirname, 'telas', s.pagina));
    }
  }
  posicionar(estado);
  win.on('resize', () => posicionar(estado));
  mostrar(estado, 'resumo');

  // Um pedido ao cofre por servico a cada abertura; cada um fica no historico da loja.
  for (const s of SECOES.filter((x) => x.web)) {
    if (!loja[s.tem]) { estado.secoes[s.id].view.webContents.loadFile(path.join(__dirname, 'telas', 'sem-login.html'), { query: { servico: s.rotulo } }); continue; }
    try {
      const acesso = await api.acesso(loja.id, s.id);
      estado.credenciais[s.id] = { usuario: acesso.usuario, senha: acesso.senha };
      estado.secoes[s.id].inicio = acesso.url;
    } catch (e) {
      if (e.sessaoExpirada) { win.close(); aoExpirar(); return; }
      avisar(estado, `Não consegui buscar o login de ${s.rotulo}: ${e.message}`);
    }
  }
  // So abre as paginas depois de ter os dois logins: o pedido de codigo do Cardapio.ai
  // precisa saber que existe o e-mail da loja para ler o codigo nele.
  for (const s of SECOES.filter((x) => x.web && estado.secoes[x.id].inicio)) estado.secoes[s.id].view.webContents.loadURL(estado.secoes[s.id].inicio);
}

// ------------------------------------------------------------------ canais

/** Acoes pedidas pela moldura ou pelas paginas do app. So valem dentro da propria janela. */
function registrarCanais() {
  const daLoja = (fn) => (evento, ...args) => {
    const estado = [...abertas.values()].find((e) => !e.win.isDestroyed()
      && (e.win.webContents === evento.sender || Object.values(e.secoes).some(({ view }) => view.webContents === evento.sender)));
    if (estado) fn(estado, ...args);
  };
  ipcMain.on('loja:pronta', daLoja((estado) => atualizar(estado)));
  ipcMain.on('loja:secao', daLoja((estado, id) => mostrar(estado, id)));
  ipcMain.on('loja:voltar', daLoja((estado) => { const wc = estado.secoes[estado.atual].view.webContents; if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); }));
  ipcMain.on('loja:recarregar', daLoja((estado) => { const s = estado.secoes[estado.atual]; s.tentativas = 0; s.view.webContents.reload(); }));
  ipcMain.on('loja:acao', daLoja((estado, acao) => {
    if (acao === 'conferir') conferirCatalogo(estado);
    if (acao === 'abrir-cardapio') mostrar(estado, 'cardapio');
    if (acao === 'abrir-email') mostrar(estado, 'email');
    if (acao === 'abrir-conferencia') mostrar(estado, 'conferencia');
    // Paginas do painel abrem no navegador do computador (o painel pede o login dele).
    if (acao === 'abrir-ficha') shell.openExternal(`${estado.api.servidor}/ficha.html?loja=${estado.loja.id}`);
    if (acao === 'abrir-loja-painel') shell.openExternal(`${estado.api.servidor}/gestao.html#cliente-${estado.loja.id}`);
    if (acao === 'abrir-roteiro') shell.openExternal(`${estado.api.servidor}/gestao.html?loja=${estado.loja.id}#lojas-novas`);
    if (acao === 'abrir-cardapio-publico' && /^https?:\/\//.test(estado.loja.link || '')) shell.openExternal(estado.loja.link);
  }));
}

function fecharTodas() { for (const { win } of abertas.values()) if (!win.isDestroyed()) win.close(); }

module.exports = { abrir, registrarCanais, fecharTodas, SECOES };
