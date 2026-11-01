import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright-core";
import { DAYS, SLOTS } from "./plan.js";
import { formatPrice, mealPrice, weekPrice } from "./shopping.js";
import { esc } from "./site.js";
import { frenchDate } from "./week.js";

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; width: 1200px; }
body { background: #fbf7f0; color: #2b2620; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; padding: 28px; }
h1 { margin: 0 0 20px; font-size: 32px; }
.grid { display: grid; grid-template-columns: 52px repeat(7, minmax(0, 1fr)); gap: 8px; }
.day { background: #b4532a; color: #fff; font-weight: 700; font-size: 17px; text-align: center; padding: 9px 2px; border-radius: 8px; }
.slot { display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; color: #6f665a; }
.meal { background: #fff; border: 1px solid #e6ddcf; border-radius: 10px; padding: 12px 8px; text-align: center; min-height: 150px; overflow-wrap: anywhere; }
.emoji { font-size: 44px; line-height: 1.2; }
.title { font-size: 16px; line-height: 1.3; font-weight: 600; margin-top: 6px; }
.price { font-size: 14px; color: #6f665a; margin-top: 6px; }
.budget { font-size: 20px; font-weight: 600; color: #b4532a; margin: -12px 0 18px; }
`;

export function gridHtml(plan) {
  const headers = DAYS.map((day) => `<div class="day">${capitalize(day)}</div>`).join("");
  const rows = SLOTS.map((slot) => {
    const cells = DAYS.map((day) => {
      const meal = plan.meals.find((m) => m.day === day && m.slot === slot);
      return `<div class="meal"><div class="emoji">${esc(meal.emoji)}</div><div class="title">${esc(meal.title)}</div><div class="price">${meal.leftoversOf ? "Inclus la veille" : `≈ ${esc(formatPrice(mealPrice(meal)))}`}</div></div>`;
    }).join("");
    return `<div class="slot">${capitalize(slot)}</div>${cells}`;
  }).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${CSS}</style></head>
<body><h1>Repas de la semaine du ${esc(frenchDate(plan.startDate))}</h1>
<div class="budget">Budget estimé de la semaine : ≈ ${esc(formatPrice(weekPrice(plan)))}</div>
<div class="grid"><div></div>${headers}${rows}</div></body></html>`;
}

export async function renderToPage(plan) {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1200, height: 100 }, deviceScaleFactor: 1 });
  await page.setContent(gridHtml(plan));
  return { browser, page };
}

export async function renderImage(plan, outPath) {
  const { browser, page } = await renderToPage(plan);
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, fullPage: true });
  } finally {
    await browser.close();
  }
}
