import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeEffect } from "../../public/js/models/effectModel.js";
import { filterEntries, limitEntries, parseEntries, sortEntries } from "../../public/js/models/entryModel.js";

const RAW_ENTRIES = [
  { id: "a", date: "2026-10-16", source: "S", title: "A", summary: "a", gaugeId: "x", deltaSeconds: -14 },
  { id: "b", date: "2026-10-22", source: "S", title: "B", summary: "b", gaugeId: "x", deltaSeconds: 18, url: "https://example.com" },
  { id: "c", date: "2026-10-18", source: "S", title: "C", summary: "c", gaugeId: "x", deltaSeconds: 0 },
];

describe("describeEffect", () => {
  it("indica a direção e o tamanho do efeito", () => {
    assert.deepEqual(describeEffect(18), { direction: "closer", seconds: 18 });
    assert.deepEqual(describeEffect(-9), { direction: "farther", seconds: 9 });
    assert.deepEqual(describeEffect(0), { direction: "neutral", seconds: 0 });
  });
});

describe("sortEntries e limitEntries", () => {
  const entries = parseEntries(RAW_ENTRIES);

  it("ordena pelos mais relevantes: maior efeito em segundos primeiro, qualquer direção", () => {
    assert.deepEqual(
      sortEntries(entries, "relevant").map((entry) => entry.id),
      ["b", "a", "c"],
    );
  });

  it("ordena por data quando o critério é recentes e não altera a lista original", () => {
    const shuffled = [entries[2], entries[0], entries[1]];
    assert.deepEqual(sortEntries(shuffled, "recent").map((entry) => entry.id), ["b", "c", "a"]);
    assert.equal(shuffled[0].id, "a");
  });

  it("limita a quantidade visível e informa quantas ficaram ocultas", () => {
    assert.deepEqual(limitEntries(entries, 2).visible.map((entry) => entry.id), ["b", "c"]);
    assert.equal(limitEntries(entries, 2).hiddenCount, 1);
    assert.equal(limitEntries(entries, null).hiddenCount, 0);
    assert.equal(limitEntries(entries, 10).hiddenCount, 0);
  });
});

describe("parseEntries", () => {
  it("ordena da notícia mais recente para a mais antiga", () => {
    const entries = parseEntries(RAW_ENTRIES);

    assert.deepEqual(
      entries.map((entry) => entry.id),
      ["b", "c", "a"],
    );
  });

  it("guarda a qualidade da evidência e usa null nas notícias sem ela", () => {
    const entries = parseEntries([{ ...RAW_ENTRIES[0], evidence: "dado" }, RAW_ENTRIES[1]]);

    assert.equal(entries.find((entry) => entry.id === "a").evidence, "dado");
    assert.equal(entries.find((entry) => entry.id === "b").evidence, null);
  });

  it("usa null quando a notícia não tem link", () => {
    const entries = parseEntries(RAW_ENTRIES);

    assert.equal(entries.find((entry) => entry.id === "a").url, null);
    assert.equal(entries.find((entry) => entry.id === "b").url, "https://example.com");
  });

  it("rejeita dados que não são uma lista", () => {
    assert.throws(() => parseEntries({}), /esperada uma lista/);
  });
});

describe("filterEntries", () => {
  const entries = parseEntries(RAW_ENTRIES);

  it("devolve todas as notícias no filtro all", () => {
    assert.equal(filterEntries(entries, "all").length, 3);
  });

  it("mostra só as que aproximam ou só as que afastam", () => {
    assert.deepEqual(
      filterEntries(entries, "closer").map((entry) => entry.id),
      ["b"],
    );
    assert.deepEqual(
      filterEntries(entries, "farther").map((entry) => entry.id),
      ["a"],
    );
  });
});
