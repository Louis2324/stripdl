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
  const chapter = path.join(series, "001");
  await fs.mkdir(chapter, { recursive: true });
  await fs.writeFile(path.join(series, "metadata.json"), JSON.stringify({
    title: "Sample Series",
    author: "E2E Fixture",
    description: "Reader smoke fixture",
  }));
  await fs.writeFile(path.join(chapter, ".complete"), JSON.stringify({ pages: 1 }));
  await fs.writeFile(path.join(chapter, "001.jpg"), Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAHgP//EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEAAQUCq//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8Bj//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQIBAT8Bj//EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEAAT8hH//Z",
    "base64",
  ));
  return { root, chapter };
}

async function main() {
  const fixture = await makeFixture();
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
      "progress:get": () => null,
      "progress:all": () => ({}),
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
      await window.webContents.executeJavaScript("document.querySelector('#view-library .series-card').click()");
      await waitFor(window, "Boolean(document.querySelector('#view-series .chapter-row'))");
      await window.webContents.executeJavaScript("document.querySelector('#view-series .chapter-row').click()");
      await waitFor(window, "Boolean(document.querySelector('#view-reader'))");
      await waitFor(window, "Boolean(document.querySelector('#reader-pages img'))");
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
      await waitFor(window, "!document.querySelector('#view-series .chapter-row')");

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
      app.exit(0);
    } catch (error) {
      console.error(error.stack || error);
      window.destroy();
      await fs.rm(fixture.root, { recursive: true, force: true });
      app.exit(1);
    }
  });
}

main().catch((error) => {
  console.error(error.stack || error);
  app.exit(1);
});
