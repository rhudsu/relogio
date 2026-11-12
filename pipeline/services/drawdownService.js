import { daysBetween } from "../utils/time.js";

const INDEX_RANGE = 100;
const PERCENT_DECIMALS = 10;
const DRAWDOWN_PRECISION = 1_000_000;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value, factor) {
  return Math.round(value * factor) / factor;
}

export function seriesUntil(series, asOf) {
  const limit = new Date(asOf).toISOString().slice(0, 10);
  let end = series.length;

  while (end > 0 && series[end - 1].date > limit) end -= 1;

  return series.slice(0, end);
}

function highestInWindow(series, endIndex, windowDays) {
  let peakIndex = endIndex;

  for (let i = Math.max(0, endIndex - windowDays + 1); i <= endIndex; i += 1) {
    if (series[i].value >= series[peakIndex].value) peakIndex = i;
  }

  return peakIndex;
}

export function measureDrawdown(series, windowDays) {
  const lastIndex = series.length - 1;
  const peakIndex = highestInWindow(series, lastIndex, windowDays);

  return {
    last: series[lastIndex],
    peak: series[peakIndex],
    drawdown: roundTo(1 - series[lastIndex].value / series[peakIndex].value, DRAWDOWN_PRECISION),
    tradingDaysSincePeak: lastIndex - peakIndex,
  };
}

export function describePhase(drawdown, phases) {
  const phase = phases.find((candidate) => drawdown >= candidate.minDrawdown);
  return { id: phase.id, label: phase.label };
}

export function progressToCrash(drawdown, { correctionThreshold, crashThreshold }) {
  return clamp((drawdown - correctionThreshold) / (crashThreshold - correctionThreshold), 0, 1);
}

export function adjustIndex(baseIndex, drawdown, thresholds) {
  return baseIndex + (INDEX_RANGE - baseIndex) * progressToCrash(drawdown, thresholds);
}

export function computeBaseRates(series, { peakWindowDays, horizonDays, correctionThreshold, rearmBelow }) {
  const events = [];
  const seenPeaks = new Set();
  let armed = true;

  for (let i = peakWindowDays; i < series.length; i += 1) {
    const peakIndex = highestInWindow(series, i, peakWindowDays);
    const drawdown = 1 - series[i].value / series[peakIndex].value;

    if (drawdown < rearmBelow) armed = true;
    if (!armed || drawdown < correctionThreshold) continue;

    armed = false;
    if (seenPeaks.has(peakIndex)) continue;
    seenPeaks.add(peakIndex);

    const horizonEnd = Math.min(series.length - 1, peakIndex + horizonDays);
    let worst = drawdown;
    for (let j = i; j <= horizonEnd; j += 1) {
      worst = Math.max(worst, 1 - series[j].value / series[peakIndex].value);
    }

    const runUpStart = Math.max(0, peakIndex - horizonDays);
    events.push({
      complete: peakIndex + horizonDays <= series.length - 1,
      worst,
      runUp: series[peakIndex].value / series[runUpStart].value - 1,
    });
  }

  const complete = events.filter((event) => event.complete);
  const reached = (list, threshold) => list.filter((event) => event.worst >= threshold).length;
  const overheated = complete.filter((event) => event.runUp >= 1);

  return {
    from: series[0].date,
    to: series.at(-1).date,
    events: complete.length,
    reached20: reached(complete, 0.2),
    reached30: reached(complete, 0.3),
    reached40: reached(complete, 0.4),
    overheated: {
      events: overheated.length,
      reached20: reached(overheated, 0.2),
      reached40: reached(overheated, 0.4),
    },
  };
}

export function buildPriceSignal({ series, asOf, baseIndex, settings }) {
  const available = seriesUntil(series, asOf);
  const config = settings.priceSignal;

  if (available.length <= config.peakWindowDays) return null;
  if (daysBetween(available.at(-1).date, asOf) > config.maxStaleDays) return null;

  const { last, peak, drawdown, tradingDaysSincePeak } = measureDrawdown(available, config.peakWindowDays);
  const adjustedIndex = adjustIndex(baseIndex, drawdown, config);

  return {
    label: config.label,
    asOf: last.date,
    lastValue: roundTo(last.value, PERCENT_DECIMALS),
    peakValue: roundTo(peak.value, PERCENT_DECIMALS),
    peakDate: peak.date,
    tradingDaysSincePeak,
    drawdownPercent: roundTo(drawdown * 100, PERCENT_DECIMALS),
    phase: describePhase(drawdown, config.phases),
    progress: roundTo(progressToCrash(drawdown, config), 1000),
    baseIndex,
    adjustedIndex,
    baseRates: computeBaseRates(available, config),
  };
}
