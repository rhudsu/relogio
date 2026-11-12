import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createRelevanceFilter,
  filterRecent,
  newestFirst,
  removeDuplicates,
} from "../../pipeline/services/filterService.js";
import { NOW, makeArticle } from "./helpers.js";

const KEYWORDS = {
  relevanceKeywords: ["openai", "data center", "inteligência artificial"],
  caseSensitiveKeywords: ["AI"],
};

describe("createRelevanceFilter", () => {
  const isRelevant = createRelevanceFilter(KEYWORDS);

  it("aceita termos de IA no título ou no trecho, sem diferenciar caixa", () => {
    assert.equal(isRelevant(makeArticle({ title: "OPENAI sobe valuation" })), true);
    assert.equal(isRelevant(makeArticle({ title: "Notícia", snippet: "novo Data Center em Minas" })), true);
    assert.equal(isRelevant(makeArticle({ title: "Inteligência Artificial no varejo" })), true);
  });

  it("diferencia AI de palavras comuns que contêm as mesmas letras", () => {
    assert.equal(isRelevant(makeArticle({ title: "Rain forecast for the weekend" })), false);
    assert.equal(isRelevant(makeArticle({ title: "Said the minister" })), false);
    assert.equal(isRelevant(makeArticle({ title: "The AI boom continues" })), true);
    assert.equal(isRelevant(makeArticle({ title: "ai no kioku" })), false);
  });

  it("não filtra artigos do GDELT, que já vêm de consultas temáticas", () => {
    assert.equal(isRelevant(makeArticle({ origin: "gdelt", title: "Qualquer título" })), true);
  });
});

describe("filterRecent", () => {
  it("mantém só o que está dentro do período e descarta datas muito futuras", () => {
    const articles = [
      makeArticle({ id: "novo", publishedAt: "2026-10-22T09:00:00Z" }),
      makeArticle({ id: "velho", publishedAt: "2026-08-01T09:00:00Z" }),
      makeArticle({ id: "futuro", publishedAt: "2026-12-01T09:00:00Z" }),
    ];

    assert.deepEqual(
      filterRecent(articles, NOW, 30).map((article) => article.id),
      ["novo"],
    );
  });
});

describe("removeDuplicates", () => {
  it("remove repetidos por id e por título parecido, mantendo o primeiro", () => {
    const articles = [
      makeArticle({ id: "1", title: "OpenAI levanta US$ 10 bi" }),
      makeArticle({ id: "1", title: "Outro título, mesmo id" }),
      makeArticle({ id: "2", title: "openai levanta us 10 bi!" }),
      makeArticle({ id: "3", title: "Título diferente" }),
    ];

    assert.deepEqual(
      removeDuplicates(articles).map((article) => article.id),
      ["1", "3"],
    );
  });

  it("ignora o que já está no ledger", () => {
    const articles = [makeArticle({ id: "visto" }), makeArticle({ id: "novo", title: "Outra notícia" })];

    assert.deepEqual(
      removeDuplicates(articles, new Set(["visto"])).map((article) => article.id),
      ["novo"],
    );
  });
});

describe("newestFirst", () => {
  it("ordena da mais recente para a mais antiga sem alterar a lista original", () => {
    const articles = [
      makeArticle({ id: "a", publishedAt: "2026-10-20T00:00:00Z" }),
      makeArticle({ id: "b", publishedAt: "2026-10-22T00:00:00Z" }),
    ];

    assert.deepEqual(
      newestFirst(articles).map((article) => article.id),
      ["b", "a"],
    );
    assert.equal(articles[0].id, "a");
  });
});
