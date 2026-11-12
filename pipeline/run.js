import { collectArticles } from "./services/collectionService.js";
import {
  createRelevanceFilter,
  filterRecent,
  newestFirst,
  removeDuplicates,
} from "./services/filterService.js";
import {
  createLedgerEntry,
  findOutdatedEntries,
  mergeLedger,
  toArticle,
} from "./services/ledgerService.js";
import { buildClockData, buildEntries } from "./services/publicationService.js";
import { EVIDENCE_LEVELS } from "./services/scoreService.js";
import { resolveWeeklySummary } from "./services/summaryService.js";
import { normalizeTitle } from "./utils/text.js";

function selectNewArticles({ collected, ledger, sources, settings, now }) {
  const isRelevant = createRelevanceFilter(sources);
  const recent = filterRecent(collected, now, settings.collection.lookbackDays);
  const relevant = recent.filter(isRelevant);
  const knownIds = new Set(ledger.map((entry) => entry.id));
  const knownTitles = new Set(ledger.map((entry) => normalizeTitle(entry.title)));
  const fresh = removeDuplicates(newestFirst(relevant), knownIds, knownTitles);

  return {
    fresh: fresh.slice(0, settings.collection.maxNewArticlesPerRun),
    counts: { collected: collected.length, recent: recent.length, relevant: relevant.length, fresh: fresh.length },
  };
}

async function loadPriceSeries(collectPrices, logger) {
  if (!collectPrices) return null;

  try {
    return await collectPrices();
  } catch (error) {
    logger.warn(`Série de preços indisponível, o sinal de queda não entra nesta rodada: ${error.message}`);
    return null;
  }
}

function toLedgerEntries(fresh, results, now) {
  const articleById = new Map(fresh.map((article) => [article.id, article]));

  return results.map(({ id, classification }) =>
    createLedgerEntry(articleById.get(id), classification, now),
  );
}

export async function runPipeline({
  now,
  config,
  fetchFn,
  sleep,
  classifier,
  repository,
  logger,
  dryRun,
  reclassify = false,
  publicationNotice = null,
  collectPrices = null,
}) {
  const { settings, sources, gauges } = config;

  const ledger = await repository.readLedger();
  const { articles: collected, failures, sourceCount } = await collectArticles({
    sources,
    settings,
    fetchFn,
    sleep,
  });

  failures.forEach(({ source, reason }) => logger.warn(`Fonte ${source} falhou: ${reason}`));
  if (failures.length >= sourceCount) throw new Error("Nenhuma fonte respondeu. Nada foi alterado.");

  const selection = selectNewArticles({ collected, ledger, sources, settings, now });
  const { counts } = selection;
  const archived = reclassify ? ledger.filter((entry) => entry.relevant).map(toArticle) : [];
  const fresh = [...archived, ...selection.fresh];
  const report = {
    ...counts,
    sourceFailures: failures.length,
    classified: 0,
    relevantNew: 0,
    failedBatches: 0,
    tokens: { input: 0, output: 0 },
  };

  if (dryRun) return { report, fresh, written: false };

  let updatedLedger = ledger;

  if (fresh.length > 0) {
    const { results, errors, failedBatches, tokens } = await classifier.classify(fresh);

    if (results.length === 0 && errors.length > 0) {
      throw new Error(`A classificação falhou em todos os lotes: ${errors[0]}. Nada foi alterado.`);
    }

    updatedLedger = mergeLedger(ledger, toLedgerEntries(fresh, results, now), now, settings.retentionDays);
    report.classified = results.length;
    report.relevantNew = results.filter(({ classification }) => classification.relevant).length;
    report.failedBatches = failedBatches;
    report.tokens = tokens ?? report.tokens;
  } else {
    updatedLedger = mergeLedger(ledger, [], now, settings.retentionDays);
  }

  const gaugeIds = gauges.map((gauge) => gauge.id);
  const outdated = findOutdatedEntries(updatedLedger, gaugeIds, EVIDENCE_LEVELS);

  if (outdated.length > 0) {
    throw new Error(
      `${outdated.length} notícias do histórico usam termômetros ou campos de uma versão antiga do modelo. ` +
        "Reclassifique o histórico (npm run pipeline:export -- --reclassify). Nada foi alterado.",
    );
  }

  const priceSeries = await loadPriceSeries(collectPrices, logger);
  const { summary: weeklySummary, warning } = resolveWeeklySummary(
    await repository.readWeeklySummary(),
    now,
    settings.weeklySummary,
  );
  if (warning) logger.warn(warning);
  const clock = buildClockData({
    articles: updatedLedger,
    gauges,
    settings,
    now,
    notice: publicationNotice,
    priceSeries,
    weeklySummary,
  });
  const entries = buildEntries({ articles: updatedLedger, gauges, settings, now });

  await repository.writeLedger(updatedLedger);
  await repository.writePublicData({ clock, entries });

  return { report, clock, entries, written: true };
}
