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
  teste("Preços", "uma esfiha avulsa custa R$ 5,90", function (c) {
    c.definir("calabresa", 1);
    igual(c.texto("#barraTotal"), "R$ 5,90");
  });

  teste("Preços", "três esfihas ainda são preço cheio", function (c) {
    c.definir("calabresa", 3);
    igual(c.texto("#barraTotal"), "R$ 17,70");
    c.abrirGaveta();
    igual(c.texto("#rsUnit"), "R$ 5,90");
  });

  teste("Preços", "quatro esfihas entram no Combo 4", function (c) {
    c.definir("calabresa", 4);
    igual(c.texto("#barraTotal"), "R$ 22,00");
    c.abrirGaveta();
    igual(c.texto("#rsUnit"), "R$ 5,50");
  });

  teste("Preços", "sete esfihas continuam no Combo 4", function (c) {
    c.definir("calabresa", 7);
    igual(c.texto("#barraTotal"), "R$ 38,50");
  });

  teste("Preços", "oito esfihas entram no Combo 8", function (c) {
    c.definir("carne", 8);
    igual(c.texto("#barraTotal"), "R$ 42,80");
    c.abrirGaveta();
    igual(c.texto("#rsUnit"), "R$ 5,35");
  });

  teste("Preços", "doze esfihas entram no Combo 12", function (c) {
    c.definir("queijo", 12);
    igual(c.texto("#barraTotal"), "R$ 62,40");
    c.abrirGaveta();
    igual(c.texto("#rsUnit"), "R$ 5,20");
  });

  teste("Preços", "acima de doze o preço por unidade não cai mais", function (c) {
    c.definir("calabresa", 40);
    igual(c.texto("#barraTotal"), "R$ 208,00");
  });

  teste("Preços", "o combo conta o total do pedido, misturando sabores", function (c) {
    c.definir("calabresa", 5);
    c.definir("carne", 4);
    c.definir("queijo", 3);          // 12 no total
    igual(c.texto("#barraTotal"), "R$ 62,40");
    c.abrirGaveta();
    igual(c.texto("#rsUnit"), "R$ 5,20");
  });

  teste("Preços", "a economia é a diferença para o preço cheio", function (c) {
    c.definir("calabresa", 12);
    c.abrirGaveta();
    ok(!c.el("#rsLinhaEco").hidden, "a linha de economia deveria aparecer");
    igual(c.texto("#rsEco"), "− R$ 8,40");   // 12 x 5,90 = 70,80 contra 62,40
  });

  teste("Preços", "sem desconto, a linha de economia some", function (c) {
    c.definir("calabresa", 2);
    c.abrirGaveta();
    ok(c.el("#rsLinhaEco").hidden, "não há economia em pedido de 2 unidades");
    igual(c.el("#rsLinhaEco").getBoundingClientRect().height, 0, "a linha de economia continua na tela");
  });

  teste("Preços", "o aviso diz quantas faltam para o próximo combo", function (c) {
    c.definir("calabresa", 6);
    c.abrirGaveta();
    var aviso = c.texto("#rsProgresso");
    contem(aviso, "Faltam 2");
    contem(aviso, "Combo 8");
  });

  teste("Preços", "o aviso concorda no singular quando falta uma só", function (c) {
    c.definir("calabresa", 3);
    c.abrirGaveta();
    var aviso = c.texto("#rsProgresso");
    contem(aviso, "Falta 1 esfiha");
    naoContem(aviso, "Faltam 1", "verbo no plural com uma unidade");
  });

  teste("Preços", "o aviso mostra o total do próximo combo e quanto ele sobe", function (c) {
    c.definir("calabresa", 10);
    c.abrirGaveta();
    var aviso = c.texto("#rsProgresso");
    contem(aviso, "Combo 12");
    contem(aviso, "R$ 62,40");                // 12 x 5,20
    contem(aviso, "R$ 8,90 a mais");          // 62,40 contra 10 x 5,35 = 53,50
  });

  teste("Preços", "longe do próximo combo o aviso não aparece", function (c) {
    c.definir("calabresa", 9);                // faltam 3 pro Combo 12
    c.abrirGaveta();
    ok(c.el("#rsProgresso").hidden, "com 3 faltando a sugestão vira insistência");
  });

  teste("Cardápio", "o topo avisa que a esfiha vai pré-assada e congelada", function (c) {
    contem(c.texto(".hero .lead"), "pré-assada e congelada");
  });

  teste("Cardápio", "o cardápio avisa que tem glúten e lactose", function (c) {
    var aviso = c.el("#alergenicos");
    ok(aviso && aviso.getBoundingClientRect().height > 0, "o aviso precisa estar visível");
    contem(aviso.textContent, "glúten");
    contem(aviso.textContent, "lactose");
  });

  teste("Preços", "no maior combo o aviso de progresso some", function (c) {
    c.definir("calabresa", 12);
    c.abrirGaveta();
    ok(c.el("#rsProgresso").hidden, "não há próximo combo depois do 12");
    // o atributo não basta: o CSS do resumo já passou por cima dele
    igual(c.el("#rsProgresso").getBoundingClientRect().height, 0, "o aviso continua na tela");
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
    igual(c.texto("#barraTotal"), "R$ 17,70");
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
    igual(c.texto("#barraTotal"), "R$ 62,40");
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
    igual(c.texto("#barraTotal"), "R$ 17,70");
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

  teste("Carrinho", "clicar de novo em Observação não apaga o que foi escrito", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    var linha = c.doc.querySelector('#linhas [data-sabor="calabresa"]');
    linha.querySelector(".linha-acao.obs").click();
    c.digitar(linha.querySelector(".obs-item"), "sem cebola");
    linha.querySelector(".linha-acao.obs").click();   // clique distraído
    igual(linha.querySelector(".obs-item").value, "sem cebola",
          "um clique não pode apagar texto sem avisar");
    ok(!linha.querySelector(".obs-item").hidden, "com texto dentro, o campo continua à vista");
  });

  teste("Carrinho", "a observação vazia se recolhe sozinha ao sair do campo", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    var linha = c.doc.querySelector('#linhas [data-sabor="calabresa"]');
    var botao = linha.querySelector(".linha-acao.obs");
    botao.click();
    var campo = linha.querySelector(".obs-item");
    ok(!campo.hidden, "deveria abrir");
    campo.dispatchEvent(new c.win.FocusEvent("focusout", { bubbles: true }));
    ok(campo.hidden, "sem texto, recolhe ao sair");
    igual(botao.getAttribute("aria-expanded"), "false");
  });

  teste("Carrinho", "apagar a quantidade na gaveta não derruba a linha nem a observação", function (c) {
    c.definir("calabresa", 5);
    c.definir("carne", 2);
    c.abrirGaveta();
    var linha = c.doc.querySelector('#linhas [data-sabor="calabresa"]');
    linha.querySelector(".linha-acao.obs").click();
    c.digitar(linha.querySelector(".obs-item"), "sem cebola");

    var campo = linha.querySelector(".conta");
    campo.focus();
    campo.value = "";                                  // apaga pra redigitar
    campo.dispatchEvent(new c.win.Event("input", { bubbles: true }));

    ok(c.doc.contains(campo), "o campo em que a pessoa digita não pode sair do DOM");
    igual(c.doc.activeElement, campo, "o foco tem que continuar no campo");
    ok(c.doc.querySelector('#linhas [data-sabor="calabresa"]'), "a linha não pode sumir");

    campo.value = "12";
    campo.dispatchEvent(new c.win.Event("input", { bubbles: true }));
    igual(c.qtd("calabresa"), 12);
    igual(c.doc.querySelector('#linhas [data-sabor="calabresa"] .obs-item').value,
          "sem cebola", "a observação tinha que sobreviver");
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
    ok([1, 2, 3, 4].indexOf(dia) !== -1, "Trindade é de segunda a quinta, veio o dia " + dia);
  });

  teste("Retirada", "trocar de ponto ajusta a data para o dia daquele ponto", function (c) {
    c.abrirGaveta();
    var ponto = c.el("#fPonto");
    [[1, [1, 2, 3, 4, 5], "Itacorubi"], [2, [1, 2, 3, 4, 5], "Abraão"]].forEach(function (caso) {
      ponto.value = String(caso[0]);
      ponto.dispatchEvent(new c.win.Event("change", { bubbles: true }));
      var dia = new Date(c.el("#fData").value + "T12:00:00").getDay();
      ok(caso[1].indexOf(dia) !== -1, caso[2] + " não abre no dia " + dia);
      contem(c.texto("#dicaData"), caso[2]);
    });
  });

  teste("Retirada", "Itacorubi aceita de segunda a sexta e recusa o sábado", function (c) {
    c.win.Date.now = function () { return new c.win.Date("2026-10-21T10:00:00").getTime(); };
    c.abrirGaveta();
    var ponto = c.el("#fPonto"), data = c.el("#fData");
    ponto.value = "1";
    ponto.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    var d = new Date("2026-10-26T12:00:00");      // segunda de uma semana sem feriado
    for (var i = 0; i < 6; i++) {                 // segunda a sábado
      data.value = c.iso(d);
      data.dispatchEvent(new c.win.Event("change", { bubbles: true }));
      var dica = c.texto("#dicaData");
      if (d.getDay() === 6) {
        contem(dica, "não está", "sábado não é dia de Itacorubi");
        contem(dica, "de segunda a sexta");
      } else {
        contem(dica, "✓", "dia " + d.getDay() + " deveria valer");
        contem(dica, "8h às 16h30");
      }
      d.setDate(d.getDate() + 1);
    }
  });

  teste("Retirada", "na Trindade o horário muda conforme o dia", function (c) {
    c.win.Date.now = function () { return new c.win.Date("2026-10-21T10:00:00").getTime(); };
    c.abrirGaveta();
    var data = c.el("#fData");
    var d = new Date("2026-10-26T12:00:00");      // segunda de uma semana sem feriado
    var esperado = { 1: "18h30 às 20h", 2: "18h30 às 22h", 3: "18h30 às 22h", 4: "18h30 às 20h" };
    for (var i = 0; i < 4; i++) {                 // segunda a quinta
      data.value = c.iso(d);
      data.dispatchEvent(new c.win.Event("change", { bubbles: true }));
      var dica = c.texto("#dicaData");
      contem(dica, "✓", "dia " + d.getDay() + " deveria valer");
      contem(dica, "das " + esperado[d.getDay()] + " ");
      d.setDate(d.getDate() + 1);
    }
  });

  teste("Retirada", "a mensagem diz o dia da semana da data escolhida", function (c) {
    c.definir("calabresa", 4);
    c.win.Date.now = function () { return new c.win.Date("2026-10-21T10:00:00").getTime(); };
    c.abrirGaveta();
    var ponto = c.el("#fPonto"), data = c.el("#fData");
    ponto.value = "1";
    ponto.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    var d = new Date("2026-10-27T12:00:00");   // terça de uma semana sem feriado
    data.value = c.iso(d);
    data.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    var msg = c.enviarValido();
    contem(msg, "Itacorubi, terça ");
    naoContem(msg, "segunda a sexta", "a mensagem tem que dizer o dia, não a faixa");
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
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);   // sexta, fora dos dias da Trindade
    data.value = c.iso(d);
    data.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    var dica = c.texto("#dicaData");
    contem(dica, "não está");
    contem(dica, "Trindade");
  });

  // Fixa o relógio da página e escolhe ponto e data.
  function retirada(c, agora, ponto, data) {
    c.win.Date.now = function () { return new c.win.Date(agora).getTime(); };
    c.abrirGaveta();
    var p = c.el("#fPonto");
    p.value = String(ponto);
    p.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    var d = c.el("#fData");
    d.value = data;
    d.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    return c.texto("#dicaData");
  }

  teste("Retirada", "o envio é barrado num dia em que o ponto não abre", function (c) {
    c.definir("calabresa", 4);
    retirada(c, "2026-10-21T10:00:00", 1, "2026-10-24");   // Itacorubi num sábado
    c.el("#fNome").value = "Breno";
    igual(c.enviar(), null, "o pedido não podia sair");
    contem(c.texto("#aviso"), "só de segunda a sexta");
  });

  teste("Retirada", "a antecedência conta horas até o começo da janela", function (c) {
    c.definir("calabresa", 4);
    // quarta 23h pra quinta 8h no Itacorubi: só 9 horas
    var dica = retirada(c, "2026-10-21T23:00:00", 1, "2026-10-22");
    contem(dica, "não dá tempo");
    contem(dica, "24 horas");
    c.el("#fNome").value = "Breno";
    igual(c.enviar(), null, "o pedido com 9 horas não podia sair");
    // sexta 8h já tem 33 horas
    contem(retirada(c, "2026-10-21T23:00:00", 1, "2026-10-23"), "✓");
  });

  teste("Retirada", "acima de 40 esfihas a antecedência é de 3 dias", function (c) {
    c.definir("calabresa", 41);
    var dica = retirada(c, "2026-10-21T10:00:00", 1, "2026-10-23");   // 46 horas
    contem(dica, "3 dias");
    c.el("#fNome").value = "Breno";
    igual(c.enviar(), null, "41 esfihas com 46 horas não podia sair");
    contem(retirada(c, "2026-10-21T10:00:00", 1, "2026-10-26"), "✓");   // segunda, 118 horas
    c.definir("calabresa", 40);
    contem(retirada(c, "2026-10-21T10:00:00", 1, "2026-10-23"), "✓", "com 40 vale a regra de 24 horas");
  });

  teste("Retirada", "feriado não tem retirada e a sugestão pula ele", function (c) {
    c.definir("calabresa", 4);
    var dica = retirada(c, "2026-10-29T10:00:00", 1, "2026-11-02");   // Finados, segunda
    contem(dica, "feriado");
    contem(dica, "Finados");
    contem(dica, "terça, 03/11/2026", "a próxima no Itacorubi é o dia seguinte");
    c.el("#fNome").value = "Breno";
    igual(c.enviar(), null, "pedido pra feriado não podia sair");
    // trocar de ponto com o relógio na sexta 30/10: a primeira data livre pulou o feriado
    var p = c.el("#fPonto");
    c.win.Date.now = function () { return new c.win.Date("2026-10-31T10:00:00").getTime(); };
    p.value = "2"; p.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    igual(c.el("#fData").value, "2026-11-03", "a sugestão caiu no feriado");
  });

  teste("Retirada", "sem produção na terça e na quarta: pedido de terça pra quinta não dá", function (c) {
    c.definir("calabresa", 4);
    // terça 27/10 10h pra quinta 29/10 na Trindade: tem 56 horas, mas terça e quarta não produzem
    var dica = retirada(c, "2026-10-27T10:00:00", 0, "2026-10-29");
    contem(dica, "não monta esfiha na terça nem na quarta");
    contem(dica, "terça, 03/11/2026", "a próxima pula o feriado de 02/11 e cai depois da produção de quinta");
    c.el("#fNome").value = "Breno";
    igual(c.enviar(), null, "pedido sem dia de produção não podia sair");
    // segunda 10h pra quarta: dá pra produzir na própria segunda
    contem(retirada(c, "2026-10-26T10:00:00", 0, "2026-10-28"), "✓");
    // segunda 19h pra quarta: depois das 18h a segunda não conta mais
    contem(retirada(c, "2026-10-26T19:00:00", 0, "2026-10-28"), "não monta esfiha");
  });

  teste("Retirada", "o Abraão abre de segunda a sexta das 9h ao meio-dia", function (c) {
    c.definir("calabresa", 4);
    var dica = retirada(c, "2026-10-21T10:00:00", 2, "2026-10-23");
    contem(c.el("#fPonto").options[2].textContent, "Abraão");
    contem(dica, "✓");
    contem(dica, "das 9h às 12h no Abraão");
    contem(retirada(c, "2026-10-21T10:00:00", 2, "2026-10-24"), "de segunda a sexta");
  });

  teste("Retirada", "trocar de ponto mantém a data se ela serve no ponto novo", function (c) {
    c.definir("calabresa", 4);
    retirada(c, "2026-10-21T10:00:00", 0, "2026-10-29");   // Trindade, quinta
    var p = c.el("#fPonto");
    p.value = "1";                                          // Itacorubi também abre na quinta
    p.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    igual(c.el("#fData").value, "2026-10-29", "a data escolhida não podia mudar");
  });

  teste("Retirada", "trocar pra um ponto fechado naquele dia move a data", function (c) {
    c.definir("calabresa", 4);
    retirada(c, "2026-10-21T10:00:00", 1, "2026-10-30");   // Itacorubi, sexta
    var p = c.el("#fPonto");
    p.value = "0";                                          // Trindade não abre na sexta
    p.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    ok([1, 2, 3, 4].indexOf(new Date(c.el("#fData").value + "T12:00:00").getDay()) !== -1,
       "a data tinha que ir pra um dia da Trindade");
  });

  teste("Retirada", "no combinar outro ponto o campo de data some", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    var p = c.el("#fPonto");
    p.value = String(p.options.length - 1);
    p.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    igual(c.el("#campoData").getBoundingClientRect().height, 0, "o campo de data continua na tela");
    p.value = "0";
    p.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    ok(c.el("#campoData").getBoundingClientRect().height > 0, "o campo de data tinha que voltar");
  });

  teste("Retirada", "o aviso vermelho some quando o cliente corrige", function (c) {
    c.definir("calabresa", 4);
    retirada(c, "2026-10-21T10:00:00", 1, "2026-10-24");   // sábado no Itacorubi
    c.el("#fNome").value = "";
    igual(c.enviar(), null);
    ok(c.el("#aviso").getBoundingClientRect().height > 0, "precondição: o aviso tinha que aparecer");
    contem(c.texto("#aviso"), "seu nome");
    var d = c.el("#fData");
    d.value = "2026-10-27";
    d.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    igual(c.el("#aviso").getBoundingClientRect().height, 0, "o aviso velho continuou na tela");
  });

  teste("Retirada", "o aviso junta o que falta com e", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#fData").value = "";
    c.el("#fNome").value = "";
    igual(c.enviar(), null);
    contem(c.texto("#aviso"), "seu nome e o dia da retirada");
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
    ponto.value = "2";                          // Abraão é masculino
    ponto.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    contem(c.texto("#dicaData"), "no Abraão");
    naoContem(c.texto("#dicaData"), "na Abraão");
  });

  teste("Gaveta", "com a gaveta aberta o resto da página não recebe foco", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    ok(c.doc.querySelector("header").closest("[inert]"), "o cabeçalho continua focável atrás do véu");
    ok(!c.el("#gaveta").closest("[inert]"), "a gaveta não pode ficar inerte");
    c.el("#btnFechar").click();
    ok(!c.doc.querySelector("header").closest("[inert]"), "o cabeçalho tinha que voltar ao normal");
  });

  teste("Gaveta", "a barra escondida não recebe foco", function (c) {
    ok(c.el("#barra").inert, "carrinho vazio: a barra está fora da tela e não pode receber Tab");
    c.definir("calabresa", 1);
    ok(!c.el("#barra").inert, "com pedido a barra tem que ser usável");
  });

  teste("Gaveta", "fechar e reabrir rápido mantém o véu", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#btnFechar").click();
    c.abrirGaveta();
    return c.dormir(400).then(function () {
      ok(!c.el("#veu").hidden, "a gaveta ficou aberta sem o véu");
    });
  });

  teste("WhatsApp", "clique duplo em enviar abre uma conversa só", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#fNome").value = "Breno";
    var abertas = 0, original = c.win.open;
    c.win.open = function () { abertas++; return null; };
    c.el("#btnEnviar").click();
    c.el("#btnEnviar").click();
    c.el("#btnEnviar").click();
    c.win.open = original;
    igual(abertas, 1);
  });

  /* =========================================================
     MENSAGEM DO WHATSAPP
     ========================================================= */
  teste("WhatsApp", "a mensagem vai para o número da casa", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#fNome").value = "Breno";
    igual(c.enviarUrl().split("?")[0], "https://wa.me/5548992210812");
  });

  teste("WhatsApp", "a mensagem lista os itens, o total e o preço unitário", function (c) {
    c.definir("calabresa", 5);
    c.definir("carne", 3);
    var msg = c.pedidoCompleto();
    contem(msg, "• 5x Calabresa");
    contem(msg, "• 3x Carne");
    contem(msg, "Total: 8 esfihas");
    contem(msg, "R$ 42,80");
    contem(msg, "R$ 5,35 cada");
  });

  teste("WhatsApp", "a mensagem não leva emoji fora do básico, que chega como �", function (c) {
    c.definir("calabresa", 4);
    var msg = c.pedidoCompleto();
    // Emoji como 🥟 vira par substituto em UTF-16. Pelo wa.me ele chegou
    // quebrado no celular do cliente, então a mensagem fica sem nenhum.
    ok(!/[\uD800-\uDFFF]/.test(msg), "a mensagem tem caractere fora do plano básico");
  });

  teste("WhatsApp", "a observação de cada item vai junto do item", function (c) {
    c.definir("calabresa", 4);
    c.definir("carne", 4);
    c.abrirGaveta();
    var linha = c.doc.querySelector('#linhas [data-sabor="calabresa"]');
    linha.querySelector(".linha-acao.obs").click();
    c.digitar(linha.querySelector(".obs-item"), "sem cebola");
    var msg = c.enviarValido();
    contem(msg, "• 4x Calabresa (sem cebola)");
    contem(msg, "• 4x Carne\n", "a carne não tem observação");
  });

  teste("WhatsApp", "a observação geral vai na mensagem", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#fObs").value = "embalar separado";
    var msg = c.enviarValido();
    contem(msg, "embalar separado");
  });

  teste("WhatsApp", "a mensagem traz o ponto, o dia e a janela de retirada", function (c) {
    c.definir("calabresa", 4);
    c.win.Date.now = function () { return new c.win.Date("2026-10-21T10:00:00").getTime(); };
    c.abrirGaveta();
    var data = c.el("#fData");
    var d = new Date("2026-10-27T12:00:00");   // terça de uma semana sem feriado, que vai até as 22h
    data.value = c.iso(d);
    data.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    var msg = c.pedidoCompleto();
    contem(msg, "*Retirada:*");
    contem(msg, "Trindade");
    contem(msg, "terça");
    contem(msg, "das 18h30 às 22h");
  });

  teste("WhatsApp", "a mensagem não usa travessão", function (c) {
    c.definir("calabresa", 12);
    naoContem(c.pedidoCompleto(), "—");
  });

  /* =========================================================
     CUPOM
     ========================================================= */
  // A consulta ao servidor espera 300 ms após a última tecla; os testes
  // esperam a resposta aparecer na dica antes de conferir.
  teste("Cupom", "o campo de cupom escreve tudo em maiúscula", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.digitar(c.el("#fCupom"), "primeiraCompra");
    igual(c.el("#fCupom").value, "PRIMEIRACOMPRA");
  });

  teste("Cupom", "PRIMEIRACOMPRA tira 10% e soma com o combo", function (c) {
    c.definir("queijo", 12);
    c.abrirGaveta();
    c.digitar(c.el("#fCupom"), "primeiracompra");
    return c.esperar(function () { return c.texto("#dicaCupom").indexOf("10%") !== -1; }, 3000).then(function () {
      igual(c.texto("#rsTotal"), "R$ 56,16");     // 62,40 - 10%
      igual(c.texto("#barraTotal"), "R$ 56,16");
      contem(c.texto("#rsCupom"), "R$ 6,24");
    });
  });

  teste("Cupom", "espaço em volta do cupom não atrapalha", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.digitar(c.el("#fCupom"), "  primeiracompra ");
    return c.esperar(function () { return c.texto("#rsTotal") === "R$ 19,80"; }, 3000);   // 22,00 - 10%
  });

  teste("Cupom", "sem cupom a linha de desconto não aparece", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    igual(c.el("#rsLinhaCupom").getBoundingClientRect().height, 0);
    igual(c.texto("#rsTotal"), "R$ 22,00");
  });

  teste("Cupom", "enquanto o servidor não responde, dá o total sem desconto e avisa que está conferindo", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.digitar(c.el("#fCupom"), "PRIMEIRACOMPRA");
    contem(c.texto("#dicaCupom"), "Conferindo o cupom");
    igual(c.texto("#rsTotal"), "R$ 22,00");
  });

  teste("Cupom", "cupom que não existe avisa, não desconta e barra o envio", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.digitar(c.el("#fCupom"), "BLACKFRIDAY");
    return c.esperar(function () { return c.texto("#dicaCupom").indexOf("não existe") !== -1; }, 3000).then(function () {
      igual(c.texto("#rsTotal"), "R$ 22,00");
      igual(c.el("#rsLinhaCupom").getBoundingClientRect().height, 0);
      c.el("#fNome").value = "Breno";
      igual(c.enviar(), null, "não deveria mandar pedido com cupom errado");
      contem(c.texto("#aviso"), "cupom");
    });
  });

  teste("Cupom", "se a consulta falha por rede, o pedido sai com o cupom na mensagem", function (c) {
    c.win.fetch = function () { return Promise.reject(new TypeError("sem rede")); };
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.digitar(c.el("#fCupom"), "PRIMEIRACOMPRA");
    return c.esperar(function () { return c.texto("#dicaCupom").indexOf("Não deu pra conferir") !== -1; }, 3000).then(function () {
      igual(c.texto("#rsTotal"), "R$ 22,00");
      var msg = c.enviarValido();
      contem(msg, "*Cupom:* PRIMEIRACOMPRA");
      ok(c.erros.length === 0, "não deveria estourar erro: " + c.erros.join("; "));
    });
  });

  teste("Cupom", "se o servidor responde 500, também não barra o envio", function (c) {
    c.win.fetch = function () { return Promise.resolve(new c.win.Response("{}", { status: 500 })); };
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.digitar(c.el("#fCupom"), "PRIMEIRACOMPRA");
    return c.esperar(function () { return c.texto("#dicaCupom").indexOf("Não deu pra conferir") !== -1; }, 3000).then(function () {
      contem(c.enviarValido(), "*Cupom:* PRIMEIRACOMPRA");
    });
  });

  teste("Cupom", "apagar o cupom errado libera o envio", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.digitar(c.el("#fCupom"), "ERRADO");
    c.digitar(c.el("#fCupom"), "");
    ok(c.el("#dicaCupom").getBoundingClientRect().height === 0, "a dica deveria sumir");
    c.enviarValido();
  });

  teste("Cupom", "a mensagem leva o cupom e o total com desconto", function (c) {
    c.definir("calabresa", 12);
    c.abrirGaveta();
    c.digitar(c.el("#fCupom"), "primeiracompra");
    return c.esperar(function () { return c.texto("#dicaCupom").indexOf("10%") !== -1; }, 3000).then(function () {
      var msg = c.enviarValido();
      contem(msg, "R$ 62,40 (R$ 5,20 cada)");
      contem(msg, "*Cupom:* PRIMEIRACOMPRA, 10% de desconto");
      contem(msg, "*Total com cupom:* R$ 56,16");
    });
  });

  teste("Cupom", "sem cupom a mensagem não fala em cupom", function (c) {
    c.definir("calabresa", 4);
    naoContem(c.pedidoCompleto(), "upom");
  });

  teste("Cupom", "o aviso do próximo combo já conta o cupom", function (c) {
    c.definir("calabresa", 6);
    c.abrirGaveta();
    c.digitar(c.el("#fCupom"), "PRIMEIRACOMPRA");
    // 8 x 5,35 = 42,80, menos 10% = 38,52; hoje 6 x 5,50 = 33,00, menos 10% = 29,70
    return c.esperar(function () { return c.texto("#rsProgresso").indexOf("R$ 38,52") !== -1; }, 3000).then(function () {
      contem(c.texto("#rsProgresso"), "R$ 8,82");
    });
  });

  teste("Cupom", "o cupom sobrevive ao recarregar", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.digitar(c.el("#fCupom"), "primeiracompra");
    return c.recarregar().then(function (c2) {
      igual(c2.el("#fCupom").value, "PRIMEIRACOMPRA");
      return c2.esperar(function () { return c2.texto("#barraTotal") === "R$ 19,80"; }, 3000);
    });
  });

  teste("Cupom", "a lista de cupons não aparece no código do site", function (c) {
    return Promise.all(["/app.js", "/regras.js"].map(function (u) {
      return fetch(u).then(function (r) { return r.text(); });
    })).then(function (textos) {
      textos.forEach(function (t) { naoContem(t.toUpperCase(), "PRIMEIRACOMPRA"); });
    });
  });

  /* =========================================================
     GRAVAÇÃO DO PEDIDO
     ========================================================= */
  // Espia o fetch da página e o window.open, e clica em enviar.
  function enviarEspiando(c) {
    var chamadas = [], aberturas = [], ordem = [];
    c.win.fetch = function (url, opcoes) {
      chamadas.push({ url: String(url), opcoes: opcoes || {} });
      ordem.push("fetch");
      return Promise.resolve(new c.win.Response("{}", { status: 201 }));
    };
    var original = c.win.open;
    c.win.open = function (u) { aberturas.push(u); ordem.push("open"); return null; };
    c.el("#btnEnviar").click();
    c.win.open = original;
    return { chamadas: chamadas, aberturas: aberturas, ordem: ordem };
  }
  function postsDe(r) {
    return r.chamadas.filter(function (x) { return x.url.indexOf("/api/pedidos") !== -1; });
  }

  teste("Gravação", "enviar grava o pedido sem atrasar o WhatsApp", function (c) {
    c.definir("calabresa", 4);
    c.definir("queijo", 2);
    c.abrirGaveta();
    c.el("#fNome").value = "Breno";
    var r = enviarEspiando(c);
    igual(r.aberturas.length, 1, "o WhatsApp deveria abrir no mesmo clique");
    var posts = postsDe(r);
    igual(posts.length, 1);
    igual(posts[0].opcoes.method, "POST");
    ok(posts[0].opcoes.keepalive === true, "precisa de keepalive pra não perder o pedido ao trocar de aba");
    var corpo = JSON.parse(posts[0].opcoes.body);
    ok(corpo.id_envio && corpo.id_envio.length >= 8, "falta id_envio");
    igual(corpo.nome, "Breno");
    ok(Array.isArray(corpo.itens) && corpo.itens.length === 2, "itens");
    igual(corpo.itens[0].sabor, "calabresa");
    igual(corpo.itens[0].qtd, 4);
    ok(typeof corpo.ponto === "number", "ponto é o índice");
    ok(!("total" in corpo), "o site nunca manda total");
    ok(!("desconto" in corpo), "o site nunca manda desconto");
  });

  teste("Gravação", "a observação do sabor e a geral vão no corpo", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#fNome").value = "Breno";
    c.el("#fObs").value = "tocar a campainha";
    c.digitar(c.el(".obs-item"), "sem cebola");
    var corpo = JSON.parse(postsDe(enviarEspiando(c))[0].opcoes.body);
    igual(corpo.obs, "tocar a campainha");
    igual(corpo.itens[0].obs, "sem cebola");
  });

  teste("Gravação", "ponto com dias manda a retirada e o cupom digitado", function (c) {
    c.win.Date.now = function () { return new c.win.Date("2026-10-21T10:00:00").getTime(); };
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#fNome").value = "Breno";
    var ponto = c.el("#fPonto"), data = c.el("#fData");
    ponto.value = "1";   // Itacorubi
    ponto.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    data.value = "2026-10-26";
    data.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    c.digitar(c.el("#fCupom"), "primeiracompra");
    var posts = postsDe(enviarEspiando(c));
    igual(posts.length, 1);
    var corpo = JSON.parse(posts[0].opcoes.body);
    igual(corpo.ponto, 1);
    igual(corpo.retirada, "2026-10-26");
    igual(corpo.cupom, "PRIMEIRACOMPRA");
  });

  teste("Gravação", "sem servidor o WhatsApp abre normal e nada estoura", function (c) {
    var abriu = [];
    c.win.fetch = function () { return Promise.reject(new TypeError("sem rede")); };
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#fNome").value = "Breno";
    var original = c.win.open;
    c.win.open = function (u) { abriu.push(u); return null; };
    c.el("#btnEnviar").click();
    c.win.open = original;
    igual(abriu.length, 1);
    return c.dormir(100).then(function () {
      ok(c.erros.length === 0, "não deveria estourar erro: " + c.erros.join("; "));
    });
  });

  teste("Gravação", "o id do envio muda depois de um envio", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    c.el("#fNome").value = "Breno";
    var a = JSON.parse(postsDe(enviarEspiando(c))[0].opcoes.body).id_envio;
    return c.dormir(2100).then(function () {
      var b = JSON.parse(postsDe(enviarEspiando(c))[0].opcoes.body).id_envio;
      ok(a !== b, "um segundo pedido não pode reaproveitar o id do primeiro");
    });
  });

  /* =========================================================
     AGENDA: DIA LOTADO, BLOQUEADO E PEDIDOS PAUSADOS
     ========================================================= */
  // Responde /api/agenda com o que o teste quiser; o resto segue o padrão.
  function agendaFalsa(c, resposta) {
    var anterior = c.win.fetch;
    c.win.fetch = function (url, opcoes) {
      if (String(url).indexOf("/api/agenda") !== -1) {
        if (resposta === null) return Promise.reject(new TypeError("sem rede"));
        return Promise.resolve(new c.win.Response(JSON.stringify(resposta), { status: 200 }));
      }
      return anterior(url, opcoes);
    };
  }
  // Quarta 21/10 às 10h: o Itacorubi abre a partir de sexta 23/10.
  function prepararAgenda(c, resposta) {
    c.win.Date.now = function () { return new c.win.Date("2026-10-21T10:00:00").getTime(); };
    agendaFalsa(c, resposta);
    c.definir("calabresa", 4);
    c.abrirGaveta();
    return c.dormir(60).then(function () {
      var ponto = c.el("#fPonto");
      ponto.value = "1";   // Itacorubi
      ponto.dispatchEvent(new c.win.Event("change", { bubbles: true }));
    });
  }
  function escolherData(c, v) {
    var d = c.el("#fData");
    d.value = v;
    d.dispatchEvent(new c.win.Event("change", { bubbles: true }));
  }

  teste("Agenda", "dia lotado é recusado e a sugestão pula ele", function (c) {
    return prepararAgenda(c, { pausado: false, indisponiveis: { "2026-10-23": "lotado" } }).then(function () {
      // sem o dia lotado a primeira data seria 23/10; o campo já deve ter pulado
      igual(c.el("#fData").value, "2026-10-26", "a data sugerida não pode ser a lotada");
      escolherData(c, "2026-10-23");
      var dica = c.texto("#dicaData");
      contem(dica, "Esse dia já está cheio.");
      contem(dica, "A mais próxima no Itacorubi é segunda, 26/10/2026.");
      c.el("#fNome").value = "Breno";
      igual(c.enviar(), null, "dia lotado não pode enviar");
      ok(c.el("#aviso").classList.contains("on"), "o aviso deveria aparecer");
      contem(c.texto("#aviso"), "Esse dia já está cheio.");
    });
  });

  teste("Agenda", "dia bloqueado diz que não tem retirada e sugere outro", function (c) {
    return prepararAgenda(c, { pausado: false, indisponiveis: { "2026-10-26": "bloqueado" } }).then(function () {
      escolherData(c, "2026-10-26");
      var dica = c.texto("#dicaData");
      contem(dica, "Nesse dia não tem retirada.");
      contem(dica, "A mais próxima no Itacorubi é sexta, 23/10/2026.");
      c.el("#fNome").value = "Breno";
      igual(c.enviar(), null);
      escolherData(c, "2026-10-27");
      ok(c.enviar() !== null, "outro dia deveria enviar");
    });
  });

  teste("Agenda", "pedidos pausados desabilitam o envio e avisam", function (c) {
    return prepararAgenda(c, { pausado: true, indisponiveis: {} }).then(function () {
      ok(c.el("#btnEnviar").disabled, "o botão deveria estar desabilitado");
      igual(c.texto("#aviso").trim(), "Os pedidos estão pausados por enquanto. Fala com a gente no WhatsApp.");
      ok(c.el("#aviso").offsetHeight > 0, "o aviso precisa estar visível");
      ok(c.doc.querySelectorAll('a[href^="https://wa.me/"]').length > 0, "os outros links do WhatsApp seguem na página");
      c.el("#fNome").value = "Breno";
      igual(c.enviar(), null, "pausado não pode enviar nem por clique forçado");
    });
  });

  teste("Agenda", "se a agenda falhar, o site funciona como antes", function (c) {
    return prepararAgenda(c, null).then(function () {
      escolherData(c, "2026-10-23");
      ok(c.texto("#dicaData").indexOf("cheio") === -1, "sem agenda não há dia lotado");
      ok(!c.el("#btnEnviar").disabled);
      c.el("#fNome").value = "Breno";
      ok(c.enviar() !== null, "deveria enviar");
    });
  });

  teste("Agenda", "dia indisponível não vira sugestão da primeira data", function (c) {
    return prepararAgenda(c, { pausado: false, indisponiveis: { "2026-10-23": "bloqueado", "2026-10-26": "lotado" } }).then(function () {
      igual(c.el("#fData").value, "2026-10-27");
    });
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
      igual(c2.texto("#barraTotal"), "R$ 48,15");   // 9 x 5,35
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

  // Se o script estourar na inicialização, os cards não são montados: isso é
  // uma verificação de verdade, diferente de escutar "error" depois do load.
  function paginaInicializou(c) {
    igual(c.doc.querySelectorAll(".card").length, 4, "os cards não foram montados");
    igual(c.doc.querySelectorAll(".faixa").length, 4, "os combos não foram montados");
    ok(c.doc.querySelector("#fPonto").options.length >= 3, "os pontos não foram montados");
  }

  teste("Persistência", "dado corrompido no armazenamento não quebra a página", function (c) {
    global.localStorage.setItem("sayones-pedido-v2", "{isso não é json");
    return c.recarregar().then(function (c2) {
      paginaInicializou(c2);
      igual(c2.texto("#barraTotal"), "R$ 0,00", "deveria abrir com o carrinho zerado");
    });
  });

  teste("Persistência", "armazenamento com formato inesperado não quebra a página", function (c) {
    global.localStorage.setItem("sayones-pedido-v2", "null");
    return c.recarregar().then(function (c2) {
      paginaInicializou(c2);
      igual(c2.texto("#barraTotal"), "R$ 0,00");
    });
  });

  teste("Persistência", "quantidade absurda guardada é ignorada", function (c) {
    global.localStorage.setItem("sayones-pedido-v2",
      JSON.stringify({ qtds: { calabresa: 99999, carne: -3 }, obs: {} }));
    return c.recarregar().then(function (c2) {
      paginaInicializou(c2);
      ok(c2.qtd("calabresa") <= 200, "veio " + c2.qtd("calabresa"));
      igual(c2.qtd("carne"), 0, "quantidade negativa não pode entrar");
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

  teste("Preços", "a tabela de combos do topo bate com o que o carrinho cobra", function (c) {
    var anunciados = [].slice.call(c.doc.querySelectorAll("#combosHero b"))
      .map(function (b) { return b.textContent.replace(/\s/g, ""); });
    igual(anunciados.length, 4, "a tabela deveria ter avulsa e os três combos");
    [1, 4, 8, 12].forEach(function (qtd, i) {
      c.definir("calabresa", qtd);
      igual(c.texto("#rsUnit").replace(/\s/g, ""), anunciados[i], "preço anunciado para " + qtd);
    });
  });

  teste("Conteúdo", "o topo lista todos os sabores do cardápio", function (c) {
    var topo = [].slice.call(c.doc.querySelectorAll("#saboresHero b")).map(function (b) { return b.textContent; });
    var cardapio = [].slice.call(c.doc.querySelectorAll(".card h3")).map(function (h) { return h.textContent; });
    igual(topo.join(", "), cardapio.join(", "));
  });

  teste("Layout", "no tablet deitado os sabores não deixam um órfão", function (c) {
    return c.redimensionar(1024, 768).then(function () {
      var n = colunasReais(c, ".sabores");
      igual(4 % n, 0, n + " colunas deixam card sozinho na última linha");
    });
  });

  teste("Conteúdo", "a imagem de compartilhamento é um PNG", function (c) {
    var og = c.doc.querySelector('meta[property="og:image"]').content;
    ok(/\.png$/i.test(og), "WhatsApp e Facebook não renderizam SVG: " + og);
  });

  teste("Conteúdo", "os quatro sabores aparecem no cardápio", function (c) {
    var nomes = [].slice.call(c.doc.querySelectorAll(".card h3")).map(function (h) { return h.textContent; });
    igual(nomes.join(", "), "Calabresa, Carne, Queijo, Marguerita");
  });

  teste("Conteúdo", "cada sabor tem o seu próprio desenho", function (c) {
    var icones = [].slice.call(c.doc.querySelectorAll(".card-ilu use"))
      .map(function (u) { return u.getAttribute("href"); });
    igual(icones.join(", "), "#ic-calabresa, #ic-carne, #ic-queijo, #ic-marguerita");
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
    var expostos = [].slice.call(c.doc.querySelectorAll(".card-ilu, .hero-selo, .sabores-hero svg, .marca svg, .linha svg"))
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

  teste("Layout", "no celular os quatro sabores têm a mesma altura", function (c) {
    return c.redimensionar(390, 844).then(function () {
      var alturas = [].slice.call(c.doc.querySelectorAll(".card"))
        .map(function (el) { return Math.round(el.getBoundingClientRect().height); });
      igual(alturas[0], alturas[1], "calabresa e carne");
      igual(alturas[1], alturas[2], "carne e queijo");
      igual(alturas[2], alturas[3], "queijo e marguerita");
    });
  });

  teste("Layout", "no celular os quatro sabores cabem numa tela só", function (c) {
    return c.redimensionar(390, 844).then(function () {
      c.doc.documentElement.style.scrollBehavior = "auto";
      var secao = c.el("#cardapio");
      c.win.scrollTo({ top: secao.offsetTop - 96, behavior: "instant" });
      var ultimo = c.doc.querySelectorAll(".card")[3].getBoundingClientRect().bottom;
      ok(ultimo <= c.win.innerHeight,
         "o quarto card termina em " + Math.round(ultimo) + "px, tela de " + c.win.innerHeight + "px");
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

  teste("Layout", "cabe em tela de 320px sem estourar", function (c) {
    return c.redimensionar(320, 720).then(function () {
      var vw = c.doc.documentElement.clientWidth;
      var culpados = [].slice.call(c.doc.querySelectorAll("main *, header *, footer *"))
        .filter(function (el) {
          if (el.closest(".nav")) return false;
          var r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > vw + 1 || r.left < -1);
        })
        .map(function (el) {
          return el.tagName.toLowerCase() + "." + (String(el.className).split(" ")[0] || "");
        });
      // minmax(Npx,1fr) estoura quando a tela é menor que N; o certo é min(Npx,100%)
      igual([].slice.call(new Set(culpados)).slice(0, 4).join(" | "), "", "passando da tela em 320px");
    });
  });

  teste("Layout", "cada linha dos cards de preparo tem o texto num bloco só", function (c) {
    // o li é flex: se o <b> e o texto forem itens separados, cada linha começa
    // num x diferente e o rótulo longo quebra no meio
    var soltos = [].slice.call(c.doc.querySelectorAll(".preparo li"))
      .filter(function (li) {
        var pedacos = [].slice.call(li.childNodes).filter(function (n) {
          return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim() !== "");
        });
        return pedacos.length !== 1 || pedacos[0].nodeType !== 1;
      })
      .map(function (li) { return li.textContent.trim().slice(0, 28); });
    igual(soltos.join(" | "), "", "linhas com o texto partido em itens de flex");
  });

  teste("Layout", "as grades não usam mínimo fixo maior que a tela", function (c) {
    var suspeitas = [];
    [".sabores", ".faixas", ".passos", ".preparos", ".depos"].forEach(function (sel) {
      var el = c.doc.querySelector(sel);
      if (!el) return;
      var colunas = c.win.getComputedStyle(el).gridTemplateColumns.split(" ").length;
      var cabe = el.scrollWidth <= el.clientWidth + 1;
      if (!cabe) suspeitas.push(sel + " (" + colunas + " colunas)");
    });
    igual(suspeitas.join(", "), "", "grades estourando");
  });

  teste("Layout", "os botões de toque têm pelo menos 32px em tela pequena", function (c) {
    return c.redimensionar(320, 720).then(function () {
      var miudos = [].slice.call(c.doc.querySelectorAll("button, a"))
        .filter(function (el) {
          var r = el.getBoundingClientRect();
          return r.width > 0 && (r.height < 32 || r.width < 32);
        })
        .map(function (el) {
          var r = el.getBoundingClientRect();
          return (el.textContent || el.getAttribute("aria-label") || "?").trim().slice(0, 16) +
                 " " + Math.round(r.width) + "x" + Math.round(r.height);
        });
      igual(miudos.join(" | "), "", "alvos pequenos demais para o dedo");
    });
  });

  // auto-fit relata faixas vazias como "0px"; só as com largura valem
  function colunasReais(c, sel) {
    return c.win.getComputedStyle(c.doc.querySelector(sel)).gridTemplateColumns
      .split(" ").filter(function (t) { return parseFloat(t) > 0; }).length;
  }

  teste("Layout", "no tablet em pé os sabores ficam em coluna única", function (c) {
    return c.redimensionar(768, 1024).then(function () {
      igual(colunasReais(c, ".sabores"), 1,
            "duas colunas deixariam um card órfão embaixo");
    });
  });

  teste("Layout", "no desktop os quatro sabores ficam lado a lado", function (c) {
    return c.redimensionar(1100, 900).then(function () {
      igual(colunasReais(c, ".sabores"), 4);
    });
  });

  teste("Layout", "os quatro combos ficam lado a lado no desktop", function (c) {
    return c.redimensionar(1280, 900).then(function () {
      igual(colunasReais(c, ".faixas"), 4);
    });
  });

  teste("Acessibilidade", "quem pede menos movimento não vê animação", function (c) {
    var regra = null;
    [].slice.call(c.doc.styleSheets).forEach(function (folha) {
      try {
        [].slice.call(folha.cssRules).forEach(function (r) {
          if (r.media && String(r.media.mediaText).indexOf("prefers-reduced-motion") !== -1) regra = r;
        });
      } catch (e) {}
    });
    ok(regra, "falta o bloco @media prefers-reduced-motion");
    var dentro = [].slice.call(regra.cssRules).map(function (r) { return r.cssText; }).join(" ");
    contem(dentro, "transition-duration", "as transições precisam ser neutralizadas");
    contem(dentro, "animation-duration", "as animações precisam ser neutralizadas");
    contem(dentro, "scroll-behavior", "o scroll suave precisa ser desligado");
  });

  teste("Acessibilidade", "o scroll do JavaScript também respeita a preferência", function (c) {
    // scrollTo({behavior:"smooth"}) ignora o CSS, então o código tem que checar
    return fetch("/app.js").then(function (r) { return r.text(); }).then(function (js) {
      contem(js, "prefers-reduced-motion", "o script precisa consultar a preferência");
      var fixos = (js.match(/behavior:\s*"smooth"/g) || []).length;
      ok(fixos <= 1, "ainda há " + fixos + " scrolls com 'smooth' fixo no código");
    });
  });

  /* =========================================================
     REGRESSÕES APONTADAS NO CODE REVIEW
     ========================================================= */
  teste("Regressões", "digitar acima do teto corrige o campo na hora", function (c) {
    var campo = c.card("calabresa").querySelector(".conta");
    campo.focus();
    campo.value = "999";
    campo.dispatchEvent(new c.win.Event("input", { bubbles: true }));
    // antes o campo mostrava 999 enquanto o carrinho já tinha cortado pra 200
    igual(campo.value, "200", "o campo não pode exibir número diferente do cobrado");
    igual(c.texto("#barraTotal"), "R$ 1.040,00");
  });

  teste("Regressões", "segurar o mais para no teto", function (c) {
    c.definir("calabresa", 198);
    var mais = c.card("calabresa").querySelector('[data-op="1"]');
    mais.dispatchEvent(new c.win.PointerEvent("pointerdown", { bubbles: true }));
    return c.dormir(900).then(function () {
      c.win.dispatchEvent(new c.win.PointerEvent("pointerup", { bubbles: true }));
      igual(c.qtd("calabresa"), 200, "deveria travar no teto");
    });
  });

  teste("Regressões", "segurar até zerar não engole a próxima tecla", function (c) {
    c.definir("calabresa", 2);
    c.definir("carne", 1);
    c.abrirGaveta();
    var menos = c.doc.querySelector('#linhas [data-sabor="calabresa"] [data-op="-1"]');
    menos.dispatchEvent(new c.win.PointerEvent("pointerdown", { bubbles: true }));
    return c.dormir(900).then(function () {
      c.win.dispatchEvent(new c.win.PointerEvent("pointerup", { bubbles: true }));
      igual(c.qtd("calabresa"), 0, "precondição: tinha que zerar");
      return c.dormir(300).then(function () {
        // ativação por teclado, sem pointerdown antes
        var maisCarne = c.doc.querySelector('#linhas [data-sabor="carne"] [data-op="1"]');
        maisCarne.click();
        igual(c.qtd("carne"), 2, "a ativação seguinte não pode ser descartada");
      });
    });
  });

  teste("Regressões", "segurar um sabor não bloqueia o toque em outro", function (c) {
    var mais = c.card("calabresa").querySelector('[data-op="1"]');
    mais.dispatchEvent(new c.win.PointerEvent("pointerdown", { bubbles: true }));
    return c.dormir(700).then(function () {
      c.win.dispatchEvent(new c.win.PointerEvent("pointerup", { bubbles: true }));
      // logo em seguida, sem esperar, a pessoa toca no + de outro sabor
      c.card("carne").querySelector('[data-op="1"]').click();
      igual(c.qtd("carne"), 1, "o toque no outro sabor não pode ser descartado");
    });
  });

  teste("Regressões", "a lixeira devolve o foco para dentro da gaveta", function (c) {
    c.definir("calabresa", 3);
    c.definir("carne", 2);
    c.abrirGaveta();
    var botao = c.doc.querySelector('#linhas [data-sabor="calabresa"] .linha-acao.remover');
    botao.focus();
    botao.click();
    var agora = c.doc.activeElement;
    ok(agora && agora !== c.doc.body, "o foco caiu no body, fora da janela aberta");
    ok(c.el("#gaveta").contains(agora), "o foco tem que ficar dentro da gaveta");
  });

  teste("Regressões", "o campo de quantidade anuncia o valor para leitor de tela", function (c) {
    var campo = c.card("calabresa").querySelector(".conta");
    igual(campo.getAttribute("role"), "spinbutton");
    igual(campo.getAttribute("aria-valuenow"), "0");
    igual(campo.getAttribute("aria-valuemax"), "200", "o teto precisa ser anunciado");
    c.mais("calabresa");
    igual(campo.getAttribute("aria-valuenow"), "1", "mudar por botão tem que refletir no aria");
    contem(campo.getAttribute("aria-valuetext"), "Calabresa");
  });

  teste("Regressões", "o esmaecido da tira de menu some quando chega no fim", function (c) {
    return c.redimensionar(390, 844).then(function () {
      var nav = c.doc.querySelector(".nav");
      ok(nav.classList.contains("tem-depois"), "no começo, deveria avisar que há mais à direita");
      ok(!nav.classList.contains("tem-antes"), "no começo, não há nada à esquerda");
      nav.scrollLeft = nav.scrollWidth;
      nav.dispatchEvent(new c.win.Event("scroll"));
      ok(!nav.classList.contains("tem-depois"),
         "no fim da tira, o último item não pode ficar borrado");
      ok(nav.classList.contains("tem-antes"), "no fim, deveria avisar que há mais à esquerda");
    });
  });

  teste("Regressões", "o clique na marca não estoura quando a origem é restrita", function (c) {
    // Em file:// o Chrome trata a origem como "null" e replaceState estoura.
    var original = c.win.history.replaceState;
    c.win.history.replaceState = function(){ throw new Error("SecurityError simulado"); };
    try {
      c.doc.querySelector(".marca").click();          // não pode propagar o erro
    } finally {
      c.win.history.replaceState = original;
    }
    ok(true, "o clique sobreviveu ao replaceState bloqueado");
  });

  teste("Regressões", "a gravação não acontece a cada tecla", function (c) {
    var escritas = 0;
    // no Firefox e no Safari, atribuir localStorage.setItem grava uma chave
    // "setItem" em vez de trocar o método: o espião vai no protótipo
    var proto = c.win.Storage.prototype, original = proto.setItem;
    proto.setItem = function(k, v){ escritas++; return original.call(this, k, v); };
    c.definir("calabresa", 4);
    c.abrirGaveta();
    var linha = c.doc.querySelector('#linhas [data-sabor="calabresa"]');
    linha.querySelector(".linha-acao.obs").click();
    var campo = linha.querySelector(".obs-item");
    "sem cebola por favor".split("").forEach(function (ch, i) {
      campo.value = campo.value + ch;
      campo.dispatchEvent(new c.win.Event("input", { bubbles: true }));
    });
    var durante = escritas;
    return c.dormir(400).then(function () {
      proto.setItem = original;
      ok(durante <= 3, "22 teclas geraram " + durante + " gravações no disco");
      ok(escritas > durante, "mas precisa gravar depois que a digitação para");
    });
  });

  teste("Regressões", "o texto digitado chega ao armazenamento", function (c) {
    c.definir("calabresa", 4);
    c.abrirGaveta();
    var linha = c.doc.querySelector('#linhas [data-sabor="calabresa"]');
    linha.querySelector(".linha-acao.obs").click();
    c.digitar(linha.querySelector(".obs-item"), "bem assada");
    return c.dormir(400).then(function () {
      var guardado = JSON.parse(global.localStorage.getItem("sayones-pedido-v2") || "{}");
      igual((guardado.obs || {}).calabresa, "bem assada");
    });
  });

  teste("Produção", "o site não carrega nada de fora do próprio domínio", function (c) {
    var origem = c.win.location.origin;
    var fora = c.win.performance.getEntriesByType("resource")
      .map(function (e) { return e.name; })
      .filter(function (u) { return u.indexOf(origem) !== 0 && u.indexOf("cloudflareinsights.com") === -1 && u.indexOf("data:") !== 0; });
    igual(fora.join(", "), "", "recursos de fora: " + fora.join(", "));
    var html = c.doc.documentElement.outerHTML;
    naoContem(html, "fonts.googleapis.com");
    naoContem(html, "fonts.gstatic.com");
    var scripts = Array.prototype.filter.call(c.doc.querySelectorAll("script"), function (s) {
      return !s.src && s.type !== "application/ld+json" && s.textContent.indexOf("__preparar") === -1;
    });
    igual(scripts.length, 0, "script inline sobrando");
  });

  teste("Produção", "as fontes próprias carregam", function (c) {
    return c.win.document.fonts.ready.then(function () {
      var faces = Array.from(c.win.document.fonts).map(function (f) { return f.family.replace(/"/g, "") + ":" + f.status; });
      ok(faces.some(function (f) { return /^Unbounded:loaded/.test(f); }), "Unbounded não carregou: " + faces.join(","));
      ok(faces.some(function (f) { return /^Space Grotesk:loaded/.test(f); }), "Space Grotesk não carregou: " + faces.join(","));
    });
  });

  teste("Produção", "canonical e og apontam pro domínio novo", function (c) {
    var base = "https://esfihas.sayones.com.br/";
    igual(c.el('link[rel="canonical"]').href, base);
    igual(c.el('meta[property="og:url"]').content, base);
    igual(c.el('meta[property="og:image"]').content, base + "og-v2.png");
    var ld = c.el('script[type="application/ld+json"]').textContent;
    contem(ld, '"url": "' + base + '"');
    naoContem(ld, "github.io");
  });

  teste("Produção", "a frase de privacidade aparece perto do botão", function (c) {
    c.abrirGaveta();
    var frase = "Seu nome e o pedido ficam guardados com a gente só pra preparar a encomenda.";
    var pe = c.el("#btnEnviar").closest(".gaveta-pe");
    contem(pe.textContent, frase);
    var nota = Array.prototype.filter.call(pe.querySelectorAll("p"), function (p) { return p.textContent.indexOf(frase) !== -1; })[0];
    var rb = c.el("#btnEnviar").getBoundingClientRect(), rn = nota.getBoundingClientRect();
    ok(Math.abs(rn.top - rb.bottom) < 80, "frase longe do botão");
    ok(rn.height > 0, "frase invisível");
  });

  teste("Regras", "regras.js carrega sem DOM", function () {
    return import("/regras.js").then(function (r) {
      igual(r.precoCentavos(12).total, 6240);
      igual(r.precoCentavos(1).unit, 590);
      igual(r.situacaoData(r.PONTOS[1], "2026-10-24", 4, Date.parse("2026-10-21T10:00:00-03:00")), "dia");
    });
  });

  global.SUITE = { testes: testes, A: A };
})(window);
