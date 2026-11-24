export function getVisiblePageIndex(intersectingEntries, currentIndex = 0) {
  if (!intersectingEntries.length) return currentIndex;
  const belowTop = intersectingEntries.filter((entry) => entry.top >= 0);
  const candidates = belowTop.length ? belowTop : intersectingEntries;
  return candidates.reduce((selected, entry) => {
    if (belowTop.length) return entry.top < selected.top ? entry : selected;
    return entry.top > selected.top ? entry : selected;
  }).index;
}

export function getVisiblePageIndexFromRects(
  pageRects,
  viewportTop,
  viewportBottom,
  currentIndex = 0,
) {
  const entries = pageRects
    .filter((rect) => rect.bottom > viewportTop && rect.top < viewportBottom)
    .map((rect) => ({ index: rect.index, top: rect.top - viewportTop }));
  return getVisiblePageIndex(entries, currentIndex);
}

export function getPageIndexAtOffset(offset, heights, pageCount, estimate = 900) {
  if (pageCount <= 0) return 0;
  let remaining = Math.max(0, Number(offset) || 0);
  for (let index = 0; index < pageCount; index++) {
    const height = Number.isFinite(heights[index]) && heights[index] > 0
      ? heights[index]
      : estimate;
    if (remaining < height) return index;
    remaining -= height;
  }
  return pageCount - 1;
}

export function getReaderWindow(pageCount, visibleIndex, overscan = 4) {
  if (pageCount <= 0) return { start: 0, end: -1 };
  const center = Math.max(0, Math.min(pageCount - 1, Math.floor(visibleIndex || 0)));
  return {
    start: Math.max(0, center - overscan),
    end: Math.min(pageCount - 1, center + overscan),
  };
}

export function getWindowSpacerHeights(heights, start, end, estimate = 900) {
  const pageHeight = (index) => {
    const height = heights[index];
    return Number.isFinite(height) && height > 0 ? height : estimate;
  };
  let before = 0;
  let after = 0;
  for (let index = 0; index < start; index++) before += pageHeight(index);
  for (let index = end + 1; index < heights.length; index++) after += pageHeight(index);
  return { before, after };
}
