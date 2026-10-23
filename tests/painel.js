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
    return { status: r.status, json: j };
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
  // Dia sorteado de 2031 sem nenhum pedido; `serve` filtra o dia da semana (0 = domingo).
  async function diaLivre(serve) {
    for (var i = 0; i < 300; i++) {
      var d = DIAS31();
      if (serve && !serve(new Date(d + "T12:00:00Z").getUTCDay())) continue;
      var r = await api("GET", "/api/painel/pedidos?dia=" + d);
      if (r.json && r.json.pontos.length === 0) return d;
    }
    throw new Error("não achei um dia livre entre 2031 e 2090");
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
    P.cartao = function (id) { return P.el('.cartao[data-id="' + id + '"]'); };
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
    P.sabor = function (id) { return P.texto('#sabores [data-sabor="' + id + '"] .n').trim(); };
    return P;
  }

  // Roda `fn(P)` e sempre limpa os iframes.
  function comPainel(fn) {
    return async function () {
      try { await fn.apply(null, arguments); } finally { limpar(); }
    };
  }

  /* ---------------- testes ---------------- */

  teste("mostra o total por sabor do dia", comPainel(async function () {
    var d = await diaLivre(util);
    await manual(d, [{ sabor: "calabresa", qtd: 5 }, { sabor: "carne", qtd: 3 }]);
    await manual(d, [{ sabor: "queijo", qtd: 2 }], { ponto: "Abraão" });
    var cancelado = await manual(d, [{ sabor: "carne", qtd: 4 }]);
    A.igual((await api("PATCH", "/api/painel/pedidos/" + cancelado.id, { status: "cancelado" })).status, 200);
    var P = await abrir(d);
    A.igual(P.sabor("calabresa"), "5", "calabresa");
    A.igual(P.sabor("carne"), "3", "carne (o cancelado não conta)");
    A.igual(P.sabor("queijo"), "2", "queijo");
    A.igual(P.sabor("marguerita"), "0", "marguerita");
    A.igual(P.texto("#totalEsfihas").trim(), "10", "total do dia");
    A.ok(P.todos("#pontos .ponto-grupo").length === 2, "dois pontos com pedido");
    A.contem(P.texto("#pontos"), "Abraão");
  }));

  teste("confirmar pendência move pro ponto", comPainel(async function () {
    var d = await diaLivre(sabado);
    var nome = "Pendente " + sufixo();
    var site = await api("POST", "/api/pedidos", { id_envio: uuid(), nome: nome, itens: [{ sabor: "carne", qtd: 6 }], ponto: ITACORUBI, retirada: d });
    A.ok(site.status === 201, "pedido do site: " + JSON.stringify(site.json));
    A.igual(site.json.status, "fora_da_regra");
    var P = await abrir(d);
    var c = P.cartao(site.json.id);
    A.ok(c && P.el("#pendencias").contains(c), "está nas pendências");
    A.contem(c.textContent, "O ponto não abre nesse dia", "motivo em texto claro");
    A.contem(c.textContent, nome);
    A.igual(P.el("#pontos .cartao[data-id]"), null, "ainda não está nos pontos");
    A.igual(P.sabor("carne"), "0", "pendência não entra no total");
    P.clicar(c.querySelector('[data-acao="confirmar"]'));
    await esperar(function () {
      var n = P.cartao(site.json.id);
      return n && P.el("#pontos").contains(n);
    }, "pedido ir pro ponto");
    A.igual(P.sabor("carne"), "6", "agora entra no total");
    A.contem(P.el("#pontos .ponto-grupo").textContent, "Itacorubi");
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

  teste("Pago alterna e persiste ao recarregar", comPainel(async function () {
    var d = await diaLivre(util);
    var ped = await manual(d, [{ sabor: "carne", qtd: 2 }]);
    var P = await abrir(d);
    var pago = function () { return P.cartao(ped.id).querySelector('[data-acao="pago"]'); };
    var entregue = function () { return P.cartao(ped.id).querySelector('[data-acao="entregue"]'); };
    A.igual(pago().getAttribute("aria-pressed"), "false");
    P.clicar(pago());
    await esperar(function () { return pago().getAttribute("aria-pressed") === "true"; }, "Pago ligar");
    P.clicar(entregue());
    await esperar(function () { return entregue().getAttribute("aria-pressed") === "true"; }, "Entregue ligar");
    await P.recarregar(d);
    A.igual(pago().getAttribute("aria-pressed"), "true", "Pago persistiu");
    A.igual(entregue().getAttribute("aria-pressed"), "true", "Entregue persistiu");
    P.clicar(pago());
    await esperar(function () { return pago().getAttribute("aria-pressed") === "false"; }, "Pago desligar");
    var s = (await api("GET", "/api/painel/pedidos?dia=" + d)).json.pontos[0].pedidos[0];
    A.ok(!s.pago && s.entregue, "servidor concorda");
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
    A.igual(P.sabor("carne"), "2", "o resto da tela fica como estava");
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

  teste("novo pedido manual aparece no dia", comPainel(async function () {
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
    var c = await esperar(function () { return P.todos("#pontos .cartao").filter(function (e) { return e.textContent.indexOf(nome) !== -1; })[0]; }, "cartão aparecer");
    A.contem(c.textContent, "R$ 22,00");
    A.contem(c.textContent, "sem cebola");
    A.contem(c.textContent, "19h");
    A.igual(P.sabor("calabresa"), "2");
    A.igual(P.sabor("carne"), "2");
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
    await esperar(function () { return P.texto("#pontos").indexOf("Rua Lauro Linhares") !== -1; }, "ponto novo na tela");
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
    await esperar(function () { return P.sabor("calabresa") === "8"; }, "total por sabor atualizar");
    A.contem(P.cartao(ped.id).textContent, "R$ 42,80");
  }));

  teste("próximos dias mostra e leva ao dia", comPainel(async function () {
    var d = await diaLivre(util);
    var d2 = new Date(Date.parse(d + "T12:00:00Z") + 2 * 86400000).toISOString().slice(0, 10);
    var r = await api("GET", "/api/painel/pedidos?dia=" + d2);
    if (r.json.pontos.length) return;   // dia vizinho já ocupado por outra rodada
    var ped = await manual(d2, [{ sabor: "carne", qtd: 7 }]);
    var P = await abrir(d);
    var linha = P.el('#proximos [data-dia="' + d2 + '"]');
    A.ok(linha, "linha do dia");
    A.contem(linha.textContent, "7 esfihas");
    A.contem(linha.textContent, "1 pedido");
    P.clicar(linha);
    await esperar(function () { return P.el("#dia").value === d2 && P.cartao(ped.id); }, "ir pro dia");
    A.igual(P.sabor("carne"), "7");
  }));

  teste("setas e Hoje trocam o dia", comPainel(async function () {
    var d = await diaLivre(util);
    var P = await abrir(d);
    var prox = new Date(Date.parse(d + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    P.clicar("#seguinte");
    await esperar(function () { return P.doc().body.dataset.pronto === prox && P.el("#dia").value === prox; }, "dia seguinte");
    P.clicar("#anterior");
    await esperar(function () { return P.doc().body.dataset.pronto === d; }, "dia anterior");
    P.clicar("#hoje");
    var hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await esperar(function () { return P.doc().body.dataset.pronto === hoje; }, "hoje");
    A.contem(P.win().location.search, "dia=" + hoje, "endereço acompanha o dia");
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
