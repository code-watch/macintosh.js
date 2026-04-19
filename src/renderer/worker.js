const { ipcRenderer } = require("electron");
const { inputBuffer, inputBufferView } = require("./input");
const { videoModeBuffer } = require("./video");
const {
  screenBuffer,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  setCanvasBlank,
} = require("./screen");
const { audioDataBuffer, audioBlockChunkSize } = require("./audio");
const {
  ethernetReceiveBuffer,
  setupEthernet,
  handleEthernetInit,
  handleEthernetWrite,
} = require("./ethernet");
const { quit, getIsDevMode, getUserDataPath } = require("./ipc");

let isWorkerRunning = false;
let isWorkerSaving = false;
let worker;

function getIsWorkerRunning() {
  return isWorkerRunning;
}

function getIsWorkerSaving() {
  return isWorkerSaving;
}

function saveExtfs() {
  isWorkerSaving = true;
  document.querySelector("#disk_saving").classList.remove("hidden");
  worker.postMessage("save_extfs");
}

async function handleExtfsSaved() {
  isWorkerSaving = false;
  if (!(await getIsDevMode())) {
    quit();
  } else {
    alert(`We would usually quit, but developer mode is active`);
  }
}

async function handleWorkerShutdown() {
  document.body.classList.remove("emulator_running");
  await setCanvasBlank();
  saveExtfs();
}

async function registerWorker() {
  setupEthernet(inputBufferView);

  const config = {
    inputBuffer,
    screenBuffer,
    videoModeBuffer,
    audioDataBuffer,
    audioBlockChunkSize,
    ethernetReceiveBuffer,
    screenWidth: SCREEN_WIDTH,
    screenHeight: SCREEN_HEIGHT,
    userDataPath: await getUserDataPath(),
    isDevMode: await getIsDevMode(),
  };

  worker = window.emulatorWorker = new Worker(
    "../basilisk/BasiliskII-worker-boot.js",
  );

  isWorkerRunning = true;

  worker.postMessage({ type: "start", config });
  worker.onmessage = function (e) {
    const msg = e.data;
    switch (msg?.type) {
      case "emulator_loading": {
        const progressElement = document.querySelector("#progressbar");
        if (progressElement) {
          progressElement.value = Math.max(10, msg.completion * 100);
          progressElement.max = 100;
        }
        break;
      }
      case "emulator_video_open":
        document.body.classList.remove("emulator_loading");
        document.body.classList.add("emulator_running");
        break;
      case "emulator_quit":
        handleWorkerShutdown();
        break;
      case "extfs_saved":
        handleExtfsSaved();
        break;
      case "emulator_ethernet_init":
        handleEthernetInit(msg.macAddress);
        break;
      case "emulator_ethernet_write":
        handleEthernetWrite(msg.destination, msg.packet);
        break;
      case "emulator_set_clipboard_text":
        navigator.clipboard?.writeText(msg.text).catch(() => {});
        break;
      case "emulator_error":
        console.error("Emulator error", msg.error);
        ipcRenderer.invoke("showMessageBox", {
          type: "error",
          title: "Emulator error",
          message: msg.error,
        });
        break;
      case "showMessageBoxSync":
        ipcRenderer.invoke("showMessageBoxSync", msg.options);
        break;
      case "TTY":
        // Logged in the worker; nothing to do here.
        break;
    }
  };
}

module.exports = {
  registerWorker,
  getIsWorkerRunning,
  getIsWorkerSaving,
};
