/*
 * Suíte de testes do site da Esfihas Sayones.
 *
 * Não depende de nada instalado: abra tests/index.html no navegador (ou
 * sirva a pasta com `python3 -m http.server`) e a suíte roda sozinha.
 * Cada teste recebe um `ctx` com o site recém-carregado num iframe limpo.
 */
(function (global) {
  "use strict";

  /* ---------------- asserções ---------------- */
  function falhar(msg, esperado, recebido) {
    var e = new Error(msg + (arguments.length > 1
      ? "\n  esperado: " + JSON.stringify(esperado) + "\n  recebido: " + JSON.stringify(recebido)
      : ""));
    e.assercao = true;
    throw e;
  }
  function ok(cond, msg) { if (!cond) falhar(msg || "esperava verdadeiro"); }
  function igual(recebido, esperado, msg) {
    if (recebido !== esperado) falhar(msg || "valores diferentes", esperado, recebido);
  }
  function contem(texto, trecho, msg) {
    if (String(texto).indexOf(trecho) === -1)
      falhar(msg || "trecho ausente", trecho, String(texto).slice(0, 220));
  }
  function naoContem(texto, trecho, msg) {
    if (String(texto).indexOf(trecho) !== -1)
      falhar(msg || "trecho não deveria aparecer", "sem " + trecho, String(texto).slice(0, 220));
  }
  function perto(recebido, esperado, tolerancia, msg) {
    if (Math.abs(recebido - esperado) > (tolerancia || 0.001))
      falhar(msg || "fora da tolerância", esperado, recebido);
  }

  var A = { ok: ok, igual: igual, contem: contem, naoContem: naoContem, perto: perto, falhar: falhar };

  /* ---------------- testes ---------------- */
  var testes = [];
  function teste(grupo, nome, fn) { testes.push({ grupo: grupo, nome: nome, fn: fn }); }

  /* =========================================================
     PREÇOS E COMBOS
     ========================================================= */
  teste("Preços", "uma esfiha avulsa custa R$ 5,00", function (c) {
    c.definir("calabresa", 1);
    igual(c.texto("#barraTotal"), "R$ 5,00");
  });

  teste("Preços", "três esfihas ainda são preço cheio", function (c) {
    c.definir("calabresa", 3);
    igual(c.texto("#barraTotal"), "R$ 15,00");
    c.abrirGaveta();
    igual(c.texto("#rsUnit"), "R$ 5,00");
  });

  teste("Preços", "quatro esfihas entram no Combo 4", function (c) {
    c.definir("calabresa", 4);
    igual(c.texto("#barraTotal"), "R$ 19,00");
    c.abrirGaveta();
    igual(c.texto("#rsUnit"), "R$ 4,75");
  });

  teste("Preços", "sete esfihas continuam no Combo 4", function (c) {
    c.definir("calabresa", 7);
    igual(c.texto("#barraTotal"), "R$ 33,25");
  });

  teste("Preços", "oito esfihas entram no Combo 8", function (c) {
    c.definir("carne", 8);
    igual(c.texto("#barraTotal"), "R$ 36,80");
    c.abrirGaveta();
    igual(c.texto("#rsUnit"), "R$ 4,60");
  });

  teste("Preços", "doze esfihas entram no Combo 12", function (c) {
    c.definir("queijo", 12);
    igual(c.texto("#barraTotal"), "R$ 54,00");
    c.abrirGaveta();
    igual(c.texto("#rsUnit"), "R$ 4,50");
  });

  teste("Preços", "acima de doze o preço por unidade não cai mais", function (c) {
    c.definir("calabresa", 40);
    igual(c.texto("#barraTotal"), "R$ 180,00");
  });

  teste("Preços", "o combo conta o total do pedido, misturando sabores", function (c) {
    c.definir("calabresa", 5);
    c.definir("carne", 4);
    c.definir("queijo", 3);          // 12 no total
    igual(c.texto("#barraTotal"), "R$ 54,00");
    c.abrirGaveta();
    igual(c.texto("#rsUnit"), "R$ 4,50");
  });

  teste("Preços", "a economia é a diferença para o preço cheio", function (c) {
    c.definir("calabresa", 12);
    c.abrirGaveta();
    ok(!c.el("#rsLinhaEco").hidden, "a linha de economia deveria aparecer");
    igual(c.texto("#rsEco"), "− R$ 6,00");   // 12 x 5,00 = 60,00 contra 54,00
  });

  teste("Preços", "sem desconto, a linha de economia some", function (c) {
    c.definir("calabresa", 2);
    c.abrirGaveta();
    ok(c.el("#rsLinhaEco").hidden, "não há economia em pedido de 2 unidades");
  });

  teste("Preços", "o aviso diz quantas faltam para o próximo combo", function (c) {
    c.definir("calabresa", 6);
    c.abrirGaveta();
    var aviso = c.texto("#rsProgresso");
    contem(aviso, "Faltam 2");
    contem(aviso, "Combo 8");
  });

  teste("Preços", "no maior combo o aviso de progresso some", function (c) {
    c.definir("calabresa", 12);
    c.abrirGaveta();
    ok(c.el("#rsProgresso").hidden, "não há próximo combo depois do 12");
  });

  teste("Preços", "o combo vigente fica destacado na seção de preços", function (c) {
    c.definir("calabresa", 9);
    var destacado = c.doc.querySelector(".faixa.destaque");
    ok(destacado, "algum combo deveria estar destacado");
    igual(destacado.dataset.min, "8");
  });

  teste("Preços", "os combos anunciados batem com o que o carrinho cobra", function (c) {
    var faixas = [].slice.call(c.doc.querySelectorAll(".faixa"));
    faixas.forEach(function (f) {
      var min = parseInt(f.dataset.min, 10);
      if (min < 2) return;                       // a avulsa mostra preço unitário
      var anunciado = f.querySelector(".un").textContent.replace(/\s/g, "");
      c.definir("calabresa", min);
      var cobrado = c.texto("#barraTotal").replace(/\s/g, "");
      igual(cobrado, anunciado, "combo de " + min + " unidades");
    });
  });

  /* =========================================================
     CARRINHO
     ========================================================= */
  teste("Carrinho", "o carrinho começa vazio", function (c) {
    igual(c.texto("#barraTotal"), "R$ 0,00");
    igual(c.texto("#barraQtd"), "nenhuma esfiha");
    c.abrirGaveta();
    ok(!c.el("#blocoVazio").hidden, "deveria mostrar o estado vazio");
    ok(c.el("#btnEnviar").disabled, "o botão de enviar deveria estar travado");
  });

  teste("Carrinho", "o botão de mais soma de um em um", function (c) {
    c.mais("calabresa"); c.mais("calabresa"); c.mais("carne");
    igual(c.qtd("calabresa"), 2);
    igual(c.qtd("carne"), 1);
    igual(c.texto("#barraTotal"), "R$ 15,00");
  });

  teste("Carrinho", "o botão de menos fica travado no zero", function (c) {
    var menos = c.card("calabresa").querySelector('[data-op="-1"]');
    ok(menos.disabled, "deveria começar desabilitado");
    c.mais("calabresa");
    ok(!menos.disabled, "deveria liberar com 1 no carrinho");
    menos.click();
    igual(c.qtd("calabresa"), 0);
    ok(menos.disabled, "deveria travar de novo no zero");
  });

  teste("Carrinho", "dá para digitar a quantidade direto", function (c) {
    c.definir("calabresa", 12);
    igual(c.qtd("calabresa"), 12);
    igual(c.texto("#barraTotal"), "R$ 54,00");
  });

  teste("Carrinho", "o campo de quantidade ignora o que não é número", function (c) {
    var campo = c.card("calabresa").querySelector(".conta");
    campo.focus();
    campo.value = "1a2b";
    campo.dispatchEvent(new c.win.Event("input", { bubbles: true }));
    igual(campo.value, "12");
    igual(c.qtd("calabresa"), 12);
  });

  teste("Carrinho", "a quantidade por sabor tem teto", function (c) {
    c.definir("calabresa", 999);
    ok(c.qtd("calabresa") <= 200, "esperava teto de 200, veio " + c.qtd("calabresa"));
  });

  teste("Carrinho", "campo vazio vale zero e volta a mostrar zero ao sair", function (c) {
    c.definir("calabresa", 5);
    var campo = c.card("calabresa").querySelector(".conta");
    campo.focus();
    campo.value = "";
    campo.dispatchEvent(new c.win.Event("input", { bubbles: true }));
    igual(c.qtd("calabresa"), 0);
    campo.blur();
    igual(campo.value, "0");
  });

  teste("Carrinho", "as setas do teclado ajustam a quantidade", function (c) {
    c.definir("calabresa", 5);
    var campo = c.card("calabresa").querySelector(".conta");
    campo.focus();
    campo.dispatchEvent(new c.win.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    igual(c.qtd("calabresa"), 6);
    igual(campo.value, "6", "o campo precisa acompanhar o estado");
    campo.dispatchEvent(new c.win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    igual(c.qtd("calabresa"), 5);
    igual(campo.value, "5");
  });

  teste("Carrinho", "a lixeira tira o sabor inteiro do pedido", function (c) {
    c.definir("calabresa", 6);
    c.definir("carne", 3);
    c.abrirGaveta();
    igual(c.doc.querySelectorAll("#linhas .linha").length, 2);
    c.doc.querySelector('#linhas [data-sabor="calabresa"] .linha-acao.remover').click();
    igual(c.qtd("calabresa"), 0);
    igual(c.doc.querySelectorAll("#linhas .linha").length, 1);
    igual(c.texto("#barraTotal"), "R$ 15,00");
  });

  teste("Carrinho", "esvaziar pela lixeira volta ao estado vazio", function (c) {
    c.definir("carne", 2);
    c.abrirGaveta();
    c.doc.querySelector('#linhas [data-sabor="carne"] .linha-acao.remover').click();
    ok(!c.el("#blocoVazio").hidden, "deveria voltar ao estado vazio");
    ok(c.el("#btnEnviar").disabled, "enviar deveria travar de novo");
  });

  teste("Carrinho", "a observação por item abre e fecha", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    var linha = c.doc.querySelector('#linhas [data-sabor="calabresa"]');
    var botao = linha.querySelector(".linha-acao.obs");
    var campo = linha.querySelector(".obs-item");
    ok(campo.hidden, "deveria começar fechada");
    botao.click();
    ok(!campo.hidden, "deveria abrir no clique");
    igual(botao.getAttribute("aria-expanded"), "true");
    botao.click();
    ok(campo.hidden, "deveria fechar no segundo clique");
    igual(botao.getAttribute("aria-expanded"), "false");
  });

  teste("Carrinho", "fechar a observação apaga o que estava escrito", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    var linha = c.doc.querySelector('#linhas [data-sabor="calabresa"]');
    linha.querySelector(".linha-acao.obs").click();
    c.digitar(linha.querySelector(".obs-item"), "sem azeitona");
    linha.querySelector(".linha-acao.obs").click();
    igual(linha.querySelector(".obs-item").value, "");
    var msg = c.enviarValido();
    naoContem(msg, "sem azeitona", "a observação apagada não pode ir na mensagem");
  });

  teste("Carrinho", "tirar o item pela lixeira também descarta a observação dele", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    var linha = c.doc.querySelector('#linhas [data-sabor="calabresa"]');
    linha.querySelector(".linha-acao.obs").click();
    c.digitar(linha.querySelector(".obs-item"), "bem assada");
    linha.querySelector(".linha-acao.remover").click();
    c.definir("calabresa", 2);
    c.abrirGaveta();
    var campo = c.doc.querySelector('#linhas [data-sabor="calabresa"] .obs-item');
    igual(campo.value, "", "a observação antiga não pode reaparecer");
  });

  teste("Carrinho", "segurar o botão de mais acelera", function (c) {
    var mais = c.card("calabresa").querySelector('[data-op="1"]');
    mais.dispatchEvent(new c.win.PointerEvent("pointerdown", { bubbles: true }));
    return c.dormir(1000).then(function () {
      var n = c.qtd("calabresa");
      c.win.dispatchEvent(new c.win.PointerEvent("pointerup", { bubbles: true }));
      ok(n >= 5, "segurando 1s deveria passar de 5, veio " + n);
      return c.dormir(250).then(function () {
        igual(c.qtd("calabresa"), n, "soltar precisa parar a contagem na hora");
      });
    });
  });

  teste("Carrinho", "segurar e soltar não soma uma a mais no fim", function (c) {
    var mais = c.card("calabresa").querySelector('[data-op="1"]');
    mais.dispatchEvent(new c.win.PointerEvent("pointerdown", { bubbles: true }));
    return c.dormir(800).then(function () {
      var n = c.qtd("calabresa");
      c.win.dispatchEvent(new c.win.PointerEvent("pointerup", { bubbles: true }));
      mais.click();                       // o clique que o navegador dispara ao soltar
      igual(c.qtd("calabresa"), n, "o clique final do 'segurar' não pode contar de novo");
    });
  });

  teste("Carrinho", "segurar o menos para no zero", function (c) {
    c.definir("calabresa", 3);
    var menos = c.card("calabresa").querySelector('[data-op="-1"]');
    menos.dispatchEvent(new c.win.PointerEvent("pointerdown", { bubbles: true }));
    return c.dormir(1000).then(function () {
      c.win.dispatchEvent(new c.win.PointerEvent("pointerup", { bubbles: true }));
      igual(c.qtd("calabresa"), 0, "não pode passar do zero");
    });
  });

  /* =========================================================
     FORMULÁRIO DE RETIRADA
     ========================================================= */
  teste("Retirada", "não envia sem o nome", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    igual(c.enviar(), null, "não deveria abrir o WhatsApp");
    contem(c.texto("#aviso"), "seu nome");
    ok(c.el("#fNome").classList.contains("erro"), "o campo do nome deveria ficar marcado");
  });

  teste("Retirada", "não envia com o carrinho vazio", function (c) {
    c.abrirGaveta();
    c.el("#fNome").value = "Breno";
    igual(c.enviar(), null);
  });

  teste("Retirada", "não aceita data antes da antecedência mínima", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#fNome").value = "Breno";
    var ontem = new Date(Date.now() - 86400000);
    c.el("#fData").value = c.iso(ontem);
    igual(c.enviar(), null, "não deveria aceitar data no passado");
    contem(c.texto("#aviso"), "antecedência");
  });

  teste("Retirada", "o ponto padrão já vem com a próxima data daquele dia", function (c) {
    c.abrirGaveta();
    var ponto = c.el("#fPonto");
    igual(ponto.value, "0", "o primeiro ponto deveria vir selecionado");
    contem(ponto.options[0].textContent, "Trindade");
    var dia = new Date(c.el("#fData").value + "T12:00:00").getDay();
    igual(dia, 4, "Trindade é na quinta");
  });

  teste("Retirada", "trocar de ponto ajusta a data para o dia daquele ponto", function (c) {
    c.abrirGaveta();
    var ponto = c.el("#fPonto");
    [[1, 5, "Itacorubi"], [2, 6, "Centro"]].forEach(function (caso) {
      ponto.value = String(caso[0]);
      ponto.dispatchEvent(new c.win.Event("change", { bubbles: true }));
      var dia = new Date(c.el("#fData").value + "T12:00:00").getDay();
      igual(dia, caso[1], caso[2] + " deveria cair no dia " + caso[1]);
      contem(c.texto("#dicaData"), caso[2]);
    });
  });

  teste("Retirada", "a data sugerida respeita as 24h de antecedência", function (c) {
    c.abrirGaveta();
    var escolhida = c.el("#fData").value;
    ok(escolhida >= c.el("#fData").min,
       "a data sugerida (" + escolhida + ") não pode ser anterior ao mínimo (" + c.el("#fData").min + ")");
  });

  teste("Retirada", "a dica avisa quando o dia não bate com o ponto", function (c) {
    c.abrirGaveta();
    var data = c.el("#fData");
    var d = new Date(data.value + "T12:00:00");
    d.setDate(d.getDate() + 1);                 // sexta, mas o ponto é o da quinta
    data.value = c.iso(d);
    data.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    var dica = c.texto("#dicaData");
    contem(dica, "não está");
    contem(dica, "Trindade");
  });

  teste("Retirada", "combinar outro ponto não exige data", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    var ponto = c.el("#fPonto");
    ponto.value = String(ponto.options.length - 1);
    ponto.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    c.el("#fData").value = "";
    c.el("#fNome").value = "Breno";
    var msg = c.enviar();
    ok(msg, "deveria enviar mesmo sem data");
    contem(msg, "Combinar ponto e horário");
  });

  teste("Retirada", "a concordância do texto acompanha o ponto", function (c) {
    c.abrirGaveta();
    var ponto = c.el("#fPonto");
    ponto.value = "2";                          // Centro, no sábado
    ponto.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    contem(c.texto("#dicaData"), "no Centro");
    naoContem(c.texto("#dicaData"), "na Centro");
  });

  /* =========================================================
     MENSAGEM DO WHATSAPP
     ========================================================= */
  teste("WhatsApp", "a mensagem vai para o número da casa", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#fNome").value = "Breno";
    igual(c.enviarUrl().split("?")[0], "https://wa.me/5548988106499");
  });

  teste("WhatsApp", "a mensagem lista os itens, o total e o preço unitário", function (c) {
    c.definir("calabresa", 5);
    c.definir("carne", 3);
    var msg = c.pedidoCompleto();
    contem(msg, "• 5x Calabresa");
    contem(msg, "• 3x Carne");
    contem(msg, "Total: 8 esfihas");
    contem(msg, "R$ 36,80");
    contem(msg, "R$ 4,60 cada");
  });

  teste("WhatsApp", "a observação de cada item vai junto do item", function (c) {
    c.definir("calabresa", 4);
    c.definir("carne", 4);
    c.abrirGaveta();
    var linha = c.doc.querySelector('#linhas [data-sabor="calabresa"]');
    linha.querySelector(".linha-acao.obs").click();
    c.digitar(linha.querySelector(".obs-item"), "sem azeitona");
    var msg = c.enviarValido();
    contem(msg, "• 4x Calabresa (sem azeitona)");
    contem(msg, "• 4x Carne\n", "a carne não tem observação");
  });

  teste("WhatsApp", "a observação geral vai na mensagem", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#fObs").value = "entregar no portão";
    var msg = c.enviarValido();
    contem(msg, "entregar no portão");
  });

  teste("WhatsApp", "a mensagem traz o ponto, o dia e a janela de retirada", function (c) {
    c.definir("calabresa", 4);
    var msg = c.pedidoCompleto();
    contem(msg, "*Retirada:*");
    contem(msg, "Trindade");
    contem(msg, "quinta");
    contem(msg, "das 18h30 às 20h30");
  });

  teste("WhatsApp", "a mensagem não usa travessão", function (c) {
    c.definir("calabresa", 12);
    naoContem(c.pedidoCompleto(), "—");
  });

  /* =========================================================
     GAVETA, FOCO E TECLADO
     ========================================================= */
  teste("Gaveta", "fechada, fica fora do caminho do teclado", function (c) {
    ok(c.el("#gaveta").hasAttribute("inert"), "deveria estar inerte fechada");
    c.abrirGaveta();
    ok(!c.el("#gaveta").hasAttribute("inert"), "deveria sair do inerte ao abrir");
  });

  teste("Gaveta", "Esc fecha", function (c) {
    c.abrirGaveta();
    c.doc.dispatchEvent(new c.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    ok(!c.el("#gaveta").classList.contains("aberta"), "deveria fechar no Esc");
    ok(c.el("#gaveta").hasAttribute("inert"));
  });

  teste("Gaveta", "clicar fora fecha", function (c) {
    c.abrirGaveta();
    c.el("#veu").click();
    ok(!c.el("#gaveta").classList.contains("aberta"));
  });

  teste("Gaveta", "o foco volta para o botão que abriu", function (c) {
    var botao = c.doc.querySelector("[data-abrir-pedido]");
    botao.focus();
    botao.click();
    c.el("#btnFechar").click();
    igual(c.doc.activeElement, botao, "o foco deveria voltar para quem abriu");
  });

  teste("Gaveta", "a barra flutuante some quando a gaveta está aberta", function (c) {
    c.definir("calabresa", 4);
    ok(c.el("#barra").classList.contains("visivel"), "a barra deveria aparecer com itens");
    c.abrirGaveta();
    ok(!c.el("#barra").classList.contains("visivel"), "a barra não deveria duplicar a gaveta");
  });

  /* =========================================================
     NAVEGAÇÃO
     ========================================================= */
  teste("Navegação", "clicar na marca volta para o topo", function (c) {
    // O alvo antigo era o cabeçalho, que é grudado: cada clique andava um
    // pouco e nunca chegava no começo. Aqui a gente confere que chega.
    c.doc.documentElement.style.scrollBehavior = "auto";
    c.win.scrollTo(0, 1400);
    ok(c.win.scrollY > 200, "precondição: a página precisa estar rolada, veio " + c.win.scrollY);
    c.doc.querySelector(".marca").click();
    return c.esperar(function () { return c.win.scrollY === 0; }, 2000)
      .then(null, function () {
        falhar("não chegou no topo; parou em " + Math.round(c.win.scrollY) + "px");
      });
  });

  teste("Navegação", "um clique na marca basta, não precisa insistir", function (c) {
    c.doc.documentElement.style.scrollBehavior = "auto";
    c.win.scrollTo(0, 2400);
    var antes = c.win.scrollY;
    c.doc.querySelector(".marca").click();
    return c.esperar(function () { return c.win.scrollY === 0; }, 2000)
      .then(null, function () {
        falhar("um clique só levou de " + Math.round(antes) + "px para " +
               Math.round(c.win.scrollY) + "px");
      });
  });

  teste("Navegação", "todos os links do menu apontam para seções que existem", function (c) {
    var quebrados = [].slice.call(c.doc.querySelectorAll('a[href^="#"]'))
      .map(function (a) { return a.getAttribute("href"); })
      .filter(function (h) { return h !== "#topo" && !c.doc.querySelector(h); });
    igual(quebrados.join(", "), "", "âncoras sem destino");
  });

  teste("Navegação", "todo ícone SVG referenciado existe", function (c) {
    var quebrados = [].slice.call(c.doc.querySelectorAll("use"))
      .map(function (u) { return u.getAttribute("href"); })
      .filter(function (h) { return !c.doc.querySelector("symbol" + h); });
    igual(quebrados.join(", "), "", "ícones sem símbolo correspondente");
  });

  /* =========================================================
     PERSISTÊNCIA
     ========================================================= */
  teste("Persistência", "o carrinho sobrevive ao recarregar", function (c) {
    c.definir("calabresa", 7);
    c.definir("carne", 2);
    return c.recarregar().then(function (c2) {
      igual(c2.qtd("calabresa"), 7);
      igual(c2.qtd("carne"), 2);
      igual(c2.texto("#barraTotal"), "R$ 41,40");   // 9 x 4,60
    });
  });

  teste("Persistência", "a observação por item sobrevive ao recarregar", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    var linha = c.doc.querySelector('#linhas [data-sabor="calabresa"]');
    linha.querySelector(".linha-acao.obs").click();
    c.digitar(linha.querySelector(".obs-item"), "bem assada");
    return c.recarregar().then(function (c2) {
      c2.abrirGaveta();
      var campo = c2.doc.querySelector('#linhas [data-sabor="calabresa"] .obs-item');
      igual(campo.value, "bem assada");
      ok(!campo.hidden, "o campo deveria reaparecer aberto");
    });
  });

  teste("Persistência", "dado corrompido no armazenamento não quebra a página", function (c) {
    global.localStorage.setItem("sayones-pedido-v2", "{isso não é json");
    return c.recarregar().then(function (c2) {
      igual(c2.texto("#barraTotal"), "R$ 0,00", "deveria abrir com o carrinho zerado");
      igual(c2.erros.length, 0, "não deveria estourar erro: " + c2.erros.join(" | "));
    });
  });

  /* =========================================================
     CONTEÚDO E SEO
     ========================================================= */
  teste("Conteúdo", "o texto visível não usa travessão", function (c) {
    var achados = (c.doc.body.innerText.match(/—/g) || []).length;
    igual(achados, 0, "travessões no texto");
  });

  teste("Conteúdo", "título e descrição estão preenchidos", function (c) {
    contem(c.doc.title, "Esfihas Sayones");
    var desc = c.doc.querySelector('meta[name="description"]').content;
    ok(desc.length > 80 && desc.length < 200, "descrição com " + desc.length + " caracteres");
    contem(desc.toLowerCase(), "esfiha", "a descrição precisa citar o produto");
  });

  teste("Conteúdo", "o JSON-LD de negócio local é válido", function (c) {
    var bloco = c.doc.querySelector('script[type="application/ld+json"]');
    ok(bloco, "deveria existir um bloco JSON-LD");
    var dado = JSON.parse(bloco.textContent);
    igual(dado["@type"], "FoodEstablishment");
    igual(dado.name, "Esfihas Sayones");
    ok(dado.hasMenu.hasMenuSection[0].hasMenuItem.length >= 3, "o cardápio deveria listar os sabores");
  });

  teste("Conteúdo", "a imagem de compartilhamento é um PNG", function (c) {
    var og = c.doc.querySelector('meta[property="og:image"]').content;
    ok(/\.png$/i.test(og), "WhatsApp e Facebook não renderizam SVG: " + og);
  });

  teste("Conteúdo", "os três sabores aparecem no cardápio", function (c) {
    var nomes = [].slice.call(c.doc.querySelectorAll(".card h3")).map(function (h) { return h.textContent; });
    igual(nomes.join(", "), "Calabresa, Carne, Queijo");
  });

  teste("Conteúdo", "cada sabor tem o seu próprio desenho", function (c) {
    var icones = [].slice.call(c.doc.querySelectorAll(".card-ilu use"))
      .map(function (u) { return u.getAttribute("href"); });
    igual(icones.join(", "), "#ic-calabresa, #ic-carne, #ic-queijo");
  });

  /* =========================================================
     ACESSIBILIDADE
     ========================================================= */
  teste("Acessibilidade", "todo campo tem rótulo associado", function (c) {
    var sem = [].slice.call(c.doc.querySelectorAll("input, select, textarea"))
      .filter(function (i) {
        if (i.getAttribute("aria-label")) return false;
        return !i.id || !c.doc.querySelector('label[for="' + i.id + '"]');
      })
      .map(function (i) { return i.id || i.className || i.type; });
    igual(sem.join(", "), "", "campos sem rótulo");
  });

  teste("Acessibilidade", "os botões de quantidade se explicam", function (c) {
    var sem = [].slice.call(c.doc.querySelectorAll("button[data-op]"))
      .filter(function (b) { return !b.getAttribute("aria-label"); });
    igual(sem.length, 0, "botões de quantidade sem aria-label");
  });

  teste("Acessibilidade", "a página tem um h1 só", function (c) {
    igual(c.doc.querySelectorAll("h1").length, 1);
  });

  teste("Acessibilidade", "imagens e ícones decorativos não poluem o leitor de tela", function (c) {
    var expostos = [].slice.call(c.doc.querySelectorAll(".card-ilu, .prato svg, .linha svg"))
      .filter(function (s) { return !s.closest('[aria-hidden="true"]'); })
      .map(function (s) { return s.getAttribute("class") || s.parentElement.className; });
    igual(expostos.join(", "), "", "SVG decorativo visível para o leitor de tela");
  });

  /* =========================================================
     LAYOUT
     ========================================================= */
  teste("Layout", "não há estouro horizontal no celular", function (c) {
    return c.redimensionar(390, 844).then(function () {
      var vw = c.doc.documentElement.clientWidth;
      var culpados = [].slice.call(c.doc.querySelectorAll("main *, header *, footer *"))
        .filter(function (el) {
          if (el.closest(".nav")) return false;            // a tira de menu rola de propósito
          var r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > vw + 1 || r.left < -1);
        })
        .map(function (el) { return el.tagName.toLowerCase() + "." + (el.className || ""); });
      igual(culpados.slice(0, 4).join(" | "), "", "elementos passando da tela");
    });
  });

  teste("Layout", "no celular os três sabores têm a mesma altura", function (c) {
    return c.redimensionar(390, 844).then(function () {
      var alturas = [].slice.call(c.doc.querySelectorAll(".card"))
        .map(function (el) { return Math.round(el.getBoundingClientRect().height); });
      igual(alturas[0], alturas[1], "calabresa e carne");
      igual(alturas[1], alturas[2], "carne e queijo");
    });
  });

  teste("Layout", "no celular os três sabores cabem numa tela só", function (c) {
    return c.redimensionar(390, 844).then(function () {
      c.doc.documentElement.style.scrollBehavior = "auto";
      var secao = c.el("#cardapio");
      c.win.scrollTo({ top: secao.offsetTop - 96, behavior: "instant" });
      var ultimo = c.doc.querySelectorAll(".card")[2].getBoundingClientRect().bottom;
      ok(ultimo <= c.win.innerHeight,
         "o terceiro card termina em " + Math.round(ultimo) + "px, tela de " + c.win.innerHeight + "px");
    });
  });

  teste("Layout", "a tira de menu do celular avisa que rola", function (c) {
    return c.redimensionar(390, 844).then(function () {
      var nav = c.doc.querySelector(".nav");
      var cs = c.win.getComputedStyle(nav);
      var esmaecida = (cs.maskImage && cs.maskImage !== "none") ||
                      (cs.webkitMaskImage && cs.webkitMaskImage !== "none");
      ok(nav.scrollWidth > nav.clientWidth, "precondição: a tira precisa ter conteúdo escondido");
      ok(esmaecida, "sem o esmaecido a palavra fica cortada no meio, parecendo bug");
    });
  });

  teste("Layout", "nenhuma descrição do celular fica cortada", function (c) {
    return c.redimensionar(390, 844).then(function () {
      var cortadas = [].slice.call(c.doc.querySelectorAll(".desc.curta"))
        .filter(function (e) { return e.scrollHeight > e.clientHeight + 1; })
        .map(function (e) { return e.textContent.trim(); });
      igual(cortadas.join(" | "), "", "descrições que não cabem em duas linhas");
    });
  });

  global.SUITE = { testes: testes, A: A };
})(window);
