/**
 * Sessao do app no computador: endereco do painel, nome de quem entrou e o
 * token. O token so e gravado cifrado pelo sistema (safeStorage do Electron,
 * que no Windows usa a protecao da conta do usuario). Sem essa cifragem, ele
 * vale so enquanto o app estiver aberto.
 */
const fs = require('fs');
const path = require('path');

const VAZIA = { servidor: null, token: null, nome: null, papel: null };

function criarArmazem({ arquivo, safeStorage }) {
  const cifra = () => safeStorage && safeStorage.isEncryptionAvailable();

  function ler() {
    try {
      const d = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      const token = d.token && cifra() ? safeStorage.decryptString(Buffer.from(d.token, 'base64')) : null;
      return { servidor: d.servidor || null, token, nome: token ? d.nome || null : null, papel: token ? d.papel || null : null };
    } catch {
      return { ...VAZIA };
    }
  }

  function gravar({ servidor, token, nome, papel }) {
    const guardado = token && cifra() ? safeStorage.encryptString(token).toString('base64') : null;
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify({ servidor, token: guardado, nome: guardado ? nome : null, papel: guardado ? papel : null }));
  }

  function limpar() {
    gravar({ servidor: ler().servidor, token: null, nome: null, papel: null });
  }

  return { ler, gravar, limpar };
}

module.exports = { criarArmazem };
