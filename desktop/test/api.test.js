const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Api, normalizarServidor } = require('../src/api');

// fetch falso: devolve as respostas na ordem e guarda cada chamada.
function falso(...respostas) {
  const chamadas = [];
  const fetch = async (url, opcoes) => {
    chamadas.push({ url: String(url), ...opcoes });
    const [status, corpo] = respostas.shift();
    return { ok: status < 400, status, json: async () => corpo };
  };
  return { fetch, chamadas };
}

test('normaliza o endereco do servidor', () => {
  assert.equal(normalizarServidor('painel.exemplo.com/'), 'https://painel.exemplo.com');
  assert.equal(normalizarServidor(' https://painel.exemplo.com/gestao.html '), 'https://painel.exemplo.com');
  assert.equal(normalizarServidor('http://127.0.0.1:3917'), 'http://127.0.0.1:3917');
  assert.throws(() => normalizarServidor('ftp://x'), /endereço/);
  assert.throws(() => normalizarServidor(''), /endereço/);
});

test('entra, guarda o token e manda o token nas chamadas seguintes', async () => {
  const { fetch, chamadas } = falso([200, { token: 'tk-123', nome: 'Ana', papel: 'atendente' }], [200, { lojas: [{ id: 1 }] }]);
  const api = new Api({ servidor: 'https://painel.exemplo', fetch });
  const conta = await api.entrar('ana@x.com', 'segredo', 'PC 1');
  assert.equal(conta.nome, 'Ana'); assert.equal(api.token, 'tk-123');
  assert.equal(chamadas[0].url, 'https://painel.exemplo/api/app/login');
  assert.deepEqual(JSON.parse(chamadas[0].body), { email: 'ana@x.com', senha: 'segredo', dispositivo: 'PC 1' });
  assert.equal(chamadas[0].headers.authorization, undefined);
  assert.deepEqual(await api.lojas(), [{ id: 1 }]);
  assert.equal(chamadas[1].headers.authorization, 'Bearer tk-123');
});

test('pede o login de uma loja e recusa servico desconhecido sem chamar o servidor', async () => {
  const { fetch, chamadas } = falso([200, { usuario: 'loja@proton.me', senha: 's', url: 'https://account.proton.me/mail' }]);
  const api = new Api({ servidor: 'https://painel.exemplo', token: 'tk', fetch });
  assert.equal((await api.acesso(7, 'email')).usuario, 'loja@proton.me');
  assert.equal(chamadas[0].url, 'https://painel.exemplo/api/app/lojas/7/acesso');
  await assert.rejects(api.acesso(7, 'banco'), /serviço/);
  assert.equal(chamadas.length, 1);
});

test('sessao vencida limpa o token e avisa quem chamou', async () => {
  const { fetch } = falso([401, { erro: 'entre novamente no app' }], [400, { erro: 'servico invalido' }]);
  const api = new Api({ servidor: 'https://painel.exemplo', token: 'tk', fetch });
  const erro = await api.lojas().catch((e) => e);
  assert.equal(erro.sessaoExpirada, true); assert.equal(api.token, null);
  api.token = 'tk2';
  await assert.rejects(api.eu(), /servico invalido/);
});

test('servidor fora do ar vira mensagem clara', async () => {
  const api = new Api({ servidor: 'https://painel.exemplo', fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(api.entrar('a', 'b', 'c'), /não foi possível falar com o painel/i);
});

test('busca o que publicamos e grava o resultado da conferencia da loja', async () => {
  const { fetch, chamadas } = falso([200, { contratados: 25, esperados: [{ titulo: 'Mel' }] }], [200, { situacao: 'ok' }]);
  const api = new Api({ servidor: 'https://painel.exemplo', token: 'tk', fetch });
  assert.equal((await api.esperados(7)).contratados, 25);
  assert.equal(chamadas[0].url, 'https://painel.exemplo/api/app/lojas/7/conferencia/esperados');
  await api.salvarConferencia(7, { situacao: 'ok', totais: { produtos: 1 }, problemas: [] });
  assert.equal(chamadas[1].url, 'https://painel.exemplo/api/app/lojas/7/conferencia');
  assert.equal(chamadas[1].method, 'POST');
  assert.deepEqual(JSON.parse(chamadas[1].body), { situacao: 'ok', totais: { produtos: 1 }, problemas: [] });
});

test('manda para o painel o plano lido na loja', async () => {
  const { fetch, chamadas } = falso([200, { ok: true }]);
  const api = new Api({ servidor: 'https://painel.exemplo', token: 'tk', fetch });
  await api.salvarPlano(7, { plano: 'PDV+Robô', valido_ate: '2026-11-06', em_teste: false });
  assert.equal(chamadas[0].url, 'https://painel.exemplo/api/app/lojas/7/plano');
  assert.equal(JSON.parse(chamadas[0].body).valido_ate, '2026-11-06');
});

test('busca os lembretes do dia da carteira', async () => {
  const { fetch, chamadas } = falso([200, { lembretes: [{ tipo: 'vencida', titulo: 'x' }] }]);
  const api = new Api({ servidor: 'https://painel.exemplo', token: 'tk', fetch });
  assert.equal((await api.lembretes())[0].tipo, 'vencida');
  assert.equal(chamadas[0].url, 'https://painel.exemplo/api/app/lembretes');
});

test('implantacao usa as rotas de produtos do painel pelo prefixo do app', async () => {
  const chamadas = [];
  const fetch = async (url, opcoes) => {
    chamadas.push({ url: String(url), ...opcoes });
    return { ok: true, status: 200, json: async () => ({ produtos: [{ id: 'a.png' }] }), arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  const api = new Api({ servidor: 'https://painel.exemplo', token: 'tk', fetch });
  await api.analisar(7, [{ nome: 'queijo.png', tipo: 'image/png', dados: Buffer.from('x') }]);
  assert.equal(chamadas[0].url, 'https://painel.exemplo/api/app/lojas/7/analisar');
  assert.equal(chamadas[0].headers.authorization, 'Bearer tk');
  assert.equal(chamadas[0].body.get('fotos').name, 'queijo.png');
  const foto = await api.foto(7, '/api/foto/a%20b.png?v=12');
  assert.equal(chamadas[1].url, 'https://painel.exemplo/api/app/lojas/7/foto/a%20b.png?v=12');
  assert.deepEqual([...foto], [1, 2, 3]);
});

test('acompanha a publicacao lendo os eventos ate o painel encerrar', async () => {
  const pedacos = ['data: {"tipo":"etapa","texto":"a"}\n\nda', 'ta: {"tipo":"mfa"}\n\n', 'data: {"tipo":"fim","ok":2}\n\n'];
  const fetch = async () => ({ ok: true, status: 200, body: { getReader: () => ({ read: async () => (pedacos.length ? { value: new TextEncoder().encode(pedacos.shift()), done: false } : { done: true }) }) } });
  const api = new Api({ servidor: 'https://painel.exemplo', token: 'tk', fetch });
  const eventos = [];
  await api.eventos(7, (e) => eventos.push(e.tipo));
  assert.deepEqual(eventos, ['etapa', 'mfa', 'fim']);
});

test('token vencido no meio da implantacao volta para a tela de login', async () => {
  const fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const api = new Api({ servidor: 'https://painel.exemplo', token: 'tk', fetch });
  await assert.rejects(api.foto(7, '/api/foto/a.png'), (e) => e.sessaoExpirada === true);
  assert.equal(api.token, null);
});
