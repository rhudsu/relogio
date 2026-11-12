import { GoogleGenAI } from "@google/genai";

const DEFAULT_VERTEX_LOCATION = "global";

function assertLooksLikeApiKey(apiKey) {
  if (/^https?:/i.test(apiKey) || /\s/.test(apiKey)) {
    throw new Error(
      "O valor de GEMINI_API_KEY parece um link ou um comando, não uma chave de API. " +
        "Cole a chave do AI Studio (começa com AIza) ou deixe o campo vazio e use GOOGLE_CLOUD_PROJECT com o login do gcloud.",
    );
  }
}

export function resolveGeminiAuth(env) {
  const apiKey = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY || "").trim();

  if (apiKey) {
    assertLooksLikeApiKey(apiKey);
    return { mode: "apiKey", apiKey };
  }

  if (env.GOOGLE_CLOUD_PROJECT) {
    return {
      mode: "vertex",
      project: env.GOOGLE_CLOUD_PROJECT,
      location: env.GOOGLE_CLOUD_LOCATION || DEFAULT_VERTEX_LOCATION,
    };
  }

  throw new Error(
    "Credencial do Gemini não encontrada. No arquivo .env, defina GEMINI_API_KEY (chave do Google AI Studio) " +
      "ou GOOGLE_CLOUD_PROJECT (para usar o login do gcloud).",
  );
}

export function describeAuth(auth) {
  return auth.mode === "apiKey"
    ? "chave de API do Gemini"
    : `login do gcloud (projeto ${auth.project}, região ${auth.location})`;
}

export function createGeminiClient(auth) {
  if (auth.mode === "apiKey") return new GoogleGenAI({ apiKey: auth.apiKey });

  return new GoogleGenAI({ vertexai: true, project: auth.project, location: auth.location });
}
