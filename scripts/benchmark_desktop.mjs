import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { scanLibrary } from "../desktop/main/libraryScanner.cjs";
import { listChapterPages } from "../desktop/main/chapterPages.cjs";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
}

async function createFixture(root, seriesCount, chaptersPerSeries, pagesPerChapter) {
  for (let series = 0; series < seriesCount; series += 1) {
    const seriesDir = path.join(root, `Series-${series + 1}`);
    await fs.mkdir(seriesDir, { recursive: true });
    await fs.writeFile(
      path.join(seriesDir, "metadata.json"),
      JSON.stringify({ title: `Series ${series + 1}`, author: "Benchmark" }),
    );
    for (let chapter = 1; chapter <= chaptersPerSeries; chapter += 1) {
      const chapterDir = path.join(seriesDir, String(chapter).padStart(3, "0"));
      await fs.mkdir(chapterDir, { recursive: true });
      const chapterPages = chapter === 1
        ? Math.max(5, Math.floor(pagesPerChapter / 4))
        : chapter === chaptersPerSeries
          ? pagesPerChapter * 2
          : pagesPerChapter;
      await fs.writeFile(
        path.join(chapterDir, ".complete"),
        JSON.stringify({ pages: chapterPages }),
      );
      for (let page = 1; page <= chapterPages; page += 1) {
        await fs.writeFile(path.join(chapterDir, `${String(page).padStart(3, "0")}.jpg`), "page");
      }
    }
  }
}

async function timed(label, operation) {
  const start = performance.now();
  const result = await operation();
  return { label, milliseconds: Number((performance.now() - start).toFixed(2)), result };
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "strip-benchmark-"));
try {
  const series = arg("series", 10);
  const chapters = arg("chapters", 20);
  const pages = arg("pages", 40);
  await createFixture(root, series, chapters, pages);
  const firstSeries = path.join(root, "Series-1");
  const firstChapter = path.join(firstSeries, "001");

  const results = [];
  results.push(await timed("library-scan-cold", () => scanLibrary(root)));
  results.push(await timed("library-scan-repeat", () => scanLibrary(root)));
  results.push(await timed("reader-pages-short", () => listChapterPages(firstChapter, root)));
  results.push(await timed("reader-pages-medium", () => listChapterPages(
    path.join(firstSeries, String(Math.ceil(chapters / 2)).padStart(3, "0")), root,
  )));
  results.push(await timed("reader-pages-long", () => listChapterPages(
    path.join(firstSeries, String(chapters).padStart(3, "0")), root,
  )));

  console.log(JSON.stringify({
    fixture: { root, series, chaptersPerSeries: chapters, pagesPerChapter: pages },
    measurements: results.map(({ label, milliseconds, result }) => ({
      label,
      milliseconds,
      count: Array.isArray(result) ? result.length : null,
    })),
  }, null, 2));
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
