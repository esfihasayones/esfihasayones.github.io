// Lista de compras de uma produção, com onde comprar cada ingrediente.
//   node ops/compras.mjs calabresa=12 carne=10 queijo=8 marguerita=6
//   ... --html compras.html   (página pra usar no celular, com o roteiro)
//   ... --json                (tudo em JSON)
//   ... --sem-encartes        (só os sites, sem Tiendeo nem IA)
//   ... --nacionais           (inclui encartes nacionais, marcados "confira na loja")
// Fontes: o site do Bistek, Giassi e Angeloni (functions/_lib/mercados.js) e
// os encartes de Florianópolis no Tiendeo (functions/_lib/encartes.js), com a
// IA lendo o peso na imagem (ops/leitor-encarte.mjs). Receita estimada em
// receitas.js; a conta de onde comprar em functions/_lib/compras.js.
import { writeFile } from "node:fs/promises";
import { INGREDIENTES, RECHEIOS, insumos } from "../functions/_lib/receitas.js";
import { MERCADOS, buscar, combina, pesoGramas } from "../functions/_lib/mercados.js";
import { TIENDEO, PAGINAS_TIENDEO, listaEncartes, validosHoje, recortes, ofertaDoRecorte } from "../functions/_lib/encartes.js";
import { planejar, opcoesDeCompra, roteiro } from "../functions/_lib/compras.js";
import { lerRecortes } from "./leitor-encarte.mjs";
import { pagina, quanto } from "./compras-pagina.mjs";

const USO = "Uso: node ops/compras.mjs calabresa=12 carne=10 [--html arquivo] [--json] [--sem-encartes] [--nacionais]";
const args = process.argv.slice(2);
const emJson = args.includes("--json");
const semEncartes = args.includes("--sem-encartes");
const nacionais = args.includes("--nacionais");
const html = args.includes("--html") ? args[args.indexOf("--html") + 1] : null;
const itens = {};
for (const a of args.filter((a) => a.includes("="))) {
  const [sabor, n] = a.split("=");
  const qtd = Number(n);
  if (!RECHEIOS[sabor]) { console.error(`Sabor desconhecido: ${sabor}. Sabores: ${Object.keys(RECHEIOS).join(", ")}.`); process.exit(1); }
  if (!Number.isInteger(qtd) || qtd < 0 || qtd > 2000) { console.error(`Quantidade inválida pra ${sabor}: ${n}.`); process.exit(1); }
  itens[sabor] = qtd;
}
if (!Object.values(itens).some((n) => n > 0) || (args.includes("--html") && (!html || html.startsWith("--")))) {
  console.error(USO);
  process.exit(1);
}

const precisa = insumos(itens);
const ings = Object.keys(precisa);
const reais = (c) => "R$ " + (c / 100).toFixed(2).replace(".", ",");
const peso = (g) => (g >= 1000 ? (g / 1000).toFixed(2).replace(".", ",") + " kg" : Math.ceil(g) + " g");
const dataBR = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
// Prazo novo a cada consulta: um AbortSignal só venceria pra todas juntas.
const UA = () => ({ headers: { "user-agent": "Mozilla/5.0 (esfihas-sayones compras)" }, signal: AbortSignal.timeout(30000) });
const log = (m) => { if (!emJson) process.stderr.write(m + "\n"); };

const ofertas = Object.fromEntries(ings.map((i) => [i, []]));
const erros = [];

// Sites: um mercado por vez em paralelo, e dentro dele um ingrediente por
// vez, pra não martelar o site de ninguém.
log("Consultando os sites...");
await Promise.all(MERCADOS.map(async (m) => {
  for (const ing of ings) {
    try { ofertas[ing].push(...await buscar(m, INGREDIENTES[ing])); }
    catch (e) { erros.push(`${m.nome}, ${INGREDIENTES[ing].nome}: ${e.message}`); }
  }
}));

// Encartes: junta os de supermercado de Florianópolis que valem hoje, pega os
// recortes que casam com algum ingrediente e manda pra IA só os que não dizem
// o peso no título.
const encartesUsados = [];
let lidosPelaIA = 0;
if (!semEncartes) {
  log("Lendo os encartes do Tiendeo...");
  const encartes = new Map();
  for (const p of PAGINAS_TIENDEO) {
    try {
      const r = await fetch(`${TIENDEO}/florianopolis/${p}`, UA());
      if (!r.ok) throw new Error("HTTP " + r.status);
      for (const e of validosHoje(listaEncartes(await r.text()), hoje, { nacionais })) {
        // A mesma rede aparece em várias páginas; local ganha de nacional.
        if (!encartes.has(e.id) || !e.nacional) encartes.set(e.id, e);
      }
    } catch (e) { erros.push(`Tiendeo ${p}: ${e.message}`); }
  }
  const casados = [];
  for (const e of encartes.values()) {
    try {
      const r = await fetch(`${TIENDEO}/Catalogos/${e.id}`, UA());
      if (!r.ok) throw new Error("HTTP " + r.status);
      const recs = recortes(await r.text()).filter((rec) => rec.encarte === e.id);
      encartesUsados.push({ ...e, produtos: recs.length });
      for (const rec of recs) for (const ing of ings) if (combina(rec.titulo, INGREDIENTES[ing])) casados.push({ rec, ing, e });
    } catch (err) { erros.push(`encarte ${e.mercado} "${e.titulo}": ${err.message}`); }
  }
  const semPeso = [...new Map(casados.filter((c) => !pesoGramas(c.rec.titulo)).map((c) => [c.rec.id, c.rec])).values()];
  let leituras = {};
  if (semPeso.length) {
    log(`A IA vai ler ${semPeso.length} produto(s) de encarte (os já lidos ficam guardados)...`);
    try { leituras = await lerRecortes(semPeso); }
    catch (err) { erros.push("leitura dos encartes pela IA: " + err.message); }
  }
  for (const { rec, ing, e } of casados) {
    const lida = leituras[rec.id];
    // O título do Tiendeo é curto ("Sol - Carne De Bovina"): o nome lido na
    // imagem confere de novo se é mesmo o ingrediente.
    if (lida?.produto && !combina(lida.produto, INGREDIENTES[ing])) continue;
    const o = ofertaDoRecorte(rec, lida || { gramas: pesoGramas(rec.titulo), unidade: "embalagem" }, e);
    if (!o) continue;
    if (lida) { o.lidoPelaIA = true; lidosPelaIA++; }
    ofertas[ing].push(o);
  }
}

const nomes = Object.fromEntries(ings.map((i) => [i, INGREDIENTES[i].nome]));
const linhas = planejar(precisa, ofertas, nomes);
const opcoes = opcoesDeCompra(linhas);
const resultado = { hoje, itens, linhas, opcoes, encartes: encartesUsados, erros, leituras: lidosPelaIA };
const nEsfihas = Object.values(itens).reduce((s, n) => s + n, 0);

if (emJson) {
  console.log(JSON.stringify(resultado, null, 2));
} else {
  console.log(`\nCompras pra ${nEsfihas} esfihas (${Object.entries(itens).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(", ")}), preços de ${dataBR(hoje)}`);
  for (const op of opcoes) {
    console.log(`\n${op.rotulo}: ${reais(op.total)}`);
    for (const g of roteiro(op)) {
      console.log(`  ${g.mercado} (${reais(g.total)})`);
      for (const i of g.itens) {
        const o = i.oferta;
        const extra = [o.promocao && "promoção", o.encarte && `encarte até ${dataBR(o.encarte.fim)}`, o.encarte?.nacional && "nacional", o.condicao].filter(Boolean).join("; ");
        console.log(`    - ${i.nome} (${peso(i.gramas)}): ${quanto(o)} ${o.nome}, ${reais(o.centavos)}${extra ? ` (${extra})` : ""}`);
      }
    }
    if (op.faltam.length) console.log(`  Não achei: ${op.faltam.join(", ")}`);
  }
  if (!opcoes.length) console.log("\nNão achei nenhum ingrediente.");
  if (encartesUsados.length) console.log(`\nEncartes lidos: ${encartesUsados.map((e) => `${e.mercado} "${e.titulo}" até ${dataBR(e.fim)}`).join("; ")}`);
  console.log("\nReceita estimada. O total conta a embalagem fechada; sobra pra próxima produção.");
  if (erros.length) console.log("\nNão consegui consultar:\n  " + erros.join("\n  "));
}

if (html) {
  if (!opcoes.length) { console.error("Sem nenhuma oferta, não gravei a página."); process.exit(1); }
  await writeFile(html, pagina(resultado, roteiro));
  log(`Página gravada em ${html}`);
}
