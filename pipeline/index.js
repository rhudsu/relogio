import { fileURLToPath } from "node:url";

import { collectPriceSeries } from "./collectors/priceCollector.js";
import { loadConfig } from "./config/loadConfig.js";
import { createGeminiClient, describeAuth, resolveGeminiAuth } from "./providers/geminiClient.js";
import { createGeminiProvider } from "./providers/geminiProvider.js";
import { createDataRepository } from "./repositories/dataRepository.js";
import { buildSystemPrompt, createClassifier } from "./services/classifierService.js";
import { applyBackfill } from "./services/backfillService.js";
import { createFileClassifier } from "./services/fileClassifierService.js";
import { runPipeline } from "./run.js";
import { sleep } from "./utils/http.js";
import { truncate } from "./utils/text.js";

const PREVIEW_LIMIT = 15;
const CANDIDATE_SNIPPET_CHARS = 280;
const MANUAL_CLASSIFICATION_NOTICE =
  "Classificação manual por IA, a partir de manchetes. A atualização diária automática ainda não está ligada.";

const logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(`Aviso: ${message}`),
};

function requestOptionsFor({ collection }) {
  return { fetchFn: fetch, timeoutMs: collection.requestTimeoutMs, userAgent: collection.userAgent };
}

function projectPath(relativePath) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

function buildClassifier({ settings, gauges, promptTemplate }) {
  const auth = resolveGeminiAuth(process.env);
  logger.info(`Classificação com ${settings.classifier.model} usando ${describeAuth(auth)}.`);

  const provider = createGeminiProvider({
    client: createGeminiClient(auth),
    model: settings.classifier.model,
    thinkingLevel: settings.classifier.thinkingLevel,
    retryDelaysMs: settings.retry.delaysMs,
    sleep,
    logger,
  });

  return createClassifier({
    provider,
    settings: settings.classifier,
    gaugeIds: gauges.map((gauge) => gauge.id),
    systemPrompt: buildSystemPrompt(promptTemplate, gauges),
    logger,
  });
}

function printReport({ report, fresh, written }, dryRun) {
  console.log("\nResumo da rodada");
  console.log(`  Artigos coletados:        ${report.collected}`);
  console.log(`  Dentro do período:        ${report.recent}`);
  console.log(`  Com tema de IA/mercado:   ${report.relevant}`);
  console.log(`  Novos (sem duplicatas):   ${report.fresh}`);
  console.log(`  Fontes que falharam:      ${report.sourceFailures}`);

  if (dryRun) {
    console.log("\nSimulação: nada foi classificado nem gravado. Primeiros candidatos:");
    fresh.slice(0, PREVIEW_LIMIT).forEach((article) => {
      console.log(`  ${article.publishedAt.slice(0, 10)}  [${article.source}]  ${article.title}`);
    });
    return;
  }

  console.log(`  Classificados:            ${report.classified} (${report.relevantNew} relevantes)`);
  console.log(`  Lotes que falharam:       ${report.failedBatches}`);
  console.log(`  Tokens usados:            ${report.tokens.input} de entrada, ${report.tokens.output} de saída`);
  console.log(written ? "\nArquivos atualizados em public/data/ e pipeline/state/." : "");
}

function toCandidate(article) {
  return {
    id: article.id,
    source: article.source,
    publishedAt: article.publishedAt,
    title: article.title,
    snippet: truncate(article.snippet, CANDIDATE_SNIPPET_CHARS),
  };
}

async function buildFileClassifier({ gauges }, repository) {
  return createFileClassifier({
    classifications: await repository.readClassifications(),
    gaugeIds: gauges.map((gauge) => gauge.id),
    logger,
  });
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  const exportCandidates = flags.has("--export-candidates");
  const dryRun = flags.has("--dry-run") || exportCandidates;
  const useFileClassifier = flags.has("--classifier=file");
  const reclassify = flags.has("--reclassify");
  const backfillFrom = process.argv.slice(2).find((arg) => arg.startsWith("--backfill-from="))?.split("=")[1];
  const loaded = await loadConfig();
  const now = new Date();
  const config = backfillFrom ? { ...loaded, settings: applyBackfill(loaded.settings, backfillFrom, now, { gdelt: flags.has("--backfill-gdelt") }) } : loaded;

  const repository = createDataRepository({
    ledgerPath: projectPath("./state/ledger.json"),
    clockPath: projectPath("../public/data/clock.json"),
    entriesPath: projectPath("../public/data/entries.json"),
    candidatesPath: projectPath("./state/candidates.json"),
    classificationsPath: projectPath("./state/classifications.json"),
    summaryPath: projectPath("./state/weekly-summary.json"),
    extraArticlesPath: projectPath("./state/extra-articles.json"),
  });

  let classifier = null;
  if (!dryRun) {
    classifier = useFileClassifier ? await buildFileClassifier(config, repository) : buildClassifier(config);
  }

  const result = await runPipeline({
    now,
    config,
    fetchFn: fetch,
    sleep,
    classifier,
    repository,
    logger,
    dryRun,
    reclassify,
    publicationNotice: useFileClassifier ? MANUAL_CLASSIFICATION_NOTICE : null,
    collectPrices: () => collectPriceSeries(config.settings.priceSignal, requestOptionsFor(config.settings)),
  });

  if (exportCandidates) {
    await repository.writeCandidates(result.fresh.map(toCandidate));
    console.log(`\n${result.fresh.length} candidatas gravadas em pipeline/state/candidates.json.`);
    return;
  }

  printReport(result, dryRun);
}

main().catch((error) => {
  console.error(`\nErro: ${error.message}`);
  process.exitCode = 1;
});
