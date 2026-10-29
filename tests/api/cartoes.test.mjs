import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { pedir, comoDono } from "./ajuda.mjs";
import { zerar } from "./zerar.mjs";
import { normalizar, sortear, ALFABETO } from "../../functions/_lib/cartoes.js";

before(() => zerar());
after(() => zerar());

const json = (corpo, metodo) => comoDono({
  method: metodo || "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
});
const gerar = async (quantidade) => {
  const r = await pedir("/api/painel/cartoes", json({ quantidade }));
  assert.equal(r.status, 201);
  return r.json();
};
const trocar = (codigos) => pedir("/api/painel/cartoes/troca", json({ codigos }));
// Pedido manual já entra confirmado.
const pedido = async (qtd) => {
  const r = await pedir("/api/painel/pedidos", json({ nome: "Cliente " + qtd, itens: [{ sabor: "carne", qtd }], ponto: "Rua" }));
  assert.equal(r.status, 201);
  return r.json();
};
// Gera `n` cartões e entrega os `k` primeiros, cada um com um pedido de 4.
const comPedidos = async (n, k) => {
  const g = await gerar(n);
  for (let i = 0; i < k; i++) assert.equal((await pedido(4)).cartao, g.cartoes[i].codigo);
  return g;
};
const patch = (id, corpo) => pedir("/api/painel/pedidos/" + id, json(corpo, "PATCH"));

test("normalizar tira espaço, traço e Nº e põe em maiúscula", () => {
  assert.equal(normalizar(" nº a-3 k "), "A3K");
  assert.equal(normalizar("N° 7xy"), "7XY");
});

test("sortear não repete e usa só o alfabeto sem letra parecida", () => {
  const cods = sortear(500, new Set(["AAA"]));
  assert.equal(new Set(cods).size, 500);
  assert.ok(!cods.includes("AAA"));
  for (const c of cods) assert.match(c, new RegExp(`^[${ALFABETO}]{3}$`));
  for (const proibida of "0O1IL5S8B") assert.ok(!ALFABETO.includes(proibida), proibida);
});

test("cartões respondem pelo painel, com no-store", async () => {
  const r = await pedir("/api/painel/cartoes", comoDono());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("gera lote com códigos únicos e lista por lote", async () => {
  zerar();
  const a = await gerar(16);
  const b = await gerar(32);
  assert.equal(a.lote, 1);
  assert.equal(b.lote, 2);
  assert.equal(new Set([...a.cartoes, ...b.cartoes].map((c) => c.codigo)).size, 48);
  const resumo = await (await pedir("/api/painel/cartoes", comoDono())).json();
  assert.equal(resumo.gerados, 48);
  assert.equal(resumo.trocados, 0);
  assert.deepEqual(resumo.lotes.map((l) => [l.lote, l.n]), [[2, 32], [1, 16]]);
  const um = await (await pedir("/api/painel/cartoes?lote=1", comoDono())).json();
  assert.deepEqual(um.cartoes.map((c) => c.codigo), a.cartoes.map((c) => c.codigo));
  assert.equal((await pedir("/api/painel/cartoes?lote=99", comoDono())).status, 404);
});

test("quantidade fora do limite dá 400", async () => {
  for (const quantidade of [0, -1, 401, 2.5, "16", null]) {
    assert.equal((await pedir("/api/painel/cartoes", json({ quantidade }))).status, 400, String(quantidade));
  }
});

test("troca cinco válidos uma vez só; a segunda diz que já foram trocados", async () => {
  zerar();
  const { cartoes } = await comPedidos(16, 5);
  const cinco = cartoes.slice(0, 5).map((c) => c.codigo.toLowerCase());
  const r = await trocar(cinco);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.trocado_em);
  assert.ok(j.cartoes.every((c) => c.situacao === "trocado"));

  const deNovo = await trocar(cinco);
  assert.equal(deNovo.status, 409);
  const d = await deNovo.json();
  assert.ok(d.cartoes.every((c) => c.situacao === "trocado" && c.trocado_em === j.trocado_em));

  const resumo = await (await pedir("/api/painel/cartoes", comoDono())).json();
  assert.equal(resumo.trocados, 5);
});

test("um cartão ruim barra a troca inteira e nenhum é marcado", async () => {
  zerar();
  const { cartoes } = await comPedidos(16, 5);
  const bons = cartoes.slice(0, 4).map((c) => c.codigo);
  const existentes = new Set(cartoes.map((c) => c.codigo));
  const inventado = sortear(1, existentes)[0];

  const r = await trocar([...bons, inventado]);
  assert.equal(r.status, 409);
  const j = await r.json();
  assert.deepEqual(j.cartoes.map((c) => c.situacao), ["ok", "ok", "ok", "ok", "inexistente"]);

  // xerox: o mesmo código duas vezes
  const x = await trocar([...bons, bons[0]]);
  assert.equal(x.status, 409);
  assert.deepEqual((await x.json()).cartoes.map((c) => c.situacao), ["ok", "ok", "ok", "ok", "repetido"]);

  // nada foi marcado: os quatro ainda trocam com um quinto válido
  assert.equal((await trocar([...bons, cartoes[4].codigo])).status, 200);
});

test("troca precisa de exatamente cinco códigos", async () => {
  for (const codigos of [[], ["AAA"], ["A", "B", "C", "D", "E", "F"], "AAAAA", [1, 2, 3, 4, ""]]) {
    assert.equal((await trocar(codigos)).status, 400, JSON.stringify(codigos));
  }
});

test("desfazer devolve os cinco e eles trocam de novo", async () => {
  zerar();
  const { cartoes } = await comPedidos(16, 5);
  const cinco = cartoes.slice(0, 5).map((c) => c.codigo);
  const { trocado_em } = await (await trocar(cinco)).json();
  const outro = await pedir("/api/painel/cartoes/troca", json({ codigos: cinco, trocado_em: "2000-01-01T00:00:00.000Z" }, "DELETE"));
  assert.equal((await outro.json()).desfeitos, 0);
  const r = await pedir("/api/painel/cartoes/troca", json({ codigos: cinco, trocado_em }, "DELETE"));
  assert.equal((await r.json()).desfeitos, 5);
  assert.equal((await trocar(cinco)).status, 200);
});

test("pedido aceito de 4 ou mais leva o próximo cartão, na ordem de impressão", async () => {
  zerar();
  const sem = await pedido(4);
  assert.equal(sem.cartao, null, "sem cartão gerado, nada a dar");
  const { cartoes } = await gerar(16);
  const a = await pedido(4);
  const pequeno = await pedido(3);
  const b = await pedido(12);
  assert.equal(a.cartao, cartoes[0].codigo);
  assert.equal(pequeno.cartao, null, "3 esfihas não ganham cartão");
  assert.equal(b.cartao, cartoes[1].codigo);
  // editar outra coisa não troca o cartão
  const r = await (await patch(a.id, { nome: "Outro nome" })).json();
  assert.equal(r.cartao, cartoes[0].codigo);
  const lote = await (await pedir("/api/painel/cartoes?lote=1", comoDono())).json();
  assert.deepEqual(lote.cartoes.slice(0, 3).map((c) => c.pedido_id), [a.id, b.id, null]);
});

test("pedido do site ganha cartão quando é aceito e devolve quando é cancelado", async () => {
  zerar();
  const { cartoes } = await gerar(16);
  const p = await pedido(4);
  assert.equal(p.cartao, cartoes[0].codigo);
  // volta pra aguardando (como pendência do site) e é aceito de novo: mesmo cartão
  assert.equal((await (await patch(p.id, { status: "aguardando" })).json()).cartao, null);
  assert.equal((await (await patch(p.id, { status: "confirmado" })).json()).cartao, cartoes[0].codigo);
  const cancelado = await (await patch(p.id, { status: "cancelado" })).json();
  assert.equal(cancelado.cartao, null);
  // o cartão devolvido é o primeiro livre de novo
  assert.equal((await pedido(5)).cartao, cartoes[0].codigo);
});

test("diminuir pra menos de 4 devolve o cartão; aumentar dá um", async () => {
  zerar();
  const { cartoes } = await gerar(16);
  const p = await pedido(3);
  assert.equal(p.cartao, null);
  assert.equal((await (await patch(p.id, { itens: [{ sabor: "carne", qtd: 4 }] })).json()).cartao, cartoes[0].codigo);
  assert.equal((await (await patch(p.id, { itens: [{ sabor: "carne", qtd: 2 }] })).json()).cartao, null);
});

test("cartão impresso que não saiu com pedido não vale na troca", async () => {
  zerar();
  const { cartoes } = await comPedidos(16, 4);
  const r = await trocar(cartoes.slice(0, 5).map((c) => c.codigo));
  assert.equal(r.status, 409);
  const j = await r.json();
  assert.deepEqual(j.cartoes.map((c) => c.situacao), ["ok", "ok", "ok", "ok", "sem_pedido"]);
  assert.equal(j.cartoes[0].pedido.nome, "Cliente 4");
});

test("pedido cancelado depois da troca continua com o cartão trocado", async () => {
  zerar();
  const g = await gerar(16);
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push((await pedido(4)).id);
  assert.equal((await trocar(g.cartoes.slice(0, 5).map((c) => c.codigo))).status, 200);
  assert.equal((await (await patch(ids[0], { status: "cancelado" })).json()).cartao, g.cartoes[0].codigo);
  // e o próximo pedido não reaproveita cartão trocado
  assert.equal((await pedido(4)).cartao, g.cartoes[5].codigo);
});
