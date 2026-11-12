import { DATA_PATHS } from "../config.js";
import { parseClock } from "../models/clockModel.js";
import { parseEntries } from "../models/entryModel.js";

async function fetchJson(path, fetchFn) {
  const response = await fetchFn(path, { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`Falha ao carregar ${path}: HTTP ${response.status}`);
  }

  return response.json();
}

export async function loadDashboardData(fetchFn = fetch) {
  const [rawClock, rawEntries] = await Promise.all([
    fetchJson(DATA_PATHS.clock, fetchFn),
    fetchJson(DATA_PATHS.entries, fetchFn),
  ]);

  return {
    clock: parseClock(rawClock),
    entries: parseEntries(rawEntries),
  };
}
