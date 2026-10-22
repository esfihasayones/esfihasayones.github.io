export const BASE = process.env.BASE || "http://127.0.0.1:8788";

export async function pedir(caminho, opcoes) {
  return fetch(BASE + caminho, opcoes);
}

// O painel local roda com DEV_SEM_LOGIN=1 (.dev.vars), que libera /api/painel sem
// JWT do Access. A verificação do JWT é coberta por painel-acesso.test.mjs.
export function comoDono(opcoes) {
  return opcoes || {};
}
