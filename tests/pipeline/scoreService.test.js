import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeEntryDeltaSeconds,
  computeSnapshot,
  describeConfidence,
  findCrashProbability,
  findDeadline,
  indexToSecondsToMidnight,
  signedPoints,
} from "../../pipeline/services/scoreService.js";
import { GAUGES, NOW, SETTINGS_FOR_TESTS, makeLedgerArticle } from "./helpers.js";

const { scoring, deadlineBands, confidence } = SETTINGS_FOR_TESTS;

function scoreOf(snapshot, gaugeId) {
  return snapshot.gaugeScores.find((gauge) => gauge.id === gaugeId).score;
}

describe("indexToSecondsToMidnight", () => {
  it("converte o índice em segundos com 15 minutos de escala", () => {
    assert.equal(indexToSecondsToMidnight(0, scoring), 900);
    assert.equal(indexToSecondsToMidnight(50, scoring), 450);
    assert.equal(indexToSecondsToMidnight(59, scoring), 369);
    assert.equal(indexToSecondsToMidnight(100, scoring), 0);
  });

  it("não sai da escala", () => {
    assert.equal(indexToSecondsToMidnight(140, scoring), 0);
    assert.equal(indexToSecondsToMidnight(-10, scoring), 900);
  });
});

describe("signedPoints", () => {
  it("aproximar soma e afastar subtrai, ponderado por magnitude e confiança", () => {
    assert.equal(signedPoints({ direction: "closer", magnitude: 4, confidence: 0.5, evidence: "dado" }, scoring), 2);
    assert.equal(signedPoints({ direction: "farther", magnitude: 3, confidence: 1, evidence: "dado" }, scoring), -3);
  });

  it("dá menos peso a reportagem e ainda menos a opinião do que a dado verificável", () => {
    const base = { direction: "closer", magnitude: 4, confidence: 1 };

    assert.equal(signedPoints({ ...base, evidence: "dado" }, scoring), 4);
    assert.equal(signedPoints({ ...base, evidence: "reportagem" }, scoring), 3);
    assert.equal(signedPoints({ ...base, evidence: "opiniao" }, scoring), 1.6);
  });
});

describe("meia-vida por termômetro", () => {
  it("o efeito some mais rápido em um termômetro de meia-vida curta", () => {
    const gauges = [
      { id: "capex", weight: 0.5, baseline: 50, halfLifeDays: 60 },
      { id: "demand", weight: 0.5, baseline: 50, halfLifeDays: 15 },
    ];
    const thirtyDaysAgo = "2026-09-23T09:00:00Z";
    const articles = [
      makeLedgerArticle({ id: "a", gaugeId: "capex", publishedAt: thirtyDaysAgo, magnitude: 4, confidence: 1 }),
      makeLedgerArticle({ id: "b", gaugeId: "demand", publishedAt: thirtyDaysAgo, magnitude: 4, confidence: 1 }),
    ];
    const snapshot = computeSnapshot(articles, gauges, scoring, NOW);

    assert.ok(Math.abs(scoreOf(snapshot, "capex") - (50 + 4 * 0.5 ** 0.5)) < 0.05);
    assert.ok(Math.abs(scoreOf(snapshot, "demand") - (50 + 4 * 0.25)) < 0.05);
  });

  it("usa o ponto de partida de cada termômetro, não sempre 50", () => {
    const gauges = [
      { id: "capex", weight: 0.5, baseline: 70 },
      { id: "demand", weight: 0.5, baseline: 40 },
    ];

    assert.equal(computeSnapshot([], gauges, scoring, NOW).index, 55);
  });
});

describe("findCrashProbability", () => {
  it("escolhe a faixa pelo índice", () => {
    const bands = SETTINGS_FOR_TESTS.crashProbabilityBands;

    assert.deepEqual(findCrashProbability(90, bands), { fromPercent: 65, toPercent: 80 });
    assert.deepEqual(findCrashProbability(62, bands), { fromPercent: 35, toPercent: 50 });
    assert.deepEqual(findCrashProbability(5, bands), { fromPercent: 7, toPercent: 20 });
  });
});

describe("computeSnapshot", () => {
  it("sem notícias, usa a linha de base de cada termômetro", () => {
    const snapshot = computeSnapshot([], GAUGES, scoring, NOW);

    assert.equal(snapshot.index, 50);
    assert.equal(snapshot.secondsToMidnight, 450);
  });

  it("uma notícia que aproxima sobe só o termômetro dela e o índice na proporção do peso", () => {
    const snapshot = computeSnapshot([makeLedgerArticle()], GAUGES, scoring, NOW);

    assert.equal(scoreOf(snapshot, "capex"), 52);
    assert.equal(scoreOf(snapshot, "demand"), 50);
    assert.ok(Math.abs(snapshot.index - 51.2) < 1e-9);
  });

  it("o efeito da notícia cai pela metade a cada meia-vida", () => {
    const old = makeLedgerArticle({ publishedAt: "2026-09-23T09:00:00Z" });
    const snapshot = computeSnapshot([old], GAUGES, scoring, NOW);

    assert.ok(Math.abs(scoreOf(snapshot, "capex") - 51) < 0.05);
  });

  it("notícias que afastam reduzem a nota e notícias irrelevantes são ignoradas", () => {
    const articles = [
      makeLedgerArticle({ direction: "farther", magnitude: 2, confidence: 1 }),
      makeLedgerArticle({ id: "x", relevant: false }),
    ];
    const snapshot = computeSnapshot(articles, GAUGES, scoring, NOW);

    assert.equal(scoreOf(snapshot, "capex"), 48);
  });

  it("não deixa a nota passar de 0 a 100", () => {
    const articles = Array.from({ length: 40 }, (_, index) =>
      makeLedgerArticle({ id: String(index), magnitude: 5, confidence: 1 }),
    );

    assert.equal(scoreOf(computeSnapshot(articles, GAUGES, scoring, NOW), "capex"), 100);
  });

  it("ignora notícias posteriores à data de referência", () => {
    const future = makeLedgerArticle({ publishedAt: "2026-10-30T09:00:00Z" });

    assert.equal(computeSnapshot([future], GAUGES, scoring, NOW).index, 50);
  });
});

describe("computeEntryDeltaSeconds", () => {
  it("converte a notícia em segundos movidos, com sinal", () => {
    const capex = GAUGES[0];

    assert.equal(computeEntryDeltaSeconds(makeLedgerArticle({ magnitude: 5, confidence: 1 }), capex, scoring), 27);
    assert.equal(
      computeEntryDeltaSeconds(makeLedgerArticle({ direction: "farther", magnitude: 5, confidence: 1 }), capex, scoring),
      -27,
    );
  });

  it("guarda uma casa decimal para efeitos pequenos em vez de arredondar para zero", () => {
    const article = makeLedgerArticle({ direction: "closer", magnitude: 1, confidence: 0.4 });

    assert.equal(computeEntryDeltaSeconds(article, GAUGES[0], scoring), 2.2);
  });

  it("não devolve zero negativo", () => {
    const article = makeLedgerArticle({ direction: "farther", magnitude: 1, confidence: 0.001 });

    assert.ok(Object.is(computeEntryDeltaSeconds(article, GAUGES[0], scoring), 0));
  });
});

describe("findDeadline", () => {
  it("escolhe a faixa pelo índice", () => {
    assert.deepEqual(findDeadline(90, deadlineBands), { fromMonths: null, toMonths: 3 });
    assert.deepEqual(findDeadline(59, deadlineBands), { fromMonths: 12, toMonths: 24 });
    assert.deepEqual(findDeadline(70, deadlineBands), { fromMonths: 3, toMonths: 12 });
    assert.deepEqual(findDeadline(5, deadlineBands), { fromMonths: 48, toMonths: null });
  });
});

describe("describeConfidence", () => {
  it("é baixa com pouca cobertura recente e média com bastante", () => {
    const few = Array.from({ length: 3 }, (_, index) => makeLedgerArticle({ id: `f${index}` }));
    const many = Array.from({ length: 12 }, (_, index) => makeLedgerArticle({ id: `m${index}` }));

    assert.equal(describeConfidence(few, confidence, NOW), "baixa");
    assert.equal(describeConfidence(many, confidence, NOW), "média");
  });
});
