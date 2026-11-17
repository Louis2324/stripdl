const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { listChapterPages } = require("../main/chapterPages.cjs");

async function makeChapter(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "strip-pages-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const chapter = path.join(root, "Series", "001");
  await fs.mkdir(chapter, { recursive: true });
  for (const name of ["010.jpg", "cover.jpg", "002.jpg", "001.jpg", "notes.txt"]) {
    await fs.writeFile(path.join(chapter, name), "page");
  }

  return { root, chapter };
}

test("enumerates sorted chapter pages without validating each page first", async (t) => {
  const { root, chapter } = await makeChapter(t);
  const validations = [];

  const pages = await listChapterPages(
    chapter,
    root,
    fs,
    async (target, libraryRoot) => {
      validations.push({ target, libraryRoot });
      return target;
    },
  );

  assert.deepEqual(pages.map((page) => path.basename(page)), [
    "001.jpg",
    "002.jpg",
    "010.jpg",
  ]);
  assert.equal(validations.length, 1);
  assert.equal(validations[0].target, chapter);
  assert.equal(validations[0].libraryRoot, root);
});

test("rejects a chapter directory outside the library root", async (t) => {
  const { root } = await makeChapter(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "strip-pages-outside-"));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));

  await assert.rejects(
    listChapterPages(path.join(outside, "001"), root),
  );
});
