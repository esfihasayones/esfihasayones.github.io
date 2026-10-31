// Onde comprar: melhor oferta por mercado e o melhor jeito de ir a 1, 2 ou
// quantos mercados precisar. Sem rede.
import test from "node:test";
import assert from "node:assert/strict";
import { planejar, melhorCom, opcoesDeCompra, roteiro } from "../../functions/_lib/compras.js";

// Oferta de embalagem de `gramas` por `preco` centavos no mercado `m`.
const of = (m, preco, gramas = 1000, nome = "x") => ({ mercado: m, nome, gramas, granel: false, preco, porKg: Math.round(preco / gramas * 1000) });

// farinha: A 10, B 8, C 6 | queijo: A 20, B 30 | sal: C 1 | ovo: ninguém
const precisa = { farinha: 1000, queijo: 1000, sal: 100, ovo: 50 };
const ofertas = {
  farinha: [of("A", 10), of("B", 8), of("C", 6), of("B", 9)],
  queijo: [of("A", 20), of("B", 30)],
  sal: [of("C", 1)],
};
const linhas = planejar(precisa, ofertas, { farinha: "Farinha", queijo: "Queijo", sal: "Sal", ovo: "Ovo" });

test("planejar deixa a melhor oferta de cada mercado, da mais barata pra mais cara", () => {
  const f = linhas.find((l) => l.ingrediente === "farinha");
  assert.deepEqual(f.opcoes.map((o) => [o.mercado, o.centavos]), [["C", 6], ["B", 8], ["A", 10]]);
  assert.equal(f.melhor.mercado, "C");
  assert.equal(f.nome, "Farinha");
  const ovo = linhas.find((l) => l.ingrediente === "ovo");
  assert.deepEqual([ovo.opcoes, ovo.melhor], [[], null]);
});

test("planejar conta a embalagem fechada pra quantidade pedida", () => {
  const [l] = planejar({ farinha: 2500 }, { farinha: [of("A", 400, 1000), of("B", 1500, 5000)] });
  assert.deepEqual(l.opcoes.map((o) => [o.mercado, o.unidades, o.centavos]), [["A", 3, 1200], ["B", 1, 1500]]);
});

test("melhorCom 1: nenhum mercado tem tudo, então não há opção de 1", () => {
  assert.equal(melhorCom(linhas, 1), null);
});

test("melhorCom 2: escolhe o par mais barato que cobre tudo", () => {
  // A+C: farinha 6 (C) + queijo 20 (A) + sal 1 (C) = 27; B+C: 6+30+1 = 37.
  const p = melhorCom(linhas, 2);
  assert.deepEqual([p.mercados, p.total, p.faltam], [["A", "C"], 27, ["Ovo"]]);
  assert.deepEqual(p.itens.map((i) => [i.ingrediente, i.oferta.mercado]), [["farinha", "C"], ["queijo", "A"], ["sal", "C"]]);
});

test("melhorCom sem limite é o mais barato de cada item", () => {
  const p = melhorCom(linhas, 99);
  assert.deepEqual([p.mercados, p.total], [["A", "C"], 27]);
});

test("melhorCom prefere menos mercados quando o total empata", () => {
  const l = planejar({ a: 1000, b: 1000 }, { a: [of("X", 10), of("Y", 5)], b: [of("X", 10), of("Y", 15)] });
  // Só X: 20. X+Y: 5+10 = 15. Y só: 20. Empate entre X e Y sozinhos: ordem alfabética.
  assert.deepEqual(melhorCom(l, 1).mercados, ["X"]);
  const empate = planejar({ a: 1000 }, { a: [of("X", 10), of("Y", 10)] });
  assert.deepEqual(melhorCom(empate, 2).mercados, ["X"]);
});

test("melhorCom com tudo faltando devolve null", () => {
  assert.equal(melhorCom(planejar({ a: 1 }, {}), 3), null);
});

test("opcoesDeCompra não repete combinação e dá rótulo certo", () => {
  const ops = opcoesDeCompra(linhas);
  // 1 mercado não existe; 2 mercados e o mais barato são a mesma (A+C): fica uma.
  assert.deepEqual(ops.map((o) => [o.rotulo, o.mercados.join("+"), o.total]), [["2 mercados", "A+C", 27]]);

  const l2 = planejar({ a: 1000, b: 1000, c: 1000 }, {
    a: [of("X", 10), of("Y", 1), of("Z", 9)], b: [of("X", 10), of("Y", 10), of("Z", 1)], c: [of("X", 10), of("Z", 9), of("W", 1)],
  });
  const ops2 = opcoesDeCompra(l2);
  assert.deepEqual(ops2.map((o) => [o.rotulo, o.mercados.join("+"), o.total]),
    [["1 mercado", "Z", 19], ["2 mercados", "W+Z", 11], ["Mais barato", "W+Y+Z", 3]]);
  // W+Y daria 1+10+1 = 12, W+Z dá 9+1+1 = 11.
});

test("roteiro agrupa por mercado, o de mais itens primeiro", () => {
  const p = melhorCom(linhas, 2);
  assert.deepEqual(roteiro(p).map((g) => [g.mercado, g.itens.map((i) => i.ingrediente), g.total]),
    [["C", ["farinha", "sal"], 7], ["A", ["queijo"], 20]]);
});
