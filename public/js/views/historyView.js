import { buildChartGeometry, summarizeHistory } from "../models/historyModel.js";
import { createElement } from "../utils/dom.js";
import { formatDate, formatDecimal } from "../utils/formatters.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_DATE_LABELS = 8;

function createSvg(tagName, attributes = {}, text) {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function shortDate(isoDate) {
  return formatDate(isoDate).split(" ").slice(0, 2).join(" ");
}

function createZones({ zones, plot }) {
  return zones.flatMap((zone) => [
    createSvg("rect", {
      class: `history__zone history__zone--${zone.id}`,
      x: plot.left,
      y: zone.top,
      width: plot.right - plot.left,
      height: zone.bottom - zone.top,
    }),
    createSvg("text", { class: "history__zone-label", x: plot.left + 6, y: zone.top + 14, "text-anchor": "start" }, zone.label),
  ]);
}

function createTicks({ ticks, plot }) {
  return ticks.map((tick) =>
    createSvg("text", { class: "history__tick", x: plot.left - 8, y: tick.y, "text-anchor": "end", "dominant-baseline": "middle" }, tick.value),
  );
}

function createDateLabels({ coordinates, plot }) {
  const labelled = coordinates.length <= MAX_DATE_LABELS ? coordinates : [coordinates[0], coordinates.at(-1)];

  return labelled.map((point) =>
    createSvg("text", { class: "history__tick", x: point.x, y: plot.bottom + 20, "text-anchor": "middle" }, shortDate(point.date)),
  );
}

function createDots({ coordinates }) {
  return coordinates.map((point) => {
    const dot = createSvg("circle", { class: `history__dot history__dot--${point.zone}`, cx: point.x, cy: point.y, r: 4.5 });
    dot.append(createSvg("title", {}, `Semana até ${formatDate(point.date)}: ${formatDecimal(point.index)}`));
    return dot;
  });
}

function createChart(geometry, summary) {
  const svg = createSvg("svg", {
    class: "history__chart",
    viewBox: `0 0 ${geometry.width} ${geometry.height}`,
    role: "img",
    "aria-label": `Índice de risco por semana, de ${formatDecimal(summary.from.index)} em ${formatDate(summary.from.date)} para ${formatDecimal(summary.to.index)} em ${formatDate(summary.to.date)}.`,
  });

  svg.append(
    ...createZones(geometry),
    ...createTicks(geometry),
    ...createDateLabels(geometry),
    createSvg("path", { class: "history__line", d: geometry.path }),
    ...createDots(geometry),
    createSvg("text", { class: "history__value", x: geometry.last.x, y: geometry.last.y - 12, "text-anchor": "end" }, formatDecimal(geometry.last.index)),
  );

  return svg;
}

function describeSummary({ change, zone }) {
  const trend = change === 0 ? "estável" : change > 0 ? `+${formatDecimal(change)} ponto${change === 1 ? "" : "s"}` : `−${formatDecimal(Math.abs(change))} ponto${change === -1 ? "" : "s"}`;
  return `${trend} no período. Faixa atual: ${zone.label.toLowerCase()}.`;
}

export function renderHistory(container, points) {
  const geometry = buildChartGeometry(points);
  const summary = summarizeHistory(points);

  container.replaceChildren(
    createElement("h3", { className: "history__title", text: "Índice por semana", attributes: { id: "history-title" } }),
    createChart(geometry, summary),
    createElement("p", { className: "history__caption", text: describeSummary(summary) }),
  );
  container.hidden = false;
}
