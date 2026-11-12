import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeBody } from "../../pipeline/utils/http.js";
import { normalizeTitle, stripHtml, truncate } from "../../pipeline/utils/text.js";
import { toLocalDate } from "../../pipeline/utils/time.js";

describe("stripHtml", () => {
  it("remove tags e decodifica entidades nomeadas e numéricas", () => {
    assert.equal(stripHtml("<p>Lucro &amp; receita&nbsp;sobem</p>"), "Lucro & receita sobem");
    assert.equal(stripHtml("Things didn&#x2019;t work out"), "Things didn’t work out");
    assert.equal(stripHtml("It&#8217;s here"), "It’s here");
  });

  it("aceita valores vazios", () => {
    assert.equal(stripHtml(undefined), "");
  });
});

describe("truncate", () => {
  it("corta textos longos com reticências e mantém os curtos", () => {
    assert.equal(truncate("abcdef", 10), "abcdef");
    assert.equal(truncate("abcdefghij", 5), "abcd…");
  });
});

describe("normalizeTitle", () => {
  it("ignora caixa, acentos e pontuação", () => {
    assert.equal(normalizeTitle("  OpenAI: Investimento, em IA!  "), "openai investimento em ia");
  });
});

describe("decodeBody", () => {
  it("usa o charset do cabeçalho", () => {
    const latin1 = Uint8Array.from([0x74, 0x72, 0x69, 0x6c, 0x68, 0xf5, 0x65, 0x73]);
    assert.equal(decodeBody(latin1, "text/xml; charset=ISO-8859-1"), "trilhões");
  });

  it("usa o encoding declarado no XML quando o cabeçalho não diz", () => {
    const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><t>a\xe7\xe3o</t>';
    const bytes = Uint8Array.from(xml, (char) => char.charCodeAt(0));
    assert.equal(decodeBody(bytes, "text/xml"), '<?xml version="1.0" encoding="ISO-8859-1"?><t>ação</t>');
  });

  it("cai para UTF-8 por padrão", () => {
    assert.equal(decodeBody(new TextEncoder().encode("ação"), null), "ação");
  });
});

describe("toLocalDate", () => {
  it("usa a data de Brasília, não a de Greenwich", () => {
    assert.equal(toLocalDate("2026-10-23T02:00:00Z"), "2026-10-22");
    assert.equal(toLocalDate("2026-10-23T12:00:00Z"), "2026-10-23");
  });
});
