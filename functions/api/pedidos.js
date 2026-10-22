import { validar, avaliar } from "../_lib/pedido.js";

const COLUNAS = ["id_envio", "criado_em", "origem", "status", "motivo", "nome", "itens", "qtd",
  "unit_centavos", "total_centavos", "cupom", "desconto_centavos", "ponto", "retirada", "janela", "obs"];

// Só o que o próprio cliente precisa saber; nada de outros pedidos.
const publico = (r) => ({ id: r.id, status: r.status, total_centavos: r.total_centavos });

export async function onRequestPost({ request, env }) {
  let bruto;
  try { bruto = await request.json(); } catch (e) { return Response.json({ erro: "JSON inválido" }, { status: 400 }); }
  const v = validar(bruto);
  if (v.erro) return Response.json({ erro: v.erro }, { status: 400 });
  const corpo = v.corpo;

  const existente = await env.DB.prepare("SELECT id, status, total_centavos FROM pedidos WHERE id_envio = ?")
    .bind(corpo.id_envio).first();
  if (existente) return Response.json(publico(existente), { status: 200 });

  const cfg = await env.DB.prepare("SELECT chave, valor FROM config").all();
  const c = Object.fromEntries(cfg.results.map((r) => [r.chave, r.valor]));
  const bl = await env.DB.prepare("SELECT dia FROM bloqueios").all();
  const oc = await env.DB.prepare(
    "SELECT retirada, SUM(qtd) AS q FROM pedidos WHERE status IN ('aguardando','confirmado') AND retirada IS NOT NULL GROUP BY retirada").all();
  const agenda = {
    limite: parseInt(c.limite_dia, 10) || 80,
    pausado: c.pausado === "1",
    bloqueados: new Set(bl.results.map((r) => r.dia)),
    ocupado: new Map(oc.results.map((r) => [r.retirada, r.q])),
  };

  const { linha } = avaliar(corpo, Date.now(), agenda);
  await env.DB.prepare(
    `INSERT INTO pedidos (${COLUNAS.join(",")}) VALUES (${COLUNAS.map(() => "?").join(",")}) ON CONFLICT(id_envio) DO NOTHING`)
    .bind(...COLUNAS.map((k) => linha[k])).run();
  const gravado = await env.DB.prepare("SELECT id, status, total_centavos, criado_em FROM pedidos WHERE id_envio = ?")
    .bind(corpo.id_envio).first();
  // 201 só pra quem de fato gravou; numa corrida o perdedor recebe 200.
  const criou = gravado.criado_em === linha.criado_em;
  return Response.json(publico(gravado), { status: criou ? 201 : 200 });
}
