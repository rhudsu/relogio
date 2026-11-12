import { groupByWeek } from "../models/historyModel.js";
import { renderHistory } from "../views/historyView.js";

export function startHistory(elements, dailyPoints) {
  const weeklyPoints = groupByWeek(dailyPoints);
  if (!elements.history || weeklyPoints.length < 2) return;

  renderHistory(elements.history, weeklyPoints);
}
