import { validarCampos, montar, serializar, mudancas, erro, resposta, lerJson } from "../../../_lib/painel.js";
import { lerAgenda } from "../../../_lib/agenda.js";
import { isoBrasilia } from "../../../../public/regras.js";

const EDITAVEIS = ["status", "pago", "pagamento", "entregue", "nome", "itens", "ponto", "retirada", "janela", "obs", "cupom",
  "qtd", "unit_centavos", "total_centavos", "desconto_centavos", "valor_manual", "motivo"];

export async function onRequestPatch({ request, env, params }) {
  if (!/^\d+$/.test(String(params.id))) return erro("pedido não encontrado", 404);
  const atual = await env.DB.prepare("SELECT * FROM pedidos WHERE id = ?").bind(Number(params.id)).first();
  if (!atual) return erro("pedido não encontrado", 404);

  const c = await lerJson(request);
  const v = validarCampos(c);
  if (v.erro) return erro(v.erro);

  const l = montar(atual, v.campos);
  // Pedido sem data (ponto combinado na conversa) entregue em mãos: a data
  // da retirada passa a ser hoje, senão ele some das colunas e do histórico.
  if (l.entregue && !l.retirada) l.retirada = isoBrasilia(Date.now());

  // Confirmar num dia que já passou do limite: avisa, e só grava com `forcar`.
  if (l.status === "confirmado" && atual.status !== "confirmado" && l.retirada && c.forcar !== true) {
    const a = await lerAgenda(env.DB, l.retirada, l.retirada);
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
  const novo = await env.DB.prepare("SELECT * FROM pedidos WHERE id = ?").bind(atual.id).first();
  return resposta(serializar(novo));
}
