/**
 * Situacao do plano da loja no Cardapio.ai (Plano > Gerenciamento de plano).
 *
 * SCRIPT_PLANO roda na pagina viva e devolve o texto VISIVEL do quadro do plano:
 * o HTML traz juntos o aviso de teste gratis e o de assinatura paga, e e o
 * JavaScript da pagina que esconde o que nao vale para a loja.
 * lerPlano interpreta esse texto (testavel sem navegador).
 */
const SCRIPT_PLANO = `(() => {
  const area = document.querySelector('.planInfo-area');
  const titulo = document.querySelector('.planInfo-area .plan.selected .plan-title');
  return { titulo: titulo ? titulo.innerText.trim() : '', texto: area ? area.innerText : '' };
})()`;

const data = (d, m, a) => `${a}-${m}-${d}`;

function lerPlano({ titulo, texto }) {
  const t = String(texto || ''), linhas = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const validade = /v[aá]lida at[eé] (\d{2})\/(\d{2})\/(\d{4})/i.exec(t);
  const teste = /teste gr[aá]tis at[eé] o dia (\d{2})\/(\d{2})\/(\d{4})/i.exec(t);
  const periodo = linhas.map((l) => l.toLowerCase()).find((l) => ['mensal', 'semestral', 'anual'].includes(l)) || null;
  const valor = /R\$\s*([\d.]+,\d{2})/.exec(t);
  const situacao = linhas.find((l) => /pagamento recebido|pr[oó]xim[ao] verifica|pendente|vencid|aguardando pagamento/i.test(l)) || null;
  const renovacao = /Renove a assinatura de (\S+)/i.exec(t);
  return {
    // O titulo real vem com periodo e valor embaixo; o nome e a primeira linha.
    plano: String(titulo || '').split('\n').map((l) => l.trim()).find(Boolean) || null,
    periodo,
    valor_centavos: valor ? Math.round(Number(valor[1].replace(/\./g, '').replace(',', '.')) * 100) : null,
    valido_ate: validade ? data(validade[1], validade[2], validade[3]) : null,
    teste_ate: teste ? data(teste[1], teste[2], teste[3]) : null,
    situacao,
    renovacao: renovacao ? renovacao[1] : null,
    em_teste: /teste gr[aá]tis/i.test(t) && !validade,
  };
}

module.exports = { SCRIPT_PLANO, lerPlano };
