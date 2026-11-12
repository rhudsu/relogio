import { renderAtmosphere } from "../views/atmosphereView.js";
import { renderClock } from "../views/clockView.js";
import { showNotice } from "../views/feedbackView.js";
import { renderGauges } from "../views/gaugesView.js";
import { renderPhase } from "../views/phaseView.js";
import { renderReadout } from "../views/readoutView.js";
import { renderWeekSummary } from "../views/summaryView.js";

export function startClockSection(elements, clock) {
  renderAtmosphere(elements.hero, elements.bubbles, clock.index);
  renderClock(elements.clockSvg, clock);
  renderReadout(elements.readout, clock);
  renderGauges(elements.gauges, clock.gauges);
  if (clock.priceSignal) renderPhase(elements.phase, clock.priceSignal);
  if (clock.weeklySummary) renderWeekSummary(elements.weekSummary, clock.weeklySummary);

  if (clock.notice || clock.isSample) showNotice(elements.sampleNotice, clock.notice);
}
