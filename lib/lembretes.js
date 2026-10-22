/**
 * Lembretes do dia, calculados a partir do que ja esta no painel: cobrancas,
 * lojas novas e tarefas. Nada e gravado; o mesmo calculo alimenta o painel,
 * o contador do menu e o resumo diario por e-mail.
 *
 * Niveis: "urgente" (ja passou), "hoje" (precisa de acao agora) e "breve"
 * (vence nos proximos dias).
 */
const DIAS_COBRANCA = 3, DIAS_LOJA = 3, DIAS_TAREFA = 2, ETAPAS_ROTEIRO = 11;
const ORDEM = { urgente: 0, hoje: 1, breve: 2 };

const dias = (de, ate) => Math.round((Date.parse(ate + 'T12:00:00Z') - Date.parse(de + 'T12:00:00Z')) / 86400000);
const nivel = (diferenca) => (diferenca < 0 ? 'urgente' : diferenca === 0 ? 'hoje' : 'breve');
function quando(diferenca, futuro, passado) {
  if (diferenca === 0) return `${futuro} hoje`;
  if (diferenca > 0) return `${futuro} em ${diferenca} dia${diferenca === 1 ? '' : 's'}`;
  return `${passado} há ${-diferenca} dia${diferenca === -1 ? '' : 's'}`;
}

/** Suporte e plano do mesmo contrato e mes formam uma mensalidade; o resto fica sozinho. */
function agrupar(cobrancas) {
  const grupos = new Map();
  for (const c of cobrancas) {
    const chave = c.grupo && c.competencia ? `${c.grupo}|${c.competencia}` : `c${c.id}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(c);
  }
  return [...grupos.values()];
}

function calcular({ cobrancas = [], clientes = [], tarefas = [], hoje, admin }) {
  const lista = [];

  const abertas = cobrancas.filter((c) => !c.cancelada && c.pendente > 0);
  for (const partes of agrupar(abertas)) {
    const c = partes[0], diferenca = dias(hoje, c.vencimento);
    if (diferenca > DIAS_COBRANCA) continue;
    const nome = c.grupo && c.competencia ? `Mensalidade ${c.competencia}` : c.descricao;
    lista.push({ tipo: diferenca < 0 ? 'vencida' : 'vencendo', nivel: nivel(diferenca), data: c.vencimento, loja_id: c.loja_id, cliente: c.cliente,
      titulo: `${nome} de ${c.cliente} ${quando(diferenca, 'vence', 'venceu')}`, valor: partes.reduce((n, p) => n + p.pendente, 0),
      cobrancas: partes.map((p) => p.id) });
  }

  // Quem paga o Cardapio.ai e o administrador, com a reserva que o cliente ja pagou.
  if (admin) {
    for (const c of cobrancas.filter((c) => c.tipo === 'plano' && !c.cancelada && c.reserva > 0 && c.plataforma_paga < c.valor)) {
      lista.push({ tipo: 'plataforma', nivel: 'hoje', data: c.vencimento, loja_id: c.loja_id, cliente: c.cliente,
        titulo: `${c.pix_codigo ? 'Pagar o Pix do Cardapio.ai' : 'Gerar e pagar o Pix do Cardapio.ai'} de ${c.cliente}`,
        valor: c.reserva, cobrancas: [c.id] });
    }
  }

  for (const l of clientes.filter((l) => l.ativo && l.implantacao_prazo && (l.onboarding_feitos || []).length < ETAPAS_ROTEIRO)) {
    const diferenca = dias(hoje, l.implantacao_prazo);
    if (diferenca > DIAS_LOJA) continue;
    lista.push({ tipo: 'prazo-loja', nivel: nivel(diferenca), data: l.implantacao_prazo, loja_id: l.id, cliente: l.nome,
      titulo: diferenca < 0 ? `Entrega de ${l.nome} atrasada há ${-diferenca} dia${diferenca === -1 ? '' : 's'}` : `Entrega de ${l.nome} ${quando(diferenca, 'vence', 'venceu')}` });
  }

  for (const t of tarefas.filter((t) => t.estado !== 'concluida' && t.prazo)) {
    const diferenca = dias(hoje, t.prazo);
    if (diferenca > DIAS_TAREFA) continue;
    lista.push({ tipo: 'prazo-tarefa', nivel: nivel(diferenca), data: t.prazo, loja_id: t.loja_id, cliente: t.cliente,
      titulo: `${t.titulo} (${t.cliente}) ${quando(diferenca, 'vence', 'venceu')}`, tarefa: t.id });
  }

  return lista.sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel] || a.data.localeCompare(b.data));
}

module.exports = { calcular };
