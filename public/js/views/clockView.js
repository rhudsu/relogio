import { padTwoDigits } from "../utils/formatters.js";

const FULL_TURN_DEGREES = 360;
const HOUR_HAND_SWEEP_DEGREES = 90;

const HAND_SWEEPS = [
  { selector: ".hand--hour", angleKey: "hour", sweepDegrees: HOUR_HAND_SWEEP_DEGREES },
  { selector: ".hand--minute", angleKey: "minute", sweepDegrees: FULL_TURN_DEGREES },
  { selector: ".hand--second", angleKey: "second", sweepDegrees: FULL_TURN_DEGREES },
];

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

function setHand(svg, { selector, angleKey, sweepDegrees }, handAngles) {
  const angle = handAngles[angleKey];
  const hand = svg.querySelector(selector);

  hand.style.setProperty("--angle", `${angle}deg`);
  hand.style.setProperty("--from", `${angle - sweepDegrees}deg`);
}

function describeClock(svg, { time, remaining }) {
  const shownTime = `${time.hours}h${padTwoDigits(time.minutes)}min${padTwoDigits(time.seconds)}s`;
  const minutes = `${remaining.minutes} ${pluralize(remaining.minutes, "minuto", "minutos")}`;
  const seconds = `${remaining.seconds} ${pluralize(remaining.seconds, "segundo", "segundos")}`;

  svg.querySelector("title").textContent = `Despertador marcando ${shownTime}`;
  svg.querySelector("desc").textContent = `Faltam ${minutes} e ${seconds} para a meia-noite. O alarme está ajustado para as 12.`;
}

export function renderClock(svg, clock) {
  HAND_SWEEPS.forEach((handSweep) => setHand(svg, handSweep, clock.handAngles));
  describeClock(svg, clock);
  svg.classList.add("clock--ready");
}
