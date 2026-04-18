import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

const appDataPath = app.getPath("userData");
const devFilePath = path.join(appDataPath, "developer");

let isDevMode: boolean | undefined;

export function getIsDevMode(): boolean {
  if (isDevMode !== undefined) {
    return isDevMode;
  }

  return (isDevMode = !app.isPackaged || fs.existsSync(devFilePath));
}

export function setIsDevMode(set: boolean) {
  if (set && !getIsDevMode()) {
    fs.writeFileSync(
      devFilePath,
      `So you're a developer, huh? Neat! Welcome aboard!`,
    );
  } else if (!set && getIsDevMode()) {
    fs.unlinkSync(devFilePath);
  }

  isDevMode = set;
}
