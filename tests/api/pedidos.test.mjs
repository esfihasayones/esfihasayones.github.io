import test, { before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pedir } from "./ajuda.mjs";
import { zerar, contar, wrangler } from "./zerar.mjs";
import { PONTOS, situacaoData, proximaData, isoBrasilia } from "../../public/regras.js";
import { avaliar } from "../../functions/_lib/pedido.js";
import { cupomDe } from "../../functions/_lib/cupons.js";

before(() => zerar());

const ITA = 1;
// Cada teste usa uma data própria dentro da capacidade de 80 por dia.
const dataValida = () => proximaData(PONTOS[ITA], 12, Date.now());
function corpo(extra) {
  return { id_envio: randomUUID(), nome: "Maria", itens: [{ sabor: "calabresa", qtd: 12 }], ponto: ITA, retirada: dataValida(), ...extra };
}
const enviar = (c) => pedir("/api/pedidos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) });

test("grava pedido válido e recalcula valor", async () => {
  const r = await enviar(corpo({ total_centavos: 1 }));
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.equal(j.total_centavos, 6240);
  assert.equal(j.status, "aguardando");
  assert.deepEqual(Object.keys(j).sort(), ["id", "status", "total_centavos"]);
});

test("cupom soma com o combo", async () => {
  const j = await (await enviar(corpo({ cupom: "primeiracompra" }))).json();
  assert.equal(j.total_centavos, 5616);
  assert.equal(j.status, "aguardando");
});

test("cupom inexistente vira fora_da_regra", async () => {
  const c = corpo({ cupom: "NAOEXISTE" });
  const r = await enviar(c);
  const j = await r.json();
  assert.equal(j.status, "fora_da_regra");
  assert.equal(j.total_centavos, 6240);
  const m = JSON.parse(wrangler(`SELECT motivo FROM pedidos WHERE id = ${j.id}`, true));
  assert.equal(m[0].results[0].motivo, "cupom");
});

test("data cedo pelo relógio do servidor vira fora_da_regra", async (t) => {
  // Procura nos próximos dias uma data que o servidor veja como "cedo".
  const agora = Date.now();
  let achada = null;
  for (let i = 0; i < 4 && !achada; i++) {
    const d = isoBrasilia(agora + i * 86400000);
    for (const p of [ITA, 0]) if (!achada && situacaoData(PONTOS[p], d, 12, agora) === "cedo") achada = { p, d };
  }
  if (!achada) return t.skip("nenhuma data \"cedo\" nos próximos 4 dias neste horário");
  const r = await enviar(corpo({ ponto: achada.p, retirada: achada.d }));
  const j = await r.json();
  assert.equal(j.status, "fora_da_regra");
  const m = JSON.parse(wrangler(`SELECT motivo FROM pedidos WHERE id = ${j.id}`, true));
  assert.equal(m[0].results[0].motivo, "cedo");
});

test("mesmo id_envio grava uma vez só", async () => {
  const c = corpo();
  const a = await enviar(c);
  const b = await enviar(c);
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal((await a.json()).id, (await b.json()).id);
  assert.equal(contar(c.id_envio), 1);
});

test("corpo inválido dá 400", async () => {
  for (const ruim of [
    corpo({ itens: [{ sabor: "pizza", qtd: 12 }] }),
    corpo({ nome: "" }),
    corpo({ itens: [{ sabor: "carne", qtd: 0 }] }),
  ]) {
    const r = await enviar(ruim);
    assert.equal(r.status, 400);
    assert.ok((await r.json()).erro);
  }
});

test("nome com acento e emoji volta intacto", async () => {
  const c = corpo({ nome: "Joaquim 🥟 Ávila" });
  const j = await (await enviar(c)).json();
  const q = JSON.parse(wrangler(`SELECT nome FROM pedidos WHERE id = ${j.id}`, true));
  assert.equal(q[0].results[0].nome, "Joaquim 🥟 Ávila");
});

test("pedido do site com mais de 200 esfihas dá 400", async () => {
  const grande = await enviar(corpo({ itens: [{ sabor: "carne", qtd: 150 }, { sabor: "queijo", qtd: 51 }] }));
  assert.equal(grande.status, 400);
  assert.equal((await grande.json()).erro, "pedido grande demais");
  const limite = await enviar(corpo({ itens: [{ sabor: "carne", qtd: 150 }, { sabor: "queijo", qtd: 50 }] }));
  assert.equal(limite.status, 201);
});

test("avaliar: lotado, bloqueado e pausado (função pura)", () => {
  const agora = Date.now();
  const retirada = proximaData(PONTOS[ITA], 12, agora);
  const c = { id_envio: "x", nome: "A", itens: [{ sabor: "carne", qtd: 12 }], ponto: ITA, retirada, cupom: null, obs: null };
  const base = { limite: 80, pausado: false, bloqueados: new Set(), ocupado: new Map() };
  assert.equal(avaliar(c, agora, base).status, "aguardando");
  assert.equal(avaliar(c, agora, { ...base, ocupado: new Map([[retirada, 69]]) }).motivo, "lotado");
  assert.equal(avaliar(c, agora, { ...base, ocupado: new Map([[retirada, 68]]) }).motivo, null);
  assert.equal(avaliar(c, agora, { ...base, bloqueados: new Set([retirada]) }).motivo, "bloqueado");
  assert.equal(avaliar(c, agora, { ...base, pausado: true, bloqueados: new Set([retirada]) }).motivo, "pausado");
});

test("cupomDe normaliza", () => {
  assert.deepEqual(cupomDe("  primeiracompra "), { codigo: "PRIMEIRACOMPRA", pct: 0.1 });
  assert.equal(cupomDe("toString"), null);
});
