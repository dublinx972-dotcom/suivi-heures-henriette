export const DAY_TYPES = [
  ["work", "Travail"],
  ["rest", "Repos"],
  ["leave", "Congé"],
  ["rtt", "RTT / récupération"],
  ["mission", "Mission"],
  ["training", "Formation"],
  ["oncall", "Astreinte"],
  ["absence", "Maladie / absence"],
  ["other", "Autre"],
];

export const TYPE_LABELS = Object.fromEntries(DAY_TYPES);

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

export function minutesBetween(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const difference = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(difference) || difference < 0) return null;
  return Math.round(difference / 60000);
}

export function computeEntry(entry, now = new Date()) {
  const end = entry.departure || (entry.arrival ? now.toISOString() : null);
  const elapsed = minutesBetween(entry.arrival, end);
  const workedMinutes = elapsed === null ? 0 : Math.max(0, elapsed - Number(entry.pauseMinutes || 0));
  const plannedMinutes = Math.max(0, Number(entry.plannedMinutes || 0));
  return {
    workedMinutes,
    plannedMinutes,
    gapMinutes: workedMinutes - plannedMinutes,
    active: Boolean(entry.arrival && !entry.departure),
  };
}

export function formatDuration(minutes, { signed = false, empty = "00 h 00" } = {}) {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return empty;
  const rounded = Math.round(Number(minutes));
  const sign = rounded < 0 ? "−" : signed && rounded > 0 ? "+" : "";
  const absolute = Math.abs(rounded);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")} h ${String(absolute % 60).padStart(2, "0")}`;
}

export function formatClock(value, hour12 = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12,
  }).format(new Date(value));
}

export function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatShortDate(key) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(dateFromKey(key));
}

export function parseDuration(value) {
  const text = String(value ?? "").trim();
  const match = /^(\d{1,4})(?::([0-5]\d))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2] || 0);
}

export function durationInput(minutes) {
  const value = Math.max(0, Number(minutes || 0));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function toLocalDateTimeInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalDateTimeInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function theoreticalDeparture(entry) {
  if (!entry?.arrival) return null;
  return new Date(
    new Date(entry.arrival).getTime() +
      (Number(entry.plannedMinutes || 0) + Number(entry.pauseMinutes || 0)) * 60000,
  );
}

export function startOfWeek(date, firstDay = 1) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const offset = (result.getDay() - Number(firstDay) + 7) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

export function endOfWeek(date, firstDay = 1) {
  return addDays(startOfWeek(date, firstDay), 6);
}

export function entriesBetween(entries, start, end) {
  const first = localDateKey(start);
  const last = localDateKey(end);
  return entries.filter((entry) => entry.date >= first && entry.date <= last);
}

export function summarize(entries, now = new Date()) {
  return entries.reduce(
    (total, entry) => {
      const values = computeEntry(entry, now);
      total.workedMinutes += values.workedMinutes;
      total.plannedMinutes += values.plannedMinutes;
      total.gapMinutes += values.gapMinutes;
      return total;
    },
    { workedMinutes: 0, plannedMinutes: 0, gapMinutes: 0 },
  );
}

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function sameCalendarDay(iso, key) {
  return iso ? localDateKey(new Date(iso)) === key : false;
}
