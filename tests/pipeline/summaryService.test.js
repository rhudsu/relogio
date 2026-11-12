import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildClockData } from "../../pipeline/services/publicationService.js";
import { resolveWeeklySummary } from "../../pipeline/services/summaryService.js";
import { GAUGES, NOW, SETTINGS_FOR_TESTS } from "./helpers.js";

const LIMITS = SETTINGS_FOR_TESTS.weeklySummary;
const RECENT = new Date(NOW.getTime() - 3_600_000).toISOString();

describe("resolveWeeklySummary", () => {
  it("aceita um resumo recente e dentro do limite e devolve texto e data", () => {
    const { summary, warning } = resolveWeeklySummary({ text: "  Mais perto da meia-noite.  ", asOf: RECENT }, NOW, LIMITS);

    assert.equal(warning, null);
    assert.deepEqual(summary, { text: "Mais perto da meia-noite.", asOf: RECENT });
  });

  it("aceita exatamente o limite de caracteres e recusa um caractere a mais", () => {
    const atLimit = "a".repeat(LIMITS.maxChars);

    assert.ok(resolveWeeklySummary({ text: atLimit, asOf: RECENT }, NOW, LIMITS).summary);
    assert.match(resolveWeeklySummary({ text: `${atLimit}a`, asOf: RECENT }, NOW, LIMITS).warning, new RegExp(`${LIMITS.maxChars + 1} caracteres \\(máximo ${LIMITS.maxChars}\\)`));
  });

  it("aceita manchete dentro do limite, devolve com o texto e recusa manchete longa demais", () => {
    const ok = resolveWeeklySummary({ headline: " Relógio avança ", text: "Texto.", asOf: RECENT }, NOW, LIMITS);
    assert.deepEqual(ok.summary, { headline: "Relógio avança", text: "Texto.", asOf: RECENT });

    const long = resolveWeeklySummary({ headline: "a".repeat(LIMITS.maxHeadlineChars + 1), text: "Texto.", asOf: RECENT }, NOW, LIMITS);
    assert.equal(long.summary, null);
    assert.match(long.warning, /Manchete/);
  });

  it("conta caracteres e não bytes, então acentos e símbolos não estouram o limite", () => {
    const accented = "ç".repeat(LIMITS.maxChars);

    assert.ok(resolveWeeklySummary({ text: accented, asOf: RECENT }, NOW, LIMITS).summary);
  });

  it("descarta um resumo velho demais para não mostrar texto antigo como se fosse atual", () => {
    const old = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();
    const { summary, warning } = resolveWeeklySummary({ text: "Texto antigo.", asOf: old }, NOW, LIMITS);

    assert.equal(summary, null);
    assert.match(warning, /desatualizado/);
  });

  it("avisa e segue sem resumo quando ele não existe, está vazio ou não tem data válida", () => {
    assert.match(resolveWeeklySummary(null, NOW, LIMITS).warning, /ausente/);
    assert.match(resolveWeeklySummary({ text: "   ", asOf: RECENT }, NOW, LIMITS).warning, /vazio/);
    assert.match(resolveWeeklySummary({ text: "Oi", asOf: "ontem" }, NOW, LIMITS).warning, /data válida/);
  });
});

describe("resumo da semana no clock.json", () => {
  const base = { articles: [], gauges: GAUGES, settings: SETTINGS_FOR_TESTS, now: NOW };

  it("entra no clock.json quando existe e não aparece quando não existe", () => {
    const summary = { text: "Mais perto da meia-noite.", asOf: RECENT };

    assert.deepEqual(buildClockData({ ...base, weeklySummary: summary }).weeklySummary, summary);
    assert.equal(buildClockData(base).weeklySummary, undefined);
  });
});
