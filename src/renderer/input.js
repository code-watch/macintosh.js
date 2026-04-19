const { acquireLock, releaseLock } = require("./atomics");
const {
  InputBufferAddresses,
  INPUT_BUFFER_SIZE,
} = require("../basilisk/shared-buffers");
const { JS_CODE_TO_ADB_KEYCODE } = require("../basilisk/key-codes");
const { SCREEN_WIDTH, SCREEN_HEIGHT } = require("./screen");

const inputBuffer = new SharedArrayBuffer(INPUT_BUFFER_SIZE * 4);
const inputBufferView = new Int32Array(inputBuffer);

let inputQueue = [];

function releaseInputLock() {
  releaseLock(inputBufferView, InputBufferAddresses.globalLockAddr);
}

function tryToSendInput() {
  if (!inputQueue.length) return;
  if (!acquireLock(inputBufferView, InputBufferAddresses.globalLockAddr)) {
    return;
  }

  let hasMousePosition = false;
  let mousePositionX = 0;
  let mousePositionY = 0;
  let mouseButtonState = -1;
  let mouseButton2State = -1;
  let hasKeyEvent = false;
  let keyCode = -1;
  let keyState = -1;
  const remaining = [];

  for (const ev of inputQueue) {
    switch (ev.type) {
      case "mousemove":
        hasMousePosition = true;
        mousePositionX = ev.x;
        mousePositionY = ev.y;
        break;
      case "mousedown":
      case "mouseup":
        if (ev.button === 2) {
          mouseButton2State = ev.type === "mousedown" ? 1 : 0;
        } else {
          mouseButtonState = ev.type === "mousedown" ? 1 : 0;
        }
        break;
      case "keydown":
      case "keyup":
        if (hasKeyEvent) {
          remaining.push(ev);
          break;
        }
        hasKeyEvent = true;
        keyState = ev.type === "keydown" ? 1 : 0;
        keyCode = ev.keyCode;
        break;
    }
  }

  if (hasMousePosition) {
    inputBufferView[InputBufferAddresses.mousePositionFlagAddr] = 1;
    inputBufferView[InputBufferAddresses.mousePositionXAddr] = mousePositionX;
    inputBufferView[InputBufferAddresses.mousePositionYAddr] = mousePositionY;
  }
  inputBufferView[InputBufferAddresses.mouseButtonStateAddr] = mouseButtonState;
  inputBufferView[InputBufferAddresses.mouseButton2StateAddr] =
    mouseButton2State;
  if (hasKeyEvent) {
    inputBufferView[InputBufferAddresses.keyEventFlagAddr] = 1;
    inputBufferView[InputBufferAddresses.keyCodeAddr] = keyCode;
    inputBufferView[InputBufferAddresses.keyStateAddr] = keyState;
  }

  releaseInputLock();
  inputQueue = remaining;
}

let canvasRect = canvas.getBoundingClientRect();
window.addEventListener("resize", () => {
  canvasRect = canvas.getBoundingClientRect();
});

function canvasToEmulator(event) {
  return {
    x: Math.round(
      ((event.clientX - canvasRect.left) * SCREEN_WIDTH) / canvasRect.width,
    ),
    y: Math.round(
      ((event.clientY - canvasRect.top) * SCREEN_HEIGHT) / canvasRect.height,
    ),
  };
}

canvas.addEventListener("mousemove", function (event) {
  inputQueue.push({ type: "mousemove", ...canvasToEmulator(event) });
});

canvas.addEventListener("mousedown", function (event) {
  inputQueue.push({ type: "mousedown", button: event.button });
});

canvas.addEventListener("mouseup", function (event) {
  inputQueue.push({ type: "mouseup", button: event.button });
});

window.addEventListener("keydown", function (event) {
  const adb = JS_CODE_TO_ADB_KEYCODE[event.code];
  if (adb === undefined) return;
  event.preventDefault();
  inputQueue.push({ type: "keydown", keyCode: adb });
});

window.addEventListener("keyup", function (event) {
  const adb = JS_CODE_TO_ADB_KEYCODE[event.code];
  if (adb === undefined) return;
  event.preventDefault();
  inputQueue.push({ type: "keyup", keyCode: adb });
});

module.exports = {
  inputBuffer,
  inputBufferView,
  tryToSendInput,
};
