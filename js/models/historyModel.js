import { INDEX_ZONES } from "../config.js";

const CHART = {
  width: 640,
  height: 260,
  padding: { top: 20, right: 16, bottom: 32, left: 40 },
  minRange: 30,
  tickStep: 10,
};

const MILLISECONDS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const MONDAY_OFFSET_FROM_EPOCH_DAY = 3; // 1970-01-01 foi uma quinta-feira

function dayNumber(date) {
  return Date.parse(`${date}T00:00:00Z`) / MILLISECONDS_PER_DAY;
}

function weekNumber(date) {
  return Math.floor((dayNumber(date) + MONDAY_OFFSET_FROM_EPOCH_DAY) / DAYS_PER_WEEK);
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

export function computeIndexDomain(points) {
  const values = points.map((point) => point.index);
  let min = Math.floor((Math.min(...values) - 5) / CHART.tickStep) * CHART.tickStep;
  let max = Math.ceil((Math.max(...values) + 5) / CHART.tickStep) * CHART.tickStep;

  while (max - min < CHART.minRange) {
    min -= CHART.tickStep;
    max += CHART.tickStep;
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
  for (let value = min; value <= max; value += CHART.tickStep) ticks.push({ value, y: scaleY(value) });
  return ticks;
}

export function buildChartGeometry(points) {
  if (points.length < 2) return null;

  const { width, height, padding } = CHART;
  const domain = computeIndexDomain(points);
  const firstDay = dayNumber(points[0].date);
  const daySpan = Math.max(dayNumber(points.at(-1).date) - firstDay, 1);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const scaleX = (date) => roundTo(padding.left + ((dayNumber(date) - firstDay) / daySpan) * plotWidth, 1);
  const scaleY = (index) => roundTo(padding.top + (1 - (index - domain.min) / (domain.max - domain.min)) * plotHeight, 1);

  const coordinates = points.map((point) => ({
    ...point,
    x: scaleX(point.date),
    y: scaleY(point.index),
    zone: findZone(point.index).id,
  }));

  return {
    width,
    height,
    plot: { left: padding.left, right: width - padding.right, top: padding.top, bottom: height - padding.bottom },
    coordinates,
    path: coordinates.map((c, i) => `${i === 0 ? "M" : "L"}${c.x} ${c.y}`).join(" "),
    zones: buildZones(domain, scaleY),
    ticks: buildTicks(domain, scaleY),
    last: coordinates.at(-1),
  };
}

export function summarizeHistory(points) {
  if (points.length < 2) return null;

  const first = points[0];
  const last = points.at(-1);

  return { from: first, to: last, change: roundTo(last.index - first.index, 1), zone: findZone(last.index) };
}
