import { fetchText } from "../utils/http.js";

export function parseFredCsv(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(","))
    .map(([date, value]) => ({ date, value: Number(value) }))
    .filter(({ date, value }) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value) && value > 0);
}

export async function collectPriceSeries(priceSignal, requestOptions) {
  const series = parseFredCsv(await fetchText(priceSignal.url, requestOptions));

  if (series.length < priceSignal.minHistoryDays) {
    throw new Error(`A série de preços veio curta demais (${series.length} pregões).`);
  }

  return series;
}
