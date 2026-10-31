// Página da lista de compras (um HTML só, sem nada de fora), pensada pra
// usar no celular dentro do mercado: escolhe em quantos mercados ir, vê o
// roteiro de cada um e marca o que já pegou (fica guardado no aparelho).
const reais = (c) => "R$ " + (c / 100).toFixed(2).replace(".", ",");
const peso = (g) => (g >= 1000 ? (g / 1000).toFixed(2).replace(".", ",").replace(/,00$/, "") + " kg" : Math.ceil(g) + " g");
const dataBR = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// O que comprar daquela oferta: "3x" pra embalagem, peso pro granel.
export const quanto = (o) => (o.granel ? peso(o.unidades * o.gramas) : `${o.unidades}x`);

function selos(o) {
  return [
    o.promocao ? `<span class="selo">promoção, era ${reais(o.promocao * o.unidades)}</span>` : "",
    o.encarte ? `<span class="selo selo-claro">encarte até ${dataBR(o.encarte.fim)}</span>` : "",
    o.encarte?.nacional ? `<span class="selo selo-alerta">encarte nacional, confira na loja</span>` : "",
    o.condicao ? `<span class="selo selo-claro">${esc(o.condicao)}</span>` : "",
  ].join("");
}

function item(i, linha, idOpcao) {
  const o = i.oferta;
  const id = `${idOpcao}-${i.ingrediente}`;
  const outros = linha.opcoes.map((x) =>
    `<li${x === o ? ' class="atual"' : ""}><span>${esc(x.mercado)}</span><span>${reais(x.centavos)}</span></li>`).join("");
  const foto = o.imagem ? `<img src="${esc(o.imagem)}" alt="" loading="lazy" width="56" height="56">` : `<span class="sem-foto" aria-hidden="true"></span>`;
  return `<li class="item">
  <input type="checkbox" id="${esc(id)}" data-chave="${esc(i.ingrediente)}">
  <label for="${esc(id)}" class="item-corpo">
    ${foto}
    <span class="item-texto">
      <span class="item-nome">${esc(i.nome)} <small>precisa ${peso(i.gramas)}</small></span>
      <span class="item-prod">${esc(quanto(o))} ${esc(o.nome)}${o.marca && !o.nome.toLowerCase().includes(String(o.marca).toLowerCase()) ? ` · ${esc(o.marca)}` : ""}</span>
      <span class="item-selos">${selos(o)}</span>
    </span>
    <span class="item-preco">${reais(o.centavos)}<small>${reais(o.porKg)}/kg</small></span>
  </label>
  <details class="comparar"><summary>Comparar ${linha.opcoes.length > 1 ? `com ${linha.opcoes.length - 1} mercado${linha.opcoes.length > 2 ? "s" : ""}` : "e abrir"}</summary>
    <ul>${outros}</ul>
    ${o.link ? `<a href="${esc(o.link)}" target="_blank" rel="noopener">Ver no ${o.encarte ? "encarte" : "site"}</a>` : ""}
  </details>
</li>`;
}

function painel(op, n, linhasPorIng, roteiroDe) {
  const grupos = roteiroDe(op).map((g) => `<section class="mercado">
  <h3>${esc(g.mercado)} <span>${g.itens.length} ${g.itens.length === 1 ? "item" : "itens"} · ${reais(g.total)}</span></h3>
  <ul class="itens">${g.itens.map((i) => item(i, linhasPorIng[i.ingrediente], `o${n}`)).join("")}</ul>
</section>`).join("");
  const faltam = op.faltam.length ? `<p class="aviso">Não achei em nenhum mercado: ${esc(op.faltam.join(", "))}.</p>` : "";
  return `<div class="painel p${n}">${grupos}${faltam}</div>`;
}

// dados: {hoje, itens, linhas, opcoes, encartes, erros, leituras}; roteiroDe: (opcao) => grupos.
export function pagina(dados, roteiroDe) {
  const { hoje, itens, linhas, opcoes, encartes = [], erros = [], leituras = 0 } = dados;
  const nEsfihas = Object.values(itens).reduce((s, n) => s + n, 0);
  const sabores = Object.entries(itens).filter(([, n]) => n > 0).map(([s, n]) => `<li>${n} ${esc(s)}</li>`).join("");
  const linhasPorIng = Object.fromEntries(linhas.map((l) => [l.ingrediente, l]));
  const maisCara = Math.max(...opcoes.map((o) => o.total));
  const padrao = opcoes.findIndex((o) => o.mercados.length === 2) >= 0 ? opcoes.findIndex((o) => o.mercados.length === 2) : 0;

  const radios = opcoes.map((_, n) => `<input type="radio" name="opcao" id="r${n}" class="radio" value="${n}"${n === padrao ? " checked" : ""}>`).join("");
  const abas = opcoes.map((o, n) => `<label for="r${n}" class="aba">
  <span class="aba-esq"><span class="aba-rotulo">${esc(o.rotulo)}</span><span class="aba-mercados">${esc(o.mercados.join(", "))}</span></span>
  <span class="aba-dir"><span class="aba-total">${reais(o.total)}</span>${o.total < maisCara ? `<span class="aba-extra">economiza ${reais(maisCara - o.total)}</span>` : ""}</span>
</label>`).join("");
  // Uma regra por opção: o rádio marcado mostra o painel e destaca a aba.
  const regras = opcoes.map((_, n) =>
    `#r${n}:checked~.paineis .p${n}{display:block}#r${n}:checked~.abas label[for=r${n}]{background:var(--tinta);color:var(--fundo);border-color:var(--tinta)}#r${n}:focus-visible~.abas label[for=r${n}]{outline:3px solid var(--foco);outline-offset:2px}`).join("");

  const listaEncartes = encartes.length ? `<details class="rodape-bloco"><summary>${encartes.length} encarte${encartes.length > 1 ? "s" : ""} lido${encartes.length > 1 ? "s" : ""}</summary><ul>${
    encartes.map((e) => `<li><span>${esc(e.mercado)}: ${esc(e.titulo)}</span><span>até ${dataBR(e.fim)}</span></li>`).join("")}</ul></details>` : "";
  const listaErros = erros.length ? `<details class="rodape-bloco"><summary>${erros.length} consulta${erros.length > 1 ? "s" : ""} não respondeu</summary><ul>${
    erros.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></details>` : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Compras pra ${nEsfihas} esfihas</title>
<style>
:root{--fundo:#F7F6F2;--cartao:#fff;--tinta:#121212;--suave:#5c5a55;--linha:#e3e1da;--foco:#2f6fde;--alerta:#8a4b00;--alerta-fundo:#fff1dc;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--fundo:#141413;--cartao:#1e1d1b;--tinta:#f2f1ec;--suave:#b0ada5;--linha:#34322e;--foco:#7aa7ff;--alerta:#ffc574;--alerta-fundo:#3a2a12;color-scheme:dark}}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--fundo);color:var(--tinta);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:1080px;margin:0 auto;padding:20px max(16px,env(safe-area-inset-right)) 48px max(16px,env(safe-area-inset-left))}
h1{font-size:clamp(1.4rem,5vw,1.9rem);line-height:1.15;margin:0}
.sabores{display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0;margin:10px 0 4px}
.sabores li{border:1px solid var(--linha);border-radius:999px;padding:2px 10px;font-size:.9rem;background:var(--cartao)}
.sub{color:var(--suave);margin:6px 0 0;font-size:.95rem}
.radio{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.layout{display:grid;gap:20px;margin-top:18px}
.abas{display:grid;gap:8px;align-content:start}
.aba{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:56px;padding:10px 14px;border:1px solid var(--linha);border-radius:12px;background:var(--cartao);cursor:pointer;-webkit-tap-highlight-color:transparent}
.aba-esq,.aba-dir{display:grid;gap:1px;min-width:0}.aba-dir{text-align:right;flex:none}
.aba-rotulo{font-weight:600}.aba-mercados{font-size:.85rem;opacity:.8;overflow-wrap:anywhere}
.aba-total{font-size:1.25rem;font-weight:700;font-variant-numeric:tabular-nums}
.aba-extra{font-size:.82rem;opacity:.85}
.progresso{margin:12px 0 0;font-size:.95rem;color:var(--suave)}
.painel{display:none}
.mercado{margin:0 0 18px}
.mercado h3{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;align-items:baseline;font-size:1.15rem;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid var(--tinta)}
.mercado h3 span{font-size:.9rem;font-weight:400;color:var(--suave)}
.itens{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.item{position:relative;background:var(--cartao);border:1px solid var(--linha);border-radius:12px}
.item input{position:absolute;left:14px;top:22px;width:24px;height:24px;margin:0;accent-color:var(--tinta);cursor:pointer}
.item-corpo{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:12px;align-items:start;padding:12px 12px 6px 50px;cursor:pointer;min-height:44px}
.item img,.sem-foto{width:56px;height:56px;object-fit:contain;border-radius:8px;background:#fff}
.sem-foto{display:block;border:1px dashed var(--linha);background:transparent}
.item-texto{display:grid;gap:2px;min-width:0}
.item-nome{font-weight:600}.item-nome small{font-weight:400;color:var(--suave)}
.item-prod{font-size:.92rem;overflow-wrap:anywhere}
.item-selos{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.selo{display:inline-block;background:var(--tinta);color:var(--fundo);font-size:.78rem;border-radius:6px;padding:1px 7px}
.selo-claro{background:transparent;color:var(--tinta);border:1px solid var(--linha)}
.selo-alerta{background:var(--alerta-fundo);color:var(--alerta)}
.item-preco{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.item-preco small{display:block;font-weight:400;font-size:.8rem;color:var(--suave)}
.item input:checked+.item-corpo{opacity:.5}
.item input:checked+.item-corpo .item-nome{text-decoration:line-through}
.item input:focus-visible{outline:3px solid var(--foco);outline-offset:2px}
.comparar{padding:0 12px 10px 50px;font-size:.9rem}
.comparar summary{cursor:pointer;color:var(--suave);min-height:32px;display:flex;align-items:center}
.comparar ul{list-style:none;padding:0;margin:4px 0 8px}
.comparar li{display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-top:1px dashed var(--linha)}
.comparar li.atual{font-weight:600}
.comparar a{color:var(--tinta)}
.aviso{background:var(--alerta-fundo);color:var(--alerta);border-radius:10px;padding:10px 12px}
.notas{margin-top:24px;font-size:.9rem;color:var(--suave)}
.notas p{margin:6px 0}
.rodape-bloco{margin-top:10px}
.rodape-bloco summary{cursor:pointer;min-height:32px;display:flex;align-items:center}
.rodape-bloco ul{list-style:none;padding:0;margin:4px 0}
.rodape-bloco li{display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-top:1px dashed var(--linha);overflow-wrap:anywhere}
@media (max-width:420px){
  .item-corpo{grid-template-columns:44px minmax(0,1fr);padding-right:10px}
  .item img,.sem-foto{width:44px;height:44px}
  .item-preco{grid-column:2;text-align:left;display:flex;gap:8px;align-items:baseline}
  .item-preco small{display:inline}
}
@media (min-width:900px){
  .layout{grid-template-columns:300px minmax(0,1fr);align-items:start}
  .lateral{position:sticky;top:16px}
}
${regras}
</style>
</head>
<body>
<main>
<header>
  <h1>Compras pra ${nEsfihas} esfihas</h1>
  <ul class="sabores">${sabores}</ul>
  <p class="sub">Preços de ${dataBR(hoje)}, dos sites e dos encartes que valem hoje.</p>
</header>
<div class="layout">
${radios}
<div class="lateral abas" aria-label="Em quantos mercados comprar">${abas}
  <p class="progresso" aria-live="polite" id="progresso"></p>
</div>
<div class="paineis">
${opcoes.map((op, n) => painel(op, n, linhasPorIng, roteiroDe)).join("\n")}
</div>
</div>
<section class="notas">
  <p>A quantidade de cada ingrediente sai de uma receita estimada. O total conta a embalagem fechada; o que sobra fica pra próxima produção.</p>
  <p>O preço do site pode ser outro na loja e no clube do mercado.${leituras ? ` A IA leu o peso de ${leituras} produto${leituras > 1 ? "s" : ""} na imagem do encarte: confira antes de comprar.` : ""}</p>
  ${listaEncartes}
  ${listaErros}
</section>
</main>
<script>
(function () {
  var chave = "compras-${esc(hoje)}-${nEsfihas}";
  var marcados = {};
  try { marcados = JSON.parse(localStorage.getItem(chave) || "{}"); } catch (e) {}
  var caixas = [].slice.call(document.querySelectorAll(".item input"));
  function contar() {
    var painel = document.querySelector(".radio:checked");
    var visiveis = caixas.filter(function (c) { return c.closest(".painel").classList.contains("p" + (painel ? painel.value : 0)); });
    var feitos = visiveis.filter(function (c) { return c.checked; }).length;
    document.getElementById("progresso").textContent = feitos ? feitos + " de " + visiveis.length + " no carrinho" : "";
  }
  caixas.forEach(function (c) {
    c.checked = !!marcados[c.dataset.chave];
    c.addEventListener("change", function () {
      marcados[c.dataset.chave] = c.checked;
      caixas.forEach(function (o) { if (o.dataset.chave === c.dataset.chave) o.checked = c.checked; });
      try { localStorage.setItem(chave, JSON.stringify(marcados)); } catch (e) {}
      contar();
    });
  });
  [].forEach.call(document.querySelectorAll(".radio"), function (r) { r.addEventListener("change", contar); });
  contar();
})();
</script>
</body>
</html>`;
}
