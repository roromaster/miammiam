import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { DAYS, SLOTS } from "./plan.js";
import { formatItem, shoppingList } from "./shopping.js";
import { esc } from "./site.js";
import { PROJECT_ROOT } from "./store.js";
import { frenchDate } from "./week.js";

const CRLF = "\r\n";
// macOS limite la ligne de commande à environ 1 Mo, et le message y passe en base64.
const MAX_RAW_LENGTH = 900_000;
const execFileAsync = promisify(execFile);

export function loadRecipients(root = PROJECT_ROOT) {
  const path = join(root, "config", "recipients.local.json");
  let config;
  try {
    config = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Impossible de lire config/recipients.local.json : ${error.message}`);
  }
  if (typeof config.owner !== "string" || !config.owner.includes("@")) {
    throw new Error("config/recipients.local.json : owner manquant");
  }
  if (!Array.isArray(config.recipients) || config.recipients.length === 0) {
    throw new Error("config/recipients.local.json : recipients est vide");
  }
  return { owner: config.owner, recipients: config.recipients };
}

const wrap76 = (b64) => b64.match(/.{1,76}/g)?.join(CRLF) ?? "";
const base64Body = (content) => wrap76(Buffer.from(content).toString("base64"));
const encodeSubject = (subject) => `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;

const textPart = (type, content) =>
  `Content-Type: text/${type}; charset="UTF-8"${CRLF}Content-Transfer-Encoding: base64${CRLF}${CRLF}${base64Body(content)}`;

function multipart(subtype, boundary, parts) {
  const body = parts.map((part) => `--${boundary}${CRLF}${part}`).join(CRLF);
  return `Content-Type: multipart/${subtype}; boundary="${boundary}"${CRLF}${CRLF}${body}${CRLF}--${boundary}--`;
}

const headers = (to, subject) => [`To: ${to}`, `Subject: ${encodeSubject(subject)}`, "MIME-Version: 1.0"].join(CRLF);

function weeklyText(plan, siteUrl) {
  const { aisles, pantry } = shoppingList(plan);
  const groups = aisles.map(({ aisle, items }) => [aisle, ...items.map((item) => `- ${formatItem(item)}`)].join("\n"));
  if (pantry.length > 0) groups.push(["À vérifier au placard", ...pantry.map((name) => `- ${name}`)].join("\n"));
  return `Recettes de la semaine : ${siteUrl}\n\nLISTE DE COURSES\n\n${groups.join("\n\n")}\n`;
}

function weeklyHtml(plan, siteUrl) {
  const { aisles, pantry } = shoppingList(plan);
  const section = (title, lines) =>
    `<h3 style="margin:18px 0 4px">${esc(title)}</h3><ul style="margin:0;padding-left:20px">${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`;
  const groups = aisles.map(({ aisle, items }) => section(aisle, items.map(formatItem)));
  if (pantry.length > 0) groups.push(section("À vérifier au placard", pantry));
  const date = esc(frenchDate(plan.startDate));
  return `<div style="font-family:-apple-system,Arial,sans-serif;color:#2b2620;max-width:720px">
<img src="cid:semaine" alt="Grille des repas de la semaine du ${date}" style="width:100%;height:auto;border-radius:8px">
<p><a href="${esc(siteUrl)}">Voir toutes les recettes de la semaine</a></p>
<h2 style="margin-bottom:0">Liste de courses</h2>
${groups.join("\n")}
</div>`;
}

export function weeklyEmail(plan, { to, siteUrl, imagePng }) {
  const subject = `🍽️ Repas de la semaine du ${frenchDate(plan.startDate)}`;
  const alternative = multipart("alternative", "miammiam-alternative", [
    textPart("plain", weeklyText(plan, siteUrl)),
    textPart("html", weeklyHtml(plan, siteUrl)),
  ]);
  const image = [
    'Content-Type: image/png; name="semaine.png"',
    "Content-Transfer-Encoding: base64",
    "Content-ID: <semaine>",
    'Content-Disposition: inline; filename="semaine.png"',
    "",
    wrap76(imagePng.toString("base64")),
  ].join(CRLF);
  return `${headers(to.join(", "), subject)}${CRLF}${multipart("related", "miammiam-related", [alternative, image])}${CRLF}`;
}

const HOW_TO_VALIDATE = "Pour valider ou remplacer un plat, réponds dans une session Claude Desktop du projet MiamMiam, par exemple : « remplace mardi soir par un plat plus léger », puis « valide ». Sans réponse, cette proposition partira telle quelle lundi matin.";

export function proposalEmail(plan, { to }) {
  const date = frenchDate(plan.startDate);
  const days = DAYS.map((day) => ({
    day,
    meals: SLOTS.map((slot) => plan.meals.find((m) => m.day === day && m.slot === slot)),
  }));
  const text = `${HOW_TO_VALIDATE}\n\n${days.map(({ day, meals }) =>
    `${day}\n${meals.map((m) => `- ${m.slot} : ${m.emoji} ${m.title}`).join("\n")}`).join("\n\n")}\n`;
  const html = `<div style="font-family:-apple-system,Arial,sans-serif;color:#2b2620;max-width:720px">
<p>${esc(HOW_TO_VALIDATE)}</p>
${days.map(({ day, meals }) => `<h3 style="margin:18px 0 4px">${esc(day)}</h3><ul style="margin:0;padding-left:20px">${meals.map((m) =>
    `<li>${esc(m.slot)} : ${esc(m.emoji)} ${esc(m.title)}</li>`).join("")}</ul>`).join("\n")}
</div>`;
  const body = multipart("alternative", "miammiam-alternative", [textPart("plain", text), textPart("html", html)]);
  return `${headers(to, `🍽️ À valider : repas de la semaine du ${date}`)}${CRLF}${body}${CRLF}`;
}

export async function sendRaw(mime, { exec = execFileAsync } = {}) {
  const raw = Buffer.from(mime).toString("base64url");
  if (raw.length > MAX_RAW_LENGTH) throw new Error(`Email trop volumineux pour gws : ${raw.length} caractères`);
  const { stdout } = await exec("gws", [
    "gmail", "users", "messages", "send",
    "--params", '{"userId":"me"}',
    "--json", JSON.stringify({ raw }),
  ]);
  // gws signale ses erreurs d'API en JSON sur la sortie standard.
  const error = stdout?.match(/"error"\s*:/) ? stdout : null;
  if (error) throw new Error(`Échec d'envoi gws : ${error}`);
}
