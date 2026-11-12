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

async function collectAllGdelt(queries, requestOptions, { delayMs, sleep }, failures) {
  const articles = [];

  for (const [index, query] of queries.entries()) {
    if (index > 0) await sleep(delayMs);

    try {
      articles.push(...(await collectGdeltQuery(query, requestOptions)));
    } catch (error) {
      failures.push({ source: `gdelt:${query.id}`, reason: describeFailure(error) });
      if (error.status === HTTP_TOO_MANY_REQUESTS) break;
    }
  }

  return articles;
}

export async function collectArticles({ sources, settings, fetchFn, sleep }) {
  const failures = [];
  const { requestTimeoutMs, userAgent, gdeltDelayMs, gdeltMaxRecords, gdeltTimespan } = settings.collection;
  const requestOptions = { fetchFn, timeoutMs: requestTimeoutMs, userAgent };

  const rssArticles = await collectAllRss(sources.rss, requestOptions, failures);
  const gdeltArticles = await collectAllGdelt(
    sources.gdelt,
    { ...requestOptions, maxRecords: gdeltMaxRecords, timespan: gdeltTimespan },
    { delayMs: gdeltDelayMs, sleep },
    failures,
  );

  return {
    articles: [...rssArticles, ...gdeltArticles],
    failures,
    sourceCount: sources.rss.length + sources.gdelt.length,
  };
}
