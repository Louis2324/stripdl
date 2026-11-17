import { computeSeriesProgress } from "./progressMath.mjs";

export function enrichLibraryWithProgress(rawSeries, progress = {}) {
  return rawSeries.map((series) => {
    const lastRead = progress[`${series.title}/lastRead`] ?? null;
    const lastReadTs = progress[`${series.title}/recentlyRead`] || 0;
    return {
      ...series,
      lastRead,
      progress: computeSeriesProgress(series, lastRead),
      lastReadTs,
    };
  });
}
