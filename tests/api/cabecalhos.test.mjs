import test from "node:test";
import assert from "node:assert/strict";
import { pedir } from "./ajuda.mjs";

// Direto no wrangler (8788), sem o proxy dos testes, pra ver os cabeçalhos como a produção manda.
const CSP =
  "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

for (const caminho of ["/", "/painel/", "/404-que-nao-existe"]) {
  test(`os cabeçalhos de segurança vêm em ${caminho}`, async () => {
    const r = await pedir(caminho);
    assert.equal(r.headers.get("content-security-policy"), CSP);
    assert.equal(r.headers.get("strict-transport-security"), "max-age=31536000");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.equal(r.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
  });
}

test("a home e o painel não ficam em cache, o painel sai dos buscadores", async () => {
  const home = await pedir("/");
  assert.equal(home.headers.get("cache-control"), "no-cache");
  const painel = await pedir("/painel/");
  assert.equal(painel.headers.get("cache-control"), "no-cache");
  assert.equal(painel.headers.get("x-robots-tag"), "noindex");
});

test("arquivos imutáveis levam cache de um ano", async () => {
  for (const c of ["/logo.svg", "/og-v2.png", "/fontes/unbounded.woff2"]) {
    const r = await pedir(c);
    assert.equal(r.status, 200, c);
    assert.equal(r.headers.get("cache-control"), "public, max-age=31536000, immutable", c);
  }
});

test("o JavaScript do site não fica em cache", async () => {
  const r = await pedir("/app.js");
  assert.equal(r.headers.get("cache-control"), "no-cache");
});

test("a página 404 sai no estilo do site, com link pra home", async () => {
  const r = await pedir("/nao-existe-mesmo");
  assert.equal(r.status, 404);
  const html = await r.text();
  assert.match(html, /<a href="\/"/);
  assert.ok(!html.includes("—"), "travessão na 404");
});

test("robots e sitemap apontam pro domínio novo", async () => {
  const robots = await (await pedir("/robots.txt")).text();
  assert.match(robots, /Disallow: \/painel/);
  assert.match(robots, /Disallow: \/api/);
  assert.match(robots, /Sitemap: https:\/\/esfihas\.sayones\.com\.br\/sitemap\.xml/);
  const mapa = await (await pedir("/sitemap.xml")).text();
  assert.match(mapa, /<loc>https:\/\/esfihas\.sayones\.com\.br\/<\/loc>/);
});

test("as respostas da API também levam nosniff, HSTS e no-store", async () => {
  for (const c of ["/api/saude", "/api/agenda", "/api/cupom?codigo=PRIMEIRACOMPRA"]) {
    const r = await pedir(c);
    assert.equal(r.status, 200, c);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", c);
    assert.equal(r.headers.get("strict-transport-security"), "max-age=31536000", c);
    assert.equal(r.headers.get("cache-control"), "no-store", c);
  }
});
