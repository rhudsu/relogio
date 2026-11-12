import { daysBetween } from "../utils/time.js";
import { normalizeTitle } from "../utils/text.js";

const MAX_FUTURE_DAYS = 1;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildKeywordPattern(terms, flags) {
  if (terms.length === 0) return null;

  const alternatives = terms.map(escapeRegExp).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, `u${flags}`);
}

export function createRelevanceFilter({ relevanceKeywords, caseSensitiveKeywords }) {
  const insensitive = buildKeywordPattern(relevanceKeywords, "i");
  const sensitive = buildKeywordPattern(caseSensitiveKeywords, "");

  return (article) => {
    if (article.origin !== "rss") return true;

    const text = `${article.title} ${article.snippet}`;
    return Boolean(insensitive?.test(text) || sensitive?.test(text));
  };
}

export function filterRecent(articles, now, lookbackDays) {
  return articles.filter((article) => {
    const age = daysBetween(article.publishedAt, now);
    return age <= lookbackDays && age >= -MAX_FUTURE_DAYS;
  });
}

export function removeDuplicates(articles, knownIds = new Set(), knownTitles = new Set()) {
  const seenIds = new Set(knownIds);
  const seenTitles = new Set(knownTitles);

  return articles.filter((article) => {
    const title = normalizeTitle(article.title);

    if (seenIds.has(article.id) || seenTitles.has(title)) return false;

    seenIds.add(article.id);
    seenTitles.add(title);
    return true;
  });
}

export function newestFirst(articles) {
  return [...articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
