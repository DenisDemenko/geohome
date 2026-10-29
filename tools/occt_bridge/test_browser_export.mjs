/** Browser smoke test for GeoHome CAD JSON download (CI only).
 * Requires Playwright Chromium and a local Vite dev server.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4178;
const server = spawn("bun", ["run", "dev", "--", "--port", String(port), "--host", "127.0.0.1"], {
  stdio: "pipe",
  env: { ...process.env },
});
let serverLog = "";
server.stderr.on("data", chunk => { serverLog += chunk.toString(); });
server.stdout.on("data", chunk => { serverLog += chunk.toString(); });
let browser;

try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error("Vite stopped: " + serverLog);
    try {
      const response = await fetch("http://127.0.0.1:" + port);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Vite failed to start: " + serverLog);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:" + port, { waitUntil: "domcontentloaded" });
  await page.locator('button[title="Завантаження STEP, STL, OBJ та виробничих DXF"]').click();
  const button = page.getByRole("button", { name: "Завантажити CAD JSON" });
  await button.waitFor({ state: "visible" });
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  assert.match(download.suggestedFilename(), /geohome_.*_kumcad_v1\.json$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.equal(json.schema, "geohome.kumcad.interchange");
  assert.equal(json.units, "mm");
  assert.ok(json.vertices.length > 0);
  assert.ok(json.struts.length > 0);
  console.log("Browser CAD JSON download OK:", download.suggestedFilename(), json.struts.length, "struts");
  await context.close();
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
