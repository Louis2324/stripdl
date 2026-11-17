import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichLibraryWithProgress } from "../renderer/src/lib/libraryProgress.mjs";

test("enriches the library from one progress snapshot", () => {
  const series = [{
    title: "A",
    chapters: [
      { number: 1, pageCount: 10 },
      { number: 2, pageCount: 20 },
    ],
  }];

  const enriched = enrichLibraryWithProgress(series, {
    "A/lastRead": { chapterNumber: 2, pageIndex: 10, totalPages: 20 },
    "A/recentlyRead": 123,
  });

  assert.equal(enriched[0].lastRead.chapterNumber, 2);
  assert.equal(enriched[0].lastReadTs, 123);
  assert.equal(enriched[0].progress, 75);
});

test("missing progress uses safe defaults", () => {
  const enriched = enrichLibraryWithProgress([{ title: "A", chapters: [] }]);
  assert.equal(enriched[0].lastRead, null);
  assert.equal(enriched[0].lastReadTs, 0);
  assert.equal(enriched[0].progress, 0);
});
