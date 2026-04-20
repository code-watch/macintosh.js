const { videoModeBufferView } = require("./video");

const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
const SCREEN_BUFFER_SIZE = SCREEN_WIDTH * SCREEN_HEIGHT * 4; // RGBA

const screenBuffer = new SharedArrayBuffer(SCREEN_BUFFER_SIZE);
const screenBufferView = new Uint8Array(screenBuffer);

canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;

const canvasCtx = canvas.getContext("2d");
const imageData = canvasCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

function fitCanvas() {
  let h = window.innerHeight - 35;
  let w = Math.floor(h * (4 / 3));
  if (w > window.innerWidth) {
    w = window.innerWidth;
    h = Math.floor(w * 0.75);
  }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

window.addEventListener("resize", fitCanvas);
fitCanvas();

let stopDrawing = false;

function drawScreen() {
  if (stopDrawing) return;
  const len = videoModeBufferView[0];
  if (len > 0) {
    imageData.data.set(screenBufferView.subarray(0, len));
    canvasCtx.putImageData(imageData, 0, 0);
  }
}

function setCanvasBlank() {
  return new Promise((resolve) => {
    stopDrawing = true;
    const ctx = canvas.getContext("2d");
    const bg = new Image();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    bg.onload = () => {
      const pattern = ctx.createPattern(bg, "repeat");
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      resolve();
    };
    bg.src = "images/off_bg.png";
  });
}

module.exports = {
  screenBuffer,
  screenBufferView,
  SCREEN_BUFFER_SIZE,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  drawScreen,
  setCanvasBlank,
};
