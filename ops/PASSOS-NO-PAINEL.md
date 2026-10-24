# Passos que só o dono faz, nos painéis

Ordem importa. Cada passo tem "como conferir"; só siga pro próximo se conferiu.
Pré-requisito: o primeiro deploy já foi feito (`ops/publicar.sh`) e
`https://esfihas-sayones.pages.dev/api/saude` responde.

## 1. Domínio do site no Pages
Cloudflare, Workers & Pages, projeto `esfihas-sayones`, Custom domains, Set up a
custom domain: `esfihas.sayones.com.br`. Aceite o registro DNS que ele propõe.
Como conferir: o domínio fica "Active" e `https://esfihas.sayones.com.br/api/saude` responde.

## 2. Proteger o painel (Zero Trust, Access)
Zero Trust, Access, Applications, Add an application, Self-hosted. Em Public
hostnames, cadastre cinco caminhos:
- `esfihas.sayones.com.br` com path `painel`
- `esfihas.sayones.com.br` com path `api/painel`
- `esfihas-sayones.pages.dev` com path `painel`
- `esfihas-sayones.pages.dev` com path `api/painel`
- `*.esfihas-sayones.pages.dev` (as versões de teste) sem path

Política: Allow, Include, Emails, `brenojulianom@gmail.com`.
Como conferir: numa janela anônima, `/painel/` pede o login por e-mail.

## 3. Copiar o nome da equipe e o AUD
- Nome da equipe: Zero Trust, Settings, Custom Pages ou Team domain. É a parte
  antes de `.cloudflareaccess.com`. Vai em `ACCESS_EQUIPE`.
- AUD: abra a aplicação criada no passo 2, Overview, campo "Application
  Audience (AUD) Tag". Vai em `ACCESS_AUD`.

## 4. Gravar os segredos no projeto
Na pasta do repositório, um por vez (ele pergunta o valor):

```bash
npx --yes wrangler@4.152.0 pages secret put DONO_EMAIL --project-name esfihas-sayones
npx --yes wrangler@4.152.0 pages secret put ACCESS_EQUIPE --project-name esfihas-sayones
npx --yes wrangler@4.152.0 pages secret put ACCESS_AUD --project-name esfihas-sayones
```

`DONO_EMAIL` é `brenojulianom@gmail.com`. Nunca crie `DEV_SEM_LOGIN` no projeto.
Depois publique de novo (`ops/publicar.sh`) para os segredos valerem.
Como conferir: entrar em `/painel/` pelo login e ver a lista de pedidos; `curl -i https://esfihas.sayones.com.br/api/painel/pedidos` sem login não devolve 200.

## 5. Domínio antigo, `sayones.com.br`
- DNS: precisam existir registros com a nuvem laranja (Proxied) para `@` e
  `www`. Se não existirem, crie A `@` e A `www` apontando para `192.0.2.1`,
  Proxied. O IP é só de enchimento, o redirecionamento acontece antes dele.
- Rules, Redirect Rules, Create rule: quando o hostname for `sayones.com.br` ou
  `www.sayones.com.br`, redirecionar para a expressão
  `concat("https://esfihas.sayones.com.br", http.request.uri.path)`,
  status 301, preservando a query string.
  Se preferir o formato antigo, o equivalente é `sayones.com.br/*` e
  `www.sayones.com.br/*` para `https://esfihas.sayones.com.br/${1}`.
Como conferir: `curl -sI https://sayones.com.br/qualquer` mostra 301 com `location: https://esfihas.sayones.com.br/qualquer`.

## 6. HTTPS
SSL/TLS, Overview: modo "Full (strict)". Edge Certificates: ligue "Always Use HTTPS".
Como conferir: `curl -sI http://esfihas.sayones.com.br/` devolve 301 para `https://`.

## 7. Limite de pedidos por IP e Web Analytics
- Security, WAF, Rate limiting rules: no plano Free cabe uma regra só, com
  janela de 10 segundos. Crie uma para os caminhos `/api/pedidos`, `/api/cupom`,
  `/api/agenda` e `/api/saude` (condições ligadas por "or"), contando por IP, e
  bloqueie acima de umas 10 requisições nessa janela. (Feita em 23/10 só com
  os dois primeiros; falta acrescentar `/api/agenda` e `/api/saude`, senão um
  robô batendo neles gasta a cota de leitura do banco.) Duração do bloqueio e demais campos: conferir no
  painel, o plano Free limita as opções.
- Analytics, Web Analytics, Add a site `esfihas.sayones.com.br`: copie o token
  e passe ao Claude para entrar no `index.html`.
Como conferir: o painel de Web Analytics mostra visita depois de abrir o site.

## 8. GitHub (conta `esfihasayones`, pelo navegador)
1. Repositório atual `esfihasayones.github.io`: Settings, Rename para `esfiharia`; depois Settings, Danger Zone, Change visibility, Private.
2. Na máquina: `git remote set-url origin git@github-esfiharia:esfihasayones/esfiharia.git` e `git fetch` para conferir.
3. Crie um repositório novo e público `esfihasayones.github.io`, só com os arquivos de `ops/redirecionamento/` (`index.html`, `404.html`) na raiz, e ligue o Pages na `main`.
Como conferir: `https://esfihasayones.github.io/qualquer` cai em `https://esfihas.sayones.com.br/qualquer`.

## 9. Divulgação
Troque o link do Instagram `@esfihasayones` e o QR da camiseta para
`https://esfihas.sayones.com.br`. Os endereços antigos continuam redirecionando.

## 10. Cache do navegador (achado da auditoria de 23/10)
Caching, Configuration, Browser Cache TTL: escolha "Respect Existing Headers".
Sem isso o Cloudflare manda `app.js` e `regras.js` com cache de 4 horas, por
cima do `no-cache` do `_headers`, e quem já visitou fica até 4 horas com o
site e o painel velhos depois de cada publicação (o `pages.dev` não tem o
problema porque não passa pela zona).
Como conferir: `curl -sI https://esfihas.sayones.com.br/app.js | grep -i cache-control`
mostra `no-cache`. O `ops/publicar.sh` avisa no fim quando não mostra.
