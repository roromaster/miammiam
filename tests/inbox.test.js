import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatPending, isTrusted, loadState, parseMessage, pendingMessages, replyEmail, replyToMessage, saveState, stripQuote, weekOfSubject } from "../lib/inbox.js";

const OWNER = "moi@example.com";
const FRIEND = "ami@example.org";
const PEOPLE = { owner: OWNER, recipients: [OWNER, FRIEND] };
const SUBJECT = "🍽️ À valider : repas de la semaine du 16 novembre";
const T0 = Date.UTC(2026, 10, 15, 9);

function makeRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "miammiam-inbox-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "config"));
  mkdirSync(join(root, "data", "proposals"), { recursive: true });
  writeFileSync(join(root, "config", "recipients.local.json"), JSON.stringify(PEOPLE));
  writeFileSync(join(root, "data", "proposals", "2026-W47.json"), JSON.stringify({ week: "2026-W47", status: "proposed", meals: [] }));
  return root;
}

const b64 = (text) => Buffer.from(text).toString("base64url");

function raw({ id, thread = "t1", from = `Moi <${OWNER}>`, subject = `Re: ${SUBJECT}`, date = T0 + 60_000, labels = ["INBOX"], body = "remplace mardi soir", extra = [] }) {
  return {
    id,
    threadId: thread,
    internalDate: String(date),
    labelIds: labels,
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: from },
        { name: "Subject", value: subject },
        { name: "Message-ID", value: `<${id}@mail.example>` },
        ...extra,
      ],
      parts: [{ mimeType: "text/plain", body: { data: b64(body) } }, { mimeType: "text/html", body: { data: b64("<p>html</p>") } }],
    },
  };
}

const DMARC = { name: "Authentication-Results", value: "mx.google.com; dkim=pass header.i=@example.org; spf=pass; dmarc=pass (p=NONE) header.from=example.org" };

// Faux gws : répond aux appels list, get et threads.get à partir d'une liste de messages.
function fakeGws(messages, calls = []) {
  return async (cmd, args) => {
    calls.push(args);
    const { id } = JSON.parse(args[args.indexOf("--params") + 1]);
    const op = args.slice(1, 4).join(" ");
    let out;
    if (op === "users messages list") out = { messages: messages.map((m) => ({ id: m.id })) };
    else if (op === "users messages get") out = messages.find((m) => m.id === id);
    else if (op === "users threads get") out = { messages: messages.filter((m) => m.threadId === id) };
    else throw new Error(`appel inattendu : ${op}`);
    return { stdout: `Using keyring backend: keyring\n${JSON.stringify(out)}` };
  };
}

test("stripQuote retire le message cité et sa ligne d'introduction", () => {
  const text = "Remplace mardi soir.\r\nMerci !\r\n\r\nLe dim. 15 nov. 2026 à 10:02, Moi <moi@example.com>\r\na écrit :\r\n> Pour valider\r\n> lundi";
  assert.equal(stripQuote(text), "Remplace mardi soir.\nMerci !");
  assert.equal(stripQuote("ok\n\nOn Sun, Nov 15, 2026 at 10:02 AM Moi wrote:\n> x"), "ok");
  assert.equal(stripQuote("valide"), "valide");
});

test("parseMessage lit les en-têtes et préfère le texte brut", () => {
  const message = parseMessage(raw({ id: "a1", body: "valide\n\n> cité" }));
  assert.equal(message.header.subject, `Re: ${SUBJECT}`);
  assert.equal(message.text, "valide");
  assert.equal(message.date, T0 + 60_000);
});

test("parseMessage se rabat sur le HTML sans texte brut", () => {
  const message = raw({ id: "a1" });
  message.payload.parts = [{ mimeType: "text/html", body: { data: b64("<div>Plus léger&nbsp;svp</div><br>merci") } }];
  assert.equal(parseMessage(message).text, "Plus léger svp\n\nmerci");
});

test("isTrusted : envoyé depuis le compte, ou destinataire authentifié par DMARC", () => {
  const msg = (from, labels, extra = []) => parseMessage(raw({ id: "x", from, labels, extra }));
  assert.equal(isTrusted(msg(`Moi <${OWNER}>`, ["SENT"]), PEOPLE), true);
  assert.equal(isTrusted(msg(`Ami <${FRIEND}>`, ["INBOX"], [DMARC]), PEOPLE), true);
  assert.equal(isTrusted(msg(`Ami <${FRIEND}>`, ["INBOX"]), PEOPLE), false, "sans DMARC");
  assert.equal(isTrusted(msg(`Moi <${OWNER}>`, ["INBOX"]), PEOPLE), false, "adresse du compte usurpée");
  assert.equal(isTrusted(msg("Inconnu <x@evil.test>", ["INBOX"], [DMARC]), PEOPLE), false);
  assert.equal(isTrusted(msg(`AMI <${FRIEND.toUpperCase()}>`, ["INBOX"], [DMARC]), PEOPLE), true, "casse ignorée");
});

test("weekOfSubject retrouve la semaine et son état", (t) => {
  const root = makeRoot(t);
  assert.deepEqual(weekOfSubject(SUBJECT, T0, root), { week: "2026-W47", status: "proposed" });
  assert.deepEqual(weekOfSubject("Re: 🍽️ Repas de la semaine du 9 novembre", T0, root), { week: "2026-W46", status: "missing" });
  assert.deepEqual(weekOfSubject("Re: autre chose", T0, root), { week: null, status: null });
});

test("la première lecture fixe le point de départ sans rien traiter", async (t) => {
  const root = makeRoot(t);
  const calls = [];
  const result = await pendingMessages({ root, exec: fakeGws([raw({ id: "a1", labels: ["SENT"] })], calls), now: T0 });
  assert.deepEqual(result, { first: true, messages: [], ignored: 0 });
  assert.deepEqual(loadState(root), { since: T0, processed: [], sent: [] });
  assert.equal(calls.length, 0);
  assert.match(formatPending(result), /Aucun message à traiter/);
});

test("pendingMessages ne garde que les réponses de confiance, non traitées, après le départ", async (t) => {
  const root = makeRoot(t);
  saveState({ since: T0, processed: ["done"], sent: ["mine"] }, root);
  const messages = [
    raw({ id: "orig", subject: SUBJECT, labels: ["SENT"], date: T0 + 1000, extra: [{ name: "X-MiamMiam", value: "1" }] }),
    raw({ id: "old", labels: ["SENT"], date: T0 - 1000 }),
    raw({ id: "done", labels: ["SENT"] }),
    raw({ id: "claude", labels: ["SENT"], date: T0 + 90_000, body: "C'est fait, mardi soir est remplacé.", extra: [{ name: "X-MiamMiam", value: "1" }] }),
    raw({ id: "spoof", from: `Moi <${OWNER}>`, labels: ["INBOX"] }),
    raw({ id: "friend", from: `Ami <${FRIEND}>`, extra: [DMARC], date: T0 + 120_000, body: "Et valide !\n\n> cité" }),
    raw({ id: "me", labels: ["SENT"], date: T0 + 60_000 }),
  ];
  const result = await pendingMessages({ root, exec: fakeGws(messages), now: T0 + 200_000 });
  assert.deepEqual(result.messages.map((m) => m.id), ["me", "friend"]);
  assert.equal(result.ignored, 1);
  assert.deepEqual(loadState(root).processed, ["done", "spoof"]);
  const [me, friend] = result.messages;
  assert.equal(me.week, "2026-W47");
  assert.equal(me.status, "proposed");
  assert.equal(me.previous, null);
  assert.equal(friend.previous, "C'est fait, mardi soir est remplacé.");
  const text = formatPending(result);
  assert.match(text, /2 message\(s\) à traiter/);
  assert.match(text, /=== Message friend\nDe : Ami\n/);
  assert.match(text, /Semaine : 2026-W47 \(proposed\)/);
  assert.match(text, /<<<\nEt valide !\n>>>/);
  assert.match(text, /1 message\(s\) ignoré\(s\)/);
  assert.doesNotMatch(text, new RegExp(FRIEND));
});

test("replyEmail répond dans le fil, aux seuls destinataires, marqué X-MiamMiam", () => {
  const message = parseMessage(raw({ id: "a1", subject: `RE: Re: ${SUBJECT}`, extra: [{ name: "References", value: "<orig@mail.example>" }] }));
  const mime = replyEmail(message, "C'est fait.", { to: [OWNER, FRIEND] });
  assert.match(mime, new RegExp(`^To: ${OWNER}, ${FRIEND}\\r$`, "m"));
  assert.match(mime, /^In-Reply-To: <a1@mail\.example>\r$/m);
  assert.match(mime, /^References: <orig@mail\.example> <a1@mail\.example>\r$/m);
  assert.match(mime, /^X-MiamMiam: 1\r$/m);
  const [, subject] = mime.match(/^Subject: =\?UTF-8\?B\?(.+)\?=\r$/m);
  assert.equal(Buffer.from(subject, "base64").toString("utf8"), `Re: ${SUBJECT}`);
  const body = Buffer.from(mime.split("\r\n\r\n").at(-1).replaceAll("\r\n", ""), "base64").toString("utf8");
  assert.match(body, /^C'est fait\.\n\n— Claude, pour MiamMiam/);
});

test("replyToMessage envoie dans le fil et marque le message traité", async (t) => {
  const root = makeRoot(t);
  saveState({ since: T0, processed: [], sent: [] }, root);
  const sent = [];
  const send = async (mime, options) => { sent.push({ mime, threadId: options.threadId }); return "r1"; };
  const exec = fakeGws([raw({ id: "a1", thread: "t9" })]);
  assert.equal(await replyToMessage("a1", "C'est fait.", { root, exec, send }), "r1");
  assert.equal(sent[0].threadId, "t9");
  assert.deepEqual(loadState(root), { since: T0, processed: ["a1"], sent: ["r1"] });
  await assert.rejects(replyToMessage("a1", "encore", { root, exec, send }), /déjà traité/);
  await assert.rejects(replyToMessage("a2", "  ", { root, exec, send }), /vide/);
  assert.equal(sent.length, 1);
});

test("replyToMessage refuse tant que la boîte n'a jamais été lue", async (t) => {
  const root = makeRoot(t);
  await assert.rejects(replyToMessage("a1", "ok", { root, exec: fakeGws([]), send: async () => "x" }), /lancer d'abord inbox/);
});
