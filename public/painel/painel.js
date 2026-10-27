// Painel do dia. Lê e grava só pela API em /api/painel; nada de cliente fica
// no navegador. Preço, sabores e pontos vêm de /regras.js, mas quem manda no
// valor é o servidor: depois de salvar, a tela mostra o que ele devolveu.
import { SABORES, PONTOS, NOMES_DIA, isoBrasilia, diaDaData, precoCentavos } from "../regras.js";

const MOTIVOS = {
  cedo: "Pediu com menos antecedência que o mínimo",
  producao: "Não sobra dia de produção antes da retirada",
  longe: "Pediu com mais de 90 dias de antecedência",
  feriado: "Dia de feriado",
  dia: "O ponto não abre nesse dia",
  lotado: "Dia já estava cheio",
  bloqueado: "Dia bloqueado",
  pausado: "Pedidos estavam pausados",
  cupom: "Cupom não existe",
};
const NOME_SABOR = Object.fromEntries(SABORES.map((s) => [s.id, s.nome]));
const PONTOS_FIXOS = PONTOS.filter((p) => p.dias);
const OUTRO = "__outro";

const $ = (s) => document.querySelector(s);

// ---------- utilidades ----------
const brl = (centavos) => {
  const [r, c] = (centavos / 100).toFixed(2).split(".");
  return "R$ " + r.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + c;
};
const virgula = (centavos) => (centavos / 100).toFixed(2).replace(".", ",");
const somaDias = (dia, n) => new Date(Date.parse(dia + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const dataCurta = (dia) => dia.slice(8, 10) + "/" + dia.slice(5, 7);
const diaSemana = (dia) => NOMES_DIA[diaDaData(dia)];
const dataLonga = (dia) => {
  const s = diaSemana(dia);
  return s[0].toUpperCase() + s.slice(1) + ", " + dataCurta(dia);
};
const plural = (n, um, varios) => n + " " + (n === 1 ? um : varios);
const validoIso = (d) => /^\d{4}-\d\d-\d\d$/.test(d || "") && !Number.isNaN(Date.parse(d + "T12:00:00Z"));

function h(tag, atributos, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos || {})) {
    if (v == null || v === false) continue;
    if (k === "texto") e.textContent = v;
    else if (k.startsWith("data-") || k.startsWith("aria-") || k === "type") e.setAttribute(k, v === true ? "" : v);
    else e[k] = v;
  }
  for (const f of filhos.flat()) if (f != null) e.append(f);
  return e;
}

async function api(metodo, caminho, corpo) {
  let r;
  try {
    r = await fetch(caminho, {
      method: metodo,
      headers: corpo ? { "content-type": "application/json" } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
      redirect: "manual",   // sessão vencida do Access vira redirecionamento pro login
    });
  } catch (e) {
    throw new Error("Sem conexão com o servidor. Nada foi alterado.");
  }
  const tipo = (r.headers && r.headers.get && r.headers.get("content-type")) || "";
  if (r.type === "opaqueredirect" || r.status === 401 || r.status === 403 || tipo.includes("text/html")) {
    throw new Error("Sua sessão expirou. Recarregue a página.");
  }
  let j = null;
  try { j = await r.json(); } catch (e) { /* resposta sem JSON */ }
  if (!r.ok) {
    const e = new Error((j && j.erro) || "O servidor recusou (erro " + r.status + "). Nada foi alterado.");
    e.dados = j || {};
    throw e;
  }
  return j;
}

// ---------- aviso ----------
let tAviso = null;
function aviso(texto, opcoes) {
  const el = $("#aviso");
  const o = opcoes || {};
  clearTimeout(tAviso);
  el.replaceChildren(h("span", { texto }));
  if (o.acao) el.append(h("button", { type: "button", texto: o.acao.rotulo, onclick: () => { avisoFora(); o.acao.fazer(); } }));
  el.classList.toggle("bom", !!o.bom);
  el.hidden = false;
  tAviso = setTimeout(avisoFora, o.bom ? 5000 : 9000);
}
function avisoFora() { clearTimeout(tAviso); $("#aviso").hidden = true; }

// ---------- estado ----------
// `dia` faz as vezes de hoje (hoje de verdade, ou o ?dia= do endereço).
// `escolhido` é o pedido que o dono tocou na fila pra ver em destaque; sem
// ele, o destaque é o primeiro da fila.
const estado = { dia: null, dados: null, escolhido: null, agenda: null, seq: 0, aba: "pedidos" };
const hoje = () => isoBrasilia(Date.now());

async function carregarDia(dia) {
  const meu = ++estado.seq;
  try {
    const j = await api("GET", "/api/painel/fila?dia=" + encodeURIComponent(dia));
    if (meu !== estado.seq) return false;
    estado.dados = j;
    estado.dia = j.dia;
    // ?dia só quando não é hoje: a aba que vira a meia-noite e o atalho na
    // tela do celular voltam pra hoje ao recarregar.
    try { history.replaceState(null, "", j.dia === hoje() ? location.pathname : "?dia=" + j.dia); } catch (e) { /* sem histórico */ }
    renderFila();
    document.body.dataset.pronto = j.dia;
    return true;
  } catch (e) {
    if (meu !== estado.seq) return false;
    aviso(e.message, { acao: { rotulo: "Tentar de novo", fazer: () => carregarDia(dia) } });
    return false;
  }
}
const irPara = (dia) => carregarDia(dia);

const itensTexto = (itens) => itens.map((i) => i.qtd + " " + (NOME_SABOR[i.sabor] || i.sabor)).join(", ");
const montadasTotal = (p) => p.itens.reduce((s, i) => s + (p.montadas[i.sabor] || 0), 0);

// Ordem da fila: dia de retirada, começo do horário, ordem de chegada.
const inicio = (janela) => {
  const m = /(\d{1,2})h(\d{2})?/.exec(janela || "");
  return m ? Number(m[1]) * 60 + Number(m[2] || 0) : 24 * 60;
};
const ordemFila = (a, b) => a.retirada < b.retirada ? -1 : a.retirada > b.retirada ? 1
  : (inicio(a.janela) - inicio(b.janela)) || (a.id - b.id);
const fila = () => [...estado.dados.fila].sort(ordemFila);

function nomeDoDia(dia) {
  const base = estado.dia;
  if (dia < base) return "Atrasado";
  if (dia === base) return "Hoje";
  if (dia === somaDias(base, 1)) return "Amanhã";
  return dataLonga(dia);
}

function renderFila() {
  $("#voltarHoje").hidden = estado.dia === hoje();
  const lista = fila();
  let destaque = lista.find((p) => p.id === estado.escolhido);
  if (!destaque) { estado.escolhido = null; destaque = lista[0] || null; }
  renderDestaque(destaque);
  renderFaltaMontar(destaque, lista);
  renderResto(lista.filter((p) => p !== destaque));
  renderPendencias(estado.dados.pendencias);
  renderSemData(estado.dados.semData || []);
  renderEntregues(estado.dados.entregues || []);
}

function menuMais(botoes) {
  return h("details", { className: "mais-acoes" }, h("summary", { "aria-label": "Mais ações", texto: "⋯" }), h("div", { className: "menu-acoes" }, botoes));
}
const botaoEditar = (p) => h("button", { type: "button", className: "btn suave", "data-acao": "editar", texto: "Editar", onclick: () => abrirForm(p) });
const botaoCancelar = (p, rotulo) => h("button", { type: "button", className: "btn perigo", "data-acao": "cancelar", texto: rotulo || "Cancelar pedido", onclick: (e) => cancelar(p, e.currentTarget) });

// O pedido grande da esquerda: o próximo da fila, ou o que o dono tocou.
function renderDestaque(p) {
  const el = $("#destaque");
  if (!p) {
    el.replaceChildren(h("div", { className: "fila-vazia" },
      h("b", { texto: "Nenhum pedido na fila." }),
      h("span", { texto: "Quando chegar pedido pelo site ele aparece em Novos. Pedido combinado na conversa entra pelo botão Novo pedido." })));
    return;
  }
  const quando = nomeDoDia(p.retirada);
  const onde = [p.retirada === estado.dia || p.retirada === somaDias(estado.dia, 1) ? dataCurta(p.retirada) : null, p.janela, p.ponto].filter(Boolean).join(" · ");
  const preco = plural(p.qtd, "esfiha", "esfihas") + " · " + brl(p.total_centavos) + (p.valor_manual ? " (valor combinado)" : "") +
    (p.cupom ? " · cupom " + p.cupom : "");
  el.replaceChildren(h("article", { className: "destaque", "data-id": String(p.id) },
    h("div", { className: "destaque-topo" },
      h("span", { className: "rotulo-fila", texto: estado.escolhido ? "Pedido escolhido" : "Próximo" }),
      h("span", { className: "quando" + (p.retirada < estado.dia ? " atrasado" : p.retirada === estado.dia ? " hoje" : ""), texto: quando }),
      estado.escolhido ? h("button", { type: "button", className: "link", "data-acao": "voltar-proximo", texto: "Voltar pro próximo", onclick: () => { estado.escolhido = null; renderFila(); } }) : null),
    h("h2", { className: "destaque-nome", texto: p.nome }),
    h("div", { className: "destaque-onde", texto: onde }),
    p.obs ? h("div", { className: "obs", texto: p.obs }) : null,
    h("ul", { className: "montagem", "aria-label": "Montagem por sabor" }, p.itens.map((i) => linhaSabor(p, i))),
    h("div", { className: "destaque-preco", texto: preco }),
    h("div", { className: "botoes destaque-botoes" },
      alternador(p, "pago", "Pago"),
      h("button", { type: "button", className: "btn cheio", "data-acao": "entregue", texto: "Entregue", onclick: (e) => entregar(p, e.currentTarget) }),
      menuMais([botaoEditar(p), botaoCancelar(p)])),
    formaPagamento(p)));
}

// Uma linha por sabor: montadas em preto, o pedido em cinza, barra e +1.
function linhaSabor(p, i) {
  const feitas = p.montadas[i.sabor] || 0;
  const pronto = feitas >= i.qtd;
  const nome = NOME_SABOR[i.sabor] || i.sabor;
  return h("li", { className: pronto ? "pronto" : "", "data-sabor": i.sabor },
    h("span", { className: "contador" }, h("b", { className: "feitas", texto: String(feitas) }), h("span", { className: "de", texto: "/" + i.qtd })),
    h("span", { className: "sabor" },
      h("span", { className: "nome-sabor", texto: nome + (pronto ? " ✓" : "") }),
      h("span", { className: "barrinha", "aria-hidden": "true" }, h("i", { style: "width:" + Math.round(100 * feitas / i.qtd) + "%" }))),
    h("button", { type: "button", className: "btn menos", "data-acao": "menos", "aria-label": "Tirar uma de " + nome, texto: "−", disabled: feitas === 0, onclick: () => montar(p, i.sabor, -1) }),
    h("button", { type: "button", className: "btn cheio mais1", "data-acao": "mais", "aria-label": "Montei mais uma de " + nome, texto: pronto ? "✓" : "+1", disabled: pronto, onclick: () => montar(p, i.sabor, 1) }));
}

// Quanto ainda falta montar no dia do pedido em destaque, por cliente.
function renderFaltaMontar(destaque, lista) {
  const el = $("#faltaMontar");
  if (!destaque) { el.hidden = true; return; }
  const doDia = lista.filter((p) => p.retirada === destaque.retirada);
  const linhas = doDia.map((p) => {
    const falta = p.itens.filter((i) => (p.montadas[i.sabor] || 0) < i.qtd)
      .map((i) => (i.qtd - (p.montadas[i.sabor] || 0)) + " " + (NOME_SABOR[i.sabor] || i.sabor));
    return falta.length ? h("li", { "data-id": String(p.id) }, h("b", { texto: p.nome }), h("span", { texto: falta.join(" · ") })) : null;
  }).filter(Boolean);
  const pra = nomeDoDia(destaque.retirada);
  const titulo = pra === "Atrasado" ? "Ainda falta montar dos atrasados" : "Ainda falta montar pra " + (pra === "Hoje" || pra === "Amanhã" ? pra.toLowerCase() : pra);
  el.hidden = false;
  el.replaceChildren(h("h3", { texto: titulo }),
    linhas.length ? h("ul", {}, linhas) : h("p", { className: "tudo-montado", texto: "Tudo montado." }));
}

// O resto da fila, por dia. Dia sem pedido não aparece.
function renderResto(lista) {
  $("#blocoFila").hidden = lista.length === 0;
  $("#nFila").textContent = String(lista.length);
  const grupos = [];
  for (const p of lista) {
    const nome = nomeDoDia(p.retirada);
    const g = grupos[grupos.length - 1];
    if (g && g.nome === nome) g.pedidos.push(p);
    else grupos.push({ nome, pedidos: [p] });
  }
  $("#filaDias").replaceChildren(...grupos.map((g) => h("div", { className: "grupo-dia" },
    h("h3", { texto: g.nome }),
    g.pedidos.map((p) => {
      const feitas = montadasTotal(p);
      return h("button", { type: "button", className: "item-fila", "data-id": String(p.id), onclick: () => { estado.escolhido = p.id; renderFila(); $("#destaque").scrollIntoView({ block: "nearest" }); } },
        h("span", { className: "item-quem" },
          h("b", { texto: p.nome }),
          h("small", { texto: [g.nome === "Atrasado" ? dataCurta(p.retirada) : null, p.janela, p.ponto].filter(Boolean).join(" · ") }),
          h("small", { className: "item-itens", texto: itensTexto(p.itens) })),
        h("span", { className: "item-conta" + (feitas >= p.qtd ? " pronto" : ""), texto: feitas ? feitas + " de " + p.qtd : String(p.qtd) }));
    }))));
}

function renderPendencias(todas) {
  const lista = todas.filter((p) => p.status === "aguardando" || p.status === "fora_da_regra");
  $("#blocoNovos").hidden = lista.length === 0;
  $("#nPendencias").textContent = String(lista.length);
  $("#pendencias").replaceChildren(...lista.map((p) => {
    const motivo = p.status === "aguardando" ? "Pelo site" : (MOTIVOS[p.motivo] || "Fora da regra");
    return cartao(p, {
      pendencia: true,
      topo: h("div", { className: "motivo", texto: motivo }),
      botoes: [
        h("button", { type: "button", className: "btn cheio", "data-acao": "confirmar", texto: "Aceitar", onclick: (e) => mudar(p, { status: "confirmado" }, e.currentTarget) }),
        botaoCancelar(p, "Recusar"),
        menuMais([botaoEditar(p)]),
      ],
    });
  }));
}

// Confirmados que ainda não têm dia de retirada (ponto combinado na conversa).
function renderSemData(lista) {
  $("#blocoSemData").hidden = lista.length === 0;
  $("#nSemData").textContent = String(lista.length);
  $("#semData").replaceChildren(...lista.map((p) => cartao(p, {
    pendencia: true,
    botoes: [alternador(p, "pago", "Pago"), alternador(p, "entregue", "Entregue"), menuMais([botaoEditar(p), botaoCancelar(p)])],
    depois: formaPagamento(p),
  })));
}

// Entregues de hoje em diante e os de antes que ficaram sem pagar.
function renderEntregues(lista) {
  const el = $("#blocoEntregues");
  el.hidden = lista.length === 0;
  const semPagar = lista.filter((p) => !p.pago).length;
  $("#resumoEntregues").textContent = plural(lista.length, "entregue", "entregues") + (semPagar ? ", " + semPagar + " sem pagar" : "");
  if (semPagar) el.open = true;
  $("#entregues").replaceChildren(...lista.map((p) => cartao(p, {
    topo: p.pago ? null : h("div", { className: "motivo", texto: "Falta pagar" }),
    botoes: [alternador(p, "pago", "Pago"),
      h("button", { type: "button", className: "btn suave", "data-acao": "voltar-fila", texto: "Voltar pra fila", onclick: (e) => mudar(p, { entregue: false }, e.currentTarget) })],
    depois: formaPagamento(p),
  })));
}

function alternador(p, campo, rotulo) {
  const forma = campo === "pago" && p.pago && p.pagamento ? " · " + (FORMAS.find((f) => f[0] === p.pagamento) || [, ""])[1] : "";
  return h("button", {
    type: "button", className: "btn" + (p[campo] ? " marcado" : ""), "data-acao": campo,
    "aria-pressed": p[campo] ? "true" : "false", texto: rotulo + forma,
    onclick: (e) => mudar(p, campo === "pago" && p.pago ? { pago: false, pagamento: null } : { [campo]: !p[campo] }, e.currentTarget),
  });
}

// Depois de marcar Pago: como pagou, pra descontar a taxa do cartão nas contas.
const FORMAS = [["pix", "Pix"], ["debito", "Débito"], ["credito", "Crédito"]];
function formaPagamento(p) {
  if (!p.pago || p.status !== "confirmado" || p.pagamento) return null;
  return h("div", { className: "forma pergunta", role: "group", "aria-label": "Como pagou" },
    h("span", { texto: "Como pagou?" }),
    FORMAS.map(([v, rotulo]) => h("button", {
      type: "button", className: "btn mini", "data-acao": "pagamento-" + v, "aria-pressed": "false", texto: rotulo,
      onclick: (e) => mudar(p, { pagamento: v }, e.currentTarget),
    })));
}

function cartao(p, o) {
  const dinheiro = brl(p.total_centavos) + (p.valor_manual ? " (valor combinado)" : "");
  const onde = o.pendencia
    ? [p.ponto, p.retirada ? dataLonga(p.retirada) : "sem data", p.janela].filter(Boolean).join(", ")
    : p.janela;
  return h("article", {
    className: "cartao" + (o.pendencia ? " pendencia" : "") + (p.status === "cancelado" ? " cancelado" : "") + (p.entregue && p.status === "confirmado" ? " entregue-ok" : ""),
    "data-id": String(p.id),
  },
    o.topo,
    h("div", { className: "linha1" },
      h("span", { className: "quem" }, p.nome, p.status === "cancelado" ? h("span", { className: "etiqueta", texto: "Cancelado" }) : null),
      h("span", { className: "dinheiro", texto: dinheiro })),
    h("div", { className: "itens", texto: itensTexto(p.itens) }),
    onde ? h("div", { className: "detalhe", texto: onde }) : null,
    p.cupom ? h("div", { className: "detalhe", texto: "Cupom " + p.cupom + (p.desconto_centavos ? " (menos " + brl(p.desconto_centavos) + ")" : "") }) : null,
    p.obs ? h("div", { className: "obs", texto: p.obs }) : null,
    h("div", { className: "botoes" }, o.botoes),
    o.depois || null);
}

// ---------- histórico ----------
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (mes) => { const m = MESES[Number(mes.slice(5, 7)) - 1]; return m[0].toUpperCase() + m.slice(1) + " de " + mes.slice(0, 4); };
let historico = null, mesAberto = null;

async function carregarHistorico() {
  try {
    historico = await api("GET", "/api/painel/historico");
    mesAberto = mesAberto || historico.hoje.slice(0, 7);
    renderHistorico();
    document.body.dataset.historico = "pronto";
  } catch (e) {
    aviso(e.message, { acao: { rotulo: "Tentar de novo", fazer: carregarHistorico } });
  }
}

function linhaContas(rotulo, c, extra) {
  return h("tr", extra || {},
    h("td", {}, rotulo), h("td", { texto: String(c.esfihas) }), h("td", { texto: brl(c.bruto) }),
    h("td", { texto: "− " + brl(c.ingredientes) }), h("td", { texto: "− " + brl(c.embalagem) }),
    h("td", { texto: c.taxa ? "− " + brl(c.taxa) : brl(0) }), h("td", { className: "liq", texto: brl(c.liquido) }));
}
const cabecalho = (primeira) => h("tr", {}, [primeira, "Esfihas", "Bruto", "Ingredientes e luz", "Marmitas", "Taxa cartão", "Líquido"].map((t) => h("th", { texto: t })));

function renderHistorico() {
  const H = historico;
  const doMes = H.meses.find((m) => m.mes === mesAberto) || { esfihas: 0, bruto: 0, liquido: 0, pedidos: 0, ingredientes: 0, embalagem: 0, taxa: 0 };
  const quadro = (rot, c) => h("div", { className: "quadro" },
    h("div", { className: "rot", texto: rot }),
    h("div", { className: "grande", texto: brl(c.liquido) + " líquido" }),
    h("div", { className: "det", texto: brl(c.bruto) + " bruto · " + plural(c.esfihas, "esfiha", "esfihas") + " · " + plural(c.pedidos, "pedido", "pedidos") }),
    c.pagos_sem_forma ? h("div", { className: "det alerta", texto: plural(c.pagos_sem_forma, "pedido pago", "pedidos pagos") + " sem a forma marcada: a taxa pode estar faltando" }) : null);
  $("#quadros").replaceChildren(
    quadro("Desde o começo", H.total),
    quadro(nomeMes(mesAberto), doMes),
    h("div", { className: "quadro" },
      h("div", { className: "rot", texto: "Média por esfiha" }),
      h("div", { className: "grande", texto: H.total.esfihas ? brl(Math.round(H.total.liquido / H.total.esfihas)) : brl(0) }),
      h("div", { className: "det", texto: "de líquido em cada esfiha vendida" })));

  const dias = H.dias.filter((d) => d.dia.startsWith(mesAberto)).sort((a, b) => a.dia < b.dia ? -1 : 1);
  $("#tituloMes").textContent = nomeMes(mesAberto) + ", dia a dia";
  $("#tabelaDias").replaceChildren(cabecalho("Dia"),
    ...(dias.length ? dias.map((d) => linhaContas(dataLonga(d.dia), d)) : [h("tr", {}, h("td", { colSpan: 7, texto: "Nenhuma venda neste mês ainda." }))]),
    ...(dias.length ? [linhaContas("Total do mês", doMes, { className: "total" })] : []));

  $("#blocoMeses").hidden = !H.meses.some((m) => m.mes !== mesAberto);
  if (H.custos) {
    const c = H.custos, pct = (bp) => (bp / 100).toFixed(2).replace(".", ",") + "%";
    $("#dicaCustos").textContent = "Conta os pedidos confirmados com retirada até hoje. Custo estimado: " + brl(c.esfiha_centavos) +
      " de ingredientes e luz por esfiha, uma marmita de " + brl(c.marmita_centavos) + " a cada " + c.esfihas_por_marmita +
      " esfihas do pedido e a taxa do Tap (" + pct(c.taxa_bp.debito) + " no débito, " + pct(c.taxa_bp.credito) + " no crédito) nos pedidos pagos no cartão. Sua hora não entra.";
  }
  $("#tabelaMeses").replaceChildren(cabecalho("Mês"), ...H.meses.map((m) =>
    linhaContas(h("button", { type: "button", className: "mes", "aria-current": m.mes === mesAberto ? "true" : "false", texto: nomeMes(m.mes), onclick: () => { mesAberto = m.mes; renderHistorico(); } }), m)),
    linhaContas("Desde o começo", H.total, { className: "total" }));
}

function abrirAba(qual) {
  estado.aba = qual;
  $("#telaPedidos").hidden = qual !== "pedidos";
  $("#telaHistorico").hidden = qual !== "historico";
  $("#abaPedidos").setAttribute("aria-pressed", qual === "pedidos" ? "true" : "false");
  $("#abaHistorico").setAttribute("aria-pressed", qual === "historico" ? "true" : "false");
  if (qual === "historico") carregarHistorico();
}

// ---------- ações sobre um pedido ----------
const ocupados = new Set();
async function mudar(p, campos, botao) {
  if (ocupados.has(p.id)) return false;
  ocupados.add(p.id);
  if (botao) botao.disabled = true;
  let ok = false, lotado = null;
  try {
    const novo = await api("PATCH", "/api/painel/pedidos/" + p.id, campos);
    Object.assign(p, novo);
    ok = true;
  } catch (e) {
    if (botao) botao.disabled = false;
    if (e.dados && e.dados.lotado) lotado = e.message;
    else aviso(e.message);
  } finally {
    ocupados.delete(p.id);
  }
  if (lotado) {
    if (confirm(lotado + "\n\nConfirmar mesmo assim?")) return mudar(p, { ...campos, forcar: true }, botao);
    return false;
  }
  if (ok) await recarregarQuieto();   // a fila muda de lugar com Entregue, Aceitar etc.
  return ok;
}

async function entregar(p, botao) {
  if (await mudar(p, { entregue: true }, botao)) {
    aviso("Entregue: " + p.nome + ".", { bom: true, acao: { rotulo: "Desfazer", fazer: () => mudar(p, { entregue: false }) } });
  }
}

// "+1" muda a tela na hora e junta os toques: quem monta aperta várias vezes
// seguidas, e esperar o servidor a cada toque perderia cliques.
const montando = new Map();   // "id|sabor" -> { p, sabor, delta }
let tMontar = null;
function montar(p, sabor, delta) {
  const item = p.itens.find((i) => i.sabor === sabor);
  const atual = p.montadas[sabor] || 0;
  const novo = Math.max(0, Math.min(item.qtd, atual + delta));
  if (novo === atual) return;
  p.montadas = { ...p.montadas, [sabor]: novo };
  const chave = p.id + "|" + sabor;
  const m = montando.get(chave) || { p, sabor, delta: 0 };
  m.delta += novo - atual;
  montando.set(chave, m);
  renderFila();
  clearTimeout(tMontar);
  tMontar = setTimeout(enviarMontadas, 500);
}
async function enviarMontadas() {
  const lote = [...montando.values()].filter((m) => m.delta);
  montando.clear();
  let falhou = null;
  await Promise.all(lote.map(async (m) => {
    try {
      const novo = await api("PATCH", "/api/painel/pedidos/" + m.p.id, { montar: { sabor: m.sabor, delta: m.delta } });
      // Toque que chegou durante o envio ainda vai somar por cima.
      const pendente = montando.get(m.p.id + "|" + m.sabor);
      m.p.montadas = { ...novo.montadas, [m.sabor]: novo.montadas[m.sabor] + (pendente ? pendente.delta : 0) };
    } catch (e) { falhou = e; }
  }));
  if (falhou) {
    aviso("Não salvei a contagem de montadas. " + falhou.message);
    await carregarDia(estado.dia);
  } else if (!montando.size) {
    renderFila();
    document.body.dataset.montadas = String(Date.now());
  }
}

// Uma leitura mais velha nunca sobrescreve uma mais nova, um clique em
// andamento nem um +1 que ainda não foi pro servidor.
async function recarregarQuieto() {
  const meu = ++estado.seq;
  try {
    const j = await api("GET", "/api/painel/fila?dia=" + encodeURIComponent(estado.dia));
    if (meu !== estado.seq || ocupados.size || montando.size) return;
    estado.dados = j;
    renderFila();
  } catch (e) {
    if (meu === estado.seq) aviso("Salvei, mas não consegui atualizar a tela. Recarregue a página.");
  }
}
function cancelar(p, botao) {
  if (!confirm("Cancelar o pedido de " + p.nome + "?")) return;
  mudar(p, { status: "cancelado" }, botao);
}

// ---------- formulário ----------
const form = $("#form");
let editando = null;      // pedido em edição, ou null pro novo
let valorEditado = false;
let pediuCalculo = false; // clicou em "Usar o cálculo" numa edição com valor combinado
const chaveItens = (itens) => JSON.stringify([...itens].sort((a, b) => a.sabor < b.sabor ? -1 : 1).map((i) => [i.sabor, i.qtd]));

function montarFormulario() {
  $("#fQtds").replaceChildren(...SABORES.map((s) =>
    h("div", { className: "campo" },
      h("label", { htmlFor: "fq-" + s.id, texto: s.nome }),
      h("input", { id: "fq-" + s.id, type: "number", "data-sabor": s.id, min: "0", max: "200", step: "1", inputMode: "numeric", placeholder: "0" }))));
  $("#fPonto").replaceChildren(
    ...PONTOS_FIXOS.map((p) => h("option", { value: p.nome, texto: p.nome })),
    h("option", { value: OUTRO, texto: "Outro" }));
  for (const e of form.querySelectorAll("#fQtds input")) e.addEventListener("input", recalcular);
  $("#fCupom").addEventListener("input", consultarCupom);
  $("#fValor").addEventListener("input", () => { valorEditado = true; dicaValor(); });
  $("#fPonto").addEventListener("change", () => { $("#campoPontoOutro").hidden = $("#fPonto").value !== OUTRO; });
  $("#fUsarCalculo").addEventListener("click", () => { valorEditado = false; pediuCalculo = true; recalcular(); });
}

// Cupons: a lista fica no servidor. Aqui só se guarda o que ele respondeu pra
// mostrar a prévia; na hora de salvar quem decide é o servidor de novo.
const cupons = new Map();   // código em maiúsculas -> fração, ou 0 se não existe
let tCupom = null;
function consultarCupom() {
  clearTimeout(tCupom);
  const cod = $("#fCupom").value.trim().toUpperCase();
  if (!cod || cupons.has(cod)) return recalcular();
  tCupom = setTimeout(async () => {
    try {
      const r = await fetch("/api/cupom?codigo=" + encodeURIComponent(cod), { redirect: "manual" });
      if (r.status === 404) cupons.set(cod, 0);
      else if (r.ok) cupons.set(cod, (await r.json()).pct || 0);
      else return;
    } catch (e) { return; }
    if ($("#fCupom").value.trim().toUpperCase() === cod) recalcular();
  }, 250);
}

const qtdsForm = () => SABORES.map((s) => ({ sabor: s.id, qtd: parseInt($("#fq-" + s.id).value, 10) || 0 })).filter((i) => i.qtd > 0);

function calculo() {
  const qtd = qtdsForm().reduce((s, i) => s + i.qtd, 0);
  if (!qtd) return 0;
  const bruto = precoCentavos(qtd).total;
  const pct = cupons.get($("#fCupom").value.trim().toUpperCase()) || 0;
  return bruto - Math.round(bruto * pct);
}
function recalcular() {
  if (!valorEditado) $("#fValor").value = calculo() ? virgula(calculo()) : "";
  dicaValor();
}
function dicaValor() {
  const c = calculo();
  $("#fValorDica").textContent = valorEditado
    ? "Valor digitado por você." + (c ? " O cálculo daria R$ " + virgula(c) + "." : "")
    : (c ? "Calculado pelas quantidades e pelo cupom." : "Preenche sozinho quando você põe as quantidades.");
  $("#fUsarCalculo").hidden = !valorEditado;
}

function abrirForm(p) {
  editando = p || null;
  idEnvio = null;   // cada abertura do formulário é um pedido novo
  $("#formTitulo").textContent = p ? "Editar pedido Nº " + p.id : "Novo pedido";
  $("#fSalvar").textContent = p ? "Salvar mudanças" : "Salvar pedido";
  $("#fErro").hidden = true;
  $("#fNome").value = p ? p.nome : "";
  for (const s of SABORES) {
    const item = p && p.itens.find((i) => i.sabor === s.id);
    $("#fq-" + s.id).value = item ? String(item.qtd) : "";
  }
  const dia = p ? (p.retirada || estado.dia) : estado.dia;
  const nomePonto = p ? p.ponto : ((PONTOS_FIXOS.find((x) => x.dias.includes(diaDaData(dia))) || {}).nome || OUTRO);
  const conhecido = PONTOS_FIXOS.some((x) => x.nome === nomePonto);
  $("#fPonto").value = conhecido ? nomePonto : OUTRO;
  $("#campoPontoOutro").hidden = conhecido;
  $("#fPontoOutro").value = conhecido ? "" : (p ? p.ponto : "");
  $("#fDia").value = dia;
  $("#fJanela").value = p && p.janela ? p.janela : "";
  $("#fCupom").value = p && p.cupom ? p.cupom : "";
  $("#fObs").value = p && p.obs ? p.obs : "";
  valorEditado = !!(p && p.valor_manual);
  pediuCalculo = false;
  if (p && p.cupom) consultarCupom();
  if (p) $("#fValor").value = virgula(p.total_centavos);
  recalcular();
  if (p && !valorEditado) $("#fValor").value = virgula(p.total_centavos);
  form.showModal();
  $("#fNome").focus();
}

function erroForm(texto) {
  $("#fErro").textContent = texto;
  $("#fErro").hidden = false;
  $("#fErro").scrollIntoView({ block: "nearest" });
}

let salvando = false;
let idEnvio = null;
async function salvar(ev) {
  ev.preventDefault();
  if (salvando) return;
  $("#fErro").hidden = true;
  const nome = $("#fNome").value.trim();
  const itens = qtdsForm();
  const ponto = $("#fPonto").value === OUTRO ? $("#fPontoOutro").value.trim() : $("#fPonto").value;
  const dia = $("#fDia").value;
  if (!nome) return erroForm("Falta o nome.");
  if (!itens.length) return erroForm("Ponha a quantidade de pelo menos um sabor.");
  if (!ponto) return erroForm("Falta dizer o ponto.");
  if (!validoIso(dia)) return erroForm("Falta o dia.");
  const cupom = $("#fCupom").value.trim() || null;
  const corpo = {
    nome, ponto, retirada: dia,
    janela: $("#fJanela").value.trim() || null,
    obs: $("#fObs").value.trim() || null,
  };
  // Numa edição, itens e cupom só vão se mudaram: mandar de novo refaria o
  // total ao preço de hoje (e barraria um cupom que já saiu do ar).
  const mesmosItens = editando && chaveItens(itens) === chaveItens(editando.itens);
  const mesmoCupom = editando && (cupom || "").toUpperCase() === (editando.cupom || "").toUpperCase();
  if (!editando || !mesmosItens) corpo.itens = itens;
  if (!editando || !mesmoCupom) corpo.cupom = cupom;
  if (valorEditado) {
    const txt = $("#fValor").value.trim().replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(txt)) return erroForm("O valor precisa ser um número, como 56,16.");
    corpo.valor_manual = true;
    corpo.total_centavos = Math.round(parseFloat(txt) * 100);
  } else if (editando && editando.valor_manual && pediuCalculo) {
    corpo.valor_manual = false;
  }
  return salvarCorpo(corpo);
}

async function salvarCorpo(corpo) {
  salvando = true;
  $("#fSalvar").disabled = true;
  try {
    let salvo;
    if (editando) {
      salvo = await api("PATCH", "/api/painel/pedidos/" + editando.id, corpo);
    } else {
      idEnvio = idEnvio || crypto.randomUUID();   // toque duplo não duplica o pedido
      corpo.id_envio = idEnvio;
      salvo = await api("POST", "/api/painel/pedidos", corpo);
      idEnvio = null;
    }
    form.close();
    aviso("Pedido Nº " + salvo.id + " salvo: " + brl(salvo.total_centavos) + ".", { bom: true });
    await carregarDia(estado.dia);
  } catch (e) {
    if (e.dados && e.dados.lotado && !corpo.forcar && confirm(e.message + "\n\nSalvar mesmo assim?")) {
      salvando = false;
      $("#fSalvar").disabled = false;
      corpo.forcar = true;
      return salvarCorpo(corpo);
    }
    erroForm(e.message);
  } finally {
    salvando = false;
    $("#fSalvar").disabled = false;
  }
}

// ---------- agenda ----------
function renderAgenda() {
  const a = estado.agenda;
  if (document.activeElement !== $("#limite")) $("#limite").value = String(a.limite);
  const pausa = $("#pausar");
  pausa.setAttribute("aria-pressed", a.pausado ? "true" : "false");
  pausa.textContent = a.pausado ? "Voltar a aceitar pedidos" : "Pausar pedidos";
  pausa.classList.toggle("marcado", a.pausado);
  $("#dicaPausa").textContent = a.pausado ? "Pausado: os pedidos do site chegam como pendência." : "Aberto: o site aceita pedidos normalmente.";
  $("#bloqueios").replaceChildren(...(a.bloqueios.length ? a.bloqueios.map((b) =>
    h("li", { "data-dia": b.dia },
      h("span", { texto: dataLonga(b.dia) + (b.motivo ? ", " + b.motivo : "") }),
      h("button", { type: "button", className: "btn suave", texto: "Liberar", "aria-label": "Liberar " + dataCurta(b.dia), onclick: (e) => salvarAgenda({ bloqueios: a.bloqueios.filter((x) => x.dia !== b.dia) }, e.currentTarget) })))
    : [h("li", { className: "nenhum" }, h("span", { texto: "Nenhum dia bloqueado." }))]));
}

async function salvarAgenda(campos, botao, marca) {
  if (botao) botao.disabled = true;
  try {
    estado.agenda = await api("PUT", "/api/painel/agenda", campos);
    renderAgenda();
    document.body.dataset.agenda = marca || "ok";
    return true;
  } catch (e) {
    aviso(e.message);
    return false;
  } finally {
    if (botao) botao.disabled = false;
  }
}

async function carregarAgenda() {
  try {
    estado.agenda = await api("GET", "/api/painel/agenda");
    renderAgenda();
  } catch (e) {
    aviso("Não consegui ler a agenda. " + e.message);
  }
}

// ---------- ligações ----------
function ligar() {
  $("#abaPedidos").addEventListener("click", () => abrirAba("pedidos"));
  $("#voltarHoje").addEventListener("click", () => irPara(hoje()));
  document.addEventListener("click", (e) => {
    for (const d of document.querySelectorAll("details.mais-acoes[open]")) if (!d.contains(e.target)) d.open = false;
  });
  $("#abaHistorico").addEventListener("click", () => abrirAba("historico"));
  $("#novo").addEventListener("click", () => abrirForm(null));
  $("#fFechar").addEventListener("click", () => form.close());
  $("#formPedido").addEventListener("submit", salvar);

  $("#salvarLimite").addEventListener("click", async (e) => {
    const n = Number($("#limite").value);
    if (!Number.isInteger(n) || n < 1 || n > 10000) return aviso("O limite precisa ser um número de 1 a 10000.");
    if (await salvarAgenda({ limite: n }, e.currentTarget, "limite-" + n)) aviso("Limite do dia: " + n + " esfihas.", { bom: true });
  });
  $("#pausar").addEventListener("click", (e) => salvarAgenda({ pausado: !estado.agenda.pausado }, e.currentTarget, "pausa"));
  $("#bloquear").addEventListener("click", async (e) => {
    const dia = $("#bloqDia").value;
    if (!validoIso(dia)) return aviso("Escolha o dia a bloquear.");
    const motivo = $("#bloqMotivo").value.trim();
    const resto = estado.agenda.bloqueios.filter((b) => b.dia !== dia);
    if (await salvarAgenda({ bloqueios: [...resto, { dia, motivo: motivo || null }] }, e.currentTarget, "bloqueio")) {
      $("#bloqDia").value = "";
      $("#bloqMotivo").value = "";
    }
  });
}

montarFormulario();
ligar();
const pedido = new URLSearchParams(location.search).get("dia");
carregarDia(validoIso(pedido) ? pedido : hoje());
carregarAgenda();
