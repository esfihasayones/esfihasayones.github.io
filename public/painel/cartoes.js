// Folhas A4 de um lote de cartões de fidelidade (?lote=N), 16 por folha.
// Os códigos vêm do banco; a linha em branco é pra escrever o pedido e o cliente.
const POR_FOLHA = 16;
const $ = (s) => document.querySelector(s);

async function carregar() {
  const lote = new URLSearchParams(location.search).get("lote");
  if (!/^\d+$/.test(lote || "")) { $("#estado").textContent = "Falta o lote no endereço."; return; }
  let r;
  try {
    r = await fetch("/api/painel/cartoes?lote=" + lote, { redirect: "manual" });
  } catch (e) {
    $("#estado").textContent = "Sem conexão com o servidor.";
    return;
  }
  if (r.type === "opaqueredirect" || r.status === 403) { $("#estado").textContent = "Sua sessão expirou. Recarregue a página."; return; }
  if (!r.ok) { $("#estado").textContent = r.status === 404 ? "Esse lote não existe." : "O servidor recusou (erro " + r.status + ")."; return; }
  const { cartoes } = await r.json();

  const modelo = $("#modelo");
  const folhas = [];
  for (let i = 0; i < cartoes.length; i += POR_FOLHA) {
    const folha = document.createElement("main");
    folha.className = "folha";
    for (const c of cartoes.slice(i, i + POR_FOLHA)) {
      const cartao = modelo.content.cloneNode(true);
      cartao.querySelector(".codigo").textContent = c.codigo;
      folha.append(cartao);
    }
    folhas.push(folha);
  }
  $("#folhas").replaceChildren(...folhas);
  await document.fonts.ready;
  const trocados = cartoes.filter((c) => c.trocado).length;
  $("#estado").textContent = "Lote " + lote + ": " + cartoes.length + " cartões em " + folhas.length +
    (folhas.length === 1 ? " folha" : " folhas") + (trocados ? ", " + trocados + " já trocados" : "") + ".";
  $("#imprimir").hidden = false;
}

$("#imprimir").addEventListener("click", () => window.print());
carregar();
