// Everything we can learn about an image: file details, colors, mood, and "who's that?".
import { loadTransformers, makeProgressTracker, readPixels } from './depth.js';
import { SUBJECTS } from './characters.js';

// ---------- File details ----------
export function fileInfo(file, naturalWidth, naturalHeight) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(naturalWidth, naturalHeight);
  const rw = naturalWidth / g, rh = naturalHeight / g;
  const ratio = rw <= 32 && rh <= 32 ? `${rw}:${rh}` : `${(naturalWidth / naturalHeight).toFixed(2)}:1`;

  let orientation = 'Square';
  if (naturalWidth > naturalHeight * 1.05) orientation = 'Landscape';
  else if (naturalHeight > naturalWidth * 1.05) orientation = 'Portrait';

  return [
    ['Format', (file.type.split('/')[1] || 'unknown').toUpperCase()],
    ['Size', formatBytes(file.size)],
    ['Pixels', `${naturalWidth} × ${naturalHeight}`],
    ['Megapixels', ((naturalWidth * naturalHeight) / 1e6).toFixed(2)],
    ['Ratio', ratio],
    ['Shape', orientation],
    ['Modified', new Date(file.lastModified).toLocaleDateString()],
  ];
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

// ---------- Color palette (k-means clustering) ----------
export function extractPalette(canvas, k = 6) {
  const data = readPixels(canvas, 80, 80);
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 127) pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!pixels.length) return [];

  // Start with colors that are far apart from each other
  const centers = [pixels[Math.floor(pixels.length / 2)].slice()];
  while (centers.length < k) {
    let best = null, bestDist = -1;
    for (let i = 0; i < pixels.length; i += 7) {
      const d = Math.min(...centers.map((c) => dist2(c, pixels[i])));
      if (d > bestDist) { bestDist = d; best = pixels[i]; }
    }
    centers.push(best.slice());
  }

  let counts = [];
  for (let iter = 0; iter < 10; iter++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts = centers.map(() => 0);
    for (const p of pixels) {
      let bi = 0, bd = Infinity;
      centers.forEach((c, i) => { const d = dist2(c, p); if (d < bd) { bd = d; bi = i; } });
      sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; counts[bi]++;
    }
    centers.forEach((c, i) => {
      if (counts[i]) for (let j = 0; j < 3; j++) c[j] = sums[i][j] / counts[i];
    });
  }

  return centers
    .map((c, i) => {
      const rgb = c.map(Math.round);
      return { rgb, hex: toHex(rgb), pct: (counts[i] / pixels.length) * 100, name: colorName(rgb) };
    })
    .filter((c) => c.pct >= 1)
    .sort((a, b) => b.pct - a.pct);
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const toHex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

const NAMED_COLORS = {
  Black: [0, 0, 0], Charcoal: [54, 69, 79], Gray: [128, 128, 128], Silver: [192, 192, 192],
  White: [255, 255, 255], Cream: [255, 250, 225], Beige: [225, 205, 170], Tan: [210, 180, 140],
  Brown: [120, 72, 40], Maroon: [128, 0, 0], Red: [220, 30, 40], Crimson: [180, 20, 60],
  Coral: [255, 127, 80], Orange: [255, 140, 0], Peach: [255, 203, 164], Gold: [230, 180, 40],
  Yellow: [255, 230, 0], Olive: [128, 128, 0], Lime: [170, 230, 50], Green: [40, 160, 60],
  Forest: [34, 90, 40], Mint: [160, 240, 200], Teal: [0, 128, 128], Cyan: [0, 220, 230],
  'Sky Blue': [135, 200, 240], Blue: [30, 90, 220], Navy: [15, 25, 90], Indigo: [75, 0, 130],
  Purple: [128, 50, 170], Lavender: [190, 170, 240], Magenta: [230, 0, 200], Pink: [255, 170, 200],
  'Hot Pink': [255, 70, 160],
};

function colorName(rgb) {
  let best = 'Color', bd = Infinity;
  for (const [name, c] of Object.entries(NAMED_COLORS)) {
    const d = dist2(c, rgb);
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

// ---------- Light & color stats + vibe ----------
export function imageStats(canvas) {
  const data = readPixels(canvas, 120, 120);
  let n = 0, lumSum = 0, lumSq = 0, satSum = 0, warmSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    lumSum += lum; lumSq += lum * lum;
    satSum += max === 0 ? 0 : (max - min) / max;
    warmSum += r - b;
    n++;
  }
  const brightness = lumSum / n;
  const contrast = Math.min(1, Math.sqrt(Math.max(0, lumSq / n - brightness ** 2)) * 3);
  const saturation = satSum / n;
  const warmth = warmSum / n; // -1 (cool/blue) → +1 (warm/red)
  return { brightness, contrast, saturation, warmth, vibe: pickVibe(brightness, saturation, warmth) };
}

function pickVibe(bright, sat, warm) {
  if (sat < 0.1) return { name: 'Film noir', text: 'Black and white energy. Very serious, very artsy.' };
  if (bright < 0.35 && warm < -0.03) return { name: 'Night city', text: 'Dark and cold. Somebody is swinging between rooftops right now.' };
  if (bright < 0.35) return { name: 'Lowkey moody', text: 'Dim, warm light. Candlelit, late-night-talk vibes.' };
  if (sat > 0.45 && warm > 0.08) return { name: 'Golden hour', text: 'Warm and loud. Main-character sunset glow.' };
  if (sat > 0.45) return { name: 'Dopamine', text: 'Colors turned all the way up. Pure serotonin.' };
  if (bright > 0.62 && warm < -0.03) return { name: 'Y2K chrome', text: 'Bright and icy. Glossy, clean, a bit futuristic.' };
  if (bright > 0.62 && sat < 0.25) return { name: 'Soft minimal', text: 'Airy and muted. Would look good on a Pinterest board.' };
  if (warm > 0.08) return { name: 'Cottagecore', text: 'Earthy and warm. Slow mornings and good tea.' };
  return { name: 'Main character', text: 'Balanced light and color. Effortless.' };
}

// ---------- "Who's that?" — CLIP zero-shot recognition ----------
// CLIP understands images AND text, so we ask it which of our SUBJECTS descriptions fits best.
const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';
let clipPromise = null;

function loadClip(onPercent) {
  clipPromise ??= (async () => {
    const T = await loadTransformers();
    const progress_callback = makeProgressTracker(onPercent);
    const [tokenizer, processor, textModel, visionModel] = await Promise.all([
      T.AutoTokenizer.from_pretrained(CLIP_MODEL, { progress_callback }),
      T.AutoProcessor.from_pretrained(CLIP_MODEL, { progress_callback }),
      T.CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL, { progress_callback, dtype: 'q8' }),
      T.CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { progress_callback, dtype: 'q8' }),
    ]);
    // The text side never changes, so we embed all descriptions once and reuse them.
    const inputs = tokenizer(SUBJECTS.map((s) => s.prompt), { padding: true, truncation: true });
    const { text_embeds } = await textModel(inputs);
    const dim = text_embeds.dims[1];
    return { T, processor, visionModel, dim, textEmbeds: normalizeRows(text_embeds.data, dim) };
  })().catch((err) => { clipPromise = null; throw err; });
  return clipPromise;
}

export async function identify(canvas, onPercent) {
  const { T, processor, visionModel, dim, textEmbeds } = await loadClip(onPercent);
  const image = await T.RawImage.read(canvas.toDataURL('image/jpeg', 0.9));
  const { image_embeds } = await visionModel(await processor(image));
  const img = normalizeRows(image_embeds.data, dim);

  const logits = SUBJECTS.map((_, i) => {
    let dot = 0;
    for (let k = 0; k < dim; k++) dot += img[k] * textEmbeds[i * dim + k];
    return dot * 100;
  });
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const ranked = SUBJECTS.map((subject, i) => ({ subject, score: exps[i] / sum }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const top = ranked[0].score;
  const verdict = top >= 0.5 ? 'identified' : top >= 0.2 ? 'guess' : 'unknown';
  return { verdict, ranked };
}

function normalizeRows(data, dim) {
  const out = new Float32Array(data.length);
  for (let r = 0; r < data.length / dim; r++) {
    let len = 0;
    for (let k = 0; k < dim; k++) len += data[r * dim + k] ** 2;
    len = Math.sqrt(len) || 1;
    for (let k = 0; k < dim; k++) out[r * dim + k] = data[r * dim + k] / len;
  }
  return out;
}
