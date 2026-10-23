# Esfihas Sayones 🥟

Site de encomendas da Esfihas Sayones: esfiha caseira **congelada** em Florianópolis.
Tudo é assado, embalado e congelado no mesmo dia; o cliente esquenta na air fryer.
HTML/CSS/JS puro, sem build e sem framework. Roda no Cloudflare Pages, com
os pedidos num banco D1 e um painel do dia atrás do Cloudflare Access.
Endereço: <https://esfihas.sayones.com.br/>.

## Arquivos

| Caminho          | O que é                                                        |
|------------------|----------------------------------------------------------------|
| `public/`        | O que o Cloudflare Pages serve                                  |
| `public/index.html` | Markup e CSS do site                                         |
| `public/app.js`, `public/regras.js` | A tela, e as regras de preço, datas e pontos (sem DOM) |
| `public/painel/` | Painel do dia (pedidos por data, pago e entregue)               |
| `public/fontes/` | Fontes Unbounded e Space Grotesk em woff2, com a licença OFL    |
| `public/_headers` | Cabeçalhos de segurança (CSP) e regras de cache                |
| `public/logo.svg`, `favicon.svg` | Logo horizontal e ícone da aba                  |
| `public/og-v2.png` | Imagem 1200×630 do preview no WhatsApp/Insta. Ao trocar, mude o nome (`og-v3.png`) e a meta `og:image`, senão o WhatsApp segue mostrando a antiga |
| `functions/`     | API em Pages Functions (`/api/pedidos`, `/api/agenda`, `/api/cupom`, `/api/painel/*`) |
| `migrations/`    | SQL do banco D1                                                 |
| `tests/`         | Suíte de navegador e testes de API                              |
| `CLAUDE.md`      | Contexto do projeto para o Claude Code, com decisões e armadilhas |

## Rodar localmente

Precisa de Node. Copie `.dev.vars.exemplo` para `.dev.vars` e, na raiz:

```bash
npx --yes wrangler@4.152.0 pages dev --port 8788 --local   # site, funções e banco local
```

Abra <http://127.0.0.1:8788/>. O banco local sai das `migrations/`
(`npx --yes wrangler@4.152.0 d1 migrations apply esfihas-pedidos --local`).

## Publicar

O deploy é o script `ops/publicar.sh` (`--so-testar` roda só os testes). Backup: `ops/backup.sh`. Passos manuais nos painéis: `ops/PASSOS-NO-PAINEL.md`. Redirecionamento do endereço antigo: `ops/redirecionamento/`. A branch `main` ainda publica o site
antigo no GitHub Pages: não dê push nela antes da troca de endereço. O push
vai por SSH, no alias `github-esfiharia` do `~/.ssh/config`, e não pelo `gh`.

## Mudar preços, sabores e WhatsApp

Tudo está em `public/regras.js` (os cupons, em `functions/_lib/cupons.js`):

```js
var WHATSAPP = "5548992210812";   // DDI 55 + DDD + número, só dígitos
var ANTECEDENCIA_H = 24;          // antecedência mínima do pedido, em horas

var SABORES = [ ... ];            // nome, descrição e cores da ilustração
var FAIXAS  = [ ... ];            // combos: quantidade mínima e preço por unidade
// functions/_lib/cupons.js:
// export const CUPONS = { PRIMEIRACOMPRA: 0.10 };  // código e desconto (0.10 = 10%)
```

### Combos (o desconto entra sozinho)

| Combo     | Esfihas | Por unidade | Total     | Desconto |
|-----------|---------|-------------|-----------|----------|
| Avulsa    | 1 a 3   | R$ 5,90     | –         | –        |
| Combo 4   | 4 a 7   | R$ 5,50     | R$ 22,00  | 7%       |
| Combo 8   | 8 a 11  | R$ 5,35     | R$ 42,80  | 9%       |
| Combo 12  | 12+     | R$ 5,20     | R$ 62,40  | 12%      |

Não é caixa fechada: o cliente mistura os sabores à vontade e o preço do combo
entra sozinho quando o **total** do pedido chega em 4, 8 ou 12 unidades.

### Cupons

O cliente digita o cupom na gaveta do pedido (vira maiúscula sozinho). O
desconto entra sobre o total, já com o combo, e o cupom vai escrito na
mensagem do WhatsApp. Pra criar ou tirar um cupom, mexa em `CUPONS`. O site
não sabe se é a primeira compra de alguém: isso se confere na conversa.

### Pontos de retirada

**Não existe delivery porta a porta.** Em cada dia levamos as encomendas a um
ponto do bairro e o cliente passa lá pra pegar. Por isso não há taxa de entrega.

| Ponto      | Dia     | Janela         |
|------------|---------|----------------|
| Trindade e UFSC | Seg e qui | 18h30 – 20h |
| Trindade e UFSC | Ter e qua | 18h30 – 22h |
| Itacorubi  | Seg a sex | 8h – 16h30   |
| Abraão     | Seg a sex | 9h – 12h     |

Os pontos vivem em **dois lugares**, que precisam andar juntos:

1. a seção "Entrega e horários" do `public/index.html` (o que o visitante lê);
2. o array `PONTOS` em `public/regras.js` (o que alimenta o seletor do pedido);

e o `openingHoursSpecification` do JSON-LD no `index.html`, se as janelas mudarem.

```js
var PONTOS = [
  // dias: 0 = domingo … 6 = sábado; janelas, quando o horário muda conforme o dia
  { nome:"Trindade", prep:"na", dias:[1,2,3,4], diaNome:"segunda a quinta",
    quando:"de segunda a quinta", janela:"18h30 às 20h",
    janelas:{ 1:"18h30 às 20h", 2:"18h30 às 22h", 3:"18h30 às 22h", 4:"18h30 às 20h" } },
  { nome:"Combinar outro ponto", dias:null }
];
```

Ao escolher um ponto, o site já sugere a próxima data daquele dia da semana
respeitando as 24h de antecedência.

### Adicionar um sabor novo

Acrescente um item em `SABORES`. O card, a ilustração e o carrinho se montam sozinhos:

```js
{ id:"frango", nome:"Frango com catupiry",
  desc:"Frango desfiado no tempero da casa com catupiry.",
  curta:"Frango com catupiry",
  icone:"#ic-calabresa" }
```

O `icone` aponta para um `<symbol>` do topo do `public/index.html`. Cada sabor tem
o seu (`#ic-calabresa`, `#ic-carne`, `#ic-queijo`, `#ic-marguerita`). Para um sabor novo, ou
reaproveite o desenho mais parecido ou duplique um `<symbol>` e troque as
cores do recheio.

Cada sabor tem seu próprio desenho, definido em `icone`. Use `veg:true` para
ganhar o selo "Vegetariana".

## Testes

Com o `wrangler pages dev` rodando na 8788:

```bash
node tests/servidor.mjs                                  # porta 8792: serve /tests e repassa o resto
node --test --test-concurrency=1 tests/api/*.test.mjs    # testes de API
node tests/rodar-playwright.cjs chromium "http://127.0.0.1:8792/tests/index.html"
```

Também dá pra abrir <http://127.0.0.1:8792/tests/index.html> num navegador:
a suíte carrega o site num iframe limpo, um teste por vez. Use
`--test-concurrency=1`, porque os testes de API zeram o banco local.

São 173 testes de navegador (preço por combo, carrinho, formulário de
retirada, mensagem do WhatsApp, persistência, acessibilidade, layout no
celular, cabeçalhos e fontes próprias) e 55 de API. Os casos ficam em
`tests/suite.js` e `tests/api/`, em português e sem dependência nenhuma.

Vale rodar depois de mexer em preço, sabor ou ponto de retirada: os testes
conferem, por exemplo, se o valor anunciado em cada combo bate com o que o
carrinho realmente cobra.

## Como o pedido chega até você

O cliente monta o pedido no site, o JavaScript grava uma cópia no banco e
abre o WhatsApp já preenchido. Você recebe como conversa normal e vê o dia
no painel. Se a gravação falhar, o pedido segue pelo WhatsApp. O carrinho
fica salvo no navegador dele (`localStorage`), então ele pode voltar depois.

Seu nome e o pedido ficam guardados só pra preparar a encomenda, e o site
avisa isso embaixo do botão de enviar.

## Próximos passos

Em ordem.

### 1. Publicar o site novo

Está em preparo no Cloudflare Pages, em <https://esfihas.sayones.com.br/>.
O `canonical`, o `og:url`, o `og:image` e o JSON-LD do `public/index.html` já
apontam pra esse endereço.

### 2. Depoimentos

A seção saiu do ar em 21/10/2026: os três eram inventados. Quando houver
elogios de verdade, com autorização de quem escreveu, ela pode voltar.

### 3. Instagram

O perfil `@esfihasayones` existe desde 19/10/2026. O `logo.svg` serve de foto.

### 4. Cadastrar no Google Meu Negócio

Para quem busca "esfiha florianópolis", o Google Business Profile pesa muito
mais que o site. O site tem o JSON-LD de negócio local pronto para ajudar,
mas sozinho ele não ranqueia.

### 5. Definir o endereço exato de cada ponto

Hoje o site diz que o ponto é combinado no WhatsApp. Quando os três pontos
estiverem definidos, vale escrever o endereço direto na página: menos
mensagem para responder.

## Quando tiver foto boa

Os cards usam ilustração SVG. Para trocar por foto, substitua o
`<svg class="card-ilu">` de cada sabor por:

```html
<img class="card-ilu" src="img/calabresa.jpg" alt="Esfiha de calabresa">
```

Foto quadrada, pelo menos 400×400, fundo claro. Vale trocar o `og-v2.png`
também: o preview do WhatsApp com foto de verdade rende mais que ilustração.

## Como o texto do site foi escrito

O dono não quer texto com cara de IA, e isso está valendo como regra do
projeto. Sem travessão (—), sem antítese ("não é X, é Y"), sem tríade
ritmada, sem "de verdade" e "do jeito certo". Português direto e concreto.

Existe um teste que falha se um travessão voltar ao texto visível. Os
detalhes estão no `CLAUDE.md`.
