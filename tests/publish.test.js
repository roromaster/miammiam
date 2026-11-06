import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publish, pullLatest, SITE_URL } from "../lib/publish.js";
import { planHash, savePlan } from "../lib/store.js";
import { makePlan } from "./helpers.js";

function setup(t, { dirty = true, gitFailOn } = {}) {
  const root = mkdtempSync(join(tmpdir(), "miammiam-pub-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plan = makePlan({ status: "validated" });
  savePlan(plan, root);
  const git = [];
  const exec = async (cmd, args) => {
    assert.equal(cmd, "git");
    git.push(args);
    if (gitFailOn === args[0]) throw new Error(`git ${args[0]} refusé`);
    if (args[0] === "diff" && dirty) throw Object.assign(new Error("diff"), { code: 1 });
    return { stdout: "" };
  };
  const rendered = [];
  const render = async (p, path) => rendered.push([p.week, path]);
  const okFetch = async () => ({ ok: true, text: async () => `<meta content="${planHash(plan)}">` });
  return { root, plan, git, exec, render, rendered, okFetch };
}

test("publish ajoute seulement les plans et le site, puis pousse", async (t) => {
  const { root, git, exec, render, okFetch } = setup(t);
  const url = await publish("2026-W46", { root, exec, render, fetch: okFetch, pollMs: 1 });
  assert.equal(url, `${SITE_URL}2026-W46/`);
  assert.deepEqual(git.find((a) => a[0] === "add"), ["add", "--all", "--", "data/proposals", "data/weeks", "site"]);
  assert.ok(git.some((a) => a[0] === "commit"));
  assert.deepEqual(git.at(-1), ["push", "origin", "main"]);
});

test("publish construit le site et rend l'image de la semaine", async (t) => {
  const { root, exec, render, rendered, okFetch } = setup(t);
  await publish("2026-W46", { root, exec, render, fetch: okFetch, pollMs: 1 });
  assert.ok(existsSync(join(root, "site/2026-W46/index.html")));
  assert.match(readFileSync(join(root, "site/index.html"), "utf8"), /2026-W46/);
  assert.deepEqual(rendered, [["2026-W46", join(root, "site/2026-W46/semaine.png")]]);
});

test("sans changement, pas de commit, mais push et contrôle ont lieu", async (t) => {
  const { root, git, exec, render, okFetch } = setup(t, { dirty: false });
  await publish("2026-W46", { root, exec, render, fetch: okFetch, pollMs: 1 });
  assert.ok(!git.some((a) => a[0] === "commit"));
  assert.ok(git.some((a) => a[0] === "push"));
});

test("publish attend que la nouvelle version soit en ligne", async (t) => {
  const { root, plan, exec, render } = setup(t);
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return { ok: true, text: async () => (calls < 3 ? "ancienne page" : planHash(plan)) };
  };
  await publish("2026-W46", { root, exec, render, fetch, pollMs: 1 });
  assert.equal(calls, 3);
});

test("publish tolère une erreur réseau passagère", async (t) => {
  const { root, plan, exec, render } = setup(t);
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    if (calls === 1) throw new Error("réseau");
    return { ok: true, text: async () => planHash(plan) };
  };
  await publish("2026-W46", { root, exec, render, fetch, pollMs: 1 });
  assert.equal(calls, 2);
});

test("publish échoue si la version n'arrive jamais", async (t) => {
  const { root, exec, render } = setup(t);
  const fetch = async () => ({ ok: true, text: async () => "ancienne page" });
  await assert.rejects(publish("2026-W46", { root, exec, render, fetch, pollMs: 1, timeoutMs: 5 }), /Publication non confirmée/);
});

test("un push refusé fait échouer publish sans contrôle d'URL", async (t) => {
  const { root, exec, render } = setup(t, { gitFailOn: "push" });
  let fetched = false;
  const fetch = async () => { fetched = true; return { ok: true, text: async () => "" }; };
  await assert.rejects(publish("2026-W46", { root, exec, render, fetch, pollMs: 1 }), /push refusé/);
  assert.equal(fetched, false);
});

test("publish refuse une semaine qui n'est pas publiable", async (t) => {
  const { root, exec, render, okFetch } = setup(t);
  await assert.rejects(publish("2026-W47", { root, exec, render, fetch: okFetch, pollMs: 1 }), /2026-W47/);
});

test("pullLatest rebase sur origin/main en gardant les modifications locales", async () => {
  const calls = [];
  await pullLatest({ root: "/projet", exec: async (cmd, args, options) => { calls.push([cmd, args, options.cwd]); return { stdout: "" }; } });
  assert.deepEqual(calls, [["git", ["pull", "--rebase", "--autostash", "origin", "main"], "/projet"]]);
});
