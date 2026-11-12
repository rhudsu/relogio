import { createElement } from "../utils/dom.js";
import { formatDateTime, formatDeadlineRange, padTwoDigits } from "../utils/formatters.js";
import { createEffectChip } from "./chipView.js";

function createValue(parts) {
  return createElement(
    "dd",
    { className: "readout__value" },
    parts.flatMap(({ number, unit }) => [
      createElement("span", { className: "readout__num", text: number }),
      createElement("span", { className: "readout__unit", text: unit }),
    ]),
  );
}

function createItem(label, valueParts, noteChildren) {
  return createElement("div", { className: "readout__item" }, [
    createElement("dt", { className: "readout__label", text: label }),
    createValue(valueParts),
    createElement("dd", { className: "readout__note" }, noteChildren),
  ]);
}

function createRemainingItem({ remaining, weeklyEffect }) {
  return createItem(
    "Faltam para a meia-noite",
    [
      { number: String(remaining.minutes), unit: "min" },
      { number: padTwoDigits(remaining.seconds), unit: "s" },
    ],
    [createEffectChip(weeklyEffect, "Sem mudança"), " nos últimos 7 dias"],
  );
}

function describeDeadlineNote({ crashProbability }) {
  const caveat = "Estimativa, não data.";
  if (!crashProbability) return caveat;

  const { fromPercent, toPercent } = crashProbability;
  return `${fromPercent}% a ${toPercent}% de chance histórica de queda forte em 2 anos. ${caveat}`;
}

function createDeadlineItem(clock) {
  return createItem(
    "Janela provável de estouro",
    [{ number: formatDeadlineRange(clock.deadline), unit: "meses" }],
    [describeDeadlineNote(clock)],
  );
}

function describeComposition({ priceSignal }) {
  if (!priceSignal || priceSignal.adjustedIndex === priceSignal.baseIndex) return [];

  return [`Vulnerabilidade ${priceSignal.baseIndex} + queda de preços. `];
}

function createIndexItem(clock) {
  const { index, updatedAt } = clock;
  const time = createElement("time", { text: formatDateTime(updatedAt), attributes: { datetime: updatedAt } });

  return createItem("Índice de risco", [{ number: String(index), unit: "de 100" }], [...describeComposition(clock), "Atualizado em ", time]);
}

export function renderReadout(container, clock) {
  container.replaceChildren(createRemainingItem(clock), createDeadlineItem(clock), createIndexItem(clock));
}
