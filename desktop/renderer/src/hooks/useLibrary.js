// desktop/renderer/src/hooks/useLibrary.js
//
// Loads the library (cache-first, like the old app.js), then enriches
// each series with its reading progress and "last read" timestamp in one
// batched Promise.all pass — this is where the two-IPC-calls-per-series
// savings from readingProgress.js's computeSeriesProgress() split pays
// off, versus doing it per-card as each SeriesCard mounts.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCachedLibrary,
  setCachedLibrary,
  invalidateLibraryCache,
} from "../lib/libraryCache.js";
import { enrichLibraryWithProgress } from "../lib/libraryProgress.mjs";
import { markPerf } from "../lib/perfMarks.mjs";

async function enrichLibrary(rawSeries) {
  const progress = await window.strip.progress.all();
  return enrichLibraryWithProgress(rawSeries, progress);
}

export function useLibrary() {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadGeneration = useRef(0);

  const load = useCallback(async (forceRefresh = false) => {
    const generation = ++loadGeneration.current;
    markPerf("library-request-start");
    setError(null);
    try {
      let raw = forceRefresh ? null : getCachedLibrary();
      if (!raw) {
        setLoading(true);
        raw = await window.strip.library.scan();
        setCachedLibrary(raw);
      }

      if (generation !== loadGeneration.current) return;
      markPerf("library-response");
      setLibrary(raw);
      setLoading(false);
      markPerf("library-visible");

      void enrichLibrary(raw).then((enriched) => {
        if (generation === loadGeneration.current) setLibrary(enriched);
      }).catch(() => {
        // Cached/raw library data remains usable when progress enrichment fails.
      });
    } catch (e) {
      if (generation === loadGeneration.current) {
        setError(e.message || String(e));
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(
    (forceRefresh = true) => {
      if (forceRefresh) invalidateLibraryCache();
      return load(forceRefresh);
    },
    [load],
  );

  /**
   * Remove a series from local state immediately, without a full
   * re-scan — mirrors the old app.js pattern of splicing a deleted
   * series out of state.library directly rather than re-fetching.
   */
  const removeSeries = useCallback((directory) => {
    invalidateLibraryCache();
    setLibrary((prev) => prev.filter((s) => s.directory !== directory));
  }, []);

  return { library, loading, error, refresh, removeSeries };
}
