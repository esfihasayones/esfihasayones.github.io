// A IA lê o peso (e o preço, quando falta) na imagem do recorte do encarte.
// Usa o `claude` de linha de comando, com a assinatura de quem roda, numa
// chamada só pra todos os recortes. Cada leitura fica guardada em
// ~/.cache/esfihas-compras/leituras.json: recorte já lido não volta pra IA.
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";

export const CACHE = join(homedir(), ".cache", "esfihas-compras", "leituras.json");

export const PEDIDO = `Cada arquivo .webp desta pasta é o recorte de um produto num encarte de supermercado.
Leia todos com a ferramenta Read e responda SÓ um JSON, sem texto em volta: uma lista com um objeto por arquivo,
{"arquivo", "produto", "gramas", "preco", "unidade", "condicao"}:
- produto: nome como está escrito, com marca e tipo;
- gramas: peso ou volume da embalagem em gramas (ml conta como g; "1kg" é 1000); null se não estiver escrito;
- preco: número em reais do preço em destaque; null se não der pra ler;
- unidade: "kg" quando o preço é por quilo, senão "embalagem";
- condicao: condição pra ter o preço (clube, cartão, leve x pague y, a partir de N unidades), ou null.
Não invente: o que não estiver na imagem vai null.`;

// Lista de leituras a partir da saída do `claude -p --output-format json`.
// A IA às vezes cerca o JSON de texto ou de ```json; pega do primeiro "[" ao
// último "]". Leitura sem arquivo, com peso que não é número positivo ou com
// unidade estranha é descartada ou corrigida, nunca inventada.
export function interpretarResposta(saida) {
  const envelope = JSON.parse(saida);
  if (envelope.is_error) throw new Error("a IA respondeu com erro: " + String(envelope.result).slice(0, 200));
  const texto = String(envelope.result || "");
  const ini = texto.indexOf("["), fim = texto.lastIndexOf("]");
  if (ini < 0 || fim < ini) throw new Error("resposta da IA sem lista JSON");
  const lista = JSON.parse(texto.slice(ini, fim + 1));
  if (!Array.isArray(lista)) throw new Error("resposta da IA não é lista");
  const numero = (x) => { const n = Number(String(x ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
  return lista.filter((l) => l && typeof l.arquivo === "string").map((l) => ({
    arquivo: l.arquivo,
    produto: typeof l.produto === "string" && l.produto.trim() ? l.produto.trim() : null,
    gramas: numero(l.gramas),
    preco: numero(l.preco),
    unidade: l.unidade === "kg" ? "kg" : "embalagem",
    condicao: typeof l.condicao === "string" && l.condicao.trim() ? l.condicao.trim() : null,
  }));
}

export function rodarClaude(pasta) {
  return new Promise((ok, falha) => {
    execFile("claude", ["-p", "--allowedTools", "Read", "--output-format", "json", PEDIDO],
      { cwd: pasta, timeout: 10 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 },
      (erro, saida) => {
        if (erro) return falha(new Error(erro.code === "ENOENT" ? "o comando claude não está instalado" : "claude: " + erro.message));
        try { ok(interpretarResposta(saida)); } catch (e) { falha(e); }
      });
  });
}

// Id de recorte vira nome de arquivo: só letra, número e traço.
const nomeArquivo = (id) => String(id).replace(/[^A-Za-z0-9-]/g, "_") + ".webp";

// Leituras por id de recorte ({produto, gramas, preco, unidade, condicao}).
// `opcoes` existe pros testes: fetch, quem roda a IA e onde fica o cache.
export async function lerRecortes(recs, { fazerFetch = fetch, rodar = rodarClaude, cache: arquivoCache = CACHE } = {}) {
  let cache = {};
  try { cache = JSON.parse(await readFile(arquivoCache, "utf8")); } catch { /* sem cache ainda */ }
  const faltam = [...new Map(recs.filter((r) => r.imagem && !cache[r.id]).map((r) => [r.id, r])).values()];
  if (faltam.length) {
    const pasta = await mkdtemp(join(tmpdir(), "recortes-"));
    try {
      const porArquivo = new Map();
      for (const r of faltam) {
        try {
          const resp = await fazerFetch(r.imagem, { signal: AbortSignal.timeout(30000) });
          if (!resp.ok) continue;
          await writeFile(join(pasta, nomeArquivo(r.id)), Buffer.from(await resp.arrayBuffer()));
          porArquivo.set(nomeArquivo(r.id), r.id);
        } catch { /* imagem que não baixou fica sem leitura */ }
      }
      if (porArquivo.size) {
        const hoje = new Date().toISOString().slice(0, 10);
        for (const l of await rodar(pasta)) {
          const id = porArquivo.get(l.arquivo.split("/").pop());
          if (id) cache[id] = { ...l, lido_em: hoje };
        }
        await mkdir(dirname(arquivoCache), { recursive: true });
        await writeFile(arquivoCache, JSON.stringify(cache, null, 1));
      }
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  }
  return Object.fromEntries(recs.filter((r) => cache[r.id]).map((r) => [r.id, cache[r.id]]));
}
