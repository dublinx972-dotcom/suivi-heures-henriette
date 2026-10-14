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
  const forecast = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("suivi-heures-personnel");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise((resolve, reject) => {
      const request = database.transaction("entries", "readonly").objectStore("entries").get("2026-03-13");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
  assert.equal(forecast.plannedMinutes, 420);
  assert.equal(forecast.calendarLabel, "Journée de solidarité 08:00-15:00");
  assert.equal(forecast.forecastOnly, true);
  await page.evaluate(async () => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);
    while (date.getDay() !== 1) date.setDate(date.getDate() + 1);
    const pad = (value) => String(value).padStart(2, "0");
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const arrival = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7, 0).toISOString();
    const departure = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17, 0).toISOString();
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("suivi-heures-personnel");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("entries", "readwrite");
      transaction.objectStore("entries").put({
        date: key,
        type: "work",
        arrival,
        departure,
        pauseMinutes: 0,
        plannedMinutes: 540,
        comment: "Test report mensuel",
        createdAt: arrival,
        updatedAt: departure,
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  });
  await page.reload({ waitUntil: "networkidle" });
  assert.match(await page.locator("#global-balance-today").innerText(), /\+01 h 00/);
  await page.locator("#global-balance-today").getByRole("button", { name: "Voir le détail" }).click();
  assert.match(await page.locator("#balance-dialog").innerText(), /Solde cumulé \+01 h 00/i);
  assert.match(await page.locator("#balance-detail-list").innerText(), /compté 10 h 00 − prévu 09 h 00/i);
  await page.getByRole("button", { name: "Fermer" }).click();
  await page.screenshot({ path: join(output, "mobile-arrival.png"), fullPage: true });
  await page.getByRole("button", { name: "ARRIVÉE" }).click();
  await page.getByRole("button", { name: "DÉPART" }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "DÉPART" }).waitFor();
  assert.match(await page.locator("#today-content").innerText(), /EN COURS/);

  const date = await page.evaluate(() => {
    const current = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`;
  });
  await page.getByRole("button", { name: "Corriger la journée" }).click();
  await page.locator('input[name="arrival"]').fill(`${date}T08:00`);
  await page.locator('input[name="departure"]').fill(`${date}T16:00`);
  await page.locator('input[name="pause"]').fill("00:00");
  await page.locator('input[name="planned"]').fill("09:00");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText("08 h 00").first().waitFor();
  await page.locator("#toast").waitFor({ state: "hidden" });

  await page.getByRole("button", { name: /POSER DE LA RÉCUP/ }).click();
  await page.getByRole("button", { name: "2 h", exact: true }).click();
  assert.match(await page.locator("#recovery-warning").innerText(), /Solde insuffisant/);
  assert.equal(await page.locator("#validate-recovery").isDisabled(), true);
  await page.getByRole("button", { name: "1 h", exact: true }).click();
  await page.screenshot({ path: join(output, "mobile-recovery.png"), fullPage: true });
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await page.getByRole("button", { name: /MODIFIER LA RÉCUP/ }).waitFor();
  assert.match(await page.locator("#today-content").innerText(), /Récup posée\s+01 h 00/);
  assert.match(await page.locator("#today-content").innerText(), /Comptabilisé\s+09 h 00/);
  assert.match(await page.locator("#today-content").innerText(), /Écart\s+00 h 00/);
  assert.match(await page.locator("#global-balance-today").innerText(), /00 h 00/);

  await page.getByRole("button", { name: /MODIFIER LA RÉCUP/ }).click();
  await page.getByRole("button", { name: "Personnalisé", exact: true }).click();
  await page.locator('input[name="customRecovery"]').fill("00:30");
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await page.getByText("00 h 30").first().waitFor();
  assert.match(await page.locator("#today-content").innerText(), /Récup posée\s+00 h 30/);
  assert.match(await page.locator("#today-content").innerText(), /Comptabilisé\s+08 h 30/);
  assert.match(await page.locator("#global-balance-today").innerText(), /\+00 h 30/);

  await page.getByRole("button", { name: /MODIFIER LA RÉCUP/ }).click();
  await page.getByRole("button", { name: /Retirer la récup/ }).click();
  await page.getByRole("button", { name: /POSER DE LA RÉCUP/ }).waitFor();
  assert.match(await page.locator("#global-balance-today").innerText(), /\+01 h 00/);
  await page.getByRole("button", { name: /POSER DE LA RÉCUP/ }).click();
  await page.getByRole("button", { name: "1 h", exact: true }).click();
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await page.getByRole("button", { name: /MODIFIER LA RÉCUP/ }).waitFor();
  await page.screenshot({ path: join(output, "mobile-today.png"), fullPage: true });

  await page.getByRole("button", { name: /Calendrier/ }).click();
  await page.screenshot({ path: join(output, "mobile-calendar.png"), fullPage: true });
  await page.getByRole("button", { name: /Bilan/ }).click();
  assert.match(await page.locator("#global-balance-summary").innerText(), /00 h 00/);
  assert.match(await page.locator("#summary-content").innerText(), /Récup utilisée\s+01 h 00/);
  await page.screenshot({ path: join(output, "mobile-summary.png"), fullPage: true });
  await page.locator(".annual-panel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "mobile-annual.png") });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: join(output, "desktop-summary.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Réglages/ }).click();
  await page.locator('input[name="coefficient-oncall"]').fill("1.25");
  await page.getByRole("button", { name: /Enregistrer les réglages/ }).click();
  assert.equal(await page.locator('input[name="coefficient-oncall"]').inputValue(), "1.25");
  await page.locator("#toast").waitFor({ state: "hidden" });
  await page.screenshot({ path: join(output, "mobile-settings.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
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
  assert.match(journalXml, /<c r="D\d+" s="3"><v>/, "L’arrivée doit être une valeur horaire Excel");
  assert.match(journalXml, /<c r="G\d+" s="4"><v>/, "Le temps réel doit être une durée Excel");
  assert.match(journalXml, /<c r="H\d+" s="4"><v>/, "La récupération utilisée doit être une durée Excel");
  assert.match(journalXml, /Récupération utilisée/, "Le journal doit séparer la récupération utilisée");
  assert.match(journalXml, /Temps comptabilisé/, "Le journal doit distinguer le temps comptabilisé");

  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exporter une sauvegarde/ }).click();
  const backup = await backupDownload;
  const backupPath = join(output, await backup.suggestedFilename());
  await backup.saveAs(backupPath);
  const backupJson = JSON.parse(await readFile(backupPath, "utf8"));
  assert.equal(backupJson.entries.length, 365);
  assert.ok(backupJson.settings.typeRules.work);
  assert.equal(backupJson.entries.find((entry) => entry.date === date).recoveryUsedMinutes, 60);

  await page.getByRole("button", { name: /Remettre à zéro/ }).click();
  await page.locator("#backup-file").setInputFiles(backupPath);
  await page.getByRole("button", { name: /Fusionner sans écraser/ }).click();
  await page.getByRole("button", { name: /Aujourd’hui/ }).click();
  await page.getByText("JOURNÉE TERMINÉE", { exact: true }).waitFor();

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
    calendrierPrevisionnel2026: true,
    poidsTypesConfigurables: true,
    reportMensuelDuSolde: true,
    recuperationRapide: true,
    recuperationModifiableSansDoubleDeduction: true,
    exportExcel: true,
    sauvegardeRestauree: true,
    horsConnexion: true,
    captures: ["mobile-arrival.png", "mobile-recovery.png", "mobile-today.png", "mobile-calendar.png", "mobile-summary.png", "mobile-annual.png", "mobile-settings.png", "desktop-summary.png"],
  }, null, 2));
} finally {
  await browser.close();
  server.kill();
}
