import { daysBetween, subtractDays, toLocalDate } from "../utils/time.js";
import { buildPriceSignal } from "./drawdownService.js";
import {
  computeEntryDeltaSeconds,
  computeSnapshot,
  describeConfidence,
  findCrashProbability,
  findDeadline,
  indexToSecondsToMidnight,
} from "./scoreService.js";

const METHOD_VERSION = 2;
const MILLISECONDS_PER_DAY = 86_400_000;
const INDEX_DECIMALS_FACTOR = 10;
const END_OF_LOCAL_DAY = "T23:59:59-03:00";

function buildHistory({ articles, gauges, settings, now, priceSeries }) {
  const relevant = articles.filter((article) => article.relevant);
  if (relevant.length === 0) return [];

  const earliestMs = Math.min(...relevant.map((article) => new Date(article.publishedAt).getTime()));
  const windowStartMs = new Date(now).getTime() - settings.publication.historyDays * MILLISECONDS_PER_DAY;
  const endDay = toLocalDate(now);
  const points = [];

  for (let ms = Math.max(earliestMs, windowStartMs); toLocalDate(ms) <= endDay; ms += MILLISECONDS_PER_DAY) {
    const date = toLocalDate(ms);
    const asOf = date === endDay ? new Date(now) : new Date(`${date}${END_OF_LOCAL_DAY}`);
    const baseIndex = computeSnapshot(articles, gauges, settings.scoring, asOf).index;
    const { index } = applyPriceSignal({ priceSeries, baseIndex, asOf, settings });
    points.push({ date, index: Math.round(index * INDEX_DECIMALS_FACTOR) / INDEX_DECIMALS_FACTOR });
  }

  return points;
}

function applyPriceSignal({ priceSeries, baseIndex, asOf, settings }) {
  const signal = priceSeries ? buildPriceSignal({ series: priceSeries, asOf, baseIndex, settings }) : null;

  return {
    signal,
    index: signal ? signal.adjustedIndex : baseIndex,
  };
}

export function buildClockData({
  articles,
  gauges,
  settings,
  now,
  notice = null,
  priceSeries = null,
  weeklySummary = null,
}) {
  const { scoring, deadlineBands, confidence } = settings;
  const previousDate = subtractDays(now, scoring.trendWindowDays);
  const current = computeSnapshot(articles, gauges, scoring, now);
  const previous = computeSnapshot(articles, gauges, scoring, previousDate);
  const previousScoreById = new Map(previous.gaugeScores.map(({ id, score }) => [id, score]));
  const currentScoreById = new Map(current.gaugeScores.map(({ id, score }) => [id, score]));

  const adjusted = applyPriceSignal({ priceSeries, baseIndex: current.index, asOf: now, settings });
  const adjustedBefore = applyPriceSignal({ priceSeries, baseIndex: previous.index, asOf: previousDate, settings });
  const secondsToMidnight = indexToSecondsToMidnight(adjusted.index, scoring);
  const secondsBefore = indexToSecondsToMidnight(adjustedBefore.index, scoring);

  const clock = {
    meta: notice
      ? { isSample: false, methodVersion: METHOD_VERSION, notice }
      : { isSample: false, methodVersion: METHOD_VERSION },
    index: Math.round(adjusted.index),
    baseIndex: Math.round(current.index),
    secondsToMidnight,
    deadline: findDeadline(adjusted.index, deadlineBands),
    crashProbability: findCrashProbability(adjusted.index, settings.crashProbabilityBands),
    confidence: describeConfidence(articles, confidence, now),
    deltaSeconds7d: secondsBefore - secondsToMidnight,
    updatedAt: new Date(now).toISOString(),
    gauges: gauges.map((gauge) => ({
      id: gauge.id,
      name: gauge.name,
      weight: gauge.weight,
      score: Math.round(currentScoreById.get(gauge.id)),
      weeklyDelta: Math.round(currentScoreById.get(gauge.id) - previousScoreById.get(gauge.id)),
    })),
  };

  if (adjusted.signal) clock.priceSignal = adjusted.signal;
  if (weeklySummary) clock.weeklySummary = weeklySummary;
  clock.history = buildHistory({ articles, gauges, settings, now, priceSeries });

  return clock;
}

export function buildEntries({ articles, gauges, settings, now }) {
  const { entriesWindowDays, maxEntries } = settings.publication;
  const gaugeById = new Map(gauges.map((gauge) => [gauge.id, gauge]));

  return articles
    .filter((article) => article.relevant && daysBetween(article.publishedAt, now) <= entriesWindowDays)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, maxEntries)
    .map((article) => ({
      id: article.id,
      date: toLocalDate(article.publishedAt),
      source: article.source,
      title: article.titlePt,
      summary: article.summaryPt,
      url: article.url,
      gaugeId: article.gaugeId,
      evidence: article.evidence,
      deltaSeconds: computeEntryDeltaSeconds(article, gaugeById.get(article.gaugeId), settings.scoring),
    }));
}
