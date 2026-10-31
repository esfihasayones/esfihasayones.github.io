// Monta a lista de compras a partir das ofertas achadas (sites e encartes):
// a melhor de cada ingrediente em cada mercado, e o melhor jeito de comprar
// tudo indo a 1, 2 ou quantos mercados precisar. Sem rede: só conta.
import { melhor } from "./mercados.js";

// precisa: {ingrediente: gramas}; ofertas: {ingrediente: [oferta]};
// nomes: {ingrediente: nome pra mostrar}.
export function planejar(precisa, ofertas, nomes = {}) {
  return Object.keys(precisa).map((ing) => {
    const porMercado = new Map();
    for (const o of ofertas[ing] || []) {
      if (!porMercado.has(o.mercado)) porMercado.set(o.mercado, []);
      porMercado.get(o.mercado).push(o);
    }
    const opcoes = [...porMercado.values()].map((l) => melhor(l, precisa[ing]))
      .sort((a, b) => a.centavos - b.centavos || a.porKg - b.porKg || a.mercado.localeCompare(b.mercado));
    return { ingrediente: ing, nome: nomes[ing] || ing, gramas: precisa[ing], opcoes, melhor: opcoes[0] || null };
  });
}

function* subconjuntos(lista, k, inicio = 0, atual = []) {
  if (atual.length === k) { yield atual; return; }
  for (let i = inicio; i < lista.length; i++) yield* subconjuntos(lista, k, i + 1, [...atual, lista[i]]);
}

// O jeito mais barato de comprar tudo o que dá pra comprar indo a no máximo
// `k` mercados. Ingrediente que nenhum mercado tem não entra na conta (vai em
// `faltam`). Procura de 1 mercado pra cima e só troca por total menor, então
// empate fica com menos mercados e, no mesmo número, com a primeira
// combinação em ordem alfabética. Chegou no menor total possível (o mais
// barato de cada item), para: com mais mercados não tem como melhorar.
// Null quando nenhuma combinação de até `k` cobre tudo.
export function melhorCom(linhas, k) {
  const compraveis = linhas.filter((l) => l.opcoes.length);
  if (!compraveis.length) return null;
  const mercados = [...new Set(compraveis.flatMap((l) => l.opcoes.map((o) => o.mercado)))].sort();
  const minimo = compraveis.reduce((s, l) => s + l.opcoes[0].centavos, 0);
  let achada = null;
  for (let n = 1; n <= Math.min(k, mercados.length) && !(achada && achada.total === minimo); n++) {
    for (const conjunto of subconjuntos(mercados, n)) {
      const dentro = new Set(conjunto);
      const itens = [];
      let total = 0;
      let cobre = true;
      for (const l of compraveis) {
        const o = l.opcoes.find((x) => dentro.has(x.mercado)); // opcoes já vem do mais barato
        if (!o) { cobre = false; break; }
        itens.push({ ingrediente: l.ingrediente, nome: l.nome, gramas: l.gramas, oferta: o });
        total += o.centavos;
      }
      if (!cobre || (achada && total >= achada.total)) continue;
      achada = { mercados: [...new Set(itens.map((i) => i.oferta.mercado))].sort(), total, itens };
    }
  }
  if (!achada) return null;
  return { ...achada, faltam: linhas.filter((l) => !l.opcoes.length).map((l) => l.nome) };
}

// As opções que aparecem pra quem vai comprar: 1 mercado, 2 mercados e o
// mais barato de todos. Opção que não sai mais barata que uma anterior (com
// menos mercados) não aparece: não vale ir a mais um lugar pelo mesmo preço.
export function opcoesDeCompra(linhas) {
  const todos = new Set(linhas.flatMap((l) => l.opcoes.map((o) => o.mercado))).size;
  const lista = [];
  for (const k of [1, 2, todos]) {
    const p = k ? melhorCom(linhas, k) : null;
    if (!p || lista.some((x) => x.total <= p.total)) continue;
    const n = p.mercados.length;
    lista.push({ rotulo: n === 1 ? "1 mercado" : n === 2 && k === 2 ? "2 mercados" : "Mais barato", ...p });
  }
  return lista;
}

// Itens de uma opção agrupados por mercado, o de mais itens primeiro.
export function roteiro(opcao) {
  const grupos = new Map();
  for (const i of opcao.itens) {
    const m = i.oferta.mercado;
    if (!grupos.has(m)) grupos.set(m, { mercado: m, itens: [], total: 0 });
    const g = grupos.get(m);
    g.itens.push(i);
    g.total += i.oferta.centavos;
  }
  return [...grupos.values()].sort((a, b) => b.itens.length - a.itens.length || a.mercado.localeCompare(b.mercado));
}
