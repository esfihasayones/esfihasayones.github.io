import test from "node:test";
import assert from "node:assert/strict";
import { BASE } from "./ajuda.mjs";

test("cupom existente responde 200 com o desconto, sem importar caixa", async () => {
  const r = await fetch(`${BASE}/api/cupom?codigo=primeiracompra`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { codigo: "PRIMEIRACOMPRA", pct: 0.1 });
});

test("cupom que não existe responde 404", async () => {
  const r = await fetch(`${BASE}/api/cupom?codigo=BLACKFRIDAY`);
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { erro: "nao_existe" });
});

test("o cupom divulgado vem com código e desconto", async () => {
  const r = await fetch(`${BASE}/api/cupom?divulgado=1`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { codigo: "PRIMEIRACOMPRA", pct: 0.1 });
});

test("cupom sem código responde 404", async () => {
  const r = await fetch(`${BASE}/api/cupom`);
  assert.equal(r.status, 404);
});
