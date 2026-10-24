import { lerAgenda } from "../_lib/agenda.js";
import { isoBrasilia } from "../../public/regras.js";

const DIAS = 30;

// O que o site precisa pra não oferecer dia que não vai ser aceito.
// Nunca sai quantidade, nome, contagem nem o motivo do bloqueio.
// `qtd` é o tamanho do pedido que o cliente está montando: o dia aparece
// lotado quando esse pedido não cabe mais nele, e o site recusa antes de
// abrir o WhatsApp. Sem `qtd`, vale 1 (o dia que já chegou no limite).
export async function onRequestGet({ env, request }) {
  const n = parseInt(new URL(request.url).searchParams.get("qtd"), 10);
  const qtd = Number.isInteger(n) ? Math.min(Math.max(n, 1), 800) : 1;
  const agora = Date.now();
  const de = isoBrasilia(agora);
  const ate = isoBrasilia(agora + (DIAS - 1) * 86400000);   // Brasília não tem horário de verão
  const a = await lerAgenda(env.DB, de, ate);

  const indisponiveis = {};
  // Mesma conta do avaliar(): o que já está no dia mais este pedido.
  for (const [dia, q] of a.ocupado) if (q + qtd > a.limite) indisponiveis[dia] = "lotado";
  for (const dia of a.bloqueados) indisponiveis[dia] = "bloqueado";   // bloqueio vale mais que lotado

  return Response.json({ pausado: a.pausado, indisponiveis }, { headers: { "cache-control": "no-store" } });
}
