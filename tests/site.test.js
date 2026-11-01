import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSite } from "../lib/site.js";
import { planHash } from "../lib/store.js";
import { makePlan, withMeal } from "./helpers.js";

function build(t, plans) {
  const out = mkdtempSync(join(tmpdir(), "miammiam-site-"));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  buildSite(plans, out);
  return { out, read: (path) => readFileSync(join(out, path), "utf8") };
}

test("la page de semaine contient les recettes et la liste", (t) => {
  const { read } = build(t, [makePlan({ status: "validated" })]);
  const html = read("2026-W46/index.html");
  assert.match(html, /Lundi/);
  assert.match(html, /Midi/);
  assert.equal((html.match(/class="recipe"/g) ?? []).length, 14);
  assert.match(html, /Plat du dimanche soir/);
  assert.match(html, /Cuire le riz\./);
  assert.match(html, /riz : 3,6 kg/);
  assert.match(html, /À vérifier au placard/);
});

test("le texte des plans est échappé", (t) => {
  const plan = withMeal(makePlan(), "lundi", "soir", { title: "Bœuf & carottes <maison>" });
  const html = build(t, [plan]).read("2026-W46/index.html");
  assert.match(html, /Bœuf &amp; carottes &lt;maison&gt;/);
  assert.doesNotMatch(html, /<maison>/);
});

test("les pages sont exclues du référencement", (t) => {
  const { read, out } = build(t, [makePlan()]);
  for (const page of ["index.html", "2026-W46/index.html"]) {
    assert.match(read(page), /<meta name="robots" content="noindex">/);
  }
  assert.match(read("robots.txt"), /Disallow: \//);
  assert.ok(existsSync(join(out, ".nojekyll")));
});

test("la page de semaine porte l'empreinte du plan et l'image", (t) => {
  const plan = makePlan();
  const html = build(t, [plan]).read("2026-W46/index.html");
  assert.ok(html.includes(`<meta name="miammiam-build" content="${planHash(plan)}">`));
  assert.match(html, /<img src="semaine\.png" alt="[^"]+"/);
});

test("l'accueil liste les semaines, la plus récente en tête", (t) => {
  const plans = [
    makePlan({ week: "2026-W47", startDate: "2026-11-16" }),
    makePlan(),
  ];
  const html = build(t, plans).read("index.html");
  assert.ok(html.indexOf('href="2026-W47/"') < html.indexOf('href="2026-W46/"'));
  assert.ok(html.indexOf('href="2026-W46/"') > 0);
  assert.match(html, /16 novembre/);
});

test("l'accueil reste correct sans aucun plan", (t) => {
  assert.match(build(t, []).read("index.html"), /Aucun plan/);
});

test("les pages sont adaptées au téléphone et sans script", (t) => {
  const { read } = build(t, [makePlan()]);
  for (const page of ["index.html", "2026-W46/index.html"]) {
    assert.match(read(page), /name="viewport"/);
    assert.doesNotMatch(read(page), /<script/);
  }
});

test("une semaine retirée disparaît, et l'image des autres est conservée", (t) => {
  const { out } = build(t, [makePlan()]);
  mkdirSync(join(out, "2026-W01"));
  const image = join(out, "2026-W46", "semaine.png");
  mkdirSync(join(out, "2026-W46"), { recursive: true });
  writeFileSync(image, "png");
  buildSite([makePlan()], out);
  assert.ok(!existsSync(join(out, "2026-W01")));
  assert.ok(existsSync(image));
});

test("les restes renvoient au repas d'origine, sans recette", (t) => {
  const html = build(t, [makePlan()]).read("2026-W46/index.html");
  assert.match(html, /Restes : Plat du lundi soir/);
  assert.match(html, /Restes du lundi soir/);
  assert.match(html, /8 portions/);
});

test("une page affiche l'accompagnement et la cuisine", (t) => {
  const html = build(t, [makePlan()]).read("2026-W46/index.html");
  assert.match(html, /Accompagnement du lundi soir/);
  assert.match(html, /Cuisine japonaise/i);
});

test("la pièce du vendredi a sa propre section de courses", (t) => {
  const html = build(t, [makePlan()]).read("2026-W46/index.html");
  assert.match(html, /Boucher \(à acheter vendredi\)/);
  assert.match(html, /entrecôte : 800 g/);
});

test("la page affiche les prix des ingrédients, des repas, des courses et de la semaine", (t) => {
  const html = build(t, [makePlan()]).read("2026-W46/index.html");
  assert.match(html, /riz : 400 g \(≈ 1,00 €\)/);
  assert.match(html, /Prix du repas : ≈ 25,00 €/);
  assert.match(html, /riz : 3,6 kg \(≈ 9,00 €\)/);
  assert.match(html, /Budget de la semaine : ≈ 34,00 €/);
  assert.match(html, /Courses à acheter : ≈ 33,00 €/);
  assert.match(html, /estim/i);
});
