import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const JSZip = require("jszip");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "test-output");
const port = 4174;

await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["scripts/server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Le serveur n’a pas démarré.")), 10000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes(`:${port}`)) {
      clearTimeout(timeout);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Serveur arrêté (${code}).`)));
});

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(output, "mobile-arrival.png"), fullPage: true });
  await page.getByRole("button", { name: "ARRIVÉE" }).click();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "DÉPART" }).waitFor();
  assert.match(await page.locator("#today-content").innerText(), /EN COURS/);

  const date = await page.evaluate(() => {
    const current = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`;
  });
  await page.getByRole("button", { name: "Corriger la journée" }).click();
  await page.locator('input[name="arrival"]').fill(`${date}T07:00`);
  await page.locator('input[name="departure"]').fill(`${date}T16:00`);
  await page.locator('input[name="pause"]').fill("00:00");
  await page.locator('input[name="planned"]').fill("09:00");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText("09 h 00").first().waitFor();
  await page.locator("#toast").waitFor({ state: "hidden" });
  await page.screenshot({ path: join(output, "mobile-today.png"), fullPage: true });

  await page.getByRole("button", { name: /Calendrier/ }).click();
  await page.screenshot({ path: join(output, "mobile-calendar.png"), fullPage: true });
  await page.getByRole("button", { name: /Bilan/ }).click();
  await page.screenshot({ path: join(output, "mobile-summary.png"), fullPage: true });
  await page.locator(".annual-panel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "mobile-annual.png") });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: join(output, "desktop-summary.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  await page.getByRole("button", { name: /Réglages/ }).click();
  const excelDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exporter Excel/ }).click();
  const excel = await excelDownload;
  const excelPath = join(output, await excel.suggestedFilename());
  await excel.saveAs(excelPath);
  const archive = await JSZip.loadAsync(await readFile(excelPath));
  for (const required of ["xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet4.xml"]) {
    assert.ok(archive.file(required), `${required} absent du fichier Excel`);
  }
  const journalXml = await archive.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(journalXml, /<c r="A2" s="2"><v>/, "La date du journal doit être une valeur Excel");
  assert.match(journalXml, /<c r="D2" s="3"><v>/, "L’arrivée doit être une valeur horaire Excel");
  assert.match(journalXml, /<c r="G2" s="4"><v>/, "Le temps travaillé doit être une durée Excel");

  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exporter une sauvegarde/ }).click();
  const backup = await backupDownload;
  const backupPath = join(output, await backup.suggestedFilename());
  await backup.saveAs(backupPath);
  const backupJson = JSON.parse(await readFile(backupPath, "utf8"));
  assert.equal(backupJson.entries.length, 1);

  await page.getByRole("button", { name: /Remettre à zéro/ }).click();
  await page.locator("#backup-file").setInputFiles(backupPath);
  await page.getByRole("button", { name: /Fusionner sans écraser/ }).click();
  await page.getByRole("button", { name: /Aujourd’hui/ }).click();
  await page.getByText("JOURNÉE TERMINÉE").waitFor();

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Suivi des heures").first().waitFor();
  await context.setOffline(false);
  await context.close();

  console.log(JSON.stringify({
    pointagePersistant: true,
    correction0900: true,
    exportExcel: true,
    sauvegardeRestauree: true,
    horsConnexion: true,
    captures: ["mobile-arrival.png", "mobile-today.png", "mobile-calendar.png", "mobile-summary.png", "mobile-annual.png", "desktop-summary.png"],
  }, null, 2));
} finally {
  await browser.close();
  server.kill();
}
