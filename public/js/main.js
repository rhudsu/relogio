import { startClockSection } from "./controllers/clockController.js";
import { startHistory } from "./controllers/historyController.js";
import { startTimeline } from "./controllers/timelineController.js";
import { loadDashboardData } from "./services/dataService.js";
import { showLoadError } from "./views/feedbackView.js";

function findElements() {
  return {
    hero: document.querySelector("#hero"),
    bubbles: document.querySelector("#bubbles"),
    clockSvg: document.querySelector("#clock"),
    readout: document.querySelector("#readout"),
    phase: document.querySelector("#phase"),
    weekSummary: document.querySelector("#week-summary"),
    gauges: document.querySelector("#gauges"),
    timeline: document.querySelector("#timeline"),
    filterButtons: document.querySelectorAll("[data-filter]"),
    sortButtons: document.querySelectorAll("[data-sort]"),
    timelineMore: document.querySelector("#timeline-more"),
    history: document.querySelector("#history"),
    sampleNotice: document.querySelector("#sample-notice"),
    loadError: document.querySelector("#load-error"),
  };
}

async function main() {
  const elements = findElements();

  try {
    const { clock, entries } = await loadDashboardData();
    startClockSection(elements, clock);
    startHistory(elements, clock.history);
    startTimeline(elements, entries, clock.gauges);
  } catch (error) {
    console.error(error);
    showLoadError(elements.loadError);
  }
}

main();
