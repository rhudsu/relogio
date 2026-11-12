import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseHistory } from "../../public/js/models/clockModel.js";
import { buildChartGeometry, computeIndexDomain, findZone, groupByWeek, summarizeHistory } from "../../public/js/models/historyModel.js";

const POINTS = [
  { date: "2026-10-20", index: 62 },
  { date: "2026-10-21", index: 66 },
  { date: "2026-10-22", index: 64 },
  { date: "2026-10-24", index: 69 },
];

describe("parseHistory", () => {
  it("ordena por data e descarta pontos inválidos", () => {
    const parsed = parseHistory([{ date: "2026-10-22", index: 5 }, { date: "2026-10-20", index: 3 }, { date: "x" }, null]);
    assert.deepEqual(parsed.map((point) => point.date), ["2026-10-20", "2026-10-22"]);
  });

  it("aceita ausência de histórico", () => {
    assert.deepEqual(parseHistory(undefined), []);
  });
});

describe("computeIndexDomain", () => {
  it("dá folga ao redor dos valores e mantém uma amplitude mínima", () => {
    const domain = computeIndexDomain(POINTS);
    assert.ok(domain.min <= 57 && domain.max >= 74);
    assert.ok(domain.max - domain.min >= 20);
  });

  it("não sai do intervalo de 0 a 100", () => {
    const domain = computeIndexDomain([{ date: "a", index: 99 }, { date: "b", index: 100 }]);
    assert.ok(domain.max <= 100 && domain.min >= 0);
  });
});

describe("buildChartGeometry", () => {
  it("não desenha com menos de dois pontos", () => {
    assert.equal(buildChartGeometry(POINTS.slice(0, 1)), null);
  });

  it("espaça o eixo X pelo calendário e inverte o eixo Y (maior índice, mais alto)", () => {
    const { coordinates, plot } = buildChartGeometry(POINTS);

    assert.equal(coordinates[0].x, plot.left);
    assert.equal(coordinates.at(-1).x, plot.right);
    assert.ok(coordinates[3].x - coordinates[2].x > coordinates[2].x - coordinates[1].x, "o salto de 2 dias é maior que o de 1");
    assert.ok(coordinates[3].y < coordinates[0].y);
  });
});

describe("groupByWeek", () => {
  const daily = [
    { date: "2026-10-08", index: 59 },
    { date: "2026-10-11", index: 60 },
    { date: "2026-10-12", index: 61 },
    { date: "2026-10-18", index: 62 },
    { date: "2026-10-19", index: 63 },
    { date: "2026-10-20", index: 64 },
  ];

  it("mantém o último valor de cada semana (segunda a domingo)", () => {
    assert.deepEqual(groupByWeek(daily), [
      { date: "2026-10-11", index: 60 },
      { date: "2026-10-18", index: 62 },
      { date: "2026-10-20", index: 64 },
    ]);
  });
});

describe("faixas de cor", () => {
  it("classifica o índice em baixo, elevado e crítico", () => {
    assert.equal(findZone(49.9).id, "low");
    assert.equal(findZone(50).id, "mid");
    assert.equal(findZone(70).id, "high");
  });

  it("devolve as faixas recortadas ao intervalo visível e o ponto na cor da sua faixa", () => {
    const { zones, coordinates } = buildChartGeometry(POINTS);
    assert.deepEqual(zones.map((zone) => zone.id), ["mid", "high"], "a faixa baixa fica fora do intervalo visível");
    assert.ok(zones.every((zone) => zone.bottom > zone.top));
    assert.equal(coordinates[0].zone, "mid");
  });
});

describe("summarizeHistory", () => {
  it("resume variação e faixa atual", () => {
    const summary = summarizeHistory(POINTS);
    assert.equal(summary.change, 7);
    assert.equal(summary.zone.id, "mid");
  });
});
