import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLedgerEntry, mergeLedger } from "../../pipeline/services/ledgerService.js";
import { buildClockData, buildEntries } from "../../pipeline/services/publicationService.js";
import { GAUGES, NOW, SETTINGS_FOR_TESTS, makeArticle, makeLedgerArticle, makeSeries } from "./helpers.js";

describe("buildClockData", () => {
  it("monta o clock.json no formato que o site espera", () => {
    const clock = buildClockData({ articles: [makeLedgerArticle()], gauges: GAUGES, settings: SETTINGS_FOR_TESTS, now: NOW });

    assert.equal(clock.meta.isSample, false);
    assert.equal(clock.meta.methodVersion, 2);
    assert.equal(clock.index, 51);
    assert.equal(clock.secondsToMidnight, 439);
    assert.deepEqual(clock.deadline, { fromMonths: 12, toMonths: 24 });
    assert.deepEqual(clock.crashProbability, { fromPercent: 35, toPercent: 50 });
    assert.equal(clock.confidence, "baixa");
    assert.equal(clock.updatedAt, "2026-10-23T09:00:00.000Z");
    assert.deepEqual(
      clock.gauges.map(({ id, score }) => [id, score]),
      [["capex", 52], ["demand", 50]],
    );
  });

  it("compara com 7 dias atrás para a variação do ponteiro e dos termômetros", () => {
    const todayNews = makeLedgerArticle({ publishedAt: "2026-10-22T09:00:00Z" });
    const clock = buildClockData({ articles: [todayNews], gauges: GAUGES, settings: SETTINGS_FOR_TESTS, now: NOW });

    assert.ok(clock.deltaSeconds7d > 0, "uma notícia que aproxima deve gerar variação positiva");
    assert.equal(clock.gauges[0].weeklyDelta, 2);
    assert.equal(clock.gauges[1].weeklyDelta, 0);
  });
});

describe("buildClockData: histórico do índice", () => {
  it("publica um ponto por dia, da primeira notícia até hoje, terminando no índice atual", () => {
    const first = makeLedgerArticle({ publishedAt: "2026-10-20T09:00:00Z" });
    const clock = buildClockData({ articles: [first], gauges: GAUGES, settings: SETTINGS_FOR_TESTS, now: NOW });

    assert.deepEqual(
      clock.history.map((point) => point.date),
      ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"],
    );
    assert.equal(Math.round(clock.history.at(-1).index), clock.index);
    assert.ok(clock.history[1].index > clock.history[0].index - 1, "o índice não despenca sem notícias novas");
  });

  it("devolve lista vazia sem notícias relevantes", () => {
    const clock = buildClockData({ articles: [], gauges: GAUGES, settings: SETTINGS_FOR_TESTS, now: NOW });
    assert.deepEqual(clock.history, []);
  });
});

describe("buildClockData com sinal de queda de preços", () => {
  const days = (count, from, to) => Array.from({ length: count }, (_, index) => from + ((to - from) * index) / (count - 1));
  const prices = makeSeries([...days(300, 100, 200), ...days(20, 198, 160)], "2026-10-22");

  function clockWith(priceSeries) {
    return buildClockData({ articles: [], gauges: GAUGES, settings: SETTINGS_FOR_TESTS, now: NOW, priceSeries });
  }

  it("sem série de preços o índice é só o da vulnerabilidade e não há sinal", () => {
    const clock = clockWith(null);

    assert.equal(clock.priceSignal, undefined);
    assert.equal(clock.index, 50);
    assert.equal(clock.baseIndex, 50);
    assert.equal(clock.secondsToMidnight, 450);
  });

  it("com queda de 20% o índice se aproxima da meia-noite e a vulnerabilidade continua visível", () => {
    const clock = clockWith(prices);

    assert.equal(clock.baseIndex, 50);
    assert.equal(clock.priceSignal.phase.id, "bear");
    assert.equal(clock.priceSignal.drawdownPercent, 20);
    assert.equal(clock.index, 67);
    assert.equal(clock.secondsToMidnight, 300);
  });

  it("a variação de 7 dias inclui o efeito da queda de preços", () => {
    const withDrop = clockWith(prices);
    const flat = clockWith(makeSeries(days(320, 100, 200), "2026-10-22"));

    assert.ok(withDrop.deltaSeconds7d > flat.deltaSeconds7d);
  });

  it("a faixa de prazo e de chance usam o índice já ajustado", () => {
    const clock = clockWith(prices);

    assert.deepEqual(clock.crashProbability, { fromPercent: 35, toPercent: 50 });
  });
});

describe("buildEntries", () => {
  const articles = [
    makeLedgerArticle({ id: "novo", publishedAt: "2026-10-22T15:00:00Z" }),
    makeLedgerArticle({ id: "irrelevante", relevant: false, publishedAt: "2026-10-22T16:00:00Z" }),
    makeLedgerArticle({ id: "antigo", publishedAt: "2026-06-01T15:00:00Z" }),
    makeLedgerArticle({ id: "afasta", direction: "farther", publishedAt: "2026-10-20T15:00:00Z" }),
  ];

  it("publica só notícias relevantes dentro da janela, da mais recente para a mais antiga", () => {
    const entries = buildEntries({ articles, gauges: GAUGES, settings: SETTINGS_FOR_TESTS, now: NOW });

    assert.deepEqual(
      entries.map((entry) => entry.id),
      ["novo", "afasta"],
    );
  });

  it("traduz campos do ledger para o formato público", () => {
    const [entry] = buildEntries({ articles, gauges: GAUGES, settings: SETTINGS_FOR_TESTS, now: NOW });

    assert.deepEqual(entry, {
      id: "novo",
      date: "2026-10-22",
      source: "Fonte",
      title: "Título em português",
      summary: "Resumo em português.",
      url: "https://example.com/a",
      gaugeId: "capex",
      evidence: "dado",
      deltaSeconds: 10.8,
    });
  });

  it("dá sinal negativo para notícias que afastam", () => {
    const entries = buildEntries({ articles, gauges: GAUGES, settings: SETTINGS_FOR_TESTS, now: NOW });

    assert.equal(entries.find((entry) => entry.id === "afasta").deltaSeconds, -10.8);
  });

  it("respeita o limite máximo de entradas", () => {
    const settings = { ...SETTINGS_FOR_TESTS, publication: { entriesWindowDays: 60, maxEntries: 1 } };

    assert.equal(buildEntries({ articles, gauges: GAUGES, settings, now: NOW }).length, 1);
  });
});

describe("ledgerService", () => {
  const classification = {
    relevant: true,
    gaugeId: "capex",
    direction: "closer",
    magnitude: 3,
    confidence: 0.8,
    evidence: "reportagem",
    titlePt: "T",
    summaryPt: "S",
    rationale: "R",
  };

  it("guarda só o essencial das notícias irrelevantes", () => {
    const entry = createLedgerEntry(makeArticle(), { relevant: false }, NOW);

    assert.equal(entry.relevant, false);
    assert.equal(entry.gaugeId, undefined);
    assert.equal(entry.title, "OpenAI raises new funding");
  });

  it("guarda a classificação completa das relevantes", () => {
    const entry = createLedgerEntry(makeArticle(), classification, NOW);

    assert.equal(entry.gaugeId, "capex");
    assert.equal(entry.evidence, "reportagem");
    assert.equal(entry.titlePt, "T");
    assert.equal(entry.classifiedAt, NOW.toISOString());
  });

  it("junta, atualiza por id e descarta o que passou da retenção", () => {
    const existing = [
      makeLedgerArticle({ id: "a", publishedAt: "2026-10-01T00:00:00Z" }),
      makeLedgerArticle({ id: "velho", publishedAt: "2026-01-01T00:00:00Z" }),
    ];
    const additions = [makeLedgerArticle({ id: "a", magnitude: 1 }), makeLedgerArticle({ id: "b" })];
    const merged = mergeLedger(existing, additions, NOW, 120);

    assert.deepEqual(
      merged.map((entry) => entry.id).sort(),
      ["a", "b"],
    );
    assert.equal(merged.find((entry) => entry.id === "a").magnitude, 1);
  });
});
