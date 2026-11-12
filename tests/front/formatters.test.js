import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatDate,
  formatDateTime,
  formatDecimal,
  formatDeadlineRange,
  formatInteger,
  formatSeconds,
  formatSignedNumber,
  padTwoDigits,
} from "../../public/js/utils/formatters.js";

describe("formatDecimal e formatInteger", () => {
  it("usa vírgula nas frações e ponto como separador de milhar", () => {
    assert.equal(formatDecimal(11.9), "11,9");
    assert.equal(formatDecimal(20), "20");
    assert.equal(formatInteger(24315), "24.315");
    assert.equal(formatInteger(27599.9), "27.600");
  });
});

describe("formatSeconds", () => {
  it("mostra inteiros sem decimal e frações com vírgula", () => {
    assert.equal(formatSeconds(4), "4");
    assert.equal(formatSeconds(0.4), "0,4");
    assert.equal(formatSeconds(10.8), "10,8");
  });
});

describe("formatDate", () => {
  it("abrevia o mês em português sem mudar o dia por fuso horário", () => {
    assert.equal(formatDate("2026-10-22"), "22 out 2026");
    assert.equal(formatDate("2026-01-01"), "1 jan 2026");
  });
});

describe("formatDateTime", () => {
  it("mostra data e hora no horário de Brasília", () => {
    assert.equal(formatDateTime("2026-10-23T06:00:00-03:00"), "23 out 2026, 06:00");
    assert.equal(formatDateTime("2026-10-23T09:00:00Z"), "23 out 2026, 06:00");
  });
});

describe("formatSignedNumber", () => {
  it("usa sinal de mais, de menos tipográfico e zero sem sinal", () => {
    assert.equal(formatSignedNumber(3), "+3");
    assert.equal(formatSignedNumber(-2), "−2");
    assert.equal(formatSignedNumber(0), "0");
  });
});

describe("formatDeadlineRange", () => {
  it("descreve faixas fechadas e abertas", () => {
    assert.equal(formatDeadlineRange({ fromMonths: 12, toMonths: 24 }), "12 a 24");
    assert.equal(formatDeadlineRange({ fromMonths: null, toMonths: 3 }), "menos de 3");
    assert.equal(formatDeadlineRange({ fromMonths: 48, toMonths: null }), "mais de 48");
  });
});

describe("padTwoDigits", () => {
  it("completa com zero à esquerda", () => {
    assert.equal(padTwoDigits(9), "09");
    assert.equal(padTwoDigits(51), "51");
  });
});
