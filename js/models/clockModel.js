import {
  GAUGE_LEVEL_THRESHOLDS,
  SECONDS_PER_HALF_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "../config.js";
import { describeEffect } from "./effectModel.js";

const DEGREES_PER_TURN = 360;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function assertNumber(value, fieldName) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Campo inválido em clock.json: ${fieldName}`);
  }
}

export function splitDuration(totalSeconds) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  return {
    minutes: Math.floor(rounded / SECONDS_PER_MINUTE),
    seconds: rounded % SECONDS_PER_MINUTE,
  };
}

function elapsedSinceNoon(secondsToMidnight) {
  const remaining = clamp(secondsToMidnight, 0, SECONDS_PER_HALF_DAY);
  return (SECONDS_PER_HALF_DAY - remaining) % SECONDS_PER_HALF_DAY;
}

export function getHandAngles(secondsToMidnight) {
  const elapsed = elapsedSinceNoon(secondsToMidnight);

  return {
    hour: roundTo((elapsed / SECONDS_PER_HALF_DAY) * DEGREES_PER_TURN, 2),
    minute: roundTo(((elapsed % SECONDS_PER_HOUR) / SECONDS_PER_HOUR) * DEGREES_PER_TURN, 2),
    second: roundTo((elapsed % SECONDS_PER_MINUTE) * 6, 2),
  };
}

export function getClockTime(secondsToMidnight) {
  const elapsed = elapsedSinceNoon(secondsToMidnight);
  const hours = Math.floor(elapsed / SECONDS_PER_HOUR);

  return {
    hours: hours === 0 ? 12 : hours,
    minutes: Math.floor((elapsed % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    seconds: elapsed % SECONDS_PER_MINUTE,
  };
}

export function getGaugeLevel(score) {
  if (score >= GAUGE_LEVEL_THRESHOLDS.high) return "high";
  if (score >= GAUGE_LEVEL_THRESHOLDS.mid) return "mid";
  return "low";
}

function parseGauge(rawGauge) {
  assertNumber(rawGauge.score, `gauges.${rawGauge.id}.score`);
  assertNumber(rawGauge.weight, `gauges.${rawGauge.id}.weight`);

  return {
    id: rawGauge.id,
    name: rawGauge.name,
    weightPercent: Math.round(rawGauge.weight * 100),
    score: rawGauge.score,
    weeklyDelta: rawGauge.weeklyDelta ?? 0,
    level: getGaugeLevel(rawGauge.score),
  };
}

function parsePriceSignal(raw) {
  if (!raw) return null;

  return {
    label: raw.label,
    asOf: raw.asOf,
    lastValue: raw.lastValue,
    peakValue: raw.peakValue,
    peakDate: raw.peakDate,
    tradingDaysSincePeak: raw.tradingDaysSincePeak,
    drawdownPercent: raw.drawdownPercent,
    phase: raw.phase,
    progress: raw.progress,
    baseIndex: Math.round(raw.baseIndex),
    adjustedIndex: Math.round(raw.adjustedIndex),
    baseRates: raw.baseRates,
  };
}

export function parseHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];

  return rawHistory
    .filter((point) => typeof point?.date === "string" && Number.isFinite(point.index))
    .map((point) => ({ date: point.date, index: point.index }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function parseClock(rawClock) {
  assertNumber(rawClock.index, "index");
  assertNumber(rawClock.secondsToMidnight, "secondsToMidnight");
  assertNumber(rawClock.deltaSeconds7d, "deltaSeconds7d");

  return {
    isSample: Boolean(rawClock.meta?.isSample),
    notice: rawClock.meta?.notice ?? null,
    index: rawClock.index,
    baseIndex: rawClock.baseIndex ?? null,
    priceSignal: parsePriceSignal(rawClock.priceSignal),
    weeklySummary: rawClock.weeklySummary ?? null,
    history: parseHistory(rawClock.history),
    remaining: splitDuration(rawClock.secondsToMidnight),
    time: getClockTime(rawClock.secondsToMidnight),
    handAngles: getHandAngles(rawClock.secondsToMidnight),
    deadline: rawClock.deadline,
    crashProbability: rawClock.crashProbability ?? null,
    confidence: rawClock.confidence,
    weeklyEffect: describeEffect(rawClock.deltaSeconds7d),
    updatedAt: rawClock.updatedAt,
    gauges: rawClock.gauges.map(parseGauge).sort((a, b) => b.score - a.score),
  };
}
