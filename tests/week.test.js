import { test } from "node:test";
import assert from "node:assert/strict";
import { isoWeekOf, mondayOf, upcomingWeek, currentWeek, frenchDate } from "../lib/week.js";

test("isoWeekOf gère le milieu d'année et la semaine 53", () => {
  assert.equal(isoWeekOf(new Date(2026, 10, 9)), "2026-W46");
  assert.equal(isoWeekOf(new Date(2026, 11, 31)), "2026-W53");
  assert.equal(isoWeekOf(new Date(2027, 0, 3)), "2026-W53");
  assert.equal(isoWeekOf(new Date(2027, 0, 4)), "2027-W01");
});

test("mondayOf renvoie le lundi de la semaine", () => {
  assert.equal(mondayOf("2026-W46"), "2026-11-09");
  assert.equal(mondayOf("2026-W53"), "2026-12-28");
  assert.equal(mondayOf("2027-W01"), "2027-01-04");
});

test("upcomingWeek vise le prochain lundi", () => {
  assert.equal(upcomingWeek(new Date(2026, 10, 7, 9)), "2026-W46");
  assert.equal(upcomingWeek(new Date(2026, 11, 26, 9)), "2026-W53");
  assert.equal(upcomingWeek(new Date(2026, 10, 9, 7)), "2026-W47");
});

test("currentWeek reste sur la semaine en cas d'envoi en retard", () => {
  assert.equal(currentWeek(new Date(2026, 10, 10)), "2026-W46");
});

test("frenchDate écrit le jour et le mois", () => {
  assert.equal(frenchDate("2026-11-09"), "9 novembre");
  assert.equal(frenchDate("2027-02-01"), "1er février");
});
