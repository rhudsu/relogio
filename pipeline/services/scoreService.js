import { daysBetween } from "../utils/time.js";

const SECONDS_PER_MINUTE = 60;
const INDEX_RANGE = 100;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export const EVIDENCE_LEVELS = ["dado", "reportagem", "opiniao"];

export function signedPoints(classification, scoring) {
  const sign = classification.direction === "closer" ? 1 : -1;
  const evidenceWeight = scoring.evidenceWeights[classification.evidence];

  return sign * classification.magnitude * classification.confidence * evidenceWeight * scoring.pointsPerMagnitude;
}

function decayFactor(ageDays, halfLifeDays) {
  return 0.5 ** (Math.max(ageDays, 0) / halfLifeDays);
}

function relevantUntil(articles, asOf) {
  return articles.filter(
    (article) => article.relevant && new Date(article.publishedAt) <= new Date(asOf),
  );
}

export function computeGaugeScores(articles, gauges, scoring, asOf) {
  const active = relevantUntil(articles, asOf);

  return gauges.map((gauge) => {
    const accumulated = active
      .filter((article) => article.gaugeId === gauge.id)
      .reduce((sum, article) => {
        const age = daysBetween(article.publishedAt, asOf);
        const halfLife = gauge.halfLifeDays ?? scoring.decayHalfLifeDays;
        return sum + signedPoints(article, scoring) * decayFactor(age, halfLife);
      }, 0);

    return {
      id: gauge.id,
      score: clamp(gauge.baseline + accumulated, scoring.minScore, scoring.maxScore),
    };
  });
}

export function computeIndex(gaugeScores, gauges) {
  const weightById = new Map(gauges.map((gauge) => [gauge.id, gauge.weight]));
  const totalWeight = gauges.reduce((sum, gauge) => sum + gauge.weight, 0);

  return gaugeScores.reduce((sum, { id, score }) => sum + (score * weightById.get(id)) / totalWeight, 0);
}

export function indexToSecondsToMidnight(index, scoring) {
  const maxSeconds = scoring.maxMinutesToMidnight * SECONDS_PER_MINUTE;
  return Math.round(maxSeconds * (1 - clamp(index, 0, INDEX_RANGE) / INDEX_RANGE));
}

export function computeSnapshot(articles, gauges, scoring, asOf) {
  const gaugeScores = computeGaugeScores(articles, gauges, scoring, asOf);
  const index = computeIndex(gaugeScores, gauges);

  return {
    index,
    secondsToMidnight: indexToSecondsToMidnight(index, scoring),
    gaugeScores,
  };
}

export function secondsPerIndexPoint(scoring) {
  return (scoring.maxMinutesToMidnight * SECONDS_PER_MINUTE) / INDEX_RANGE;
}

const DELTA_DECIMALS_FACTOR = 10;

export function computeEntryDeltaSeconds(article, gauge, scoring) {
  const seconds = secondsPerIndexPoint(scoring) * gauge.weight * signedPoints(article, scoring);
  const result = Math.round(seconds * DELTA_DECIMALS_FACTOR) / DELTA_DECIMALS_FACTOR;
  return result === 0 ? 0 : result;
}

export function findDeadline(index, deadlineBands) {
  const band = deadlineBands.find((candidate) => index >= candidate.minIndex);
  return { fromMonths: band.fromMonths, toMonths: band.toMonths };
}

export function findCrashProbability(index, bands) {
  const band = bands.find((candidate) => index >= candidate.minIndex);
  return { fromPercent: band.fromPercent, toPercent: band.toPercent };
}

export function describeConfidence(articles, confidenceSettings, asOf) {
  const recentCount = relevantUntil(articles, asOf).filter(
    (article) => daysBetween(article.publishedAt, asOf) <= confidenceSettings.windowDays,
  ).length;

  return recentCount >= confidenceSettings.minArticlesForMedium ? "média" : "baixa";
}
