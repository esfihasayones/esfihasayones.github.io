import { normalizar, CARTOES_POR_TROCA } from "../../../_lib/cartoes.js";
import { erro, resposta, lerJson } from "../../../_lib/painel.js";

// Confere os códigos e diz a situação de cada um: ok, inexistente,
// sem_pedido (impresso mas nunca entregue com um pedido), trocado (com a
// data) ou repetido (o mesmo código duas vezes na troca).
async function conferir(db, codigos) {
  const { results } = await db.prepare(
    "SELECT c.codigo, c.trocado_em, c.pedido_id, p.nome FROM cartoes c LEFT JOIN pedidos p ON p.id = c.pedido_id " +
    `WHERE c.codigo IN (${codigos.map(() => "?").join(", ")})`).bind(...codigos).all();
  const achados = new Map(results.map((r) => [r.codigo, r]));
  const vistos = new Set();
  return codigos.map((codigo) => {
    const r = achados.get(codigo);
    const repetido = vistos.has(codigo);
    vistos.add(codigo);
    if (!r) return { codigo, situacao: "inexistente" };
    const pedido = r.pedido_id ? { id: r.pedido_id, nome: r.nome } : null;
    if (r.trocado_em) return { codigo, situacao: "trocado", trocado_em: r.trocado_em, pedido };
    if (repetido) return { codigo, situacao: "repetido", pedido };
    if (!pedido) return { codigo, situacao: "sem_pedido" };
    return { codigo, situacao: "ok", pedido };
  });
}

function lerCodigos(c) {
  if (!c || !Array.isArray(c.codigos) || c.codigos.length !== CARTOES_POR_TROCA) return null;
  const codigos = c.codigos.map(normalizar);
  return codigos.every((x) => x.length > 0 && x.length <= 10) ? codigos : null;
}

// Troca os cinco de uma vez, ou nenhum: se algum não vale, nada é marcado.
export async function onRequestPost({ request, env }) {
  const c = await lerJson(request);
  const codigos = lerCodigos(c);
  if (!codigos) return erro(`mande ${CARTOES_POR_TROCA} códigos`);

  const cartoes = await conferir(env.DB, codigos);
  if (cartoes.some((x) => x.situacao !== "ok")) return resposta({ erro: "Algum cartão não vale.", cartoes }, 409);

  // A contagem dentro do UPDATE garante que, se outro aparelho trocou um
  // deles no meio tempo, nenhum é marcado.
  const agora = new Date().toISOString();
  const marcas = codigos.map(() => "?").join(", ");
  const r = await env.DB.prepare(
    `UPDATE cartoes SET trocado_em = ? WHERE trocado_em IS NULL AND pedido_id IS NOT NULL AND codigo IN (${marcas}) ` +
    `AND (SELECT COUNT(*) FROM cartoes WHERE trocado_em IS NULL AND pedido_id IS NOT NULL AND codigo IN (${marcas})) = ?`)
    .bind(agora, ...codigos, ...codigos, CARTOES_POR_TROCA).run();
  if (r.meta.changes !== CARTOES_POR_TROCA) {
    return resposta({ erro: "Algum cartão não vale.", cartoes: await conferir(env.DB, codigos) }, 409);
  }
  return resposta({ trocado_em: agora, cartoes: cartoes.map((x) => ({ ...x, situacao: "trocado", trocado_em: agora })) });
}

// Desfaz uma troca feita por engano: só os códigos marcados naquele instante.
export async function onRequestDelete({ request, env }) {
  const c = await lerJson(request);
  const codigos = lerCodigos(c);
  if (!codigos || typeof c.trocado_em !== "string") return erro("troca inválida");
  const r = await env.DB.prepare(
    `UPDATE cartoes SET trocado_em = NULL WHERE trocado_em = ? AND codigo IN (${codigos.map(() => "?").join(", ")})`)
    .bind(c.trocado_em, ...codigos).run();
  return resposta({ desfeitos: r.meta.changes });
}
