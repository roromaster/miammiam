const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const SLOTS = ["midi", "soir"];
const CUISINES = ["française", "japonaise", "italienne", "thaïe", "mexicaine", "chinoise"];
const LUNCH_FROM = { mardi: "lundi", mercredi: "mardi", jeudi: "mercredi", vendredi: "jeudi" };
const RICE = { name: "riz", quantity: 400, unit: "g", aisle: "Épicerie", staple: false, price: 1 };
const STEAK = { name: "entrecôte", quantity: 800, unit: "g", aisle: "Boucher (à acheter vendredi)", staple: false, price: 24 };

const cookedFor8 = (day, slot) => slot === "soir" && !["vendredi", "samedi"].includes(day);

export function makeLeftovers(day, source = LUNCH_FROM[day], overrides = {}) {
  return {
    day,
    slot: "midi",
    title: `Restes : Plat du ${source} soir`,
    emoji: "♻️",
    leftoversOf: source,
    ingredients: [],
    steps: [],
    ...overrides,
  };
}

export function makeMeal(day, slot, overrides = {}) {
  const index = DAYS.indexOf(day) * 2 + SLOTS.indexOf(slot);
  return {
    day,
    slot,
    title: `Plat du ${day} ${slot}`,
    emoji: "🍽️",
    cuisine: CUISINES[index % CUISINES.length],
    side: `Accompagnement du ${day} ${slot}`,
    minutes: 20,
    servings: cookedFor8(day, slot) ? 8 : 4,
    ingredients: day === "vendredi" && slot === "soir" ? [RICE, STEAK] : [RICE],
    steps: ["Cuire le riz."],
    ...overrides,
  };
}

export function makePlan(overrides = {}) {
  return {
    week: "2026-W46",
    startDate: "2026-11-09",
    status: "proposed",
    meals: DAYS.flatMap((day) => SLOTS.map((slot) =>
      (slot === "midi" && LUNCH_FROM[day] ? makeLeftovers(day) : makeMeal(day, slot)))),
    ...overrides,
  };
}

export function withMeal(plan, day, slot, overrides) {
  return {
    ...plan,
    meals: plan.meals.map((m) => (m.day === day && m.slot === slot ? { ...m, ...overrides } : m)),
  };
}
