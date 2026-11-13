import { AISLES } from "./plan.js";

const FAMILIES = {
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  cl: { base: "ml", factor: 10 },
  l: { base: "ml", factor: 1000 },
};
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
      lines.set(key, line);
    }
  }
  const aisles = AISLES.map((aisle) => ({
    aisle,
    items: [...lines.values()]
      .filter((line) => line.aisle === aisle)
      .map(({ name, quantity, unit, price, regularPrice, promo }) => ({
        name, quantity: round(quantity), unit, price: round(price),
        ...(promo && { promo }),
        ...(promo && regularPrice > price && { regularPrice: round(regularPrice) }),
      }))
      .sort((a, b) => byName(a.name, b.name)),
  })).filter((group) => group.items.length > 0);
  const total = round([...lines.values()].reduce((sum, line) => sum + line.price, 0));
  const savings = round([...lines.values()].reduce((sum, line) => sum + line.regularPrice - line.price, 0));
  return { aisles, pantry: [...pantry].sort(byName), total, savings };
}

function display(quantity, unit) {
  if (unit === "g" && quantity >= 1000) return [quantity / 1000, "kg"];
  if (unit === "ml" && quantity >= 1000) return [quantity / 1000, "l"];
  if (unit === "ml" && quantity % 10 === 0) return [quantity / 10, "cl"];
  return [quantity, quantity > 1 ? (PLURAL[unit] ?? unit) : unit];
}

export function formatItem({ name, quantity, unit }) {
  const [value, label] = display(quantity, unit);
  return `${name} : ${String(round(value)).replace(".", ",")} ${label}`;
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

export const PRICE_NOTE = "Prix estimés par Claude sur la base des prix E.Leclerc, à titre indicatif : ils varient selon le magasin. Les produits en promo reprennent le prix du catalogue du magasin.";

export function budgetLines(plan) {
  const { total, savings } = shoppingList(plan);
  return [
    `Budget de la semaine : ≈ ${formatPrice(weekPrice(plan))}`,
    `Courses à acheter : ≈ ${formatPrice(total)}`,
    ...(savings > 0 ? [`Économie grâce aux promos : ≈ ${formatPrice(savings)}`] : []),
  ];
}
