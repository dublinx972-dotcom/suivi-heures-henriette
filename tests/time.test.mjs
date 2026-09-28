import test from "node:test";
import assert from "node:assert/strict";
import { computeEntry, formatDuration, minutesBetween, summarize } from "../js/time.js";

function entry(arrival, departure, plannedMinutes = 540, pauseMinutes = 0) {
  return { date: "2026-01-12", type: "work", arrival, departure, plannedMinutes, pauseMinutes };
}

test("07:00 à 16:00 donne 09:00", () => {
  const result = computeEntry(entry("2026-01-12T07:00:00+01:00", "2026-01-12T16:00:00+01:00"));
  assert.equal(result.workedMinutes, 540);
  assert.equal(result.countedMinutes, 540);
  assert.equal(result.plannedMinutes, 540);
  assert.equal(result.gapMinutes, 0);
  assert.equal(result.active, false);
});

test("06:53 à 15:57 donne 09:04 et +00:04", () => {
  const result = computeEntry(entry("2026-01-12T06:53:00+01:00", "2026-01-12T15:57:00+01:00"));
  assert.equal(result.workedMinutes, 544);
  assert.equal(result.gapMinutes, 4);
  assert.equal(formatDuration(result.gapMinutes, { signed: true }), "+00 h 04");
});

test("08:00 à 16:30 donne 08:30 et -00:30", () => {
  const result = computeEntry(entry("2026-01-12T08:00:00+01:00", "2026-01-12T16:30:00+01:00"));
  assert.equal(result.workedMinutes, 510);
  assert.equal(result.gapMinutes, -30);
  assert.equal(formatDuration(result.gapMinutes, { signed: true }), "−00 h 30");
});

test("une pause est déduite du temps écoulé", () => {
  const result = computeEntry(entry("2026-01-12T08:00:00+01:00", "2026-01-12T17:30:00+01:00", 540, 30));
  assert.equal(result.workedMinutes, 540);
});

test("les timestamps restent exacts lors d’un changement d’heure", () => {
  assert.equal(minutesBetween("2026-03-29T00:30:00.000Z", "2026-03-29T02:30:00.000Z"), 120);
});

test("une période active utilise l’heure courante et reste active", () => {
  const current = entry("2026-01-12T07:00:00.000Z", null);
  const result = computeEntry(current, new Date("2026-01-12T16:00:00.000Z"));
  assert.equal(result.workedMinutes, 540);
  assert.equal(result.active, true);
});

test("les journées sans pointage ne créent pas d’heures réalisées", () => {
  const result = summarize([{ date: "2026-01-16", type: "rest", arrival: null, departure: null, pauseMinutes: 0, plannedMinutes: 0 }]);
  assert.deepEqual(result, { workedMinutes: 0, countedMinutes: 0, plannedMinutes: 0, gapMinutes: 0 });
});

test("une astreinte ajoute le forfait configurable de 01:30", () => {
  const result = computeEntry({ ...entry("2026-01-12T07:00:00+01:00", "2026-01-12T16:00:00+01:00"), type: "oncall" });
  assert.equal(result.workedMinutes, 540);
  assert.equal(result.countedMinutes, 630);
  assert.equal(result.bonusMinutes, 90);
});

test("un dimanche travaillé est comptabilisé avec le coefficient x2", () => {
  const result = computeEntry({ ...entry("2026-01-11T07:00:00+01:00", "2026-01-11T16:00:00+01:00"), date: "2026-01-11" });
  assert.equal(result.countedMinutes, 1080);
  assert.equal(result.calendarMultiplier, 2);
});

test("un jour férié travaillé est comptabilisé avec le coefficient x2", () => {
  const result = computeEntry({ ...entry("2026-07-14T07:00:00+02:00", "2026-07-14T16:00:00+02:00"), date: "2026-07-14", isHoliday: true });
  assert.equal(result.countedMinutes, 1080);
});

test("une récupération confirmée retire une journée habituelle", () => {
  const result = computeEntry({ date: "2026-08-10", type: "rtt", arrival: null, departure: null, pauseMinutes: 0, plannedMinutes: 0 });
  assert.equal(result.countedMinutes, -540);
});

test("une récupération seulement prévisionnelle ne modifie pas encore le bilan", () => {
  const result = computeEntry({ date: "2026-08-10", type: "rtt", arrival: null, departure: null, pauseMinutes: 0, plannedMinutes: 0, forecastOnly: true });
  assert.equal(result.countedMinutes, 0);
});

test("le poids d’un type est configurable", () => {
  const result = computeEntry(
    entry("2026-01-12T07:00:00+01:00", "2026-01-12T16:00:00+01:00"),
    new Date(),
    { typeRules: { work: { coefficient: 1.5, fixedMinutes: 0 } } },
  );
  assert.equal(result.countedMinutes, 810);
});
