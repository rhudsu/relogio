import { createElement } from "../utils/dom.js";
import { formatDate } from "../utils/formatters.js";
import { createEffectChip } from "./chipView.js";

const EMPTY_MESSAGE = "Nenhuma notícia neste filtro. Escolha Todas para ver o diário completo.";

const EVIDENCE_LABELS = {
  dado: "Dado verificável",
  reportagem: "Reportagem",
  opiniao: "Opinião",
};

function createSourceLink(url) {
  return createElement("a", {
    className: "entry__link",
    text: "Matéria original",
    attributes: { href: url, target: "_blank", rel: "noopener noreferrer" },
  });
}

function createEntryMeta(entry, gaugeName) {
  const meta = [createEffectChip(entry.effect, "Sem efeito")];

  if (gaugeName) meta.push(createElement("span", { className: "entry__tag", text: gaugeName }));
  if (EVIDENCE_LABELS[entry.evidence]) {
    meta.push(createElement("span", { className: "entry__evidence", text: EVIDENCE_LABELS[entry.evidence] }));
  }
  if (entry.url) meta.push(createSourceLink(entry.url));

  return createElement("div", { className: "entry__meta" }, meta);
}

function createEntry(entry, gaugeName) {
  return createElement("li", { className: "entry", attributes: { "data-effect": entry.effect.direction } }, [
    createElement("div", { className: "entry__head" }, [
      createElement("time", {
        className: "entry__date",
        text: formatDate(entry.date),
        attributes: { datetime: entry.date },
      }),
      createElement("span", { className: "entry__source", text: entry.source }),
    ]),
    createElement("h3", { className: "entry__title", text: entry.title }),
    createElement("p", { className: "entry__summary", text: entry.summary }),
    createEntryMeta(entry, gaugeName),
  ]);
}

export function renderTimeline(list, entries, gaugeNames) {
  if (entries.length === 0) {
    list.replaceChildren(createElement("li", { className: "timeline__empty", text: EMPTY_MESSAGE }));
    return;
  }

  list.replaceChildren(...entries.map((entry) => createEntry(entry, gaugeNames.get(entry.gaugeId))));
}

export function renderMoreButton(button, hiddenCount) {
  button.hidden = hiddenCount === 0;
  button.textContent = `Ver mais (${hiddenCount})`;
}

export function markActiveOption(buttons, dataKey, activeValue) {
  buttons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset[dataKey] === activeValue));
  });
}
