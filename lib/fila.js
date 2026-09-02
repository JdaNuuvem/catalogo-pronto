/**
 * Fila de publicacao.
 *
 * Cada loja tem seu proprio perfil de navegador, e dois processos mexendo no
 * mesmo perfil ao mesmo tempo corrompem a sessao. Por isso a fila serializa
 * por loja: publicacoes de lojas diferentes correm em paralelo, mas a mesma
 * loja espera a vez.
 */

class Fila {
  constructor() {
    this.emAndamento = new Map(); // lojaId -> trabalho
  }

  estaOcupada(lojaId) {
    return this.emAndamento.has(lojaId);
  }

  obter(lojaId) {
    return this.emAndamento.get(lojaId) || null;
  }

  /**
   * Inicia um trabalho para a loja. Devolve o objeto de acompanhamento, com
   * os eventos ja emitidos e os ouvintes SSE conectados.
   */
  iniciar(lojaId, total, executar) {
    if (this.estaOcupada(lojaId)) throw new Error('ja existe uma publicacao em andamento para esta loja');

    const trabalho = {
      lojaId,
      total,
      ativo: true,
      eventos: [],
      ouvintes: [],
      aguardandoMfa: false,
      resolverMfa: null,
      iniciadoEm: Date.now(),
    };

    trabalho.emitir = (evento) => {
      trabalho.eventos.push(evento);
      trabalho.ouvintes.forEach((res) => {
        try { res.write(`data: ${JSON.stringify(evento)}\n\n`); } catch { /* ouvinte caiu */ }
      });
    };

    trabalho.pedirCodigoMfa = () => new Promise((resolve) => {
      trabalho.aguardandoMfa = true;
      trabalho.resolverMfa = resolve;
      trabalho.emitir({ tipo: 'mfa' });
    });

    trabalho.responderMfa = (codigo) => {
      if (!trabalho.aguardandoMfa) return false;
      trabalho.aguardandoMfa = false;
      trabalho.resolverMfa(codigo);
      return true;
    };

    this.emAndamento.set(lojaId, trabalho);

    executar(trabalho)
      .then((resultado) => trabalho.emitir({ tipo: 'fim', ...resultado }))
      .catch((erro) => trabalho.emitir({ tipo: 'fatal', erro: erro.message }))
      .finally(() => {
        trabalho.ativo = false;
        trabalho.ouvintes.forEach((res) => { try { res.end(); } catch { /* ja fechado */ } });
        trabalho.ouvintes = [];
        // Mantem por alguns minutos para quem recarregar a pagina ainda ver o
        // desfecho. unref() para o timer nao impedir o processo de encerrar.
        const limpeza = setTimeout(() => {
          if (this.emAndamento.get(lojaId) === trabalho) this.emAndamento.delete(lojaId);
        }, 5 * 60 * 1000);
        if (limpeza.unref) limpeza.unref();
      });

    return trabalho;
  }
}

module.exports = { Fila };
