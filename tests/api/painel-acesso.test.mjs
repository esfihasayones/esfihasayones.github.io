import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../../functions/api/painel/_middleware.js";

// Chama o middleware sem servidor; `next` devolve 200 se foi liberado.
async function chamar(cabecalhos, env) {
  const request = new Request("http://x/api/painel/agenda", { headers: cabecalhos });
  let passou = false;
  const r = await onRequest({ request, env, next: async () => { passou = true; return new Response("ok"); } });
  return { r, passou };
}
const DONO = { DONO_EMAIL: "brenojulianom@gmail.com" };
const CAB = "Cf-Access-Authenticated-User-Email";

test("sem cabeçalho dá 403", async () => {
  const { r, passou } = await chamar({}, DONO);
  assert.equal(r.status, 403);
  assert.equal(passou, false);
  assert.deepEqual(await r.json(), { erro: "proibido" });
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-robots-tag"), "noindex");
});

test("outro e-mail dá 403", async () => {
  const { r, passou } = await chamar({ [CAB]: "intruso@example.com" }, DONO);
  assert.equal(r.status, 403);
  assert.equal(passou, false);
});

test("e-mail do dono em outra caixa e com espaço passa", async () => {
  const { r, passou } = await chamar({ [CAB]: " BrenoJulianoM@Gmail.com " }, { DONO_EMAIL: " brenojulianom@GMAIL.com" });
  assert.equal(passou, true);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-robots-tag"), "noindex");
});

test("DEV_SEM_LOGIN igual a 1 passa sem cabeçalho", async () => {
  assert.equal((await chamar({}, { ...DONO, DEV_SEM_LOGIN: "1" })).passou, true);
  assert.equal((await chamar({}, { ...DONO, DEV_SEM_LOGIN: "0" })).passou, false);
  assert.equal((await chamar({}, { ...DONO, DEV_SEM_LOGIN: "true" })).passou, false);
});

test("sem DONO_EMAIL configurado dá 403 mesmo com cabeçalho vazio ou igual", async () => {
  for (const env of [{}, { DONO_EMAIL: "" }, { DONO_EMAIL: "  " }]) {
    assert.equal((await chamar({}, env)).r.status, 403);
    assert.equal((await chamar({ [CAB]: "" }, env)).r.status, 403);
    assert.equal((await chamar({ [CAB]: "  " }, env)).passou, false);
  }
});
