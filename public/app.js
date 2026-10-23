import {
  WHATSAPP, ANTECEDENCIA_H, PEDIDO_GRANDE, ANTECEDENCIA_GRANDE_H, FERIADOS, PONTOS, NOMES_DIA, SABORES, FAIXAS,
  faixaDe, isoBrasilia, diaDaData, janelaDe, proximaData,
  horasAntecedencia as horasAntecedenciaDe, situacaoData as situacaoDataDe
} from "./regras.js";

// Cupons: quem sabe quais existem é o servidor (GET /api/cupom). O site
// guarda a resposta de cada código digitado em cupomRes: "ok" com o pct,
// "nao" (404) ou "falha" (rede ou 5xx). Sem resposta ainda, o código está
// pendente: o total sai sem desconto. A regra (primeira compra etc.) é
// conferida depois pelo dono, no WhatsApp e no painel.


var $  = function(s,c){ return (c||document).querySelector(s); };
var $$ = function(s,c){ return Array.prototype.slice.call((c||document).querySelectorAll(s)); };
// "R$ 1.040,00": ponto no milhar, vírgula nos centavos
var brl = function(n){
  var p = n.toFixed(2).split(".");
  return "R$ " + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + p[1];
};
var CHAVE = "sayones-pedido-v2";
var MAX_ITEM = 200;   // teto por sabor, pra um erro de digitação não virar pedido absurdo

var chaveLinhas = null;   // assinatura da lista montada na gaveta
var carrinho = {};
var obsItem = {};         // observação por sabor, ex.: {calabresa: "sem cebola"}
var cupomTxt = "";        // o que está digitado no campo de cupom
var cupomRes = {};        // resposta do servidor por código: {estado, pct}
var tCupom = null;        // espera de 300 ms depois da última tecla
SABORES.forEach(function(s){ carrinho[s.id] = 0; });
try {
  var salvo = JSON.parse(localStorage.getItem(CHAVE) || "{}") || {};
  var qtds = salvo.qtds || {};
  SABORES.forEach(function(s){
    var v = parseInt(qtds[s.id], 10);
    if (v > 0 && v <= MAX_ITEM) carrinho[s.id] = v;
    var o = salvo.obs && salvo.obs[s.id];
    if (typeof o === "string") obsItem[s.id] = o.slice(0, 140);
  });
  if (typeof salvo.cupom === "string") cupomTxt = salvo.cupom.toUpperCase().slice(0, 30);
} catch(e){ /* localStorage bloqueado, segue sem persistir */ }

// localStorage.setItem é síncrono e pode encostar no disco. Gravar a cada
// tecla (ou a cada 75ms do "segurar") travava a interface à toa.
var gravacaoPendente = null;
function gravarAgora(){
  gravacaoPendente = null;
  var qtds = {};
  SABORES.forEach(function(s){ if (carrinho[s.id] > 0) qtds[s.id] = carrinho[s.id]; });
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ qtds: qtds, obs: obsItem, cupom: cupomTxt }));
  } catch(e){}
}
function salvar(){
  if (gravacaoPendente) return;
  gravacaoPendente = setTimeout(gravarAgora, 250);
}
// se a aba fechar antes do timer, grava na hora
["pagehide", "visibilitychange"].forEach(function(e){
  window.addEventListener(e, function(){ if (gravacaoPendente){ clearTimeout(gravacaoPendente); gravarAgora(); } });
});
// O <input> sozinho não anuncia a quantidade quando ela muda por botão.
// role=spinbutton com aria-valuenow resolve, e expõe o teto.
function marcarQuantidade(campo, n, nome){
  campo.setAttribute("role", "spinbutton");
  campo.setAttribute("aria-valuemin", "0");
  campo.setAttribute("aria-valuemax", String(MAX_ITEM));
  campo.setAttribute("aria-valuenow", String(n));
  campo.setAttribute("aria-valuetext", n + (n === 1 ? " esfiha de " : " esfihas de ") + nome);
}

function nomeDe(id){
  for (var i=0;i<SABORES.length;i++){ if (SABORES[i].id === id) return SABORES[i].nome; }
  return id;
}
function totalQtd(){
  return SABORES.reduce(function(t,s){ return t + carrinho[s.id]; }, 0);
}
// Estado do cupom digitado: "vazio", "pendente", "ok", "nao" ou "falha".
function estadoCupom(){
  var cod = cupomTxt.trim();
  if (!cod) return "vazio";
  var r = cupomRes[cod];
  return r ? r.estado : "pendente";
}
// Cupom que o servidor confirmou, ou null. Espaço em volta não conta.
function cupomAtual(){
  var cod = cupomTxt.trim();
  return estadoCupom() === "ok" ? { cod: cod, pct: cupomRes[cod].pct } : null;
}
// Pergunta ao servidor se o código existe. Falha de rede nunca estoura: vira
// "falha" e o pedido segue, com o cupom escrito na mensagem.
function consultarCupom(cod){
  if (!cod || cupomRes[cod]) return;
  var guardar = function(res){ cupomRes[cod] = res; render(); };
  try {
    fetch("/api/cupom?codigo=" + encodeURIComponent(cod))
      .then(function(r){
        if (r.status === 404) return guardar({ estado: "nao" });
        if (!r.ok) return guardar({ estado: "falha" });
        return r.json().then(function(j){
          guardar(typeof j.pct === "number" ? { estado: "ok", pct: j.pct } : { estado: "falha" });
        });
      })
      .catch(function(){ guardar({ estado: "falha" }); });
  } catch(e){ guardar({ estado: "falha" }); }
}
function agendarCupom(esperaMs){
  clearTimeout(tCupom);
  var cod = cupomTxt.trim();
  if (!cod || cupomRes[cod]) return;
  tCupom = setTimeout(function(){ consultarCupom(cod); }, esperaMs);
}
// Desconto do cupom em reais, arredondado no centavo.
function descontoDe(valor){
  var c = cupomAtual();
  return c ? Math.round(valor * c.pct * 100) / 100 : 0;
}
function comCupom(valor){ return valor - descontoDe(valor); }
function pctTxt(p){ return Math.round(p * 100) + "%"; }

/* ---------- monta o cardápio ---------- */
var listaSabores = $("#listaSabores");
SABORES.forEach(function(s){
  var card = document.createElement("article");
  card.className = "card";
  card.dataset.sabor = s.id;
  card.innerHTML =
    (s.veg ? '<span class="tag-veg">Vegetariana</span>' : '') +
    '<svg class="card-ilu" viewBox="0 0 100 100" aria-hidden="true"><use href="'+s.icone+'"/></svg>' +
    '<h3>'+s.nome+'</h3>' +
    '<p class="desc">'+s.desc+'</p>' +
    '<p class="desc curta">'+(s.curta || s.desc)+'</p>' +
    '<div class="card-rodape">' +
      '<span class="preco">'+brl(FAIXAS[FAIXAS.length-1].preco).replace(" ", "&nbsp;")+'<small>por unidade</small></span>' +
      '<div class="stepper">' +
        '<button type="button" data-op="-1" aria-label="Remover uma esfiha de '+s.nome+'">−</button>' +
        '<input class="conta" type="text" inputmode="numeric" value="0" aria-label="Quantidade de '+s.nome+'">' +
        '<button type="button" data-op="1" aria-label="Adicionar uma esfiha de '+s.nome+'">+</button>' +
      '</div>' +
    '</div>';
  listaSabores.appendChild(card);
});

/* ---------- topo: tabela de combos e faixa de sabores ---------- */
// Saem da mesma configuração do carrinho, pra preço e sabor nunca divergirem.
var combosHero = $("#combosHero");
FAIXAS.slice().reverse().forEach(function(f){
  var el = document.createElement("span");
  el.innerHTML = '<small>'+(f.min > 1 ? f.nome : '1 a '+(FAIXAS[FAIXAS.length-2].min-1))+'</small><b>'+brl(f.preco)+'</b>';
  combosHero.appendChild(el);
});
$("#precoHero").textContent = brl(FAIXAS[FAIXAS.length-1].preco);
$("#nPontos").textContent = PONTOS.filter(function(p){ return p.dias !== null; }).length;
// Junta os dias de todos os pontos em ordem. Uma sequência de 3 ou mais
// vira "de seg a sáb", senão lista: "qui, sex e sáb".
var dias = [];
PONTOS.forEach(function(p){
  (p.dias || []).forEach(function(d){ if (dias.indexOf(d) === -1) dias.push(d); });
});
dias.sort();
var curto = dias.map(function(d){ return NOMES_DIA[d].slice(0, 3); });
var seguidos = dias.every(function(d, i){ return i === 0 || d === dias[i-1] + 1; });
$("#linkRetirada").textContent = "Retirada " +
  (seguidos && dias.length > 2 ? "de " + curto[0] + " a " + curto[curto.length-1]
   : curto.length > 1 ? curto.slice(0, -1).join(", ") + " e " + curto[curto.length-1] : curto.join(""));
var saboresHero = $("#saboresHero");
SABORES.forEach(function(s){
  var a = document.createElement("a");
  a.href = "#cardapio";
  a.innerHTML =
    '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="'+s.icone+'"/></svg>' +
    '<span><b>'+s.nome+'</b><small>'+(s.curta || s.desc)+'</small><em>'+brl(FAIXAS[FAIXAS.length-1].preco)+'</em></span>';
  saboresHero.appendChild(a);
});

/* ---------- monta as faixas de preço ---------- */
var listaFaixas = $("#listaFaixas");
FAIXAS.slice().reverse().forEach(function(f){
  var base = FAIXAS[FAIXAS.length-1].preco;
  var eco = Math.round((1 - f.preco/base) * 100);
  var combo = f.min > 1;
  var valor = combo ? f.min * f.preco : f.preco;
  var el = document.createElement("div");
  el.className = "faixa" + (f.destaque ? " destaque" : "");
  el.dataset.min = f.min;
  el.innerHTML =
    (f.destaque ? '<span class="fita">Melhor preço</span>' : '') +
    '<div class="qtd">'+f.nome+'</div>' +
    '<div class="un"><sup>R$</sup>'+valor.toFixed(2).replace(".",",")+'</div>' +
    '<div class="un-lbl">' +
      (combo ? f.min+' esfihas · '+brl(f.preco)+' cada' : 'por esfiha, até 3 unidades') +
    '</div>' +
    (eco > 0 ? '<span class="eco">'+eco+'% de desconto</span>'
             : '<span class="eco">preço cheio</span>');
  listaFaixas.appendChild(el);
});

/* ---------- elementos ---------- */
var barra = $("#barra"), veu = $("#veu"), gaveta = $("#gaveta");
var blocoVazio = $("#blocoVazio"), blocoPedido = $("#blocoPedido");
var linhas = $("#linhas"), btnEnviar = $("#btnEnviar"), aviso = $("#aviso");
var fPonto = $("#fPonto"), fNome = $("#fNome"), fData = $("#fData"), fObs = $("#fObs");
var fCupom = $("#fCupom");

PONTOS.forEach(function(pt, i){
  var op = document.createElement("option");
  op.value = i;
  // Só ponto e dias: o horário cortava no celular, e a dica embaixo já mostra o do dia.
  op.textContent = pt.dias === null ? pt.nome : pt.nome + " · " + pt.diaNome;
  fPonto.appendChild(op);
});

/* ---------- data mínima ---------- */
// O dia e a hora valem sempre no horário de Brasília: com o celular em
// outro fuso a antecedência saía errada pros dois lados.
var iso = function(d){ return isoBrasilia(d.getTime()); };
var dois = function(n){ return String(n).padStart(2, "0"); };

function pontoAtual(){ return PONTOS[+fPonto.value] || PONTOS[0]; }

// "das 18h30 às 20h" quando há horário; "de manhã" fica como está.
function horarioTxt(pt, dia){
  var j = janelaDe(pt, dia);
  return /^\d/.test(j) ? "das " + j : j;
}

// A antecedência conta em horas até o começo da janela, não em dias do
// calendário: pedir quarta às 23h pra quinta às 8h dá só 9 horas.
function horasAntecedencia(){ return horasAntecedenciaDe(totalQtd()); }
function antecedenciaTxt(){
  return totalQtd() > PEDIDO_GRANDE ? "3 dias de antecedência acima de " + PEDIDO_GRANDE + " esfihas"
                                    : ANTECEDENCIA_H + " horas de antecedência";
}
function limite(){ return new Date(Date.now() + horasAntecedencia()*3600*1000); }

/* ---------- agenda do servidor ---------- */
// Dias lotados ou bloqueados e pedidos pausados, lidos ao abrir a gaveta.
// Se a leitura falhar, fica tudo como estava: o site não bloqueia nada e
// o servidor ainda decide na hora de gravar o pedido.
var agenda = { pausado:false, bloqueados:new Map() };
var dataMexida = false;   // true quando a pessoa escolheu a data
var AVISO_PAUSA = "Os pedidos estão pausados por enquanto. Fala com a gente no WhatsApp.";

function situacaoData(pt, valor){ return situacaoDataDe(pt, valor, totalQtd(), Date.now(), agenda.bloqueados); }

// Primeira data em que o ponto abre, que respeita a antecedência e que não
// está lotada nem bloqueada.
function proximaDataDe(pt){ return proximaData(pt, totalQtd(), Date.now(), agenda.bloqueados); }

function mostrarPausa(){
  if (!agenda.pausado) return;
  aviso.textContent = AVISO_PAUSA;
  aviso.classList.add("on");
}
function carregarAgenda(){
  var p;
  try { p = fetch("/api/agenda", { cache:"no-store" }); } catch(e){ return; }
  if (!p || !p.then) return;
  p.then(function(r){ return r.ok ? r.json() : Promise.reject(); })
   .then(function(j){
     var m = new Map();
     var ind = (j && j.indisponiveis) || {};
     Object.keys(ind).forEach(function(d){ if (ind[d] === "lotado" || ind[d] === "bloqueado") m.set(d, ind[d]); });
     agenda = { pausado: !!(j && j.pausado), bloqueados: m };
     if (!agenda.pausado && aviso.textContent === AVISO_PAUSA) aviso.classList.remove("on");
     var pt = pontoAtual();
     // a data que o site sugeriu sozinho não pode ser uma que acabou de aparecer como indisponível
     if (!dataMexida && pt.dias !== null && situacaoData(pt, fData.value) !== "ok") fData.value = proximaDataDe(pt);
     atualizarDica();
     render();
   })
   .catch(function(){});
}

function comDia(valor){ return NOMES_DIA[diaDaData(valor)] + ", " + dataBR(valor); }

function textoData(pt, valor){
  var sit = situacaoData(pt, valor);
  if (sit === "feriado")
    return "Dia " + dataBR(valor) + " é feriado (" + FERIADOS[valor] + ") e não tem retirada. " +
           "A mais próxima " + pt.prep + " " + pt.nome + " é " + comDia(proximaDataDe(pt)) + ".";
  if (sit === "lotado")
    return "Esse dia já está cheio. A mais próxima " + pt.prep + " " + pt.nome + " é " + comDia(proximaDataDe(pt)) + ".";
  if (sit === "bloqueado")
    return "Nesse dia não tem retirada. A mais próxima " + pt.prep + " " + pt.nome + " é " + comDia(proximaDataDe(pt)) + ".";
  if (sit === "dia")
    return "Nesse dia a gente não está " + pt.prep + " " + pt.nome + ", só " +
           pt.quando + ". A mais próxima é " + comDia(proximaDataDe(pt)) + ".";
  if (sit === "cedo")
    return "Pra essa data não dá tempo: precisamos de " + antecedenciaTxt() +
           ". A mais próxima " + pt.prep + " " + pt.nome + " é " + comDia(proximaDataDe(pt)) + ".";
  var dia = diaDaData(valor);
  return "✓ " + NOMES_DIA[dia].charAt(0).toUpperCase() + NOMES_DIA[dia].slice(1) + ", " +
         dataBR(valor) + " · " + horarioTxt(pt, dia) + " " + pt.prep + " " + pt.nome;
}

function atualizarDica(){
  var el = $("#dicaData"), pt = pontoAtual();
  fData.min = iso(limite());
  // no "combinar outro ponto" a data não vai na mensagem, então o campo some
  $("#campoData").hidden = pt.dias === null;
  if (pt.dias === null){
    el.hidden = false; el.className = "dica";
    el.textContent = "A gente combina o ponto e o horário com você pelo WhatsApp.";
    return;
  }
  if (!fData.value){ el.hidden = true; return; }
  el.hidden = false;
  el.className = situacaoData(pt, fData.value) === "ok" ? "dica ok" : "dica";
  el.textContent = textoData(pt, fData.value);
}

// Trocar de ponto só mexe na data se a escolhida não serve no ponto novo:
// antes ela pulava pra primeira data livre e o cliente não percebia.
fPonto.addEventListener("change", function(){
  var pt = pontoAtual();
  if (pt.dias !== null && (!fData.value || situacaoData(pt, fData.value) !== "ok")){
    fData.value = proximaDataDe(pt);
    dataMexida = false;
  }
  limparAviso();
  atualizarDica();
});
fData.addEventListener("change", function(){ dataMexida = true; limparAviso(); atualizarDica(); });
fData.value = proximaDataDe(PONTOS[0]);
atualizarDica();

/* ---------- render ---------- */
function render(){
  var q = totalQtd();
  var f = faixaDe(q);
  var bruto = q * f.preco;              // com o combo, antes do cupom
  var total = comCupom(bruto);
  var cheio = q * FAIXAS[FAIXAS.length-1].preco;

  // cards
  $$(".card").forEach(function(card){
    var id = card.dataset.sabor, n = carrinho[id];
    var conta = $(".conta", card);
    // não sobrescreve enquanto a pessoa digita, senão o cursor pula
    if (document.activeElement !== conta) conta.value = n;
    marcarQuantidade(conta, n, nomeDe(id));
    $('[data-op="-1"]', card).disabled = n === 0;
    card.classList.toggle("ativo", n > 0);
  });

  // faixas em destaque conforme o carrinho
  $$(".faixa").forEach(function(el){
    el.classList.toggle("destaque", q > 0 ? +el.dataset.min === f.min : el.dataset.min === "12");
  });

  // barra
  $("#barraTotal").textContent = brl(total);
  // "cada" fica num span pra sair em tela estreita sem cortar o preço
  $("#barraQtd").innerHTML = q === 0 ? "nenhuma esfiha"
    : q + (q === 1 ? " esfiha" : " esfihas") + " · " + brl(f.preco) + '<span class="cada"> cada</span>';
  var barraVisivel = q > 0 && !gaveta.classList.contains("aberta");
  barra.classList.toggle("visivel", barraVisivel);
  barra.inert = !barraVisivel;   // escondida embaixo da tela, ainda recebia Tab
  document.body.classList.toggle("tem-barra", q > 0);

  // gaveta
  blocoVazio.hidden = q > 0;
  blocoPedido.hidden = q === 0;
  btnEnviar.disabled = q === 0 || agenda.pausado;
  mostrarPausa();
  $("#txtEnviar").textContent = q === 0 ? "Escolha pelo menos uma esfiha"
                                        : "Enviar pedido no WhatsApp";

  // Remonta a lista só quando o conjunto de sabores muda; caso contrário
  // atualiza no lugar, pra não destruir o botão que o usuário acabou de clicar.
  // Mantém na lista o sabor cuja linha está em uso, mesmo zerado: senão a
  // linha some debaixo de quem apagou a quantidade pra redigitar.
  var emUso = document.activeElement && document.activeElement.closest
    ? document.activeElement.closest("#linhas .linha")
    : null;
  var mantido = emUso ? emUso.dataset.sabor : null;
  var ativos = SABORES.filter(function(s){ return carrinho[s.id] > 0 || s.id === mantido; });
  var chave = ativos.map(function(s){ return s.id; }).join(",");
  if (chave !== chaveLinhas){
    chaveLinhas = chave;
    linhas.innerHTML = "";
    ativos.forEach(function(s){
      var li = document.createElement("li");
      li.className = "linha";
      li.dataset.sabor = s.id;
      li.innerHTML =
        '<div class="linha-topo">' +
          '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="'+s.icone+'"/></svg>' +
          '<span class="linha-txt"><span class="nome">'+s.nome+'</span><span class="sub"></span></span>' +
          '<div class="stepper">' +
            '<button type="button" data-op="-1" aria-label="Remover uma esfiha de '+s.nome+'">−</button>' +
            '<input class="conta" type="text" inputmode="numeric" value="0" aria-label="Quantidade de '+s.nome+'">' +
            '<button type="button" data-op="1" aria-label="Adicionar uma de '+s.nome+'">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="linha-pe">' +
          '<button type="button" class="linha-acao obs" aria-expanded="false" aria-label="Observação para '+s.nome+'">' +
            '<svg aria-hidden="true"><use href="#ic-nota"/></svg>Observação</button>' +
          '<button type="button" class="linha-acao remover" aria-label="Tirar '+s.nome+' do pedido">' +
            '<svg aria-hidden="true"><use href="#ic-lixeira"/></svg>Tirar</button>' +
        '</div>' +
        '<input class="obs-item" type="text" maxlength="140" hidden ' +
               'placeholder="Ex.: sem cebola, embalar separado" ' +
               'aria-label="Observação para '+s.nome+'">';
      var campo = $(".obs-item", li);
      if (obsItem[s.id]) {
        campo.value = obsItem[s.id];
        campo.hidden = false;
        $(".linha-acao.obs", li).classList.add("ativa");
        $(".linha-acao.obs", li).setAttribute("aria-expanded", "true");
      }
      linhas.appendChild(li);
    });
  }
  ativos.forEach(function(s){
    var li = $('[data-sabor="'+s.id+'"]', linhas);
    if (!li) return;
    var conta = $(".conta", li);
    if (document.activeElement !== conta) conta.value = carrinho[s.id];
    marcarQuantidade(conta, carrinho[s.id], s.nome);
    $(".sub", li).textContent = brl(f.preco) + " cada";
  });

  $("#rsQtd").textContent  = q + (q === 1 ? " unidade" : " unidades");
  $("#rsUnit").textContent = brl(f.preco);
  $("#rsTotal").textContent = brl(total);
  var eco = cheio - bruto;
  $("#rsLinhaEco").hidden = eco <= 0;
  $("#rsEco").textContent = "− " + brl(eco);

  var cup = cupomAtual();
  $("#rsLinhaCupom").hidden = !cup;
  if (cup){
    $("#rsCupomNome").textContent = "Cupom " + cup.cod + " (" + pctTxt(cup.pct) + ")";
    $("#rsCupom").textContent = "− " + brl(bruto - total);
  }
  // não sobrescreve enquanto a pessoa digita, senão o cursor pula
  if (document.activeElement !== fCupom) fCupom.value = cupomTxt;
  var dicaCupom = $("#dicaCupom"), digitado = cupomTxt.trim();
  dicaCupom.hidden = !digitado;
  var estCupom = estadoCupom();
  dicaCupom.classList.toggle("ok", !!cup);
  dicaCupom.classList.toggle("falha", estCupom === "nao");
  dicaCupom.textContent = cup ? "Cupom aplicado: " + pctTxt(cup.pct) + " de desconto no total."
                        : estCupom === "nao" ? "Esse cupom não existe. Confira se digitou certo."
                        : estCupom === "falha" ? "Não deu pra conferir o cupom agora. Ele vai na mensagem e a gente confere."
                        : "Conferindo o cupom...";

  // Quanto falta pro próximo desconto. Só aparece quando faltam 1 ou 2:
  // com mais que isso a sugestão vira empurrão. Mostra quanto o pedido
  // sobe, que é o que o cliente pesa na hora de decidir.
  var prog = $("#rsProgresso"), prox = null;
  for (var i = FAIXAS.length-1; i >= 0; i--){ if (FAIXAS[i].min > q){ prox = FAIXAS[i]; break; } }
  var falta = prox ? prox.min - q : 0;
  if (prox && q > 0 && falta <= 2){
    var novo = comCupom(prox.min * prox.preco);
    prog.hidden = false;
    prog.innerHTML = (falta === 1 ? "Falta <b>1 esfiha</b>" : "Faltam <b>"+falta+" esfihas</b>") +
                     " pro <b>"+prox.nome+"</b>: o pedido fica em <span class=\"din\">"+brl(novo)+
                     "</span>, <span class=\"din\">"+brl(novo - total)+"</span> a mais que agora.";
  } else {
    prog.hidden = true;
  }

  atualizarDica();
  salvar();
}

/* ---------- eventos de quantidade ---------- */
function definir(id, n){
  if (!(id in carrinho)) return;
  carrinho[id] = Math.max(0, Math.min(MAX_ITEM, n));
  render();
  return carrinho[id];
}
function mexer(id, delta){ definir(id, carrinho[id] + delta); }

function saborDe(el){
  var alvo = el.closest("[data-sabor]");
  return alvo && alvo.dataset.sabor;
}

// Segurar o + ou o − acelera, pra montar pedido grande sem clicar de um em um.
var repeticao = null, ultimaRepeticao = 0, botaoRepetido = null;
function pararRepeticao(){ clearTimeout(repeticao); clearInterval(repeticao); repeticao = null; }
function aoSegurar(ev){
  var b = ev.target.closest("button[data-op]");
  if (!b || b.disabled) return;
  var id = saborDe(b), passo = +b.dataset.op;
  pararRepeticao();
  repeticao = setTimeout(function(){
    repeticao = setInterval(function(){
      // para nas duas pontas: sem isso, segurar o + no teto girava à toa
      var noLimite = passo < 0 ? carrinho[id] <= 0 : carrinho[id] >= MAX_ITEM;
      if (noLimite) return pararRepeticao();
      ultimaRepeticao = Date.now();
      botaoRepetido = b;
      mexer(id, passo);
    }, 75);
  }, 420);
}
function aoClicar(ev){
  var b = ev.target.closest("button[data-op]");
  if (!b) return;
  // O clique que o navegador dispara ao soltar não pode somar de novo.
  // A janela vale só para o botão que foi segurado: sem isso, tocar no +
  // de outro sabor logo depois era descartado em silêncio.
  if (b === botaoRepetido && Date.now() - ultimaRepeticao < 250) return;
  mexer(saborDe(b), +b.dataset.op);
}
[listaSabores, linhas].forEach(function(area){
  area.addEventListener("click", aoClicar);
  area.addEventListener("pointerdown", aoSegurar);
});
["pointerup","pointercancel","pointerleave","blur"].forEach(function(e){
  window.addEventListener(e, pararRepeticao);
});

// Digitar a quantidade direto no campo
function aoDigitar(ev){
  var campo = ev.target;
  if (!campo.classList || !campo.classList.contains("conta")) return;
  var limpo = campo.value.replace(/\D/g, "").slice(0, 3);
  if (limpo !== campo.value) campo.value = limpo;
  var pedido = limpo === "" ? 0 : parseInt(limpo, 10);
  var aceito = definir(saborDe(campo), pedido);
  // se o teto cortou, o campo não pode continuar exibindo o número digitado
  if (limpo !== "" && aceito !== pedido) campo.value = aceito;
}
function aoSair(ev){
  var campo = ev.target;
  if (!campo.classList || !campo.classList.contains("conta")) return;
  campo.value = carrinho[saborDe(campo)] || 0;
}
[listaSabores, linhas].forEach(function(area){
  area.addEventListener("input", aoDigitar);
  area.addEventListener("focusout", aoSair);
  area.addEventListener("keydown", function(ev){
    if (!ev.target.classList || !ev.target.classList.contains("conta")) return;
    if (ev.key === "Enter"){ ev.preventDefault(); ev.target.blur(); return; }
    if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
    ev.preventDefault();
    var alvo = ev.target, sabor = saborDe(alvo);
    mexer(sabor, ev.key === "ArrowUp" ? 1 : -1);
    // render() não mexe no campo focado (senão o cursor pula), então aqui é na mão
    alvo.value = carrinho[sabor];
  });
});

// Lixeira e observação por item
linhas.addEventListener("click", function(ev){
  var remover = ev.target.closest(".linha-acao.remover");
  if (remover){
    var alvo = remover.closest(".linha").dataset.sabor;
    delete obsItem[alvo];
    // A ordem importa. Primeiro o foco sai da lista: render() segura na
    // lista a linha em uso, e com o foco dentro dela a linha não sairia.
    // Só depois da remontagem dá pra mirar um botão que ainda existe.
    $("#btnFechar").focus();
    definir(alvo, 0);
    var proxima = linhas.querySelector(".linha-acao.remover");
    if (proxima) proxima.focus();
    return;
  }

  var abrirObs = ev.target.closest(".linha-acao.obs");
  if (abrirObs){
    var li = abrirObs.closest(".linha");
    var campo = $(".obs-item", li);
    if (campo.hidden){
      campo.hidden = false;
      abrirObs.classList.add("ativa");
      abrirObs.setAttribute("aria-expanded", "true");
    } else if (!campo.value.trim()){
      // só fecha quando está vazio; com texto dentro, fechar apagaria o
      // que a pessoa escreveu sem avisar
      campo.hidden = true;
      abrirObs.classList.remove("ativa");
      abrirObs.setAttribute("aria-expanded", "false");
      return;
    }
    campo.focus();
  }
});
linhas.addEventListener("input", function(ev){
  if (!ev.target.classList.contains("obs-item")) return;
  var id = saborDe(ev.target), txt = ev.target.value.trim();
  if (txt) obsItem[id] = txt; else delete obsItem[id];
  salvar();
});
linhas.addEventListener("focusout", function(ev){
  var campo = ev.target;
  if (!campo.classList || !campo.classList.contains("obs-item")) return;
  if (campo.value.trim()) return;
  var li = campo.closest(".linha"), botao = $(".linha-acao.obs", li);
  campo.hidden = true;
  botao.classList.remove("ativa");
  botao.setAttribute("aria-expanded", "false");
});

/* ---------- gaveta ---------- */
// Identifica este envio. O servidor ignora o segundo POST com o mesmo id,
// então um reenvio por rede ruim não vira pedido duplicado. Nasce na abertura
// da gaveta e é renovado depois de cada envio.
var idEnvio = null;
function novoIdEnvio(){
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch(e){}
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}
var ultimoFoco = null, tVeu = null;
// Com a gaveta aberta o resto da página fica inerte: sem isso o Tab saía
// da gaveta e ia parar no cabeçalho atrás do véu.
function fundo(){
  return $$("body > *").filter(function(el){
    return el !== gaveta && el !== veu && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName);
  });
}
function abrir(){
  ultimoFoco = document.activeElement;
  clearTimeout(tVeu);   // fechar e reabrir rápido deixava a gaveta sem véu
  fundo().forEach(function(el){ el.setAttribute("inert", ""); });
  veu.hidden = false;
  requestAnimationFrame(function(){ veu.classList.add("aberta"); });
  gaveta.classList.add("aberta");
  gaveta.setAttribute("aria-hidden","false");
  gaveta.removeAttribute("inert");
  document.body.style.overflow = "hidden";
  barra.classList.remove("visivel");
  setTimeout(function(){ $("#btnFechar").focus(); }, 80);
  if (!idEnvio) idEnvio = novoIdEnvio();
  carregarAgenda();
}
function fechar(){
  veu.classList.remove("aberta");
  gaveta.classList.remove("aberta");
  gaveta.setAttribute("aria-hidden","true");
  gaveta.setAttribute("inert","");
  document.body.style.overflow = "";
  fundo().forEach(function(el){ el.removeAttribute("inert"); });
  tVeu = setTimeout(function(){ veu.hidden = true; }, 300);
  if (ultimoFoco) ultimoFoco.focus();
  render();
}
$$("[data-abrir-pedido]").forEach(function(b){ b.addEventListener("click", abrir); });
$("#btnFechar").addEventListener("click", fechar);
veu.addEventListener("click", fechar);
document.addEventListener("keydown", function(ev){
  if (ev.key === "Escape" && gaveta.classList.contains("aberta")) fechar();
});
$("#btnIrCardapio").addEventListener("click", function(){
  fechar();
  setTimeout(function(){ $("#cardapio").scrollIntoView({behavior: comoRolar()}); }, 120);
});

/* ---------- envio ---------- */
// O aviso vermelho é a resposta ao último clique em enviar; mexeu no
// formulário, ele deixa de valer.
function limparAviso(){
  aviso.classList.remove("on");
  [fNome, fData, fCupom].forEach(function(el){ marcarErro(el, false); });
  mostrarPausa();   // o aviso de pausa vale enquanto durar a pausa
}
fNome.addEventListener("input", limparAviso);

// O cupom vira maiúscula enquanto a pessoa digita, mantendo o cursor no lugar.
fCupom.addEventListener("input", function(){
  var ini = fCupom.selectionStart, fim = fCupom.selectionEnd;
  var maiusc = fCupom.value.toUpperCase();
  if (maiusc !== fCupom.value){
    fCupom.value = maiusc;
    try { fCupom.setSelectionRange(ini, fim); } catch(e){}
  }
  cupomTxt = maiusc;
  marcarErro(fCupom, false);
  limparAviso();
  agendarCupom(300);
  render();
});
fCupom.addEventListener("blur", function(){ cupomTxt = cupomTxt.trim(); render(); });
function marcarErro(el, tem){
  el.classList.toggle("erro", !!tem);
  if (tem) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
}
function dataBR(v){
  if (!v) return "";
  var p = v.split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

var ultimoEnvio = { msg:"", em:0 };
btnEnviar.addEventListener("click", function(){
  var q = totalQtd();
  if (!q || agenda.pausado) return;

  var faltando = [];
  var pt = pontoAtual();

  marcarErro(fNome, !fNome.value.trim());
  if (!fNome.value.trim()) faltando.push("seu nome");

  var precisaData = pt.dias !== null;
  var dataRuim = precisaData && !!fData.value && situacaoData(pt, fData.value) !== "ok";
  marcarErro(fData, precisaData && (!fData.value || dataRuim));
  if (precisaData && !fData.value) faltando.push("o dia da retirada");

  // Cupom errado não some calado: o cliente achou que tinha desconto.
  var cupomRuim = estadoCupom() === "nao";
  marcarErro(fCupom, cupomRuim);

  if (faltando.length || dataRuim || cupomRuim){
    aviso.textContent = faltando.length ? "Falta preencher: " + faltando.join(" e ") + "."
                      : dataRuim ? textoData(pt, fData.value)
                      : "Esse cupom não existe. Corrija ou apague o campo do cupom.";
    aviso.classList.add("on");
    var alvo = $(".erro");
    if (alvo) { alvo.focus(); alvo.scrollIntoView({behavior: comoRolar(), block:"center"}); }
    return;
  }
  limparAviso();

  var f = faixaDe(q), cupom = cupomAtual();
  var linhasTxt = SABORES.filter(function(s){ return carrinho[s.id] > 0; })
    .map(function(s){
      var obs = (obsItem[s.id] || "").trim();
      return "• " + carrinho[s.id] + "x " + s.nome + (obs ? " (" + obs + ")" : "");
    })
    .join("\n");

  var retiradaTxt = pt.dias === null
    ? "Combinar ponto e horário"
    : pt.nome + ", " + NOMES_DIA[diaDaData(fData.value)] + " " + dataBR(fData.value) + ", " + horarioTxt(pt, diaDaData(fData.value));

  var msg =
    "Olá, Esfihas Sayones! Quero fazer uma encomenda de esfiha congelada.\n\n" +
    "*PEDIDO*\n" + linhasTxt + "\n" +
    "Total: " + q + (q === 1 ? " esfiha" : " esfihas") +
    ", " + brl(q * f.preco) + " (" + brl(f.preco) + " cada)\n" +
    (cupom ? "*Cupom:* " + cupom.cod + ", " + pctTxt(cupom.pct) + " de desconto\n" +
             "*Total com cupom:* " + brl(comCupom(q * f.preco)) + "\n"
     : cupomTxt.trim() ? "*Cupom:* " + cupomTxt.trim() + " (a confirmar)\n" : "") +
    "\n" +
    "*Retirada:* " + retiradaTxt + "\n" +
    "*Nome:* " + fNome.value.trim() + "\n" +
    (fObs.value.trim() ? "*Observações:* " + fObs.value.trim() + "\n" : "") +
    "\nAguardo a confirmação. Obrigado!";

  // Clique duplo abria duas conversas com o mesmo pedido. Só a mesma
  // mensagem em menos de 2s é barrada; performance.now não volta com o relógio.
  if (msg === ultimoEnvio.msg && performance.now() - ultimoEnvio.em < 2000) return;
  ultimoEnvio = { msg:msg, em:performance.now() };
  // Grava o pedido sem esperar: o WhatsApp abre no mesmo clique e não
  // depende do servidor. Nunca vai total; quem calcula é o servidor.
  gravarPedido(pt);
  window.open("https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
  idEnvio = novoIdEnvio();
});
function gravarPedido(pt){
  try {
    var itens = SABORES.filter(function(s){ return carrinho[s.id] > 0; }).map(function(s){
      var it = { sabor: s.id, qtd: carrinho[s.id] };
      var o = (obsItem[s.id] || "").trim();
      if (o) it.obs = o;
      return it;
    });
    var corpo = { id_envio: idEnvio || novoIdEnvio(), nome: fNome.value.trim(), itens: itens, ponto: +fPonto.value || 0 };
    if (pt.dias !== null) corpo.retirada = fData.value;
    if (cupomTxt.trim()) corpo.cupom = cupomTxt.trim();
    if (fObs.value.trim()) corpo.obs = fObs.value.trim();
    var p = fetch("/api/pedidos", {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo)
    });
    if (p && p.catch) p.catch(function(){});
  } catch(e){ /* sem servidor, o pedido segue só pelo WhatsApp */ }
}

[fNome, fData].forEach(function(el){
  el.addEventListener("input", function(){ marcarErro(el, false); });
});

/* ---------- movimento ---------- */
var semMovimento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
function comoRolar(){ return (semMovimento && semMovimento.matches) ? "auto" : "smooth"; }

/* ---------- clicar na marca volta pro topo ---------- */
// O alvo #topo é o próprio cabeçalho, que é sticky: rolar até ele só
// deslocava a página um pouco a cada clique, sem nunca chegar no começo.
$(".marca").addEventListener("click", function(ev){
  ev.preventDefault();
  window.scrollTo({ top: 0, behavior: comoRolar() });
  // Em file:// o Chrome trata a origem como "null" e replaceState estoura.
  // Abrir o index.html com dois cliques é um jeito normal de conferir o site.
  try { history.replaceState(null, "", location.pathname + location.search); } catch(e){}
});

/* ---------- esmaecido da tira de menu ---------- */
var tira = $(".nav");
function marcarTira(){
  var sobra = tira.scrollWidth - tira.clientWidth;
  tira.classList.toggle("tem-antes", tira.scrollLeft > 4);
  tira.classList.toggle("tem-depois", sobra > 4 && tira.scrollLeft < sobra - 4);
}
tira.addEventListener("scroll", marcarTira, {passive:true});
window.addEventListener("resize", marcarTira);
marcarTira();

/* ---------- header grudado ---------- */
var topo = $("#topo");
var aoRolar = function(){ topo.classList.toggle("grudado", window.scrollY > 10); };
window.addEventListener("scroll", aoRolar, {passive:true});
aoRolar();

$("#ano").textContent = new Date().getFullYear();
consultarCupom(cupomTxt.trim());   // cupom que sobrou de uma visita anterior
render();
