import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pedir, comoDono } from "./ajuda.mjs";
import { zerar } from "./zerar.mjs";
import { PONTOS, proximaData, isoBrasilia, diaDaData } from "../../public/regras.js";

before(() => zerar());
after(() => zerar());

const ITA = 1;
const DIA = () => proximaData(PONTOS[ITA], 41, Date.now());
const json = (corpo, metodo) => comoDono({
  method: metodo || "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
});
const site = async (qtd, extra) => {
  const c = { id_envio: randomUUID(), nome: "Maria", itens: [{ sabor: "calabresa", qtd }], ponto: ITA, retirada: DIA(), ...extra };
  const r = await pedir("/api/pedidos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) });
  assert.ok(r.status === 201 || r.status === 200);
  return (await r.json()).id;
};
const dia = async (d) => (await pedir("/api/painel/pedidos?dia=" + d, comoDono())).json();
const achar = (j, id) => j.pontos.flatMap((p) => p.pedidos).find((p) => p.id === id);
const patch = (id, corpo) => pedir("/api/painel/pedidos/" + id, json(corpo, "PATCH"));
const sabado = () => {
  for (let i = 3; i < 15; i++) { const d = isoBrasilia(Date.now() + i * 86400000); if (diaDaData(d) === 6) return d; }
};

test("sem o cabeçalho do Access dá 403", async () => {
  for (const [caminho, m] of [["/api/painel/pedidos?dia=2030-01-01", "GET"], ["/api/painel/agenda", "GET"],
    ["/api/painel/pedidos", "POST"], ["/api/painel/pedidos/1", "PATCH"], ["/api/painel/agenda", "PUT"]]) {
    const r = await pedir(caminho, { method: m });
    assert.equal(r.status, 403, caminho);
    assert.deepEqual(await r.json(), { erro: "proibido" });
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-robots-tag"), "noindex");
  }
  const outro = await pedir("/api/painel/agenda", { headers: { "Cf-Access-Authenticated-User-Email": "intruso@example.com" } });
  assert.equal(outro.status, 403);
  const ok = await pedir("/api/painel/agenda", comoDono());
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
});

test("lista do dia soma por sabor só os confirmados", async () => {
  zerar();
  const d = DIA();
  const a = await site(5);
  const b = await site(3, { itens: [{ sabor: "carne", qtd: 3 }] });
  let j = await dia(d);
  assert.deepEqual(j.porSabor, { calabresa: 0, carne: 0, queijo: 0, marguerita: 0 });
  assert.equal(j.pontos[0].ponto, "Itacorubi");
  assert.equal(j.pontos[0].pedidos.length, 2);
  assert.equal((await patch(a, { status: "confirmado" })).status, 200);
  j = await dia(d);
  assert.equal(j.porSabor.calabresa, 5);
  assert.equal(j.porSabor.carne, 0);
  const p = achar(j, a);
  assert.deepEqual(Object.keys(p).sort(), ["cupom", "desconto_centavos", "entregue", "id", "itens", "janela", "motivo", "nome", "obs",
    "origem", "pago", "ponto", "qtd", "retirada", "status", "total_centavos", "valor_manual"].sort());
  assert.equal(p.pago, false);
  assert.deepEqual(p.itens, [{ sabor: "calabresa", qtd: 5 }]);
  assert.ok(b);
});

test("confirmar tira das pendências e entra na soma", async () => {
  zerar();
  const id = await site(4);
  let j = await dia(DIA());
  assert.ok(j.pendencias.some((p) => p.id === id));
  await patch(id, { status: "confirmado" });
  j = await dia(DIA());
  assert.ok(!j.pendencias.some((p) => p.id === id));
  assert.equal(j.porSabor.calabresa, 4);
});

test("pendências trazem pedido sem data e ordenam por retirada", async () => {
  zerar();
  const sem = await site(2, { ponto: 3, retirada: null });
  const com = await site(2);
  const j = await dia(DIA());
  const ids = j.pendencias.map((p) => p.id);
  assert.ok(ids.includes(sem) && ids.includes(com));
  assert.ok(ids.indexOf(com) < ids.indexOf(sem));   // com data vem antes de sem data
  assert.deepEqual(ids, [...j.pendencias].sort((x, y) =>
    (x.retirada === null) - (y.retirada === null) || (x.retirada || "").localeCompare(y.retirada || "") || x.id - y.id).map((p) => p.id));
});

test("editar quantidade recalcula e mantém o Nº", async () => {
  zerar();
  const id = await site(4);
  const r = await patch(id, { itens: [{ sabor: "calabresa", qtd: 8 }] });
  assert.equal(r.status, 200);
  const p = await r.json();
  assert.equal(p.id, id);
  assert.equal(p.qtd, 8);
  assert.equal(p.total_centavos, 4280);
  assert.equal(achar(await dia(DIA()), id).total_centavos, 4280);
});

test("cupom entra no recálculo da edição", async () => {
  zerar();
  const id = await site(8);
  const p = await (await patch(id, { cupom: "primeiracompra" })).json();
  assert.equal(p.cupom, "PRIMEIRACOMPRA");
  assert.equal(p.desconto_centavos, 428);
  assert.equal(p.total_centavos, 4280 - 428);
});

test("com valor manual a edição não muda o valor", async () => {
  zerar();
  const id = await site(4);
  const a = await (await patch(id, { total_centavos: 3000 })).json();
  assert.equal(a.valor_manual, true);
  assert.equal(a.total_centavos, 3000);
  const b = await (await patch(id, { itens: [{ sabor: "carne", qtd: 12 }] })).json();
  assert.equal(b.qtd, 12);
  assert.equal(b.total_centavos, 3000);
  const c = await (await patch(id, { valor_manual: false })).json();
  assert.equal(c.valor_manual, false);
  assert.equal(c.total_centavos, 12 * 520);
});

test("pedido manual aceita Centro no sábado sem data fixa", async () => {
  zerar();
  const s = sabado();
  const r = await pedir("/api/painel/pedidos", json({
    nome: "Joana", itens: [{ sabor: "queijo", qtd: 6 }], ponto: "Centro", retirada: s, janela: "10h na praça",
  }));
  assert.equal(r.status, 201);
  const p = await r.json();
  assert.equal(p.status, "confirmado");
  assert.equal(p.origem, "manual");
  assert.equal(p.ponto, "Centro");
  assert.equal(p.retirada, s);
  assert.equal(p.janela, "10h na praça");
  assert.equal(p.total_centavos, 6 * 550);
  assert.equal(p.valor_manual, false);
  const j = await dia(s);
  assert.equal(j.pontos[0].ponto, "Centro");
  assert.equal(j.porSabor.queijo, 6);
  const sem = await (await pedir("/api/painel/pedidos", json({ nome: "K", itens: [{ sabor: "carne", qtd: 1 }], ponto: "Em mãos", total_centavos: 1234 }))).json();
  assert.equal(sem.retirada, null);
  assert.equal(sem.valor_manual, true);
  assert.equal(sem.total_centavos, 1234);
  const ruim = await pedir("/api/painel/pedidos", json({ nome: "K", itens: [{ sabor: "carne", qtd: 1 }], ponto: "X", retirada: "31/12" }));
  assert.equal(ruim.status, 400);
});

test("cancelado sai da soma e continua na lista", async () => {
  zerar();
  const a = await site(5);
  const b = await site(3);
  await patch(a, { status: "confirmado" });
  await patch(b, { status: "confirmado" });
  await patch(a, { status: "cancelado" });
  const j = await dia(DIA());
  assert.equal(j.porSabor.calabresa, 3);
  const grupo = j.pontos[0].pedidos;
  assert.equal(grupo[grupo.length - 1].id, a);
  assert.equal(grupo[grupo.length - 1].status, "cancelado");
  assert.equal(grupo.length, 2);
});

test("próximos mostra os 7 dias seguintes só com confirmados", async () => {
  zerar();
  const d = DIA();
  const a = await site(5);
  const b = await site(2);
  await patch(a, { status: "confirmado" });
  const antes = isoBrasilia(Date.parse(d + "T12:00:00Z") - 86400000);
  const j = await dia(antes);
  assert.equal(j.proximos.length, 7);
  assert.equal(j.proximos[0].dia, d);
  assert.deepEqual([j.proximos[0].qtd, j.proximos[0].pedidos], [5, 1]);
  assert.ok(b);
});

test("nome com acento e emoji volta inteiro", async () => {
  zerar();
  const nome = "José Ângela 🥟";
  const id = await site(4, { nome });
  assert.equal(achar(await dia(DIA()), id).nome, nome);
  const novo = "Çãõ 🔥🥟 Zé";
  const p = await (await patch(id, { nome: novo, obs: "sem cebola 😋" })).json();
  assert.equal(p.nome, novo);
  assert.equal(achar(await dia(DIA()), id).obs, "sem cebola 😋");
  const m = await (await pedir("/api/painel/pedidos", json({ nome: "Mãe 🥟", itens: [{ sabor: "carne", qtd: 2 }], ponto: "Padaria É" }))).json();
  assert.equal(m.nome, "Mãe 🥟");
  assert.equal(m.ponto, "Padaria É");
});

test("PATCH recusa campo inválido, ignora campo desconhecido e dá 404", async () => {
  zerar();
  const id = await site(4);
  for (const c of [{ status: "feito" }, { nome: "x".repeat(61) }, { nome: "" }, { pago: "sim" }, { entregue: 1 },
    { itens: [] }, { itens: [{ sabor: "pizza", qtd: 1 }] }, { retirada: "2030-02-31" }, { ponto: "p".repeat(61) },
    { janela: "j".repeat(41) }, { obs: "o".repeat(501) }, { total_centavos: -1 }, { total_centavos: 1.5 }, { cupom: "c".repeat(31) }]) {
    assert.equal((await patch(id, c)).status, 400, JSON.stringify(c).slice(0, 40));
  }
  const ok = await patch(id, { pago: true, entregue: true, id: 999, criado_em: "x", origem: "manual", qtd: 1 });
  assert.equal(ok.status, 200);
  const p = await ok.json();
  assert.equal(p.id, id);
  assert.equal(p.pago, true);
  assert.equal(p.entregue, true);
  assert.equal(p.origem, "site");
  assert.equal(p.qtd, 4);
  assert.equal((await patch(999999, { pago: true })).status, 404);
  assert.equal((await patch("abc", { pago: true })).status, 404);
});

test("limite e bloqueio salvos aparecem na agenda pública", async () => {
  zerar();
  const d = DIA();
  const outro = isoBrasilia(Date.parse(d + "T12:00:00Z") + 86400000);
  let r = await pedir("/api/painel/agenda", json({ limite: 10, pausado: true, bloqueios: [{ dia: outro, motivo: "viagem" }] }, "PUT"));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { limite: 10, pausado: true, bloqueios: [{ dia: outro, motivo: "viagem" }] });
  assert.deepEqual(await (await pedir("/api/painel/agenda", comoDono())).json(),
    { limite: 10, pausado: true, bloqueios: [{ dia: outro, motivo: "viagem" }] });
  await pedir("/api/painel/agenda", json({ pausado: false }, "PUT"));
  await pedir("/api/painel/pedidos", json({ nome: "L", itens: [{ sabor: "carne", qtd: 10 }], ponto: "Itacorubi", retirada: d }));
  const pub = await (await pedir("/api/agenda")).json();
  assert.equal(pub.pausado, false);
  assert.equal(pub.indisponiveis[outro], "bloqueado");
  assert.equal(pub.indisponiveis[d], "lotado");
  assert.equal(JSON.stringify(pub).includes("viagem"), false);
  for (const c of [{ limite: 0 }, { limite: "5" }, { pausado: "1" }, { bloqueios: [{ dia: "ontem" }] }, { bloqueios: "x" }]) {
    assert.equal((await pedir("/api/painel/agenda", json(c, "PUT"))).status, 400, JSON.stringify(c));
  }
  r = await pedir("/api/painel/agenda", json({ bloqueios: [] }, "PUT"));
  assert.deepEqual((await r.json()).bloqueios, []);
  assert.equal((await (await pedir("/api/painel/agenda", comoDono())).json()).limite, 10);
});
