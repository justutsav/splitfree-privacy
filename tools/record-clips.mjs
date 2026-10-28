// Records the app clips the site's story plays, from the LOCAL seeded stack.
//   cd ../SplitFree/splitfreeapp            (node 22; vite dev on :5299, see app-lib.mjs)
//   node ../../splitfree-privacy/tools/record-clips.mjs [home add remind scan settle]
// Each clip reseeds first (tools/seed-site.mjs), records a 2x screencast and
// encodes assets/video/<name>.mp4 + <name>-poster.jpg, then the VP9, 540-wide
// and first-frame files the site serves (tools/video-variants.sh). home also writes
// assets/shots/home.webp; settle writes assets/shots/settled.webp.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { launch, appPage, mintSession, sleep, tap, slide, fakePush, seedPendingShop, SHOP_QR, PLAY_URL, BASE, APP } from "./app-lib.mjs";

const SITE = resolve(import.meta.dirname, "..");
const VIDEO = `${SITE}/assets/video`, SHOTS = `${SITE}/assets/shots`;
const TMP = process.env.CLIP_TMP ?? "/tmp/splitfree-clips";
mkdirSync(TMP, { recursive: true });

const reseed = () => execFileSync("node", [`${SITE}/tools/seed-site.mjs`], { cwd: APP, stdio: ["ignore", "inherit", "ignore"] });
const ff = (...args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);

/** Advance the coach-mark tour (home's "home-v2") until its card reads `text`. */
async function tourTo(page, text) {
  for (let i = 0; i < 12; i++) {
    const card = await page.evaluate(() => document.querySelector('[aria-label="Next tip"]')?.innerText ?? "");
    if (card.includes(text)) return;
    // a DOM click: this happens before the visible part, so no fingertip
    await page.evaluate(() => document.querySelector('[aria-label="Next tip"]')?.click());
    await sleep(500);
  }
  throw new Error(`tour never reached "${text}"`);
}

/**
 * Home's tour, cut down to one tip on `target` (a data-coach id). The app has no
 * tip for Remind or Paid all; this borrows its own CoachMarks so the clip shows
 * where the tap lands the way the scan and add clips do. Rewrites the steps of
 * the "home-v2" CoachMarks in home.tsx as vite serves it.
 */
const oneTip = (target, text) => ({
  "/_authenticated/home.tsx": (src) => {
    const at = src.indexOf('"home-v2"');
    const from = at < 0 ? -1 : src.indexOf("steps: [", at);
    if (from < 0) return src; // the route's other chunk
    let i = from + "steps: ".length, depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === "[") depth++;
      else if (src[i] === "]" && --depth === 0) break;
    }
    return `${src.slice(0, from)}steps: [${JSON.stringify({ target, text })}]${src.slice(i + 1)}`;
  },
});
/** Mark the first button reading exactly `label` as CoachMarks target `id`, as soon as it renders. */
const coachOn = (label, id) => (p) => p.evaluateOnNewDocument((label, id) => {
  new MutationObserver(() => {
    if (document.querySelector(`[data-coach="${id}"]`)) return;
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === label)?.setAttribute("data-coach", id);
  }).observe(document, { childList: true, subtree: true });
}, label, id);
/** Wait for the tour card to show `text` (a target that renders late makes CoachMarks skip it). */
async function waitTip(page, text, ms = 8000) {
  for (let t = 0; t < ms; t += 100) {
    if ((await page.evaluate(() => document.querySelector('[aria-label="Next tip"]')?.innerText ?? "")).includes(text)) return;
    await sleep(100);
  }
  throw new Error(`the tip "${text}" never showed`);
}

/** Wait until the page's text contains `text`, or fail the run (a silent miss ships a wrong clip). */
async function waitText(page, text, ms = 8000) {
  for (let t = 0; t < ms; t += 100) {
    if ((await page.evaluate(() => document.body.innerText).catch(() => "")).includes(text)) return;
    await sleep(100);
  }
  throw new Error(`never saw "${text}"`);
}

/** Tap the checkbox on the split row whose name starts with `name`. */
async function tick(page, name) {
  const h = await page.evaluateHandle((name) =>
    [...document.querySelectorAll('[role="checkbox"]')].find((b) => b.parentElement.textContent.trim().startsWith(name)) ?? null, name);
  if (!h.asElement()) throw new Error(`no split row for ${name}`);
  await h.asElement().click();
}

/**
 * Open `path` signed in, at 2x, and hand back a recorder whose mark() notes
 * seconds since the screencast started, so the encode can trim dead time.
 */
async function session(browser, auth, path, { before, tour, patches } = {}) {
  const page = await appPage(browser, auth, { zoom: true, tour });
  await fakePush(page, patches);
  // A soft fingertip, so a viewer can see what was tapped and dragged.
  await page.evaluateOnNewDocument(() => {
    addEventListener("DOMContentLoaded", () => {
      const dot = document.createElement("div");
      dot.style.cssText = "position:fixed;z-index:2147483647;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(40,10,30,.28);box-shadow:0 0 0 2px rgba(255,255,255,.55);pointer-events:none;opacity:0;transform:scale(.6);transition:opacity .18s,transform .18s";
      document.body.appendChild(dot);
      let down = false, t = 0;
      // html zoom scales the dot's own left/top too, so undo it on the event's viewport coords
      const z = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      // a drag's deltas come from slide() divided by the zoom (see app-lib), so
      // scale them back up here and the dot stays on the knob
      let downX = 0;
      const at = (e) => { dot.style.left = `${downX / z() + (e.clientX - downX)}px`; dot.style.top = `${e.clientY / z()}px`; };
      const up = () => { down = false; dot.style.opacity = "0"; dot.style.transform = "scale(1.4)"; };
      // a click whose pointerup never reaches us (the target unmounts) still lets go
      const arm = () => { clearTimeout(t); t = setTimeout(up, 450); };
      addEventListener("pointerdown", (e) => { down = true; downX = e.clientX; at(e); dot.style.opacity = "1"; dot.style.transform = "scale(1)"; arm(); }, true);
      addEventListener("pointermove", (e) => { if (down) { at(e); arm(); } }, true);
      addEventListener("pointerup", () => setTimeout(up, 260), true);
      addEventListener("pointercancel", up, true);
    });
  });
  if (before) await before(page);
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
  await sleep(2200);
  return page;
}
/** The clip's poster: a screenshot at a moment the screen is still (no hitch shows). */
async function poster(page, name) {
  // captureBeyondViewport would resize the page for a moment, and the screencast sees it
  await page.screenshot({ path: `${TMP}/${name}-poster.png`, captureBeyondViewport: false });
  ff("-i", `${TMP}/${name}-poster.png`, "-vf", "scale=720:1600:flags=lanczos", "-q:v", "4", `${VIDEO}/${name}-poster.jpg`);
}
async function record(page, name, steps) {
  const webm = `${TMP}/${name}.webm`;
  const t0 = Date.now();
  // Puppeteer's recorder writes each frame round(fps x gap) times into an ffmpeg
  // that reads them at its image2pipe default of 25 fps. At the default fps
  // (30) a 60 Hz animation's 16 ms gaps round to 0 and the timeline loses that
  // time (marks drifted a second, slides played several times too fast). fps 60
  // keeps every 60 Hz frame, and speed 60/25 puts the clock back to real time.
  const rec = await page.screencast({ path: webm, fps: 60, speed: 60 / 25 });
  // The screencast only gets a frame when something repaints, and its timeline
  // starts at the first one, so a still opening would shift every mark. A
  // corner pixel flickering by 1% keeps frames coming from t0.
  await page.evaluate(() => {
    const b = document.createElement("div");
    b.id = "clip-heartbeat";
    b.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;z-index:2147483647;pointer-events:none;background:rgba(128,128,128,.01)";
    document.body.appendChild(b);
    let on = false;
    setInterval(() => { on = !on; b.style.background = `rgba(128,128,128,${on ? 0.02 : 0.01})`; }, 100);
  });
  const marks = {};
  const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; };
  await steps(mark);
  await rec.stop();
  console.log(name, JSON.stringify(marks));
  return { webm, marks };
}
/**
 * Where the screencast shows a flat screen: the browser's blank page while it
 * tries the upi:// hand-off, then the app's resume splash. On a phone that is
 * where the UPI app would be, so it is cut. A frame is flat when its 10th and
 * 90th luma percentiles (signalstats YLOW/YHIGH) are within 3 of each other:
 * the blank page measures 1. The app's own resume splash (about 9) stays, as
 * it does on a phone coming back from the UPI app; a sparse screen like the
 * pending list measures 10, so no threshold could cut the splash alone.
 */
function flatRanges(webm) {
  const file = `${TMP}/stats.txt`;
  ff("-i", webm, "-vf", `fps=30,scale=103:-1,signalstats,metadata=print:file=${file}`, "-f", "null", "-");
  const frames = [];
  let t = 0, low = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const pts = line.match(/pts_time:([\d.]+)/);
    if (pts) t = +pts[1];
    const y = line.match(/signalstats\.(YLOW|YHIGH)=([\d.]+)/);
    if (y?.[1] === "YLOW") low = +y[2];
    if (y?.[1] === "YHIGH") frames.push({ t, flat: +y[2] - low < 3 });
  }
  const out = [];
  frames.forEach((f, i) => {
    const end = frames[i + 1]?.t ?? f.t + 1 / 30;
    if (!f.flat) return;
    if (out.length && Math.abs(out.at(-1)[1] - f.t) < 0.001) out.at(-1)[1] = end;
    else out.push([f.t, end]);
  });
  // pad: the frames either side are already fading into or out of the blank
  return out.filter(([a, b]) => b - a > 0.15).map(([a, b]) => [a - 0.2, b + 0.1]);
}
/**
 * segments minus the flat ranges that fall inside `windows` (only around a
 * hand-off: a sparse screen elsewhere, like the pending list, also measures
 * flat), dropping slivers too short to crossfade
 */
function withoutFlat(webm, segments, windows) {
  let segs = segments;
  const flats = windows.length ? flatRanges(webm).filter(([a, b]) => windows.some(([x, y]) => a < y && b > x)) : [];
  for (const [a, b] of flats) {
    segs = segs.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [[x, a], [b, y]]));
  }
  return segs.filter(([x, y]) => y - x > 0.45);
}

/**
 * Encode [from, to] second ranges of the screencast, joined by 0.3 s
 * crossfades (a jump past a wait the app makes, e.g. settle's 5 s hold).
 * The file then ends right after its last moving frame, but never before
 * `minEnd` seconds, or minEnd(clip seconds of marks), for props the site
 * draws over a still screen; the site
 * holds the last frame itself before it replays. Logs where each of `marks`
 * lands in the clip: the site's 3D props are keyed to those seconds.
 */
function encode(name, webm, segments, handoffs = [], { marks = {}, minEnd = 0 } = {}) {
  segments = withoutFlat(webm, segments, handoffs);
  console.log("  segments", JSON.stringify(segments.map((r) => r.map((v) => +v.toFixed(2)))));
  const out = `${VIDEO}/${name}.mp4`;
  const X = 0.3;
  // The screencast only writes a frame when the screen changes, so make it
  // constant-rate before cutting, and hold the last frame (it ends on a still).
  const n = segments.length;
  const parts = [`[0:v]fps=30,scale=720:1600:flags=lanczos,format=yuv420p,split=${n}${segments.map((_, i) => `[p${i}]`).join("")}`];
  segments.forEach(([a, b], i) => parts.push(`[p${i}]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=PTS-STARTPTS[s${i}]`));
  let last = "s0", len = segments[0][1] - segments[0][0];
  for (let i = 1; i < segments.length; i++) {
    parts.push(`[${last}][s${i}]xfade=transition=fade:duration=${X}:offset=${(len - X).toFixed(3)}[x${i}]`);
    last = `x${i}`;
    len += segments[i][1] - segments[i][0] - X;
  }
  ff("-i", webm, "-filter_complex", parts.join(";"), "-map", `[${last}]`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-g", "30", "-movflags", "+faststart", "-an", out);
  // where a screencast second lands in the clip, past the cuts and crossfades
  const clipAt = (t) => {
    let start = 0;
    for (const [a, b] of segments) {
      if (t <= b) return start + Math.max(0, t - a);
      start += b - a - X;
    }
    return null;
  };
  const at = Object.fromEntries(Object.entries(marks).map(([k, t]) => [k, +(clipAt(t) ?? NaN).toFixed(2)]));
  // cut the still tail: everything after the last frame that changes
  const { stderr } = spawnSync("ffmpeg", ["-hide_banner", "-i", out, "-vf", "freezedetect=n=0.002:d=0.4", "-map", "0:v", "-f", "null", "-"], { encoding: "utf8" });
  const det = stderr.match(/freeze_(start|end): [\d.]+/g) ?? [];
  const lastStill = det.at(-1)?.startsWith("freeze_start") ? +det.at(-1).split(": ")[1] : null;
  const floor = typeof minEnd === "function" ? minEnd(at) : minEnd;
  const cut = lastStill === null ? len : Math.min(len, Math.max(lastStill + 0.15, floor));
  if (cut < len - 0.05) {
    ff("-i", out, "-t", cut.toFixed(3), "-c", "copy", "-movflags", "+faststart", `${TMP}/${name}-cut.mp4`);
    execFileSync("mv", [`${TMP}/${name}-cut.mp4`, out]);
  }
  console.log("  ->", out, `${len.toFixed(2)}s, cut to ${cut.toFixed(2)}s`, "clip seconds:", JSON.stringify(at));
}

// ------------------------------------------------------------------ clips
async function home(browser, auth) {
  const page = await appPage(browser, auth);
  await page.goto(`${BASE}/home`, { waitUntil: "networkidle2" });
  await sleep(2500);
  await page.screenshot({ path: `${TMP}/home.png` });
  ff("-i", `${TMP}/home.png`, "-c:v", "libwebp", "-quality", "82", `${SHOTS}/home.webp`);
  await page.close();
}

async function add(browser, auth) {
  const page = await session(browser, auth, "/home", { tour: "home-v2", before: seedPendingShop });
  await tourTo(page, "Paid for something?");
  await sleep(600);
  const { webm, marks } = await record(page, "add", async (mark) => {
    await sleep(300);
    mark("start");
    await sleep(2000);
    await tap(page, "Skip tour");
    await sleep(400);
    if (!(await tap(page, "1 shop payment", "a"))) throw new Error("no pending shop payment on home");
    await waitText(page, "Split it");
    await sleep(650);
    await tap(page, "Split it");
    await page.waitForSelector('input[placeholder="Search friends"]', { timeout: 8000 });
    await sleep(500);
    for (const f of ["luffy", "elon", "oggy"]) { await tap(page, f, "button"); await sleep(300); }
    await sleep(150);
    if (!(await tap(page, "Split with 3"))) throw new Error("friend picker did not confirm");
    await sleep(500);
    // bring the four split rows up above the slide bar
    await page.evaluate(() => [...document.querySelectorAll('[role="checkbox"]')][2].scrollIntoView({ block: "center", behavior: "smooth" }));
    await sleep(700);
    await poster(page, "add");
    await tick(page, "oggy");
    // shares live in input values, which innerText does not include
    await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value === "113.34"), { timeout: 5000 });
    mark("untick");
    await sleep(900);
    await tick(page, "oggy");
    await sleep(900);
    mark("slide");
    console.log(" ", await slide(page, "Slide to add", { steps: 30, ms: 26 }));
    mark("slid");
    // hold on home once its balances are back; the blank page while it reloads is cut
    await page.waitForFunction(() => location.pathname === "/home", { timeout: 8000 });
    await waitText(page, "Oggy");
    mark("home");
    await sleep(1100);
    mark("end");
  });
  encode("add", webm, [[marks.start, marks.slid + 0.5], [marks.home - 0.1, marks.end]]);
  await page.close();
}

const REMIND_TIP = "Remind. One tap sends them a nudge with exactly what they owe you — no awkward messages.";
async function remind(browser, auth) {
  const page = await session(browser, auth, "/home", {
    tour: "home-v2", patches: oneTip("remind", REMIND_TIP), before: coachOn("Remind", "remind"),
  });
  await waitTip(page, "Remind.");
  await sleep(400);
  const { webm, marks } = await record(page, "remind", async (mark) => {
    await sleep(300);
    mark("start");
    await sleep(2200);
    await tap(page, "Skip tour");
    await sleep(600);
    const btn = await page.$('button[data-coach="remind"]');
    if (!btn) throw new Error("no Remind button");
    await btn.click();
    mark("tap");
    await sleep(1300);
    await poster(page, "remind");
    await sleep(1500);
    mark("end");
  });
  // the screen goes still soon after the tap; the site's nudge flies for 1.6 s
  // after it and Luffy's lock screen needs a moment to be read
  const tapAt = marks.tap - marks.start;
  encode("remind", webm, [[marks.start, marks.end]], [], { marks, minEnd: tapAt + 2.4 });
  await page.close();
}

const SETTLE_TIP = "Paid all. Settle everything you owe them in one go, with any UPI app.";
async function settle(browser, auth) {
  const page = await session(browser, auth, "/home", {
    tour: "home-v2", patches: oneTip("paid-all", SETTLE_TIP), before: coachOn("Paid all", "paid-all"),
  });
  await waitTip(page, "Paid all.");
  await sleep(400);
  // Every state is held about 1.3 s, so a viewer can read it.
  const { webm, marks } = await record(page, "settle", async (mark) => {
    await sleep(300);
    mark("start");
    await sleep(2200);
    await tap(page, "Skip tour");
    await sleep(600);
    await tap(page, "Paid all");
    mark("tap");
    await page.waitForSelector('[aria-label^="Slide to Pay"]', { timeout: 8000 });
    await sleep(1800);
    mark("slide");
    console.log(" ", await slide(page, "Slide to Pay", { steps: 50, ms: 30 }));
    // polled by hand: the upi:// hand-off can swap the page's execution context
    // under a waitForFunction
    for (let i = 0; i < 50; i++) {
      const t = await page.evaluate(() => document.body.innerText).catch(() => "");
      if (t.includes("reach Singh")) break;
      if (i === 49) throw new Error("no 'reach Singh' sheet: " + t.slice(0, 300));
      await sleep(100);
    }
    mark("sheet");
    await sleep(600);
    await poster(page, "settle");
    await sleep(800);
    await tap(page, "Yes, it");
    mark("paid");
    await sleep(7200); // settle.tsx holds the thank-you 5.3 s before going home
    mark("end");
  });
  // the site's "paid back" coin lands on the stack 2 s after "Yes, it's paid"; let it be seen
  encode("settle", webm, [[marks.start, marks.paid + 2.0], [marks.paid + 5.5, marks.end]], [[marks.slide, marks.sheet + 0.5]], { marks, minEnd: (at) => at.paid + 3.1 });
  await page.close();
  // the clip ends on home without Singh; keep a still of it too
  const still = await appPage(browser, auth);
  await still.goto(`${BASE}/home`, { waitUntil: "networkidle2" });
  await sleep(2500);
  await still.screenshot({ path: `${TMP}/settled.png` });
  ff("-i", `${TMP}/settled.png`, "-c:v", "libwebp", "-quality", "82", `${SHOTS}/settled.webp`);
  await still.close();
}

// The shop's QR standee, as a phone camera would see it: drawn in HTML, shot,
// then drifted and zoomed by ffmpeg into the y4m Chrome plays as its camera.
// Its QR is the app's Play link, so the code a visitor sees on the site works;
// decodeAs() hands the app the shop's UPI code in its place.
const CAMERA = `${TMP}/camera.y4m`;
async function makeCamera() {
  const { default: QRCode } = await import(`${APP}/node_modules/qrcode/lib/index.js`);
  const qr = await QRCode.toString(PLAY_URL, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const shelves = Array.from({ length: 36 }, (_, i) => {
    const hue = [12, 42, 120, 200, 330, 28, 0, 54][i % 8];
    return `<i style="left:${(i % 9) * 11.5 - 2}%;top:${Math.floor(i / 9) * 16 + 2}%;width:${7 + (i * 7) % 5}%;height:${10 + (i * 3) % 4}%;background:hsl(${hue} 55% ${45 + (i * 5) % 20}%)"></i>`;
  }).join("");
  const html = `<!doctype html><html><body style="margin:0;width:1840px;height:1920px;overflow:hidden;font-family:Roboto,Arial,sans-serif">
    <div style="position:absolute;inset:0;background:#d8cfb8">
      <div style="position:absolute;inset:0 0 38% 0;filter:blur(14px);opacity:.85">${shelves}</div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:40%;background:linear-gradient(#8a5a33,#6b4224)"></div>
      <div style="position:absolute;left:1300px;top:50%;width:640px;transform:translate(-50%,-50%) rotate(-3deg);background:#fff;border-radius:28px;box-shadow:0 30px 60px rgba(0,0,0,.35);overflow:hidden;text-align:center">
        <div style="background:#0f5e5a;color:#fff;padding:34px 20px 28px"><div style="font:700 50px/1 Arial">scan-at-your-own@risk</div><div style="font:500 30px/1.3 Arial;margin-top:12px;opacity:.9">Scan &amp; pay with any UPI app</div></div>
        <div style="padding:36px 70px 18px">${qr.replace("<svg", '<svg style="width:100%;height:auto;display:block"')}</div>
        <div style="font:500 28px/1 Arial;color:#333;padding:0 0 36px">Scan at your own risk</div>
      </div>
    </div>
    <style>i{position:absolute;border-radius:6px}</style></body></html>`;
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1840, height: 1920 });
    await page.setContent(html);
    await page.screenshot({ path: `${TMP}/standee.png` });
  } finally { await browser.close(); }
  // 6 s of a held phone: on the shelves for a moment (the QR is cut off, so
  // unreadable), then it swings right onto the standee and sways.
  ff("-loop", "1", "-i", `${TMP}/standee.png`, "-t", "6",
    "-vf", "scale=3680:3840,crop=w=2080:h=3698:x='1560*(1-pow(1-min(max(t-0.9\\,0)/1.5\\,1)\\,2))+24*sin(t*1.7)+24':y='70+40*sin(t*1.3)',scale=720:1280,fps=15,format=yuv420p",
    "-f", "yuv4mpegpipe", CAMERA);
}

// the web build saves the QR as a download and says so in a toast; on a phone
// the UPI app opens instead, so the toast is not part of this story
const hideToasts = (p) => p.evaluateOnNewDocument(() => addEventListener("DOMContentLoaded", () => {
  const s = document.createElement("style");
  s.textContent = "[data-sonner-toaster]{display:none!important}";
  document.head.appendChild(s);
}));

/**
 * The app prefers the platform BarcodeDetector (lib/qr-scan.ts). Stand one in
 * that really decodes the camera frame with jsQR, but reads the Play link as
 * the shop's UPI code, and only once it has been in view for `hold` ms, so
 * the clip shows the whole QR for a moment before the pay sheet opens.
 */
const decodeAs = async (p, from, to, hold = 900) => {
  await p.evaluateOnNewDocument(readFileSync(`${APP}/node_modules/jsqr/dist/jsQR.js`, "utf8"));
  await p.evaluateOnNewDocument((from, to, hold) => {
    const jsQR = window.jsQR;
    window.BarcodeDetector = class {
      constructor() { this.c = document.createElement("canvas"); this.g = this.c.getContext("2d", { willReadFrequently: true }); this.seen = 0; }
      static async getSupportedFormats() { return ["qr_code"]; }
      async detect(src) {
        const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
        if (!w || !h) return [];
        const k = Math.min(1, 960 / Math.max(w, h));
        this.c.width = Math.round(w * k); this.c.height = Math.round(h * k);
        this.g.drawImage(src, 0, 0, this.c.width, this.c.height);
        const hit = jsQR(this.g.getImageData(0, 0, this.c.width, this.c.height).data, this.c.width, this.c.height);
        if (!hit) { this.seen = 0; return []; }
        this.seen ||= performance.now();
        if (performance.now() - this.seen < hold) return [];
        return [{ rawValue: hit.data === from ? to : hit.data, format: "qr_code" }];
      }
    };
  }, from, to, hold);
};

async function scan(browser, auth) {
  const page = await session(browser, auth, "/home", {
    tour: "home-v2",
    before: async (p) => { await hideToasts(p); await decodeAs(p, PLAY_URL, SHOP_QR); },
  });
  await tourTo(page, "Scanner.");
  await sleep(600);
  const { webm, marks } = await record(page, "scan", async (mark) => {
    await sleep(300);
    mark("start");
    await sleep(2000);
    await tap(page, "Skip tour");
    await sleep(600);
    await (await page.$('a[aria-label="Scan a QR"]')).click();
    await page.waitForSelector('input[aria-label="Amount to pay"]', { timeout: 8000 });
    await sleep(600);
    const amt = await page.$('input[aria-label="Amount to pay"]');
    await amt.click(); await sleep(150);
    await amt.type("340", { delay: 140 });
    await page.evaluate(() => document.activeElement?.blur());
    await sleep(300);
    await poster(page, "scan");
    await sleep(400);
    mark("pay");
    console.log(" ", await slide(page, "Slide to pay"));
    await page.waitForFunction(() => location.pathname === "/home/pending", { timeout: 8000 });
    await waitText(page, "340");
    mark("pending");
    await sleep(1300);
    mark("end");
  });
  encode("scan", webm, [[marks.start, marks.end]], [[marks.pay, marks.pending + 0.6]], { marks });
  await page.close();
}
scan.args = [`--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`, `--use-file-for-fake-video-capture=${CAMERA}`];

const ALL = { home, add, remind, scan, settle };
const pick = process.argv.slice(2);
if (pick[0] === "camera") { await makeCamera(); process.exit(0); }
for (const name of pick.length ? pick : Object.keys(ALL)) {
  if (name === "scan" && !existsSync(CAMERA)) await makeCamera();
  reseed(); // new users each time, so the session is minted after it
  const auth = await mintSession();
  const browser = await launch(ALL[name].args ?? []);
  try { await ALL[name](browser, auth); } finally { await browser.close(); }
  // the files the site serves are made from the new .mp4
  if (name !== "home") execFileSync("sh", [`${SITE}/tools/video-variants.sh`, name], { stdio: "inherit" });
}
reseed(); // leave the stack as the stills show it
