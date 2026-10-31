// Dados de mentira da lista de compras, usados pelos testes da página.
// Montados pra dar as três opções:
//   1 mercado: Giassi, 345 + 2330 + 250 + 178 = 3103
//   2 mercados: Fort + Giassi, 345 + 1806 + 250 + 178 = 2579
//   mais barato: Angeloni + Atacadão + Fort, 329 + 1806 + 219 + 150 = 2504
// e o ovo, que ninguém tem.
import { planejar, opcoesDeCompra } from "../../functions/_lib/compras.js";

const of = (m, preco, gramas, nome, x = {}) => ({
  mercado: m, nome, marca: null, gramas, granel: false, preco, porKg: Math.round(preco / gramas * 1000),
  link: "https://x/" + encodeURIComponent(m), imagem: null, promocao: null, ...x,
});

export function dadosDeExemplo(extra = {}) {
  const encarte = (fim) => ({ id: "1", titulo: "Ofertas", fim, nacional: false });
  const linhas = planejar({ farinha: 1000, mucarela: 660, oregano: 3, sal: 48, ovo: 10 }, {
    farinha: [of("Angeloni", 329, 1000, "Farinha Nordeste 1kg", { promocao: 369 }), of("Giassi", 345, 1000, "Farinha Garota 1kg")],
    mucarela: [
      of("Giassi", 2330, 1000, "Muçarela Della Vita 1kg"),
      of("Angeloni", 2500, 1000, "Muçarela Conaprole 1kg"),
      of("Fort Atacadista (encarte)", 258, 100, "Mussarela <b>Tirol</b> \"peça\"", { granel: true, encarte: encarte("2026-11-01"), condicao: "Clube Mais" }),
    ],
    oregano: [of("Angeloni", 219, 3, "Orégano 3g"), of("Giassi", 250, 7, "Orégano 7g")],
    sal: [of("Giassi", 178, 1000, "Sal Zizo 1kg"), of("Atacadão (encarte)", 150, 1000, "Sal Cisne 1kg", { encarte: { ...encarte("2026-11-03"), nacional: true } })],
  }, { farinha: "Farinha de trigo", mucarela: "Muçarela", oregano: "Orégano", sal: "Sal", ovo: "Ovo" });
  return {
    hoje: "2026-10-31", itens: { calabresa: 12, carne: 0, queijo: 12 }, linhas, opcoes: opcoesDeCompra(linhas),
    encartes: [{ mercado: "Fort Atacadista", titulo: "Ofertas", fim: "2026-11-01" }], erros: [], leituras: 1, ...extra,
  };
}
