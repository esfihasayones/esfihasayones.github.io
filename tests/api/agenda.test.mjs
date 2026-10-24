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

const agendaPara = async (qtd) => (await pedir("/api/agenda?qtd=" + qtd)).json();
const cancelar = async (id) => assert.equal((await pedir("/api/painel/pedidos/" + id, {
  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "cancelado" }),
})).status, 200);

test("pedido aguardando já ocupa vaga: o terceiro de 40 não entra", async () => {
  zerar();
  const d = DIA();
  const a = await (await enviar(corpo(40, d))).json();
  const b = await (await enviar(corpo(40, d))).json();
  assert.equal(a.status, "aguardando");
  assert.equal(b.status, "aguardando");
  assert.equal((await agenda()).indisponiveis[d], "lotado");   // 80 aguardando, limite 80
  const c = await (await enviar(corpo(40, d))).json();
  assert.equal(c.status, "fora_da_regra");
  const m = JSON.parse(wrangler(`SELECT motivo FROM pedidos WHERE id = ${c.id}`, true));
  assert.equal(m[0].results[0].motivo, "lotado");
});

test("confirmar um pedido que já ocupava a vaga não conta ele duas vezes", async () => {
  zerar();
  const d = DIA();
  const a = await (await enviar(corpo(40, d))).json();
  const b = await (await enviar(corpo(40, d))).json();
  await confirmar(a.id);   // 80 com ele mesmo; se contasse duas vezes daria 120 e 409
  await confirmar(b.id);
});

test("agenda com qtd diz se o pedido daquele tamanho cabe no dia", async () => {
  zerar();
  const d = DIA();
  await enviar(corpo(40, d));
  assert.equal((await agendaPara(40)).indisponiveis[d], undefined);   // 40 + 40 = 80 cabe
  assert.equal((await agendaPara(41)).indisponiveis[d], "lotado");
  assert.equal((await agenda()).indisponiveis[d], undefined);         // sem qtd vale 1
  assert.equal((await agendaPara("lixo")).indisponiveis[d], undefined);
  assert.equal((await agendaPara(-5)).indisponiveis[d], undefined);   // vira 1
  assert.equal((await agendaPara(99999)).indisponiveis[d], "lotado"); // vira 800
});

test("cancelar devolve a vaga", async () => {
  zerar();
  const d = DIA();
  const a = await (await enviar(corpo(40, d))).json();
  await enviar(corpo(40, d));
  assert.equal((await agenda()).indisponiveis[d], "lotado");
  await cancelar(a.id);
  assert.equal((await agenda()).indisponiveis[d], undefined);
  assert.equal((await (await enviar(corpo(40, d))).json()).status, "aguardando");
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
