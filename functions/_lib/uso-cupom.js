import { cupomDe, SO_PRIMEIRA_COMPRA } from "./cupons.js";

// Pedidos que contam como uso: o que está esperando resposta e o aceito.
// Cancelado e fora da regra não gastam o cupom.
const CONTAM = "status IN ('aguardando','confirmado')";

// Diz se este telefone já gastou o cupom. Cupom de primeira compra vale só
// pra quem nunca pediu (com ou sem cupom); os outros, uma vez por telefone.
// `ignorarId` deixa de fora o próprio pedido numa edição.
export async function cupomJaUsado(db, telefone, codigo, ignorarId) {
  const c = cupomDe(codigo);
  if (!telefone || !c) return false;
  const primeira = SO_PRIMEIRA_COMPRA.includes(c.codigo) ? 1 : 0;
  const r = await db.prepare(
    `SELECT id FROM pedidos WHERE telefone = ?1 AND ${CONTAM} AND (?2 = 1 OR cupom = ?3) AND id != ?4 LIMIT 1`)
    .bind(telefone, primeira, c.codigo, ignorarId || 0).first();
  return !!r;
}
