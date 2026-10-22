export async function onRequestGet({ env }) {
  await env.DB.prepare("SELECT 1").first();
  return Response.json({ ok: true, banco: true });
}
