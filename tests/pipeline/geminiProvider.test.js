import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGeminiClient, describeAuth, resolveGeminiAuth } from "../../pipeline/providers/geminiClient.js";
import { createGeminiProvider, describeStop, normalizeResponse } from "../../pipeline/providers/geminiProvider.js";
import { isTransientError, retryOnTransientError } from "../../pipeline/utils/retry.js";
import { silentLogger } from "./helpers.js";

function geminiResponse({ text = "{}", finishReason = "STOP", blockReason, usage } = {}) {
  return {
    text,
    candidates: finishReason ? [{ finishReason }] : [],
    promptFeedback: blockReason ? { blockReason } : undefined,
    usageMetadata: usage,
  };
}

function fakeClient(handler) {
  const calls = [];
  return {
    calls,
    models: {
      generateContent: async (request) => {
        calls.push(request);
        return handler(request, calls.length);
      },
    },
  };
}

const PROVIDER_OPTIONS = {
  model: "gemini-3.5-flash-lite",
  thinkingLevel: "LOW",
  retryDelaysMs: [1, 1],
  sleep: async () => {},
  logger: silentLogger,
};

describe("describeStop", () => {
  it("separa conclusão normal, corte por tamanho e bloqueios", () => {
    assert.equal(describeStop(geminiResponse({ finishReason: "STOP" })), "complete");
    assert.equal(describeStop(geminiResponse({ finishReason: undefined })), "complete");
    assert.equal(describeStop(geminiResponse({ finishReason: "MAX_TOKENS" })), "truncated");
    assert.equal(describeStop(geminiResponse({ finishReason: "SAFETY" })), "blocked");
    assert.equal(describeStop(geminiResponse({ finishReason: "PROHIBITED_CONTENT" })), "blocked");
    assert.equal(describeStop(geminiResponse({ finishReason: "RECITATION" })), "blocked");
  });

  it("trata bloqueio do pedido inteiro como bloqueado", () => {
    assert.equal(describeStop(geminiResponse({ finishReason: undefined, blockReason: "SAFETY" })), "blocked");
  });
});

describe("normalizeResponse", () => {
  it("soma o raciocínio do modelo à saída e usa zero quando faltam dados", () => {
    const usage = { promptTokenCount: 900, candidatesTokenCount: 200, thoughtsTokenCount: 50 };

    assert.deepEqual(normalizeResponse(geminiResponse({ usage })).usage, { input: 900, output: 250 });
    assert.deepEqual(normalizeResponse(geminiResponse()).usage, { input: 0, output: 0 });
  });

  it("devolve texto vazio quando não há texto", () => {
    assert.equal(normalizeResponse({ candidates: [] }).text, "");
  });
});

describe("createGeminiProvider", () => {
  it("pede JSON com esquema, instrução de sistema, limite de saída e raciocínio baixo", async () => {
    const client = fakeClient(() => geminiResponse({ text: '{"results":[]}' }));
    const provider = createGeminiProvider({ client, ...PROVIDER_OPTIONS });
    const schema = { type: "object" };

    const response = await provider.generateJson({ system: "SISTEMA", user: "NOTÍCIAS", schema, maxOutputTokens: 1234 });

    const [request] = client.calls;
    assert.equal(request.model, "gemini-3.5-flash-lite");
    assert.equal(request.contents, "NOTÍCIAS");
    assert.equal(request.config.systemInstruction, "SISTEMA");
    assert.equal(request.config.responseMimeType, "application/json");
    assert.equal(request.config.responseJsonSchema, schema);
    assert.equal(request.config.maxOutputTokens, 1234);
    assert.deepEqual(request.config.thinkingConfig, { thinkingLevel: "LOW" });
    assert.equal(request.config.temperature, undefined);
    assert.equal(response.text, '{"results":[]}');
  });

  it("não envia configuração de raciocínio quando o nível não é definido", async () => {
    const client = fakeClient(() => geminiResponse());
    const provider = createGeminiProvider({ client, ...PROVIDER_OPTIONS, thinkingLevel: null });

    await provider.generateJson({ system: "s", user: "u", schema: {}, maxOutputTokens: 10 });

    assert.equal(client.calls[0].config.thinkingConfig, undefined);
  });

  it("tenta de novo em erro temporário e devolve o resultado", async () => {
    const client = fakeClient((_, call) => {
      if (call < 3) throw Object.assign(new Error("quota"), { status: 429 });
      return geminiResponse({ text: "ok" });
    });
    const provider = createGeminiProvider({ client, ...PROVIDER_OPTIONS });

    const response = await provider.generateJson({ system: "s", user: "u", schema: {}, maxOutputTokens: 10 });

    assert.equal(client.calls.length, 3);
    assert.equal(response.text, "ok");
  });

  it("não repete erro permanente", async () => {
    const client = fakeClient(() => {
      throw Object.assign(new Error("pedido inválido"), { status: 400 });
    });
    const provider = createGeminiProvider({ client, ...PROVIDER_OPTIONS });

    await assert.rejects(provider.generateJson({ system: "s", user: "u", schema: {}, maxOutputTokens: 10 }), /pedido inválido/);
    assert.equal(client.calls.length, 1);
  });
});

describe("retryOnTransientError", () => {
  it("desiste depois de esgotar as tentativas e mostra o último erro", async () => {
    let calls = 0;
    const waits = [];
    const operation = async () => {
      calls += 1;
      throw Object.assign(new Error(`falha ${calls}`), { status: 503 });
    };

    await assert.rejects(
      retryOnTransientError(operation, { delaysMs: [5, 10], sleep: async (ms) => waits.push(ms) }),
      /falha 3/,
    );
    assert.equal(calls, 3);
    assert.deepEqual(waits, [5, 10]);
  });

  it("reconhece só os status temporários", () => {
    [429, 500, 502, 503, 504].forEach((status) => assert.equal(isTransientError({ status }), true));
    [400, 401, 403, 404, undefined].forEach((status) => assert.equal(isTransientError({ status }), false));
  });
});

describe("resolveGeminiAuth", () => {
  it("prefere a chave de API quando existe", () => {
    assert.deepEqual(resolveGeminiAuth({ GEMINI_API_KEY: "k", GOOGLE_CLOUD_PROJECT: "p" }), { mode: "apiKey", apiKey: "k" });
    assert.deepEqual(resolveGeminiAuth({ GOOGLE_API_KEY: "g" }), { mode: "apiKey", apiKey: "g" });
  });

  it("usa o login do gcloud quando só há projeto, com região padrão global", () => {
    assert.deepEqual(resolveGeminiAuth({ GOOGLE_CLOUD_PROJECT: "meu-projeto" }), {
      mode: "vertex",
      project: "meu-projeto",
      location: "global",
    });
    assert.equal(resolveGeminiAuth({ GOOGLE_CLOUD_PROJECT: "p", GOOGLE_CLOUD_LOCATION: "us-central1" }).location, "us-central1");
  });

  it("recusa um valor que é um link ou comando em vez de uma chave", () => {
    assert.throws(() => resolveGeminiAuth({ GEMINI_API_KEY: "https://storage.googleapis.com/x/setup_adc.sh)" }), /parece um link/);
    assert.throws(() => resolveGeminiAuth({ GEMINI_API_KEY: "bash <(curl -sSL x)" }), /parece um link ou um comando/);
  });

  it("ignora espaços nas pontas da chave e campo vazio cai para o login do gcloud", () => {
    assert.equal(resolveGeminiAuth({ GEMINI_API_KEY: "  AIzaabc  " }).apiKey, "AIzaabc");
    assert.equal(resolveGeminiAuth({ GEMINI_API_KEY: "", GOOGLE_CLOUD_PROJECT: "p" }).mode, "vertex");
  });

  it("explica o que definir quando não há credencial nenhuma", () => {
    assert.throws(() => resolveGeminiAuth({}), /GEMINI_API_KEY.*GOOGLE_CLOUD_PROJECT/s);
  });

  it("descreve a forma de autenticação sem mostrar a chave", () => {
    assert.equal(describeAuth({ mode: "apiKey", apiKey: "segredo" }), "chave de API do Gemini");
    assert.match(describeAuth({ mode: "vertex", project: "p", location: "global" }), /login do gcloud \(projeto p/);
  });

  it("cria os clientes dos dois modos sem rede", () => {
    assert.ok(createGeminiClient({ mode: "apiKey", apiKey: "chave-falsa" }).models);
  });
});
