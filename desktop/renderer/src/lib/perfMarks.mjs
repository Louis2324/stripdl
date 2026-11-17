function enabled() {
  return import.meta.env?.DEV === true;
}

export function markPerf(label) {
  if (!enabled() || typeof performance === "undefined" || !performance.mark) {
    return;
  }
  performance.mark(`strip:${label}`);
}
