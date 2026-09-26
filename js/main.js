// App logic: connects the upload UI, the 3D viewer, and the case file.
import { CONFIG } from './config.js';
import { Viewer, MODES } from './viewer.js';
import { aiDepth, quickDepth, invertDepth, autoThreshold } from './depth.js';
import { fileInfo, extractPalette, imageStats, identify } from './analyze.js';
import { getInsights } from './claude.js';
import { drawSample, drawSampleCanvas } from './samples.js';
import { makeCover, coverTitle, makeSticker } from './exports.js';
import { aiMask, depthMask, subjectDepth } from './segment.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let viewer = null;
let current = null;     // the picture currently shown
const history = [];     // recent pictures this session
let jobId = 0;          // lets us ignore slow AI results for a picture that's no longer shown

// ---------- Branding ----------
$$('[data-site-name]').forEach((el) => (el.textContent = CONFIG.siteName));
$$('[data-tagline]').forEach((el) => (el.textContent = CONFIG.tagline));
document.title = `${CONFIG.siteName} — pull any picture into 3D`;
$('#year').textContent = new Date().getFullYear();
document.fonts.load('64px Bangers'); // used inside the 3D caption and covers

// Sample thumbnails on the landing page
$$('[data-sample]').forEach((btn) => {
  btn.querySelector('img').src = drawSampleCanvas(btn.dataset.sample).toDataURL('image/jpeg', 0.85);
  btn.addEventListener('click', async () => handleFile(await drawSample(btn.dataset.sample)));
});

// Style tabs
$('#modes').innerHTML = MODES.map(([id, label], i) =>
  `<button class="mode${i === 0 ? ' active' : ''}" data-mode="${id}" role="tab"><b>0${i + 1}</b>${label}</button>`).join('');

// ---------- Saved settings (browser storage can be blocked, so always try/catch) ----------
const store = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

// ---------- Upload: click, drag & drop, paste ----------
$('#fileInput').addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
  e.target.value = '';
});
$('#dropzone').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileInput').click(); }
});
$('#newBtn').addEventListener('click', () => $('#fileInput').click());

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  $('#dropOverlay').hidden = false;
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) { dragDepth = 0; $('#dropOverlay').hidden = true; }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#dropOverlay').hidden = true;
  const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
  if (file) handleFile(file);
  else toast("That's not a picture", true);
});
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) handleFile(item.getAsFile());
});

// ---------- Main flow ----------
async function handleFile(file) {
  if (!file.type.startsWith('image/')) return toast('Pick an image file', true);
  if (file.size > 30 * 1024 * 1024) return toast('Over 30 MB. Try a smaller one.', true);

  let loaded;
  try {
    loaded = await fileToCanvas(file);
  } catch {
    return toast("Couldn't read that. HEIC/RAW won't work, try JPG or PNG.", true);
  }

  const quick = quickDepth(loaded.canvas);
  const item = {
    file,
    name: file.name || 'pasted-picture.png',
    caseNo: String(Math.floor(1000 + Math.random() * 9000)),
    canvas: loaded.canvas,
    thumb: loaded.thumb,
    info: fileInfo(file, loaded.width, loaded.height),
    palette: extractPalette(loaded.canvas),
    stats: imageStats(loaded.canvas),
    quickDepth: quick,
    aiDepth: null,
    threshold: autoThreshold(quick),
    thresholdLocked: false,
    who: null,
    insights: null,
  };
  history.unshift(item);
  if (history.length > 8) history.pop();
  showItem(item);
}

function showItem(item) {
  current = item;
  const myJob = ++jobId;

  $('#landing').hidden = true;
  $('#studio').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  viewer ??= new Viewer($('#stage'));
  const depth = depthFor(item);
  item.mask = maskFor(item);
  viewer.load(item.canvas, depth, item.mask, subjectDepth(depth, item.mask));
  viewer.setCaption(captionFor(item));
  syncThresholdSlider();
  updateBadge();

  $('#caseNo').textContent = `No. ${item.caseNo}`;
  renderWho(item);
  renderTea(item);
  renderColors(item);
  renderFile(item);
  renderHistory();
  runAI(item, myJob);
}

function activeDepth(item) {
  return $('#aiDepthToggle').checked && item.aiDepth ? item.aiDepth : item.quickDepth;
}

function depthFor(item) {
  const map = activeDepth(item);
  return $('#invert').checked ? invertDepth(map) : map;
}

function refreshDepth() {
  if (!current) return;
  const depth = depthFor(current);
  if (!current.thresholdLocked) current.threshold = autoThreshold(depth);
  viewer.setDepth(depth);
  applyMask();
  syncThresholdSlider();
  updateBadge();
}

// Subject cut-out: the AI one when available, otherwise everything closer than the pop-out cut
function maskFor(item) {
  if ($('#aiCutout').checked && item.aiMask) return item.aiMask;
  return depthMask(depthFor(item), item.threshold);
}

function applyMask() {
  if (!current) return;
  current.mask = maskFor(current);
  viewer.setMask(current.mask, subjectDepth(depthFor(current), current.mask));
}

// Runs the in-browser AI models one after another: depth, then cut-out, then "who's that?"
async function runAI(item, myJob) {
  if ($('#aiDepthToggle').checked && !item.aiDepth) {
    try {
      item.aiDepth = await aiDepth(item.canvas, (pct) => {
        if (jobId === myJob) setBadge(`Downloading depth AI ${pct}%`);
      });
      if (jobId === myJob) refreshDepth();
    } catch (err) {
      console.error(err);
      if (jobId === myJob) { setBadge('Quick depth (AI failed)'); toast('Depth AI failed to load. Using quick depth.', true); }
    }
  }

  if (!item.aiMaskTried) {
    item.aiMaskTried = true;
    try {
      item.aiMask = await aiMask(item.canvas, (pct) => {
        if (jobId === myJob) setBadge(`Downloading cut-out AI ${pct}%`);
      });
    } catch (err) {
      console.error(err);
      if (jobId === myJob) toast('Cut-out AI failed to load. Using the depth cut instead.', true);
    }
    if (current === item) { applyMask(); updateBadge(); }
  }

  if (!item.who) {
    try {
      item.who = await identify(item.canvas, (pct) => {
        if (jobId === myJob) $('#whoBox').innerHTML = `<p class="loading">Downloading recognition AI ${pct}%</p>`;
      });
    } catch (err) {
      console.error(err);
      item.who = { verdict: 'error', ranked: [] };
    }
    if (current === item) {
      renderWho(item);
      viewer.setCaption(captionFor(item));
    }
  }
}

function updateBadge() {
  if (!current) return;
  const aiOn = $('#aiDepthToggle').checked;
  if (aiOn && current.aiDepth) setBadge('AI depth', true);
  else if (aiOn) setBadge('Quick depth · AI loading');
  else setBadge('Quick depth');
}

function setBadge(text, ok = false) {
  const badge = $('#depthBadge');
  badge.textContent = `${text} · ${viewer?.stats ?? ''}`;
  badge.classList.toggle('ok', ok);
}

// The name we use for captions and covers (never a real person's name)
function subjectName(item) {
  const top = item.who?.ranked?.[0];
  if (item.insights && item.insights.identity.confidence !== 'low') return item.insights.identity.name;
  if (!top || item.who.verdict === 'unknown' || top.subject.kind === 'Person') return null;
  return top.subject.name;
}

function captionFor(item) {
  const name = subjectName(item);
  return name ? `MEANWHILE, ${name.toUpperCase()}...` : 'MEANWHILE...';
}

// ---------- Case file ----------
function renderWho(item) {
  const box = $('#whoBox');
  if (!item.who) { box.innerHTML = '<p class="loading">Looking closely...</p>'; return; }
  if (item.who.verdict === 'error') {
    box.innerHTML = `<p class="who-note">The recognition AI didn't download (probably a network blip).</p>
      <button class="btn btn-red" id="whoRetry" style="margin-top:10px">Try again</button>`;
    $('#whoRetry').addEventListener('click', () => {
      item.who = null;
      renderWho(item);
      runAI(item, jobId);
    });
    return;
  }

  const [top, ...rest] = item.who.ranked;
  const s = top.subject;
  const pct = Math.round(top.score * 100);
  const also = rest.filter((r) => r.score >= 0.05)
    .map((r) => `${esc(r.subject.name)} ${Math.round(r.score * 100)}%`).join(' · ');

  if (item.who.verdict === 'unknown') {
    box.innerHTML = `
      <span class="stamp unknown">Unknown</span>
      <p class="who-note">Couldn't place this one with confidence, so we won't guess. Open the Deep file below for a closer look.</p>`;
    return;
  }

  const stamp = item.who.verdict === 'identified'
    ? '<span class="stamp identified">Identified</span>'
    : '<span class="stamp guess">Best guess</span>';

  if (s.kind === 'Person') {
    box.innerHTML = `${stamp}
      <p class="who-name">${esc(s.name)}</p>
      <p class="who-meta">Human · ${pct}% sure</p>
      <p class="who-note">Morph doesn't put names on real people's faces. The Deep file can still describe the outfit, the setting and the vibe.</p>`;
    return;
  }

  const f = s.file;
  box.innerHTML = `${stamp}
    <p class="who-name">${esc(s.name)}</p>
    <p class="who-meta"><b>${esc(s.kind)}</b>${s.universe ? ` · ${esc(s.universe)}` : ''} · ${pct}% sure</p>
    ${f ? `
      <dl class="details">
        <dt>Alias</dt><dd>${esc(f.alias)}</dd>
        <dt>First seen</dt><dd>${esc(f.debut)}</dd>
        <dt>Created by</dt><dd>${esc(f.creators)}</dd>
      </dl>
      <p class="who-meta" style="margin:12px 0 6px">Powers</p>
      <div class="powers">${f.powers.map((p) => `<span class="chip">${esc(p)}</span>`).join('')}</div>
      <p class="who-note">${esc(f.note)}</p>` : ''}
    ${also ? `<p class="also">Also looks like: ${also}</p>` : ''}`;
}

function renderTea(item) {
  const box = $('#teaContent');
  if (item.insights) { box.innerHTML = teaHTML(item.insights); wireTea(item.insights); return; }
  const hasKey = !!store.get('apiKey', '');
  box.innerHTML = `
    <div class="tea-empty">
      <p>Claude looks at the picture and writes the full file: who or what it is, key facts, fun facts, the aesthetic, captions and hashtags.</p>
      ${hasKey
        ? '<button class="btn btn-red" id="teaBtn">Open the deep file</button>'
        : '<button class="btn btn-red" id="teaKeyBtn">Add a Claude API key</button><p class="fineprint">Optional. Everything else on Morph is free and works without it.</p>'}
    </div>`;
  $('#teaBtn')?.addEventListener('click', () => loadTea(item));
  $('#teaKeyBtn')?.addEventListener('click', openSettings);
}

async function loadTea(item) {
  $('#teaContent').innerHTML = '<p class="loading">Claude is reading the picture...</p>';
  try {
    item.insights = await getInsights({
      apiKey: store.get('apiKey', ''),
      model: store.get('model', CONFIG.claudeModel),
      canvas: item.canvas,
    });
    if (current === item) viewer.setCaption(captionFor(item));
  } catch (err) {
    console.error(err);
    toast(err.message || 'Something went wrong.', true);
  }
  if (current === item) renderTea(item);
}

function teaHTML(t) {
  const conf = { high: 'identified', medium: 'guess', low: 'unknown' }[t.identity.confidence];
  return `
    <div class="tea">
      <span class="stamp ${conf}">${esc(t.identity.confidence)} confidence</span>
      <p class="tea-title" style="margin-top:10px">${esc(t.identity.name)}</p>
      <p class="who-meta"><b>${esc(t.identity.kind)}</b> · ${esc(t.category)} · ${esc(t.aesthetic)}</p>
      <h4>What we're looking at</h4>
      <p>${esc(t.description)}</p>
      <h4>Key facts</h4>
      <dl class="details">${t.details.map((d) => `<dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd>`).join('')}</dl>
      <h4>Fun facts</h4>
      <ul>${t.fun_facts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h4>The vibe</h4>
      <p>${esc(t.vibe)}</p>
      <h4>Captions</h4>
      ${t.caption_ideas.map((c, i) => `<div class="caption"><span>${esc(c)}</span><button class="chip chip-btn" data-caption="${i}">Copy</button></div>`).join('')}
      <h4>Hashtags</h4>
      <div class="tags">${t.hashtags.map((h) => `<span class="chip">#${esc(h.replace(/^#/, ''))}</span>`).join('')}
        <button class="chip chip-btn red" id="copyTags">Copy all</button></div>
    </div>`;
}

function wireTea(t) {
  $$('[data-caption]').forEach((b) => b.addEventListener('click', () => copy(t.caption_ideas[b.dataset.caption])));
  $('#copyTags')?.addEventListener('click', () => copy(t.hashtags.map((h) => '#' + h.replace(/^#/, '')).join(' ')));
}

function renderColors(item) {
  $('#palette').innerHTML = item.palette.map((c) => `
    <button class="swatch" data-hex="${c.hex}" title="Copy ${c.hex}">
      <div style="background:${c.hex}"></div>
      <p><b>${c.hex}</b>${esc(c.name)} · ${c.pct.toFixed(0)}%</p>
    </button>`).join('');
  $$('#palette .swatch').forEach((el) => el.addEventListener('click', () => copy(el.dataset.hex)));

  const { brightness, contrast, saturation, warmth, vibe } = item.stats;
  const meters = [
    ['Brightness', brightness, `${Math.round(brightness * 100)}%`],
    ['Contrast', contrast, `${Math.round(contrast * 100)}%`],
    ['Saturation', saturation, `${Math.round(saturation * 100)}%`],
    ['Warmth', (warmth + 1) / 2, warmth > 0.05 ? 'Warm' : warmth < -0.05 ? 'Cool' : 'Neutral'],
  ];
  $('#meters').innerHTML = meters.map(([label, value, text]) => {
    const on = Math.round(Math.min(1, Math.max(0, value)) * 12);
    return `<div class="meter"><div class="meter-top"><span>${label}</span><span>${text}</span></div>
      <div class="cells">${Array.from({ length: 12 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div></div>`;
  }).join('');
  $('#vibeCard').innerHTML = `<h4>${esc(vibe.name)}</h4><p>${esc(vibe.text)}</p>`;
}

function renderFile(item) {
  $('#thumb').src = item.thumb;
  $('#fileTitle').textContent = item.name;
  $('#fileDetails').innerHTML = item.info.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
}

function renderHistory() {
  $('#history').innerHTML = history.map((item, i) => `
    <button class="${item === current ? 'active' : ''}" data-index="${i}" title="${esc(item.name)}">
      <img src="${item.thumb}" alt="${esc(item.name)}" /></button>`).join('');
  $$('#history button').forEach((b) => b.addEventListener('click', () => showItem(history[b.dataset.index])));
}

// ---------- 3D controls ----------
function setMode(mode) {
  const i = MODES.findIndex(([id]) => id === mode);
  $$('.mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#panelCaption').textContent = `Panel 0${i + 1} — ${MODES[i][1]}`;
  $('#thresholdWrap').classList.toggle('dim', mode !== 'popout');
  viewer?.setMode(mode);
  updateBadge();
}
$$('.mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

function bindSlider(id, decimals, apply) {
  const input = $(`#${id}`), out = $(`#${id}Out`);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    out.textContent = v.toFixed(decimals);
    apply(v);
  });
}
bindSlider('strength', 2, (v) => viewer?.setStrength(v));
bindSlider('light', 2, (v) => viewer?.setLight(v));
bindSlider('pointSize', 1, (v) => viewer?.setPointSize(v));
let maskFrame = 0;
bindSlider('threshold', 2, (v) => {
  if (!current) return;
  current.threshold = v;
  current.thresholdLocked = true;
  $('#aiCutout').checked = false; // moving the slider means "cut by depth myself"
  cancelAnimationFrame(maskFrame);
  maskFrame = requestAnimationFrame(applyMask);
});
$('#aiCutout').addEventListener('change', applyMask);

function syncThresholdSlider() {
  $('#threshold').value = current.threshold;
  $('#thresholdOut').textContent = current.threshold.toFixed(2);
}

$('#motion').addEventListener('change', (e) => viewer?.setMotion(e.target.checked));
$('#xray').addEventListener('change', (e) => viewer?.setXray(e.target.checked));
$('#invert').addEventListener('change', refreshDepth);
$('#aiDepthToggle').addEventListener('change', () => {
  refreshDepth();
  if (current && $('#aiDepthToggle').checked && !current.aiDepth) runAI(current, jobId);
});

$('#snapBtn').addEventListener('click', async (e) => {
  if (!viewer) return;
  if (viewer.mode !== 'particles') {
    setMode('particles');
    await new Promise((r) => setTimeout(r, 1400)); // let the particles assemble first
  }
  e.target.disabled = true;
  await viewer.snap();
  e.target.disabled = false;
});

$('#resetBtn').addEventListener('click', () => viewer?.resetView());
$('#fullscreenBtn').addEventListener('click', toggleFullscreen);
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('#stage').requestFullscreen?.();
}

// ---------- Exports ----------
$('#shotBtn').addEventListener('click', () => {
  const shot = viewer.renderStill();
  const pad = Math.round(Math.max(shot.width, shot.height) * 0.08);
  const out = document.createElement('canvas');
  out.width = shot.width + pad * 2;
  out.height = shot.height + pad * 2;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(shot, pad, pad);
  download(out.toDataURL('image/png'), `${baseName()}-morph.png`);
  toast('Screenshot saved');
});

$('#coverBtn').addEventListener('click', async () => {
  await document.fonts.ready;
  const cover = makeCover({
    art: viewer.renderStill(),
    siteName: CONFIG.siteName,
    title: coverTitle(subjectName(current)),
    issue: current.caseNo,
  });
  download(cover.toDataURL('image/png'), `${baseName()}-cover.png`);
  toast('Comic cover saved');
});

$('#stickerBtn').addEventListener('click', () => {
  const sticker = makeSticker({ canvas: current.canvas, mask: current.mask });
  if (!sticker) return toast('No subject found. Try the pop-out cut slider.', true);
  download(sticker.toDataURL('image/png'), `${baseName()}-sticker.png`);
  toast('Sticker saved. Tweak it with the pop-out cut slider.');
});

$('#recordBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (!window.MediaRecorder) return toast("This browser can't record. Try Chrome or Edge.", true);
  btn.disabled = true;
  btn.textContent = 'Recording...';
  try {
    const blob = await viewer.recordClip(6);
    const url = URL.createObjectURL(blob);
    download(url, `${baseName()}-morph.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Clip saved');
  } catch (err) {
    console.error(err);
    toast('Recording failed', true);
  }
  btn.disabled = false;
  btn.textContent = 'Video clip';
});

$('#glbBtn').addEventListener('click', async () => {
  try {
    const url = URL.createObjectURL(await viewer.exportGLB());
    download(url, `${baseName()}-morph.glb`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('3D file saved. Opens in Blender or 3D Viewer.');
  } catch (err) {
    console.error(err);
    toast('Export failed', true);
  }
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (!current || $('#studio').hidden || e.target.closest('input, select, textarea, dialog')) return;
  const mode = MODES[Number(e.key) - 1];
  if (mode) setMode(mode[0]);
  if (e.key === 'r' || e.key === 'R') viewer.resetView();
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});

// Logo and "How it works" go back to the start page
$('#homeLink').addEventListener('click', (e) => { e.preventDefault(); goHome(); });
$('#howLink').addEventListener('click', (e) => {
  e.preventDefault();
  goHome();
  requestAnimationFrame(() => $('#how').scrollIntoView({ behavior: 'smooth' }));
});
function goHome() {
  $('#landing').hidden = false;
  $('#studio').hidden = true;
}

// ---------- Settings dialog ----------
$('#settingsBtn').addEventListener('click', openSettings);
function openSettings() {
  $('#apiKey').value = store.get('apiKey', '');
  $('#modelSelect').value = store.get('model', CONFIG.claudeModel);
  $('#settingsDialog').showModal();
}
$('#settingsDialog').addEventListener('close', () => {
  const action = $('#settingsDialog').returnValue;
  if (action === 'save') {
    const key = $('#apiKey').value.trim();
    if (key) store.set('apiKey', key); else store.remove('apiKey');
    store.set('model', $('#modelSelect').value);
    toast(key ? 'Saved. Deep file unlocked.' : 'Saved');
  } else if (action === 'clear') {
    store.remove('apiKey');
    toast('API key removed');
  }
  if (current) renderTea(current);
});

// ---------- Helpers ----------
async function fileToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { naturalWidth: width, naturalHeight: height } = img;
    const scale = Math.min(1, CONFIG.maxImageSide / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

    const t = document.createElement('canvas');
    const ts = 160 / Math.max(width, height);
    t.width = Math.max(1, Math.round(width * ts));
    t.height = Math.max(1, Math.round(height * ts));
    t.getContext('2d').drawImage(img, 0, 0, t.width, t.height);
    return { canvas, width, height, thumb: t.toDataURL('image/jpeg', 0.85) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function baseName() {
  return (current?.name || 'picture').replace(/\.[^.]+$/, '');
}

function download(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(text.length > 30 ? 'Copied' : `Copied ${text}`);
  } catch {
    toast("Couldn't copy. Select it and copy manually.", true);
  }
}

function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = `toast${isError ? ' error' : ''}`;
  el.textContent = message;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
