import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { SETTINGS } from "./settings.js";

const CONFIG_DIR = new URL("./", import.meta.url);
const PROMPT_PATH = new URL("../prompts/classify.md", import.meta.url);

async function readJson(fileName) {
  const content = await readFile(fileURLToPath(new URL(fileName, CONFIG_DIR)), "utf8");
  return JSON.parse(content);
}

function assertWeightsSumToOne(gauges) {
  const total = gauges.reduce((sum, gauge) => sum + gauge.weight, 0);

  if (Math.abs(total - 1) > 0.001) {
    throw new Error(`Os pesos em dimensions.json devem somar 1, mas somam ${total}.`);
  }
}

export async function loadConfig(env = process.env) {
  const [sources, gauges, promptTemplate] = await Promise.all([
    readJson("sources.json"),
    readJson("dimensions.json"),
    readFile(fileURLToPath(PROMPT_PATH), "utf8"),
  ]);

  assertWeightsSumToOne(gauges);

  const classifierModel = env.CLASSIFIER_MODEL || SETTINGS.classifier.model;

  return {
    settings: { ...SETTINGS, classifier: { ...SETTINGS.classifier, model: classifierModel } },
    sources,
    gauges,
    promptTemplate,
  };
}
