import { PONTOS, SABORES, precoCentavos, situacaoData, diaDaData, janelaDe } from "../../public/regras.js";
import { cupomDe } from "./cupons.js";

const texto = (v, max, min) => typeof v === "string" && v.trim().length >= (min || 0) && v.length <= max;

// Confere o formato do corpo e devolve {erro} ou {corpo} já limpo.
// Qualquer campo fora da lista (inclusive valor) é descartado aqui.
export function validar(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return { erro: "corpo inválido" };
  if (!texto(c.id_envio, 64, 1)) return { erro: "id_envio inválido" };
  if (!texto(c.nome, 60, 1)) return { erro: "nome inválido" };
  if (!Array.isArray(c.itens) || c.itens.length < 1 || c.itens.length > 20) return { erro: "itens inválidos" };
  const itens = [];
  for (const i of c.itens) {
    if (!i || typeof i !== "object") return { erro: "item inválido" };
    if (!SABORES.some((s) => s.id === i.sabor)) return { erro: "sabor inexistente" };
    if (!Number.isInteger(i.qtd) || i.qtd < 1 || i.qtd > 200) return { erro: "quantidade inválida" };
    if (i.obs != null && !texto(i.obs, 140)) return { erro: "observação do item inválida" };
    const item = { sabor: i.sabor, qtd: i.qtd };
    if (i.obs) item.obs = i.obs;
    itens.push(item);
  }
  if (!Number.isInteger(c.ponto) || c.ponto < 0 || c.ponto >= PONTOS.length) return { erro: "ponto inválido" };
  const fixo = !!PONTOS[c.ponto].dias;
  let retirada = null;
  if (c.retirada != null) {
    if (typeof c.retirada !== "string" || !/^\d{4}-\d\d-\d\d$/.test(c.retirada)
      || isNaN(new Date(c.retirada + "T12:00:00Z")) || new Date(c.retirada + "T12:00:00Z").toISOString().slice(0, 10) !== c.retirada) {
      return { erro: "retirada inválida" };
    }
    retirada = c.retirada;
  }
  if (fixo && !retirada) return { erro: "retirada obrigatória" };
  if (c.cupom != null && !texto(c.cupom, 30)) return { erro: "cupom inválido" };
  if (c.obs != null && !texto(c.obs, 500)) return { erro: "observação inválida" };
  return {
    corpo: {
      id_envio: c.id_envio, nome: c.nome.trim(), itens, ponto: c.ponto, retirada,
      cupom: c.cupom && c.cupom.trim() ? c.cupom : null, obs: c.obs || null,
    },
  };
}

// Puro: decide status e motivo e monta a linha a gravar. O valor é sempre
// recalculado aqui, nunca lido do corpo. `corpo` já passou por validar().
// Se mais de uma regra falhar, vale a primeira desta ordem:
// pausado > bloqueado > feriado > dia > cedo > lotado > cupom.
export function avaliar(corpo, agoraMs, agenda) {
  const ponto = PONTOS[corpo.ponto];
  const qtd = corpo.itens.reduce((s, i) => s + i.qtd, 0);
  const { unit, total } = precoCentavos(qtd);
  const cupom = corpo.cupom ? cupomDe(corpo.cupom) : null;
  const desconto = cupom ? Math.round(total * cupom.pct) : 0;

  let motivo = null;
  const fixo = !!ponto.dias;
  if (agenda.pausado) motivo = "pausado";
  else if (fixo && agenda.bloqueados.has(corpo.retirada)) motivo = "bloqueado";
  else {
    const sit = fixo ? situacaoData(ponto, corpo.retirada, qtd, agoraMs) : "ok";
    if (sit !== "ok") motivo = sit;
    else if (fixo && (agenda.ocupado.get(corpo.retirada) || 0) + qtd > agenda.limite) motivo = "lotado";
    else if (corpo.cupom && !cupom) motivo = "cupom";
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
      itens: JSON.stringify(corpo.itens),
      qtd,
      unit_centavos: unit,
      total_centavos: total - desconto,
      cupom: cupom ? cupom.codigo : (corpo.cupom ? corpo.cupom.trim().toUpperCase() : null),
      desconto_centavos: desconto,
      ponto: ponto.nome,
      retirada: corpo.retirada,
      janela: fixo ? janelaDe(ponto, diaDaData(corpo.retirada)) : null,
      obs: corpo.obs,
    },
  };
}
