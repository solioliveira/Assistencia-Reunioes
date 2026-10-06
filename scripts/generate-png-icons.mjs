import fs from 'fs';
import zlib from 'zlib';

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = createCRC32Table();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const typeAndData = buf.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function generatePng(size, isMaskable = false) {
  const width = size;
  const height = size;
  // Raw scanlines: each row has 1 filter byte (0) followed by width * 4 bytes (RGBA)
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowLength);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r = 30, g = 58, b = 138, a = 255; // Dark Slate Blue #1e3a8a

      if (isMaskable) {
        // Full bleed background with subtle gradient
        const t = y / height;
        r = Math.round(30 + t * 15);
        g = Math.round(58 + t * 25);
        b = Math.round(138 + t * 45); // Deep royal blue
      } else {
        // Squircle/rounded card
        const cornerR = width * 0.22;
        const qx = Math.max(0, Math.abs(dx) - (cx - cornerR));
        const qy = Math.max(0, Math.abs(dy) - (cy - cornerR));
        const qDist = Math.sqrt(qx * qx + qy * qy);

        if (qDist > cornerR) {
          a = 0; // Transparent outside rounded rect
        } else {
          const t = (y + x) / (width * 2);
          r = Math.round(26 + t * 20);
          g = Math.round(50 + t * 35);
          b = Math.round(130 + t * 60);
        }
      }

      // Draw stylized "Checkmark & Group icon" in center
      if (a > 0) {
        // Circular inner container (accent)
        const innerRadius = width * (isMaskable ? 0.32 : 0.35);
        if (dist <= innerRadius) {
          // Inner circle #2563eb / #3b82f6
          r = 37; g = 99; b = 235;

          // Stylized checkmark
          // Vertex 1: (cx - innerRadius*0.45, cy)
          // Vertex 2: (cx - innerRadius*0.1, cy + innerRadius*0.4)
          // Vertex 3: (cx + innerRadius*0.5, cy - innerRadius*0.4)
          const p1x = cx - innerRadius * 0.45, p1y = cy + innerRadius * 0.05;
          const p2x = cx - innerRadius * 0.1, p2y = cy + innerRadius * 0.42;
          const p3x = cx + innerRadius * 0.48, p3y = cy - innerRadius * 0.38;

          // Distance to segments
          function distToSegment(px, py, x1, y1, x2, y2) {
            const l2 = (x2 - x1)**2 + (y2 - y1)**2;
            if (l2 === 0) return Math.hypot(px - x1, py - y1);
            let t = ((px - x1)*(x2 - x1) + (py - y1)*(y2 - y1)) / l2;
            t = Math.max(0, Math.min(1, t));
            return Math.hypot(px - (x1 + t*(x2 - x1)), py - (y1 + t*(y2 - y1)));
          }

          const dSeg1 = distToSegment(x, y, p1x, p1y, p2x, p2y);
          const dSeg2 = distToSegment(x, y, p2x, p2y, p3x, p3y);
          const checkDist = Math.min(dSeg1, dSeg2);
          const strokeW = width * 0.045;

          if (checkDist <= strokeW) {
            r = 255; g = 255; b = 255; // White checkmark
          }
        }
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // Color type: RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const compressedData = zlib.deflateSync(rawData);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

if (!fs.existsSync('./public')) {
  fs.mkdirSync('./public', { recursive: true });
}

fs.writeFileSync('./public/pwa-192x192.png', generatePng(192, false));
fs.writeFileSync('./public/pwa-512x512.png', generatePng(512, false));
fs.writeFileSync('./public/pwa-maskable-512x512.png', generatePng(512, true));
fs.writeFileSync('./public/apple-touch-icon.png', generatePng(180, false));
console.log('PNG icons generated successfully in /public!');
