-- Cartões de fidelidade: um por pedido de 4 ou mais, cinco valem um combo
-- com 4 esfihas. O código impresso é sorteado (não dá pra inventar um que
-- valha) e, trocado, não vale de novo. `lote` é a leva impressa junta.
CREATE TABLE cartoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  lote INTEGER NOT NULL,
  criado_em TEXT NOT NULL,
  trocado_em TEXT,
  -- Pedido que levou o cartão. Aceito um pedido de 4 ou mais, ele recebe o
  -- primeiro cartão livre, na ordem de impressão. Sem pedido, o cartão não vale.
  pedido_id INTEGER REFERENCES pedidos(id)
);

CREATE INDEX idx_cartoes_lote ON cartoes (lote);
CREATE UNIQUE INDEX idx_cartoes_pedido ON cartoes (pedido_id) WHERE pedido_id IS NOT NULL;
