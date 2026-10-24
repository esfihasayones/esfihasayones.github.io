/* Configuração: é só aqui que você mexe pra mudar preços, sabores e pontos. */
export const WHATSAPP = "5548992210812";          // DDI 55 + DDD 48 + número
export const ANTECEDENCIA_H = 24;                  // horas mínimas entre o pedido e o começo da retirada
export const PEDIDO_GRANDE = 40;                   // acima disso...
export const ANTECEDENCIA_GRANDE_H = 72;           // ...a antecedência sobe pra 3 dias
// A esfiha é montada e assada depois do pedido, num dia de produção antes da
// retirada. Terça e quarta não tem produção (retirada pode). Pedido feito até
// as 18h ainda entra na produção do mesmo dia; depois disso, só no seguinte.
export const DIAS_SEM_PRODUCAO = [2, 3];           // 0 = domingo ... 6 = sábado
export const HORA_LIMITE_PRODUCAO = 18;
export const MAX_DIAS_RETIRADA = 90;               // encomenda só até 90 dias antes

// Dias sem retirada, em qualquer ponto. Feriados nacionais e o aniversário
// de Florianópolis; Carnaval e Corpus Christi são ponto facultativo e ficam
// de fora. Acrescente aqui as folgas e os próximos anos.
export const FERIADOS = {
  "2026-11-02":"Finados", "2026-11-15":"Proclamação da República",
  "2026-11-20":"Consciência Negra", "2026-12-25":"Natal",
  "2027-01-01":"Ano-Novo", "2027-03-23":"aniversário de Florianópolis",
  "2027-03-26":"Sexta-feira Santa", "2027-04-21":"Tiradentes",
  "2027-05-01":"Dia do Trabalho", "2027-09-07":"Independência",
  "2027-10-12":"Nossa Senhora Aparecida", "2027-11-02":"Finados",
  "2027-11-15":"Proclamação da República", "2027-11-20":"Consciência Negra",
  "2027-12-25":"Natal",
  "2028-01-01":"Ano-Novo", "2028-03-23":"aniversário de Florianópolis",
  "2028-04-14":"Sexta-feira Santa", "2028-04-21":"Tiradentes",
  "2028-05-01":"Dia do Trabalho", "2028-09-07":"Independência",
  "2028-10-12":"Nossa Senhora Aparecida", "2028-11-02":"Finados",
  "2028-11-15":"Proclamação da República", "2028-11-20":"Consciência Negra",
  "2028-12-25":"Natal"
};

// Pontos de retirada. Não há entrega porta a porta: em cada dia levamos as
// encomendas a um ponto do bairro.
// `prep` é a preposição do bairro ("na Trindade", "no Itacorubi").
export const PONTOS = [
  // dias: 0 = domingo ... 6 = sábado. `quando` é como a frase fala dos dias.
  // `janela` é o horário; quando muda conforme o dia, `janelas` diz o de cada um.
  { nome:"Trindade",  prep:"na", dias:[1,2,3,4],   diaNome:"segunda a quinta", quando:"de segunda a quinta", janela:"18h30 às 20h",
    janelas:{ 1:"18h30 às 20h", 2:"18h30 às 22h", 3:"18h30 às 22h", 4:"18h30 às 20h" } },
  { nome:"Itacorubi", prep:"no", dias:[1,2,3,4,5], diaNome:"segunda a sexta",  quando:"de segunda a sexta",  janela:"8h às 16h30" },
  { nome:"Abraão",    prep:"no", dias:[1,2,3,4,5], diaNome:"segunda a sexta",  quando:"de segunda a sexta",  janela:"9h às 12h" },
  { nome:"Centro",    prep:"no", dias:[1,2,3,4],   diaNome:"segunda a quinta", quando:"de segunda a quinta", janela:"19h às 21h" },
  { nome:"Combinar outro ponto", dias:null }
];

export const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export const SABORES = [
  // `curta` é a versão que aparece no card compacto do celular.
  { id:"calabresa", nome:"Calabresa",
    desc:"Molho de tomate, calabresa moída, cebola e muçarela.",
    curta:"Molho, cebola e muçarela",
    icone:"#ic-calabresa" },
  { id:"carne", nome:"Carne",
    desc:"Carne bovina moída com cebola e tomate.",
    curta:"Cebola, tomate e tempero",
    icone:"#ic-carne" },
  { id:"queijo", nome:"Queijo",
    desc:"Muçarela com requeijão e orégano.",
    curta:"Muçarela com orégano",
    icone:"#ic-queijo", veg:true },
  { id:"marguerita", nome:"Marguerita",
    desc:"Molho de tomate, muçarela, tomate e manjericão.",
    curta:"Molho, tomate e manjericão",
    icone:"#ic-marguerita", veg:true }
];

// Combos por quantidade total do pedido (ordem: maior mínimo primeiro).
// O desconto entra sozinho quando o cliente chega na quantidade.
export const FAIXAS = [
  { min:12, preco:5.20, nome:"Combo 12", destaque:true },
  { min:8,  preco:5.35, nome:"Combo 8"  },
  { min:4,  preco:5.50, nome:"Combo 4"  },
  { min:1,  preco:5.90, nome:"Avulsa"   }
];

/* ---------- funções puras (sem DOM, sem relógio próprio) ---------- */

export function faixaDe(qtd){
  for (let i = 0; i < FAIXAS.length; i++){ if (qtd >= FAIXAS[i].min) return FAIXAS[i]; }
  return FAIXAS[FAIXAS.length-1];
}

// Preço por unidade e total em centavos inteiros, sem cupom.
export function precoCentavos(qtd){
  const unit = Math.round(faixaDe(qtd).preco * 100);
  return { unit: unit, total: qtd * unit };
}

// O dia e a hora valem sempre no horário de Brasília: com o celular em
// outro fuso a antecedência saía errada pros dois lados.
const formatadorBrasilia = (function(){
  try {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit" });
    if (/^\d{4}-\d\d-\d\d$/.test(f.format(new Date()))) return f;
  } catch(e){}
  return null;
})();
export function isoBrasilia(ms){
  const d = new Date(ms);
  if (formatadorBrasilia) return formatadorBrasilia.format(d);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

const dois = function(n){ return String(n).padStart(2, "0"); };

// Dia da semana (0 = domingo) de uma data "AAAA-MM-DD".
export function diaDaData(dataIso){ return new Date(dataIso + "T12:00:00Z").getUTCDay(); }
export function janelaDe(ponto, dia){ return (ponto.janelas && ponto.janelas[dia]) || ponto.janela; }

// A antecedência conta em horas até o começo da janela, não em dias do
// calendário: pedir quarta às 23h pra quinta às 8h dá só 9 horas.
export function horasAntecedencia(qtd){ return qtd > PEDIDO_GRANDE ? ANTECEDENCIA_GRANDE_H : ANTECEDENCIA_H; }

export function inicioRetirada(ponto, dataIso){
  const m = /^(\d+)h(\d*)/.exec(janelaDe(ponto, diaDaData(dataIso)));
  const h = m ? +m[1] : ponto.inicio, min = m && m[2] ? +m[2] : 0;
  return new Date(dataIso + "T" + dois(h) + ":" + dois(min) + ":00-03:00");
}

const somaDiasIso = (dataIso, n) => new Date(Date.parse(dataIso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

// Existe dia de produção entre o pedido (feito agora) e a véspera da retirada?
export function temProducao(dataIso, agoraMs){
  const horaBrasilia = new Date(agoraMs - 3 * 3600 * 1000).getUTCHours();   // Brasília é -03:00 o ano todo
  let d = isoBrasilia(agoraMs);
  if (horaBrasilia >= HORA_LIMITE_PRODUCAO) d = somaDiasIso(d, 1);
  for (; d < dataIso; d = somaDiasIso(d, 1)) {
    if (DIAS_SEM_PRODUCAO.indexOf(diaDaData(d)) === -1) return true;
  }
  return false;
}

// "ok", "feriado", "dia" (o ponto não abre nesse dia), "lotado" ou "bloqueado"
// (os dois vêm da agenda do servidor, em `bloqueados`: Map dia -> motivo),
// "cedo" (falta antecedência), "producao" (não sobra dia de produção antes)
// ou "longe" (mais de MAX_DIAS_RETIRADA dias à frente).
export function situacaoData(ponto, dataIso, qtd, agoraMs, bloqueados){
  if (dataIso > isoBrasilia(agoraMs + MAX_DIAS_RETIRADA * 86400000)) return "longe";
  if (FERIADOS[dataIso]) return "feriado";
  if (ponto.dias.indexOf(diaDaData(dataIso)) === -1) return "dia";
  if (bloqueados && bloqueados.has(dataIso)) return bloqueados.get(dataIso);
  const limite = agoraMs + horasAntecedencia(qtd) * 3600 * 1000;
  if (inicioRetirada(ponto, dataIso).getTime() < limite) return "cedo";
  return temProducao(dataIso, agoraMs) ? "ok" : "producao";
}

// Primeira data em que o ponto abre, que respeita a antecedência e que não
// está lotada nem bloqueada (`bloqueados` é o mesmo Map de situacaoData).
export function proximaData(ponto, qtd, agoraMs, bloqueados){
  for (let i = 0; i < 21; i++){
    const v = isoBrasilia(agoraMs + i*86400000);   // Brasília não tem horário de verão
    if (situacaoData(ponto, v, qtd, agoraMs, bloqueados) === "ok") return v;
  }
  return isoBrasilia(agoraMs + horasAntecedencia(qtd) * 3600 * 1000);
}
