// Janela principal: entrar, Hoje (lembretes da carteira) e Lojas.
// Fala com o processo principal so pela ponte window.catalogo.
const $ = (id) => document.getElementById(id);
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const br = (iso) => (iso || '').slice(0, 10).split('-').reverse().join('/');
const brl = (c) => `R$ ${((c || 0) / 100).toFixed(2).replace('.', ',')}`;
const PAPEIS = { admin: 'Administrador', atendente: 'Atendente' };
const ETAPAS = { implantacao: ['Em implantação', 'atencao'], ativa: ['Ativa', 'ok'], pausada: ['Pausada', 'ruim'] };
const NIVEIS = { urgente: 'Atrasado', hoje: 'Hoje', breve: 'Em breve' };
let lojas = [], lembretes = [], filtro = 'todas', vista = 'hoje';

document.querySelectorAll('[data-icone]').forEach((el) => { el.innerHTML = window.icone(el.dataset.icone); });
function avisar(texto) { $('aviso').textContent = texto || ''; $('aviso').hidden = !texto; }
function mostrarEntrar(servidor, aviso) {
  $('app').hidden = true; $('telaBloqueio').hidden = true; $('telaEntrar').hidden = false;
  if (servidor) $('servidor').value = servidor;
  $('erroEntrar').textContent = aviso || ''; $('email').focus();
}
function trocarVista(nova) {
  vista = nova;
  document.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.vista === nova)));
  $('vistaHoje').hidden = nova !== 'hoje'; $('vistaLojas').hidden = nova !== 'lojas';
}

// ------------------------------------------------------------------ Lojas
const venceLogo = (l) => { const ate = l.plano && (l.plano.valido_ate || l.plano.teste_ate); return !!ate && ate <= new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10); };
/** Loja que pede atencao: catalogo para corrigir, plano vencendo ou login faltando no cofre. */
const pedeAtencao = (l) => l.conferencia?.situacao === 'bloqueante' || venceLogo(l) || !l.tem_cardapio || !l.tem_email;

function progresso(rotulo, feitas, total) {
  return `<div class="progresso"><span>${rotulo}</span><div class="barra"><i data-pct="${total ? Math.round((feitas / total) * 100) : 0}"></i></div><span>${feitas}/${total}</span></div>`;
}
function desenharLojas() {
  const busca = $('busca').value.trim().toLocaleLowerCase('pt-BR');
  const visiveis = lojas.filter((l) => `${l.nome} ${l.atendente || ''}`.toLocaleLowerCase('pt-BR').includes(busca))
    .filter((l) => filtro === 'todas' || (filtro === 'alerta' ? pedeAtencao(l) : l.etapa === filtro));
  $('lista').innerHTML = visiveis.length ? visiveis.map((l) => {
    const [etapa, classe] = ETAPAS[l.etapa] || ['Loja', ''];
    const plano = l.plano ? (l.plano.teste_ate && !l.plano.valido_ate ? `Teste até ${br(l.plano.teste_ate)}` : l.plano.valido_ate ? `Plano até ${br(l.plano.valido_ate)}` : 'Plano lido') : 'Plano não lido';
    const conf = { ok: ['Catálogo ok', 'ok'], atencao: ['Catálogo: atenção', 'atencao'], bloqueante: ['Catálogo: corrigir', 'ruim'] }[l.conferencia?.situacao] || ['Não conferido', ''];
    return `<article class="loja vidro">
      <div class="loja-topo"><div><h2>${escapar(l.nome)}</h2>${l.atendente ? `<span class="atendente">${escapar(l.atendente)}</span>` : ''}</div><span class="chip ${classe}">${etapa}</span></div>
      ${progresso('Roteiro', l.roteiro.feitas, l.roteiro.total)}${progresso('Ficha', l.ficha.completas, l.ficha.total)}
      ${(() => { const p = window.proximoPasso(l); return `<p class="proximo-loja ${p.tom}"><small>Próximo passo</small>${escapar(p.titulo)}</p>`; })()}
      <div class="chips-loja">
        <span class="chip ${venceLogo(l) ? 'ruim' : l.plano ? 'ok' : ''}">${plano}</span>
        <span class="chip ${conf[1]}">${conf[0]}</span>
        <span class="chip ${l.tem_cardapio ? 'ok' : 'ruim'}">${l.tem_cardapio ? '✓' : '✗'} Cardapio.ai</span>
        <span class="chip ${l.tem_email ? 'ok' : 'ruim'}">${l.tem_email ? '✓' : '✗'} E-mail</span>
      </div>
      <div class="acoes"><button type="button" class="principal" data-abrir="${l.id}" ${l.tem_cardapio || l.tem_email ? '' : 'disabled title="Cadastre os logins desta loja no painel"'}>Abrir loja</button></div>
    </article>`;
  }).join('') : `<p class="vazio">${lojas.length ? 'Nenhuma loja com esse filtro.' : 'Nenhuma loja na sua carteira ainda. Cadastre em Lojas e acessos, no painel.'}</p>`;
  document.querySelectorAll('[data-pct]').forEach((i) => { i.style.width = `${i.dataset.pct}%`; });
  const alerta = lojas.filter(pedeAtencao).length;
  $('contaLojas').textContent = lojas.length; $('contaLojas').hidden = !lojas.length;
  document.querySelector('[data-filtro=alerta]').textContent = alerta ? `Pedem atenção (${alerta})` : 'Pedem atenção';
}

// ------------------------------------------------------------------ Hoje
function desenharHoje() {
  const nomes = new Map(lojas.map((l) => [l.id, l]));
  $('lembretes').innerHTML = lembretes.length ? lembretes.map((r) => `<article class="lembrete vidro ${r.nivel}">
      <span class="nivel">${NIVEIS[r.nivel] || ''}</span>
      <div><b>${escapar(r.titulo)}</b>${r.valor ? `<small>${brl(r.valor)}</small>` : ''}</div>
      ${nomes.get(r.loja_id)?.tem_cardapio || nomes.get(r.loja_id)?.tem_email ? `<button type="button" data-abrir="${r.loja_id}">Abrir loja</button>` : ''}
    </article>`).join('') : '<p class="vazio vidro">Nenhum lembrete para hoje.</p>';
  const numeros = [['Lojas', lojas.length, ''], ['Em implantação', lojas.filter((l) => l.etapa === 'implantacao').length, ''],
    ['Pedem atenção', lojas.filter(pedeAtencao).length, 'ruim'], ['Lembretes', lembretes.length, lembretes.some((r) => r.nivel === 'urgente') ? 'ruim' : '']];
  $('numeros').innerHTML = numeros.map(([rotulo, n, tom]) => `<div class="numero vidro ${n ? tom : ''}"><span>${rotulo}</span><b>${n}</b></div>`).join('');
  const pendentes = lojas.map((l) => ({ l, p: window.proximoPasso(l) })).filter(({ p }) => p.tom !== 'ok')
    .sort((a, b) => (a.p.tom === 'ruim' ? 0 : 1) - (b.p.tom === 'ruim' ? 0 : 1));
  $('pendentes').innerHTML = pendentes.length ? pendentes.map(({ l, p }) => `<article class="lembrete vidro ${p.tom === 'ruim' ? 'urgente' : 'hoje'}">
      <span class="nivel">${escapar(l.nome)}</span>
      <div><b>${escapar(p.titulo)}</b><small>${escapar(p.detalhe)}</small></div>
      ${l.tem_cardapio || l.tem_email ? `<button type="button" data-abrir="${l.id}">Abrir loja</button>` : ''}
    </article>`).join('') : '<p class="vazio vidro">Todas as lojas estão em dia.</p>';
  const urgentes = lembretes.length;
  $('contaHoje').textContent = urgentes; $('contaHoje').hidden = !urgentes;
}

async function carregar() {
  const [rl, rm] = await Promise.all([window.catalogo.lojas(), window.catalogo.lembretes()]);
  for (const r of [rl, rm]) {
    if (r.expirou) return mostrarEntrar(null, 'Sua sessão terminou. Entre novamente.');
    if (r.bloqueado) return mostrarBloqueio();
    if (r.erro) return avisar(r.erro);
  }
  avisar(''); lojas = rl.lojas; lembretes = rm.lembretes;
  desenharLojas(); desenharHoje();
}
function mostrarBloqueio() {
  $('app').hidden = true; $('telaEntrar').hidden = true; $('telaBloqueio').hidden = false;
  $('nomeBloqueio').textContent = $('nome').textContent; $('erroBloqueio').textContent = ''; $('senhaBloqueio').value = ''; $('senhaBloqueio').focus();
}
async function mostrarApp(sessao) {
  if (sessao.bloqueado) { $('nome').textContent = sessao.nome || ''; return mostrarBloqueio(); }
  $('telaEntrar').hidden = true; $('telaBloqueio').hidden = true; $('app').hidden = false;
  $('nome').textContent = sessao.nome || ''; $('papel').textContent = PAPEIS[sessao.papel] || '';
  $('dataHoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (sessao.aviso) avisar(sessao.aviso);
  $('versao').textContent = sessao.versao ? `App ${sessao.versao}` : '';
  if (sessao.versaoPronta) mostrarAtualizacao(sessao.versaoPronta);
  await carregar();
}

// ------------------------------------------------------------------ eventos
$('formEntrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('btnEntrar').disabled = true; $('erroEntrar').textContent = '';
  const r = await window.catalogo.entrar({ servidor: $('servidor').value, email: $('email').value, senha: $('senha').value });
  $('btnEntrar').disabled = false;
  if (r.erro) { $('erroEntrar').textContent = r.erro; return; }
  $('senha').value = '';
  mostrarApp(r);
});
document.addEventListener('click', async (e) => {
  const abrir = e.target.closest('[data-abrir]');
  if (abrir) {
    const texto = abrir.textContent;
    abrir.disabled = true; abrir.textContent = 'Abrindo…';
    const r = await window.catalogo.abrirLoja(Number(abrir.dataset.abrir));
    abrir.disabled = false; abrir.textContent = texto;
    if (r.expirou) return mostrarEntrar(null, 'Sua sessão terminou. Entre novamente.');
    if (r.erro) avisar(r.erro);
    return;
  }
  const v = e.target.closest('[data-vista]'); if (v) trocarVista(v.dataset.vista);
  const f = e.target.closest('[data-filtro]');
  if (f) { filtro = f.dataset.filtro; document.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b === f))); desenharLojas(); }
  if (e.target.closest('[data-atualizar]')) carregar();
});
$('busca').addEventListener('input', desenharLojas);
$('btnPainel').addEventListener('click', () => window.catalogo.abrirPainel());
$('btnSair').addEventListener('click', async () => { await window.catalogo.sair(); lojas = []; lembretes = []; mostrarEntrar(); });
window.catalogo.aoExpirar(() => mostrarEntrar(null, 'Sua sessão terminou. Entre novamente.'));
window.catalogo.aoBloquear(mostrarBloqueio);
function mostrarAtualizacao(versao) { $('versaoNova').textContent = versao; $('atualizacao').hidden = false; }
window.catalogo.aoAtualizacao(mostrarAtualizacao);
$('btnAtualizar').addEventListener('click', async () => {
  if (!confirm('O app vai fechar as lojas abertas e reiniciar já atualizado. Continuar?')) return;
  const r = await window.catalogo.instalarAtualizacao(); if (r.erro) avisar(r.erro);
});
$('formBloqueio').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('btnDesbloquear').disabled = true;
  const r = await window.catalogo.desbloquear($('senhaBloqueio').value);
  $('btnDesbloquear').disabled = false; $('senhaBloqueio').value = '';
  if (r.expirou) return mostrarEntrar(null, r.erro);
  if (r.erro) { $('erroBloqueio').textContent = r.erro; return; }
  $('telaBloqueio').hidden = true; $('app').hidden = false; carregar();
});
$('btnTrocarConta').addEventListener('click', async () => { await window.catalogo.sair(); lojas = []; lembretes = []; mostrarEntrar(); });

(async () => {
  const sessao = await window.catalogo.sessao();
  if (sessao.conectado) mostrarApp(sessao); else mostrarEntrar(sessao.servidor, sessao.aviso);
})();
