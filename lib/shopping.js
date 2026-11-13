import { AISLES } from "./plan.js";

const FAMILIES = {
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  cl: { base: "ml", factor: 10 },
  l: { base: "ml", factor: 1000 },
};
// Les cuillères se convertissent en volume pour le prix et le conditionnement.
const MASS = { g: 1, kg: 1000 };
const VOLUME = { ml: 1, cl: 10, l: 1000, "c. à soupe": 15, "c. à café": 5 };

export function convert(quantity, from, to) {
  if (from === to) return quantity;
  for (const table of [MASS, VOLUME]) {
    if (table[from] && table[to]) return quantity * table[from] / table[to];
  }
  return null;
}

const PLURAL = { pièce: "pièces", gousse: "gousses", tranche: "tranches" };

const normalizeName = (name) => name.trim().toLocaleLowerCase("fr");
const round = (n) => Math.round(n * 100) / 100;
const byName = (a, b) => a.localeCompare(b, "fr");
const isMondayLunch = (meal) => meal.day === "lundi" && meal.slot === "midi";
// Prix habituel de la quantité utilisée : renseigné seulement pour un ingrédient en promo.
const regularPrice = (ingredient) => (ingredient.promo && ingredient.regularPrice > ingredient.price ? ingredient.regularPrice : ingredient.price);

// Marque comme produits de base les ingrédients du placard (data/pantry.json).
export function applyPantry(plan, pantry) {
  const names = new Set(pantry.map(normalizeName));
  if (names.size === 0) return plan;
  return {
    ...plan,
    meals: plan.meals.map((meal) => ({
      ...meal,
      ingredients: meal.ingredients.map((item) => (names.has(normalizeName(item.name)) ? { ...item, staple: true } : item)),
    })),
  };
}

export function shoppingList(plan) {
  const lines = new Map();
  const pantry = new Set();
  for (const meal of plan.meals) {
    for (const ingredient of meal.ingredients) {
      const name = normalizeName(ingredient.name);
      if (ingredient.staple || isMondayLunch(meal)) {
        pantry.add(name);
        continue;
      }
      const family = FAMILIES[ingredient.unit] ?? { base: ingredient.unit, factor: 1 };
      const key = `${name}|${family.base}`;
      const line = lines.get(key) ?? { aisle: ingredient.aisle, name, quantity: 0, unit: family.base, price: 0, regularPrice: 0 };
      line.quantity += ingredient.quantity * family.factor;
      line.price += ingredient.price;
      line.regularPrice += regularPrice(ingredient);
      if (ingredient.promo) line.promo = ingredient.promo;
      if (ingredient.pack) line.pack = ingredient.pack;
      lines.set(key, line);
    }
  }
  const aisles = AISLES.map((aisle) => ({
    aisle,
    items: [...lines.values()]
      .filter((line) => line.aisle === aisle)
      .map(({ name, quantity, unit, price, regularPrice, promo, pack }) => ({
        name, quantity: round(quantity), unit, price: round(price),
        ...packsFor(quantity, unit, pack),
        ...(promo && { promo }),
        ...(promo && regularPrice > price && { regularPrice: round(regularPrice) }),
      }))
      .sort((a, b) => byName(a.name, b.name)),
  })).filter((group) => group.items.length > 0);
  const total = round([...lines.values()].reduce((sum, line) => sum + line.price, 0));
  const savings = round([...lines.values()].reduce((sum, line) => sum + line.regularPrice - line.price, 0));
  return { aisles, pantry: [...pantry].sort(byName), total, savings };
}

// Nombre de conditionnements à acheter : 23 gousses d'ail font 3 têtes.
function packsFor(quantity, unit, pack) {
  const needed = pack ? convert(quantity, unit, pack.unit) : null;
  if (needed === null) return {};
  return { packs: { count: Math.ceil(round(needed / pack.size)), label: pack.label } };
}

function pluralLabel(count, label) {
  const [first, ...rest] = label.split(" ");
  return [count > 1 && !/[sxz]$/.test(first) ? `${first}s` : first, ...rest].join(" ");
}

function display(quantity, unit) {
  if (unit === "g" && quantity >= 1000) return [quantity / 1000, "kg"];
  if (unit === "ml" && quantity >= 1000) return [quantity / 1000, "l"];
  if (unit === "ml" && quantity % 10 === 0) return [quantity / 10, "cl"];
  return [quantity, quantity > 1 ? (PLURAL[unit] ?? unit) : unit];
}

export function formatItem({ name, quantity, unit, packs }) {
  const [value, label] = display(quantity, unit);
  const bought = packs ? `, soit ${packs.count} ${pluralLabel(packs.count, packs.label)}` : "";
  return `${name} : ${String(round(value)).replace(".", ",")} ${label}${bought}`;
}

export function formatPrice(price) {
  return `${price.toFixed(2).replace(".", ",")} €`;
}

export function formatPricedItem(item) {
  const was = item.promo && item.regularPrice > item.price ? `, au lieu de ${formatPrice(item.regularPrice)}` : "";
  const promo = item.promo ? `, en promo : ${item.promo}${was}` : "";
  return `${formatItem(item)} (≈ ${formatPrice(item.price)}${promo})`;
}

// « 30 min (20 de préparation, 10 de cuisson) », ou « 30 min » pour les anciens plans.
export function formatMinutes(meal) {
  if (meal.prepMinutes === undefined) return `${meal.minutes} min`;
  return `${meal.minutes} min (${meal.prepMinutes} de préparation, ${meal.cookMinutes} de cuisson)`;
}

export function mealPrice(meal) {
  return round(meal.ingredients.reduce((sum, ingredient) => sum + ingredient.price, 0));
}

export function weekPrice(plan) {
  return round(plan.meals.reduce((sum, meal) => sum + mealPrice(meal), 0));
}

export const PRICE_NOTE = "Prix estimés par Claude sur la base des prix E.Leclerc, à titre indicatif : ils varient selon le magasin, et comptent la quantité utilisée, pas le conditionnement entier. Les produits en promo reprennent le prix du catalogue du magasin.";

export function budgetLines(plan) {
  const { total, savings } = shoppingList(plan);
  return [
    `Budget de la semaine : ≈ ${formatPrice(weekPrice(plan))}`,
    `Courses à acheter : ≈ ${formatPrice(total)}`,
    ...(savings > 0 ? [`Économie grâce aux promos : ≈ ${formatPrice(savings)}`] : []),
  ];
}
