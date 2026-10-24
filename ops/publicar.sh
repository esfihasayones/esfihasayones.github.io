#!/usr/bin/env bash
# Testa e publica o site no Cloudflare Pages.
# Uso: ops/publicar.sh [--so-testar] [--rapido | --completo]
#   --so-testar  roda só as verificações e os testes, sem tocar na conta do Cloudflare.
#   (padrão)     API + testes de navegador, menos a varredura aleatória.
#   --rapido     API + só os testes do painel. Pra mudança que só mexe no painel.
#   --completo   inclui a varredura de 8 mil casos. Use ao mexer em preço, ponto,
#                horário ou feriado; ela pesa e derruba o Chromium com pouca memória.
# Variável RAMO: ramo do Pages (padrão main, que é a produção).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
WRANGLER="npx --yes wrangler@4.152.0"
SO_TESTAR=0
FILTRO="?sem=Varredura"
for a in "$@"; do
  case "$a" in
    --so-testar) SO_TESTAR=1 ;;
    --rapido) FILTRO="?grupo=Painel" ;;
    --completo) FILTRO="" ;;
    *) echo "opção desconhecida: $a" >&2; exit 2 ;;
  esac
done

dizer() { printf '\n==> %s\n' "$*"; }
falhar() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

dizer "Conferindo que nada de teste ou de segredo vai no deploy"
# Arquivo oculto (.DS_Store, .env, .dev.vars) subiria junto, mesmo ignorado pelo git.
SOBRA="$(find public \( -path '*/tests' -o -path '*/tests/*' -o -name '.*' \) ! -name . ! -path public -print)"
[ -z "$SOBRA" ] || falhar "arquivos que não podem ir ao ar dentro de public/: $SOBRA"
# DEV_SEM_LOGIN só pode ser lido do ambiente, nunca fixado no código.
if grep -rnE 'DEV_SEM_LOGIN' functions public | grep -vE 'env\.DEV_SEM_LOGIN|^[^:]*:[0-9]+:\s*//'; then
  falhar "DEV_SEM_LOGIN aparece fora de env.DEV_SEM_LOGIN (linhas acima)."
fi
if grep -rnE 'DEV_SEM_LOGIN\s*[:=]\s*["'"'"']?1' functions public | grep -vE '^[^:]*:[0-9]+:\s*//'; then
  falhar "DEV_SEM_LOGIN fixado em 1 no código."
fi
# Uma [vars] no wrangler.toml iria pro ar com o deploy.
if grep -n 'DEV_SEM_LOGIN' wrangler.toml; then
  falhar "wrangler.toml menciona DEV_SEM_LOGIN (iria pro ar)."
fi
echo "Nada indevido em public/ e DEV_SEM_LOGIN só vem do ambiente."

dizer "Conferindo o repositório"
RAMO_GIT="$(git symbolic-ref --short -q HEAD || true)"
[ -n "$RAMO_GIT" ] || falhar "o repositório está sem branch (HEAD solto). Entre numa branch."
[ -z "$(git status --porcelain)" ] || falhar "há mudanças sem commit. Faça commit antes de publicar."
echo "Branch $RAMO_GIT, árvore limpa."

PIDS=()
encerrar() {
  for p in "${PIDS[@]:-}"; do
    [ -n "$p" ] && kill -- "-$p" 2>/dev/null || true
  done
}
trap encerrar EXIT

esperar() { # url, nome
  for _ in $(seq 1 90); do
    curl -fsS -o /dev/null "$1" 2>/dev/null && return 0
    sleep 1
  done
  falhar "$2 não subiu em 90 segundos ($1)."
}

for porta in 8788 8792; do
  if curl -s -o /dev/null "http://127.0.0.1:$porta/" 2>/dev/null; then
    falhar "a porta $porta já está em uso. Encerre o servidor que está nela."
  fi
done

dizer "Preparando o banco local e subindo os servidores de teste"
$WRANGLER d1 migrations apply esfihas-pedidos --local >/dev/null
setsid $WRANGLER pages dev --port 8788 --local >/tmp/publicar-wrangler.log 2>&1 &
PIDS+=("$!")
setsid node tests/servidor.mjs >/tmp/publicar-servidor.log 2>&1 &
PIDS+=("$!")
esperar "http://127.0.0.1:8788/api/saude" "O wrangler pages dev"
esperar "http://127.0.0.1:8792/tests/index.html" "O servidor de testes"

dizer "Rodando a suíte de API"
node --test --test-concurrency=1 'tests/api/*.test.mjs'

dizer "Rodando a suíte de navegador (Chromium${FILTRO:+, $FILTRO})"
RESULTADO="$(node tests/rodar-playwright.cjs chromium "http://127.0.0.1:8792/tests/index.html$FILTRO")"
echo "$RESULTADO" | head -c 1500; echo
echo "$RESULTADO" | grep -qE '"pronto": true' || falhar "a suíte de navegador não terminou."
TOTAL="$(echo "$RESULTADO" | grep -oE '"total": [0-9]+' | grep -oE '[0-9]+' | head -1)"
[ -n "$TOTAL" ] && [ "$TOTAL" -ge 10 ] || falhar "a suíte de navegador rodou só ${TOTAL:-0} testes; o filtro ($FILTRO) está errado?"
FALHOU="$(echo "$RESULTADO" | grep -oE '"falhou": [0-9]+' | grep -oE '[0-9]+' | head -1)"
[ -n "$FALHOU" ] || falhar "não consegui ler o resultado da suíte de navegador."
[ "$FALHOU" -eq 0 ] || falhar "a suíte de navegador teve $FALHOU falha(s)."

dizer "Encerrando os servidores de teste"
encerrar
PIDS=()

if [ "$SO_TESTAR" -eq 1 ]; then
  dizer "Tudo passou. Modo --so-testar: nada foi enviado ao Cloudflare."
  exit 0
fi

dizer "Aplicando as migrações no banco de produção (D1)"
$WRANGLER d1 migrations apply esfihas-pedidos --remote

dizer "Publicando no Cloudflare Pages (ramo ${RAMO:-main})"
$WRANGLER pages deploy public --project-name esfihas-sayones --branch "${RAMO:-main}" --commit-dirty=false

dizer "Conferindo o site publicado"
sleep 3
SAUDE="$(curl -s -m 15 https://esfihas.sayones.com.br/api/saude || true)"
echo "saude: ${SAUDE:-sem resposta}"
CACHE_JS="$(curl -sI -m 15 https://esfihas.sayones.com.br/app.js | tr -d '\r' | grep -i '^cache-control' || true)"
echo "app.js: ${CACHE_JS:-sem cache-control}"
case "$CACHE_JS" in *no-cache*) ;; *) echo "AVISO: o app.js não saiu com no-cache. No Cloudflare, sayones.com.br, Caching, Configuration, Browser Cache TTL tem que ser 'Respect Existing Headers' (passo 10 de ops/PASSOS-NO-PAINEL.md)." ;; esac
dizer "Publicado. Confira https://esfihas.sayones.com.br"
