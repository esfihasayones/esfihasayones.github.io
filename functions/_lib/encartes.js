// Encartes de supermercado de Florianópolis pelo Tiendeo. A página de cada
// rede traz, no JSON do Next (`__NEXT_DATA__`), os encartes de várias redes da
// cidade com começo e fim; a página do encarte traz os produtos já recortados
// (`flyerGibs`), quase sempre com nome, marca e preço, mas sem o peso, que só
// está na imagem do recorte. Não é API oficial: pode mudar sem aviso.
export const TIENDEO = "https://www.tiendeo.com.br";
// Páginas que, juntas, cobrem os encartes de supermercado da cidade.
export const PAGINAS_TIENDEO = [
  "carrefour", "angeloni", "atacadao", "bistek-supermercados", "supermercados-imperatriz",
  "fort-atacadista", "komprao-atacadista", "supermercados-magia", "macro-atacado-treichel", "assai-atacadista",
];
// Categoria "Supermercados" do Tiendeo (fora ficam operadora, farmácia etc.).
const SUPERMERCADOS = "5";

export function dadosNext(html) {
  const m = String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

// Todo objeto do JSON que passa no teste, em qualquer profundidade.
function coletar(x, teste, saida = []) {
  if (Array.isArray(x)) for (const v of x) coletar(v, teste, saida);
  else if (x && typeof x === "object") {
    if (teste(x)) saida.push(x);
    for (const v of Object.values(x)) coletar(v, teste, saida);
  }
  return saida;
}

// Encartes citados na página de uma rede, sem repetir. O Tiendeo manda os
// encartes de loja perto com `distance` e os nacionais (da rede no Brasil
// todo, como a "LÂMINA RIO DE JANEIRO" do Carrefour) sem ela: esses viram
// `nacional` e só entram quando pedidos.
export function listaEncartes(html) {
  const d = dadosNext(html);
  if (!d) return [];
  const vistos = new Map();
  for (const f of coletar(d, (x) => x.type === "flyer" && x.start_date && x.end_date && x.title)) {
    const id = String(f.id);
    const antes = vistos.get(id);
    vistos.set(id, {
      id,
      mercado: f.retailerName || "Rede " + f.retailer_id,
      titulo: String(f.title).trim(),
      inicio: f.start_date.slice(0, 10),
      fim: f.end_date.slice(0, 10),
      categoria: String(f.category_id),
      nacional: (antes ? antes.nacional : true) && !("distance" in f),
    });
  }
  return [...vistos.values()];
}

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Meses que o título cita: o nome inteiro ("Ofertas de Outubro") ou a
// abreviação colada num número ("05 a 11 JAN 26", "jan/26"), pra "Frutos do
// Mar" não virar março.
export function mesesNoTitulo(titulo) {
  // "Rio de Janeiro" é cidade, não mês.
  const t = String(titulo).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/rio de janeiro/g, "");
  return MESES.map((nome, i) => {
    const ab = nome.slice(0, 3);
    const achou = new RegExp(`\\b${nome}\\b`).test(t)
      || new RegExp(`\\d[\\s/.-]{0,3}${ab}\\b|\\b${ab}[\\s/.-]{0,3}\\d`).test(t);
    return achou ? i + 1 : 0;
  }).filter(Boolean);
}

// O título cita um mês que não está no período do encarte? ("Food Service
// 05 a 11 JAN 26" marcado como válido de maio a novembro.) Aí não dá pra
// confiar no preço: o encarte pode ser velho republicado.
export function tituloForaDoPeriodo(e) {
  const citados = mesesNoTitulo(e.titulo);
  if (!citados.length) return false;
  const de = Number(e.inicio.slice(5, 7)), ate = Number(e.fim.slice(5, 7));
  const anos = Number(e.fim.slice(0, 4)) - Number(e.inicio.slice(0, 4));
  const noPeriodo = (m) => anos > 1 || (anos === 1 ? m >= de || m <= ate : m >= de && m <= ate);
  return !citados.some(noPeriodo);
}

// Encartes de supermercado que valem em `hoje` (AAAA-MM-DD, horário de
// Brasília), sem os nacionais (a não ser com `nacionais`) e sem os de título
// com outro mês.
export const validosHoje = (encartes, hoje, { nacionais = false } = {}) =>
  encartes.filter((e) => e.categoria === SUPERMERCADOS && e.inicio <= hoje && hoje <= e.fim
    && (nacionais || !e.nacional) && !tituloForaDoPeriodo(e));

const centavos = (txt) => {
  const n = Number(String(txt || "").replace(",", "."));
  return n > 0 ? Math.round(n * 100) : null;
};

// Produtos recortados de um encarte.
export function recortes(html) {
  const d = dadosNext(html);
  if (!d) return [];
  const vistos = new Map();
  for (const lista of coletar(d, (x) => Array.isArray(x.flyerGibs))) {
    for (const g of lista.flyerGibs) {
      const s = g.settings || {};
      vistos.set(g.id, {
        id: g.id,
        encarte: String(g.flyer_id),
        mercado: g.retailerName || null,
        titulo: String(g.title || "").trim(),
        marca: s.brand || null,
        preco: centavos(s.price_extended?.digits),
        pagina: Number(s.flyer_page) || null,
        imagem: g.image || null,
      });
    }
  }
  return [...vistos.values()];
}

// Oferta (no formato de mercados.js) a partir do recorte e da leitura da
// imagem ({gramas, preco, unidade, condicao}). O preço do Tiendeo vale mais
// que o lido; o lido só entra quando o Tiendeo não tem. Preço por quilo vira
// granel em passos de 100 g.
export function ofertaDoRecorte(rec, leitura, encarte) {
  const reais = rec.preco ?? centavos(leitura?.preco);
  const porKg = leitura?.unidade === "kg";
  const gramas = porKg ? 100 : Number(leitura?.gramas) || null;
  if (!reais || !gramas) return null;
  const preco = porKg ? Math.round(reais / 10) : reais;
  return {
    mercado: rec.mercado + " (encarte)", nome: leitura?.produto || rec.titulo, marca: rec.marca, gramas, granel: porKg,
    preco, promocao: null, porKg: Math.round((preco / gramas) * 1000),
    link: `${TIENDEO}/Catalogos/${rec.encarte}`, imagem: rec.imagem,
    encarte: encarte ? { id: encarte.id, titulo: encarte.titulo, fim: encarte.fim, nacional: !!encarte.nacional } : null,
    condicao: leitura?.condicao || null,
  };
}
