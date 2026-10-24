import { isoBrasilia } from "../../../public/regras.js";
import { contas, CUSTOS } from "../../_lib/custos.js";
import { resposta } from "../../_lib/painel.js";

// Quanto entrou e quanto sobrou: pedidos confirmados com retirada até hoje,
// somados por dia, por mês e desde o começo.
export async function onRequestGet({ env }) {
  const hoje = isoBrasilia(Date.now());
  const { results } = await env.DB.prepare(
    "SELECT retirada, qtd, total_centavos, pago, pagamento FROM pedidos " +
    "WHERE status = 'confirmado' AND retirada IS NOT NULL AND retirada <= ? ORDER BY retirada DESC").bind(hoje).all();

  const porDia = new Map(), porMes = new Map();
  for (const r of results) {
    if (!porDia.has(r.retirada)) porDia.set(r.retirada, []);
    porDia.get(r.retirada).push(r);
    const mes = r.retirada.slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push(r);
  }
  return resposta({
    hoje,
    custos: CUSTOS,
    total: contas(results),
    meses: [...porMes].map(([mes, lista]) => ({ mes, ...contas(lista) })),
    dias: [...porDia].map(([dia, lista]) => ({ dia, ...contas(lista) })),
  });
}
