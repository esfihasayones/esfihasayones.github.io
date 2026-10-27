import { isoBrasilia, MAX_DIAS_RETIRADA } from "../../../public/regras.js";
import { dataIsoValida } from "../../_lib/pedido.js";
import { serializar, erro, resposta } from "../../_lib/painel.js";

const DIA_MS = 86400000;
const somaDias = (dia, n) => new Date(Date.parse(dia + "T12:00:00Z") + n * DIA_MS).toISOString().slice(0, 10);
// Confirmado não entregue de até duas semanas atrás continua na fila, como
// atrasado: provavelmente foi entregue e ninguém marcou. Mais velho que isso
// fica só no histórico.
const ATRASO_DIAS = 14;

// A fila da tela de pedidos: tudo o que falta entregar, do mais atrasado ao
// mais longe. `dia` faz as vezes de hoje (os testes usam dias de 2031 em diante).
export async function onRequestGet({ request, env }) {
  const pedido = new URL(request.url).searchParams.get("dia");
  const dia = pedido == null ? isoBrasilia(Date.now()) : pedido;
  if (!dataIsoValida(dia)) return erro("dia inválido");

  const [fila, pend, sd, entregues] = await env.DB.batch([
    env.DB.prepare(
      "SELECT * FROM pedidos WHERE status = 'confirmado' AND entregue = 0 AND retirada BETWEEN ? AND ? ORDER BY retirada, id")
      .bind(somaDias(dia, -ATRASO_DIAS), somaDias(dia, MAX_DIAS_RETIRADA + 1)),
    // Toda pendência, mesmo com data passada: sumir em silêncio deixava o
    // cliente sem resposta.
    env.DB.prepare("SELECT * FROM pedidos WHERE status IN ('aguardando','fora_da_regra') ORDER BY retirada IS NULL, retirada, id"),
    env.DB.prepare("SELECT * FROM pedidos WHERE status = 'confirmado' AND retirada IS NULL AND entregue = 0 ORDER BY id"),
    // Entregues do dia, e os de antes que ficaram sem pagar.
    env.DB.prepare(
      "SELECT * FROM pedidos WHERE status = 'confirmado' AND entregue = 1 AND (retirada = ? OR (pago = 0 AND retirada BETWEEN ? AND ?)) ORDER BY retirada DESC, id")
      .bind(dia, somaDias(dia, -ATRASO_DIAS), dia),
  ]);
  return resposta({
    dia,
    fila: fila.results.map(serializar),
    pendencias: pend.results.map(serializar),
    semData: sd.results.map(serializar),
    entregues: entregues.results.map(serializar),
  });
}
