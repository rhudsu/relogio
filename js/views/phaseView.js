import { MINUS_SIGN } from "../config.js";
import { createElement } from "../utils/dom.js";
import { formatDate, formatDecimal, formatInteger } from "../utils/formatters.js";

const SCALE_MAX_PERCENT = 40;
const SCALE_MARKS = [
  { percent: 10, label: "10% correção" },
  { percent: 20, label: "20% forte" },
  { percent: 40, label: "40% estouro" },
];
const ACTIVE_PHASES = new Set(["correction", "bear", "crash"]);

function percentOfScale(percent) {
  return Math.min((percent / SCALE_MAX_PERCENT) * 100, 100);
}

function createTrack(signal) {
  const fill = createElement("span", { className: "phase__fill" });
  fill.style.setProperty("--width", `${percentOfScale(signal.drawdownPercent)}%`);

  const marks = SCALE_MARKS.map(({ percent, label }) => {
    const mark = createElement("span", { className: "phase__mark", text: label });
    mark.style.setProperty("--position", `${percentOfScale(percent)}%`);
    return mark;
  });

  return createElement("div", { className: "phase__scale" }, [
    createElement(
      "div",
      {
        className: "phase__track",
        attributes: {
          role: "img",
          "aria-label": `Queda de ${formatDecimal(signal.drawdownPercent)}% numa escala de 0 a ${SCALE_MAX_PERCENT}%`,
        },
      },
      [fill],
    ),
    createElement("div", { className: "phase__marks", attributes: { "aria-hidden": "true" } }, marks),
  ]);
}

function createFact(label, value) {
  return createElement("div", { className: "phase__fact" }, [
    createElement("dt", { className: "phase__fact-label", text: label }),
    createElement("dd", { className: "phase__fact-value", text: value }),
  ]);
}

function describeEffect({ baseIndex, adjustedIndex, progress }) {
  return progress === 0 ? "Ainda não conta (só a partir de 10%)" : `Índice ${baseIndex} → ${adjustedIndex}`;
}

function describeHistory({ baseRates }) {
  const share = Math.round((baseRates.reached40 / baseRates.events) * 100);
  return `Desde ${baseRates.from.slice(0, 4)}, ${share}% das quedas de 10% chegaram a 40% em 2 anos (${baseRates.reached40} de ${baseRates.events}).`;
}

export function renderPhase(container, signal) {
  const children = [
    createElement("h3", { className: "phase__title", text: `Queda de preços: ${signal.label}`, attributes: { id: "phase-title" } }),
    createElement("p", { className: "phase__headline" }, [
      createElement("span", { className: "phase__number", text: `${MINUS_SIGN}${formatDecimal(signal.drawdownPercent)}%` }),
      createElement("span", { className: `phase__chip phase__chip--${signal.phase.id}`, text: signal.phase.label }),
    ]),
    createElement("p", { className: "phase__sub", text: "abaixo da máxima de 12 meses" }),
    createTrack(signal),
    createElement("dl", { className: "phase__facts" }, [
      createFact("Máxima", `${formatInteger(signal.peakValue)} · ${formatDate(signal.peakDate)}`),
      createFact("Fechamento", `${formatInteger(signal.lastValue)} · ${formatDate(signal.asOf)}`),
      createFact("Efeito", describeEffect(signal)),
    ]),
  ];

  if (ACTIVE_PHASES.has(signal.phase.id)) {
    children.push(createElement("p", { className: "phase__history", text: describeHistory(signal) }));
  }

  container.dataset.phase = signal.phase.id;
  container.replaceChildren(...children);
  container.hidden = false;
}
