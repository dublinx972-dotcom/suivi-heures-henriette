import { DEFAULT_TYPE_RULES } from "./time.js?v=1.1.0";

const DB_NAME = "suivi-heures-personnel";
const DB_VERSION = 1;

export const DEFAULT_SETTINGS = {
  standardDayMinutes: 540,
  annualTargetMinutes: 1607 * 60,
  pauseMode: "none",
  fixedPauseMinutes: 0,
  weekStartsOn: 1,
  hour12: false,
  sundayMultiplier: 2,
  holidayMultiplier: 2,
  typeRules: DEFAULT_TYPE_RULES,
};

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("entries")) {
        const entries = database.createObjectStore("entries", { keyPath: "date" });
        entries.createIndex("arrival", "arrival", { unique: false });
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

async function transaction(storeName, mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let request;
    try {
      request = action(store);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error || request?.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction annulée"));
  });
}

export async function listEntries() {
  const values = await transaction("entries", "readonly", (store) => store.getAll());
  return (values || []).sort((a, b) => a.date.localeCompare(b.date));
}

export function getEntry(date) {
  return transaction("entries", "readonly", (store) => store.get(date));
}

export function putEntry(entry) {
  return transaction("entries", "readwrite", (store) => store.put(entry));
}

export async function putEntries(entries) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = database.transaction("entries", "readwrite");
    const store = tx.objectStore("entries");
    for (const entry of entries) store.put(entry);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export function deleteEntry(date) {
  return transaction("entries", "readwrite", (store) => store.delete(date));
}

export async function loadSettings() {
  const record = await transaction("settings", "readonly", (store) => store.get("preferences"));
  const saved = record?.value || {};
  const typeRules = Object.fromEntries(
    Object.entries(DEFAULT_TYPE_RULES).map(([type, fallback]) => [type, { ...fallback, ...(saved.typeRules?.[type] || {}) }]),
  );
  return { ...DEFAULT_SETTINGS, ...saved, typeRules };
}

export function saveSettings(settings) {
  return transaction("settings", "readwrite", (store) => store.put({ key: "preferences", value: settings }));
}

export async function replaceData(entries, settings) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = database.transaction(["entries", "settings"], "readwrite");
    const entryStore = tx.objectStore("entries");
    const settingsStore = tx.objectStore("settings");
    entryStore.clear();
    settingsStore.clear();
    for (const entry of entries) entryStore.put(entry);
    settingsStore.put({ key: "preferences", value: settings });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function mergeData(entries) {
  const existing = new Map((await listEntries()).map((entry) => [entry.date, entry]));
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = database.transaction("entries", "readwrite");
    const store = tx.objectStore("entries");
    for (const entry of entries) {
      const current = existing.get(entry.date);
      if (!current || (String(current.source || "").startsWith("forecast:") && !String(entry.source || "").startsWith("forecast:"))) {
        store.put(entry);
      }
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllData() {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = database.transaction(["entries", "settings"], "readwrite");
    tx.objectStore("entries").clear();
    tx.objectStore("settings").clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
