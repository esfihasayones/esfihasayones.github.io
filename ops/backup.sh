#!/usr/bin/env bash
# Baixa uma cópia do banco de pedidos em backups/AAAA-MM-DD.sql (a pasta não vai pro git).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p backups
SAIDA="backups/$(date +%F).sql"
echo "==> Exportando o banco esfihas-pedidos para $SAIDA"
npx --yes wrangler@4.152.0 d1 export esfihas-pedidos --remote --output "$SAIDA"
echo "Pronto. Guarde esse arquivo fora deste computador também: ele tem nomes de clientes."
