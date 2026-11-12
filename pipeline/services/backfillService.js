const MILLISECONDS_PER_DAY = 86_400_000;
const SLICE_DAYS = 10;

// Divide o período histórico em janelas curtas: o GDELT devolve poucos registros por consulta.
export function buildBackfillWindows(fromDate, now, sliceDays = SLICE_DAYS) {
  const start = new Date(`${fromDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) throw new Error(`Data inválida em --backfill-from: ${fromDate}`);

  const windows = [];
  for (let from = start.getTime(); from < now.getTime(); from += sliceDays * MILLISECONDS_PER_DAY) {
    const to = Math.min(from + sliceDays * MILLISECONDS_PER_DAY, now.getTime());
    windows.push({ start: new Date(from).toISOString(), end: new Date(to).toISOString() });
  }
  return windows;
}

export function applyBackfill(settings, fromDate, now, { gdelt = false } = {}) {
  const lookbackDays = Math.ceil((now.getTime() - new Date(`${fromDate}T00:00:00Z`).getTime()) / MILLISECONDS_PER_DAY);
  const collection = { ...settings.collection, lookbackDays };

  if (gdelt) collection.gdeltWindows = buildBackfillWindows(fromDate, now);

  return { ...settings, collection };
}
