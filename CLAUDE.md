# Esfihas Sayones

Site de encomendas de uma esfiharia caseira de verdade, do Breno, em
Florianópolis. Negócio novo. Site em HTML/CSS/JS puro, sem build e sem
framework, servido pelo Cloudflare Pages em <https://esfihas.sayones.com.br/>.
Os pedidos ficam num banco D1 (Cloudflare) e o dono vê o dia num painel.

## Estado (23/10/2026)

No ar no Cloudflare (seção "Site no Cloudflare" abaixo). A `cloudflare` foi
juntada na `main`; push no GitHub não publica nada, quem publica é
`ops/publicar.sh`. O repositório `esfihasayones/esfiharia` (antigo
`esfihasayones.github.io`) é privado; o push vai por SSH (alias
`github-esfiharia` do `~/.ssh/config`), nunca pelo `gh`, que nesta máquina
está logado em outra conta.

Falta antes de divulgar: o Google Meu Negócio não foi cadastrado. O Instagram
`@esfihasayones` existe desde 19/10/2026. Os detalhes estão no `README.md`.

**Mais de uma sessão do Claude mexe nesta pasta ao mesmo tempo.** Em
21/10/2026 uma sessão rodou `git stash` no meio do trabalho da outra. Antes de
editar, rode `git status` e `git stash list`; depois de cada mudança testada,
faça commit e push logo, sem deixar nada solto.

### Respondido pelo dono em 21/10/2026

- Depoimentos inventados: seção removida. Volta só com elogio de verdade e
  autorização de quem escreveu.
- Feriados: sem retirada. Lista `FERIADOS` em `public/regras.js` (nacionais
  e aniversário de Florianópolis, até o fim de 2028); Carnaval e Corpus
  Christi ficaram de fora por serem ponto facultativo. Estender a lista
  pros anos seguintes.
- Forno: a esfiha é montada e assada depois da encomenda, e aí congelada.
- Frases sem confirmação saíram ("moída na hora", "temperada na hora de
  fazer", "Quantidade limitada por dia", "Leva menos de um minuto", "Fica
  igual à que sai do forno", e a história do "todo mundo saía levando
  esfiha"). A história ficou só com "receita de família, feita com amor que
  cativa", nas palavras dele.
- Abraão: segunda a sexta, das 9h ao meio-dia.

- Air fryer: 6 minutos em todo o site (era "6 a 8" na seção de esquentar).

### Pendente, por decisão dele

- Trocar os desenhos das esfihas por fotos de verdade (23/10/2026). Cliente
  achou o desenho "de IA" e disse que a de carne parece pote de feijão. Ele
  vai fotografar de cima, fundo claro liso, luz de janela; a gente recorta e
  põe fundo em degradê igual nos quatro sabores.

- Cadastrar o Google Meu Negócio.
- Camiseta: arquivo final pronto em 23/10/2026 em `~/Documents/brenisio/esfihas-camisa/` (QR pro domínio novo, texto em curva, 300 dpi). Falta ele testar o QR com a câmera do celular.

### Site no Cloudflare (desde 23/10/2026)

No ar em <https://esfihas.sayones.com.br>, projeto Pages `esfihas-sayones`,
com pedidos no banco D1 e painel do dia em `/painel` (design em
`docs/superpowers/specs/`, plano em `docs/superpowers/plans/`, ambos de
22/10). A branch `cloudflare` foi juntada na `main` em 23/10; publicar é
`ops/publicar.sh` (o push no GitHub não publica mais nada).

Feito em 23/10/2026: domínio no Pages (Custom domains); Access (equipe
`wild-hill-d83e`, política "Dono" com os e-mails liberados, protegendo `/painel`
e `/api/painel` nos dois domínios e as prévias `*.esfihas-sayones.pages.dev`);
`ACCESS_EQUIPE` e `ACCESS_AUD` gravados; `DONO_EMAIL` aceita lista separada
por vírgula desde 24/10/2026, e cada e-mail precisa estar nos dois lugares
(política do Access e segredo); SSL em Full (strict), Always Use
HTTPS; regra de limite "Limite pedidos" (10 por 10 s por IP em `/api/pedidos`
e `/api/cupom`, bloqueio de 10 s); Web Analytics automático na zona
`sayones.com.br`. `sayones.com.br` e `www` ficam sem nada: o dono guardou o
domínio principal pra outros projetos (o passo 5 do `PASSOS-NO-PAINEL.md` não
vale). Rede da Celesc bloqueia o domínio por ser novo ("Newly Seen Domains").

O `ops/publicar.sh` às vezes não passa porque o Chromium da suíte cai por
falta de memória na varredura aleatória; rodando grupo por grupo
(`tests/index.html?grupo=Retirada` etc.) os outros 150 passam.

Falta: lançar no painel os dois pedidos de 22/10 (na memória); repo público
`esfihasayones.github.io` só com o redirecionamento (`ops/redirecionamento/`);
link do Instagram pro domínio novo.

### Pedidos no banco (22/10/2026)

A ideia da planilha com Apps Script foi trocada pelo banco D1 e pelo painel
do dia, no Cloudflare (ver o spec). O pedido ainda abre o WhatsApp do mesmo
jeito; a gravação no banco acontece antes e, se falhar, o pedido segue pelo
WhatsApp. Pedidos combinados direto na conversa o dono lança à mão no painel.

### Auditoria de 23/10/2026

Três revisões independentes (backend e segurança, site público, painel e
testes) mais a suíte completa. O que entrou, cada item com teste:

- PATCH do painel grava só as colunas que mudaram (dois cliques quase juntos
  em aparelhos diferentes não se desfazem). Confirmar ou lançar pedido num dia
  acima do limite dá 409 `lotado`; o painel pergunta e repete com `forcar`.
- Escrita em `/api/painel` exige mesma origem (`Sec-Fetch-Site`; `Origin` só
  quando o navegador não mandou o outro) e `Content-Type: application/json`.
- `functions/api/_middleware.js`: o `_headers` não vale pra resposta de
  Function, então `/api/*` ganha nosniff, HSTS e `no-store` ali.
- Caractere de controle e marca de direção saem de nome e observação
  (`limpar` em `functions/_lib/pedido.js`).
- `MAX_DIAS_RETIRADA = 90` (`longeDemais`): é a última regra, depois de
  feriado, ponto, antecedência, produção e cupom, senão esconde o motivo real.
- Pedido sem data entregue em mãos ganha `retirada = hoje` (entra no dia e no
  histórico). Pendência com data passada continua visível. "Próximos dias"
  lista todo dia futuro com pedido, não só uma semana.
- Painel: editar só o nome não refaz o total nem barra por cupom que saiu do
  ar (itens e cupom só vão no PATCH se mudaram); `?dia` só na URL quando não é
  hoje, com botão "Voltar pra hoje"; histórico sem `null`, com "Meses" quando
  há outro mês e a dica de custos vinda do servidor (`custos` no
  `/api/painel/historico`); no celular Novos vem primeiro e os botões têm 44px.
- Site: reenviar o mesmo pedido repete o `id_envio` (o servidor não duplica);
  teto de 800 esfihas igual nos dois lados; "24h" com a ressalva de terça e
  quarta; saiu o "menos de um minuto"; `apple-touch-icon.png`.
- `ops/publicar.sh` recusa publicar se o filtro rodou menos de 10 testes e, no
  fim, confere o `cache-control` do `app.js` publicado.

**Pendente no painel do Cloudflare (dono):** Browser Cache TTL em "Respect
Existing Headers" (a zona manda `app.js` e `regras.js` com 4 h de cache por
cima do `no-cache`; passo 10 do `ops/PASSOS-NO-PAINEL.md`) e acrescentar
`/api/agenda` e `/api/saude` na regra de rate limit.

**Perguntas em aberto pro dono:** o topo diz "pré-assada" e o resto do site
diz "montada e assada"; ele produz em feriado? (`temProducao` conta feriado
como dia de produção); a de carne leva lactose mesmo? ("Todos os sabores
contêm glúten e lactose").

**Fora da lista, de propósito:** trocar a data sugerida ao mudar de ponto
quando o cliente não mexeu nela (quebraria o oráculo da varredura); mover o
sprite SVG pro fim do body; `financas` no GET do dia (o painel não lê, mas vai
no mesmo lote).

### Limite por dia (24/10/2026)

Limite de 48 esfihas por dia, gravado pelo dono no painel (Ajustes). O site
recusa sozinho o pedido que não cabe: pedido aguardando também ocupa vaga
(cancelar devolve), `/api/agenda?qtd=N` diz quais dias não cabem um pedido
de N e o site reconsulta quando a quantidade muda, antes de abrir o WhatsApp.
A mensagem diz o próximo dia com vaga. Pedido maior que o limite só aparece
lotado em dia que já tem pedido; nos outros, cai como `fora_da_regra` e o
dono conversa.

### Pagamento (22/10/2026)

Pix na chave dele e cartão na retirada pelo Tap do Mercado Pago (celular
como maquininha, 0,89% débito e 3,09% crédito na época). Sem maquininha e
sem link de pagamento: o link custava ~5% e a garantia de pagar antes dá
pra ter com Pix. O site ainda não fala de pagamento; se for falar, "Pix ou
cartão na retirada".

Em 23/10/2026 ele decidiu: o Pix não sai do site. O pedido chega no WhatsApp e
ele manda a chave ou o QR pra pessoa no privado. QR com valor gerado pelo
site e confirmação automática (Mercado Pago, ~0,99%) ficaram pra depois. Se a
mãe dele começar a entregar, a ideia é ela só entregar o que estiver "pago"
no painel (o e-mail dela entra no Access), por causa do golpe do Pix agendado.

### Repositório e domínio (22/10/2026)

O domínio é `esfihas.sayones.com.br`. O repositório passa a ser privado na
última etapa do plano, porque agora há pedidos de clientes por perto. Nada de
dado de cliente entra em arquivo do repositório nem em log.

### Figurinhas de WhatsApp

Ficam fora do repositório, em `~/Documents/brenisio/esfihas-figurinhas/`
(`divertidas/` com a esfiha personagem, `simples/` com cartão e selo,
`gerador/` com os scripts e um `LEIA.txt`). Ele pediu o emblema grande;
está em 180px num quadro de 512.

### Falta testar com o celular dele

- Abrir o site num iPhone de verdade (o WebKit do Playwright é o de Linux e não
  reproduz zoom ao focar, seletor nativo de data nem área segura).
- Mandar um pedido real com emoji digitado no nome e na observação e ver se
  chega inteiro no WhatsApp (o 🥟 fixo da mensagem chegava como �).

### Como rodar a suíte em outros motores

Playwright 1.63 já baixado em `~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright`,
com chromium e firefox no cache. O WebKit precisou de bibliotecas extraídas
sem sudo e de um lançador próprio, que ficaram na pasta temporária da sessão
de 21/10 e podem ter sumido; se precisar de novo, `apt-get download` dos
pacotes que o instalador pedir e `LD_LIBRARY_PATH` apontando pra eles.

## O negócio (decisões tomadas com o dono, não invente outras)

**Só congelada.** Assar e entregar quente exige rota apertada e cliente em
casa na hora certa. Congelada, ele monta e assa depois da encomenda (confirmado em
21/10/2026: "você encomenda, a gente monta e assa"), congela e entrega no ponto. O
argumento de venda virou "pronta em 6 minutos na air fryer".

**Não existe delivery porta a porta.** Em cada dia ele leva as encomendas a
um ponto combinado do bairro e o cliente passa lá para pegar. Por isso não
há taxa de entrega. Nunca escreva "entregamos na sua casa".

**Pontos e dias (21/10/2026):** Trindade/UFSC segunda e quinta 18h30–20h,
terça e quarta 18h30–22h; Itacorubi de segunda a sexta 8h–16h30; Abraão de
segunda a sexta 9h–12h; Centro de segunda a quinta 19h–21h (saiu em 21/10/2026 e
voltou em 23/10/2026, entra antes de "Combinar outro ponto"). Cada ponto em `PONTOS` tem uma lista `dias` e, quando o
horário muda conforme o dia, um mapa `janelas`. UFSC não é ponto separado, faz
parte da Trindade.

**Sabores e receitas** (confirmadas pelo dono):
- Calabresa: molho de tomate, calabresa moída, cebola e muçarela (azeitona e pimenta saíram
  em 21/10/2026)
- Carne: carne bovina moída com cebola e tomate
- Queijo: muçarela com requeijão e orégano
- Marguerita: molho de tomate, muçarela, tomate e manjericão (molho entrou em 23/10/2026) (entrou em 19/10/2026, mesmo
  preço e mesmos combos dos outros)

**Preços (21/10/2026).** R$ 5,90 avulsa, com combos em 4, 8 e 12. O
combo 4 tem desconto mais forte (7%) pra ser a porta de entrada, ideia de um
coordenador de marketing; o 8 e o 12 (9%, 12%) continuam mais baratos por
unidade pra valer subir. Nada perto do limite: a primeira versão chegava a 22% e o dono achou
agressivo demais. Antes era R$ 5,00 com 5/8/10%; subiu porque a conta de
custo (~R$ 2,25 por esfiha com embalagem e luz, mais ~R$ 1,50 da hora do
dono) deixava o combo 12 quase sem lucro. O combo vale pelo total do pedido,
misturando sabores à vontade.

| Combo    | Esfihas | Por unidade | Total    |
|----------|---------|-------------|----------|
| Avulsa   | 1 a 3   | R$ 5,90     | (avulsa) |
| Combo 4  | 4 a 7   | R$ 5,50     | R$ 22,00 |
| Combo 8  | 8 a 11  | R$ 5,35     | R$ 42,80 |
| Combo 12 | 12+     | R$ 5,20     | R$ 62,40 |

**Cupom (22/10/2026).** `CUPONS` em `functions/_lib/cupons.js`, código em
maiúscula e desconto sobre o total já com o combo. O primeiro é
`PRIMEIRACOMPRA`, 10%, pra trazer cliente e sair depois. O dono pensou em
15% acima de R$ 50 e desistiu: somado ao combo 12 dava uns 25% abaixo do
avulso. O site não sabe quem já comprou; o cupom chega escrito na mensagem e
ele confere no WhatsApp. Cupom digitado errado barra o envio, pra ninguém
mandar o pedido achando que tem desconto.

## Como o texto tem que soar

O dono reconhece e não gosta de texto com cara de IA. Isso não é preferência
estética, é requisito. O que ele apontou diretamente:

- **Travessão (—) é proibido.** Use vírgula, ponto ou dois-pontos. Existe um
  teste que falha se voltar a aparecer no texto visível.
- Nada de antítese ("não é X, é Y", "três sabores, nenhum atalho")
- Nada de paralelismo bonitinho ("Começou na cozinha. Continua ali.")
- Nada de tríade ritmada ("massa descansada, recheio à mão, fornada pequena")
- Nada de muleta: "de verdade", "do jeito certo", "um sopro de", "puxa aquele
  fio"
- Nada de manchete de marketing ("Sua próxima fornada pode ser hoje")

O tom certo é português brasileiro direto e concreto, como um vizinho
falaria. Prefira o fato ao adjetivo.

**Não invente fato sobre o negócio.** O selo do Combo 12 já foi "Mais
pedido"; virou "Melhor preço" porque a esfiharia está começando e não existe
pedido mais feito. Quando faltar informação, pergunte.

## Arquitetura

```
public/      o que o Cloudflare Pages serve: index.html (markup e CSS), app.js
             (tela), regras.js (preço, datas e pontos, sem DOM), painel/,
             fontes/ (woff2 próprios, com a licença OFL), _headers (CSP e
             cache), 404.html, robots.txt, sitemap.xml, logo/favicon/og-v2.png
functions/   API em Pages Functions: /api/pedidos, /api/agenda, /api/cupom,
             /api/saude e /api/painel/* (atrás do Cloudflare Access)
migrations/  SQL do D1
tests/       suíte de navegador (index.html, suite.js, varredura.js),
             servidor.mjs e tests/api/*.test.mjs
```

Não há build. A CSP em `public/_headers` não aceita script inline: todo
JavaScript fica em arquivo `.js` (o JSON-LD é `application/ld+json` e não
executa). Estilo inline é permitido. As fontes são servidas do próprio
domínio; não volte a apontar pro Google Fonts, a CSP bloqueia.
`logo.svg`, `favicon.svg` e `og-v2.png` são gerados e saem com cache de um
ano: ao trocar um deles, mude o nome do arquivo.

**O bloco de configuração** fica em `public/regras.js` (WhatsApp, antecedência,
feriados, pontos, sabores e combos); os cupons ficam em `functions/_lib/cupons.js`. Preço, sabor e ponto de retirada se mudam ali.

**Os pontos vivem em dois lugares** que precisam andar juntos: a seção
"Entrega e horários" (o que o visitante lê) e o array `PONTOS` no JS (o que
alimenta o seletor). O `openingHoursSpecification` do JSON-LD é o terceiro.

**Identidade visual (19/10/2026).** Uma tinta só, como a camisa: quase preto
`#121212` sobre branco quebrado `#F7F6F2`, fontes Unbounded (títulos) e
Space Grotesk (texto). Os nomes antigos dos tokens (`--terracota`, `--creme`
etc.) foram mantidos com valores novos; `--terracota` hoje é a tinta. A marca
é o selo `#ic-selo`: "ESFIHAS" em arco em cima, "SAYONES" embaixo e a esfiha
aberta no meio, **sem círculo em volta** (o círculo dava cara de pneu). O
letreiro já está em curva, então o selo não depende da fonte carregar. Os
arquivos de estampa da camisa ficam fora do repositório.

**O topo** tem a tabela de combos e a faixa de sabores montadas pelo JS a
partir de `FAIXAS` e `SABORES`, pra preço e sabor nunca divergirem do
carrinho. No celular a tabela e a faixa somem e entram três números (6 min,
60 dias, R$ 5,90).

**Os desenhos das esfihas** são SVG gerados por script Python, um `<symbol>`
por sabor (`#ic-calabresa`, `#ic-carne`, `#ic-queijo`, `#ic-marguerita`; a
marguerita foi desenhada à mão no mesmo molde). São vistos de
três-quartos, com a lateral da massa aparecendo: de cima e com rodela de
calabresa, o desenho lia como pizza. A esfiha é **aberta**, estilo Habib's,
e a calabresa é **moída**, não em rodela. A esfiha do selo é a de carne.

**O ícone do botão de pedido** é `#ic-carrinho`, um carrinho de compras. Já
foi uma sacola, que tinha o mesmo corpo afunilado da lixeira do carrinho e a
18px o dono leu como lixeira. Ícone novo de ação: compare ampliado e a 18px
com os outros antes de escolher.

**A mensagem do WhatsApp** é montada no cliente e aberta via `wa.me`: o
pedido chega como conversa normal no (48) 99221-0812. O banco guarda uma
cópia pra o painel.

## Testes

Em três terminais (ou em segundo plano), na raiz:

```bash
npx --yes wrangler@4.152.0 pages dev --port 8788 --local   # site + funções + D1 local
node tests/servidor.mjs                                    # porta 8792: serve /tests e repassa o resto pra 8788
node --test --test-concurrency=1 tests/api/*.test.mjs      # suíte de API
node tests/rodar-playwright.cjs chromium "http://127.0.0.1:8792/tests/index.html"   # suíte de navegador (ou firefox)
```

`--test-concurrency=1` é obrigatório: os arquivos de API zeram o banco local e
se atropelam em paralelo. O `.dev.vars` (copie de `.dev.vars.exemplo`) liga
`DEV_SEM_LOGIN`, que os testes do painel usam. Publicar é com `ops/publicar.sh`
(`--so-testar` só testa). Backup: `ops/backup.sh`. No começo de cada mês, rode
`ops/anonimizar.sh` (tira nome e observação de pedidos com mais de 12 meses).
Passos do dono nos painéis: `ops/PASSOS-NO-PAINEL.md`; conteúdo do repositório
público de redirecionamento: `ops/redirecionamento/`.

O `servidor.mjs` injeta na home um script de gancho (a suíte troca o `fetch`
do iframe por uma rede de mentira) e, só nas respostas que ele reescreve,
libera esse script na CSP por hash. O `public/_headers` nunca é enfraquecido;
o teste `tests/api/cabecalhos.test.mjs` fala direto com a 8788 e confere a CSP
exata.

173 testes de navegador (`tests/suite.js` e `tests/painel.js`) e 55 de API, sem dependência. O
runner carrega o site num iframe limpo, um teste por vez. `window.RESULTADO`
expõe o resultado para automação.

Rode depois de mexer em preço, sabor ou ponto. Um dos testes confere se o
valor anunciado em cada combo bate com o que o carrinho realmente cobra.

`tests/varredura.js` roda mais de 8 mil casos aleatórios (carrinhos, pedidos
com relógio, ponto e data sorteados, quantidades digitadas, larguras de
tela, recargas) contra um oráculo que reescreve as regras deste arquivo sem
ler a configuração do site. Mudou preço, ponto ou horário? Atualize o
oráculo no topo dela também. A semente aparece na falha; `?semente=N` repete
a rodada e `?grupo=Varredura` roda só ela.

A suíte foi validada por mutação: alterar preço de combo, remover a lixeira,
tirar a observação da mensagem, reintroduzir travessão, remover o `inert` da
gaveta e desfazer a correção do clique na marca fazem ela falhar.

## Armadilhas que já custaram caro aqui

**Ordem das media queries.** Todas usam a mesma especificidade, então vale a
última declarada. O bloco de 820px precisa vir depois das regras base do
card, e o de 360px depois do de 820px. Isso já quebrou duas vezes: as regras
existiam e simplesmente não aplicavam.

**`minmax(Npx, 1fr)` estoura.** Quando a tela é menor que N, o mínimo fixo
ganha e a coluna passa da viewport. Use sempre `minmax(min(Npx, 100%), 1fr)`.

**`hidden` perde para `display` do CSS.** `.resumo div{display:flex}` passava
por cima do atributo, e o aviso de combo aparecia com 12 esfihas. Há
`[hidden]{display:none!important}` no começo do CSS. Teste de "sumiu" tem que
medir a altura na tela, não olhar o atributo.

**Datas valem no horário de Brasília.** `iso()` formata com
`Intl.DateTimeFormat` no fuso `America/Sao_Paulo` e o começo da janela leva
`-03:00` fixo; com o celular em outro fuso a antecedência saía errada.

**A gaveta deixa o resto da página `inert`** enquanto está aberta (sem isso o
Tab escapava pra trás do véu), e a barra fixa fica `inert` quando está
escondida embaixo da tela.

**Antecedência é em horas até o começo da janela**, não em dias do
calendário: 24h, ou 3 dias acima de 40 esfihas. O envio é barrado se a data
não respeita isso ou se o ponto não abre naquele dia. Os testes fixam
`Date.now()` da página pra não depender da hora em que rodam.

**`overflow-x: hidden` esconde bug de layout.** Ele mascara o `scrollWidth`,
então teste de estouro que olha `scrollWidth` passa com a página quebrada. O
jeito certo é medir `getBoundingClientRect().right` de cada elemento.

**Âncora para elemento grudado não rola.** `href="#topo"` mirando o próprio
cabeçalho sticky andava só a altura dele a cada clique. O clique na marca é
interceptado no JS.

**Item de lista em flex parte o texto.** Os `li` dos cards de preparo são
`display:flex` com marcador no `::before`. Se o `<b>` do rótulo e o texto
ficarem soltos no `li`, viram itens de flex separados: cada linha começa num
x diferente e o rótulo longo quebra no meio ("Micro-/ondas:"). O conteúdo do
`li` tem que estar dentro de um `<span>`.

**`render()` remonta a lista da gaveta** quando o conjunto de sabores muda.
Se alguém estiver digitando numa linha, ela não pode sair: há uma exceção
que segura na lista o sabor cuja linha está em uso.

**O iframe dos testes fica na tela, quase transparente.** Fora da tela
(`left:-9999px`) o Safari e o Firefox quase param o `requestAnimationFrame`
dele e a suíte travava; com `opacity:0` o Firefox também desacelerava a
rolagem suave. Hoje passa nos três motores (Chromium, Firefox e WebKit).
Espião de `localStorage` vai no `Storage.prototype`: atribuir
`localStorage.setItem` no Firefox e no Safari grava uma chave, não troca o
método.

**Campos com 16px.** Abaixo disso o Safari do iPhone dá zoom ao focar.

**No harness de testes, o `pagehide` vazava estado.** A página grava o
carrinho ao sair, então limpar o `localStorage` antes de navegar não bastava:
a gravação voltava depois da limpeza. A navegação passa pelo `about:blank`
primeiro.

## Convenções

- Tudo em português: interface, comentários de código, nomes de variável,
  mensagem de commit, nome de teste.
- Mensagem de commit explica **por que**, não o que. A primeira linha é o
  efeito para quem usa o site.
- Verifique no navegador antes de dizer que está pronto. Tem Playwright
  disponível; use.
