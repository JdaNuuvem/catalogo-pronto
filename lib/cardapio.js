/**
 * Automacao do painel do Cardapio.ai.
 *
 * Usado tanto pela interface web (servidor.js) quanto pela linha de comando
 * (upload.js). Nao imprime nada: quem chama decide como reportar o progresso.
 */

const fs = require('fs');
const path = require('path');

const SELETORES = {
  // A tela de login tem um carrossel cujos pontos tambem sao <button type=submit>.
  // Por isso o botao de entrar e alvejado pela classe, e nao por "primeiro botao".
  loginEmail: 'input[name="email"]',
  loginSenha: 'input[name="senha"]',
  loginEnviar: 'button.form-button',
  mfaCodigo: 'input[placeholder="••••••"], input[type="tel"], input[type="text"]',
  novaCategoriaAbrir: 'p:text-is("Nova categoria")',
  novaCategoriaNome: 'form:has-text("Nova categoria de produtos") input[name="category"]',
  novaCategoriaSalvar: 'form:has-text("Nova categoria de produtos") button[type="submit"]',
  adicionarImagem: 'button:has-text("Adicionar imagem")',
  titulo: 'input.fieldNotEmpty',
  preco: '#price-product-obj',
  descricao: 'textarea[placeholder^="Descreva o produto"]',
  salvarProduto: '#save-product',
};

const LIMITE_TITULO = 120;
const LIMITE_DESCRICAO = 400;
const TAMANHO_MAXIMO_IMAGEM = 3 * 1024 * 1024;

// --------------------------------------------------------------- navegador

async function abrirNavegador({ perfil, headless = false }) {
  const { chromium } = require('playwright');
  const contexto = await chromium.launchPersistentContext(perfil, {
    headless,
    viewport: { width: 1440, height: 900 },
  });
  const page = contexto.pages()[0] || (await contexto.newPage());
  return { contexto, page };
}

async function sessaoAtiva(page) {
  const url = page.url();
  return !url.includes('/admin/login') && !url.includes('/admin/mfa');
}

/**
 * Faz login. Se o painel pedir MFA, chama pedirCodigoMfa() — que pode ser um
 * prompt no terminal ou uma espera pela digitacao na interface web.
 */
async function autenticar(page, { baseUrl, email, senha, pedirCodigoMfa }) {
  await page.goto(`${baseUrl}/listar`, { waitUntil: 'domcontentloaded' });
  if (await sessaoAtiva(page)) return { jaEstavaLogado: true };

  await page.fill(SELETORES.loginEmail, email);
  await page.fill(SELETORES.loginSenha, senha);
  // O botao so habilita depois que os dois campos estao preenchidos.
  await page.waitForSelector(`${SELETORES.loginEnviar}:not([disabled])`, { timeout: 15000 });
  await page.click(SELETORES.loginEnviar);

  // Espera sair da tela de login: o destino e a verificacao MFA ou o painel.
  // Um tempo fixo aqui daria falso negativo quando o redirect demora mais.
  await page.waitForURL((u) => !u.toString().includes('/admin/login'), { timeout: 45000 });
  await page.waitForLoadState('domcontentloaded');

  if (page.url().includes('/admin/mfa')) {
    if (!pedirCodigoMfa) throw new Error('o painel pediu codigo MFA e nao ha como informa-lo');
    const codigo = await pedirCodigoMfa();
    if (!codigo) throw new Error('codigo MFA nao informado');
    await page.fill(SELETORES.mfaCodigo, codigo);
    await page.click('button:has-text("Confirmar")');
    await page.waitForURL((u) => !u.toString().includes('/admin/mfa'), { timeout: 120000 });
  }

  if (!(await sessaoAtiva(page))) {
    throw new Error('login falhou - confira e-mail, senha e o codigo MFA');
  }
  return { jaEstavaLogado: false };
}

// -------------------------------------------------------------- categorias

async function lerCategorias(page, baseUrl) {
  await page.goto(`${baseUrl}/listar`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a[href*="cadastrar?category="]', { timeout: 30000 });

  return page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="cadastrar?category="]')];
    return links.map((link) => {
      const id = decodeURIComponent(link.href.split('category=')[1]);
      let no = link.closest('div');
      for (let i = 0; i < 6 && no; i++) {
        const p = no.querySelector('p');
        if (p && !/Novo produto|Copiar|Mover/.test(p.textContent)) {
          return { id, nome: p.textContent.trim() };
        }
        no = no.parentElement;
      }
      return { id, nome: id };
    });
  });
}

async function criarCategoria(page, baseUrl, nome) {
  await page.goto(`${baseUrl}/listar`, { waitUntil: 'domcontentloaded' });
  await page.click(SELETORES.novaCategoriaAbrir);
  await page.fill(SELETORES.novaCategoriaNome, nome);
  await page.click(SELETORES.novaCategoriaSalvar);
  await page.waitForTimeout(2000);
}

/** Cria as categorias que faltam e devolve um mapa nome/id -> id usavel na URL. */
async function garantirCategorias(page, baseUrl, categoriasDesejadas, aoCriar) {
  const existentes = await lerCategorias(page, baseUrl);
  const conhecidas = new Set([...existentes.map((c) => c.nome), ...existentes.map((c) => c.id)]);

  for (const categoria of [...new Set(categoriasDesejadas)]) {
    if (conhecidas.has(categoria)) continue;
    await criarCategoria(page, baseUrl, categoria);
    conhecidas.add(categoria);
    if (aoCriar) aoCriar(categoria);
  }

  const finais = await lerCategorias(page, baseUrl);
  const mapa = new Map();
  for (const c of finais) {
    mapa.set(c.nome, c.id);
    mapa.set(c.id, c.id);
  }
  return mapa;
}

// ------------------------------------------------------- link publico da loja

/**
 * Le o endereco publico da loja — o link que o dono divulga para os clientes.
 * Fica num atributo "link" na barra lateral do painel, e nao no href.
 */
async function lerLinkPublico(page, baseUrl) {
  if (!page.url().includes('/painelweb/')) {
    await page.goto(`${baseUrl}/inicio`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('.sidebar-cdp-storelink', { timeout: 20000 }).catch(() => null);

  const caminho = await page.evaluate(() => {
    const el = document.querySelector('.sidebar-cdp-storelink');
    return el ? el.getAttribute('link') : null;
  });

  if (!caminho) return null;
  return `https://cardapio.ai${caminho.startsWith('/') ? '' : '/'}${caminho}`;
}

// ------------------------------------------------------- conferir a loja

/**
 * Le a listagem de produtos da loja e devolve o texto cru.
 *
 * Serve para responder uma pergunta so: "este produto ja esta la?". Depois de
 * uma queda no meio do envio nao da para saber se o ultimo produto chegou a
 * ser salvo, e reenviar no escuro criaria duplicata no catalogo do cliente.
 * Perguntar para a propria loja e a unica resposta confiavel.
 */
async function textoDaListagem(page, baseUrl) {
  await page.goto(`${baseUrl}/listar`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  return page.evaluate(() => document.body.innerText);
}

// ----------------------------------------------------------------- produto

async function cadastrarProduto(page, baseUrl, produto, idCategoria) {
  const url = `${baseUrl}/cadastrar?category=${encodeURIComponent(idCategoria)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(SELETORES.titulo, { timeout: 30000 });

  if (produto.caminhoImagem) {
    const [seletorArquivo] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      page.click(SELETORES.adicionarImagem),
    ]);
    await seletorArquivo.setFiles(produto.caminhoImagem);
    await page.waitForSelector('img[src^="blob:"], img[src^="data:"]', { timeout: 20000 });
  }

  await page.fill(SELETORES.titulo, produto.titulo);
  await page.fill(SELETORES.preco, String(produto.preco ?? '0'));
  if (produto.descricao) {
    await page.fill(SELETORES.descricao, produto.descricao);
  }

  await page.click(SELETORES.salvarProduto);
  await page.waitForURL((u) => u.toString().includes('/listar'), { timeout: 45000 });

  const apareceu = await page.evaluate(
    (titulo) => document.body.innerText.includes(titulo),
    produto.titulo,
  );
  if (!apareceu) throw new Error('produto nao apareceu na listagem apos salvar');
}

// --------------------------------------------------------------- validacao

function validarProduto(produto, indice) {
  const erros = [];
  const onde = `produto #${indice + 1} (${produto.titulo || 'sem titulo'})`;

  if (!produto.titulo) {
    erros.push(`${onde}: titulo obrigatorio`);
  } else if (produto.titulo.length > LIMITE_TITULO) {
    erros.push(`${onde}: titulo com ${produto.titulo.length} caracteres (limite ${LIMITE_TITULO})`);
  }

  if (produto.descricao && produto.descricao.length > LIMITE_DESCRICAO) {
    erros.push(`${onde}: descricao com ${produto.descricao.length} caracteres (limite ${LIMITE_DESCRICAO})`);
  }

  if (!produto.categoria) erros.push(`${onde}: categoria obrigatoria`);
  const preco=String(produto.preco??'').replace(',','.');
  if(!/^\d{1,7}(\.\d{1,2})?$/.test(preco)||Number(preco)<=0)erros.push(`${onde}: informe um preco positivo antes de publicar`);

  if (produto.caminhoImagem) {
    if (!fs.existsSync(produto.caminhoImagem)) {
      erros.push(`${onde}: imagem nao encontrada em ${produto.caminhoImagem}`);
    } else if (fs.statSync(produto.caminhoImagem).size > TAMANHO_MAXIMO_IMAGEM) {
      erros.push(`${onde}: imagem acima de 3MB`);
    }
  }

  return erros;
}

/**
 * Publica uma lista de produtos. Reporta cada etapa por aoProgredir(evento)
 * e nunca interrompe o lote por causa de um produto que falhou.
 */
async function publicar({ produtos, config, perfil, pedirCodigoMfa, aoProgredir, conferirDuplicados }) {
  const avisar = aoProgredir || (() => {});
  const { contexto, page } = await abrirNavegador({ perfil, headless: config.headless });

  let resta = produtos;
  const resultados = [];
  let linkPublico = null;
  try {
    avisar({ tipo: 'etapa', texto: 'autenticando no painel' });
    const { jaEstavaLogado } = await autenticar(page, { ...config, pedirCodigoMfa });
    avisar({ tipo: 'etapa', texto: jaEstavaLogado ? 'sessao ja estava ativa' : 'login concluido' });

    // Retomada: antes de reenviar qualquer coisa, pergunta para a loja o que
    // ja esta la. O produto que subiu um instante antes da queda sai da fila
    // em vez de virar duplicata.
    if (conferirDuplicados) {
      avisar({ tipo: 'etapa', texto: 'conferindo o que ja esta na loja' });
      const listagem = await textoDaListagem(page, config.baseUrl);
      const jaEstao = resta.filter((p) => p.titulo && listagem.includes(p.titulo));

      jaEstao.forEach((p) => {
        resultados.push({ id: p.id, ok: true, jaEstava: true });
        avisar({ tipo: 'ok', id: p.id, titulo: p.titulo, jaEstava: true });
      });

      resta = resta.filter((p) => !jaEstao.includes(p));
      if (jaEstao.length) {
        avisar({ tipo: 'etapa', texto: `${jaEstao.length} produto(s) ja tinham subido antes da queda` });
      }
      if (!resta.length) {
        linkPublico = await lerLinkPublico(page, config.baseUrl).catch(() => null);
        return { resultados, linkPublico };
      }
    }

    avisar({ tipo: 'etapa', texto: 'conferindo categorias' });
    const mapa = await garantirCategorias(
      page,
      config.baseUrl,
      resta.map((p) => p.categoria),
      (nome) => avisar({ tipo: 'etapa', texto: `categoria criada: ${nome}` }),
    );

    for (const [indice, produto] of resta.entries()) {
      avisar({ tipo: 'inicio', indice, id: produto.id, titulo: produto.titulo });
      try {
        await cadastrarProduto(page, config.baseUrl, produto, mapa.get(produto.categoria) || produto.categoria);
        resultados.push({ id: produto.id, ok: true });
        avisar({ tipo: 'ok', indice, id: produto.id, titulo: produto.titulo });
      } catch (erro) {
        resultados.push({ id: produto.id, ok: false, erro: erro.message });
        avisar({ tipo: 'erro', indice, id: produto.id, titulo: produto.titulo, erro: erro.message });
      }
      await page.waitForTimeout(config.pausaEntreProdutosMs ?? 1000);
    }

    // Lido no fim, com a sessao ainda aberta: e o endereco que o dono divulga.
    try {
      linkPublico = await lerLinkPublico(page, config.baseUrl);
    } catch {
      linkPublico = null;
    }
  } finally {
    await contexto.close();
  }

  return { resultados, linkPublico };
}

module.exports = {
  SELETORES,
  lerLinkPublico,
  textoDaListagem,
  LIMITE_TITULO,
  LIMITE_DESCRICAO,
  abrirNavegador,
  autenticar,
  lerCategorias,
  criarCategoria,
  garantirCategorias,
  cadastrarProduto,
  validarProduto,
  publicar,
};
