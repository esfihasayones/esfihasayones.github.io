# Cloudflare, pedidos no banco e painel do dia: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o site do GitHub Pages pro Cloudflare Pages em `esfihas.sayones.com.br`, gravar cada pedido num D1 conferido pelo servidor e dar ao dono um painel do dia em `/painel`.

**Architecture:** Site estático em `public/` (HTML, `app.js`, `regras.js` como módulos ES, sem build). `regras.js` tem os dados e as funções puras de preço e data, importado pelo navegador e pelas Pages Functions em `functions/`. Cupons e acesso ao banco só no servidor. Painel em `public/painel/` falando com `functions/api/painel/*`, protegido por Cloudflare Access e por conferência do e-mail no middleware.

**Tech Stack:** HTML/CSS/JS puro, Cloudflare Pages + Pages Functions, D1 (SQLite), `wrangler@4.152.0` via `npx`, `node --test` (Node 22, sem dependência) pros testes de API, suíte de navegador existente (`tests/index.html`) via Playwright 1.63 já baixado.

**Spec:** `docs/superpowers/specs/2026-10-22-cloudflare-pedidos-design.md`

## Global Constraints

- Tudo em português: código, nomes, testes, commits (commit explica o porquê; primeira linha é o efeito pra quem usa).
- Texto visível sem travessão (—), sem antítese, tríade, muleta ou manchete (regras do `CLAUDE.md`).
- Sem framework, sem build, sem dependência em `package.json`; `npx wrangler@4.152.0` fixo.
- Campos de formulário com `font-size` ≥ 16px.
- Datas e horas no fuso `America/Sao_Paulo`; começo de janela com `-03:00` fixo, como hoje.
- Dinheiro no banco em centavos inteiros.
- Limite de paralelismo: nada de runner com workers padrão; `node --test --test-concurrency=4`.
- `git status` e `git stash list` antes de editar; commit e push (SSH, alias `github-esfiharia`, nunca `gh`) após cada tarefa testada.
- Nenhum dado de cliente em arquivo do repositório nem em log.
- E-mail do painel: `brenojulianom@gmail.com`. Limite padrão: 80 esfihas por data de retirada. Cupom: `PRIMEIRACOMPRA` = 10% sobre o total com combo.

## Review Focus

1. **Relógio do celular errado:** o servidor decide antecedência com o próprio relógio; pedido "ok" no celular adiantado entra como `fora_da_regra` com motivo, nunca some. Teste na Task 3.
2. **Envio repetido** (clique duplo, rede que reenvia): mesmo `id_envio` duas vezes grava uma linha só. Teste na Task 3.
3. **Dia lotando entre dois pedidos:** o segundo que passa de 80 entra como `fora_da_regra` motivo `lotado`, e a agenda pública passa a mostrar o dia como lotado. Teste na Task 5.
4. **Edição no painel:** mudar quantidade recalcula o valor e mantém o Nº; com valor manual, o valor fica. Teste na Task 6.
5. **Painel sem Access** (regra mal configurada): rota `/api/painel/*` sem o cabeçalho certo responde 403. Nome com acento e emoji volta intacto. Testes na Task 6.

---

### Task 1: Separar o site em `public/` com `regras.js` e `app.js`

**Files:**
- Move: `index.html`, `logo.svg`, `favicon.svg`, `og-v2.png` → `public/`
- Create: `public/regras.js`, `public/app.js`
- Modify: `public/index.html` (o `<script>` vira `<script type="module" src="app.js"></script>`), `tests/index.html:69` (`ALVO = "../public/index.html"`), `tests/varredura.js` se ler caminho
- Delete: `.nojekyll` só na Task 9 (o GitHub Pages ainda serve até a virada)

**Interfaces:**
- Produces (`public/regras.js`, módulo ES, sem DOM):
  - `export const WHATSAPP, ANTECEDENCIA_H, PEDIDO_GRANDE, ANTECEDENCIA_GRANDE_H, FERIADOS, PONTOS, NOMES_DIA, SABORES, FAIXAS` (valores de hoje, copiados do bloco CONFIGURAÇÃO)
  - `export function faixaDe(qtd: number): {min, preco, nome}`
  - `export function precoCentavos(qtd: number): {unit: number, total: number}` (centavos, sem cupom)
  - `export function isoBrasilia(ms: number): string` ("AAAA-MM-DD")
  - `export function inicioRetirada(ponto, dataIso: string): Date`
  - `export function situacaoData(ponto, dataIso: string, qtd: number, agoraMs: number): "ok"|"feriado"|"dia"|"cedo"`
  - `export function proximaData(ponto, qtd: number, agoraMs: number, bloqueados?: Set<string>): string`
- `app.js` importa de `regras.js`; o cupom continua no cliente nesta tarefa (sai na Task 4).

- [ ] **Step 1:** `git mv` dos arquivos pra `public/`, ajustar `ALVO` e rodar a suíte como está hoje (servidor `python3 -m http.server 8791` na raiz). Esperado: tudo vermelho por falta do script (prova que a suíte enxerga a mudança).
- [ ] **Step 2:** Mover o conteúdo do `<script>` pra `public/app.js` e os dados + funções puras listadas acima pra `public/regras.js`; `app.js` usa `Date.now()` como `agoraMs` (os testes já trocam `Date.now` da página).
- [ ] **Step 3:** Teste novo em `tests/suite.js`, grupo "Regras": `regras.js carrega sem DOM` (importa o módulo via `import()` no contexto do teste e confere `precoCentavos(12).total === 6240` e `situacaoData(PONTOS[1], "2026-10-24", 4, Date.parse("2026-10-21T10:00:00-03:00")) === "dia"`).
- [ ] **Step 4:** Suíte completa (137 + 1) e `?grupo=Varredura` passando no Chromium e no Firefox (`node rodar.js chromium|firefox URL`).
- [ ] **Step 5:** Commit "Site passa a carregar o comportamento de arquivos separados" e push.

### Task 2: Projeto Cloudflare, banco e ambiente local

**Files:**
- Create: `wrangler.toml`, `migrations/0001_pedidos.sql`, `tests/api/ajuda.mjs`, `tests/api/saude.test.mjs`, `functions/api/saude.js`, `.dev.vars.exemplo`
- Modify: `.gitignore` (`.wrangler/`, `.dev.vars`)

**Interfaces:**
- `wrangler.toml`: `name = "esfihas-sayones"`, `pages_build_output_dir = "./public"`, `compatibility_date = "2026-10-22"`, `[[d1_databases]] binding = "DB"`, `database_name = "esfihas-pedidos"`, `database_id` do `wrangler d1 create`; `preview_database_id` de um segundo banco `esfihas-pedidos-previa`.
- Schema (`migrations/0001_pedidos.sql`):
  - `pedidos(id INTEGER PRIMARY KEY AUTOINCREMENT, id_envio TEXT UNIQUE, criado_em TEXT NOT NULL, origem TEXT NOT NULL CHECK(origem IN ('site','manual')), status TEXT NOT NULL CHECK(status IN ('aguardando','confirmado','cancelado','fora_da_regra')), motivo TEXT, nome TEXT NOT NULL, itens TEXT NOT NULL /* JSON [{sabor,qtd,obs}] */, qtd INTEGER NOT NULL, unit_centavos INTEGER NOT NULL, total_centavos INTEGER NOT NULL, cupom TEXT, desconto_centavos INTEGER NOT NULL DEFAULT 0, valor_manual INTEGER NOT NULL DEFAULT 0, ponto TEXT NOT NULL, retirada TEXT /* AAAA-MM-DD ou NULL */, janela TEXT, obs TEXT, pago INTEGER NOT NULL DEFAULT 0, entregue INTEGER NOT NULL DEFAULT 0, atualizado_em TEXT)`
  - índice `(retirada, status)`
  - `config(chave TEXT PRIMARY KEY, valor TEXT NOT NULL)` com `('limite_dia','80')`, `('pausado','0')`
  - `bloqueios(dia TEXT PRIMARY KEY, motivo TEXT)`
- `functions/api/saude.js`: `GET` → `{ok: true, banco: true}` após `SELECT 1`.
- `tests/api/ajuda.mjs`: `export const BASE = process.env.BASE || "http://127.0.0.1:8788"`; `export async function pedir(caminho, opcoes)`; `export function comoDono(opcoes)` (adiciona `Cf-Access-Authenticated-User-Email: brenojulianom@gmail.com`).
- Ambiente local: `npx wrangler@4.152.0 d1 migrations apply esfihas-pedidos --local` e `npx wrangler@4.152.0 pages dev --port 8788` (lê o `wrangler.toml`). `.dev.vars`: `DONO_EMAIL=brenojulianom@gmail.com`.

- [ ] **Step 1:** `wrangler d1 create esfihas-pedidos` e `esfihas-pedidos-previa`; anotar ids no `wrangler.toml`.
- [ ] **Step 2:** Teste `saude responde com banco` (`GET /api/saude` → 200, `{ok:true, banco:true}`); rodar `node --test --test-concurrency=4 tests/api/` com o `pages dev` no ar. Esperado: falha (404).
- [ ] **Step 3:** Migração + função; aplicar `--local`; teste passa. Suíte de navegador também passa servida pelo `pages dev` (`http://127.0.0.1:8788/...` com `tests/` fora de `public/`: rodar a suíte pelo `python3 -m http.server` apontando `ALVO` pro 8788 via `?alvo=`; acrescentar leitura de `?alvo=` no `tests/index.html`).
- [ ] **Step 4:** Commit "Prepara o projeto do Cloudflare e o banco de pedidos" e push.

### Task 3: Gravar o pedido no servidor (`POST /api/pedidos`)

**Files:**
- Create: `functions/api/pedidos.js`, `functions/_lib/pedido.js`, `functions/_lib/cupons.js`, `tests/api/pedidos.test.mjs`

**Interfaces:**
- Consumes: `regras.js` (Task 1), schema (Task 2).
- `functions/_lib/cupons.js`: `export const CUPONS = { PRIMEIRACOMPRA: 0.10 }`; `export function cupomDe(codigo: string): {codigo, pct}|null` (trim + maiúscula).
- `functions/_lib/pedido.js`: `export function avaliar(corpo, agoraMs, agenda: {limite, pausado, bloqueados:Set, ocupado: Map<dia,qtd>}): {linha, status, motivo}`. Puro, sem banco. Motivos: `"cedo"|"feriado"|"dia"|"lotado"|"bloqueado"|"pausado"|"cupom"`. Ponto "Combinar outro ponto" não checa data.
- Corpo aceito: `{id_envio: string(≤64), nome: string(1..60), itens: [{sabor: id de SABORES, qtd: 1..200, obs?: ≤140}], ponto: índice de PONTOS, retirada?: "AAAA-MM-DD", cupom?: ≤30, obs?: ≤500}`. Qualquer campo extra (inclusive valor) é ignorado.
- Resposta: `201 {id, status, total_centavos}`; repetido (`id_envio` existente) `200` com a mesma linha; corpo inválido `400 {erro}`.
- Pedido válido entra `aguardando`; reprovado por regra entra `fora_da_regra` com `motivo`.

- [ ] **Step 1:** Testes em `tests/api/pedidos.test.mjs`:
  - `grava pedido válido e recalcula valor`: 12 calabresa, Itacorubi, data 3 dias à frente num dia útil sem feriado, corpo com `total_centavos: 1` → resposta `total_centavos: 6240`, `status: "aguardando"`.
  - `cupom soma com o combo`: 12 + `"primeiracompra"` → `5616`.
  - `cupom inexistente vira fora_da_regra`: `motivo: "cupom"`.
  - `data cedo pelo relógio do servidor vira fora_da_regra`: retirada = amanhã às 8h no Itacorubi pedida agora → `motivo: "cedo"` (Review Focus 1).
  - `mesmo id_envio grava uma vez só`: dois POSTs → mesmo `id`, `SELECT COUNT(*)` via `/api/painel/pedidos` na Task 6; aqui conferir mesmo `id` (Review Focus 2).
  - `corpo inválido dá 400`: sabor inexistente, nome vazio, qtd 0.
  - `nome com acento e emoji volta intacto`: "Joaquim 🥟 Ávila".
- [ ] **Step 2:** Rodar; esperado falhar com 404/405.
- [ ] **Step 3:** Implementar `avaliar` e `onRequestPost` (lê `config`, `bloqueios` e soma de `qtd` por `retirada` com status `aguardando|confirmado`; `INSERT ... ON CONFLICT(id_envio) DO NOTHING` e `SELECT` por `id_envio`).
- [ ] **Step 4:** Testes passam.
- [ ] **Step 5:** Commit "Pedido do site fica gravado e o valor é conferido no servidor" e push.

### Task 4: Site manda o pedido e consulta cupom no servidor

**Files:**
- Create: `functions/api/cupom.js`
- Modify: `public/app.js` (remove `CUPONS`; consulta `/api/cupom`; envia pedido), `tests/suite.js` (grupo Cupom fica assíncrono; grupo novo "Gravação")

**Interfaces:**
- `GET /api/cupom?codigo=X` → `200 {codigo, pct}` ou `404 {erro:"nao_existe"}`.
- `app.js`: consulta com espera de 300 ms após a última tecla; enquanto não volta, dica "Conferindo o cupom..."; envio barrado só se a resposta foi 404. Se a consulta falhar por rede, o cupom vai na mensagem e o servidor decide.
- No clique de enviar: `fetch("/api/pedidos", {method:"POST", keepalive:true, headers:{"Content-Type":"application/json"}, body})` sem `await` antes do `window.open`; `id_envio = crypto.randomUUID()` gerado na abertura da gaveta e renovado após envio.
- Frase LGPD abaixo do botão (texto final na Task 8).

- [ ] **Step 1:** Ajustar testes do grupo Cupom pra aguardar a dica (`c.esperar(() => c.texto("#dicaCupom").includes("10%"))`; criar `c.esperar(cond, ms=2000)` no `tests/index.html`). Teste novo `enviar grava o pedido sem atrasar o WhatsApp`: espiona `win.fetch`, envia, confere que `window.open` foi chamado e que o corpo tem `itens`, `ponto`, `id_envio` e não tem `total`. Teste `a lista de cupons não aparece no código do site`: `fetch("../public/app.js")` não contém `PRIMEIRACOMPRA`.
- [ ] **Step 2:** Rodar contra o `pages dev`; esperado: falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Suíte inteira e API passando.
- [ ] **Step 5:** Commit "Cupom é conferido no servidor e o pedido enviado fica guardado" e push.

### Task 5: Agenda: limite por dia, bloqueio e pausa

**Files:**
- Create: `functions/api/agenda.js`, `tests/api/agenda.test.mjs`
- Modify: `public/regras.js` (`situacaoData` aceita `bloqueados`), `public/app.js`, `tests/suite.js`

**Interfaces:**
- `GET /api/agenda` → `{pausado: bool, indisponiveis: {"AAAA-MM-DD": "lotado"|"bloqueado"}}` pros próximos 30 dias (sem quantidades nem nomes).
- `situacaoData(..., bloqueados?: Map<dia, motivo>)` devolve também `"lotado"|"bloqueado"`. Pausado: botão de enviar desabilitado e aviso "Os pedidos estão pausados por enquanto. Fala com a gente no WhatsApp."
- Textos na dica de data: lotado → "Esse dia já está cheio. A mais próxima ... é ..."; bloqueado → "Nesse dia não tem retirada. A mais próxima ... é ...".

- [ ] **Step 1:** Testes API: `dia passa de 80 e o próximo pedido vira lotado` (Review Focus 3); `agenda mostra o dia lotado sem expor pedidos`; `bloqueio e pausa aparecem na agenda` (gravando direto em `config`/`bloqueios` com `wrangler d1 execute --local`). Teste navegador: `dia lotado é recusado e a sugestão pula ele` (stub de `fetch` pra `/api/agenda`).
- [ ] **Step 2:** Rodar; falha.
- [ ] **Step 3:** Implementar; `app.js` busca a agenda ao abrir a gaveta; se falhar, segue sem ela (o servidor ainda decide).
- [ ] **Step 4:** Passa.
- [ ] **Step 5:** Commit "Site deixa de oferecer dia lotado ou bloqueado" e push.

### Task 6: API do painel

**Files:**
- Create: `functions/api/painel/_middleware.js`, `functions/api/painel/pedidos.js`, `functions/api/painel/pedidos/[id].js`, `functions/api/painel/agenda.js`, `tests/api/painel.test.mjs`

**Interfaces:**
- Middleware: `Cf-Access-Authenticated-User-Email` igual a `env.DONO_EMAIL` (sem diferenciar maiúscula), senão `403`. Também `Cache-Control: no-store` e `X-Robots-Tag: noindex`.
- `GET /api/painel/pedidos?dia=AAAA-MM-DD` → `{dia, porSabor: {calabresa: n,...} (só confirmados), pontos: [{ponto, pedidos:[...]}], pendencias: [aguardando + fora_da_regra de qualquer dia futuro], proximos: [{dia, qtd, pedidos: n}] (7 dias, confirmados)}`. Pedido serializado: `{id, status, motivo, origem, nome, itens, qtd, total_centavos, cupom, desconto_centavos, valor_manual, ponto, retirada, janela, obs, pago, entregue}`.
- `POST /api/painel/pedidos` (manual): mesmo corpo da Task 3 mais `ponto` livre (texto), `retirada` livre ou nula, `janela` livre, `total_centavos` opcional (se vier, `valor_manual = 1`). Entra `confirmado`, `origem: "manual"`, sem checar regras de data.
- `PATCH /api/painel/pedidos/:id` com qualquer subconjunto de `{status, pago, entregue, nome, itens, ponto, retirada, janela, obs, cupom, total_centavos, valor_manual}`; sem `total_centavos` e com `valor_manual = 0`, recalcula com `regras.js` + cupom. Mantém `id`.
- `GET/PUT /api/painel/agenda` → `{limite, pausado, bloqueios:[{dia,motivo}]}`; PUT aceita os mesmos campos.

- [ ] **Step 1:** Testes: `sem o cabeçalho do Access dá 403` (e com outro e-mail também; Review Focus 5); `lista do dia soma por sabor só os confirmados`; `confirmar tira das pendências e entra na soma`; `editar quantidade recalcula e mantém o Nº`; `com valor manual a edição não muda o valor` (Review Focus 4); `pedido manual aceita Centro no sábado sem data fixa`; `cancelado sai da soma e continua na lista`; `limite e bloqueio salvos aparecem na agenda pública`.
- [ ] **Step 2:** Falha.
- [ ] **Step 3:** Implementar. Local: `.dev.vars` com `DONO_EMAIL`; os testes mandam o cabeçalho via `comoDono()`.
- [ ] **Step 4:** Passa.
- [ ] **Step 5:** Commit "Painel tem como ler e marcar os pedidos" e push.

### Task 7: Tela do painel

**Files:**
- Create: `public/painel/index.html`, `public/painel/painel.js`, `tests/painel.js` (grupo "Painel" carregado pelo `tests/index.html`)

**Interfaces:**
- Consumes: Task 6.
- Layout pro celular, identidade do site (`#121212` sobre `#F7F6F2`, Unbounded e Space Grotesk, mesmos tokens):
  1. Cabeçalho com o dia (setas ‹ › e "Hoje"), total do dia e quantos de cada sabor montar.
  2. "Pendências" (aguardando e fora da regra, com o motivo em texto claro e botões "Confirmar" e "Cancelar").
  3. Pedidos do dia agrupados por ponto: Nº, nome, itens, valor, cupom, observações; botões grandes "Pago" e "Entregue" (alternam), "Editar".
  4. "Próximos dias": dia, total de esfihas, nº de pedidos; tocar leva ao dia.
  5. Botão fixo "Novo pedido" abre formulário (o mesmo usado pra editar): nome, quantidade por sabor, ponto (lista + "Outro"), dia, horário livre, cupom, valor (preenchido pelo cálculo, editável), observação.
  6. "Agenda": limite por dia, pausar pedidos, bloquear dia.
- Sem `localStorage` pra dado de cliente. Erro de rede mostra aviso e mantém o que estava na tela.

- [ ] **Step 1:** O navegador local não tem o cabeçalho do Access, então `_middleware.js` (Task 6) também libera quando `env.DEV_SEM_LOGIN === "1"`; essa variável só existe no `.dev.vars` e nunca em produção, e o teste `sem o cabeçalho do Access dá 403` da Task 6 roda com ela desligada (segunda instância do `pages dev` na porta 8789 sem `.dev.vars`). Testes em `tests/painel.js`, contra o `pages dev` com a variável: `mostra o total por sabor do dia`, `confirmar pendência move pro ponto`, `Pago alterna e persiste ao recarregar`, `novo pedido manual aparece no dia`, `editar muda o valor`, `sem travessão no texto do painel`, `campos com 16px`.
- [ ] **Step 2:** Falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Passa; olhar no Playwright a 375px e a 1280px, sem estouro (`getBoundingClientRect().right`).
- [ ] **Step 5:** Commit "Painel do dia pra ver o que montar e quem busca onde" e push.

### Task 8: Endurecer o site pra produção

**Files:**
- Create: `public/_headers`, `public/_redirects` (se precisar), `public/robots.txt`, `public/sitemap.xml`, `public/404.html`, `public/fontes/*.woff2`
- Modify: `public/index.html` (canonical, `og:url`, `og:image`, JSON-LD → `https://esfihas.sayones.com.br/`; fontes locais; frase LGPD), `README.md`, `CLAUDE.md`

**Interfaces / valores:**
- `_headers`:
  - `/*`: `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` (o JSON-LD é `application/ld+json`, não executa).
  - `/*.svg`, `/*.png`, `/fontes/*`: `Cache-Control: public, max-age=31536000, immutable`.
  - `/`, `/*.js`, `/painel/*`: `Cache-Control: no-cache`; `/painel/*` também `X-Robots-Tag: noindex`.
- `onload=` do preload de fonte sai (CSP sem `unsafe-inline` em script); fontes `Unbounded 500/600/700` e `Space Grotesk 400/500/600/700` em woff2 subset latin.
- Frase LGPD sob o botão de enviar: "Seu nome e o pedido ficam guardados com a gente só pra preparar a encomenda."
- `robots.txt` bloqueia `/painel` e `/api`; `sitemap.xml` com a home.
- Cloudflare Web Analytics: script do beacon com o token do painel do Cloudflare (o dono copia).

- [ ] **Step 1:** Testes navegador: `o site não carrega nada de fora do próprio domínio` (lista `performance.getEntriesByType("resource")`, ignorando o beacon), `canonical aponta pro domínio novo`, `a frase de privacidade aparece perto do botão`. Teste API: `os cabeçalhos de segurança vêm em toda página` (`/`, `/painel/`).
- [ ] **Step 2:** Falha. **Step 3:** Implementar. **Step 4:** Passa, inclusive a suíte inteira e a varredura.
- [ ] **Step 5:** Atualizar `README.md` e `CLAUDE.md` (novo jeito de rodar, publicar, banco, painel; tirar o nome da conta do trabalho e a conta de custo do texto público). Commit "Site pronto pro domínio novo, com fontes próprias e cabeçalhos de segurança" e push.

### Task 9: Publicar e virar o domínio (passos com o dono)

**Files:**
- Create: `ops/anonimizar.sh` (`UPDATE pedidos SET nome = 'cliente ' || id, obs = NULL, itens = json(...sem obs) WHERE criado_em < date('now','-12 months')` via `wrangler d1 execute --remote`; rodado no começo de cada mês, lembrete no `CLAUDE.md`)
- Create: `ops/publicar.sh` (roda `node --test`, a suíte de navegador headless e `wrangler pages deploy public --project-name esfihas-sayones --branch main`; aborta se algo falhar), `ops/backup.sh` (`wrangler d1 export esfihas-pedidos --remote --output backups/AAAA-MM-DD.sql`), `.gitignore` (`backups/`)
- Create (fora deste repo): repositório público novo `esfihasayones.github.io` só com `index.html` de redirecionamento (meta refresh + `location.replace` preservando caminho) e `404.html` igual.

**Passos (cada um conferido antes do próximo; o site nunca fica fora do ar):**
- [ ] **Step 1:** `wrangler d1 migrations apply esfihas-pedidos --remote`; `wrangler pages project create esfihas-sayones --production-branch main`; `wrangler pages secret put DONO_EMAIL`; primeiro deploy pelo `ops/publicar.sh`; conferir `https://esfihas-sayones.pages.dev` e `/api/saude`.
- [ ] **Step 2 (dono, guiado):** no Cloudflare, Pages → Custom domains → `esfihas.sayones.com.br`; Zero Trust → Access → aplicação self-hosted em `esfihas.sayones.com.br/painel` e `esfihas.sayones.com.br/api/painel` com política "Emails: brenojulianom@gmail.com" (também cobrindo o `*.pages.dev`); Redirect Rule `sayones.com.br/*` e `www.sayones.com.br/*` → `https://esfihas.sayones.com.br/$1` (301); SSL "Full (strict)" e "Always Use HTTPS"; Web Analytics e o token no `index.html`. Se o Zero Trust pedir cartão ou travar o free, parar e voltar pro dono (alternativa: Basic Auth).
- [ ] **Step 3:** Conferir: `curl -sI https://esfihas.sayones.com.br/` (200, cabeçalhos da Task 8), `/painel/` sem login redireciona pro Access, `/api/painel/pedidos` sem login 403/302, pedido de teste ponta a ponta no celular e cancelado no painel.
- [ ] **Step 4:** Lançar no painel os dois pedidos de 22/10 (dados na memória do projeto).
- [ ] **Step 5 (dono, guiado):** no GitHub (web, conta `esfihasayones`): renomear o repositório atual pra `esfiharia` e torná-lo privado; atualizar o remoto local (`git remote set-url origin git@github-esfiharia:esfihasayones/esfiharia.git`); criar o repositório público `esfihasayones.github.io` com o redirecionamento. Conferir que `https://esfihasayones.github.io/` cai em `esfihas.sayones.com.br`.
- [ ] **Step 6:** Atualizar memória do projeto e `CLAUDE.md` (onde mora o site, como publicar, backup). Lembrar o dono: link do Instagram e QR da camisa pro domínio novo. Commit "Site passa a morar em esfihas.sayones.com.br" e push.
