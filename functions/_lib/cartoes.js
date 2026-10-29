// Cartões de fidelidade. Cinco cartões trocam por um combo com 4 esfihas.
export const CARTOES_POR_TROCA = 5;
// Pedido com pelo menos isso ganha um cartão.
export const MIN_ESFIHAS_CARTAO = 4;

// Sem 0/O, 1/I/L, 5/S e 8/B, que se confundem lidos no papel.
export const ALFABETO = "ACDEFGHJKMNPQRTUVWXY234679";
export const TAMANHO = 3;
// 26³ = 17576 combinações. Com no máximo 2000 cartões no banco, um código
// inventado acerta um de verdade menos de 1 vez em 10.
export const MAX_CARTOES = 2000;
export const MAX_POR_LOTE = 400;

// O que a pessoa digitou, do jeito que fica no banco: maiúscula, sem espaço,
// traço ou "Nº".
export const normalizar = (c) => String(c == null ? "" : c).toUpperCase().replace(/N[º°]/g, "").replace(/[^A-Z0-9]/g, "");

// `n` códigos novos, sem repetir entre si nem com `existentes` (Set).
export function sortear(n, existentes, aleatorio = (max) => crypto.getRandomValues(new Uint32Array(1))[0] % max) {
  const novos = [];
  const usados = new Set(existentes);
  while (novos.length < n) {
    let c = "";
    for (let i = 0; i < TAMANHO; i++) c += ALFABETO[aleatorio(ALFABETO.length)];
    if (usados.has(c)) continue;
    usados.add(c);
    novos.push(c);
  }
  return novos;
}

// Pedido confirmado de 4 ou mais fica com o primeiro cartão livre (menor id,
// que é a ordem de impressão); cancelado, ou abaixo de 4, devolve o cartão
// que ainda não foi trocado. Rodar de novo não muda nada.
export async function sincronizarCartao(db, pedidoId) {
  const p = await db.prepare("SELECT status, qtd FROM pedidos WHERE id = ?").bind(pedidoId).first();
  if (!p) return;
  if (p.status === "confirmado" && p.qtd >= MIN_ESFIHAS_CARTAO) {
    // `pedido_id IS NULL` no WHERE de fora: dois pedidos aceitos juntos não
    // ficam com o mesmo cartão.
    await db.prepare(
      "UPDATE cartoes SET pedido_id = ?1 WHERE pedido_id IS NULL AND trocado_em IS NULL " +
      "AND id = (SELECT MIN(id) FROM cartoes WHERE pedido_id IS NULL AND trocado_em IS NULL) " +
      "AND NOT EXISTS (SELECT 1 FROM cartoes WHERE pedido_id = ?1)").bind(pedidoId).run();
  } else {
    await db.prepare("UPDATE cartoes SET pedido_id = NULL WHERE pedido_id = ? AND trocado_em IS NULL").bind(pedidoId).run();
  }
}
