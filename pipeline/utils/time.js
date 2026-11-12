import { DISPLAY_TIME_ZONE } from "../config/settings.js";

const MILLISECONDS_PER_DAY = 86_400_000;

export function daysBetween(earlier, later) {
  return (new Date(later) - new Date(earlier)) / MILLISECONDS_PER_DAY;
}

export function subtractDays(date, days) {
  return new Date(new Date(date).getTime() - days * MILLISECONDS_PER_DAY);
}

export function toLocalDate(isoDateTime) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoDateTime));
}
