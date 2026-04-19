// Renderer-side ethernet plumbing.
//
// Outbound: the worker postMessages each frame the emulated Mac transmits;
// we forward it to the main process over IPC. Inbound: the main process sends
// frames back over IPC and we push them into a SharedArrayBuffer ring that the
// worker polls synchronously from inside the WASM main loop (which never
// yields to the JS event queue, so postMessage alone would not work).
//
// The ring layout matches src/basilisk/shared-buffers.js. The
// length-prefixed framing is the same scheme Infinite Mac uses
// (https://github.com/mihaip/infinite-mac, Apache-2.0).

const { ipcRenderer } = require("electron");
const { acquireLock, releaseLock } = require("./atomics");
const {
  InputBufferAddresses,
  ETHERNET_HEADER_INTS,
  ETHERNET_BODY_SIZE,
  ETHERNET_BUFFER_SIZE,
} = require("../basilisk/shared-buffers");

const ethernetReceiveBuffer = new SharedArrayBuffer(ETHERNET_BUFFER_SIZE);
const header = new Int32Array(ethernetReceiveBuffer, 0, ETHERNET_HEADER_INTS);
const body = new Uint8Array(
  ethernetReceiveBuffer,
  ETHERNET_HEADER_INTS * 4,
  ETHERNET_BODY_SIZE,
);
const bodyLen = body.length;

let inputBufferView = null;

function availableWrite() {
  const w = Atomics.load(header, 0);
  const r = Atomics.load(header, 1);
  return r > w ? r - w - 1 : bodyLen - (w - r) - 1;
}

function pushFrame(frame) {
  const need = frame.length + 2;
  if (need > availableWrite()) {
    console.warn("ethernet: receive ring full, dropping frame");
    return;
  }
  let w = Atomics.load(header, 0);
  body[w] = (frame.length >> 8) & 0xff;
  body[(w + 1) % bodyLen] = frame.length & 0xff;
  w = (w + 2) % bodyLen;
  for (let i = 0; i < frame.length; i++) {
    body[(w + i) % bodyLen] = frame[i];
  }
  Atomics.store(header, 0, (w + frame.length) % bodyLen);

  // Raise the ethernet interrupt flag so the emulator drains the queue
  // promptly instead of waiting for the next idle tick.
  if (
    inputBufferView &&
    acquireLock(inputBufferView, InputBufferAddresses.globalLockAddr)
  ) {
    inputBufferView[InputBufferAddresses.ethernetInterruptFlagAddr] = 1;
    releaseLock(inputBufferView, InputBufferAddresses.globalLockAddr);
  }
}

function setupEthernet(sharedInputBufferView) {
  inputBufferView = sharedInputBufferView;
  ipcRenderer.on("ethernet-receive", (_event, frame) => {
    pushFrame(new Uint8Array(frame));
  });
}

function handleEthernetInit(macAddress) {
  ipcRenderer.send("ethernet-init", macAddress);
}

function handleEthernetWrite(destination, packet) {
  ipcRenderer.send("ethernet-send", destination, packet);
}

module.exports = {
  ethernetReceiveBuffer,
  setupEthernet,
  handleEthernetInit,
  handleEthernetWrite,
};
