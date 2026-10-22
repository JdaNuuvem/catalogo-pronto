'use strict';
/* ---------------------------------------------------------------------
   Menu lateral unico das telas internas.

   Cada pagina so reserva <header id="casca" data-pagina="...">. O menu sai
   daqui, sempre com os mesmos grupos na mesma ordem, e so e desenhado depois
   de saber quem entrou: ninguem ve por um instante o menu do administrador.
   O cliente da loja nao tem menu, so a barra com a marca e o Sair.
   --------------------------------------------------------------------- */
(() => {
  // Guardado antes de qualquer pagina embrulhar o fetch: a revisao de uma
  // loja troca /api/eu pelo ambiente do cliente, e aqui interessa quem entrou.
  const buscar = window.fetch.bind(window);

  const EQUIPE = ['admin', 'atendente'], ADMIN = ['admin'];
  const GRUPOS = [
    { titulo: 'Operação', itens: [
      { id: 'inicio', href: '/gestao.html#inicio', texto: 'Visão geral', icone: 'inicio', papeis: EQUIPE },
      { id: 'lojas-novas', href: '/gestao.html#lojas-novas', texto: 'Lojas novas', icone: 'roteiro', papeis: EQUIPE },
      { id: 'clientes', href: '/gestao.html#clientes', texto: 'Clientes', icone: 'clientes', papeis: EQUIPE },
      { id: 'operacao', href: '/operacao.html', texto: 'Minha carteira', icone: 'carteira', papeis: ['atendente'] },
      { id: 'tarefas', href: '/gestao.html#tarefas', texto: 'Suporte e tarefas', icone: 'suporte', papeis: EQUIPE },
    ] },
    { titulo: 'Dinheiro', itens: [
      { id: 'cobrancas', href: '/gestao.html#cobrancas', texto: 'Cobranças', icone: 'recibo', papeis: EQUIPE },
      { id: 'financeiro', href: '/gestao.html#financeiro', texto: 'Financeiro', icone: 'grafico', papeis: ADMIN },
      { id: 'repasses', href: '/gestao.html#repasses', texto: 'Repasses', icone: 'repasse', papeis: EQUIPE },
    ] },
    { titulo: 'Administração', itens: [
      { id: 'operacao', href: '/operacao.html', texto: 'Cadastro e equipe', icone: 'cadastro', papeis: ADMIN },
      { id: 'produtos', href: '/?produtos=1', texto: 'Produtos', icone: 'caixa', papeis: EQUIPE },
      { id: 'admin', href: '/admin.html', texto: 'Lojas e IA', textoAtendente: 'Lojas e acessos', icone: 'ajustes', papeis: EQUIPE },
      { id: 'configuracoes', href: '/gestao.html#configuracoes', texto: 'Equipe e backups', icone: 'backup', papeis: ADMIN },
    ] },
  ];
  const PAPEIS = { admin: 'Administrador', atendente: 'Atendente', cliente: 'Sua loja' };
  // Paginas que so a equipe abre: o menu lateral ja pode ocupar seu lugar antes da resposta do /api/eu.
  const SO_EQUIPE = ['gestao', 'operacao', 'admin'];

  const TRACOS = {
    inicio: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    roteiro: '<path d="m3 7 2 2 4-4M3 17l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
    clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    carteira: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h2M3 10h18M7 6V4h10v2"/>',
    suporte: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    recibo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    grafico: '<path d="M5 20v-9M11 20V5M17 20v-8M3 20h18"/>',
    repasse: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    cadastro: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
    caixa: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    ajustes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    backup: '<ellipse cx="12" cy="5.5" rx="8" ry="2.5"/><path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5"/>',
    chave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
    sair: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 16l4-4-4-4M20 12H9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  };
  const icone = (nome) => `<svg class="casca-icone" viewBox="0 0 24 24" aria-hidden="true">${TRACOS[nome]}</svg>`;

  const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Qual item do menu representa a tela aberta agora. */
  function itemAtual(pagina) {
    if (pagina === 'gestao') {
      const aba = location.hash.slice(1) || 'inicio';
      return aba.startsWith('cliente-') ? 'clientes' : aba;
    }
    return pagina;
  }

  function marca(papel) {
    const inicio = EQUIPE.includes(papel) ? '/gestao.html' : '/';
    return `<a class="casca-marca" href="${inicio}"><span class="casca-selo" aria-hidden="true">CP</span><span>Catálogo Pronto</span></a>`;
  }

  function desenhar(cabecalho, eu) {
    if (!eu) { cabecalho.innerHTML = `<div class="casca-topo">${marca(null)}</div>`; return; }
    const papel = eu.papel, atual = itemAtual(cabecalho.dataset.pagina);

    const grupos = GRUPOS.map((g) => {
      const itens = g.itens.filter((i) => i.papeis.includes(papel));
      if (!itens.length) return '';
      return `<div class="casca-grupo"><span class="casca-grupo-titulo">${g.titulo}</span>${itens.map((i) =>
        `<a href="${i.href}" data-casca-item="${i.id}"${i.id === atual ? ' aria-current="page"' : ''}>${icone(i.icone)}<span class="casca-texto">${escapar(papel === 'atendente' && i.textoAtendente ? i.textoAtendente : i.texto)}</span></a>`).join('')}</div>`;
    }).join('');

    const lateral = !!grupos;
    document.body.classList.toggle('com-lateral', lateral);
    cabecalho.classList.toggle('casca-simples', !lateral);
    cabecalho.innerHTML = `<div class="casca-topo">${marca(papel)}${lateral
      ? `<button type="button" class="casca-alternar" aria-expanded="false" aria-controls="cascaPainel" aria-label="Abrir menu">${icone('menu')}</button>` : ''}</div>
      <div class="casca-painel" id="cascaPainel">
        ${lateral ? `<nav class="casca-menu" aria-label="Menu principal">${grupos}</nav>` : ''}
        <div class="casca-conta">
          <span class="casca-quem"><b>${escapar(eu.nome)}</b><small>${PAPEIS[papel] || ''}</small></span>
          <div class="casca-botoes">
            ${EQUIPE.includes(papel) ? `<button type="button" id="minhaSenha" title="Alterar minha senha">${icone('chave')}<span>Senha</span></button>` : ''}
            <button type="button" id="sair">${icone('sair')}<span>Sair</span></button>
          </div>
        </div>
      </div>`;

    cabecalho.querySelector('#sair').onclick = async () => {
      await buscar('/api/sair', { method: 'POST' }).catch(() => null);
      location.replace('/');
    };
    const senha = cabecalho.querySelector('#minhaSenha');
    // O dialogo de senha mora na gestao; das outras telas o botao leva ate la ja com ele aberto.
    if (senha) senha.onclick = () => {
      if (cabecalho.dataset.pagina === 'gestao') document.dispatchEvent(new CustomEvent('casca-senha'));
      else location.href = '/gestao.html?senha=1';
    };
    const alternar = cabecalho.querySelector('.casca-alternar');
    if (alternar) alternar.onclick = () => {
      const aberto = cabecalho.classList.toggle('aberto');
      alternar.setAttribute('aria-expanded', String(aberto));
    };
    // No celular o menu e uma gaveta: escolher um item fecha a gaveta.
    cabecalho.querySelectorAll('.casca-menu a').forEach((a) => a.addEventListener('click', () => {
      cabecalho.classList.remove('aberto');
      if (alternar) alternar.setAttribute('aria-expanded', 'false');
    }));
  }

  /** Quantos lembretes a pessoa tem hoje, ao lado de "Visao geral" (e no botao do menu no celular). */
  async function contarLembretes(cabecalho) {
    const r = await buscar('/api/gestao/lembretes').catch(() => null);
    if (!r || !r.ok) return;
    const { total, urgentes } = await r.json();
    cabecalho.querySelectorAll('.casca-contador').forEach((c) => c.remove());
    if (!total) return;
    const marca = `<span class="casca-contador${urgentes ? ' urgente' : ''}" title="${total} lembrete${total === 1 ? '' : 's'} hoje">${total}</span>`;
    cabecalho.querySelector('[data-casca-item="inicio"]')?.insertAdjacentHTML('beforeend', marca);
    cabecalho.querySelector('.casca-alternar')?.insertAdjacentHTML('beforeend', marca);
  }

  // Na gestao as telas trocam pelo endereco (#cobrancas, #cliente-3...) sem recarregar a pagina.
  window.addEventListener('hashchange', () => {
    const cabecalho = document.getElementById('casca');
    if (!cabecalho) return;
    if (cabecalho.querySelector('[data-casca-item="inicio"]')) contarLembretes(cabecalho);
    const atual = itemAtual(cabecalho.dataset.pagina);
    cabecalho.querySelectorAll('.casca-menu a').forEach((a) => {
      if (a.dataset.cascaItem === atual) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  });

  // Uma consulta por pagina. So se repete se ainda nao havia ninguem logado.
  let consulta = null;
  function atualizar() {
    const cabecalho = document.getElementById('casca');
    if (!cabecalho || consulta) return;
    consulta = (async () => {
      const r = await buscar('/api/eu').catch(() => null);
      const eu = r && r.ok ? await r.json() : null;
      desenhar(cabecalho, eu);
      if (eu && EQUIPE.includes(eu.papel)) contarLembretes(cabecalho);
      if (!eu) consulta = null;
    })();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const cabecalho = document.getElementById('casca');
    if (!cabecalho) return;
    if (SO_EQUIPE.includes(cabecalho.dataset.pagina)) document.body.classList.add('com-lateral');
    desenhar(cabecalho, null);
    atualizar();
  });
  // O painel de produtos avisa quando alguem acaba de entrar pela tela de login.
  document.addEventListener('catalogo-perfil', atualizar);
})();
