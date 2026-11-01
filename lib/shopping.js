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
      const line = lines.get(key) ?? { aisle: ingredient.aisle, name, quantity: 0, unit: family.base };
      line.quantity += ingredient.quantity * family.factor;
      lines.set(key, line);
    }
  }
  const aisles = AISLES.map((aisle) => ({
    aisle,
    items: [...lines.values()]
      .filter((line) => line.aisle === aisle)
      .map(({ name, quantity, unit }) => ({ name, quantity: round(quantity), unit }))
      .sort((a, b) => byName(a.name, b.name)),
  })).filter((group) => group.items.length > 0);
  return { aisles, pantry: [...pantry].sort(byName) };
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
