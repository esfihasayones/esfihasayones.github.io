// Custos estimados pras contas do painel. Mudou o preço de algo? É aqui.
// A hora do dono não entra (decisão dele em 23/10/2026).
export const CUSTOS = {
  // massa, recheio e luz da air fryer por esfiha (conta de 21/10/2026, sem a embalagem)
  esfiha_centavos: 205,
  // bandeja de alumínio de 2000 ml: 100 por R$ 170 em 28/10/2026; cabem 8 no máximo
  // (antes era a de 1100 ml, 10 por R$ 21)
  marmita_centavos: 170,
  esfihas_por_marmita: 8,
  // Tap do Mercado Pago, em centésimos de por cento
  taxa_bp: { pix: 0, debito: 89, credito: 309 },
};

// Contas de uma lista de pedidos confirmados ({qtd, total_centavos, pago, pagamento}).
// Cada pedido vai em marmita própria, então a embalagem arredonda pra cima por pedido.
export function contas(pedidos) {
  const c = { pedidos: 0, esfihas: 0, marmitas: 0, bruto: 0, ingredientes: 0, embalagem: 0, taxa: 0, pago: 0, pagos_sem_forma: 0 };
  for (const p of pedidos) {
    c.pedidos++;
    c.esfihas += p.qtd;
    c.bruto += p.total_centavos;
    const m = Math.ceil(p.qtd / CUSTOS.esfihas_por_marmita);
    c.marmitas += m;
    c.ingredientes += p.qtd * CUSTOS.esfiha_centavos;
    c.embalagem += m * CUSTOS.marmita_centavos;
    if (p.pago) {
      c.pago += p.total_centavos;
      if (p.pagamento) c.taxa += Math.round(p.total_centavos * CUSTOS.taxa_bp[p.pagamento] / 10000);
      else c.pagos_sem_forma++;
    }
  }
  c.liquido = c.bruto - c.ingredientes - c.embalagem - c.taxa;
  return c;
}
