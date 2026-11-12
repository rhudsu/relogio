import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFileClassifier } from "../../pipeline/services/fileClassifierService.js";
import { buildClockData } from "../../pipeline/services/publicationService.js";
import { GAUGES, NOW, SETTINGS_FOR_TESTS, makeArticle, silentLogger } from "./helpers.js";

const GAUGE_IDS = GAUGES.map((gauge) => gauge.id);

const RAW = [
  {
    id: "a",
    relevant: true,
    gaugeId: "capex",
    direction: "closer",
    magnitude: 3,
    confidence: 0.6,
    evidence: "reportagem",
    titlePt: "Título A",
    summaryPt: "Resumo A.",
    rationale: "Motivo A.",
  },
  { id: "b", relevant: false },
  { id: "c", relevant: true, gaugeId: "inexistente", direction: "closer", magnitude: 3, confidence: 0.5, evidence: "dado", titlePt: "T", summaryPt: "S" },
];

describe("createFileClassifier", () => {
  const classifier = createFileClassifier({ classifications: RAW, gaugeIds: GAUGE_IDS, logger: silentLogger });

  it("devolve só as classificações válidas dos artigos pedidos", async () => {
    const articles = ["a", "b", "c", "d"].map((id) => makeArticle({ id }));

    const outcome = await classifier.classify(articles);

    assert.deepEqual(outcome.results.map((result) => result.id), ["a", "b"]);
    assert.equal(outcome.results[0].classification.titlePt, "Título A");
    assert.equal(outcome.results[1].classification.relevant, false);
  });

  it("conta como erro a classificação inválida e ignora quem não tem classificação", async () => {
    const outcome = await classifier.classify([makeArticle({ id: "c" }), makeArticle({ id: "d" })]);

    assert.equal(outcome.results.length, 0);
    assert.equal(outcome.failedBatches, 1);
    assert.match(outcome.errors[0], /inválida para c/);
    assert.deepEqual(outcome.tokens, { input: 0, output: 0 });
  });
});

describe("aviso no clock.json", () => {
  it("inclui o texto do aviso quando informado e não inclui quando não", () => {
    const base = { articles: [], gauges: GAUGES, settings: SETTINGS_FOR_TESTS, now: NOW };

    assert.deepEqual(buildClockData(base).meta, { isSample: false, methodVersion: 2 });
    assert.deepEqual(buildClockData({ ...base, notice: "Aviso." }).meta, {
      isSample: false,
      methodVersion: 2,
      notice: "Aviso.",
    });
  });
});
