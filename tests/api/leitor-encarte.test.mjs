// Leitor de encarte: interpretar a resposta da IA e guardar as leituras.
// Não chama a IA de verdade nem a internet.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { interpretarResposta, lerRecortes } from "../../ops/leitor-encarte.mjs";

const envelope = (result, extra = {}) => JSON.stringify({ type: "result", result, ...extra });

test("interpretarResposta tira o JSON do meio do texto e normaliza", () => {
  const r = interpretarResposta(envelope('Aqui está:\n```json\n[{"arquivo":"a.webp","produto":" Farinha 1kg ","gramas":"1000","preco":"2,99","unidade":"kg","condicao":""},' +
    '{"arquivo":"b.webp","produto":"","gramas":0,"preco":null,"unidade":"pacote","condicao":"Clube"},{"produto":"sem arquivo"}]\n```'));
  assert.deepEqual(r, [
    { arquivo: "a.webp", produto: "Farinha 1kg", gramas: 1000, preco: 2.99, unidade: "kg", condicao: null },
    { arquivo: "b.webp", produto: null, gramas: null, preco: null, unidade: "embalagem", condicao: "Clube" },
  ]);
});

test("interpretarResposta recusa erro e resposta sem lista", () => {
  assert.throws(() => interpretarResposta(envelope("deu ruim", { is_error: true })), /erro/);
  assert.throws(() => interpretarResposta(envelope("não consegui ler")), /sem lista/);
  assert.throws(() => interpretarResposta("isso não é json"));
});

const resposta = (corpo) => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(corpo).buffer });

test("lerRecortes manda pra IA só o que não foi lido e guarda no cache", async (t) => {
  const pasta = await mkdtemp(join(tmpdir(), "leitor-teste-"));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const cache = join(pasta, "sub", "leituras.json");
  const baixados = [];
  const vistos = [];
  const fazerFetch = async (url) => { baixados.push(url); return url.includes("quebrada") ? { ok: false } : resposta("img"); };
  const rodar = async (dir) => {
    const { readdir } = await import("node:fs/promises");
    const arquivos = (await readdir(dir)).sort();
    vistos.push(arquivos);
    return arquivos.map((a) => ({ arquivo: a, produto: "P " + a, gramas: 500, preco: 3, unidade: "embalagem", condicao: null }));
  };
  const recs = [
    { id: "g1", imagem: "https://img/g1" }, { id: "g1", imagem: "https://img/g1" },
    { id: "g/2", imagem: "https://img/g2" }, { id: "g3", imagem: "https://img/quebrada" }, { id: "g4", imagem: null },
  ];
  const r1 = await lerRecortes(recs, { fazerFetch, rodar, cache });
  assert.deepEqual(vistos, [["g1.webp", "g_2.webp"]]); // repetido uma vez, id vira nome seguro
  assert.deepEqual(Object.keys(r1).sort(), ["g/2", "g1"]);
  assert.equal(r1.g1.gramas, 500);
  assert.match(r1.g1.lido_em, /^\d{4}-\d{2}-\d{2}$/);

  // Segunda vez: g1 e g/2 vêm do cache; só a quebrada tenta baixar de novo e a IA não roda.
  baixados.length = 0;
  const r2 = await lerRecortes(recs, { fazerFetch, rodar, cache });
  assert.deepEqual(baixados, ["https://img/quebrada"]);
  assert.equal(vistos.length, 1);
  assert.deepEqual(Object.keys(r2).sort(), ["g/2", "g1"]);
  assert.ok(JSON.parse(await readFile(cache, "utf8")).g1);
});

test("lerRecortes ignora leitura de arquivo que ela não mandou e aguenta cache estragado", async (t) => {
  const pasta = await mkdtemp(join(tmpdir(), "leitor-teste-"));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const cache = join(pasta, "leituras.json");
  await writeFile(cache, "{estragado");
  const r = await lerRecortes([{ id: "a", imagem: "https://img/a" }], {
    fazerFetch: async () => resposta("x"),
    rodar: async () => [{ arquivo: "intruso.webp", gramas: 1 }, { arquivo: "/tmp/x/a.webp", gramas: 200, unidade: "embalagem" }],
    cache,
  });
  assert.deepEqual(Object.keys(r), ["a"]);
  assert.equal(r.a.gramas, 200);
});

test("lerRecortes não chama a IA quando nenhuma imagem baixou", async (t) => {
  const pasta = await mkdtemp(join(tmpdir(), "leitor-teste-"));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  let rodou = false;
  const r = await lerRecortes([{ id: "a", imagem: "https://img/a" }], {
    fazerFetch: async () => { throw new Error("sem rede"); }, rodar: async () => { rodou = true; return []; }, cache: join(pasta, "c.json"),
  });
  assert.deepEqual([r, rodou], [{}, false]);
});
