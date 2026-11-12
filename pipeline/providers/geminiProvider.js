import { retryOnTransientError } from "../utils/retry.js";

const TRUNCATED_REASONS = new Set(["MAX_TOKENS"]);
const COMPLETE_REASONS = new Set(["STOP", "FINISH_REASON_UNSPECIFIED"]);

export function describeStop(response) {
  if (response.promptFeedback?.blockReason) return "blocked";

  const finishReason = response.candidates?.[0]?.finishReason;

  if (!finishReason || COMPLETE_REASONS.has(finishReason)) return "complete";
  if (TRUNCATED_REASONS.has(finishReason)) return "truncated";
  return "blocked";
}

export function normalizeResponse(response) {
  const usage = response.usageMetadata ?? {};

  return {
    text: response.text ?? "",
    stopReason: describeStop(response),
    usage: {
      input: usage.promptTokenCount ?? 0,
      output: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    },
  };
}

export function createGeminiProvider({ client, model, thinkingLevel, retryDelaysMs, sleep, logger }) {
  async function generateJson({ system, user, schema, maxOutputTokens }) {
    const config = {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      maxOutputTokens,
    };

    if (thinkingLevel) config.thinkingConfig = { thinkingLevel };

    const response = await retryOnTransientError(
      () => client.models.generateContent({ model, contents: user, config }),
      {
        delaysMs: retryDelaysMs,
        sleep,
        onRetry: ({ attempt, delayMs, error }) =>
          logger.warn(`Gemini indisponível (HTTP ${error.status}); tentativa ${attempt + 1} em ${delayMs / 1000}s.`),
      },
    );

    return normalizeResponse(response);
  }

  return { generateJson };
}
