import { createArticle } from "../services/articleService.js";
import { fetchText } from "../utils/http.js";

const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const SEEN_DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;
const ERROR_PREVIEW_CHARS = 120;

export function buildGdeltUrl(query, { maxRecords, timespan }) {
  const url = new URL(GDELT_ENDPOINT);

  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(maxRecords));
  url.searchParams.set("timespan", timespan);
  url.searchParams.set("sort", "datedesc");

  return url.toString();
}

export function parseSeenDate(seenDate) {
  const match = SEEN_DATE_PATTERN.exec(seenDate ?? "");
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

export function parseGdeltResponse(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`O GDELT respondeu algo que não é JSON: ${text.slice(0, ERROR_PREVIEW_CHARS)}`);
  }

  return (data.articles ?? []).map((item) => ({
    url: item.url,
    title: item.title,
    publishedAt: parseSeenDate(item.seendate),
    source: item.domain,
  }));
}

export async function collectGdeltQuery(query, { fetchFn, timeoutMs, userAgent, maxRecords, timespan }) {
  const text = await fetchText(buildGdeltUrl(query.query, { maxRecords, timespan }), {
    fetchFn,
    timeoutMs,
    userAgent,
  });

  return parseGdeltResponse(text)
    .map((item) => createArticle({ ...item, origin: "gdelt" }))
    .filter(Boolean);
}
