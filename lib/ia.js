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

      return { model: modelo, max_tokens: 4000, messages: [{ role: 'user', content: conteudo }] };
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

      return { model: modelo, max_tokens: 4000, messages: [{ role: 'user', content: conteudo }] };
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
 * Decide qual provedor usar. IA_PROVEDOR manda; sem ele, vale a chave presente.
 */
function escolherProvedor(opcoes = {}) {
  const pedido = (opcoes.provedor || process.env.IA_PROVEDOR || '').trim().toLowerCase();

  if (pedido) {
    if (!PROVEDORES[pedido]) {
      throw new Error(`IA_PROVEDOR invalido: "${pedido}". Use ${Object.keys(PROVEDORES).join(' ou ')}`);
    }
    return pedido;
  }

  const comChave = Object.keys(PROVEDORES).find((n) => process.env[PROVEDORES[n].variavelChave]);
  if (!comChave) {
    throw new Error('nenhuma chave de IA configurada: defina ANTHROPIC_API_KEY ou OPENROUTER_API_KEY');
  }
  return comChave;
}

/** O que esta configurado agora — usado pelo servidor para avisar a interface. */
function configuracaoAtual() {
  let nome;
  try {
    nome = escolherProvedor();
  } catch {
    return { provedor: null, rotulo: null, modelo: null, temChave: false };
  }

  const p = PROVEDORES[nome];
  return {
    provedor: nome,
    rotulo: p.rotulo,
    modelo: process.env.IA_MODELO || p.modeloPadrao,
    temChave: !!process.env[p.variavelChave],
  };
}

// -------------------------------------------------------------------- leitura

/**
 * @param {{nome: string, caminho: string}[]} imagens
 * @param {string[]} categorias
 * @param {object|string} [opcoes] chave avulsa ou { chave, provedor, modelo }
 * @returns {Promise<{titulo, descricao, categoria}[]>} um item por imagem, na mesma ordem
 */
async function descreverImagens(imagens, categorias, opcoes = {}) {
  // Aceita a forma antiga (terceiro argumento = chave) para nao quebrar chamadas existentes.
  const cfg = typeof opcoes === 'string' ? { chave: opcoes } : (opcoes || {});

  const nome = escolherProvedor(cfg);
  const provedor = PROVEDORES[nome];
  const chave = cfg.chave || process.env[provedor.variavelChave];
  const modelo = cfg.modelo || process.env.IA_MODELO || provedor.modeloPadrao;

  if (!chave) throw new Error(`${provedor.variavelChave} nao definida`);

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

module.exports = { descreverImagens, configuracaoAtual, PROVEDORES };
