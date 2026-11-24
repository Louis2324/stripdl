export const AUTO_SCROLL_PIXELS_PER_SECOND = Object.freeze({
  1: 60,
  2: 120,
  4: 240,
});

export function getAutoScrollStep(speed, elapsedMs) {
  const pixelsPerSecond = AUTO_SCROLL_PIXELS_PER_SECOND[Number(speed)] ?? 60;
  const elapsed = Math.min(Math.max(Number(elapsedMs) || 0, 0), 64);
  return pixelsPerSecond * (elapsed / 1000);
}

export function getNextAutoScrollTop({
  scrollTop,
  scrollHeight,
  clientHeight,
  speed,
  elapsedMs,
}) {
  const maxScrollTop = Math.max(0, (Number(scrollHeight) || 0) - (Number(clientHeight) || 0));
  const currentTop = Math.max(0, Math.min(maxScrollTop, Number(scrollTop) || 0));
  if (currentTop >= maxScrollTop - 0.5) {
    return { nextTop: maxScrollTop, atEnd: true };
  }

  const nextTop = Math.min(
    maxScrollTop,
    currentTop + getAutoScrollStep(speed, elapsedMs),
  );
  return { nextTop, atEnd: nextTop >= maxScrollTop - 0.5 };
}

export function isAutoScrollScrollEvent(scrollTop, marker, now, tolerance = 1) {
  if (!marker || now > marker.expiresAt) return false;
  return Math.abs((Number(scrollTop) || 0) - marker.top) <= tolerance;
}
