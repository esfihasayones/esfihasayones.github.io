-- Como o pedido foi pago, pra descontar a taxa do cartão nas contas do painel.
ALTER TABLE pedidos ADD COLUMN pagamento TEXT CHECK (pagamento IN ('pix', 'debito', 'credito'));
