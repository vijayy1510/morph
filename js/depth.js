// Depth maps: turn a flat image into "how far away is each pixel".
// A depth map here is { width, height, data: Float32Array } with values 0 (far) → 1 (near).

const TRANSFORMERS_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';
const DEPTH_MODEL = 'onnx-community/depth-anything-v2-small';

let transformersPromise = null;
let depthPipePromise = null;

// Loads the Transformers.js library (runs AI models right inside the browser).
export function loadTransformers() {
  transformersPromise ??= import(TRANSFORMERS_URL);
  return transformersPromise;
}

// Combines per-file download progress events into a single 0–100 number.
export function makeProgressTracker(onPercent) {
  const files = new Map();
  return (event) => {
    if (event.status !== 'progress' || !event.total) return;
    files.set(event.file, { loaded: event.loaded, total: event.total });
    let loaded = 0, total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    onPercent(Math.round((loaded / total) * 100));
  };
}

// 🧠 AI depth: "Depth Anything V2" model predicts real depth from a single photo.
export async function aiDepth(canvas, onPercent) {
  const { pipeline } = await loadTransformers();
  depthPipePromise ??= pipeline('depth-estimation', DEPTH_MODEL, {
    progress_callback: makeProgressTracker(onPercent),
  }).catch((err) => { depthPipePromise = null; throw err; });

  const estimator = await depthPipePromise;
  const { depth } = await estimator(canvas.toDataURL('image/jpeg', 0.92));

  const { width, height, channels, data } = depth;
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * channels] / 255;
  return normalize(blur({ width, height, data: out }, 1));
}

// ⚡ Quick depth: instant, no download. Uses brightness + "center is closer" guess.
export function quickDepth(canvas) {
  const size = 256;
  const scale = Math.min(1, size / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const px = readPixels(canvas, w, h);

  const lum = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  }
  const soft = blur(blur({ width: w, height: h, data: lum }, 4), 4);

  const data = new Float32Array(w * h);
  const maxDist = Math.hypot(w / 2, h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const center = 1 - Math.hypot(x - w / 2, y - h / 2) / maxDist;
      data[y * w + x] = 0.65 * soft.data[y * w + x] + 0.35 * center;
    }
  }
  return normalize({ width: w, height: h, data });
}

// Finds the depth value that best splits "subject" from "background" (Otsu's method).
export function autoThreshold(map) {
  const bins = new Array(64).fill(0);
  for (const v of map.data) bins[Math.min(63, Math.floor(v * 64))]++;
  const total = map.data.length;
  let sumAll = 0;
  bins.forEach((c, i) => (sumAll += i * c));
  let sumBack = 0, countBack = 0, best = 0, bestVar = -1;
  for (let i = 0; i < 64; i++) {
    countBack += bins[i];
    if (!countBack || countBack === total) continue;
    sumBack += i * bins[i];
    const meanBack = sumBack / countBack;
    const meanFront = (sumAll - sumBack) / (total - countBack);
    const variance = countBack * (total - countBack) * (meanBack - meanFront) ** 2;
    if (variance > bestVar) { bestVar = variance; best = i; }
  }
  return Math.min(0.8, Math.max(0.25, (best + 1) / 64));
}

export function invertDepth(map) {
  return { ...map, data: map.data.map((d) => 1 - d) };
}

// Reads the depth at (u, v) where both go 0 → 1 (left→right, top→bottom), with smoothing.
export function sampleDepth(map, u, v) {
  const x = Math.min(Math.max(u, 0), 1) * (map.width - 1);
  const y = Math.min(Math.max(v, 0), 1) * (map.height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, map.width - 1), y1 = Math.min(y0 + 1, map.height - 1);
  const fx = x - x0, fy = y - y0;
  const d = map.data, w = map.width;
  const top = d[y0 * w + x0] * (1 - fx) + d[y0 * w + x1] * fx;
  const bottom = d[y1 * w + x0] * (1 - fx) + d[y1 * w + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

export function readPixels(canvas, w, h) {
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const ctx = tmp.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function normalize(map) {
  let min = Infinity, max = -Infinity;
  for (const v of map.data) { if (v < min) min = v; if (v > max) max = v; }
  const range = max - min || 1;
  return { ...map, data: map.data.map((v) => (v - min) / range) };
}

// Simple box blur (horizontal then vertical pass).
function blur(map, r) {
  const { width: w, height: h } = map;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) { sum += map.data[y * w + xx]; n++; }
      }
      tmp[y * w + x] = sum / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) { sum += tmp[yy * w + x]; n++; }
      }
      out[y * w + x] = sum / n;
    }
  }
  return { width: w, height: h, data: out };
}
