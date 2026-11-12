import { SETTINGS } from "../../pipeline/config/settings.js";

export const NOW = new Date("2026-10-23T09:00:00Z");

export const GAUGES = [
  { id: "capex", name: "Investimento contra receita", weight: 0.6, baseline: 50, description: "d1" },
  { id: "demand", name: "Demanda real e adoção", weight: 0.4, baseline: 50, description: "d2" },
];

export const SETTINGS_FOR_TESTS = {
  ...SETTINGS,
  collection: { ...SETTINGS.collection, gdeltDelayMs: 0 },
};

export function makeLedgerArticle(overrides = {}) {
  return {
    id: "abc123",
    url: "https://example.com/a",
    source: "Fonte",
    publishedAt: NOW.toISOString(),
    title: "Título original",
    classifiedAt: NOW.toISOString(),
    relevant: true,
    gaugeId: "capex",
    direction: "closer",
    magnitude: 4,
    confidence: 0.5,
    evidence: "dado",
    titlePt: "Título em português",
    summaryPt: "Resumo em português.",
    rationale: "Motivo.",
    ...overrides,
  };
}

export function makeArticle(overrides = {}) {
  return {
    id: "id-1",
    url: "https://example.com/a",
    title: "OpenAI raises new funding",
    snippet: "",
    publishedAt: NOW.toISOString(),
    source: "Fonte",
    origin: "rss",
    ...overrides,
  };
}

export const silentLogger = { info() {}, warn() {} };

export function makeSeries(values, endDate = "2026-10-22") {
  const end = new Date(`${endDate}T00:00:00Z`).getTime();

  return values.map((value, index) => ({
    date: new Date(end - (values.length - 1 - index) * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
}
