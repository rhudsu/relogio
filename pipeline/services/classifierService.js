import { truncate } from "../utils/text.js";
import { EVIDENCE_LEVELS } from "./scoreService.js";

const MIN_MAGNITUDE = 1;
const MAX_MAGNITUDE = 5;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const CREDENTIAL_PROBLEM = /api key|default credentials|credential/i;

export class ClassifierError extends Error {
  constructor(message) {
    super(message);
    this.name = "ClassifierError";
  }
}

export function buildSystemPrompt(template, gauges) {
  const gaugeList = gauges.map((gauge) => `- ${gauge.id} (${gauge.name}): ${gauge.description}`).join("\n");
  return template.replace("{{GAUGES}}", gaugeList);
}

export function buildResponseSchema(gaugeIds) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "relevant",
            "gaugeId",
            "direction",
            "magnitude",
            "confidence",
            "evidence",
            "titlePt",
            "summaryPt",
            "rationale",
          ],
          properties: {
            id: { type: "string" },
            relevant: { type: "boolean" },
            gaugeId: { type: "string", enum: [...gaugeIds, "none"] },
            direction: { type: "string", enum: ["closer", "farther", "none"] },
            magnitude: { type: "integer", minimum: 0, maximum: MAX_MAGNITUDE },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            evidence: { type: "string", enum: [...EVIDENCE_LEVELS, "none"] },
            titlePt: { type: "string" },
            summaryPt: { type: "string" },
            rationale: { type: "string" },
          },
        },
      },
    },
  };
}

export function buildUserContent(articles, snippetMaxChars) {
  const payload = articles.map((article) => ({
    id: article.id,
    source: article.source,
    publishedAt: article.publishedAt,
    title: article.title,
    snippet: truncate(article.snippet, snippetMaxChars),
  }));

  return `<articles>\n${JSON.stringify(payload, null, 2)}\n</articles>`;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateClassification(raw, gaugeIds) {
  if (raw?.relevant === false) return { relevant: false };
  if (raw?.relevant !== true) return null;

  const magnitude = Math.round(raw.magnitude);
  const hasValidFields =
    gaugeIds.includes(raw.gaugeId) &&
    (raw.direction === "closer" || raw.direction === "farther") &&
    Number.isFinite(magnitude) &&
    magnitude >= MIN_MAGNITUDE &&
    magnitude <= MAX_MAGNITUDE &&
    Number.isFinite(raw.confidence) &&
    raw.confidence >= 0 &&
    raw.confidence <= 1 &&
    EVIDENCE_LEVELS.includes(raw.evidence) &&
    isNonEmptyString(raw.titlePt) &&
    isNonEmptyString(raw.summaryPt);

  if (!hasValidFields) return null;

  return {
    relevant: true,
    gaugeId: raw.gaugeId,
    direction: raw.direction,
    magnitude,
    confidence: raw.confidence,
    evidence: raw.evidence,
    titlePt: raw.titlePt.trim(),
    summaryPt: raw.summaryPt.trim(),
    rationale: isNonEmptyString(raw.rationale) ? raw.rationale.trim() : "",
  };
}

export function parseBatchResponse(response, batch, gaugeIds) {
  if (response.stopReason === "blocked") {
    throw new ClassifierError("O modelo bloqueou a resposta deste lote (filtro de segurança).");
  }
  if (response.stopReason === "truncated") {
    throw new ClassifierError("A resposta foi cortada pelo limite de tokens; reduza o tamanho do lote.");
  }
  if (!response.text) throw new ClassifierError("A resposta do modelo não trouxe texto.");

  let parsed;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new ClassifierError("A resposta do modelo não é um JSON válido.");
  }

  const batchIds = new Set(batch.map((article) => article.id));
  const results = [];

  for (const raw of parsed.results ?? []) {
    if (!batchIds.has(raw?.id)) continue;

    const classification = validateClassification(raw, gaugeIds);
    if (classification) results.push({ id: raw.id, classification });
  }

  return results;
}

function chunk(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

export function isFatal(error) {
  if (error?.status === HTTP_UNAUTHORIZED || error?.status === HTTP_FORBIDDEN) return true;

  const isBadRequestOrUnknown = error?.status === HTTP_BAD_REQUEST || error?.status === undefined;
  return isBadRequestOrUnknown && CREDENTIAL_PROBLEM.test(error?.message ?? "");
}

export function createClassifier({ provider, settings, gaugeIds, systemPrompt, logger }) {
  const schema = buildResponseSchema(gaugeIds);

  async function classifyBatch(batch) {
    const response = await provider.generateJson({
      system: systemPrompt,
      user: buildUserContent(batch, settings.snippetMaxChars),
      schema,
      maxOutputTokens: settings.maxTokens,
    });

    return {
      results: parseBatchResponse(response, batch, gaugeIds),
      usage: response.usage,
    };
  }

  async function classify(articles) {
    const results = [];
    const errors = [];
    const tokens = { input: 0, output: 0 };
    const batches = chunk(articles, settings.batchSize);

    for (const [index, batch] of batches.entries()) {
      try {
        const outcome = await classifyBatch(batch);

        results.push(...outcome.results);
        tokens.input += outcome.usage?.input ?? 0;
        tokens.output += outcome.usage?.output ?? 0;
        logger.info(`Lote ${index + 1}/${batches.length} classificado.`);
      } catch (error) {
        if (isFatal(error)) throw new ClassifierError(`Credencial recusada pelo Google: ${error.message}`);

        errors.push(error.message);
        logger.warn(`Lote ${index + 1}/${batches.length} falhou: ${error.message}`);
      }
    }

    return { results, errors, failedBatches: errors.length, tokens };
  }

  return { classify };
}
