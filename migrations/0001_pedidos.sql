CREATE TABLE pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_envio TEXT UNIQUE,
  criado_em TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('site', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('aguardando', 'confirmado', 'cancelado', 'fora_da_regra')),
  motivo TEXT,
  nome TEXT NOT NULL,
  itens TEXT NOT NULL, -- JSON [{sabor,qtd,obs}]
  qtd INTEGER NOT NULL,
  unit_centavos INTEGER NOT NULL,
  total_centavos INTEGER NOT NULL,
  cupom TEXT,
  desconto_centavos INTEGER NOT NULL DEFAULT 0,
  valor_manual INTEGER NOT NULL DEFAULT 0,
  ponto TEXT NOT NULL,
  retirada TEXT, -- AAAA-MM-DD ou NULL
  janela TEXT,
  obs TEXT,
  pago INTEGER NOT NULL DEFAULT 0,
  entregue INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT
);

CREATE INDEX idx_pedidos_retirada_status ON pedidos (retirada, status);

CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

INSERT INTO config (chave, valor) VALUES ('limite_dia', '80'), ('pausado', '0');

CREATE TABLE bloqueios (
  dia TEXT PRIMARY KEY,
  motivo TEXT
);
