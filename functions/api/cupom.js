import { cupomDe, CUPOM_DIVULGADO, SO_PRIMEIRA_COMPRA } from "../_lib/cupons.js";

// O site pergunta aqui se o cupom existe; a lista fica só no servidor.
// Com ?divulgado=1, responde o cupom que o aviso do canto oferece.
export async function onRequestGet({ request }) {
  const busca = new URL(request.url).searchParams;
  const codigo = busca.has("divulgado") ? CUPOM_DIVULGADO : busca.get("codigo");
  const c = cupomDe(codigo);
  if (!c) return Response.json({ erro: "nao_existe" }, { status: 404 });
  return Response.json({ ...c, so_primeira: SO_PRIMEIRA_COMPRA.includes(c.codigo) });
}
