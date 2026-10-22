/**
 * Avisos do Windows: lembrete atrasado ou de hoje que apareceu, ficha enviada
 * pelo cliente e publicacao terminada. Cada aviso sai uma vez so; o que ja foi
 * avisado fica gravado na pasta do app para nao repetir depois de reabrir.
 */
const fs = require('fs');

/** Chave estavel de um lembrete: o mesmo assunto na mesma data nao avisa de novo. */
const chaveLembrete = (l) => `lembrete:${l.tipo}:${l.loja_id ?? ''}:${l.data ?? ''}:${l.tarefa ?? ''}`;

/**
 * Compara a leitura nova com o que ja foi visto e devolve os avisos a mostrar.
 * Na primeira leitura das fichas so guarda a situacao, para nao avisar o que ja tinha acontecido.
 */
function novidades({ lembretes, lojas }, visto) {
  const avisos = [];
  for (const l of lembretes.filter((x) => x.nivel === 'urgente' || x.nivel === 'hoje')) {
    const chave = chaveLembrete(l);
    if (visto.lembretes.has(chave)) continue;
    visto.lembretes.add(chave);
    avisos.push({ titulo: l.nivel === 'urgente' ? 'Atrasado' : 'Para hoje', corpo: l.titulo, lojaId: l.loja_id ?? null });
  }
  for (const loja of lojas) {
    const enviada = loja.ficha?.enviada_em || null, antes = visto.fichas[loja.id];
    if (visto.fichasLidas && enviada && enviada !== antes) avisos.push({ titulo: 'Ficha recebida', corpo: `${loja.nome} enviou a ficha de implantação.`, lojaId: loja.id });
    visto.fichas[loja.id] = enviada;
  }
  visto.fichasLidas = true;
  return avisos;
}

function criarMemoria(arquivo) {
  let dados = { lembretes: [], fichas: {}, fichasLidas: false };
  try { dados = { ...dados, ...JSON.parse(fs.readFileSync(arquivo, 'utf8')) }; } catch { /* primeira vez */ }
  const visto = { lembretes: new Set(dados.lembretes), fichas: dados.fichas, fichasLidas: dados.fichasLidas };
  const gravar = () => {
    // Guarda so os ultimos 500 lembretes avisados.
    const lista = [...visto.lembretes].slice(-500);
    try { fs.writeFileSync(arquivo, JSON.stringify({ lembretes: lista, fichas: visto.fichas, fichasLidas: visto.fichasLidas })); } catch { /* sem disco, avisa de novo depois */ }
  };
  const limpar = () => { visto.lembretes.clear(); visto.fichas = {}; visto.fichasLidas = false; gravar(); };
  return { visto, gravar, limpar };
}

module.exports = { novidades, criarMemoria, chaveLembrete };
