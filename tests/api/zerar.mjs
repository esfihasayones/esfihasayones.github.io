import { execFileSync } from "node:child_process";

// Esvazia pedidos e bloqueios e recoloca a config padrão no banco LOCAL.
export function wrangler(sql, json) {
  const args = ["--yes", "wrangler@4.152.0", "d1", "execute", "esfihas-pedidos", "--local", "--command", sql];
  if (json) args.push("--json");
  return execFileSync("npx", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function zerar() {
  wrangler("DELETE FROM pedidos; DELETE FROM bloqueios; DELETE FROM config; " +
    "INSERT INTO config (chave, valor) VALUES ('limite_dia','80'),('pausado','0');");
}

export function contar(idEnvio) {
  const saida = JSON.parse(wrangler(`SELECT COUNT(*) AS n FROM pedidos WHERE id_envio = '${idEnvio.replace(/'/g, "")}'`, true));
  return saida[0].results[0].n;
}
