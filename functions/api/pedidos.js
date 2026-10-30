import { validar, avaliar } from "../_lib/pedido.js";
import { lerAgenda } from "../_lib/agenda.js";
import { cupomJaUsado } from "../_lib/uso-cupom.js";

const COLUNAS = ["id_envio", "criado_em", "origem", "status", "motivo", "nome", "telefone", "itens", "qtd",
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

  // Sem data (ponto a combinar) não há ocupação a conferir: faixa vazia, só a config.
  const agenda = await lerAgenda(env.DB, corpo.retirada || "0000-00-00", corpo.retirada || "0000-00-00");

  // Telefone que já gastou o cupom: o pedido entra, mas fora da regra, e o
  // dono conversa. O site já avisa antes; isto pega quem passou por cima.
  const usado = corpo.cupom ? await cupomJaUsado(env.DB, corpo.telefone, corpo.cupom) : false;
  const { linha } = avaliar(corpo, Date.now(), agenda, usado);
  await env.DB.prepare(
    `INSERT INTO pedidos (${COLUNAS.join(",")}) VALUES (${COLUNAS.map(() => "?").join(",")}) ON CONFLICT(id_envio) DO NOTHING`)
    .bind(...COLUNAS.map((k) => linha[k])).run();
  const gravado = await env.DB.prepare("SELECT id, status, total_centavos, criado_em FROM pedidos WHERE id_envio = ?")
    .bind(corpo.id_envio).first();
  // 201 só pra quem de fato gravou; numa corrida o perdedor recebe 200.
  const criou = gravado.criado_em === linha.criado_em;
  return Response.json(publico(gravado), { status: criou ? 201 : 200 });
}
