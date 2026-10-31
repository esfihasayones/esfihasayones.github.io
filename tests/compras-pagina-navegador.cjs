// A página da lista de compras num navegador de verdade: troca de opção,
// marcar o que pegou (guarda e sincroniza entre opções), largura do celular
// ao computador sem estourar, tema escuro e teclado.
//   node tests/compras-pagina-navegador.cjs [chromium|firefox|webkit]
const pw = require(process.env.HOME + "/.npm/_npx/e41f203b7505f1fb/node_modules/playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };

(async () => {
  const { dadosDeExemplo } = await import("./api/compras-exemplo.mjs");
  const { pagina } = await import("../ops/compras-pagina.mjs");
  const { roteiro } = await import("../functions/_lib/compras.js");
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "compras-pagina-"));
  const arquivo = path.join(pasta, "compras.html");
  fs.writeFileSync(arquivo, pagina(dadosDeExemplo(), roteiro));
  const url = "file://" + arquivo;

  const motor = process.argv[2] || "chromium";
  const b = await pw[motor].launch();
  try {
    // Larguras: nada pode passar da tela (mede cada elemento, não o scrollWidth).
    for (const largura of [320, 360, 390, 768, 1280]) {
      const p = await b.newPage({ viewport: { width: largura, height: 800 } });
      await p.goto(url);
      const fora = await p.evaluate(() => [...document.querySelectorAll("body *")]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 0.5; })
        .map((e) => e.className || e.tagName));
      ok(!fora.length, `${largura}px: passa da tela: ${fora.slice(0, 3).join(", ")}`);
      // Alvo de toque: aba e linha do item com pelo menos 44 px.
      const pequenos = await p.evaluate(() => [...document.querySelectorAll(".aba, .painel:not([style*=none]) .item-corpo")]
        .filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).length);
      ok(!pequenos, `${largura}px: ${pequenos} alvo(s) de toque menores que 44 px`);
      await p.close();
    }

    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto(url);
    const visivel = () => p.evaluate(() => [...document.querySelectorAll(".painel")].map((x) => getComputedStyle(x).display !== "none"));
    const abas = await p.$$(".aba");
    const inicial = await visivel();
    ok(inicial.filter(Boolean).length === 1, "deveria abrir com um painel só");

    // Troca de opção pelo toque.
    await abas[0].click();
    const depois = await visivel();
    ok(depois[0] && depois.filter(Boolean).length === 1, "tocar na primeira aba mostra só o primeiro painel");

    // Marcar um item: risca, conta, guarda e marca o mesmo item nas outras opções.
    const caixa = p.locator(".p0 .item input").first();
    const chave = await caixa.getAttribute("data-chave");
    await p.locator(".p0 .item .item-corpo").first().click();
    ok(await caixa.isChecked(), "tocar na linha marca o item");
    const progresso = await p.textContent("#progresso");
    ok(/^1 de \d+ no carrinho$/.test(progresso), "progresso depois de marcar: " + progresso);
    const iguais = await p.$$eval(`.item input[data-chave="${chave}"]`, (l) => l.map((c) => c.checked));
    ok(iguais.every(Boolean), "o mesmo ingrediente fica marcado em todas as opções");
    await p.reload();
    ok(await p.locator(`.p0 .item input[data-chave="${chave}"]`).isChecked(), "marcação volta depois de recarregar");

    // Teclado: Tab chega nos rádios e as setas trocam de opção.
    await p.locator("#r0").focus();
    await p.keyboard.press("ArrowDown");
    const porTeclado = await visivel();
    ok(porTeclado[1] && !porTeclado[0], "seta troca de opção pelo teclado");

    // Comparar abre a lista dos outros mercados.
    await p.locator(".painel:visible .comparar summary").first().click();
    ok(await p.locator(".painel:visible .comparar[open] li").count() >= 1, "comparar mostra os mercados");

    // Sem localStorage (aba anônima com bloqueio) a página continua funcionando.
    const p2 = await b.newPage();
    await p2.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("bloqueado"); } }); });
    const erros = [];
    p2.on("pageerror", (e) => erros.push(e.message));
    await p2.goto(url);
    await p2.locator(".painel:visible .item .item-corpo").first().click();
    ok(!erros.length, "sem localStorage deu erro: " + erros.join("; "));
    ok(/no carrinho/.test(await p2.textContent("#progresso")), "sem localStorage o progresso ainda conta");

    // Tema escuro: fundo escuro e texto claro.
    const p3 = await b.newPage({ colorScheme: "dark" });
    await p3.goto(url);
    const [fundo, texto] = await p3.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color]);
    ok(fundo === "rgb(20, 20, 19)" && texto === "rgb(242, 241, 236)", `tema escuro: ${fundo} / ${texto}`);
  } finally {
    await b.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  }
  if (falhas.length) { console.log(`${motor}: ${falhas.length} falha(s)\n- ` + falhas.join("\n- ")); process.exit(1); }
  console.log(`${motor}: página da lista de compras ok`);
})().catch((e) => { console.error(e); process.exit(1); });
