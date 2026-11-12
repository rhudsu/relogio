import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseHistory } from "../../public/js/models/clockModel.js";
import {
  buildChartGeometry,
  buildSeries,
  computeIndexDomain,
  findZone,
  groupByMonth,
  groupByWeek,
  limitToRecentMonths,
  summarizeHistory,
} from "../../public/js/models/historyModel.js";

function daily(from, days, start = 60, step = 0.1) {
  const first = new Date(`${from}T00:00:00Z`);
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(first.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    return { date, index: Math.round((start + offset * step) * 10) / 10 };
  });
}

describe("parseHistory", () => {
  it("ordena por data e descarta pontos inválidos", () => {
    const parsed = parseHistory([{ date: "2026-10-22", index: 5 }, { date: "2026-10-20", index: 3 }, { date: "x" }, null]);
    assert.deepEqual(parsed.map((point) => point.date), ["2026-10-20", "2026-10-22"]);
  });

  it("aceita ausência de histórico", () => {
    assert.deepEqual(parseHistory(undefined), []);
  });
});

describe("agrupamento", () => {
  const points = [
    { date: "2026-10-08", index: 59 },
    { date: "2026-10-11", index: 60 },
    { date: "2026-10-12", index: 61 },
    { date: "2026-10-18", index: 62 },
    { date: "2026-11-02", index: 64 },
  ];

  it("semana: mantém o último valor de cada semana (segunda a domingo)", () => {
    assert.deepEqual(groupByWeek(points.slice(0, 4)).map((p) => p.index), [60, 62]);
  });

  it("mês: mantém o último valor de cada mês", () => {
    assert.deepEqual(groupByMonth(points), [
      { date: "2026-10-18", index: 62 },
      { date: "2026-11-02", index: 64 },
    ]);
  });
});

describe("janela de 6 meses e série mensal + semanal", () => {
  const history = daily("2026-01-01", 316); // até 2026-11-12

  it("limita a visão aos últimos 6 meses", () => {
    const recent = limitToRecentMonths(history);
    assert.equal(recent[0].date, "2026-05-12");
    assert.equal(recent.at(-1).date, "2026-11-12");
  });

  it("resume o passado em meses e as últimas semanas em semanas, com a fronteira marcada", () => {
    const { points, boundaryIndex } = buildSeries(history);
    const months = points.filter((p) => p.kind === "month");
    const weeks = points.filter((p) => p.kind === "week");

    assert.ok(months.length >= 4 && months.length <= 6);
    assert.ok(weeks.length >= 8 && weeks.length <= 9);
    assert.equal(boundaryIndex, months.length);
    assert.ok(points.length <= 15, "poucos pontos, mesmo com anos de histórico");
    assert.ok(months.every((p) => p.date < weeks[0].date));
  });

  it("sem meses mais antigos não há fronteira", () => {
    const { boundaryIndex, points } = buildSeries(daily("2026-10-20", 24));
    assert.equal(boundaryIndex, null);
    assert.ok(points.every((p) => p.kind === "week"));
  });

  it("o tamanho da série não cresce com o tempo", () => {
    assert.ok(buildSeries(daily("2024-01-01", 1000)).points.length <= 15);
  });
});

describe("computeIndexDomain", () => {
  it("dá folga ao redor dos valores e mantém uma amplitude mínima", () => {
    const domain = computeIndexDomain([{ index: 62 }, { index: 69 }]);
    assert.ok(domain.min <= 57 && domain.max >= 74);
    assert.ok(domain.max - domain.min >= 30);
  });

  it("não sai do intervalo de 0 a 100", () => {
    const domain = computeIndexDomain([{ index: 99 }, { index: 100 }]);
    assert.ok(domain.max <= 100 && domain.min >= 0);
  });
});

describe("buildChartGeometry", () => {
  const series = buildSeries(daily("2026-01-01", 316));

  it("não desenha com menos de dois pontos", () => {
    assert.equal(buildChartGeometry({ points: series.points.slice(0, 1), boundaryIndex: null }), null);
  });

  it("espaça os pontos por igual e coloca a linha pontilhada entre o último mês e a primeira semana", () => {
    const geometry = buildChartGeometry(series, "wide");
    const [a, b, c] = geometry.coordinates;

    assert.equal(a.x, geometry.plot.left);
    assert.equal(geometry.last.x, geometry.plot.right);
    assert.ok(Math.abs(b.x - a.x - (c.x - b.x)) < 0.2);

    const lastMonth = geometry.coordinates.filter((p) => p.kind === "month").at(-1);
    const firstWeek = geometry.coordinates.find((p) => p.kind === "week");
    assert.ok(geometry.boundaryX > lastMonth.x && geometry.boundaryX < firstWeek.x);
  });

  it("o desenho de celular tem pontos maiores e menos rótulos de semana", () => {
    const wide = buildChartGeometry(series, "wide");
    const compact = buildChartGeometry(series, "compact");

    assert.ok(compact.dotRadius > wide.dotRadius);
    const weekLabels = (g) => g.coordinates.filter((p) => p.kind === "week" && p.labeled).length;
    assert.ok(weekLabels(compact) < weekLabels(wide));
    assert.ok(compact.coordinates.at(-1).labeled, "a última semana sempre tem rótulo");
  });

  it("pinta cada ponto na cor da sua faixa e recorta as faixas ao intervalo visível", () => {
    const { zones, coordinates } = buildChartGeometry({ points: [{ date: "2026-10-20", index: 62, kind: "week" }, { date: "2026-10-27", index: 69, kind: "week" }], boundaryIndex: null });
    assert.deepEqual(zones.map((zone) => zone.id), ["mid", "high"]);
    assert.equal(coordinates[0].zone, "mid");
  });
});

describe("faixas de cor", () => {
  it("classifica o índice em baixo, elevado e crítico", () => {
    assert.equal(findZone(49.9).id, "low");
    assert.equal(findZone(50).id, "mid");
    assert.equal(findZone(70).id, "high");
  });
});

describe("summarizeHistory", () => {
  it("resume variação e faixa atual", () => {
    const summary = summarizeHistory([{ date: "a", index: 62 }, { date: "b", index: 69 }]);
    assert.equal(summary.change, 7);
    assert.equal(summary.zone.id, "mid");
  });
});
