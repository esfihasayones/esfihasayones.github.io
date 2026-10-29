import { sortear, MAX_CARTOES, MAX_POR_LOTE } from "../../_lib/cartoes.js";
import { erro, resposta, lerJson } from "../../_lib/painel.js";

// Resumo por lote, ou os códigos de um lote (?lote=N) pra imprimir.
export async function onRequestGet({ request, env }) {
  const lote = new URL(request.url).searchParams.get("lote");
  if (lote != null) {
    if (!/^\d+$/.test(lote)) return erro("lote inválido");
    const { results } = await env.DB.prepare("SELECT codigo, trocado_em, pedido_id FROM cartoes WHERE lote = ? ORDER BY id").bind(Number(lote)).all();
    if (!results.length) return erro("lote não encontrado", 404);
    return resposta({ lote: Number(lote), cartoes: results.map((r) => ({ codigo: r.codigo, trocado: !!r.trocado_em, pedido_id: r.pedido_id })) });
  }
  const { results } = await env.DB.prepare(
    "SELECT lote, MIN(criado_em) AS criado_em, COUNT(*) AS n, COUNT(pedido_id) AS entregues, COUNT(trocado_em) AS trocados " +
    "FROM cartoes GROUP BY lote ORDER BY lote DESC").all();
  const soma = (k) => results.reduce((s, r) => s + r[k], 0);
  return resposta({ gerados: soma("n"), entregues: soma("entregues"), trocados: soma("trocados"), livres: soma("n") - soma("entregues"), lotes: results });
}

// Gera um lote novo de `quantidade` cartões.
export async function onRequestPost({ request, env }) {
  const c = await lerJson(request);
  const n = c && c.quantidade;
  if (!Number.isInteger(n) || n < 1 || n > MAX_POR_LOTE) return erro(`quantidade precisa ser de 1 a ${MAX_POR_LOTE}`);
  const { results } = await env.DB.prepare("SELECT codigo FROM cartoes").all();
  if (results.length + n > MAX_CARTOES) {
    return erro(`Passaria de ${MAX_CARTOES} cartões, e aí ficaria fácil inventar um código que vale.`);
  }
  const ult = await env.DB.prepare("SELECT COALESCE(MAX(lote), 0) AS l FROM cartoes").first();
  const lote = ult.l + 1;
  const agora = new Date().toISOString();
  const codigos = sortear(n, new Set(results.map((r) => r.codigo)));
  await env.DB.batch(codigos.map((cod) =>
    env.DB.prepare("INSERT INTO cartoes (codigo, lote, criado_em) VALUES (?, ?, ?)").bind(cod, lote, agora)));
  return resposta({ lote, cartoes: codigos.map((codigo) => ({ codigo, trocado: false })) }, 201);
}
