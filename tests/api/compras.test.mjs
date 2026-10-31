// Lista de compras: conta da receita e leitura do catálogo dos mercados.
// Não fala com servidor nem com a internet.
import test from "node:test";
import assert from "node:assert/strict";
import { insumos, INGREDIENTES, MASSA, RECHEIOS } from "../../functions/_lib/receitas.js";
import { combina, pesoGramas, ofertas, melhor, buscar, custoPara } from "../../functions/_lib/mercados.js";

const MERCADO = { id: "teste", nome: "Teste", site: "https://mercado.invalido" };
const produto = (nome, preco, extra = {}) => ({
  productName: nome, brand: "Marca", link: "https://x/p",
  items: [{ nameComplete: nome, measurementUnit: extra.unidade || "un", unitMultiplier: extra.passo || 1,
    images: [{ imageUrl: "https://x/foto.jpg" }],
    sellers: [{ commertialOffer: { Price: preco, ListPrice: extra.de || preco, AvailableQuantity: extra.estoque ?? 10 } }] }],
});

test("insumos soma massa e recheio de cada sabor", () => {
  const g = insumos({ carne: 2, queijo: 1 });
  assert.equal(g.farinha, MASSA.farinha * 3);
  assert.equal(g.carne, RECHEIOS.carne.carne * 2);
  assert.equal(g.cebola, RECHEIOS.carne.cebola * 2);
  assert.equal(g.mucarela, RECHEIOS.queijo.mucarela);
  assert.equal(g.calabresa, undefined);
});

test("insumos recusa sabor sem receita e ignora quantidade zero", () => {
  assert.throws(() => insumos({ frango: 3 }), /sem receita/);
  // Propriedade herdada de objeto não é sabor.
  assert.throws(() => insumos({ toString: 5 }), /sem receita/);
  assert.throws(() => insumos({ constructor: 1 }), /sem receita/);
  assert.deepEqual(insumos({ carne: 0 }), {});
});

test("todo ingrediente das receitas sabe como ser procurado", () => {
  for (const r of [MASSA, ...Object.values(RECHEIOS)]) for (const ing of Object.keys(r)) assert.ok(INGREDIENTES[ing], ing);
});

test("pesoGramas lê o peso do nome", () => {
  assert.equal(pesoGramas("Farinha De Trigo Orquídea 5kg"), 5000);
  assert.equal(pesoGramas("Requeijão Tirol 180g"), 180);
  assert.equal(pesoGramas("Óleo de Soja SOYA 900ml"), 900);
  assert.equal(pesoGramas("Queijo 1,5 Kg"), 1500);
  assert.equal(pesoGramas("Fermento Kit 3x 10g"), 30);
  assert.equal(pesoGramas("Tomate Kg"), 1000);
  assert.equal(pesoGramas("Cebola Roxa"), null);
  // Ponto de milhar, quantidade depois do peso e unidade por extenso.
  assert.equal(pesoGramas("Açúcar União 1.000g"), 1000);
  assert.equal(pesoGramas("Farinha 1.5kg"), 1500);
  assert.equal(pesoGramas("Fermento 10g com 3 unidades"), 30);
  assert.equal(pesoGramas("Sal 1kg c/ 2"), 2000);
  assert.equal(pesoGramas("Leite 1L x 12"), 12000);
  assert.equal(pesoGramas("Requeijão 200g Tradicional"), 200);
  assert.equal(pesoGramas("500 gramas"), 500);
  assert.equal(pesoGramas("1 quilo"), 1000);
});

test("combina separa o ingrediente do que a busca traz junto", () => {
  const cal = INGREDIENTES.calabresa;
  assert.ok(combina("Linguiça Calabresa Defumada Perdigão 400g", cal));
  assert.ok(!combina("Pizza Calabresa Giassi Kg", cal));
  assert.ok(combina("Queijo Muçarela Fatiado 500g", INGREDIENTES.mucarela));
  assert.ok(combina("Queijo Mozzarella 500g", INGREDIENTES.mucarela));
  assert.ok(!combina("Pizza de Mussarela Sadia 440g", INGREDIENTES.mucarela));
  assert.ok(combina("Sal Refinado Zizo 1kg", INGREDIENTES.sal));
  assert.ok(!combina("Salsicha Hot Dog 500g", INGREDIENTES.sal));
  assert.ok(!combina("Farinha de Trigo Sem Glúten 1kg", INGREDIENTES.farinha));
  assert.ok(!combina("Tempero Manjericão e Orégano 60g", INGREDIENTES.manjericao));
  // Tempero não é a coisa: pimenta calabresa, cebola em pó, farinha com fermento.
  assert.ok(!combina("Pimenta Calabresa Kitano 15g", cal));
  assert.ok(!combina("Molho de Pimenta Calabresa 150ml", cal));
  assert.ok(!combina("Cebola Em Pó Chelli Envelope 15g", INGREDIENTES.cebola));
  assert.ok(combina("Cebola kg", INGREDIENTES.cebola));
  assert.ok(!combina("Farinha de Trigo com Fermento 1kg", INGREDIENTES.farinha));
  // Carne moída no masculino também vale; frango moído não.
  assert.ok(combina("Patinho Moído kg", INGREDIENTES.carne));
  assert.ok(combina("Acém Moído 500g", INGREDIENTES.carne));
  assert.ok(!combina("Frango Moído 500g", INGREDIENTES.carne));
  assert.ok(!combina("Vinagre com Manjericão 500ml", INGREDIENTES.manjericao));
  assert.ok(!combina("Mistura para Arroz Tomate com Manjericão 16g", INGREDIENTES.manjericao));
  assert.ok(combina("Manjericão Kitano Pacote 7g", INGREDIENTES.manjericao));
});

test("ofertas lê preço, promoção, marca, foto e granel", () => {
  const [o] = ofertas(produto("Requeijão Tirol 200g", 8.5, { de: 10 }), MERCADO);
  assert.deepEqual(
    [o.gramas, o.preco, o.promocao, o.porKg, o.marca, o.imagem, o.granel],
    [200, 850, 1000, 4250, "Marca", "https://x/foto.jpg", false],
  );
  // Granel: Price é por quilo e vende em passos de 200 g.
  const [g] = ofertas(produto("Tomate Kg", 15, { unidade: "kg", passo: 0.2 }), MERCADO);
  assert.deepEqual([g.gramas, g.preco, g.porKg, g.promocao, g.granel], [200, 300, 1500, null, true]);
});

test("ofertas pula o que está sem estoque ou sem peso", () => {
  assert.deepEqual(ofertas(produto("Requeijão 200g", 8, { estoque: 0 }), MERCADO), []);
  assert.deepEqual(ofertas(produto("Cebola Roxa", 3), MERCADO), []);
});

test("melhor escolhe o mais barato pra quantidade pedida, com embalagem fechada", () => {
  const pequena = ofertas(produto("Farinha 1kg", 4), MERCADO)[0];
  const grande = ofertas(produto("Farinha 5kg", 15), MERCADO)[0];
  // 2 kg: dois pacotes de 1 kg (R$ 8) ganham do de 5 kg (R$ 15).
  assert.deepEqual([melhor([grande, pequena], 2000).nome, melhor([grande, pequena], 2000).centavos], ["Farinha 1kg", 800]);
  // 4,5 kg: o de 5 kg (R$ 15) ganha de cinco de 1 kg (R$ 20).
  assert.deepEqual([melhor([pequena, grande], 4500).nome, melhor([pequena, grande], 4500).unidades], ["Farinha 5kg", 1]);
  assert.equal(melhor([], 100), null);
});

test("custoPara arredonda só o total quando o passo tem fração de centavo", () => {
  // R$ 39,95 o quilo em passos de 100 g: 26 passos = 2,6 kg = R$ 103,87, não 26 x R$ 4,00.
  assert.deepEqual(custoPara({ gramas: 100, preco: 399.5 }, 2600), { unidades: 26, centavos: 10387 });
});

test("buscar monta a URL da busca e devolve só o que combina", async () => {
  let url;
  const falso = async (u) => {
    url = u;
    return { ok: true, json: async () => [produto("Pizza Calabresa 460g", 19), produto("Linguiça Calabresa 400g", 15)] };
  };
  const r = await buscar(MERCADO, INGREDIENTES.calabresa, falso);
  assert.match(url, /^https:\/\/mercado\.invalido\/api\/catalog_system\/pub\/products\/search\?ft=linguica%20calabresa&/);
  assert.deepEqual(r.map((o) => o.nome), ["Linguiça Calabresa 400g"]);
  await assert.rejects(buscar(MERCADO, INGREDIENTES.calabresa, async () => ({ ok: false, status: 503 })), /HTTP 503/);
});
