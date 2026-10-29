import { isoBrasilia, MAX_DIAS_RETIRADA } from "../../../public/regras.js";
import { dataIsoValida } from "../../_lib/pedido.js";
import { serializar, erro, resposta, COLUNAS_PEDIDO } from "../../_lib/painel.js";

const DIA_MS = 86400000;
const somaDias = (dia, n) => new Date(Date.parse(dia + "T12:00:00Z") + n * DIA_MS).toISOString().slice(0, 10);
// Confirmado não entregue de até duas semanas atrás continua na fila, como
// atrasado: provavelmente foi entregue e ninguém marcou. Mais velho que isso
// fica só no histórico.
const ATRASO_DIAS = 14;

// "Ana  Souza" e "ana souza" são o mesmo nome; acento também não conta.
const nomeChave = (n) => String(n || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

// O site não sabe quem já comprou. Pedido com cupom de um nome que já tem
// pedido antes (aguardando ou confirmado) ganha cupom_repetido, e o painel
// avisa pra conferir no WhatsApp. Nome igual não prova nada, só chama atenção.
function marcarCupomRepetido(listas, anteriores) {
  const primeiro = new Map();
  for (const r of anteriores) {
    const k = nomeChave(r.nome);
    if (!primeiro.has(k) || r.id < primeiro.get(k)) primeiro.set(k, r.id);
  }
  for (const lista of listas) for (const p of lista) {
    if (p.cupom) p.cupom_repetido = primeiro.get(nomeChave(p.nome)) < p.id;
  }
}

// A fila da tela de pedidos: tudo o que falta entregar, do mais atrasado ao
// mais longe. `dia` faz as vezes de hoje (os testes usam dias de 2031 em diante).
export async function onRequestGet({ request, env }) {
  const pedido = new URL(request.url).searchParams.get("dia");
  const dia = pedido == null ? isoBrasilia(Date.now()) : pedido;
  if (!dataIsoValida(dia)) return erro("dia inválido");

  const [fila, pend, sd, entregues, nomes] = await env.DB.batch([
    env.DB.prepare(
      "SELECT " + COLUNAS_PEDIDO + " FROM pedidos WHERE status = 'confirmado' AND entregue = 0 AND retirada BETWEEN ? AND ? ORDER BY retirada, id")
      .bind(somaDias(dia, -ATRASO_DIAS), somaDias(dia, MAX_DIAS_RETIRADA + 1)),
    // Toda pendência, mesmo com data passada: sumir em silêncio deixava o
    // cliente sem resposta.
    env.DB.prepare("SELECT " + COLUNAS_PEDIDO + " FROM pedidos WHERE status IN ('aguardando','fora_da_regra') ORDER BY retirada IS NULL, retirada, id"),
    env.DB.prepare("SELECT " + COLUNAS_PEDIDO + " FROM pedidos WHERE status = 'confirmado' AND retirada IS NULL AND entregue = 0 ORDER BY id"),
    // Entregues do dia e dos dias que ainda vêm (entregue adiantado, ou
    // marcado sem querer, não pode sumir), e os de antes que ficaram sem pagar.
    env.DB.prepare(
      "SELECT " + COLUNAS_PEDIDO + " FROM pedidos WHERE status = 'confirmado' AND entregue = 1 AND (retirada BETWEEN ? AND ? OR (pago = 0 AND retirada BETWEEN ? AND ?)) ORDER BY retirada DESC, id")
      .bind(dia, somaDias(dia, MAX_DIAS_RETIRADA + 1), somaDias(dia, -ATRASO_DIAS), dia),
    env.DB.prepare("SELECT id, nome FROM pedidos WHERE status IN ('aguardando','confirmado')"),
  ]);
  const corpo = {
    dia,
    fila: fila.results.map(serializar),
    pendencias: pend.results.map(serializar),
    semData: sd.results.map(serializar),
    entregues: entregues.results.map(serializar),
  };
  marcarCupomRepetido([corpo.fila, corpo.pendencias, corpo.semData, corpo.entregues], nomes.results);
  return resposta(corpo);
}
