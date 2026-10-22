const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

// Só o dono entra. Em produção o Cloudflare Access faz o login e injeta o
// e-mail no cabeçalho; DEV_SEM_LOGIN=1 existe só pra desenvolvimento local.
export async function onRequest({ request, env, next }) {
  const dono = String(env.DONO_EMAIL || "").trim().toLowerCase();
  const quem = String(request.headers.get("Cf-Access-Authenticated-User-Email") || "").trim().toLowerCase();
  const liberado = env.DEV_SEM_LOGIN === "1" || (dono !== "" && quem === dono);

  if (!liberado) return Response.json({ erro: "proibido" }, { status: 403, headers: cabecalhos });

  const r = await next();
  const copia = new Response(r.body, r);   // a resposta original pode ter cabeçalhos imutáveis
  for (const [k, v] of Object.entries(cabecalhos)) copia.headers.set(k, v);
  return copia;
}
