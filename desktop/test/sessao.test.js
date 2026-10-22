const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarArmazem } = require('../src/sessao');

// safeStorage falso: "cifra" invertendo o texto, para dar para ver que nao foi gravado em claro.
const cofreFalso = { isEncryptionAvailable: () => true, encryptString: (t) => Buffer.from([...t].reverse().join('')), decryptString: (b) => [...b.toString()].reverse().join('') };
const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sessao-app-'));

test('grava o token cifrado e le de volta', () => {
  const arquivo = path.join(pasta(), 'sessao.json');
  const armazem = criarArmazem({ arquivo, safeStorage: cofreFalso });
  armazem.gravar({ servidor: 'https://painel.exemplo', token: 'token-secreto', nome: 'Ana', papel: 'atendente' });
  assert.equal(fs.readFileSync(arquivo, 'utf8').includes('token-secreto'), false);
  assert.deepEqual(armazem.ler(), { servidor: 'https://painel.exemplo', token: 'token-secreto', nome: 'Ana', papel: 'atendente' });
});

test('sair apaga o token mas lembra o servidor', () => {
  const arquivo = path.join(pasta(), 'sessao.json');
  const armazem = criarArmazem({ arquivo, safeStorage: cofreFalso });
  armazem.gravar({ servidor: 'https://painel.exemplo', token: 't', nome: 'Ana', papel: 'admin' });
  armazem.limpar();
  assert.deepEqual(armazem.ler(), { servidor: 'https://painel.exemplo', token: null, nome: null, papel: null });
});

test('sem cifragem do sistema o token nao e guardado (so vale enquanto o app estiver aberto)', () => {
  const arquivo = path.join(pasta(), 'sessao.json');
  const armazem = criarArmazem({ arquivo, safeStorage: { isEncryptionAvailable: () => false } });
  armazem.gravar({ servidor: 'https://painel.exemplo', token: 't', nome: 'Ana', papel: 'admin' });
  assert.equal(armazem.ler().token, null);
});

test('arquivo ausente ou corrompido vira sessao vazia', () => {
  const dir = pasta();
  assert.deepEqual(criarArmazem({ arquivo: path.join(dir, 'nao-existe.json'), safeStorage: cofreFalso }).ler(), { servidor: null, token: null, nome: null, papel: null });
  fs.writeFileSync(path.join(dir, 'ruim.json'), '{quebrado');
  assert.equal(criarArmazem({ arquivo: path.join(dir, 'ruim.json'), safeStorage: cofreFalso }).ler().token, null);
});
