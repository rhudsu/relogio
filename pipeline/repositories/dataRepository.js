import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const LEDGER_VERSION = 1;

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomically(filePath, data) {
  await mkdir(dirname(filePath), { recursive: true });

  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export function createDataRepository({
  ledgerPath,
  clockPath,
  entriesPath,
  candidatesPath,
  classificationsPath,
  summaryPath,
  extraArticlesPath,
}) {
  return {
    async readLedger() {
      const ledger = await readJsonIfExists(ledgerPath);
      return ledger?.articles ?? [];
    },

    async writeLedger(articles) {
      await writeJsonAtomically(ledgerPath, { version: LEDGER_VERSION, articles });
    },

    async writePublicData({ clock, entries }) {
      await writeJsonAtomically(entriesPath, entries);
      await writeJsonAtomically(clockPath, clock);
    },

    // Artigos pesquisados fora do RSS/GDELT (ex.: retrospectiva histórica). Arquivo opcional.
    async readExtraArticles() {
      const extra = extraArticlesPath ? await readJsonIfExists(extraArticlesPath) : null;
      return Array.isArray(extra) ? extra : [];
    },

    async readWeeklySummary() {
      return summaryPath ? readJsonIfExists(summaryPath) : null;
    },

    async writeCandidates(candidates) {
      await writeJsonAtomically(candidatesPath, candidates);
    },

    async readClassifications() {
      const classifications = await readJsonIfExists(classificationsPath);

      if (!Array.isArray(classifications)) {
        throw new Error(`Arquivo de classificações não encontrado ou inválido: ${classificationsPath}`);
      }

      return classifications;
    },
  };
}
