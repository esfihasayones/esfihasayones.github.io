// O public/_headers só vale pra arquivo estático: resposta de Function saía
// sem nosniff nem HSTS. Aqui entram os cabeçalhos pra tudo em /api/*.
export async function onRequest({ next }) {
  const r = await next();
  const copia = new Response(r.body, r);   // a resposta original pode ter cabeçalhos imutáveis
  copia.headers.set("X-Content-Type-Options", "nosniff");
  copia.headers.set("Strict-Transport-Security", "max-age=31536000");
  copia.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!copia.headers.has("Cache-Control")) copia.headers.set("Cache-Control", "no-store");
  return copia;
}
