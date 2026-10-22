import test from "node:test";
import assert from "node:assert/strict";
import { criarMiddleware } from "../../functions/api/painel/_middleware.js";

const ENV = { DONO_EMAIL: "brenojulianom@gmail.com", ACCESS_EQUIPE: "sayones", ACCESS_AUD: "aud123" };
const AGORA = 1_800_000_000_000;
const enc = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const par = () => crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const certs = async (pub, kid) => ({ keys: [{ ...(await crypto.subtle.exportKey("jwk", pub)), kid }] });

const chaveBoa = await par();
const chaveOutra = await par();

async function token(priv, claims, kid = "k1") {
  const cab = enc({ alg: "RS256", kid }), corpo = enc(claims);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", priv, new TextEncoder().encode(cab + "." + corpo));
  return cab + "." + corpo + "." + Buffer.from(sig).toString("base64url");
}
const claimsOk = (extra) => ({ aud: ["aud123"], email: "BrenoJulianoM@gmail.com", exp: AGORA / 1000 + 600, ...extra });

async function chamar(tk, env = ENV, mw) {
  const m = mw || criarMiddleware({ agora: () => AGORA, buscar: async () => Response.json(await certs(chaveBoa.publicKey, "k1")) });
  const request = new Request("http://x/api/painel/agenda", { headers: tk ? { "Cf-Access-Jwt-Assertion": tk } : {} });
  let passou = false;
  const r = await m({ request, env, next: async () => { passou = true; return new Response("ok"); } });
  return { r, passou };
}
const nega = async (c) => {
  assert.equal(c.r.status, 403);
  assert.equal(c.passou, false);
  assert.deepEqual(await c.r.json(), { erro: "proibido" });
  assert.equal(c.r.headers.get("cache-control"), "no-store");
  assert.equal(c.r.headers.get("x-robots-tag"), "noindex");
};

test("token válido passa e a resposta leva no-store e noindex", async () => {
  const { r, passou } = await chamar(await token(chaveBoa.privateKey, claimsOk()));
  assert.equal(passou, true);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-robots-tag"), "noindex");
});

test("aud como texto simples também vale", async () => {
  assert.equal((await chamar(await token(chaveBoa.privateKey, claimsOk({ aud: "aud123" })))).passou, true);
});

test("sem token dá 403", async () => nega(await chamar(null)));

test("assinatura de outra chave dá 403", async () => nega(await chamar(await token(chaveOutra.privateKey, claimsOk()))));

test("corpo adulterado dá 403", async () => {
  const t = (await token(chaveBoa.privateKey, claimsOk())).split(".");
  t[1] = enc(claimsOk({ email: "intruso@example.com" }));
  await nega(await chamar(t.join(".")));
});

test("token vencido dá 403", async () => nega(await chamar(await token(chaveBoa.privateKey, claimsOk({ exp: AGORA / 1000 - 1 })))));

test("aud errada dá 403", async () => nega(await chamar(await token(chaveBoa.privateKey, claimsOk({ aud: ["outra"] })))));

test("outro e-mail dá 403", async () => nega(await chamar(await token(chaveBoa.privateKey, claimsOk({ email: "intruso@example.com" })))));

test("kid desconhecido, lixo e alg diferente dão 403", async () => {
  await nega(await chamar(await token(chaveBoa.privateKey, claimsOk(), "outro")));
  await nega(await chamar("lixo"));
  await nega(await chamar("a.b.c"));
});

test("o cabeçalho de e-mail sozinho não vale", async () => {
  const m = criarMiddleware({ agora: () => AGORA, buscar: async () => { throw new Error("sem rede"); } });
  const request = new Request("http://x/", { headers: { "Cf-Access-Authenticated-User-Email": ENV.DONO_EMAIL } });
  await nega({ r: await m({ request, env: ENV, next: async () => new Response("ok") }), passou: false });
});

test("falta de configuração nega, mesmo com token bom", async () => {
  const t = await token(chaveBoa.privateKey, claimsOk());
  for (const env of [{ ...ENV, DONO_EMAIL: "" }, { ...ENV, ACCESS_EQUIPE: undefined }, { ...ENV, ACCESS_AUD: "" }, {}]) {
    await nega(await chamar(t, env));
  }
});

test("falha ao buscar as chaves nega", async () => {
  const m = criarMiddleware({ agora: () => AGORA, buscar: async () => new Response("x", { status: 500 }) });
  await nega(await chamar(await token(chaveBoa.privateKey, claimsOk()), ENV, m));
});

test("chaves ficam em cache por alguns minutos", async () => {
  let n = 0, t = AGORA;
  const m = criarMiddleware({ agora: () => t, buscar: async () => { n++; return Response.json(await certs(chaveBoa.publicKey, "k1")); } });
  const tk = await token(chaveBoa.privateKey, claimsOk({ exp: AGORA / 1000 + 3600 }));
  await chamar(tk, ENV, m); await chamar(tk, ENV, m);
  assert.equal(n, 1);
  t += 6 * 60 * 1000;
  await chamar(tk, ENV, m);
  assert.equal(n, 2);
});

test("DEV_SEM_LOGIN igual a 1 passa sem token", async () => {
  assert.equal((await chamar(null, { DEV_SEM_LOGIN: "1" })).passou, true);
  await nega(await chamar(null, { ...ENV, DEV_SEM_LOGIN: "0" }));
  await nega(await chamar(null, { ...ENV, DEV_SEM_LOGIN: "true" }));
});

test("erro dentro da rota vira 500 sem detalhe e com os cabeçalhos", async () => {
  const m = criarMiddleware();
  const r = await m({ request: new Request("http://x/"), env: { DEV_SEM_LOGIN: "1" }, next: async () => { throw new Error("Maria Sigilosa 123"); } });
  assert.equal(r.status, 500);
  const txt = await r.text();
  assert.equal(txt.includes("Sigilosa"), false);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-robots-tag"), "noindex");
});
