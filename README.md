# Esfihas Sayones 🥟

Site de encomendas da Esfihas Sayones: esfiha caseira **congelada** em Florianópolis.
Tudo é assado, embalado e congelado no mesmo dia; o cliente esquenta na air fryer.
HTML/CSS/JS puro, sem build e sem servidor. Roda direto no GitHub Pages.

## Arquivos

| Arquivo        | O que é                                                        |
|----------------|----------------------------------------------------------------|
| `index.html`   | O site inteiro (HTML + CSS + JS num arquivo só)                |
| `logo.svg`     | Logo horizontal, pra usar no Instagram, cardápio impresso, etiqueta |
| `favicon.svg`  | Ícone da aba do navegador / selo quadrado                       |
| `og.png`       | Imagem 1200×630 do preview ao mandar o link no WhatsApp/Insta   |
| `.nojekyll`    | Faz o GitHub Pages servir os arquivos sem processar             |
| `tests/`       | Suíte de testes, roda no navegador sem instalar nada            |
| `CLAUDE.md`    | Contexto do projeto para o Claude Code, incluindo as decisões e as armadilhas já encontradas |

## Ver o site agora

Abra o `index.html` com dois cliques, ou sirva a pasta se quiser testar do
celular na mesma rede:

```bash
python3 -m http.server 8791
# http://127.0.0.1:8791/index.html
```

## O site no ar

<https://esfihasayones.github.io/> desde 16/09/2026.

O repositório é `esfihasayones/esfihasayones.github.io`, de uma conta criada
só para o negócio. Como o nome do repositório é `<usuário>.github.io`, o
Pages publica sozinho o que estiver na raiz da `main`, sem configurar nada:

```bash
git push origin main      # um ou dois minutos depois já está no ar
```

**Não use o `gh` neste repositório.** O `gh` desta máquina está logado na
conta do trabalho (`breno-sayao-ecdt`) e não enxerga esta. O push vai por SSH
no alias `github-esfiharia`, com chave própria (`~/.ssh/id_github_esfiharia`),
no mesmo padrão do alias `github-econodata` que já existia. Em outra máquina,
gere uma chave nova, cadastre em github.com/settings/keys logado como
`esfihasayones` e repita o bloco no `~/.ssh/config`.

## Mudar preços, sabores e WhatsApp

Tudo está num único bloco no fim do `index.html`, logo depois de
`CONFIGURAÇÃO: é só aqui que você mexe`:

```js
var WHATSAPP = "5548988106499";   // DDI 55 + DDD + número, só dígitos
var ANTECEDENCIA_H = 24;          // antecedência mínima do pedido, em horas

var SABORES = [ ... ];            // nome, descrição e cores da ilustração
var FAIXAS  = [ ... ];            // combos: quantidade mínima e preço por unidade
```

### Combos (o desconto entra sozinho)

| Combo     | Esfihas | Por unidade | Total     | Desconto |
|-----------|---------|-------------|-----------|----------|
| Avulsa    | 1 a 3   | R$ 5,00     | –         | –        |
| Combo 4   | 4 a 7   | R$ 4,75     | R$ 19,00  | 5%       |
| Combo 8   | 8 a 11  | R$ 4,60     | R$ 36,80  | 8%       |
| Combo 12  | 12+     | R$ 4,50     | R$ 54,00  | 10%      |

Não é caixa fechada: o cliente mistura os sabores à vontade e o preço do combo
entra sozinho quando o **total** do pedido chega em 4, 8 ou 12 unidades.

### Pontos de retirada

**Não existe delivery porta a porta.** Em cada dia levamos as encomendas a um
ponto do bairro e o cliente passa lá pra pegar. Por isso não há taxa de entrega.

| Ponto      | Dia     | Janela         |
|------------|---------|----------------|
| Trindade   | Quinta  | 18h30 – 20h30  |
| Itacorubi  | Sexta   | 18h30 – 20h30  |
| Centro     | Sábado  | 14h – 17h      |

Os pontos vivem em **dois lugares** do `index.html`, que precisam andar juntos:

1. a seção "Entrega e horários" (o que o visitante lê);
2. o array `PONTOS` no JavaScript (o que alimenta o seletor do pedido);

e o `openingHoursSpecification` do JSON-LD, se as janelas mudarem.

```js
var PONTOS = [
  { nome:"Trindade", dia:4, diaNome:"quinta", janela:"18h30 às 20h30" },
  // dia: 0 = domingo … 6 = sábado
  { nome:"Combinar outro ponto", dia:null }
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

O `icone` aponta para um `<symbol>` do topo do `index.html`. Cada sabor tem
o seu (`#ic-calabresa`, `#ic-carne`, `#ic-queijo`). Para um sabor novo, ou
reaproveite o desenho mais parecido ou duplique um `<symbol>` e troque as
cores do recheio.

Cada sabor tem seu próprio desenho, definido em `icone`. Use `veg:true` para
ganhar o selo "Vegetariana".

## Testes

Abra `tests/index.html` no navegador e a suíte roda sozinha. Não precisa
instalar nada: ela carrega o site num iframe limpo, um teste por vez, e
mostra o que passou e o que quebrou.

```bash
python3 -m http.server 8791
# depois: http://127.0.0.1:8791/tests/index.html
```

São 96 testes cobrindo preço por combo, carrinho, formulário de retirada,
mensagem do WhatsApp, persistência, acessibilidade e layout no celular.
Os casos ficam em `tests/suite.js`, em português e sem dependência nenhuma.

Vale rodar depois de mexer em preço, sabor ou ponto de retirada: os testes
conferem, por exemplo, se o valor anunciado em cada combo bate com o que o
carrinho realmente cobra.

## Como o pedido chega até você

Não existe backend. O cliente monta o pedido no site, o JavaScript escreve a
mensagem e abre o WhatsApp já preenchido. Você recebe como conversa normal.
O carrinho fica salvo no navegador dele (`localStorage`), então ele pode voltar
depois sem perder o que escolheu.

## Próximos passos

Em ordem. Os dois primeiros travam a publicação.

### 1. Publicar o site

Feito em 16/09/2026. Está em <https://esfihasayones.github.io/>, na conta
`esfihasayones`. Como publicar de novo está em **O site no ar**, mais acima.

### 2. Trocar os depoimentos

Os três da seção "O que os clientes falam" são **inventados**, com nome e
bairro fictícios. Não publique como se fossem reais. Assim que as primeiras
encomendas saírem, peça autorização e troque por elogios de verdade.

### 3. Ajustar o canonical

Feito: o site está em <https://esfihasayones.github.io/> e o `canonical`, o
`og:url`, o `og:image` e o JSON-LD já apontam pra lá. Se um dia trocar por
domínio próprio, essas quatro linhas do `index.html` mudam juntas.

### 4. Criar o perfil no Instagram

O rodapé aponta para `@esfihasayones`, que ainda não existe. Crie ou corrija
a URL. O `logo.svg` serve de foto de perfil.

### 5. Cadastrar no Google Meu Negócio

Para quem busca "esfiha florianópolis", o Google Business Profile pesa muito
mais que o site. O site tem o JSON-LD de negócio local pronto para ajudar,
mas sozinho ele não ranqueia.

### 6. Definir o endereço exato de cada ponto

Hoje o site diz que o ponto é combinado no WhatsApp. Quando os três pontos
estiverem definidos, vale escrever o endereço direto na página: menos
mensagem para responder.

## Quando tiver foto boa

Os cards usam ilustração SVG. Para trocar por foto, substitua o
`<svg class="card-ilu">` de cada sabor por:

```html
<img class="card-ilu" src="img/calabresa.jpg" alt="Esfiha de calabresa">
```

Foto quadrada, pelo menos 400×400, fundo claro. Vale trocar o `og.png`
também: o preview do WhatsApp com foto de verdade rende mais que ilustração.

## Como o texto do site foi escrito

O dono não quer texto com cara de IA, e isso está valendo como regra do
projeto. Sem travessão (—), sem antítese ("não é X, é Y"), sem tríade
ritmada, sem "de verdade" e "do jeito certo". Português direto e concreto.

Existe um teste que falha se um travessão voltar ao texto visível. Os
detalhes estão no `CLAUDE.md`.
