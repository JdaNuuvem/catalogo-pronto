/**
 * Implantacao pelo app: o que a pagina implantacao.html pede ao processo principal.
 *
 * Produtos seguem o mesmo caminho do painel web (IA no servidor, lote, fila de
 * publicacao). O app escolhe as fotos no computador, manda tirar o fundo e
 * acompanha a publicacao; quando o Cardapio.ai pede o codigo de acesso, o app
 * le no e-mail da loja e responde sozinho.
 */
const { ipcMain, dialog, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const TIPOS = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const POR_ENVIO = 8; // o servidor le 8 fotos por chamada de IA
const TAMANHO_MAXIMO = 3 * 1024 * 1024;
const MAXIMO_FOTOS = 60;

/** Fotos escolhidas no computador: so imagens aceitas e ate 3MB (as maiores sao reduzidas). */
function lerFotos(caminhos) {
  const fotos = [], recusadas = [];
  for (const caminho of caminhos.slice(0, MAXIMO_FOTOS)) {
    const tipo = TIPOS[path.extname(caminho).toLowerCase()];
    if (!tipo) { recusadas.push(`${path.basename(caminho)}: formato não aceito`); continue; }
    let dados = fs.readFileSync(caminho);
    if (dados.length > TAMANHO_MAXIMO) {
      // Foto de celular costuma passar de 3MB: reduz para 2000px em JPEG antes de enviar.
      const img = nativeImage.createFromBuffer(dados);
      const { width, height } = img.getSize();
      const lado = Math.max(width, height);
      dados = (lado > 2000 ? img.resize(width >= height ? { width: 2000 } : { height: 2000 }) : img).toJPEG(85);
      if (dados.length > TAMANHO_MAXIMO) { recusadas.push(`${path.basename(caminho)}: grande demais`); continue; }
      fotos.push({ nome: path.basename(caminho).replace(/\.[^.]+$/, '.jpg'), tipo: 'image/jpeg', dados });
      continue;
    }
    fotos.push({ nome: path.basename(caminho), tipo, dados });
  }
  if (caminhos.length > MAXIMO_FOTOS) recusadas.push(`só as primeiras ${MAXIMO_FOTOS} fotos foram usadas`);
  return { fotos, recusadas };
}

/** Miniatura em data URL para a tela (a foto inteira fica no servidor). */
const miniatura = (buffer, largura = 360) => {
  const img = nativeImage.createFromBuffer(buffer);
  return (img.getSize().width > largura ? img.resize({ width: largura, quality: 'good' }) : img).toDataURL();
};

/**
 * @param {object} deps
 * @param {(wc) => object|null} deps.estadoDe       estado da janela da loja dona da pagina
 * @param {(estado, pedidoEm, continuar) => Promise<string|null>} deps.lerCodigoNoEmail
 * @param {(estado, caminho) => void} deps.abrirNoCardapio
 */
function registrar({ estadoDe, lerCodigoNoEmail, abrirNoCardapio }) {
  const canal = (nome, fn) => ipcMain.handle(`implantacao:${nome}`, async (evento, ...args) => {
    const estado = estadoDe(evento.sender);
    // So a pagina de Implantacao da propria janela usa estes canais.
    if (!estado || evento.sender !== estado.secoes.implantacao?.view.webContents) return { erro: 'pedido recusado' };
    try { return await fn(estado, evento.sender, ...args); } catch (e) {
      if (e.sessaoExpirada) { estado.aoExpirar(); return { erro: e.message, expirou: true }; }
      return { erro: e.message };
    }
  });
  const id = (estado) => estado.loja.id;

  canal('carregar', async (estado) => {
    const [passos, ficha, lote] = await Promise.all([estado.api.implantacao(id(estado)), estado.api.ficha(id(estado)), estado.api.lote(id(estado))]);
    return { passos, ficha, lote, publicando: !!estado.publicacao };
  });
  canal('passo', async (estado, _wc, passo, situacao) => ({ passos: await estado.api.salvarPasso(id(estado), passo, situacao) }));
  canal('abrir', async (estado, _wc, caminho) => { abrirNoCardapio(estado, caminho); return { ok: true }; });
  canal('imagemFicha', async (estado, _wc, tipo) => ({ url: miniatura(await estado.api.imagemFicha(id(estado), tipo), 480) }));

  // ------------------------------------------------------------------ produtos
  canal('escolherFotos', async (estado, wc, { tratar = true } = {}) => {
    const escolha = await dialog.showOpenDialog(estado.win, { title: 'Fotos dos produtos', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
    if (escolha.canceled || !escolha.filePaths.length) return { cancelado: true };
    const { fotos, recusadas } = lerFotos(escolha.filePaths);
    const avisar = (dados) => { if (!wc.isDestroyed()) wc.send('implantacao:progresso', dados); };
    const lidos = [];
    for (let i = 0; i < fotos.length; i += POR_ENVIO) {
      avisar({ etapa: 'Lendo as fotos com a IA', feitas: i, total: fotos.length });
      lidos.push(...(await estado.api.analisar(id(estado), fotos.slice(i, i + POR_ENVIO))).produtos);
    }
    const avisos = [...recusadas];
    if (tratar) {
      for (const [i, p] of lidos.entries()) {
        avisar({ etapa: 'Tirando o fundo e padronizando', feitas: i, total: lidos.length });
        const r = await estado.api.tratarFoto(id(estado), p.id).catch((e) => ({ aviso: e.message }));
        if (r.aviso && !avisos.includes(r.aviso)) avisos.push(r.aviso);
      }
    }
    avisar(null);
    return { lote: await estado.api.lote(id(estado)), avisos };
  });
  canal('foto', async (estado, _wc, previewUrl) => ({ url: miniatura(await estado.api.foto(id(estado), previewUrl)) }));
  canal('salvarItem', async (estado, _wc, campos) => estado.api.salvarItem(id(estado), campos));
  canal('tratar', async (estado, _wc, item) => estado.api.tratarFoto(id(estado), item));
  canal('desfazer', async (estado, _wc, item) => estado.api.desfazerFoto(id(estado), item));
  canal('descartar', async (estado) => estado.api.descartarLote(id(estado)));

  canal('publicar', async (estado, wc) => {
    if (estado.publicacao) return { erro: 'A publicação desta loja já está em andamento.' };
    const r = await estado.api.publicar(id(estado));
    acompanhar(estado, wc);
    return r;
  });

  /** Repassa os eventos da fila para a tela e responde o codigo de acesso pelo e-mail da loja. */
  function acompanhar(estado, wc) {
    const enviar = (ev) => { if (!wc.isDestroyed()) wc.send('implantacao:evento', ev); };
    estado.publicacao = { aguardandoCodigo: false };
    estado.api.eventos(id(estado), async (ev) => {
      enviar(ev);
      if (ev.tipo !== 'mfa' || !estado.publicacao || estado.publicacao.aguardandoCodigo) return;
      estado.publicacao.aguardandoCodigo = true;
      const pedidoEm = Date.now();
      enviar({ tipo: 'etapa', texto: 'o Cardapio.ai pediu o código de acesso; lendo no e-mail da loja' });
      const codigo = await lerCodigoNoEmail(estado, pedidoEm, () => !!estado.publicacao?.aguardandoCodigo);
      if (!estado.publicacao) return;
      estado.publicacao.aguardandoCodigo = false;
      if (!codigo) { enviar({ tipo: 'codigo-manual' }); return; }
      await estado.api.mfa(id(estado), codigo).then(() => enviar({ tipo: 'etapa', texto: 'código enviado' }))
        .catch((e) => enviar({ tipo: 'etapa', texto: `não consegui enviar o código: ${e.message}` }));
    }).catch((e) => enviar({ tipo: 'fatal', erro: e.message }))
      .finally(() => { estado.publicacao = null; enviar({ tipo: 'encerrado' }); });
  }
  canal('codigo', async (estado, _wc, codigo) => {
    if (estado.publicacao) estado.publicacao.aguardandoCodigo = false;
    return estado.api.mfa(id(estado), String(codigo || '').trim());
  });

  // ---------------------------------------------------------------- adicionais
  canal('sugerirAdicionais', async (estado, _wc, produtos) => ({ grupos: await estado.api.sugerirAdicionais(id(estado), produtos) }));
  canal('salvarAdicionais', async (estado, _wc, dados) => estado.api.salvarAdicionais(id(estado), dados));
}

module.exports = { registrar, lerFotos };
