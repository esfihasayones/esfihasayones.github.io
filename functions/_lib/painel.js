import { SABORES } from "../../public/regras.js";
import { validarItens, precificar, dataIsoValida, texto } from "./pedido.js";

export const STATUS = ["aguardando", "confirmado", "cancelado", "fora_da_regra"];

export const resposta = (corpo, status) => Response.json(corpo, { status: status || 200 });
export const erro = (msg, status) => resposta({ erro: msg }, status || 400);

export async function lerJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

// Pedido como o painel vê.
export function serializar(r) {
  return {
    id: r.id, status: r.status, motivo: r.motivo, origem: r.origem, nome: r.nome,
    itens: JSON.parse(r.itens), qtd: r.qtd, total_centavos: r.total_centavos,
    cupom: r.cupom, desconto_centavos: r.desconto_centavos, valor_manual: !!r.valor_manual,
    ponto: r.ponto, retirada: r.retirada, janela: r.janela, obs: r.obs,
    pago: !!r.pago, entregue: !!r.entregue,
  };
}

export const vazioSabores = () => Object.fromEntries(SABORES.map((s) => [s.id, 0]));

// Campos que o painel aceita, com a mesma limitação do POST público.
// Devolve {erro} ou {campos}, só com o que veio no corpo.
// O que não está na lista é ignorado.
export function validarCampos(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return { erro: "corpo inválido" };
  const f = {};
  if ("status" in c) {
    if (!STATUS.includes(c.status)) return { erro: "status inválido" };
    f.status = c.status;
  }
  for (const k of ["pago", "entregue"]) {
    if (k in c) {
      if (typeof c[k] !== "boolean") return { erro: k + " inválido" };
      f[k] = c[k];
    }
  }
  if ("nome" in c) {
    if (!texto(c.nome, 60, 1)) return { erro: "nome inválido" };
    f.nome = c.nome.trim();
  }
  if ("itens" in c) {
    const v = validarItens(c.itens);
    if (v.erro) return { erro: v.erro };
    f.itens = v.itens;
  }
  if ("ponto" in c) {
    if (!texto(c.ponto, 60, 1)) return { erro: "ponto inválido" };
    f.ponto = c.ponto.trim();
  }
  if ("retirada" in c) {
    if (c.retirada !== null && !dataIsoValida(c.retirada)) return { erro: "retirada inválida" };
    f.retirada = c.retirada;
  }
  if ("janela" in c) {
    if (c.janela !== null && !texto(c.janela, 40)) return { erro: "janela inválida" };
    f.janela = c.janela && c.janela.trim() ? c.janela : null;
  }
  if ("obs" in c) {
    if (c.obs !== null && !texto(c.obs, 500)) return { erro: "observação inválida" };
    f.obs = c.obs || null;
  }
  if ("cupom" in c) {
    if (c.cupom !== null && !texto(c.cupom, 30)) return { erro: "cupom inválido" };
    f.cupom = c.cupom && c.cupom.trim() ? c.cupom : null;
  }
  if ("total_centavos" in c) {
    if (!Number.isInteger(c.total_centavos) || c.total_centavos < 0 || c.total_centavos > 10000000) return { erro: "total inválido" };
    f.total_centavos = c.total_centavos;
  }
  if ("valor_manual" in c) {
    if (typeof c.valor_manual !== "boolean") return { erro: "valor_manual inválido" };
    f.valor_manual = c.valor_manual;
  }
  return { campos: f };
}

// Aplica `campos` sobre a linha `base` (ou uma linha vazia) e refaz o preço
// pela mesma conta do pedido do site. Com valor manual o total não se mexe.
export function montar(base, campos) {
  const l = { ...base, ...campos };
  delete l.itens;
  const itens = campos.itens || JSON.parse(base.itens);
  l.itens = JSON.stringify(itens);
  const manual = "total_centavos" in campos ? true : ("valor_manual" in campos ? campos.valor_manual : !!base.valor_manual);
  const p = precificar(itens, "cupom" in campos ? campos.cupom : base.cupom);
  l.qtd = p.qtd;
  l.unit_centavos = p.unit_centavos;
  l.cupom = p.cupom;
  l.valor_manual = manual ? 1 : 0;
  if (manual) {
    if ("total_centavos" in campos) { l.total_centavos = campos.total_centavos; l.desconto_centavos = 0; }
  } else {
    l.total_centavos = p.total_centavos;
    l.desconto_centavos = p.desconto_centavos;
  }
  if (typeof l.pago === "boolean") l.pago = l.pago ? 1 : 0;
  if (typeof l.entregue === "boolean") l.entregue = l.entregue ? 1 : 0;
  if ((campos.status === "confirmado" || campos.status === "aguardando") && base.status !== campos.status) l.motivo = null;
  return l;
}
