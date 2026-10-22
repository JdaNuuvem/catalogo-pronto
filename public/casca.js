'use strict';
/* ---------------------------------------------------------------------
   Cabecalho unico das telas internas.

   Cada pagina so reserva <header id="casca" data-pagina="...">. O menu sai
   daqui, sempre com os mesmos itens na mesma ordem, e so e desenhado depois
   de saber quem entrou: ninguem ve por um instante o menu do administrador,
   e o cabecalho nao muda de forma de uma tela para outra.
   --------------------------------------------------------------------- */
(() => {
  // Guardado antes de qualquer pagina embrulhar o fetch: a revisao de uma
  // loja troca /api/eu pelo ambiente do cliente, e aqui interessa quem entrou.
  const buscar = window.fetch.bind(window);

  const MENU = [
    { pagina: 'gestao', href: '/gestao.html', texto: 'Gestão', papeis: ['admin', 'atendente'] },
    { pagina: 'operacao', href: '/operacao.html', texto: 'Clientes e equipe', textoAtendente: 'Minha carteira', papeis: ['admin', 'atendente'] },
    { pagina: 'produtos', href: '/?produtos=1', texto: 'Produtos', papeis: ['admin'] },
    { pagina: 'admin', href: '/admin.html', texto: 'Configurações', papeis: ['admin'] },
  ];
  const PAPEIS = { admin: 'Administrador', atendente: 'Atendente', cliente: 'Sua loja' };

  const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function marca(papel) {
    const inicio = papel === 'admin' || papel === 'atendente' ? '/gestao.html' : '/';
    return `<a class="casca-marca" href="${inicio}"><span class="casca-selo" aria-hidden="true">CP</span>Catálogo Pronto</a>`;
  }

  function desenhar(cabecalho, eu) {
    if (!eu) { cabecalho.innerHTML = marca(null); return; }
    const papel = eu.papel;

    const itens = MENU.filter((i) => i.papeis.includes(papel)).map((i) => {
      const atual = i.pagina === cabecalho.dataset.pagina ? ' aria-current="page"' : '';
      const texto = papel === 'atendente' && i.textoAtendente ? i.textoAtendente : i.texto;
      return `<a href="${i.href}"${atual}>${escapar(texto)}</a>`;
    }).join('');

    cabecalho.innerHTML = marca(papel)
      + (itens ? `<nav class="casca-menu" aria-label="Menu principal">${itens}</nav>` : '')
      + `<div class="casca-conta">
          <span class="casca-quem"><b>${escapar(eu.nome)}</b><small>${PAPEIS[papel] || ''}</small></span>
          ${'minhaSenha' in cabecalho.dataset ? '<button type="button" id="minhaSenha">Minha senha</button>' : ''}
          <button type="button" id="sair">Sair</button>
        </div>`;

    cabecalho.querySelector('#sair').onclick = async () => {
      await buscar('/api/sair', { method: 'POST' }).catch(() => null);
      location.replace('/');
    };
    const senha = cabecalho.querySelector('#minhaSenha');
    if (senha) senha.onclick = () => document.dispatchEvent(new CustomEvent('casca-senha'));
  }

  // Uma consulta por pagina. So se repete se ainda nao havia ninguem logado.
  let consulta = null;
  function atualizar() {
    const cabecalho = document.getElementById('casca');
    if (!cabecalho || consulta) return;
    consulta = (async () => {
      const r = await buscar('/api/eu').catch(() => null);
      const eu = r && r.ok ? await r.json() : null;
      desenhar(cabecalho, eu);
      if (!eu) consulta = null;
    })();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const cabecalho = document.getElementById('casca');
    if (!cabecalho) return;
    desenhar(cabecalho, null);
    atualizar();
  });
  // O painel de produtos avisa quando alguem acaba de entrar pela tela de login.
  document.addEventListener('catalogo-perfil', atualizar);
})();
