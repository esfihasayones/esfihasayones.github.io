import { validarCampos, montar, serializar, erro, resposta, lerJson } from "../../../_lib/painel.js";

const EDITAVEIS = ["status", "pago", "pagamento", "entregue", "nome", "itens", "ponto", "retirada", "janela", "obs", "cupom",
  "qtd", "unit_centavos", "total_centavos", "desconto_centavos", "valor_manual", "motivo"];

export async function onRequestPatch({ request, env, params }) {
  if (!/^\d+$/.test(String(params.id))) return erro("pedido não encontrado", 404);
  const atual = await env.DB.prepare("SELECT * FROM pedidos WHERE id = ?").bind(Number(params.id)).first();
  if (!atual) return erro("pedido não encontrado", 404);

  const v = validarCampos(await lerJson(request));
  if (v.erro) return erro(v.erro);

  const l = montar(atual, v.campos);
  l.atualizado_em = new Date().toISOString();
  const cols = [...EDITAVEIS, "atualizado_em"];
  await env.DB.prepare(`UPDATE pedidos SET ${cols.map((c) => c + " = ?").join(", ")} WHERE id = ?`)
    .bind(...cols.map((c) => l[c]), atual.id).run();
  const novo = await env.DB.prepare("SELECT * FROM pedidos WHERE id = ?").bind(atual.id).first();
  return resposta(serializar(novo));
}
