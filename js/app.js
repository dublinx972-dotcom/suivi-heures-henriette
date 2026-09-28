import {
  DAY_TYPES,
  TYPE_LABELS,
  addDays,
  computeEntry,
  dateFromKey,
  durationInput,
  endOfWeek,
  entriesBetween,
  formatClock,
  formatDuration,
  formatLongDate,
  formatShortDate,
  fromLocalDateTimeInput,
  localDateKey,
  monthKey,
  parseDuration,
  startOfWeek,
  summarize,
  theoreticalDeparture,
  toLocalDateTimeInput,
} from "./time.js";
import {
  DEFAULT_SETTINGS,
  clearAllData,
  deleteEntry,
  listEntries,
  loadSettings,
  mergeData,
  putEntry,
  replaceData,
  saveSettings,
} from "./db.js";
import { buildExcelBlob, downloadBlob, workbookSummary } from "./xlsx.js";

const VERSION = "1.0.0";
const state = {
  entries: [],
  settings: { ...DEFAULT_SETTINGS },
  view: "today",
  calendarDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12),
  editingDate: null,
  pendingImport: null,
  deferredInstall: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function refreshIcons() {
  globalThis.lucide?.createIcons({ attrs: { "stroke-width": 2 } });
}

function announce(message, tone = "neutral") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => {
    toast.hidden = true;
  }, 3300);
}

function gapClass(minutes) {
  if (minutes > 0) return "positive";
  if (minutes < 0) return "negative";
  return "balanced";
}

function activeEntry() {
  return state.entries.find((entry) => entry.arrival && !entry.departure) || null;
}

function entryForDate(date) {
  return state.entries.find((entry) => entry.date === date) || null;
}

async function reload() {
  [state.entries, state.settings] = await Promise.all([listEntries(), loadSettings()]);
  renderAll();
}

function renderAll() {
  renderToday();
  renderCalendar();
  renderSummary();
  renderSettings();
  renderConnectionState();
  refreshIcons();
}

function renderConnectionState() {
  const badge = $("#connection-state");
  const online = navigator.onLine;
  badge.className = `connection-state ${online ? "online" : "offline"}`;
  badge.innerHTML = `<span></span>${online ? "Prêt" : "Hors connexion"}`;
}

function metric(label, value, tone = "") {
  return `<div class="metric ${tone}"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderToday() {
  const now = new Date();
  const todayKey = localDateKey(now);
  const today = entryForDate(todayKey);
  const active = activeEntry();
  const host = $("#today-content");
  $("#today-date").textContent = formatLongDate(now);

  if (active) {
    const values = computeEntry(active, now);
    const expected = theoreticalDeparture(active);
    const crossesDay = active.date !== todayKey;
    host.innerHTML = `
      ${crossesDay ? `<section class="alert-band" role="alert"><i data-lucide="triangle-alert"></i><div><strong>Période commencée ${formatShortDate(active.date)}</strong><span>Elle est toujours active. Termine-la maintenant ou corrige ses horaires.</span></div></section>` : ""}
      <section class="today-hero active-state">
        <p class="eyebrow">EN COURS DEPUIS ${formatClock(active.arrival, state.settings.hour12)}</p>
        <div class="live-duration" aria-label="Temps en cours">${formatDuration(values.workedMinutes)}</div>
        <button class="punch-button departure" type="button" data-action="clock-out">
          <i data-lucide="log-out"></i><span>DÉPART</span>
        </button>
        <p class="action-hint">Un appui enregistre l’heure actuelle</p>
      </section>
      <section class="today-metrics" aria-label="Détails de la journée">
        ${metric("Arrivée", formatClock(active.arrival, state.settings.hour12))}
        ${metric("Prévu", formatDuration(values.plannedMinutes))}
        ${metric("Départ théorique", expected ? formatClock(expected, state.settings.hour12) : "—")}
        ${metric("Pause", formatDuration(active.pauseMinutes || 0))}
      </section>
      <button class="text-command" type="button" data-action="open-day" data-date="${active.date}"><i data-lucide="pencil"></i>Corriger la journée</button>`;
  } else if (today?.arrival && today?.departure) {
    const values = computeEntry(today, new Date(today.departure));
    host.innerHTML = `
      <section class="today-hero completed-state">
        <p class="eyebrow">JOURNÉE TERMINÉE</p>
        <div class="completion-mark"><i data-lucide="check"></i></div>
        <h2>${formatDuration(values.workedMinutes)}</h2>
        <p>travaillées aujourd’hui</p>
      </section>
      <section class="today-metrics" aria-label="Résumé de la journée">
        ${metric("Arrivée", formatClock(today.arrival, state.settings.hour12))}
        ${metric("Départ", formatClock(today.departure, state.settings.hour12))}
        ${metric("Prévu", formatDuration(values.plannedMinutes))}
        ${metric("Écart", formatDuration(values.gapMinutes, { signed: true }), gapClass(values.gapMinutes))}
      </section>
      <button class="text-command" type="button" data-action="open-day" data-date="${todayKey}"><i data-lucide="pencil"></i>Corriger la journée</button>`;
  } else {
    const planned = today?.plannedMinutes || 0;
    host.innerHTML = `
      <section class="today-hero ready-state">
        <p class="eyebrow">PRÊT À COMMENCER</p>
        <button class="punch-button arrival" type="button" data-action="clock-in">
          <i data-lucide="log-in"></i><span>ARRIVÉE</span>
        </button>
        <p class="action-hint">Un appui enregistre l’heure actuelle</p>
      </section>
      <section class="plan-line">
        <div><span>Temps prévu aujourd’hui</span><strong>${planned ? formatDuration(planned) : "Non défini"}</strong></div>
        <button class="icon-command" type="button" data-action="open-day" data-date="${todayKey}" aria-label="Modifier le temps prévu" title="Modifier le temps prévu"><i data-lucide="pencil"></i></button>
      </section>`;
  }
  refreshIcons();
}

function weekdayLabels() {
  const monday = ["L", "M", "M", "J", "V", "S", "D"];
  return Number(state.settings.weekStartsOn) === 0 ? ["D", "L", "M", "M", "J", "V", "S"] : monday;
}

function renderCalendar() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  $("#calendar-title").textContent = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(state.calendarDate);
  $("#weekday-row").innerHTML = weekdayLabels().map((label) => `<span>${label}</span>`).join("");

  const first = new Date(year, month, 1, 12);
  const lastDay = new Date(year, month + 1, 0, 12).getDate();
  const offset = Number(state.settings.weekStartsOn) === 0 ? first.getDay() : (first.getDay() + 6) % 7;
  const cells = [];
  for (let index = 0; index < offset; index += 1) cells.push(`<span class="calendar-empty"></span>`);
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month, day, 12);
    const key = localDateKey(date);
    const entry = entryForDate(key);
    const values = entry ? computeEntry(entry) : null;
    const today = key === localDateKey();
    let status = "empty";
    if (entry?.arrival && !entry.departure) status = "active";
    else if (entry && (entry.arrival || entry.plannedMinutes || entry.type !== "work")) status = values ? gapClass(values.gapMinutes) : "planned";
    cells.push(`<button type="button" class="calendar-day ${status} ${today ? "today" : ""}" data-action="open-day" data-date="${key}" aria-label="${day} ${$("#calendar-title").textContent}"><span>${day}</span><i></i></button>`);
  }
  $("#calendar-grid").innerHTML = cells.join("");

  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthly = state.entries.filter((entry) => entry.date.startsWith(prefix)).sort((a, b) => b.date.localeCompare(a.date));
  const list = $("#calendar-list");
  if (!monthly.length) {
    list.innerHTML = `<div class="empty-state"><i data-lucide="calendar-days"></i><strong>Aucune journée renseignée</strong><span>Touche une date du calendrier pour définir son temps prévu.</span></div>`;
  } else {
    list.innerHTML = monthly.map((entry) => {
      const values = computeEntry(entry);
      const times = entry.arrival ? `${formatClock(entry.arrival, state.settings.hour12)} → ${formatClock(entry.departure, state.settings.hour12)}` : TYPE_LABELS[entry.type] || "Journée planifiée";
      return `<button class="day-row" type="button" data-action="open-day" data-date="${entry.date}">
        <span class="day-date">${formatShortDate(entry.date)}</span>
        <span class="day-times">${times}</span>
        <span class="day-total">${formatDuration(values.workedMinutes)}</span>
        <span class="day-gap ${gapClass(values.gapMinutes)}">${formatDuration(values.gapMinutes, { signed: true })}</span>
        <i data-lucide="chevron-right"></i>
      </button>`;
    }).join("");
  }
  refreshIcons();
}

function summaryBlock(title, summary, subtitle = "") {
  return `<article class="summary-block">
    <header><div><span>${title}</span>${subtitle ? `<small>${subtitle}</small>` : ""}</div><strong class="${gapClass(summary.gapMinutes)}">${formatDuration(summary.gapMinutes, { signed: true })}</strong></header>
    <div class="summary-values"><div><span>Réalisé</span><strong>${formatDuration(summary.workedMinutes)}</strong></div><div><span>Prévu</span><strong>${formatDuration(summary.plannedMinutes)}</strong></div></div>
  </article>`;
}

function renderSummary() {
  const now = new Date();
  const today = entryForDate(localDateKey(now));
  const weekStart = startOfWeek(now, state.settings.weekStartsOn);
  const weekEnd = endOfWeek(now, state.settings.weekStartsOn);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12);
  const yearStart = new Date(now.getFullYear(), 0, 1, 12);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 12);
  const todaySummary = summarize(today ? [today] : [], now);
  const weekSummary = summarize(entriesBetween(state.entries, weekStart, weekEnd), now);
  const monthSummary = summarize(entriesBetween(state.entries, monthStart, monthEnd), now);
  const yearSummary = summarize(entriesBetween(state.entries, yearStart, yearEnd), now);
  const target = Number(state.settings.annualTargetMinutes || 0);
  const progress = target ? Math.min(100, Math.max(0, (yearSummary.workedMinutes / target) * 100)) : 0;
  const remaining = Math.max(0, target - yearSummary.workedMinutes);

  $("#summary-content").innerHTML = `
    <div class="summary-grid">
      ${summaryBlock("Aujourd’hui", todaySummary)}
      ${summaryBlock("Cette semaine", weekSummary, `${formatShortDate(localDateKey(weekStart))} — ${formatShortDate(localDateKey(weekEnd))}`)}
      ${summaryBlock("Ce mois", monthSummary, new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(now))}
    </div>
    <section class="annual-panel">
      <header><div><span>ANNÉE ${now.getFullYear()}</span><strong>${formatDuration(yearSummary.workedMinutes)}</strong></div><b>${Math.round(progress)} %</b></header>
      <div class="progress-track" role="progressbar" aria-label="Progression annuelle" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><span style="width:${progress}%"></span></div>
      <div class="annual-values">
        <div><span>Objectif annuel</span><strong>${formatDuration(target)}</strong></div>
        <div><span>Reste à effectuer</span><strong>${formatDuration(remaining)}</strong></div>
        <div><span>Prévu à date</span><strong>${formatDuration(yearSummary.plannedMinutes)}</strong></div>
        <div><span>Écart au prévu</span><strong class="${gapClass(yearSummary.gapMinutes)}">${formatDuration(yearSummary.gapMinutes, { signed: true })}</strong></div>
      </div>
    </section>`;
}

function renderSettings() {
  const form = $("#settings-form");
  form.elements.standardDay.value = durationInput(state.settings.standardDayMinutes);
  form.elements.annualTarget.value = durationInput(state.settings.annualTargetMinutes);
  form.elements.pauseMode.value = state.settings.pauseMode;
  form.elements.fixedPause.value = durationInput(state.settings.fixedPauseMinutes);
  form.elements.weekStartsOn.value = String(state.settings.weekStartsOn);
  form.elements.hourFormat.value = state.settings.hour12 ? "12" : "24";
  $("#fixed-pause-row").hidden = state.settings.pauseMode !== "fixed";
  $("#app-version").textContent = `Version ${VERSION}`;
}

function showView(view) {
  state.view = view;
  $$(".view").forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  $$(".nav-button").forEach((button) => {
    const active = button.dataset.viewTarget === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  if (view === "summary") renderSummary();
  if (view === "calendar") renderCalendar();
  window.scrollTo({ top: 0, behavior: "instant" });
  refreshIcons();
}

async function clockIn() {
  if (activeEntry()) {
    announce("Une période est déjà en cours.", "warning");
    return;
  }
  const date = localDateKey();
  const current = entryForDate(date);
  if (current?.arrival) {
    announce("Une arrivée existe déjà pour aujourd’hui.", "warning");
    return;
  }
  const now = new Date().toISOString();
  const entry = {
    date,
    type: "work",
    arrival: now,
    departure: null,
    pauseMinutes: current?.pauseMinutes ?? (state.settings.pauseMode === "fixed" ? state.settings.fixedPauseMinutes : 0),
    plannedMinutes: current ? Number(current.plannedMinutes || 0) : Number(state.settings.standardDayMinutes),
    comment: current?.comment || "",
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
  await putEntry(entry);
  await reload();
  announce(`Arrivée enregistrée à ${formatClock(now, state.settings.hour12)}.`, "success");
}

async function clockOut() {
  const active = activeEntry();
  if (!active) {
    announce("Aucune arrivée active. Ajoute ou corrige la journée depuis le calendrier.", "warning");
    return;
  }
  const now = new Date();
  if (now.getTime() <= new Date(active.arrival).getTime()) {
    announce("L’heure de départ doit être postérieure à l’arrivée.", "warning");
    return;
  }
  await putEntry({ ...active, departure: now.toISOString(), updatedAt: now.toISOString() });
  await reload();
  announce(`Départ enregistré à ${formatClock(now, state.settings.hour12)}.`, "success");
}

function openDayEditor(date) {
  const current = entryForDate(date);
  const form = $("#day-form");
  state.editingDate = date;
  form.elements.date.value = date;
  form.elements.type.value = current?.type || "work";
  form.elements.arrival.value = toLocalDateTimeInput(current?.arrival);
  form.elements.departure.value = toLocalDateTimeInput(current?.departure);
  form.elements.pause.value = durationInput(current?.pauseMinutes || 0);
  form.elements.planned.value = durationInput(current?.plannedMinutes || 0);
  form.elements.comment.value = current?.comment || "";
  $("#delete-day").hidden = !current;
  $("#day-dialog-title").textContent = current ? "Modifier la journée" : "Renseigner la journée";
  $("#day-dialog-date").textContent = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(dateFromKey(date));
  $("#day-dialog").showModal();
}

async function saveDay(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const pauseMinutes = parseDuration(form.elements.pause.value);
  const plannedMinutes = parseDuration(form.elements.planned.value);
  if (pauseMinutes === null || plannedMinutes === null) {
    announce("Utilise le format HH:MM pour les durées.", "warning");
    return;
  }
  const arrival = fromLocalDateTimeInput(form.elements.arrival.value);
  const departure = fromLocalDateTimeInput(form.elements.departure.value);
  if (departure && !arrival) {
    announce("Une heure de départ nécessite une heure d’arrivée.", "warning");
    return;
  }
  if (arrival && departure && new Date(departure) < new Date(arrival)) {
    announce("Le départ ne peut pas précéder l’arrivée.", "warning");
    return;
  }
  const otherActive = activeEntry();
  if (arrival && !departure && otherActive && otherActive.date !== state.editingDate) {
    announce(`Une période est déjà active depuis le ${formatShortDate(otherActive.date)}.`, "warning");
    return;
  }
  const existing = entryForDate(state.editingDate);
  const now = new Date().toISOString();
  await putEntry({
    date: state.editingDate,
    type: form.elements.type.value,
    arrival,
    departure,
    pauseMinutes,
    plannedMinutes,
    comment: form.elements.comment.value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  $("#day-dialog").close();
  await reload();
  announce("Journée enregistrée.", "success");
}

async function removeDay() {
  if (!state.editingDate || !confirm("Supprimer cette journée ? Cette action est définitive.")) return;
  await deleteEntry(state.editingDate);
  $("#day-dialog").close();
  await reload();
  announce("Journée supprimée.");
}

async function savePreferences(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const standardDayMinutes = parseDuration(form.elements.standardDay.value);
  const annualTargetMinutes = parseDuration(form.elements.annualTarget.value);
  const fixedPauseMinutes = parseDuration(form.elements.fixedPause.value);
  if ([standardDayMinutes, annualTargetMinutes, fixedPauseMinutes].some((value) => value === null)) {
    announce("Utilise le format HH:MM pour les durées.", "warning");
    return;
  }
  state.settings = {
    standardDayMinutes,
    annualTargetMinutes,
    pauseMode: form.elements.pauseMode.value,
    fixedPauseMinutes,
    weekStartsOn: Number(form.elements.weekStartsOn.value),
    hour12: form.elements.hourFormat.value === "12",
  };
  await saveSettings(state.settings);
  renderAll();
  announce("Réglages enregistrés.", "success");
}

function exportBackup() {
  const payload = {
    app: "suivi-heures",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    entries: state.entries,
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `Sauvegarde_suivi_heures_${localDateKey()}.json`);
  announce("Sauvegarde JSON exportée.", "success");
}

function validateBackup(payload) {
  if (!payload || payload.app !== "suivi-heures" || payload.version !== 1) throw new Error("Ce fichier n’est pas une sauvegarde compatible.");
  if (!Array.isArray(payload.entries) || !payload.settings || typeof payload.settings !== "object") throw new Error("La sauvegarde est incomplète.");
  const dates = new Set();
  for (const entry of payload.entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || Number.isNaN(dateFromKey(entry.date).getTime())) throw new Error("Une date de la sauvegarde est invalide.");
    if (dates.has(entry.date)) throw new Error(`La journée ${entry.date} apparaît deux fois.`);
    dates.add(entry.date);
    if (!DAY_TYPES.some(([value]) => value === entry.type)) throw new Error(`Type de journée invalide pour ${entry.date}.`);
    if ([entry.pauseMinutes, entry.plannedMinutes].some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) throw new Error(`Durée invalide pour ${entry.date}.`);
    if (entry.arrival && Number.isNaN(new Date(entry.arrival).getTime())) throw new Error(`Arrivée invalide pour ${entry.date}.`);
    if (entry.departure && Number.isNaN(new Date(entry.departure).getTime())) throw new Error(`Départ invalide pour ${entry.date}.`);
    if (entry.departure && !entry.arrival) throw new Error(`Départ sans arrivée pour ${entry.date}.`);
    if (entry.arrival && entry.departure && new Date(entry.departure) < new Date(entry.arrival)) throw new Error(`Horaires inversés pour ${entry.date}.`);
  }
  return payload;
}

async function readBackupFile(file) {
  try {
    const payload = validateBackup(JSON.parse(await file.text()));
    state.pendingImport = payload;
    $("#import-summary").textContent = `${payload.entries.length} journée(s), sauvegarde du ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(payload.exportedAt))}.`;
    $("#import-dialog").showModal();
  } catch (error) {
    announce(error.message || "Sauvegarde illisible.", "warning");
  }
}

async function applyImport(mode) {
  if (!state.pendingImport) return;
  if (mode === "replace") {
    if (!confirm("Remplacer toutes les données actuelles par cette sauvegarde ?")) return;
    await replaceData(state.pendingImport.entries, { ...DEFAULT_SETTINGS, ...state.pendingImport.settings });
  } else {
    await mergeData(state.pendingImport.entries);
  }
  state.pendingImport = null;
  $("#import-dialog").close();
  await reload();
  announce(mode === "replace" ? "Sauvegarde restaurée." : "Nouvelles journées ajoutées.", "success");
}

async function exportExcel() {
  const button = $("#export-excel");
  button.disabled = true;
  try {
    const year = new Date().getFullYear();
    const blob = await buildExcelBlob(state.entries, state.settings, year);
    downloadBlob(blob, `Suivi_heures_${year}.xlsx`);
    announce(`Excel exporté : ${workbookSummary(state.entries, state.settings, year)}`, "success");
  } catch (error) {
    announce(error.message || "Impossible de créer le fichier Excel.", "warning");
  } finally {
    button.disabled = false;
  }
}

async function resetEverything() {
  if (!confirm("Première confirmation : supprimer toutes les journées et tous les réglages ?")) return;
  if (!confirm("Deuxième confirmation : cette suppression est définitive. Continuer ?")) return;
  await clearAllData();
  await reload();
  announce("Toutes les données ont été supprimées.");
}

function moveCalendar(direction) {
  state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + direction, 1, 12);
  renderCalendar();
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "clock-in") await clockIn();
    if (action === "clock-out") await clockOut();
    if (action === "open-day") openDayEditor(target.dataset.date);
    if (action === "calendar-prev") moveCalendar(-1);
    if (action === "calendar-next") moveCalendar(1);
    if (action === "calendar-today") {
      state.calendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
      renderCalendar();
    }
  });
  $$(".nav-button").forEach((button) => button.addEventListener("click", () => showView(button.dataset.viewTarget)));
  $("#day-form").addEventListener("submit", saveDay);
  $("#delete-day").addEventListener("click", removeDay);
  $("#close-day-dialog").addEventListener("click", () => $("#day-dialog").close());
  $("#settings-form").addEventListener("submit", savePreferences);
  $("#settings-form").elements.pauseMode.addEventListener("change", (event) => {
    $("#fixed-pause-row").hidden = event.target.value !== "fixed";
  });
  $("#export-excel").addEventListener("click", exportExcel);
  $("#export-backup").addEventListener("click", exportBackup);
  $("#import-backup").addEventListener("click", () => $("#backup-file").click());
  $("#backup-file").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    event.target.value = "";
    if (file) await readBackupFile(file);
  });
  $("#import-merge").addEventListener("click", () => applyImport("merge"));
  $("#import-replace").addEventListener("click", () => applyImport("replace"));
  $("#import-cancel").addEventListener("click", () => {
    state.pendingImport = null;
    $("#import-dialog").close();
  });
  $("#reset-data").addEventListener("click", resetEverything);
  $("#install-app").addEventListener("click", async () => {
    if (state.deferredInstall) {
      state.deferredInstall.prompt();
      await state.deferredInstall.userChoice;
      state.deferredInstall = null;
      $("#install-app").hidden = true;
    } else {
      $("#install-dialog").showModal();
    }
  });
  $("#close-install-dialog").addEventListener("click", () => $("#install-dialog").close());
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstall = event;
    $("#install-app").hidden = false;
  });
  window.addEventListener("online", renderConnectionState);
  window.addEventListener("offline", renderConnectionState);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) reload();
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("Service worker non enregistré", error);
  }
}

async function init() {
  $("#day-type").innerHTML = DAY_TYPES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  bindEvents();
  await reload();
  showView("today");
  await registerServiceWorker();
  setInterval(() => {
    if (!document.hidden) {
      renderToday();
      if (state.view === "summary") renderSummary();
    }
  }, 1000);
}

init().catch((error) => {
  console.error(error);
  $("#app-error").hidden = false;
  $("#app-error").textContent = "L’application n’a pas pu démarrer. Recharge la page ou restaure une sauvegarde.";
});
