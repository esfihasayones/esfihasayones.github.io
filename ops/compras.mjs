// Lista de compras de uma produção, com o mercado mais barato de cada item.
//   node ops/compras.mjs calabresa=12 carne=10 queijo=8 marguerita=6
//   node ops/compras.mjs carne=10 --json      (saída em JSON, com foto e link)
// As quantidades da receita são estimadas (functions/_lib/receitas.js).
import { INGREDIENTES, insumos } from "../functions/_lib/receitas.js";
import { MERCADOS, buscar, melhor } from "../functions/_lib/mercados.js";

const args = process.argv.slice(2);
const emJson = args.includes("--json");
const itens = {};
for (const a of args.filter((a) => a.includes("="))) {
  const [sabor, n] = a.split("=");
  itens[sabor] = Number(n);
}
if (!Object.keys(itens).length) {
  console.error("Uso: node ops/compras.mjs calabresa=12 carne=10 [--json]");
  process.exit(1);
}

const precisa = insumos(itens);
const reais = (c) => "R$ " + (c / 100).toFixed(2).replace(".", ",");
const peso = (g) => (g >= 1000 ? (g / 1000).toFixed(2).replace(".", ",") + " kg" : Math.ceil(g) + " g");

// Um mercado por vez em paralelo, e dentro dele um ingrediente por vez, pra
// não martelar o site de ninguém.
const achados = {}; // achados[ing][mercado] = melhor oferta ou null
const erros = [];
await Promise.all(MERCADOS.map(async (m) => {
  for (const ing of Object.keys(precisa)) {
    achados[ing] ??= {};
    try {
      achados[ing][m.id] = melhor(await buscar(m, INGREDIENTES[ing]), precisa[ing]);
    } catch (e) {
      achados[ing][m.id] = null;
      erros.push(`${m.nome}, ${INGREDIENTES[ing].nome}: ${e.message}`);
    }
  }
}));

const linhas = Object.keys(precisa).map((ing) => {
  const porMercado = achados[ing];
  const opcoes = Object.values(porMercado).filter(Boolean).sort((a, b) => a.centavos - b.centavos);
  return { ingrediente: ing, nome: INGREDIENTES[ing].nome, gramas: precisa[ing], melhor: opcoes[0] || null, porMercado };
});

// Total comprando tudo num mercado só (só quando ele tem todos os itens).
const tudoNum = MERCADOS.map((m) => {
  const faltam = linhas.filter((l) => !l.porMercado[m.id]).map((l) => l.nome);
  const total = linhas.reduce((s, l) => s + (l.porMercado[m.id]?.centavos || 0), 0);
  return { mercado: m.nome, total, faltam };
});
const separado = linhas.reduce((s, l) => s + (l.melhor?.centavos || 0), 0);
const nEsfihas = Object.values(itens).reduce((s, n) => s + n, 0);

if (emJson) {
  console.log(JSON.stringify({ itens, linhas, tudoNum, separado, erros }, null, 2));
  process.exit(0);
}

console.log(`\nCompras pra ${nEsfihas} esfihas (${Object.entries(itens).map(([s, n]) => `${n} ${s}`).join(", ")})`);
console.log("Receita estimada; preço do site de cada mercado, consultado agora.\n");
for (const l of linhas) {
  const b = l.melhor;
  if (!b) { console.log(`- ${l.nome}: ${peso(l.gramas)}. Não achei em nenhum mercado.`); continue; }
  const nomeMercado = MERCADOS.find((m) => m.id === b.mercado).nome;
  const promo = b.promocao ? ` (promoção, era ${reais(b.promocao * b.unidades)})` : "";
  const qtd = b.granel ? peso(b.unidades * b.gramas) : `${b.unidades}x`;
  console.log(`- ${l.nome}: precisa ${peso(l.gramas)}. ${nomeMercado}: ${qtd} ${b.nome}, ${reais(b.centavos)}${promo}, ${reais(b.porKg)}/kg`);
}
console.log(`\nCada item no mais barato: ${reais(separado)}`);
for (const t of tudoNum) {
  console.log(`Tudo no ${t.mercado}: ${reais(t.total)}` + (t.faltam.length ? ` (faltou: ${t.faltam.join(", ")})` : ""));
}
console.log("\nO total conta a embalagem fechada; sobra pra próxima produção.");
if (erros.length) console.log("\nNão consegui consultar:\n  " + erros.join("\n  "));
