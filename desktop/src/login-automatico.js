/**
 * Login automatico nas abas de uma loja.
 *
 * situacaoDaPagina diz se a aba esta na tela de login, na tela do codigo de
 * verificacao ou ja dentro do servico. So paginas do proprio servico contam:
 * credencial nunca e preenchida em outro site.
 *
 * scriptDePreenchimento gera o codigo que roda na pagina e preenche os campos
 * como se fosse digitacao (os paineis sao feitos em React e so enxergam o valor
 * pelos eventos de input).
 */
const CAMPOS = {
  // A tela do Cardapio.ai tem botoes do carrossel tambem como submit; o de entrar tem a classe form-button.
  cardapio: { usuario: 'input[name="email"]', senha: 'input[name="senha"]', enviar: 'button.form-button' },
  email: { usuario: '#username', senha: '#password', enviar: 'button[type="submit"]' },
};

function situacaoDaPagina(servico, endereco, inicio) {
  let url, base;
  try { url = new URL(endereco); base = new URL(inicio); } catch { return 'fora'; }
  if (servico === 'cardapio') {
    if (url.origin !== base.origin) return 'fora';
    // O real fica em /painelweb/admin/login e /painelweb/admin/mfa; vale o trecho, nao o comeco do caminho.
    if (url.pathname.includes('/admin/login')) return 'login';
    if (url.pathname.includes('/admin/mfa')) return 'codigo';
    return 'dentro';
  }
  if (servico === 'email') {
    const proton = url.hostname === 'proton.me' || url.hostname.endsWith('.proton.me');
    const mesmaOrigem = url.origin === base.origin;
    if (!proton && !mesmaOrigem) return 'fora';
    if (url.pathname.startsWith('/login')) return 'login';
    return 'dentro';
  }
  return 'fora';
}

function scriptDePreenchimento(servico, { usuario, senha }) {
  const campos = CAMPOS[servico];
  if (!campos) throw new Error('Esse serviço não tem login automático.');
  // JSON.stringify escapa aspas, barras e quebras: o valor entra no script so como texto.
  const dados = JSON.stringify({ campos, valores: { usuario: String(usuario || ''), senha: String(senha || '') } });
  return `(() => {
    const d = ${dados};
    const u = document.querySelector(d.campos.usuario), s = document.querySelector(d.campos.senha);
    if (!u || !s) return 'sem-campos';
    const definir = (el, valor) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, valor);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    definir(u, d.valores.usuario); definir(s, d.valores.senha);
    setTimeout(() => {
      const botao = document.querySelector(d.campos.enviar);
      if (botao && !botao.disabled) botao.click(); else if (s.form && s.form.requestSubmit) s.form.requestSubmit();
    }, 400);
    return 'preenchido';
  })()`;
}

module.exports = { situacaoDaPagina, scriptDePreenchimento, CAMPOS };
