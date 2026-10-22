/**
 * Ficha de implantacao: tudo o que o Cardapio.ai pede para a loja comecar a
 * vender, nos mesmos campos das telas dele (Minha loja, Horarios, Entrega,
 * Pagamento, Primeiros passos).
 *
 * Quem preenche e o cliente (por um link) e/ou o atendente. A ficha pode ser
 * salva pela metade: validarFicha normaliza o que veio, aponta o campo com
 * problema e diz, por secao, se ela ja esta completa para o assistente do app.
 * Campos desconhecidos sao descartados.
 */
const SECOES = ['loja', 'endereco', 'marca', 'horarios', 'entrega', 'pagamento', 'produtos'];
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

const digitos = (v) => String(v ?? '').replace(/\D/g, '');
const vazio = (v) => v === undefined || v === null || String(v).trim() === '';
const sim = (v) => v === true || v === 'true' || v === 'sim' || v === 1 || v === '1';

function criarLeitor() {
  const erros = [];
  const erro = (campo, mensagem) => { erros.push({ campo, mensagem }); return null; };
  const texto = (v, campo, max = 120) => {
    if (vazio(v)) return '';
    const t = String(v).trim();
    return t.length > max ? erro(campo, `use no máximo ${max} caracteres`) ?? '' : t;
  };
  // Texto vem da tela, em reais ("5,00", "1.234,50"), e vira centavos. Numero inteiro ja
  // esta em centavos (e como a ficha fica gravada): validar de novo nao multiplica o valor.
  const centavos = (v, campo) => {
    if (vazio(v)) return null;
    if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 && v <= 10000000 ? v : erro(campo, 'informe um valor em reais');
    const t = Number(String(v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(t) && t >= 0 && t <= 100000 ? Math.round(t * 100) : erro(campo, 'informe um valor em reais');
  };
  const numero = (v, campo, max) => {
    if (vazio(v)) return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 && n <= max ? n : erro(campo, `informe um número entre 0 e ${max}`);
  };
  const opcao = (v, campo, opcoes, padrao) => (vazio(v) ? padrao : opcoes.includes(v) ? v : erro(campo, 'opção inválida') ?? padrao);
  const hora = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim()); if (!m || +m[1] > 23 || +m[2] > 59) return null; return `${m[1].padStart(2, '0')}:${m[2]}`; };
  return { erros, erro, texto, centavos, numero, opcao, hora };
}

function chavePix(tipo, chave, l) {
  if (vazio(chave)) return '';
  const t = String(chave).trim();
  const ruim = () => l.erro('pagamento.pix_chave', 'chave Pix não confere com o tipo escolhido') ?? '';
  if (tipo === 'cpf') return digitos(t).length === 11 ? digitos(t) : ruim();
  if (tipo === 'cnpj') return digitos(t).length === 14 ? digitos(t) : ruim();
  if (tipo === 'celular') { const d = digitos(t).replace(/^55(?=\d{10,11}$)/, ''); return /^\d{10,11}$/.test(d) ? '+55' + d : ruim(); }
  if (tipo === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && t.length <= 77 ? t.toLowerCase() : ruim();
  if (tipo === 'aleatoria') return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? t.toLowerCase() : ruim();
  return '';
}

function validarFicha(entrada = {}) {
  const l = criarLeitor();
  const e = (s) => (entrada && typeof entrada[s] === 'object' && entrada[s]) || {};
  const ficha = {};

  const lo = e('loja');
  ficha.loja = {
    nome: l.texto(lo.nome, 'loja.nome', 120),
    documento: (() => { const d = digitos(lo.documento); return !d ? '' : [11, 14].includes(d.length) ? d : l.erro('loja.documento', 'informe um CPF ou CNPJ') ?? ''; })(),
    telefone: (() => { const d = digitos(lo.telefone).replace(/^55(?=\d{10,11}$)/, ''); return !d ? '' : /^\d{10,11}$/.test(d) ? d : l.erro('loja.telefone', 'informe DDD + número') ?? ''; })(),
    pedido_minimo: l.centavos(lo.pedido_minimo, 'loja.pedido_minimo'),
    recado: l.texto(lo.recado, 'loja.recado', 300),
  };

  const en = e('endereco');
  ficha.endereco = {
    cep: (() => { const d = digitos(en.cep); return !d ? '' : d.length === 8 ? d : l.erro('endereco.cep', 'o CEP tem 8 números') ?? ''; })(),
    rua: l.texto(en.rua, 'endereco.rua', 150), numero: l.texto(en.numero, 'endereco.numero', 20),
    complemento: l.texto(en.complemento, 'endereco.complemento', 80), bairro: l.texto(en.bairro, 'endereco.bairro', 80),
    cidade: l.texto(en.cidade, 'endereco.cidade', 80),
    uf: (() => { const u = String(en.uf ?? '').trim().toUpperCase(); return !u ? '' : UFS.includes(u) ? u : l.erro('endereco.uf', 'UF inválida') ?? ''; })(),
    exibicao: l.opcao(en.exibicao, 'endereco.exibicao', ['oculto', 'cidade', 'completo'], 'completo'),
  };

  const ma = e('marca');
  const material = (v, campo) => (vazio(v) ? null : Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : l.erro(campo, 'imagem inválida'));
  ficha.marca = {
    cor: vazio(ma.cor) ? '' : /^#[0-9a-f]{6}$/i.test(String(ma.cor).trim()) ? String(ma.cor).trim().toLowerCase() : l.erro('marca.cor', 'use uma cor como #1f5170') ?? '',
    logo_material: material(ma.logo_material, 'marca.logo_material'),
    capa_material: material(ma.capa_material, 'marca.capa_material'),
  };

  const ho = e('horarios'), diasEntrada = (ho.dias && typeof ho.dias === 'object') ? ho.dias : {};
  ficha.horarios = { agendamento: l.opcao(ho.agendamento, 'horarios.agendamento', ['sem', 'hora_e_agendado', 'somente_agendado'], 'sem'), dias: {} };
  for (const dia of DIAS) {
    const periodos = Array.isArray(diasEntrada[dia]) ? diasEntrada[dia].slice(0, 4) : [];
    const lidos = periodos.map((p) => ({ abre: l.hora(p?.abre), fecha: l.hora(p?.fecha) }));
    if (lidos.some((p) => !p.abre || !p.fecha || p.fecha <= p.abre)) { l.erro(`horarios.dias.${dia}`, 'confira o horário: abre e fecha no formato 09:00, fechando depois de abrir'); ficha.horarios.dias[dia] = []; }
    else ficha.horarios.dias[dia] = lidos;
  }

  const ent = e('entrega');
  ficha.entrega = {
    faz_entrega: sim(ent.faz_entrega), retirada: sim(ent.retirada),
    modo: l.opcao(ent.modo, 'entrega.modo', ['raio', 'bairros'], 'raio'),
    raio_base_km: l.numero(ent.raio_base_km, 'entrega.raio_base_km', 100), taxa_base: l.centavos(ent.taxa_base, 'entrega.taxa_base'),
    taxa_km: l.centavos(ent.taxa_km, 'entrega.taxa_km'), distancia_maxima_km: l.numero(ent.distancia_maxima_km, 'entrega.distancia_maxima_km', 200),
    frete_gratis_km: l.numero(ent.frete_gratis_km, 'entrega.frete_gratis_km', 200), tempo_preparo_min: l.numero(ent.tempo_preparo_min, 'entrega.tempo_preparo_min', 600),
    bairros: [],
  };
  const bairros = Array.isArray(ent.bairros) ? ent.bairros.slice(0, 300) : [];
  if (bairros.some((b) => vazio(b?.nome) || vazio(b?.taxa))) l.erro('entrega.bairros', 'cada bairro precisa de nome e taxa');
  else ficha.entrega.bairros = bairros.map((b, i) => ({ nome: l.texto(b.nome, `entrega.bairros.${i}`, 80), taxa: l.centavos(b.taxa, 'entrega.bairros') }));

  const pa = e('pagamento');
  const pixTipo = l.opcao(pa.pix_tipo, 'pagamento.pix_tipo', ['cnpj', 'cpf', 'celular', 'email', 'aleatoria'], '');
  ficha.pagamento = { pix: sim(pa.pix), pix_tipo: pixTipo || '', pix_chave: pixTipo ? chavePix(pixTipo, pa.pix_chave, l) : '',
    dinheiro: sim(pa.dinheiro), credito: sim(pa.credito), debito: sim(pa.debito), vale: sim(pa.vale) };

  const pr = e('produtos');
  ficha.produtos = {
    origem: l.opcao(pr.origem, 'produtos.origem', ['link', 'fotos', 'pre_cadastrados'], ''),
    link_cardapio: vazio(pr.link_cardapio) ? '' : (() => { try { const u = new URL(String(pr.link_cardapio).trim()); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : l.erro('produtos.link_cardapio', 'cole o endereço completo do cardápio'); } catch { return l.erro('produtos.link_cardapio', 'cole o endereço completo do cardápio'); } })() ?? '',
  };
  ficha.observacoes = l.texto(entrada?.observacoes, 'observacoes', 2000);

  const f = ficha;
  const completo = {
    loja: !!(f.loja.nome && f.loja.telefone),
    endereco: !!(f.endereco.cep && f.endereco.rua && f.endereco.numero && f.endereco.bairro && f.endereco.cidade && f.endereco.uf),
    marca: !!f.marca.logo_material,
    horarios: DIAS.some((d) => f.horarios.dias[d].length),
    entrega: f.entrega.faz_entrega
      ? (f.entrega.modo === 'bairros' ? f.entrega.bairros.length > 0 : f.entrega.raio_base_km !== null && f.entrega.taxa_base !== null && f.entrega.distancia_maxima_km !== null)
      : f.entrega.retirada,
    pagamento: (f.pagamento.pix && !!f.pagamento.pix_chave) || f.pagamento.dinheiro || f.pagamento.credito || f.pagamento.debito || f.pagamento.vale,
    produtos: f.produtos.origem === 'link' ? !!f.produtos.link_cardapio : !!f.produtos.origem,
  };
  return { ficha, erros: l.erros, completo };
}

module.exports = { validarFicha, SECOES, DIAS };
