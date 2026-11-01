import { mondayOf } from "./week.js";

export const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
export const SLOTS = ["midi", "soir"];
export const UNITS = ["g", "kg", "ml", "cl", "l", "pièce", "c. à soupe", "c. à café", "gousse", "tranche"];
export const BUTCHER_AISLE = "Boucher (à acheter vendredi)";
export const AISLES = [
  "Fruits et légumes", "Viandes et poissons", "Produits laitiers",
  "Épicerie", "Surgelés", "Boulangerie", "Boissons", BUTCHER_AISLE,
];
export const CUISINES = ["japonaise", "chinoise", "mexicaine", "thaïe", "française", "italienne", "burger"];
export const STATUSES = ["proposed", "validated", "sent"];

const WEEKEND = ["samedi", "dimanche"];
const MIN_CUISINES = 4;
const LUNCH_SOURCE = { mardi: "lundi", mercredi: "mardi", jeudi: "mercredi", vendredi: "jeudi" };
// Seuls le comté, le gruyère et l'emmental sont aimés.
const REFUSED_CHEESE = /(?<![\p{L}])(chevre|roblochon|reblochon|parmesan|parmigiano|grana|pecorino|mozzarella|burrata|feta|ricotta|mascarpone|cheddar|roquefort|bleu d'auvergne|gorgonzola|camembert|brie|raclette|morbier|cantal|tomme|gouda|edam|mimolette|maroilles|munster|saint-nectaire|halloumi|boursin|philadelphia|cream cheese|fromage(?! blanc))s?(?![\p{L}])/u;

const normalize = (title) => String(title).trim().toLocaleLowerCase("fr");
const plain = (text) => normalize(text).normalize("NFD").replace(/\p{M}/gu, "");
const hasRefusedCheese = (text) => REFUSED_CHEESE.test(plain(text));
const isCookedFor8 = (meal) => meal.slot === "soir" && !["vendredi", "samedi"].includes(meal.day);

function validateLeftovers(meal, label, source, sourceTitle) {
  const errors = [];
  if (meal.leftoversOf !== source) errors.push(`${label} : doit reprendre les restes de ${source} soir`);
  if (sourceTitle && !normalize(meal.title).includes(normalize(sourceTitle))) {
    errors.push(`${label} : le titre doit citer « ${sourceTitle} »`);
  }
  if (meal.ingredients?.length > 0 || meal.steps?.length > 0) errors.push(`${label} : des restes n'ont ni ingrédient ni étape`);
  return errors;
}

function validateCookedMeal(meal, label) {
  const errors = [];
  if (!String(meal.title ?? "").trim()) errors.push(`${label} : titre manquant`);
  if (!String(meal.emoji ?? "").trim()) errors.push(`${label} : emoji manquant`);
  if (!CUISINES.includes(meal.cuisine)) errors.push(`${label} : cuisine inconnue « ${meal.cuisine} »`);
  if (!String(meal.side ?? "").trim()) errors.push(`${label} : accompagnement manquant`);
  const limit = WEEKEND.includes(meal.day) ? 90 : 30;
  if (!(meal.minutes > 0 && meal.minutes <= limit)) errors.push(`${label} : ${meal.minutes} min, limite de ${limit} min`);
  const servings = isCookedFor8(meal) ? 8 : 4;
  if (meal.servings !== servings) errors.push(`${label} : la recette doit donner ${servings} portions`);
  if (!Array.isArray(meal.steps) || meal.steps.length === 0) errors.push(`${label} : aucune étape`);
  if (hasRefusedCheese(meal.title ?? "") || hasRefusedCheese(meal.side ?? "")) errors.push(`${label} : fromage refusé dans le titre ou l'accompagnement`);
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
    if (typeof item.price !== "number" || !(item.price > 0)) errors.push(`${label} : prix invalide pour ${item.name}`);
    if (hasRefusedCheese(item.name ?? "")) errors.push(`${label} : fromage refusé « ${item.name} »`);
  }
  const fromButcher = meal.ingredients.some((item) => item.aisle === BUTCHER_AISLE);
  const isFridayDinner = meal.day === "vendredi" && meal.slot === "soir";
  if (isFridayDinner && !fromButcher) errors.push(`${label} : il faut une pièce de viande du boucher`);
  if (!isFridayDinner && fromButcher) errors.push(`${label} : le rayon du boucher est réservé au vendredi soir`);
  return errors;
}

function validateMeal(meal, plan, previousSunday) {
  const label = `${meal.day} ${meal.slot}`;
  if (!DAYS.includes(meal.day) || !SLOTS.includes(meal.slot)) return [`${label} : jour ou moment inconnu`];

  if (meal.slot === "midi" && LUNCH_SOURCE[meal.day]) {
    const source = LUNCH_SOURCE[meal.day];
    const dinner = plan.meals.find((m) => m.day === source && m.slot === "soir");
    return validateLeftovers(meal, label, source, dinner?.title);
  }
  if (meal.day === "lundi" && meal.slot === "midi" && previousSunday) {
    return validateLeftovers(meal, label, "dimanche", previousSunday.title);
  }
  if (meal.leftoversOf) return [`${label} : ce repas ne peut pas être des restes`];
  return validateCookedMeal(meal, label);
}

export function validatePlan(plan, { previousTitles = [], previousSunday = null } = {}) {
  const errors = [];
  if (!/^\d{4}-W\d{2}$/.test(plan.week ?? "")) return [`semaine invalide : ${plan.week}`];
  if (plan.startDate !== mondayOf(plan.week)) errors.push(`startDate doit valoir ${mondayOf(plan.week)}`);
  if (!STATUSES.includes(plan.status)) errors.push(`status inconnu : ${plan.status}`);
  if (!Array.isArray(plan.meals)) return [...errors, "meals manquant"];
  if (plan.meals.length !== 14) errors.push(`il faut 14 repas, ${plan.meals.length} trouvés`);

  const slots = new Set();
  const titles = new Set();
  const sides = new Set();
  const previous = new Set(previousTitles.map(normalize));
  for (const meal of plan.meals) {
    const label = `${meal.day} ${meal.slot}`;
    if (slots.has(label)) errors.push(`${label} : présent deux fois`);
    slots.add(label);
    errors.push(...validateMeal(meal, plan, previousSunday));
    if (meal.leftoversOf) continue;
    const title = normalize(meal.title);
    if (titles.has(title)) errors.push(`« ${meal.title} » : titre présent deux fois`);
    titles.add(title);
    if (previous.has(title)) errors.push(`« ${meal.title} » : déjà servi dans les 4 semaines précédentes`);
    if (meal.side) {
      const side = normalize(meal.side);
      if (sides.has(side)) errors.push(`« ${meal.side} » : accompagnement présent deux fois`);
      sides.add(side);
    }
  }

  const cooked = plan.meals.filter((meal) => !meal.leftoversOf);
  if (new Set(cooked.map((meal) => meal.cuisine)).size < MIN_CUISINES) errors.push(`il faut au moins ${MIN_CUISINES} cuisines différentes`);
  if (cooked.filter((meal) => meal.cuisine === "burger").length > 1) errors.push("un burger au plus par semaine");
  return errors;
}
