const path = require("node:path");
const { assertLibraryPath } = require("./pathSafety.cjs");

const CHAPTER_DIR_RE = /^(\d+)(?:_(\d))?$/;

async function readJson(fsPromises, filePath) {
  try {
    return JSON.parse(await fsPromises.readFile(filePath, "utf8"));
  } catch (_) {
    return {};
  }
}

async function exists(fsPromises, filePath) {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

async function scanLibrary(root, fsPromises = require("node:fs/promises")) {
  let entries;
  try {
    entries = await fsPromises.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return [];
    throw error;
  }

  const seriesEntries = entries.filter((entry) => entry.isDirectory());
  // Keep disk work bounded while allowing independent series directories to
  // be scanned in parallel on large libraries.
  const series = (await mapWithConcurrency(seriesEntries, 4, async (entry) => {
    let seriesDir;
    try {
      seriesDir = await assertLibraryPath(path.join(root, entry.name), root);
    } catch (_) {
      return null;
    }
    const metaPath = path.join(seriesDir, "metadata.json");
    if (!(await exists(fsPromises, metaPath))) return null;
    let safeMetaPath;
    try {
      safeMetaPath = await assertLibraryPath(metaPath, root);
    } catch (_) {
      return null;
    }
    const meta = await readJson(fsPromises, safeMetaPath);
    const coverPath = path.join(seriesDir, "cover.jpg");
    const chapterEntries = await fsPromises.readdir(seriesDir, { withFileTypes: true });
    const chapterDirectories = chapterEntries.filter((entry) => entry.isDirectory());
    const chapters = (await mapWithConcurrency(chapterDirectories, 4, async (chapterEntry) => {
      const match = CHAPTER_DIR_RE.exec(chapterEntry.name);
      if (!match) return null;

      const number = parseInt(match[1], 10) + (match[2] ? parseInt(match[2], 10) / 10 : 0);
      let chapterDir;
      try {
        chapterDir = await assertLibraryPath(path.join(seriesDir, chapterEntry.name), root);
      } catch (_) {
        return null;
      }
      let chapterMetaPath = path.join(chapterDir, "metadata.json");
      try {
        chapterMetaPath = await assertLibraryPath(chapterMetaPath, root);
      } catch (_) {
        chapterMetaPath = null;
      }
      const chapterMeta = chapterMetaPath ? await readJson(fsPromises, chapterMetaPath) : {};
      const completion = await readJson(
        fsPromises,
        path.join(chapterDir, ".complete"),
      );
      const completedPageCount = Number.isInteger(completion.pages) && completion.pages >= 0
        ? completion.pages
        : null;
      const pageCount = completedPageCount ?? (await fsPromises.readdir(chapterDir))
        .filter((file) => file.endsWith(".jpg") && file !== "cover.jpg").length;
      return {
        number,
        title: `Chapter ${number}`,
        ...chapterMeta,
        directory: chapterDir,
        pageCount,
      };
    })).filter(Boolean);

    chapters.sort((a, b) => a.number - b.number);
    return {
      ...meta,
      directory: seriesDir,
      coverPath: (await exists(fsPromises, coverPath)) &&
        await assertLibraryPath(coverPath, root).then(() => true, () => false)
        ? coverPath : null,
      chapters,
    };
  })).filter(Boolean);
  return series;
}

module.exports = { scanLibrary };
