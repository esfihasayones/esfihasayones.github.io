// Encartes do Tiendeo: leitura do JSON da página, filtro de validade e de
// local, recortes e a oferta que sai de cada um. Sem rede.
import test from "node:test";
import assert from "node:assert/strict";
import { listaEncartes, validosHoje, recortes, ofertaDoRecorte, tituloForaDoPeriodo, mesesNoTitulo } from "../../functions/_lib/encartes.js";

const paginaNext = (dados) => `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(dados)}</script></body></html>`;
const encarte = (id, extra = {}) => ({
  id, retailer_id: "9", retailerName: "Mercado " + id, title: "Ofertas " + id, type: "flyer",
  start_date: "2026-10-29T00:00:00.000Z", end_date: "2026-11-04T00:00:00.000Z", category_id: "5", ...extra,
});

test("listaEncartes lê os encartes de qualquer ponto do JSON, sem repetir", () => {
  const html = paginaNext({ props: { pageProps: { apiResources: {
    mainFlyer: encarte("1", { distance: "3.2" }),
    flyersByRetailer: [encarte("1", { distance: "3.2" }), encarte("2", { distance: "-1" })],
    flyersByRetailerNational: [encarte("3")],
  } } } });
  const l = listaEncartes(html);
  assert.deepEqual(l.map((e) => [e.id, e.mercado, e.inicio, e.fim, e.nacional]), [
    ["1", "Mercado 1", "2026-10-29", "2026-11-04", false],
    ["2", "Mercado 2", "2026-10-29", "2026-11-04", false],
    ["3", "Mercado 3", "2026-10-29", "2026-11-04", true],
  ]);
});

test("encarte que aparece como nacional e também com distância é local", () => {
  for (const ordem of [[encarte("1"), encarte("1", { distance: "6.4" })], [encarte("1", { distance: "6.4" }), encarte("1")]]) {
    const [e] = listaEncartes(paginaNext({ a: ordem }));
    assert.equal(e.nacional, false);
  }
});

test("listaEncartes aguenta página sem os dados", () => {
  assert.deepEqual(listaEncartes("<html>nada</html>"), []);
  assert.deepEqual(recortes("<html>nada</html>"), []);
});

test("validosHoje fica com supermercado local no período", () => {
  const l = [
    { id: "a", categoria: "5", inicio: "2026-10-29", fim: "2026-11-04", titulo: "x", nacional: false },
    { id: "b", categoria: "2", inicio: "2026-10-29", fim: "2026-11-04", titulo: "operadora", nacional: false },
    { id: "c", categoria: "5", inicio: "2026-11-01", fim: "2026-11-04", titulo: "ainda não", nacional: false },
    { id: "d", categoria: "5", inicio: "2026-10-01", fim: "2026-10-30", titulo: "venceu", nacional: false },
    { id: "e", categoria: "5", inicio: "2026-10-29", fim: "2026-11-04", titulo: "LÂMINA RIO DE JANEIRO", nacional: true },
    { id: "f", categoria: "5", inicio: "2026-05-01", fim: "2026-11-01", titulo: "Food Service 05 a 11 JAN 26", nacional: false },
    { id: "g", categoria: "5", inicio: "2026-10-31", fim: "2026-10-31", titulo: "só hoje", nacional: false },
  ];
  assert.deepEqual(validosHoje(l, "2026-10-31").map((e) => e.id), ["a", "g"]);
  assert.deepEqual(validosHoje(l, "2026-10-31", { nacionais: true }).map((e) => e.id), ["a", "e", "g"]);
});

test("mês citado no título fora do período derruba o encarte", () => {
  const e = (titulo, inicio = "2026-10-29", fim = "2026-11-04") => ({ titulo, inicio, fim });
  assert.equal(tituloForaDoPeriodo(e("SC Fort Food Service (PIZZARIA) 05 a 11 JAN 26", "2026-05-01", "2026-11-01")), true);
  assert.equal(tituloForaDoPeriodo(e("Ofertas 10/set")), true);
  assert.equal(tituloForaDoPeriodo(e("Março chegou")), true);
  assert.equal(tituloForaDoPeriodo(e("Ofertas de Outubro")), false);
  assert.equal(tituloForaDoPeriodo(e("Novembro azul")), false);
  assert.equal(tituloForaDoPeriodo(e("Natal e Janeiro", "2026-12-01", "2027-01-10")), false);
  assert.equal(tituloForaDoPeriodo(e("Fevereiro", "2026-12-01", "2027-01-10")), true);
  // "Mar", "Mais" e "Set" de vinho sem número perto não são mês.
  assert.deepEqual(mesesNoTitulo("Frutos do Mar e Mais ofertas, set de taças"), []);
  assert.deepEqual(mesesNoTitulo("LÂMINA SEMANAL"), []);
  assert.deepEqual(mesesNoTitulo("LÂMINA RIO DE JANEIRO"), []);
});

test("recortes lê nome, marca, preço em centavos, página e imagem", () => {
  const html = paginaNext({ props: { flyerGibsData: { flyerGibs: [
    { id: "g1", flyer_id: "77", retailerName: "Carrefour", title: " Araguaia - Farinha De Trigo ", image: "https://img/g1.webp",
      settings: { brand: "Araguaia", flyer_page: "2", price_extended: { digits: "2.99" } } },
    { id: "g2", flyer_id: "77", retailerName: "Carrefour", title: "Seara - One Uva", image: "https://img/g2.webp",
      settings: { sale: "-50%", price_extended: { digits: "" } } },
  ] } } });
  assert.deepEqual(recortes(html), [
    { id: "g1", encarte: "77", mercado: "Carrefour", titulo: "Araguaia - Farinha De Trigo", marca: "Araguaia", preco: 299, pagina: 2, imagem: "https://img/g1.webp" },
    { id: "g2", encarte: "77", mercado: "Carrefour", titulo: "Seara - One Uva", marca: null, preco: null, pagina: null, imagem: "https://img/g2.webp" },
  ]);
});

const rec = (extra = {}) => ({ id: "g1", encarte: "77", mercado: "Fort Atacadista", titulo: "Queijo Mussarela", marca: "Tirol", preco: 2580, imagem: "https://img/g1.webp", ...extra });
const enc = { id: "77", titulo: "Ofertas", fim: "2026-11-04", nacional: false };

test("ofertaDoRecorte: embalagem com o peso lido pela IA", () => {
  const o = ofertaDoRecorte(rec({ preco: 299 }), { produto: "Farinha Araguaia 1kg", gramas: 1000, unidade: "embalagem" }, enc);
  assert.deepEqual([o.mercado, o.nome, o.gramas, o.granel, o.preco, o.porKg, o.link, o.encarte.fim, o.encarte.nacional],
    ["Fort Atacadista (encarte)", "Farinha Araguaia 1kg", 1000, false, 299, 299, "https://www.tiendeo.com.br/Catalogos/77", "2026-11-04", false]);
});

test("ofertaDoRecorte: preço por quilo vira granel de 100 g", () => {
  const o = ofertaDoRecorte(rec(), { gramas: 1000, unidade: "kg" }, enc);
  assert.deepEqual([o.gramas, o.granel, o.preco, o.porKg], [100, true, 258, 2580]);
});

test("ofertaDoRecorte: preço do Tiendeo vale mais que o lido; o lido só cobre a falta", () => {
  assert.equal(ofertaDoRecorte(rec({ preco: 500 }), { gramas: 200, preco: 9.99 }, enc).preco, 500);
  assert.equal(ofertaDoRecorte(rec({ preco: null }), { gramas: 200, preco: 9.99 }, enc).preco, 999);
});

test("ofertaDoRecorte: sem peso ou sem preço não vira oferta", () => {
  assert.equal(ofertaDoRecorte(rec(), { gramas: null, unidade: "embalagem" }, enc), null);
  assert.equal(ofertaDoRecorte(rec({ preco: null }), { gramas: 200 }, enc), null);
  assert.equal(ofertaDoRecorte(rec(), null, enc), null);
});

test("ofertaDoRecorte leva a condição e marca encarte nacional", () => {
  const o = ofertaDoRecorte(rec(), { gramas: 300, condicao: "no App Meu Assaí" }, { ...enc, nacional: true });
  assert.deepEqual([o.condicao, o.encarte.nacional], ["no App Meu Assaí", true]);
});
