import { mondayOf } from "./week.js";

export const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
export const SLOTS = ["midi", "soir"];
export const UNITS = ["g", "kg", "ml", "cl", "l", "pièce", "c. à soupe", "c. à café", "gousse", "tranche"];
export const BUTCHER_AISLE = "Boucher (à acheter vendredi)";
export const ELSEWHERE_AISLE = "Épicerie spécialisée (hors Leclerc)";
export const AISLES = [
  "Fruits et légumes", "Viandes et poissons", "Produits laitiers",
  "Épicerie", "Surgelés", "Boulangerie", "Boissons", ELSEWHERE_AISLE, BUTCHER_AISLE,
];
export const CUISINES = ["japonaise", "chinoise", "mexicaine", "thaïe", "française", "italienne", "burger"];
export const STATUSES = ["proposed", "validated", "sent"];

const WEEKEND = ["samedi", "dimanche"];
const MIN_CUISINES = 4;
const LUNCH_SOURCE = { mardi: "lundi", mercredi: "mardi", jeudi: "mercredi", vendredi: "jeudi" };
// Seuls le comté, le gruyère et l'emmental sont aimés.
const REFUSED_CHEESE = /(?<![\p{L}])(chevre|roblochon|reblochon|parmesan|parmigiano|grana|pecorino|mozzarella|burrata|feta|ricotta|mascarpone|cheddar|roquefort|bleu d'auvergne|gorgonzola|camembert|brie|raclette|morbier|cantal|tomme|gouda|edam|mimolette|maroilles|munster|saint-nectaire|halloumi|boursin|philadelphia|cream cheese|fromage(?! blanc))s?(?![\p{L}])/u;

// Après une virgule ou "et", ces mots désignent un accompagnement, pas le plat lui-même.
const SIDE_IN_TITLE = /(,|\bet\b|\bavec\b)\s+(du |de la |des |d')?(riz|pates?|semoule|polenta|puree|frites?|quinoa|boulgour|pommes? de terre|nouilles?)(?![\p{L}])/u;
const MAX_RICE_OR_PASTA = 2;
// Les règles ajoutées après coup ne s'appliquent pas aux semaines déjà publiées.
const STRICT_FROM = "2026-W47";
const MAX_FRESH_HERBS = 3;
const FRESH_HERB = /^(coriandre|persil|basilic|menthe|ciboulette|aneth|estragon|cerfeuil|sauge|thym|romarin|citronnelle|bouquet garni)(?![\p{L}])/u;
const NOT_FRESH = /(?<![\p{L}])(seche|sechee|moulu|moulue|graine|surgele|surgelee|en poudre)s?(?![\p{L}])/u;
const UNIT_FAMILY = { kg: "g", cl: "ml", l: "ml" };
const RICE_SIDE = /^riz(?![\p{L}])/u;
const PASTA_SIDE = /^(pates?|orzo|tagliatelles?|spaghettis?|linguines?|penne|fusillis?|nouilles?)(?![\p{L}])/u;

const normalize = (title) => String(title).trim().toLocaleLowerCase("fr");
const plain = (text) => normalize(text).normalize("NFD").replace(/\p{M}/gu, "");
const hasRefusedCheese = (text) => REFUSED_CHEESE.test(plain(text));
const isCookedFor8 = (meal) => meal.slot === "soir" && !["vendredi", "samedi"].includes(meal.day);
const isStrict = (plan) => plan.week >= STRICT_FROM;
const isFreshHerb = (name) => FRESH_HERB.test(plain(name)) && !NOT_FRESH.test(plain(name));
const isWholeNumber = (value, min) => Number.isInteger(value) && value >= min;

function validateLeftovers(meal, label, source, sourceTitle) {
  const errors = [];
  if (meal.leftoversOf !== source) errors.push(`${label} : doit reprendre les restes de ${source} soir`);
  if (sourceTitle && !normalize(meal.title).includes(normalize(sourceTitle))) {
    errors.push(`${label} : le titre doit citer « ${sourceTitle} »`);
  }
  if (meal.ingredients?.length > 0 || meal.steps?.length > 0) errors.push(`${label} : des restes n'ont ni ingrédient ni étape`);
  return errors;
}

// Temps détaillé et consigne pour les restes : exigés depuis STRICT_FROM.
function validateDetails(meal, label) {
  const errors = [];
  if (!isWholeNumber(meal.prepMinutes, 1) || !isWholeNumber(meal.cookMinutes, 0)) {
    errors.push(`${label} : prepMinutes et cookMinutes manquants`);
  } else if (meal.prepMinutes + meal.cookMinutes !== meal.minutes) {
    errors.push(`${label} : minutes doit valoir prepMinutes + cookMinutes`);
  }
  if (isCookedFor8(meal) && !String(meal.leftoverTip ?? "").trim()) errors.push(`${label} : leftoverTip manquant (conservation et réchauffage des restes)`);
  if (!isCookedFor8(meal) && meal.leftoverTip !== undefined) errors.push(`${label} : leftoverTip réservé aux dîners de 8 portions`);
  return errors;
}

function validateCookedMeal(meal, label, strict) {
  const errors = strict ? validateDetails(meal, label) : [];
  if (!String(meal.title ?? "").trim()) errors.push(`${label} : titre manquant`);
  if (!String(meal.emoji ?? "").trim()) errors.push(`${label} : emoji manquant`);
  if (!CUISINES.includes(meal.cuisine)) errors.push(`${label} : cuisine inconnue « ${meal.cuisine} »`);
  if (!String(meal.side ?? "").trim()) errors.push(`${label} : accompagnement manquant`);
  const limit = WEEKEND.includes(meal.day) ? 90 : 30;
  if (!(meal.minutes > 0 && meal.minutes <= limit)) errors.push(`${label} : ${meal.minutes} min, limite de ${limit} min`);
  const servings = isCookedFor8(meal) ? 8 : 4;
  if (meal.servings !== servings) errors.push(`${label} : la recette doit donner ${servings} portions`);
  if (!Array.isArray(meal.steps) || meal.steps.length === 0) errors.push(`${label} : aucune étape`);
  if (SIDE_IN_TITLE.test(plain(meal.title ?? ""))) errors.push(`${label} : un seul accompagnement, à placer dans side et non dans le titre`);
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
    if (item.promo !== undefined && !String(item.promo).trim()) errors.push(`${label} : promo vide pour ${item.name}`);
    if (item.regularPrice !== undefined) {
      if (item.promo === undefined) errors.push(`${label} : regularPrice sans promo pour ${item.name}`);
      else if (typeof item.regularPrice !== "number" || !(item.regularPrice >= item.price)) errors.push(`${label} : regularPrice invalide pour ${item.name}`);
    }
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
  return validateCookedMeal(meal, label, isStrict(plan));
}

// Un même ingrédient dans deux unités donnerait deux lignes dans la liste de courses.
function mixedUnits(plan, pantry) {
  const inPantry = new Set(pantry.map(normalize));
  const units = new Map();
  for (const meal of plan.meals) {
    if (meal.day === "lundi" && meal.slot === "midi") continue;
    for (const item of meal.ingredients ?? []) {
      const name = normalize(item.name ?? "");
      if (item.staple || inPantry.has(name)) continue;
      units.set(name, (units.get(name) ?? new Set()).add(UNIT_FAMILY[item.unit] ?? item.unit));
    }
  }
  return [...units].filter(([, set]) => set.size > 1)
    .map(([name, set]) => `« ${name} » : unités différentes d'un repas à l'autre (${[...set].join(", ")})`);
}

export function validatePlan(plan, { previousTitles = [], previousSunday = null, pantry = [] } = {}) {
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
      const isRiceOrPasta = RICE_SIDE.test(plain(meal.side)) || PASTA_SIDE.test(plain(meal.side));
      if (sides.has(side) && !isRiceOrPasta) errors.push(`« ${meal.side} » : accompagnement présent deux fois`);
      sides.add(side);
    }
  }

  const cooked = plan.meals.filter((meal) => !meal.leftoversOf);
  if (new Set(cooked.map((meal) => meal.cuisine)).size < MIN_CUISINES) errors.push(`il faut au moins ${MIN_CUISINES} cuisines différentes`);
  if (cooked.filter((meal) => meal.cuisine === "burger").length > 1) errors.push("un burger au plus par semaine");
  const countSides = (pattern) => cooked.filter((meal) => pattern.test(plain(meal.side ?? ""))).length;
  if (countSides(RICE_SIDE) > MAX_RICE_OR_PASTA) errors.push(`riz en accompagnement : ${MAX_RICE_OR_PASTA} fois au plus par semaine`);
  if (countSides(PASTA_SIDE) > MAX_RICE_OR_PASTA) errors.push(`pâtes en accompagnement : ${MAX_RICE_OR_PASTA} fois au plus par semaine`);
  if (isStrict(plan)) {
    errors.push(...mixedUnits(plan, pantry));
    const herbs = new Set(cooked.flatMap((meal) => (meal.ingredients ?? []).map((item) => normalize(item.name ?? "")).filter(isFreshHerb)));
    if (herbs.size > MAX_FRESH_HERBS) errors.push(`herbes fraîches : ${MAX_FRESH_HERBS} au plus par semaine (${[...herbs].join(", ")})`);
  }
  return errors;
}
