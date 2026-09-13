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

## Publicar no GitHub Pages

O repositório já está iniciado (`main`) com o primeiro commit feito.
Falta só criar o repo remoto e dar push:

```bash
# cria o repo na sua conta e já faz o push
gh repo create esfihas-sayones --public --source=. --push

# ligar o Pages
gh api -X POST repos/:owner/esfihas-sayones/pages -f "source[branch]=main" -f "source[path]=/"
```

Ou pelo site: crie o repositório vazio no GitHub e então

```bash
git remote add origin https://github.com/SEU-USUARIO/esfihas-sayones.git
git push -u origin main
```

Depois: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
Em 1–2 minutos o site está no ar em `https://SEU-USUARIO.github.io/esfihas-sayones/`.

Assim que souber a URL, abra o `index.html` e troque a linha do `<link rel="canonical">`
(está marcada com um comentário no topo do arquivo). Ela e as tags `og:` são o que
o WhatsApp lê pra montar o preview quando você mandar o link.

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

São 72 testes cobrindo preço por combo, carrinho, formulário de retirada,
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

## Coisas para ajustar quando o negócio andar

- **Pontos e horários** (ver acima, são três lugares pra manter em sincronia)
- **Endereço exato de cada ponto**: hoje o site diz que é combinado no WhatsApp
- **Depoimentos**: hoje são exemplos, troque por elogios reais de clientes
- **Instagram**: o link aponta para `@esfihasayones`, crie o perfil ou corrija a URL
- **Fotos**: os cards usam ilustração SVG. Quando tiver foto boa, troque o
  `<svg class="card-ilu">` por `<img class="card-ilu" src="img/calabresa.jpg" alt="...">`
- **Google Empresarial**: cadastre o negócio no Google Business Profile.
  Para busca local ("esfiha florianópolis") isso pesa muito mais que o site.
