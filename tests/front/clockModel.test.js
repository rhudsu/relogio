import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getClockTime,
  getGaugeLevel,
  getHandAngles,
  parseClock,
  splitDuration,
} from "../../public/js/models/clockModel.js";

const RAW_CLOCK = {
  meta: { isSample: true },
  index: 59,
  secondsToMidnight: 369,
  deadline: { fromMonths: 12, toMonths: 24 },
  confidence: "média",
  deltaSeconds7d: 33,
  updatedAt: "2026-10-23T06:00:00-03:00",
  gauges: [
    { id: "demand", name: "Demanda", weight: 0.15, score: 38, weeklyDelta: -3 },
    { id: "capex", name: "Investimento", weight: 0.25, score: 74, weeklyDelta: 3 },
  ],
};

describe("splitDuration", () => {
  it("separa segundos totais em minutos e segundos", () => {
    assert.deepEqual(splitDuration(369), { minutes: 6, seconds: 9 });
  });

  it("não devolve valores negativos", () => {
    assert.deepEqual(splitDuration(-5), { minutes: 0, seconds: 0 });
  });
});

describe("getHandAngles", () => {
  it("posiciona os ponteiros para 11h53min51s quando faltam 369 segundos", () => {
    assert.deepEqual(getHandAngles(369), { hour: 356.93, minute: 323.1, second: 306 });
  });

  it("junta os três ponteiros no 12 à meia-noite", () => {
    assert.deepEqual(getHandAngles(0), { hour: 0, minute: 0, second: 0 });
  });

  it("limita o valor a meio dia de distância", () => {
    assert.deepEqual(getHandAngles(999999), getHandAngles(43200));
  });
});

describe("getClockTime", () => {
  it("converte segundos restantes em hora de relógio", () => {
    assert.deepEqual(getClockTime(369), { hours: 11, minutes: 53, seconds: 51 });
  });

  it("mostra 12 horas à meia-noite", () => {
    assert.deepEqual(getClockTime(0), { hours: 12, minutes: 0, seconds: 0 });
  });
});

describe("getGaugeLevel", () => {
  it("classifica a nota de risco em alto, médio e baixo", () => {
    assert.equal(getGaugeLevel(74), "high");
    assert.equal(getGaugeLevel(60), "high");
    assert.equal(getGaugeLevel(52), "mid");
    assert.equal(getGaugeLevel(45), "mid");
    assert.equal(getGaugeLevel(38), "low");
  });
});

describe("parseClock", () => {
  it("monta o modelo do relógio e ordena os termômetros do maior para o menor risco", () => {
    const clock = parseClock(RAW_CLOCK);

    assert.equal(clock.isSample, true);
    assert.deepEqual(clock.remaining, { minutes: 6, seconds: 9 });
    assert.deepEqual(clock.weeklyEffect, { direction: "closer", seconds: 33 });
    assert.deepEqual(
      clock.gauges.map((gauge) => gauge.id),
      ["capex", "demand"],
    );
    assert.equal(clock.gauges[0].weightPercent, 25);
    assert.equal(clock.gauges[0].level, "high");
  });

  it("expõe o sinal de queda de preços com índices arredondados e usa null quando não há", () => {
    assert.equal(parseClock(RAW_CLOCK).priceSignal, null);
    assert.equal(parseClock(RAW_CLOCK).baseIndex, null);

    const raw = {
      ...RAW_CLOCK,
      baseIndex: 67.3,
      priceSignal: {
        label: "Nasdaq Composite",
        asOf: "2026-11-05",
        lastValue: 24315,
        peakValue: 27599.9,
        peakDate: "2026-10-06",
        tradingDaysSincePeak: 22,
        drawdownPercent: 11.9,
        phase: { id: "correction", label: "Correção" },
        progress: 0.063,
        baseIndex: 67.3,
        adjustedIndex: 69.37,
        baseRates: { events: 39 },
      },
    };
    const signal = parseClock(raw).priceSignal;

    assert.equal(signal.drawdownPercent, 11.9);
    assert.equal(signal.baseIndex, 67);
    assert.equal(signal.adjustedIndex, 69);
    assert.equal(signal.phase.id, "correction");
    assert.equal(parseClock(raw).baseIndex, 67.3);
  });

  it("expõe o resumo da semana quando existe e usa null quando não", () => {
    assert.equal(parseClock(RAW_CLOCK).weeklySummary, null);

    const summary = { text: "Mais perto da meia-noite.", asOf: "2026-11-06T06:00:00.000Z" };
    assert.deepEqual(parseClock({ ...RAW_CLOCK, weeklySummary: summary }).weeklySummary, summary);
  });

  it("expõe a faixa de chance de queda forte quando existe e usa null quando não", () => {
    assert.equal(parseClock(RAW_CLOCK).crashProbability, null);

    const withProbability = { ...RAW_CLOCK, crashProbability: { fromPercent: 35, toPercent: 50 } };
    assert.deepEqual(parseClock(withProbability).crashProbability, { fromPercent: 35, toPercent: 50 });
  });

  it("expõe o texto de aviso quando o clock.json traz um", () => {
    assert.equal(parseClock(RAW_CLOCK).notice, null);

    const withNotice = { ...RAW_CLOCK, meta: { isSample: false, notice: "Classificação manual." } };
    assert.equal(parseClock(withNotice).notice, "Classificação manual.");
    assert.equal(parseClock(withNotice).isSample, false);
  });

  it("rejeita dados sem o campo secondsToMidnight", () => {
    const { secondsToMidnight, ...incomplete } = RAW_CLOCK;

    assert.throws(() => parseClock(incomplete), /secondsToMidnight/);
  });
});
