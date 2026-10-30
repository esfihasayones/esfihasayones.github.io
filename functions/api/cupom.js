import { cupomDe, CUPOM_DIVULGADO, SO_PRIMEIRA_COMPRA } from "../_lib/cupons.js";
import { cupomJaUsado } from "../_lib/uso-cupom.js";
import { telefoneLimpo } from "../../public/regras.js";

// O site pergunta aqui se o cupom existe; a lista fica só no servidor.
// Com ?divulgado=1, responde o cupom que o aviso do canto oferece.
// Com &telefone=..., diz também se esse telefone já gastou o cupom (`usado`).
export async function onRequestGet({ request, env }) {
  const busca = new URL(request.url).searchParams;
  const codigo = busca.has("divulgado") ? CUPOM_DIVULGADO : busca.get("codigo");
  const c = cupomDe(codigo);
  if (!c) return Response.json({ erro: "nao_existe" }, { status: 404 });
  const corpo = { ...c, so_primeira: SO_PRIMEIRA_COMPRA.includes(c.codigo) };
  const tel = telefoneLimpo(busca.get("telefone") || "");
  if (tel) corpo.usado = await cupomJaUsado(env.DB, tel, c.codigo);
  return Response.json(corpo);
}
