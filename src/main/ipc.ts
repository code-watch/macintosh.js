import { ipcMain, app, BrowserWindow, dialog } from "electron";

import { setIsDevMode, getIsDevMode } from "./devmode";
import { getMainWindow } from "./windows";

export function registerIpcHandlers() {
  ipcMain.handle("quit", () => app.quit());

  ipcMain.handle("devtools", () => {
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.toggleDevTools(),
    );
  });

  ipcMain.handle("getIsDevMode", () => getIsDevMode());

  ipcMain.handle("setIsDevMode", (_event, set: boolean) => {
    setIsDevMode(set);
  });

  ipcMain.handle("showMessageBox", (_event, options) => {
    const mainWindow = getMainWindow();
    return mainWindow
      ? dialog.showMessageBox(mainWindow, options)
      : dialog.showMessageBox(options);
  });

  ipcMain.handle("showMessageBoxSync", (_event, options) => {
    const mainWindow = getMainWindow();
    return mainWindow
      ? dialog.showMessageBoxSync(mainWindow, options)
      : dialog.showMessageBoxSync(options);
  });

  ipcMain.handle("getAppVersion", () => {
    return app.getVersion();
  });

  ipcMain.handle("getUserDataPath", () => {
    return app.getPath("userData");
  });
}
