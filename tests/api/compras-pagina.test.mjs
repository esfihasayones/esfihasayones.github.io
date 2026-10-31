// Página da lista de compras gerada a partir de dados de mentira. O
// comportamento no navegador está em tests/compras-pagina-navegador.cjs.
import test from "node:test";
import assert from "node:assert/strict";
import { pagina, quanto } from "../../ops/compras-pagina.mjs";
import { roteiro } from "../../functions/_lib/compras.js";
import { dadosDeExemplo } from "./compras-exemplo.mjs";

test("quanto: unidades pra embalagem e peso pro granel", () => {
  assert.equal(quanto({ granel: false, unidades: 3, gramas: 1000 }), "3x");
  assert.equal(quanto({ granel: true, unidades: 7, gramas: 100 }), "700 g");
  assert.equal(quanto({ granel: true, unidades: 12, gramas: 100 }), "1,20 kg");
  assert.equal(quanto({ granel: true, unidades: 10, gramas: 100 }), "1 kg");
});

test("página mostra cada opção, o roteiro e os avisos", () => {
  const d = dadosDeExemplo();
  const h = pagina(d, roteiro);
  assert.match(h, /<title>Compras pra 24 esfihas<\/title>/);
  assert.equal((h.match(/class="aba"/g) || []).length, d.opcoes.length);
  assert.equal((h.match(/<input type="radio"/g) || []).length, d.opcoes.length);
  // Sabor com zero não aparece na lista de sabores.
  assert.doesNotMatch(h, /<li>0 carne<\/li>/);
  assert.match(h, /Não achei em nenhum mercado: Ovo\./);
  assert.match(h, /encarte até 01\/11/);
  assert.match(h, /Clube Mais/);
  assert.match(h, /promoção, era R\$ 3,69/);
  assert.match(h, /encarte nacional, confira na loja/);
  assert.match(h, /A IA leu o peso de 1 produto na imagem do encarte/);
  assert.match(h, /1 encarte consultado, 1 com ingrediente da lista/);
  const varios = pagina(dadosDeExemplo({ encartes: [{ mercado: "Fort", titulo: "Ofertas", fim: "2026-11-01", ofertas: 2 }, { mercado: "Bistek", titulo: "Flores", fim: "2026-12-31", ofertas: 0 }] }), roteiro);
  assert.match(varios, /2 encartes consultados, 1 com ingrediente da lista/);
  assert.doesNotMatch(varios, /Flores/);
});

test("página escapa o que vem dos mercados", () => {
  const h = pagina(dadosDeExemplo(), roteiro);
  assert.doesNotMatch(h, /<b>Tirol<\/b>/);
  assert.match(h, /Mussarela &lt;b&gt;Tirol&lt;\/b&gt; &quot;peça&quot;/);
  const ruim = dadosDeExemplo({ encartes: [{ mercado: "<img src=x onerror=alert(1)>", titulo: "t", fim: "2026-11-01" }], erros: ["<script>alert(1)</script>"] });
  const h2 = pagina(ruim, roteiro);
  assert.doesNotMatch(h2, /<img src=x/);
  assert.doesNotMatch(h2, /<script>alert/);
  // Link e foto que não são http(s) não entram (o exemplo do Giassi tem foto javascript:).
  assert.doesNotMatch(h, /javascript:/);
});

test("marcação guardada é por lista: mesmo dia e mesmo total com outros sabores não divide", () => {
  const a = pagina(dadosDeExemplo({ itens: { calabresa: 12 } }), roteiro).match(/var chave = (.*);/)[1];
  const b = pagina(dadosDeExemplo({ itens: { carne: 12 } }), roteiro).match(/var chave = (.*);/)[1];
  assert.notEqual(a, b);
  assert.equal(JSON.parse(a), "compras-2026-10-31-calabresa12");
});

test("página abre na opção de 2 mercados quando existe, senão na primeira", () => {
  const d = dadosDeExemplo();
  const n2 = d.opcoes.findIndex((o) => o.mercados.length === 2);
  assert.ok(n2 >= 0);
  assert.match(pagina(d, roteiro), new RegExp(`id="r${n2}" class="radio" value="${n2}" checked`));
  const so1 = { ...d, opcoes: d.opcoes.filter((o) => o.mercados.length !== 2) };
  assert.match(pagina(so1, roteiro), /id="r0" class="radio" value="0" checked/);
});

test("texto da página sem travessão", () => {
  const h = pagina(dadosDeExemplo(), roteiro);
  assert.ok(!h.includes("—"), "travessão na página");
});
