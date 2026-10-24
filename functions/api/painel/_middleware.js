const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const VALIDADE_CHAVES_MS = 5 * 60 * 1000;

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const json = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

// Busca as chaves públicas do time no Access e guarda por alguns minutos.
// `buscar` é injetável pra os testes não saírem pra rede.
function carregadorDeChaves(buscar) {
  let cache = null;
  return async function chaves(env, agora, forcar) {
    const vale = cache && cache.equipe === env.ACCESS_EQUIPE && agora - cache.em < VALIDADE_CHAVES_MS;
    // `forcar` é pra kid desconhecido (rotação de chave do Access), mas não
    // mais que uma busca a cada 10 s, senão vira jeito de martelar o endpoint.
    if (vale && (!forcar || agora - cache.em < 10000)) return cache.mapa;
    const r = await buscar(`https://${env.ACCESS_EQUIPE}.cloudflareaccess.com/cdn-cgi/access/certs`);
    if (!r.ok) throw new Error("certs indisponíveis");
    const { keys } = await r.json();
    const mapa = new Map();
    for (const k of keys || []) {
      if (k.kty !== "RSA") continue;
      mapa.set(k.kid, await crypto.subtle.importKey("jwk", { kty: k.kty, n: k.n, e: k.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
    }
    cache = { equipe: env.ACCESS_EQUIPE, em: agora, mapa };
    return mapa;
  };
}

// Quem entra no painel: os e-mails de DONO_EMAIL, separados por vírgula (o
// dono e quem ele liberar, como quem entrega). Cada um também precisa estar
// na política do Access, senão nem chega ao login.
const emailsLiberados = (env) => String(env.DONO_EMAIL || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);

// Confere o JWT do Access: assinatura RS256, aud, exp e e-mail liberado.
async function tokenValido(token, env, chaves, agora) {
  const partes = token.split(".");
  if (partes.length !== 3) return false;
  const cab = json(partes[0]);
  if (cab.alg !== "RS256") return false;
  let chave = (await chaves(env, agora)).get(cab.kid);
  if (!chave) chave = (await chaves(env, agora, true)).get(cab.kid);
  if (!chave) return false;
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", chave, b64url(partes[2]), new TextEncoder().encode(partes[0] + "." + partes[1]));
  if (!ok) return false;
  const c = json(partes[1]);
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(env.ACCESS_AUD)) return false;
  if (typeof c.exp !== "number" || c.exp * 1000 <= agora) return false;
  return typeof c.email === "string" && emailsLiberados(env).includes(c.email.trim().toLowerCase());
}

// Só quem está em DONO_EMAIL entra. Em produção o Cloudflare Access faz o login e manda um
// JWT assinado, que é conferido aqui (um cabeçalho de e-mail sozinho seria
// falsificável em hostname sem Access, como o *.pages.dev).
// DEV_SEM_LOGIN=1 existe só pra desenvolvimento local.
export function criarMiddleware({ buscar = (u) => fetch(u), agora = () => Date.now() } = {}) {
  const chaves = carregadorDeChaves(buscar);
  return async function onRequest({ request, env, next }) {
    // O atalho de desenvolvimento só vale em máquina local, mesmo que a
    // variável vaze pra um deploy.
    const url = new URL(request.url);
    const host = url.hostname;
    // Escrita só da própria origem: página de outro site, no navegador do dono
    // logado, não cria nem muda pedido. Cliente sem navegador (teste, curl) não
    // manda estes cabeçalhos e segue pra conferência do JWT.
    if (request.method !== "GET" && request.method !== "HEAD") {
      const sfs = request.headers.get("Sec-Fetch-Site");
      const origem = request.headers.get("Origin");
      const outraOrigem = sfs ? (sfs !== "same-origin" && sfs !== "none") : (!!origem && origem !== url.origin);
      if (outraOrigem) {
        return Response.json({ erro: "origem recusada" }, { status: 403, headers: cabecalhos });
      }
      if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
        return Response.json({ erro: "esperava JSON" }, { status: 415, headers: cabecalhos });
      }
    }
    let liberado = env.DEV_SEM_LOGIN === "1" && (host === "localhost" || host === "127.0.0.1");
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!liberado && token && String(env.DONO_EMAIL || "").trim() && env.ACCESS_EQUIPE && env.ACCESS_AUD) {
      try { liberado = await tokenValido(token, env, chaves, agora()); } catch (e) { liberado = false; }
    }
    if (!liberado) return Response.json({ erro: "proibido" }, { status: 403, headers: cabecalhos });

    let r;
    try { r = await next(); } catch (e) {
      return Response.json({ erro: "erro interno" }, { status: 500, headers: cabecalhos });
    }
    const copia = new Response(r.body, r);   // a resposta original pode ter cabeçalhos imutáveis
    for (const [k, v] of Object.entries(cabecalhos)) copia.headers.set(k, v);
    return copia;
  };
}

export const onRequest = criarMiddleware();
