import { validateClassification } from "./classifierService.js";

export function createFileClassifier({ classifications, gaugeIds, logger }) {
  const rawById = new Map(classifications.map((raw) => [raw.id, raw]));

  async function classify(articles) {
    const results = [];
    const errors = [];

    for (const article of articles) {
      const raw = rawById.get(article.id);
      if (!raw) continue;

      const classification = validateClassification(raw, gaugeIds);

      if (classification) {
        results.push({ id: article.id, classification });
      } else {
        errors.push(`Classificação inválida para ${article.id}`);
      }
    }

    const pending = articles.length - results.length - errors.length;
    logger.info(`Classificações lidas do arquivo: ${results.length}. Ainda sem classificação: ${pending}.`);

    return { results, errors, failedBatches: errors.length, tokens: { input: 0, output: 0 } };
  }

  return { classify };
}
