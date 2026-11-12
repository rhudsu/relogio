import { daysBetween } from "../utils/time.js";

function countCharacters(text) {
  return [...text].length;
}

export function resolveWeeklySummary(raw, now, { maxChars, maxHeadlineChars, maxAgeDays }) {
  if (!raw) return { summary: null, warning: "Resumo da semana ausente: o painel sai sem ele." };

  const text = String(raw.text ?? "").trim();
  const headline = String(raw.headline ?? "").trim();
  const asOf = new Date(raw.asOf);

  if (!text) return { summary: null, warning: "Resumo da semana vazio: o painel sai sem ele." };

  if (countCharacters(text) > maxChars) {
    return {
      summary: null,
      warning: `Resumo da semana com ${countCharacters(text)} caracteres (máximo ${maxChars}): o painel sai sem ele.`,
    };
  }

  if (countCharacters(headline) > maxHeadlineChars) {
    return {
      summary: null,
      warning: `Manchete do resumo com ${countCharacters(headline)} caracteres (máximo ${maxHeadlineChars}): o painel sai sem o resumo.`,
    };
  }

  if (Number.isNaN(asOf.getTime())) {
    return { summary: null, warning: "Resumo da semana sem data válida: o painel sai sem ele." };
  }

  if (daysBetween(asOf, now) > maxAgeDays) {
    return {
      summary: null,
      warning: `Resumo da semana desatualizado (de ${asOf.toISOString().slice(0, 10)}): escreva um novo. O painel sai sem ele.`,
    };
  }

  return { summary: { ...(headline && { headline }), text, asOf: asOf.toISOString() }, warning: null };
}
