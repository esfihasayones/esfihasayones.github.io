// Cupons aceitos. O valor é a fração de desconto sobre o total com combo.
export const CUPONS = { PRIMEIRACOMPRA: 0.10 };
// O cupom que o site oferece no aviso do canto; null desliga o aviso.
export const CUPOM_DIVULGADO = "PRIMEIRACOMPRA";

export function cupomDe(codigo) {
  if (typeof codigo !== "string") return null;
  const c = codigo.trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(CUPONS, c)) return null;
  return { codigo: c, pct: CUPONS[c] };
}
