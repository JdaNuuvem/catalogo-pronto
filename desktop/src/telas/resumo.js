// Resumo da loja: a situacao num olhar e os atalhos de cada assunto.
const $ = (id) => document.getElementById(id);
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const br = (iso) => (iso || '').slice(0, 10).split('-').reverse().join('/');
const ETAPAS = { implantacao: 'Em implantação', ativa: 'Loja ativa', pausada: 'Pausada' };
const CONFERENCIA = { ok: ['Pronta para entregar', 'ok'], atencao: ['Pode entregar, vale melhorar', 'atencao'], bloqueante: ['Corrigir antes de entregar', 'ruim'] };
// A CSP das paginas do app nao aceita style no HTML: a largura entra por JavaScript depois.
const barra = (feitas, total) => `<div class="barra"><i data-pct="${total ? Math.round((feitas / total) * 100) : 0}"></i></div>`;
const botao = (acao, texto, principal) => `<button type="button" data-acao="${acao}" class="${principal ? 'principal' : ''}">${texto}</button>`;

function cartao(titulo, corpo, acoes = '') { return `<section class="cartao vidro"><h2>${titulo}</h2>${corpo}${acoes ? `<div class="acoes">${acoes}</div>` : ''}</section>`; }

window.secao.aoDados(({ loja, plano, conferencia, conferindo }) => {
  const conf = conferencia || loja.conferencia;
  const ate = plano && (plano.valido_ate || plano.teste_ate);
  const venceLogo = ate && ate <= new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const p = window.proximoPasso({ ...loja, conferencia: conf }, plano);
  $('proximo').className = `proximo vidro ${p.tom}`;
  $('proximo').innerHTML = `<div><small>Próximo passo</small><b>${escapar(p.titulo)}</b><p>${escapar(p.detalhe)}</p></div>${botao(p.acao, p.botao, true)}`;
  $('cartoes').innerHTML = [
    cartao('Situação', `<span class="selo-estado ${loja.etapa === 'ativa' ? 'ok' : loja.etapa === 'pausada' ? 'ruim' : 'atencao'}">${ETAPAS[loja.etapa] || 'Loja'}</span>
      <p class="detalhe">${loja.atendente ? `Atendente: ${escapar(loja.atendente)}` : ''}</p>`,
      `${loja.link ? botao('abrir-cardapio-publico', 'Ver cardápio público') : ''}${botao('abrir-loja-painel', 'Ficha no painel')}`),
    cartao('Acessos', `<p class="detalhe">${loja.tem_cardapio ? '✓' : '—'} Cardapio.ai ${loja.cardapio_email ? `(${escapar(loja.cardapio_email)})` : ''}<br>${loja.tem_email ? '✓' : '—'} E-mail ${loja.email ? `(${escapar(loja.email)})` : ''}</p>`,
      `${loja.tem_cardapio ? botao('abrir-cardapio', 'Abrir Cardapio.ai', true) : ''}${loja.tem_email ? botao('abrir-email', 'Abrir e-mail') : ''}`),
    cartao('Roteiro de implantação', `<span class="valor">${loja.roteiro.feitas} de ${loja.roteiro.total}</span>${barra(loja.roteiro.feitas, loja.roteiro.total)}<p class="detalhe">etapas conferidas</p>`,
      botao('abrir-roteiro', 'Abrir roteiro')),
    cartao('Ficha de implantação', `<span class="valor">${loja.ficha.completas} de ${loja.ficha.total}</span>${barra(loja.ficha.completas, loja.ficha.total)}
      <p class="detalhe">${loja.ficha.enviada_em ? `Enviada pelo cliente em ${br(loja.ficha.enviada_em)}` : 'seções completas'}</p>`, botao('abrir-ficha', 'Abrir ficha')),
    cartao('Plano no Cardapio.ai', plano ? `<span class="valor">${escapar(plano.plano || 'Plano')}</span>
      <span class="selo-estado ${venceLogo ? 'ruim' : 'ok'}">${plano.teste_ate && !plano.valido_ate ? `Teste grátis até ${br(plano.teste_ate)}` : ate ? `Válido até ${br(ate)}` : 'Sem validade'}</span>
      <p class="detalhe">${escapar(plano.situacao || '')}</p>` : '<p class="detalhe">Ainda não lido. O app lê sozinho assim que o Cardapio.ai desta loja entrar.</p>'),
    cartao('Catálogo', conf ? `<span class="selo-estado ${CONFERENCIA[conf.situacao]?.[1] || ''}">${CONFERENCIA[conf.situacao]?.[0] || conf.situacao}</span>
      <p class="detalhe">${conf.totais ? `${conf.totais.produtos} produtos · ${conf.problemas.length} ponto(s) a ver` : ''}${conf.criada_em || conf.quando ? `<br>Conferido em ${br(conf.criada_em || conf.quando)}` : ''}</p>`
      : '<p class="detalhe">Ainda não conferido.</p>',
      `${botao('conferir', conferindo ? 'Conferindo…' : 'Conferir catálogo', true)}${conferencia ? botao('abrir-conferencia', 'Ver relatório') : ''}`),
  ].join('');
  document.querySelectorAll('[data-pct]').forEach((i) => { i.style.width = `${i.dataset.pct}%`; });
});
document.addEventListener('click', (e) => { const b = e.target.closest('[data-acao]'); if (b) window.secao.acao(b.dataset.acao); });
