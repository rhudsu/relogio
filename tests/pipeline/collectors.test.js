import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGdeltUrl,
  collectGdeltQuery,
  parseGdeltResponse,
  parseSeenDate,
} from "../../pipeline/collectors/gdeltCollector.js";
import { collectRssFeed, parseFeed } from "../../pipeline/collectors/rssCollector.js";
import { canonicalizeUrl, createArticle } from "../../pipeline/services/articleService.js";

const RSS_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[Nvidia &amp; the AI boom]]></title>
    <link>https://example.com/nvidia?utm_source=rss</link>
    <description><![CDATA[<p>Chip maker <b>earnings</b> beat estimates.</p>]]></description>
    <pubDate>Fri, 23 Oct 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Item sem data</title>
    <link>https://example.com/sem-data</link>
  </item>
</channel></rss>`;

const ATOM_XML = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Entrada Atom</title>
    <link rel="alternate" href="https://example.com/atom"/>
    <summary>Resumo da entrada</summary>
    <updated>2026-10-22T10:00:00Z</updated>
  </entry>
</feed>`;

function xmlResponse(body) {
  return new Response(body, { status: 200, headers: { "content-type": "application/xml; charset=utf-8" } });
}

const REQUEST_OPTIONS = { timeoutMs: 1000, userAgent: "teste" };

describe("parseFeed", () => {
  it("lê itens de RSS 2.0", () => {
    const items = parseFeed(RSS_XML);

    assert.equal(items.length, 2);
    assert.equal(items[0].url, "https://example.com/nvidia?utm_source=rss");
    assert.equal(items[0].publishedAt, "Fri, 23 Oct 2026 08:00:00 GMT");
  });

  it("lê entradas de Atom", () => {
    const [entry] = parseFeed(ATOM_XML);

    assert.equal(entry.url, "https://example.com/atom");
    assert.equal(entry.title, "Entrada Atom");
    assert.equal(entry.publishedAt, "2026-10-22T10:00:00Z");
  });
});

describe("collectRssFeed", () => {
  it("cria artigos limpos e descarta itens sem data", async () => {
    const fetchFn = async () => xmlResponse(RSS_XML);
    const articles = await collectRssFeed({ name: "Fonte RSS", url: "https://feed.test/rss" }, { fetchFn, ...REQUEST_OPTIONS });

    assert.equal(articles.length, 1);
    assert.equal(articles[0].title, "Nvidia & the AI boom");
    assert.equal(articles[0].snippet, "Chip maker earnings beat estimates.");
    assert.equal(articles[0].url, "https://example.com/nvidia");
    assert.equal(articles[0].origin, "rss");
    assert.equal(articles[0].source, "Fonte RSS");
  });

  it("propaga erro HTTP com o status", async () => {
    const fetchFn = async () => new Response("erro", { status: 503 });

    await assert.rejects(
      collectRssFeed({ name: "x", url: "https://feed.test/rss" }, { fetchFn, ...REQUEST_OPTIONS }),
      (error) => error.status === 503,
    );
  });
});

describe("GDELT", () => {
  it("converte a data de visualização para ISO", () => {
    assert.equal(parseSeenDate("20261022T143000Z"), "2026-10-22T14:30:00Z");
    assert.equal(parseSeenDate("lixo"), null);
  });

  it("monta a URL com a consulta e os parâmetros", () => {
    const url = new URL(buildGdeltUrl('"AI bubble" sourcelang:english', { maxRecords: 50, timespan: "14d" }));

    assert.equal(url.searchParams.get("query"), '"AI bubble" sourcelang:english');
    assert.equal(url.searchParams.get("mode"), "artlist");
    assert.equal(url.searchParams.get("maxrecords"), "50");
    assert.equal(url.searchParams.get("timespan"), "14d");
  });

  it("explica quando a resposta não é JSON", () => {
    assert.throws(() => parseGdeltResponse("Please limit requests"), /não é JSON.*Please limit/);
  });

  it("transforma a resposta em artigos", async () => {
    const body = JSON.stringify({
      articles: [
        { url: "https://news.test/a", title: "AI bubble fears grow", seendate: "20261022T143000Z", domain: "news.test" },
        { url: "https://news.test/b", title: "Sem data", seendate: "", domain: "news.test" },
      ],
    });
    const fetchFn = async () => new Response(body, { status: 200 });
    const articles = await collectGdeltQuery(
      { id: "q", query: "x" },
      { fetchFn, maxRecords: 5, timespan: "7d", ...REQUEST_OPTIONS },
    );

    assert.equal(articles.length, 1);
    assert.equal(articles[0].origin, "gdelt");
    assert.equal(articles[0].source, "news.test");
    assert.equal(articles[0].publishedAt, "2026-10-22T14:30:00.000Z");
  });
});

describe("articleService", () => {
  it("remove parâmetros de rastreio, âncora e barra final", () => {
    assert.equal(
      canonicalizeUrl("https://Example.com/materia/?utm_source=x&id=7&fbclid=abc#topo"),
      "https://example.com/materia?id=7",
    );
  });

  it("gera o mesmo id para a mesma matéria com rastreio diferente", () => {
    const base = { title: "T", publishedAt: "2026-10-22T10:00:00Z", source: "S", origin: "rss" };
    const a = createArticle({ ...base, url: "https://example.com/x?utm_source=a" });
    const b = createArticle({ ...base, url: "https://example.com/x?utm_source=b" });

    assert.equal(a.id, b.id);
  });

  it("devolve null para artigos inválidos", () => {
    assert.equal(createArticle({ url: "", title: "T", publishedAt: "2026-10-22", source: "S" }), null);
    assert.equal(createArticle({ url: "não é url", title: "T", publishedAt: "2026-10-22", source: "S" }), null);
    assert.equal(createArticle({ url: "https://a.test/x", title: "T", publishedAt: "data ruim", source: "S" }), null);
  });
});
