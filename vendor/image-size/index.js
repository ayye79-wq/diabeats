"use strict";

const fs = require("fs");
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_JPEG_SEGMENTS = 4096;

function inputBuffer(input) {
  const data = typeof input === "string" ? fs.readFileSync(input) : Buffer.from(input);
  if (!data.length || data.length > MAX_BYTES) throw new TypeError("Unsupported image input size");
  return data;
}

function jpegSize(data) {
  let offset = 2;
  for (let count = 0; count < MAX_JPEG_SEGMENTS && offset + 4 <= data.length; count += 1) {
    if (data[offset] !== 0xff) break;
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset++];
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length) break;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 7) {
      return { width: data.readUInt16BE(offset + 5), height: data.readUInt16BE(offset + 3), type: "jpg" };
    }
    offset += length;
  }
  throw new TypeError("Unsupported JPEG image");
}

function imageSize(input) {
  const data = inputBuffer(input);
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), type: "png" };
  }
  if (data.length >= 10 && data.subarray(0, 3).toString() === "GIF") {
    return { width: data.readUInt16LE(6), height: data.readUInt16LE(8), type: "gif" };
  }
  if (data.length >= 26 && data.subarray(0, 2).toString() === "BM") {
    return { width: Math.abs(data.readInt32LE(18)), height: Math.abs(data.readInt32LE(22)), type: "bmp" };
  }
  if (data.length >= 16 && data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP") {
    const chunk = data.subarray(12, 16).toString();
    if (chunk === "VP8X" && data.length >= 30) {
      return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3), type: "webp" };
    }
    if (chunk === "VP8 " && data.length >= 30) {
      return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff, type: "webp" };
    }
    if (chunk === "VP8L" && data.length >= 25) {
      const bits = data.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, type: "webp" };
    }
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) return jpegSize(data);
  throw new TypeError("Unsupported image format");
}

module.exports = imageSize;
module.exports.imageSize = imageSize;
module.exports.types = ["png", "jpg", "jpeg", "gif", "bmp", "webp"];