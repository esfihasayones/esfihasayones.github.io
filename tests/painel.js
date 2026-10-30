/*
 * Testes do painel (/painel/), contra a API local de verdade.
 *
 * O navegador não consegue zerar o banco, então cada teste cria os próprios
 * pedidos num dia sorteado entre 2031 e 2090 que ainda esteja vazio e abre o painel
 * naquele dia (?dia=AAAA-MM-DD). Os nomes levam um sufixo único. A rede de
 * mentira de tests/index.html vale só pro iframe do site em "/"; o painel roda
 * num iframe próprio, criado aqui, e fala com a API real.
 */
(function (global) {
  "use strict";
  var S = global.SUITE, A = S.A;
  function teste(nome, fn) { S.testes.push({ grupo: "Painel", nome: nome, fn: fn }); }

  var ITACORUBI = 1;   // índice em PONTOS (o POST do site usa o índice)
  var dormir = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var sufixo = function () { return Math.random().toString(36).slice(2, 8); };
  var uuid = function () { return (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : "t-" + Date.now() + "-" + sufixo(); };

  async function api(metodo, caminho, corpo) {
    var r = await fetch(caminho, {
      method: metodo,
      headers: corpo ? { "content-type": "application/json" } : {},
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    var j = null;
    try { j = await r.json(); } catch (e) {}
    if (metodo === "POST" && j && j.id && /^\/api\/(pedidos|painel\/pedidos)$/.test(caminho)) criados.push(j.id);
    return { status: r.status, json: j };
  }
  // Pedidos criados no teste: no fim, cancelados, senão entram na fila de
  // outro teste (a fila olha duas semanas pra trás e 90 dias pra frente).
  var criados = [];
  async function cancelarCriados() {
    var ids = criados; criados = [];
    for (var i = 0; i < ids.length; i++) await api("PATCH", "/api/painel/pedidos/" + ids[i], { status: "cancelado" });
  }

  async function esperar(cond, msg, limite) {
    var fim = Date.now() + (limite || 6000);
    for (;;) {
      var v;
      try { v = cond(); } catch (e) { v = false; }
      if (v) return v;
      if (Date.now() > fim) throw new Error("tempo esgotado: " + (msg || "condição"));
      await dormir(40);
    }
  }

  var DIAS31 = function () {
    var d = new Date(Date.UTC(2031 + Math.floor(Math.random() * 60), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28), 12));
    return d.toISOString().slice(0, 10);
  };
  // Dia sorteado de 2031 com a fila vazia em volta; `serve` filtra o dia da semana (0 = domingo).
  async function diaLivre(serve) {
    for (var i = 0; i < 300; i++) {
      var d = DIAS31();
      if (serve && !serve(new Date(d + "T12:00:00Z").getUTCDay())) continue;
      var r = await api("GET", "/api/painel/fila?dia=" + d);
      if (r.json && r.json.fila.length === 0 && r.json.entregues.length === 0) return d;
    }
    throw new Error("não achei um dia com a fila vazia entre 2031 e 2090");
  }
  var util = function (s) { return s >= 1 && s <= 5; };
  var sabado = function (s) { return s === 6; };

  async function manual(dia, itens, extra) {
    var corpo = { nome: "Cliente " + sufixo(), itens: itens, ponto: "Itacorubi", retirada: dia };
    for (var k in extra || {}) corpo[k] = extra[k];
    var r = await api("POST", "/api/painel/pedidos", corpo);
    A.igual(r.status, 201, "criar pedido manual: " + JSON.stringify(r.json));
    return r.json;
  }

  var quadros = [];
  function limpar() { quadros.forEach(function (q) { q.remove(); }); quadros = []; }

  // Abre o painel num iframe próprio e espera o dia terminar de carregar.
  async function abrir(dia, largura) {
    var q = document.createElement("iframe");
    q.title = "painel em teste";
    q.style.cssText = "position:fixed;left:0;top:0;border:0;opacity:.01;pointer-events:none;z-index:-1;width:" +
      (largura || 600) + "px;height:900px";
    document.body.appendChild(q);
    quadros.push(q);
    q.src = "/painel/?dia=" + dia + "&t=" + Date.now();
    var P = montar(q);
    await esperar(function () { return P.doc().body && P.doc().body.dataset.pronto === dia; }, "painel carregar " + dia, 10000);
    return P;
  }

  function montar(q) {
    var P = { quadro: q };
    P.win = function () { return q.contentWindow; };
    P.doc = function () { return q.contentDocument; };
    P.el = function (s) { return P.doc().querySelector(s); };
    P.todos = function (s) { return Array.prototype.slice.call(P.doc().querySelectorAll(s)); };
    P.texto = function (s) { return (P.el(s) || {}).textContent || ""; };
    P.cartao = function (id) { return P.el('article[data-id="' + id + '"]'); };
    P.destaque = function () { var a = P.el("#destaque article"); return a ? Number(a.dataset.id) : null; };
    P.clicar = function (sel) { var e = typeof sel === "string" ? P.el(sel) : sel; if (!e) throw new Error("sem elemento " + sel); e.click(); };
    P.digitar = function (sel, v) {
      var e = typeof sel === "string" ? P.el(sel) : sel;
      e.value = v;
      e.dispatchEvent(new (P.win().Event)("input", { bubbles: true }));
      e.dispatchEvent(new (P.win().Event)("change", { bubbles: true }));
    };
    P.recarregar = async function (dia) {
      q.src = "about:blank";
      await dormir(30);
      q.src = "/painel/?dia=" + dia + "&t=" + Date.now();
      await esperar(function () { return P.doc().body && P.doc().body.dataset.pronto === dia; }, "recarregar painel", 10000);
    };
    P.linha = function (sabor) { return P.el('#destaque .montagem [data-sabor="' + sabor + '"]'); };
    P.contador = function (sabor) { return P.linha(sabor).querySelector(".contador").textContent.trim(); };
    return P;
  }

  // Roda `fn(P)` e sempre limpa os iframes.
  function comPainel(fn) {
    return async function () {
      try { await fn.apply(null, arguments); } finally { limpar(); await cancelarCriados(); }
    };
  }

  /* ---------------- testes ---------------- */

  teste("o próximo pedido fica em destaque com cada sabor", comPainel(async function () {
    var d = await diaLivre(util);
    var tarde = await manual(d, [{ sabor: "calabresa", qtd: 5 }, { sabor: "carne", qtd: 3 }], { janela: "19h às 21h" });
    var cedo = await manual(d, [{ sabor: "queijo", qtd: 2 }], { ponto: "Abraão", janela: "9h às 12h", obs: "sem orégano" });
    var cancelado = await manual(d, [{ sabor: "carne", qtd: 4 }], { janela: "8h" });
    A.igual((await api("PATCH", "/api/painel/pedidos/" + cancelado.id, { status: "cancelado" })).status, 200);
    var P = await abrir(d, 1280);
    A.igual(P.destaque(), cedo.id, "o de horário mais cedo vem primeiro");
    A.contem(P.texto("#destaque"), "Próximo");
    A.contem(P.texto("#destaque"), "Hoje", "o dia aberto conta como hoje");
    A.contem(P.texto("#destaque"), "Abraão");
    A.contem(P.texto("#destaque"), "sem orégano");
    A.igual(P.contador("queijo"), "0/2");
    A.ok(P.el('#filaDias [data-id="' + tarde.id + '"]'), "o outro está na fila ao lado");
    A.ok(!P.el('[data-id="' + cancelado.id + '"]'), "cancelado não aparece");
    A.contem(P.texto("#faltaMontar"), "Ainda falta montar pra hoje");
    A.contem(P.texto("#faltaMontar"), "5 Calabresa · 3 Carne");
    A.contem(P.texto("#faltaMontar"), "2 Queijo");
  }));

  teste("confirmar pendência põe o pedido na fila", comPainel(async function () {
    var d = await diaLivre(sabado);
    var nome = "Pendente " + sufixo();
    var site = await api("POST", "/api/pedidos", { id_envio: uuid(), nome: nome, itens: [{ sabor: "carne", qtd: 6 }], ponto: ITACORUBI, retirada: d });
    A.ok(site.status === 201, "pedido do site: " + JSON.stringify(site.json));
    A.igual(site.json.status, "fora_da_regra");
    var P = await abrir(d);
    var c = P.cartao(site.json.id);
    A.ok(c && P.el("#pendencias").contains(c), "está nas pendências");
    A.ok(!P.el("#blocoNovos").hidden, "Novos aparece");
    A.contem(c.textContent, "O ponto não abre nesse dia", "motivo em texto claro");
    A.contem(c.textContent, nome);
    A.igual(P.destaque(), null, "fila vazia antes de aceitar");
    A.contem(P.texto("#destaque"), "Nenhum pedido na fila.");
    P.clicar(c.querySelector('[data-acao="confirmar"]'));
    await esperar(function () { return P.destaque() === site.json.id; }, "pedido virar o próximo");
    A.igual(P.contador("carne"), "0/6");
    A.ok(!P.el("#pendencias").contains(P.cartao(site.json.id)), "saiu das pendências");
    var j = await api("GET", "/api/painel/pedidos?dia=" + d);
    A.igual(j.json.pontos[0].pedidos[0].status, "confirmado");
  }));

  teste("cancelar pendência pede confirmação e tira da lista", comPainel(async function () {
    var d = await diaLivre(sabado);
    var site = await api("POST", "/api/pedidos", { id_envio: uuid(), nome: "Cancela " + sufixo(), itens: [{ sabor: "queijo", qtd: 2 }], ponto: ITACORUBI, retirada: d });
    var P = await abrir(d);
    var botao = P.cartao(site.json.id).querySelector('[data-acao="cancelar"]');
    var perguntas = 0;
    P.win().confirm = function () { perguntas++; return false; };
    P.clicar(botao);
    await dormir(150);
    A.igual(perguntas, 1, "perguntou antes");
    A.ok(P.cartao(site.json.id) && P.el("#pendencias").contains(P.cartao(site.json.id)), "recusou: continua pendente");
    P.win().confirm = function () { perguntas++; return true; };
    P.clicar(P.cartao(site.json.id).querySelector('[data-acao="cancelar"]'));
    await esperar(function () { return !P.el("#pendencias").contains(P.cartao(site.json.id)); }, "sair das pendências");
    A.igual((await api("GET", "/api/painel/pedidos?dia=" + d)).json.pontos[0].pedidos[0].status, "cancelado");
  }));

  teste("pendência com cupom inexistente diz o motivo", comPainel(async function () {
    var d = await diaLivre(util);
    var site = await api("POST", "/api/pedidos", { id_envio: uuid(), nome: "Cupom " + sufixo(), itens: [{ sabor: "calabresa", qtd: 4 }], ponto: ITACORUBI, retirada: d, cupom: "NAOEXISTE" });
    A.igual(site.json.status, "fora_da_regra");
    var P = await abrir(d);
    A.contem(P.cartao(site.json.id).textContent, "Cupom não existe");
  }));

  teste("cupom de nome que já pediu antes ganha aviso no cartão", comPainel(async function () {
    var d = await diaLivre(util);
    var nome = "Repete " + sufixo();
    var corpo = function (extra) {
      return Object.assign({ id_envio: uuid(), nome: nome, itens: [{ sabor: "calabresa", qtd: 4 }], ponto: ITACORUBI, retirada: d }, extra);
    };
    var primeiro = await api("POST", "/api/pedidos", corpo({ cupom: "PRIMEIRACOMPRA" }));
    A.igual((await api("PATCH", "/api/painel/pedidos/" + primeiro.json.id, { status: "confirmado", forcar: true })).status, 200);
    var segundo = await api("POST", "/api/pedidos", corpo({ nome: nome.toUpperCase(), cupom: "PRIMEIRACOMPRA" }));
    var P = await abrir(d);
    A.ok(!P.cartao(primeiro.json.id).querySelector(".cupom-repetido"), "o primeiro pedido não tem por que avisar");
    A.contem(P.cartao(segundo.json.id).textContent, "Esse nome já fez pedido antes");
  }));

  teste("Pago alterna e persiste, Entregue tira da fila e Desfazer volta", comPainel(async function () {
    var d = await diaLivre(util);
    var ped = await manual(d, [{ sabor: "carne", qtd: 2 }], { janela: "8h" });
    var outro = await manual(d, [{ sabor: "queijo", qtd: 3 }], { janela: "15h" });
    var P = await abrir(d);
    A.igual(P.destaque(), ped.id);
    var pago = function () { return P.cartao(ped.id).querySelector('[data-acao="pago"]'); };
    A.igual(pago().getAttribute("aria-pressed"), "false");
    P.clicar(pago());
    await esperar(function () { return pago().getAttribute("aria-pressed") === "true"; }, "Pago ligar");
    await P.recarregar(d);
    A.igual(pago().getAttribute("aria-pressed"), "true", "Pago persistiu");
    P.clicar(P.cartao(ped.id).querySelector('[data-acao="entregue"]'));
    await esperar(function () { return P.destaque() === outro.id; }, "o próximo sobe");
    A.ok(P.el("#entregues").contains(P.cartao(ped.id)), "foi pra Entregues");
    A.ok(!P.el("#blocoEntregues").hidden);
    A.contem(P.texto("#aviso"), "Entregue: " + ped.nome);
    P.clicar(P.el("#aviso button"));
    await esperar(function () { return P.destaque() === ped.id; }, "Desfazer põe de volta");
    var s = (await api("GET", "/api/painel/pedidos?dia=" + d)).json.pontos[0].pedidos.find(function (x) { return x.id === ped.id; });
    A.ok(s.pago && !s.entregue, "servidor concorda");
  }));

  teste("entregue sem pagar fica avisado em Entregues", comPainel(async function () {
    var d = await diaLivre(util);
    var ped = await manual(d, [{ sabor: "carne", qtd: 2 }]);
    A.igual((await api("PATCH", "/api/painel/pedidos/" + ped.id, { entregue: true })).status, 200);
    var P = await abrir(d);
    A.ok(P.el("#blocoEntregues").open, "abre sozinho quando falta pagar");
    A.contem(P.texto("#resumoEntregues"), "1 sem pagar");
    A.contem(P.cartao(ped.id).textContent, "Falta pagar");
    P.clicar(P.cartao(ped.id).querySelector('[data-acao="voltar-fila"]'));
    await esperar(function () { return P.destaque() === ped.id; }, "Voltar pra fila");
  }));

  teste("erro de rede mostra aviso e mantém o estado", comPainel(async function () {
    var d = await diaLivre(util);
    var ped = await manual(d, [{ sabor: "carne", qtd: 2 }]);
    var P = await abrir(d);
    var pago = function () { return P.cartao(ped.id).querySelector('[data-acao="pago"]'); };
    P.win().fetch = function () { return Promise.reject(new TypeError("sem rede")); };
    P.clicar(pago());
    await esperar(function () { return !P.el("#aviso").hidden; }, "aviso aparecer");
    A.ok(P.texto("#aviso").length > 5, "aviso tem texto");
    A.igual(pago().getAttribute("aria-pressed"), "false", "estado restaurado");
    A.ok(!pago().disabled, "botão volta a funcionar");
    A.igual(P.destaque(), ped.id, "o resto da tela fica como estava");
  }));

  teste("confirmado sem data aparece na seção Sem data", comPainel(async function () {
    var d = await diaLivre(util);
    var nome = "SemData " + sufixo();
    var site = await api("POST", "/api/pedidos", { id_envio: uuid(), nome: nome, itens: [{ sabor: "carne", qtd: 2 }], ponto: 4 });
    A.igual(site.status, 201);
    A.igual((await api("PATCH", "/api/painel/pedidos/" + site.json.id, { status: "confirmado" })).status, 200);
    try {
      var P = await abrir(d);
      A.ok(!P.el("#blocoSemData").hidden, "seção Sem data visível");
      A.contem(P.texto("#semData"), nome);
      A.ok(!P.el("#pendencias .cartao[data-id=\"" + site.json.id + "\"]"), "não sobra como pendência");
      A.ok(P.cartao(site.json.id).querySelector('[data-acao="pago"]'), "tem o botão Pago");
    } finally {
      await api("PATCH", "/api/painel/pedidos/" + site.json.id, { status: "cancelado" });
    }
  }));

  teste("painel.js não carrega a lista de cupons", async function () {
    var r = await fetch("/painel/painel.js");
    var t = await r.text();
    A.ok(t.length > 1000, "baixou o script");
    A.ok(t.indexOf("PRIMEIRACOMPRA") === -1, "lista de cupons só no servidor");
  });

  teste("cartões: pedido aceito mostra o cartão; código que não existe barra a troca, os cinco certos trocam e Desfazer devolve", comPainel(async function () {
    var g = await api("POST", "/api/painel/cartoes", { quantidade: 16 });
    A.igual(g.status, 201, "gerar lote");
    var d = await diaLivre(util);
    var cods = [];
    for (var i = 0; i < 5; i++) {
      var p = await manual(d, [{ sabor: "carne", qtd: 4 }]);
      A.ok(p.cartao, "pedido de 4 levou cartão");
      cods.push(p.cartao);
    }
    A.igual(new Set(cods).size, 5, "um cartão diferente por pedido");
    var P = await abrir(d);
    A.ok(/Cartão de fidelidade: \w{3}/.test(P.texto("#destaque")), "pedido em destaque mostra o cartão: " + P.texto("#destaque .fid-no-pedido"));
    P.clicar("#abaCartoes");
    await esperar(function () { return P.todos("#fidLotes td").length > 1; }, "lista de lotes");
    var campos = P.todos("#fidCodigos input");
    A.igual(campos.length, 5, "cinco campos");
    var inventado = "ZZZ";   // Z não está no alfabeto, então nunca existe
    [cods[0], cods[1].toLowerCase(), " " + cods[2], cods[3], inventado].forEach(function (v, i) { P.digitar(campos[i], v); });
    P.clicar("#fidTrocar");
    await esperar(function () { return P.todos("#fidResultado li.ruim").length; }, "marcar o inventado");
    A.igual(P.todos("#fidResultado li.ruim").length, 1, "só o inventado fica marcado");
    A.igual(campos[4].getAttribute("aria-invalid"), "true", "campo do inventado em vermelho");
    var trocados = async function () {
      var j = (await api("GET", "/api/painel/cartoes")).json;
      return j.trocados;
    };
    var antes = await trocados();

    P.digitar(campos[4], cods[4]);
    P.clicar("#fidTrocar");
    await esperar(function () { return P.el("#fidResultado li.bom"); }, "troca feita");
    A.ok(campos.every(function (c) { return c.value === ""; }), "campos limpos depois da troca");
    A.igual(await trocados(), antes + 5, "cinco trocados no banco");
    A.ok(P.todos("#fidResultado li").some(function (li) { return li.textContent.indexOf(cods[0] + " (pedido ") === 0; }), "diz de que pedido era cada cartão");

    var desfazer = P.todos("#aviso button").filter(function (b) { return b.textContent === "Desfazer"; })[0];
    A.ok(desfazer, "aviso tem Desfazer");
    desfazer.click();
    await esperar(function () { return /desfeita/.test(P.texto("#aviso")); }, "aviso de desfeito");
    A.igual(await trocados(), antes, "voltaram a valer");
  }));

  teste("cartões: a página de impressão põe 16 por folha, com código, linha e QR", comPainel(async function () {
    var g = await api("POST", "/api/painel/cartoes", { quantidade: 20 });
    var q = document.createElement("iframe");
    q.style.cssText = "position:fixed;left:0;top:0;border:0;opacity:.01;pointer-events:none;z-index:-1;width:900px;height:900px";
    document.body.appendChild(q);
    quadros.push(q);
    q.src = "/painel/cartoes.html?lote=" + g.json.lote;
    var P = montar(q);
    await esperar(function () { return P.el("#imprimir") && !P.el("#imprimir").hidden; }, "página de impressão", 10000);
    A.igual(P.todos(".folha").length, 2, "20 cartões em duas folhas");
    A.igual(P.todos(".folha")[0].querySelectorAll(".cartao").length, 16, "16 na primeira");
    A.igual(P.todos(".codigo").map(function (e) { return e.textContent; }).join(), g.json.cartoes.map(function (c) { return c.codigo; }).join(), "códigos na ordem do lote");
    A.ok(P.todos(".cartao").every(function (c) { return c.querySelector(".escrita") && c.querySelector(".qr"); }), "linha pra escrever e QR em todos");
    var f = P.el(".folha").getBoundingClientRect();
    A.ok(Math.abs(f.height / f.width - 297 / 210) < 0.01, "folha na proporção do A4");
  }));

  teste("sessão expirada avisa pra recarregar em vez de falar de conexão", comPainel(async function () {
    var d = await diaLivre(util);
    var ped = await manual(d, [{ sabor: "carne", qtd: 2 }]);
    var P = await abrir(d);
    var W = P.win();
    var respostas = [
      function () { return new W.Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }); },
      function () { return new W.Response('{"erro":"proibido"}', { status: 403, headers: { "content-type": "application/json" } }); },
      function () { return new W.Response('{}', { status: 401, headers: { "content-type": "application/json" } }); },
      function () { return { type: "opaqueredirect", ok: false, status: 0, headers: new W.Headers() }; }
    ];
    for (var i = 0; i < respostas.length; i++) {
      P.el("#aviso").hidden = true;
      W.fetch = (function (f) { return function () { return Promise.resolve(f()); }; })(respostas[i]);
      P.clicar(P.cartao(ped.id).querySelector('[data-acao="pago"]'));
      await esperar(function () { return !P.el("#aviso").hidden; }, "aviso " + i);
      A.contem(P.texto("#aviso"), "Sua sessão expirou. Recarregue a página.", "caso " + i);
      A.ok(P.texto("#aviso").indexOf("Sem conexão") === -1, "não diz sem conexão");
      await dormir(60);
    }
  }));

  teste("cada abertura do formulário novo usa um id_envio novo", comPainel(async function () {
    var d = await diaLivre(util);
    var P = await abrir(d);
    var ids = [];
    P.win().fetch = function (url, o) {
      if (o && o.method === "POST") ids.push(JSON.parse(o.body).id_envio);
      return Promise.reject(new TypeError("sem rede"));
    };
    for (var i = 0; i < 2; i++) {
      P.clicar("#novo");
      await esperar(function () { return P.el("#form").open; }, "formulário abrir");
      P.digitar("#fNome", "Id " + sufixo());
      P.digitar('#fQtds [data-sabor="queijo"]', "1");
      P.clicar("#fSalvar");
      await esperar(function () { return ids.length === i + 1 && !P.el("#fErro").hidden; }, "tentativa " + i);
      P.clicar("#fFechar");
      await esperar(function () { return !P.el("#form").open; }, "formulário fechar");
    }
    A.ok(ids[0] && ids[1] && ids[0] !== ids[1], "ids diferentes: " + ids.join(" / "));
  }));

  teste("novo pedido manual entra na fila", comPainel(async function () {
    var d = await diaLivre(util);
    var P = await abrir(d);
    P.clicar("#novo");
    await esperar(function () { return P.el("#form").open; }, "formulário abrir");
    A.igual(P.el("#fDia").value, d, "dia vem preenchido");
    var nome = "Novo " + sufixo();
    P.digitar("#fNome", nome);
    P.digitar('#fQtds [data-sabor="calabresa"]', "2");
    P.digitar('#fQtds [data-sabor="carne"]', "2");
    A.igual(P.el("#fValor").value, "22,00", "valor calculado do combo 4");
    P.digitar("#fCupom", "primeiracompra");
    await esperar(function () { return P.el("#fValor").value === "19,80"; }, "cupom entra no cálculo (vem de /api/cupom)");
    P.digitar("#fCupom", "");
    P.digitar("#fJanela", "19h");
    P.digitar("#fObs", "sem cebola");
    P.clicar("#fSalvar");
    await esperar(function () { return !P.el("#form").open; }, "formulário fechar");
    await esperar(function () { return P.texto("#destaque").indexOf(nome) !== -1; }, "pedido em destaque");
    var t = P.texto("#destaque");
    A.contem(t, "R$ 22,00");
    A.contem(t, "sem cebola");
    A.contem(t, "19h");
    A.igual(P.contador("calabresa"), "0/2");
    A.igual(P.contador("carne"), "0/2");
    A.contem(P.texto("#aviso"), "R$ 22,00", "mostra o total que o servidor devolveu");
    var s = (await api("GET", "/api/painel/pedidos?dia=" + d)).json.pontos[0].pedidos[0];
    A.igual(s.status, "confirmado");
    A.igual(s.total_centavos, 2200);
  }));

  teste("novo pedido com ponto Outro e erro do servidor no formulário", comPainel(async function () {
    var d = await diaLivre(util);
    var P = await abrir(d);
    P.clicar("#novo");
    await esperar(function () { return P.el("#form").open; });
    P.digitar("#fNome", "Outro " + sufixo());
    P.digitar('#fQtds [data-sabor="queijo"]', "1");
    P.digitar("#fCupom", "NAOEXISTE");
    P.clicar("#fSalvar");
    await esperar(function () { return !P.el("#fErro").hidden; }, "erro no formulário");
    A.contem(P.texto("#fErro"), "cupom");
    A.ok(P.el("#form").open, "formulário continua aberto");
    P.digitar("#fCupom", "");
    var ponto = P.el("#fPonto");
    ponto.value = "__outro";
    ponto.dispatchEvent(new (P.win().Event)("change", { bubbles: true }));
    A.ok(!P.el("#campoPontoOutro").hidden, "campo do outro ponto aparece");
    P.digitar("#fPontoOutro", "Rua Lauro Linhares");
    P.clicar("#fSalvar");
    await esperar(function () { return !P.el("#form").open; }, "salvar com outro ponto");
    await esperar(function () { return P.texto("#destaque").indexOf("Rua Lauro Linhares") !== -1; }, "ponto novo na tela");
  }));

  teste("editar muda o valor", comPainel(async function () {
    var d = await diaLivre(util);
    var ped = await manual(d, [{ sabor: "calabresa", qtd: 4 }]);
    var P = await abrir(d);
    A.contem(P.cartao(ped.id).textContent, "R$ 22,00");
    P.clicar(P.cartao(ped.id).querySelector('[data-acao="editar"]'));
    await esperar(function () { return P.el("#form").open; });
    A.igual(P.el("#fNome").value, ped.nome);
    A.igual(P.el("#fValor").value, "22,00");
    P.digitar("#fValor", "30,00");
    P.clicar("#fSalvar");
    await esperar(function () { return !P.el("#form").open; });
    await esperar(function () { return P.cartao(ped.id).textContent.indexOf("R$ 30,00") !== -1; }, "valor novo na tela");
    var s = (await api("GET", "/api/painel/pedidos?dia=" + d)).json.pontos[0].pedidos[0];
    A.igual(s.total_centavos, 3000);
    A.ok(s.valor_manual, "valor manual");
    // volta pro cálculo
    P.clicar(P.cartao(ped.id).querySelector('[data-acao="editar"]'));
    await esperar(function () { return P.el("#form").open; });
    A.igual(P.el("#fValor").value, "30,00");
    P.clicar("#fUsarCalculo");
    A.igual(P.el("#fValor").value, "22,00");
    P.clicar("#fSalvar");
    await esperar(function () { return !P.el("#form").open; });
    await esperar(function () { return P.cartao(ped.id).textContent.indexOf("R$ 22,00") !== -1; }, "cálculo de volta");
    A.ok(!(await api("GET", "/api/painel/pedidos?dia=" + d)).json.pontos[0].pedidos[0].valor_manual);
  }));

  teste("editar as quantidades refaz o total", comPainel(async function () {
    var d = await diaLivre(util);
    var ped = await manual(d, [{ sabor: "calabresa", qtd: 4 }]);
    var P = await abrir(d);
    P.clicar(P.cartao(ped.id).querySelector('[data-acao="editar"]'));
    await esperar(function () { return P.el("#form").open; });
    P.digitar('#fQtds [data-sabor="calabresa"]', "8");
    A.igual(P.el("#fValor").value, "42,80");
    P.clicar("#fSalvar");
    await esperar(function () { return !P.el("#form").open; });
    await esperar(function () { return P.contador("calabresa") === "0/8"; }, "montagem atualizar");
    A.contem(P.cartao(ped.id).textContent, "R$ 42,80");
  }));

  teste("fila em ordem de dia e horário, sem dia vazio, e tocar abre em destaque", comPainel(async function () {
    var d = await diaLivre(util);
    var mais = function (n) { return new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10); };
    var tarde = await manual(mais(2), [{ sabor: "carne", qtd: 7 }], { janela: "19h às 21h" });
    var cedo = await manual(mais(2), [{ sabor: "queijo", qtd: 1 }], { janela: "8h às 16h30" });
    var longe = await manual(mais(5), [{ sabor: "calabresa", qtd: 4 }]);
    var P = await abrir(d, 1280);
    A.igual(P.doc().body.dataset.pronto, d, "o dia base continua o mesmo");
    A.igual(P.destaque(), cedo.id, "o próximo é o mais cedo do primeiro dia com pedido");
    var titulos = P.todos("#filaDias h3").map(function (e) { return e.textContent; });
    A.ok(titulos.indexOf("Hoje") === -1 && titulos.indexOf("Amanhã") === -1, "dia sem pedido não aparece: " + titulos.join(", "));
    A.igual(titulos.length, 2, "um grupo por dia com pedido: " + titulos.join(", "));
    var ids = P.todos("#filaDias .item-fila").map(function (e) { return Number(e.dataset.id); });
    A.igual(ids.join(","), [tarde.id, longe.id].join(","), "ordem da fila");
    P.clicar('#filaDias [data-id="' + longe.id + '"]');
    A.igual(P.destaque(), longe.id, "tocar abre em destaque");
    A.contem(P.texto("#destaque"), "Pedido escolhido");
    P.clicar('[data-acao="voltar-proximo"]');
    A.igual(P.destaque(), cedo.id, "volta pro próximo");
  }));

  teste("+1 conta as montadas, junta toques e salva", comPainel(async function () {
    var d = await diaLivre(util);
    var ped = await manual(d, [{ sabor: "queijo", qtd: 3 }, { sabor: "carne", qtd: 2 }]);
    var P = await abrir(d);
    var mais = function () { return P.linha("queijo").querySelector('[data-acao="mais"]'); };
    var marca = P.doc().body.dataset.montadas;
    P.clicar(mais()); P.clicar(mais());
    A.igual(P.contador("queijo"), "2/3", "muda na hora");
    A.contem(P.texto("#faltaMontar"), "1 Queijo · 2 Carne");
    await esperar(function () { return P.doc().body.dataset.montadas !== marca; }, "salvar as montadas");
    var s = (await api("GET", "/api/painel/pedidos?dia=" + d)).json.pontos[0].pedidos[0];
    A.igual(s.montadas.queijo, 2, "dois toques seguidos chegaram os dois");
    P.clicar(mais());
    A.ok(P.linha("queijo").classList.contains("pronto"), "sabor completo fica pronto");
    A.ok(mais().disabled, "+1 trava no total do pedido");
    P.clicar(P.linha("queijo").querySelector('[data-acao="menos"]'));
    A.igual(P.contador("queijo"), "2/3", "o menos desfaz um");
    marca = P.doc().body.dataset.montadas;
    await esperar(function () { return P.doc().body.dataset.montadas !== marca; }, "salvar de novo");
    await P.recarregar(d);
    A.igual(P.contador("queijo"), "2/3", "persistiu");
    A.igual(P.contador("carne"), "0/2");
  }));

  teste("fechar sabor, pedido e o dia todo comemora cada um", comPainel(async function () {
    var d = await diaLivre(util);
    var a = await manual(d, [{ sabor: "carne", qtd: 1 }, { sabor: "calabresa", qtd: 2 }]);
    var b = await manual(d, [{ sabor: "queijo", qtd: 1 }]);
    var P = await abrir(d);
    var corpo = P.doc().body;
    var mais = function (sabor) { P.clicar(P.linha(sabor).querySelector('[data-acao="mais"]')); };
    A.igual(P.destaque(), a.id);
    mais("calabresa");
    A.ok(!corpo.dataset.comemorou, "sabor pela metade não comemora");
    mais("carne");
    A.igual(corpo.dataset.comemorou, "sabor");
    A.ok(P.linha("carne").classList.contains("comemora"), "a linha do sabor pula");
    A.ok(P.el("#aviso").hidden, "sabor sozinho não dá aviso");
    P.clicar(P.linha("carne").querySelector('[data-acao="menos"]'));
    mais("carne");
    mais("calabresa");
    A.igual(corpo.dataset.comemorou, "pedido");
    A.contem(P.texto("#aviso"), "Pedido de " + a.nome + " montado.");
    A.ok(!P.el(".confete"), "pedido sozinho não tem confete");
    P.clicar(P.el('#filaDias [data-id="' + b.id + '"]'));
    A.igual(P.destaque(), b.id);
    mais("queijo");
    A.igual(corpo.dataset.comemorou, "dia");
    A.contem(P.texto("#aviso"), "Tudo montado pra hoje: 4 esfihas em 2 pedidos.");
    A.ok(P.el(".confete"), "o dia fechado solta confete");
    var marca = corpo.dataset.montadas;
    await esperar(function () { return corpo.dataset.montadas !== marca; }, "salvar as montadas");
    await esperar(function () { return !P.el(".confete"); }, "o confete sai sozinho", 5000);
  }));

  teste("pedido de dias atrás não entregue aparece como atrasado", comPainel(async function () {
    var d = await diaLivre(util);
    var antes = new Date(Date.parse(d + "T12:00:00Z") - 3 * 86400000).toISOString().slice(0, 10);
    var hoje = await manual(d, [{ sabor: "carne", qtd: 1 }]);
    var velho = await manual(antes, [{ sabor: "carne", qtd: 1 }], { forcar: true });
    var P = await abrir(d);
    A.igual(P.destaque(), velho.id, "o atrasado vem antes");
    A.contem(P.el("#destaque .quando").textContent, "Atrasado");
    A.ok(P.el('#filaDias [data-id="' + hoje.id + '"]'));
  }));

  teste("Pago pergunta a forma, grava e desmarcar limpa", comPainel(async function () {
    var d = await diaLivre(util);
    var ped = await manual(d, [{ sabor: "carne", qtd: 4 }]);
    var P = await abrir(d, 1280);
    var cartao = function () { return P.cartao(ped.id); };
    P.clicar(cartao().querySelector('[data-acao="pago"]'));
    await esperar(function () { return cartao().querySelector('[data-acao="pagamento-pix"]'); }, "pergunta Como pagou?");
    A.contem(cartao().textContent, "Como pagou?");
    P.clicar(cartao().querySelector('[data-acao="pagamento-debito"]'));
    await esperar(function () { return /Pago · Débito/.test(cartao().textContent); }, "forma no botão");
    A.ok(!cartao().querySelector('[data-acao="pagamento-pix"]'), "pergunta some depois de responder");
    var s = (await api("GET", "/api/painel/pedidos?dia=" + d)).json.pontos[0].pedidos[0];
    A.igual(s.pagamento, "debito", "servidor gravou a forma");
    P.clicar(cartao().querySelector('[data-acao="pago"]'));
    await esperar(function () { return cartao().querySelector('[data-acao="pago"]').getAttribute("aria-pressed") === "false"; }, "desmarcar");
    s = (await api("GET", "/api/painel/pedidos?dia=" + d)).json.pontos[0].pedidos[0];
    A.ok(!s.pago && s.pagamento === null, "desmarcar limpa a forma");
  }));

  teste("histórico sem venda não escreve null e a dica traz os custos do servidor", comPainel(async function () {
    var d = await diaLivre(util);
    var P = await abrir(d, 1280);
    P.clicar("#abaHistorico");
    await esperar(function () { return P.doc().body.dataset.historico === "pronto"; }, "histórico carregar");
    A.ok(!/\bnull\b/.test(P.texto("#telaHistorico")), "texto 'null' na tela");
    A.contem(P.texto("#dicaCustos"), "por esfiha");
    A.contem(P.texto("#dicaCustos"), "%");
  }));

  teste("aceitar tira o pedido de Novos na hora", comPainel(async function () {
    var d = await diaLivre(util);
    var site = await api("POST", "/api/pedidos", { id_envio: uuid(), nome: "Aceita " + sufixo(), itens: [{ sabor: "queijo", qtd: 4 }], ponto: ITACORUBI, retirada: d });
    var P = await abrir(d, 1280);
    P.clicar(P.cartao(site.json.id).querySelector('[data-acao="confirmar"]'));
    await esperar(function () { return !P.el("#pendencias").contains(P.cartao(site.json.id)) && P.destaque() === site.json.id; }, "sair de Novos e entrar na fila");
    A.ok(!P.cartao(site.json.id).querySelector('[data-acao="confirmar"]'), "sem botão Aceitar no cartão confirmado");
  }));

  teste("editar só o nome mantém o total gravado", comPainel(async function () {
    var d = await diaLivre(util);
    var ped = await manual(d, [{ sabor: "carne", qtd: 4 }], { valor_manual: true, total_centavos: 1990 });
    var P = await abrir(d, 1280);
    var menu = P.cartao(ped.id).querySelector("details.mais-acoes");
    menu.open = true;
    P.clicar(menu.querySelector('[data-acao="editar"]'));
    await esperar(function () { return P.el("#form").open; }, "formulário abrir");
    P.digitar("#fNome", "Nome corrigido");
    P.clicar("#fSalvar");
    await esperar(function () { return !P.el("#form").open; }, "salvar");
    var s = (await api("GET", "/api/painel/pedidos?dia=" + d)).json.pontos[0].pedidos[0];
    A.igual(s.nome, "Nome corrigido");
    A.igual(s.total_centavos, 1990, "total combinado ficou");
  }));

  teste("abre em hoje, sem calendário", comPainel(async function () {
    var hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    var q = document.createElement("iframe");
    q.style.cssText = "position:fixed;left:0;top:0;border:0;opacity:.01;pointer-events:none;z-index:-1;width:1280px;height:900px";
    document.body.appendChild(q);
    quadros.push(q);
    q.src = "/painel/?t=" + Date.now();
    var P = montar(q);
    await esperar(function () { return P.doc().body && P.doc().body.dataset.pronto === hoje; }, "abrir em hoje", 10000);
    A.ok(P.el("#voltarHoje").hidden, "sem Voltar pra hoje");
    A.ok(!P.el("#dia") && !P.el("#anterior"), "sem calendário nem setas");
  }));

  teste("aba Histórico mostra os totais e volta pra Pedidos", comPainel(async function () {
    var d = await diaLivre(util);
    var P = await abrir(d, 1280);
    P.clicar("#abaHistorico");
    await esperar(function () { return P.doc().body.dataset.historico === "pronto"; }, "histórico carregar");
    A.ok(P.el("#telaPedidos").hidden && !P.el("#telaHistorico").hidden, "trocou de tela");
    A.contem(P.texto("#quadros"), "Desde o começo");
    A.contem(P.texto("#quadros"), "líquido");
    A.ok(P.el("#tabelaDias th"), "tabela dia a dia");
    P.clicar("#abaPedidos");
    A.ok(!P.el("#telaPedidos").hidden && P.el("#telaHistorico").hidden, "voltou");
  }));

  teste("agenda: limite, pausa e bloqueio de dia", comPainel(async function () {
    var antes = (await api("GET", "/api/painel/agenda")).json;
    var d = await diaLivre(util);
    var bloqueio = await diaLivre(util);
    var P = await abrir(d);
    try {
      P.el("#agenda").open = true;
      await esperar(function () { return P.el("#limite").value === String(antes.limite); }, "agenda carregar com o limite atual");
      P.digitar("#limite", "57");
      P.clicar("#salvarLimite");
      await esperar(function () { return P.doc().body.dataset.agenda === "limite-57"; }, "limite salvo");
      A.igual((await api("GET", "/api/painel/agenda")).json.limite, 57);

      P.clicar("#pausar");
      await esperar(function () { return P.el("#pausar").getAttribute("aria-pressed") === "true"; }, "pausar");
      A.igual((await api("GET", "/api/painel/agenda")).json.pausado, true);
      P.clicar("#pausar");
      await esperar(function () { return P.el("#pausar").getAttribute("aria-pressed") === "false"; }, "reabrir");

      P.digitar("#bloqDia", bloqueio);
      P.digitar("#bloqMotivo", "Viagem");
      P.clicar("#bloquear");
      await esperar(function () { return P.el('#bloqueios [data-dia="' + bloqueio + '"]'); }, "bloqueio na lista");
      A.contem(P.el('#bloqueios [data-dia="' + bloqueio + '"]').textContent, "Viagem");
      A.ok((await api("GET", "/api/painel/agenda")).json.bloqueios.some(function (b) { return b.dia === bloqueio; }));
      P.clicar('#bloqueios [data-dia="' + bloqueio + '"] button');
      await esperar(function () { return !P.el('#bloqueios [data-dia="' + bloqueio + '"]'); }, "liberar dia");
      A.ok(!(await api("GET", "/api/painel/agenda")).json.bloqueios.some(function (b) { return b.dia === bloqueio; }));
    } finally {
      await api("PUT", "/api/painel/agenda", { limite: antes.limite, pausado: antes.pausado, bloqueios: antes.bloqueios });
    }
  }));

  teste("sem travessão no texto do painel", comPainel(async function () {
    var d = await diaLivre(sabado);
    await manual(d, [{ sabor: "carne", qtd: 2 }], { obs: "tocar o interfone" });
    var site = await api("POST", "/api/pedidos", { id_envio: uuid(), nome: "Pend " + sufixo(), itens: [{ sabor: "carne", qtd: 1 }], ponto: ITACORUBI, retirada: d });
    A.ok(site.json.id);
    var P = await abrir(d);
    P.el("#agenda").open = true;
    var visivel = P.doc().body.textContent;
    A.igual((visivel.match(/—/g) || []).length, 0, "travessão no texto da tela");
    var fontes = await Promise.all(["/painel/", "/painel/painel.js"].map(function (u) { return fetch(u).then(function (r) { return r.text(); }); }));
    fontes.forEach(function (f, i) { A.igual((f.match(/—/g) || []).length, 0, "travessão em " + (i ? "painel.js" : "index.html")); });
  }));

  teste("campos com 16px", comPainel(async function () {
    var d = await diaLivre(util);
    var P = await abrir(d);
    P.el("#agenda").open = true;
    var campos = P.todos("input, select, textarea");
    A.ok(campos.length >= 12, "achou os campos: " + campos.length);
    var pequenos = campos.filter(function (e) { return parseFloat(P.win().getComputedStyle(e).fontSize) < 16; })
      .map(function (e) { return e.id || e.tagName; });
    A.igual(pequenos.length, 0, "campos abaixo de 16px: " + pequenos.join(", "));
  }));

  // Nada pode passar da borda da tela; overflow-x escondido não conta.
  async function semEstouro(largura) {
    var d = await diaLivre(sabado);
    await manual(d, [{ sabor: "calabresa", qtd: 12 }, { sabor: "marguerita", qtd: 3 }], { nome: "Nome comprido de verificação sem espaços ".repeat(1) + "ÀÉÎÕÜ", obs: "uma observação grande o bastante para quebrar em várias linhas no celular " + "x".repeat(60) });
    await manual(d, [{ sabor: "carne", qtd: 1 }], { ponto: "Um ponto com nome bem comprido para testar quebra de linha" });
    await api("POST", "/api/pedidos", { id_envio: uuid(), nome: "Pendência", itens: [{ sabor: "carne", qtd: 5 }], ponto: ITACORUBI, retirada: d });
    var P = await abrir(d, largura);
    P.el("#agenda").open = true;
    var verificar = function (rotulo, raiz) {
      var w = P.win().innerWidth, maus = [];
      Array.prototype.slice.call((raiz || P.doc()).querySelectorAll("*")).forEach(function (e) {
        var r = e.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.right > w + 0.5 || r.left < -0.5) maus.push(e.tagName + (e.id ? "#" + e.id : "") + "." + String(e.className).slice(0, 30) + " " + Math.round(r.left) + ".." + Math.round(r.right));
      });
      A.igual(maus.length, 0, rotulo + " a " + w + "px estoura: " + maus.slice(0, 5).join(" | "));
      A.ok(P.doc().documentElement.scrollWidth <= w + 1, rotulo + ": rolagem horizontal");
    };
    verificar("página");
    P.clicar("#novo");
    await esperar(function () { return P.el("#form").open; });
    verificar("formulário", P.el("#form"));
  }
  teste("sem estouro a 375px", comPainel(function () { return semEstouro(375); }));
  teste("sem estouro a 1280px", comPainel(function () { return semEstouro(1280); }));

})(window);
