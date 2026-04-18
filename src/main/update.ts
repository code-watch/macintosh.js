import { app } from "electron";

export function setupUpdates() {
  if (app.isPackaged && process.platform !== "linux") {
    const { updateElectronApp } = require("update-electron-app");
    updateElectronApp({
      repo: "felixrieseberg/macintosh.js",
      updateInterval: "1 hour",
    });
  }
}
