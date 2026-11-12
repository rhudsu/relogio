export const SETTINGS = {
  collection: {
    lookbackDays: 30,
    maxNewArticlesPerRun: 120,
    requestTimeoutMs: 15000,
    userAgent: "relogio-da-salvacao/0.1",
    gdeltDelayMs: 6000,
    gdeltMaxRecords: 50,
    gdeltTimespan: "14d",
  },
  classifier: {
    model: "gemini-3.5-flash-lite",
    thinkingLevel: "LOW",
    maxTokens: 16000,
    batchSize: 8,
    snippetMaxChars: 600,
  },
  retry: {
    delaysMs: [2000, 8000, 20000],
  },
  scoring: {
    pointsPerMagnitude: 1,
    decayHalfLifeDays: 30,
    evidenceWeights: {
      dado: 1,
      reportagem: 0.75,
      opiniao: 0.4,
    },
    minScore: 0,
    maxScore: 100,
    maxMinutesToMidnight: 15,
    trendWindowDays: 7,
  },
  priceSignal: {
    label: "Nasdaq Composite",
    url: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=NASDAQCOM",
    peakWindowDays: 252,
    horizonDays: 504,
    correctionThreshold: 0.1,
    crashThreshold: 0.4,
    rearmBelow: 0.05,
    maxStaleDays: 10,
    minHistoryDays: 1000,
    phases: [
      { minDrawdown: 0.4, id: "crash", label: "Estouro" },
      { minDrawdown: 0.2, id: "bear", label: "Queda forte" },
      { minDrawdown: 0.1, id: "correction", label: "Correção" },
      { minDrawdown: 0.05, id: "tension", label: "Tensão" },
      { minDrawdown: 0, id: "none", label: "Sem queda relevante" },
    ],
  },
  crashProbabilityBands: [
    { minIndex: 85, fromPercent: 65, toPercent: 80 },
    { minIndex: 70, fromPercent: 50, toPercent: 65 },
    { minIndex: 50, fromPercent: 35, toPercent: 50 },
    { minIndex: 30, fromPercent: 20, toPercent: 35 },
    { minIndex: 0, fromPercent: 7, toPercent: 20 },
  ],
  deadlineBands: [
    { minIndex: 85, fromMonths: null, toMonths: 3 },
    { minIndex: 70, fromMonths: 3, toMonths: 12 },
    { minIndex: 50, fromMonths: 12, toMonths: 24 },
    { minIndex: 30, fromMonths: 24, toMonths: 48 },
    { minIndex: 0, fromMonths: 48, toMonths: null },
  ],
  confidence: {
    windowDays: 14,
    minArticlesForMedium: 10,
  },
  publication: {
    entriesWindowDays: 120,
    maxEntries: 400,
    historyDays: 120,
  },
  weeklySummary: {
    maxChars: 500,
    maxHeadlineChars: 90,
    maxAgeDays: 3,
  },
  retentionDays: 120,
};

export const DISPLAY_TIME_ZONE = "America/Sao_Paulo";
