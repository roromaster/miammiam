import { mondayOf } from "./week.js";

export const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
export const SLOTS = ["midi", "soir"];
export const UNITS = ["g", "kg", "ml", "cl", "l", "pièce", "c. à soupe", "c. à café", "gousse", "tranche"];
export const AISLES = [
  "Fruits et légumes", "Viandes et poissons", "Produits laitiers",
  "Épicerie", "Surgelés", "Boulangerie", "Boissons",
];
export const STATUSES = ["proposed", "validated", "sent"];

const WEEKEND = ["samedi", "dimanche"];
const normalize = (title) => String(title).trim().toLocaleLowerCase("fr");

function validateMeal(meal) {
  const label = `${meal.day} ${meal.slot}`;
  const errors = [];
  if (!DAYS.includes(meal.day) || !SLOTS.includes(meal.slot)) errors.push(`${label} : jour ou moment inconnu`);
  if (!String(meal.title ?? "").trim()) errors.push(`${label} : titre manquant`);
  if (!String(meal.emoji ?? "").trim()) errors.push(`${label} : emoji manquant`);
  const limit = WEEKEND.includes(meal.day) ? 90 : 30;
  if (!(meal.minutes > 0 && meal.minutes <= limit)) errors.push(`${label} : ${meal.minutes} min, limite de ${limit} min`);
  if (meal.servings !== 4) errors.push(`${label} : la recette doit être pour 4 personnes`);
  if (!Array.isArray(meal.steps) || meal.steps.length === 0) errors.push(`${label} : aucune étape`);
  if (!Array.isArray(meal.ingredients) || meal.ingredients.length === 0) {
    errors.push(`${label} : aucun ingrédient`);
    return errors;
  }
  for (const item of meal.ingredients) {
    if (!String(item.name ?? "").trim()) errors.push(`${label} : ingrédient sans nom`);
    if (!UNITS.includes(item.unit)) errors.push(`${label} : unité inconnue « ${item.unit} »`);
    if (!AISLES.includes(item.aisle)) errors.push(`${label} : rayon inconnu « ${item.aisle} »`);
    if (!(item.quantity > 0)) errors.push(`${label} : quantité invalide pour ${item.name}`);
    if (typeof item.staple !== "boolean") errors.push(`${label} : staple manquant pour ${item.name}`);
  }
  return errors;
}

export function validatePlan(plan, { previousTitles = [] } = {}) {
  const errors = [];
  if (!/^\d{4}-W\d{2}$/.test(plan.week ?? "")) return [`semaine invalide : ${plan.week}`];
  if (plan.startDate !== mondayOf(plan.week)) errors.push(`startDate doit valoir ${mondayOf(plan.week)}`);
  if (!STATUSES.includes(plan.status)) errors.push(`status inconnu : ${plan.status}`);
  if (!Array.isArray(plan.meals)) return [...errors, "meals manquant"];
  if (plan.meals.length !== 14) errors.push(`il faut 14 repas, ${plan.meals.length} trouvés`);

  const slots = new Set();
  const titles = new Set();
  const previous = new Set(previousTitles.map(normalize));
  for (const meal of plan.meals) {
    const label = `${meal.day} ${meal.slot}`;
    if (slots.has(label)) errors.push(`${label} : présent deux fois`);
    slots.add(label);
    const title = normalize(meal.title);
    if (titles.has(title)) errors.push(`« ${meal.title} » : titre présent deux fois`);
    titles.add(title);
    if (previous.has(title)) errors.push(`« ${meal.title} » : déjà servi dans les 4 semaines précédentes`);
    errors.push(...validateMeal(meal));
  }
  return errors;
}
