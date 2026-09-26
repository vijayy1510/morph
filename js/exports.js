// Things you can take with you: a comic book cover and a cut-out sticker.
import { sampleDepth } from './depth.js';

const INK = '#0b0b0f', RED = '#e8222e', YELLOW = '#ffd23f', PAPER = '#f3eee3', CYAN = '#22d3ee';

// A 3:4 comic cover with your 3D render as the art
export function makeCover({ art, siteName, title, issue }) {
  const W = 1080, H = 1440;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // Red background with halftone dots
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 16) {
    for (let x = (y / 16) % 2 ? 8 : 0; x < W; x += 16) {
      const r = 1.5 + 4 * (y / H);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Masthead with misprinted color plates (shrinks to fit longer names)
  ctx.font = '240px Anton, Impact, sans-serif';
  const fit = Math.min(240, (240 * 720) / ctx.measureText(siteName).width);
  ctx.font = `${Math.floor(fit)}px Anton, Impact, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = CYAN;
  ctx.fillText(siteName, 52, 36);
  ctx.fillStyle = INK;
  ctx.fillText(siteName, 66, 44);
  ctx.fillStyle = PAPER;
  ctx.fillText(siteName, 60, 40);

  ctx.font = '700 30px "Space Mono", monospace';
  ctx.fillStyle = PAPER;
  ctx.textAlign = 'right';
  ctx.fillText(`No. ${issue}`, W - 60, 70);
  ctx.fillText('VOL. 1', W - 60, 110);

  // Price tag, up in the masthead so it never covers the art
  ctx.fillStyle = PAPER;
  ctx.fillRect(W - 190, 170, 130, 64);
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.strokeRect(W - 190, 170, 130, 64);
  ctx.font = '700 36px "Space Mono", monospace';
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.fillText('₹10', W - 125, 182);
  ctx.textAlign = 'left';

  // Art panel: the whole render fits inside (nothing gets cropped off)
  const px = 60, py = 300, pw = W - 120, ph = 900;
  ctx.fillStyle = PAPER;
  ctx.fillRect(px - 14, py - 14, pw + 28, ph + 28);
  ctx.fillStyle = INK;
  ctx.fillRect(px, py, pw, ph);
  const glow = ctx.createRadialGradient(W / 2, py + ph / 2, 40, W / 2, py + ph / 2, pw * 0.7);
  glow.addColorStop(0, 'rgba(232,34,46,0.35)');
  glow.addColorStop(1, 'rgba(232,34,46,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(px, py, pw, ph);
  const pad = 40;
  const scale = Math.min((pw - pad * 2) / art.width, (ph - pad * 2) / art.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(art, px + (pw - art.width * scale) / 2, py + (ph - art.height * scale) / 2, art.width * scale, art.height * scale);

  // Starburst
  burst(ctx, W - 170, py + 90, 120, 78, 16, YELLOW);
  ctx.save();
  ctx.translate(W - 170, py + 90);
  ctx.rotate(-0.2);
  ctx.font = '84px Bangers, Impact, sans-serif';
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('3D!', 0, 4);
  ctx.restore();

  // Headline caption box
  ctx.font = '72px Bangers, Impact, sans-serif';
  const lines = wrap(ctx, title.toUpperCase(), pw - 80);
  const boxH = lines.length * 76 + 40;
  const by = H - 60 - boxH;
  ctx.fillStyle = YELLOW;
  ctx.fillRect(px, by, pw, boxH);
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.strokeRect(px, by, pw, boxH);
  ctx.fillStyle = INK;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, px + 40, by + 24 + i * 76));
  return c;
}

export function coverTitle(name) {
  const who = name || 'This pic';
  const options = [`The amazing ${who}!`, `${who} breaks the page!`, `${who}: now in 3D!`, `Meanwhile, ${who} goes 3D...`];
  return options[Math.floor(Math.random() * options.length)];
}

// A 1024×1024 sticker: the cut-out subject with a thick white die-cut border and a soft shadow
export function makeSticker({ canvas, mask }) {
  const w = canvas.width, h = canvas.height;
  const alpha = document.createElement('canvas');
  alpha.width = w; alpha.height = h;
  const actx = alpha.getContext('2d');
  const img = actx.createImageData(w, h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = sampleDepth(mask, x / (w - 1), y / (h - 1));
      // crisp but anti-aliased edge
      const a = Math.min(1, Math.max(0, (m - 0.35) / 0.3));
      img.data[(y * w + x) * 4 + 3] = a * 255;
      if (a > 0.5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  actx.putImageData(img, 0, 0);

  const subject = document.createElement('canvas');
  subject.width = w; subject.height = h;
  const sctx = subject.getContext('2d');
  sctx.drawImage(canvas, 0, 0);
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(alpha, 0, 0);

  const size = 1024, border = 24, pad = border + 40;
  const cropW = maxX - minX + 1, cropH = maxY - minY + 1;
  const scale = (size - pad * 2) / Math.max(cropW, cropH);
  const dx = (size - cropW * scale) / 2 - minX * scale, dy = (size - cropH * scale) / 2 - minY * scale;

  // White die-cut shape = the silhouette stamped in a ring of offsets (several radii so there are no gaps)
  const cut = document.createElement('canvas');
  cut.width = cut.height = size;
  const cctx = cut.getContext('2d');
  cctx.imageSmoothingQuality = 'high';
  for (const r of [border, border * 0.66, border * 0.33]) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
      cctx.drawImage(alpha, dx + Math.cos(a) * r, dy + Math.sin(a) * r, w * scale, h * scale);
    }
  }
  cctx.globalCompositeOperation = 'source-in';
  cctx.fillStyle = '#ffffff';
  cctx.fillRect(0, 0, size, size);

  const out = document.createElement('canvas');
  out.width = out.height = size;
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.shadowColor = 'rgba(0,0,0,0.35)';
  octx.shadowBlur = 18;
  octx.shadowOffsetY = 6;
  octx.drawImage(cut, 0, 0);
  octx.shadowColor = 'transparent';
  octx.drawImage(subject, dx, dy, w * scale, h * scale);
  return out;
}

function burst(ctx, cx, cy, outer, inner, points, color) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer, a = (i / (points * 2)) * Math.PI * 2;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

function wrap(ctx, text, maxWidth) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  lines.push(line);
  return lines.slice(0, 3);
}
