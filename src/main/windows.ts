import { BrowserWindow, shell } from "electron";
import * as path from "path";
import { pathToFileURL } from "url";

import { getIsDevMode } from "./devmode";

const windowList: Record<string, BrowserWindow> = {};
let mainWindow: BrowserWindow | null = null;

export function getMainWindow() {
  return mainWindow;
}

export function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 730,
    useContentSize: true,
    frame: true,
    transparent: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      contextIsolation: false,
      navigateOnDragDrop: false,
      sandbox: false,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadFile("./src/renderer/index.html");

  // Disable menu
  mainWindow.setMenu(null);

  // Child windows get full node integration, so only allow the two local
  // pages we actually open. Anything else is either sent to the system
  // browser (http/https) or dropped.
  const rendererDir = path.resolve(__dirname, "../../../src/renderer");
  const childPages = new Set(
    ["help.html", "credits.html"].map((p) =>
      pathToFileURL(path.join(rendererDir, p)).toString(),
    ),
  );

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!childPages.has(url)) {
      if (url.startsWith("https://") || url.startsWith("http://")) {
        shell.openExternal(url);
      }
      return { action: "deny" };
    }

    if (windowList[url]) {
      windowList[url].focus();
      return { action: "deny" };
    }

    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        parent: mainWindow ?? undefined,
        width: 350,
        height: 630,
        frame: true,
        transparent: false,
        resizable: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          navigateOnDragDrop: false,
          sandbox: false,
        },
      },
    };
  });

  mainWindow.webContents.on("did-create-window", (childWindow, { url }) => {
    childWindow.webContents.on("will-navigate", (event, navUrl) => {
      if (navUrl.startsWith("http")) {
        event.preventDefault();
        shell.openExternal(navUrl);
      }
    });

    childWindow.setMenu(null);
    windowList[url] = childWindow;

    if (getIsDevMode()) {
      childWindow.webContents.toggleDevTools();
    }

    childWindow.on("closed", () => {
      delete windowList[url];
    });
  });

  if (getIsDevMode()) {
    mainWindow.webContents.toggleDevTools();
  }
}
