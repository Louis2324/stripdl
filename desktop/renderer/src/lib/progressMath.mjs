export function computeSeriesProgress(series, lastRead) {
  if (!series?.chapters?.length || !lastRead) return 0;
  const idx = series.chapters.findIndex(
    (chapter) => chapter.number == lastRead.chapterNumber,
  );
  if (idx === -1) return 0;
  const chapterProgress = lastRead.pageIndex / (lastRead.totalPages || 1);
  return ((idx + chapterProgress) / series.chapters.length) * 100;
}
