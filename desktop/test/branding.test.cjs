const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("preload exposes a read-only runtime app version", () => {
  const preload = fs.readFileSync(path.join(root, "main", "preload.js"), "utf8");
  assert.match(preload, /app:\s*\{/);
  assert.match(preload, /version:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("app:version"\)/);
});

test("About view uses the runtime version and Strip logo", () => {
  const settings = fs.readFileSync(
    path.join(root, "renderer", "src", "views", "SettingsView.jsx"),
    "utf8",
  );
  assert.match(settings, /window\.strip\.app\.version\(\)/);
  assert.match(settings, /strip-logo\.png/);
  assert.doesNotMatch(settings, /strip v0\.3\.1/);
});

test("packaged renderer uses relative logo paths and keeps loading indicators", () => {
  const index = fs.readFileSync(
    path.join(root, "renderer", "index.html"),
    "utf8",
  );
  const sidebar = fs.readFileSync(
    path.join(root, "renderer", "src", "components", "Sidebar.jsx"),
    "utf8",
  );
  const settings = fs.readFileSync(
    path.join(root, "renderer", "src", "views", "SettingsView.jsx"),
    "utf8",
  );
  const library = fs.readFileSync(
    path.join(root, "renderer", "src", "views", "LibraryView.jsx"),
    "utf8",
  );
  const reader = fs.readFileSync(
    path.join(root, "renderer", "src", "views", "ReaderView.jsx"),
    "utf8",
  );

  assert.match(index, /href="strip-logo\.png"/);
  assert.match(sidebar, /src="strip-logo\.png"/);
  assert.match(settings, /src="strip-logo\.png"/);
  for (const source of [index, sidebar, settings]) {
    assert.doesNotMatch(source, /(?:src|href)="\/strip-logo\.png"/);
  }
  assert.match(library, /LoadingIndicator label="Loading library…"/);
  assert.match(reader, /LoadingIndicator label="Loading chapter pages…"/);
});

test("CLI build manifest includes every registered parser", () => {
  const build = fs.readFileSync(path.resolve(root, "..", "build_cli.py"), "utf8");
  for (const parser of ["webtoons", "weebcentral", "comix", "asurascans", "mangakakalot"]) {
    assert.match(build, new RegExp(`strip\\.parsers\\.${parser}`));
  }
});

test("CLI build status output is safe on Windows code pages", () => {
  const build = fs.readFileSync(path.resolve(root, "..", "build_cli.py"), "utf8");
  assert.doesNotMatch(build, /[✓✗]/);
});
