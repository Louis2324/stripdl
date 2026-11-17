const fs = require("node:fs/promises");
const path = require("node:path");
const { assertChapterPath } = require("./pathSafety.cjs");

/**
 * Return the readable image paths for a chapter without resolving every page
 * through the library-root realpath check before the renderer can start.
 *
 * The chapter directory is validated here. Each returned file is validated
 * again by the strip-file protocol when Chromium requests it, so moving the
 * per-page check out of this initial enumeration does not weaken the path
 * boundary or symlink protection.
 */
async function listChapterPages(
  chapterDir,
  libraryRoot,
  fsPromises = fs,
  validateChapterPath = assertChapterPath,
) {
  const safeChapterDir = await validateChapterPath(chapterDir, libraryRoot);
  const names = await fsPromises.readdir(safeChapterDir);

  return names
    .filter((name) => name.endsWith(".jpg") && !name.startsWith("cover"))
    .sort()
    .map((name) => path.join(safeChapterDir, name));
}

module.exports = { listChapterPages };
