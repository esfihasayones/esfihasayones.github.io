-- Quantas esfihas de cada sabor já foram montadas, pra lista da cozinha no
-- painel. JSON {sabor: n}; NULL é nada montado ainda.
ALTER TABLE pedidos ADD COLUMN montadas TEXT;
