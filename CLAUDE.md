# Esfihas Sayones

Site de encomendas de uma esfiharia caseira de verdade, do Breno, em
Florianópolis. Negócio novo. HTML/CSS/JS puro num arquivo só, sem build e sem
backend, servido pelo GitHub Pages.

## Estado (16/09/2026)

No ar em <https://esfihasayones.github.io/>, repositório
`esfihasayones/esfihasayones.github.io`. O Pages republica sozinho a cada
push na `main`, porque o nome do repositório é `<usuário>.github.io`.

**O push vai por SSH, nunca pelo `gh`.** O `gh` desta máquina está logado na
conta do trabalho e não enxerga esta; o remoto usa o alias
`github-esfiharia` do `~/.ssh/config`, com chave própria.

Falta antes de divulgar: os três depoimentos são inventados e não podem ficar
no ar como reais, o Instagram `@esfihasayones` do rodapé não existe e o
Google Meu Negócio não foi cadastrado. Os detalhes estão no `README.md`.

## O negócio (decisões tomadas com o dono, não invente outras)

**Só congelada.** Assar e entregar quente exige rota apertada e cliente em
casa na hora certa. Congelada, ele produz em lote e entrega quando dá. O
argumento de venda virou "pronta em 6 minutos na air fryer".

**Não existe delivery porta a porta.** Em cada dia ele leva as encomendas a
um ponto combinado do bairro e o cliente passa lá para pegar. Por isso não
há taxa de entrega. Nunca escreva "entregamos na sua casa".

**Pontos e dias (21/10/2026):** Trindade/UFSC segunda e quinta 18h30–20h,
terça e quarta 18h30–22h; Itacorubi de segunda a sexta 8h–16h30; Centro no
sábado 14h–17h. Cada ponto em `PONTOS` tem uma lista `dias` e, quando o
horário muda conforme o dia, um mapa `janelas`. UFSC não é ponto separado, faz
parte da Trindade.

**Sabores e receitas** (confirmadas pelo dono):
- Calabresa: calabresa moída, cebola e muçarela (azeitona e pimenta saíram
  em 21/10/2026)
- Carne: carne bovina moída com cebola e tomate
- Queijo: muçarela com requeijão e orégano
- Marguerita: muçarela, tomate e manjericão (entrou em 19/10/2026, mesmo
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

Tudo em `index.html`: markup, CSS e JS num arquivo. É de propósito, para
publicar sem passo de build. `logo.svg`, `favicon.svg` e `og.png` são
gerados; `tests/` tem a suíte.

**O bloco de configuração** fica no começo do `<script>`, marcado com
`CONFIGURAÇÃO`. Preço, sabor e ponto de retirada se mudam ali.

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

**A mensagem do WhatsApp** é montada no cliente e aberta via `wa.me`. Não há
servidor: o pedido chega como conversa normal no (48) 98810-6499.

## Testes

```bash
python3 -m http.server 8791
# http://127.0.0.1:8791/tests/index.html
```

107 testes em `tests/suite.js`, sem dependência. O runner carrega o site num
iframe limpo, um teste por vez. `window.RESULTADO` expõe o resultado para
automação.

Rode depois de mexer em preço, sabor ou ponto. Um dos testes confere se o
valor anunciado em cada combo bate com o que o carrinho realmente cobra.

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
