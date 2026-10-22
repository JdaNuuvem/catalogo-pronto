/**
 * Conversa do app com o painel (rotas /api/app/*). O token vai no cabecalho
 * Authorization; se o painel responder 401, o token e descartado e quem chamou
 * recebe um erro marcado com sessaoExpirada para voltar a tela de login.
 */
const SERVICOS = ['cardapio', 'email'];

function normalizarServidor(texto) {
  let bruto = String(texto || '').trim();
  if (!bruto) throw new Error('Informe o endereço do painel.');
  if (!/^[a-z]+:\/\//i.test(bruto)) bruto = 'https://' + bruto;
  let url;
  try { url = new URL(bruto); } catch { throw new Error('Esse endereço do painel não parece válido.'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Esse endereço do painel não parece válido.');
  return url.origin;
}

class Api {
  constructor({ servidor, token = null, fetch = globalThis.fetch }) {
    this.servidor = normalizarServidor(servidor);
    this.token = token;
    this.fetch = fetch;
  }

  async pedir(caminho, { metodo = 'GET', corpo } = {}) {
    let r;
    try {
      r = await this.fetch(new URL(caminho, this.servidor), {
        method: metodo,
        headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      throw new Error('Não foi possível falar com o painel. Confira a internet e o endereço.');
    }
    const dados = await r.json().catch(() => ({}));
    if (r.status === 401 && this.token) {
      this.token = null;
      const erro = new Error(dados.erro || 'Entre novamente no app.');
      erro.sessaoExpirada = true;
      throw erro;
    }
    if (!r.ok) throw new Error(dados.erro || `O painel respondeu ${r.status}.`);
    return dados;
  }

  async entrar(email, senha, dispositivo) {
    const conta = await this.pedir('/api/app/login', { metodo: 'POST', corpo: { email, senha, dispositivo } });
    this.token = conta.token;
    return conta;
  }

  eu() { return this.pedir('/api/app/eu'); }
  async lojas() { return (await this.pedir('/api/app/lojas')).lojas; }

  /** Login de uma loja no cofre. Cada pedido fica registrado no historico da loja. */
  acesso(lojaId, servico) {
    if (!SERVICOS.includes(servico)) return Promise.reject(new Error('Esse serviço não existe no cofre.'));
    return this.pedir(`/api/app/lojas/${Number(lojaId)}/acesso`, { metodo: 'POST', corpo: { servico } });
  }

  /** O que publicamos pelo painel nesta loja, para conferir com o que esta no Cardapio.ai. */
  esperados(lojaId) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/conferencia/esperados`); }
  salvarConferencia(lojaId, { situacao, totais, problemas }) {
    return this.pedir(`/api/app/lojas/${Number(lojaId)}/conferencia`, { metodo: 'POST', corpo: { situacao, totais, problemas } });
  }

  async sair() {
    try { await this.pedir('/api/app/sair', { metodo: 'POST', corpo: {} }); } finally { this.token = null; }
  }
}

module.exports = { Api, normalizarServidor };
