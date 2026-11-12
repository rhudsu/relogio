import { MONTH_ABBREVIATIONS } from "../config.js";
import { buildChartGeometry, summarizeHistory } from "../models/historyModel.js";
import { createElement } from "../utils/dom.js";
import { formatDate, formatDecimal } from "../utils/formatters.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function createSvg(tagName, attributes = {}, text) {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function monthLabel(isoDate) {
  return MONTH_ABBREVIATIONS[Number(isoDate.slice(5, 7)) - 1];
}

function weekLabel(isoDate) {
  return `${Number(isoDate.slice(8, 10))} ${monthLabel(isoDate)}`;
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
    createSvg("text", { class: "history__tick", x: plot.left - 6, y: tick.y, "text-anchor": "end", "dominant-baseline": "middle" }, tick.value),
  );
}

function createDateLabels({ coordinates, plot }) {
  const lastPoint = coordinates.at(-1);

  return coordinates
    .filter((point) => point.labeled)
    .map((point) =>
      createSvg(
        "text",
        { class: `history__tick history__tick--${point.kind}`, x: point.x, y: plot.bottom + 22, "text-anchor": point === lastPoint ? "end" : "middle" },
        point.kind === "month" ? monthLabel(point.date) : weekLabel(point.date),
      ),
    );
}

// Linha pontilhada vertical que separa o resumo mensal do detalhe semanal.
function createBoundary({ boundaryX, plot }) {
  if (boundaryX === null) return [];

  return [
    createSvg("line", { class: "history__boundary", x1: boundaryX, x2: boundaryX, y1: plot.top - 6, y2: plot.bottom }),
    createSvg("text", { class: "history__boundary-label", x: boundaryX - 6, y: plot.top - 10, "text-anchor": "end" }, "meses"),
    createSvg("text", { class: "history__boundary-label", x: boundaryX + 6, y: plot.top - 10, "text-anchor": "start" }, "semanas"),
  ];
}

function createDots({ coordinates, dotRadius }) {
  return coordinates.map((point) => {
    const unit = point.kind === "month" ? `Fim de ${monthLabel(point.date)}` : `Semana até ${formatDate(point.date)}`;
    const dot = createSvg("circle", {
      class: `history__dot history__dot--${point.zone} history__dot--${point.kind}`,
      cx: point.x,
      cy: point.y,
      r: dotRadius,
    });
    dot.append(createSvg("title", {}, `${unit}: ${formatDecimal(point.index)}`));
    return dot;
  });
}

function createChart(geometry, summary, layoutName) {
  const svg = createSvg("svg", {
    class: `history__chart history__chart--${layoutName}`,
    viewBox: `0 0 ${geometry.width} ${geometry.height}`,
    role: "img",
    "aria-label": `Índice de risco nos últimos 6 meses, por mês e depois por semana: de ${formatDecimal(summary.from.index)} para ${formatDecimal(summary.to.index)}.`,
  });

  svg.append(
    ...createZones(geometry),
    ...createTicks(geometry),
    ...createBoundary(geometry),
    ...createDateLabels(geometry),
    createSvg("path", { class: "history__line", d: geometry.path }),
    ...createDots(geometry),
    createSvg("text", { class: "history__value", x: geometry.last.x, y: geometry.last.y - 14, "text-anchor": "end" }, formatDecimal(geometry.last.index)),
  );

  return svg;
}

function describeSummary({ change, zone }) {
  const direction = change === 0 ? "estável" : `${change > 0 ? "+" : "−"}${formatDecimal(Math.abs(change))} ponto${Math.abs(change) === 1 ? "" : "s"}`;
  return `${direction} em 6 meses. Faixa atual: ${zone.label.toLowerCase()}.`;
}

export function renderHistory(container, series, layoutName) {
  const geometry = buildChartGeometry(series, layoutName);
  const summary = summarizeHistory(series.points);

  container.replaceChildren(
    createElement("h3", { className: "history__title", text: "Índice nos últimos 6 meses", attributes: { id: "history-title" } }),
    createChart(geometry, summary, layoutName),
    createElement("p", { className: "history__caption", text: describeSummary(summary) }),
  );
  container.hidden = false;
}
