import { lerAgenda } from "../_lib/agenda.js";
import { isoBrasilia } from "../../public/regras.js";

const DIAS = 30;

// O que o site precisa pra não oferecer dia que não vai ser aceito.
// Nunca sai quantidade, nome, contagem nem o motivo do bloqueio.
export async function onRequestGet({ env }) {
  const agora = Date.now();
  const de = isoBrasilia(agora);
  const ate = isoBrasilia(agora + (DIAS - 1) * 86400000);   // Brasília não tem horário de verão
  const a = await lerAgenda(env.DB, de, ate);

  const indisponiveis = {};
  // Um dia só aparece lotado quando já chegou no limite. Um pedido novo é
  // recusado quando soma + a quantidade dele passa do limite (ver avaliar),
  // então um dia com folga pra um pedido pequeno fica aberto no calendário
  // e o servidor decide na hora de gravar.
  for (const [dia, q] of a.ocupado) if (q >= a.limite) indisponiveis[dia] = "lotado";
  for (const dia of a.bloqueados) indisponiveis[dia] = "bloqueado";   // bloqueio vale mais que lotado

  return Response.json({ pausado: a.pausado, indisponiveis }, { headers: { "cache-control": "no-store" } });
}
