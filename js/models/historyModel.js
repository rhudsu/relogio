import { INDEX_ZONES } from "../config.js";

// Dois desenhos: o largo (computador) e o compacto (celular), com pontos e letras maiores.
export const CHART_LAYOUTS = {
  wide: {
    width: 640,
    height: 280,
    padding: { top: 28, right: 18, bottom: 34, left: 40 },
    dotRadius: 4.5,
    maxLabeledWeeks: 8,
  },
  compact: {
    width: 360,
    height: 330,
    padding: { top: 32, right: 14, bottom: 40, left: 34 },
    dotRadius: 6.5,
    maxLabeledWeeks: 4,
  },
};

const HISTORY_MONTHS = 6;
const WEEKLY_DETAIL_WEEKS = 8;
const MILLISECONDS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const MONDAY_OFFSET_FROM_EPOCH_DAY = 3; // 1970-01-01 foi uma quinta-feira
const MIN_RANGE = 30;
const TICK_STEP = 10;

function dayNumber(date) {
  return Date.parse(`${date}T00:00:00Z`) / MILLISECONDS_PER_DAY;
}

function weekNumber(date) {
  return Math.floor((dayNumber(date) + MONDAY_OFFSET_FROM_EPOCH_DAY) / DAYS_PER_WEEK);
}

function monthKey(date) {
  return date.slice(0, 7);
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function findZone(index) {
  return [...INDEX_ZONES].reverse().find((zone) => index >= zone.minIndex);
}

// Um ponto por semana (segunda a domingo): o último valor da semana, que é o índice ao fechá-la.
export function groupByWeek(points) {
  const weeks = new Map();
  points.forEach((point) => weeks.set(weekNumber(point.date), point));
  return [...weeks.values()];
}

// Um ponto por mês: o último valor do mês.
export function groupByMonth(points) {
  const months = new Map();
  points.forEach((point) => months.set(monthKey(point.date), point));
  return [...months.values()];
}

export function limitToRecentMonths(points, months = HISTORY_MONTHS) {
  if (points.length === 0) return points;

  const last = new Date(`${points.at(-1).date}T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() - months);
  const from = last.toISOString().slice(0, 10);

  return points.filter((point) => point.date >= from);
}

// Últimas semanas em detalhe (um ponto por semana) e o que veio antes resumido por mês.
// Cada ponto indica seu tipo, e "boundaryIndex" marca onde começa o trecho semanal.
export function buildSeries(dailyPoints, weeklyDetailWeeks = WEEKLY_DETAIL_WEEKS) {
  const recent = limitToRecentMonths(dailyPoints);
  if (recent.length === 0) return { points: [], boundaryIndex: null };

  const cutoff = new Date(`${recent.at(-1).date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - weeklyDetailWeeks * DAYS_PER_WEEK);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const older = recent.filter((point) => point.date < cutoffDate);
  const newer = recent.filter((point) => point.date >= cutoffDate);

  const monthly = groupByMonth(older).map((point) => ({ ...point, kind: "month" }));
  const weekly = groupByWeek(newer).map((point) => ({ ...point, kind: "week" }));

  return { points: [...monthly, ...weekly], boundaryIndex: monthly.length > 0 && weekly.length > 0 ? monthly.length : null };
}

export function computeIndexDomain(points) {
  const values = points.map((point) => point.index);
  let min = Math.floor((Math.min(...values) - 5) / TICK_STEP) * TICK_STEP;
  let max = Math.ceil((Math.max(...values) + 5) / TICK_STEP) * TICK_STEP;

  while (max - min < MIN_RANGE) {
    min -= TICK_STEP;
    max += TICK_STEP;
  }

  return { min: Math.max(min, 0), max: Math.min(max, 100) };
}

function buildZones(domain, scaleY) {
  return INDEX_ZONES.map((zone, position) => {
    const upper = INDEX_ZONES[position + 1]?.minIndex ?? domain.max;
    return { ...zone, from: Math.max(zone.minIndex, domain.min), to: Math.min(upper, domain.max) };
  })
    .filter((zone) => zone.to > zone.from)
    .map((zone) => ({ id: zone.id, label: zone.label, top: scaleY(zone.to), bottom: scaleY(zone.from) }));
}

function buildTicks({ min, max }, scaleY) {
  const ticks = [];
  for (let value = min; value <= max; value += TICK_STEP) ticks.push({ value, y: scaleY(value) });
  return ticks;
}

// Decide quais pontos recebem rótulo no eixo: todos os meses, as últimas semanas (e sempre a última).
function markLabels(coordinates, maxLabeledWeeks) {
  const weeks = coordinates.filter((point) => point.kind === "week");
  const step = Math.max(1, Math.ceil(weeks.length / maxLabeledWeeks));
  const labeledWeeks = new Set(weeks.filter((_, index) => (weeks.length - 1 - index) % step === 0));

  return coordinates.map((point) => ({ ...point, labeled: point.kind === "month" || labeledWeeks.has(point) }));
}

// Os pontos ficam em espaçamento igual (e não proporcional ao calendário) para o trecho semanal
// não ficar espremido ao lado dos meses.
export function buildChartGeometry({ points, boundaryIndex }, layoutName = "wide") {
  if (points.length < 2) return null;

  const layout = CHART_LAYOUTS[layoutName];
  const { width, height, padding } = layout;
  const domain = computeIndexDomain(points);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const slot = plotWidth / (points.length - 1);

  const scaleY = (index) => roundTo(padding.top + (1 - (index - domain.min) / (domain.max - domain.min)) * plotHeight, 1);

  const placed = points.map((point, position) => ({
    ...point,
    x: roundTo(padding.left + slot * position, 1),
    y: scaleY(point.index),
    zone: findZone(point.index).id,
  }));
  const coordinates = markLabels(placed, layout.maxLabeledWeeks);
  const boundaryX = boundaryIndex === null ? null : roundTo(padding.left + slot * (boundaryIndex - 0.5), 1);

  return {
    width,
    height,
    dotRadius: layout.dotRadius,
    plot: { left: padding.left, right: width - padding.right, top: padding.top, bottom: height - padding.bottom },
    coordinates,
    path: coordinates.map((c, i) => `${i === 0 ? "M" : "L"}${c.x} ${c.y}`).join(" "),
    zones: buildZones(domain, scaleY),
    ticks: buildTicks(domain, scaleY),
    boundaryX,
    last: coordinates.at(-1),
  };
}

export function summarizeHistory(points) {
  if (points.length < 2) return null;

  const first = points[0];
  const last = points.at(-1);

  return { from: first, to: last, change: roundTo(last.index - first.index, 1), zone: findZone(last.index) };
}
