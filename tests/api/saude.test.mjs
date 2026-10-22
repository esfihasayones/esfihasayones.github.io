import test from "node:test";
import assert from "node:assert/strict";
import { pedir } from "./ajuda.mjs";

test("saude responde com banco", async () => {
  const r = await pedir("/api/saude");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, banco: true });
});
