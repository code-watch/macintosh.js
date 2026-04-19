// Emulator worker boot for the Infinite Mac WebAssembly build of Basilisk II.
//
// This file implements the `workerApi` global that the vendored
// `BasiliskII.js`/`BasiliskII.wasm` calls back into for video, input, audio,
// disk, clipboard and ethernet. The shape of that API and the shared-memory
// buffer protocol are taken from Infinite Mac
// (https://github.com/mihaip/infinite-mac, Copyright Mihai Parparita,
// Apache License 2.0 — see LICENSE-infinite-mac). The implementation here is
// macintosh.js-specific: it uses Node `fs` (available via
// `nodeIntegrationInWorker`) for direct disk-image I/O and to populate the
// extfs `macintosh.js` shared folder, instead of Infinite Mac's
// chunked-HTTP / OPFS layers.

const fs = require("fs");
const path = require("path");

const {
  InputBufferAddresses,
  LockStates,
  ETHERNET_HEADER_INTS,
  ETHERNET_BODY_SIZE,
} = require("./shared-buffers");

const homeDir = require("os").homedir();
const macDir = path.join(homeDir, "macintosh.js");

let userDataPath;
let Module = null;

// ---------------------------------------------------------------------------
// Disk helpers (host ~/macintosh.js folder)
// ---------------------------------------------------------------------------

function isHiddenFile(name = "") {
  return name.startsWith(".");
}

function isCDImage(name = "") {
  const lower = name.toLowerCase();
  return lower.endsWith(".iso") || lower.endsWith(".toast");
}

function isDiskImage(name = "") {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".img") || lower.endsWith(".dsk") || lower.endsWith(".hda")
  );
}

function getUserDataDiskPath() {
  return path.join(userDataPath, "disk");
}

function ensureUserDataDiskImage() {
  const diskImageUserPath = getUserDataDiskPath();
  const diskImagePath = path.join(__dirname, "disk");

  if (!fs.existsSync(diskImageUserPath)) {
    try {
      fs.renameSync(diskImagePath, diskImageUserPath);
    } catch (error) {
      fs.copyFileSync(diskImagePath, diskImageUserPath);
    }
  }
}

function getUserImages() {
  const result = [];
  try {
    if (!fs.existsSync(macDir)) return result;
    const macDirFiles = fs.readdirSync(macDir);
    let i = 0;
    for (const fileName of macDirFiles) {
      const full = path.join(macDir, fileName);
      if (!fs.statSync(full).isFile()) continue;
      if (!isDiskImage(fileName) && !isCDImage(fileName)) continue;
      const safeName = `user_image_${i++}_${fileName.replace(/[^\w\s.]/gi, "")}`;
      result.push({
        name: safeName,
        hostPath: full,
        readOnly: isCDImage(fileName),
      });
    }
  } catch (error) {
    console.error(`getUserImages: error`, error);
  }
  return result;
}

// ---------------------------------------------------------------------------
// extfs: copy host ~/macintosh.js into MEMFS at boot, and back out on save
// ---------------------------------------------------------------------------

function preloadExtfsTree(FS, hostBase, virtualBase) {
  let entries;
  try {
    entries = fs.readdirSync(hostBase);
  } catch (error) {
    console.error(`extfs preload: cannot read ${hostBase}`, error);
    return;
  }
  for (const name of entries) {
    if (isHiddenFile(name) || isDiskImage(name) || isCDImage(name)) continue;
    const hostPath = path.join(hostBase, name);
    const virtualPath = `${virtualBase}/${name}`;
    let stat;
    try {
      stat = fs.statSync(hostPath);
    } catch (error) {
      console.error(`extfs preload: cannot stat ${hostPath}`, error);
      continue;
    }
    if (stat.isDirectory()) {
      try {
        FS.mkdir(virtualPath);
      } catch (error) {
        // already exists
      }
      preloadExtfsTree(FS, hostPath, virtualPath);
    } else if (stat.isFile()) {
      try {
        const data = fs.readFileSync(hostPath);
        FS.createDataFile(virtualBase, name, data, true, true, true);
      } catch (error) {
        postMessage({
          type: "showMessageBoxSync",
          options: {
            type: "error",
            title: "Could not transfer file",
            message: `We tried to transfer ${name} to the virtual machine, but failed. The error was: ${error}`,
          },
        });
      }
    }
  }
}

async function saveExtfsTree(FS, virtualBase, hostBase) {
  let entries;
  try {
    entries = FS.readdir(virtualBase).filter((v) => !v.startsWith("."));
  } catch (error) {
    console.error(`extfs save: cannot read ${virtualBase}`, error);
    return;
  }
  if (!fs.existsSync(hostBase)) {
    fs.mkdirSync(hostBase, { recursive: true });
  }
  for (const name of entries) {
    const virtualPath = `${virtualBase}/${name}`;
    const hostPath = path.join(hostBase, name);
    try {
      const stat = FS.analyzePath(virtualPath);
      if (stat?.object?.isFolder) {
        await saveExtfsTree(FS, virtualPath, hostPath);
      } else if (stat?.object?.contents) {
        await fs.promises.writeFile(hostPath, stat.object.contents);
      }
    } catch (error) {
      postMessage({
        type: "showMessageBoxSync",
        options: {
          type: "error",
          title: "Could not save file",
          message: `We tried to save the file "${name}" from the virtual machine, but failed. The error was: ${error}`,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Disk API: direct host-file I/O (no MEMFS copy of the boot disk).
// Mirrors the `workerApi.disks` interface that the WASM calls via EM_JS.
// ---------------------------------------------------------------------------

function createDisksApi(diskSpecs, getHeap) {
  const byName = new Map(diskSpecs.map((d) => [d.name, d]));
  const opened = new Map();
  let nextId = 0;

  return {
    open(name) {
      const spec = byName.get(name);
      if (!spec) {
        console.warn(`disks.open: unknown disk "${name}"`);
        return -1;
      }
      try {
        const flags = spec.readOnly ? "r" : "r+";
        const fd = fs.openSync(spec.hostPath, flags);
        const size = fs.fstatSync(fd).size;
        const id = nextId++;
        opened.set(id, { fd, size, readOnly: !!spec.readOnly });
        return id;
      } catch (error) {
        console.error(`disks.open: failed for ${spec.hostPath}`, error);
        return -1;
      }
    },
    close(id) {
      const entry = opened.get(id);
      if (!entry) return;
      try {
        fs.closeSync(entry.fd);
      } catch (error) {
        // ignore
      }
      opened.delete(id);
    },
    read(id, bufPtr, offset, length) {
      const entry = opened.get(id);
      if (!entry) return -1;
      try {
        return fs.readSync(entry.fd, getHeap(), bufPtr, length, offset);
      } catch (error) {
        console.error(`disks.read failed`, error);
        return -1;
      }
    },
    write(id, bufPtr, offset, length) {
      const entry = opened.get(id);
      if (!entry || entry.readOnly) return -1;
      try {
        return fs.writeSync(entry.fd, getHeap(), bufPtr, length, offset);
      } catch (error) {
        console.error(`disks.write failed`, error);
        return -1;
      }
    },
    size(id) {
      const entry = opened.get(id);
      return entry ? entry.size : 0;
    },
    isMediaPresent() {
      return true;
    },
    isFixedDisk() {
      return true;
    },
    eject() {},
  };
}

// ---------------------------------------------------------------------------
// Ethernet receive ring (worker side). The renderer pushes inbound frames
// into the SharedArrayBuffer; the WASM polls etherRead() each input tick.
// ---------------------------------------------------------------------------

function createEthernetReader(receiveBuffer) {
  if (!receiveBuffer) return () => 0;
  const header = new Int32Array(receiveBuffer, 0, ETHERNET_HEADER_INTS);
  const body = new Uint8Array(
    receiveBuffer,
    ETHERNET_HEADER_INTS * 4,
    ETHERNET_BODY_SIZE,
  );
  const bodyLen = body.length;

  return function read(dest) {
    const writeIdx = Atomics.load(header, 0);
    let readIdx = Atomics.load(header, 1);
    if (readIdx === writeIdx) return 0;

    const hi = body[readIdx];
    const lo = body[(readIdx + 1) % bodyLen];
    const len = (hi << 8) | lo;
    readIdx = (readIdx + 2) % bodyLen;

    if (len > dest.length) {
      // Drop oversized frame but still advance.
      readIdx = (readIdx + len) % bodyLen;
      Atomics.store(header, 1, readIdx);
      return 0;
    }
    for (let i = 0; i < len; i++) {
      dest[i] = body[(readIdx + i) % bodyLen];
    }
    Atomics.store(header, 1, (readIdx + len) % bodyLen);
    return len;
  };
}

// ---------------------------------------------------------------------------
// Prefs
// ---------------------------------------------------------------------------

function buildPrefs(screenWidth, screenHeight, userImages) {
  const template = fs.readFileSync(path.join(__dirname, "prefs_template"), {
    encoding: "utf-8",
  });
  let prefs = template.replace(/\r\n/g, "\n");
  prefs += `screen win/${screenWidth}/${screenHeight}\n`;
  for (const img of userImages) {
    prefs += `disk ${img.readOnly ? "*" : ""}${img.name}\n`;
  }
  return prefs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

self.onmessage = async function (msg) {
  if (msg?.data?.type === "start") {
    startEmulator(msg.data.config);
  } else if (msg?.data === "save_extfs") {
    if (Module?.FS) {
      await saveExtfsTree(Module.FS, "/macintosh.js", macDir);
    }
    postMessage({ type: "extfs_saved" });
  }
};

async function startEmulator(config) {
  userDataPath = config.userDataPath;
  ensureUserDataDiskImage();

  const inputBufferView = new Int32Array(config.inputBuffer);
  const screenBufferView = new Uint8Array(config.screenBuffer);
  const videoModeBufferView = new Int32Array(config.videoModeBuffer);
  const audioDataBufferView = new Uint8Array(config.audioDataBuffer);
  const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
  const ethernetRead = createEthernetReader(config.ethernetReceiveBuffer);

  const userImages = getUserImages();
  const diskSpecs = [
    { name: "disk", hostPath: getUserDataDiskPath(), readOnly: false },
    ...userImages,
  ];
  const prefs = buildPrefs(config.screenWidth, config.screenHeight, userImages);
  const romData = fs.readFileSync(path.join(__dirname, "rom"));
  const wasmBytes = fs.readFileSync(path.join(__dirname, "BasiliskII.wasm"));

  let nextAudioChunkIndex = 0;
  let lastBlitFrameId = 0;
  let lastIdleWaitFrameId = 0;
  let nextExpectedBlitTime = 0;

  const workerApi = {
    InputBufferAddresses,

    idleWait() {
      if (lastIdleWaitFrameId === lastBlitFrameId) return false;
      lastIdleWaitFrameId = lastBlitFrameId;
      const timeout = Math.max(0, nextExpectedBlitTime - performance.now());
      const result = Atomics.wait(
        inputBufferView,
        InputBufferAddresses.globalLockAddr,
        LockStates.READY_FOR_UI_THREAD,
        timeout,
      );
      return result === "ok";
    },

    sleep(timeSeconds) {
      Atomics.wait(sleepBuffer, 0, 0, timeSeconds * 1000);
    },

    didOpenVideo(width, height) {
      postMessage({ type: "emulator_video_open", width, height });
    },

    blit(bufPtr, bufSize) {
      lastBlitFrameId++;
      if (bufPtr) {
        const data = Module.HEAPU8.subarray(bufPtr, bufPtr + bufSize);
        videoModeBufferView[0] = bufSize;
        screenBufferView.set(data);
      }
      nextExpectedBlitTime = performance.now() + 16;
    },

    didOpenAudio(sampleRate, sampleSize, channels) {
      postMessage({
        type: "emulator_audio_open",
        sampleRate,
        sampleSize,
        channels,
      });
    },

    audioBufferSize() {
      return 0;
    },

    enqueueAudio(bufPtr, nbytes) {
      const chunkCapacity = config.audioBlockChunkSize - 2;
      if (nbytes > chunkCapacity) nbytes = chunkCapacity;
      const newAudio = Module.HEAPU8.subarray(bufPtr, bufPtr + nbytes);
      const writingChunkAddr = nextAudioChunkIndex * config.audioBlockChunkSize;
      if (audioDataBufferView[writingChunkAddr] === LockStates.UI_THREAD_LOCK) {
        return;
      }
      let nextNext = nextAudioChunkIndex + 1;
      if (
        nextNext * config.audioBlockChunkSize >
        audioDataBufferView.length - 1
      ) {
        nextNext = 0;
      }
      audioDataBufferView[writingChunkAddr + 1] = nextNext;
      audioDataBufferView.set(newAudio, writingChunkAddr + 2);
      audioDataBufferView[writingChunkAddr] = LockStates.UI_THREAD_LOCK;
      nextAudioChunkIndex = nextNext;
    },

    acquireInputLock() {
      const res = Atomics.compareExchange(
        inputBufferView,
        InputBufferAddresses.globalLockAddr,
        LockStates.READY_FOR_EMUL_THREAD,
        LockStates.EMUL_THREAD_LOCK,
      );
      return res === LockStates.READY_FOR_EMUL_THREAD ? 1 : 0;
    },

    releaseInputLock() {
      inputBufferView[InputBufferAddresses.mousePositionFlagAddr] = 0;
      inputBufferView[InputBufferAddresses.mousePositionXAddr] = 0;
      inputBufferView[InputBufferAddresses.mousePositionYAddr] = 0;
      inputBufferView[InputBufferAddresses.mouseButtonStateAddr] = 0;
      inputBufferView[InputBufferAddresses.mouseButton2StateAddr] = 0;
      inputBufferView[InputBufferAddresses.keyEventFlagAddr] = 0;
      inputBufferView[InputBufferAddresses.keyCodeAddr] = 0;
      inputBufferView[InputBufferAddresses.keyStateAddr] = 0;
      inputBufferView[InputBufferAddresses.ethernetInterruptFlagAddr] = 0;
      Atomics.store(
        inputBufferView,
        InputBufferAddresses.globalLockAddr,
        LockStates.READY_FOR_UI_THREAD,
      );
    },

    getInputValue(addr) {
      return inputBufferView[addr];
    },

    etherSeed() {
      return Math.floor(Math.random() * 0xffffffff);
    },

    etherInit(macAddress) {
      postMessage({ type: "emulator_ethernet_init", macAddress });
    },

    etherWrite(destination, packetPtr, packetLength) {
      const packet = Module.HEAPU8.slice(packetPtr, packetPtr + packetLength);
      postMessage(
        { type: "emulator_ethernet_write", destination, packet },
        [packet.buffer],
      );
    },

    etherRead(packetPtr, packetMaxLength) {
      const dest = Module.HEAPU8.subarray(
        packetPtr,
        packetPtr + packetMaxLength,
      );
      return ethernetRead(dest);
    },

    setClipboardText(text) {
      postMessage({ type: "emulator_set_clipboard_text", text });
    },

    getClipboardText() {
      return undefined;
    },

    disks: createDisksApi(diskSpecs, () => Module.HEAPU8),
  };

  globalThis.workerApi = workerApi;

  const moduleOverrides = {
    arguments: ["--config", "prefs"],

    instantiateWasm(imports, successCallback) {
      WebAssembly.instantiate(wasmBytes, imports)
        .then((output) => successCallback(output.instance))
        .catch((error) => {
          console.error("WASM instantiate failed", error);
          postMessage({
            type: "emulator_error",
            error: String(error?.stack || error),
          });
        });
      return {};
    },

    preRun: [
      function () {
        const FS = moduleOverrides.FS;
        FS.createDataFile("/", "prefs", prefs, true, true, true);
        FS.createDataFile("/", "rom", romData, true, true, true);
        FS.mkdir("/macintosh.js");
        if (fs.existsSync(macDir)) {
          preloadExtfsTree(FS, macDir, "/macintosh.js");
        }
        postMessage({ type: "emulator_loading", completion: 1 });
      },
    ],

    onRuntimeInitialized() {
      postMessage({ type: "emulator_ready" });
    },

    print(message) {
      console.log(message);
      postMessage({ type: "TTY", data: message });
    },

    printErr(message) {
      console.warn(message);
      postMessage({ type: "TTY", data: message });
    },

    quit(status) {
      console.log("Emulator quit with status", status);
      postMessage({ type: "emulator_quit", status });
    },
  };

  Module = moduleOverrides;

  try {
    const { default: emulator } = await import("./BasiliskII.js");
    emulator(moduleOverrides);
  } catch (error) {
    console.error("Failed to start emulator", error);
    postMessage({
      type: "emulator_error",
      error: String(error?.stack || error),
    });
  }
}
