export const DATA_PATHS = {
  clock: "data/clock.json",
  entries: "data/entries.json",
};

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_HALF_DAY = 43200;

export const GAUGE_LEVEL_THRESHOLDS = {
  high: 60,
  mid: 45,
};

export const DISPLAY_TIME_ZONE = "America/Sao_Paulo";

export const MONTH_ABBREVIATIONS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export const ENTRY_FILTERS = {
  all: "all",
  closer: "closer",
  farther: "farther",
};

export const ENTRY_SORTS = {
  recent: "recent",
  relevant: "relevant",
};

export const INITIAL_VISIBLE_ENTRIES = 10;

export const MINUS_SIGN = "−";

// Faixas do índice: acompanham os limites das faixas de probabilidade em pipeline/config/settings.js.
export const INDEX_ZONES = [
  { id: "low", minIndex: 0, label: "Baixo" },
  { id: "mid", minIndex: 50, label: "Elevado" },
  { id: "high", minIndex: 70, label: "Crítico" },
];

// Atmosfera do topo (bolha em volta do relógio e bolhas subindo).
export const ATMOSPHERE = {
  lightFromIndex: 58,
  bubbleBase: 4,
  bubblePerIndexPoints: 25,
  bubbleMinSize: 8,
  bubbleMaxSize: 26,
};
