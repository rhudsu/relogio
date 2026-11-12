import { ENTRY_FILTERS, ENTRY_SORTS } from "../config.js";
import { describeEffect } from "./effectModel.js";

function parseEntry(rawEntry) {
  return {
    id: rawEntry.id,
    date: rawEntry.date,
    source: rawEntry.source,
    title: rawEntry.title,
    summary: rawEntry.summary,
    url: rawEntry.url ?? null,
    gaugeId: rawEntry.gaugeId,
    evidence: rawEntry.evidence ?? null,
    effect: describeEffect(rawEntry.deltaSeconds),
  };
}

export function parseEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) {
    throw new Error("Formato inválido em entries.json: esperada uma lista.");
  }

  return rawEntries.map(parseEntry).sort((a, b) => b.date.localeCompare(a.date));
}

export function filterEntries(entries, filter) {
  if (filter === ENTRY_FILTERS.all) return entries;
  return entries.filter((entry) => entry.effect.direction === filter);
}

export function sortEntries(entries, order) {
  if (order !== ENTRY_SORTS.relevant) return [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return [...entries].sort(
    (a, b) => b.effect.seconds - a.effect.seconds || b.date.localeCompare(a.date),
  );
}

export function limitEntries(entries, limit) {
  return {
    visible: limit === null ? entries : entries.slice(0, limit),
    hiddenCount: limit === null ? 0 : Math.max(entries.length - limit, 0),
  };
}
