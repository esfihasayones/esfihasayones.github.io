#!/usr/bin/env bash
# Tira os dados pessoais dos pedidos com mais de 12 meses (nome, observação e
# observação de cada item). Rodar no começo de cada mês.
# Uso: ops/anonimizar.sh [--local]   (padrão: banco de produção)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ONDE="--remote"
[ "${1:-}" = "--local" ] && ONDE="--local"

# Cada item perde só o campo obs; sabor e qtd ficam. Só mexe em quem ainda não foi anonimizado.
SQL="UPDATE pedidos
SET nome = 'cliente ' || id,
    obs = NULL,
    itens = (SELECT COALESCE(json_group_array(json(json_remove(value, '\$.obs'))), '[]') FROM json_each(pedidos.itens))
WHERE criado_em < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-12 months')
  AND (nome <> 'cliente ' || id OR obs IS NOT NULL OR itens LIKE '%\"obs\"%');"

echo "==> Anonimizando pedidos com mais de 12 meses (${ONDE#--})"
npx --yes wrangler@4.152.0 d1 execute esfihas-pedidos "$ONDE" --command "$SQL"
