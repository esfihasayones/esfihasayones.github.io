import test, { before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pedir, comoDono, BASE } from "./ajuda.mjs";
import { zerar, wrangler } from "./zerar.mjs";
import { PONTOS, proximaData, telefoneLimpo, telefoneBR } from "../../public/regras.js";

before(() => zerar());

const ITA = 1;
const DIA = () => proximaData(PONTOS[ITA], 12, Date.now());
const enviar = (extra) => pedir("/api/pedidos", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ id_envio: randomUUID(), nome: "Maria", itens: [{ sabor: "carne", qtd: 4 }], ponto: ITA, retirada: DIA(), ...extra }),
});
const linha = (id) => JSON.parse(wrangler(`SELECT telefone, motivo, status FROM pedidos WHERE id = ${id}`, true))[0].results[0];
const json = (corpo, metodo) => comoDono({ method: metodo || "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
const patch = (id, corpo) => pedir("/api/painel/pedidos/" + id, json(corpo, "PATCH"));
const consultar = async (tel) => (await fetch(`${BASE}/api/cupom?codigo=PRIMEIRACOMPRA&telefone=${encodeURIComponent(tel)}`)).json();

test("telefone com ou sem país, operadora e máscara vira o mesmo número", () => {
  for (const v of ["48999990000", "(48) 99999-0000", "+55 48 99999-0000", "5548999990000", "048999990000", "48 9 9999 0000"]) {
    assert.equal(telefoneLimpo(v), "48999990000", v);
  }
  assert.equal(telefoneLimpo("4833330000"), "4833330000", "fixo de 10 dígitos vale");
  for (const v of ["", "999990000", "48899990000", "0099990000", "4899999000011", "abc", null, undefined, {}]) {
    assert.equal(telefoneLimpo(v), null, String(v));
  }
  assert.equal(telefoneBR("48999990000"), "(48) 99999-0000");
  assert.equal(telefoneBR("4833330000"), "(48) 3333-0000");
});

test("o pedido grava o telefone só com os dígitos", async () => {
  const r = await enviar({ telefone: "+55 (48) 99999-0001" });
  assert.equal(r.status, 201);
  assert.equal(linha((await r.json()).id).telefone, "48999990001");
});

test("telefone que não é número brasileiro barra o pedido", async () => {
  const r = await enviar({ telefone: "12345" });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { erro: "telefone inválido" });
});

test("pedido sem telefone ainda entra (página velha no cache)", async () => {
  const r = await enviar({});
  assert.equal(r.status, 201);
  assert.equal(linha((await r.json()).id).telefone, null);
});

test("o mesmo telefone não usa o cupom de primeira compra duas vezes", async () => {
  zerar();
  const tel = "48999990002";
  assert.equal((await consultar(tel)).usado, false);
  const a = await (await enviar({ telefone: tel, cupom: "PRIMEIRACOMPRA" })).json();
  assert.equal(a.status, "aguardando");
  assert.equal((await consultar("(48) 99999-0002")).usado, true, "a consulta do site tem que saber");
  const b = await (await enviar({ nome: "Outro Nome", telefone: "+55 48 99999-0002", cupom: "primeiracompra" })).json();
  assert.equal(b.status, "fora_da_regra");
  assert.equal(linha(b.id).motivo, "cupom_usado");
  const c = await (await enviar({ telefone: "48999990003", cupom: "PRIMEIRACOMPRA" })).json();
  assert.equal(c.status, "aguardando", "outro telefone segue normal");
});

test("quem já pediu sem cupom não usa o de primeira compra", async () => {
  zerar();
  const tel = "48999990004";
  await enviar({ telefone: tel });
  assert.equal((await consultar(tel)).usado, true);
  const j = await (await enviar({ telefone: tel, cupom: "PRIMEIRACOMPRA" })).json();
  assert.equal(linha(j.id).motivo, "cupom_usado");
});

test("pedido cancelado ou fora da regra não gasta o cupom", async () => {
  zerar();
  const tel = "48999990005";
  const a = await (await enviar({ telefone: tel, cupom: "PRIMEIRACOMPRA" })).json();
  await patch(a.id, { status: "cancelado" });
  await enviar({ telefone: tel, cupom: "NAOEXISTE" });   // vira fora_da_regra
  assert.equal((await consultar(tel)).usado, false);
  const b = await (await enviar({ telefone: tel, cupom: "PRIMEIRACOMPRA" })).json();
  assert.equal(b.status, "aguardando");
});

test("reenviar o mesmo pedido não conta como uso do cupom", async () => {
  zerar();
  const corpo = { id_envio: randomUUID(), telefone: "48999990006", cupom: "PRIMEIRACOMPRA" };
  const a = await (await enviar(corpo)).json();
  const b = await (await enviar(corpo)).json();
  assert.equal(b.id, a.id);
  assert.equal(b.status, "aguardando");
});

test("consulta de cupom sem telefone (ou com telefone ruim) não diz nada sobre uso", async () => {
  const r = await (await fetch(`${BASE}/api/cupom?codigo=PRIMEIRACOMPRA&telefone=123`)).json();
  assert.equal("usado" in r, false);
});

test("a fila marca cupom repetido pelo telefone mesmo com outro nome", async () => {
  zerar();
  const tel = "48999990007";
  const primeiro = (await (await enviar({ nome: "Ana", telefone: tel })).json()).id;
  await patch(primeiro, { status: "confirmado" });
  const segundo = (await (await enviar({ nome: "Joana Prado", telefone: tel, cupom: "PRIMEIRACOMPRA" })).json()).id;
  const outro = (await (await enviar({ nome: "Bia", telefone: "48999990008", cupom: "PRIMEIRACOMPRA" })).json()).id;
  const j = await (await pedir("/api/painel/fila?dia=" + DIA(), comoDono())).json();
  const de = (id) => [...j.fila, ...j.pendencias].find((p) => p.id === id);
  assert.equal(de(segundo).cupom_repetido, true);
  assert.equal(de(segundo).cupom_repetido_por, "telefone");
  assert.equal(de(segundo).cupom_repetido_pedido, primeiro);
  assert.equal(de(segundo).telefone, tel);
  assert.equal(de(outro).cupom_repetido, false);
});

test("o painel lança, corrige e apaga o telefone", async () => {
  zerar();
  const r = await pedir("/api/painel/pedidos", json({ nome: "M", telefone: "(48) 3333-0000", itens: [{ sabor: "carne", qtd: 2 }], ponto: "Rua" }));
  assert.equal(r.status, 201);
  const p = await r.json();
  assert.equal(p.telefone, "4833330000");
  assert.equal((await (await patch(p.id, { telefone: "48 99999-0009" })).json()).telefone, "48999990009");
  assert.equal((await patch(p.id, { telefone: "1" })).status, 400);
  assert.equal((await (await patch(p.id, { telefone: "" })).json()).telefone, null);
});
