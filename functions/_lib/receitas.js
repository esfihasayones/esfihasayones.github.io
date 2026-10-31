// Quanto de cada ingrediente vai numa esfiha, em gramas (ml conta como g).
// ESTIMATIVA de 30/10/2026, feita sem o dono: troque pelas quantidades da
// receita dele assim que ele passar. A conta de compras inteira sai daqui.
export const MASSA = { farinha: 45, oleo: 5, acucar: 2, sal: 1, fermento: 1 };

export const RECHEIOS = {
  calabresa: { molho: 10, calabresa: 25, cebola: 8, mucarela: 15 },
  carne: { carne: 35, cebola: 8, tomate: 10 },
  queijo: { mucarela: 20, requeijao: 15, ricota: 10, oregano: 0.2 },
  marguerita: { molho: 10, mucarela: 20, tomate: 10, manjericao: 1 },
};

// Como achar cada ingrediente no catálogo do mercado. `busca` vai pra busca
// do site; `exige` são palavras que o nome do produto precisa ter (com "|"
// valendo qualquer uma), e com `inicio` o nome começa pelo primeiro; `proibe` descarta o que a busca traz junto (pizza
// pronta quando se procura calabresa, por exemplo). Tudo sem acento.
export const INGREDIENTES = {
  farinha: { nome: "Farinha de trigo", busca: "farinha de trigo", exige: ["farinha", "trigo"], proibe: ["integral", "bolo", "pastel", "rosca", "temperada", "empanar", "sem gluten"] },
  oleo: { nome: "Óleo de soja", busca: "oleo de soja", exige: ["oleo", "soja"], proibe: ["spray", "composto"] },
  acucar: { nome: "Açúcar", busca: "acucar refinado", exige: ["acucar"], proibe: ["mascavo", "demerara", "confeiteiro", "light", "organico", "cristal"] },
  sal: { nome: "Sal", busca: "sal refinado", exige: ["sal"], proibe: ["grosso", "rosa", "temperado", "light", "parrilla", "batata", "biscoito", "amendoim", "salgad", "salsicha"] },
  fermento: { nome: "Fermento biológico seco", busca: "fermento biologico seco", exige: ["fermento", "biologico"], proibe: ["fresco", "quimico"] },
  calabresa: { nome: "Linguiça calabresa", busca: "linguica calabresa", exige: ["calabresa"], proibe: ["pizza", "lasanha", "pastel", "esfiha", "salgad", "torta", "pao", "frango", "fatiada", "cubos"] },
  carne: { nome: "Carne moída", busca: "carne moida", exige: ["moida"], proibe: ["frango", "suina", "soja", "hamburguer", "almondega", "congelad", "pronta", "temperada"] },
  mucarela: { nome: "Muçarela", busca: "queijo mussarela", exige: ["mussarela|mucarela|muzzarela|mozzarella"], proibe: ["pizza", "bufala", "palito", "empanad", "light", "ralad", "lasanha", "pao", "sand", "zero", "bolinha"] },
  requeijao: { nome: "Requeijão", busca: "requeijao cremoso", exige: ["requeijao"], proibe: ["light", "zero", "pizza", "biscoito", "pao", "salgad", "sabor", "cheddar"] },
  ricota: { nome: "Ricota", busca: "ricota", exige: ["ricota"], proibe: ["light", "temperada", "defumada"] },
  molho: { nome: "Molho de tomate", busca: "molho de tomate", exige: ["molho", "tomate"], proibe: ["ketchup", "pizza pronta", "picante"] },
  tomate: { nome: "Tomate", busca: "tomate", inicio: true, exige: ["tomate"], proibe: ["molho", "extrato", "seco", "pelado", "cereja", "grape", "polpa", "ketchup", "passata", "sardinha", "atum", "suco", "semente", "pizza", "pate"] },
  cebola: { nome: "Cebola", busca: "cebola", inicio: true, exige: ["cebola"], proibe: ["frita", "desidratada", "creme", "sopa", "conserva", "salgad", "batata", "flocos", "anel", "picles", "biscoito", "salsa"] },
  oregano: { nome: "Orégano", busca: "oregano", inicio: true, exige: ["oregano"], proibe: ["azeite", "molho", "batata", "biscoito"] },
  manjericao: { nome: "Manjericão", busca: "manjericao", inicio: true, exige: ["manjericao"], proibe: ["molho", "pesto", "azeite", "batata", "biscoito", "semente", "vaso"] },
};

// Gramas de cada ingrediente pra produzir `itens` ({sabor: quantidade}).
// Sabor que não está em RECHEIOS dá erro: conta pela metade é pior que nenhuma.
export function insumos(itens) {
  const total = {};
  const somar = (receita, n) => {
    for (const [ing, g] of Object.entries(receita)) total[ing] = (total[ing] || 0) + g * n;
  };
  for (const [sabor, n] of Object.entries(itens)) {
    if (!RECHEIOS[sabor]) throw new Error("sabor sem receita: " + sabor);
    if (!(n > 0)) continue;
    somar(MASSA, n);
    somar(RECHEIOS[sabor], n);
  }
  return total;
}
