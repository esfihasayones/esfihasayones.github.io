import { lerAgenda } from "../../_lib/agenda.js";
import { dataIsoValida, texto } from "../../_lib/pedido.js";
import { erro, resposta, lerJson } from "../../_lib/painel.js";

async function ler(db) {
  const a = await lerAgenda(db);
  const bl = await db.prepare("SELECT dia, motivo FROM bloqueios ORDER BY dia").all();
  return { limite: a.limite, pausado: a.pausado, bloqueios: bl.results.map((b) => ({ dia: b.dia, motivo: b.motivo })) };
}

export async function onRequestGet({ env }) {
  return resposta(await ler(env.DB));
}

export async function onRequestPut({ request, env }) {
  const c = await lerJson(request);
  if (!c || typeof c !== "object" || Array.isArray(c)) return erro("corpo inválido");
  if ("limite" in c && (!Number.isInteger(c.limite) || c.limite < 1 || c.limite > 10000)) return erro("limite inválido");
  if ("pausado" in c && typeof c.pausado !== "boolean") return erro("pausado inválido");
  let bloqueios = null;
  if ("bloqueios" in c) {
    if (!Array.isArray(c.bloqueios) || c.bloqueios.length > 400) return erro("bloqueios inválidos");
    const vistos = new Set();
    bloqueios = [];
    for (const b of c.bloqueios) {
      if (!b || typeof b !== "object" || !dataIsoValida(b.dia)) return erro("dia de bloqueio inválido");
      if (b.motivo != null && !texto(b.motivo, 100)) return erro("motivo inválido");
      if (vistos.has(b.dia)) continue;
      vistos.add(b.dia);
      bloqueios.push([b.dia, b.motivo || null]);
    }
  }

  const grava = (chave, valor) => env.DB.prepare(
    "INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").bind(chave, valor);
  const lote = [];
  if ("limite" in c) lote.push(grava("limite_dia", String(c.limite)));
  if ("pausado" in c) lote.push(grava("pausado", c.pausado ? "1" : "0"));
  if (bloqueios) {
    lote.push(env.DB.prepare("DELETE FROM bloqueios"));   // a lista enviada substitui a anterior
    for (const [dia, motivo] of bloqueios) lote.push(env.DB.prepare("INSERT INTO bloqueios (dia, motivo) VALUES (?, ?)").bind(dia, motivo));
  }
  if (lote.length) await env.DB.batch(lote);
  return resposta(await ler(env.DB));
}
