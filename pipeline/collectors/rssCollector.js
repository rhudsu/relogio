import { XMLParser } from "fast-xml-parser";

import { createArticle } from "../services/articleService.js";
import { fetchText } from "../utils/http.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "object") return textOf(node["#text"]);
  return String(node);
}

function linkOf(item) {
  for (const link of asArray(item.link)) {
    if (typeof link === "string") return link;
    if (link["@_href"] && (!link["@_rel"] || link["@_rel"] === "alternate")) return link["@_href"];
  }
  return textOf(item.guid);
}

function listItems(document) {
  return (
    asArray(document.rss?.channel?.item).length > 0
      ? asArray(document.rss.channel.item)
      : asArray(document.feed?.entry ?? document["rdf:RDF"]?.item)
  );
}

export function parseFeed(xml) {
  return listItems(parser.parse(xml)).map((item) => ({
    url: linkOf(item),
    title: textOf(item.title),
    snippet: textOf(item.description ?? item.summary ?? item["content:encoded"] ?? item.content),
    publishedAt: textOf(item.pubDate ?? item.published ?? item.updated ?? item["dc:date"]),
  }));
}

export async function collectRssFeed(feed, { fetchFn, timeoutMs, userAgent }) {
  const xml = await fetchText(feed.url, { fetchFn, timeoutMs, userAgent });

  return parseFeed(xml)
    .map((item) => createArticle({ ...item, source: feed.name, origin: "rss" }))
    .filter(Boolean);
}
