import { collectGdeltQuery } from "../collectors/gdeltCollector.js";
import { collectRssFeed } from "../collectors/rssCollector.js";

const HTTP_TOO_MANY_REQUESTS = 429;

function describeFailure(error) {
  const cause = error.cause?.code ? ` (${error.cause.code})` : "";
  return `${error.message ?? String(error)}${cause}`;
}

async function collectAllRss(feeds, requestOptions, failures) {
  const results = await Promise.allSettled(feeds.map((feed) => collectRssFeed(feed, requestOptions)));

  return results.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;

    failures.push({ source: feeds[index].id, reason: describeFailure(result.reason) });
    return [];
  });
}

async function collectAllGdelt(queries, requestOptions, { delayMs, sleep, windows }, failures) {
  const articles = [];
  let first = true;

  for (const window of windows) {
    for (const query of queries) {
      if (!first) await sleep(delayMs);
      first = false;

      try {
        articles.push(...(await collectGdeltQuery(query, { ...requestOptions, ...window })));
      } catch (error) {
        const label = window.start ? `gdelt:${query.id}@${window.start.slice(0, 10)}` : `gdelt:${query.id}`;
        failures.push({ source: label, reason: describeFailure(error) });
        if (error.status === HTTP_TOO_MANY_REQUESTS) return articles;
      }
    }
  }

  return articles;
}

export async function collectArticles({ sources, settings, fetchFn, sleep }) {
  const failures = [];
  const { requestTimeoutMs, userAgent, gdeltDelayMs, gdeltMaxRecords, gdeltTimespan, gdeltWindows } = settings.collection;
  const requestOptions = { fetchFn, timeoutMs: requestTimeoutMs, userAgent };

  const rssArticles = await collectAllRss(sources.rss, requestOptions, failures);
  const gdeltArticles = await collectAllGdelt(
    sources.gdelt,
    { ...requestOptions, maxRecords: gdeltMaxRecords, timespan: gdeltTimespan },
    { delayMs: gdeltDelayMs, sleep, windows: gdeltWindows ?? [{}] },
    failures,
  );

  return {
    articles: [...rssArticles, ...gdeltArticles],
    failures,
    sourceCount: sources.rss.length + sources.gdelt.length * (gdeltWindows?.length ?? 1),
  };
}
