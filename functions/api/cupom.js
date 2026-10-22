import { cupomDe } from "../_lib/cupons.js";

// O site pergunta aqui se o cupom existe; a lista fica só no servidor.
export async function onRequestGet({ request }) {
  const codigo = new URL(request.url).searchParams.get("codigo");
  const c = cupomDe(codigo);
  if (!c) return Response.json({ erro: "nao_existe" }, { status: 404 });
  return Response.json(c);
}
