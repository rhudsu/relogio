import { daysBetween } from "../utils/time.js";

export function createLedgerEntry(article, classification, classifiedAt) {
  const base = {
    id: article.id,
    url: article.url,
    source: article.source,
    publishedAt: article.publishedAt,
    title: article.title,
    classifiedAt: new Date(classifiedAt).toISOString(),
    relevant: classification.relevant,
  };

  if (!classification.relevant) return base;

  return {
    ...base,
    gaugeId: classification.gaugeId,
    direction: classification.direction,
    magnitude: classification.magnitude,
    confidence: classification.confidence,
    evidence: classification.evidence,
    titlePt: classification.titlePt,
    summaryPt: classification.summaryPt,
    rationale: classification.rationale,
  };
}

export function toArticle(entry) {
  return {
    id: entry.id,
    url: entry.url,
    source: entry.source,
    publishedAt: entry.publishedAt,
    title: entry.title,
    snippet: entry.summaryPt ?? "",
    origin: "ledger",
  };
}

export function findOutdatedEntries(entries, gaugeIds, evidenceLevels) {
  return entries.filter(
    (entry) => entry.relevant && (!gaugeIds.includes(entry.gaugeId) || !evidenceLevels.includes(entry.evidence)),
  );
}

export function pruneLedger(entries, now, retentionDays) {
  return entries.filter((entry) => daysBetween(entry.publishedAt, now) <= retentionDays);
}

export function mergeLedger(existing, additions, now, retentionDays) {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  additions.forEach((entry) => byId.set(entry.id, entry));

  return pruneLedger([...byId.values()], now, retentionDays).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
}
