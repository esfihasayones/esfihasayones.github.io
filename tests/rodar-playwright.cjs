const pw = require(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
(async () => {
  const motor = process.argv[2] || 'chromium', url = process.argv[3];
  const b = await pw[motor].launch();
  const p = await b.newPage();
  await p.goto(url, { waitUntil: 'commit', timeout: 120000 });
  await p.waitForFunction(() => window.RESULTADO && window.RESULTADO.pronto, null, { timeout: 600000 }).catch(()=>{});
  const r = await p.evaluate(() => window.RESULTADO);
  // resumo primeiro: com muitas falhas o corte em 3000 caracteres engolia o "pronto"
  const o = r ? { pronto: r.pronto, total: r.total, passou: r.passou, falhou: r.falhou, ...r } : r;
  console.log(motor, JSON.stringify(o, null, 1).slice(0, 3000));
  await b.close();
})();
