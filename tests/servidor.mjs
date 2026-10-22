// Serve /tests/* do disco e repassa o resto pro `wrangler pages dev`.
// Assim a suíte de navegador fica fora de public/ e testa o site com as funções.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORTA = Number(process.env.PORTA || 8792);
const DESTINO = new URL(process.env.DESTINO || "http://127.0.0.1:8788");
const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function servirArquivo(url, res) {
  const relativo = decodeURIComponent(url.pathname.slice("/tests/".length)) || "index.html";
  const arquivo = path.join(RAIZ, relativo.endsWith("/") ? relativo + "index.html" : relativo);
  if (!arquivo.startsWith(RAIZ + path.sep)) {
    res.writeHead(403).end("proibido");
    return;
  }
  try {
    const corpo = await readFile(arquivo);
    res.writeHead(200, {
      "content-type": TIPOS[path.extname(arquivo)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(corpo);
  } catch {
    res.writeHead(404).end("não encontrado");
  }
}

// Antes de o site rodar, avisa a página de testes (se houver uma) pra ela
// poder trocar o `fetch` do iframe. Os módulos do site só executam depois.
const GANCHO = "<script>try{parent.__preparar&&parent.__preparar(window)}catch(e){}</script>";

function repassar(req, res) {
  const ehPagina = req.method === "GET" && new URL(req.url, "http://local").pathname === "/";
  const saida = http.request(
    {
      hostname: DESTINO.hostname,
      port: DESTINO.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: DESTINO.host, ...(ehPagina ? { "accept-encoding": "identity" } : {}) },
    },
    (resp) => {
      if (ehPagina && /text\/html/.test(resp.headers["content-type"] || "")) {
        const partes = [];
        resp.on("data", (p) => partes.push(p));
        resp.on("end", () => {
          const html = Buffer.concat(partes).toString("utf8").replace(/<head[^>]*>/i, (m) => m + GANCHO);
          const cab = { ...resp.headers, "cache-control": "no-store" };
          delete cab["content-length"]; delete cab["etag"];
          res.writeHead(resp.statusCode, cab);
          res.end(html);
        });
        return;
      }
      res.writeHead(resp.statusCode, resp.headers);
      resp.pipe(res);
    }
  );
  saida.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end("destino fora do ar");
  });
  req.pipe(saida);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://local");
    if (url.pathname.startsWith("/tests/")) servirArquivo(url, res);
    else repassar(req, res);
  })
  .listen(PORTA, "127.0.0.1", () => console.log(`tests em http://127.0.0.1:${PORTA}/tests/index.html -> ${DESTINO.origin}`));
