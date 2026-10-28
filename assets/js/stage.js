// The 3D stage behind the first five screens.
//   hero      the phone, centred, showing the home screen, the app's coin faces
//             orbiting it on a tilted ring (in front of it low, behind it high)
//   chapters  the phone moves aside (right on a desktop, up the middle on a
//             phone), turns to a different angle for each chapter and plays
//             that chapter's real recording, with a prop beside it:
//             scan    the shop's QR on a stand
//             add     the bill as equal coins
//             remind  the friend's phone, which buzzes with the reminder
//             settle  a stack of coins with Singh's "paid back" coin on top
// site.js owns the scroll and dispatches sf:scroll { hero, story, ch }; this
// file tells it when a chapter's clip ends (sf:clipend), for the auto-advance.
import * as THREE from "../vendor/three.module.min.js";
import { RoomEnvironment } from "../vendor/RoomEnvironment.js";

const stageEl = document.getElementById("stage");
const canvas = document.getElementById("stage-canvas");
const tagsEl = document.getElementById("tags");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
// Same test as the CSS that puts the story's words in a left column.
const wideQuery = matchMedia("(min-width: 600px) and (min-aspect-ratio: 21/20)");
const emit = (name, detail = {}) => {
  (window.sfState ??= {})[name] = detail;
  document.dispatchEvent(new CustomEvent(name, { detail }));
};
const SCAN = 0, ADD = 1, REMIND = 2, SETTLE = 3;

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
function noGL(err) {
  if (err) console.error(err);
  document.documentElement.classList.add("no-webgl");
  emit("sf:nogl");
}
if (!hasWebGL()) noGL();
else start().catch(noGL);

async function start() {
  let running = false, last = 0, quietFor = 0, visible = true; // loop state, read by wake()
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, finePointer ? 2 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 5, 6);
  const rim = new THREE.DirectionalLight(0xff9ccf, 1.2);
  rim.position.set(-4, 2, -3);
  scene.add(key, rim);

  const FOV = 28, DIST = 8;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, DIST);
  camera.lookAt(0, 0, 0);

  const loader = new THREE.TextureLoader();
  const tex = (url) => new Promise((ok, fail) => loader.load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    ok(t);
  }, undefined, fail));
  const loadImg = (url) => new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = url;
  });
  const imgCanvas = async (url, w, h = w) => {
    const img = await loadImg(url);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return c;
  };
  const canvasTex = (c, rot = 0) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    if (rot) { t.center.set(0.5, 0.5); t.rotation = rot; }
    return t;
  };
  await document.fonts.load('700 200px "Anek Latin"').catch(() => {});

  // Everything that moves with the phone's place on screen. The phone turns
  // inside it; the ring and the props do not turn with it.
  const rig = new THREE.Group();
  scene.add(rig);

  // ------------------------------------------------------------- phones
  // A current phone: 20:9 screen, bezels about 1.4 mm, flat sides with a soft
  // edge, corners a little under a tenth of its width.
  const SW = 1, SH = SW * 20 / 9, B = 0.028;
  const PW = SW + 2 * B, PH = SH + 2 * B * 1.12, PR = 0.095, PD = 0.1, BEV = 0.016;
  const front = PD / 2;
  function rounded(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    return s;
  }
  const bodyGeo = new THREE.ExtrudeGeometry(rounded(PW - 2 * BEV, PH - 2 * BEV, PR - BEV), {
    depth: PD - 2 * BEV, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 6, curveSegments: 28,
  });
  bodyGeo.translate(0, 0, -(PD - 2 * BEV) / 2);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x050205, metalness: 0.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x4b3340, metalness: 1, roughness: 0.32, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const backGeo = new THREE.ShapeGeometry(rounded(PW - 0.02, PH - 0.02, PR - 0.01), 28);
  const backMat = new THREE.MeshPhysicalMaterial({ color: 0x5a1238, metalness: 0.15, roughness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.35 });
  const ringGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.024, 40);
  const lensGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.026, 40);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x8a7380, metalness: 1, roughness: 0.25 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x08070c, metalness: 0.6, roughness: 0.08, clearcoat: 1, iridescence: 0.6 });
  const flashMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0x3a2a10, roughness: 0.3 });
  const iconTex = tex("/assets/img/icon-192.png");
  const screenGeo = new THREE.PlaneGeometry(SW, SH);
  // The screen: rounded corners, a punch-hole camera, a crossfade between two
  // pictures, and a faint sheen that slides as the phone turns.
  const screenMaterial = () => new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      a: { value: null }, b: { value: null }, mixv: { value: 0 },
      size: { value: new THREE.Vector2(SW, SH) }, radius: { value: PR - B - 0.004 },
      sheen: { value: 0 }, glow: { value: 1 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D a; uniform sampler2D b; uniform float mixv; uniform vec2 size; uniform float radius; uniform float sheen; uniform float glow;
      varying vec2 vUv;
      float box(vec2 p, vec2 h, float r){ vec2 q = abs(p) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){
        vec2 p = (vUv - 0.5) * size;
        float alpha = 1.0 - smoothstep(-0.002, 0.002, box(p, size * 0.5, radius));
        vec3 c = mix(texture2D(a, vUv).rgb, texture2D(b, vUv).rgb, mixv) * glow;
        float hole = length(p - vec2(0.0, size.y * 0.5 - 0.048));
        c = mix(c, vec3(0.01), 1.0 - smoothstep(0.0165, 0.0185, hole));
        c += vec3(0.05, 0.06, 0.09) * (1.0 - smoothstep(0.004, 0.009, hole));
        float band = (vUv.x * 0.55 + vUv.y * 0.45) - sheen;
        c += vec3(1.0) * 0.045 * smoothstep(0.22, 0.0, abs(band));
        gl_FragColor = vec4(c, alpha);
        #include <colorspace_fragment>
      }`,
  });
  function buildPhone(mat) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(bodyGeo, [glass, frameMat]));
    // frosted plum back, three lenses top left, the icon low in the middle
    const back = new THREE.Mesh(backGeo, backMat);
    back.position.z = -front - 0.001;
    back.rotation.y = Math.PI;
    g.add(back);
    for (let i = 0; i < 3; i++) {
      const lens = new THREE.Group();
      const ring = new THREE.Mesh(ringGeo, ringMat);
      const glassLens = new THREE.Mesh(lensGeo, lensMat);
      ring.rotation.x = glassLens.rotation.x = Math.PI / 2;
      lens.add(ring, glassLens);
      lens.position.set(-PW / 2 + 0.17, PH / 2 - 0.2 - i * 0.215, -front - 0.012);
      g.add(lens);
    }
    const flash = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), flashMat);
    flash.position.set(-PW / 2 + 0.33, PH / 2 - 0.2, -front - 0.002);
    flash.rotation.y = Math.PI;
    g.add(flash);
    iconTex.then((t) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.4 }));
      m.position.set(0, -0.35, -front - 0.003);
      m.rotation.y = Math.PI;
      g.add(m);
    });
    // side keys, right edge: volume above power
    for (const [y, h] of [[0.55, 0.3], [0.2, 0.15]]) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.018, h, 0.034), frameMat);
      k.position.set(PW / 2 + 0.006, y, 0);
      g.add(k);
    }
    const screen = new THREE.Mesh(screenGeo, mat);
    screen.position.z = front + 0.0012;
    g.add(screen);
    return g;
  }

  const screenMat = screenMaterial();
  const phone = buildPhone(screenMat);
  rig.add(phone);

  const home = await tex("/assets/shots/home.webp");
  screenMat.uniforms.a.value = home;
  screenMat.uniforms.b.value = home;

  // ------------------------------------------------------- the four clips
  // Which file (tools/video-variants.sh): VP9 where the browser plays it, H.264
  // where not; the 540-wide cut on a phone, whose 3D phone is ~240 css px wide.
  const vp9 = document.createElement("video").canPlayType('video/webm; codecs="vp9"') !== "";
  const cut = wideQuery.matches ? "" : "-540";
  const CLIPS = ["scan", "add", "remind", "settle"].map((name, i) => {
    const v = Object.assign(document.createElement("video"), { muted: true, playsInline: true, preload: "none", crossOrigin: "anonymous" });
    v.setAttribute("muted", "");
    v.src = `/assets/video/${name}${cut}.${vp9 ? "webm" : "mp4"}`;
    const clip = { name, i, v, tex: null, poster: null, first: null, failed: false };
    // a browser that says it plays VP9 and then can't gets the H.264 file
    v.addEventListener("error", () => {
      if (!v.src.endsWith(".webm")) { clip.failed = true; return; }
      v.src = `/assets/video/${name}${cut}.mp4`;
      if (current === clip) v.play().catch(() => {});
    });
    // Each file is cut right after its last animation. Hold the last frame for
    // a second, tell site.js (it may move on to the next chapter), and if it
    // didn't, play again.
    v.addEventListener("ended", () => {
      if (current !== clip) return;
      const endedAt = performance.now();
      emit("sf:clipend", { ch: i });
      setTimeout(() => {
        const adv = window.sfState?.["sf:advance"];
        if (adv?.ch === i && adv.at >= endedAt) return; // site.js is moving on
        if (current === clip && v.paused) { v.currentTime = 0; v.play().catch(() => {}); }
      }, 1000);
    });
    return clip;
  });
  let current = null;
  const videoTex = (clip) => (clip.tex ??= Object.assign(new THREE.VideoTexture(clip.v), { colorSpace: THREE.SRGBColorSpace }));
  // The clip's first frame, a 20 KB still: on screen until the clip has a frame
  // of its own, instead of an empty screen while it downloads.
  const firstStill = (clip) => (clip.first ??= tex(`/assets/video/${clip.name}-first.webp`).catch(() => home));
  async function screenFor(ch) {
    const clip = CLIPS[ch];
    if (!clip) return home;
    if (!clip.failed && !reduced) {
      if (clip.v.readyState >= 2) return videoTex(clip);
      clip.v.addEventListener("playing", () => { if (current === clip) showTex(videoTex(clip)); }, { once: true });
      return firstStill(clip);
    }
    clip.poster ??= tex(`/assets/video/${clip.name}-poster.jpg`).catch(() => home);
    return clip.poster;
  }
  // put a texture on the screen now, mid-crossfade or not
  const showTex = (t) => {
    screenMat.uniforms.b.value = t;
    if (!screenAnim) screenMat.uniforms.a.value = t;
    wake();
  };
  // Once the page is up: the first chapter's clip starts downloading, and every
  // first frame, so the story opens on a picture however slow the network.
  const opened = () => {
    if (reduced) return;
    // preload alone starts the download; load() would reset a clip already playing
    const go = () => { CLIPS[0].v.preload = "auto"; CLIPS.forEach(firstStill); };
    (window.requestIdleCallback ?? setTimeout)(go, { timeout: 1500 });
  };
  if (window.sfState?.["sf:opened"]) opened(); // the opening can finish before this module does
  else document.addEventListener("sf:opened", opened, { once: true });
  // Seconds into the chapter's clip; Infinity when there is no clip to follow
  // (reduced motion, or it failed), so the props show their end state.
  const clipTime = () => {
    if (reduced || current?.failed) return Infinity;
    return current?.v.currentTime ?? 0;
  };
  let screenAnim = null;
  async function showChapter(ch) {
    for (const c of CLIPS) if (c !== CLIPS[ch]) c.v.pause();
    current = CLIPS[ch] ?? null;
    if (current && !reduced) {
      current.v.preload = "auto";
      current.v.currentTime = 0;
      current.v.play().catch(() => {});
      const next = CLIPS[ch + 1];
      if (next) {
        next.v.preload = "auto";
        videoTex(next);
      }
    }
    const t = await screenFor(ch);
    if (current !== (CLIPS[ch] ?? null)) return;
    screenMat.uniforms.b.value = t;
    screenMat.uniforms.mixv.value = 0;
    screenAnim = { t: 0 };
    kick = 0.25;
    wake();
  }

  // -------------------------------------------------------------- coins
  const coinMeta = await (await fetch("/assets/coins/coins.json")).json();
  const byId = Object.fromEntries(coinMeta.map((c) => [c.id, c]));
  const CR = 0.2, CT = 0.036;
  const coinGeo = new THREE.CylinderGeometry(CR, CR, CT, 64, 1);
  const rimMats = {};
  const rimMat = (hex) => (rimMats[hex] ??= new THREE.MeshStandardMaterial({ color: hex, metalness: 1, roughness: 0.32 }));
  const faceMats = {};
  const faceMat = async (id) => (faceMats[id] ??= new THREE.MeshStandardMaterial({
    map: canvasTex(await imgCanvas(`/assets/coins/${id}-face.svg`, 512), Math.PI / 2), metalness: 0.25, roughness: 0.42,
  }));
  const plainFace = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#FFCB45"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#F2B632"; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#C98A10"; g.font = '700 132px "Anek Latin", sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("₹", 128, 136);
    return new THREE.MeshStandardMaterial({ map: canvasTex(c, Math.PI / 2), metalness: 0.35, roughness: 0.38 });
  })();
  const edgeMat = (() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 8;
    const g = c.getContext("2d");
    for (let x = 0; x < 512; x += 8) { g.fillStyle = "#F2B632"; g.fillRect(x, 0, 5, 8); g.fillStyle = "#B07A0C"; g.fillRect(x + 5, 0, 3, 8); }
    return new THREE.MeshStandardMaterial({ map: canvasTex(c), metalness: 0.9, roughness: 0.34 });
  })();
  async function faceCoin(id) {
    const mesh = new THREE.Mesh(coinGeo, [rimMat(new THREE.Color(byId[id].rim).getHex()), await faceMat(id), plainFace]);
    mesh.rotation.x = Math.PI / 2; // face towards the camera
    const pivot = new THREE.Group();
    pivot.add(mesh);
    pivot.userData = { spin: 0, spinT: 0, hover: 0, s: 0 };
    return pivot;
  }
  const plainCoin = () => new THREE.Mesh(coinGeo, [edgeMat, plainFace, plainFace]);
  const tag = (html) => {
    const el = document.createElement("div");
    el.className = "tag";
    el.innerHTML = html;
    el.style.opacity = "0";
    tagsEl.appendChild(el);
    return el;
  };

  // Wind streaks: thin ribbons that taper to nothing, drawn through points the
  // caller supplies each frame (head first). Additive, so they read as air,
  // not as solid shapes, and they never hide what is behind them.
  const streakMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(0xf6dfe9) }, opacity: { value: 0.32 } },
    vertexShader: `attribute float fade; varying float vF; void main(){ vF = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; varying float vF; void main(){ gl_FragColor = vec4(color * vF * opacity, 1.0); }`,
  });
  function streak(n, width) {
    const pos = new Float32Array(n * 6), fade = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < n - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("fade", new THREE.BufferAttribute(fade, 1));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, streakMat);
    mesh.frustumCulled = false;
    const d = new THREE.Vector3();
    mesh.userData.set = (pts, strength) => {
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        d.subVectors(a, b);
        const len = Math.hypot(d.x, d.y) || 1;
        const u = i / (n - 1);
        const w = width * (1 - u) * 0.5;
        const px = (-d.y / len) * w, py = (d.x / len) * w;
        pos.set([pts[i].x + px, pts[i].y + py, pts[i].z, pts[i].x - px, pts[i].y - py, pts[i].z], i * 6);
        const f = (1 - u) ** 1.6 * Math.min(1, u * 6) * strength; // soft at both ends
        fade[i * 2] = fade[i * 2 + 1] = f;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.fade.needsUpdate = true;
      mesh.visible = strength > 0.01;
    };
    rig.add(mesh);
    return mesh;
  }
  const trailPts = (n) => Array.from({ length: n }, () => new THREE.Vector3());

  // hero ring: tilted, so a coin passes in front of the phone low down and
  // behind it high up
  const RING = ["stonks", "paisa-vasool", "kanjoos", "treat-on-me", "rich-uncle", "settle-king", "sus", "still-waiting"];
  const ring = await Promise.all(RING.map(async (id, i) => {
    const p = await faceCoin(id);
    p.userData.i = i;
    p.userData.phase = i * 1.7;
    p.userData.trails = [streak(28, 0.035), streak(22, 0.022)];
    rig.add(p);
    return p;
  }));
  const TP = trailPts(28);

  // scan: the QR on a little acrylic stand. Scanning it with a real phone is,
  // as the sign says, at your own risk.
  const standee = new THREE.Group();
  const QR_Y = 0.633 - (352 / 720) * 1.266; // QR spans y 172..532 of the 720px card
  {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 720;
    const g = c.getContext("2d");
    g.fillStyle = "#fcf9f3"; g.fillRect(0, 0, 512, 720);
    g.fillStyle = "#6f044d"; g.fillRect(0, 0, 512, 132);
    g.fillStyle = "#fbf6ee"; g.font = '700 46px "Anek Latin", sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("scan-at-your-own@risk", 256, 70);
    g.drawImage(await imgCanvas("/assets/img/standee-qr.svg", 360), 76, 172, 360, 360);
    g.fillStyle = "#2b1621"; g.font = '600 36px "Anek Latin", sans-serif';
    g.fillText("Go on, scan it", 256, 604);
    g.fillStyle = "#6c5662"; g.font = '500 28px "Anek Latin", sans-serif';
    g.fillText("with any QR scanner", 256, 652);
    const tilt = -0.12;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.266), new THREE.MeshStandardMaterial({ map: canvasTex(c), roughness: 0.55 }));
    card.position.y = 0.72; card.rotation.x = tilt;
    const acrylic = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.36, 0.03), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.18 }));
    acrylic.position.set(0, 0.72, -0.02); acrylic.rotation.x = tilt;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.34), new THREE.MeshPhysicalMaterial({ color: 0x2b1621, roughness: 0.4, clearcoat: 0.6 }));
    base.position.y = 0.04;
    // on the card itself, so it leans with it; QR_Y is the QR's centre on the card
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.02), new THREE.MeshBasicMaterial({ color: 0xff5fae, transparent: true, opacity: 0.85 }));
    beam.position.set(0, QR_Y, 0.004);
    card.add(beam);
    standee.add(acrylic, card, base);
    standee.userData = { beam, s: 0 };
    rig.add(standee);
  }

  // add: the bill as four equal coins
  const SPLIT = [
    { id: "settle-king", name: "You" }, { id: "treat-on-me", name: "Luffy" },
    { id: "stonks", name: "Elon" }, { id: "sus", name: "Oggy" },
  ];
  const splitCoins = await Promise.all(SPLIT.map(async (s) => {
    const p = await faceCoin(s.id);
    rig.add(p);
    return p;
  }));
  const splitTags = SPLIT.map((s) => tag(`${s.name}<b>₹85</b>`));

  // remind: the friend's phone, asleep until the nudge lands on it
  const lockScreen = async (withNote) => {
    const c = document.createElement("canvas");
    c.width = 720; c.height = 1600;
    const g = c.getContext("2d");
    g.fillStyle = "#1c0612"; g.fillRect(0, 0, 720, 1600);
    g.fillStyle = "#33091f"; g.beginPath(); g.arc(560, 1240, 520, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f6efe3"; g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.font = '600 200px "Anek Latin", sans-serif'; g.fillText("9:41", 360, 420);
    g.font = '500 40px "Anek Latin", sans-serif'; g.fillStyle = "#c9b3bf"; g.fillText("Tuesday, 27 October", 360, 490);
    if (withNote) {
      g.fillStyle = "rgba(252,249,243,0.95)";
      g.beginPath(); g.roundRect(36, 580, 648, 220, 40); g.fill();
      g.drawImage(await loadImg("/assets/img/icon-192.png"), 70, 616, 92, 92);
      g.textAlign = "left"; g.fillStyle = "#2b1621";
      g.font = '700 40px "Anek Latin", sans-serif'; g.fillText("Kabir reminded you", 190, 652);
      g.font = '500 34px "Anek Latin", sans-serif'; g.fillStyle = "#4a3540";
      g.fillText("You owe Kabir ₹940.", 190, 704);
      g.fillText("Tap to settle up.", 190, 750);
      g.textAlign = "right"; g.fillStyle = "#6c5662"; g.font = '500 30px "Anek Latin", sans-serif'; g.fillText("now", 650, 652);
    }
    g.textAlign = "center"; g.fillStyle = "#c9b3bf"; g.font = '500 30px "Anek Latin", sans-serif'; g.fillText("Luffy's phone", 360, 1500);
    return canvasTex(c);
  };
  const friendMat = screenMaterial();
  [friendMat.uniforms.a.value, friendMat.uniforms.b.value] = await Promise.all([lockScreen(false), lockScreen(true)]);
  const friend = buildPhone(friendMat);
  friend.userData = { s: 0 };
  rig.add(friend);
  const nudge = await faceCoin("still-waiting");
  rig.add(nudge);
  const nudgeTrails = [streak(30, 0.06), streak(24, 0.035)];
  const NP = trailPts(30);

  // settle: what Singh got back, as a stack that builds up
  const stack = new THREE.Group();
  const stackCoins = Array.from({ length: 9 }, (_, i) => {
    const c = plainCoin();
    c.userData.y = CT / 2 + i * CT * 1.05;
    c.userData.k = i;
    c.position.y = c.userData.y + 2.2;
    stack.add(c);
    return c;
  });
  const paid = await faceCoin("paid-back");
  stack.add(paid);
  rig.add(stack);
  const settleTag = tag(`Singh<b>₹620 settled</b>`);

  for (const m of [friendMat.uniforms.a.value, friendMat.uniforms.b.value]) renderer.initTexture(m);
  standee.traverse((o) => { if (o.material?.map) renderer.initTexture(o.material.map); });

  // ------------------------------------------------------- interaction
  const pointer = new THREE.Vector2(0, 0);
  const ndc = new THREE.Vector2(9, 9);
  let drag = null, dragY = 0, kick = 0;
  const raycaster = new THREE.Raycaster();
  const toNdc = (e, out) => {
    const r = canvas.getBoundingClientRect();
    return out.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  };
  canvas.addEventListener("pointermove", (e) => {
    toNdc(e, pointer); ndc.copy(pointer);
    if (drag) dragY = drag.base + (e.clientX - drag.x) / canvas.clientWidth * 4;
    wake();
  });
  canvas.addEventListener("pointerleave", () => { pointer.set(0, 0); ndc.set(9, 9); wake(); });
  canvas.addEventListener("pointerdown", (e) => {
    toNdc(e, ndc);
    const hit = pick();
    if (hit) { hit.userData.spinT += Math.PI * 2; window.sfCoinSound?.(); wake(); return; }
    if (e.pointerType === "mouse") e.preventDefault(); // no text selection while turning the phone
    drag = { x: e.clientX, base: dragY };
    canvas.setPointerCapture(e.pointerId);
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  const pickable = () => [...ring, ...splitCoins, paid].filter((p) => p.userData.s > 0.3).map((p) => p.children[0]);
  function pick() {
    raycaster.setFromCamera(ndc, camera);
    const h = raycaster.intersectObjects(pickable(), false)[0];
    return h ? h.object.parent : null;
  }

  // ------------------------------------------------------------- sizing
  let W = 1, H = 1, visH = 1, visW = 1;
  function resize() {
    const r = stageEl.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = r.width; H = r.height;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    visH = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    visW = visH * camera.aspect;
    wake();
  }
  new ResizeObserver(resize).observe(stageEl);
  resize();

  // -------------------------------------------------------- the scroll
  let st = { hero: 0, story: 0, ch: -1 };
  let ch = -2, chT = 0; // chT: seconds since the chapter started
  function onScroll(d) {
    st = d;
    if (d.ch !== ch) { ch = d.ch; chT = 0; showChapter(ch); }
    wake();
  }
  document.addEventListener("sf:scroll", (e) => onScroll(e.detail));

  // ---------------------------------------------------------------- loop
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(stageEl);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
  function wake() {
    quietFor = 0;
    if (!running && visible && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  }
  const k = (lambda, dt) => (reduced ? 1 : 1 - Math.exp(-lambda * dt));
  const smooth = (e) => { e = Math.min(1, Math.max(0, e)); return e * e * (3 - 2 * e); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const v3 = new THREE.Vector3();
  const v3b = new THREE.Vector3();
  // Each chapter holds the phone at its own angle, always turned towards the
  // middle of the screen, never away from it.
  const POSE = [
    { ry: -0.2, rx: 0.16, rz: 0.05 },    // scan: leaning back, as if held up to the stand
    { ry: -0.36, rx: 0.05, rz: 0.03 },   // add
    { ry: -0.1, rx: -0.06, rz: -0.04 },  // remind
    { ry: -0.28, rx: 0.1, rz: -0.025 },  // settle
  ];
  const rot = { x: 0, y: -0.26, z: 0 };
  const label = (el, obj, dy, alpha) => {
    obj.getWorldPosition(v3).project(camera);
    el.style.transform = `translate(${(v3.x * 0.5 + 0.5) * W}px, ${(-v3.y * 0.5 + 0.5) * H + dy}px) translate(-50%, 0)`;
    el.style.opacity = String(alpha);
  };
  let fxNow = 0.5;
  let firstFrame = true;

  function frame(now) {
    const raw = (now - last) / 1000;
    const dt = Math.min(0.05, raw);
    last = now;
    const t = now / 1000;
    chT += Math.min(0.25, raw); // real time, so a slow device's props still arrive on cue
    const wide = wideQuery.matches;
    const h = smooth(st.hero / 0.85); // 0 hero -> 1 story
    const p = clipTime();

    // where the phone sits, worked out in screen fractions then turned into
    // world units, so it fits any window
    const short = wide && H < 500; // a phone on its side
    // short phones: a smaller phone, so it never reaches the hero line
    const heroFit = wide ? (short ? 0.5 : 0.62) : Math.min(0.53, (0.53 * H) / 800);
    const storyFit = wide ? 0.8 : Math.min(0.62, (0.68 * visW) / (visH * PW / PH));
    const fit = lerp(heroFit, storyFit, h);
    const s = (fit * visH) / PH;
    // on a phone the remind chapter makes room for the second phone
    const fxT = wide ? lerp(0.5, ch === REMIND ? 0.74 : 0.69, h) : ch === REMIND ? 0.66 : 0.5;
    fxNow += (fxT - fxNow) * (h < 0.99 ? 1 : k(4, dt));
    // on a phone the story's words start at copyTop (site.css: min(75svh, 100svh - 170px))
    // and the phone ends just above them
    const copyTop = Math.min(0.75, 1 - 170 / H);
    const fy = wide ? lerp(short ? 0.38 : 0.44, 0.5, h) : lerp(0.51, copyTop - 0.02 - storyFit / 2, h);
    rig.position.set((fxNow - 0.5) * visW, (0.5 - fy) * visH, 0);
    rig.scale.setScalar(s);
    const px = (H / visH) * s; // css px per rig unit

    // the phone's angle: the chapter's pose, plus a hand on it
    const pose = POSE[Math.max(0, ch)] ?? POSE[0];
    const tilt = wide ? 1 : 0.55;
    const idle = reduced ? 0 : Math.sin(t * 0.6) * 0.05;
    if (!drag) dragY += (0 - dragY) * k(2.2, dt);
    kick += (0 - kick) * k(3, dt);
    let ty = (ch < 0 ? -0.26 + idle : pose.ry * tilt + idle * 0.5) + pointer.x * (finePointer ? 0.2 : 0) - kick;
    if (!drag) ty = Math.min(0.12, Math.max(-0.55, ty)); // never shows its back unless you turn it
    ty += dragY;
    const tx = (ch < 0 ? 0.04 : pose.rx * tilt) - pointer.y * (finePointer ? 0.1 : 0) + (reduced ? 0 : Math.sin(t * 0.45) * 0.025);
    const tz = ch < 0 ? 0 : pose.rz * tilt;
    rot.y += (ty - rot.y) * k(4, dt); rot.x += (tx - rot.x) * k(4, dt); rot.z += (tz - rot.z) * k(4, dt);
    phone.rotation.set(rot.x, rot.y, rot.z);
    screenMat.uniforms.sheen.value = 0.5 + rot.y * 0.9 - rot.x * 0.4;
    if (screenAnim) {
      screenAnim.t += dt / 0.4;
      screenMat.uniforms.mixv.value = smooth(screenAnim.t);
      if (screenAnim.t >= 1) { screenMat.uniforms.a.value = screenMat.uniforms.b.value; screenMat.uniforms.mixv.value = 0; screenAnim = null; }
    }

    // hero ring
    const ringOn = ch < 0 ? 1 - h : 0;
    const Rx = Math.min(1.32, visW / 2 / s - CR - 0.06), Ry = 0.46, Rz = 1.05, y0 = -0.32;
    const hit = finePointer ? pick() : null;
    canvas.style.cursor = hit ? "pointer" : drag ? "grabbing" : "grab";
    for (const c of ring) {
      const u = c.userData;
      const a = (u.i / RING.length) * Math.PI * 2 + (reduced ? 0 : t * 0.16);
      const spread = 1 + (1 - ringOn) * 0.6; // they drift out as the hero leaves
      // a slow wave travels round the ring, each coin a beat behind the last
      const wave = reduced ? 0 : Math.sin(t * 1.4 - u.i * 0.785);
      v3.set(Math.cos(a) * Rx * spread, y0 - Math.sin(a) * Ry + wave * 0.07, Math.sin(a) * Rz);
      c.position.lerp(v3, k(6, dt));
      u.hover += ((hit === c ? 1 : 0) - u.hover) * k(10, dt);
      u.s += (ringOn - u.s) * k(5, dt);
      c.scale.setScalar(Math.max(0.0001, u.s * (1 + u.hover * 0.12) * (wide ? 1 : 0.78)));
      u.spin += (u.spinT - u.spin) * k(4.5, dt);
      c.rotation.set(Math.sin(u.phase) * 0.12 + wave * 0.12, u.spin + (reduced ? 0 : Math.sin(t * 0.8 + u.phase) * 0.45), 0);
      c.visible = u.s > 0.01;
      // the streaks follow the orbit behind the coin, one above, one below
      u.trails.forEach((tr, j) => {
        const n = j ? 22 : 28, off = j ? -0.11 : 0.1, span = j ? 0.5 : 0.7;
        for (let q = 0; q < n; q++) {
          const aq = a - (q / (n - 1)) * span;
          const wq = reduced ? 0 : Math.sin((t - q * 0.02) * 1.4 - u.i * 0.785);
          TP[q].set(Math.cos(aq) * Rx * spread, y0 - Math.sin(aq) * Ry + wq * 0.07 + off * u.s, Math.sin(aq) * Rz);
        }
        tr.userData.set(TP, reduced ? 0 : u.s);
      });
    }

    const on = (i) => (ch === i ? 1 : 0);

    // scan: the stand beside the phone, its scan line running
    {
      const u = standee.userData;
      u.s += (on(SCAN) - u.s) * k(5, dt);
      standee.visible = u.s > 0.01;
      // on a phone it stands in front, low on the left, so the phone never hides it
      standee.scale.setScalar(Math.max(0.0001, u.s) * (wide ? 0.95 : 0.58));
      if (wide) standee.position.set(-0.95, -1.15 + (1 - u.s) * -0.5, -0.9);
      else standee.position.set(-0.47, -1.12 + (1 - u.s) * -0.4, 0.5);
      standee.rotation.y = wide ? 0.38 : 0.3;
      u.beam.position.y = QR_Y + (reduced ? 0 : Math.sin(t * 2.4) * 0.29); // stays inside the QR
      u.beam.visible = !reduced;
    }

    // add: four coins pop out of the screen, one share each
    const SP = wide
      ? [[0.76, 0.6, 0.45], [0.9, 0.06, 0.5], [0.76, -0.48, 0.45], [-0.76, -0.86, 0.5]]
      : [[0.6, 0.62, 0.5], [0.66, 0.06, 0.55], [0.6, -0.5, 0.5], [-0.6, -0.8, 0.55]];
    if (short) { SP[0][1] = 0.78; SP[2][1] = -0.66; SP[3][1] = -0.62; } // room for each tag under its coin
    splitCoins.forEach((c, i) => {
      const u = c.userData;
      // they come out as the clip reaches "₹85 each", and go back in when it loops
      const go = on(ADD) * (p > 6.7 + i * 0.23 ? 1 : 0);
      u.s += (go - u.s) * k(go ? 7 : 9, dt);
      const [x, y, z] = SP[i];
      const wave = reduced ? 0 : Math.sin(t * 1.6 - i * 1.1);
      v3.set(x * u.s, y + wave * 0.045, z * u.s + (1 - u.s) * -0.2);
      c.position.lerp(v3, k(8, dt));
      c.scale.setScalar(Math.max(0.0001, u.s * (wide ? 1 : 0.78)));
      u.spin += (u.spinT - u.spin) * k(4.5, dt);
      c.rotation.set(0.1 + wave * 0.1, u.spin + (1 - u.s) * 3 + (reduced ? 0 : Math.sin(t + i) * 0.3), 0);
      c.visible = u.s > 0.01;
      label(splitTags[i], c, CR * px * (wide ? 1 : 0.78) + 6, Math.min(1, u.s) * on(ADD));
    });

    // remind: the nudge leaves your phone as you tap Remind and lands on
    // Luffy's, which wakes up and buzzes with the reminder
    {
      const fu = friend.userData;
      fu.s += (on(REMIND) - fu.s) * k(5, dt);
      friend.visible = fu.s > 0.01;
      const LAUNCH = 2.95, LAND = 3.75; // seconds into the clip: the tap on Remind, then 0.8 s of flight
      const landed = on(REMIND) && p >= LAND;
      const fs = wide ? 0.82 : 0.66;
      friend.scale.setScalar(Math.max(0.0001, fu.s) * fs);
      if (wide) friend.position.set(-1.0, 0.12 + (1 - fu.s) * -0.6, -1.2);
      else friend.position.set(-0.78, 0.3 + (1 - fu.s) * -0.6, -0.8);
      const buzz = landed && p < LAND + 0.42 && !reduced ? Math.sin(t * 90) * 0.035 : 0;
      friend.rotation.set(0.04, wide ? 0.34 : 0.28, -0.03 + buzz);
      friendMat.uniforms.glow.value += ((landed ? 1 : 0.22) - friendMat.uniforms.glow.value) * k(8, dt);
      friendMat.uniforms.mixv.value += ((landed ? 1 : 0) - friendMat.uniforms.mixv.value) * k(7, dt);
      friendMat.uniforms.sheen.value = 0.7;
      // the flight, on an arc from the Remind button to the other screen
      const f = on(REMIND) && !reduced ? (p - LAUNCH) / (LAND - LAUNCH) : -1;
      const nu = nudge.userData;
      nu.s += ((f > 0 && f < 1 ? 1 : 0) - nu.s) * k(14, dt);
      nudge.visible = nu.s > 0.01;
      v3.set(0.3, 0, 0.3); // Luffy's Remind, mid-screen once the tip has scrolled it into view
      friend.localToWorld(v3b.set(0, 0.55, 0.2));
      rig.worldToLocal(v3b);
      const along = (e, out) => out.set(lerp(v3.x, v3b.x, e), lerp(v3.y, v3b.y, e) + Math.sin(e * Math.PI) * 0.7, lerp(v3.z, v3b.z, e) + Math.sin(e * Math.PI) * 0.6);
      if (f > 0 && f < 1) {
        const e = smooth(f);
        along(e, nudge.position);
        nudge.rotation.set(0, e * Math.PI * 4, 0);
      }
      // its wake: streaks along the arc it just flew, fading out after it lands
      const wake = f > 0 && f < 1.4 ? Math.min(1, (1.4 - f) / 0.4) : 0;
      nudgeTrails.forEach((tr, j) => {
        const n = j ? 24 : 30;
        for (let q = 0; q < n; q++) {
          along(smooth(Math.max(0, Math.min(1, f) - (q / (n - 1)) * (j ? 0.4 : 0.55))), NP[q]);
          NP[q].y += j ? -0.1 : 0.08;
        }
        tr.userData.set(NP, wake * (j ? 0.8 : 1.4));
      });
      nudge.scale.setScalar(Math.max(0.0001, nu.s) * 0.9);
    }

    // settle: the coins stack up beside the phone, Singh's "paid back" coin on top
    {
      const go = on(SETTLE);
      // on a phone, higher: its tag must clear the chapter's words under the phone
      stack.position.set(wide ? 0.72 : 0.52, wide ? -0.95 : -0.62, 0.55);
      stack.rotation.set(0.32, -0.3, 0);
      stack.scale.setScalar(wide ? 0.85 : 0.7);
      const START = 7.45; // the clip's "Yes, it's paid", in seconds (record-clips.mjs logs it)
      for (const c of stackCoins) {
        const shown = go && p > START + c.userData.k * 0.19;
        const y = shown ? c.userData.y : c.userData.y + 2.2;
        c.position.y += (y - c.position.y) * k(shown ? 7 : 14, dt);
        c.position.x = Math.sin(c.userData.k * 2.1) * 0.012;
        c.rotation.y = c.userData.k * 0.7;
        c.visible = c.position.y < c.userData.y + 2;
      }
      const pu = paid.userData;
      const top = stackCoins.length * CT * 1.05 + 0.24;
      pu.s += ((go && p > START + 2.06 ? 1 : 0) - pu.s) * k(5, dt);
      paid.position.set(0, top + (1 - pu.s) * 0.6 + (reduced ? 0 : Math.sin(t * 1.5) * 0.035), 0.05);
      paid.scale.setScalar(Math.max(0.0001, pu.s));
      pu.spin += (pu.spinT - pu.spin) * k(4.5, dt);
      paid.rotation.set(-0.32, 0.3 + pu.spin + (1 - pu.s) * 6, 0);
      paid.visible = pu.s > 0.01;
      label(settleTag, stack, 24, pu.s * go);
    }

    renderer.render(scene, camera);
    if (firstFrame) { firstFrame = false; emit("sf:ready"); }

    const moving = drag || screenAnim || !reduced || ndc.x !== 9 || (current && !current.v.paused);
    quietFor = moving ? 0 : quietFor + dt;
    if (quietFor > 1.2 || !visible || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
  }
  onScroll(window.sfState?.["sf:scroll"] ?? st);
  wake();
}
