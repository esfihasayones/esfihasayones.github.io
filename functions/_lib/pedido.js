import { PONTOS, SABORES, precoCentavos, situacaoData, longeDemais, diaDaData, janelaDe, telefoneLimpo } from "../../public/regras.js";
import { cupomDe } from "./cupons.js";

export const texto = (v, max, min) => typeof v === "string" && v.trim().length >= (min || 0) && v.length <= max;

// Tira caractere de controle e marca de direção de texto (invertem ou quebram
// o nome na tela do painel). Quebra de linha só fica onde faz sentido (obs).
const SUJEIRA = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;
const SUJEIRA_LINHA = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;
export const limpar = (v, multilinha) => typeof v === "string" ? v.replace(multilinha ? SUJEIRA : SUJEIRA_LINHA, "") : v;

// "AAAA-MM-DD" que existe no calendário.
export function dataIsoValida(v) {
  return typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v)
    && !isNaN(new Date(v + "T12:00:00Z")) && new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
}

// Confere a lista de itens; devolve {erro} ou {itens} já limpos.
export function validarItens(lista) {
  if (!Array.isArray(lista) || lista.length < 1 || lista.length > 20) return { erro: "itens inválidos" };
  const itens = [];
  for (const i of lista) {
    if (!i || typeof i !== "object") return { erro: "item inválido" };
    if (!SABORES.some((s) => s.id === i.sabor)) return { erro: "sabor inexistente" };
    if (!Number.isInteger(i.qtd) || i.qtd < 1 || i.qtd > 200) return { erro: "quantidade inválida" };
    const obs = limpar(i.obs);
    if (obs != null && !texto(obs, 140)) return { erro: "observação do item inválida" };
    const item = { sabor: i.sabor, qtd: i.qtd };
    if (obs) item.obs = obs;
    itens.push(item);
  }
  return { itens };
}

// Única conta de preço: quantidade, preço por unidade, desconto do cupom e
// total final, tudo em centavos. Usada pelo pedido do site, pelo manual e
// pela edição no painel. `cupomTexto` pode ser nulo; código inexistente não
// dá desconto (quem chama decide o que fazer com isso via `cupomValido`).
export function precificar(itens, cupomTexto) {
  const qtd = itens.reduce((s, i) => s + i.qtd, 0);
  const { unit, total } = precoCentavos(qtd);
  const cupom = cupomTexto ? cupomDe(cupomTexto) : null;
  const desconto = cupom ? Math.round(total * cupom.pct) : 0;
  return {
    qtd,
    unit_centavos: unit,
    desconto_centavos: desconto,
    total_centavos: total - desconto,
    cupom: cupom ? cupom.codigo : (cupomTexto && cupomTexto.trim() ? cupomTexto.trim().toUpperCase() : null),
    cupomValido: !!cupom,
  };
}

// Confere o formato do corpo e devolve {erro} ou {corpo} já limpo.
// Qualquer campo fora da lista (inclusive valor) é descartado aqui.
export function validar(bruto) {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return { erro: "corpo inválido" };
  const c = { ...bruto, id_envio: limpar(bruto.id_envio), nome: limpar(bruto.nome), cupom: limpar(bruto.cupom), obs: limpar(bruto.obs, true) };
  if (!texto(c.id_envio, 64, 1)) return { erro: "id_envio inválido" };
  if (!texto(c.nome, 60, 1)) return { erro: "nome inválido" };
  // Telefone é obrigatório no site; o servidor ainda aceita sem, pra não
  // perder o pedido de quem está com a página velha no cache.
  let telefone = null;
  if (c.telefone != null && c.telefone !== "") {
    telefone = telefoneLimpo(c.telefone);
    if (!telefone) return { erro: "telefone inválido" };
  }
  const vi = validarItens(c.itens);
  if (vi.erro) return { erro: vi.erro };
  const itens = vi.itens;
  // mesmo teto do site: 200 por sabor, 4 sabores. Acima do limite do dia o pedido cai como "lotado".
  if (itens.reduce((s, i) => s + i.qtd, 0) > 800) return { erro: "pedido grande demais" };
  if (!Number.isInteger(c.ponto) || c.ponto < 0 || c.ponto >= PONTOS.length) return { erro: "ponto inválido" };
  const fixo = !!PONTOS[c.ponto].dias;
  let retirada = null;
  if (c.retirada != null) {
    if (!dataIsoValida(c.retirada)) return { erro: "retirada inválida" };
    retirada = c.retirada;
  }
  if (fixo && !retirada) return { erro: "retirada obrigatória" };
  if (c.cupom != null && !texto(c.cupom, 30)) return { erro: "cupom inválido" };
  if (c.obs != null && !texto(c.obs, 500)) return { erro: "observação inválida" };
  return {
    corpo: {
      id_envio: c.id_envio, nome: c.nome.trim(), telefone, itens, ponto: c.ponto, retirada,
      cupom: c.cupom && c.cupom.trim() ? c.cupom : null, obs: c.obs || null,
    },
  };
}

// Puro: decide status e motivo e monta a linha a gravar. O valor é sempre
// recalculado aqui, nunca lido do corpo. `corpo` já passou por validar().
// Se mais de uma regra falhar, vale a primeira desta ordem:
// pausado > bloqueado > feriado > dia > cedo > lotado > cupom > cupom_usado.
// `cupomUsado` vem de cupomJaUsado(): este telefone já gastou o cupom.
export function avaliar(corpo, agoraMs, agenda, cupomUsado) {
  const ponto = PONTOS[corpo.ponto];
  const preco = precificar(corpo.itens, corpo.cupom);
  const qtd = preco.qtd;

  let motivo = null;
  const fixo = !!ponto.dias;
  if (agenda.pausado) motivo = "pausado";
  else if (fixo && agenda.bloqueados.has(corpo.retirada)) motivo = "bloqueado";
  else {
    const sit = fixo ? situacaoData(ponto, corpo.retirada, qtd, agoraMs) : "ok";
    if (sit !== "ok") motivo = sit;
    else if (fixo && (agenda.ocupado.get(corpo.retirada) || 0) + qtd > agenda.limite) motivo = "lotado";
    else if (corpo.cupom && !preco.cupomValido) motivo = "cupom";
    else if (corpo.cupom && cupomUsado) motivo = "cupom_usado";
    else if (fixo && longeDemais(corpo.retirada, agoraMs)) motivo = "longe";
  }

  const status = motivo ? "fora_da_regra" : "aguardando";
  return {
    status,
    motivo,
    linha: {
      id_envio: corpo.id_envio,
      criado_em: new Date(agoraMs).toISOString(),
      origem: "site",
      status,
      motivo,
      nome: corpo.nome,
      telefone: corpo.telefone || null,
      itens: JSON.stringify(corpo.itens),
      qtd,
      unit_centavos: preco.unit_centavos,
      total_centavos: preco.total_centavos,
      cupom: preco.cupom,
      desconto_centavos: preco.desconto_centavos,
      ponto: ponto.nome,
      retirada: corpo.retirada,
      janela: fixo ? janelaDe(ponto, diaDaData(corpo.retirada)) : null,
      obs: corpo.obs,
    },
  };
}
