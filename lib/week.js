const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, "0");

// Tout passe par des dates UTC construites depuis les composants locaux,
// pour rester à l'abri des changements d'heure.
const utcFromLocal = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

function weekOfUtc(utc) {
  const thursday = new Date(utc.getTime() + (3 - ((utc.getUTCDay() + 6) % 7)) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const number = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${year}-W${pad(number)}`;
}

export function isoWeekOf(date) {
  return weekOfUtc(utcFromLocal(date));
}

export function currentWeek(now) {
  return isoWeekOf(now);
}

export function upcomingWeek(now) {
  const utc = utcFromLocal(now);
  const daysToMonday = 7 - ((utc.getUTCDay() + 6) % 7);
  return weekOfUtc(new Date(utc.getTime() + daysToMonday * DAY_MS));
}

function mondayUtc(week) {
  const [, year, number] = week.match(/^(\d{4})-W(\d{2})$/);
  const jan4 = new Date(Date.UTC(Number(year), 0, 4));
  const firstMonday = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY_MS;
  return new Date(firstMonday + (Number(number) - 1) * 7 * DAY_MS);
}

export function mondayOf(week) {
  const d = mondayUtc(week);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function weekBefore(week, count) {
  return weekOfUtc(new Date(mondayUtc(week).getTime() - count * 7 * DAY_MS));
}

export function frenchDate(iso) {
  const [, month, day] = iso.split("-").map(Number);
  return `${day === 1 ? "1er" : day} ${MONTHS[month - 1]}`;
}
