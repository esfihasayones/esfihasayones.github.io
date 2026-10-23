import { isoBrasilia } from "../../../public/regras.js";
import { dataIsoValida, texto } from "../../_lib/pedido.js";
import { contas } from "../../_lib/custos.js";
import { validarCampos, montar, serializar, vazioSabores, erro, resposta, lerJson } from "../../_lib/painel.js";

const DIA_MS = 86400000;
const somaDias = (dia, n) => new Date(Date.parse(dia + "T12:00:00Z") + n * DIA_MS).toISOString().slice(0, 10);

const COLUNAS = ["id_envio", "criado_em", "origem", "status", "motivo", "nome", "itens", "qtd", "unit_centavos", "total_centavos",
  "cupom", "desconto_centavos", "valor_manual", "ponto", "retirada", "janela", "obs", "pago", "pagamento", "entregue"];

export async function onRequestGet({ request, env }) {
  const agora = Date.now();
  const hoje = isoBrasilia(agora);
  const pedido = new URL(request.url).searchParams.get("dia");
  const dia = pedido == null ? hoje : pedido;
  if (!dataIsoValida(dia)) return erro("dia inválido");

  const de = somaDias(dia, 1), ate = somaDias(dia, 7);
  // As quatro consultas vão num lote só: o banco fica na América do Norte e
  // cada ida e volta saindo do Brasil custa mais de 100 ms.
  const mes = dia.slice(0, 7);
  const [doDia, pend, sd, px, doMes] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM pedidos WHERE retirada = ? ORDER BY id").bind(dia),
    env.DB.prepare(
      "SELECT * FROM pedidos WHERE status IN ('aguardando','fora_da_regra') AND (retirada IS NULL OR retirada >= ?) " +
      "ORDER BY retirada IS NULL, retirada, id").bind(hoje),
    // Confirmados sem data de retirada (ex.: "Combinar outro ponto"): sem isto
    // sumiriam do painel depois de Confirmar.
    env.DB.prepare("SELECT * FROM pedidos WHERE status = 'confirmado' AND retirada IS NULL AND entregue = 0 ORDER BY id"),
    env.DB.prepare(
      "SELECT retirada, SUM(qtd) AS q, COUNT(*) AS n, GROUP_CONCAT(nome, ', ') AS nomes, SUM(CASE WHEN pago = 1 AND entregue = 1 THEN 0 ELSE 1 END) AS falta FROM pedidos WHERE status = 'confirmado' AND retirada BETWEEN ? AND ? GROUP BY retirada")
      .bind(de, ate),
    env.DB.prepare("SELECT qtd, total_centavos, pago, pagamento FROM pedidos WHERE status = 'confirmado' AND retirada BETWEEN ? AND ?")
      .bind(mes + "-01", mes + "-31"),
  ]);
  const porSabor = vazioSabores();
  // Um grupo por ponto; dentro dele os cancelados vão pro fim.
  const grupos = new Map();
  for (const r of doDia.results) {
    const p = serializar(r);
    if (r.status === "confirmado") for (const i of p.itens) porSabor[i.sabor] += i.qtd;
    if (!grupos.has(r.ponto)) grupos.set(r.ponto, []);
    grupos.get(r.ponto).push(p);
  }
  const pontos = [...grupos].map(([ponto, lista]) => ({
    ponto,
    pedidos: [...lista.filter((p) => p.status !== "cancelado"), ...lista.filter((p) => p.status === "cancelado")],
  }));

  const mapa = new Map(px.results.map((r) => [r.retirada, r]));
  const proximos = [];
  for (let i = 1; i <= 7; i++) {
    const d = somaDias(dia, i);
    const m = mapa.get(d);
    proximos.push({ dia: d, qtd: m ? m.q : 0, pedidos: m ? m.n : 0, falta: m ? m.falta : 0, nomes: m ? m.nomes : null });
  }

  const confirmadosDia = doDia.results.filter((r) => r.status === "confirmado");
  const financas = { dia: contas(confirmadosDia), mes: { mes, ...contas(doMes.results) } };
  return resposta({ dia, porSabor, pontos, pendencias: pend.results.map(serializar), semData: sd.results.map(serializar), proximos, financas });
}

// Pedido manual: entra confirmado e sem checar regra de data, ponto livre.
export async function onRequestPost({ request, env }) {
  const c = await lerJson(request);
  const v = validarCampos(c);
  if (v.erro) return erro(v.erro);
  const f = v.campos;
  delete f.status;
  if (!f.nome) return erro("nome inválido");
  if (!f.itens) return erro("itens inválidos");
  if (!f.ponto) return erro("ponto inválido");
  if (c.id_envio != null && !texto(c.id_envio, 64, 1)) return erro("id_envio inválido");

  if (c.id_envio) {
    const ja = await env.DB.prepare("SELECT * FROM pedidos WHERE id_envio = ?").bind(c.id_envio).first();
    if (ja) return resposta(serializar(ja), 200);
  }

  const base = {
    id_envio: c.id_envio || null, criado_em: new Date().toISOString(), origem: "manual", status: "confirmado", motivo: null,
    itens: "[]", cupom: null, desconto_centavos: 0, valor_manual: 0, retirada: null, janela: null, obs: null, pago: 0, pagamento: null, entregue: 0,
  };
  const l = montar(base, f);
  const r = await env.DB.prepare(`INSERT INTO pedidos (${COLUNAS.join(",")}) VALUES (${COLUNAS.map(() => "?").join(",")})`)
    .bind(...COLUNAS.map((k) => l[k])).run();
  const novo = await env.DB.prepare("SELECT * FROM pedidos WHERE id = ?").bind(r.meta.last_row_id).first();
  return resposta(serializar(novo), 201);
}
