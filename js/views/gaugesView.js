import { createElement } from "../utils/dom.js";
import { MINUS_SIGN } from "../config.js";

function describeWeeklyDelta(delta) {
  if (delta === 0) return { text: "–", direction: "flat", label: "sem mudança na semana" };
  const closer = delta > 0;
  return {
    text: `${closer ? "▲" : "▼"}${Math.abs(delta)}`,
    direction: closer ? "closer" : "farther",
    label: `${closer ? "+" : MINUS_SIGN}${Math.abs(delta)} na semana`,
  };
}

function createGauge(gauge) {
  const fill = createElement("span", { className: "gauge__fill" });
  fill.style.setProperty("--value", `${gauge.score}%`);

  const delta = describeWeeklyDelta(gauge.weeklyDelta);

  return createElement("li", { className: `gauge gauge--${gauge.level}` }, [
    createElement("div", { className: "gauge__head" }, [
      createElement("span", { className: "gauge__name", text: gauge.name }),
      createElement("span", { className: "gauge__weight", text: `peso ${gauge.weightPercent}%` }),
      createElement("span", { className: `gauge__delta gauge__delta--${delta.direction}`, text: delta.text, attributes: { title: delta.label } }),
      createElement("strong", { className: "gauge__score", text: String(gauge.score) }),
    ]),
    createElement(
      "div",
      { className: "gauge__bar", attributes: { role: "img", "aria-label": `Risco ${gauge.score} de 100` } },
      [fill],
    ),
  ]);
}

export function renderGauges(list, gauges) {
  list.replaceChildren(...gauges.map(createGauge));
}
