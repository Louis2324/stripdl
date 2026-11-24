// desktop/renderer/src/views/ReaderView.jsx
//
// Full port of the old vanilla-JS reader: per-page IntersectionObserver
// lazy loading, scroll-position tracking with debounced progress saves,
// next-chapter preload, resume-to-saved-page on open, and keyboard
// shortcuts.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useConfig } from "../hooks/useConfig.js";
import { updateLastReadPosition } from "../lib/readingProgress.js";
import { createProgressDebouncer } from "../lib/progressDebouncer.mjs";
import {
  getVisiblePageIndexFromRects,
  getPageIndexAtOffset,
  getReaderWindow,
  getWindowSpacerHeights,
} from "../lib/readerWindow.mjs";
import { toFileUrl } from "../lib/fileUrl.js";
import {
  applyZoomLock,
  getAnchoredScrollTop,
  getReaderZoomStyle,
} from "../lib/readerZoom.mjs";
import {
  getReaderContentState,
  resolveReaderStartPage,
} from "../lib/readerState.mjs";
import {
  getNextAutoScrollTop,
  isAutoScrollScrollEvent,
} from "../lib/autoScroll.mjs";
import { markPerf } from "../lib/perfMarks.mjs";
import LoadingIndicator from "../components/LoadingIndicator.jsx";

function PageImage({ src, index, eager, loaded, wrapperRef, onFirstImage }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const shouldRender = eager || loaded;

  return (
    <div
      ref={wrapperRef}
      data-page-index={index}
      style={{ width: "100%", position: "relative", minHeight: 200 }}
    >
      {!imgLoaded && !imgError && <div className="reader-page-loading" />}
      {shouldRender && (
        <img
          className="reader-page-img"
          style={{ display: imgLoaded ? "block" : "none" }}
          alt={`Page ${index + 1}`}
          src={src}
          decoding="async"
          fetchPriority={index === 0 ? "high" : "auto"}
          onLoad={() => {
            setImgLoaded(true);
            if (index === 0) onFirstImage?.();
          }}
          onError={() => setImgError(true)}
        />
      )}
      {imgError && (
        <div className="reader-page-error">
          Page {index + 1} could not be loaded.
        </div>
      )}
    </div>
  );
}

export default function ReaderView({
  series,
  chapter,
  scrollToPage = null,
  onBack,
  onExitToLibrary,
  onNavigateChapter,
}) {
  const { config } = useConfig();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(Boolean(chapter));
  const [error, setError] = useState(null);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [showEndOverlay, setShowEndOverlay] = useState(false);
  const [loadedSet, setLoadedSet] = useState(() => new Set());
  const [startPage, setStartPage] = useState(0);
  const [pageHeights, setPageHeights] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [zoomLocked, setZoomLocked] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(1);
  const firstImageMarkedRef = useRef(false);

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.25;

  const containerRef = useRef(null);
  const pageRefs = useRef([]);
  const observerRef = useRef(null);
  const chapterChangingRef = useRef(false);
  const visibleIndexRef = useRef(visibleIndex);
  visibleIndexRef.current = visibleIndex;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const zoomLockedRef = useRef(zoomLocked);
  zoomLockedRef.current = zoomLocked;
  const zoomAnchorRef = useRef(null);
  const autoScrollRef = useRef(autoScroll);
  autoScrollRef.current = autoScroll;
  const autoScrollMarkerRef = useRef(null);

  function pauseAutoScroll() {
    autoScrollMarkerRef.current = null;
    if (autoScrollRef.current) setAutoScroll(false);
  }

  function captureZoomAnchor() {
    const container = containerRef.current;
    const page = pageRefs.current[visibleIndexRef.current];
    if (!container || !page) return;
    zoomAnchorRef.current = {
      pageIndex: visibleIndexRef.current,
      top: page.getBoundingClientRect().top - container.getBoundingClientRect().top,
    };
  }

  function setZoomLevel(nextZoom) {
    if (zoomLockedRef.current) return;
    const current = zoomRef.current;
    const next = applyZoomLock(
      current,
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +nextZoom.toFixed(3))),
      zoomLockedRef.current,
    );
    if (next === current) return;
    captureZoomAnchor();
    zoomRef.current = next;
    setZoom(next);
  }

  function zoomIn()  { setZoomLevel(zoomRef.current + ZOOM_STEP); }
  function zoomOut() { setZoomLevel(zoomRef.current - ZOOM_STEP); }
  function zoomReset() { setZoomLevel(1); }

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const container = containerRef.current;
    const page = anchor && pageRefs.current[anchor.pageIndex];
    if (!anchor || !container || !page) {
      zoomAnchorRef.current = null;
      return;
    }
    const afterTop = page.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTop = getAnchoredScrollTop(container.scrollTop, anchor.top, afterTop);
    zoomAnchorRef.current = null;
  }, [zoom]);
  const preloadTriggeredRef = useRef(false);
  const progressDebouncerRef = useRef(null);
  if (!progressDebouncerRef.current) {
    progressDebouncerRef.current = createProgressDebouncer((position) =>
      updateLastReadPosition(
        position.seriesTitle,
        position.chapterNumber,
        position.pageIndex,
        position.totalPages,
      ), 500);
  }

  const useLazy = config?.lazyLoading !== false;
  const preloadNext = config?.preloadNextChapter !== false;
  const progressKey =
    series && chapter ? `${series.title}/${chapter.number}` : null;

  useEffect(() => () => {
    void progressDebouncerRef.current?.flush();
  }, [progressKey]);

  useEffect(() => {
    if (!autoScroll) return undefined;
    let frame;
    let previous = null;
    const tick = (now) => {
      const container = containerRef.current;
      if (!container) return;
      if (previous === null) previous = now;
      const elapsed = Math.min(now - previous, 64);
      previous = now;
      const { nextTop, atEnd } = getNextAutoScrollTop({
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        speed: autoScrollSpeed,
        elapsedMs: elapsed,
      });
      if (atEnd && nextTop <= container.scrollTop) {
        setAutoScroll(false);
        return;
      }
      autoScrollMarkerRef.current = {
        top: nextTop,
        expiresAt: performance.now() + 120,
      };
      container.scrollTop = nextTop;
      if (atEnd) {
        setAutoScroll(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoScroll, autoScrollSpeed]);

  useEffect(() => {
    let cancelled = false;
    if (!chapter) return;

    chapterChangingRef.current = true;
    setLoading(true);

    // Immediately scroll back to top when switching chapters so we never
    // start mid-page on a fresh chapter.
    visibleIndexRef.current = 0;
    if (containerRef.current) containerRef.current.scrollTop = 0;

    setPages([]);
    setError(null);
    setVisibleIndex(0);
    setShowEndOverlay(false);
    setAutoScroll(false);
    setStartPage(0);
    setLoadedSet(new Set());
    setPageHeights([]);
    preloadTriggeredRef.current = false;
    firstImageMarkedRef.current = false;
    pageRefs.current = [];

    (async () => {
      let filePaths = [];
      markPerf("chapter-pages-request-start");
      const hasExplicitStartPage = scrollToPage !== null && scrollToPage !== undefined;
      let savedPagePromise = hasExplicitStartPage
        ? Promise.resolve(scrollToPage)
        : window.strip.progress.get(progressKey).catch(() => 0);
      try {
        [filePaths, savedPagePromise] = await Promise.all([
          window.strip.chapter.pages(chapter.directory),
          savedPagePromise,
        ]);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || String(e));
          setLoading(false);
          chapterChangingRef.current = false;
        }
        return;
      }
      if (cancelled) return;

      markPerf("chapter-pages-response");
      const urls = filePaths.map((p) => toFileUrl(p));
      setPages(urls);
      setLoading(false);

      const sp = (await savedPagePromise) || 0;
      const restoredPage = resolveReaderStartPage(
        hasExplicitStartPage ? scrollToPage : null,
        hasExplicitStartPage ? null : sp,
        urls.length,
      );
      if (!cancelled) {
        setStartPage(restoredPage);
        visibleIndexRef.current = restoredPage;
        setVisibleIndex(restoredPage);
        chapterChangingRef.current = false;
      }

      if (!useLazy) {
        setLoadedSet(new Set(urls.map((_, i) => i)));
      } else {
        // The restored page is rendered immediately so a delayed
        // IntersectionObserver callback cannot leave the reader blank.
        const first = Math.max(0, restoredPage - 1);
        const last = Math.min(urls.length - 1, restoredPage + 1);
        setLoadedSet(new Set(
          Array.from({ length: last - first + 1 }, (_, i) => first + i),
        ));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.directory]);

  const readerWindow = getReaderWindow(pages.length, visibleIndex, 4);
  const spacerHeights = useMemo(
    () => getWindowSpacerHeights(
      pageHeights, readerWindow.start, readerWindow.end,
    ),
    [pageHeights, readerWindow.start, readerWindow.end],
  );

  function preloadNextChapter() {
    if (!series || !chapter) return;
    const idx = series.chapters.findIndex((c) => c.number === chapter.number);
    if (idx === -1 || idx >= series.chapters.length - 1) return;
    const nextCh = series.chapters[idx + 1];
    window.strip.chapter
      .pages(nextCh.directory)
      .then((filePaths) => {
        filePaths.slice(0, 3).forEach((p) => {
          const img = new Image();
          img.src = toFileUrl(p);
        });
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!pages.length) return;
    if (observerRef.current) observerRef.current.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number(entry.target.dataset.pageIndex);
          if (!entry.isIntersecting) return;

          if (useLazy) {
            setLoadedSet((prev) => {
              if (prev.has(idx)) return prev;
              const next = new Set(prev);
              next.add(idx);
              return next;
            });
          }

          if (
            preloadNext &&
            !preloadTriggeredRef.current &&
            idx >= pages.length - 5
          ) {
            preloadTriggeredRef.current = true;
            preloadNextChapter();
          }
        });
      },
      { root: containerRef.current, rootMargin: "500px 0px", threshold: 0 },
    );

    pageRefs.current.forEach((el) => el && observer.observe(el));
    observerRef.current = observer;

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, useLazy, preloadNext, readerWindow.start, readerWindow.end]);

  useEffect(() => {
    if (!pages.length || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      setPageHeights((previous) => {
        let next = previous;
        for (const entry of entries) {
          const index = Number(entry.target.dataset.pageIndex);
          const height = entry.contentRect.height;
          if (!Number.isFinite(index) || !Number.isFinite(height) || height <= 0) continue;
          if (Math.abs((next[index] || 0) - height) < 1) continue;
          if (next === previous) next = [...previous];
          next[index] = height;
        }
        return next;
      });
    });
    for (let index = readerWindow.start; index <= readerWindow.end; index++) {
      const element = pageRefs.current[index];
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [pages.length, readerWindow.start, readerWindow.end]);

  useEffect(() => {
    if (!pages.length || startPage <= 0 || startPage >= pages.length) return;
    const frame = requestAnimationFrame(() => {
      pageRefs.current[startPage]?.scrollIntoView({ behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pages, startPage]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const now = performance.now();
    if (
      autoScrollRef.current &&
      !isAutoScrollScrollEvent(
        container.scrollTop,
        autoScrollMarkerRef.current,
        now,
      )
    ) {
      pauseAutoScroll();
    }

    const rootRect = container.getBoundingClientRect();
    const pageRects = pageRefs.current.flatMap((element, index) => {
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      return [{ index, top: rect.top, bottom: rect.bottom }];
    });
    const viewportBottom = rootRect.top + container.clientHeight;
    const hasVisiblePage = pageRects.some(
      (rect) => rect.bottom > rootRect.top && rect.top < viewportBottom,
    );
    const nextVisibleIndex = hasVisiblePage
      ? getVisiblePageIndexFromRects(
        pageRects,
        rootRect.top,
        viewportBottom,
        visibleIndexRef.current,
      )
      : getPageIndexAtOffset(container.scrollTop, pageHeights, pages.length);
    if (nextVisibleIndex !== visibleIndexRef.current) {
      visibleIndexRef.current = nextVisibleIndex;
      setVisibleIndex(nextVisibleIndex);
    }

    if (progressKey && !chapterChangingRef.current) {
      progressDebouncerRef.current.schedule({
        seriesTitle: series.title,
        chapterNumber: chapter.number,
        pageIndex: nextVisibleIndex,
        totalPages: pages.length,
      });
    }

    const distFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowEndOverlay((prev) => {
      if (!prev && distFromBottom < 120) return true;
      if (prev && distFromBottom > 180) return false;
      return prev;
    });
  }, [progressKey, series, chapter, pages.length, pageHeights]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function pauseFromInput(event) {
      // Ctrl+wheel is reserved for pinch-to-zoom and is handled below.
      if (event.type === "wheel" && event.ctrlKey) return;
      pauseAutoScroll();
    }

    container.addEventListener("wheel", pauseFromInput, { passive: true });
    container.addEventListener("pointerdown", pauseFromInput, { passive: true });
    container.addEventListener("touchstart", pauseFromInput, { passive: true });
    return () => {
      container.removeEventListener("wheel", pauseFromInput);
      container.removeEventListener("pointerdown", pauseFromInput);
      container.removeEventListener("touchstart", pauseFromInput);
    };
  }, []);

  // Pinch-to-zoom via trackpad: wheel events with ctrlKey are fired by the OS
  // for pinch gestures. We intercept them and drive our zoom state instead of
  // letting the browser perform its own page-level zoom.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onWheel(e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // deltaY < 0  → pinch-out (zoom in)   deltaY > 0 → pinch-in (zoom out)
      // Scale the delta so small trackpad movements feel natural.
      const delta = e.deltaY * -0.005;
      setZoomLevel(zoomRef.current + delta);
    }

    // Must be non-passive so we can call preventDefault()
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [ZOOM_MIN, ZOOM_MAX]);

  useEffect(() => {
    function onKeydown(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = e.key.toLowerCase();

      if (key === "escape" || key === "g") {
        e.preventDefault();
        onBack();
        return;
      }
      if (key === "b") {
        e.preventDefault();
        onExitToLibrary();
        return;
      }
      if (key === "n" || key === "j") {
        e.preventDefault();
        onNavigateChapter(1);
        return;
      }
      if (key === "p" || key === "k") {
        e.preventDefault();
        onNavigateChapter(-1);
        return;
      }
      // Zoom shortcuts: = / + to zoom in, - to zoom out, 0 to reset
      if (key === "=" || key === "+") { e.preventDefault(); zoomIn();    return; }
      if (key === "-")                 { e.preventDefault(); zoomOut();   return; }
      if (key === "0")                 { e.preventDefault(); zoomReset(); return; }
      if (key === "a") {
        e.preventDefault();
        setAutoScroll((enabled) => !enabled);
        return;
      }

      const container = containerRef.current;
      if (!container) return;
      if (key === "arrowdown" || key === "arrowright") {
        e.preventDefault();
        pauseAutoScroll();
        container.scrollBy({
          top: window.innerHeight * 0.85,
          behavior: "smooth",
        });
      } else if (key === "arrowup" || key === "arrowleft") {
        e.preventDefault();
        pauseAutoScroll();
        container.scrollBy({
          top: -window.innerHeight * 0.85,
          behavior: "smooth",
        });
      }
    }

    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [onBack, onExitToLibrary, onNavigateChapter]);

  if (!series || !chapter) {
    return (
      <section id="view-reader" className="view reader-view active">
        <p className="muted" style={{ padding: 32 }}>
          No chapter selected.
        </p>
      </section>
    );
  }

  const idx = series.chapters.findIndex((c) => c.number === chapter.number);
  const hasPrev = idx > 0;
  const hasNext = idx !== -1 && idx < series.chapters.length - 1;
  const contentState = getReaderContentState({
    loading,
    error,
    pageCount: pages.length,
  });

  return (
    <section id="view-reader" className="view reader-view active">
      <div id="reader-toolbar">
        <button className="btn btn-ghost" onClick={onBack}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div className="reader-chapter-nav">
          <button
            id="btn-prev-chapter"
            className="btn btn-ghost icon-btn"
            title="Previous chapter (P)"
            disabled={!hasPrev}
            onClick={() => onNavigateChapter(-1)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="reader-title-text">
            {series.title} · Chapter {chapter.number}
          </span>
          <button
            id="btn-next-chapter"
            className="btn btn-ghost icon-btn"
            title="Next chapter (N)"
            disabled={!hasNext}
            onClick={() => onNavigateChapter(1)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
        <div className="reader-controls">
          <span>
            {pages.length > 0 ? `${visibleIndex + 1} / ${pages.length}` : ""}
          </span>
          {/* Reader controls */}
            <div className="reader-auto-scroll-controls" aria-label="Auto-scroll controls">
              <button
                id="auto-scroll-btn"
                className="btn btn-ghost reader-tool-btn"
                title="Toggle auto-scroll (A)"
                aria-label={autoScroll ? "Pause auto-scroll" : "Start auto-scroll"}
                aria-pressed={autoScroll}
                onClick={() => setAutoScroll((enabled) => !enabled)}
              >
                {autoScroll ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5.5v13l10-6.5-10-6.5Z" />
                  </svg>
                )}
              </button>
              <label className="reader-auto-scroll-speed" title="Auto-scroll speed">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4.5 16a8 8 0 1 1 15 0" />
                  <path d="m12 12 4-4M6 19h12" />
                </svg>
                <select
                  id="auto-scroll-speed"
                  aria-label="Auto-scroll speed"
                  value={autoScrollSpeed}
                  onChange={(event) => setAutoScrollSpeed(Number(event.target.value))}
                >
                  <option value="1">1×</option>
                  <option value="2">2×</option>
                  <option value="4">4×</option>
                </select>
              </label>
            </div>
            <div className="reader-zoom-controls" aria-label="Zoom controls">
            <button
              id="zoom-out-btn"
              className="btn btn-ghost icon-btn reader-zoom-btn"
              title="Zoom out (−)"
              disabled={zoomLocked || zoom <= ZOOM_MIN}
              onClick={zoomOut}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="6" />
                <path d="m16 16 4 4M8 11h6" />
              </svg>
            </button>
            <button
              id="zoom-reset-btn"
              className="btn btn-ghost reader-zoom-level"
              title="Reset zoom (0)"
              disabled={zoomLocked}
              onClick={zoomReset}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              id="zoom-in-btn"
              className="btn btn-ghost icon-btn reader-zoom-btn"
              title="Zoom in (=)"
              disabled={zoomLocked || zoom >= ZOOM_MAX}
              onClick={zoomIn}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="6" />
                <path d="m16 16 4 4M8 11h6M11 8v6" />
              </svg>
            </button>
            <button
              id="zoom-lock-btn"
              className="btn btn-ghost icon-btn reader-zoom-btn"
              title={zoomLocked ? "Unlock zoom" : "Lock zoom"}
              aria-label={zoomLocked ? "Unlock zoom" : "Lock zoom"}
              aria-pressed={zoomLocked}
              onClick={() => setZoomLocked((locked) => !locked)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ width: 14, height: 14 }}
              >
                <rect x="5" y="10" width="14" height="10" rx="2" />
                {zoomLocked ? (
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                ) : (
                  <path d="M8 10V7a4 4 0 0 1 7.4-2.1" />
                )}
                <path d="M12 14v3" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div id="reader-container" ref={containerRef}>
        <div
          id="reader-pages"
          style={{
            ...getReaderZoomStyle(zoom),
          }}
        >
          {contentState === "loading" && (
            <LoadingIndicator label="Loading chapter pages…" />
          )}
          {contentState === "error" && (
            <div className="reader-page-error">
              Could not load pages: {error}
            </div>
          )}
          {contentState === "empty" && (
            <div className="reader-page-error">
              No pages found in this chapter.
            </div>
          )}
          <div aria-hidden="true" style={{ height: spacerHeights.before }} />
          {pages.slice(readerWindow.start, readerWindow.end + 1).map((src, offset) => {
            const i = readerWindow.start + offset;
            return (
            <PageImage
              key={i}
              src={src}
              index={i}
              eager={!useLazy || i < 2}
              loaded={loadedSet.has(i)}
              wrapperRef={(el) => (pageRefs.current[i] = el)}
              onFirstImage={() => {
                if (firstImageMarkedRef.current) return;
                firstImageMarkedRef.current = true;
                markPerf("first-reader-image");
              }}
            />
            );
          })}
          <div aria-hidden="true" style={{ height: spacerHeights.after }} />
        </div>
      </div>

      <div
        id="chapter-end-overlay"
        className={showEndOverlay ? "is-visible" : ""}
        aria-hidden={!showEndOverlay}
      >
        <div className="chapter-end-card">
          <div className="chapter-end-label">End of chapter</div>
          <div className="chapter-end-title">
            {series.title} · Chapter {chapter.number}
          </div>
          <div className="chapter-end-actions">
            <button
              id="btn-end-prev-chapter"
              className="btn btn-ghost"
              disabled={!hasPrev}
              onClick={() => onNavigateChapter(-1)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ width: 15, height: 15 }}
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Previous
            </button>
            <button className="btn btn-ghost" onClick={onBack}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ width: 15, height: 15 }}
              >
                <rect x="3" y="3" width="7" height="9" rx="1" />
                <rect x="14" y="3" width="7" height="5" rx="1" />
                <rect x="14" y="12" width="7" height="9" rx="1" />
                <rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
              Chapter list
            </button>
            <button
              id="btn-end-next-chapter"
              className="btn btn-primary"
              disabled={!hasNext}
              onClick={() => onNavigateChapter(1)}
            >
              Next chapter
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ width: 15, height: 15 }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
