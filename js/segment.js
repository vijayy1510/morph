// Subject cut-out: which pixels belong to the main subject (1) and which are background (0).
// Masks use the same { width, height, data: Float32Array } format as depth maps.
import { loadTransformers, makeProgressTracker, sampleDepth } from './depth.js';

// RMBG-1.4 by BRIA AI: free for personal / non-commercial use.
const CUTOUT_MODEL = 'briaai/RMBG-1.4';
let removerPromise = null;

function loadRemover(onPercent) {
  removerPromise ??= (async () => {
    const T = await loadTransformers();
    const progress_callback = makeProgressTracker(onPercent);
    const [model, processor] = await Promise.all([
      T.AutoModel.from_pretrained(CUTOUT_MODEL, { config: { model_type: 'custom' }, dtype: 'q8', progress_callback }),
      T.AutoProcessor.from_pretrained(CUTOUT_MODEL, {
        progress_callback,
        config: {
          do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
          image_mean: [0.5, 0.5, 0.5], image_std: [1, 1, 1], feature_extractor_type: 'ImageFeatureExtractor',
          resample: 2, rescale_factor: 1 / 255, size: { width: 1024, height: 1024 },
        },
      }),
    ]);
    return { T, model, processor };
  })().catch((err) => { removerPromise = null; throw err; });
  return removerPromise;
}

// 🧠 AI cut-out: a background-removal model finds the subject with clean edges
export async function aiMask(canvas, onPercent) {
  const { T, model, processor } = await loadRemover(onPercent);
  const image = await T.RawImage.read(canvas.toDataURL('image/jpeg', 0.92));
  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });
  const small = T.RawImage.fromTensor(output[0].mul(255).to('uint8'));
  const { width, height, channels, data } = await small.resize(image.width, image.height);
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * channels] / 255;
  const mask = cleanMask({ width, height, data: alpha });
  return coverage(mask) > 0.01 ? mask : null; // nothing found → let the caller fall back
}

// Fallback cut-out: everything closer than the threshold
export function depthMask(depth, threshold) {
  const data = new Float32Array(depth.data.length);
  for (let i = 0; i < data.length; i++) data[i] = Math.min(1, Math.max(0, (depth.data[i] - threshold) / 0.04 + 0.5));
  return cleanMask({ width: depth.width, height: depth.height, data });
}

// Removes stray specks and fills pinholes so the cut-out is one clean shape
export function cleanMask(mask) {
  const { width: w, height: h } = mask;
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < inside.length; i++) inside[i] = mask.data[i] >= 0.5 ? 1 : 0;

  const fg = label(inside, w, h, 1);
  const largest = Math.max(0, ...fg.sizes);
  const bg = label(inside, w, h, 0);
  const minHole = w * h * 0.015;

  const solid = new Uint8Array(w * h);
  for (let i = 0; i < solid.length; i++) {
    if (inside[i]) {
      // keep the main subject and any big pieces of it; drop small islands
      solid[i] = fg.sizes[fg.ids[i]] >= largest * 0.15 ? 1 : 0;
    } else {
      // fill enclosed patches the AI was unsure about (but keep big real holes, like a donut hole)
      const id = bg.ids[i];
      solid[i] = !bg.touchesEdge[id] && bg.sizes[id] < minHole ? 1 : 0;
    }
  }

  // Soft, anti-aliased edge values are only kept right next to the solid shape,
  // so faint specks elsewhere disappear
  const near = dilate(dilate(solid, w, h), w, h);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    if (solid[i]) out[i] = Math.max(0.5, mask.data[i]);
    else out[i] = near[i] ? Math.min(0.49, mask.data[i]) : 0;
  }
  return { width: w, height: h, data: out };
}

// Depth used for the popped-out subject: stretched to its full range inside the mask,
// and smoothly extended past the edges so the 3D surface doesn't form spikes at the border.
export function subjectDepth(depth, mask) {
  const { width: w, height: h } = depth;
  const d = new Float32Array(w * h);
  const known = new Uint8Array(w * h);
  let min = Infinity, max = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (sampleDepth(mask, x / (w - 1), y / (h - 1)) >= 0.5) {
        known[i] = 1;
        d[i] = depth.data[i];
        if (d[i] < min) min = d[i];
        if (d[i] > max) max = d[i];
      }
    }
  }
  if (min === Infinity) return depth;
  const range = max - min || 1;
  for (let i = 0; i < d.length; i++) if (known[i]) d[i] = (d[i] - min) / range;

  // Grow the known area outward a few pixels at a time
  const steps = Math.ceil(Math.max(w, h) / 40);
  for (let s = 0; s < steps; s++) {
    const next = known.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (known[i]) continue;
        let sum = 0, n = 0;
        if (x > 0 && known[i - 1]) { sum += d[i - 1]; n++; }
        if (x < w - 1 && known[i + 1]) { sum += d[i + 1]; n++; }
        if (y > 0 && known[i - w]) { sum += d[i - w]; n++; }
        if (y < h - 1 && known[i + w]) { sum += d[i + w]; n++; }
        if (n) { d[i] = sum / n; next[i] = 1; }
      }
    }
    known.set(next);
  }
  return smooth({ width: w, height: h, data: d }, Math.max(1, Math.round(Math.max(w, h) / 300)));
}

// Box blur so the 3D surface edges come out smooth instead of jagged
function smooth(map, r) {
  const { width: w, height: h } = map;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { sum += map.data[y * w + k]; n++; }
      tmp[y * w + x] = sum / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { sum += tmp[k * w + x]; n++; }
      out[y * w + x] = sum / n;
    }
  }
  return { width: w, height: h, data: out };
}

export function coverage(mask) {
  let on = 0;
  for (const v of mask.data) if (v >= 0.5) on++;
  return on / mask.data.length;
}

function dilate(bits, w, h) {
  const out = bits.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bits[i]) continue;
      if ((x > 0 && bits[i - 1]) || (x < w - 1 && bits[i + 1]) || (y > 0 && bits[i - w]) || (y < h - 1 && bits[i + w])) out[i] = 1;
    }
  }
  return out;
}

// Connected regions of pixels whose value equals `target` (4-neighbour flood fill)
function label(bits, w, h, target) {
  const ids = new Int32Array(w * h).fill(-1);
  const sizes = [], touchesEdge = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < bits.length; start++) {
    if (bits[start] !== target || ids[start] !== -1) continue;
    const id = sizes.length;
    let top = 0, size = 0, edge = false;
    stack[top++] = start;
    ids[start] = id;
    while (top) {
      const i = stack[--top];
      size++;
      const x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      if (x > 0 && bits[i - 1] === target && ids[i - 1] === -1) { ids[i - 1] = id; stack[top++] = i - 1; }
      if (x < w - 1 && bits[i + 1] === target && ids[i + 1] === -1) { ids[i + 1] = id; stack[top++] = i + 1; }
      if (y > 0 && bits[i - w] === target && ids[i - w] === -1) { ids[i - w] = id; stack[top++] = i - w; }
      if (y < h - 1 && bits[i + w] === target && ids[i + w] === -1) { ids[i + w] = id; stack[top++] = i + w; }
    }
    sizes.push(size);
    touchesEdge.push(edge);
  }
  // pixels of the other value keep id -1; give them a harmless size of 0
  sizes[-1] = 0;
  return { ids, sizes, touchesEdge };
}
