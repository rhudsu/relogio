import { DISPLAY_TIME_ZONE, MINUS_SIGN, MONTH_ABBREVIATIONS } from "../config.js";

export function padTwoDigits(value) {
  return String(value).padStart(2, "0");
}

export function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTH_ABBREVIATIONS[month - 1]} ${year}`;
}

export function formatDateTime(isoDateTime) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(isoDateTime));

  const part = (type) => parts.find((item) => item.type === type).value;
  const date = `${Number(part("day"))} ${MONTH_ABBREVIATIONS[Number(part("month")) - 1]} ${part("year")}`;
  return `${date}, ${part("hour")}:${part("minute")}`;
}

export function formatDecimal(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

export function formatSeconds(seconds) {
  return formatDecimal(seconds);
}

export function formatInteger(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

export function formatSignedNumber(value) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${MINUS_SIGN}${Math.abs(value)}`;
  return "0";
}

export function formatDeadlineRange({ fromMonths, toMonths }) {
  if (fromMonths != null && toMonths != null) return `${fromMonths} a ${toMonths}`;
  if (toMonths != null) return `menos de ${toMonths}`;
  return `mais de ${fromMonths}`;
}
