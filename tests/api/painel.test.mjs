import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pedir, comoDono } from "./ajuda.mjs";
import { zerar, wrangler } from "./zerar.mjs";
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

test("painel responde com no-store e noindex", async () => {
  const ok = await pedir("/api/painel/agenda", comoDono());
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.equal(ok.headers.get("x-robots-tag"), "noindex");
});

test("valor_manual sem total dá 400 e cupom inexistente dá 400", async () => {
  zerar();
  const base = { nome: "M", itens: [{ sabor: "carne", qtd: 2 }], ponto: "Rua" };
  for (const extra of [{ valor_manual: true }, { cupom: "NAOEXISTE" }]) {
    const r = await pedir("/api/painel/pedidos", json({ ...base, ...extra }));
    assert.equal(r.status, 400, JSON.stringify(extra));
    assert.ok((await r.json()).erro);
  }
  const ok = await pedir("/api/painel/pedidos", json({ ...base, valor_manual: true, total_centavos: 900, cupom: "primeiracompra" }));
  assert.equal(ok.status, 201);
  const id = (await ok.json()).id;
  assert.equal((await patch(id, { valor_manual: true })).status, 400);
  const c = await patch(id, { cupom: "NAOEXISTE" });
  assert.equal(c.status, 400);
  assert.equal((await c.json()).erro, "cupom inexistente");
  assert.equal((await patch(id, { cupom: null })).status, 200);
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
    "origem", "pago", "pagamento", "ponto", "qtd", "retirada", "status", "total_centavos", "valor_manual"].sort());
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
  const sem = await site(2, { ponto: 4, retirada: null });
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
    { janela: "j".repeat(41) }, { obs: "o".repeat(501) }, { total_centavos: -1 }, { total_centavos: 1.5 }, { cupom: "c".repeat(31) },
    { pagamento: "boleto" }, { pagamento: 1 }]) {
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

test("confirmado sem data aparece em semData e sai ao marcar entregue", async () => {
  zerar();
  const id = await site(3, { ponto: 4, retirada: null });
  let j = await dia(DIA());
  assert.ok(j.pendencias.some((p) => p.id === id));
  assert.deepEqual(j.semData, []);
  assert.equal((await patch(id, { status: "confirmado" })).status, 200);
  j = await dia(DIA());
  assert.ok(!j.pendencias.some((p) => p.id === id));
  assert.deepEqual(j.semData.map((p) => p.id), [id]);
  assert.equal(j.semData[0].ponto, "Combinar outro ponto");
  const outro = await site(2, { ponto: 4, retirada: null });
  await patch(outro, { status: "confirmado" });
  assert.deepEqual((await dia(DIA())).semData.map((p) => p.id), [id, outro]);
  await patch(id, { entregue: true });
  assert.deepEqual((await dia(DIA())).semData.map((p) => p.id), [outro]);
  await patch(outro, { status: "cancelado" });
  assert.deepEqual((await dia(DIA())).semData, []);
});

test("PATCH sem mexer em itens ou cupom mantém o total gravado", async () => {
  zerar();
  const d = DIA();
  wrangler("INSERT INTO pedidos (id_envio, criado_em, origem, status, nome, itens, qtd, unit_centavos, total_centavos, " +
    "cupom, desconto_centavos, valor_manual, ponto, retirada) VALUES ('fixo-1', '2026-10-01T10:00:00.000Z', 'site', 'aguardando', " +
    `'Preço antigo', '[{"sabor":"carne","qtd":4}]', 4, 550, 1234, NULL, 0, 0, 'Itacorubi', '${d}')`);
  const id = JSON.parse(wrangler("SELECT id FROM pedidos WHERE id_envio = 'fixo-1'", true))[0].results[0].id;
  for (const c of [{ pago: true }, { status: "confirmado" }, { entregue: true }, { nome: "Outro nome" },
    { ponto: "Abraão" }, { retirada: d }, { janela: "9h" }, { obs: "oi" }]) {
    const p = await (await patch(id, c)).json();
    assert.equal(p.total_centavos, 1234, JSON.stringify(c));
    assert.equal(p.qtd, 4);
  }
  // mexer nos itens refaz a conta
  const q = await (await patch(id, { itens: [{ sabor: "carne", qtd: 4 }] })).json();
  assert.equal(q.total_centavos, 2200);
});

test("contas do dia e do mês: bruto, ingredientes, marmita por pedido, taxa e líquido", async () => {
  zerar();
  const d = DIA();
  // 12 esfihas (combo 12, R$ 62,40) e 4 esfihas (combo 4, R$ 22,00), confirmados
  const a = await site(12);
  const b = await site(4);
  await site(3);   // aguardando: não entra nas contas
  for (const id of [a, b]) assert.equal((await patch(id, { status: "confirmado" })).status, 200);
  assert.equal((await patch(a, { pago: true, pagamento: "credito" })).status, 200);
  assert.equal((await patch(b, { pago: true })).status, 200);   // pago sem dizer como
  let j = await dia(d);
  const c = j.financas.dia;
  assert.equal(c.pedidos, 2);
  assert.equal(c.esfihas, 16);
  assert.equal(c.bruto, 6240 + 2200);
  assert.equal(c.ingredientes, 16 * 205);
  assert.equal(c.marmitas, 2 + 1);   // 12 esfihas pedem duas marmitas de 8
  assert.equal(c.embalagem, 3 * 210);
  assert.equal(c.taxa, Math.round(6240 * 309 / 10000));
  assert.equal(c.pagos_sem_forma, 1);
  assert.equal(c.liquido, c.bruto - c.ingredientes - c.embalagem - c.taxa);
  assert.equal(j.financas.mes.mes, d.slice(0, 7));
  assert.equal(j.financas.mes.bruto, c.bruto);
  const pb = achar(j, b);
  assert.equal(pb.pagamento, null);
  assert.equal(achar(j, a).pagamento, "credito");
  // trocar pra débito muda a taxa; desmarcar pago tira a taxa
  assert.equal((await patch(a, { pagamento: "debito" })).status, 200);
  j = await dia(d);
  assert.equal(j.financas.dia.taxa, Math.round(6240 * 89 / 10000));
  assert.equal((await patch(a, { pago: false, pagamento: null })).status, 200);
  j = await dia(d);
  assert.equal(j.financas.dia.taxa, 0);
  assert.equal(j.financas.dia.pago, 2200);
});

test("histórico soma só confirmados com retirada até hoje, por dia, mês e total", async () => {
  zerar();
  const criar = async (retirada, qtd, extra) => {
    const r = await pedir("/api/painel/pedidos", json({ nome: "H", itens: [{ sabor: "carne", qtd }], ponto: "Centro", retirada, ...extra }));
    assert.equal(r.status, 201);
    return (await r.json()).id;
  };
  await criar("2026-09-10", 12);            // R$ 62,40
  await criar("2026-10-02", 4);             // R$ 22,00
  const c = await criar("2026-10-03", 8);   // cancelado, não conta
  assert.equal((await patch(c, { status: "cancelado" })).status, 200);
  await criar(isoBrasilia(Date.now() + 5 * 86400000), 8);   // futuro, não conta
  const j = await (await pedir("/api/painel/historico", comoDono())).json();
  assert.equal(j.total.pedidos, 2);
  assert.equal(j.total.esfihas, 16);
  assert.equal(j.total.bruto, 6240 + 2200);
  assert.deepEqual(j.meses.map((m) => m.mes), ["2026-10", "2026-09"]);
  assert.equal(j.meses[1].embalagem, 2 * 210);
  assert.deepEqual(j.dias.map((d) => d.dia), ["2026-10-02", "2026-09-10"]);
  assert.equal(j.total.liquido, j.total.bruto - j.total.ingredientes - j.total.embalagem - j.total.taxa);
});
