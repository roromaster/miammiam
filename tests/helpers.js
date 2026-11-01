const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const SLOTS = ["midi", "soir"];

export function makeMeal(day, slot, overrides = {}) {
  return {
    day,
    slot,
    title: `Plat du ${day} ${slot}`,
    emoji: "🍽️",
    minutes: 20,
    servings: 4,
    ingredients: [{ name: "riz", quantity: 400, unit: "g", aisle: "Épicerie", staple: false }],
    steps: ["Cuire le riz."],
    ...overrides,
  };
}

export function makePlan(overrides = {}) {
  return {
    week: "2026-W46",
    startDate: "2026-11-09",
    status: "proposed",
    meals: DAYS.flatMap((day) => SLOTS.map((slot) => makeMeal(day, slot))),
    ...overrides,
  };
}

export function withMeal(plan, day, slot, overrides) {
  return {
    ...plan,
    meals: plan.meals.map((m) => (m.day === day && m.slot === slot ? { ...m, ...overrides } : m)),
  };
}
