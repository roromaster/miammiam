import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { DAYS, SLOTS } from "./plan.js";
import { PRICE_NOTE, budgetLines, formatPrice, formatPricedItem, mealPrice, shoppingList } from "./shopping.js";
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
  const groups = aisles.map(({ aisle, items }) => [aisle, ...items.map((item) => `- ${formatPricedItem(item)}`)].join("\n"));
  if (pantry.length > 0) groups.push(["À vérifier au placard", ...pantry.map((name) => `- ${name}`)].join("\n"));
  return `Recettes de la semaine : ${siteUrl}\n\n${budgetLines(plan).join("\n")}\n${PRICE_NOTE}\n\nLISTE DE COURSES\n\n${groups.join("\n\n")}\n`;
}

function weeklyHtml(plan, siteUrl) {
  const { aisles, pantry } = shoppingList(plan);
  const section = (title, lines) =>
    `<h3 style="margin:18px 0 4px">${esc(title)}</h3><ul style="margin:0;padding-left:20px">${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`;
  const groups = aisles.map(({ aisle, items }) => section(aisle, items.map(formatPricedItem)));
  if (pantry.length > 0) groups.push(section("À vérifier au placard", pantry));
  const date = esc(frenchDate(plan.startDate));
  return `<div style="font-family:-apple-system,Arial,sans-serif;color:#2b2620;max-width:720px">
<img src="cid:semaine" alt="Grille des repas de la semaine du ${date}" style="width:100%;height:auto;border-radius:8px">
<p><a href="${esc(siteUrl)}">Voir toutes les recettes de la semaine</a></p>
<p>${budgetLines(plan).map((line) => `<strong>${esc(line)}</strong>`).join("<br>")}<br><small>${esc(PRICE_NOTE)}</small></p>
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

const portions = (servings) => (servings === 8 ? "8 portions, dont 4 pour les restes" : `${servings} personnes`);
const recipeMeta = (m) => `${m.day} ${m.slot} · cuisine ${m.cuisine} · ${m.minutes} min · ${portions(m.servings)} · ≈ ${formatPrice(mealPrice(m))}`;

function recipeText(m) {
  return [
    `${m.emoji} ${m.title.toUpperCase()}`,
    recipeMeta(m),
    `Accompagnement : ${m.side}`,
    "",
    "Ingrédients",
    ...m.ingredients.map((i) => `- ${formatPricedItem(i)}`),
    "",
    "Préparation",
    ...m.steps.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}

function recipeHtml(m) {
  return `<div style="border:1px solid #e6ddcf;border-radius:10px;padding:12px 16px;margin:12px 0">
<h3 style="margin:0">${esc(m.emoji)} ${esc(m.title)}</h3>
<p style="color:#6f665a;margin:2px 0 8px">${esc(recipeMeta(m))}</p>
<p style="margin:0 0 8px"><strong>Accompagnement :</strong> ${esc(m.side)}</p>
<strong>Ingrédients</strong><ul style="margin:4px 0 8px;padding-left:20px">${m.ingredients.map((i) => `<li>${esc(formatPricedItem(i))}</li>`).join("")}</ul>
<strong>Préparation</strong><ol style="margin:4px 0;padding-left:20px">${m.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
</div>`;
}

export function proposalEmail(plan, { to }) {
  const date = frenchDate(plan.startDate);
  const days = DAYS.map((day) => ({
    day,
    meals: SLOTS.map((slot) => plan.meals.find((m) => m.day === day && m.slot === slot)),
  }));
  const line = (m) => `${m.slot} : ${m.emoji} ${m.title}${m.side ? ` (accompagnement : ${m.side})` : ""}${m.leftoversOf ? "" : `, ≈ ${formatPrice(mealPrice(m))}`}`;
  const cooked = days.flatMap(({ meals }) => meals.filter((m) => !m.leftoversOf));
  const text = `${HOW_TO_VALIDATE}\n\n${budgetLines(plan).join("\n")}\n${PRICE_NOTE}\n\n${days.map(({ day, meals }) =>
    `${day}\n${meals.map((m) => `- ${line(m)}`).join("\n")}`).join("\n\n")}\n\nRECETTES\n\n${cooked.map(recipeText).join("\n\n")}\n`;
  const html = `<div style="font-family:-apple-system,Arial,sans-serif;color:#2b2620;max-width:720px">
<p>${esc(HOW_TO_VALIDATE)}</p>
<p>${budgetLines(plan).map((text) => `<strong>${esc(text)}</strong>`).join("<br>")}<br><small>${esc(PRICE_NOTE)}</small></p>
${days.map(({ day, meals }) => `<h3 style="margin:18px 0 4px">${esc(day)}</h3><ul style="margin:0;padding-left:20px">${meals.map((m) =>
    `<li>${esc(line(m))}</li>`).join("")}</ul>`).join("\n")}
<h2 style="margin:28px 0 0">Recettes</h2>
${cooked.map(recipeHtml).join("\n")}
</div>`;
  const body = multipart("alternative", "miammiam-alternative", [textPart("plain", text), textPart("html", html)]);
  return `${headers(to, `🍽️ À valider : repas de la semaine du ${date}`)}${CRLF}${body}${CRLF}`;
}

export async function sendRaw(mime, { exec = execFileAsync } = {}) {
  const raw = Buffer.from(mime).toString("base64url");
  if (raw.length > MAX_RAW_LENGTH) throw new Error(`Email trop volumineux pour gws : ${raw.length} caractères`);
  let stdout;
  try {
    ({ stdout } = await exec("gws", [
      "gmail", "users", "messages", "send",
      "--params", '{"userId":"me"}',
      "--json", JSON.stringify({ raw }),
    ]));
  } catch (error) {
    // Le message d'execFile recopie les arguments, donc tout l'email.
    const details = [error.message.replaceAll(raw, "<message>"), error.stdout, error.stderr].filter(Boolean);
    throw new Error(`Échec d'envoi gws : ${details.join("\n")}`);
  }
  if (!sentMessageId(stdout)) throw new Error(`Échec d'envoi gws : réponse sans id : ${stdout}`);
}

// Seul un id prouve l'envoi : sinon la semaine serait marquée "sent" sans email.
function sentMessageId(stdout = "") {
  try {
    return JSON.parse(stdout.slice(stdout.indexOf("{"))).id;
  } catch {
    return null;
  }
}
