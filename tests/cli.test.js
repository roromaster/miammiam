import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePlan, withMeal } from "./helpers.js";

function cli(t) {
  const root = mkdtempSync(join(tmpdir(), "miammiam-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, ["scripts/miammiam.js", ...args], {
    encoding: "utf8",
    env: { ...process.env, MIAMMIAM_ROOT: root },
  });
  const file = (plan) => {
    const path = join(root, "plan.json");
    writeFileSync(path, JSON.stringify(plan));
    return path;
  };
  return { root, run, file };
}

test("une commande inconnue échoue avec l'aide", (t) => {
  const result = cli(t).run("cuisiner");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Commandes/);
});

test("target renvoie une semaine ISO", (t) => {
  const { run } = cli(t);
  for (const which of ["upcoming", "current"]) {
    const result = run("target", which);
    assert.equal(result.status, 0);
    assert.match(result.stdout.trim(), /^\d{4}-W\d{2}$/);
  }
  assert.equal(run("target", "demain").status, 1);
});

test("status suit la vie du plan", (t) => {
  const { run, file } = cli(t);
  assert.equal(run("status", "2026-W46").stdout.trim(), "missing");
  assert.equal(run("save-proposal", file(makePlan())).status, 0);
  assert.equal(run("status", "2026-W46").stdout.trim(), "proposed");
});

test("check signale les erreurs avec un code 1", (t) => {
  const { run, file } = cli(t);
  assert.equal(run("check", file(makePlan())).status, 0);
  const result = run("check", file(withMeal(makePlan(), "mardi", "soir", { minutes: 45 })));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /mardi soir/);
});

test("save-proposal refuse un plan invalide et accepte un plan existant sans l'écraser", (t) => {
  const { root, run, file } = cli(t);
  const invalid = run("save-proposal", file(makePlan({ startDate: "2020-01-01" })));
  assert.equal(invalid.status, 1);
  assert.ok(!existsSync(join(root, "data/proposals/2026-W46.json")));
  assert.equal(run("save-proposal", file(makePlan())).status, 0);
  const again = run("save-proposal", file(makePlan()));
  assert.equal(again.status, 0);
  assert.match(again.stdout, /existe déjà/);
});

test("une erreur métier sort sur stderr avec un code 1", (t) => {
  const result = cli(t).run("send-weekly", "2026-W46");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /recipients|plan absent/);
});

test("une semaine mal écrite est refusée", (t) => {
  const result = cli(t).run("status", "../secret");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /semaine/i);
});
