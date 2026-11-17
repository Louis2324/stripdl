const INITIAL_CHECK_DELAY_MS = 10_000;
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000;

function sendStatus(getWindow, payload) {
  const window = getWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send("app:update-status", payload);
  }
}

function setupAutoUpdater({
  app,
  autoUpdater,
  dialog,
  getWindow,
  setTimeoutImpl = setTimeout,
  setIntervalImpl = setInterval,
  clearTimeoutImpl = clearTimeout,
  clearIntervalImpl = clearInterval,
  initialCheckDelayMs = INITIAL_CHECK_DELAY_MS,
  periodicCheckIntervalMs = PERIODIC_CHECK_INTERVAL_MS,
}) {
  if (!app.isPackaged) {
    return {
      checkForUpdates: async () => ({
        state: "unavailable",
        message: "Updates are checked only in packaged builds.",
      }),
      dispose() {},
    };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  let checkPromise = null;
  let updateDialogShown = false;

  const checkForUpdates = () => {
    if (checkPromise) return checkPromise;

    sendStatus(getWindow, { state: "checking" });
    checkPromise = Promise.resolve(autoUpdater.checkForUpdates())
      .catch((error) => {
        const message = error?.message || String(error);
        console.error(`Update check failed: ${message}`);
        sendStatus(getWindow, { state: "error", message });
        return { state: "error", message };
      })
      .finally(() => {
        checkPromise = null;
      });
    return checkPromise;
  };

  const onChecking = () => sendStatus(getWindow, { state: "checking" });
  const onAvailable = (info = {}) =>
    sendStatus(getWindow, { state: "available", version: info.version });
  const onNotAvailable = (info = {}) =>
    sendStatus(getWindow, {
      state: "not-available",
      version: info.version || app.getVersion(),
    });
  const onProgress = (progress = {}) =>
    sendStatus(getWindow, {
      state: "downloading",
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred,
      total: progress.total,
    });
  const onDownloaded = async (_event, _releaseNotes, releaseName) => {
    sendStatus(getWindow, {
      state: "downloaded",
      version: releaseName || "new version",
    });
    if (updateDialogShown) return;
    updateDialogShown = true;

    const options = {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Strip update ready",
      message: "A new version of Strip is ready to install.",
      detail: "Restart Strip now to apply the update, or continue and install it when you next quit.",
    };
    const window = getWindow();
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
    if (result.response === 0) autoUpdater.quitAndInstall();
  };
  const onError = (error) => {
    const message = error?.message || String(error);
    console.error(`Auto-update error: ${message}`);
    sendStatus(getWindow, { state: "error", message });
  };

  autoUpdater.on("checking-for-update", onChecking);
  autoUpdater.on("update-available", onAvailable);
  autoUpdater.on("update-not-available", onNotAvailable);
  autoUpdater.on("download-progress", onProgress);
  autoUpdater.on("update-downloaded", onDownloaded);
  autoUpdater.on("error", onError);

  const initialTimer = setTimeoutImpl(checkForUpdates, initialCheckDelayMs);
  const periodicTimer = setIntervalImpl(
    checkForUpdates,
    periodicCheckIntervalMs,
  );

  return {
    checkForUpdates,
    dispose() {
      clearTimeoutImpl(initialTimer);
      clearIntervalImpl(periodicTimer);
      autoUpdater.removeListener("checking-for-update", onChecking);
      autoUpdater.removeListener("update-available", onAvailable);
      autoUpdater.removeListener("update-not-available", onNotAvailable);
      autoUpdater.removeListener("download-progress", onProgress);
      autoUpdater.removeListener("update-downloaded", onDownloaded);
      autoUpdater.removeListener("error", onError);
    },
  };
}

module.exports = { setupAutoUpdater };
