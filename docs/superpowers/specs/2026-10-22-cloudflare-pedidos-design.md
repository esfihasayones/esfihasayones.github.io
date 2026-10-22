# Mudança pro Cloudflare, pedidos no banco e painel do dia

Data: 22/10/2026. Combinado com o Breno (dono) nesta conversa.

## Por quê

O site está no GitHub Pages, em repositório público, e os pedidos só existem
como mensagem no WhatsApp. Três coisas mudaram no mesmo dia:

- O Breno comprou `sayones.com.br` (registro.br, até 22/10/2028) e já
  delegou os nameservers pro Cloudflare (`darwin.ns.cloudflare.com`,
  `lorna.ns.cloudflare.com`), conta free, zona `sayones.com.br` criada. A
  delegação estava "em transição" por cerca de 2h na hora da troca.
- Ele quer o código fora da vista: hoje qualquer um lê no GitHub os testes,
  a documentação, a conta de custo e a lista de cupons.
- Os primeiros pedidos reais chegaram (22/10) e ele precisa ver, no dia, o
  que montar e quem vai buscar onde. A planilha Google com Apps Script, que
  estava a meio caminho, fica abandonada: o banco do Cloudflare (D1) a
  substitui.

Sucesso, pra ele: abrir o painel no celular no dia de entrega e saber na
hora quanto montar de cada sabor e quem passa em cada ponto, com pago e
entregue marcados ali mesmo.

## Objetivos

1. O site no ar em `https://esfihas.sayones.com.br` pelo Cloudflare Pages, plano free.
   `sayones.com.br` é a marca guarda-chuva: outros subdomínios podem nascer
   dela depois. Por enquanto a raiz e o `www` redirecionam pro `esfihas.`.
2. Cada pedido enviado pelo site gravado no D1 com número em sequência.
3. Painel em `esfihas.sayones.com.br/painel`, só pra ele, focado no dia.
4. Regras de preço e cupom conferidas no servidor; a lista de cupons sai do
   código público.
5. Repositório GitHub privado (cópia de segurança, grátis), e o endereço
   antigo `esfihasayones.github.io` redirecionando pro novo.

## Fora do escopo (pode vir depois)

Relatório mensal, histórico por cliente, pagamento online, login de mais de
uma pessoa, notificação automática.

## Anti-objetivos (falhar nisso é falhar, mesmo funcionando)

- **Pedido perdido.** Se a gravação no banco falhar, o WhatsApp abre do
  mesmo jeito e o pedido segue como hoje. O cliente nunca fica travado por
  causa do banco.
- **Site fora do ar na mudança.** Links antigos (Instagram, mensagens já
  mandadas, o QR da camisa se apontar pro github.io) continuam levando ao site.
- **Framework e build.** Decisão do dono: HTML e JavaScript puro, sem Vue,
  sem Node no servidor, sem Docker, sem Python. Node só na máquina dele, pro
  `wrangler`. Nada de etapa de build pro site.
- **Texto com cara de IA.** Valem as regras do `CLAUDE.md` (sem travessão
  etc.) também no painel.
- **Expor dado de cliente.** Nome, pedido e observação de cliente nunca
  saem por rota sem a proteção do painel.

## Restrições

- Cloudflare plano free: Pages, Pages Functions (Workers, 100 mil
  requisições/dia), D1 (5 GB).
- O dono roda `! npx wrangler login` nesta máquina pra autorizar o deploy.
- Push no GitHub só por SSH (alias `github-esfiharia`), nunca `gh`.
- Testes e builds com no máximo 4 workers (preferência global dele).
- Datas no fuso de Brasília; as regras de antecedência, feriado e janela por
  ponto que já existem no `index.html` continuam valendo e passam a ser
  conferidas também no servidor.

## O que ele decidiu

**Hospedagem e código.** Cloudflare Pages com deploy pelo terminal
(`wrangler pages deploy`), subindo só a pasta `public/`. GitHub fica privado,
só como cópia. Um repositório público mínimo novo assume o
`esfihasayones.github.io` e só redireciona pro `esfihas.sayones.com.br` (mantendo o
caminho, se houver).

**Estrutura.**

```
public/              o que vai pro ar, e só isso
  index.html         o site, sem o JavaScript embutido
  app.js             o comportamento do site (o que hoje é o <script> do index)
  regras.js          sabores, combos, pontos, janelas, feriados, antecedência
  painel/index.html  o painel
  painel/painel.js
  *.svg, og-v2.png
functions/api/       Pages Functions
migrations/          SQL do D1
wrangler.toml
tests/               não sobe
```

`regras.js` é lido pelo site e pelas funções, pra o preço que o cliente vê
nunca divergir do que é gravado. **Cupons não ficam em `regras.js`**: ficam
só do lado do servidor.

**Cupom.** O site pergunta ao servidor se o código existe e quanto ele
desconta. A regra de hoje continua: 10% sobre o total já com combo,
PRIMEIRACOMPRA, campo em maiúscula, cupom errado barra o envio.

**Gravação do pedido.** No clique de enviar, o site manda o pedido pro
servidor, que confere tudo (sabores, quantidades, ponto, data, antecedência,
cupom), recalcula o valor e grava. Valor mandado pelo cliente é ignorado.

**Painel**, pensado pro celular:

- No topo, o dia (padrão hoje, com troca pra outro dia): total por sabor a
  ter pronto, contando só pedidos confirmados.
- Abaixo, os pedidos do dia agrupados por ponto: Nº, nome, itens, valor,
  cupom, observações, com botões grandes "Pago" e "Entregue".
- Depois, os próximos dias em lista resumida.
- "Novo pedido" pra lançar à mão o que chega direto no WhatsApp (ponto e
  dia livres, como "Centro, sábado, horário a combinar", que o site não
  oferece). O preço sai calculado pelas mesmas regras, com campo pra ajustar
  quando ele combinar outro valor.
- Pedido vindo do site entra como **aguardando** e só conta no total depois
  que ele toca **Confirmar** (o cliente pode clicar em enviar e nunca mandar
  a mensagem). Pedido manual já entra confirmado.
- **Cancelar** marca como cancelado; nada é apagado.
- Os dois pedidos reais de 22/10 são lançados no painel quando
  ele estiver pronto. Os dados estão na memória do projeto, fora do repo.

**Proteção do painel.** O painel e as rotas dele só respondem pra quem
entrar com `brenojulianom@gmail.com` (decidido; é o e-mail da conta
Cloudflare e o central dos projetos dele).

**Edição.** O painel edita pedido já gravado (sabores, quantidades, dia,
ponto, nome, observação, valor), mantendo o Nº. O preço é recalculado pelas
regras, a não ser que ele tenha ajustado o valor à mão.

**Capacidade.** Ele produz segunda, quinta, sexta, sábado e domingo, umas
80 esfihas por dia, variando. Quando o total de pedidos de um dia de
retirada passa do limite, o site para de oferecer aquele dia.

**Prazo.** Tentar ter o painel pras entregas de 23 e 24/10, sem obrigação.
Painel e banco vêm antes da mudança de domínio.

**Endereços.** Canonical, `og:url`, `og:image` e JSON-LD passam pra
`https://esfihas.sayones.com.br/`. O QR da camisa (arquivo final ainda pendente) e o
link do Instagram passam pro domínio novo.

## Decisões minhas (o dono pode rever)

- **Status do pedido:** `aguardando`, `confirmado`, `cancelado`, e duas
  marcas independentes, `pago` e `entregue`.
- **Capacidade por dia de retirada:** limite único de 80 esfihas por data
  de retirada, ajustável no painel, e um botão pra bloquear um dia ou pausar
  os pedidos. Não modelo o dia de produção: a esfiha é congelada e ele
  produz antes, então o limite vale sobre a data em que o cliente busca.
- **Proteção:** Cloudflare Access (Zero Trust, grátis até 50 usuários) no
  caminho `/painel*` e `/api/painel/*`, liberando o e-mail do dono. As
  funções do painel também conferem o cabeçalho de identidade do Access, pra
  não depender só da regra de rota. Se o Zero Trust pedir cartão ou travar o
  plano free, a alternativa é senha num segredo do Worker (Basic Auth) e
  isso volta pro dono decidir.
- **Número do pedido:** o `id` do banco, em sequência. Não vai na mensagem
  do WhatsApp: esperar a resposta do servidor antes de abrir o WhatsApp faz
  o Safari bloquear a janela. A gravação vai em paralelo (`fetch` com
  `keepalive`) e o pedido "aguardando" é casado com a mensagem pelo nome e
  pelo horário.
- **Itens no banco:** guardados como JSON (`[{sabor, qtd, obs}]`), porque o
  cardápio muda; o total por sabor sai com `json_each` no SQL.
- **Dinheiro em centavos**, inteiro, no banco.
- **Abuso:** validação no servidor, limite de tamanho por campo, e uma regra
  de limite de requisições do plano free na rota de gravação. Turnstile
  (captcha invisível) fica de fora por enquanto.
- **Testes:** a suíte atual passa a rodar contra `wrangler pages dev`, que
  serve o site e as funções localmente com um D1 local. Testes novos cobrem
  as funções (preço recalculado, cupom inválido, antecedência, feriado) e o
  painel.

- **Pedido reprovado pelo servidor** (antecedência, feriado, cupom, relógio
  do celular adiantado) **é gravado mesmo assim**, com status
  `fora_da_regra` e o motivo. O painel mostra esses numa seção de
  pendências no topo, porque o WhatsApp abre de qualquer jeito e a mensagem
  vai chegar. Se o `fetch` falhar de vez, o pedido só existe no WhatsApp e
  ele lança à mão, como hoje.
- **Os dois pedidos de 22/10** entram no painel pelo "Novo pedido"; itens,
  valores e nomes estão na memória do projeto, fora do repositório.

## Boas práticas que entram com a mudança (revisão de dev staff)

- **Deploy pelo Git, não pelo terminal.** O Cloudflare Pages liga direto no
  repositório privado: push na `main` publica, como hoje; cada branch ganha
  um endereço de prévia. Diretório de saída `public/`, `functions/` na
  raiz. Dispensa o `wrangler login` pra publicar (continua útil pro D1).
- **Banco separado pra prévia e testes.** Um D1 de produção e outro de
  prévia; a suíte nunca grava no de produção.
- **Cabeçalhos de segurança** num `public/_headers`: CSP restrita (dá pra
  fazer agora que o JavaScript sai do HTML), HSTS, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`. O painel
  com `noindex` e sem cache.
- **Cache:** imagens e ícones com nome versionado e cache longo; HTML e JS
  revalidando a cada visita, pra mudança de preço valer na hora.
- **Fontes servidas do próprio domínio** em vez do Google Fonts: uma
  conexão a menos no celular e nenhum dado do visitante indo pro Google.
- **LGPD:** agora o site guarda nome e pedido. Uma frase curta perto do
  botão de enviar dizendo o que é guardado e pra quê, e nome e observação
  apagados (anonimizados) depois de 12 meses.
- **Cópia do banco:** o D1 tem volta no tempo nativa por alguns dias; além
  disso, exportação periódica (`wrangler d1 export`) pra fora do Cloudflare.
- **Pedido duplicado:** cada envio leva um identificador gerado no
  navegador; o servidor ignora o mesmo identificador duas vezes.
- **Endereço único:** `sayones.com.br` e `www.` redirecionam pro `esfihas.`,
  HTTPS sempre, `robots.txt`, `sitemap.xml` e página 404 própria.
- **Medição:** Cloudflare Web Analytics (grátis, sem cookie) no lugar da
  ideia do SimpleAnalytics. O funil de pedido sai do próprio banco
  (aguardando contra confirmado).
- **Logs:** os erros das funções aparecem no painel do Cloudflare e no
  `wrangler tail`; nada de dado de cliente no log.

## Deixado pro construtor

Nomes de rotas e de colunas, layout visual do painel (seguindo a identidade
do site: tinta `#121212` sobre `#F7F6F2`, Unbounded e Space Grotesk), ordem
dos passos da mudança desde que o site nunca fique fora do ar, e como
dividir o `app.js`.
