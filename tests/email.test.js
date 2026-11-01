import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRecipients, proposalEmail, sendRaw, weeklyEmail } from "../lib/email.js";
import { makePlan, withMeal } from "./helpers.js";

const png = Buffer.from("89504e470d0a1a0a", "hex");
const weekly = (plan = makePlan(), to = ["a@example.com", "b@example.com"]) =>
  weeklyEmail(plan, { to, siteUrl: "https://example.com/2026-W46/", imagePng: png });

function decodePart(mime, type) {
  const start = mime.indexOf(`Content-Type: ${type}`);
  assert.ok(start >= 0, `partie ${type} absente`);
  const bodyStart = mime.indexOf("\r\n\r\n", start) + 4;
  const body = mime.slice(bodyStart, mime.indexOf("\r\n--", bodyStart));
  return Buffer.from(body.replaceAll("\r\n", ""), "base64").toString("utf8");
}

function decodedSubject(mime) {
  const [, encoded] = mime.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m);
  return Buffer.from(encoded, "base64").toString("utf8");
}

test("l'email du lundi a un seul champ To avec les deux adresses", () => {
  const mime = weekly();
  assert.equal(mime.match(/^To: .*$/gm).length, 1);
  assert.match(mime, /^To: a@example\.com, b@example\.com\r$/m);
});

test("l'objet est encodé en RFC 2047", () => {
  assert.equal(decodedSubject(weekly()), "🍽️ Repas de la semaine du 9 novembre");
});

test("la structure intègre l'image et une version texte", () => {
  const mime = weekly();
  assert.match(mime, /Content-Type: multipart\/related/);
  assert.match(mime, /Content-Type: multipart\/alternative/);
  assert.match(mime, /Content-Type: text\/plain/);
  assert.match(mime, /Content-Type: text\/html/);
  assert.match(mime, /Content-ID: <semaine>/);
  assert.match(mime, /Content-Disposition: inline/);
  assert.match(decodePart(mime, "text/html"), /src="cid:semaine"/);
  assert.match(mime, new RegExp(png.toString("base64").replace(/[+/=]/g, "\\$&")));
});

test("les deux versions contiennent le lien et la liste", () => {
  for (const type of ["text/plain", "text/html"]) {
    const part = decodePart(weekly(), type);
    assert.match(part, /https:\/\/example\.com\/2026-W46\//);
    assert.match(part, /Épicerie/);
    assert.match(part, /riz : 5,2 kg/);
    assert.match(part, /À vérifier au placard/);
  }
});

test("les lignes base64 font au plus 76 caractères", () => {
  const big = Buffer.alloc(3000, 7);
  const mime = weeklyEmail(makePlan(), { to: ["a@example.com"], siteUrl: "https://e.com/", imagePng: big });
  const longest = Math.max(...mime.split("\r\n").map((line) => line.length));
  assert.ok(longest <= 998);
  const b64Lines = mime.split("\r\n").filter((l) => /^[A-Za-z0-9+/=]{40,}$/.test(l));
  assert.ok(b64Lines.every((l) => l.length <= 76));
});

test("un titre spécial est échappé en HTML et intact en texte", () => {
  const plan = withMeal(makePlan(), "mardi", "soir", {
    title: "Bœuf & <maison>",
    ingredients: [{ name: "bœuf & <co>", quantity: 1, unit: "kg", aisle: "Épicerie", staple: false }],
  });
  assert.match(decodePart(weekly(plan), "text/html"), /bœuf &amp; &lt;co&gt;/);
  assert.match(decodePart(weekly(plan), "text/plain"), /bœuf & <co>/);
  const proposal = proposalEmail(plan, { to: "a@example.com" });
  assert.match(decodePart(proposal, "text/html"), /Bœuf &amp; &lt;maison&gt;/);
  assert.match(decodePart(proposal, "text/plain"), /Bœuf & <maison>/);
});

test("la proposition liste les 14 plats, sans image, et explique la validation", () => {
  const mime = proposalEmail(makePlan(), { to: "a@example.com" });
  assert.equal(decodedSubject(mime), "🍽️ À valider : repas de la semaine du 9 novembre");
  assert.match(mime, /^To: a@example\.com\r$/m);
  assert.doesNotMatch(mime, /Content-ID/);
  const text = decodePart(mime, "text/plain");
  assert.equal((text.match(/Plat du /g) ?? []).length, 14);
  assert.match(text, /Claude Desktop/);
  assert.match(text, /MiamMiam/);
});

function recipientsRoot(t, content) {
  const root = mkdtempSync(join(tmpdir(), "miammiam-mail-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (content !== undefined) {
    mkdirSync(join(root, "config"));
    writeFileSync(join(root, "config/recipients.local.json"), content);
  }
  return root;
}

test("loadRecipients lit le fichier local", (t) => {
  const root = recipientsRoot(t, JSON.stringify({ owner: "a@example.com", recipients: ["a@example.com"] }));
  assert.deepEqual(loadRecipients(root), { owner: "a@example.com", recipients: ["a@example.com"] });
});

test("loadRecipients refuse un fichier absent, illisible ou incomplet", (t) => {
  assert.throws(() => loadRecipients(recipientsRoot(t)), /recipients\.local\.json/);
  assert.throws(() => loadRecipients(recipientsRoot(t, "{oups")), /recipients\.local\.json/);
  assert.throws(() => loadRecipients(recipientsRoot(t, '{"recipients":["a@example.com"]}')), /owner/);
  assert.throws(() => loadRecipients(recipientsRoot(t, '{"owner":"a@example.com","recipients":[]}')), /recipients/);
});

test("sendRaw appelle gws avec le message en base64url", async () => {
  const calls = [];
  await sendRaw("To: a@example.com\r\n\r\nélan?>", { exec: async (cmd, args) => { calls.push([cmd, args]); return { stdout: '{"id":"1"}' }; } });
  const [cmd, args] = calls[0];
  assert.equal(cmd, "gws");
  assert.deepEqual(args.slice(0, 4), ["gmail", "users", "messages", "send"]);
  assert.equal(args[args.indexOf("--params") + 1], '{"userId":"me"}');
  const { raw } = JSON.parse(args[args.indexOf("--json") + 1]);
  assert.doesNotMatch(raw, /[+/=]/);
  assert.equal(Buffer.from(raw, "base64url").toString("utf8"), "To: a@example.com\r\n\r\nélan?>");
});

test("sendRaw échoue si gws échoue", async () => {
  await assert.rejects(sendRaw("x", { exec: async () => { throw new Error("invalid_grant"); } }), /invalid_grant/);
});

test("sendRaw échoue si gws renvoie une erreur sur la sortie standard", async () => {
  await assert.rejects(sendRaw("x", { exec: async () => ({ stdout: '{"error":{"code":401,"message":"auth"}}' }) }), /auth/);
});

test("sendRaw refuse un message trop gros avant d'appeler gws", async () => {
  let called = false;
  await assert.rejects(sendRaw("x".repeat(800_000), { exec: async () => { called = true; return { stdout: "{}" }; } }), /trop volumineux/);
  assert.equal(called, false);
});

test("sendRaw donne l'erreur utile de gws, sans recopier l'email", async () => {
  const exec = async (cmd, args) => {
    throw Object.assign(new Error(`Command failed: gws ${args.join(" ")}`), {
      code: 1,
      stdout: '{"error":{"code":401,"message":"invalid_grant"}}',
      stderr: "hint: gws auth login",
    });
  };
  await assert.rejects(sendRaw("corps-secret-du-message", { exec }), (error) => {
    assert.match(error.message, /invalid_grant/);
    assert.match(error.message, /gws auth login/);
    assert.ok(!error.message.includes(Buffer.from("corps-secret-du-message").toString("base64url")));
    return true;
  });
});

test("sendRaw n'accepte comme succès qu'une réponse avec un id", async () => {
  for (const stdout of ["", "ok", "{}", '{"labelIds":["SENT"]}', '{"id":""}']) {
    await assert.rejects(sendRaw("x", { exec: async () => ({ stdout }) }), /Échec d'envoi/, stdout);
  }
  await sendRaw("x", { exec: async () => ({ stdout: 'Using keyring backend: keyring\n{"id":"abc"}' }) });
});
