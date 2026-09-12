# Esfihas Sayones 🥟

Site de encomendas da Esfihas Sayones — esfiha caseira **congelada** em Florianópolis.
Tudo é assado, embalado e congelado no mesmo dia; o cliente esquenta na air fryer.
HTML/CSS/JS puro, sem build e sem servidor. Roda direto no GitHub Pages.

## Arquivos

| Arquivo        | O que é                                                        |
|----------------|----------------------------------------------------------------|
| `index.html`   | O site inteiro (HTML + CSS + JS num arquivo só)                |
| `logo.svg`     | Logo horizontal — use no Instagram, cardápio impresso, etiqueta |
| `favicon.svg`  | Ícone da aba do navegador / selo quadrado                       |
| `.nojekyll`    | Faz o GitHub Pages servir os arquivos sem processar             |

## Publicar no GitHub Pages

```bash
git init
git add .
git commit -m "site da Esfihas Sayones"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/esfihas-sayones.git
git push -u origin main
```

Depois, no GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
Em 1–2 minutos o site está no ar em `https://SEU-USUARIO.github.io/esfihas-sayones/`.

Assim que souber a URL, abra o `index.html` e troque a linha do `<link rel="canonical">`
(está marcada com um comentário no topo do arquivo).

## Mudar preços, sabores e WhatsApp

Tudo está num único bloco no fim do `index.html`, logo depois de
`CONFIGURAÇÃO — é só aqui que você mexe`:

```js
var WHATSAPP = "5548988106499";   // DDI 55 + DDD + número, só dígitos
var ANTECEDENCIA_H = 24;          // antecedência mínima do pedido, em horas

var SABORES = [ ... ];            // nome, descrição e cores da ilustração
var FAIXAS  = [ ... ];            // combos: quantidade mínima e preço por unidade
```

### Combos (o desconto entra sozinho)

| Combo     | Esfihas | Por unidade | Total     | Desconto |
|-----------|---------|-------------|-----------|----------|
| Avulsa    | 1 a 3   | R$ 5,00     | —         | —        |
| Combo 4   | 4 a 7   | R$ 4,75     | R$ 19,00  | 5%       |
| Combo 8   | 8 a 11  | R$ 4,60     | R$ 36,80  | 8%       |
| Combo 12  | 12+     | R$ 4,50     | R$ 54,00  | 10%      |

Não é caixa fechada: o cliente mistura os sabores à vontade e o preço do combo
entra sozinho quando o **total** do pedido chega em 4, 8 ou 12 unidades.

### Entrega

Rota fixa, uma saída por dia — é o que cabe numa operação caseira sem
depender de aplicativo:

| Dia                  | Bairros                   |
|----------------------|---------------------------|
| Quinta, 18h30–20h30  | Trindade e UFSC           |
| Sexta, 18h30–20h30   | Itacorubi e Centro        |
| Sábado, 14h–17h      | Todos os bairros          |
| Retirada             | Qualquer dia, a combinar  |

Sem taxa a partir de 8 unidades; abaixo disso, R$ 5 de deslocamento.
Isso está escrito na seção "Entrega e horários" do `index.html` — mude lá e no
`openingHoursSpecification` do JSON-LD se as rotas mudarem.

### Adicionar um sabor novo

Acrescente um item em `SABORES`. O card, a ilustração e o carrinho se montam sozinhos:

```js
{ id:"frango", nome:"Frango com catupiry",
  desc:"Frango desfiado no tempero da casa com catupiry.",
  cores:{ recheio:"#E8D2A0", pedaco:"#C79A52", erva:"#7A9455" } }
```

`recheio` é a cor do miolo, `pedaco` são os pedacinhos maiores e `erva` são os
temperinhos. Use `veg:true` para ganhar o selo "Vegetariana".

## Como o pedido chega até você

Não existe backend. O cliente monta o pedido no site, o JavaScript escreve a
mensagem e abre o WhatsApp já preenchido — você recebe como conversa normal.
O carrinho fica salvo no navegador dele (`localStorage`), então ele pode voltar
depois sem perder o que escolheu.

## Coisas para ajustar quando o negócio andar

- **Rotas e horários** (seção "Entrega e horários" e o `openingHoursSpecification` no JSON-LD)
- **Depoimentos** — hoje são exemplos; troque por elogios reais de clientes
- **Instagram** — o link aponta para `@esfihasayones`; crie o perfil ou corrija a URL
- **Fotos** — os cards usam ilustração SVG. Quando tiver foto boa, troque o
  `<svg class="card-ilu">` por `<img class="card-ilu" src="img/calabresa.jpg" alt="...">`
- **Google Empresarial** — cadastre o negócio no Google Business Profile.
  Para busca local ("esfiha florianópolis") isso pesa muito mais que o site.
