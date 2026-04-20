const { VIDEO_MODE_BUFFER_SIZE } = require("../basilisk/shared-buffers");

const videoModeBuffer = new SharedArrayBuffer(VIDEO_MODE_BUFFER_SIZE * 4);
const videoModeBufferView = new Int32Array(videoModeBuffer);

module.exports = {
  VIDEO_MODE_BUFFER_SIZE,
  videoModeBuffer,
  videoModeBufferView,
};
