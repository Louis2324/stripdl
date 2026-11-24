export function getReaderContentState({ loading, error, pageCount }) {
  if (loading) return "loading";
  if (error) return "error";
  return pageCount > 0 ? "ready" : "empty";
}

export function resolveReaderStartPage(requestedPage, savedPage, pageCount) {
  if (pageCount <= 0) return 0;
  const candidate = requestedPage ?? savedPage ?? 0;
  return Math.max(0, Math.min(pageCount - 1, Number(candidate) || 0));
}
