import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gridHtml, renderImage, renderToPage } from "../lib/image.js";
import { makePlan } from "./helpers.js";

const LONG = "Gratin de pommes de terre, poireaux fondants, lardons fumés et comté affiné douze mois au four";
const longPlan = () => {
  const plan = makePlan();
  plan.meals = plan.meals.map((m, i) => ({ ...m, title: `${LONG} ${i}` }));
  return plan;
};

test("la grille a 14 cases, 7 jours, midi et soir", () => {
  const html = gridHtml(makePlan());
  assert.equal((html.match(/class="meal"/g) ?? []).length, 14);
  assert.equal((html.match(/class="day"/g) ?? []).length, 7);
  assert.match(html, /Midi/);
  assert.match(html, /Soir/);
});

test("la grille échappe les titres", () => {
  const plan = makePlan();
  plan.meals[0].title = "Bœuf & <maison>";
  assert.match(gridHtml(plan), /Bœuf &amp; &lt;maison&gt;/);
});

test("le PNG fait 1200 px de large et moins de 1 Mo", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "miammiam-img-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, "sous-dossier", "semaine.png");
  await renderImage(longPlan(), out);
  const png = readFileSync(out);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.ok(statSync(out).size < 1_000_000);
});

test("un titre très long reste entièrement visible dans sa case", async () => {
  const { browser, page } = await renderToPage(longPlan());
  try {
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll(".meal")].filter(
        (cell) => cell.scrollWidth > cell.clientWidth || cell.scrollHeight > cell.clientHeight,
      ).length);
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.equal(overflowing, 0);
    assert.equal(pageWidth, 1200);
  } finally {
    await browser.close();
  }
});

test("l'image s'arrête à la fin de la grille, sans marge vide", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "miammiam-img-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, "semaine.png");
  await renderImage(makePlan(), out);
  assert.ok(readFileSync(out).readUInt32BE(20) < 600);
});

test("la grille affiche le prix des repas et de la semaine", () => {
  const html = gridHtml(makePlan());
  assert.match(html, /≈ 25,00 €/);
  assert.match(html, /≈ 34,00 €/);
  assert.match(html, /Inclus la veille/);
});
