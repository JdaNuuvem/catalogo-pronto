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
  async lembretes() { return (await this.pedir('/api/app/lembretes')).lembretes; }

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

  /** Situacao do plano da loja no Cardapio.ai (lida pelo app na tela de plano). */
  salvarPlano(lojaId, plano) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/plano`, { metodo: 'POST', corpo: plano }); }

  // ---------------------------------------------------------------- implantacao

  async implantacao(lojaId) { return (await this.pedir(`/api/app/lojas/${Number(lojaId)}/implantacao`)).passos; }
  async salvarPasso(lojaId, passo, estado) {
    return (await this.pedir(`/api/app/lojas/${Number(lojaId)}/implantacao/${encodeURIComponent(passo)}`, { metodo: 'PUT', corpo: { estado } })).passos;
  }
  ficha(lojaId) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/ficha`); }
  linkFicha(lojaId) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/ficha/link`, { metodo: 'POST', corpo: {} }); }
  async sugerirAdicionais(lojaId, produtos) {
    return (await this.pedir(`/api/app/lojas/${Number(lojaId)}/adicionais/sugerir`, { metodo: 'POST', corpo: { produtos } })).grupos;
  }
  salvarAdicionais(lojaId, { grupos, nao_tem }) {
    return this.pedir(`/api/app/lojas/${Number(lojaId)}/ficha/adicionais`, { metodo: 'PUT', corpo: { grupos, nao_tem } });
  }

  // ------------------------------------------------------------------- produtos
  // As mesmas rotas do painel web (/api/analisar, /api/lote...), pelo prefixo do app.

  lote(lojaId) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/lote`); }
  salvarItem(lojaId, campos) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/lote/item`, { metodo: 'PUT', corpo: campos }); }
  descartarLote(lojaId) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/lote/descartar`, { metodo: 'POST', corpo: {} }); }
  tratarFoto(lojaId, id) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/foto/${encodeURIComponent(id)}/tratar`, { metodo: 'POST', corpo: {} }); }
  desfazerFoto(lojaId, id) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/foto/${encodeURIComponent(id)}/desfazer`, { metodo: 'POST', corpo: {} }); }
  validar(lojaId, produtos) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/validar`, { metodo: 'POST', corpo: { produtos } }); }
  publicar(lojaId) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/publicar`, { metodo: 'POST', corpo: {} }); }
  mfa(lojaId, codigo) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/mfa`, { metodo: 'POST', corpo: { codigo } }); }

  /** Pedido com corpo pronto (multipart) ou resposta que nao e JSON (imagem, eventos). */
  async bruto(caminho, opcoes = {}) {
    let r;
    try {
      r = await this.fetch(new URL(caminho, this.servidor), { ...opcoes, headers: { ...(opcoes.headers || {}), authorization: `Bearer ${this.token}` } });
    } catch {
      throw new Error('Não foi possível falar com o painel. Confira a internet e o endereço.');
    }
    if (r.status === 401) { this.token = null; throw Object.assign(new Error('Entre novamente no app.'), { sessaoExpirada: true }); }
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.erro || `O painel respondeu ${r.status}.`); }
    return r;
  }

  /** Sobe fotos ({ nome, tipo, dados: Buffer }) para a IA ler. Devolve os produtos lidos. */
  async analisar(lojaId, fotos) {
    const form = new FormData();
    for (const f of fotos) form.append('fotos', new Blob([f.dados], { type: f.tipo }), f.nome);
    return (await this.bruto(`/api/app/lojas/${Number(lojaId)}/analisar`, { method: 'POST', body: form })).json();
  }

  /** Fotos de um cardapio impresso: a IA cria os produtos (sem foto) no lote. */
  async impresso(lojaId, fotos) {
    const form = new FormData();
    for (const f of fotos) form.append('fotos', new Blob([f.dados], { type: f.tipo }), f.nome);
    return (await this.bruto(`/api/app/lojas/${Number(lojaId)}/impresso`, { method: 'POST', body: form })).json();
  }
  /** Texto e imagens de uma pagina de cardapio de outro site. */
  importar(lojaId, { texto, imagens }) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/importar`, { metodo: 'POST', corpo: { texto, imagens } }); }
  async trocarFoto(lojaId, item, foto) {
    const form = new FormData();
    form.append('foto', new Blob([foto.dados], { type: foto.tipo }), foto.nome);
    return (await this.bruto(`/api/app/lojas/${Number(lojaId)}/lote/foto/${encodeURIComponent(item)}`, { method: 'POST', body: form })).json();
  }

  /** Foto de um item (previewUrl do painel vem como /api/foto/...). */
  async foto(lojaId, previewUrl) {
    const caminho = String(previewUrl).replace(/^\/api\/foto\//, `/api/app/lojas/${Number(lojaId)}/foto/`);
    return Buffer.from(await (await this.bruto(caminho)).arrayBuffer());
  }
  /** Logo ou capa no formato que o Cardapio.ai aceita (gerado pelo painel). */
  async imagemFichaTratada(lojaId, tipo) {
    return Buffer.from(await (await this.bruto(`/api/app/lojas/${Number(lojaId)}/ficha/imagem/${encodeURIComponent(tipo)}/tratada`)).arrayBuffer());
  }
  async imagemFicha(lojaId, tipo) {
    return Buffer.from(await (await this.bruto(`/api/app/lojas/${Number(lojaId)}/ficha/imagem/${encodeURIComponent(tipo)}`)).arrayBuffer());
  }

  /** Acompanha a publicacao: chama aoEvento para cada evento ate a fila encerrar. */
  async eventos(lojaId, aoEvento) {
    const r = await this.bruto(`/api/app/lojas/${Number(lojaId)}/eventos`);
    const leitor = r.body.getReader(), decodificar = new TextDecoder();
    let resto = '';
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      resto += decodificar.decode(value, { stream: true });
      const partes = resto.split('\n\n'); resto = partes.pop();
      for (const p of partes) {
        const linha = p.split('\n').find((l) => l.startsWith('data: '));
        if (linha) { try { aoEvento(JSON.parse(linha.slice(6))); } catch { /* evento ilegivel */ } }
      }
    }
  }

  async whatsappConfigurado() { return (await this.pedir('/api/app/whatsapp')).configurado; }
  enviarWhatsapp(lojaId, texto) { return this.pedir(`/api/app/lojas/${Number(lojaId)}/whatsapp`, { metodo: 'POST', corpo: { texto } }); }
  desbloquear(senha) { return this.pedir('/api/app/desbloquear', { metodo: 'POST', corpo: { senha } }); }

  async sair() {
    try { await this.pedir('/api/app/sair', { metodo: 'POST', corpo: {} }); } finally { this.token = null; }
  }
}

module.exports = { Api, normalizarServidor };
