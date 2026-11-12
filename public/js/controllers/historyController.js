import { buildSeries } from "../models/historyModel.js";
import { renderHistory } from "../views/historyView.js";

const COMPACT_QUERY = "(max-width: 600px)";

export function startHistory(elements, dailyPoints) {
  const series = buildSeries(dailyPoints);
  if (!elements.history || series.points.length < 2) return;

  const compact = window.matchMedia(COMPACT_QUERY);
  const draw = () => renderHistory(elements.history, series, compact.matches ? "compact" : "wide");

  draw();
  compact.addEventListener("change", draw);
}
