const { app, BrowserWindow, ipcMain, net, protocol } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { scanLibrary } = require("../../main/libraryScanner.cjs");
const { listChapterPages } = require("../../main/chapterPages.cjs");
const { assertLibraryPath } = require("../../main/pathSafety.cjs");

protocol.registerSchemesAsPrivileged([
  { scheme: "strip-file", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
app.disableHardwareAcceleration();

const waitFor = async (window, expression, timeout = 10000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
};

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "strip-reader-e2e-"));
  const series = path.join(root, "Sample-Series");
  const chapters = [path.join(series, "001"), path.join(series, "002")];
  await Promise.all(chapters.map((chapter) => fs.mkdir(chapter, { recursive: true })));
  await fs.writeFile(path.join(series, "metadata.json"), JSON.stringify({
    title: "Sample Series",
    author: "E2E Fixture",
    description: "Reader smoke fixture",
  }));
  const image = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAHgP//EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEAAQUCq//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8Bj//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQIBAT8Bj//EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEAAT8hH//Z",
    "base64",
  );
  await Promise.all(chapters.map(async (chapter) => {
    await fs.writeFile(path.join(chapter, ".complete"), JSON.stringify({ pages: 6 }));
    await Promise.all(Array.from({ length: 6 }, (_, index) =>
      fs.writeFile(path.join(chapter, `${String(index + 1).padStart(3, "0")}.jpg`), image),
    ));
  }));
  return { root, chapters };
}

async function main() {
  const fixture = await makeFixture();
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), "strip-reader-e2e-user-data-"));
  app.setPath("userData", userData);
  app.whenReady().then(async () => {
    protocol.handle("strip-file", async (request) => {
      try {
        const filePath = decodeURIComponent(new URL(request.url).pathname.slice(1));
        const safePath = await assertLibraryPath(filePath, fixture.root);
        return net.fetch(pathToFileURL(safePath).toString());
      } catch (error) {
        return new Response(`fixture protocol error: ${error.message}`, { status: 404 });
      }
    });

    const handlers = {
      "app:version": () => "e2e",
      "app:update:check": () => ({ state: "unavailable", message: "E2E" }),
      "config:get": () => ({ downloadDir: fixture.root, theme: "light", lazyLoading: true, preloadNextChapter: false, readingProgress: {}, schedules: {} }),
      "config:set": () => true,
      "library:scan": () => scanLibrary(fixture.root),
      "chapter:pages": (_, chapterDir) => listChapterPages(chapterDir, fixture.root),
      "progress:get": async (_, key) => {
        if (key === "Sample Series/1") return 4;
        if (key === "Sample Series/2") {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 4;
        }
        return null;
      },
      "progress:all": () => ({
        "Sample Series/1": 4,
        "Sample Series/lastRead": { chapterNumber: 1, pageIndex: 4, totalPages: 6 },
      }),
      "progress:savePosition": () => true,
      "schedule:get": () => ({}),
      "download:active": () => [],
      "theme:get": () => "light",
      "theme:set": () => true,
      "menu:chapterContext": () => "delete",
      "menu:seriesContext": () => "delete",
      "fs:deleteChapter": async (_, chapterDir) => {
        await fs.rm(chapterDir, { recursive: true, force: true });
        return { success: true, directory: chapterDir };
      },
      "fs:deleteSeries": async (_, seriesDir) => {
        await fs.rm(seriesDir, { recursive: true, force: true });
        return { success: true, directory: seriesDir };
      },
    };
    for (const [channel, handler] of Object.entries(handlers)) {
      ipcMain.handle(channel, handler);
    }

    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "../../out/preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    try {
      await window.loadFile(path.join(__dirname, "../../out/renderer/index.html"));
      await waitFor(window, "Boolean(document.querySelector('#view-library .series-card'))");
      await waitFor(window, "Boolean(document.querySelector('.series-card-continue-button')) && document.querySelector('.series-card-hover-details')?.textContent.includes('2 chapters')");
      await window.webContents.executeJavaScript("document.querySelector('#view-library .series-card').click()");
      await waitFor(window, "Boolean(document.querySelector('#view-series .chapter-row'))");
      await window.webContents.executeJavaScript(
        "document.querySelector('#view-series .btn-secondary').click()",
      );
      await waitFor(window, "Boolean(document.querySelector('#view-reader'))");
      await waitFor(window, "Boolean(document.querySelector('#reader-pages img'))");
      await waitFor(window, "document.querySelector('#reader-toolbar .reader-controls > span')?.textContent === '5 / 6'");
      await window.webContents.executeJavaScript(
        "document.querySelector('.reader-chapter-nav button:last-child').click()",
      );
      await waitFor(window, "document.querySelector('.reader-title-text')?.textContent.includes('Chapter 2')");
      await waitFor(window, "document.querySelector('#reader-toolbar .reader-controls > span')?.textContent === '1 / 6' && document.querySelector('#reader-container')?.scrollTop < 10");
      await waitFor(window, "Boolean(document.querySelector('#reader-pages img[alt=\"Page 1\"]'))");
      await window.webContents.executeJavaScript(
        "const container = document.querySelector('#reader-container'); container.scrollTop = container.scrollHeight; container.dispatchEvent(new Event('scroll', { bubbles: true }));",
      );
      await waitFor(window, "document.querySelector('#chapter-end-overlay')?.classList.contains('is-visible')");
      await waitFor(window, "document.querySelector('#btn-end-next-chapter')?.disabled === true && getComputedStyle(document.querySelector('#btn-end-next-chapter')).opacity === '0.5'");
      await window.webContents.executeJavaScript(
        "document.querySelector('#view-reader .btn.btn-ghost').click()",
      );
      await waitFor(window, "Boolean(document.querySelector('#view-series .chapter-row'))");

      await window.webContents.executeJavaScript(
        "document.querySelector('#view-series .chapter-row').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))",
      );
      await waitFor(window, "Boolean(document.querySelector('[role=alertdialog]'))");
      await window.webContents.executeJavaScript(
        "document.querySelector('[role=alertdialog] .btn-danger').click()",
      );
      await waitFor(window, "document.querySelectorAll('#view-series .chapter-row').length === 1");

      await window.webContents.executeJavaScript(
        "document.querySelector('#view-series .back-btn').click()",
      );
      await waitFor(window, "Boolean(document.querySelector('#view-library .series-card'))");
      await window.webContents.executeJavaScript(
        "document.querySelector('#view-library .series-card-delete-btn').click()",
      );
      await waitFor(window, "Boolean(document.querySelector('[role=alertdialog]'))");
      await window.webContents.executeJavaScript(
        "document.querySelector('[role=alertdialog] .btn-danger').click()",
      );
      await waitFor(window, "!document.querySelector('#view-library .series-card')");
      console.log("reader smoke passed: library -> series -> reader -> page -> delete chapter -> delete series");
      window.destroy();
      await fs.rm(fixture.root, { recursive: true, force: true });
      await fs.rm(userData, { recursive: true, force: true });
      app.exit(0);
    } catch (error) {
      console.error(error.stack || error);
      window.destroy();
      await fs.rm(fixture.root, { recursive: true, force: true });
      await fs.rm(userData, { recursive: true, force: true });
      app.exit(1);
    }
  });
}

main().catch((error) => {
  console.error(error.stack || error);
  app.exit(1);
});
