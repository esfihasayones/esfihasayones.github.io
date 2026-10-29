import { sincronizarCartao } from "../../../_lib/cartoes.js";
import { validarCampos, montar, serializar, mudancas, erro, resposta, lerJson, COLUNAS_PEDIDO } from "../../../_lib/painel.js";
import { lerAgenda } from "../../../_lib/agenda.js";
import { isoBrasilia } from "../../../../public/regras.js";

const EDITAVEIS = ["status", "pago", "pagamento", "entregue", "nome", "itens", "ponto", "retirada", "janela", "obs", "cupom",
  "qtd", "unit_centavos", "total_centavos", "desconto_centavos", "valor_manual", "motivo"];

export async function onRequestPatch({ request, env, params }) {
  if (!/^\d+$/.test(String(params.id))) return erro("pedido não encontrado", 404);
  const atual = await env.DB.prepare("SELECT " + COLUNAS_PEDIDO + " FROM pedidos WHERE id = ?").bind(Number(params.id)).first();
  if (!atual) return erro("pedido não encontrado", 404);

  const c = await lerJson(request);
  if (c && typeof c === "object" && "montar" in c) return montar1(env, atual, c.montar);
  const v = validarCampos(c);
  if (v.erro) return erro(v.erro);

  const l = montar(atual, v.campos);
  // Pedido sem data (ponto combinado na conversa) entregue em mãos: a data
  // da retirada passa a ser hoje, senão ele some das colunas e do histórico.
  if (l.entregue && !l.retirada) l.retirada = isoBrasilia(Date.now());

  // Confirmar num dia que já passou do limite: avisa, e só grava com `forcar`.
  if (l.status === "confirmado" && atual.status !== "confirmado" && l.retirada && c.forcar !== true) {
    const a = await lerAgenda(env.DB, l.retirada, l.retirada, atual.id);
    const ocupado = a.ocupado.get(l.retirada) || 0;
    if (ocupado + l.qtd > a.limite) {
      return resposta({ erro: `Esse dia já tem ${ocupado} esfihas e o limite é ${a.limite}; com este pedido vai a ${ocupado + l.qtd}.`,
        lotado: true, ocupado, limite: a.limite }, 409);
    }
  }

  // Só as colunas que mudaram: dois cliques quase juntos (Pago num aparelho,
  // Entregue no outro) não desfazem um ao outro.
  const cols = mudancas(atual, l, EDITAVEIS);
  if (cols.length) {
    l.atualizado_em = new Date().toISOString();
    cols.push("atualizado_em");
    await env.DB.prepare(`UPDATE pedidos SET ${cols.map((k) => k + " = ?").join(", ")} WHERE id = ?`)
      .bind(...cols.map((k) => l[k]), atual.id).run();
  }
  // Aceito com 4 ou mais ganha cartão; cancelado devolve.
  if (cols.includes("status") || cols.includes("qtd")) await sincronizarCartao(env.DB, atual.id);
  const novo = await env.DB.prepare("SELECT " + COLUNAS_PEDIDO + " FROM pedidos WHERE id = ?").bind(atual.id).first();
  return resposta(serializar(novo));
}

// "+1" da cozinha: soma `delta` às montadas de um sabor, entre zero e o que o
// pedido tem. A conta é feita no próprio UPDATE, então dois aparelhos
// apertando juntos não perdem um clique.
async function montar1(env, atual, m) {
  if (!m || typeof m !== "object" || typeof m.sabor !== "string" || !Number.isInteger(m.delta) || Math.abs(m.delta) > 1000) {
    return erro("montar inválido");
  }
  const item = JSON.parse(atual.itens).find((i) => i.sabor === m.sabor);
  if (!item) return erro("o pedido não tem esse sabor");
  const caminho = "$." + m.sabor;
  await env.DB.prepare(
    "UPDATE pedidos SET montadas = json_set(COALESCE(montadas, '{}'), ?1, " +
    "MAX(0, MIN(?2, COALESCE(json_extract(montadas, ?1), 0) + ?3))) WHERE id = ?4")
    .bind(caminho, item.qtd, m.delta, atual.id).run();
  const novo = await env.DB.prepare("SELECT " + COLUNAS_PEDIDO + " FROM pedidos WHERE id = ?").bind(atual.id).first();
  return resposta(serializar(novo));
}
