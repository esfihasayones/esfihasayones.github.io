import { SABORES } from "../../public/regras.js";
import { cupomDe } from "./cupons.js";
import { validarItens, precificar, dataIsoValida, texto, limpar } from "./pedido.js";

export const STATUS = ["aguardando", "confirmado", "cancelado", "fora_da_regra"];

export const resposta = (corpo, status) => Response.json(corpo, { status: status || 200 });
export const erro = (msg, status) => resposta({ erro: msg }, status || 400);

export async function lerJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

// Montadas por sabor, nunca acima do que o pedido tem (o pedido pode ter
// diminuído depois de editar) e só dos sabores que ele tem.
function montadasDe(r, itens) {
  let m = {};
  try { m = JSON.parse(r.montadas || "{}") || {}; } catch (e) { /* coluna estragada vale zero */ }
  return Object.fromEntries(itens.map((i) => [i.sabor, Math.max(0, Math.min(i.qtd, Number(m[i.sabor]) || 0))]));
}

// Pedido como o painel vê.
export function serializar(r) {
  const itens = JSON.parse(r.itens);
  return {
    id: r.id, status: r.status, motivo: r.motivo, origem: r.origem, nome: r.nome,
    itens, montadas: montadasDe(r, itens), qtd: r.qtd, total_centavos: r.total_centavos,
    cupom: r.cupom, desconto_centavos: r.desconto_centavos, valor_manual: !!r.valor_manual,
    ponto: r.ponto, retirada: r.retirada, janela: r.janela, obs: r.obs,
    pago: !!r.pago, pagamento: r.pagamento || null, entregue: !!r.entregue,
  };
}

export const vazioSabores = () => Object.fromEntries(SABORES.map((s) => [s.id, 0]));

// Campos que o painel aceita, com a mesma limitação do POST público.
// Devolve {erro} ou {campos}, só com o que veio no corpo.
// O que não está na lista é ignorado.
export function validarCampos(bruto) {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return { erro: "corpo inválido" };
  const c = { ...bruto };
  for (const k of ["nome", "ponto", "janela", "cupom"]) if (k in c) c[k] = limpar(c[k]);
  if ("obs" in c) c.obs = limpar(c.obs, true);
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
  if ("pagamento" in c) {
    if (c.pagamento !== null && !["pix", "debito", "credito"].includes(c.pagamento)) return { erro: "pagamento inválido" };
    f.pagamento = c.pagamento;
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
    if (f.cupom && !cupomDe(f.cupom)) return { erro: "cupom inexistente" };
  }
  if ("total_centavos" in c) {
    if (!Number.isInteger(c.total_centavos) || c.total_centavos < 0 || c.total_centavos > 10000000) return { erro: "total inválido" };
    f.total_centavos = c.total_centavos;
  }
  if ("valor_manual" in c) {
    if (typeof c.valor_manual !== "boolean") return { erro: "valor_manual inválido" };
    if (c.valor_manual && !("total_centavos" in c)) return { erro: "valor_manual exige total_centavos" };
    if (!c.valor_manual && "total_centavos" in c) return { erro: "total_centavos só com valor_manual" };
    f.valor_manual = c.valor_manual;
  }
  return { campos: f };
}

// Colunas em que a linha montada difere da gravada (booleano e 0/1 contam
// como iguais). O UPDATE só toca nessas.
export function mudancas(atual, l, colunas) {
  const igual = (a, b) => a === b || (a == null && b == null) || Number(a) === Number(b) && typeof a !== "string" && typeof b !== "string";
  return colunas.filter((k) => !igual(atual[k], l[k]));
}

// Aplica `campos` sobre a linha `base` (ou uma linha vazia) e refaz o preço
// pela mesma conta do pedido do site. Com valor manual o total não se mexe.
export function montar(base, campos) {
  const l = { ...base, ...campos };
  delete l.itens;
  const itens = campos.itens || JSON.parse(base.itens);
  l.itens = JSON.stringify(itens);
  const manual = "total_centavos" in campos ? true : ("valor_manual" in campos ? campos.valor_manual : !!base.valor_manual);
  l.valor_manual = manual ? 1 : 0;
  // Só refaz a conta quando o pedido é novo ou a edição mexe no que entra nela
  // (itens, cupom, voltar pro valor calculado). Marcar pago, mudar status ou
  // corrigir o nome mantém o total que já estava gravado.
  const refazer = !base.id || "itens" in campos || "cupom" in campos || campos.valor_manual === false;
  if (refazer) {
    const p = precificar(itens, "cupom" in campos ? campos.cupom : base.cupom);
    l.qtd = p.qtd;
    l.unit_centavos = p.unit_centavos;
    l.cupom = p.cupom;
    if (manual) {
      if ("total_centavos" in campos) { l.total_centavos = campos.total_centavos; l.desconto_centavos = 0; }
    } else {
      l.total_centavos = p.total_centavos;
      l.desconto_centavos = p.desconto_centavos;
    }
  } else if ("total_centavos" in campos) {
    l.total_centavos = campos.total_centavos;
    l.desconto_centavos = 0;
  }
  if (typeof l.pago === "boolean") l.pago = l.pago ? 1 : 0;
  if (typeof l.entregue === "boolean") l.entregue = l.entregue ? 1 : 0;
  if ((campos.status === "confirmado" || campos.status === "aguardando") && base.status !== campos.status) l.motivo = null;
  return l;
}
