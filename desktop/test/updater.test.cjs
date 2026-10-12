const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { setupAutoUpdater } = require("../main/updater.cjs");

function createWindow(statuses) {
  return {
    isDestroyed: () => false,
    webContents: {
      send: (_channel, payload) => statuses.push(payload),
    },
  };
}

test("auto-updater is unavailable during development", async () => {
  const autoUpdater = new EventEmitter();
  let timerCreated = false;
  const controller = setupAutoUpdater({
    app: { isPackaged: false },
    autoUpdater,
    dialog: {},
    getWindow: () => null,
    setTimeoutImpl: () => {
      timerCreated = true;
    },
  });

  assert.deepEqual(await controller.checkForUpdates(), {
    state: "unavailable",
    message: "Updates are checked only in packaged builds.",
  });
  assert.equal(timerCreated, false);
});

test("packaged auto-updater checks, reports status, and cleans up timers", async () => {
  const autoUpdater = new EventEmitter();
  let checkCount = 0;
  autoUpdater.checkForUpdates = async () => {
    checkCount += 1;
    return { updateInfo: { version: "0.5.1" } };
  };
  autoUpdater.quitAndInstall = () => {};

  const statuses = [];
  const timers = [];
  const intervals = [];
  const clearedTimers = [];
  const clearedIntervals = [];
  const controller = setupAutoUpdater({
    app: { isPackaged: true, getVersion: () => "0.5.0" },
    autoUpdater,
    dialog: { showMessageBox: async () => ({ response: 1 }) },
    getWindow: () => createWindow(statuses),
    setTimeoutImpl: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    setIntervalImpl: (callback, delay) => {
      intervals.push({ callback, delay });
      return intervals.length;
    },
    clearTimeoutImpl: (timer) => clearedTimers.push(timer),
    clearIntervalImpl: (timer) => clearedIntervals.push(timer),
    initialCheckDelayMs: 25,
    periodicCheckIntervalMs: 50,
  });

  assert.equal(autoUpdater.autoDownload, true);
  assert.equal(autoUpdater.autoInstallOnAppQuit, true);
  assert.deepEqual(await controller.checkForUpdates(), {
    updateInfo: { version: "0.5.1" },
  });
  assert.equal(checkCount, 1);
  autoUpdater.emit("update-available", { version: "0.5.1" });
  autoUpdater.emit("download-progress", { percent: 42.4, transferred: 4, total: 10 });
  autoUpdater.emit("update-not-available", { version: "0.5.0" });
  assert.deepEqual(statuses, [
    { state: "checking" },
    { state: "available", version: "0.5.1" },
    { state: "downloading", percent: 42, transferred: 4, total: 10 },
    { state: "not-available", version: "0.5.0" },
  ]);

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 25);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].delay, 50);
  controller.dispose();
  assert.deepEqual(clearedTimers, [1]);
  assert.deepEqual(clearedIntervals, [1]);
  assert.equal(autoUpdater.listenerCount("update-available"), 0);
});
