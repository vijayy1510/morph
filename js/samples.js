// Sample images drawn with code, so the site works even without uploading anything.

export const SAMPLE_NAMES = { city: 'Night city', orb: 'Neon orb', donut: 'Donut' };

export function drawSampleCanvas(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 675;
  const ctx = canvas.getContext('2d');
  ({ city: drawCity, orb: drawOrb, donut: drawDonut })[name](ctx, canvas.width, canvas.height);
  return canvas;
}

export async function drawSample(name) {
  const canvas = drawSampleCanvas(name);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new File([blob], `${name}-sample.png`, { type: 'image/png', lastModified: Date.now() });
}

// Seeded random so samples look the same every time
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function drawCity(ctx, w, h) {
  const rand = rng(7);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#07070c');
  sky.addColorStop(0.7, '#2a0a12');
  sky.addColorStop(1, '#4a0d16');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#e8222e';
  ctx.beginPath();
  ctx.arc(w * 0.7, h * 0.28, 110, 0, Math.PI * 2);
  ctx.fill();

  // Three rows of buildings: far ones dark, near ones lighter so depth reads clearly
  [['#15151c', 0.45, 60, 110], ['#1f1f29', 0.55, 80, 140], ['#2c2c3a', 0.7, 110, 170]].forEach(([color, base, minW, maxW]) => {
    let x = -20;
    while (x < w) {
      const bw = minW + rand() * (maxW - minW);
      const top = h * base - rand() * h * 0.3;
      ctx.fillStyle = color;
      ctx.fillRect(x, top, bw - 6, h - top);
      for (let wy = top + 14; wy < h - 10; wy += 22) {
        for (let wx = x + 10; wx < x + bw - 18; wx += 16) {
          if (rand() > 0.72) {
            ctx.fillStyle = rand() > 0.3 ? '#ffd23f' : '#22d3ee';
            ctx.fillRect(wx, wy, 7, 10);
          }
        }
      }
      x += bw;
    }
  });
}

function drawOrb(ctx, w, h) {
  ctx.fillStyle = '#0a0a10';
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, 380);
  glow.addColorStop(0, 'rgba(232,34,46,0.5)');
  glow.addColorStop(1, 'rgba(232,34,46,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const orb = ctx.createRadialGradient(w / 2 - 70, h / 2 - 80, 10, w / 2, h / 2, 220);
  orb.addColorStop(0, '#ffffff');
  orb.addColorStop(0.25, '#8ff0ff');
  orb.addColorStop(0.6, '#22a3ee');
  orb.addColorStop(1, '#0a2a5c');
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e8222e';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, 330, 70, -0.3, 0, Math.PI * 2);
  ctx.stroke();
}

function drawDonut(ctx, w, h) {
  const rand = rng(3);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const dough = ctx.createRadialGradient(cx - 60, cy - 60, 40, cx, cy, 260);
  dough.addColorStop(0, '#f7c98b');
  dough.addColorStop(1, '#a8632a');
  ctx.fillStyle = dough;
  ctx.beginPath();
  ctx.arc(cx, cy, 250, 0, Math.PI * 2);
  ctx.fill();
  const icing = ctx.createRadialGradient(cx - 50, cy - 60, 20, cx, cy, 230);
  icing.addColorStop(0, '#ff8a92');
  icing.addColorStop(1, '#e8222e');
  ctx.fillStyle = icing;
  ctx.beginPath();
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) {
    const r = 215 + Math.sin(a * 9) * 12;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.fill();
  const colors = ['#22d3ee', '#ffffff', '#0b0b0f', '#ffd23f'];
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2, r = 100 + rand() * 100;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-10, -3, 20, 6);
    ctx.restore();
  }
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(cx, cy, 80, 0, Math.PI * 2);
  ctx.fill();
}
