import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pedir } from "./ajuda.mjs";
import { zerar, wrangler } from "./zerar.mjs";
import { PONTOS, proximaData, isoBrasilia } from "../../public/regras.js";

before(() => zerar());
after(() => zerar());

const ITA = 1;
// 41 esfihas pedem 72h; uma data boa pra isso serve pra qualquer pedido menor.
const DIA = () => proximaData(PONTOS[ITA], 41, Date.now());
const corpo = (qtd, retirada) => ({
  id_envio: randomUUID(), nome: "Maria Sigilosa", itens: [{ sabor: "calabresa", qtd }], ponto: ITA, retirada,
});
const enviar = (c) => pedir("/api/pedidos", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c),
});
const agenda = async () => (await pedir("/api/agenda")).json();

const confirmar = async (id) => assert.equal((await pedir("/api/painel/pedidos/" + id, {
  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "confirmado" }),
})).status, 200);

test("pedido aguardando não ocupa vaga: só o confirmado conta", async () => {
  zerar();
  const d = DIA();
  const a = await (await enviar(corpo(40, d))).json();
  const b = await (await enviar(corpo(40, d))).json();
  assert.equal((await (await enviar(corpo(40, d))).json()).status, "aguardando");   // 120 aguardando e ainda cabe
  assert.equal((await agenda()).indisponiveis[d], undefined);
  await confirmar(a.id);
  await confirmar(b.id);
  assert.equal((await agenda()).indisponiveis[d], "lotado");   // 80 confirmados
  assert.equal((await (await enviar(corpo(1, d))).json()).status, "fora_da_regra");
});

test("dia passa de 80 e o próximo pedido vira lotado", async () => {
  zerar();
  const d = DIA();
  const a = await (await enviar(corpo(40, d))).json();
  const b = await (await enviar(corpo(40, d))).json();
  await confirmar(a.id);
  await confirmar(b.id);   // 80 exatos cabem
  const j = await (await enviar(corpo(1, d))).json();
  assert.equal(j.status, "fora_da_regra");
  const m = JSON.parse(wrangler(`SELECT motivo FROM pedidos WHERE id = ${j.id}`, true));
  assert.equal(m[0].results[0].motivo, "lotado");
});

test("agenda mostra o dia lotado sem expor pedidos", async () => {
  const d = DIA();
  const r = await pedir("/api/agenda");
  assert.equal(r.status, 200);
  const texto = await r.text();
  const j = JSON.parse(texto);
  assert.equal(j.pausado, false);
  assert.equal(j.indisponiveis[d], "lotado");
  assert.deepEqual(Object.keys(j).sort(), ["indisponiveis", "pausado"]);
  assert.ok(!texto.includes("Maria") && !texto.includes("qtd"), "vazou dado de pedido");
  assert.ok(Object.values(j.indisponiveis).every((v) => v === "lotado" || v === "bloqueado"));
});

test("dia com folga continua aberto na agenda", async () => {
  zerar();
  const d = DIA();
  await confirmar((await (await enviar(corpo(40, d))).json()).id);
  assert.equal((await agenda()).indisponiveis[d], undefined);
});

test("bloqueio e pausa aparecem na agenda", async () => {
  zerar();
  const d = DIA();
  wrangler(`INSERT INTO bloqueios (dia, motivo) VALUES ('${d}', 'folga')`);
  wrangler("UPDATE config SET valor = '1' WHERE chave = 'pausado'");
  const j = await agenda();
  assert.equal(j.pausado, true);
  assert.equal(j.indisponiveis[d], "bloqueado");
  assert.ok(!JSON.stringify(j).includes("folga"), "o motivo do bloqueio é do dono");
  zerar();
  const k = await agenda();
  assert.equal(k.pausado, false);
  assert.deepEqual(k.indisponiveis, {});
});

test("bloqueio fora dos próximos 30 dias não aparece", async () => {
  zerar();
  const longe = isoBrasilia(Date.now() + 45 * 86400000);
  wrangler(`INSERT INTO bloqueios (dia, motivo) VALUES ('${longe}', 'viagem')`);
  assert.deepEqual((await agenda()).indisponiveis, {});
});
