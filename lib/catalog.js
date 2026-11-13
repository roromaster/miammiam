import { AISLES, BUTCHER_AISLE, UNITS } from "./plan.js";
import { applyPantry, convert } from "./shopping.js";

// Le catalogue (data/ingredients.json) fixe pour chaque ingrédient son nom, son rayon, son unité,
// son prix unitaire (au kilo pour "g", au litre pour "ml", à l'unité sinon) et son conditionnement.
const BASE_UNITS = UNITS.filter((unit) => !["kg", "cl", "l"].includes(unit));
const BASE_OF = { kg: "g", cl: "ml", l: "ml" };
const PER_THOUSAND = ["g", "ml"];

const normalize = (name) => String(name).trim().toLocaleLowerCase("fr");
const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const index = (catalog) => new Map(catalog.map((entry) => [normalize(entry.name), entry]));

export function validateCatalog(catalog) {
  const errors = [];
  const seen = new Set();
  for (const entry of catalog) {
    const name = normalize(entry.name ?? "");
    if (!name) errors.push("ingrédient sans nom");
    if (seen.has(name)) errors.push(`« ${entry.name} » : présent deux fois`);
    seen.add(name);
    if (!AISLES.includes(entry.aisle)) errors.push(`« ${entry.name} » : rayon inconnu « ${entry.aisle} »`);
    if (!BASE_UNITS.includes(entry.unit)) errors.push(`« ${entry.name} » : unité inconnue « ${entry.unit} »`);
    if (!(entry.unitPrice > 0)) errors.push(`« ${entry.name} » : prix invalide`);
    if (entry.pack && !(entry.pack.size > 0 && String(entry.pack.label ?? "").trim())) errors.push(`« ${entry.name} » : conditionnement invalide`);
  }
  return errors;
}

// Coût de la quantité utilisée, ou null si l'unité ne se convertit pas dans celle du catalogue.
export function catalogPrice(entry, quantity, unit) {
  const converted = convert(quantity, unit, entry.unit);
  if (converted === null) return null;
  const price = converted * entry.unitPrice / (PER_THOUSAND.includes(entry.unit) ? 1000 : 1);
  return Math.max(0.01, round(price));
}

function learn(item) {
  const unit = BASE_OF[item.unit] ?? item.unit;
  const quantity = convert(item.quantity, item.unit, unit);
  const price = item.promo ? item.regularPrice : item.price;
  const unitPrice = round(price / quantity * (PER_THOUSAND.includes(unit) ? 1000 : 1), 3);
  return { name: item.name.trim(), aisle: item.aisle, unit, unitPrice };
}

// Aligne un plan sur le catalogue : nom, rayon et prix calculé. Un ingrédient inconnu garde
// son prix estimé et rejoint `added`, pour entrer au catalogue.
export function applyCatalog(plan, catalog, pantry = []) {
  const entries = index(catalog);
  const inPantry = new Set(pantry.map(normalize));
  const added = new Map();
  const errors = [];
  const meals = plan.meals.map((meal) => ({
    ...meal,
    ingredients: (meal.ingredients ?? []).map((item) => {
      const key = normalize(item.name ?? "");
      const entry = entries.get(key);
      if (!entry) {
        const price = item.promo ? item.regularPrice : item.price;
        if (key && price > 0 && item.quantity > 0 && !added.has(key)) added.set(key, learn(item));
        return item;
      }
      const aligned = { ...item, name: entry.name, aisle: item.aisle === BUTCHER_AISLE ? item.aisle : entry.aisle };
      const price = catalogPrice(entry, item.quantity, item.unit);
      if (price === null) {
        // Hors liste de courses, l'unité est libre (une cuillère de farine) et le prix reste estimé.
        if (!item.staple && !inPantry.has(key)) errors.push(`${meal.day} ${meal.slot} : « ${entry.name} » se compte en ${entry.unit} dans le catalogue, pas en ${item.unit}`);
        return aligned;
      }
      if (!item.promo) return { ...aligned, price };
      return item.regularPrice === undefined && price >= item.price ? { ...aligned, regularPrice: price } : aligned;
    }),
  }));
  return { plan: { ...plan, meals }, added: [...added.values()], errors };
}

export function mergeCatalog(catalog, added) {
  return [...catalog, ...added].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

// Pour l'affichage : placard appliqué, rayon du catalogue et conditionnement d'achat.
export function forDisplay(plan, { pantry = [], catalog = [] } = {}) {
  const entries = index(catalog);
  const shown = applyPantry(plan, pantry);
  return {
    ...shown,
    meals: shown.meals.map((meal) => ({
      ...meal,
      ingredients: meal.ingredients.map((item) => {
        const entry = entries.get(normalize(item.name));
        if (!entry) return item;
        return {
          ...item,
          aisle: item.aisle === BUTCHER_AISLE ? item.aisle : entry.aisle,
          ...(entry.pack && { pack: { ...entry.pack, unit: entry.unit } }),
        };
      }),
    })),
  };
}
