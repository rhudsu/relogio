import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGdeltUrl } from "../../pipeline/collectors/gdeltCollector.js";
import { applyBackfill, buildBackfillWindows } from "../../pipeline/services/backfillService.js";
import { SETTINGS_FOR_TESTS } from "./helpers.js";

const NOW = new Date("2026-11-12T12:00:00Z");

describe("coleta histórica", () => {
  it("divide o período em janelas contíguas que terminam agora", () => {
    const windows = buildBackfillWindows("2026-10-20", NOW, 10);

    assert.equal(windows[0].start, "2026-10-20T00:00:00.000Z");
    assert.equal(windows[0].end, windows[1].start);
    assert.equal(windows.at(-1).end, NOW.toISOString());
  });

  it("rejeita data inválida", () => {
    assert.throws(() => buildBackfillWindows("ontem", NOW), /Data inválida/);
  });

  it("amplia a janela de coleta e cria as janelas do GDELT", () => {
    const settings = applyBackfill(SETTINGS_FOR_TESTS, "2026-08-01", NOW, { gdelt: true });

    assert.ok(settings.collection.lookbackDays >= 103);
    assert.ok(settings.collection.gdeltWindows.length >= 10);
    assert.equal(SETTINGS_FOR_TESTS.collection.gdeltWindows, undefined, "não altera a configuração original");
    assert.equal(applyBackfill(SETTINGS_FOR_TESTS, "2026-08-01", NOW).collection.gdeltWindows, undefined, "sem a opção, só amplia o período");
  });

  it("monta a URL do GDELT com datas quando há janela e com timespan quando não há", () => {
    const withWindow = new URL(buildGdeltUrl("ai", { maxRecords: 50, timespan: "14d", start: "2026-08-01T00:00:00.000Z", end: "2026-08-11T00:00:00.000Z" }));
    assert.equal(withWindow.searchParams.get("startdatetime"), "20260801000000");
    assert.equal(withWindow.searchParams.get("enddatetime"), "20260811000000");
    assert.equal(withWindow.searchParams.get("timespan"), null);

    const relative = new URL(buildGdeltUrl("ai", { maxRecords: 50, timespan: "14d" }));
    assert.equal(relative.searchParams.get("timespan"), "14d");
  });
});
