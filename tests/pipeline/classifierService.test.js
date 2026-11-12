import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildResponseSchema,
  buildSystemPrompt,
  buildUserContent,
  createClassifier,
  isFatal,
  parseBatchResponse,
  validateClassification,
} from "../../pipeline/services/classifierService.js";
import { GAUGES, SETTINGS_FOR_TESTS, makeArticle, silentLogger } from "./helpers.js";

const GAUGE_IDS = GAUGES.map((gauge) => gauge.id);

const VALID = {
  id: "id-1",
  relevant: true,
  gaugeId: "capex",
  direction: "closer",
  magnitude: 3,
  confidence: 0.8,
  evidence: "dado",
  titlePt: "Título",
  summaryPt: "Resumo.",
  rationale: "Motivo.",
};

const IRRELEVANT = {
  id: "id-2",
  relevant: false,
  gaugeId: "none",
  direction: "none",
  magnitude: 0,
  confidence: 0,
  evidence: "none",
  titlePt: "",
  summaryPt: "",
  rationale: "",
};

function modelResponse(results, overrides = {}) {
  return {
    text: JSON.stringify({ results }),
    stopReason: "complete",
    usage: { input: 0, output: 0 },
    ...overrides,
  };
}

function fakeProvider(handler) {
  const calls = [];
  return {
    calls,
    generateJson: async (request) => {
      calls.push(request);
      return handler(request, calls.length);
    },
  };
}

const BATCH = [makeArticle({ id: "id-1" }), makeArticle({ id: "id-2", title: "Outra" })];

describe("prompt e esquema", () => {
  it("insere a lista de termômetros no prompt", () => {
    const prompt = buildSystemPrompt("Antes\n{{GAUGES}}\nDepois", GAUGES);

    assert.match(prompt, /- capex \(Investimento contra receita\): d1/);
    assert.match(prompt, /- demand \(Demanda real e adoção\): d2/);
  });

  it("limita gaugeId aos termômetros conhecidos mais none e fixa as faixas numéricas", () => {
    const schema = buildResponseSchema(GAUGE_IDS);
    const item = schema.properties.results.items;

    assert.deepEqual(item.properties.gaugeId.enum, ["capex", "demand", "none"]);
    assert.deepEqual(item.properties.magnitude, { type: "integer", minimum: 0, maximum: 5 });
    assert.deepEqual(item.properties.confidence, { type: "number", minimum: 0, maximum: 1 });
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(item.required.sort(), Object.keys(item.properties).sort());
  });

  it("envia as notícias como JSON dentro de <articles>, com o trecho cortado", () => {
    const content = buildUserContent([makeArticle({ snippet: "x".repeat(50) })], 10);
    const json = JSON.parse(content.replace("<articles>", "").replace("</articles>", ""));

    assert.match(content, /^<articles>/);
    assert.equal(json[0].snippet.length, 10);
  });
});

describe("validateClassification", () => {
  it("aceita uma classificação completa", () => {
    assert.equal(validateClassification(VALID, GAUGE_IDS).gaugeId, "capex");
  });

  it("aceita irrelevante sem exigir os outros campos", () => {
    assert.deepEqual(validateClassification(IRRELEVANT, GAUGE_IDS), { relevant: false });
  });

  it("rejeita termômetro desconhecido, direção inválida, magnitude e confiança fora da faixa", () => {
    assert.equal(validateClassification({ ...VALID, gaugeId: "outro" }, GAUGE_IDS), null);
    assert.equal(validateClassification({ ...VALID, direction: "none" }, GAUGE_IDS), null);
    assert.equal(validateClassification({ ...VALID, magnitude: 9 }, GAUGE_IDS), null);
    assert.equal(validateClassification({ ...VALID, magnitude: 0 }, GAUGE_IDS), null);
    assert.equal(validateClassification({ ...VALID, confidence: 1.5 }, GAUGE_IDS), null);
  });

  it("exige a qualidade da evidência: dado, reportagem ou opinião", () => {
    assert.equal(validateClassification({ ...VALID, evidence: "reportagem" }, GAUGE_IDS).evidence, "reportagem");
    assert.equal(validateClassification({ ...VALID, evidence: "opiniao" }, GAUGE_IDS).evidence, "opiniao");
    assert.equal(validateClassification({ ...VALID, evidence: "boato" }, GAUGE_IDS), null);
    assert.equal(validateClassification({ ...VALID, evidence: undefined }, GAUGE_IDS), null);
    assert.equal(validateClassification({ ...VALID, evidence: "none" }, GAUGE_IDS), null);
  });

  it("rejeita relevante sem título ou resumo em português", () => {
    assert.equal(validateClassification({ ...VALID, titlePt: " " }, GAUGE_IDS), null);
    assert.equal(validateClassification({ ...VALID, summaryPt: "" }, GAUGE_IDS), null);
  });

  it("rejeita lixo", () => {
    assert.equal(validateClassification(null, GAUGE_IDS), null);
    assert.equal(validateClassification({ relevant: "sim" }, GAUGE_IDS), null);
  });
});

describe("parseBatchResponse", () => {
  it("devolve só resultados válidos de ids que estavam no lote", () => {
    const response = modelResponse([VALID, IRRELEVANT, { ...VALID, id: "fora-do-lote" }, { ...VALID, id: "id-2", magnitude: 99 }]);
    const results = parseBatchResponse(response, BATCH, GAUGE_IDS);

    assert.deepEqual(
      results.map((result) => result.id),
      ["id-1", "id-2"],
    );
  });

  it("falha com mensagem clara em bloqueio, corte, texto ausente e JSON inválido", () => {
    assert.throws(() => parseBatchResponse(modelResponse([], { stopReason: "blocked", text: "" }), BATCH, GAUGE_IDS), /bloqueou/);
    assert.throws(() => parseBatchResponse(modelResponse([], { stopReason: "truncated" }), BATCH, GAUGE_IDS), /limite de tokens/);
    assert.throws(() => parseBatchResponse(modelResponse([], { text: "" }), BATCH, GAUGE_IDS), /não trouxe texto/);
    assert.throws(() => parseBatchResponse(modelResponse([], { text: "oi" }), BATCH, GAUGE_IDS), /JSON válido/);
  });
});

describe("isFatal", () => {
  it("trata credencial recusada como fatal, em qualquer formato de erro do Google", () => {
    assert.equal(isFatal({ status: 401, message: "x" }), true);
    assert.equal(isFatal({ status: 403, message: "x" }), true);
    assert.equal(isFatal({ status: 400, message: "API key not valid. Please pass a valid API key." }), true);
    assert.equal(isFatal(new Error("Could not load the default credentials.")), true);
  });

  it("não trata erros comuns como fatais", () => {
    assert.equal(isFatal({ status: 429, message: "quota" }), false);
    assert.equal(isFatal({ status: 400, message: "schema inválido" }), false);
    assert.equal(isFatal(new Error("API instável")), false);
  });
});

describe("createClassifier", () => {
  const settings = { ...SETTINGS_FOR_TESTS.classifier, batchSize: 1 };

  function build(provider) {
    return createClassifier({ provider, settings, gaugeIds: GAUGE_IDS, systemPrompt: "SISTEMA", logger: silentLogger });
  }

  it("envia prompt de sistema, notícias, esquema e limite de saída ao provedor", async () => {
    const provider = fakeProvider(() => modelResponse([VALID]));

    await build(provider).classify([makeArticle({ id: "id-1" })]);

    const [request] = provider.calls;
    assert.equal(request.system, "SISTEMA");
    assert.match(request.user, /^<articles>/);
    assert.match(request.user, /"id": "id-1"/);
    assert.equal(request.maxOutputTokens, 16000);
    assert.deepEqual(request.schema.required, ["results"]);
  });

  it("divide em lotes e segue em frente quando um lote falha", async () => {
    const provider = fakeProvider((_, call) => {
      if (call === 1) throw new Error("API instável");
      return modelResponse([{ ...VALID, id: "id-2" }]);
    });

    const outcome = await build(provider).classify(BATCH);

    assert.equal(provider.calls.length, 2);
    assert.deepEqual(outcome.results.map((result) => result.id), ["id-2"]);
    assert.equal(outcome.failedBatches, 1);
    assert.deepEqual(outcome.errors, ["API instável"]);
  });

  it("soma os tokens de entrada e saída de todos os lotes", async () => {
    const provider = fakeProvider(() => modelResponse([VALID], { usage: { input: 1000, output: 300 } }));

    const outcome = await build(provider).classify(BATCH);

    assert.deepEqual(outcome.tokens, { input: 2000, output: 600 });
  });

  it("interrompe tudo quando a credencial é recusada", async () => {
    const provider = fakeProvider(() => {
      throw Object.assign(new Error("API key not valid"), { status: 400 });
    });

    await assert.rejects(build(provider).classify(BATCH), /Credencial recusada/);
    assert.equal(provider.calls.length, 1);
  });
});
