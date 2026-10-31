// Preço de ingrediente nos supermercados de Florianópolis que usam a loja
// VTEX, cuja busca pública devolve JSON com preço do dia e preço "de".
// Não é API oficial pra terceiros: pode mudar ou ser bloqueada sem aviso.
// O preço é o do site; a loja física e o preço de clube podem ser outros.
export const MERCADOS = [
  { id: "bistek", nome: "Bistek", site: "https://www.bistek.com.br" },
  { id: "giassi", nome: "Giassi", site: "https://www.giassi.com.br" },
  { id: "angeloni", nome: "Angeloni", site: "https://super.angeloni.com.br" },
];

export const semAcento = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const palavras = (s) => semAcento(s).split(/[^a-z0-9]+/).filter(Boolean);

// O produto é o ingrediente? Cada item de `exige` tem que ser uma palavra do
// nome (com "|" valendo qualquer uma), e com `inicio` o nome começa pelo
// primeiro deles; `proibe` descarta palavra que começa assim ("salgad" pega
// "salgadinho") ou, com espaço, o trecho do nome.
export function combina(nomeProduto, ing) {
  const nome = semAcento(nomeProduto);
  const ps = palavras(nomeProduto);
  const ok = ing.exige.every((alt) => alt.split("|").some((a) => ps.includes(a)));
  if (!ok || (ing.inicio && !ing.exige[0].split("|").includes(ps[0]))) return false;
  return !ing.proibe.some((x) => (x.includes(" ") ? nome.includes(x) : ps.some((p) => p.startsWith(x))));
}

// Peso da embalagem em gramas pelo nome ("Farinha 5kg", "Kit 2x 400g",
// "Óleo 900ml"), ou null quando não dá pra saber.
export function pesoGramas(nome) {
  const n = semAcento(nome).replace(/(\d),(\d)/g, "$1.$2");
  const multi = n.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|grs|l|lt|ml)\b/);
  const um = [...n.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|gr|grs|l|lt|ml)\b/g)].pop();
  const m = multi ? [null, multi[2], multi[3]] : um;
  if (!m) return /\bkg$/.test(n.trim()) ? 1000 : null;
  const valor = Number(m[1]) * (multi ? Number(multi[1]) : 1);
  return /^(kg|l|lt)$/.test(m[2]) ? valor * 1000 : valor;
}

// Ofertas de um produto da busca VTEX, uma por SKU com estoque. Produto
// vendido a granel (unidade "kg") tem `Price` por quilo e sai em passos de
// `unitMultiplier` kg.
export function ofertas(produto, mercado) {
  const lista = [];
  for (const item of produto.items || []) {
    const o = item.sellers?.[0]?.commertialOffer;
    if (!o || !(o.AvailableQuantity > 0) || !(o.Price > 0)) continue;
    const nome = item.nameComplete || produto.productName;
    const granel = item.measurementUnit === "kg";
    const gramas = granel ? Math.round(item.unitMultiplier * 1000) : pesoGramas(nome);
    if (!gramas) continue;
    const preco = granel ? o.Price * item.unitMultiplier : o.Price;
    const precoDe = granel ? o.ListPrice * item.unitMultiplier : o.ListPrice;
    lista.push({
      mercado: mercado.nome, nome, marca: produto.brand || null, gramas, granel,
      preco: Math.round(preco * 100), // centavos por embalagem (ou por passo do granel)
      promocao: precoDe > preco + 0.005 ? Math.round(precoDe * 100) : null,
      porKg: Math.round((preco / gramas) * 1000 * 100),
      link: produto.link || null,
      imagem: item.images?.[0]?.imageUrl || null,
    });
  }
  return lista;
}

// Quanto custa levar `gramas` com essa oferta: embalagem fechada, então
// arredonda pra cima (no granel, em passos).
export function custoPara(oferta, gramas) {
  const unidades = Math.ceil(gramas / oferta.gramas);
  return { unidades, centavos: unidades * oferta.preco };
}

// A oferta que sai mais barata pra levar `gramas`; empate vai pro menor preço
// por quilo, que deixa sobra mais útil.
export function melhor(lista, gramas) {
  let escolhida = null;
  for (const o of lista) {
    const c = custoPara(o, gramas).centavos;
    if (!escolhida || c < escolhida.c || (c === escolhida.c && o.porKg < escolhida.o.porKg)) escolhida = { o, c };
  }
  return escolhida ? { ...escolhida.o, ...custoPara(escolhida.o, gramas) } : null;
}

// Busca o ingrediente no mercado e devolve só o que combina com ele.
export async function buscar(mercado, ing, fazerFetch = fetch) {
  const url = `${mercado.site}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(ing.busca)}&_from=0&_to=39`;
  const r = await fazerFetch(url, { headers: { "user-agent": "Mozilla/5.0 (esfihas-sayones compras)" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${mercado.nome}: HTTP ${r.status}`);
  const produtos = await r.json();
  return produtos.flatMap((p) => ofertas(p, mercado)).filter((o) => combina(o.nome, ing));
}
