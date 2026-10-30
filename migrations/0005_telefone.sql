-- Telefone do cliente, só os dígitos com DDD (ex.: 48999990000). É por ele que
-- se sabe se alguém já usou um cupom: o nome muda fácil, o número não.
-- Pedidos de antes desta coluna ficam com NULL.
ALTER TABLE pedidos ADD COLUMN telefone TEXT;
CREATE INDEX idx_pedidos_telefone ON pedidos (telefone);
