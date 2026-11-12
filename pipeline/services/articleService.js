import { createHash } from "node:crypto";

import { stripHtml } from "../utils/text.js";

const TRACKING_PARAMETERS = /^(utm_|fbclid|gclid|mc_|ref$|cmpid|taid)/i;
const ID_LENGTH = 12;

export function canonicalizeUrl(rawUrl) {
  const url = new URL(rawUrl);

  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  [...url.searchParams.keys()]
    .filter((name) => TRACKING_PARAMETERS.test(name))
    .forEach((name) => url.searchParams.delete(name));

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function createArticleId(canonicalUrl) {
  return createHash("sha1").update(canonicalUrl).digest("hex").slice(0, ID_LENGTH);
}

export function createArticle({ url, title, snippet = "", publishedAt, source, origin }) {
  const cleanTitle = stripHtml(title);
  const parsedDate = new Date(publishedAt || NaN);

  if (!url || !cleanTitle || Number.isNaN(parsedDate.getTime())) return null;

  let canonicalUrl;
  try {
    canonicalUrl = canonicalizeUrl(url);
  } catch {
    return null;
  }

  return {
    id: createArticleId(canonicalUrl),
    url: canonicalUrl,
    title: cleanTitle,
    snippet: stripHtml(snippet),
    publishedAt: parsedDate.toISOString(),
    source,
    origin,
  };
}
