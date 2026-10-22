// Tela inicial: entrar e escolher a loja. Fala com o processo principal so pela ponte window.catalogo.
const $ = (id) => document.getElementById(id);
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAPEIS = { admin: 'Administrador', atendente: 'Atendente' };
let lojas = [];

function mostrarEntrar(servidor, aviso) {
  $('telaLojas').classList.add('escondido'); $('telaEntrar').classList.remove('escondido');
  if (servidor) $('servidor').value = servidor;
  $('erroEntrar').textContent = aviso || '';
  $('email').focus();
}

function avisar(texto) { $('aviso').textContent = texto || ''; $('aviso').classList.toggle('escondido', !texto); }

function desenhar() {
  const busca = $('busca').value.trim().toLocaleLowerCase('pt-BR');
  const visiveis = lojas.filter((l) => l.nome.toLocaleLowerCase('pt-BR').includes(busca));
  $('lista').innerHTML = visiveis.length ? visiveis.map((l) => `
    <article class="loja vidro">
      <h2>${escapar(l.nome)}</h2>
      <div class="chips">
        <span class="chip ${l.tem_cardapio ? 'ok' : ''}">${l.tem_cardapio ? '✓' : '—'} Cardapio.ai</span>
        <span class="chip ${l.tem_email ? 'ok' : ''}">${l.tem_email ? '✓' : '—'} E-mail</span>
      </div>
      <button type="button" class="principal" data-abrir="${l.id}" ${l.tem_cardapio || l.tem_email ? '' : 'disabled title="Cadastre os logins desta loja no painel"'}>Abrir loja</button>
    </article>`).join('')
    : `<p class="vazio">${lojas.length ? 'Nenhuma loja com esse nome.' : 'Nenhuma loja na sua carteira ainda. Cadastre em Lojas e acessos, no painel.'}</p>`;
}

async function carregarLojas() {
  const r = await window.catalogo.lojas();
  if (r.expirou) return mostrarEntrar(null, 'Sua sessão terminou. Entre novamente.');
  if (r.erro) return avisar(r.erro);
  avisar(''); lojas = r.lojas; desenhar();
}

async function mostrarLojas(sessao) {
  $('telaEntrar').classList.add('escondido'); $('telaLojas').classList.remove('escondido');
  $('nome').textContent = sessao.nome || ''; $('papel').textContent = PAPEIS[sessao.papel] || '';
  if (sessao.aviso) avisar(sessao.aviso);
  await carregarLojas();
}

$('formEntrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('btnEntrar').disabled = true; $('erroEntrar').textContent = '';
  const r = await window.catalogo.entrar({ servidor: $('servidor').value, email: $('email').value, senha: $('senha').value });
  $('btnEntrar').disabled = false;
  if (r.erro) { $('erroEntrar').textContent = r.erro; return; }
  $('senha').value = '';
  mostrarLojas(r);
});

$('lista').addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-abrir]');
  if (!botao) return;
  botao.disabled = true;
  const r = await window.catalogo.abrirLoja(Number(botao.dataset.abrir));
  botao.disabled = false;
  if (r.expirou) return mostrarEntrar(null, 'Sua sessão terminou. Entre novamente.');
  if (r.erro) avisar(r.erro);
});
$('busca').addEventListener('input', desenhar);
$('btnAtualizar').addEventListener('click', carregarLojas);
$('btnPainel').addEventListener('click', () => window.catalogo.abrirPainel());
$('btnSair').addEventListener('click', async () => { await window.catalogo.sair(); lojas = []; mostrarEntrar(); });
window.catalogo.aoExpirar(() => mostrarEntrar(null, 'Sua sessão terminou. Entre novamente.'));

(async () => {
  const sessao = await window.catalogo.sessao();
  if (sessao.conectado) mostrarLojas(sessao); else mostrarEntrar(sessao.servidor, sessao.aviso);
})();
