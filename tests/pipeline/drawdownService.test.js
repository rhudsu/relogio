import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collectPriceSeries, parseFredCsv } from "../../pipeline/collectors/priceCollector.js";
import {
  adjustIndex,
  buildPriceSignal,
  computeBaseRates,
  describePhase,
  measureDrawdown,
  progressToCrash,
  seriesUntil,
} from "../../pipeline/services/drawdownService.js";
import { SETTINGS_FOR_TESTS, makeSeries } from "./helpers.js";

const CONFIG = SETTINGS_FOR_TESTS.priceSignal;
const THRESHOLDS = { correctionThreshold: 0.1, crashThreshold: 0.4 };

function climbThenFall(climbDays, peak, fallDays, finalValue) {
  const climb = Array.from({ length: climbDays }, (_, index) => 100 + ((peak - 100) * index) / (climbDays - 1));
  const fall = Array.from({ length: fallDays }, (_, index) => peak - ((peak - finalValue) * (index + 1)) / fallDays);
  return [...climb, ...fall];
}

describe("parseFredCsv e collectPriceSeries", () => {
  it("lê data e valor e ignora o cabeçalho, valores ausentes e linhas inválidas", () => {
    const csv = "observation_date,NASDAQCOM\n2026-11-03,25372.010\n2026-11-04,.\nlixo,1\n2026-11-05,24315.000\n";

    assert.deepEqual(parseFredCsv(csv), [
      { date: "2026-11-03", value: 25372.01 },
      { date: "2026-11-05", value: 24315 },
    ]);
  });

  it("recusa uma série curta demais para calcular a máxima de 12 meses", async () => {
    const fetchFn = async () => new Response("observation_date,X\n2026-11-05,100\n", { status: 200 });

    await assert.rejects(
      collectPriceSeries({ ...CONFIG, minHistoryDays: 1000 }, { fetchFn, timeoutMs: 1000, userAgent: "teste" }),
      /curta demais/,
    );
  });
});

describe("measureDrawdown", () => {
  it("mede a queda a partir da máxima da janela e os pregões desde o pico", () => {
    const series = makeSeries(climbThenFall(300, 200, 20, 160));
    const result = measureDrawdown(series, 252);

    assert.equal(result.peak.value, 200);
    assert.equal(result.last.value, 160);
    assert.ok(Math.abs(result.drawdown - 0.2) < 1e-9);
    assert.equal(result.tradingDaysSincePeak, 20);
  });

  it("ignora um pico mais antigo que a janela", () => {
    const old = [500, ...Array.from({ length: 300 }, () => 100)];
    const result = measureDrawdown(makeSeries(old), 252);

    assert.equal(result.peak.value, 100);
    assert.equal(result.drawdown, 0);
  });
});

describe("fases e progresso", () => {
  it("classifica a queda em fases pelos limiares", () => {
    const phase = (drawdown) => describePhase(drawdown, CONFIG.phases).id;

    assert.equal(phase(0.01), "none");
    assert.equal(phase(0.049), "none");
    assert.equal(phase(0.05), "tension");
    assert.equal(phase(0.1), "correction");
    assert.equal(phase(0.19), "correction");
    assert.equal(phase(0.2), "bear");
    assert.equal(phase(0.4), "crash");
    assert.equal(phase(0.7), "crash");
  });

  it("só conta a partir da correção de 10% e chega a 100% em 40%", () => {
    assert.equal(progressToCrash(0.05, THRESHOLDS), 0);
    assert.equal(progressToCrash(0.1, THRESHOLDS), 0);
    assert.ok(Math.abs(progressToCrash(0.2, THRESHOLDS) - 1 / 3) < 1e-9);
    assert.ok(Math.abs(progressToCrash(0.3, THRESHOLDS) - 2 / 3) < 1e-9);
    assert.equal(progressToCrash(0.4, THRESHOLDS), 1);
    assert.equal(progressToCrash(0.6, THRESHOLDS), 1);
  });

  it("aproxima o índice da meia-noite na proporção do caminho percorrido e é reversível", () => {
    assert.equal(adjustIndex(67.3, 0.05, THRESHOLDS), 67.3);
    assert.ok(Math.abs(adjustIndex(60, 0.2, THRESHOLDS) - (60 + 40 / 3)) < 1e-9);
    assert.equal(adjustIndex(67.3, 0.4, THRESHOLDS), 100);
    assert.equal(adjustIndex(67.3, 0.08, THRESHOLDS), adjustIndex(67.3, 0.02, THRESHOLDS));
  });
});

describe("seriesUntil", () => {
  it("devolve só os pregões até a data de referência", () => {
    const series = makeSeries([1, 2, 3, 4, 5], "2026-10-05");

    assert.deepEqual(
      seriesUntil(series, new Date("2026-10-03T12:00:00Z")).map((point) => point.value),
      [1, 2, 3],
    );
  });
});

describe("computeBaseRates", () => {
  const config = { peakWindowDays: 20, horizonDays: 40, correctionThreshold: 0.1, rearmBelow: 0.05 };

  function build() {
    // 1) correção de 12% que se recupera; 2) queda de 50% depois de alta de mais de 100%.
    const values = [
      ...Array.from({ length: 30 }, (_, index) => 100 + index),
      ...Array.from({ length: 10 }, (_, index) => 129 - index * 1.6),
      ...Array.from({ length: 30 }, (_, index) => 115 + index * 3),
      ...Array.from({ length: 30 }, (_, index) => 205 - index * 3.5),
      ...Array.from({ length: 80 }, () => 100),
    ];
    return makeSeries(values);
  }

  it("conta cada pico uma vez e mede até onde a queda foi nos 2 anos seguintes", () => {
    const rates = computeBaseRates(build(), config);

    assert.ok(rates.events >= 2);
    assert.ok(rates.reached20 >= 1);
    assert.ok(rates.reached40 >= 1);
    assert.ok(rates.reached40 <= rates.reached30 && rates.reached30 <= rates.reached20 && rates.reached20 <= rates.events);
  });

  it("separa os eventos que vieram depois de alta de 100% ou mais", () => {
    const rates = computeBaseRates(build(), config);

    assert.ok(rates.overheated.events <= rates.events);
    assert.ok(rates.overheated.reached40 <= rates.overheated.events);
  });

  it("registra o período coberto pela série", () => {
    const series = build();
    const rates = computeBaseRates(series, config);

    assert.equal(rates.from, series[0].date);
    assert.equal(rates.to, series.at(-1).date);
  });
});

describe("buildPriceSignal", () => {
  const asOf = new Date("2026-10-23T09:00:00Z");
  const series = makeSeries(climbThenFall(300, 200, 20, 160));

  it("monta o sinal com queda, fase, progresso e índice ajustado", () => {
    const signal = buildPriceSignal({ series, asOf, baseIndex: 60, settings: SETTINGS_FOR_TESTS });

    assert.equal(signal.drawdownPercent, 20);
    assert.equal(signal.phase.id, "bear");
    assert.equal(signal.peakDate, series[299].date);
    assert.equal(signal.tradingDaysSincePeak, 20);
    assert.ok(Math.abs(signal.progress - 0.333) < 0.001);
    assert.ok(Math.abs(signal.adjustedIndex - (60 + 40 / 3)) < 1e-9);
    assert.equal(signal.baseIndex, 60);
  });

  it("não devolve sinal quando a série está velha demais", () => {
    const stale = makeSeries(climbThenFall(300, 200, 20, 160), "2026-09-01");

    assert.equal(buildPriceSignal({ series: stale, asOf, baseIndex: 60, settings: SETTINGS_FOR_TESTS }), null);
  });

  it("não devolve sinal quando a série não cobre a janela de 12 meses", () => {
    const short = makeSeries(Array.from({ length: 100 }, (_, index) => 100 + index));

    assert.equal(buildPriceSignal({ series: short, asOf, baseIndex: 60, settings: SETTINGS_FOR_TESTS }), null);
  });
});
