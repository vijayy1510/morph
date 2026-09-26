// The 3D engine. Every style reads the same two textures:
//   map      = the photo
//   depthMap = how close each pixel is (0 far → 1 near)
// Most of the work happens on the GPU in small shader programs.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleDepth, readPixels } from './depth.js';

export const MODES = [
  ['popout', 'Pop-out'], ['photo', '3D Photo'], ['comic', 'Comic'],
  ['particles', 'Particles'], ['hologram', 'Hologram'], ['blocks', 'Blocks'],
];

const HEAT = /* glsl */ `
  vec3 heat(float t) {
    return clamp(vec3(1.5 - abs(4.0 * t - 3.0), 1.5 - abs(4.0 * t - 2.0), 1.5 - abs(4.0 * t - 1.0)), 0.0, 1.0);
  }
`;

const SURFACE_VERT = /* glsl */ `
  uniform sampler2D depthMap;
  uniform float strength;
  uniform float cutout;
  uniform float flatten;
  uniform float intro;
  varying vec2 vUv;
  varying vec3 vViewPosition;
  void main() {
    vUv = uv;
    float d = texture2D(depthMap, uv).r;
    float z = cutout > 0.5 ? 0.06 + d * strength * 0.8 : (d - 0.5) * strength;
    z *= (1.0 - flatten) * (1.0 - intro);
    vec4 mv = modelViewMatrix * vec4(position.xy, position.z + z, 1.0);
    vViewPosition = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const SURFACE_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform sampler2D depthMap;
  uniform sampler2D maskMap;
  uniform vec2 mapTexel;
  uniform float style;       // 0 photo, 1 comic, 2 hologram
  uniform float light;
  uniform float useLight;
  uniform float cutout;
  uniform float tear;
  uniform float shadowCut;
  uniform float dim;
  uniform float xray;
  uniform float time;
  uniform float pixelRatio;
  uniform vec3 ink;
  uniform vec3 accentA;
  uniform vec3 accentB;
  varying vec2 vUv;
  varying vec3 vViewPosition;
  ${HEAT}

  float depthAt(vec2 offset) { return texture2D(depthMap, vUv + offset).r; }
  float maskAt(vec2 offset) { return texture2D(maskMap, vUv + offset).r; }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  float lumaAt(vec2 px) { return luma(texture2D(map, vUv + px * mapTexel).rgb); }

  void main() {
    float d = depthAt(vec2(0.0));
    float e = 0.004;
    float grad = length(vec2(depthAt(vec2(e, 0.0)) - depthAt(vec2(-e, 0.0)), depthAt(vec2(0.0, e)) - depthAt(vec2(0.0, -e))));

    if (cutout > 0.5 && maskAt(vec2(0.0)) < 0.5) discard;
    // Instead of stretching a rubber sheet over depth jumps, tear the surface open.
    if (tear > 0.0 && grad > tear) discard;

    vec3 col = texture2D(map, vUv).rgb;
    bool comic = style > 0.5 && style < 1.5;
    if (comic) {
      // Misprinted color plates, like an old comic (and a certain spider-verse)
      col.r = texture2D(map, vUv + vec2(2.5, 1.0) * mapTexel).r;
      col.b = texture2D(map, vUv - vec2(2.5, 1.0) * mapTexel).b;
    }
    if (xray > 0.5) col = heat(d);

    vec3 n = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    float lambert = max(dot(n, normalize(vec3(0.35, 0.55, 0.75))), 0.0);
    col *= mix(1.0, 0.45 + 0.75 * lambert, light * useLight);

    float alpha = 1.0;
    if (comic) {
      col = floor(col * 5.0 + 0.5) / 5.0;
      vec2 p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / (5.0 * pixelRatio);
      float radius = sqrt(max(0.0, 1.0 - luma(col))) * 0.62;
      float dots = 1.0 - smoothstep(radius - 0.08, radius + 0.08, length(fract(p) - 0.5));
      col = mix(col, col * 0.3, dots * 0.75);
      float edgeColor = length(vec2(lumaAt(vec2(1.5, 0.0)) - lumaAt(vec2(-1.5, 0.0)), lumaAt(vec2(0.0, 1.5)) - lumaAt(vec2(0.0, -1.5))));
      float edge = max(smoothstep(0.2, 0.32, edgeColor), smoothstep(0.035, 0.07, grad));
      col = mix(col, ink, edge);
    } else if (style > 1.5) {
      float l = luma(col);
      vec3 base = mix(accentA, accentB, clamp(vUv.y + 0.25 * sin(time * 0.8), 0.0, 1.0));
      float scan = 0.6 + 0.4 * sin(vUv.y * 420.0 - time * 6.0);
      float fresnel = pow(1.0 - abs(n.z), 2.0);
      float flicker = 0.93 + 0.07 * sin(time * 37.0) * sin(time * 13.0);
      col = (base * (0.2 + 1.4 * l) * scan + fresnel * accentB) * flicker;
      alpha = clamp((0.3 + 0.7 * l) * scan + fresnel, 0.0, 1.0) * flicker;
    }

    if (cutout > 0.5) {
      // Thick ink outline around the popped-out subject
      float o = 0.007;
      float near = min(min(min(maskAt(vec2(o, 0.0)), maskAt(vec2(-o, 0.0))), min(maskAt(vec2(0.0, o)), maskAt(vec2(0.0, -o)))),
                       min(min(maskAt(vec2(o, o) * 0.7), maskAt(vec2(-o, o) * 0.7)), min(maskAt(vec2(o, -o) * 0.7), maskAt(vec2(-o, -o) * 0.7))));
      // no outline along the photo's own border (the subject is just cut off there)
      float border = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      col = mix(col, ink, smoothstep(0.55, 0.35, near) * step(0.012, border));
    }
    if (shadowCut > 0.5) col = mix(col, ink, 0.6 * smoothstep(0.4, 0.6, maskAt(vec2(0.0))));
    gl_FragColor = vec4(col * dim, alpha);
  }
`;

const POINTS_VERT = /* glsl */ `
  attribute float rnd;
  uniform sampler2D map;
  uniform sampler2D depthMap;
  uniform float strength;
  uniform float intro;
  uniform float snap;
  uniform float xray;
  uniform float pointSize;
  uniform float pixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  ${HEAT}
  void main() {
    float d = texture2D(depthMap, uv).r;
    vec3 pos = vec3(position.xy, (d - 0.5) * strength);
    // The snap: pixels turn to dust from right to left and drift away
    float s = clamp(snap * 1.7 - (1.0 - uv.x) * 0.5 - rnd * 0.2, 0.0, 1.0);
    pos += vec3(1.2 + rnd, 0.5 + 0.8 * sin(rnd * 40.0), 0.6 * cos(rnd * 30.0)) * s * s * 1.8;
    vec3 scatter = vec3(sin(rnd * 91.0), cos(rnd * 57.0), sin(rnd * 23.0 + 1.0)) * 3.0;
    pos = mix(pos, scatter, intro);
    vColor = xray > 0.5 ? heat(d) : texture2D(map, uv).rgb;
    vAlpha = 1.0 - s;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = pointSize * pixelRatio * (6.0 / -mv.z) * (0.8 + 0.5 * d);
    gl_Position = projectionMatrix * mv;
  }
`;

const POINTS_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (length(gl_PointCoord - 0.5) > 0.5 || vAlpha < 0.02) discard;
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

const rgb = (hex) => { const c = new THREE.Color(hex); c.convertLinearToSRGB(); return new THREE.Vector3(c.r, c.g, c.b); };
const ease = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;

export class Viewer {
  constructor(container) {
    this.container = container;
    this.mode = 'popout';
    this.motion = true;
    this.pointer = { x: 0, y: 0 };
    this.time = 0;
    this.introT = 0;
    this.snapT = -1;
    this.caption = 'MEANWHILE...';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 1, maxDistance: 7 });

    // Lights are only used by the Blocks style (the others shade themselves)
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2, 3, 4);
    this.scene.add(key);

    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.disposables = [];

    // Shared shader inputs. Every material points at these same objects, so one change updates all.
    this.u = {
      map: { value: null }, depthMap: { value: null }, mapTexel: { value: new THREE.Vector2() },
      maskMap: { value: null }, strength: { value: 0.6 }, light: { value: 0.5 }, intro: { value: 0 },
      time: { value: 0 }, xray: { value: 0 }, snap: { value: 0 }, pointSize: { value: 1 },
      pixelRatio: { value: this.renderer.getPixelRatio() },
      ink: { value: rgb('#0b0b0f') }, accentA: { value: rgb('#22d3ee') }, accentB: { value: rgb('#e8222e') },
    };

    // Look-around: the model leans toward your mouse (or phone tilt)
    container.addEventListener('pointermove', (e) => {
      const r = container.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      this.pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    container.addEventListener('pointerleave', () => { this.pointer.x = 0; this.pointer.y = 0; });
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return;
      this.pointer.x = Math.max(-1, Math.min(1, e.gamma / 30));
      this.pointer.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    });

    this.subjectDepth = { value: null }; // popped-out subject uses its own cleaned-up depth
    this.clock = new THREE.Clock();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ---------- Public API ----------
  load(canvas, depth, mask, subject) {
    this.canvas = canvas;
    this.u.map.value?.dispose();
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.u.map.value = tex;
    this.u.mapTexel.value.set(1 / canvas.width, 1 / canvas.height);
    const aspect = canvas.width / canvas.height;
    this.size = aspect >= 1 ? { w: 2, h: 2 / aspect } : { w: 2 * aspect, h: 2 };
    this.setDepth(depth, false);
    this.setMask(mask, subject);
    this.rebuild();
    this.resetView();
  }

  setDepth(depth, update = true) {
    this.depth = depth;
    this.u.depthMap.value?.dispose();
    this.u.depthMap.value = makeDepthTexture(depth);
    if (update && this.blocks) this.updateBlocks(1);
  }

  setMode(mode) {
    this.mode = mode;
    if (this.canvas) this.rebuild();
  }

  setStrength(v) {
    this.u.strength.value = v;
    if (this.blocks) this.updateBlocks(1);
    if (this.backdrop) this.backdrop.position.z = -0.5 * v - 0.03;
  }

  setMask(mask, subject) {
    this.mask = mask;
    this.subject = subject;
    this.u.maskMap.value?.dispose();
    this.u.maskMap.value = makeDepthTexture(mask);
    this.subjectDepth.value?.dispose();
    this.subjectDepth.value = makeDepthTexture(subject);
  }

  setLight(v) { this.u.light.value = v; }
  setPointSize(v) { this.u.pointSize.value = v; }
  setMotion(on) { this.motion = on; }

  setXray(on) {
    this.u.xray.value = on ? 1 : 0;
    if (this.blocks) this.colorBlocks();
  }

  setCaption(text) {
    this.caption = text;
    if (this.mode === 'popout' && this.panel) this.addCaption();
  }

  // Thanos-style: turn into dust, then come back
  snap() {
    if (this.snapT < 0) {
      this.snapT = 0;
      this.snapPromise = new Promise((resolve) => (this.snapDone = resolve));
    }
    return this.snapPromise;
  }

  resetView() {
    const aspect = this.camera.aspect || 1;
    const halfW = (this.size?.w ?? 2) / 2 + 0.25;
    const fit = halfW / (Math.tan(THREE.MathUtils.degToRad(20)) * aspect);
    this.camera.position.set(0, 0, Math.max(3.3, fit));
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  get stats() {
    if (this.mode === 'particles') return `${this.particleCount.toLocaleString()} particles`;
    if (this.mode === 'blocks') return `${this.blockCount.toLocaleString()} blocks`;
    return `${this.vertexCount.toLocaleString()} vertices`;
  }

  // A sharp, high-resolution still from a fixed, well-framed angle (transparent background).
  // Used for screenshots and comic covers so they never catch the model mid-sway.
  renderStill(size = 2048) {
    const r = this.renderer, cam = this.camera;
    const saved = {
      pr: r.getPixelRatio(), pos: cam.position.clone(), target: this.controls.target.clone(),
      rot: this.group.rotation.clone(), intro: this.u.intro.value, snap: this.u.snap.value, upr: this.u.pixelRatio.value,
    };
    if (this.blocks) this.updateBlocks(1);
    this.u.intro.value = 0;
    this.u.snap.value = 0;
    this.group.rotation.set(-0.08, 0.26, 0);

    r.setPixelRatio(1);
    r.setSize(size, size, false);
    cam.aspect = 1;
    cam.updateProjectionMatrix();
    const half = Math.max(this.size.w, this.size.h) / 2 + 0.3;
    cam.position.set(0, 0, half / Math.tan(THREE.MathUtils.degToRad(20)));
    cam.lookAt(0, 0, 0);
    // keep halftone dots and particle sizes looking the same as on screen
    this.u.pixelRatio.value = size / Math.max(1, this.container.clientHeight);
    r.render(this.scene, cam);
    const still = trimCanvas(r.domElement);

    r.setPixelRatio(saved.pr);
    this.resize();
    cam.position.copy(saved.pos);
    this.controls.target.copy(saved.target);
    this.group.rotation.copy(saved.rot);
    this.u.intro.value = saved.intro;
    this.u.snap.value = saved.snap;
    this.u.pixelRatio.value = saved.upr;
    this.controls.update();
    return still;
  }

  async recordClip(seconds = 6) {
    this.renderer.setClearColor(0x0b0b0f, 1);
    const stream = this.renderer.domElement.captureStream(60);
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      .find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const prevMotion = this.motion;
    this.motion = true;
    this.introT = 0; // replay the morph-in animation at the start of the clip
    recorder.start();
    await new Promise((r) => setTimeout(r, seconds * 1000));
    recorder.stop();
    await new Promise((r) => (recorder.onstop = r));
    this.motion = prevMotion;
    this.renderer.setClearColor(0x000000, 0);
    stream.getTracks().forEach((t) => t.stop());
    return new Blob(chunks, { type: mimeType });
  }

  // Bakes what you see into real geometry and textures and saves a .glb file
  // (opens in Blender, Windows 3D Viewer, and online glTF viewers).
  async exportGLB() {
    const target = new THREE.Group();
    const s = this.u.strength.value;

    if (this.mode === 'blocks') {
      target.add(this.bakeBlocks());
    } else if (this.mode === 'popout') {
      const { pw, ph, inset } = this.panel;
      this.group.children.filter((o) => o.userData.exportable).forEach((o) => target.add(o.clone()));
      const panelTex = canvasTexture(comicCanvas(this.canvas, { crop: [inset, inset, 1 - inset, 1 - inset], mask: this.mask }));
      target.add(new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: panelTex })));
      target.add(this.bakeSubject());
    } else {
      const skin = this.mode === 'comic' ? comicCanvas(this.canvas) : this.canvas;
      target.add(this.bakeRelief(canvasTexture(skin)));
      const back = new THREE.Mesh(
        new THREE.PlaneGeometry(this.size.w, this.size.h),
        new THREE.MeshBasicMaterial({ map: canvasTexture(skin), color: 0x5a5a5a }),
      );
      back.position.z = -0.5 * s - 0.03;
      target.add(back);
    }
    const result = await new GLTFExporter().parseAsync(target, { binary: true, maxTextureSize: 2048 });
    return new Blob([result], { type: 'model/gltf-binary' });
  }

  // The popped-out subject: real 3D surface, pixel-perfect edges from the mask (alpha), ink outline baked in
  bakeSubject() {
    const geo = planeWithUV(this.size.w, this.size.h, null, 256);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const s = this.u.strength.value;
    const cols = geo.parameters.widthSegments + 1, rows = geo.parameters.heightSegments + 1;
    const m = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i), v = 1 - uv.getY(i);
      pos.setZ(i, 0.06 + sampleDepth(this.subject, u, v) * s * 0.8);
      m[i] = sampleDepth(this.mask, u, v);
    }
    // keep a vertex if it or a neighbour is inside the subject (so thin bits like ears survive)
    const keep = new Uint8Array(pos.count);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let best = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < cols && yy < rows) best = Math.max(best, m[yy * cols + xx]);
          }
        }
        keep[y * cols + x] = best >= 0.5 ? 1 : 0;
      }
    }
    filterTriangles(geo, (a, b, c) => keep[a] || keep[b] || keep[c]);
    geo.computeVertexNormals();
    const tex = canvasTexture(cutoutCanvas(this.canvas, this.mask));
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide }));
  }

  // Full-picture relief; steep depth jumps are torn open (the backdrop fills the gaps)
  bakeRelief(texture) {
    const geo = planeWithUV(this.size.w, this.size.h, null, 256);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const s = this.u.strength.value;
    const depths = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      depths[i] = sampleDepth(this.depth, uv.getX(i), 1 - uv.getY(i));
      pos.setZ(i, (depths[i] - 0.5) * s);
    }
    filterTriangles(geo, (a, b, c) => Math.max(depths[a], depths[b], depths[c]) - Math.min(depths[a], depths[b], depths[c]) < 0.1);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, side: THREE.DoubleSide }));
  }

  // One merged mesh with vertex colors (works in every viewer, unlike GPU instancing)
  bakeBlocks() {
    const { mesh } = this.blocks;
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    const parts = [];
    for (let i = 0; i < mesh.count; i++) {
      const g = mesh.geometry.clone();
      mesh.getMatrixAt(i, matrix);
      g.applyMatrix4(matrix);
      mesh.getColorAt(i, color);
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < colors.length; k += 3) { colors[k] = color.r; colors[k + 1] = color.g; colors[k + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(g);
    }
    return new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
  }

  // ---------- Building the styles ----------
  rebuild() {
    this.clearGroup();
    const build = {
      popout: () => this.buildPopout(),
      photo: () => this.buildTorn(0),
      comic: () => this.buildTorn(1),
      hologram: () => this.buildHologram(),
      particles: () => this.buildParticles(),
      blocks: () => this.buildBlocks(),
    };
    build[this.mode]();
    this.introT = 0;
  }

  clearGroup() {
    this.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    this.group.clear();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.blocks = this.backdrop = this.panel = this.captionMesh = null;
  }

  surfaceMaterial({ style = 0, cutout = 0, flatten = 0, tear = 0, shadowCut = 0, dim = 1, useLight = 1, glow = false } = {}) {
    return new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
      uniforms: {
        ...this.u,
        style: { value: style }, cutout: { value: cutout }, flatten: { value: flatten }, tear: { value: tear },
        shadowCut: { value: shadowCut }, dim: { value: dim }, useLight: { value: useLight },
      },
      side: THREE.DoubleSide,
      transparent: glow,
      depthWrite: !glow,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }

  surface(material, uvRect, w = this.size.w, h = this.size.h, segments = 320) {
    const geo = planeWithUV(w, h, uvRect, segments);
    this.vertexCount = geo.attributes.position.count;
    return new THREE.Mesh(geo, material);
  }

  // The subject steps out of a comic panel
  buildPopout() {
    const inset = 0.1;
    const pw = this.size.w * (1 - 2 * inset), ph = this.size.h * (1 - 2 * inset);
    this.panel = { pw, ph, inset };

    const page = new THREE.Mesh(new THREE.PlaneGeometry(pw + 0.16, ph + 0.16), new THREE.MeshBasicMaterial({ color: '#f3eee3' }));
    page.position.z = -0.015;
    page.userData.exportable = true;
    const back = this.surface(
      this.surfaceMaterial({ style: 1, flatten: 1, shadowCut: 1, dim: 0.9, useLight: 0 }),
      [inset, inset, 1 - inset, 1 - inset], pw, ph, 64,
    );

    const inkMat = new THREE.MeshBasicMaterial({ color: '#0b0b0f' });
    const t = 0.035;
    const bars = [
      [pw + 2 * t, t, 0, ph / 2 + t / 2], [pw + 2 * t, t, 0, -ph / 2 - t / 2],
      [t, ph, pw / 2 + t / 2, 0], [t, ph, -pw / 2 - t / 2, 0],
    ].map(([w, h, x, y]) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), inkMat);
      bar.position.set(x, y, 0);
      bar.userData.exportable = true;
      return bar;
    });

    const subjectMat = this.surfaceMaterial({ cutout: 1 });
    subjectMat.uniforms.depthMap = this.subjectDepth;
    const subject = this.surface(subjectMat);
    this.group.add(page, back, ...bars, subject);
    this.addCaption();
  }

  addCaption() {
    if (this.captionMesh) {
      this.group.remove(this.captionMesh);
      this.captionMesh.geometry.dispose();
      this.captionMesh.material.map.dispose();
      this.captionMesh.material.dispose();
    }
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const font = '700 64px Bangers, Impact, sans-serif';
    ctx.font = font;
    c.width = Math.ceil(ctx.measureText(this.caption).width + 56);
    c.height = 100;
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#0b0b0f';
    ctx.strokeRect(4, 4, c.width - 8, c.height - 8);
    ctx.font = font;
    ctx.fillStyle = '#0b0b0f';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.caption, 28, 54);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(tex);

    const { pw, ph } = this.panel;
    const h = 0.12;
    const w = Math.min(h * (c.width / c.height), pw * 0.8);
    this.captionMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    this.captionMesh.position.set(-pw / 2 + w / 2 - 0.02, ph / 2 - h / 2 + 0.02, 0.025);
    this.captionMesh.userData.exportable = true;
    this.group.add(this.captionMesh);
  }

  // Real depth; the surface tears at object edges and a dark copy shows through behind
  buildTorn(style) {
    this.backdrop = this.surface(this.surfaceMaterial({ style, flatten: 1, dim: 0.35, useLight: 0 }), null, this.size.w, this.size.h, 1);
    this.backdrop.position.z = -0.5 * this.u.strength.value - 0.03;
    const front = this.surface(this.surfaceMaterial({ style, tear: 0.12 }));
    this.group.add(this.backdrop, front);
  }

  buildHologram() {
    this.group.add(this.surface(this.surfaceMaterial({ style: 2, tear: 0.12, glow: true, useLight: 0 })));
  }

  buildParticles() {
    const maxSide = 420;
    const scale = Math.min(1, maxSide / Math.max(this.canvas.width, this.canvas.height));
    const gw = Math.round(this.canvas.width * scale), gh = Math.round(this.canvas.height * scale);
    const count = gw * gh;
    const pos = new Float32Array(count * 3), uv = new Float32Array(count * 2), rnd = new Float32Array(count);
    for (let y = 0, i = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++, i++) {
        const u = (x + 0.5) / gw, v = 1 - (y + 0.5) / gh;
        pos[i * 3] = (u - 0.5) * this.size.w;
        pos[i * 3 + 1] = (v - 0.5) * this.size.h;
        uv[i * 2] = u; uv[i * 2 + 1] = v;
        rnd[i] = Math.random();
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG, uniforms: this.u, transparent: true });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.particleCount = count;
    this.group.add(points);
  }

  buildBlocks() {
    const res = 72;
    const cell = Math.max(this.size.w, this.size.h) / res;
    const gx = Math.max(1, Math.round(this.size.w / cell)), gy = Math.max(1, Math.round(this.size.h / cell));
    const geo = new THREE.BoxGeometry(cell * 0.9, cell * 0.9, 1);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }), gx * gy);
    this.blocks = { mesh, gx, gy, cell, pixels: readPixels(this.canvas, gx, gy) };
    this.blockCount = gx * gy;
    this.colorBlocks();
    this.updateBlocks(0);
    this.group.add(mesh);
  }

  colorBlocks() {
    const { mesh, gx, gy, pixels } = this.blocks;
    const color = new THREE.Color();
    for (let y = 0; y < gy; y++) {
      for (let x = 0; x < gx; x++) {
        const i = y * gx + x;
        if (this.u.xray.value) {
          const t = sampleDepth(this.depth, (x + 0.5) / gx, (y + 0.5) / gy);
          color.setRGB(clamp01(1.5 - Math.abs(4 * t - 3)), clamp01(1.5 - Math.abs(4 * t - 2)), clamp01(1.5 - Math.abs(4 * t - 1)), THREE.SRGBColorSpace);
        } else {
          color.setRGB(pixels[i * 4] / 255, pixels[i * 4 + 1] / 255, pixels[i * 4 + 2] / 255, THREE.SRGBColorSpace);
        }
        mesh.setColorAt(i, color);
      }
    }
    mesh.instanceColor.needsUpdate = true;
  }

  updateBlocks(k) {
    const { mesh, gx, gy, cell } = this.blocks;
    const s = this.u.strength.value;
    const dummy = new THREE.Object3D();
    for (let y = 0; y < gy; y++) {
      for (let x = 0; x < gx; x++) {
        const height = (0.02 + sampleDepth(this.depth, (x + 0.5) / gx, (y + 0.5) / gy) * s) * k + 0.001;
        dummy.position.set((x + 0.5) * cell - (gx * cell) / 2, (gy * cell) / 2 - (y + 0.5) * cell, height / 2 - s / 2);
        dummy.scale.set(1, 1, height);
        dummy.updateMatrix();
        mesh.setMatrixAt(y * gx + x, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  // ---------- Render loop ----------
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.time += dt;
    this.u.time.value = this.time;

    if (this.introT < 1.3) {
      this.introT += dt;
      const k = ease(Math.min(this.introT / 1.3, 1));
      this.u.intro.value = 1 - k;
      if (this.blocks) this.updateBlocks(k);
    }

    if (this.snapT >= 0) {
      this.snapT += dt;
      const t = this.snapT;
      let v = 0;
      if (t < 2.2) v = easeIn(t / 2.2);
      else if (t < 3) v = 1;
      else if (t < 4.6) v = 1 - ease((t - 3) / 1.6);
      else { this.snapT = -1; this.snapDone(); }
      this.u.snap.value = v;
    }

    let ry = this.pointer.x * 0.3, rx = this.pointer.y * 0.18;
    if (this.motion) { ry += Math.sin(this.time * 0.55) * 0.3; rx += Math.sin(this.time * 0.8) * 0.06; }
    const k = Math.min(1, dt * 3);
    this.group.rotation.y += (ry - this.group.rotation.y) * k;
    this.group.rotation.x += (rx - this.group.rotation.x) * k;

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

// ---------- Helpers ----------
function planeWithUV(w, h, uvRect, segments) {
  const sx = Math.max(1, Math.round((segments * w) / 2)), sy = Math.max(1, Math.round((segments * h) / 2));
  const geo = new THREE.PlaneGeometry(w, h, sx, sy);
  if (uvRect) {
    const [u0, v0, u1, v1] = uvRect, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  return geo;
}

function makeDepthTexture({ width: w, height: h, data }) {
  const bytes = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) bytes[(h - 1 - y) * w + x] = Math.round(data[y * w + x] * 255);
  }
  const tex = new THREE.DataTexture(bytes, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.unpackAlignment = 1;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function filterTriangles(geo, keepTriangle) {
  const index = geo.index.array, kept = [];
  for (let i = 0; i < index.length; i += 3) {
    if (keepTriangle(index[i], index[i + 1], index[i + 2])) kept.push(index[i], index[i + 1], index[i + 2]);
  }
  geo.setIndex(kept);
}

// Crops away empty transparent space around a render (with a little breathing room)
function trimCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return c;
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(c.width - 1, maxX + pad);
  maxY = Math.min(c.height - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// The picture with the subject mask as transparency, plus the same ink outline you see on screen
function cutoutCanvas(canvas, mask) {
  const w = canvas.width, h = canvas.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  const img = ctx.getImageData(0, 0, w, h), px = img.data;
  const o = 0.007, q = o * 0.7;
  const offsets = [[o, 0], [-o, 0], [0, o], [0, -o], [q, q], [-q, q], [q, -q], [-q, -q]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1), v = y / (h - 1), i = (y * w + x) * 4;
      const m = sampleDepth(mask, u, v);
      px[i + 3] = m >= 0.5 ? 255 : 0;
      if (m < 0.5) continue;
      let near = 1;
      for (const [dx, dy] of offsets) near = Math.min(near, sampleDepth(mask, u + dx, v + dy));
      const border = Math.min(u, 1 - u, v, 1 - v);
      const ink = border < 0.012 ? 0 : clamp01((0.55 - near) / 0.2);
      px[i] += (11 - px[i]) * ink;
      px[i + 1] += (11 - px[i + 1]) * ink;
      px[i + 2] += (15 - px[i + 2]) * ink;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// 2D version of the Comic shader: misprinted plates, posterized color, halftone shadows,
// and (for the pop-out panel) the dark "shadow" the subject leaves behind on the page
function comicCanvas(canvas, { crop = [0, 0, 1, 1], mask = null } = {}) {
  const [u0, v0, u1, v1] = crop;
  const sx = Math.round(u0 * canvas.width), sy = Math.round(v0 * canvas.height);
  const w = Math.round((u1 - u0) * canvas.width), h = Math.round((v1 - v0) * canvas.height);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, sx, sy, w, h, 0, 0, w, h);
  const src = ctx.getImageData(0, 0, w, h).data;
  const img = ctx.createImageData(w, h), px = img.data;
  const cell = Math.max(4, Math.round(Math.max(w, h) / 160));
  const post = (v) => (Math.round((v / 255) * 5) / 5) * 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = post(src[(y * w + Math.min(w - 1, x + 2)) * 4]);
      let g = post(src[i + 1]);
      let b = post(src[(y * w + Math.max(0, x - 2)) * 4 + 2]);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const rx = ((x + y) * 0.7071) / cell, ry = ((y - x) * 0.7071) / cell;
      const fx = rx - Math.floor(rx) - 0.5, fy = ry - Math.floor(ry) - 0.5;
      const radius = Math.sqrt(Math.max(0, 1 - lum)) * 0.62;
      const k = Math.hypot(fx, fy) < radius ? 1 - 0.75 * 0.7 : 1;
      r *= k; g *= k; b *= k;
      if (mask) {
        const m = sampleDepth(mask, u0 + (x / (w - 1)) * (u1 - u0), v0 + (y / (h - 1)) * (v1 - v0));
        const shade = 0.6 * clamp01((m - 0.4) / 0.2);
        r = (r + (11 - r) * shade) * 0.9;
        g = (g + (11 - g) * shade) * 0.9;
        b = (b + (15 - b) * shade) * 0.9;
      }
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
