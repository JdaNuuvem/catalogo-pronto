/**
 * Leitura das fotos pela IA: recebe imagens, devolve titulo, descricao e categoria.
 * Esta e a unica parte do sistema que consome IA.
 */

const fs = require('fs');
const path = require('path');

const MODELO = 'claude-sonnet-5';
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

function blocoImagem(caminho, nome) {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: tipoDaImagem(nome),
      data: fs.readFileSync(caminho).toString('base64'),
    },
  };
}

/**
 * @param {{nome: string, caminho: string}[]} imagens
 * @param {string[]} categorias
 * @returns {Promise<{titulo, descricao, categoria}[]>} um item por imagem, na mesma ordem
 */
async function descreverImagens(imagens, categorias, chaveApi) {
  const chave = chaveApi || process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new Error('ANTHROPIC_API_KEY nao definida');

  const conteudo = [];
  imagens.forEach((imagem, i) => {
    conteudo.push({ type: 'text', text: `Foto ${i + 1} (arquivo ${imagem.nome}):` });
    conteudo.push(blocoImagem(imagem.caminho, imagem.nome));
  });
  conteudo.push({
    type: 'text',
    text: `${INSTRUCOES}\n\nCategorias disponiveis:\n${categorias.map((c) => `- ${c}`).join('\n')}\n\nRetorne um array com exatamente ${imagens.length} objetos, na ordem das fotos.`,
  });

  const resposta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': chave,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 4000,
      messages: [{ role: 'user', content: conteudo }],
    }),
  });

  if (!resposta.ok) {
    throw new Error(`API respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
  }

  const dados = await resposta.json();
  const texto = dados.content.map((c) => c.text || '').join('').trim();
  const json = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

  const itens = JSON.parse(json);
  if (!Array.isArray(itens) || itens.length !== imagens.length) {
    throw new Error(`esperava ${imagens.length} itens, recebi ${Array.isArray(itens) ? itens.length : 'nao-array'}`);
  }
  return itens;
}

module.exports = { descreverImagens, MODELO };
