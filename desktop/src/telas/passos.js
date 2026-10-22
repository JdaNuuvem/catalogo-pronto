// O que fazer agora em cada loja, na ordem em que a implantacao acontece.
// Usado na lista de lojas e no Resumo; "acao" e o mesmo nome das acoes da janela da loja.
(() => {
  const br = (iso) => (iso || '').slice(0, 10).split('-').reverse().join('/');
  const emCincoDias = () => new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

  window.proximoPasso = (loja, plano = loja.plano) => {
    if (!loja.tem_cardapio) return { tom: 'ruim', titulo: 'Cadastrar o login do Cardapio.ai', detalhe: 'Sem ele o app não entra na loja. Salve em Lojas e acessos, no painel.', acao: 'abrir-loja-painel', botao: 'Abrir no painel' };
    if (!loja.tem_email) return { tom: 'ruim', titulo: 'Cadastrar o e-mail da loja', detalhe: 'O app lê nele o código de verificação do Cardapio.ai.', acao: 'abrir-loja-painel', botao: 'Abrir no painel' };
    const ate = plano && (plano.valido_ate || plano.teste_ate);
    if (ate && ate <= emCincoDias()) return { tom: 'ruim', titulo: plano.teste_ate && !plano.valido_ate ? `Teste grátis acaba em ${br(ate)}` : `Plano vence em ${br(ate)}`, detalhe: 'Gere e pague o Pix do plano no Cardapio.ai.', acao: 'abrir-cardapio', botao: 'Abrir Cardapio.ai' };
    if (loja.conferencia?.situacao === 'bloqueante') return { tom: 'ruim', titulo: 'Corrigir o catálogo', detalhe: 'A última conferência achou produtos que não podem ir para o cliente.', acao: 'abrir-conferencia', botao: 'Ver conferência' };
    if (loja.etapa !== 'implantacao') return { tom: 'ok', titulo: 'Tudo em dia', detalhe: loja.conferencia ? `Catálogo conferido em ${br(loja.conferencia.criada_em)}.` : 'Vale conferir o catálogo de vez em quando.', acao: 'conferir', botao: 'Conferir catálogo' };
    if (loja.ficha.completas < loja.ficha.total) return { tom: 'atencao', titulo: `Completar a ficha (${loja.ficha.completas} de ${loja.ficha.total})`, detalhe: loja.ficha.enviada_em ? 'O cliente enviou, mas ainda falta parte.' : 'Mande o link ao cliente ou preencha junto com ele.', acao: 'abrir-ficha', botao: 'Abrir ficha' };
    if (loja.roteiro.feitas < loja.roteiro.total) return { tom: 'atencao', titulo: `Seguir o roteiro (${loja.roteiro.feitas} de ${loja.roteiro.total})`, detalhe: 'Monte a loja no Cardapio.ai com os dados da ficha.', acao: 'abrir-roteiro', botao: 'Abrir roteiro' };
    if (!loja.conferencia) return { tom: 'atencao', titulo: 'Conferir o catálogo', detalhe: 'Antes de entregar, compare o publicado com o que revisamos.', acao: 'conferir', botao: 'Conferir catálogo' };
    return { tom: 'ok', titulo: 'Pronta para entregar', detalhe: 'Roteiro e ficha completos e catálogo conferido.', acao: 'abrir-roteiro', botao: 'Marcar entrega' };
  };
})();
