/**
 * Leitura das fotos pela IA: recebe imagens, devolve titulo, descricao e categoria.
 * Esta e a unica parte do sistema que consome IA.
 *
 * Dois provedores, escolhidos por variavel de ambiente:
 *
 *   IA_PROVEDOR=anthropic    usa ANTHROPIC_API_KEY   (padrao)
 *   IA_PROVEDOR=openrouter   usa OPENROUTER_API_KEY
 *
 * Sem IA_PROVEDOR, vale a chave que estiver definida. O modelo pode ser trocado
 * com IA_MODELO — util para baratear ou para testar outro modelo sem mexer no codigo.
 */

const fs = require('fs');
const path = require('path');

const TIPOS = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const INSTRUCOES = `Voce recebe fotos de embalagens de produtos de uma loja de produtos da roca de Minas Gerais.

Para CADA foto, na ordem em que aparecem, produza um objeto JSON com:
  "titulo"    - nome comercial do produto, incluindo a marca lida na embalagem e o peso/volume quando visivel. Maximo 120 caracteres.
  "descricao" - 1 a 3 frases descrevendo o produto: o que e, marca, origem, peso, modo de preparo e diferenciais impressos no rotulo. Maximo 400 caracteres.
  "categoria" - escolha uma das categorias da lista fornecida. So invente uma nova (com emoji no inicio) se nenhuma servir.

Regras:
- Leia a marca da embalagem. Se o rotulo estiver ilegivel ou coberto, omita a marca em vez de inventar.
- Nao invente preco, validade, selo ou informacao nutricional que nao esteja visivel.
- Escreva em portugues do Brasil, com acentuacao correta.
- Responda SOMENTE com um array JSON, sem texto ao redor e sem blocos de codigo.`;

function tipoDaImagem(nomeArquivo) {
  return TIPOS[path.extname(nomeArquivo).toLowerCase()] || 'image/png';
}

function lerBase64(caminho) {
  return fs.readFileSync(caminho).toString('base64');
}

function montarPedido(imagens, categorias) {
  return `${INSTRUCOES}\n\nCategorias disponiveis:\n${categorias.map((c) => `- ${c}`).join('\n')}\n\nRetorne um array com exatamente ${imagens.length} objetos, na ordem das fotos.`;
}

/**
 * Teto de saida proporcional ao lote. Um valor fixo alto fazia o provedor
 * exigir credito para o pior caso mesmo quando so havia uma foto — o que
 * derruba a chamada por saldo insuficiente sem necessidade.
 * Cada ficha ocupa ~260 tokens (titulo 120 + descricao 400 caracteres).
 */
function tetoDeSaida(quantidade) {
  return Math.min(8000, 200 + quantidade * 260);
}

// ------------------------------------------------------------------ provedores

/**
 * Cada provedor sabe montar a requisicao no seu formato e extrair o texto da
 * resposta. O resto do fluxo — prompt, parse e validacao — e comum aos dois.
 */
const PROVEDORES = {
  anthropic: {
    rotulo: 'Anthropic',
    variavelChave: 'ANTHROPIC_API_KEY',
    modeloPadrao: 'claude-sonnet-5',
    url: 'https://api.anthropic.com/v1/messages',

    cabecalhos(chave) {
      return {
        'content-type': 'application/json',
        'x-api-key': chave,
        'anthropic-version': '2023-06-01',
      };
    },

    corpo(imagens, categorias, modelo) {
      const conteudo = [];
      imagens.forEach((imagem, i) => {
        conteudo.push({ type: 'text', text: `Foto ${i + 1} (arquivo ${imagem.nome}):` });
        conteudo.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: tipoDaImagem(imagem.nome),
            data: lerBase64(imagem.caminho),
          },
        });
      });
      conteudo.push({ type: 'text', text: montarPedido(imagens, categorias) });

      return { model: modelo, max_tokens: tetoDeSaida(imagens.length), messages: [{ role: 'user', content: conteudo }] };
    },

    extrairTexto(dados) {
      if (!dados.content) throw new Error('resposta sem campo "content"');
      return dados.content.map((c) => c.text || '').join('').trim();
    },
  },

  openrouter: {
    rotulo: 'OpenRouter',
    variavelChave: 'OPENROUTER_API_KEY',
    // Bom equilibrio entre leitura de rotulo e preco. Troque com IA_MODELO —
    // qualquer modelo com entrada de imagem serve (openrouter.ai/models).
    modeloPadrao: 'google/gemini-2.5-flash',
    url: 'https://openrouter.ai/api/v1/chat/completions',

    cabecalhos(chave) {
      return {
        'content-type': 'application/json',
        authorization: `Bearer ${chave}`,
        // Identificam a aplicacao nos rankings do OpenRouter. Opcionais.
        'HTTP-Referer': process.env.OPENROUTER_SITE || 'https://catalogo-pronto.local',
        'X-Title': 'Catalogo Pronto',
      };
    },

    corpo(imagens, categorias, modelo) {
      // Formato compativel com OpenAI: imagem vai como data URI em image_url.
      const conteudo = [];
      imagens.forEach((imagem, i) => {
        conteudo.push({ type: 'text', text: `Foto ${i + 1} (arquivo ${imagem.nome}):` });
        conteudo.push({
          type: 'image_url',
          image_url: { url: `data:${tipoDaImagem(imagem.nome)};base64,${lerBase64(imagem.caminho)}` },
        });
      });
      conteudo.push({ type: 'text', text: montarPedido(imagens, categorias) });

      return { model: modelo, max_tokens: tetoDeSaida(imagens.length), messages: [{ role: 'user', content: conteudo }] };
    },

    extrairTexto(dados) {
      // O OpenRouter responde 200 com um campo "error" quando o modelo recusa
      // ou nao existe, entao isso precisa ser checado antes do resto.
      if (dados.error) throw new Error(dados.error.message || JSON.stringify(dados.error));
      const escolha = (dados.choices || [])[0];
      if (!escolha) throw new Error('resposta sem "choices"');
      return (escolha.message && escolha.message.content ? escolha.message.content : '').trim();
    },
  },
};

/**
 * Junta o que veio do painel com o ambiente. O painel manda; o ambiente e
 * usado como reserva, para a instalacao continuar funcionando por variavel
 * de ambiente quando ninguem configurou nada pela tela.
 *
 * @param {object} [cfg] { provedor, modelo, chaves: { anthropic, openrouter } }
 */
function resolver(cfg = {}) {
  const chaves = cfg.chaves || {};
  const doAmbiente = (nome) => process.env[PROVEDORES[nome].variavelChave] || null;
  const chaveDe = (nome) => chaves[nome] || doAmbiente(nome);

  const pedido = (cfg.provedor || process.env.IA_PROVEDOR || '').trim().toLowerCase();
  if (pedido && !PROVEDORES[pedido]) {
    throw new Error(`provedor invalido: "${pedido}". Use ${Object.keys(PROVEDORES).join(' ou ')}`);
  }

  const nome = pedido || Object.keys(PROVEDORES).find((n) => chaveDe(n));
  if (!nome) {
    throw new Error('nenhuma chave de IA configurada');
  }

  const provedor = PROVEDORES[nome];
  return {
    nome,
    provedor,
    chave: chaveDe(nome),
    modelo: cfg.modelo || process.env.IA_MODELO || provedor.modeloPadrao,
    // De onde veio a chave que sera usada — o painel mostra isso ao administrador.
    origemChave: chaves[nome] ? 'painel' : (doAmbiente(nome) ? 'ambiente' : null),
  };
}

/** O que esta valendo agora — nunca inclui a chave em si. */
function configuracaoAtual(cfg = {}) {
  try {
    const r = resolver(cfg);
    return {
      provedor: r.nome,
      rotulo: r.provedor.rotulo,
      modelo: r.modelo,
      temChave: !!r.chave,
      origemChave: r.origemChave,
    };
  } catch {
    return { provedor: null, rotulo: null, modelo: null, temChave: false, origemChave: null };
  }
}

// -------------------------------------------------------------------- leitura

/**
 * @param {{nome: string, caminho: string}[]} imagens
 * @param {string[]} categorias
 * @param {object} [cfg] { provedor, modelo, chaves: { anthropic, openrouter } }
 * @returns {Promise<{titulo, descricao, categoria}[]>} um item por imagem, na mesma ordem
 */
async function descreverImagens(imagens, categorias, cfg = {}) {
  const { provedor, chave, modelo } = resolver(cfg);
  if (!chave) throw new Error(`chave do ${provedor.rotulo} nao configurada`);

  const resposta = await fetch(provedor.url, {
    method: 'POST',
    headers: provedor.cabecalhos(chave),
    body: JSON.stringify(provedor.corpo(imagens, categorias, modelo)),
  });

  if (!resposta.ok) {
    const detalhe = (await resposta.text()).slice(0, 300);
    throw new Error(`${provedor.rotulo} respondeu ${resposta.status}: ${detalhe}`);
  }

  const texto = provedor.extrairTexto(await resposta.json());
  const json = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

  let itens;
  try {
    itens = JSON.parse(json);
  } catch {
    throw new Error(`${provedor.rotulo} nao devolveu JSON valido: ${json.slice(0, 160)}`);
  }

  if (!Array.isArray(itens) || itens.length !== imagens.length) {
    throw new Error(`esperava ${imagens.length} itens, recebi ${Array.isArray(itens) ? itens.length : 'nao-array'}`);
  }
  return itens;
}

/**
 * Chamada minima so para validar chave e modelo, antes do cliente subir 60 fotos.
 * Usa uma imagem 1x1 — o que importa e a API aceitar a credencial e o modelo.
 */
async function testarConexao(cfg = {}) {
  const { provedor, chave, modelo, nome } = resolver(cfg);
  if (!chave) throw new Error(`chave do ${provedor.rotulo} nao configurada`);

  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const conteudo = provedor.url.includes('anthropic')
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pixel.toString('base64') } },
        { type: 'text', text: 'Responda apenas: ok' },
      ]
    : [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${pixel.toString('base64')}` } },
        { type: 'text', text: 'Responda apenas: ok' },
      ];

  const resposta = await fetch(provedor.url, {
    method: 'POST',
    headers: provedor.cabecalhos(chave),
    body: JSON.stringify({ model: modelo, max_tokens: 16, messages: [{ role: 'user', content: conteudo }] }),
  });

  if (!resposta.ok) {
    const detalhe = (await resposta.text()).slice(0, 240);
    throw new Error(`${provedor.rotulo} respondeu ${resposta.status}: ${detalhe}`);
  }

  // Erro embutido em 200 acontece no OpenRouter quando o modelo nao existe.
  const texto = provedor.extrairTexto(await resposta.json());

  // Saldo: sem isso o teste passa com a chave certa e a leitura real falha
  // depois por credito insuficiente — que foi exatamente o que aconteceu.
  const saldo = nome === 'openrouter' ? await lerSaldoOpenRouter(chave) : null;

  return { provedor: nome, rotulo: provedor.rotulo, modelo, resposta: texto.slice(0, 80), saldo };
}

/**
 * Credito restante no OpenRouter. Devolve null se a consulta nao der certo.
 *
 * Usa /credits (saldo da CONTA) e nao /key (limite da CHAVE): uma chave sem
 * limite proprio reporta "sem limite" enquanto a conta esta zerada, que foi
 * o caso que deixou o teste passar e a leitura real falhar com 402.
 */
async function lerSaldoOpenRouter(chave) {
  try {
    const r = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { authorization: `Bearer ${chave}` },
    });
    if (!r.ok) return null;

    const d = (await r.json()).data || {};
    const comprado = Number(d.total_credits || 0);
    const usado = Number(d.total_usage || 0);

    return { comprado, usado, restante: Math.max(0, comprado - usado) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- adicionais

const INSTRUCOES_ADICIONAIS = `Voce monta os grupos de adicionais (complementos) do cardapio digital de uma loja.

Recebe os produtos (titulo e categoria) e, quando houver, o que o dono da loja escreveu sobre os adicionais.
Proponha grupos uteis para quem compra, por exemplo "Escolha o tamanho", "Turbine seu lanche", "Bebida para acompanhar".

Para cada grupo, um objeto JSON com:
  "nome"       - nome do grupo como o cliente ve, ate 60 caracteres.
  "minimo"     - quantos itens o cliente precisa escolher (0 se for opcional).
  "maximo"     - quantos itens pode escolher no maximo (1 ou mais).
  "categorias" - nomes exatos das categorias de produtos onde o grupo aparece.
  "itens"      - lista de { "nome": ate 60 caracteres, "preco": numero em reais ou null }.

Regras:
- Use primeiro o que o dono escreveu, com os precos dele. So complete o que faltar.
- Nunca invente preco: sem preco informado, use null para a equipe preencher.
- Nao crie grupo para categoria onde adicional nao faz sentido (ex.: produto embalado de mercearia).
- No maximo 8 grupos e 15 itens por grupo. Portugues do Brasil, com acentos.
- Responda SOMENTE com um array JSON, sem texto ao redor e sem blocos de codigo. Array vazio se nada fizer sentido.`;

/** Pergunta so com texto e devolve o JSON da resposta. */
async function pedirJson(texto, cfg, maximoTokens, buscar = fetch) {
  const { provedor, chave, modelo } = resolver(cfg);
  if (!chave) throw new Error(`chave do ${provedor.rotulo} nao configurada`);
  const resposta = await buscar(provedor.url, {
    method: 'POST',
    headers: provedor.cabecalhos(chave),
    body: JSON.stringify({ model: modelo, max_tokens: maximoTokens, messages: [{ role: 'user', content: texto }] }),
  });
  if (!resposta.ok) throw new Error(`${provedor.rotulo} respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
  const json = provedor.extrairTexto(await resposta.json()).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(json); } catch { throw new Error(`${provedor.rotulo} nao devolveu JSON valido: ${json.slice(0, 160)}`); }
}

const curto = (v, max) => String(v ?? '').trim().slice(0, max);

/**
 * Sugere grupos de adicionais. A resposta e limpa aqui: so passam grupos com nome e
 * itens, limites coerentes, categorias que existem na loja e preco em centavos ou null.
 * @param {{produtos: {titulo, categoria}[], doCliente: string, fetch?: Function}} entrada
 */
async function sugerirAdicionais({ produtos, doCliente = '', fetch: buscar }, cfg = {}) {
  const categorias = [...new Set(produtos.map((p) => p.categoria).filter(Boolean))];
  const lista = produtos.slice(0, 300).map((p) => `- ${curto(p.titulo, 120)} [${curto(p.categoria, 60)}]`).join('\n');
  const texto = [INSTRUCOES_ADICIONAIS, '', 'Categorias da loja:', ...categorias.map((c) => `- ${c}`), '',
    'Produtos:', lista || '(nenhum ainda)', '', 'O que o dono escreveu sobre adicionais:', curto(doCliente, 3000) || '(nada)'].join('\n');
  const grupos = await pedirJson(texto, cfg, 3000, buscar);
  if (!Array.isArray(grupos)) throw new Error('a IA nao devolveu uma lista de grupos');
  return grupos.slice(0, 8).map((g) => {
    const itens = (Array.isArray(g?.itens) ? g.itens : []).slice(0, 15)
      .map((i) => ({ nome: curto(i?.nome, 60), preco: Number.isFinite(Number(i?.preco)) && i?.preco !== null && Number(i.preco) >= 0 ? Math.round(Number(i.preco) * 100) : null }))
      .filter((i) => i.nome);
    const maximo = Math.max(1, Math.min(Number.parseInt(g?.maximo, 10) || 1, itens.length || 1));
    return { nome: curto(g?.nome, 60), minimo: Math.max(0, Math.min(Number.parseInt(g?.minimo, 10) || 0, maximo)), maximo,
      categorias: (Array.isArray(g?.categorias) ? g.categorias : []).filter((c) => categorias.includes(c)), itens };
  }).filter((g) => g.nome && g.itens.length);
}

module.exports = { descreverImagens, sugerirAdicionais, configuracaoAtual, testarConexao, resolver, PROVEDORES };
