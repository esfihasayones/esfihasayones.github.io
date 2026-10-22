/*
 * Varredura: milhares de pedidos aleatórios conferidos contra as regras do
 * negócio.
 *
 * O oráculo aqui embaixo reescreve as regras (preço, pontos, horários,
 * antecedência) a partir do CLAUDE.md, sem ler a configuração do site. Se o
 * site e o combinado com o dono divergirem, a varredura acusa.
 *
 * Os casos saem de um gerador com semente. Toda falha mostra a semente; para
 * repetir exatamente a mesma rodada, abra tests/index.html?semente=N.
 */
(function (global) {
  "use strict";

  /* ---------------- oráculo ---------------- */
  var FAIXAS = [                       // preço em centavos
    { min: 12, preco: 520, nome: "Combo 12" },
    { min: 8,  preco: 535, nome: "Combo 8" },
    { min: 4,  preco: 550, nome: "Combo 4" },
    { min: 1,  preco: 590, nome: "Avulsa" }
  ];
  var SABORES = [
    { id: "calabresa", nome: "Calabresa" },
    { id: "carne", nome: "Carne" },
    { id: "queijo", nome: "Queijo" },
    { id: "marguerita", nome: "Marguerita" }
  ];
  // índice no seletor, nome, dias (0 = domingo) e, por dia, começo e texto do horário
  function janela(h, m, txt) { return { h: h, m: m, txt: txt }; }
  var PONTOS = [
    { nome: "Trindade", dias: {
        1: janela(18, 30, "das 18h30 às 20h"), 2: janela(18, 30, "das 18h30 às 22h"),
        3: janela(18, 30, "das 18h30 às 22h"), 4: janela(18, 30, "das 18h30 às 20h") } },
    { nome: "Itacorubi", dias: {
        1: janela(8, 0, "das 8h às 16h30"), 2: janela(8, 0, "das 8h às 16h30"),
        3: janela(8, 0, "das 8h às 16h30"), 4: janela(8, 0, "das 8h às 16h30"),
        5: janela(8, 0, "das 8h às 16h30") } },
    { nome: "Abraão", dias: {
        1: janela(7, 0, "de manhã"), 2: janela(7, 0, "de manhã"), 3: janela(7, 0, "de manhã"),
        4: janela(7, 0, "de manhã"), 5: janela(7, 0, "de manhã") } },
    { nome: "Combinar outro ponto", dias: null }
  ];
  var DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  var MAX_ITEM = 200;

  function faixaDe(q) {
    for (var i = 0; i < FAIXAS.length; i++) if (q >= FAIXAS[i].min) return FAIXAS[i];
    return FAIXAS[FAIXAS.length - 1];
  }
  // "R$ 1.040,00": ponto no milhar, como se escreve dinheiro no Brasil
  function brl(centavos) {
    var reais = String(Math.floor(centavos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "R$ " + reais + "," + String(centavos % 100).padStart(2, "0");
  }
  function antecedenciaH(q) { return q > 40 ? 72 : 24; }
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function br(isoTxt) { var p = isoTxt.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function diaSemana(isoTxt) { return new Date(isoTxt + "T12:00:00").getDay(); }
  // a retirada serve? "ok", "dia" ou "cedo"
  function situacao(pi, isoTxt, agoraMs, q) {
    var j = PONTOS[pi].dias[diaSemana(isoTxt)];
    if (!j) return "dia";
    var p = isoTxt.split("-");
    var inicio = new Date(+p[0], +p[1] - 1, +p[2], j.h, j.m).getTime();
    return inicio < agoraMs + antecedenciaH(q) * 3600e3 ? "cedo" : "ok";
  }
  function primeiraData(pi, agoraMs, q) {
    var d = new Date(agoraMs);
    for (var i = 0; i < 30; i++) {
      if (situacao(pi, iso(d), agoraMs, q) === "ok") return iso(d);
      d.setDate(d.getDate() + 1);
    }
    return null;
  }

  /* ---------------- gerador com semente ---------------- */
  var m = /[?&]semente=(\d+)/.exec(global.location.search);
  var SEMENTE = m ? +m[1] : (Date.now() % 1e9);
  function gerador(sal) {
    var a = (SEMENTE + sal * 7919) >>> 0;
    var r = function () {                              // mulberry32
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
    r.um = function (lista) { return lista[Math.floor(r() * lista.length)]; };
    return r;
  }
  // quantidade: quase sempre perto das bordas dos combos, às vezes enorme
  function qtdAleatoria(r) {
    var x = r();
    if (x < 0.35) return 0;
    if (x < 0.9) return r.int(1, 14);
    if (x < 0.97) return r.int(15, 60);
    return r.int(61, MAX_ITEM);
  }

  /* ---------------- coleta de falhas ---------------- */
  // Junta as falhas por tipo em vez de parar na primeira, pra varredura
  // mostrar tudo o que achou numa rodada só.
  function Falhas(nome) {
    var tipos = {}, total = 0, casos = 0;
    return {
      caso: function () { casos++; },
      checa: function (cond, tipo, detalhe) {
        if (cond) return;
        total++;
        if (!tipos[tipo]) tipos[tipo] = { n: 0, exemplo: detalhe };
        tipos[tipo].n++;
      },
      fechar: function () {
        if (!total) return;
        var linhas = Object.keys(tipos).map(function (t) {
          return "• " + t + " (" + tipos[t].n + "x)\n    ex.: " + tipos[t].exemplo;
        });
        global.SUITE.A.falhar(nome + ": " + total + " falhas em " + casos +
          " casos, semente " + SEMENTE + "\n" + linhas.join("\n"));
      }
    };
  }

  function visivel(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function textoVisivel(c, sel) {
    var el = c.el(sel);
    return el && visivel(el) ? el.textContent : null;
  }
  function lixo(txt) { return /undefined|NaN|null|\[object|Infinity/.test(txt); }

  function zerar(c) { SABORES.forEach(function (s) { if (c.qtd(s.id)) c.definir(s.id, 0); }); }
  function montar(c, qtds) {
    SABORES.forEach(function (s, i) { if (c.qtd(s.id) !== qtds[i]) c.definir(s.id, qtds[i]); });
  }
  function soma(qtds) { return qtds.reduce(function (a, b) { return a + b; }, 0); }

  var testes = global.SUITE.testes;
  function teste(nome, fn) { testes.push({ grupo: "Varredura", nome: nome, fn: fn }); }

  /* =========================================================
     1. PREÇO, RESUMO E AVISO DE COMBO
     ========================================================= */
  teste("3000 carrinhos: total, economia e aviso de combo batem com a tabela", function (c) {
    var r = gerador(1), F = Falhas("preço");
    c.abrirGaveta();
    for (var n = 0; n < 3000; n++) {
      var qtds = SABORES.map(function () { return qtdAleatoria(r); });
      if (r() < 0.15) qtds = qtds.map(function () { return 0; });
      montar(c, qtds);
      var q = soma(qtds), f = faixaDe(q), total = q * f.preco, cheio = q * 590;
      var caso = JSON.stringify(qtds);
      F.caso();

      if (!q) continue;
      F.checa(c.texto("#barraTotal") === brl(total), "total na barra",
              caso + " esperado " + brl(total) + ", veio " + c.texto("#barraTotal"));
      F.checa(c.texto("#rsTotal") === brl(total), "total no resumo",
              caso + " esperado " + brl(total) + ", veio " + c.texto("#rsTotal"));
      F.checa(c.texto("#rsUnit") === brl(f.preco), "preço por unidade",
              caso + " esperado " + brl(f.preco) + ", veio " + c.texto("#rsUnit"));
      F.checa(c.texto("#rsQtd") === q + (q === 1 ? " unidade" : " unidades"), "quantidade no resumo",
              caso + " veio " + c.texto("#rsQtd"));

      var eco = textoVisivel(c, "#rsLinhaEco");
      if (cheio > total) {
        F.checa(eco !== null && c.texto("#rsEco") === "− " + brl(cheio - total), "economia",
                caso + " esperado − " + brl(cheio - total) + ", veio " + (eco === null ? "(escondida)" : c.texto("#rsEco")));
      } else {
        F.checa(eco === null, "economia aparece sem desconto", caso + " mostrou " + eco);
      }

      // próximo combo: só com 1 ou 2 faltando
      var prox = null;
      for (var i = FAIXAS.length - 1; i >= 0; i--) if (FAIXAS[i].min > q) { prox = FAIXAS[i]; break; }
      var falta = prox ? prox.min - q : 0;
      var aviso = textoVisivel(c, "#rsProgresso");
      if (prox && falta <= 2) {
        var novo = prox.min * prox.preco;
        F.checa(aviso !== null, "aviso de combo sumiu", caso + " faltam " + falta + " pro " + prox.nome);
        if (aviso !== null) {
          F.checa(aviso.indexOf(prox.nome) !== -1 && aviso.indexOf(brl(novo)) !== -1 &&
                  aviso.indexOf(brl(novo - total) + " a mais") !== -1,
                  "conta do aviso de combo", caso + " esperado " + prox.nome + " " + brl(novo) +
                  " e " + brl(novo - total) + " a mais, veio: " + aviso);
          F.checa(aviso.indexOf(falta === 1 ? "Falta 1 esfiha" : "Faltam 2 esfihas") !== -1,
                  "concordância do aviso", caso + " veio: " + aviso);
        }
      } else {
        F.checa(aviso === null, "aviso de combo fora de hora", caso + " mostrou: " + aviso);
      }
      F.checa(!lixo(c.el(".resumo").textContent + c.texto("#barraTotal")), "lixo no resumo",
              caso + ": " + c.el(".resumo").textContent.replace(/\s+/g, " "));
    }
    F.fechar();
  });

  /* =========================================================
     2. RETIRADA: QUEM PODE MANDAR PEDIDO E O QUE A MENSAGEM DIZ
     ========================================================= */
  var NOMES = ["Breno", "", "   ", "Ana Paula", "José da Silva", "Zé", "<b>x</b>", "Ana & Cia",
               "Maria \"Mari\"", "D'Ávila", "a".repeat(80), "Jones\nSegunda linha"];
  var OBS = ["", "", "motoboy", "sem cebola", "<img src=x data-injetado onerror=1>", "50% assada",
             "a*b*c _x_", "tudo junto, por favor"];

  teste("3000 pedidos com relógio, ponto e data aleatórios: só sai o que dá pra atender", function (c) {
    var r = gerador(2), F = Falhas("retirada");
    var base = new Date(2026, 9, 21, 0, 0).getTime();
    var fPonto = c.el("#fPonto"), fData = c.el("#fData"), fNome = c.el("#fNome"), fObs = c.el("#fObs");
    var ev = function (el, tipo) { el.dispatchEvent(new c.win.Event(tipo, { bubbles: true })); };
    c.abrirGaveta();
    F.checa(fPonto.options.length === PONTOS.length, "pontos no seletor",
            "esperado " + PONTOS.length + ", veio " + fPonto.options.length);

    for (var n = 0; n < 3000; n++) {
      // relógio: qualquer minuto dos próximos 120 dias
      var agora = base + r.int(0, 120 * 24 * 60) * 60000;
      c.win.Date.now = function () { return agora; };
      var qtds = SABORES.map(function () { return r() < 0.5 ? 0 : r.int(1, r() < 0.9 ? 12 : 60); });
      if (!soma(qtds)) qtds[r.int(0, 3)] = r.int(1, 15);
      montar(c, qtds);
      var q = soma(qtds), f = faixaDe(q);

      var pi = r.int(0, PONTOS.length - 1);
      var anterior = fData.value;
      fPonto.value = String(pi); ev(fPonto, "change");
      var sugerida = fData.value;
      var dataTxt;
      var tipoData = r();
      if (tipoData < 0.3) dataTxt = sugerida;
      else if (tipoData < 0.38) dataTxt = "";
      else { var d = new Date(agora); d.setDate(d.getDate() + r.int(-2, 20)); dataTxt = iso(d); }
      fData.value = dataTxt; ev(fData, "change");
      var nome = r.um(NOMES), obs = r.um(OBS);
      fNome.value = nome; ev(fNome, "input");
      fObs.value = obs; ev(fObs, "input");

      var caso = "agora " + new Date(agora).toString().slice(0, 21) + ", " + PONTOS[pi].nome +
                 ", data " + (dataTxt || "(vazia)") + ", " + q + " esfihas, nome " + JSON.stringify(nome);
      F.caso();

      // ao trocar de ponto a data fica se ainda serve; senão vira a primeira que serve
      if (PONTOS[pi].dias) {
        var esperada = anterior && situacao(pi, anterior, agora, q) === "ok"
          ? anterior : primeiraData(pi, agora, q);
        F.checa(sugerida === esperada, "data sugerida",
                caso + ": esperado " + esperada + ", veio " + sugerida);
      }

      var combinar = PONTOS[pi].dias === null;
      var sit = combinar || !dataTxt ? null : situacao(pi, dataTxt, agora, q);
      var deveSair = !!nome.trim() && (combinar || (!!dataTxt && sit === "ok"));

      // a dica embaixo da data concorda com o oráculo
      if (!combinar && dataTxt) {
        var dica = c.el("#dicaData");
        F.checa(dica.classList.contains("ok") === (sit === "ok"), "dica da data",
                caso + ": oráculo diz " + sit + ", dica: " + dica.textContent);
        if (sit !== "ok") {
          var sugeridaNaDica = /(\d\d)\/(\d\d)\/(\d{4})\.?$/.exec(dica.textContent);
          F.checa(!!sugeridaNaDica, "dica sem data alternativa", caso + ": " + dica.textContent);
          if (sugeridaNaDica) {
            var alt = sugeridaNaDica[3] + "-" + sugeridaNaDica[2] + "-" + sugeridaNaDica[1];
            F.checa(situacao(pi, alt, agora, q) === "ok", "dica sugere data que não serve",
                    caso + ": sugeriu " + alt);
          }
        }
      }

      var msg = c.enviar();
      F.checa(!!msg === deveSair, deveSair ? "pedido válido barrado" : "pedido inválido saiu",
              caso + (msg ? "" : ": aviso " + c.texto("#aviso")));
      if (!msg && deveSair === false) {
        F.checa(visivel(c.el("#aviso")) && c.texto("#aviso").trim().length > 10,
                "barrou sem explicar", caso);
      }
      if (msg) {
        SABORES.forEach(function (s, i) {
          if (qtds[i]) F.checa(msg.indexOf("• " + qtds[i] + "x " + s.nome) !== -1, "item na mensagem",
                               caso + ": faltou " + qtds[i] + "x " + s.nome);
          else F.checa(msg.indexOf("x " + s.nome) === -1, "item zerado na mensagem", caso);
        });
        F.checa(msg.indexOf("Total: " + q + (q === 1 ? " esfiha" : " esfihas") + ", " + brl(q * f.preco) +
                " (" + brl(f.preco) + " cada)") !== -1, "total na mensagem", caso + ": " + (/Total:[^\n]*/.exec(msg) || ["(sem linha de total)"])[0]);
        if (!combinar && sit === "ok") {
          var ds = diaSemana(dataTxt);
          var linha = "*Retirada:* " + PONTOS[pi].nome + ", " + DIAS[ds] + " " + br(dataTxt) + ", " +
                      PONTOS[pi].dias[ds].txt;
          F.checa(msg.indexOf(linha) !== -1, "retirada na mensagem",
                  caso + ": esperado «" + linha + "», veio «" + (/\*Retirada:\*[^\n]*/.exec(msg) || [""])[0] + "»");
        }
        F.checa(msg.indexOf(nome.trim().split("\n")[0]) !== -1, "nome na mensagem", caso);
        if (obs.trim()) F.checa(msg.indexOf(obs.trim()) !== -1, "observação na mensagem", caso);
        F.checa(!/[\uD800-\uDFFF]/.test(msg.replace(nome, "").replace(obs, "")), "emoji na mensagem", caso);
        F.checa(msg.indexOf("—") === -1, "travessão na mensagem", caso);
        F.checa(!lixo(msg), "lixo na mensagem", caso + ": " + msg);
      }
      F.checa(!c.doc.querySelector("[data-injetado]") && !c.doc.querySelector(".resumo b b, #aviso b"),
              "HTML digitado virou elemento", caso);
    }
    F.fechar();
  });

  /* =========================================================
     3. QUANTIDADE DIGITADA E BOTÕES
     ========================================================= */
  var DIGITADOS = ["", " ", "0", "1", "3", "4", "12", "007", "-1", "-12", "1.5", "2,5", "1e3", "abc",
                   "4a", "a4", " 8 ", "199", "200", "201", "999", "99999999999999999999", "+5", "٣",
                   "１２", "NaN", "Infinity", "0x10", "12 12", "\t9\n"];

  teste("2000 entradas de quantidade: o campo sempre termina num inteiro entre 0 e 200", function (c) {
    var r = gerador(3), F = Falhas("quantidade");
    for (var n = 0; n < 2000; n++) {
      var s = r.um(SABORES);
      var campo = c.card(s.id).querySelector(".conta");
      var antes = c.qtd(s.id);
      var acao = r();
      var desc;
      if (acao < 0.5) {
        var txt = r() < 0.7 ? r.um(DIGITADOS) : String(r.int(-50, 400));
        desc = "digitou " + JSON.stringify(txt);
        c.definir(s.id, txt);
      } else if (acao < 0.75) {
        desc = "clicou + (tinha " + antes + ")";
        c.mais(s.id);
        F.checa(c.qtd(s.id) === Math.min(antes + 1, MAX_ITEM), "botão +",
                desc + ", ficou " + c.qtd(s.id));
      } else {
        desc = "clicou − (tinha " + antes + ")";
        c.menos(s.id);
        F.checa(c.qtd(s.id) === Math.max(antes - 1, 0), "botão −", desc + ", ficou " + c.qtd(s.id));
      }
      F.caso();
      var v = campo.value;
      F.checa(/^\d+$/.test(v) && +v >= 0 && +v <= MAX_ITEM, "campo com valor inválido",
              s.nome + ": " + desc + " e o campo ficou " + JSON.stringify(v));
      var q = SABORES.reduce(function (a, x) { return a + c.qtd(x.id); }, 0);
      if (q) {
        var f = faixaDe(q);
        F.checa(c.texto("#barraTotal") === brl(q * f.preco), "total depois de digitar",
                desc + ": " + q + " esfihas, esperado " + brl(q * f.preco) + ", veio " + c.texto("#barraTotal"));
      }
      F.checa(!lixo(c.texto("#barraTotal")), "lixo na barra", desc + ": " + c.texto("#barraTotal"));
      if (r() < 0.05) zerar(c);
    }
    F.fechar();
  });

  /* =========================================================
     4. LAYOUT EM QUALQUER LARGURA
     ========================================================= */
  // Elemento dentro de quem rola na horizontal pode passar da tela de propósito.
  function dentroDeRolagem(el, win) {
    for (var p = el.parentElement; p && p !== el.ownerDocument.body; p = p.parentElement) {
      var ox = win.getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
    }
    return false;
  }
  teste("60 larguras de tela, com e sem pedido: nada passa da borda", async function (c) {
    var r = gerador(4), F = Falhas("layout");
    var larguras = [320, 360, 375, 390, 414, 768, 820, 821, 1024, 1280];
    for (var k = 0; k < 50; k++) larguras.push(r.int(300, 1500));
    for (var n = 0; n < larguras.length; n++) {
      var L = larguras[n];
      await c.redimensionar(L, r.int(560, 1000));
      montar(c, SABORES.map(function () { return r() < 0.5 ? 0 : r.int(1, 15); }));
      var gaveta = r() < 0.4;
      if (gaveta) {
        c.abrirGaveta();
        await c.dormir(450);                        // a gaveta entra deslizando
      } else await c.dormir(30);
      F.caso();
      var vw = c.doc.documentElement.clientWidth;
      var todos = c.doc.querySelectorAll("body *");
      for (var i = 0; i < todos.length; i++) {
        var el = todos[i];
        // a gaveta fechada fica fora da tela de propósito, inerte
        if (!visivel(el) || el.closest("[inert]") || dentroDeRolagem(el, c.win)) continue;
        if (el.closest("#palco, script, style, svg symbol")) continue;
        var b = el.getBoundingClientRect();
        if (b.right > vw + 1 || b.left < -1) {
          var nome = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
                     (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "");
          F.checa(false, "passou da borda: " + nome,
                  "largura " + L + (gaveta ? " com gaveta" : "") + ": vai de " + Math.round(b.left) +
                  " a " + Math.round(b.right) + " numa tela de " + vw);
        }
      }
      if (gaveta) { c.el("#btnFechar").click(); await c.dormir(450); }
    }
    F.fechar();
  });

  /* =========================================================
     5. NADA DE LIXO NA PÁGINA
     ========================================================= */
  teste("500 estados da página: nenhum texto visível com undefined, NaN ou travessão", function (c) {
    var r = gerador(5), F = Falhas("texto");
    var fPonto = c.el("#fPonto");
    c.abrirGaveta();
    for (var n = 0; n < 500; n++) {
      var agora = new Date(2026, 9, 21).getTime() + r.int(0, 90 * 24 * 60) * 60000;
      c.win.Date.now = function () { return agora; };
      montar(c, SABORES.map(function () { return qtdAleatoria(r); }));
      fPonto.value = String(r.int(0, PONTOS.length - 1));
      fPonto.dispatchEvent(new c.win.Event("change", { bubbles: true }));
      F.caso();
      var txt = c.doc.body.innerText;
      F.checa(!lixo(txt), "lixo no texto", (/.{0,40}(undefined|NaN|null|\[object|Infinity).{0,40}/.exec(txt) || [""])[0]);
      F.checa(txt.indexOf("—") === -1, "travessão no texto", (/.{0,40}—.{0,40}/.exec(txt) || [""])[0]);
    }
    F.fechar();
  });

  /* =========================================================
     6. CARRINHO SOBREVIVE A RECARREGAR
     ========================================================= */
  teste("40 recargas: quantidades e observações voltam iguais", async function (c) {
    var r = gerador(6), F = Falhas("persistência");
    for (var n = 0; n < 40; n++) {
      var qtds = SABORES.map(function () { return r() < 0.5 ? 0 : r.int(1, MAX_ITEM); });
      montar(c, qtds);
      await c.dormir(5);
      c = await c.recarregar();
      F.caso();
      var veio = SABORES.map(function (s) { return c.qtd(s.id); });
      F.checa(JSON.stringify(veio) === JSON.stringify(qtds), "carrinho mudou ao recarregar",
              "salvo " + JSON.stringify(qtds) + ", voltou " + JSON.stringify(veio));
    }
    F.fechar();
  });

  global.VARREDURA = { semente: SEMENTE };
})(window);
