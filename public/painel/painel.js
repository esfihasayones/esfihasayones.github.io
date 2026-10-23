// Painel do dia. Lê e grava só pela API em /api/painel; nada de cliente fica
// no navegador. Preço, sabores e pontos vêm de /regras.js, mas quem manda no
// valor é o servidor: depois de salvar, a tela mostra o que ele devolveu.
import { SABORES, PONTOS, NOMES_DIA, isoBrasilia, diaDaData, precoCentavos } from "../regras.js";

const MOTIVOS = {
  cedo: "Pediu com menos antecedência que o mínimo",
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
  if (!r.ok) throw new Error((j && j.erro) || "O servidor recusou (erro " + r.status + "). Nada foi alterado.");
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
// `dia` é a coluna do meio (hoje, ou o ?dia= do endereço); `dia2` é a da
// direita, que começa no dia seguinte e troca quando se clica em "Mais pra frente".
const estado = { dia: null, dia2: null, dados: null, dados2: null, agenda: null, seq: 0, aba: "pedidos" };
const hoje = () => isoBrasilia(Date.now());

async function buscar(dia, dia2) {
  const [j, j2] = await Promise.all([
    api("GET", "/api/painel/pedidos?dia=" + encodeURIComponent(dia)),
    api("GET", "/api/painel/pedidos?dia=" + encodeURIComponent(dia2)),
  ]);
  return { j, j2 };
}

async function carregarDia(dia, dia2) {
  const meu = ++estado.seq;
  const segundo = dia2 && dia2 > dia ? dia2 : somaDias(dia, 1);
  try {
    const { j, j2 } = await buscar(dia, segundo);
    if (meu !== estado.seq) return false;
    estado.dados = j;
    estado.dados2 = j2;
    estado.dia = j.dia;
    estado.dia2 = j2.dia;
    try { history.replaceState(null, "", "?dia=" + j.dia); } catch (e) { /* sem histórico */ }
    renderDia();
    document.body.dataset.pronto = j.dia;
    $("#situacao").textContent = "";
    return true;
  } catch (e) {
    if (meu !== estado.seq) return false;
    aviso(e.message, { acao: { rotulo: "Tentar de novo", fazer: () => carregarDia(dia, dia2) } });
    return false;
  }
}
const irPara = (dia) => carregarDia(dia);
const verDia = (dia2) => carregarDia(estado.dia, dia2);

// ---------- desenho ----------
const itensTexto = (itens) => itens.map((i) => i.qtd + " " + (NOME_SABOR[i.sabor] || i.sabor)).join(", ");
const confirmadosDe = (d) => d.pontos.flatMap((p) => p.pedidos).filter((p) => p.status === "confirmado");

function tituloDia(dia) {
  const amanha = somaDias(hoje(), 1);
  const nome = dia === hoje() ? "Hoje" : dia === amanha ? "Amanhã" : null;
  return (nome ? nome + " · " : "") + dataLonga(dia);
}

function renderDia() {
  renderColuna(estado.dados, "#nomeDia", "#resumoDia", "#sabores", "#pontos", true);
  renderColuna(estado.dados2, "#nomeDia2", "#resumoDia2", "#sabores2", "#pontos2", false);
  renderPendencias(estado.dados.pendencias);
  renderSemData(estado.dados.semData || []);
  renderProximos(estado.dados.proximos);
}

function renderColuna(d, sNome, sResumo, sSabores, sPontos, principal) {
  const confirmados = confirmadosDe(d);
  const esfihas = confirmados.reduce((s, p) => s + p.qtd, 0);
  const dinheiro = confirmados.reduce((s, p) => s + p.total_centavos, 0);
  $(sNome).textContent = tituloDia(d.dia);
  $(sResumo).replaceChildren(
    h("b", { id: principal ? "totalEsfihas" : null, texto: String(esfihas) }), " esfihas" + (dinheiro ? " · " + brl(dinheiro) : ""));
  $(sSabores).replaceChildren(...SABORES.map((s) =>
    h("li", { "data-sabor": s.id }, h("span", { className: "n", texto: String(d.porSabor[s.id] || 0) }), h("span", { className: "rotulo", texto: s.nome }))));
  renderPontos(d, sPontos);
}

function menuMais(botoes) {
  return h("details", { className: "mais-acoes" }, h("summary", { "aria-label": "Mais ações", texto: "⋯" }), h("div", { className: "menu-acoes" }, botoes));
}
const botaoEditar = (p) => h("button", { type: "button", className: "btn suave", "data-acao": "editar", texto: "Editar", onclick: () => abrirForm(p) });
const botaoCancelar = (p, rotulo) => h("button", { type: "button", className: "btn perigo", "data-acao": "cancelar", texto: rotulo || "Cancelar pedido", onclick: (e) => cancelar(p, e.currentTarget) });

function renderPendencias(lista) {
  $("#nPendencias").textContent = String(lista.length);
  $("#semPendencias").hidden = lista.length > 0;
  $("#pendencias").replaceChildren(...lista.map((p) => {
    const motivo = p.status === "aguardando" ? "Chegou pelo site" : (MOTIVOS[p.motivo] || "Fora da regra");
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

function renderPontos(d, seletor) {
  const grupos = d.pontos
    .map((g) => ({ ponto: g.ponto, pedidos: g.pedidos.filter((p) => p.status === "confirmado" || p.status === "cancelado") }))
    .filter((g) => g.pedidos.length);
  if (!grupos.length) {
    $(seletor).replaceChildren(h("p", { className: "vazio", texto: "Nenhum pedido pra este dia." }));
    return;
  }
  $(seletor).replaceChildren(...grupos.map((g) => {
    const ativos = g.pedidos.filter((p) => p.status === "confirmado");
    const total = ativos.reduce((s, p) => s + p.qtd, 0);
    return h("div", { className: "ponto-grupo", "data-ponto": g.ponto },
      h("h3", {}, g.ponto, h("span", { texto: plural(total, "esfiha", "esfihas") + ", " + plural(ativos.length, "pedido", "pedidos") })),
      g.pedidos.map((p) => {
        if (p.status === "cancelado") {
          return cartao(p, {
            botoes: [
              h("button", { type: "button", className: "btn", "data-acao": "reativar", texto: "Reativar", onclick: (e) => mudar(p, { status: "confirmado" }, e.currentTarget) }),
              menuMais([botaoEditar(p)]),
            ],
          });
        }
        return cartao(p, {
          botoes: [alternador(p, "pago", "Pago"), alternador(p, "entregue", "Entregue"), menuMais([botaoEditar(p), botaoCancelar(p)])],
          depois: formaPagamento(p),
        });
      }));
  }));
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

// Só os dias que têm pedido, e sempre o dia seguinte pra poder voltar a ele.
function renderProximos(lista) {
  const seguinte = somaDias(estado.dia, 1);
  const dias = lista.filter((x) => x.pedidos || x.dia === seguinte);
  $("#proximos").replaceChildren(...dias.map((x) =>
    h("li", {}, h("button", {
      type: "button", className: "proximo", "data-dia": x.dia, "aria-pressed": x.dia === estado.dia2 ? "true" : "false",
      onclick: () => verDia(x.dia),
    },
      h("b", { texto: tituloDia(x.dia) }),
      h("span", { texto: x.pedidos ? plural(x.qtd, "esfiha", "esfihas") + ", " + plural(x.pedidos, "pedido", "pedidos") : "sem pedidos" }),
      x.nomes ? h("small", { className: "nomes", texto: x.nomes }) : null))));
  if (!lista.some((x) => x.pedidos && x.dia !== seguinte)) $("#proximos").append(h("li", { className: "nada", texto: "Nenhum outro dia com pedido na semana." }));
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
    h("td", { texto: rotulo }), h("td", { texto: String(c.esfihas) }), h("td", { texto: brl(c.bruto) }),
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
    h("div", { className: "det", texto: brl(c.bruto) + " bruto · " + plural(c.esfihas, "esfiha", "esfihas") + " · " + plural(c.pedidos, "pedido", "pedidos") }));
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
    dias.length ? linhaContas("Total do mês", doMes, { className: "total" }) : null);

  $("#blocoMeses").hidden = H.meses.length < 2;
  $("#tabelaMeses").replaceChildren(cabecalho("Mês"), ...H.meses.map((m) =>
    linhaContas(nomeMes(m.mes), m, { className: "clicavel", "aria-current": m.mes === mesAberto ? "true" : "false", onclick: () => { mesAberto = m.mes; renderHistorico(); } })),
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
  if (ocupados.has(p.id)) return;
  ocupados.add(p.id);
  if (botao) botao.disabled = true;
  let ok = false;
  try {
    const novo = await api("PATCH", "/api/painel/pedidos/" + p.id, campos);
    Object.assign(p, novo);
    renderDia();           // com o que o servidor devolveu
    ok = true;
  } catch (e) {
    if (botao) botao.disabled = false;
    aviso(e.message);
  } finally {
    ocupados.delete(p.id);
  }
  if (ok) await recarregarQuieto();   // colunas, totais e próximos dias
}
// Uma leitura mais velha nunca sobrescreve uma mais nova nem um clique em andamento.
async function recarregarQuieto() {
  const meu = ++estado.seq;
  try {
    const { j, j2 } = await buscar(estado.dia, estado.dia2);
    if (meu !== estado.seq || ocupados.size) return;
    estado.dados = j;
    estado.dados2 = j2;
    renderDia();
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
  $("#fUsarCalculo").addEventListener("click", () => { valorEditado = false; recalcular(); });
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
  const corpo = {
    nome, itens, ponto, retirada: dia,
    janela: $("#fJanela").value.trim() || null,
    cupom: $("#fCupom").value.trim() || null,
    obs: $("#fObs").value.trim() || null,
  };
  if (valorEditado) {
    const txt = $("#fValor").value.trim().replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(txt)) return erroForm("O valor precisa ser um número, como 56,16.");
    corpo.valor_manual = true;
    corpo.total_centavos = Math.round(parseFloat(txt) * 100);
  } else if (editando) {
    corpo.valor_manual = false;
  }
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
    if (salvo.retirada && salvo.retirada > estado.dia) await verDia(salvo.retirada);
    else if (salvo.retirada && salvo.retirada < estado.dia) await irPara(salvo.retirada);
    else await carregarDia(estado.dia, estado.dia2);
  } catch (e) {
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
    : [h("li", {}, h("span", { texto: "Nenhum dia bloqueado." }))]));
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
