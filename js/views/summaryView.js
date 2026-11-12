import { createElement } from "../utils/dom.js";

const KICKER = "Resumo da semana";
const FALLBACK_HEADLINE = "O que moveu o ponteiro nos últimos 7 dias";

export function renderWeekSummary(container, summary) {
  const paragraphs = summary.text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);

  container.replaceChildren(
    createElement("p", { className: "week-summary__kicker", text: KICKER }),
    createElement("h3", {
      className: "week-summary__headline",
      text: summary.headline ?? FALLBACK_HEADLINE,
      attributes: { id: "week-summary-title" },
    }),
    ...paragraphs.map((text) => createElement("p", { className: "week-summary__text", text })),
  );
  container.hidden = false;
}
