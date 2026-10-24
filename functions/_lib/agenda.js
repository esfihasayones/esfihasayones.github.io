// Lê do banco o que decide se um dia aceita pedido. É a única consulta de
// agenda: o POST /api/pedidos e o GET /api/agenda usam esta mesma.
// `deDia` e `ateDia` ("AAAA-MM-DD", inclusivos) limitam bloqueios e ocupação;
// sem eles, vale tudo. A ocupação conta pedido confirmado e pedido do site
// que ainda espera o dono (24/10/2026: o dono quer que o site recuse sozinho
// o que passa do limite, sem empilhar pendência pra ele decidir). Cancelar
// devolve a vaga. `exceto` tira um pedido da conta: ao confirmar um pedido
// que já estava aguardando, ele não pode contar duas vezes.
export async function lerAgenda(db, deDia, ateDia, exceto) {
  const faixa = (coluna) => (deDia && ateDia ? ` AND ${coluna} BETWEEN ? AND ?` : "");
  const args = deDia && ateDia ? [deDia, ateDia] : [];

  const cfg = await db.prepare("SELECT chave, valor FROM config").all();
  const c = Object.fromEntries(cfg.results.map((r) => [r.chave, r.valor]));
  const bl = await db.prepare(`SELECT dia FROM bloqueios WHERE 1 = 1${faixa("dia")}`).bind(...args).all();
  const semEle = exceto ? " AND id != ?" : "";
  const oc = await db.prepare(
    "SELECT retirada, SUM(qtd) AS q FROM pedidos WHERE status IN ('confirmado', 'aguardando') " +
    `AND retirada IS NOT NULL${faixa("retirada")}${semEle} GROUP BY retirada`)
    .bind(...args, ...(exceto ? [exceto] : [])).all();

  return {
    limite: parseInt(c.limite_dia, 10) || 80,
    pausado: c.pausado === "1",
    bloqueados: new Set(bl.results.map((r) => r.dia)),
    ocupado: new Map(oc.results.map((r) => [r.retirada, r.q])),
  };
}
