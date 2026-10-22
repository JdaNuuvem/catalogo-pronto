/**
 * Codigo de verificacao do Cardapio.ai lido no e-mail da loja (Proton).
 *
 * O Cardapio.ai manda "Codigo de acesso — Cardapio.ai" de no-reply@cardapio.ai,
 * e o Proton junta todos numa conversa. O codigo mais recente fica na ultima
 * mensagem, num iframe; a hora dela esta no <time datetime="quinta-feira, 22 de
 * outubro de 2026 as 04:05"> do cabecalho. So vale codigo chegado depois de o
 * Cardapio.ai pedir: a conversa guarda dezenas de codigos antigos.
 */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const TOLERANCIA_MS = 60 * 1000;

/** Abre a conversa do codigo na caixa de entrada (se ela estiver na lista). */
const SCRIPT_ABRIR_CONVERSA = `(() => {
  const item = document.querySelector('[data-testid^="message-item:Código de acesso"]');
  if (!item) return false;
  item.click(); return true;
})()`;

/** Assunto, hora e texto da ultima mensagem aberta na conversa. */
const SCRIPT_LER_MENSAGEM = `(() => {
  const cabecalhos = [...document.querySelectorAll('[data-testid^="message-header-expanded:"]')].filter((e) => /^message-header-expanded:\\d+$/.test(e.dataset.testid));
  const cabecalho = cabecalhos[cabecalhos.length - 1];
  const quadros = document.querySelectorAll('iframe[data-testid="content-iframe"]');
  const quadro = quadros[quadros.length - 1];
  let texto = '';
  try { texto = quadro && quadro.contentDocument ? quadro.contentDocument.body.innerText : ''; } catch (e) { texto = ''; }
  return { assunto: quadro ? quadro.getAttribute('data-subject') || '' : '', quando: cabecalho ? (cabecalho.querySelector('time[datetime]') || {}).getAttribute?.('datetime') || '' : '', texto };
})()`;

function dataProton(texto) {
  const m = /(\d{1,2}) de (\S+) de (\d{4}) às (\d{1,2}):(\d{2})/.exec(String(texto || ''));
  if (!m) return null;
  const mes = MESES.indexOf(m[2].toLowerCase());
  if (mes < 0) return null;
  return new Date(Number(m[3]), mes, Number(m[1]), Number(m[4]), Number(m[5]));
}

function extrairCodigo(texto) {
  const linhas = String(texto || '').split('\n').map((l) => l.trim());
  const sozinho = linhas.find((l) => /^\d{6}$/.test(l));
  if (sozinho) return sozinho;
  const junto = /c[oó]digo\D{0,30}(\d{6})\b/i.exec(texto || '');
  return junto ? junto[1] : null;
}

/** Codigo da mensagem, so se ela for o e-mail de acesso e tiver chegado depois do pedido. */
function codigoNovo({ assunto, quando, texto }, pedidoEm) {
  if (!/c[oó]digo de acesso/i.test(assunto || '')) return null;
  const chegou = dataProton(quando);
  // O Proton mostra so hora e minuto: conta o fim do minuto mostrado (a mensagem pode ter chegado ate 59s depois).
  if (!chegou || chegou.getTime() + 59999 < pedidoEm - TOLERANCIA_MS) return null;
  return extrairCodigo(texto);
}

/** Preenche o codigo na tela de verificacao do Cardapio.ai (input[name=code], botao .send). */
function scriptPreencherCodigo(codigo) {
  if (!/^\d{6}$/.test(String(codigo))) throw new Error('O código precisa ter 6 números.');
  return `(() => {
    const campo = document.querySelector('input[name="code"]');
    if (!campo) return 'sem-campo';
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, ${JSON.stringify(String(codigo))});
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => { const botao = document.querySelector('button.send'); if (botao && !botao.disabled) botao.click(); }, 300);
    return 'preenchido';
  })()`;
}

module.exports = { SCRIPT_ABRIR_CONVERSA, SCRIPT_LER_MENSAGEM, dataProton, extrairCodigo, codigoNovo, scriptPreencherCodigo };
