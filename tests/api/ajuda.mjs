export const BASE = process.env.BASE || "http://127.0.0.1:8788";

export async function pedir(caminho, opcoes) {
  return fetch(BASE + caminho, opcoes);
}

// Acrescenta o cabeçalho que o Cloudflare Access injeta depois do login do dono.
export function comoDono(opcoes) {
  const o = opcoes || {};
  return {
    ...o,
    headers: {
      ...(o.headers || {}),
      "Cf-Access-Authenticated-User-Email": "brenojulianom@gmail.com",
    },
  };
}
