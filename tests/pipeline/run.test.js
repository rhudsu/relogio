import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { createDataRepository } from "../../pipeline/repositories/dataRepository.js";
import { runPipeline } from "../../pipeline/run.js";
import { GAUGES, NOW, SETTINGS_FOR_TESTS, makeLedgerArticle, makeSeries, silentLogger } from "./helpers.js";

const FEED_URL = "https://feed.test/rss";

function feedXml() {
  const date = new Date(NOW.getTime() - 3_600_000).toUTCString();
  return `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>OpenAI plans huge data center spending</title><link>https://news.test/a</link>
      <description>Spending far exceeds AI revenue.</description><pubDate>${date}</pubDate></item>
    <item><title>Local bakery wins award</title><link>https://news.test/b</link>
      <description>Bread.</description><pubDate>${date}</pubDate></item>
  </channel></rss>`;
}

const CONFIG = {
  settings: SETTINGS_FOR_TESTS,
  gauges: GAUGES,
  sources: {
    rss: [{ id: "feed", name: "Feed de teste", url: FEED_URL }],
    gdelt: [],
    relevanceKeywords: ["openai", "data center"],
    caseSensitiveKeywords: ["AI"],
  },
};

function fakeClassifier(onClassify = () => {}) {
  return {
    async classify(articles) {
      onClassify(articles);
      return {
        results: articles.map((article) => ({
          id: article.id,
          classification: {
            relevant: true,
            gaugeId: "capex",
            direction: "closer",
            magnitude: 5,
            confidence: 1,
            evidence: "dado",
            titlePt: "Empresas planejam gasto enorme em data centers",
            summaryPt: "O gasto supera a receita de IA.",
            rationale: "Investimento acima da receita.",
          },
        })),
        errors: [],
        failedBatches: 0,
      };
    },
  };
}

describe("runPipeline", () => {
  let directory;
  let repository;

  const paths = () => ({
    ledgerPath: join(directory, "state", "ledger.json"),
    clockPath: join(directory, "public", "clock.json"),
    entriesPath: join(directory, "public", "entries.json"),
  });

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), "relogio-"));
    repository = createDataRepository(paths());
  });

  after(() => rm(directory, { recursive: true, force: true }));

  const baseArgs = () => ({
    now: NOW,
    config: CONFIG,
    fetchFn: async () => new Response(feedXml(), { status: 200 }),
    sleep: async () => {},
    repository,
    logger: silentLogger,
  });

  it("na simulação coleta e filtra, mas não classifica nem grava", async () => {
    const result = await runPipeline({ ...baseArgs(), classifier: null, dryRun: true });

    assert.equal(result.written, false);
    assert.equal(result.report.collected, 2);
    assert.equal(result.report.relevant, 1);
    assert.deepEqual(await repository.readLedger(), []);
  });

  it("classifica o novo, atualiza o ledger e publica clock.json e entries.json", async () => {
    let received = [];
    const classifier = fakeClassifier((articles) => (received = articles));

    const result = await runPipeline({ ...baseArgs(), classifier, dryRun: false });

    assert.equal(received.length, 1);
    assert.equal(result.report.classified, 1);

    const clock = JSON.parse(await readFile(paths().clockPath, "utf8"));
    const entries = JSON.parse(await readFile(paths().entriesPath, "utf8"));

    assert.equal(clock.meta.isSample, false);
    assert.equal(clock.gauges[0].id, "capex");
    assert.ok(clock.secondsToMidnight < 450, "uma notícia que aproxima deve reduzir o tempo");
    assert.equal(entries.length, 1);
    assert.equal(entries[0].title, "Empresas planejam gasto enorme em data centers");
    assert.equal(entries[0].deltaSeconds, 27);
    assert.equal((await repository.readLedger()).length, 1);
  });

  it("numa segunda rodada não reclassifica o que já está no ledger", async () => {
    let calls = 0;
    const classifier = fakeClassifier(() => (calls += 1));

    const result = await runPipeline({ ...baseArgs(), classifier, dryRun: false });

    assert.equal(calls, 0);
    assert.equal(result.report.fresh, 0);
    assert.equal(result.written, true);
  });

  it("não trata como falha quando o classificador não tem nada novo para devolver", async () => {
    const idle = { classify: async () => ({ results: [], errors: [], failedBatches: 0, tokens: { input: 0, output: 0 } }) };
    const ledgerBefore = await repository.readLedger();
    const dayLater = new Date(NOW.getTime() + 86_400_000);

    const result = await runPipeline({
      ...baseArgs(),
      now: dayLater,
      fetchFn: async () => new Response(feedXml().replace("OpenAI plans", "OpenAI revises"), { status: 200 }),
      classifier: idle,
      dryRun: false,
    });

    assert.equal(result.written, true);
    assert.equal(result.report.classified, 0);
    assert.deepEqual(await repository.readLedger(), ledgerBefore);
  });

  it("falha sem alterar nada quando nenhuma fonte responde", async () => {
    const before = await readFile(paths().clockPath, "utf8");
    const fetchFn = async () => new Response("fora do ar", { status: 503 });

    await assert.rejects(runPipeline({ ...baseArgs(), fetchFn, classifier: fakeClassifier(), dryRun: false }), /Nenhuma fonte respondeu/);
    assert.equal(await readFile(paths().clockPath, "utf8"), before);
  });

  it("falha sem gravar quando a classificação falha em todos os lotes", async () => {
    const emptyDirectory = await mkdtemp(join(tmpdir(), "relogio-vazio-"));
    const emptyRepository = createDataRepository({
      ledgerPath: join(emptyDirectory, "ledger.json"),
      clockPath: join(emptyDirectory, "clock.json"),
      entriesPath: join(emptyDirectory, "entries.json"),
    });
    const failing = { classify: async () => ({ results: [], errors: ["API fora do ar"], failedBatches: 1 }) };

    try {
      await assert.rejects(
        runPipeline({ ...baseArgs(), repository: emptyRepository, classifier: failing, dryRun: false }),
        /falhou em todos os lotes: API fora do ar/,
      );
      assert.deepEqual(await emptyRepository.readLedger(), []);
    } finally {
      await rm(emptyDirectory, { recursive: true, force: true });
    }
  });
});

describe("runPipeline com histórico de versão antiga", () => {
  let directory;
  let repository;

  const idle = { classify: async () => ({ results: [], errors: [], failedBatches: 0, tokens: { input: 0, output: 0 } }) };

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), "relogio-antigo-"));
    repository = createDataRepository({
      ledgerPath: join(directory, "ledger.json"),
      clockPath: join(directory, "clock.json"),
      entriesPath: join(directory, "entries.json"),
    });
    await repository.writeLedger([
      makeLedgerArticle({ id: "antiga", gaugeId: "geopolitics", evidence: undefined, publishedAt: NOW.toISOString() }),
    ]);
  });

  after(() => rm(directory, { recursive: true, force: true }));

  const baseArgs = () => ({
    now: NOW,
    config: CONFIG,
    fetchFn: async () => new Response(feedXml(), { status: 200 }),
    sleep: async () => {},
    repository,
    logger: silentLogger,
    classifier: idle,
    dryRun: false,
  });

  it("recusa publicar enquanto houver notícias de um modelo antigo e não altera nada", async () => {
    await assert.rejects(runPipeline(baseArgs()), /1 notícias do histórico usam termômetros ou campos de uma versão antiga/);
    await assert.rejects(readFile(join(directory, "clock.json"), "utf8"), { code: "ENOENT" });
  });

  it("reclassifica o histórico: o arquivo exporta as relevantes antigas e a nova classificação as substitui", async () => {
    const received = [];
    const reclassifier = {
      async classify(articles) {
        received.push(...articles);
        return {
          results: articles
            .filter((article) => article.id === "antiga")
            .map((article) => ({
              id: article.id,
              classification: {
                relevant: true,
                gaugeId: "capex",
                direction: "closer",
                magnitude: 2,
                confidence: 0.6,
                evidence: "reportagem",
                titlePt: "Reclassificada",
                summaryPt: "Resumo novo.",
                rationale: "Motivo novo.",
              },
            })),
          errors: [],
          failedBatches: 0,
          tokens: { input: 0, output: 0 },
        };
      },
    };

    const dry = await runPipeline({ ...baseArgs(), classifier: null, dryRun: true, reclassify: true });
    assert.ok(dry.fresh.some((article) => article.id === "antiga" && article.origin === "ledger"));

    await runPipeline({ ...baseArgs(), classifier: reclassifier, reclassify: true });

    const ledger = await repository.readLedger();
    const updated = ledger.find((entry) => entry.id === "antiga");

    assert.ok(received.some((article) => article.id === "antiga"));
    assert.equal(updated.gaugeId, "capex");
    assert.equal(updated.evidence, "reportagem");
    assert.equal(JSON.parse(await readFile(join(directory, "clock.json"), "utf8")).meta.methodVersion, 2);
  });
});

describe("runPipeline com sinal de queda de preços", () => {
  let directory;
  let repository;

  const idle = { classify: async () => ({ results: [], errors: [], failedBatches: 0, tokens: { input: 0, output: 0 } }) };
  const warnings = [];
  const recordingLogger = { info() {}, warn: (message) => warnings.push(message) };
  const falling = Array.from({ length: 320 }, (_, index) => (index < 300 ? 100 + index : 399 - (index - 299) * 10));

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), "relogio-precos-"));
    repository = createDataRepository({
      ledgerPath: join(directory, "ledger.json"),
      clockPath: join(directory, "clock.json"),
      entriesPath: join(directory, "entries.json"),
    });
  });

  after(() => rm(directory, { recursive: true, force: true }));

  const baseArgs = () => ({
    now: NOW,
    config: CONFIG,
    fetchFn: async () => new Response(feedXml(), { status: 200 }),
    sleep: async () => {},
    repository,
    logger: recordingLogger,
    classifier: idle,
    dryRun: false,
  });

  it("publica o sinal de queda e usa o índice ajustado quando a série chega", async () => {
    await runPipeline({ ...baseArgs(), collectPrices: async () => makeSeries(falling) });

    const clock = JSON.parse(await readFile(join(directory, "clock.json"), "utf8"));

    assert.equal(clock.priceSignal.label, "Nasdaq Composite");
    assert.ok(clock.priceSignal.drawdownPercent > 10);
    assert.ok(clock.index > clock.baseIndex);
    assert.equal(clock.baseIndex, 50);
  });

  it("segue publicando sem o sinal, avisando, quando a série de preços falha", async () => {
    warnings.length = 0;

    await runPipeline({
      ...baseArgs(),
      collectPrices: async () => {
        throw new Error("FRED fora do ar");
      },
    });

    const clock = JSON.parse(await readFile(join(directory, "clock.json"), "utf8"));

    assert.equal(clock.priceSignal, undefined);
    assert.equal(clock.index, clock.baseIndex);
    assert.ok(warnings.some((message) => /FRED fora do ar/.test(message)));
  });
});

describe("runPipeline com resumo da semana", () => {
  let directory;
  let repository;

  const idle = { classify: async () => ({ results: [], errors: [], failedBatches: 0, tokens: { input: 0, output: 0 } }) };
  const warnings = [];
  const recordingLogger = { info() {}, warn: (message) => warnings.push(message) };

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), "relogio-resumo-"));
    repository = createDataRepository({
      ledgerPath: join(directory, "ledger.json"),
      clockPath: join(directory, "clock.json"),
      entriesPath: join(directory, "entries.json"),
      summaryPath: join(directory, "weekly-summary.json"),
    });
  });

  after(() => rm(directory, { recursive: true, force: true }));

  const args = () => ({
    now: NOW,
    config: CONFIG,
    fetchFn: async () => new Response(feedXml(), { status: 200 }),
    sleep: async () => {},
    repository,
    logger: recordingLogger,
    classifier: idle,
    dryRun: false,
  });

  const readClock = async () => JSON.parse(await readFile(join(directory, "clock.json"), "utf8"));

  it("publica sem resumo e avisa quando o arquivo não existe", async () => {
    warnings.length = 0;
    await runPipeline(args());

    assert.equal((await readClock()).weeklySummary, undefined);
    assert.ok(warnings.some((message) => /ausente/.test(message)));
  });

  it("publica o resumo quando ele é recente e cabe no limite", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(directory, "weekly-summary.json"), JSON.stringify({ text: "Mais perto da meia-noite.", asOf: NOW.toISOString() }));
    await runPipeline(args());

    assert.equal((await readClock()).weeklySummary.text, "Mais perto da meia-noite.");
  });

  it("deixa o resumo de fora e avisa quando ele passou do limite de caracteres", async () => {
    const { writeFile } = await import("node:fs/promises");
    warnings.length = 0;
    await writeFile(join(directory, "weekly-summary.json"), JSON.stringify({ text: "x".repeat(501), asOf: NOW.toISOString() }));
    await runPipeline(args());

    assert.equal((await readClock()).weeklySummary, undefined);
    assert.ok(warnings.some((message) => /501 caracteres/.test(message)));
  });
});

describe("runPipeline com artigos pesquisados (fonte manual)", () => {
  let directory;
  let repository;
  const seen = [];
  const recorder = {
    classify: async (articles) => {
      seen.push(...articles);
      return { results: [], errors: [], failedBatches: 0, tokens: { input: 0, output: 0 } };
    },
  };

  before(async () => {
    const { writeFile } = await import("node:fs/promises");
    directory = await mkdtemp(join(tmpdir(), "relogio-manual-"));
    await writeFile(
      join(directory, "extra-articles.json"),
      JSON.stringify([
        { url: "https://example.com/fed", title: "Fed raises rates", source: "Exemplo", publishedAt: "2026-10-20T12:00:00Z", snippet: "Hike." },
        { url: "https://example.com/velha", title: "Velha demais", source: "Exemplo", publishedAt: "2026-01-01T12:00:00Z" },
      ]),
    );
    repository = createDataRepository({
      ledgerPath: join(directory, "ledger.json"),
      clockPath: join(directory, "clock.json"),
      entriesPath: join(directory, "entries.json"),
      extraArticlesPath: join(directory, "extra-articles.json"),
    });
  });

  after(() => rm(directory, { recursive: true, force: true }));

  it("inclui o artigo manual dentro do período mesmo sem palavra-chave de IA e ignora o fora do período", async () => {
    await runPipeline({
      now: NOW,
      config: CONFIG,
      fetchFn: async () => new Response(feedXml(), { status: 200 }),
      sleep: async () => {},
      repository,
      logger: { info() {}, warn() {} },
      classifier: recorder,
      dryRun: false,
    });

    assert.ok(seen.some((article) => article.title === "Fed raises rates" && article.origin === "manual"));
    assert.ok(!seen.some((article) => article.title === "Velha demais"));
  });
});
